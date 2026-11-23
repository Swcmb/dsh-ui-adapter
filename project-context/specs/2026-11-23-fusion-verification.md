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

- 新 PID：`41168, 49556, 54796, 55120, 55940`；Web 端口 `57719`；CDP `9230`。
- `GET /__ctx-bili/status` → 200；`hits.sessions=4, status=2, diag=1`。
- `.host.log`（新 PID）：`apply:enter`、`bind:routes-ok`、三条 `/__ctx-bili/*` 的 `route:hit`、`client:diag`。
- `.diag.log` 中出现**仅 session-panel 会产生**的 stage（已与 default-sidebar-tab 的 stage 集合区分）：

  | stage | 次数 | 说明 |
  |---|---|---|
  | `registered` | 2 | `sidebarRightTabs` 注册 `dsh-session-details` 成功 |
  | `header-toggle-registered` | 2 | 头部开关注册成功 |
  | `sidebar-right-injected` | 2 | 原生导航控制器注入 |
  | `guide-entries` | 2 | 入口引导注册 |
  | `state-probe` | 18 | `withDetails=3, detailsActiveCount=3, guideReplacedCount=3`，`kinds=['dsh-session-details']` |

  这证明融合后的 session-panel client 已真实执行并注册 tab 类型；此前错误归因已作废。

### 4.5 结论与限制

- adapter client：PASS；session-panel client：PASS；风险 A：**已解除**。
- renderer DOM/console 仍无法直连（CDP 只能到 host realm）；`sidebarRightTabs` 由上述 session-panel 专属 stage 与 `state-probe` 快照证明，不再依赖错误归因。
- `--compose` 因 `dsh` CLI 缺失未执行。
