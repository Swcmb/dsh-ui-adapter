# Fuse Submodule Into Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `dsh-session-panel-kit` 子模块的三个插件逐个融合进 `D:\dsh-ui-adapter` 根目录，成为单一可安装插件包，保留全部 git 历史，每个插件融合后都重装并实机验证。

**Architecture:** 单包多模块。一个 `@ianwusb/dsh-ui-adapter` 包，统一 `lib/client.js` 入口聚合四个独立 client IIFE（`client-adapter/session-panel/cs-panel-hider/default-sidebar-tab.js`），统一 `lib/index.js` 入口聚合四个 host `apply`。三个插件按 session-panel → cs-panel-hider → default-sidebar-tab 顺序逐个融合，每个走完「融合→提交→重装实机验证→提交验证记录」再进入下一个。kit 历史用 subtree merge 一次性并入分支，最终 `--no-ff` 合并回 main。

**Tech Stack:** Git（subtree merge / `--allow-unrelated-histories` / `--no-ff`）、Node.js ≥22.19 ESM、DSH Cordis 插件（host `apply` + client `window.__ModuleLoader__.load`）、Windows junction/symlink、PowerShell（重启 Electron）。

## Global Constraints

- 结果路径全部在 `D:\dsh-ui-adapter` 根目录，禁止出现 `cs-panel-hider/`、`default-sidebar-tab/`、`session-panel/`、`dsh-session-panel-kit/` 子文件夹。
- 保留全部 git 记录：kit 的 ~20 条提交必须成为 main 祖先；通过分支合并；不做 squash、cherry-pick、rebase。
- 每个插件融合后必须：提交融合改动 → 本机重装 + 重启 DSH + 实机验证 → 提交验证记录。全部完成后再做一次最终全量重装 + 验证。
- 不执行 `install.mjs --undo`（会用旧 backup 覆盖 `package.json` 丢依赖）。
- 父仓库根目录的未跟踪文件（`_*.tsx` / `_*.js` / `a.txt` / `f.txt` / `tree.txt`）原样保留，不提交、不改写。
- 四个 client 模块 id 保持不变：`@ianwusb/dsh-ui-adapter`、`@local/dsh-session-panel`、`@local/dsh-cs-panel-hider`、`@local/dsh-default-sidebar-tab`。
- 协作契约：session-panel 的 `TAB_KIND` 与 default-sidebar-tab 的 `DEFAULT_TAB` 必须为同一字符串 `dsh-session-details`。
- DSH 环境：`DSH_HOME=D:\ai-configs\runtime\dsh`，profile=`D:\ai-configs\runtime\dsh\profiles\desktop`，可执行文件 `D:\ProgramFiles\DSH\DeepSeek Harness.exe`。重启前必须清空 `ELECTRON_RUN_AS_NODE` 与 `NODE_OPTIONS`。
- 实施分支 `agent/fuse-kit-into-root`（已创建，设计文档 commits `d5a7b88`、`3494d3d` 已在其上）。
- 设计文档：`project-context/specs/2026-11-23-fuse-submodule-into-root-design.md`。

---

### Task 0: 准备分支并 subtree merge 保留 kit 历史

**Files:**
- Modify: `.gitmodules`（删除）、`.git/config`（移除 submodule 段）
- git 对象：kit 历史并入分支

**Interfaces:**
- Consumes: 当前分支 `agent/fuse-kit-into-root`，kit 工作区 `D:\dsh-ui-adapter\dsh-session-panel-kit`
- Produces: kit 提交成为分支祖先；工作区出现 `dsh-session-panel-kit/` 普通目录（不再有 gitlink）

- [ ] **Step 1: 确认起点干净**

```bash
cd "D:/dsh-ui-adapter" && git status --short | grep -v '^??' && git branch --show-current
```
Expected: 无已跟踪改动输出；分支为 `agent/fuse-kit-into-root`。

- [ ] **Step 2: 备份未跟踪文件清单（用于最终比对）**

```bash
cd "D:/dsh-ui-adapter" && git ls-files --others --exclude-standard > /tmp/untracked-before.txt && wc -l /tmp/untracked-before.txt
```
Expected: 约 23 行（含 `_*.tsx`、`a.txt`、`f.txt`、`tree.txt` 等）。

- [ ] **Step 3: fetch kit 历史（本地路径，不联网）并登记 remote**

```bash
cd "D:/dsh-ui-adapter" && git remote add kit "D:/dsh-ui-adapter/dsh-session-panel-kit" && git fetch kit main && git log --oneline kit/main | head -n 5
```
Expected: 看到 `2666b1e fix: anchor the context meter...` 等 kit 提交。

- [ ] **Step 4: 移除 gitlink 并做 subtree merge**

```bash
cd "D:/dsh-ui-adapter" && git rm --cached dsh-session-panel-kit && git merge -s ours --no-commit --allow-unrelated-histories kit/main && git read-tree --prefix=dsh-session-panel-kit/ -u kit/main && git status --short | head -n 20
```
Expected: `dsh-session-panel-kit/` 下的文件变为普通未跟踪/已暂存文件；无 `deleted: dsh-session-panel-kit` gitlink 报错。若 `read-tree` 因 `dsh-session-panel-kit/.git` 文件拒绝，先 `rm -f dsh-session-panel-kit/.git` 再重试。

- [ ] **Step 5: 清理 submodule 注册并提交**

```bash
cd "D:/dsh-ui-adapter" && rm -f .gitmodules && git config --remove-section submodule.dsh-session-panel-kit 2>/dev/null; git add -A .gitmodules dsh-session-panel-kit && git commit -m "chore: merge dsh-session-panel-kit history (subtree)"
```
Expected: 提交成功；`git log --oneline` 能看到 kit 的提交出现在分支历史中。

- [ ] **Step 6: 验证历史保留**

```bash
cd "D:/dsh-ui-adapter" && git merge-base --is-ancestor 2666b1e HEAD && echo "kit history preserved" && git submodule status && echo "(no submodule above)"
```
Expected: `kit history preserved`；`git submodule status` 无输出。

- [ ] **Step 7: 提交**

Task 0 的提交已在 Step 5 完成（一个 subtree merge commit）。

---

### Task 1: 融合 session-panel（第一个插件）

**Files:**
- Create: `lib/client-session-panel.js`、`lib/host-session-panel.mjs`、`lib/tokens.mjs`、`NOTICES.md`、`LICENSE-session-panel`
- Create: `tests/session-panel-mock-client.mjs`、`tests/tokens.test.mjs`
- Modify: `lib/client.js`、`lib/index.js`、`README.md`、`.gitignore`、`package.json`、`cordis.patch.yml`
- Delete: `dsh-session-panel-kit/session-panel/`（及其内容）
- Test: `tests/tokens.test.mjs`

**Interfaces:**
- Consumes: `dsh-session-panel-kit/session-panel/lib/*`（Task 0 带入）；统一入口当前只含 adapter 模块
- Produces: 统一入口聚合 adapter + session-panel 两个模块；`lib/host-session-panel.mjs` 导出 `apply(ctx)`

- [ ] **Step 1: 平铺 session-panel 文件到根**

```bash
cd "D:/dsh-ui-adapter" && K=dsh-session-panel-kit/session-panel && cp "$K/lib/client.js" lib/client-session-panel.js && cp "$K/lib/index.mjs" lib/host-session-panel.mjs && cp "$K/lib/tokens.mjs" lib/tokens.mjs && cp "$K/NOTICES.md" NOTICES.md && cp "$K/LICENSE" LICENSE-session-panel && cp "$K/tests/mock-client.mjs" tests/session-panel-mock-client.mjs && cp "$K/tests/tokens.test.mjs" tests/tokens.test.mjs && echo copied
```
Expected: `copied`；`tests/tokens.test.mjs` 的 `import ... from '../lib/tokens.mjs'` 相对路径在根 `tests/` 下仍成立。

- [ ] **Step 2: 改 host apply 导出名（避免四个 apply 同名）**

Edit `lib/host-session-panel.mjs`：把 `export function apply(ctx) {` 改为 `export function applySessionPanel(ctx) {`（全文仅此一处函数名）。

- [ ] **Step 3: 写统一 client 入口（聚合两个模块）**

把 `lib/client.js`（原 adapter IIFE）改名为 `lib/client-adapter.js`，新建 `lib/client.js`：

```js
// dsh-ui-adapter — unified client bundle (fused plugin suite)
// SPDX-License-Identifier: GPL-3.0-or-later
import './client-adapter.js';
import './client-session-panel.js';
```
Expected: 原 adapter client 完整保留在 `client-adapter.js`，其 id `@ianwusb/dsh-ui-adapter` 不变。

- [ ] **Step 4: 写统一 host 入口（聚合两个 apply）**

备份原 `lib/index.js` 为 `lib/host-adapter.mjs`（把 `export function apply(ctx, rawConfig = {})` 改为 `export function applyAdapter(ctx, rawConfig = {})`），新建 `lib/index.js`：

```js
// dsh-ui-adapter — unified host half (fused plugin suite)
// SPDX-License-Identifier: GPL-3.0-or-later
import { applyAdapter } from './host-adapter.mjs';
import { applySessionPanel } from './host-session-panel.mjs';

export const name = 'dsh-ui-adapter';
export const inject = ['webServer'];

export function apply(ctx, rawConfig = {}) {
  applyAdapter(ctx, rawConfig);
  applySessionPanel(ctx);
}
```
Expected: `node --input-type=module -e "import('./lib/index.js').then(m=>console.log(m.name, typeof m.apply))"` 输出 `dsh-ui-adapter function`。

- [ ] **Step 5: 重写冲突文件**

- `package.json`: `exports` 增加 `"./client-adapter": "./lib/client-adapter.js"`、`"./client-session-panel": "./lib/client-session-panel.js"`；`files` 增加 `tokens` 相关（`lib` 已覆盖）；`dsh.client.inject` 取 adapter + session-panel 并集（在 adapter 三项基础上加 `@deepseek-ai/dsh-client-ui-sidebar-right`、`@deepseek-ai/dsh-client-modules`）。
- `cordis.patch.yml`: 保持单一 `insert` 行 `id: dsh-ui-adapter` / `name: '@ianwusb/dsh-ui-adapter'`（三个插件的 client 模块由统一 client 入口加载，host 只注册一个 Cordis 插件名）。
- `.gitignore`: 写入 `.host.log`、`node_modules/`、`*.log`、`.DS_Store`。
- `README.md`: 在 adapter 原有章节后追加「会话面板套件」章节，含 session-panel 表（`lib/client-session-panel.js`、kind `dsh-session-details`）、协作契约、历史、许可。

- [ ] **Step 6: 删子目录并本地测试**

```bash
cd "D:/dsh-ui-adapter" && rm -rf dsh-session-panel-kit/session-panel && node --test tests/*.test.mjs 2>&1 | tail -n 15
```
Expected: 测试全绿（现有 27 项 + tokens 测试）。

- [ ] **Step 7: 提交融合**

```bash
cd "D:/dsh-ui-adapter" && git add -A && git commit -m "refactor: fuse session-panel into root"
```
Expected: 提交成功；`git status --short` 仅剩未跟踪的 `_*.tsx` 等文件。

- [ ] **Step 8: 本机重装 + 实机验证 session-panel**

按 §7.2 流程：
1. `node scripts/install.mjs --profile "D:\ai-configs\runtime\dsh\profiles\desktop" --dry-run` → 应显示 `already registered, nothing to do`。
2. `node scripts/verify.mjs --profile "D:\ai-configs\runtime\dsh\profiles\desktop" --compose` → 全项 PASS（若 `cordis.patch.yml` 检查失败按 §7.4 处理）。
3. PowerShell 重启 DSH（清 `ELECTRON_RUN_AS_NODE`/`NODE_OPTIONS`，CloseMainWindow 后 Start-Process），等 25–30s。
4. 验证：`GET http://127.0.0.1:<新端口>/__ctx-bili/status` 返回 200；`.host.log` 有 `bind:routes-ok`；DSH console 无 error；DOM/注册表检查 `sidebarRightTabs` 含 `dsh-session-details`。

- [ ] **Step 9: 记录并提交验证结果**

把验证证据（命令、输出摘要、diag 结果、DOM 检查结论）追加到 `project-context/specs/2026-11-23-fusion-verification.md`（新建），提交：

```bash
cd "D:/dsh-ui-adapter" && git add project-context/specs/2026-11-23-fusion-verification.md && git commit -m "chore: verify session-panel fusion"
```

---

### Task 2: 融合 cs-panel-hider（第二个插件）

**Files:**
- Create: `lib/client-cs-panel-hider.js`、`lib/host-cs-panel-hider.mjs`、`LICENSE-cs-panel-hider`
- Modify: `lib/client.js`、`lib/index.js`、`README.md`、`package.json`
- Delete: `dsh-session-panel-kit/cs-panel-hider/`

**Interfaces:**
- Consumes: `dsh-session-panel-kit/cs-panel-hider/lib/*`；Task 1 的统一入口
- Produces: 统一入口聚合 adapter + session-panel + cs-panel-hider 三个模块

- [ ] **Step 1: 平铺 cs-panel-hider 文件**

```bash
cd "D:/dsh-ui-adapter" && K=dsh-session-panel-kit/cs-panel-hider && cp "$K/lib/client.js" lib/client-cs-panel-hider.js && cp "$K/lib/index.mjs" lib/host-cs-panel-hider.mjs && cp "$K/LICENSE" LICENSE-cs-panel-hider && echo copied
```
（该插件的 `tests/mock-client.mjs` 无对应 `.test.mjs`，不需要复制到根测试集。）

- [ ] **Step 2: 改 host apply 导出名**

Edit `lib/host-cs-panel-hider.mjs`：`export function apply(ctx) {` → `export function applyCsPanelHider(ctx) {`。

- [ ] **Step 3: 更新统一 client 入口（三个模块）**

Edit `lib/client.js`，在已有两条 import 后追加：

```js
import './client-cs-panel-hider.js';
```

- [ ] **Step 4: 更新统一 host 入口（三个 apply）**

Edit `lib/index.js`：追加 `import { applyCsPanelHider } from './host-cs-panel-hider.mjs';`，并在 `apply()` 内 `applySessionPanel(ctx);` 后追加 `applyCsPanelHider(ctx);`。

- [ ] **Step 5: 更新冲突文件**

- `package.json`: `exports` 增加 `"./client-cs-panel-hider": "./lib/client-cs-panel-hider.js"`。
- `README.md`: 追加 cs-panel-hider 章节（隐藏 `dsh-claude-style` 详情面板与图标）。
- `cordis.patch.yml` 不动（仍是单一 insert）。

- [ ] **Step 6: 删子目录、跑测试并提交**

```bash
cd "D:/dsh-ui-adapter" && rm -rf dsh-session-panel-kit/cs-panel-hider && node --test tests/*.test.mjs 2>&1 | tail -n 10 && git add -A && git commit -m "refactor: fuse cs-panel-hider into root"
```

- [ ] **Step 7: 本机重装 + 实机验证 cs-panel-hider + 回归**

按 §7.2 重装重启。验证：`/__dsh-cs-panel-hider/diag` 有事件落盘；computed style 断言 `.dsh-claude-details-root` 为 `display:none`；session-panel 回归正常；DSH console 无 error。

- [ ] **Step 8: 记录并提交验证结果**

追加验证记录到 `project-context/specs/2026-11-23-fusion-verification.md`，提交 `chore: verify cs-panel-hider fusion`。

---

### Task 3: 融合 default-sidebar-tab（第三个插件）

**Files:**
- Create: `lib/client-default-sidebar-tab.js`、`lib/host-default-sidebar-tab.mjs`、`lib/config.mjs`、`LICENSE-default-sidebar-tab`
- Create: `scripts/cdp-probe.mjs`、`scripts/page-probe.mjs`
- Create: `tests/client-behavior.test.mjs`、`tests/config.test.mjs`、`tests/contract.test.mjs`
- Modify: `lib/client.js`、`lib/index.js`、`README.md`、`package.json`
- Delete: `dsh-session-panel-kit/default-sidebar-tab/`（最后一个插件，之后删除 kit 空目录）

**Interfaces:**
- Consumes: `dsh-session-panel-kit/default-sidebar-tab/lib/*`；Task 2 的统一入口
- Produces: 统一入口聚合全部四个模块；四个 client id 全部注册

- [ ] **Step 1: 平铺 default-sidebar-tab 文件**

```bash
cd "D:/dsh-ui-adapter" && K=dsh-session-panel-kit/default-sidebar-tab && cp "$K/lib/client.js" lib/client-default-sidebar-tab.js && cp "$K/lib/index.mjs" lib/host-default-sidebar-tab.mjs && cp "$K/lib/config.mjs" lib/config.mjs && cp "$K/LICENSE" LICENSE-default-sidebar-tab && cp "$K/scripts/"*.mjs scripts/ && cp "$K/tests/"*.test.mjs tests/ && echo copied
```
Expected: 测试文件 `../lib/config.mjs`、`../lib/client.js` 相对路径在根 `tests/` 下成立。

- [ ] **Step 2: 改 host apply 导出名**

Edit `lib/host-default-sidebar-tab.mjs`：`export function apply(ctx, rawConfig = {}) {` → `export function applyDefaultSidebarTab(ctx, rawConfig = {}) {`。

- [ ] **Step 3: 更新统一 client 入口（四个模块）**

Edit `lib/client.js` 追加：

```js
import './client-default-sidebar-tab.js';
```

- [ ] **Step 4: 更新统一 host 入口（四个 apply）**

Edit `lib/index.js`：追加 `import { applyDefaultSidebarTab } from './host-default-sidebar-tab.mjs';`，并在 `apply()` 内追加 `applyDefaultSidebarTab(ctx, rawConfig);`。

- [ ] **Step 5: 校验协作契约**

```bash
cd "D:/dsh-ui-adapter" && grep -n "TAB_KIND" lib/client-session-panel.js | head -n 3 && grep -n "DEFAULT_TAB" lib/config.mjs | head -n 3
```
Expected: 两者都是 `dsh-session-details`。若不一致，以 session-panel 的 `TAB_KIND` 为准改 `config.mjs`。

- [ ] **Step 6: 更新冲突文件**

- `package.json`: `exports` 增加 `"./client-default-sidebar-tab": "./lib/client-default-sidebar-tab.js"`、`"./config": "./lib/config.mjs"`。
- `README.md`: 追加 default-sidebar-tab 章节与协作契约段；`License` 段注明四个模块许可。
- `cordis.patch.yml` 不动。

- [ ] **Step 7: 删 kit 空目录、跑全量测试并提交**

```bash
cd "D:/dsh-ui-adapter" && rm -rf dsh-session-panel-kit && node --test tests/*.test.mjs 2>&1 | tail -n 12 && ls -d cs-panel-hider default-sidebar-tab session-panel dsh-session-panel-kit 2>/dev/null || echo "no subfolders (OK)" && git add -A && git commit -m "refactor: fuse default-sidebar-tab into root"
```

- [ ] **Step 8: 本机重装 + 实机验证 default-sidebar-tab + 三插件回归**

按 §7.2 重装重启。验证：右侧栏打开默认显示 `dsh-session-details`（DOM 检查）；cs-panel-hider / session-panel / adapter 回归正常；DSH console 无 error。

- [ ] **Step 9: 记录并提交验证结果**

追加验证记录，提交 `chore: verify default-sidebar-tab fusion`。

- [ ] **Step 10: 降级路径（仅当 client 聚合验证失败时执行）**

若四个 client 模块未全部加载（console 报 `import` 不支持或模块 id 缺失），说明 DSH 以普通 script 而非 ESM 加载 client bundle。降级：把四个 `client-*.js` 的 IIFE 内容顺序拼接进 `lib/client.js`（去掉 import 语句），保留 `client-*.js` 文件作源码备份。重跑 Task 3 Step 7–8。

---

### Task 4: 合并回 main + 最终全量重装验证

**Files:**
- `project-context/specs/2026-11-23-fusion-verification.md`（追加最终验证记录）

**Interfaces:**
- Consumes: 分支 `agent/fuse-kit-into-root` 上全部融合与验证 commits
- Produces: main 上的 `--no-ff` merge commit + 最终验证 commit

- [ ] **Step 1: 分支最终检查**

```bash
cd "D:/dsh-ui-adapter" && git log --oneline -12 && echo "--- submodules ---" && git submodule status && echo "--- untracked diff ---" && git ls-files --others --exclude-standard > /tmp/untracked-after.txt && diff /tmp/untracked-before.txt /tmp/untracked-after.txt && echo "untracked files unchanged"
```
Expected: 能看到 subtree merge + 3 个 `refactor: fuse *` + 3 个 `chore: verify *`；无 submodule；未跟踪文件清单与 Task 0 一致。

- [ ] **Step 2: 合并回 main（--no-ff）**

```bash
cd "D:/dsh-ui-adapter" && git checkout main && git merge --no-ff agent/fuse-kit-into-root -m "Merge branch 'agent/fuse-kit-into-root': fuse kit into root"
```

- [ ] **Step 3: main 上验证历史与结构**

```bash
cd "D:/dsh-ui-adapter" && git merge-base --is-ancestor 2666b1e HEAD && echo "kit history in main" && find lib -name 'client-*.js' | sort && find lib -name 'host-*.mjs' | sort && grep -c 'dsh-session-details' lib/client-session-panel.js lib/config.mjs
```
Expected: `kit history in main`；4 个 client 文件、4 个 host 文件；两处 `dsh-session-details`。

- [ ] **Step 4: 最终全量重装验证（§7 完整矩阵）**

按 §7.2 重装重启，执行 §7.3 全部验证点：adapter / session-panel / cs-panel-hider / default-sidebar-tab / 四者共存。记录到验证文档。

- [ ] **Step 5: 提交最终验证**

```bash
cd "D:/dsh-ui-adapter" && git add project-context/specs/2026-11-23-fusion-verification.md && git commit -m "chore: verify full fusion on main"
```

---

## Self-Review

- **Spec coverage**: Task 0 覆盖 §5.1 历史保留；Task 1/2/3 覆盖 §5.2 三插件逐个融合-验证-提交循环；Task 4 覆盖 §5.3 合并回 main + 全量验证；每个 Task 的验证步覆盖 §7.2/§7.3；§4.1 降级路径在 Task 3 Step 10；§4.2 host 聚合在各 Task Step 4；§4.3 冲突重写在各 Task Step 5；未跟踪文件保护在 Global Constraints + Task 0 Step 2 + Task 4 Step 1。
- **Placeholder scan**: 无 TBD/TODO/"implement later"；所有步骤含确切命令或代码。
- **Type consistency**: `applyAdapter`/`applySessionPanel`/`applyCsPanelHider`/`applyDefaultSidebarTab` 四个名字在 Step 2 定义、Step 4 import、apply() 调用处一致；`client-*.js` 四个文件名在 Create/复制/import 三处一致。
