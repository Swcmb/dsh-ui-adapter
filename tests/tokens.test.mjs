import test from 'node:test';
import assert from 'node:assert/strict';
import { textTokens, messageTokens, messageBlockParts, toolSchemaTokens, imageTokens } from '../lib/tokens.mjs';

test('textTokens prices CJK and Latin distinctly', () => {
  const zh = textTokens(['你好世界']);
  const en = textTokens(['hello world']);
  assert.ok(zh > 0 && en > 0);
  assert.ok(Math.abs(zh - 4 * 0.5465) < 0.1, `CJK=${zh}`);
});

test('messageBlockParts splits sum to messageTokens', () => {
  const msg = { content: [
    { type: 'text', text: '你好，这是正文' },
    { type: 'reasoning', text: 'some thinking here' },
    { type: 'tool-call', name: 'read', arguments: '{"path":"a.ts"}' },
    { type: 'tool-result', text: 'file content' },
  ]};
  const parts = messageBlockParts(msg);
  const total = messageTokens(msg);
  const sum = parts.text + parts.reasoning + parts.toolCall + parts.attachment + parts.other;
  assert.equal(sum, total, `parts sum ${sum} != total ${total}`);
});

test('toolSchemaTokens prices a definition', () => {
  const t = toolSchemaTokens({ name: 'read', description: 'read a file', parameters: { type: 'object' } });
  assert.ok(t > 0);
});

test('imageTokens grows with resolution and caps at ~1024', () => {
  const small = imageTokens(100, 100);
  const big = imageTokens(2000, 2000);
  assert.ok(small > 0 && big > 0);
  assert.ok(big >= small);
  assert.ok(big <= 1300, `big=${big}`);
});

test('empty content is free', () => {
  assert.equal(messageTokens({ content: [] }), 0);
  assert.equal(messageTokens(null), 0);
});
