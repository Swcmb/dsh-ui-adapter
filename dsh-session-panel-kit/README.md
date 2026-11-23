# dsh-session-panel-kit

DSH（DeepSeek Harness）右侧会话详情栏的一体化插件包，由原先三个独立仓库合并而来，三个子目录各自保留完整 Git 历史。

| 子目录 | 包名 | 作用 |
|---|---|---|
| [`session-panel/`](./session-panel) | `@local/dsh-session-panel` | 在原生右侧栏注册「会话详情」tab 类型（kind `dsh-session-details`），提供 guide 入口卡片：环境 / 上下文 / 会话统计 / Token 用量 / 子智能体。仅依赖原生 DSH。 |
| [`cs-panel-hider/`](./cs-panel-hider) | `@local/dsh-cs-panel-hider` | 隐藏 `dsh-claude-style` 自带的会话详情面板与顶部图标。纯 CSS 补丁插件，仅依赖原生 DSH。 |
| [`default-sidebar-tab/`](./default-sidebar-tab) | `@local/dsh-default-sidebar-tab` | 右侧栏打开时，把原生播种的「开始」页原地替换为指定 tab（默认 `dsh-session-details`，即会话详情）。仅依赖原生 DSH。 |

三个包互相独立，可分别安装。一起安装时的效果：右侧栏打开即直接显示**会话详情**面板；`dsh-claude-style` 的旧面板与图标被隐藏。

## 协作契约

`default-sidebar-tab` 通过 tab **kind** 字符串引用 `session-panel` 注册的类型，二者通过约定耦合而非直接依赖：

```
session-panel       →  ctx.sidebarRightTabs.register({ id: '@local/dsh-session-panel',
                                                        kind: 'dsh-session-details', ... })
default-sidebar-tab →  DEFAULT_TAB = 'dsh-session-details'
```

修改 kind 时需同步两处：`session-panel/lib/client.js` 的 `TAB_KIND` 与 `default-sidebar-tab/lib/config.mjs` 的 `DEFAULT_TAB`。

## 历史

三个原仓库的历史均已并入本仓库（原仓库已删除）：

- `session-panel` ← `Swcmb/dsh-session-panel`
- `cs-panel-hider` ← `Swcmb/dsh-cs-panel-hider`
- `default-sidebar-tab` ← 本地仓库（原本就没有远程）

## 许可

- `session-panel`：GPL-3.0-or-later（文案与分项算法移植自 dsh-claude-style，MIT）
- 其余两个包：见各目录内 LICENSE
