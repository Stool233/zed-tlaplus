# Changelog

Versions below describe project development milestones. They do not imply publication to the Zed extension registry.

## Unreleased

### Changed

- Use English as the default README and add a Simplified Chinese translation.
- Organize development instructions, roadmap, and registry publication guidance into separate documents.
- Use English for built-in snippet descriptions, module labels, and standard-library placeholder explanations.
- Identify Stool233 as the extension maintainer in the manifest.

## 0.3.0

### Added

- Hover documentation with signatures, definitions, comments, and source modules.
- Scope-aware symbol and module completion, including qualified instance members and incomplete input.
- Signature help with active-parameter tracking for nested calls.
- Ten official TLA+ standard modules from tools v1.7.4, with licenses and source checksums.
- An editing example and regression coverage for editor features, standard modules, and LSP requests.

## 0.2.0

### Added

- TLA+ and PlusCal highlighting, indentation, brackets, outline symbols, and text objects.
- 68 native snippets and example specifications.
- A Tree-sitter language server with Go to Definition for lexical scopes and cross-module imports.
- Support for unsaved documents, UTF-16 positions, `EXTENDS`, `INSTANCE`, and custom module directories.
- A Rust entry point using Zed's Node runtime, plus parser and stdio LSP tests.
