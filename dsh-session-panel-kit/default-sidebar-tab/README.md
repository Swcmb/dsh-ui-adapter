# dsh-default-sidebar-tab

独立补丁插件：**设置打开右边栏时默认展示的内容**。

截图里那样——点开右侧栏看到的是原生「开始」页（guide，一堆入口卡片）。本插件把这张默认页**原位替换**成你配置指定的 tab，例如「文件树」「浏览器」「会话数据诊断」等。只依赖原生 DSH（`ctx.sidebarRight`），不依赖任何其它插件，不修改任何第三方包或 DSH 产物。

## 它做什么 / 不做什么

- **做**：当屏幕上会话的右侧栏里出现原生播种的「开始」页 tab（`guide`）时，用原生 `ctx.sidebarRight.openTab(kind, { replaceTab })` 把它替换成配置的 tab。每个会话只替换一次，之后用户切/关/开 tab 完全不插手。
- **不做**：
  - 不主动展开右边栏——只有用户自己打开、原生播下 guide 时才动；
  - 不在会话已有其它 tab（用户手动放的内容）时插手；
  - 不直接读写 `dsh.sidebar-right.v1.<sessionId>` 布局存储；
  - 不隐藏、删除、改写任何节点；
  - 不依赖 `dsh-claude-style`、`dsh-context`、`better-sidebar`、`session-panel` 或任何第三方插件；
  - 不注册新 tab、不提供 UI 按钮——只是把原生导航控制器指向一个已注册的 kind。

配置的 kind 若未注册（对应插件没装/没启用），`openTab` 会抛错；本插件有限重试后放弃，保留原生「开始」页，界面不会坏。若目标 kind 已经打开，原生会直接聚焦它，不会开重复。

## 配置

在 **desktop profile 的 `cordis.patch.yml`**（`D:\ai-configs\runtime\dsh\profiles\desktop\cordis.patch.yml`）追加一段 id 匹配的 config：

```yaml
- id: dsh-default-sidebar-tab
  name: '@local/dsh-default-sidebar-tab'
  config:
    defaultTab: session-inspector-log   # 默认展示的 tab kind
    enabled: true                       # 设 false 可整体关闭本补丁
```

| 键 | 默认 | 说明 |
|---|---|---|
| `defaultTab` | `session-inspector-log` | 要默认展示的 tab kind（字符串）。见下表。设 `guide` 等于不启用替换。 |
| `enabled` | `true` | `false` 时 client 半不作任何动作。 |

改完 **重启 DSH**（配置在进程启动时注册，仅 Ctrl+R 不够）。

### 常用的 tab kind

| kind | 展示内容（实测标题） | 来源 |
|---|---|---|
| `session-inspector-log` | 会话数据诊断 | 原生 inspector bundle（**默认**） |
| `guide` | 开始页（截图那张入口卡片页） | 原生默认 |
| `files` | 文件 | 原生 |
| `browser` | 浏览器 | 原生 |
| `terminal` | 新建终端 | 原生 |
| `changes-review` | 代码审查和变更 | 原生 |
| `schedule` | 任务管理 | 原生 |
| `plan` | 计划 | 原生 |
| `dsh-context` | 上下文面板 | dsh-context（需已安装） |

配置任意字符串都可；不在表中的 kind 若已由某插件注册同样能生效，未注册则保留开始页。

## 结构

```
lib/
  config.mjs   纯逻辑：配置解析、guide 替换判定、kind 清单（可单测）
  index.mjs    host 半：从 cordis config 读配置，经 webserver/index-inject 注入页面
  client.js    client 半：订阅原生 sidebarRight，检测到 guide tab 时用 replaceTab 替换
cordis.patch.yml  bundle 注册（client-only + 全局配置注入）
tests/         31 项 node --test 单测（含 10 项 client 端到端行为测试）
scripts/       无截图的运行时验证脚本（见下）
```

## 验证（无需 UI 截图）

插件运行时把自证日志写进 `localStorage` 的 `dsh-default-sidebar-tab:diag` 键
（只写自己的键，不碰 `dsh.sidebar-right.*` 布局存储）：

```
loaded → apply → attached → probe → replaced
```

其中 `replaced` 表示原生 `guide` tab 已被换成目标 kind。

原生侧栏布局落在 `localStorage` 的 `dsh.sidebar-right.v1.<sessionId>`，
替换成功后该会话的 `tabs` 里应只剩目标 kind，例如：

```json
{"tab3":{"id":"tab3","kind":"session-inspector-log","title":"会话数据诊断"}}
```

自动化脚本：

```bash
node scripts/page-probe.mjs state   # 读页面注入值 + diag 事件 + 布局
node scripts/page-probe.mjs eval "<js>"  # 在 renderer 里执行表达式
node scripts/cdp-probe.mjs           # 连 Electron CDP 目标
```

`scripts/page-probe.mjs` 需要 DSH 以 `--remote-debugging-port=9333` 启动。

## 安装 / 开发

本目录是 `@ianwusb/dsh-ui-adapter` 的 git 子模块（`default-sidebar-tab/`），自身也是独立 git 仓库。

```bash
node --test tests/*.test.mjs      # 31 项单测
```

作为独立 DSH 插件注册到 profile 的方式与同仓的 `session-panel`、`cs-panel-hider` 一致：在 profile 的 `node_modules/@local/` 下建指向本目录的 junction，并在 profile `package.json` 的 `bundles` 与 `dependencies` 加入 `@local/dsh-default-sidebar-tab`，然后按上文配置 `cordis.patch.yml` 并重启 DSH。

## 授权

GPL-3.0-or-later（见 `LICENSE`）。本插件未复制任何第三方代码，只调用原生 DSH 公开的 `ctx.sidebarRight` 导航 API。
