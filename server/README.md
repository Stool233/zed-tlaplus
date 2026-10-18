# TLA+ Navigation

`server.cjs` implements stdio LSP definition requests. `navigation.cjs` resolves
Tree-sitter syntax nodes through lexical scopes and explicit module imports.
The Rust extension embeds both scripts and the grammar, writes them to Zed's
extension work directory, and installs exactly `web-tree-sitter@0.25.10` there.
The process uses Zed's Node runtime. No global npm or Python install is needed.

The checked-in `tree-sitter-tlaplus.wasm` is built from
[`tlaplus-community/tree-sitter-tlaplus` at `add40814fda369f6efd989977b2c498aaddde984`](https://github.com/tlaplus-community/tree-sitter-tlaplus/tree/add40814fda369f6efd989977b2c498aaddde984),
the same revision used in `extension.toml` and `requirements-dev.txt`.
Its MIT license is included as `tree-sitter-tlaplus.LICENSE`.

Rebuild from that source checkout using a WASI SDK (the initial artifact uses
Zed's downloaded SDK with Clang 23):

```sh
python3 scripts/build-grammar.py /path/to/wasi-sdk /path/to/tree-sitter-tlaplus
npm ci --ignore-scripts
npm test
```

The grammar is a position-independent WASM side module. `-nostdlib` intentionally
leaves allocation and C-library functions for Web Tree-sitter to provide instead
of adding a `libc.so` dependency. Zed's own grammar artifact links differently and
cannot be copied in place of this file. Check in the rebuilt artifact when
updating the grammar revision; end users do not need to compile it.

Initial artifact SHA-256:
`b5f7b717cb1646ce3aec9250e016975faf0a601fbb9502c3a850e3a055376885`.

The resolver is deliberately narrower than SANY. It does not implement proof
context rules, PlusCal bindings, subexpression selectors or semantic validation.
Definition lookup tolerates out-of-order declarations and incomplete syntax;
a successful jump does not mean the specification is semantically valid.
