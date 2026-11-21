# dsh-context-bili-bridge

> 本包为**独立仓库**（`Swcmb/dsh-context-bili-bridge`），独立维护与发布；曾短暂并入 dsh-toolkit monorepo，2026-11-21 起回归独立，monorepo 内的 `packages/bili-bridge` 不再更新。

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
dsh plugin --profile <profile> add @ianwusb/dsh-context-bili-bridge@latest

# 2) 摘掉 billion-context 的重名标签（路径换成你 profile 下的 node_modules）
node node_modules/@ianwusb/dsh-context-bili-bridge/scripts/setup.mjs --dry-run
node node_modules/@ianwusb/dsh-context-bili-bridge/scripts/setup.mjs   # 回滚：--undo

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
node --test tests/*.test.mjs                                # 27 项
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
