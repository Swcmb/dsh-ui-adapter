# DSH UI 适配 + 稳定性修复 — 设计文档

> 状态：待复核 | 日期：2026-11-22 | 仓库：`Swcmb/dsh-ui-adapter` | 插件：`@ianwusb/dsh-ui-adapter`

## 1. 背景与现状诊断

当前 DSH 桌面端（`DSH_HOME=D:\ai-configs\runtime\dsh`，profile=`desktop`，进程命令行已确认）同时加载了多套 UI 插件，界面由多个插件叠加而成，存在冲突与重复：

| 界面元素 | 实际来源 | 备注 |
|---|---|---|
| 顶部"上下文"视图 | `dsh-context@0.86.0` | 主区域 `conversation.view` slot |
| **"上下文"侧边栏 tab** | `dsh-context` 注册到 `sidebarRightTabs`（`id/kind='dsh-context'`） | 用原 `ContextView`、`host:'sidebar'`；`openContextSidebar()` 即 `sidebarRight.openTab('dsh-context')` |
| 4 分评分弹窗 | **`dsh-fish`** 的 `session-pressure` 弹层（`.dfish` 命名空间，`pressureOpen` 控制） | dsh-fish client 半，`scoreComposite`/`scoreDiagnostic` 综合分；`position:fixed` 浮层，**无 sidebar tab 能力** |
| 会话详情（环境 / 会话统计 / Token 用量） | **DSH 原生右侧栏**，`dsh-claude-style` 换皮为 "Details" | 被 better-sidebar 的 `guideTakeover` 盖住 |
| 开始页 / 文件 / Git（截图 5、9） | `dsh-better-sidebar@0.32.1` | 右侧栏接管 |
| `btw` 按钮 | `dsh-btw` | 顶部一个 + 底部输入区一个 |
| 顶部渐变、下拉样式 | `dsh-claude-style@0.21.6` | 主题皮肤（45 处 gradient） |
| 赞助卡 | `dsh-context`，`a.lc-card.lc-recom` | ui-adapter 负责隐藏并替换 |
| `@ianwusb/dsh-opencode-compat` | **装错在** `C:\Users\Swcmb\.dsh\profiles\desktop` | DSH 实际跑 D 盘，此副本是死代码 |

**结论（已按 dsh-context 源码核实修正）**：
- "上下文"**本就以 DSH 原生右侧栏 tab 存在**（`dsh-context` 注册 `sidebarRightTabs` 与 `sidebar.right.pane.tab`，用原 `ContextView`、`host:'sidebar'`），**无需重写即可 100% 还原**。
- better-sidebar 通过同一套 `sidebarRightTabs`/`sidebarRight` 注册 tab，**没有替换 tab 系统**；`guideTakeover` 只接管默认开始页，关掉即恢复原生右侧栏。
- 4 分评分面板是 `ContextModal` **portal 浮层**，不是 sidebar tab，无法直接"变成" tab。
- UI-4/6/7 与 UI-1 是样式/隐藏/替换，走 **CSS / DOM 补丁层**（`@ianwusb/dsh-ui-adapter` client 半）。
- 验证采用**程序化 DOM 检查**（CDP 只读 DOM 与计算样式，不截图、不手动点击）。

## 2. 范围

### 本批（交付）
- **UI-1** 赞助卡 → 压缩账本卡
- **UI-3** 会话详情默认显示 + 窄宽度
- **UI-4** 隐藏三个图标（顶部 `btw`、顶部方框、底部 `btw`）
- **UI-6** 模型下拉与 4% 环重叠
- **UI-7** 顶部渐变
- **BUG-1** opencode "unknown tool read/glob"
- **BUG-2** 模型 `hy4-flash-free` 返回空内容

### 后续批次（另立 spec）
- **UI-2** "上下文"进侧边栏（**100% 还原**）：**复用 dsh-context 原生 sidebar tab**，不是重写（详见 3.5）。
- **UI-5** 4 分评分面板进侧边栏（**100% 还原**）：源为 **`dsh-fish`** 的 `session-pressure` 弹层（不是 dsh-context），形态受限（详见 3.5）。

> UI-2 已按 dsh-context 源码确认：它本就注册了 DSH 原生右侧栏 tab，复用即可 100% 还原、零重写。UI-5 则是 dsh-fish 的 `position:fixed` 弹层、无 sidebar tab 能力，"真正嵌入"需改 dsh-fish 源码。

## 3. UI 修复方案

### UI-1 赞助卡 → 压缩账本
- **现状**：选择器 `a.lc-recom` 在 dsh-context 0.86.0 中确认存在（6 处），但 ui-adapter 的替换逻辑未生效。
- **方案**：
  1. **CSS 兜底**：`a.lc-card.lc-recom { display:none !important }` —— 先保证赞助卡被隐藏。
  2. **修复替换逻辑**：在广告位父容器内插入「压缩账本」卡（复用现有 `createSlot`），修正 MutationObserver 在 React 重渲染后节点被移除的重新挂载。
  3. 保留 billion 账本 → `tokenUsage` 投影注入（现有 `writeUsageProjection`）。
- **改动**：`lib/client.js` 的 `SLOT_CSS` 与 `createSlot`。
- **风险**：低。

### UI-3 会话详情默认显示 + 窄宽度
- **现状**：DSH 原生右侧栏即"会话详情"，被 `better-sidebar` 的 `guideTakeover=true` 用开始页覆盖。
- **方案**：
  1. profile `cordis.patch.yml` 的 `better-sidebar` 行 config 增加 `guideTakeover: false`（现有行在 915-918 行，已有 `agentOpenTools: true`）。
  2. 侧边栏宽度：用 CSS 约束右侧栏容器到截图 4 的宽度（目标 280–300px，以截图 4 实测为准）。
- **改动**：`D:\ai-configs\runtime\dsh\profiles\desktop\cordis.patch.yml` + `lib/client.js` CSS。
- **风险**：低。若 `guideTakeover: false` 后原生页不是会话详情，则回退为 CSS 隐藏开始页 + 显示原生详情。

### UI-4 隐藏三个图标
- **现状**：顶部 `btw`、顶部方框图标（`dsh-btw` / claude-style 注入）、底部输入区 `btw`。
- **方案**：CSS 隐藏，选择器在实现时用程序化 DOM 检查确定（优先 `data-*` 属性而非易变 class）。
- **改动**：`lib/client.js` CSS。
- **风险**：低（需选择器准确，避免误伤输入区其他按钮）。

### UI-6 模型下拉与 4% 环重叠
- **现状**：底部模型选择 `Deepseek-V4.1-Flash Default` 与上下文百分比环 `4%` 重叠（claude-style 样式）。
- **方案**：CSS 给两者容器之间补 `gap` / `margin`，确保不重叠。
- **改动**：`lib/client.js` CSS。
- **风险**：低。

### UI-7 顶部渐变
- **现状**：会话窗口上半部分有渐变（claude-style）。
- **方案**：CSS 将顶部渐变层背景覆盖为透明/纯色（`background: none` 或匹配底色）。
- **改动**：`lib/client.js` CSS。
- **风险**：低（需确认不影响正文可读性）。

## 3.5 侧边栏集成（UI-2 / UI-5）确认结论

### UI-2 "上下文"进侧边栏 —— 100% 还原，零重写
**已核实的源码事实**（`bowenliang123/dsh-context` main）：
- `src/client/sidebar.ts`：`SIDEBAR_CONTEXT_ID = SIDEBAR_CONTEXT_KIND = 'dsh-context'`，通过 `ctx.inject(['sidebarRightTabs'])` 注册 tab，并在 `sidebar.right.pane.tab` slot 用 `view({ ...props, host: 'sidebar' })` 渲染——**就是原 `ContextView`**。
- `src/client/viewFocus.ts`：`openContextSidebar(ctx)` = `ctx.get('sidebarRight').openTab('dsh-context')`。
- `contextView.tsx` 的 `ContextViewGate` 处理 `props.host === 'sidebar'`。

**方案**：
1. 关闭 `better-sidebar` 的 `guideTakeover`，恢复 DSH 原生右侧栏。
2. ui-adapter 启动时调用 `ctx.get('sidebarRight')?.openTab('dsh-context')`（或等价触发），使"上下文" tab 打开/默认显示。
3. 顶部"上下文"标签隐藏（CSS）。
4. 右侧栏宽度按截图 4 调窄（CSS）。

**还原度**：100%（同一 `ContextView`、同一 sidebar tab）。**风险**：低；需运行时确认注册未被容器时序吞掉。

### UI-5 评分面板进侧边栏 —— 源为 dsh-fish，形态受限
**已核实的源码事实**（`@ssamurias/dsh-fish@1.0.6`，源码 `mochi-fish/dsh-fish`）：
- 评分面板是 dsh-fish 的 `session-pressure` 弹层（`lib/session-pressure.js` + `lib/client.js`），`.dfish` 命名空间，`pressureOpen` 控制，`position:fixed` 浮层；综合分由 `scoreComposite` / `scoreDiagnostic` 计算。
- dsh-fish client 半**没有 sidebar tab 能力**（无 `sidebarRightTabs` / `registerTab`），是"设置 → 鱼"的一节 + 主界面"胶囊"点开的弹层。
- 与"上下文"（dsh-context 原生 sidebar tab）性质完全不同：**不能靠 ui-adapter 配置/复用变成侧边栏 tab**。

**可选路径**（按 100% 还原程度排序）：
- **A（已选）. 改 dsh-fish 源码**：`PressureChip`（`lib/client.js` @442074）用原生 `<dialog>.showModal()` 渲染评分弹层。改法：① 把 dialog 内内容抽成 `PressurePanel` 组件（去掉 modal 语义、改为流式面板，`usePressure` 常开）；② `apply` 里 `ctx.inject(['sidebarRightTabs','sidebarRight'])` 注册一个 tab，component = `PressurePanel`；③ 保留顶部 `PressureChip` 胶囊不变。→ 100% 还原 + 真正嵌入；改动在 dsh-fish fork（`lib/*.js` 本身就是可读源码，无 build 步骤）。
- **B. DOM 搬运**：把 `.dfish` 弹层节点迁入侧边栏容器 → 内容 100%，但 dsh-fish 自管 `pressureOpen`/`fixed` 定位，重渲染易错位，脆弱。
- **C. 入口按钮**：侧边栏放按钮，照常打开原弹层 → 内容 100%、最稳，但仍是浮层。

**已定（2026-11-22）**：UI-5 取 **A**——改 dsh-fish 源码，给 `session-pressure` 注册 `sidebarRightTabs` tab，复用同一渲染函数，实现 100% 还原 + 真正嵌入。需维护 dsh-fish fork。

## 4. Bug 修复方案

### BUG-1 opencode "unknown tool read/glob" —— 已定案（2026-11-22 三轮 dry-run 实测）

**报错来源**：DSH 自己的工具流水线（asar 内有同格式示例 `unknown tool "web_search"`），不是 billion-context，也不是网络。

**实测事实（`DSH_UA_ALIAS_DRY=1` 空注册，三次重启一致）**：

| 名字 | 主场 agent 作用域内是否存在 | 来源 |
|---|---|---|
| `read` / `glob` / `grep` | **存在**，agent 创建后约 5–6 秒到位 | 内核官方工具 |
| `bash` / `ls` | **不存在** | 内核无此名；命令工具是 `ops_bash` / `pwsh` |
| `ops_inspect_local_file` / `ops_glob` / `ops_grep` / `ops_bash` | 存在（同一作用域，晚于 agent 创建） | `dsh-ops@0.5.5`，注册在 agent 自己的层 |

日志证据：`native:{read:true,glob:true,grep:true,bash:false,ls:false}`；`resolved`（委托目标）全 `true`。

**因此报错窗口是**：agent 刚创建、官方工具与 `ops_*` 尚未发布的那几秒，或落在没有官方工具的子作用域。模型在这个窗口发出 `read`，DSH 就判 `unknown tool`。

**`replaceTools` 不是解法（重要）**：`dsh-ops` 的“替换”是 `tools.restrict({ deny: [...] })` —— **只把官方名字藏起来，不会让 `ops_*` 接管这些名字**。配了它，`read` 会从工具表消失，模型再发 `read` 必然 `unknown tool`，比现状更差。当前 profile 也没有 `dsh-ops-hide-official` 行（`cordis.yml` 为空 entry 列表），即隐藏未启用，保持原状。

**修复（做进插件，不改第三方包）**：`lib/tool-aliases.mjs`

| 别名 | 委托目标 | 实际作用 |
|---|---|---|
| `read` | `ops_inspect_local_file` | 兜底（官方名到位后内核判重，别名自动让位） |
| `glob` | `ops_glob` | 同上 |
| `grep` | `ops_grep` | 同上 |
| `bash` | `ops_bash` | **真实补充**（内核无 `bash`） |
| `ls` / `list` | `ops_glob` | **真实补充**（内核无 `ls`） |

- **委托不重写**：别名 `execute` 用 `tools.get(target, exec.agent, exec.toolSet)`（再退 `tools.executable`）拿真实定义，调它的 `execute(mappedArgs, exec)`。校验、沙箱、审批、渲染仍归 DSH。
- **双注册层**：`agent/created` 时经 `agent.ctx.plugin(child => child.inject(['tools'], …))` 进 agent 本层（`restrict` 只遮继承的全局名），并全局注册一层兜底；同层重名由内核判重，插件只记日志跳过。


**保留 `absorb`**：`C:\Users\Swcmb\.config\billion-context\billion-context.json` 的 `compress.absorb.enabled` 已恢复为 `true`；备份 `billion-context.json.bak-before-absorb` 仅作历史。

> 说明：早前"关掉 absorb 消除报错"只是**相关而非因果**——那一次页面里 `unknown tool` 归零，是因为其间会话被重载，而不是 absorb 修好了它。


### BUG-2 模型 `hy4-flash-free` 返回空内容 —— 已定案（2026-11-22 实测）

- **根因**：`agent-default-model.reasoningEffort: apex` 不是 provider 接受的值。`opencode2api`（`http://127.0.0.1:8080/v1`）支持的取值是 `minimal/low/medium/high/xhigh/max`。
- **实测对比**（同一 prompt 直打 provider）：
  - `reasoning_effort: "apex"` → `400001 request invalid`（被上游拒绝，DSH 侧表现为 completed 无 content）
  - `reasoning_effort: "max"` → 正常返回文本
- **修复**：`cordis.patch.yml` 的 `agent-default-model.reasoningEffort` 由 `apex` 改为 `max`。
- **证据**：修复后页面内仅剩历史消息里的 `no content`（时间戳 `00:32`/`00:41`、"已重试 5/5"），无新增。
- **附带发现**：`billion-context` 的 bundle patch 已把 `EMPTY_RESPONSE` 加进 `llm-deepseek` 的重试码，所以空响应会重试 5 次再失败——这也是日志里"已重试 5/5"的来源。

## 5. 架构与文件改动

| 文件 | 改动 |
|---|---|
| `D:\dsh-ui-adapter\lib\client.js` | 新增 `UI_PATCH_CSS`（UI-4/6/7 + UI-1 兜底）注入；修复 `createSlot`（UI-1）；UI-3 宽度 CSS |
| `D:\dsh-ui-adapter\lib\tool-aliases.mjs`（新增） | BUG-1：opencode 风格工具别名 `read/glob/grep/bash/ls/list`，委托到 `ops_*`，双注册层 |
| `D:\dsh-ui-adapter\lib\index.js` | `apply` 里调用 `registerToolAliases(ctx)` |
| `D:\ai-configs\runtime\dsh\profiles\desktop\cordis.patch.yml` | `better-sidebar.config.guideTakeover=false`；`agent-default-model.reasoningEffort: apex → max`（BUG-2） |
| `C:\Users\Swcmb\.config\billion-context\billion-context.json` | `compress.absorb.enabled` 保持 `true`（不关） |

> 设计原则：补丁 CSS 集中在 `lib/client.js`（或独立 `css-patches.js`），以 `data-*` 选择器为主、class 为辅；所有规则加 `!important` 以避免被主题覆盖；不修改任何第三方插件源码。

## 6. 验证方式（程序化 DOM 检查）

不截图、不手动点击。启动 DSH 后通过 CDP 只读检查：

1. **UI-1**：断言 `a.lc-recom` 计算样式 `display:none`；「压缩账本」卡节点存在。
2. **UI-3**：断言 `guideTakeover=false` 生效（开始页不在默认视图）；右侧栏宽度在目标范围。
3. **UI-4**：断言三个图标节点 `display:none` 或 `visibility:hidden`。
4. **UI-6**：断言下拉与 4% 环 `getBoundingClientRect` 不重叠。
5. **UI-7**：断言顶部渐变层背景为 `none`/透明。
6. **BUG-1/2**：检查 host 日志中 `unknown tool` 与 `no content` 不再出现。

另加单元测试：对补丁 CSS 字符串/选择器做断言（`node --test`），确保关键规则存在。

## 7. 风险与回退

- 选择器依赖运行时 DOM，若插件升级导致类名变化，补丁失效但**不会破坏页面**（CSS 只隐藏/覆盖，DOM 只插入）。
- `guideTakeover=false` 可一键回退（改回 `true`）。
- BUG-1/2 的诊断结论决定修复分支，若诊断不足则不盲目改第三方包。
- 所有改动在实现后重启 DSH 并由程序化 DOM 检查 + 日志确认。

## 8. 交付

1. `@ianwusb/dsh-ui-adapter` 版本号递增，改动提交并 push 到 `Swcmb/dsh-ui-adapter`。
2. profile 配置改动记录在案（不只改本地，说明如何回退）。
3. 验证报告：程序化 DOM 检查结果 + host 日志片段。
4. UI-2 / UI-5 另立 spec。
