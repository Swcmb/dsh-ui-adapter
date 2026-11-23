// token 计价：按字符类别估算一条消息/工具定义的 token 数。
// 移植自 dsh-claude-style （MIT, (c) 2026 Nwflower），仅保留面板上下文分项所需部分。
// SPDX-License-Identifier: MIT

const WORD = [0, 0.496, 0.496, 0.62, 0.62, 0.62, 0.636, 0.636, 0.776, 0.776, 1.593];
const WORD_TAIL = 0.25;
const CJK = 0.5465, CJK_MARK = 2.0938, DIGIT_GROUP = 1;
const NEWLINE = 1.3089, LONE_SPACE = 0.4192, SPACE_RUN = 1.528;
const PUNCT_RUN = 0.8391, PUNCT_CHAR = 0.281;
const NONE = 0, WIDE = 1, WIDE_MARK = 2, LETTER = 3, DIGIT = 4, SPACE = 5, PUNCT = 6;
const WIDE_MARK_TEST = /[\p{P}\p{S}]/u;
const WIDE_KINDS = new Uint8Array(0x10000);

function classOf(code) {
  if (code >= 0x2e80) {
    if (code >= 0x10000) return WIDE_MARK_TEST.test(String.fromCodePoint(code)) ? WIDE_MARK : WIDE;
    const known = WIDE_KINDS[code];
    if (known !== 0) return known;
    const kind = WIDE_MARK_TEST.test(String.fromCodePoint(code)) ? WIDE_MARK : WIDE;
    WIDE_KINDS[code] = kind;
    return kind;
  }
  if (code >= 0x30 && code <= 0x39) return DIGIT;
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return LETTER;
  if (code === 0x20 || (code >= 0x09 && code <= 0x0d)) return SPACE;
  return PUNCT;
}

export function textTokens(texts) {
  let total = 0, kind = NONE, length = 0, newline = false;
  function close() {
    if (kind === WIDE) total += length * CJK;
    else if (kind === WIDE_MARK) total += length * CJK_MARK;
    else if (kind === LETTER) total += length <= 10 ? WORD[length] : WORD[10] + (length - 10) * WORD_TAIL;
    else if (kind === DIGIT) total += Math.ceil(length / 3) * DIGIT_GROUP;
    else if (kind === SPACE) total += newline ? NEWLINE : length === 1 ? LONE_SPACE : SPACE_RUN;
    else if (kind === PUNCT) total += PUNCT_RUN + length * PUNCT_CHAR;
    kind = NONE; length = 0; newline = false;
  }
  for (const text of texts) {
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        code = text.codePointAt(i); i++;
      }
      const next = classOf(code);
      if (next !== kind) { close(); kind = next; }
      length++;
      if (next === SPACE && (code === 0x0a || code === 0x0d)) newline = true;
    }
  }
  close();
  return total;
}

const BLOCK_OVERHEAD = 4, ROLE_OVERHEAD = 4;
const structuralTokens = block => textTokens([JSON.stringify(block) ?? '']);

function sizedOf(block) {
  const a = block.attachment;
  if (a === null || typeof a !== 'object') return null;
  const { width, height } = a;
  return typeof width === 'number' && typeof height === 'number'
    && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height } : null;
}

// 图片 token：按 14px patch / 3 倍下采样 / 最多 1024 格估算。
// 移植自 dsh-claude-style contracts/src/image-tokens.ts （MIT）。
const PATCH = 14, DOWNSAMPLE = 3, CELL = PATCH * DOWNSAMPLE;
const MAX_TOKENS = 1024, MIN_PIXELS = 544 * 544, ROUNDS = 10;
const gridTokens = (h, w) => h * (w + 1) + 2;
const gridCells = padded => Math.ceil(Math.floor(padded / PATCH) / DOWNSAMPLE);
function solvedGrid(height, width) {
  const aspect = height / width;
  const iw = Math.sqrt((MAX_TOKENS - 2) / aspect + 0.25) - 0.5;
  const ih = iw * aspect;
  if (iw < 1 || ih < 1) {
    const cw = iw < 1 ? 1 : MAX_TOKENS - 3;
    const ch = iw < 1 ? Math.floor((MAX_TOKENS - 2) / 2) : 1;
    const sw = cw * CELL, sh = ch * CELL;
    return { tokens: gridTokens(gridCells(sh), gridCells(sw)), width: sw, height: sh };
  }
  const scale = Math.min(Math.trunc(iw) * CELL / width, Math.trunc(ih) * CELL / height);
  const bw = Math.trunc(width * scale / PATCH) * PATCH;
  const bh = Math.trunc(height * scale / PATCH) * PATCH;
  return { tokens: gridTokens(gridCells(bh), gridCells(bw)), width: bw, height: bh };
}
function resizeOnce(width, height) {
  let w = width, h = height;
  const pixels = w * h;
  if (pixels < MIN_PIXELS && pixels > 0) {
    const s = Math.sqrt(MIN_PIXELS / pixels);
    w = Math.trunc(w * s); h = Math.trunc(h * s);
  }
  const pw = Math.ceil(w / PATCH) * PATCH, ph = Math.ceil(h / PATCH) * PATCH;
  const direct = gridTokens(gridCells(ph), gridCells(pw));
  if (direct <= MAX_TOKENS) return { tokens: direct, width: pw, height: ph };
  return solvedGrid(h, w);
}
export function imageTokens(width, height) {
  let grid = resizeOnce(width, height);
  for (let r = 1; r < ROUNDS; r++) {
    const next = resizeOnce(grid.width, grid.height);
    if (next.width === grid.width && next.height === grid.height) return grid.tokens;
    grid = next;
  }
  return grid.tokens;
}

function blockTokens(block) {
  if (block === null || typeof block !== 'object') return BLOCK_OVERHEAD;
  const { type, text, name } = block;
  if (type === 'text' || type === 'reasoning') return textTokens([typeof text === 'string' ? text : '']) + BLOCK_OVERHEAD;
  if (type === 'tool-call') {
    const args = block.arguments;
    return textTokens([typeof name === 'string' ? name : '', typeof args === 'string' ? args : '']) + BLOCK_OVERHEAD;
  }
  if (type === 'image') {
    const sized = sizedOf(block);
    if (sized !== null) return imageTokens(sized.width, sized.height) + BLOCK_OVERHEAD;
  }
  return structuralTokens(block) + BLOCK_OVERHEAD;
}

function isAttachment(block) {
  const type = block.type;
  if (['image', 'file', 'audio', 'video', 'document'].includes(type)) return true;
  return block.attachment !== null && typeof block.attachment === 'object';
}

export function messageTokens(message) {
  const content = message?.content;
  if (!Array.isArray(content) || content.length === 0) return 0;
  let tokens = ROLE_OVERHEAD;
  for (const block of content) tokens += blockTokens(block);
  return Math.round(tokens);
}

export function toolSchemaTokens(tool) {
  return Math.round(structuralTokens(tool) + BLOCK_OVERHEAD);
}

// 一条消息按内容块形态拆分的价格，五项之和等于 messageTokens。
export function messageBlockParts(message) {
  const parts = { text: 0, reasoning: 0, toolCall: 0, attachment: 0, other: 0 };
  const content = message?.content;
  if (!Array.isArray(content) || content.length === 0) return parts;
  let text = 0, reasoning = 0, toolCall = 0, attachment = 0, other = 0;
  for (const block of content) {
    const price = blockTokens(block);
    if (block !== null && typeof block === 'object') {
      if (block.type === 'text') { text += price; continue; }
      if (block.type === 'reasoning') { reasoning += price; continue; }
      if (block.type === 'tool-call') { toolCall += price; continue; }
      if (isAttachment(block)) { attachment += price; continue; }
    }
    other += price;
  }
  const weights = [text, reasoning, toolCall, attachment, other + ROLE_OVERHEAD];
  const keys = ['text', 'reasoning', 'toolCall', 'attachment', 'other'];
  const total = messageTokens(message);
  const sum = weights.reduce((a, w) => a + w, 0);
  let allocated = 0, cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    const next = i === weights.length - 1 ? total : Math.round(total * cumulative / (sum || 1));
    parts[keys[i]] = next - allocated;
    allocated = next;
  }
  return parts;
}
