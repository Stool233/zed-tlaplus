use std::{fs, path::Path};
use zed_extension_api::{self as zed, settings::LspSettings, Result};

const PARSER_VERSION: &str = "0.25.10";

struct TlaPlus;

fn write_asset(path: &str, bytes: &[u8]) -> Result<()> {
    if fs::read(path).ok().as_deref() != Some(bytes) {
        fs::write(path, bytes).map_err(|error| format!("Writing {path}: {error}"))?;
    }
    Ok(())
}

impl zed::Extension for TlaPlus {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        id: &zed::LanguageServerId,
        _worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        // Embed the server so marketplace and dev installs have identical assets.
        write_asset("server.cjs", include_bytes!("../server/server.cjs"))?;
        write_asset("navigation.cjs", include_bytes!("../server/navigation.cjs"))?;
        write_asset(
            "tree-sitter-tlaplus.wasm",
            include_bytes!("../server/tree-sitter-tlaplus.wasm"),
        )?;
        write_asset(
            "tree-sitter-tlaplus.LICENSE",
            include_bytes!("../server/tree-sitter-tlaplus.LICENSE"),
        )?;

        let installed = zed::npm_package_installed_version("web-tree-sitter")?;
        if installed.as_deref() != Some(PARSER_VERSION)
            || !Path::new("node_modules/web-tree-sitter/tree-sitter.wasm").is_file()
        {
            zed::set_language_server_installation_status(
                id,
                &zed::LanguageServerInstallationStatus::Downloading,
            );
            zed::npm_install_package("web-tree-sitter", PARSER_VERSION)?;
        }
        let server = std::env::current_dir()
            .map_err(|error| error.to_string())?
            .join("server.cjs");
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![server.to_string_lossy().into_owned()],
            env: Default::default(),
        })
    }

    fn language_server_initialization_options(
        &mut self,
        id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<zed::serde_json::Value>> {
        Ok(LspSettings::for_worktree(id.as_ref(), worktree)?.initialization_options)
    }
}

zed::register_extension!(TlaPlus);
