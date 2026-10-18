'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { Parser, Language } = require('web-tree-sitter');

const DEFINITIONS = new Set(['operator_definition', 'function_definition', 'module_definition']);
const BINDERS = new Set(['bounded_quantification', 'unbounded_quantification', 'choose',
  'function_literal', 'set_filter', 'set_map', 'lambda']);
const SYMBOLS = new Set(['prefix_op_symbol', 'infix_op_symbol', 'postfix_op_symbol']);
const NUMBER_SETS = new Set(['nat_number_set', 'int_number_set', 'real_number_set']);
const IGNORED = new Set(['comment', 'block_comment', 'string', 'extramodular_text']);

function filePath(uri) {
  try { return fileURLToPath(uri); } catch { return null; }
}

function canonical(uri) {
  const file = filePath(uri);
  return file ? pathToFileURL(path.resolve(file)).href : uri;
}

function key(node) {
  if (SYMBOLS.has(node.type)) return node.firstNamedChild?.type || node.text;
  if (NUMBER_SETS.has(node.type)) return node.type;
  if (node.parent?.childForFieldName('symbol')?.id === node.id) return node.type;
  return node.text;
}

function position(point) { return { line: point.row, character: point.column }; }
function location(binding) {
  return { uri: binding.document.uri, range: {
    start: position(binding.node.startPosition), end: position(binding.node.endPosition),
  } };
}

function declarationName(node) {
  return node.type === 'operator_declaration' ? node.childForFieldName('name') : node;
}

function codeChildren(node) {
  return node.namedChildren.filter(child => !['comment', 'block_comment'].includes(child.type));
}

function instanceModule(node) {
  return codeChildren(node).find(child => child.type === 'identifier_ref');
}

function introduced(node) {
  if (!node) return [];
  return node.type === 'tuple_of_identifiers'
    ? node.namedChildren.filter(child => child.type === 'identifier') : [declarationName(node)];
}

class Scope {
  constructor(document, node, parent = null) {
    this.document = document;
    this.node = node;
    this.parent = parent;
    this.symbols = new Map();
    this.modules = new Map();
    this.imports = [];
  }
  add(node, kind = 'local', extra = {}) {
    if (!node) return null;
    const binding = { node, kind, document: this.document, scope: this, ...extra };
    const name = key(node);
    const existing = this.symbols.get(name);
    // A RECURSIVE declaration should lead to the actual definition when available.
    if (!existing || kind !== 'recursive') this.symbols.set(name, binding);
    this.document.declarations.set(node.id, binding);
    return binding;
  }
}

class Document {
  constructor(uri, text, parser) {
    this.uri = canonical(uri);
    this.text = text;
    // Web Tree-sitter parses JavaScript strings as UTF-16, matching LSP positions.
    this.tree = parser.parse(text);
    this.scopes = new Map();
    this.declarations = new Map();
    this.root = new Scope(this, this.tree.rootNode);
    this.lines = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') this.lines.push(i + 1);
    this.visit(this.tree.rootNode, this.root);
  }

  offset(pos) {
    if (!pos || !Number.isInteger(pos.line) || !Number.isInteger(pos.character)
        || pos.line < 0 || pos.line >= this.lines.length || pos.character < 0) return null;
    const start = this.lines[pos.line];
    let end = this.lines[pos.line + 1] ?? this.text.length;
    while (end > start && /[\r\n]/.test(this.text[end - 1])) end--;
    return Math.min(start + pos.character, end);
  }

  visit(node, scope, local = false) {
    this.scopes.set(node.id, scope);
    if (IGNORED.has(node.type)) return;
    const children = node.namedChildren;
    if (node.type === 'local_definition') {
      for (const child of children) this.visit(child, scope, true);
      return;
    }
    if (node.type === 'module') {
      const name = node.childForFieldName('name');
      const inner = new Scope(this, node, scope);
      const binding = scope.add(name, 'module', { module: inner, local });
      inner.binding = binding;
      scope.modules.set(name.text, inner);
      this.scopes.set(node.id, inner);
      for (const child of children) if (child.id !== name.id) this.visit(child, inner);
      return;
    }
    if (DEFINITIONS.has(node.type)) {
      const name = node.childForFieldName('name');
      const definition = node.childForFieldName('definition');
      scope.add(name, node.type === 'module_definition' ? 'instance' : 'operator', {
        local, instance: node.type === 'module_definition' ? definition : undefined,
      });
      const inner = new Scope(this, node, scope);
      this.scopes.set(node.id, inner);
      for (const param of node.childrenForFieldName('parameter').filter(child => child.isNamed)) {
        inner.add(declarationName(param));
      }
      for (const child of children) {
        if (child.type === 'quantifier_bound') {
          for (const intro of child.childrenForFieldName('intro')) {
            for (const id of introduced(intro)) inner.add(id);
          }
          // Bound identifiers are not in scope in their domain expressions.
          this.visit(child, scope);
        } else if (child.id !== name?.id) {
          this.visit(child, inner);
        }
      }
      return;
    }
    if (['constant_declaration', 'variable_declaration', 'recursive_declaration'].includes(node.type)) {
      for (const child of children.filter(child => ['identifier', 'operator_declaration'].includes(child.type))) {
        scope.add(declarationName(child), node.type === 'recursive_declaration' ? 'recursive' : 'declaration', { local });
      }
    }
    if (node.type === 'theorem' || node.type === 'assumption') {
      scope.add(node.childForFieldName('name'), 'operator', { local });
      scope = new Scope(this, node, scope);
    }
    if (node.type === 'let_in') scope = new Scope(this, node, scope);
    this.scopes.set(node.id, scope);
    if (BINDERS.has(node.type)) {
      const inner = new Scope(this, node, scope);
      this.scopes.set(node.id, inner);
      for (const child of children) {
        const intros = child.type === 'quantifier_bound' ? child.childrenForFieldName('intro')
          : ['identifier', 'tuple_of_identifiers'].includes(child.type) ? [child] : [];
        for (const intro of intros) for (const id of introduced(intro)) inner.add(id);
      }
      const domain = node.childForFieldName('set');
      for (const child of children) {
        this.visit(child, child.type === 'quantifier_bound' || child.id === domain?.id ? scope : inner);
      }
      return;
    }
    if (node.type === 'extends') {
      for (const child of children) if (child.type === 'identifier_ref') {
        scope.imports.push({ node: child, scope, kind: 'extends', local: false });
      }
    }
    if (node.type === 'instance' && node.parent?.type !== 'module_definition') {
      const name = instanceModule(node);
      if (name) scope.imports.push({ node: name, scope, kind: 'instance', local });
    }
    // Skip structured proofs conservatively until their context rules are implemented.
    if (['non_terminal_proof', 'assume_prove'].includes(node.type)) return;
    for (const child of children) this.visit(child, scope, local);
  }

  token(pos) {
    const offset = this.offset(pos);
    if (offset === null) return null;
    let node = this.tree.rootNode.namedDescendantForIndex(offset, offset);
    // A caret just after an identifier (or on its prime) still addresses that identifier.
    if ((!node || !isSymbol(node)) && offset > 0) {
      const previous = this.tree.rootNode.namedDescendantForIndex(offset - 1, offset - 1);
      if (previous?.endIndex === offset && isSymbol(previous)) node = previous;
    }
    if (!node) return null;
    if (SYMBOLS.has(node.parent?.type)) node = node.parent;
    if (!isSymbol(node)) return null;
    for (let parent = node; parent; parent = parent.parent) {
      if (IGNORED.has(parent.type) || ['non_terminal_proof', 'assume_prove'].includes(parent.type)) return null;
    }
    const parent = node.parent;
    if (parent?.type === 'except_update_record_field'
        || (parent?.type === 'record_value' && codeChildren(parent).at(-1).id === node.id)) return null;
    return node;
  }
}

function isSymbol(node) {
  return ['identifier', 'identifier_ref'].includes(node.type) || NUMBER_SETS.has(node.type)
    || SYMBOLS.has(node.type) || SYMBOLS.has(node.parent?.type)
    || node.parent?.childForFieldName('symbol')?.id === node.id;
}

function operatorName(node) {
  if (!node) return null;
  if (node.type === 'subexpr_component') return operatorName(codeChildren(node)[0]);
  return node.childForFieldName('name') || node.childForFieldName('symbol') || node;
}

function qualifiedParts(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type !== 'prefixed_op') continue;
    const prefix = parent.childForFieldName('prefix');
    if (!prefix || !codeChildren(prefix).every(part => part.type === 'subexpr_component')) return [];
    const parts = [...codeChildren(prefix).map(operatorName), operatorName(parent.childForFieldName('op'))].filter(Boolean);
    if (parts.some(part => part.id === node.id)) return parts;
  }
  return [];
}

class Navigation {
  static async create() {
    await Parser.init();
    const parser = new Parser();
    parser.setLanguage(await Language.load(path.join(__dirname, 'tree-sitter-tlaplus.wasm')));
    return new Navigation(parser);
  }

  constructor(parser) {
    this.parser = parser;
    this.documents = new Map();
    this.open = new Set();
    this.roots = [];
    this.modulePaths = [];
    this.standardModulePath = path.join(__dirname, 'standard_modules');
  }

  configure(params) {
    this.roots = (params.workspaceFolders?.map(folder => filePath(folder.uri))
      ?? [filePath(params.rootUri), params.rootPath]).filter(Boolean);
    const base = this.roots[0] || process.cwd();
    this.modulePaths = (params.initializationOptions?.modulePaths || [])
      .filter(item => typeof item === 'string').map(item => path.resolve(base, item));
  }

  update(uri, text, isOpen = true) {
    uri = canonical(uri);
    const next = new Document(uri, text, this.parser);
    this.documents.get(uri)?.tree.delete();
    this.documents.set(uri, next);
    if (isOpen) this.open.add(uri);
    return next;
  }

  close(uri) {
    uri = canonical(uri);
    this.open.delete(uri);
    this.documents.get(uri)?.tree.delete();
    this.documents.delete(uri);
  }

  load(uri) {
    uri = canonical(uri);
    if (this.open.has(uri)) return this.documents.get(uri);
    const file = filePath(uri);
    if (!file) return this.documents.get(uri) || null;
    try {
      const text = fs.readFileSync(file, 'utf8');
      const cached = this.documents.get(uri);
      return cached?.text === text ? cached : this.update(uri, text, false);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EISDIR', 'EACCES'].includes(error.code)) return null;
      throw error;
    }
  }

  module(scope, name) {
    if (!scope || typeof name !== 'string') return null;
    // Inner modules are visible lexically, not through an unrelated workspace search.
    for (let current = scope; current; current = current.parent) {
      if (current.modules.has(name)) return current.modules.get(name);
    }
    if (!/^[A-Za-z0-9_]+$/.test(name)) return null;
    for (const dir of this.moduleDirectories(scope.document)) {
      const doc = this.load(pathToFileURL(path.join(dir, `${name}.tla`)).href);
      if (doc?.root.modules.has(name)) return doc.root.modules.get(name);
    }
    return null;
  }

  moduleDirectories(document) {
    const file = filePath(document.uri);
    const directory = file && path.dirname(file);
    return [...new Set([directory !== this.standardModulePath && directory, ...this.roots, ...this.modulePaths,
      this.standardModulePath].filter(Boolean))];
  }

  resolve(scope, name, exported = false, seen = new Set(), instance = false) {
    if (!scope) return [];
    const id = `${scope.document.uri}:${scope.node.id}:${name}:${exported}:${instance}`;
    if (seen.has(id)) return [];
    const nextSeen = new Set(seen).add(id);
    const binding = scope.symbols.get(name);
    if (binding && !(exported && binding.local) && !(instance && binding.kind === 'declaration')) return [binding];
    const imported = [];
    for (const item of scope.imports) {
      if (exported && item.local) continue;
      const target = this.module(item.scope, item.node.text);
      imported.push(...this.resolve(target, name, true, nextSeen, instance || item.kind === 'instance'));
    }
    if (imported.length) return imported;
    return exported ? [] : this.resolve(scope.parent, name, false, nextSeen);
  }

  members(bindings, name) {
    return bindings.flatMap(binding => {
      const target = this.memberScope(binding);
      return this.resolve(target, name, true, new Set(), Boolean(binding.instance));
    });
  }

  memberScope(binding) {
    return binding.module || (binding.instance
      && this.module(binding.scope, instanceModule(binding.instance)?.text));
  }

  visible(scope, exported = false, seen = new Set(), instance = false) {
    if (!scope) return new Map();
    const id = `${scope.document.uri}:${scope.node.id}:${exported}:${instance}`;
    if (seen.has(id)) return new Map();
    const nextSeen = new Set(seen).add(id);
    const own = new Map([...scope.symbols].filter(([, binding]) =>
      !(exported && binding.local) && !(instance && binding.kind === 'declaration')));
    const result = new Map([...own].map(([name, binding]) => [name, [binding]]));
    for (const item of scope.imports) {
      if (exported && item.local) continue;
      const target = this.module(item.scope, item.node.text);
      for (const [name, bindings] of this.visible(target, true, nextSeen, instance || item.kind === 'instance')) {
        if (!own.has(name)) result.set(name, [...(result.get(name) || []), ...bindings]);
      }
    }
    if (!exported) for (const [name, bindings] of this.visible(scope.parent, false, nextSeen)) {
      if (!result.has(name)) result.set(name, bindings);
    }
    return result;
  }

  bindingsAt(document, node) {
    if (!node) return [];
    const declaration = document.declarations.get(node.id);
    if (declaration) return [declaration];
    if (node.type === 'identifier') return []; // e.g. record keys and labels
    const scope = document.scopes.get(node.id);
    if (!scope) return [];
    const parent = node.parent;
    let result;
    if (parent.type === 'extends' || (parent.type === 'instance' && instanceModule(parent)?.id === node.id)) {
      const target = this.module(scope, node.text);
      result = target?.binding ? [target.binding] : [];
    } else if (parent.type === 'substitution' && codeChildren(parent)[0]?.id === node.id) {
      const instance = parent.parent;
      result = this.resolve(this.module(scope, instanceModule(instance)?.text), key(node), true);
    } else {
      // Resolve only the qualified names themselves. Arguments like I(x)!Op(y)
      // remain in the calling scope, even though they are inside a prefixed_op.
      let qualified = node.parent;
      while (qualified && qualified.type !== 'prefixed_op') qualified = qualified.parent;
      const parts = qualifiedParts(node);
      const index = parts.findIndex(part => part.id === node.id);
      if (index >= 0) {
        result = this.resolve(scope, key(parts[0]));
        for (let i = 1; i <= index; i++) result = this.members(result, key(parts[i]));
      } else {
        // Do not guess at TLA+ subexpression selectors (Op!label, Op!1, ...).
        if (qualified && node.type === 'identifier_ref' && (parent.type === 'subexpr_component'
          || operatorName(qualified.childForFieldName('op'))?.id === node.id)) return [];
        result = this.resolve(scope, key(node));
      }
    }
    return [...new Map(result.map(binding => [JSON.stringify(location(binding)), binding])).values()];
  }

  definition(uri, pos) {
    const document = this.load(uri);
    const bindings = document ? this.bindingsAt(document, document.token(pos)) : [];
    return bindings.length ? bindings.map(location) : null;
  }

  dispose() {
    for (const doc of this.documents.values()) doc.tree.delete();
    this.documents.clear();
    this.open.clear();
    this.parser.delete();
  }
}

module.exports = { Navigation, Document, canonical, filePath, key, location, position, operatorName, qualifiedParts };
