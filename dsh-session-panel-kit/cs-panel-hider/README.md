# dsh-cs-panel-hider

独立补丁插件：**隐藏 `dsh-claude-style` 的会话详情栏与它顶部的开关图标**。

不修改 dsh-claude-style 的任何文件；只用 CSS 隐藏它的节点，并用轻量 DOM 观察清掉它给 body 打的布局标记。只依赖原生 DSH，可独立运行，不依赖 dsh-claude-style 或任何其它插件。

## 隐藏的目标

| 目标 | 选择器 | 说明 |
| --- | --- | --- |
| 详情栏（红框右侧的整栏） | `.dsh-claude-details-root` | dsh-claude-style 自挂载到 body 的容器 |
| 顶部开关图标（红框里的列表图标） | `.dsh-claude-session-panel-button` | 注册在会话头部 utilities 槽，`aria-label="会话详情"` |
| 布局副作用 | `body[data-dsh-claude-session-panel]` | 原插件用它把头部让位给面板，补丁持续清掉以恢复原布局 |

## 为什么用 CSS 隐藏而不是删节点

这两个节点属于 dsh-claude-style 自己的 React 树。直接 `remove()` 会在它下次渲染时被重建，还可能让 React 的后续操作报错。CSS `!important` 能覆盖它的 inline style，原插件重渲染/重建节点后依然生效，且不动它的状态——这是最稳的做法。

面板是 `position:fixed`、不占文档流，隐藏后对话区不会留空白。

## 结构

```
lib/
  client.js   原生 ModuleLoader 模块：注入 CSS + MutationObserver
  index.mjs   空 host 入口（本补丁不需要 host 能力）
```

## 授权

GPL-3.0-or-later（见 `LICENSE`）。本插件未复制 dsh-claude-style 的代码，只引用它的 DOM class 作为隐藏目标。
