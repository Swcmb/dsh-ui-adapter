# Third-party notices

本插件的内联算法移植自以下项目，保留其授权声明：

- **dsh-claude-style** — <https://github.com/Nwflower/dsh-claude-style>
  - 授权：MIT License, Copyright (c) 2026 Nwflower
  - 移植内容：`lib/tokens.mjs`（token 按字符类别估算、图片 token、消息分项），
    `lib/client.js` 中的上下文分项算法与中文文案。
  - 移植方式：按最小功能重新实现，去掉原项目对自身 core/engine/contracts 框架的依赖，
    改为直接运行于原生 DSH 之上。

MIT 授权全文：

```
MIT License

Copyright (c) 2026 Nwflower

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

本插件自身代码采用 GPL-3.0-or-later（见 `COPYING`）。MIT 与 GPLv3 兼容，
汇入时保留上述 MIT 声明。

## 参考资料（不参与构建）

- **DeepSeek Harness** — <https://github.com/deepseek-ai/deepseek-harness>
  - 授权：MIT License（`@deepseek-ai/dsh` 声明 `"license": "MIT"`）
  - 位置：`docs/dsh-internals/`（`source/` 源码、`bundles/` 打包产物、`tools/` 抽取脚本）
  - 抽取自：本机 DSH `0.2.2-rc.5` 的 `resources/app.asar`
  - 用途：本插件的 `default-sidebar-tab` 模块直接调用 DSH 未公开文档的
    `ctx.sidebarRight` / `sidebarRightTabs` 内部接口，这些材料用于核对真实签名。
  - **本目录内容仍为 MIT 授权，不受本仓库 GPL-3.0-or-later 覆盖**；不进入 `files[]`，
    不随 npm 包发布。详见 [docs/dsh-internals/README.md](docs/dsh-internals/README.md)。
