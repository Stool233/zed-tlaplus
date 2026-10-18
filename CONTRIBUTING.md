# Contributing

[README](README.md) · [Roadmap](ROADMAP.md) · [Publishing](docs/PUBLISHING.md)

Bug reports should include the extension version, Zed version, operating system, a small `.tla` example, and the expected and observed behavior. For module-resolution bugs, include the relevant filenames, imports, and `modulePaths`. Remove private specification contents from logs and examples before sharing them.

## Development setup

Use Node.js 20+, Python 3.9+ with a C compiler, and Rust installed through rustup. Python packages validate the grammar and editor queries; they are not runtime dependencies of the extension.

From the repository root:

```sh
npm ci --ignore-scripts
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
rustup target add wasm32-wasip2
```

On Windows, use `.venv\Scripts\python` for the virtual environment commands. If your pip configuration forces user installs, set `PIP_USER=0` for the installation command; in PowerShell use `$env:PIP_USER = "0"`.

Install the checkout with Zed's **`zed: install dev extension`** action. Use **Rebuild** on the Extensions page after changing files, then **`editor: restart language server`** if needed. See [Zed's development instructions](https://zed.dev/docs/extensions/developing-extensions) for the host build requirements and logs.

## Validation

Run the checks relevant to your change. Before preparing a release, run all of them:

```sh
npm test
.venv/bin/python -m unittest discover -s tests -v
cargo fmt --all -- --check
cargo clippy --target wasm32-wasip2 --locked -- -D warnings
cargo build --release --target wasm32-wasip2 --locked
git diff --check
```

The Node suite exercises lexical binding, module lookup, editor features, UTF-16 positions, unsaved edits, and actual stdio LSP messages. The Python suite compiles every Tree-sitter query and parses examples and expanded snippets. Standard-library tests check upstream hashes as well as parser compatibility.

Tree-sitter parsing does not replace SANY semantic validation or TLC model checking. Use the official tools separately for changes that claim specification correctness.

For a manual smoke test, open `examples/Editing.tla` and `examples/Navigation.tla` in Zed. Check a standard-library definition, a local hover, `Library!` completion, nested-call signature help, and cross-file navigation after an unsaved edit. Record the OS and Zed version when reporting results.

## Project layout

| Path | Responsibility |
| --- | --- |
| `extension.toml` | Zed manifest, grammar revision, language server, and snippet registration |
| `src/lib.rs` | Runtime setup and language-server launch |
| `server/server.cjs` | Stdio LSP transport and document synchronization |
| `server/navigation.cjs` | Syntax-tree scopes, module lookup, and definition resolution |
| `server/features.cjs` | Hover, completion, and signature help |
| `server/standard_modules/` | Unmodified upstream sources, license, and provenance |
| `languages/tlaplus/` | Language settings and editor queries |
| `snippets/tla+.json` | Native snippets; the filename matches the lowercased language name |
| `examples/` | Small specifications for trying features |
| `tests/` | Node language-server tests and Python parser/query checks |
| `scripts/build-grammar.py` | Rebuild the server's WASM grammar |

## Changes and documentation

Keep runtime changes focused and add regression coverage for behavior changes. Preserve UTF-16 positions, unsaved-document handling, lexical shadowing, and `LOCAL` export rules when extending the resolver.

Write built-in UI messages and default documentation in English. Keep `README.zh-CN.md` aligned with `README.md`, especially installation, settings, capabilities, and limitations. User-authored comments and identifiers must retain their original text. Add user-visible changes under **Unreleased** in `CHANGELOG.md`.

## Updating dependencies

- **Grammar:** update the pinned revision in `extension.toml` and `requirements-dev.txt`, rebuild `server/tree-sitter-tlaplus.wasm`, and update its provenance in [server/README.md](server/README.md). Run both test suites. Zed's own grammar WASM cannot replace the server artifact.
- **Parser runtime:** keep the `web-tree-sitter` version in `package.json`, `package-lock.json`, and `PARSER_VERSION` in `src/lib.rs` synchronized.
- **Standard modules:** follow the [vendor update instructions](server/standard_modules/README.md). Preserve upstream bytes and notices; update the checksum manifest and embedded asset list together.
- **Rust API:** update the dependency and `Cargo.lock` together, then verify the supported Zed versions and perform a dev-extension rebuild.

## Preparing a version

Keep versions consistent across `extension.toml`, `Cargo.toml`, `Cargo.lock`, `package.json`, `package-lock.json`, and `serverInfo` in `server/server.cjs`. Move the relevant changelog entries into the new version and update the version shown in both READMEs.

Build outputs such as `target/`, `grammars/`, and the root `extension.wasm` remain ignored. The separate `server/tree-sitter-tlaplus.wasm` is intentionally tracked. Registry publication has additional work described in [docs/PUBLISHING.md](docs/PUBLISHING.md).
