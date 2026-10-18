# TLA+ for Zed

为 Zed 提供 TLA+ / PlusCal 语法高亮，以及 TLA+ 定义跳转、悬浮说明、作用域补全和参数提示。

## 功能

- 自动识别 `.tla` 文件，支持 ASCII / Unicode TLA+ 运算符。
- 高亮模块、常量、变量、算子、时序公式、证明和注释内的 PlusCal。
- 提供 68 个模块、状态规约、量词、集合、函数、记录、时序逻辑、标准库调用和 PlusCal 模板补全。
- 支持 Tab 占位符、括号配对、自动缩进、Outline 符号导航和 Vim 文本对象。
- Go to Definition：变量、常量、算子、参数、`LET`、量词，以及 `EXTENDS` / `INSTANCE` 跨文件跳转。
- Hover：显示符号定义、参数、说明注释和所属模块。
- 作用域补全：当前可见变量、参数、局部算子、导入符号和 `Instance!` 成员，以及 `EXTENDS` / `INSTANCE` 模块名。
- 参数提示：显示算子签名和当前参数，支持嵌套调用及 `Test(_)` 等高阶算子参数。
- 内置 10 个官方标准模块，`Len`、`Append`、`Cardinality` 等可直接跳转、补全和查看说明。
- 模板由 Zed 原生 snippets 提供；上述语言功能由内置的轻量语言服务器提供，使用 Zed 管理的 Node.js，无需 Java。

当前版本为 v0.3.0。语义报错、变量类型推断、TLC 模型检查和 PlusCal 翻译不包含在此版本中。

## 安装

1. 使用近期版本的 Zed。开发扩展的构建环境按 [Zed 官方说明](https://zed.dev/docs/extensions/developing-extensions) 配置；如需安装 Rust，使用 rustup。
2. 打开命令面板，执行 **`zed: install dev extension`**，选择本项目根目录（包含 `extension.toml` 的目录）。也可从 Extensions 页面点击 **Install Dev Extension**。
3. 首次安装时 Zed 会下载固定版本的 Tree-sitter 语法、WASI 编译工具和 Rust 依赖；首次打开 TLA+ 文件时会准备 Node.js（若尚未安装）和固定版本的 `web-tree-sitter`，需要能访问 GitHub、crates.io、Node.js 下载源及 npm。完成后可离线使用。
4. 打开 `examples/Counter.tla`，右下角语言应为 **TLA+**。修改扩展后，在 Extensions 页面点击该开发扩展的 **Rebuild**。

从 v0.2.0 起，扩展包含 Rust 入口，用于启动内置语言服务器。通过 Zed 的 **Rebuild** 构建和重新加载；开发时也可用下文的 Cargo 命令检查编译。

重建后，若已有 TLA+ 文件没有恢复跳转，在该文件中执行 **`editor: restart language server`**。

开发安装或重建后若出现重复的补全候选，重启 Zed 可清空本次进程的片段缓存。本次联调观察到开发扩展被连续加载两次；[Zed 的片段注册实现](https://github.com/zed-industries/zed/blob/main/crates/snippet_provider/src/registry.rs) 会追加片段。扩展清单只注册了一份片段，重复候选不影响插入结果。

## Go to Definition

把光标放在符号上，执行命令面板的 **`editor: go to definition`**（默认 `F12`，macOS 也可 `Cmd+点击`）。打开 [`examples/Navigation.tla`](examples/Navigation.tla) 试用：

- `Step == Increment` 中的 `Increment` 跳到 `Counter.tla` 的算子定义。
- `Current == count` 中的 `count` 跳到 `VARIABLE count`。
- `CounterInstance!Reset` 中的实例名跳到本文件的实例定义，`Reset` 跳到 `Counter.tla`。
- `Twice(x)`、`LET` 内参数和量词里的 `x` 按各自的作用域跳转。

支持未保存的编辑、中文/emoji 注释、ASCII / Unicode 运算符、嵌套模块、传递导入、`LOCAL` 导出限制和 `INSTANCE ... WITH` 的源/目标符号。注释、字符串、记录字段和未解析的名字不会被当作普通变量跳转。

外部模块按「当前文件目录 → 工作区根目录 → 自定义模块目录 → 内置标准库」查找，文件名需为 `模块名.tla`。只沿显式导入解析，不递归扫描整个项目。库在其他目录时，在 Zed 设置中配置：

```json
{
  "lsp": {
    "tlaplus": {
      "initialization_options": {
        "modulePaths": ["lib", "/absolute/path/to/StandardModules"]
      }
    }
  }
}
```

相对路径以工作区根目录为基准；修改后执行 **`editor: restart language server`**。内置标准库作为最后的查找候选，项目和配置目录中的同名模块优先。当前不读取 `tla2tools.jar` 或 `TLA_LIBRARY`。

内置 `Naturals`、`Integers`、`Reals`、`Sequences`、`FiniteSets`、`Bags`、`TLC`、`RealTime`、`Randomization`、`Toolbox`，来源固定到官方 TLA+ tools v1.7.4，随扩展提供，可离线使用。来源、许可证和校验值见 [`server/standard_modules/README.md`](server/standard_modules/README.md)。标准模块仍需通过 `EXTENDS` / `INSTANCE` 显式引入；`Sequences` 的局部导入不会让 `Nat` 自动进入当前作用域。

此版本通过语法树提供定义导航，不执行 SANY 语义检查。PlusCal 内部符号、结构化证明上下文、`Op!label` / `Op!1` 等子表达式选择器暂不支持。未完成语法按可解析部分提供跳转；能够跳转不代表规约在语义上有效。

## 悬浮说明、符号补全与参数提示

打开 [`examples/Editing.tla`](examples/Editing.tla) 体验：

- 指向 `Enqueue`，或执行 **`editor: hover`**，可查看其参数、定义和前置说明注释。
- 指向 `Len` 或 `Append`，查看官方标准库说明；定义跳转会打开随扩展提供的 `.tla` 文件。
- 在表达式中输入 `Enq`，执行 **`editor: show completions`**，选择当前模块的 `Enqueue`。
- 输入 `Library!` 查看该实例的可导出成员；`LOCAL` 定义和被实例化模块的常量、变量不会混入成员列表。
- 在 `Append(queue, ...)` 的参数内执行 **`editor: show signature help`**，显示 `Append(s, e)`，并突出当前参数。输入 `(` / `,` 时是否自动显示取决于 Zed 的参数提示设置。

补全遵守参数、`LET` 和量词的作用域与同名遮蔽；候选附带签名和来源，接受后仅插入符号名称。原来的模板补全仍保留，适合插入调用骨架。跨模块的未保存修改也会立即反映到补全、悬浮说明和参数提示中。

对于 `Append(`、`Library!` 等未完成输入，服务器用临时语法树尽量恢复上下文，不会修改文件。严重不完整的语法可能没有候选。记录字段、注释、字符串、PlusCal 内部和尚未支持的证明上下文不提供这些语义提示。实例成员展示原始模块中的定义，不计算 `WITH` 替换后的表达式。

部分官方数值模块包含供工具覆盖的占位实现。悬浮说明会明确标注，并只显示签名，避免将占位表达式当成数学定义。

## 使用模板补全

在 `.tla` 文件中输入前缀，选择补全项并按 Enter/Tab 接受，再用 Tab 在参数占位符之间跳转。例如输入 `forall` 得到：

```tla
\A x \in S : P(x)
```

常用前缀：

| 前缀 | 插入内容 |
| --- | --- |
| `module` / `specification` | 模块骨架 / 完整状态规约模板 |
| `EXTENDS` / `CONSTANTS` / `VARIABLES` | 导入模块 / 常量 / 状态变量 |
| `Init` / `Next` / `Spec` / `TypeOK` | 初始状态、动作、行为规约和类型不变式 |
| `operator` / `function` / `INSTANCE` | 算子、函数或模块实例 |
| `IF` / `CASE` / `LET` | 条件、多分支和局部定义 |
| `forall` / `exists` / `CHOOSE` | 量词和选择表达式 |
| `setfilter` / `setmap` / `fn` / `record` / `EXCEPT` | 集合、函数、记录和更新 |
| `always` / `eventually` / `leadsto` / `WF` / `SF` | 时序逻辑和公平性 |
| `Len` / `Append` / `Head` / `Tail` / `Seq` | Sequences 标准模块调用 |
| `Cardinality` / `IsFiniteSet` | FiniteSets 标准模块调用 |
| `algorithm` / `pcalprocess` | PlusCal p-syntax 算法模板 |
| `pcalwhile` / `pcalif` / `await` / `assert` / `assign` | PlusCal 算法体内的语句 |

全部片段见 [`snippets/tla+.json`](snippets/tla+.json)。需要标准模块的调用会在补全说明中标注，`EXTENDS` 需自行添加。PlusCal 片段使用 p-syntax；高亮同时支持 p-syntax 和 C-syntax。

没有自动弹出提示时，执行命令面板的 **`editor: show completions`**，或按 `Ctrl+Space`。macOS 若将它用于切换输入法，可通过命令面板触发，或调整系统快捷键。也可检查 Zed 设置：

```json
{
  "languages": {
    "TLA+": {
      "show_completions_on_input": true,
      "tab_size": 4
    }
  }
}
```

`'` 是 TLA+ 的后继状态运算符，因此不会自动补第二个单引号。PlusCal 算法位于 `(* ... *)` 内时仍使用代码高亮。

## 示例

- [`examples/Counter.tla`](examples/Counter.tla)：有界计数器，展示状态、动作、时序规约和不变式。
- [`examples/Counter.cfg`](examples/Counter.cfg)：配套 TLC 配置，`Max = 3`。`.cfg` 没有注册为 TLA+，避免误识别其他软件的配置文件。
- [`examples/PlusCalCounter.tla`](examples/PlusCalCounter.tla)：PlusCal 算法高亮示例；运行 TLC 前需用官方工具翻译。
- [`examples/Navigation.tla`](examples/Navigation.tla)：同文件作用域、跨文件导入和实例定义跳转。
- [`examples/Editing.tla`](examples/Editing.tla)：标准库、悬浮说明、作用域补全和参数提示。

如已自行安装 Java 和官方 `tla2tools.jar`，可独立检查计数器示例：

```sh
cd examples
java -cp /absolute/path/to/tla2tools.jar tlc2.TLC -config Counter.cfg Counter.tla
```

## 验证与开发

Python 3.9+ 和 C 编译器用于安装与清单同版本的语法包，验证高亮和片段。这些 Python 依赖不参与扩展运行：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m unittest discover -s tests -v
```

Windows 使用 `.venv\Scripts\python`。若本机 pip 设置了 `user = true`，在安装命令前加 `PIP_USER=0`（PowerShell 设置 `$env:PIP_USER = "0"`）。

验证覆盖清单/语言/片段关联、所有 Tree-sitter 查询编译、示例解析、每个模板展开后的语法、反斜杠保留、PlusCal 注释边界、符号导航、括号匹配和 Unicode 运算符。语言服务器测试还覆盖作用域补全、悬浮说明、嵌套调用参数提示、未保存编辑、实际 stdio LSP 通信，以及内置标准库的上游校验值和解析兼容性。Tree-sitter 的语法通过不等同于 SANY 语义校验或 TLC 模型检查。

定义解析和实际 stdio LSP 测试使用 Node.js 20+；Rust 入口使用 rustup 工具链：

```sh
npm ci --ignore-scripts
npm test
rustup target add wasm32-wasip2
cargo build --release --target wasm32-wasip2 --locked
```

语言服务器的 WASM 语法已随仓库提供，来源、许可证和重建方法见 [`server/README.md`](server/README.md)。只有升级语法版本时需要重新构建它。

```text
extension.toml             扩展清单、固定语法版本和片段注册
src/lib.rs                 Zed Rust 入口、运行时准备和服务器启动
server/                    LSP 通信、作用域解析、编辑辅助及固定版本的 WASM 语法
server/standard_modules/   固定版本的官方标准模块、许可证及来源校验值
languages/tlaplus/         语言设置及高亮、括号、缩进、Outline 等查询
snippets/tla+.json         语言名 TLA+ 对应的小写片段文件名
examples/                 TLA+ / PlusCal 示例
tests/test_extension.py   实际解析器验证
tests/*.test.cjs          定义解析、编辑辅助、标准库和 stdio LSP 测试
```

更新语法版本时，同时更新 `extension.toml` 和 `requirements-dev.txt` 的提交 SHA、重建 `server/tree-sitter-tlaplus.wasm` 并更新来源说明，再运行验证。发布到扩展市场前，需准备可公开访问的仓库、确认维护者信息，并按 [Zed 发布流程](https://zed.dev/docs/extensions/developing-extensions#publishing-your-extension) 提交；当前配置可直接用于本地开发安装。

## 参考

- [Zed Language Extensions](https://zed.dev/docs/extensions/languages)
- [Zed Snippet Extensions](https://zed.dev/docs/extensions/snippets) 与 [Snippet 格式](https://zed.dev/docs/snippets)
- [tree-sitter-tlaplus](https://github.com/tlaplus-community/tree-sitter-tlaplus)，MIT，语法由 Zed 按固定提交下载。

本项目采用 MIT 许可，见 [LICENSE](LICENSE)。
