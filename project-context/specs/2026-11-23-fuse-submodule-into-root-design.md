# 融合 dsh-session-panel-kit 子模块到仓库根目录 — 设计文档

> 状态：待复核 | 日期：2026-11-23 | 仓库：`Swcmb/dsh-ui-adapter` | 结果路径：`D:\dsh-ui-adapter`

## 1. 目标与约束

将 `D:\dsh-ui-adapter\dsh-session-panel-kit`（git submodule，gitdir 在 `.git/modules/dsh-session-panel-kit`）下的三个插件项目融合进父仓库，**结果全部落在 `D:\dsh-ui-adapter` 根目录，不保留任何子文件夹**（`cs-panel-hider/`、`default-sidebar-tab/`、`session-panel/` 均不保留），融合成单一可安装插件包。

硬约束：

- **保留全部 git 记录**：kit 子模块的完整提交历史必须成为父仓库 `main` 的祖先，通过「分支合并到主分支」实现，不做 squash、不做 cherry-pick、不丢提交。
- **不丢文件**：kit 三个插件 + 父仓库现有文件，实质信息一条不丢。
- **不动用户未跟踪文件**：父仓库根目录的 `_*.tsx` / `_*.js` / `a.txt` / `f.txt` / `tree.txt` 等未跟踪文件原样保留，不提交、不改写。
- **冲突文件先自行重写**：`README.md`、`.gitignore`、`package.json`、`cordis.patch.yml` 由实施方合并重写；无法自行解决的才请示用户。

## 2. 现状诊断

### 2.1 仓库关系

| 项 | 父仓库 | 子模块 |
|---|---|---|
| 路径 | `D:\dsh-ui-adapter` | `D:\dsh-ui-adapter\dsh-session-panel-kit` |
| 分支 | `main`（跟踪 `origin/main`） | `main`（跟踪 `origin/main`） |
| 工作区 | 大量未跟踪文件，`main` 无已跟踪改动 | 干净 |
| `.git` | 目录 | 文件：`gitdir: ../.git/modules/dsh-session-panel-kit` |
| 注册 | `.gitmodules` 一条 `submodule "dsh-session-panel-kit"` | — |

### 2.2 父仓库本身已是第四个插件

父仓库 `package.json` 是 `@ianwusb/dsh-ui-adapter@0.8.3`，有完整的 `lib/client.js`（IIFE，id `@ianwusb/dsh-ui-adapter`）、`lib/index.js`（host 半，`name='dsh-ui-adapter'`）、`cordis.patch.yml`（insert `dsh-ui-adapter`）。因此本次是**四个插件合成一个包**：

| # | 插件 | client 模块 id | host name | client 注入依赖 |
|---|---|---|---|---|
| 1 | dsh-ui-adapter（父仓库） | `@ianwusb/dsh-ui-adapter` | `dsh-ui-adapter` | runtime / ui-layout / locale |
| 2 | session-panel | `@local/dsh-session-panel` | `dsh-session-panel` | ui-sidebar-right / modules |
| 3 | cs-panel-hider | `@local/dsh-cs-panel-hider` | `dsh-cs-panel-hider` | 无 |
| 4 | default-sidebar-tab | `@local/dsh-default-sidebar-tab` | `dsh-default-sidebar-tab` | ui-sidebar-right / modules |

### 2.3 结构契约

- 四个 client 半各自是完整的 `window.__ModuleLoader__.load({ id, factory })` IIFE，导出 `{ apply, inject }`，id 互不相同。
- 四个 host 半各自导出 `name` / `inject` / `apply(ctx)`；`inject` 均包含 `webServer`（session-panel 在 client 半用 `ctx.inject` 动态等待侧栏服务）。
- `session-panel` 与 `default-sidebar-tab` 通过 tab kind 字符串 `dsh-session-details` 约定耦合：`session-panel/lib/client.js` 的 `TAB_KIND` 与 `default-sidebar-tab/lib/config.mjs` 的 `DEFAULT_TAB`。融合时必须保持两处一致。

### 2.4 同名文件冲突（平铺到根目录时）

| 文件 | 份数 | 处理 |
|---|---|---|
| `package.json` | 4 | 重写为单一包定义 |
| `cordis.patch.yml` | 4 | 重写为单一 insert（`name: @ianwusb/dsh-ui-adapter`） |
| `README.md` | 4 | 合并成一篇 |
| `.gitignore` | 3（父仓库、kit 根、default-sidebar-tab） | 取并集 |
| `LICENSE` | 3（三个插件各一份）+ 父仓库 `COPYING` | 按来源重命名，全部保留 |
| `lib/client.js` | 4 | 改名为 `client-<插件>.js`，由统一 `lib/client.js` 聚合 |
| `lib/index.mjs` / `lib/index.js` | 4 | 改名为 `host-<插件>.mjs`，由统一 `lib/index.js` 聚合 |
| `tests/mock-client.mjs` | 2 | 改名为 `session-panel-mock-client.mjs` / `cs-panel-hider-mock-client.mjs` |

## 3. 目标结构

```
D:\dsh-ui-adapter\
├── package.json                    ← 单一包：@ianwusb/dsh-ui-adapter，inject 取并集
├── cordis.patch.yml                ← 单一 insert
├── README.md                       ← 四篇合一
├── .gitignore                      ← 并集
├── .gitattributes                  ← 保持 * text=auto eol=lf
├── COPYING                         ← GPL-3.0-or-later（父仓库原有，保留）
├── LICENSE（3 份）                 ← 三个插件各一份，按来源重命名（见 §4.3）
├── NOTICES.md                      ← 来自 session-panel
├── lib/
│   ├── index.js                    ← 统一 host 入口，聚合四个 host apply
│   ├── client.js                   ← 统一 client 入口，import 四个 client 模块
│   ├── client-adapter.js           ← 原父仓库 lib/client.js（原样）
│   ├── client-session-panel.js     ← 原 session-panel/lib/client.js（原样）
│   ├── client-cs-panel-hider.js    ← 原 cs-panel-hider/lib/client.js（原样）
│   ├── client-default-sidebar-tab.js ← 原 default-sidebar-tab/lib/client.js（原样）
│   ├── host-adapter.mjs            ← 原父仓库 lib/index.js（apply 改名导出）
│   ├── host-session-panel.mjs      ← 原 session-panel/lib/index.mjs（apply 改名导出）
│   ├── host-cs-panel-hider.mjs     ← 原 cs-panel-hider/lib/index.mjs（apply 改名导出）
│   ├── host-default-sidebar-tab.mjs ← 原 default-sidebar-tab/lib/index.mjs（apply 改名导出）
│   ├── ledger.mjs / proxy.mjs / hostlog.mjs / tokens.mjs / config.mjs
├── scripts/                        ← 父仓库现有 + cdp-probe.mjs + page-probe.mjs
├── tests/                          ← 父仓库现有 + 三个插件的测试（mock-client 改名）
├── docs/                           ← 父仓库现有 notes.md / recoms.snapshot.json
└── project-context/specs/          ← 本文档
```

不存在的子文件夹：`cs-panel-hider/`、`default-sidebar-tab/`、`session-panel/`、`dsh-session-panel-kit/`。

## 4. 融合机制

### 4.1 client 半（统一入口 + 四个独立模块）

`lib/client.js` 只做聚合，四条静态 import 触发四个 IIFE 各自注册自己的模块 id：

```js
import './client-adapter.js';
import './client-session-panel.js';
import './client-cs-panel-hider.js';
import './client-default-sidebar-tab.js';
```

四个 `client-*.js` **源码零改动**（保留各自 id、factory、inject、诊断通道），避免 2000 行代码重写。`package.json` 的 `dsh.client.inject` 取四者并集：

```
@deepseek-ai/dsh-client-runtime
@deepseek-ai/dsh-client-ui-layout
@deepseek-ai/dsh-client-ui-sidebar-right
@deepseek-ai/dsh-client-modules
@deepseek-ai/dsh-client-locale
```

**遗留风险（验证阶段重点确认）**：DSH 的 client 注入是否真的执行统一入口里的全部四条 import。若只执行入口而忽略静态 import，需降级为在 `lib/client.js` 内联四个 IIFE（等价于把四个文件的 IIFE 顺序粘贴进入口）。设计上优先静态 import，验证失败再降级。

### 4.2 host 半（统一 apply + 四段逻辑）

四个 host 半的 `apply` 改名后保留为独立导出（如 `applySessionPanel`），`lib/index.js` 统一 `apply(ctx, rawConfig)` 依次调用：

```js
import { apply as applyAdapter, inject as adapterInject } from './host-adapter.mjs';
import { apply as applySessionPanel } from './host-session-panel.mjs';
import { apply as applyCsPanelHider } from './host-cs-panel-hider.mjs';
import { apply as applyDefaultSidebarTab } from './host-default-sidebar-tab.mjs';

export const name = 'dsh-ui-adapter';
export const inject = ['webServer'];   // 四者并集

export function apply(ctx, rawConfig = {}) {
  applyAdapter(ctx, rawConfig);
  applySessionPanel(ctx);
  applyCsPanelHider(ctx);
  applyDefaultSidebarTab(ctx, rawConfig);
}
```

- 四个 host 的 `name` 单一化为 `dsh-ui-adapter`（一个包只能有一个 Cordis 插件名）。
- `default-sidebar-tab` 的 host `apply(ctx, rawConfig)` 保留第二参数（它读配置决定默认 tab）。
- `session-panel` 的 host 诊断路由、`cs-panel-hider` / `default-sidebar-tab` 的 diag 落盘路由全部保留（路径不变）。

### 4.3 冲突文件重写

| 文件 | 重写规则 |
|---|---|
| `README.md` | 四篇合一：保留 adapter 原有全部章节；新增「会话面板套件」章节，含三插件表、协作契约（kind `dsh-session-details`）、历史、许可；License 段统一 GPL-3.0-or-later |
| `.gitignore` | `.host.log` / `node_modules/` / `*.log` / `.DS_Store` |
| `package.json` | name `@ianwusb/dsh-ui-adapter`；main `lib/index.js`；exports 增加四个 client 子路径与 config；files 含 lib/scripts/tests/docs；dsh.client.inject 取并集 |
| `cordis.patch.yml` | 单一 `- insert: - id: dsh-ui-adapter, name: '@ianwusb/dsh-ui-adapter'` |
| `LICENSE` × 3 | 三个插件各一份 GPL-3.0-or-later，按来源重命名为 `LICENSE-session-panel` / `LICENSE-cs-panel-hider` / `LICENSE-default-sidebar-tab`，全部保留；父仓库 `COPYING` 不动 |
| `.gitmodules` | 删除 |

## 5. 逐个融合 + 逐个验证 + 逐个提交（用户 2026-11-23 追加要求）

**流程硬要求**：不一次性融合三个插件。每融合一个插件 → 提交 git → 重装 + 实机验证该插件 → 提交 git → 再融合下一个。全部完成后再做一次全量重装 + 全量验证。

### 5.1 分支与历史

- 实施分支：`agent/fuse-kit-into-root`（已从 main 创建，设计文档已提交 `d5a7b88`）。
- **kit 完整历史一次性并入**：在第一个插件融合前做 subtree merge 把 kit 的 ~20 条提交作为祖先并入分支（历史保留不拆分），之后三个插件的逐个融合都是在这个带完整历史的基础上做文件级平铺。这样既满足"一个一个融合"，又满足"保留全部 git 记录通过分支合并"。
  - `git remote add kit D:/dsh-ui-adapter/dsh-session-panel-kit`（本地路径）→ `git fetch kit main`
  - `git rm --cached dsh-session-panel-kit`（删 gitlink，保留工作区文件）
  - `git merge -s ours --no-commit --allow-unrelated-histories kit/main` → `git read-tree --prefix=dsh-session-panel-kit/ -u kit/main` → 提交 `chore: merge kit history (subtree)`
  - 验证：`git log --oneline` 能看到 kit 的 ~20 条提交

### 5.2 三个插件各自的融合-验证-提交循环

按顺序逐个处理，每个插件严格走完 5 步再进入下一个：

**插件 1：session-panel**

| 步 | 动作 | git 提交 |
|---|---|---|
| 1 融合 | 把 `dsh-session-panel-kit/session-panel/` 的内容平铺到根：`lib/client.js`→`lib/client-session-panel.js`（原样）、`lib/index.mjs`→`lib/host-session-panel.mjs`（apply 改名）、`tokens.mjs` 入 `lib/`、`tests/*` 入根 `tests/`（mock-client 改名）、`NOTICES.md` 入根、`LICENSE`→`LICENSE-session-panel`。**更新统一 `lib/client.js` 与 `lib/index.js` 只聚合 adapter + session-panel 两个模块**（另两个尚未融合）。重写 README（加入 session-panel 章节）、.gitignore、package.json、cordis.patch.yml。删除 `session-panel/` 子目录。 | `refactor: fuse session-panel into root` |
| 2 重装验证 | 按 §7.2 重装 + 重启 DSH + 实机验证 session-panel 功能（§7.3） | — |
| 3 提交验证结果 | 把验证证据（diag 输出、DOM 检查、命令输出）记入 `project-context/specs/` 下验证记录（如 `2026-11-23-fusion-verification.md`），或作为空提交 `chore: verify session-panel fusion` | `chore: verify session-panel fusion` |

**插件 2：cs-panel-hider**（同上 5 步）

| 步 | 动作 | git 提交 |
|---|---|---|
| 1 融合 | 平铺 cs-panel-hider：`client.js`→`client-cs-panel-hider.js`、`index.mjs`→`host-cs-panel-hider.mjs`、`LICENSE`→`LICENSE-cs-panel-hider`。**统一入口更新为聚合 adapter + session-panel + cs-panel-hider 三个模块**。README 加入 cs-panel-hider 章节。删除子目录。 | `refactor: fuse cs-panel-hider into root` |
| 2 重装验证 | 重装 + 重启 + 实机验证 cs-panel-hider 功能 + 已融合的两个插件回归 | — |
| 3 提交验证结果 | `chore: verify cs-panel-hider fusion` | `chore: verify cs-panel-hider fusion` |

**插件 3：default-sidebar-tab**（同上 5 步）

| 步 | 动作 | git 提交 |
|---|---|---|
| 1 融合 | 平铺 default-sidebar-tab：`client.js`→`client-default-sidebar-tab.js`、`index.mjs`→`host-default-sidebar-tab.mjs`、`config.mjs` 入 `lib/`、`scripts/*` 入根 `scripts/`、`tests/*` 入根 `tests/`、`LICENSE`→`LICENSE-default-sidebar-tab`。**统一入口更新为聚合全部四个模块**。README 加入 default-sidebar-tab 章节；确认 `TAB_KIND` 与 `DEFAULT_TAB` 仍为 `dsh-session-details`。删除子目录与 kit 空目录。 | `refactor: fuse default-sidebar-tab into root` |
| 2 重装验证 | 重装 + 重启 + 实机验证 default-sidebar-tab 功能 + 前三个插件回归 | — |
| 3 提交验证结果 | `chore: verify default-sidebar-tab fusion` | `chore: verify default-sidebar-tab fusion` |

### 5.3 合并回主分支

全部三个插件逐个融合并验证通过后：

1. `git checkout main && git merge --no-ff agent/fuse-kit-into-root -m "Merge branch 'agent/fuse-kit-into-root': fuse kit into root"`
2. 按 §7.2 做**最终一次**重装 + 重启 + 全量实机验证（§7.3 完整矩阵）。
3. 最终验证证据提交到 main：`chore: verify full fusion on main`。

最终 `main` 历史：kit 提交是祖先 + subtree merge commit + 三个 `refactor: fuse *` + 三个 `chore: verify *` + 一个 `--no-ff` 分支合并 commit + 最终验证提交。

## 6. 验证清单

| # | 检查 | 通过标准 |
|---|---|---|
| 1 | `git log --graph --oneline` | kit 的 20+ 条提交出现在 main  ancestry；含两个 merge commit |
| 2 | `git rev-list --count HEAD` | 提交总数 ≥ 父仓库原数量 + kit 数量 |
| 3 | `ls -d D:/dsh-ui-adapter/{cs-panel-hider,default-sidebar-tab,session-panel,dsh-session-panel-kit}` | 全部不存在 |
| 4 | `git submodule status` | 无输出 |
| 5 | `cat .gitmodules` | 文件不存在 |
| 6 | `find lib -name 'client-*.js'` | 4 个文件 |
| 7 | `find lib -name 'host-*.mjs'` | 4 个文件（含 host-adapter.mjs） |
| 8 | `grep 'TAB_KIND\|DEFAULT_TAB'` | `dsh-session-details` 两处一致 |
| 9 | `node --test tests/*.test.mjs` | 全部通过（合并后的测试集） |
| 10 | 运行时 client 注入验证（CDP 或 profile 重载） | 四个模块 id 均被加载；四个 diag 通道均有响应 |
| 11 | 未跟踪文件比对 | `_*.tsx` / `_*.js` / `*.txt` 与操作前逐字节一致 |
| 12 | 每个插件融合后重装 + 实机验证 | 按 §5.2 每个插件融合后重装验证该插件 + 回归，全部通过并提交 |
| 13 | 最终全量重装 + 实机验证 | 按 §5.3 合并回 main 后，按 §7 完成最终 reinstall、DSH 重启、四插件功能矩阵全部通过 |

第 10 或 12 项失败时按 §4.1 降级方案把四个 IIFE 内联进 `lib/client.js`，重跑验证。

## 7. 本机重新安装 + 实机验证（用户 2026-11-23 追加要求）

每个插件融合后（§5.2）以及最终全部融合后（§5.3），都要在**本机 DSH 桌面端重新安装并实机验证功能**。这一步是交付门禁，不是可选项。重装流程对每个插件与最终全量验证都同样适用。

### 7.1 安装环境事实（已实测）

| 项 | 值 |
|---|---|
| `DSH_HOME` | `D:\ai-configs\runtime\dsh`（用户级变量，`~/.dsh` 是废弃旧树） |
| desktop profile | `D:\ai-configs\runtime\dsh\profiles\desktop` |
| 当前安装形态 | `node_modules/@ianwusb/dsh-ui-adapter` 是 SymbolicLink → `..\..\..\..\..\..\..\dsh-ui-adapter`（即本仓库） |
| profile 已注册 | `package.json` 的 `dependencies` 与 `dsh.profile.bundles` 均含 `@ianwusb/dsh-ui-adapter` |

### 7.2 重装流程（注意 --undo 的坑）

1. **不要执行 `install.mjs --undo`**：`--undo` 会用 `package.json.bak-before-ui-adapter`（3517 字节）覆盖当前 `package.json`（4248 字节），丢失之后新增的其它插件依赖。当前 link 已正确指向本仓库，无需卸载重装修复路径。
2. 执行 `node scripts/install.mjs --profile "D:\ai-configs\runtime\dsh\profiles\desktop" --dry-run` 确认注册状态；若显示 `already registered, nothing to do`，则依赖与 bundles 已就位。
3. `node scripts/verify.mjs --profile "D:\ai-configs\runtime\dsh\profiles\desktop" --compose` 跑只读安装校验（含 `dsh --dump-config`）。
4. **重启 DSH**（client/host 改动需进程重启才生效；`install.mjs` 自述 hot-installer 会在下次 manifest poll 拾取 bundle，但融合改了入口与模块布局，必须重启）：
   - 先优雅关闭：对 `MainWindowTitle` 非空的 DSH 进程 `CloseMainWindow()`，等 15s，仍未退出再 `Stop-Process -Force`（Electron 常有残留子进程）。
   - 再启动：**必须先清 `ELECTRON_RUN_AS_NODE` 与 `NODE_OPTIONS`**（Agent shell 注入了 `ELECTRON_RUN_AS_NODE=1`，不清会让 Electron 当纯 Node 跑、静默 exit 0），用 `Start-Process -FilePath "D:\ProgramFiles\DSH\DeepSeek Harness.exe" -WorkingDirectory "D:\ProgramFiles\DSH"`。
   - 等 25–30s，确认新端口监听并 `GET /__ctx-bili/status` 返回 200。
5. **实机验证四个插件的全部功能**（见 §7.3）。

### 7.3 实机验证矩阵

| 插件 | 验证点 | 程序化手段（不靠截图） |
|---|---|---|
| dsh-ui-adapter | 赞助卡隐藏、压缩账本切换卡出现、tokenUsage 投影写入 | `GET /__ctx-bili/status` 200；页面 DOM 检查 `a.lc-recom` display:none、切换卡存在；`.host.log` 有 `bind:routes-ok` / `route:hit` |
| session-panel | 右侧栏「会话详情」tab 注册、guide 卡片、kind `dsh-session-details` | `ctx.sidebarRightTabs` 注册表含该 kind；`session-panel` diag 通道有 `route:hit` |
| cs-panel-hider | `dsh-claude-style` 详情面板与顶部图标被 CSS 隐藏 | computed style 断言（`.dsh-claude-details-root` display:none）；`/__dsh-cs-panel-hider/diag` 有事件落盘 |
| default-sidebar-tab | 右侧栏打开默认显示 `dsh-session-details` | DOM 检查默认 tab kind；client 半 `apply:enter` 日志（该插件 host 无 diag 路由） |
| 逐阶段回归 | 每个插件融合后，验证该插件 + 已融合插件均正常；最终验证四者共存 | DSH console 无 error；已融合插件的 diag 通道均有响应；`.host.log` 对应日志齐全 |

验证手段优先级：`scripts/verify.mjs --compose`（只读静态校验）→ 运行时 diag 端点（程序化）→ CDP 只读 DOM/计算样式。截图仅作辅助，不作为通过标准。

### 7.4 实机验证失败的处理

- 若某插件 client 未加载：按 §4.1 降级方案把四个 IIFE 内联进 `lib/client.js`，重跑 §7.2–§7.3。
- 若 host 路由未注册：检查 `lib/index.js` 的 `inject` 是否含 `webServer`、四个 `host-*.mjs` 的 `apply` 是否都被调用。
- 若 DSH 启动失败（无窗口、exit 0）：确认 `ELECTRON_RUN_AS_NODE` 已清空。

## 8. 风险与回滚

- **风险 A**：四个 client 模块的静态 import 未被 DSH 执行 → 降级内联，已列验证项。
- **风险 B**：host `apply` 聚合后某个插件的 diag 路由路径冲突 → 实测各路径本就不同：adapter `/__ctx-bili/*`、cs-panel-hider `/__dsh-cs-panel-hider/diag`、session-panel `/__dsh-session-panel/diag`；default-sidebar-tab 的 host **没有** diag 路由（纯 client 半），不产生冲突。
- **风险 C**：subtree merge 步骤因 gitlink 存在拒绝 `read-tree` → 提交 1 前先 `git rm --cached dsh-session-panel-kit` 移除 gitlink（保留工作区文件），再 read-tree。
- **风险 D**：`install.mjs --undo` 覆盖 profile package.json 丢依赖 → 重装流程明确禁止 `--undo`（§7.2）。
- **回滚**：全部步骤在分支 `agent/fuse-kit-into-root` 上完成，main 仅在最后一步 `--no-ff` 合并；如需回滚，`git revert -m 1 <merge-commit>` 或删除分支即可，kit 原始历史仍在 `.git/modules/dsh-session-panel-kit` 与远端。
