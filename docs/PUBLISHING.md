# Publishing to the Zed extension registry

[README](../README.md) · [Roadmap](../ROADMAP.md) · [Contributing](../CONTRIBUTING.md)

Last checked: **2026-10-18**. Recheck the linked upstream documents before submitting; registry requirements can change. This is a preparation guide, not a record of an approved submission.

## Current assessment

This project works as a development extension, but needs distribution changes before a registry submission.

| Item | Project status | Next action |
| --- | --- | --- |
| Repository | `Stool233/zed-tlaplus` is private | Choose a public distribution repository before submission |
| Extension identity | Local ID `tlaplus`; the registry already contains `tla-plus` | Decide how to collaborate with the existing project or justify a distinct offering |
| Server packaging | `src/lib.rs` embeds the language server with `include_bytes!` | Replace this with a separately distributed server |
| License | Root MIT license and third-party notices are present | Preserve notices in the eventual server artifact |
| Documentation and UI | English defaults, Chinese README translation, and maintainer metadata | Keep both READMEs synchronized |
| Validation | Automated suites and macOS dev-install checks exist | Test the exact release candidate, including fresh installation; Linux and Windows checks remain planned |

Zed requires a public source repository and an accepted license. MIT is accepted. See the [submission guide](https://zed.dev/docs/extensions/publishing/publishing-guide) and [license requirements](https://zed.dev/docs/extensions/publishing/license-requirements).

## Resolve the distribution design

The [publishing prerequisites](https://zed.dev/docs/extensions/publishing/prerequisites) require English user-facing text and prohibit bundling a language server in the extension; the server should be downloaded or found through the extension API. Our current Rust asset embedding is therefore a release blocker.

Proposed project work:

1. Package the JavaScript server, WASM grammar, pinned parser runtime, standard modules, and licenses into a versioned server distribution.
2. Publish that artifact separately, for example as a GitHub release asset or npm package. `package.json` currently has `private: true`; the existing package is not a published server distribution.
3. Update the Rust launcher to install a known compatible version through Zed's APIs, cache it in the extension work directory, and report installation errors clearly.
4. Test clean installs, upgrades, interrupted downloads, and offline reuse. Preserve the current module lookup and document behavior.

The server source can remain in this repository; the required change is how the extension obtains the executable server. This proposal is not implemented yet.

## Account for the existing TLA+ extension

The registry currently lists **`tla-plus` 0.2.0**, backed by [Akanoa/Zed-editor-TLA-syntax](https://github.com/Akanoa/Zed-editor-TLA-syntax). See the registry's [version entry](https://github.com/zed-industries/extensions/blob/main/extensions.toml) and [submodule mapping](https://github.com/zed-industries/extensions/blob/main/.gitmodules).

At the registered commit, its [manifest](https://github.com/Akanoa/Zed-editor-TLA-syntax/blob/85e44d9f288dabf8e198980994a673b7a20f1b19/extension.toml) registers grammars without a language server. This project's definition navigation, hover, symbol completion, and signature help are concrete additions to discuss with its maintainer.

Our `tlaplus` ID is different, but a different ID alone does not resolve feature overlap. Zed's [contribution guidance](https://github.com/zed-industries/extensions/blob/main/CONTRIBUTING.md) recommends improving an existing extension first when functionality overlaps.

The recommended route is to explore contributing the editor features to the existing extension after separating the server distribution. If an independent extension is pursued, explain its additional capabilities and maintenance plan. A server-only extension is another design option, but it needs a suitable ID and testing with the existing language registration; it is not a drop-in manifest rename. Acceptance remains a maintainer decision.

## Prepare a release candidate

- Complete the packaging work and select the distribution route above.
- Run the checks in [CONTRIBUTING.md](../CONTRIBUTING.md) and manually test a fresh Zed installation of the candidate.
- Record the candidate commit, Zed version, operating system, and demonstrated features.
- Update the changelog and keep all project versions synchronized.
- Push the tested commit to a branch of the public repository. A tag can also identify the release, but the submitted commit needs to be reachable from a branch.

## Registry submission mechanics

Follow the [official publishing guide](https://zed.dev/docs/extensions/publishing/publishing-guide). This example assumes a **new standalone `tlaplus` entry**, after resolving the blockers above. Contributions to `tla-plus` follow that project's release process.

Fork `zed-industries/extensions` to your personal account, then work in that fork:

```sh
git clone https://github.com/YOUR_ACCOUNT/extensions.git zed-extensions
cd zed-extensions
git switch -c add-tlaplus
git submodule add https://github.com/Stool233/zed-tlaplus.git extensions/tlaplus
git -C extensions/tlaplus rev-parse HEAD
```

Use the chosen public source URL if it differs. Ensure the submodule points to the tested branch commit. Add this registry entry, replacing `0.3.0` with the candidate's actual manifest version:

```toml
[tlaplus]
submodule = "extensions/tlaplus"
version = "0.3.0"
```

Install the registry repository's development dependencies, then run:

```sh
pnpm sort-extensions
git diff --check
git add .gitmodules extensions.toml extensions/tlaplus
git commit -m "Add TLA+ extension"
git push -u origin add-tlaplus
```

Open a single-extension PR against `zed-industries/extensions`; keep its registry and manifest versions equal. Merge triggers packaging and publication. Check the official guide's PR limits and response deadlines.

## Human review and subsequent updates

The registry's [AI policy](https://github.com/zed-industries/extensions/blob/main/AI_POLICY.md) allows AI coding assistance but requires a responsible human contributor. The maintainer should write the PR explanation and review replies in their own words; autonomous-agent submissions and AI-generated maintainer comments are not allowed. This guide is technical preparation, not a PR body to paste.

After publication, new versions require a registry PR updating both the submodule commit and its version entry. A push to this repository alone does not update the registry. See [Updating an Extension](https://zed.dev/docs/extensions/publishing/updating-and-maintenance).
