# 2026-11-23 融合实机验证记录（session-panel）

分支：`agent/fuse-kit-into-root`
融合 commit：`b6537e94f8e40f610a25510650e25083ccc2a708`（`refactor: fuse session-panel into root`）
验证对象：`session-panel` 平铺进根后的第一个增量（adapter + session-panel 两个模块）
结论：**DONE_WITH_CONCERNS** —— host 半与安装注册全部通过；client 半的统一 `import` 入口在本次实机启动中未产生任何执行证据，命中设计文档 §8 风险 A。按任务指令**未**执行 IIFE 内联降级（那是 Task 3 的降级路径）。

---

## 1. 重装流程（§7.2）

### 1.1 install --dry-run

```
node scripts/install.mjs --profile "D:/ai-configs/runtime/dsh/profiles/desktop" --dry-run
```

输出要点：

```
[install] link    : ...\profiles\desktop\node_modules\@ianwusb\dsh-ui-adapter -> D:\dsh-ui-adapter
[install] dep     : link:D:/dsh-ui-adapter
[install] bundles : listed
[install] already registered, nothing to do
```

结论：**PASS**（注册状态已就位，无需改动 profile；未执行且禁止 `--undo`）。

### 1.2 verify --compose

```
node scripts/verify.mjs --profile "D:/ai-configs/runtime/dsh/profiles/desktop" --compose
```

结果：**3/8 PASS**，5 项 FAIL。逐项归因如下（不做掩盖）：

| 检查 | 结果 | 原因 |
|---|---|---|
| profile registers the bundle | PASS | `link:D:/dsh-ui-adapter`，bundle #46/54 |
| installed package resolves | PASS | `lib/index.js` + `lib/client.js` 均解析到本仓库 |
| cordis.patch.yml declares the host row | FAIL | 校验器要求 `id == '@ianwusb/dsh-ui-adapter'`，而文件（融合前即如此，brief 明确要求保留）为 `id: dsh-ui-adapter`。`git show c41ddf3:cordis.patch.yml` 已确认属改动前既有不一致。 |
| host half imports and publishes config | FAIL | 校验器要求 `name == '@ianwusb/dsh-ui-adapter'`，而 `lib/index.js`（融合前即如此，brief Step 4 逐字指定）导出 `name = 'dsh-ui-adapter'`。属改动前既有不一致。 |
| host half registers the same-origin ledger routes | FAIL | 校验器从 `lib/client.js` 读 `'/__ctx-bili/sessions'` / `ctx.inject(['sessions']`；这些字符串现位于按 brief Step 3 拆分出的 `lib/client-adapter.js`。 |
| client bundle hides the ad and mounts the switch | FAIL | 校验器用 `vm.runInContext` 以脚本方式执行 `lib/client.js`；统一入口为 `import` 语句，报 `SyntaxError: Cannot use import statement outside a module`。
| billion-context context tab disabled | PASS | `~/.config/billion-context/billion-context.json` 的 `dsh.contextTab=false` |
| dsh --dump-config composes the row | FAIL | 本机 `dsh` CLI 不在 PATH（`'dsh' is not recognized...`），属环境限制。 |

说明：本地测试 `tests/client.test.mjs` 同样以 `vm.runInContext` 读 `lib/client.js`，为保证 Step 6「测试全绿」该断言路径已改为 `lib/client-adapter.js`（adapter IIFE 的新位置）；`scripts/verify.mjs` 未改动， FAIL 如实保留。

### 1.3 DSH 重启

PowerShell，先清空 `ELECTRON_RUN_AS_NODE`（原为 `1`）与 `NODE_OPTIONS`（原为 WorkBuddy 注入的 `--require=...node-language-shim.cjs`）：

1. `CloseMainWindow()`：`MainWindowTitle` 非空者仅 PID 34772（`DeepSeek Harness`）。
2. 等待 15s 后仍有 5 个残留进程（13200 / 27224 / 29608 / 34772 / 35692），按 §7.2 执行 `Stop-Process -Force`。
3. `Start-Process -FilePath "D:\ProgramFiles\DSH\DeepSeek Harness.exe" -WorkingDirectory "D:\ProgramFiles\DSH"`。
4. 等待 28s。启动输出无 error 级行；窗口标题 `跟大肥鱼说话 — DeepSeek Harness`；新进程树 PID `23192,33148,44752,45220,51416`，其中 PID 51416 持有监听端口。

结论：**PASS**（重启流程完成，环境变量已清，未出现 Electron 当纯 Node 静默 exit 0 的情况）。

---

## 2. 实机验证逐项（§7.3）

### 2.1 端口选择

重启后 DSH 监听：`127.0.0.1:9230`（inspector CDP）、`172.27.16.1:49768`、`127.0.0.1:60746`（Web/server）。
按要求**未使用 17321**。探测确认 `GET /__ctx-bili/status` 在 **60746** 返回 200；9230 返回 404。

> 端口每次启动会变；本次 Web 端口为 60746，上一轮为 52656。

### 2.2 HTTP 端点

```
curl http://127.0.0.1:60746/__ctx-bili/status
HTTP 200
{"origin":"http://127.0.0.1:18787","pid":19864,"live":true,"source":"instance-file","hits":{"/__ctx-bili/sessions":0,"/__ctx-bili/status":1,"/__ctx-bili/diag":0}}
```

结论：**PASS**（同源路由由 host 半注册并可用；`hits` 从 0 起算说明是新进程）。

### 2.3 .host.log

新 host PID 51416 的日志：

```
2026-11-23T03:13:59.938Z pid=51416 apply:enter {... "webServerProp":"object" ...}
2026-11-23T03:13:59.938Z pid=51416 bind:index-inject
2026-11-23T03:13:59.939Z pid=51416 bind:routes-ok {"origin":"http://127.0.0.1:18787"}
2026-11-23T03:13:59.940Z pid=51416 bind:effect-owned
2026-11-23T03:13:59.940Z pid=51416 apply:exit
2026-11-23T03:14:40.547Z pid=51416 route:hit {"route":"/__ctx-bili/status","status":200,"hits":1}
```

结论：**PASS**（`bind:routes-ok` 存在；host 半聚合 `applyAdapter` + `applySessionPanel` 正常进入/退出）。

### 2.4 session-panel host diag 路由

session-panel host 的 `DIAG_FILE` 指向仓库根 `.diag.log`；重启后该文件出现 63 条新事件（最早 `t=1795403668254`，约 03:14:28Z），说明 `/__dsh-session-panel/diag` 路由已注册且可写。

结论：**PASS**（host 半 session-panel 模块已加载）。

### 2.5 `sidebarRightTabs` 注册表含 `dsh-session-details`

**受限通过（间接证据）**：

- CDP 只能连到 `ws://127.0.0.1:9230/devtools/page/de6e02e9-...`，其 `title=DeepSeek Harness Host`、描述为 `Experimental cross-realm Inspector target`，`Runtime.evaluate` 返回 `document === undefined`、相关全局为空 —— **这是 host realm，不是 renderer 页面，无法做真 DOM / 注册表断言**。
- `DevToolsActivePort` 指向的 9333 浏览器级 CDP 在本机连接被拒（`/json`、`/json/version` 均无响应，WS 连接失败）。
- 间接证据：仍独立安装的 `default-sidebar-tab` client 通过共享 diag 通道上报的 `runtime-probe` 事件中，`openTabs` 含 `{"kind":"dsh-session-details"}`（多条），`attached` 事件为 `{"defaultTab":"dsh-session-details","enabled":true,...}`。这说明该 kind 在运行时确实出现在右栏 tab 列表里。

结论：**NEEDS_CONTEXT** —— 注册表含 `dsh-session-details` 有间接证据，但未能按要求完成直接 DOM/注册表检查。

### 2.6 DSH console 无 error

**未能完成**：本机没有可读的 renderer console 日志文件（本次启动未在 `...\@deepseek-ai\dsh-desktop\logs` 产生新日志；`dsh-start.err.log` / `dsh-start.out.log` 为空）；9230 的 host-realm CDP 开启 `Runtime.enable` + `Log.enable` 后 2.5s 内无 `exceptionThrown` / `entryAdded` 事件，但那不是 renderer。启动输出（stdout）也未见 error 行。

结论：**NEEDS_CONTEXT**（无法证明 renderer console 无 error）。

### 2.7 关键异常：client 半未产生任何执行证据（核心 concern）

重启并等待后，对**新 PID 51416** 统计：

```
route:hit /__ctx-bili/status : 1   （由本次 curl 触发）
route:hit /__ctx-bili/sessions: 0
route:hit /__ctx-bili/diag   : 0
client:diag                  : 0
```

同时 `.diag.log` 的 63 条新事件，其 stage 分布为：

```
loaded:1, apply:1, rightbar-width-unavailable:1, rightbar-width-set:1,
attached:1, runtime-probe:56, probe:2
```

这些 stage 经源码核对**全部来自仍独立安装的 `default-sidebar-tab` client**（`mark('loaded')`、`mark('attached')`、`mark('probe')`、`mark('runtime-probe')` 等）；
而 `lib/client-session-panel.js` 自身的 diag stage（`apply`、`registered`、`panel-mounted`、`state-probe`、`guide-entries` 等）**一条都没有**。

对照：上一轮（旧进程 PID 29608）在相同窗口下有持续的 `route:hit` 与 `client:diag`，adapter client 与 session-panel client 均正常轮询。

判断：按 brief Step 3 写成的 `lib/client.js`（仅两条静态 `import`）**未被 DSH client loader 执行**，或 `import ./client-adapter.js` / `./client-session-panel.js` 在 `dsh-app://` 注入环境下无法解析；这命中设计文档 §8 风险 A（四个 client 模块的静态 import 未被 DSH 执行）。
按任务指令：**未**将 IIFE 内联进 `lib/client.js`（该降级路径属于 Task 3），仅在此如实记录为 BLOCKED/DONE_WITH_CONCERNS。

---

## 3. 汇总

| 项 | 结果 |
|---|---|
| install --dry-run | PASS |
| verify --compose | FAIL（3/8；2 项改动前既有不一致、2 项统一入口预期内、1 项 CLI 缺失） |
| DSH 重启 | PASS |
| HTTP `/__ctx-bili/status` 200 | PASS（端口 60746） |
| `.host.log` `bind:routes-ok` | PASS |
| session-panel host diag 路由 | PASS |
| `sidebarRightTabs` 直接 DOM 检查 | NEEDS_CONTEXT（仅间接证据） |
| DSH console 无 error | NEEDS_CONTEXT（无可读 renderer console） |
| **client 半实际加载** | **FAIL / 风险 A 命中**（adapter 与 session-panel client 均无执行证据） |

整体状态：**DONE_WITH_CONCERNS**。
融合实现、本地测试（32/32）与融合提交均已完成；host 侧与 HTTP 侧验证通过；client 侧统一 `import` 入口在实机上未生效，留待 Task 3 的降级路径处理。

---

## 4. Task 1 client 修复：单模块 classic-script 聚合（Risk A 已解除）

### 4.1 根因（两层）

1. **第一层**：DSH 把 `lib/client.js` 作为 **classic script** 注入渲染进程，原统一入口的静态 `import` 不会执行（`scripts/verify.mjs` 的 `vm.runInContext` 亦印证）。
2. **第二层（reviewer 发现）**：即使把两个 IIFE 内联为两次 `window.__ModuleLoader__.load(...)`，DSH 也**不会激活第二个模块**。从 DSH 内置 `app.asar` 的 `createClientModuleSystem` / `parseBootManifest` 可见：boot graph 每个已安装 bundle 只有一个 entry，`ClientModuleSystem` 按 manifest 的 module id 决定激活；同一脚本内额外 `load()` 的 id 只会被登记进 factory 表，不会进入激活集。因此 `@local/dsh-session-panel` 从未执行其 `apply`，先前记录的 `loaded` / `apply` / `attached` / `probe` / `runtime-probe` 其实全部来自**仍独立安装的 default-sidebar-tab**（它复用 `/__dsh-session-panel/diag` 通道），属错误归因。

### 4.2 最终修复形态

`lib/client.js` 注册**唯一一个**模块 `id: '@ianwusb/dsh-ui-adapter'`（与 bundle id 一致，必定被激活）。其 factory 内用局部 `const window = { __ModuleLoader__: { load: (d) => descriptors.push(d) } }` 遮蔽全局 `window`，再逐字内联 adapter 与 session-panel 两个 IIFE（源码零改动），于是两个 `load()` 都落到局部收集器，不产生额外模块 id。factory 末尾：

- 依次调用各 descriptor 的 `factory(require)` 完成 materialization；
- 合并 `inject` 为 `['slots', 'locale']`；
- 返回统一 `apply(ctx)`，依次调用两个插件的 `apply`；
- 写入 `globalThis.__DSH_UI_ADAPTER_CLIENT_MODULES__`（仅为测试自证，不影响模块面）。

### 4.3 本地验证（实跑）

```
node --test tests/*.test.mjs     -> 33 tests / 33 pass / 0 fail
node scripts/verify.mjs --profile "D:/ai-configs/runtime/dsh/profiles/desktop"
                                 -> 7/7 PASS
```
`--compose` 仍受限于本机无 `dsh` CLI（环境限制，非代码缺陷）。

### 4.4 DSH 干净重启与实机证据

清 `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS` → `CloseMainWindow()` → 15s → `Stop-Process -Force` → `Start-Process` → 32s。

- 新 PID：`39080, 43876, 54704, 54780, 55828`；Web 端口 `53564`；CDP `9230`。
- `GET /__ctx-bili/status` → 200；`hits.sessions=4, status=2, diag=1`。
- `.host.log`（新 PID）：`apply:enter`、`bind:routes-ok`、三条 `/__ctx-bili/*` 的 `route:hit`、`client:diag`。
- `.diag.log` 中出现**仅 session-panel 会产生**的 stage（已与 default-sidebar-tab 的 stage 集合区分）：

  | stage | 次数 | 说明 |
  |---|---|---|
  | `registered` | 4 | `sidebarRightTabs` 注册 `dsh-session-details` 成功 |
  | `header-toggle-registered` | 4 | 头部开关注册成功 |
  | `sidebar-right-injected` | 4 | 原生导航控制器注入 |
  | `guide-entries` | 4 | 入口引导注册 |
  | `state-probe` | 78 | `withDetails=3, detailsActiveCount=3, guideReplacedCount=3`，`kinds=['dsh-session-details']` |

  这证明融合后的 session-panel client 已真实执行并注册 tab 类型；此前错误归因已作废。

### 4.4.1 reviewer 追加的 Important 问题（已修复）

首版聚合 factory 用局部 `const window = { __ModuleLoader__: { load } }` 遮蔽真实 `window`，会让内联 factory 里的 `window.addEventListener` / `innerWidth` / `localStorage` 等真实 API 失效（账本面板与 state-probe 依赖它们）。已改为**只临时替换 `window.__ModuleLoader__` 并在 `finally` 中恢复**，真实 `window` 全程不动。修复后再次干净重启复验：PID `39080, 43876, 54704, 54780, 55828`，端口 `53564`，`state-probe` 78 次且仍带完整 DOM 快照（`withDetails=3 / detailsActiveCount=3 / guideReplacedCount=3`），adapter `client:diag` 正常。

### 4.5 结论与限制

- adapter client：PASS；session-panel client：PASS；风险 A：**已解除**。
- renderer DOM/console 仍无法直连（CDP 只能到 host realm）；`sidebarRightTabs` 由上述 session-panel 专属 stage 与 `state-probe` 快照证明，不再依赖错误归因。
- `--compose` 因 `dsh` CLI 缺失未执行。

---

## 5. Task 2：融合 cs-panel-hider（第二个插件）

分支：`agent/fuse-kit-into-root`；BASE `7e06bd7`。
融合 commit：`ef1b722d8bdf2069d6dcab8f1c479da923410567`（`refactor: fuse cs-panel-hider into root`）。
结论：**DONE** —— 本地测试全绿、verify 7/7、重启后 cs-panel-hider 与 adapter / session-panel 均取得直接证据。

### 5.1 实现要点

- `lib/client-cs-panel-hider.js`、`lib/host-cs-panel-hider.mjs`、`LICENSE-cs-panel-hider`、
  `tests/cs-panel-hider-mock-client.mjs` 从 `dsh-session-panel-kit/cs-panel-hider/` 平铺到根；
  该子目录已删除。
- `lib/client.js` 仍只有一个顶层 `window.__ModuleLoader__.load({ id: '@ianwusb/dsh-ui-adapter', factory })`；
  cs-panel-hider IIFE 原样内联在 session-panel IIFE 之后、footer 之前。factory 内只临时替换
  `window.__ModuleLoader__` 并在 `finally` 恢复，真实 `window` 未被遮蔽；footer 自动组合三个
  descriptor 的 `apply` / `inject` 并写入 `__DSH_UI_ADAPTER_CLIENT_MODULES__`。
- `lib/index.js` 增加 `applyCsPanelHider(ctx)`，host 导出名由 `apply` 改为
  `applyCsPanelHider`；`inject` 仍为 `['webServer']`，`cordis.patch.yml` 未新增行。
- `package.json` 增加 `./client-cs-panel-hider` export 与 `LICENSE-cs-panel-hider`；
  `dsh.client.inject` 未变（cs-panel-hider 的 client inject 为 `[]`）。
- 本地测试相应更新：`tests/client.test.mjs` 的自证数组断言增加第三个 id，并新增
  cs-panel-hider CSS 注入断言；独立 mock 改读平铺后的 `lib/client-cs-panel-hider.js`
  并补 `setInterval` stub。

### 5.2 本地验证（实跑输出）

```
node --test tests/*.test.mjs
  -> # tests 34 / # pass 34 / # fail 0
node tests/cs-panel-hider-mock-client.mjs
  -> exit 0; {"moduleId":"@local/dsh-cs-panel-hider","inject":[],
              "cssBytes":438,"flagCleaned":true,"ok":true}
node scripts/install.mjs --profile "D:/ai-configs/runtime/dsh/profiles/desktop" --dry-run
  -> "[install] already registered, nothing to do"
node scripts/verify.mjs --profile "D:/ai-configs/runtime/dsh/profiles/desktop"
  -> 7/7 checks passed
     host routes: /__ctx-bili/sessions · /__ctx-bili/status · /__ctx-bili/diag ·
                  /__dsh-session-panel/diag · /__dsh-session-panel ·
                  /__dsh-cs-panel-hider/diag
```

`--compose` 本次未执行（沿用 Task 1 记录：本机 `dsh` CLI 不在 PATH）。

### 5.3 profile 清理

- 备份：`D:/ai-configs/runtime/dsh/profiles/desktop/package.json.bak-before-cs-fusion`（4248 bytes）。
- 从 `dependencies` 删除 `@local/dsh-cs-panel-hider`（原指向已删除的 kit 子目录）与失效的
  `@local/dsh-session-panel`。
- `dsh.profile.bundles` 中这两项在清理时**已经不存在**（Task 1 已移除），脚本仍按幂等方式过滤；
  最终 `@local` 仅剩 `@local/dsh-default-sidebar-tab`（依赖与 bundle 均在），留给 Task 3。
- 删除 junction：`node_modules/@local/dsh-cs-panel-hider` 与
  `node_modules/@local/dsh-session-panel`（`lstat().isSymbolicLink() === true`，用 `unlinkSync`
  移除，未触及目标目录内容）。未执行 `install.mjs --undo`。

### 5.4 DSH 重启

PowerShell，先清空 `ELECTRON_RUN_AS_NODE`（原 `1`）与 `NODE_OPTIONS`（原 WorkBuddy 的
`--require=...node-language-shim.cjs`），清空后两者均为空。

- 旧 PID：`39080, 43876, 54704, 54780, 55828`；CloseMainWindow 目标是 43876
  （`跟大肥鱼说话 — DeepSeek Harness`）。
- 等待 15s 后五个进程仍残留，逐个 `Stop-Process -Force`；确认无残留后 `Start-Process`，
  再等待 28s。
- 新 PID：`2632, 16012, 49456, 56796, 57196`；监听端口 `127.0.0.1:59806`（Web，owner 16012）、
  `172.27.16.1:50930`、`127.0.0.1:9230`（inspector CDP）。启动输出无 error 级行。

### 5.5 HTTP 端点（端口 59806）

```
GET /__ctx-bili/status            -> 200
{"origin":"http://127.0.0.1:18787","pid":19864,"live":true,"source":"instance-file",
 "hits":{"/__ctx-bili/sessions":4,"/__ctx-bili/status":2,"/__ctx-bili/diag":1}}
GET /__dsh-cs-panel-hider/diag    -> 200 {"ok":true,"accepted":0}
GET /__ctx-bili/sessions          -> 200
GET /__ctx-bili/diag              -> 204（该路由仅接受 POST）
```

### 5.6 cs-panel-hider 实机证据（`__dsh-cs-panel-hider/diag` → 仓库根 `.diag.log`）

日志基线 1270 行，重启后新增行中统计：

| stage | 次数 | 证据 |
|---|---|---|
| `style-installed` | 1 | `2026-11-23T03:53:53.768Z {"styleId":"dsh-cs-panel-hider-style"}` |
| `hide-probe` | 2 | 见下方 computed style 断言 |
| `hide-probe-failed` | 0 | 无异常 |

两次 `hide-probe` 原文：

```
2026-11-23T03:53:53.788Z {"styleInstalled":true,"styleHasRule":true,
  "panel":{"label":"panel","present":true,"display":"none","visibility":"hidden","hidden":true},
  "toggle":{"label":"toggle","present":false,"display":null,"visibility":null,"hidden":null},
  "bodyPanelFlag":false}
2026-11-23T03:53:57.811Z {"styleInstalled":true,"styleHasRule":true,
  "panel":{"label":"panel","present":true,"display":"none","visibility":"hidden","hidden":true},
  "toggle":{"label":"toggle","present":true,"display":"none","visibility":"hidden","hidden":true},
  "bodyPanelFlag":false}
```

这是 client 直接读取 computed style 的断言：`.dsh-claude-details-root` 与
`.dsh-claude-session-panel-button` 在目标节点存在时均为 `display:none` / `visibility:hidden`，
`body[data-dsh-claude-session-panel]` 已清除。说明 dsh-claude-style 确实安装且节点被 CSS 隐藏，
且 `POST /__dsh-cs-panel-hider/diag` 落盘通道真实可用。

### 5.7 回归证据

- `.host.log` 新 PID 16012：`apply:enter` → `bind:index-inject` → `bind:routes-ok` →
  `bind:effect-owned` → `apply:exit`（03:53:35Z），证明统一 host 聚合三个模块后正常进入/退出。
- adapter 路由命中（PID 16012）：`/__ctx-bili/status` `hits:1`→`3`、`/__ctx-bili/sessions`
  `hits:1`→`9`、`/__ctx-bili/diag` `hits:1`→`3`，全部 > 0。
- adapter `client:diag`（PID 16012）：首个上报为会话尚未就绪时的
  `match:"fallback", shim:"none"`；03:54:28.779Z 转为
  `{"via":"runtime-inject","sessions":"ok","id":"session-723f62c7-e057-42fe-97c7-f0f0c71808e3",
   "shim":"active","match":"exact","sessionCount":154,"usage":true}`，垫片正常接管。
- session-panel 专属 stage（按内容区分于 default-sidebar-tab 的 `loaded`/`attached`/`probe`/
  `runtime-probe`）：`registered`×1（`kind:"dsh-session-details"`, `tabId:"@local/dsh-session-panel"`）、
  `header-toggle-registered`×1、`sidebar-right-injected`×1（`hasToggle:true`）、
  `guide-entries`×1（`mineCount:1`, `kindResolvable:true`）、`state-probe`×11
  （`withDetails:3`, `detailsActiveCount:3`, `guideReplacedCount:3`）。
  证明第三个 IIFE 内联后 session-panel 仍真实执行。

### 5.8 限制与关注

- `--compose` 未执行：本机 `dsh` CLI 缺失，属环境限制。
- renderer console / 直接 DOM 检查仍不可用（CDP 只暴露 host realm，沿用 Task 1 记录）；
  本次 CSS 隐藏结论来自 client 自身在真实页面读取 computed style 的 diag 断言，不依赖截图。
- 顶部开关 `.dsh-claude-session-panel-button` 在首次 probe 时不存在、第二次出现且已被隐藏，
  属 dsh-claude-style 自身渲染时序，不影响结论。

## 6. Task 3：融合 default-sidebar-tab（第四个插件）

BASE `7ac71af`；第一次提交 `c1a509800c2f4d125f2bb8049fff85d8a60bfc48`
（`refactor: fuse default-sidebar-tab into root`）。

### 6.1 实现要点

- `lib/client-default-sidebar-tab.js`、`lib/host-default-sidebar-tab.mjs`、`lib/config.mjs`、
  `LICENSE-default-sidebar-tab`、`scripts/cdp-probe.mjs`、`scripts/page-probe.mjs` 及三项
  测试平铺到仓库根；测试文件名加 `default-sidebar-tab-` 前缀避免与既有测试重名，内部
  路径改指向新文件。测试 mock 补 `setInterval` / `clearInterval`（client 用只读轮询探针），
  契约测试改为校验融合根包形态。
- `lib/client.js` 顶层仍**只有一个** `window.__ModuleLoader__.load({id:'@ianwusb/dsh-ui-adapter'})`；
  第四个 IIFE 内联在 factory 内、cs-panel-hider 之后、footer 之前。`window` 未被遮蔽：
  factory 只临时替换 `window.__ModuleLoader__` 并在 `finally` 恢复。
- `lib/index.js` 追加 `applyDefaultSidebarTab(ctx, rawConfig)`；host 导出名由 `apply` 改为
  `applyDefaultSidebarTab`。`package.json` 新增 `./client-default-sidebar-tab`、`./config`
  导出与 `LICENSE-default-sidebar-tab`；`cordis.patch.yml` 未改（单一 insert）。
- `TAB_KIND`（session-panel）与 `DEFAULT_TAB`（default-sidebar-tab / `lib/config.mjs`）均为
  `dsh-session-details`，`grep` 校验一致。

### 6.2 本地验证（实跑输出）

- `node --test tests/*.test.mjs`：**65 tests / 65 pass / 0 fail**。
- `node --test tests/default-sidebar-tab-client-behavior.test.mjs`：9/9 pass，覆盖
  `loaded` → `attached` → `replaced`（`replaceTab` 原位替换、只处理当前会话、错误重试、
  `enabled:false` 不动作）。
- `tests/client.test.mjs` 断言 `__DSH_UI_ADAPTER_CLIENT_MODULES__`
  = `['@ianwusb/dsh-ui-adapter','@local/dsh-session-panel','@local/dsh-cs-panel-hider','@local/dsh-default-sidebar-tab']`，
  且 `descriptors.length === 1`（无第二个顶层 `load()`）。
- `node scripts/install.mjs --profile ... --dry-run` → `already registered, nothing to do`。
- `node scripts/verify.mjs --profile ...` → **7/7 checks passed**（`--compose` 的 `dsh` CLI
  本机不可用，未运行）。

### 6.3 profile 清理与 kit 删除

- 备份 `D:/ai-configs/runtime/dsh/profiles/desktop/package.json` → `package.json.bak-before-fusion-cleanup`。
- 仅剩的 `@local/dsh-default-sidebar-tab` 已从 `dependencies` 与 `dsh.profile.bundles` 移除；
  未使用 `install.mjs --undo`。`node_modules/@local/dsh-default-sidebar-tab` junction
  以 `fsutil reparsepoint delete` + 删除空壳的方式移除，未触及目标目录内容。
- `dsh-session-panel-kit/` 的 16 个 git 跟踪文件已 `git rm -r` 删除，`.host.log` 残留与空子目录
  已清除；`git submodule status` 为空。**遗留**：最外层空目录 `dsh-session-panel-kit/`
  因 Typora（PID 3716，打开着已删除的 kit README.md）持有句柄而无法移除；目录内已无任何文件，
  git 视角该子模块已完全消失（详见 6.6）。

### 6.4 DSH 重启

PowerShell 中先清空 `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS`（两者均为空）→
CloseMainWindow（PID 2632）→ 15s 后 5 个旧进程仍残留 → `Stop-Process -Force` →
`Start-Process -FilePath 'D:\ProgramFiles\DSH\DeepSeek Harness.exe' -WorkingDirectory 'D:\ProgramFiles\DSH'`
→ 28s。新 PID：`55316, 45000, 54788, 12888, 46980`；Web `127.0.0.1:57672`（owner 46980）、
inspector CDP `127.0.0.1:9230`、`172.27.16.1:57725`。启动输出无 error 级行。

### 6.5 四插件实机证据（重启后，统一 PID 46980）

> **本节初版存在三处证据缺陷，已由主代理在 Task 4 复核中撤回并重写（见 §6.5-R）。
> 下面保留的是更正后的表述；被撤回的说法在 §6.5-R 中列明，不要再引用。**

**default-sidebar-tab（新增）**

- `.host.log` 的 `[dsh-default-sidebar-tab] apply:enter` / `bind:index-inject` 行**没有时间戳、
  没有 pid**，这是该 host 半自己的 `log()`（`lib/host-default-sidebar-tab.mjs:14-20`）写法，
  与 adapter 的 `hostlog.mjs:34`（含 `toISOString` + `pid=`）不同。因此**不能**用行号相邻
  关系断言它们「位于统一 `apply:enter` 之后」——初版正是这样断言的，已被撤回。
  可确认为真的部分：这些行**确实存在**，且 `apply:enter` 的 payload
  `{"defaultTab":"dsh-session-details","enabled":true}` 与该 host 半 `resolveConfig()` 的
  输出一致（`lib/config.mjs` 默认 `DEFAULT_TAB`），说明 host 半被调用并拿到有效配置。
- ⚠️ 计数不能作为「融合成功」的证据：`verify.mjs` 的 check 4 与 check 5 **各自** `import`
  profile 里的 `lib/index.js` 并调用一次 `mod.apply({...})`（`scripts/verify.mjs:82,99`），
  每次 verify 运行都会往 `.host.log` 追加 **2 组** tab 行。日志中出现的 3 对（2812/2814、
  2821/2859-2862 区间、2890/2892）对应 3 次 verify 运行，**与进程内重复注册无关**，
  也与 DSH 的真实 boot 无关。判断融合是否生效必须用 `.diag.log`（client 半）而非此处计数。
- `.diag.log` 的 default-sidebar-tab 专属 stage（payload 含 `hasGet`，区别于 session-panel
  的 `hasSlots`）：`loaded` 与 `apply` 成对出现 8 次（03:14:28 → 04:07:55），`attached` 8 次，
  `probe` 15 次，`rightbar-width-set` 9 次，`runtime-probe` 1396 次。**最近一次**
  （即 PID 46980 这一轮）为：`loaded` 04:07:53.036Z、`apply` 04:07:55.246Z、
  `attached` 04:07:55.570Z（`defaultTab:'dsh-session-details', enabled:true`）。
- `replaced` stage 在整个 `.diag.log` 中为 **0 次**。归因：观察窗内唯一的 guide tab 属于
  未挂载会话 `session-32fecaee-...`（`probe.mineGuides:[]`），当前挂载会话 `session-723f...`
  没有 guide；按 `lib/client-default-sidebar-tab.js:139`（只处理 `t.sessionId === mounted`）
  这属正确行为。**替换路径的真实性由 9/9 本地行为测试覆盖，不由实机日志覆盖**——
  初版引用 `state-probe.guideReplacedCount:3` 作为「此前已生效」的旁证是**无效的**：
  该字段的定义是 `mine.filter((s) => !s.guidePresent).length`
  （`lib/client-session-panel.js:595`），只说明「已注册 details 的会话里当前没有 guide tab」，
  这个状态同样可以由「用户自己关掉 guide」或「guide 从未播种」造成，不能证明是
  default-sidebar-tab 替换的。该旁证已撤回。
- CDP `/json/list` 只暴露 `dsh://host`（9230），无 `dsh-app://` renderer 目标，
  无法直读页面 `__DSH_DEFAULT_SIDEBAR_TAB__`；注入值以 host 日志与 client `attached.defaultTab`
  为准（详见 6.6）。

**adapter（回归）**

- `GET /__ctx-bili/status` → 200：
  `{"origin":"http://127.0.0.1:18787","pid":19864,"live":true,"source":"instance-file","hits":{"/__ctx-bili/sessions":10,"/__ctx-bili/status":3,"/__ctx-bili/diag":2}}`，三条路由命中均 > 0。
- `GET /__ctx-bili/sessions` → 200（155 个会话）；`POST /__ctx-bili/diag` → 204。
- `.host.log` 新 PID 46980：`client:diag` 从
  `04:07:56.589Z {"match":"fallback","shim":"none","sessionCount":155}` 转为
  `04:08:30.257Z {"match":"exact","shim":"active","id":"session-723f62c7-...","sessionCount":155,"usage":true}`，
  垫片正常接管。04:08:45.150Z 的一条 `{"stage":"verify-probe"}` 是本次验证主动 POST 的探针。
- 统一 host `apply:enter` → `bind:index-inject` → `bind:routes-ok` → `bind:effect-owned` → `apply:exit` 完整。

**session-panel（回归）**

- `.diag.log`：`registered`×1
  （`{"tabId":"@local/dsh-session-panel","kind":"dsh-session-details","disposers":3}`）、
  `guide-entries`×1（`mineCount:1`）、`sidebar-right-injected`×1（`hasToggle:true`）、
  `header-toggle-registered`×1、`state-probe`×31
  （首个 `sessionCount:14, withDetails:3, detailsActiveCount:3, guideReplacedCount:3`）。

**cs-panel-hider（回归）**

- `.diag.log`：`style-installed`×1（`styleId:'dsh-cs-panel-hider-style'`）、`hide-probe`×2，
  两次均 `styleInstalled:true, styleHasRule:true`，目标节点存在时
  `display:'none', visibility:'hidden', hidden:true`，`bodyPanelFlag:false`。

### 6.6 限制与关注

1. `replaced` stage 未在实机窗口出现，原因如上（无挂载会话自带 guide），非功能失败。
2. CDP 只暴露 host realm，无法直连 renderer DOM/console；页面全局注入值以 host `bind:index-inject`
   日志与 client `attached` diag 为准。
3. 最外层空目录 `dsh-session-panel-kit/` 仍被 Typora（PID 3716）占用，未能删除；
   全部跟踪文件与 kit 子目录内容已删除，submodule 为空。
4. 尝试点击 DSH「新会话」按钮未触发新的 guide 播种，未产生 `replaced`；未继续改动 UI 状态。
5. **`.host.log` 是跨多次 boot 的累积文件**（2884 行，pid 92060 → 60748 等十余轮），
   `[dsh-default-sidebar-tab]` 行又没有 pid/时间戳。任何基于该文件的时序断言都必须
   先轮转日志，否则会重演 Task 1 的错误归因。Task 4 的最终验证已改为从空日志开始。

### 6.5-R 撤回记录（Task 4 复核发现）

Task 3 报告与 §6.5 初版共有三处不成立的论断，均在 Task 4 独立复核中撤回：

| # | 初版说法 | 为何不成立 | 证据 |
|---|---|---|---|
| R1 | 「`apply:enter`/`bind:index-inject` 各出现 3 次，**均位于**统一 `apply:enter`（04:07:36.846Z）**之后**」 | 这 14 行（7 组）**没有时间戳也没有 pid**；行号相邻不构成时序证明。首个 tab 对（2812-2815）在文件里位于 2816 行的统一 `apply:enter` **之前**。 | `lib/host-default-sidebar-tab.mjs:14-20` 的 `log()` 不含 `toISOString`/`pid`；`.host.log:2812-2822` |
| R2 | 「出现 3 次」被当作融合生效的佐证 | 3 组 = 3 次 `verify.mjs` 运行 × 每次 2 组；`verify.mjs` 的 check 4 与 check 5 各自 import `lib/index.js` 并调 `apply` 一次。这是测试副作用，不是 DSH boot 证据。 | `scripts/verify.mjs:82,99` |
| R3 | 「历史 `state-probe.guideReplacedCount:3` 亦显示替换此前已生效」 | 该字段 = `mine.filter((s) => !s.guidePresent).length`，只表示「有 details 的会话当前没有 guide」，无法区分是本插件替换的、用户关掉的、还是从未播种。 | `lib/client-session-panel.js:595` |

**结论的性质**：default-sidebar-tab 的 client 半在 PID 46980 这一轮**确实执行了**
（`loaded`→`apply`→`attached` 的 payload 含 `defaultTab` 且 `hasGet` 区分于 session-panel），
host 半**确实被调用**（payload 与 `resolveConfig()` 默认值一致）。**未被实机证明**的是
「guide 被替换」这一动作本身——它目前只有 9/9 本地行为测试支撑，需在 Task 4 的
最终验证中用全新日志 + 触发 guide 条件重试；若仍无法触发，将如实记为**未实机验证**，
不以间接字段代替。

## 7. Task 4：合并前的独立复核（发现一个 Critical 缺陷）

BASE `f991b0f`。本节记录主代理在最终合并前对 Task 0–3 全量复检的结论，以及由此产生的
代码修复与文档撤回。

### 7.1 复核发现的 Critical：`runReplace` 的暂时性死区

`lib/client-default-sidebar-tab.js` 的 `runReplace()` 在两个早退分支里读 `guide.tabId`：

```js
if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
  if (!skipLogged.has(guide.tabId)) { ... }   // ← 读 guide
  return;
}
if (typeof sidebar.isExpanded === 'function' && sidebar.isExpanded() === false) {
  if (!skipLogged.has(guide.tabId)) { ... }   // ← 读 guide
  return;
}
const guide = guides[0];                       // ← 却在这里才声明
```

`const` 在声明前处于暂时性死区，读它是 `ReferenceError`，不是 `undefined`。

**证据的边界（重要更正）**

初版本节曾用「`skip-collapsed` 命中 0 次，而 `runtime-probe.apiIsExpanded` 全程为
`false`，所以该分支应命中数百次却没命中」来佐证 TDZ。**这个推理是错的，已撤回**：
跨全部 1795 行 diag（含归档日志）的 17 条 `probe` 事件里，`mineGuides` **全部为空数组**，
说明 `runReplace` 在 `guides.length === 0` 处就已返回，根本走不到 skip 分支。
「skip 为 0」与「`isExpanded` 为 false」两者并不构成矛盾，因为条件从未同时成立。

**该缺陷成立的依据只有两条，不含实机日志**：

1. 按代码语句顺序直接可判定：`const` 声明在读取之后 → 暂时性死区。
2. 最小复现抛出 `ReferenceError: Cannot access 'guide' before initialization`。
3. 三条新回归测试中，两条在修复前源码上失败、修复后通过（见 §7.2）。

**同时说明：该缺陷在实机上从未被触发**——因为整个观察期内没有任何「已挂载会话自带
guide tab」的时刻，两个 skip 分支的入口条件一次都没同时满足。所以这是一处**潜伏缺陷**
（latent bug），修它是因为它在条件具备时必然抛错，而不是因为它已造成可见故障。
把它说成「实机上静默失效数百次」是**过度断言**，已在此纠正。

**最小复现**（6 行，与真实语句顺序一致）：

```js
function runReplace() {
  const guides = [{ tabId: 'tab1', sessionId: 'mounted' }].filter((t) => t.sessionId === 'mounted');
  if (guides.length === 0) return;
  const skipLogged = new Set();
  if (true) {                                  // sidebar.isExpanded() === false
    if (!skipLogged.has(guide.tabId)) { ... }  // 真实代码第 169 行
  }
  const guide = guides[0];
}
// -> ReferenceError: Cannot access 'guide' before initialization
```

该异常在订阅回调内抛出并被吞掉，所以用户侧表现为「右栏收起/离屏时该跳过的守卫静默失效」。

**为什么 Task 1–3 没发现**：行为测试的 fake `sidebarRight` 从未提供 `isExpanded`，
`loadClient()` 的 sandbox 也没有 `document`。两个分支因此**从未被执行过**——测试覆盖了
替换路径，却没覆盖这两条守卫。

### 7.2 修复（commit `29104fa`）

- 把 `const guide = guides[0]` 提到两个早退分支之前，并加注释说明为何不能放在后面。
- 重新内联第四个 IIFE 到 `lib/client.js`（仍**只有一个**顶层 `load()`，`grep` 复核：
  行 9 depth 0，行 39/957/1753/1905 均 depth 3）。
- 测试补三项，并把缺失的桩补上：`loadClient({ visibilityState })` 提供 `document`，
  `makeSidebar({ expanded })` 提供 `isExpanded`，以及 `setExpanded()`。
  新增用例：
  1. `右栏收起时不替换，且记录 skip-collapsed（不抛 ReferenceError）`
  2. `右栏展开时同一会话的 guide 照常替换（对照 skip-collapsed）`
  3. `离屏渲染器（visibilityState:hidden）不替换，记录 skip-hidden-renderer`

**测试有效性自证**：把源文件回退到修复前版本后跑这 3 条，**用例 1 与 3 失败**（`not ok 10`、
`not ok 12`），恢复修复后 12/12 全通过。若新测试在旧代码上也通过，则说明它没有锁住缺陷。

- `node --test tests/*.test.mjs`：**68 pass / 0 fail**（原 65，新增 3）。
- `node scripts/verify.mjs --profile ...`：**7/7 PASS**。

### 7.3 复核发现的其他问题（已处理）

| 级别 | 问题 | 处理 |
|---|---|---|
| Important | profile 的 `cordis.patch.yml` 仍有一条 `- id: dsh-default-sidebar-tab / name: '@local/dsh-default-sidebar-tab'`，指向 Task 3 已删除的包 | 已删除该条目（备份 `cordis.patch.yml.bak-before-fusion-final-20261123-130615`），配注释说明配置现在走 adapter 的 insert 条目 |
| Minor | README 仍称 `lib/client.js` 用「静态 `import` 聚合」，与实际的单 `load` + 内联不符 | 已改写为真实结构（commit `72e9770`） |
| Minor | `lib/client.js` 工作区行尾混用（1921 CRLF + 346 LF，从第 1898 行起为裸 LF） | 已归一为纯 LF；blob 与 HEAD 一致（无内容变更） |
| Minor | `.host.log` 跨多轮 boot 累积到 2884 行，`[dsh-default-sidebar-tab]` 行无时间戳/pid | 已记入 §6.6 第 5 条；Task 4 最终验证改为从空日志开始 |

### 7.4 至此仍未实机证明的一项

「guide 被替换」这个动作本身。它在实机上从未触发（`replaced` 0 次），现有支撑仅为
本地行为测试。**不以 `guideReplacedCount` 之类的间接字段替代**（原因见 §6.5-R 的 R3）。
最终验证会从空日志重试；若仍无法构造出「已挂载会话 + guide tab + 右栏展开 + 渲染器可见」
的条件，将如实记录为**未实机验证**，而不是写成通过。
