"""Validate the shipped Zed queries and expanded snippets against the pinned grammar."""

import json
from pathlib import Path
import re
import unittest
import warnings

import tomli
import tree_sitter
import tree_sitter_tlaplus


ROOT = Path(__file__).resolve().parents[1]
LANGUAGE_DIR = ROOT / "languages" / "tlaplus"
with warnings.catch_warnings():
    warnings.simplefilter("ignore", DeprecationWarning)
    LANGUAGE = tree_sitter.Language(tree_sitter_tlaplus.language())
SNIPPETS = json.loads((ROOT / "snippets" / "tla+.json").read_text(encoding="utf-8"))


def expand_snippet(body):
    """Expand defaults in the subset we ship: numeric tabstops and placeholders.

    Literal escapes follow Zed/LSP rules: only $, } and backslash are escapable.
    Reject unsupported syntax instead of silently treating it as inserted text.
    """
    source = "\n".join(body) if isinstance(body, list) else body
    stops = []

    def parse(offset, nested=False):
        result = []
        while offset < len(source):
            char = source[offset]
            if char == "}" and nested:
                return "".join(result), offset
            if char == "\\" and offset + 1 < len(source) and source[offset + 1] in "\\$}":
                result.append(source[offset + 1])
                offset += 2
            elif char == "$":
                match = re.match(r"\$(\{?)(\d+)", source[offset:])
                if not match:
                    raise ValueError(f"Unsupported tabstop at {offset}: {source[offset:]}")
                stops.append(int(match[2]))
                offset += len(match[0])
                if match[1]:
                    if offset < len(source) and source[offset] == ":":
                        value, offset = parse(offset + 1, nested=True)
                        result.append(value)
                    if offset >= len(source) or source[offset] != "}":
                        raise ValueError("Unclosed placeholder")
                    offset += 1
            else:
                result.append(char)
                offset += 1
        if nested:
            raise ValueError("Unclosed placeholder")
        return "".join(result), offset

    text, _ = parse(0)
    return text, stops


def parse(text):
    return tree_sitter.Parser(LANGUAGE).parse(text.encode("utf-8"))


def syntax_errors(node):
    if node.is_error or node.is_missing:
        yield f"{node.type} at {node.start_point}: {node.text[:100]!r}"
    for child in node.children:
        yield from syntax_errors(child)


def query(filename):
    return tree_sitter.Query(LANGUAGE, (LANGUAGE_DIR / filename).read_text(encoding="utf-8"))


def captured_texts(captures, name):
    return {node.text.decode("utf-8") for node in captures.get(name, [])}


class ExtensionTests(unittest.TestCase):
    def assert_parses(self, source):
        tree = parse(source)
        self.assertFalse(tree.root_node.has_error, "\n".join(syntax_errors(tree.root_node)))
        return tree

    def test_manifest_and_language_registration(self):
        manifest = tomli.loads((ROOT / "extension.toml").read_text())
        config = tomli.loads((LANGUAGE_DIR / "config.toml").read_text())
        self.assertEqual(manifest["schema_version"], 1)
        self.assertIn("languages/tlaplus", manifest["languages"])
        self.assertIn(config["grammar"], manifest["grammars"])
        self.assertEqual(config["path_suffixes"], ["tla"])
        self.assertEqual(manifest["snippets"], [f"snippets/{config['name'].lower()}.json"])
        grammar = manifest["grammars"][config["grammar"]]
        self.assertRegex(grammar["rev"], r"^[0-9a-f]{40}$")
        self.assertIn(grammar["rev"], (ROOT / "requirements-dev.txt").read_text())
        self.assertEqual(config["line_comments"], ["\\* "])
        self.assertNotIn("'", [pair["start"] for pair in config["brackets"]])

    def test_all_queries_compile(self):
        for path in sorted(LANGUAGE_DIR.glob("*.scm")):
            with self.subTest(query=path.name):
                query(path.name)

    def test_examples_parse(self):
        for path in (ROOT / "examples").glob("*.tla"):
            with self.subTest(example=path.name):
                self.assert_parses(path.read_text(encoding="utf-8"))

    def test_snippets_expand_and_parse_in_context(self):
        declarations = {
            "EXTENDS", "CONSTANTS", "VARIABLES", "ASSUME", "RECURSIVE",
            "operator", "function", "LOCAL", "INSTANCE", "Init", "Next",
            "Spec", "TypeOK", "THEOREM", "LEMMA", "algorithm", "pcalprocess",
        }
        statements = {"pcalwhile", "pcalif", "await", "assert", "assign"}
        prefixes = set()
        for name, snippet in SNIPPETS.items():
            with self.subTest(snippet=name):
                prefix = snippet["prefix"]
                self.assertIsInstance(prefix, str)  # Zed only uses the first array prefix.
                self.assertNotIn(prefix, prefixes)
                prefixes.add(prefix)
                self.assertTrue(snippet["description"])
                text, stops = expand_snippet(snippet["body"])
                self.assertIn(0, stops)
                self.assertEqual(set(stops), set(range(max(stops) + 1)))
                if prefix in {"module", "specification"}:
                    source = text
                else:
                    if prefix in statements:
                        text = "(* --algorithm Test\nbegin\nStart:\n" + text + "\nend algorithm; *)"
                    elif prefix not in declarations:
                        text = "Value ==\n" + "\n".join("    " + line for line in text.splitlines())
                    source = "---- MODULE SnippetTest ----\n" + text + "\n====\n"
                self.assert_parses(source)

    def test_backslashes_survive_snippet_expansion(self):
        expected = {
            "Universal quantifier": r"\A x \in S : P(x)",
            "Existential quantifier": r"\E x \in S : P(x)",
            "Conjunction": r"P /\ Q",
            "Disjunction": r"P \/ Q",
            "Set difference": r"S \ T",
            "Concatenate sequences": r"left \o right",
        }
        for name, text in expected.items():
            with self.subTest(snippet=name):
                self.assertEqual(expand_snippet(SNIPPETS[name]["body"])[0], text)

    def test_outline_lists_module_declarations_and_operators(self):
        tree = parse((ROOT / "examples" / "Counter.tla").read_text())
        names = captured_texts(query("outline.scm").captures(tree.root_node), "name")
        self.assertTrue({"Counter", "Max", "count", "vars", "Init", "Increment", "Reset",
                         "Next", "Spec", "TypeOK", "Safety"}.issubset(names), names)

    def test_pluscal_is_code_inside_block_comments(self):
        tree = parse((ROOT / "examples" / "PlusCalCounter.tla").read_text())
        captures = query("highlights.scm").captures(tree.root_node)
        self.assertIn("while", captured_texts(captures, "keyword"))
        self.assertIn("assert", captured_texts(captures, "keyword"))
        self.assertIn("Count", captured_texts(captures, "label"))
        for comment in captures.get("comment", []):
            self.assertNotIn(b"count :=", comment.text)
        scopes = query("overrides.scm").captures(tree.root_node)
        for comment in scopes.get("comment.inclusive", []):
            self.assertNotIn(b"count :=", comment.text)

    def test_brackets_pair_tuples_and_action_subscripts(self):
        source = "---- MODULE Brackets ----\nPair == <<1, 2>>\nSpec == [][Next]_vars\n===="
        tree = self.assert_parses(source)
        pairs = []
        for _, captures in query("brackets.scm").matches(tree.root_node):
            pairs.append((captures["open"][0].text, captures["close"][0].text))
        self.assertIn((b"<<", b">>"), pairs)
        self.assertIn((b"[", b"]_"), pairs)

    def test_unicode_operators(self):
        tree = self.assert_parses("---- MODULE Unicode ----\nP ≜ ∀ x ∈ {1, 2} : x ≥ 0\n====")
        captures = query("highlights.scm").captures(tree.root_node)
        self.assertTrue({"≜", "∀", "∈", "≥"}.issubset(captured_texts(captures, "operator")))

    def test_textobjects_capture_operator_bodies(self):
        tree = parse((ROOT / "examples" / "Counter.tla").read_text())
        captures = query("textobjects.scm").captures(tree.root_node)
        self.assertIn("count = 0", captured_texts(captures, "function.inside"))
        self.assertIn("Init == count = 0", captured_texts(captures, "function.around"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
