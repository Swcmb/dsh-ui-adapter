
# DSH UI Adapter

**为 DeepSeek Harness（DSH）提供统一的会话与上下文界面增强。**

**@ianwusb/dsh-ui-adapter** 将四个相互配合的 UI 模块整合为一个 DSH 插件包：统一上下文入口、会话详情侧栏、旧详情栏隐藏，以及右侧栏默认标签控制。

一个包、一个 Cordis 插件入口、一个 client bundle。安装和升级时只需管理这一项。

[功能概览](#功能) · [安装](#安装) · [配置](#配置) · [架构](#架构) · [验证与排障](#验证与排障)

## 功能

| 模块 | 能力 | 依赖与作用范围 |
|---|---|---|
| **Context Adapter** | 合并重复的「上下文」标签；用压缩账本卡片替换 dsh-context 的赞助位；将 billion 的 Token 账本接入 dsh-context 统计 | 需要 dsh-context 和 billion-context |
| **Session Panel** | 在 DSH 原生右侧栏提供会话详情：环境、上下文构成、会话统计、Token 用量、子智能体 | 使用 DSH 原生服务 |
| **CS Panel Hider** | 隐藏 dsh-claude-style 自带的详情栏、顶部开关及其布局标记 | 仅在安装 dsh-claude-style 时有对应效果 |
| **Default Sidebar Tab** | 用户打开右侧栏且原生生成 guide 开始页时，将其替换为指定 tab；默认目标为会话详情 | 默认目标由本包的 Session Panel 注册 |

### 1. Context Adapter：统一上下文与压缩账本

同时安装 dsh-context 和 billion-context 时，两个插件都会注册「上下文」入口。本模块使用 billion-context 自带的 dsh.contextTab 配置关闭重复入口，保留 dsh-context 作为唯一上下文面板。

在 dsh-context 原赞助卡片的位置展示「压缩账本」切换卡，实时呈现 billion 账本数据，包括输入/输出用量、缓存命中率、账本数量和模型信息。点击卡片可在 DSH 浮层中打开 billion Web UI，页面主题跟随 DSH。

同时，本模块把 billion 当前会话的账本数据映射到 dsh-context 使用的 tokenUsage 投影：

| DSH 字段 | 数据映射 |
|---|---|
| uncachedInputTokens | inputTokens - cachedTokens |
| cacheReadTokens | cachedTokens |
| cacheWriteTokens | 0 |
| outputTokens | outputTokens |

billion 账本没有提供 cache-write 数量，因此写入 0；输入总量仍保持无损，缓存命中率按账本可用字段计算。会话匹配支持精确匹配、宽松匹配和最新账本回退，并在界面状态中区分数据源状态与匹配结果。

**跨域处理：** billion 账本服务默认不提供浏览器所需的 CORS 响应头。插件由 DSH host 进程提供同源只读代理，client 通过 DSH 页面同源路由读取账本，不要求开启 billion 的 admin relay，也不新增监听端口。

### 2. Session Panel：原生会话详情侧栏

注册右侧栏 tab kind：dsh-session-details，提供五个信息区块：

| 区块 | 内容与数据来源 |
|---|---|
| **环境** | 当前会话工作目录、用户环境，以及可读取到的 Git 仓库、分支和提交信息 |
| **上下文** | 上下文占用与构成：系统提示、工具、MCP、技能、对话、推理、工具调用/结果、附件和注入内容 |
| **会话统计** | 回合数、步骤数、首 Token 时间、模型用时、工具用时等 DSH 原生投影 |
| **Token 用量** | 未缓存输入、缓存读取、缓存写入、输出及费用等原生统计 |
| **子智能体** | 子智能体目录及运行状态 |

面板数据由 host 半读取 DSH 原生会话服务并汇总，经同源路由提供给 client；client 每 **2.5 秒**刷新当前会话数据。上下文构成按消息块和来源类别进行估算，Token 用量与会话统计读取 DSH 投影。

面板提供会话头部开关，并注册到 DSH 原生右侧栏。它不依赖 dsh-claude-style 的详情栏实现。

### 3. CS Panel Hider：隐藏旧详情栏

当 dsh-claude-style 与本套件的 Session Panel 同时使用时，本模块隐藏 dsh-claude-style 自带的详情栏，避免两个详情面板重复显示。

处理目标：

- .dsh-claude-details-root：旧详情栏容器。
- .dsh-claude-session-panel-button：旧详情栏顶部开关。
- body[data-dsh-claude-session-panel]：旧面板用于调整页面布局的标记。

模块使用 CSS 隐藏并清理自身对应的布局标记，不删除 React 树中的节点，也不改写 dsh-claude-style 的状态。Session Panel 的新详情栏由本套件独立提供。

### 4. Default Sidebar Tab：控制右侧栏默认页

DSH 为新打开的右侧栏生成原生 guide 开始页。本模块在目标会话出现该页时，调用原生 sidebarRight.openTab()，将它原位替换为配置指定的 tab。

默认目标为 dsh-session-details。也可以指定其他已注册的 tab kind，例如 files、terminal、browser 或 dsh-context。

行为边界：

- 只处理原生生成的 guide tab，不主动打开右侧栏。
- 不替换用户已经打开的其他 tab。
- 不直接读写 DSH 的侧栏持久化布局。
- 目标 tab 尚未注册时有限重试；仍不可用则保留原生开始页。
- 将 defaultTab 设为 guide，或将 enabled 设为 false，即可停用替换行为。

## 安装

### 环境要求

- DeepSeek Harness（DSH）。
- Node.js **22.19.0 或更高版本**。
- 使用 Context Adapter 时，目标 DSH profile 需安装 dsh-context 和 billion-context。
- 使用 CS Panel Hider 时，需安装 dsh-claude-style。

### 从 npm 安装

在目标 DSH profile 中执行：

~~~bash
dsh plugin --profile <profile> add @ianwusb/dsh-ui-adapter@latest
~~~

关闭 billion 的重复「上下文」标签。该步骤会修改 billion 自己的配置文件，只设置官方配置键 dsh.contextTab: false：

~~~bash
# 先检查将要执行的变更
node node_modules/@ianwusb/dsh-ui-adapter/scripts/setup.mjs --dry-run

# 确认后执行
node node_modules/@ianwusb/dsh-ui-adapter/scripts/setup.mjs
~~~

脚本默认读取 ~/.config/billion-context/billion-context.json，并在首次修改前创建备份。配置文件位于其他位置时，可通过环境变量 BILI_CONFIG_FILE 指定。

此设置只移除 billion 的重复「上下文」标签，不关闭压缩功能、设置页、Web UI 或 /acp 命令。恢复时运行：

~~~bash
node node_modules/@ianwusb/dsh-ui-adapter/scripts/setup.mjs --undo
~~~

完成安装后重启 DSH，使 host 路由与插件入口重新加载。

### 从源码安装（开发）

~~~bash
git clone https://github.com/Swcmb/dsh-ui-adapter.git
cd dsh-ui-adapter

# 先检查 profile 注册变更
node scripts/install.mjs --profile <profile-dir> --dry-run

# 创建本地链接并注册 bundle
node scripts/install.mjs --profile <profile-dir>
~~~

安装脚本会在目标 profile 中创建指向当前仓库的目录链接，并更新其 dependencies 与 dsh.profile.bundles。它不会修改其他插件的包文件。

## 配置

以下字段由插件配置对象读取。未设置时采用默认值。

| 字段 | 默认值 | 作用 |
|---|---|---|
| origin | http://127.0.0.1:18787 | billion 代理地址回退值 |
| pollMs | 5000 | 账本轮询间隔，单位毫秒，最小值为 1000 |
| patchUsage | true | 是否将 billion 账本写入 DSH 的 tokenUsage 投影 |
| switchLabel | 压缩账本 | 账本切换卡标题 |
| defaultTab | dsh-session-details | 右侧栏默认目标 tab kind |
| enabled | true | 是否启用默认 tab 替换 |

示例配置对象：

~~~json
{
  "origin": "http://127.0.0.1:18787",
  "pollMs": 5000,
  "patchUsage": true,
  "switchLabel": "压缩账本",
  "defaultTab": "dsh-session-details",
  "enabled": true
}
~~~

billion 地址优先读取实例启动时写入的 proxy-origin 文件：

- 默认路径：~/.local/state/billion-context/proxy-origin
- 设置了 XDG_STATE_HOME 时：$XDG_STATE_HOME/billion-context/proxy-origin
- 实例文件不可用时，使用配置中的 origin；未配置时回退到默认地址。

defaultTab 可以指向其他插件注册的 tab kind。目标 kind 必须在 DSH 运行时已注册；未注册时插件保留原生 guide 页面。

## 架构

本仓库是一个可安装插件包，而不是四个独立插件的安装集合。

~~~text
@ianwusb/dsh-ui-adapter
│
├── Cordis host entry
│   └── lib/index.js
│       ├── host-adapter.mjs
│       ├── host-session-panel.mjs
│       ├── host-cs-panel-hider.mjs
│       └── host-default-sidebar-tab.mjs
│
└── DSH client bundle
    └── lib/client.js
        ├── client-adapter.js
        ├── client-session-panel.js
        ├── client-cs-panel-hider.js
        └── client-default-sidebar-tab.js
~~~

- **Host 侧：** lib/index.js 以唯一插件名 dsh-ui-adapter 注册，并聚合四个模块的 apply()。Host 侧声明 webServer 依赖，为账本、会话详情和诊断提供同源路由。
- **Client 侧：** DSH 将 lib/client.js 作为 classic script 注入。入口只注册一个模块 ID：@ianwusb/dsh-ui-adapter；四个模块在该 factory 内组合执行，并合并各自的 client 注入依赖。
- **Bundle：** cordis.patch.yml 只有一条 insert，profile 只需注册 @ianwusb/dsh-ui-adapter。

Client 入口采用内联模块组合，是为了遵循 DSH 的加载方式：classic script 不执行静态 ES module import，且一个 bundle 只激活一个 client module ID。四个模块保留各自的实现文件和测试，统一入口负责加载与生命周期组合。

## 文件结构

| 路径 | 用途 |
|---|---|
| lib/index.js | 唯一 Host 入口，组合四个模块 |
| lib/client.js | 唯一 Client 入口，组合四个模块 |
| lib/host-*.mjs | 四个模块各自的 Host 实现 |
| lib/client-*.js | 四个模块各自的 Client 实现 |
| lib/ledger.mjs | billion 账本映射、会话匹配与 URL 逻辑 |
| lib/proxy.mjs | billion 同源只读代理 |
| lib/tokens.mjs | 上下文消息块与 Token 估算逻辑 |
| lib/config.mjs | 默认侧栏 tab 的配置解析 |
| scripts/setup.mjs | 设置或恢复 billion 的重复标签配置 |
| scripts/install.mjs | 将源码链接并注册到 DSH profile |
| scripts/verify.mjs | 对已安装 profile 执行只读检查 |
| scripts/page-probe.mjs、scripts/cdp-probe.mjs | 页面与 Host 运行时探测 |
| docs/notes.md | Context Adapter 的设计依据与排障笔记 |
| project-context/specs/ | 设计、融合与验证记录 |

## 验证与排障

### 本地验证

~~~bash
# 完整测试套件
npm test

# 检查已安装 profile
node scripts/verify.mjs --profile <profile-dir>

# 可选：进一步调用 DSH CLI 检查配置组合结果
node scripts/verify.mjs --profile <profile-dir> --compose
~~~

verify.mjs 是只读安装检查，不会修改 profile、dsh-context 或 billion-context。它检查 bundle 注册、安装路径、Cordis 声明、Host 路由和 Client 入口等项目。它不能代替运行中 DSH 窗口的界面验证。

### 账本未连接或统计未接管

优先检查插件包目录中的 .host.log：

| 日志 | 含义 |
|---|---|
| 没有 apply:enter | Host 入口没有加载，检查 profile 与 bundle 注册 |
| bind:no-webserver | Host 插件没有取得 DSH 的 webServer 服务 |
| bind:routes-ok | 同源路由注册成功 |
| route:hit 且状态为 200 | 页面已请求路由并取得账本数据 |
| 没有 route:hit | 页面没有访问到 Host 路由；检查 DSH 进程是否重启、页面是否重新加载 |
| client:diag | Client 上报的会话匹配、账本读取和投影接管状态 |

关键路由：

| 路由 | 用途 |
|---|---|
| GET /__ctx-bili/sessions | 读取 billion 会话账本 |
| GET /__ctx-bili/status | 查看账本地址发现状态与路由命中数 |
| POST /__ctx-bili/diag | 接收账本适配器的 Client 诊断 |
| GET /__dsh-session-panel?id=<sessionId> | 读取指定会话的详情数据 |
| POST /__dsh-session-panel/diag | 写入会话详情与默认 tab 的诊断 |
| POST /__dsh-cs-panel-hider/diag | 写入旧详情栏隐藏器的诊断 |

Session Panel 与 CS Panel Hider 的 Host 诊断写入仓库根目录的 .diag.log。

**重启规则：** Host 路由在 DSH 进程启动时注册；修改 Host 侧代码或重新安装插件后应重启 DSH。仅刷新页面不会重新执行 Host 的 apply()。

### 页面与进程探测

需要检查运行时状态时，可使用仓库自带探测脚本：

~~~bash
# 读取页面注入值、诊断事件与侧栏布局
node scripts/page-probe.mjs state

# 在 DSH renderer 页面执行表达式
node scripts/page-probe.mjs eval "<js>"

# 检查 DSH Host 进程
node scripts/cdp-probe.mjs
~~~

page-probe.mjs 默认连接 Electron remote debugging 端口 **9333**，可通过 DSH_DEBUG_PORT 覆盖。cdp-probe.mjs 默认连接 Host inspector 端口 **9230**，可通过 DSH_CDP_PORT 覆盖。启动 DSH 时需要启用对应调试端口。

## 当前验证状态

截至 2026-11-23，仓库验证记录包含：

| 验证项 | 结果 |
|---|---|
| Node 测试套件 | **72/72 通过** |
| 已安装 profile 的只读检查 | **7/7 通过** |
| 四个模块的 Host / Client 启动 | 已在一次干净启动中分别观察到模块诊断阶段 |
| Context Adapter 同源路由 | 已实测可用，返回 200/204 |
| Default Sidebar Tab 的 guide 替换行为 | **尚未完成桌面实机验证**；12 项本地行为测试覆盖替换流程与守卫分支 |

最后一项的实机触发条件在验证期间未出现：当前挂载会话没有对应的 guide tab。因此，本项目只将该行为标记为本地测试覆盖，不将其描述为桌面实测通过。完整证据与限制见 [融合验证记录](project-context/specs/2026-11-23-fusion-verification.md)。

## 上游与许可

本项目与以下项目协作：

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — DSH 运行时与插件 API。
- [dsh-context](https://github.com/bowenliang123/dsh-context) — 上下文面板与原赞助位。
- [billion-context](https://github.com/ranxianglei/billion-context) — 压缩代理与 Token 账本。
- [dsh-claude-style](https://github.com/Nwflower/dsh-claude-style) — Session Panel 部分算法与文案的来源。

本仓库主体采用 **GPL-3.0-or-later**，完整许可文本见 [COPYING](COPYING)。移植自 dsh-claude-style 的内容保留 MIT 声明，详见 [NOTICES.md](NOTICES.md)。

本插件通过 DSH 插件 API、同源只读路由和受控 CSS 适配上游界面，不修改 dsh-context、billion-context 或 dsh-claude-style 的包文件。安装 Context Adapter 时，setup.mjs 只会按用户显式执行的步骤修改 billion 配置中的 dsh.contextTab 键。
