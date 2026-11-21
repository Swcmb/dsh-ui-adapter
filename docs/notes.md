# 设计笔记与排障

本文件记录 `dsh-context-bili-bridge` 的设计依据与开发过程中实测得出的 DSH 平台行为。
所有结论都来自对运行中实例的验证（网络抓包、路由探针、`.host.log` / `client:diag`），
不是文档推测。日期均为 2026-11-12。

## 1. 侦察结论

| 事实 | 证据 |
|---|---|
| 两个插件都注册 `conversation.view`，导致顶栏两个重名的「上下文」标签 | 两个包的 client 反编译 |
| `billion-context` 官方提供 `dsh.contextTab: false`，只移除标签，压缩/设置页/Web UI 全保留 | 其 `CONFIGURATION.zh-CN.md`；`dsh-native-client.js` 的 `readCtxTabFace()` 仅在 `!hidden` 时注册 |
| `dsh-context` 的 token 卡读 `useProjection('tokenUsage')`，值固定 4 字段 | `dsh-context` client 的 `dt(e,'tokenUsage',Qe)` 与校验器 `Qe` |
| `billion` 的 `inputTokens` 是计费输入总量（含缓存命中） | 实测三数自洽：输入 9879258 / 命中 1728 / 命中率 0.0175% |
| 两边数据同源（都来自上游 usage），历史差异只是舍入与刷新时机 | 对 18787 实时账本比对 |

## 2. 为什么数据必须走 host 半的代理

billion 的账本端口（`127.0.0.1:18787`）**不发 `Access-Control-Allow-Origin`**，而它自带的
同源 relay（`/__bili` 前缀，受 `security.adminRelay` 开关控制）默认是关的：

```
GET http://127.0.0.1:18787/__bili/sessions   → 200，但响应头无 ACAO
OPTIONS 同路径                                → 404
DSH 页面上的 /__bili/sessions                 → 404 admin relay disabled
```

所以从 DSH 页面直接 fetch 上游必然被浏览器拦掉，界面显示「billion 未运行」——代理其实
活得好好的。本插件因此在 host 半注册三条只读同源路由（`lib/proxy.mjs`），由 DSH 进程内
转发，Node 侧无 CORS：

| 路由 | 作用 |
|---|---|
| `GET /__ctx-bili/sessions` | 转发 `${origin}/__bili/sessions`，原样返回账本 |
| `GET /__ctx-bili/status` | 返回 `{origin, pid, live, source}`，供浮层定位 Web UI |
| `POST /__ctx-bili/diag` | 接收渲染层诊断，写进 `.host.log` |

不改 billion 的配置，不开新端口，不动它的 `adminRelay`。

桌面端可行性依据：`dsh-app://app/*` 协议处理器只把 `/`、`/index.html`、`/assets/*`、
`/favicon.svg` 走静态文件，**其余路径一律 `forwardWebRequest()` 转发给 host web 服务器**
并附带 cookie——所以页面里的同源相对路径 fetch 一定能命中自定义路由。

## 3. Cordis 服务注入：host 半与 client 半规则相反

开发中最耗时的一课，两条规则方向相反，都实测确认过：

| 平面 | 正确姿势 | 运行时注入的下场 |
|---|---|---|
| **host 半** | 模块级 `export const inject = ['webServer']` | `ctx.inject(['webServer'], cb)` 的**回调永远不触发**，静默失败 |
| **client 半** | 运行时 `ctx.inject(['sessions'], sub => sub.sessions)`（dsh-context 注入 `configForms` 同款） | 可行 |

配套事实：

- 未声明就访问 `ctx.webServer` 属性**直接抛错**（实测 `webServerProp: "throws"`）；
- 在 Cordis 上下文上随手赋值（`ctx.someField = x`）也会抛错——它会中断 `apply`，而异常
  被插件加载器吞掉，外部只见「路由 404」；
- client 半读 `ctx.get('sessions')` 在未注入的 scope 里返回 `undefined`；
- `sessions` 服务由客户端 app 根上的 `session-controller.client` 提供
  （`rootCtx.reflect.provide("sessions", …)`），但插件 client 半只能看见**自己注入**的服务；
- webServer 路由契约：`webServer.register({kind:'exact'|'prefix', path, handler(req,res)})`，
  同路径重复注册会 throw；
- `package.json` 的 `dsh.client.inject` 字段声明的是**模块依赖**（官方示例
  `@local/my-decoration` 注入 `@deepseek-ai/dsh-client-ui-conversation`），与服务注入是
  两回事，别混淆。

参照物：本 profile 里自带路由的 `dsh-docs-panel`（host 半 `inject = ['fs','shell','webServer']`）、
`@michengai/dsh-archive-manager` 均为模块级声明。

## 4. tokenUsage 投影的接管方式

`useProjection('tokenUsage')` 的解析终点是**当前会话的 `ProjectionValueStore`**，客户端
插件里的入口是 `sessions.binding(sessionId).session.projections`（官方 ui-chat 读
`workingDirectory` 就是这条路径）。store 的公开写接口是
`apply(key, value, seq)`，**higher-seq-wins**：写 `seqOf(key)+1` 即可让 billion 账本值
盖过 host 计算的原生行，不需要包装任何 provider。

「当前会话」的判定：sessions 列表快照**没有** `.current` 字段（实际形状
`{ids, byId, phase, projectionsBySession}`）。按官方 ui-agent-preset 的方式用
`retainInfo(id).retainedBy.mainView > 0` 找主视图持有的会话；只有一个会话时直接用之。

## 5. 浮层为什么用 `?theme=` 而不是 `?embed=1`

`?embed=1` 是 billion 给「嵌在宿主设置页里的窄面板」用的形态：隐藏 topbar、压缩表格列，
且它自己的 CSS 注释写着 `--bg: transparent`。放进浮层就是一块透明玻璃。现在用完整页面
+ 显式 `?theme=light|dark`（跟随 DSH 主题），浮层自身铺实心底色，`Esc` / 点遮罩关闭。

## 6. 会话匹配

billion 的 `label` 是 `session-<uuid>`，子代理再带 `|sub:<hash>` 后缀，而 DSH 给的是裸
id。两边先归一化（去 `session-` 前缀、截掉 `|` 之后、转小写）再比较：

```
exact     → 某个键与当前会话 id 完全相等
loose     → 某个键互为子串
fallback  → 匹配不上但账本非空，取 lastSeen 最新并在卡片标注「最新会话」
```

宁可标「最新会话」也不谎报「未连接」。

## 7. 排障口诀

**「路由 404 / 界面说未连接 / 统计卡未接管」→ 先看包目录下的 `.host.log`，不要猜 UI。**

| 日志 | 含义 |
|---|---|
| 无 `apply:enter` | host 半没被加载（profile / bundle 问题） |
| `bind:no-webserver` | 模块没声明 `inject: ['webServer']` |
| `bind:routes-ok` | 路由注册成功 |
| `route:hit {status:200}` | **页面在轮询并拿到了数据**——问题只可能在渲染 |
| 无 `route:hit` | 页面没打到路由（重启 DSH 后重载页面） |
| `client:diag {via,sessions,id,shim}` | 渲染层每 30 秒上报的真实状态 |

`route:hit` 同时证明三件事：页面加载了 client 半、`dsh-app://` 转发确实打到了路由、
上游账本返回成功。

**重启语义**：host 半的路由在进程启动时注册，只按 Ctrl+R 不会重新执行 `apply()`——
改了 host 半必须重启 DSH 进程；改了 client 半则刷新页面即可。

**链路改动的验证方法**：不靠「看起来有没有数」。给路由加计数打点（`route:hit`），
给渲染层加诊断上报（`client:diag`），一眼区分「链路没通」和「渲染出错」。

## 8. 版本沿革

| 版本 | 变更 |
|---|---|
| v0.1 | 单标签 + `shell.overlay` 悬浮按钮 + registry 装饰式垫片（事后证明找错了对象） |
| v0.2 | 切换控件移入广告位；origin 自动发现；三条同源路由替代跨域直连；浮层 `?theme=` |
| v0.3 | host 半改为模块级 `inject`（路由真正注册）；client 半运行时注入 `sessions`；垫片改为投影 store 直写（`apply` + higher-seq-wins）；新增 `.host.log` 打点与 `client:diag` 上报 |

## 9. 广告位参考

`dsh-context` 的赞助商卡片数据来自其 host 路由 `POST api/dsh-context/recom`
（上游 `data/recoms.json`，1h 缓存，失败降级 gh-proxy / 内联兜底条）。2026-11-12 拉到的
三条原文快照见 [recoms.snapshot.json](recoms.snapshot.json)：

| # | 品牌 | 落地页 |
|---|---|---|
| 1 | DeepSeek —「探索未至之境。」 | platform.deepseek.com |
| 2 | Zilliz Cloud —「Milvus原厂，全能 AI 检索。」 | cloud.zilliz.com.cn |
| 3 | PowerContext —「OB开源 Agent 记忆及上下文引擎」 | github.com/oceanbase/powercontext |

广告锚点 DOM：`a.lc-card.lc-recom`（`.lc-recom-main` / `.lc-recom-promo` / `.lc-recom-tooltip`），
轮播初始随机、成功后顺序推进，`degraded` 时固定第 1 条。本插件以一条 CSS 规则隐藏该
锚点并原位替换，轮播逻辑本身不受影响。
