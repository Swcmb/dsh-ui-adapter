# DSH 内部实现参考材料

本目录是**参考资料归档**，不是本插件的运行代码。这里的内容全部抽取自本机安装的
DeepSeek Harness 桌面端（`D:/ProgramFiles/DSH`），用于理解本插件所依赖的原生接口：

- `dsh-client-ui-sidebar-right` 的 `ctx.sidebarRight` 服务面与 tab 类型注册表
- 右侧栏的布局、停靠（dock）与 session 作用域 store 的协作方式
- `__ModuleLoader__` 的模块装配形态（本插件正是依赖它注入 client 半）

保留它们的理由是：本插件的 `default-sidebar-tab` 模块**直接调用**这些内部接口
（`ctx.sidebarRight.openTab(kind, { replaceTab })`、`sidebarRightTabs.register`、
`ctx.sidebarRight.isExpanded()` 等），而 DSH 并未为这些接口发布公开文档。把这些源码
留在仓库里，是为了后续维护时能核对真实签名，而不是靠记忆。

## 来源

| 项 | 值 |
|---|---|
| 上游包 | `@deepseek-ai/dsh` 及 `@deepseek-ai/dsh-client-ui-*` 系列 |
| 版本 | `0.2.2-rc.5` |
| 抽取自 | `D:/ProgramFiles/DSH/resources/app.asar` |
| 上游仓库 | <https://github.com/deepseek-ai/deepseek-harness> |
| 授权 | **MIT**（`@deepseek-ai/dsh` 的 `package.json` 声明 `"license": "MIT"`） |

MIT 与 GPLv3 单向兼容：MIT 代码可以并入 GPLv3 项目，但必须保留原版权与许可声明。
声明登记在仓库根的 [`NOTICES.md`](../../NOTICES.md)。**本目录内容不受本仓库的
GPL-3.0-or-later 覆盖**，它们的授权仍为 MIT。

## 目录说明

### `source/` —— 上游 TypeScript 源码

`dsh-client-ui-sidebar-right`（右侧栏的实现）的类型定义、服务实现与中文文档。

| 文件 | 内容 |
|---|---|
| `_service.ts` | `ctx.sidebarRight` 对外服务面：其他插件能请求什么 |
| `_sr.tsx` | 右侧栏在框架中的位置、面板绘制与全屏行为 |
| `_sr_index.ts` | 右侧栏包的入口装配 |
| `_sr.css` | 右侧栏自身的外观（面板外框、两端控件、占位 tab 体） |
| `_sr_doc.md` | 右侧栏中文文档（停靠面、寻址内容、资源提供者） |
| `_tab-registry.ts` | tab 类型注册表：一个 tab 类型由什么构成 |
| `_guide_def.ts` | guide（开始页）类型注册的第一阶段 |
| `_stores.ts` | 停靠工具之上的 store 外壳，每个 surface 一份 |
| `_session-view.ts` | 单个 Sidebar view 的 Session 引用与保留体 |
| `_session-views.ts` | 独立 session 的选择与保留策略 |
| `_rroot.tsx` | 右侧 Sidebar Session 控制器的根作用域 |
| `_appframe.tsx` | 三栏框架，注册进内置布局 |
| `_expand.tsx` | 进入隐藏面板的入口：会话头里的一个按钮 |

### `bundles/` —— 构建产物

运行时打包结果，**不可直接编辑**，仅在需要确认「最终注入到页面的是什么」时查阅。

| 文件 | 内容 |
|---|---|
| `_main.js` | DSH Desktop 的 Electron 主进程 bundle（约 848 KB） |
| `_srlib.js` | `dsh-client-ui-sidebar-right` 的 client bundle（`__ModuleLoader__.load` 载荷，约 140 KB） |
| `_layout.js` | `dsh-client-ui-layout` 的 client bundle |

### `tools/` —— 从 asar 抽取的工具脚本

当初用来把这些材料解出来的小工具，保留下来以便将来 DSH 升级后重新抽取。

| 文件 | 用途 |
|---|---|
| `_asar3.mjs` | 读 `app.asar` 头，按关键字搜索并列出命中文件（用法：`node _asar3.mjs <keyword>`） |
| `_get.mjs` | 从 asar 提取单个文件 |
| `_ls.mjs` | 列出 asar 内文件树 |
| `_win.py` | 窗口信息探测（ctypes / user32），与 asar 无关，属早期调试残留 |

> 这些脚本里的绝对路径写死为 `D:/ProgramFiles/DSH/resources/app.asar`，换机器后需自行调整。

## 注意事项

1. **不要把这些文件 import 进插件代码。** 它们是阅读材料，插件运行时只依赖 DSH 自己
   加载的模块。`lib/` 下的代码不应出现对本目录的任何引用。
2. **DSH 升级后可能过期。** 版本变了就去重抽，别把这里当作当前版本的权威签名——
   以实际运行时的 `ctx` 为准。
3. **`.html`/`.css`/`.tsx` 片段不参与构建。** `package.json` 的 `files[]` 不包含本目录，
   发布到 npm 的包里没有它们。