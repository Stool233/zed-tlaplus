# Roadmap

[README](README.md) · [简体中文说明](README.zh-CN.md) · [Changelog](CHANGELOG.md)

This roadmap describes priorities, not release dates. Unchecked items are proposals and are not available in the current extension. Version numbers for future milestones will be assigned when their scope is settled.

## Available in 0.3.0

- [x] TLA+ and PlusCal highlighting, outline symbols, indentation, brackets, and text objects.
- [x] 68 snippets for specifications, expressions, and PlusCal.
- [x] Definition navigation through lexical scopes, `EXTENDS`, and `INSTANCE`.
- [x] Hover documentation, scope-aware completion, and signature help.
- [x] Ten official standard modules with pinned sources, licenses, and checksums.
- [x] Automated grammar, snippet, navigation, editing-feature, and stdio LSP tests.

## Next: distribution and release preparation

- [x] English README with a Simplified Chinese translation.
- [x] Contribution instructions, changelog, and a registry publishing guide.
- [x] English built-in snippet descriptions and language-server labels.
- [ ] Move the embedded language server into an independently versioned release artifact; see the [publishing assessment](docs/PUBLISHING.md).
- [ ] Add installation tests for a fresh cache, failed downloads, upgrades, and offline restarts.
- [ ] Add CI for Node tests, Python query validation, Rust formatting, Clippy, and WASM builds.
- [ ] Verify installation and editing on Linux and Windows, alongside macOS.
- [ ] Decide the public distribution route and the relationship with the existing `tla-plus` extension.
- [ ] Record a short demo and document the tested Zed version for the release candidate.

Completion means a new user can install the published server artifact and use the documented features without a development checkout. Registry submission also depends on the decisions and requirements in the publishing guide.

## Then: faster feedback while editing

- [ ] Publish syntax diagnostics for Tree-sitter error and missing nodes.
- [ ] Report unresolved modules with the directories searched and actionable configuration guidance.
- [ ] Update diagnostics after edits and clear stale messages after fixes or file closure.
- [ ] Improve recovery for incomplete expressions without suggesting out-of-scope names.

Syntax diagnostics must be labeled as parser feedback. Semantic claims will require a semantic checker.

## Then: references and safe rename

- [ ] Highlight references to the selected binding in the current document.
- [ ] Find references across workspace modules using the existing resolver.
- [ ] Rename bound symbols with previewable edits, including unsaved files.
- [ ] Reject ambiguous or unsupported renames, name collisions, and edits to bundled libraries.
- [ ] Add workspace symbol search with incremental indexing and a bounded scan.

Completion means shadowed names, parameters, `LOCAL` exports, and instance members remain distinct. Comments, strings, and record fields must not be rewritten as variable references.

## Later: optional official-tool integration

- [ ] SANY semantic diagnostics using a configured Java runtime and TLA+ tools installation.
- [ ] TLC tasks with explicit specification/configuration selection, cancellation, and readable results.
- [ ] PlusCal translation with a preview of generated changes and preservation of user edits.
- [ ] Navigation for structured proofs and subexpression selectors after extending the binding model.

The existing editing features should continue to work without Java. These integrations will need separate design and testing; no automatic tool execution is planned as part of ordinary typing.
