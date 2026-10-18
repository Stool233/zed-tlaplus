# TLA+ for Zed

[English](README.md) | 简体中文

这个项目起源于一个很简单的个人需求：我希望有一个 Zed 的 TLA+ 插件，提供语法提示、Go to Definition（定义跳转）和悬浮提示等功能，方便我在 Zed 里阅读 TLA+。

于是我随手让 GPT-6 Astra 写了一个。它通过 computer use 直接打开 Zed 桌面应用测试插件，很快就完成了实现和测试。

为 [Zed](https://zed.dev) 提供 TLA+ / PlusCal 语法高亮、定义跳转、悬浮说明、符号补全和参数提示。

**当前版本：0.3.0。** 请通过开发扩展方式安装。本仓库的扩展尚未发布到 Zed 官方扩展列表。

[路线图](ROADMAP.md) · [更新记录](CHANGELOG.md) · [贡献指南](CONTRIBUTING.md) · [发布指南](docs/PUBLISHING.md)

## 功能

| 功能 | 支持范围 |
| --- | --- |
| 语法高亮 | TLA+、ASCII / Unicode 运算符、证明以及注释内的 PlusCal |
| 定义跳转 | 变量、常量、算子、参数、`LET`、量词和 `EXTENDS` / `INSTANCE` 导入 |
| 悬浮说明 | 定义、签名、来源模块和说明注释 |
| 符号补全 | 当前可见符号、导入算子、`Instance!` 成员和模块名 |
| 参数提示 | 算子参数和当前参数位置，支持嵌套调用 |
| 标准库 | 内置 10 个官方模块，用于导航和说明 |
| 模板补全 | 68 个规约、表达式、标准库调用和 PlusCal 模板 |
| 编辑器集成 | 括号匹配、自动缩进、Outline 符号导航和 Vim 文本对象 |

语言服务器基于 Tree-sitter，使用 Zed 管理的 Node.js，以上编辑功能无需 Java。SANY 诊断、TLC 模型检查和 PlusCal 翻译另列于路线图。

## 安装

1. 克隆本仓库：`git clone https://github.com/Stool233/zed-tlaplus.git`。
2. 使用近期版本的 Zed，按[开发扩展说明](https://zed.dev/docs/extensions/developing-extensions)准备环境；需要安装 Rust 时请使用 rustup。
3. 在命令面板执行 **`zed: install dev extension`**，选择包含 `extension.toml` 的项目根目录。也可在 Extensions 页面点击 **Install Dev Extension**。
4. 打开 [`examples/Editing.tla`](examples/Editing.tla)，语言指示器应显示 **TLA+**。

首次构建需要下载 GitHub 上的语法、Rust 依赖和 WASI 工具链。首次使用时，Zed 还会按需准备 Node.js，并从 npm 安装固定版本的 `web-tree-sitter`。准备完成后，编辑功能可离线使用。

修改扩展后，在 Extensions 页面点击 **Rebuild**。已打开的 TLA+ 文件未恢复连接时，执行 **`editor: restart language server`**。

## 快速体验

打开 [`examples/Editing.tla`](examples/Editing.tla)，在命令面板使用以下命令：

| 命令 | 示例 |
| --- | --- |
| `editor: go to definition` | 从 `Len` 跳到内置 `Sequences.tla` 中的定义 |
| `editor: hover` | 查看 `Enqueue` 的定义和前置说明注释 |
| `editor: show completions` | 输入 `Enq` 补全本地算子，输入 `Library!` 查看实例成员 |
| `editor: show signature help` | 编辑参数时查看 `Append(s, e)` 及当前参数 |

[`examples/Navigation.tla`](examples/Navigation.tla) 展示跨文件导入、参数、局部定义和量词作用域。未保存的修改会立即反映到导航与补全，包括导入模块中的修改。

符号补全插入名称；模板补全插入带 Tab 占位符的代码。输入 `forall` 并接受模板，即可插入：

```tla
\A x \in S : P(x)
```

常用模板前缀：

| 前缀 | 模板 |
| --- | --- |
| `module`、`specification` | 模块与状态规约 |
| `EXTENDS`、`CONSTANTS`、`VARIABLES` | 导入和声明 |
| `Init`、`Next`、`Spec`、`TypeOK` | 状态谓词、动作、行为规约与不变式 |
| `operator`、`function`、`INSTANCE` | 定义与模块实例 |
| `IF`、`CASE`、`LET`、`forall`、`exists`、`CHOOSE` | 条件、局部定义与量词 |
| `setfilter`、`setmap`、`fn`、`record`、`EXCEPT` | 集合、函数、记录和更新 |
| `always`、`eventually`、`leadsto`、`WF`、`SF` | 时序逻辑和公平性 |
| `Len`、`Append`、`Head`、`Tail`、`Seq`、`Cardinality` | 标准库调用 |
| `algorithm`、`pcalprocess`、`pcalwhile`、`pcalif` | PlusCal 算法和语句 |

完整列表见[片段文件](snippets/tla+.json)。所需的 `EXTENDS` 需自行添加，模板不会修改导入。PlusCal 模板使用 p-syntax；高亮同时支持 p-syntax 和 C-syntax。

## 配置

导入模块按以下顺序查找：

1. 当前文件所在目录。
2. 工作区根目录。
3. 配置的 `modulePaths`。
4. 内置标准模块。

文件名必须为 `模块名.tla`。服务器只沿显式导入解析，不递归扫描整个项目。可在 Zed 设置中添加其他库目录：

```json
{
  "lsp": {
    "tlaplus": {
      "initialization_options": {
        "modulePaths": ["lib", "/absolute/path/to/StandardModules"]
      }
    }
  },
  "languages": {
    "TLA+": {
      "show_completions_on_input": true,
      "tab_size": 4
    }
  }
}
```

相对模块路径以工作区根目录为基准；修改后重启语言服务器。项目和配置目录中的同名模块优先于内置模块。当前不读取 `tla2tools.jar` 或 `TLA_LIBRARY`。

内置 `Naturals`、`Integers`、`Reals`、`Sequences`、`FiniteSets`、`Bags`、`TLC`、`RealTime`、`Randomization` 和 `Toolbox`，固定到 TLA+ tools v1.7.4，仍需通过 `EXTENDS` / `INSTANCE` 显式导入。详见[来源、许可证与校验值](server/standard_modules/README.md)。

## 当前限制

- 导航和编辑辅助基于语法树与词法作用域；能够跳转不代表规约在语义上有效。
- 语言服务器尚不支持 PlusCal 内部符号、结构化证明上下文，以及 `Op!label` / `Op!1` 等子表达式选择器。PlusCal 和证明仍有语法高亮。
- 注释、字符串和记录字段不提供普通符号提示。严重不完整的语法可能没有结果。
- 实例说明显示原始定义，不计算 `WITH` 替换后的表达式。数值标准模块中的占位实现会在悬浮说明中标注，并只展示签名。
- 尚未实现语义诊断、类型推断、查找引用、重命名、模型检查和 PlusCal 翻译。
- `.cfg` 不自动关联为 TLA+，以免误识别其他软件的配置文件。

## 示例

| 文件 | 用途 |
| --- | --- |
| [Counter.tla](examples/Counter.tla) / [Counter.cfg](examples/Counter.cfg) | 有界计数器、时序规约及 `Max = 3` 的 TLC 配置 |
| [PlusCalCounter.tla](examples/PlusCalCounter.tla) | PlusCal 高亮；模型检查前需用官方工具翻译 |
| [Navigation.tla](examples/Navigation.tla) | 局部作用域、导入和实例跳转 |
| [Editing.tla](examples/Editing.tla) | 标准库导航、悬浮说明、补全和参数提示 |

若已单独安装 Java 和 `tla2tools.jar`，可在扩展之外检查计数器示例：

```sh
cd examples
java -cp /absolute/path/to/tla2tools.jar tlc2.TLC -config Counter.cfg Counter.tla
```

## 故障排查

- **没有补全提示：**执行 `editor: show completions`，检查语言指示器及上述配置。自动显示参数提示也取决于 Zed 的相关设置。
- **重建后无法跳转：**执行 `editor: restart language server`；仍有问题时通过 `zed: open log` 查看日志。
- **多次开发重建后出现重复模板：**重启 Zed，清空进程中的片段缓存。
- **单引号不自动配对：**这是预期行为，`'` 是 TLA+ 的后继状态运算符。

## 开发与路线图

[贡献指南](CONTRIBUTING.md)包含环境准备、验证命令、目录结构和依赖更新方法；[服务器文档](server/README.md)说明作用域解析和语法构建。

[路线图](ROADMAP.md)优先安排发布打包、语法诊断、查找引用和安全重命名，之后再接入可选的官方 TLA+ 工具。[发布指南](docs/PUBLISHING.md)记录了官方收录要求及当前待办。开发和维护文档以英文为主。

## 致谢与许可证

解析器来自 [tree-sitter-tlaplus](https://github.com/tlaplus-community/tree-sitter-tlaplus)，标准模块来自 [TLA+ tools](https://github.com/tlaplus/tlaplus)。相关 Zed 项目包括 [Akanoa/Zed-editor-TLA-syntax](https://github.com/Akanoa/Zed-editor-TLA-syntax) 和 [suckrowPierre/zed-tlaplus](https://github.com/suckrowPierre/zed-tlaplus)。

本项目采用 [MIT 许可证](LICENSE)。随附组件保留各自的[语法许可证](server/tree-sitter-tlaplus.LICENSE)和[标准模块许可证](server/standard_modules/LICENSE)。
