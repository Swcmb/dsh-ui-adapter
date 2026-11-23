// dsh-cs-panel-hider — host half (原生 DSH Cordis 插件)
// 隐藏逻辑全在 client 半（CSS 隐藏），host 半只提供一条诊断落盘路由，
// 让"隐藏规则是否真的生效"可以被程序化断言，而不必靠肉眼看屏幕。
// Copyright (C) 2026 Swcmb
// SPDX-License-Identifier: GPL-3.0-or-later

import { appendFileSync } from 'node:fs';

export const name = 'dsh-cs-panel-hider';
// 声明 webServer：Cordis 在 apply 前注入，路由可直接读 ctx.webServer。
export const inject = ['webServer'];

const DIAG_PATH = '/__dsh-cs-panel-hider/diag';
// 客户端自证日志落盘位置（宿主侧）。
const DIAG_FILE = new URL('../.diag.log', import.meta.url);

export function apply(ctx) {
  const web = ctx.webServer;
  if (!web || typeof web.register !== 'function') return;
  web.register({
    kind: 'prefix',
    path: DIAG_PATH,
    handler: (req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const payload = JSON.parse(body || '{}');
          const events = Array.isArray(payload.events) ? payload.events : [];
          for (const event of events) {
            const line = JSON.stringify({ t: Date.now(), ...event });
            try { appendFileSync(DIAG_FILE, line + '\n'); } catch { /* 落盘失败不影响功能 */ }
          }
          res.writeHead(200).end(JSON.stringify({ ok: true, accepted: events.length }));
        } catch (err) {
          res.writeHead(200).end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
        }
      });
    },
  });
}
