# Bundled TLA+ standard modules

These ten unmodified `.tla` files come from the official
[`tlaplus/tlaplus` v1.7.4 release](https://github.com/tlaplus/tlaplus/tree/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tla2sany/StandardModules),
commit `5a47802b5c391f59ecdd44117981f4ff8c0656ba`. The upstream MIT license is
included in `LICENSE`; individual files retain their original notices.
`provenance.json` records the upstream directory and each file's SHA-256.

They supply editor navigation, documentation, completions and signatures, not
an execution engine. In particular, the official numeric modules contain dummy
definitions which TLA+ tools override. Hover deliberately shows their signatures
and an explanatory note instead of presenting those dummy bodies as semantics.

The extension embeds these sources and extracts them to `standard_modules/`
in its work directory. Project and configured module directories take precedence.
No Java installation or runtime standard-library download is required.

When upgrading, copy the whole upstream StandardModules directory from a pinned
official release, update its license and provenance, adjust the Rust asset list
if needed, and run the parser, checksum and feature tests. Do not patch vendored
modules to accommodate the editor; update the grammar or resolver instead.
