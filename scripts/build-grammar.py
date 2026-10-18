"""Rebuild the bundled navigation grammar with the same source as Zed's highlighter.

Usage: python3 scripts/build-grammar.py /path/to/wasi-sdk /path/to/tree-sitter-tlaplus
The source checkout must be the revision pinned in extension.toml.
"""

from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
sdk, source = (Path(arg).resolve() for arg in sys.argv[1:])
subprocess.run([
    str(sdk / "bin" / "clang"), "-O2", "-fPIC", "-shared", "-nostdlib",
    "-Wl,--no-entry", "-Wl,--export=tree_sitter_tlaplus", "-Wl,--allow-undefined",
    "-I", str(source / "src"), str(source / "src" / "parser.c"),
    str(source / "src" / "scanner.c"), "-o", str(root / "server" / "tree-sitter-tlaplus.wasm"),
], check=True)
shutil.copyfile(source / "LICENSE", root / "server" / "tree-sitter-tlaplus.LICENSE")
