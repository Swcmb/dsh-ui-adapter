# dsh-ui-adapter

> **UI 适配层**：合并 `dsh-context` 与 `billion-context` 的重复「上下文」标签、把赞助广告位改成账本切换卡、把 billion 账本数据接进 `dsh-context` 的统计投影。
>
> 本包为**独立仓库**（`Swcmb/dsh-ui-adapter`），独立维护与发布。2026-11-21 起从 dsh-toolkit monorepo 迁出；曾用包名 `@ianwusb/dsh-context-bili-bridge`（npm 上 0.3.x 及更早版本用旧名）。

一个 [DSH (DeepSeek Harness)](https://www.deepseek.com/) 桌面端插件，把 `dsh-context` 与
`billion-context` 两个上下文插件合并到同一个「上下文」面板里：

- **合标签** —— 用 `billion-context` 官方开关摘掉它那个重名的「上下文」标签，保留
  `dsh-context` 的界面作为唯一视图；
- **去广告** —— 把 `dsh-context` 面板里的赞助商广告卡原位替换成「压缩账本」切换卡；
- **接数据** —— 把 `billion-context` 代理账本的真实 token 用量 / 缓存命中喂给
  `dsh-context` 的统计卡与切换卡。

全程不修改 `dsh-context`、`billion-context` 的任何代码与页面 DOM（详见[边界](#边界)）。

## 背景

同时安装两个插件后会有三个问题：

| 问题 | 原因 |
|---|---|
| 顶栏出现两个重名的「上下文」标签 | 两个插件都注册了 `conversation.view` |
| 面板底部有一张赞助商广告卡（DeepSeek / Zilliz / PowerContext 轮播） | `dsh-context` 自带的推荐位，数据来自 `dsh-context` 仓库的 `data/recoms.json` |
| 上一版切换卡显示「billion 账本未连接」 | billion 的账本端口不发 CORS 头，且它自带的同源 relay 默认关闭，页面内跨域请求必然被浏览器拦下——代理其实活得好好的 |

本插件对三者各修各的，互不牵连。

## 功能

### 0. OpenCode 风格工具别名 —— 已迁出

`read` / `glob` / `grep` / `bash` / `ls` / `list` 的别名层属于**工具层**，已迁移到
[`@ianwusb/dsh-opencode-compat`](https://github.com/Swcmb/dsh-opencode-compat) 的
`lib/ops-aliases.js`（`agent.ctx` 内注册 + global 兜底，委托到 `ops_*`）。

本插件不再注册任何工具，也不再需要 `tools` 服务。

### 1. 单标签

写 `billion-context` 自己的配置键 `dsh.contextTab: false`（由 `scripts/setup.mjs`
显式执行，先备份、可回滚）。只摘标签：压缩、设置页、Web UI 全部保留。

### 2. 广告位 → 切换卡

client 半注入一条 CSS 隐藏广告锚点 `a.lc-recom`（隐藏而非删除），并把一个
`<button data-dsh-ctx-bili-bridge="slot">` 插到广告的下一个兄弟位。卡片上实时显示
billion 账本的精确读数：

```
压缩账本                              打开 ▸
总用量 16.74M · 命中 15.94M (95.49%)
17 个账本 · deepseek-v4.1-flash-free
数据源：billion 账本（已接管统计卡）
```

点卡片在 `shell.overlay` 浮层里打开 `billion-context` 的 Web UI（完整页面 +
`?theme=light|dark` 自动跟随 DSH 明暗，`Esc` / 点遮罩关闭）。`dsh-context` 面板被禁用
或改版时，8 秒后降级为右下角悬浮按钮，控件不丢。

### 3. 数据源垫片

把 billion 的账本映射成 `dsh-context` 的 `tokenUsage` 投影值并写入当前会话的投影
store，`dsh-context` 的统计卡从此显示代理第一手数据：

```
uncachedInputTokens = inputTokens − cachedTokens
cacheReadTokens     = cachedTokens
cacheWriteTokens    = 0     // 账本不暴露，保守取 0 保证计费总量无损
outputTokens        = outputTokens
```

垫片状态显示在切换卡第三行，失败原因直接可见（`无 sessions 服务` / `未找到当前会话` /
`投影 store 不可用` / `写入失败`），任何时候都能降级回 DSH 原生显示。

## 边界

**不动 `dsh-context`**：不改包文件、不改组件、不隐藏/卸载/改写它的统计卡、事件列表、
上下文浏览器。唯一被隐藏的节点是那个广告 `<a>`，节点所有权仍属于 `dsh-context`。

**不新增第三个标签**：只注册 `shell.overlay`，不注册 `conversation.view` /
`sidebarRightTabs`。

**不动 `billion-context` 的压缩**：只写它官方的一个配置键（摘标签），不关压缩、不改包。

**不改 DSH 官方产物**：所有运行时改动都在本插件自己的 host 半 / client 半里。

## 安装

前提：Node ≥ 22.19，DSH 已安装且目标 profile 里已装好 `dsh-context` 与 `billion-context`。

```bash
# 1) 从 npm 安装（官方 CLI 会同步 profile 的 dependencies 与 bundles）
dsh plugin --profile <profile> add @ianwusb/dsh-ui-adapter@latest

# 2) 摘掉 billion-context 的重名标签（路径换成你 profile 下的 node_modules）
node node_modules/@ianwusb/dsh-ui-adapter/scripts/setup.mjs --dry-run
node node_modules/@ianwusb/dsh-ui-adapter/scripts/setup.mjs   # 回滚：--undo

# 3) 重启 DSH（同源路由在进程启动时注册，仅 Ctrl+R 不够）
```

也可以从源码目录安装（git clone 后在包目录运行 `node scripts/install.mjs --profile <profile-dir>`，支持 `--dry-run` / `--undo`）。

> 本包为 **GPL-3.0-or-later**，与工具链中 MIT 许可的其它包相互独立；`@ianwusb/dsh-toolkit`（meta 聚合包）**不**依赖本包，需要时单独安装。

## 配置

写在插件的 cordis 配置里（host 半经 `webserver/index-inject` 注入到页面）：

| 键 | 默认 | 说明 |
|---|---|---|
| `origin` | `http://127.0.0.1:18787` | billion 代理地址（有更优先的自动发现，见下） |
| `pollMs` | `5000` | 账本轮询间隔，最小 1000 |
| `patchUsage` | `true` | 是否接管 `tokenUsage` 投影 |
| `switchLabel` | `压缩账本` | 切换卡显示名 |
| `lang` | `zh` | 保留位；浮层语言跟随 billion 页面 |

代理地址发现顺序：`~/.local/state/billion-context/proxy-origin` 实例文件（首选，含 pid
与 lane）→ `__BILI__.origin` → `GET /bili/origin` 的 JSON 体 → 配置 `origin` →
`http://127.0.0.1:18787`。

## 架构

```
DSH 页面 (dsh-app://)
└─ client 半  lib/client.js
   ├─ 轮询 /__ctx-bili/sessions（同源，无 CORS）──────────────┐
   ├─ 广告位控制：CSS 隐藏 + 占位 + 守位                       │
   ├─ 数据垫片：写当前会话的 tokenUsage 投影 store              │
   └─ 渲染层诊断：每 30s POST /__ctx-bili/diag                  │
                                                               ▼
DSH 宿主进程
└─ host 半  lib/index.js   （模块级 inject: ['webServer']）
   └─ lib/proxy.mjs  三条只读同源路由
      ├─ GET /__ctx-bili/sessions ──转发──▶ billion 账本 (127.0.0.1:<port>)
      ├─ GET /__ctx-bili/status
      └─ POST /__ctx-bili/diag ──▶ .host.log
```

| 文件 | 作用 |
|---|---|
| `lib/index.js` | host 半：注册同源路由、发布配置、写 `.host.log` |
| `lib/proxy.mjs` | 只读同源代理 + 诊断路由（Node 侧无 CORS） |
| `lib/client.js` | client 半：广告位、轮询、垫片、浮层 |
| `lib/ledger.mjs` | 纯映射逻辑（会话匹配、URL、配置、字段映射） |
| `lib/hostlog.mjs` | host 半诊断日志（`.host.log`） |
| `scripts/install.mjs` | 注册到 profile（junction + bundles），带备份与回滚 |
| `scripts/setup.mjs` | 写 `dsh.contextTab: false`（带备份与回滚） |
| `scripts/verify.mjs` | 7 项只读安装校验 |
| `docs/notes.md` | 设计笔记与排障（实测得出的平台行为） |

## 排障

界面上能看到状态，日志里有真相。包目录下的 `.host.log`（`lib/hostlog.mjs` 追加）：

| 日志 | 含义 |
|---|---|
| 无 `apply:enter` | host 半没被加载（profile / bundle 问题） |
| `bind:no-webserver` | 模块没声明 `inject: ['webServer']` |
| `bind:routes-ok` | 路由注册成功 |
| `route:hit {status:200}` | 页面在轮询并拿到了数据——问题只可能在渲染 |
| 无 `route:hit` | 页面没打到路由（重启 DSH 后重载页面） |
| `client:diag {…}` | 渲染层每 30 秒上报：sessions 获取路径、当前会话 id、垫片结果 |

界面文案与日志对不上时以日志为准。

## 开发

```bash
node --test tests/*.test.mjs                                # 72 项
node scripts/verify.mjs --profile <profile-dir>             # 7 项只读校验
node scripts/verify.mjs --profile <profile-dir> --compose   # 额外跑 dsh --dump-config
```

## 兼容性

实测通过：DSH `0.2.2-rc.1`、`dsh-context@0.83.1`、`billion-context@0.1.213`。
其它版本未测；`dsh-context` 改版换掉广告类名时本插件自动降级为悬浮按钮。

设计细节、平台行为实测记录与完整排障见 [docs/notes.md](docs/notes.md)。

## 致谢

- [dsh-context](https://github.com/bowenliang123/dsh-context)（bowenliang123, Apache-2.0）
  —— 上下文观测面板与广告位所在；
- [billion-context](https://github.com/ranxianglei/billion-context)（ranxianglei, MIT）
  —— 压缩代理与账本，本插件的数据源。

## License

[GPL-3.0-or-later](COPYING)。

本插件不复制上述两个项目的任何代码；只读 billion-context 的 HTTP 账本端点，引用两者
公开的配置开关键名与 DOM 类名。

## 设计说明

- **不再渲染悬浮 fallback 按钮**（2026-11-13 按用户要求移除）：切换卡只出现在 dsh-context 的广告位槽位（`slot === 'mounted'`，即打开上下文面板时）；没有槽位时控件保持隐藏，billion 的 Web UI 仍可从面板卡打开或直接访问代理地址。`tests/client.test.mjs` 已按此断言。

## 会话面板套件（session-panel suite）

自 2026-11-23 起，本包从单一「上下文/账本」适配器扩展为**融合插件套件**。
`dsh-session-panel-kit` 的 `session-panel`、`cs-panel-hider`、`default-sidebar-tab`
插件均已平铺进本仓库，与 adapter 一起由统一入口加载（共四个模块）。

| 模块 | client 半 | host 半 | 侧栏 kind | 说明 |
|---|---|---|---|---|
| adapter（原有） | `lib/client.js` → `lib/client-adapter.js` | `lib/index.js` → `lib/host-adapter.mjs` | — | 广告位 / 账本切换卡 / tokenUsage 垫片 |
| session-panel | `lib/client-session-panel.js` | `lib/host-session-panel.mjs` | `dsh-session-details` | 右侧会话详情栏：环境 / 上下文 / 会话统计 / Token 用量 / 子智能体 |
| cs-panel-hider | `lib/client-cs-panel-hider.js` | `lib/host-cs-panel-hider.mjs` | — | 隐藏 dsh-claude-style 自带详情栏 |
| default-sidebar-tab | `lib/client-default-sidebar-tab.js` | `lib/host-default-sidebar-tab.mjs` | — | 把原生播种的 guide 页原位替换为指定 tab（默认会话详情） |

统一入口：

- `lib/client.js` —— **唯一**一个顶层 `window.__ModuleLoader__.load({id:'@ianwusb/dsh-ui-adapter'})`。
  四个插件的 client 半**逐字节内联**在同一个 factory 内（不是 `import`）：DSH 把本文件作为
  classic script 注入，静态 `import` 不会执行；DSH 的 boot manifest 每个已安装 bundle 只激活
  一个模块 id，同一脚本内注册的第二个 `load()` 只会入队、永不 `apply`。factory 内临时把
  `window.__ModuleLoader__` 换成收集器（真实 `window` 不被遮蔽，`finally` 恢复），然后
  合并四个 descriptor 的 `inject` 并集并依次调用各自的 `apply(ctx)`。
- `lib/index.js` —— 聚合 `applyAdapter` / `applySessionPanel` / `applyCsPanelHider` /
  `applyDefaultSidebarTab` 四个 host 半，对外仍只暴露一个 Cordis 插件名
  `dsh-ui-adapter`；同源路由 `/__ctx-bili/*`、`/__dsh-session-panel/*`、
  `/__dsh-cs-panel-hider/*` 共存，互不冲突。

### 协作契约

- **单一 Cordis 插件名**：`cordis.patch.yml` 只保留一条 insert
  （`id: dsh-ui-adapter` / `name: '@ianwusb/dsh-ui-adapter'`）；四个 client 模块由统一
  client 入口加载，host 不再分别注册第二个插件。
- **配置注入并按并集声明**：`dsh.client.inject` 取各模块并集
  （`runtime`、`ui-layout`、`locale`、`ui-sidebar-right`、`modules`），确保详情栏挂载到
  右侧栏所需的模块可用。
- **边界不变**：仍不修改 `dsh-context`、`billion-context` 的包文件与 DOM；session-panel
  只读取原生 DSH 的投影与服务，数据经同源路由下发。

### 历史

三个套件插件原先合装在 `dsh-session-panel-kit`（一个 git submodule，内含三个独立包：
`session-panel/` → `@local/dsh-session-panel`、`cs-panel-hider/` → `@local/dsh-cs-panel-hider`、
`default-sidebar-tab/` → `@local/dsh-default-sidebar-tab`）。2026-11-23 先以 subtree merge
并入本仓库（`agent/fuse-kit-into-root` 分支），再逐个平铺到根目录并删除子目录，**原始提交
历史全部保留**（以 `--no-ff` 合并回 `main`，非 squash / rebase）。

来源：

- `session-panel` ← `Swcmb/dsh-session-panel`；该插件本身从 `dsh-claude-style` 的
  `sessionPanel` 功能剥离并裁剪，仅依赖原生 DSH。
- `cs-panel-hider` ← `Swcmb/dsh-cs-panel-hider`。
- `default-sidebar-tab` ← 本地仓库（原本就没有远程）。

融合后三者不再是可分别安装的独立包，而是同一 Cordis 插件 `dsh-ui-adapter` 内的三个模块。

## session-panel（右侧会话详情栏）

`session-panel` 已平铺进本仓库，作为融合套件第二个模块。它从 `dsh-claude-style` 的
`sessionPanel` 功能剥离并逐行裁剪而来，**只依赖原生 DSH**。

- **注册的 tab kind**：`dsh-session-details`（标题「会话详情」），经
  `ctx.sidebarRightTabs.register` 注册，是 `default-sidebar-tab` 的默认目标。
- **client 半**：`lib/client-session-panel.js`。
- **host 半**：`lib/host-session-panel.mjs`，把会话数据折成一个面板值，经同源只读路由
  `GET /__dsh-session-panel?id=<sessionId>` 提供；client 半**每 2.5 秒**轮询一次，
  按会话隔离读数。
- **五个区块与数据来源**（全部原生 DSH）：

| 区块 | 来源 |
|---|---|
| 环境 | 会话 header 的 `cwd` + `node:child_process` 读 git |
| 上下文 | `sessionQuery.observeSession` 事件流（按块形态 + 来源归属计价）+ `contextPressure` 投影 |
| 会话统计 | `sessionStats` / `tokenUsage` 投影 |
| Token 用量 | 同上 token 桶 |
| 子智能体 | `subagentCatalog` 投影 + `agents` 服务的运行状态 |

- **入口**：会话头部的「会话详情」按钮（`conversation.session.header.utilities` slot）
  开关详情栏；该 slot 不可用时降级为右上角悬浮按钮。
- **与上游的取舍**：只实现实际出现在截图里的五个区块，产出 / 变更 / 后台任务的折叠
  列表未包含；token 计价保留字符类别算法（CJK / 词 / 数字 / 空白 / 标点），图片按
  patch 网格估算；去掉原实现的多 feature 调度、settings 页、i18n 框架、骨架屏动画。
  会话 id 从活跃对话节点的 `data-conversation-session` 属性读取。

## cs-panel-hider（dsh-claude-style 详情栏隐藏器）

`cs-panel-hider` 已平铺进本仓库，作为融合套件第三个模块，与 adapter、session-panel
一起由统一入口 `lib/client.js` / `lib/index.js` 加载。

- **作用**：用 CSS 隐藏 `dsh-claude-style` 自带的会话详情栏
  `.dsh-claude-details-root` 与头部开关 `.dsh-claude-session-panel-button`，并清理
  `body[data-dsh-claude-session-panel]` 布局标记；不删除节点、不碰 `dsh-claude-style`
  的状态。
- **client 半**：`lib/client-cs-panel-hider.js`（`inject: []`，无额外依赖）。
- **host 半**：`lib/host-cs-panel-hider.mjs`，只提供诊断落盘路由
  `POST /__dsh-cs-panel-hider/diag` → 仓库根 `.diag.log`；诊断 stage 有
  `style-installed`、`hide-probe`、`hide-probe-failed`。
- **隐藏的三个目标**：

| 目标 | 选择器 | 说明 |
|---|---|---|
| 详情栏（整栏） | `.dsh-claude-details-root` | dsh-claude-style 自挂载到 body 的容器 |
| 顶部开关图标 | `.dsh-claude-session-panel-button` | 注册在会话头部 utilities 槽，`aria-label="会话详情"` |
| 布局副作用 | `body[data-dsh-claude-session-panel]` | 原插件用它把头部让位给面板，补丁持续清掉以恢复原布局 |

- **为什么用 CSS 隐藏而不是删节点**：这两个节点属于 dsh-claude-style 自己的 React 树，
  直接 `remove()` 会在它下次渲染时被重建，还可能让 React 的后续操作报错。CSS
  `!important` 能覆盖它的 inline style，原插件重渲染 / 重建节点后依然生效，且不动它的
  状态——这是最稳的做法。面板是 `position:fixed`、不占文档流，隐藏后对话区不会留空白。
- **与 session-panel 协作**：session-panel 提供本套件自己的右侧会话详情栏，
  cs-panel-hider 只隐藏 `dsh-claude-style` 的旧详情栏，两者操作不同节点，互不冲突。
  统一 Cordis 插件名仍是 `dsh-ui-adapter`，`cordis.patch.yml` 不新增 insert 行。

### 许可

- 融合套件整体：**GPL-3.0-or-later**（见 `COPYING`、`LICENSE-session-panel`、
  `LICENSE-cs-panel-hider`、`LICENSE-default-sidebar-tab`）。
- 三个迁入模块各自保留原 `LICENSE-*` 全文；`cs-panel-hider` 与 `default-sidebar-tab`
  均未复制第三方代码，前者只引用 dsh-claude-style 的 DOM class 作为隐藏目标，后者只调用
  原生 DSH 公开的 `ctx.sidebarRight` 导航 API。
- `lib/tokens.mjs` 与详情栏中的 token 计价算法、中文文案移植自
  `dsh-claude-style`（MIT, © 2026 Nwflower），声明见 `NOTICES.md`；MIT 与 GPLv3 兼容，
  汇入时保留原始 MIT 授权全文。

## default-sidebar-tab（默认右侧栏 tab）

`default-sidebar-tab` 已平铺进本仓库，作为融合套件第四个模块，与 adapter、
session-panel、cs-panel-hider 一起由统一入口 `lib/client.js` / `lib/index.js` 加载。

- **作用**：当用户打开一个会话、原生右侧栏播种出开始页（`guide`）时，用配置的 tab
  通过 `sidebarRight.openTab(kind, { replaceTab: guide.tabId })` **原位替换**它，
  默认目标是会话详情 `dsh-session-details`。每个会话只替换一次；不改写侧栏持久化布局。
- **client 半**：`lib/client-default-sidebar-tab.js`（`inject: ['slots']`，apply 内动态
  等待原生 `sidebarRight`）。自证诊断写本地键 `dsh-default-sidebar-tab:diag`，并经
  `/__dsh-session-panel/diag` 上报宿主落盘；stage 含 `loaded`、`attached`、`replaced`、
  `runtime-probe` 等。
- **host 半**：`lib/host-default-sidebar-tab.mjs` 监听 `webserver/index-inject`，把配置
  作为全局变量注入每个 index 页面。
- **配置项**（cordis 配置段）：
  - `defaultTab`：非空字符串，目标 tab 的 kind；默认 `dsh-session-details`。
    设成 `guide` 等于不启用替换。
  - `enabled`：布尔，默认 `true`；设为 `false` 时完全不替换。
- **全局注入**：`__DSH_DEFAULT_SIDEBAR_TAB__`，值为 `{ defaultTab, enabled }`。
- **不做什么**：不主动展开右边栏（只在用户自己打开、原生播下 guide 时才动）；不在会话
  已有其它 tab 时插手；不直接读写 `dsh.sidebar-right.v1.<sessionId>` 布局存储；不隐藏、
  删除、改写任何节点；不注册新 tab、不提供 UI 按钮——只是把原生导航控制器指向一个已注册
  的 kind。目标 kind 未注册时 `openTab` 会抛错，本模块有限重试后放弃，**保留原生开始页**，
  界面不会坏。目标 kind 已打开时原生会直接聚焦它，不会开重复。
- **常用 tab kind**（与 `lib/config.mjs` 的 `KNOWN_KINDS` 同步，仅作提示清单）：

| kind | 展示内容 | 来源 |
|---|---|---|
| `dsh-session-details` | 会话详情 | 本套件 session-panel（**默认**） |
| `session-inspector-log` | 会话数据诊断 | 原生 inspector bundle |
| `guide` | 开始页（原生入口卡片页） | 原生默认 |
| `files` | 文件树 | 原生 |
| `browser` | 浏览器 | 原生 |
| `terminal` | 终端 | 原生 |
| `plan` | 计划 | 原生 |
| `changes-review` | 代码审查和变更 | 原生 |
| `schedule` | 任务管理 | 原生 |
| `dsh-context` | 上下文面板 | dsh-context（需已安装） |

  配置任意字符串都可；不在表中的 kind 若已由某插件注册同样能生效，未注册则保留开始页。
- **自证诊断（无需 UI 截图）**：运行时把事件写进 `localStorage` 的
  `dsh-default-sidebar-tab:diag` 键（只写自己的键，不碰 `dsh.sidebar-right.*` 布局存储），
  流程为 `loaded → apply → attached → probe → replaced`；`replaced` 表示原生 `guide`
  tab 已被换成目标 kind。原生侧栏布局落在 `dsh.sidebar-right.v1.<sessionId>`，替换成功后
  该会话的 `tabs` 里应只剩目标 kind：

```json
{"tab3":{"id":"tab3","kind":"dsh-session-details","title":"会话详情"}}
```

- **探测脚本（非截图验证）**：仓库 `scripts/` 已迁入原 kit 的探测工具。
  两者都要求 DSH 以对应调试端口启动。

```bash
node scripts/page-probe.mjs state        # 读页面注入值 + diag 事件 + 布局
node scripts/page-probe.mjs eval "<js>"  # 在 renderer（dsh-app:// 页面）里执行表达式
node scripts/cdp-probe.mjs               # 连 host 进程 inspector
```

  `page-probe.mjs` 连 Electron 的 remote debugging 端口（默认 `9333`，可用
  `DSH_DEBUG_PORT` 覆盖），需 DSH 以 `--remote-debugging-port=<port>` 启动；
  `cdp-probe.mjs` 连 host 进程 inspector（默认 `9230`，可用 `DSH_CDP_PORT` 覆盖），
  用于只读检查插件是否在 cordis 树里、index 注入了哪些全局、web 模块清单是否含本插件。
- **与 session-panel 的契约**：`default-sidebar-tab` 的 `DEFAULT_TAB`（`lib/config.mjs`）
  与 session-panel 注册的 `TAB_KIND`（`lib/client-session-panel.js`）必须同为
  `dsh-session-details`，否则替换后的 tab 无法解析。两者由统一 client 入口组合，无需
  各自注册独立 Cordis 插件。修改 kind 时需同步这两处。
