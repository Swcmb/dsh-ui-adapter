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

本插件自身代码采用 GPL-3.0-or-later（见 `LICENSE`）。MIT 与 GPLv3 兼容，
汇入时保留上述 MIT 声明。
