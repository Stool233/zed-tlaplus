# TLA+ Language Server

`server.cjs` implements stdio LSP definition, hover, completion and signature-help
requests. `navigation.cjs` resolves Tree-sitter syntax nodes through lexical scopes
and explicit module imports; `features.cjs` derives editor results from those bindings.
The Rust extension embeds the scripts, grammar and standard modules, writes them to Zed's
extension work directory, and installs exactly `web-tree-sitter@0.25.10` there.
The process uses Zed's Node runtime. No global npm or Python install is needed.

This embedding describes the current development release. Registry publication
requires a separately distributed server; see the [publishing assessment](../docs/PUBLISHING.md).

The ten official standard modules are bundled from TLA+ tools v1.7.4. Their
[provenance, license and update instructions](standard_modules/README.md) are
checked in alongside the untouched sources. They are the last module lookup
fallback, after project and configured library directories. Only explicitly
imported exports enter completion results; `LOCAL` imports remain private.

Completion temporarily replaces the token at the caret with a valid expression
and balances unmatched delimiters, allowing the real grammar to recover scopes
in unfinished calls. This tree is disposed after the request and never changes
the live document. Signature help counts direct argument separators in the
syntax tree, so nested calls, sets, tuples and quantifier binders do not inflate
the active parameter index. Unrecoverable syntax can still yield no suggestions.

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
