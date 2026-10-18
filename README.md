# TLA+ for Zed

English | [简体中文](README.zh-CN.md)

This project started with a simple personal need: I wanted a TLA+ extension with syntax suggestions, Go to Definition, and hover documentation to make reading TLA+ in Zed easier. The existing Zed TLA+ extensions I found were missing Go to Definition and other reading aids I wanted.

So, on a whim, I asked GPT-6 Astra to build one. It used computer use to open the Zed desktop app and test the extension directly, and got the implementation and testing done quickly.

TLA+ and PlusCal editing support for [Zed](https://zed.dev), with syntax highlighting, Go to Definition, hover documentation, symbol completion, and signature help.

**Current version: 0.3.0.** Install this project as a development extension. This repository's extension has not been published to the Zed extension registry.

[Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Publishing guide](docs/PUBLISHING.md)

## Features

| Feature | Support |
| --- | --- |
| Syntax highlighting | TLA+, ASCII and Unicode operators, proofs, and PlusCal in comments |
| Go to Definition | Variables, constants, operators, parameters, `LET`, quantifiers, and imports through `EXTENDS` / `INSTANCE` |
| Hover documentation | Definitions, signatures, source modules, and documentation comments |
| Symbol completion | Visible bindings, imported operators, `Instance!` members, and module names |
| Signature help | Operator parameters and the active argument, including nested calls |
| Standard library | Ten bundled official modules for navigation and documentation |
| Snippets | 68 templates for specifications, expressions, standard-library calls, and PlusCal |
| Editor integration | Bracket matching, indentation, outline symbols, and Vim text objects |

The language server uses Tree-sitter and Zed's managed Node.js runtime. Java is not needed for these editing features. SANY diagnostics, TLC model checking, and PlusCal translation are planned separately.

## Install

1. Clone this repository: `git clone https://github.com/Stool233/zed-tlaplus.git`.
2. Use a recent Zed release and set up the [development-extension prerequisites](https://zed.dev/docs/extensions/developing-extensions). Install Rust through rustup if needed.
3. Run **`zed: install dev extension`** from the command palette and select the directory containing `extension.toml`. You can also use **Install Dev Extension** on the Extensions page.
4. Open [`examples/Editing.tla`](examples/Editing.tla). The language indicator should read **TLA+**.

The initial build needs access to GitHub, Rust dependencies, and the WASI toolchain. On first use, Zed also prepares Node.js if needed and installs the pinned `web-tree-sitter` package from npm. Editing features work offline once setup is complete.

After changing the extension, click **Rebuild** on the Extensions page. If an already-open TLA+ file does not reconnect, run **`editor: restart language server`**.

## Try it

Open [`examples/Editing.tla`](examples/Editing.tla) and use these command-palette actions:

| Action | Example |
| --- | --- |
| `editor: go to definition` | Jump from `Len` to its bundled `Sequences.tla` definition |
| `editor: hover` | Inspect `Enqueue` and its documentation comment |
| `editor: show completions` | Type `Enq` for a local operator, or `Library!` for instance members |
| `editor: show signature help` | Inspect `Append(s, e)` while editing its arguments |

[`examples/Navigation.tla`](examples/Navigation.tla) also demonstrates cross-file imports, parameters, local definitions, and quantifier scopes. Unsaved edits are reflected in navigation and completion, including edits in imported modules.

Symbol completions insert a name. Snippets insert a template with Tab placeholders. Type `forall` and accept the snippet to insert:

```tla
\A x \in S : P(x)
```

Common snippet prefixes:

| Prefixes | Templates |
| --- | --- |
| `module`, `specification` | Module and state-machine specification |
| `EXTENDS`, `CONSTANTS`, `VARIABLES` | Imports and declarations |
| `Init`, `Next`, `Spec`, `TypeOK` | State predicates, actions, behavior, and invariants |
| `operator`, `function`, `INSTANCE` | Definitions and module instances |
| `IF`, `CASE`, `LET`, `forall`, `exists`, `CHOOSE` | Conditions, local definitions, and quantifiers |
| `setfilter`, `setmap`, `fn`, `record`, `EXCEPT` | Sets, functions, records, and updates |
| `always`, `eventually`, `leadsto`, `WF`, `SF` | Temporal logic and fairness |
| `Len`, `Append`, `Head`, `Tail`, `Seq`, `Cardinality` | Standard-library calls |
| `algorithm`, `pcalprocess`, `pcalwhile`, `pcalif` | PlusCal algorithms and statements |

See [all snippets](snippets/tla+.json). Add any required `EXTENDS` imports yourself; snippets do not edit imports. PlusCal templates use p-syntax, while highlighting supports both p-syntax and C-syntax.

## Configuration

Imported modules are resolved in this order:

1. The current file's directory.
2. Workspace roots.
3. Configured `modulePaths`.
4. Bundled standard modules.

Files must be named `ModuleName.tla`. Resolution follows explicit imports and does not recursively scan the project. Add other library directories in Zed settings:

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

Relative module paths are resolved from workspace roots. Restart the language server after changing them. Project and configured modules take precedence over bundled files. The server does not currently read `tla2tools.jar` or `TLA_LIBRARY`.

The bundled modules are `Naturals`, `Integers`, `Reals`, `Sequences`, `FiniteSets`, `Bags`, `TLC`, `RealTime`, `Randomization`, and `Toolbox`, pinned to TLA+ tools v1.7.4. They still need explicit `EXTENDS` / `INSTANCE` imports. See their [sources, licenses, and checksums](server/standard_modules/README.md).

## Current limits

- Navigation and editing assistance use syntax trees and lexical scopes. A successful jump does not imply a semantically valid specification.
- PlusCal bindings, structured-proof contexts, and subexpression selectors such as `Op!label` or `Op!1` are not supported by the language server. PlusCal and proof syntax still receive highlighting.
- Comments, strings, and record fields do not receive ordinary symbol suggestions. Severely incomplete syntax may produce no results.
- Instance documentation shows the original definition without evaluating `WITH` substitutions. Numeric standard-library placeholders are identified in hover text and shown as signatures only.
- Semantic diagnostics, type inference, references, rename, model checking, and PlusCal translation are not implemented.
- `.cfg` files are not associated with TLA+ automatically, to avoid capturing unrelated configuration files.

## Examples

| File | Purpose |
| --- | --- |
| [Counter.tla](examples/Counter.tla) / [Counter.cfg](examples/Counter.cfg) | Bounded counter, temporal specification, and a TLC configuration with `Max = 3` |
| [PlusCalCounter.tla](examples/PlusCalCounter.tla) | PlusCal highlighting; translate with official tools before model checking |
| [Navigation.tla](examples/Navigation.tla) | Local scopes, imports, and instance navigation |
| [Editing.tla](examples/Editing.tla) | Standard-library navigation, hover, completion, and signatures |

With Java and an independently installed `tla2tools.jar`, you can check the counter outside the extension:

```sh
cd examples
java -cp /absolute/path/to/tla2tools.jar tlc2.TLC -config Counter.cfg Counter.tla
```

## Troubleshooting

- **No suggestions:** run `editor: show completions`. Check the language indicator and the settings above. Automatic signature popups also depend on Zed's signature-help settings.
- **No navigation after a rebuild:** run `editor: restart language server`, then inspect `zed: open log` if needed.
- **Duplicate snippets after repeated development rebuilds:** restart Zed to clear the process's snippet cache.
- **A trailing prime does not auto-pair:** this is intentional; `'` is TLA+'s next-state operator.

## Development and roadmap

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, validation, project layout, and dependency updates. The [server documentation](server/README.md) explains scope resolution and the grammar build.

The [roadmap](ROADMAP.md) prioritizes release packaging, syntax diagnostics, references, and safe rename, followed by optional integration with official TLA+ tools. See the [publishing guide](docs/PUBLISHING.md) for the current registry requirements and remaining work.

## Credits and license

The parser comes from [tree-sitter-tlaplus](https://github.com/tlaplus-community/tree-sitter-tlaplus). Standard modules come from [TLA+ tools](https://github.com/tlaplus/tlaplus). Related Zed projects include [Akanoa/Zed-editor-TLA-syntax](https://github.com/Akanoa/Zed-editor-TLA-syntax) and [suckrowPierre/zed-tlaplus](https://github.com/suckrowPierre/zed-tlaplus).

This project is MIT licensed; see [LICENSE](LICENSE). Vendored components retain their [grammar license](server/tree-sitter-tlaplus.LICENSE) and [standard-module license](server/standard_modules/LICENSE).
