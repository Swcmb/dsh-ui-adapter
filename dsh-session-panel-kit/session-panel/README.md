# dsh-session-panel

独立的 DSH 插件：在对话界面提供右侧会话详情栏，展示 **环境 / 上下文 / 会话统计 / Token 用量 / 子智能体**。

从 `dsh-claude-style` 的 `sessionPanel` 功能剥离并逐行裁剪而来，**只依赖原生 DSH**，不依赖任何其它插件。

## 结构

```
lib/
  index.mjs     host 半：注册 /__dsh-session-panel 路由，折叠会话数据
  tokens.mjs    token 估算（移植自 dsh-claude-style，MIT）
  client.js     client 半：原生 ModuleLoader 模块，渲染详情栏
cordis.patch.yml  bundle 注册
```

## 数据来源（全部原生 DSH）

| 区块 | 来源 |
| --- | --- |
| 环境 | 会话 header 的 `cwd` + node:child_process 读 git |
| 上下文 | `sessionQuery.observeSession` 的事件流（按块形态 + 来源归属计价）+ `contextPressure` 投影 |
| 会话统计 | `sessionStats` / `tokenUsage` 投影 |
| Token 用量 | 同上 token 桶 |
| 子智能体 | `subagentCatalog` 投影 + `agents` 服务运行状态 |

host 半把这些原始数据折成一个面板值，经同源路由 `/__dsh-session-panel?id=<sessionId>` 提供；client 半每 2.5 秒轮询一次，按会话隔离读数。

## 入口

- 会话头部的「会话详情」按钮（`conversation.session.header.utilities` slot）开关详情栏；
- 该 slot 不可用时降级为右上角悬浮按钮。

## 与上游的差异（最小化的取舍）

- 只实现截图实际出现的五个区块；产出 / 变更 / 后台任务的折叠列表未包含。
- token 计价保留字符类别算法（CJK / 词 / 数字 / 空白 / 标点），图片按 patch 网格估算。
- 去掉原实现的多 feature 调度、settings 页、i18n 框架、骨架屏动画等与面板展示无关的部分。
- 会话 id 从活跃对话节点的 `data-conversation-session` 属性读取。

## 授权

本插件代码：GPL-3.0-or-later（见 `LICENSE`）。移植的 token 算法与文案来自
`dsh-claude-style`（MIT, (c) 2026 Nwflower），见 `NOTICES.md`。
