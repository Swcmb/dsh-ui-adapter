// dsh-default-sidebar-tab — shared pure logic (host + client).
// 配置解析、默认 tab 校验、替换判定。无平台依赖，便于 node --test 直接跑。
// Copyright (C) 2026 Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later

/** 缺省默认页：会话详情（@local/dsh-session-panel 注册的 tab 类型 kind）。 */
export const DEFAULT_TAB = 'dsh-session-details';

/** 原生默认播种的开始页 kind。检测到它出现即视为用户刚打开了空侧栏。 */
export const GUIDE_KIND = 'guide';

/**
 * 已知可用的 kind。仅作提示清单——第三方插件注册的 kind 也可配置，
 * 只是本清单不保证其存在；openTab 对未注册 kind 会 throw，client 会跳过。
 */
export const KNOWN_KINDS = Object.freeze([
  'dsh-session-details',    // 会话详情（@local/dsh-session-panel，**默认**）
  'session-inspector-log',  // 会话数据诊断（原生 inspector bundle）
  'guide',                 // 开始页（原生默认）
  'files',                 // 文件树
  'browser',               // 浏览器
  'terminal',              // 终端
  'plan',                  // 计划
  'changes-review',        // 代码审查和变更
  'schedule',              // 任务管理
  'dsh-context',           // 上下文（若 dsh-context 已装）
]);

/** 注入到页面的全局变量名。 */
export const INJECT_GLOBAL = '__DSH_DEFAULT_SIDEBAR_TAB__';

/**
 * 归一化 cordis 配置。只认非空字符串 defaultTab，其余回退默认值。
 * @param {unknown} raw
 * @returns {{ defaultTab: string, enabled: boolean }}
 */
export function resolveConfig(raw) {
  const source = (raw && typeof raw === 'object') ? raw : {};
  const requested = typeof source.defaultTab === 'string' ? source.defaultTab.trim() : '';
  const defaultTab = requested !== '' ? requested : DEFAULT_TAB;
  const enabled = source.enabled !== false;
  return { defaultTab, enabled };
}

/**
 * 判断检测到的 guide tab 是否应当被替换成默认 tab。
 * 规则：开关开启 + 目标 kind 非 guide + 该会话未处理过。
 * （"guide 是否刚出现"由 client 半根据 openTabs 快照判断，这里是纯判定。）
 * @param {object} args
 * @param {boolean} args.enabled
 * @param {string} args.defaultTab
 * @param {Set<string>} args.handled 已处理过的 session id 集合
 * @param {string | undefined} args.sessionId 屏幕上的会话
 * @returns {boolean}
 */
export function shouldReplaceGuide({ enabled, defaultTab, handled, sessionId }) {
  if (!enabled) return false;
  if (defaultTab === GUIDE_KIND) return false; // 目标就是开始页，无需替换
  if (typeof sessionId !== 'string' || sessionId === '') return false;
  if (handled.has(sessionId)) return false;
  return true;
}

/**
 * 在 openTabs 快照里找某会话的 guide tab（带 tabId，用于 replaceTab）。
 * @param {Array<{sessionId:string, kind:string, tabId:string}>} openTabs
 * @param {string} sessionId
 * @returns {{sessionId:string, kind:string, tabId:string} | undefined}
 */
export function findGuideTab(openTabs, sessionId) {
  const list = Array.isArray(openTabs) ? openTabs : [];
  return list.find((t) => t && t.sessionId === sessionId && t.kind === GUIDE_KIND && typeof t.tabId === 'string');
}
