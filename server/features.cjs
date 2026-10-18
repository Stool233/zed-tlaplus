'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Document, filePath, key, location, position, operatorName, qualifiedParts } = require('./navigation.cjs');

const COMMENTS = new Set(['comment', 'block_comment']);
const DECLARATIONS = new Set(['constant_declaration', 'variable_declaration', 'recursive_declaration']);
const OPEN = new Map([['(', ')'], ['[', ']'], ['{', '}'], ['<<', '>>'], ['〈', '〉'], ['⟨', '⟩']]);
const CLOSE = new Set(OPEN.values());
const PROBE = 'zed_completion_probe';

// This scanner only tracks trivia and delimiter balance. The real grammar still
// decides scopes, qualified names, call arguments and whether a token is a name.
function scan(text) {
  const regions = [], stack = [];
  for (let i = 0; i < text.length;) {
    const start = i;
    if (text.startsWith('\\*', i)) {
      i = text.indexOf('\n', i);
      if (i < 0) i = text.length;
      regions.push({ start, end: i, atEnd: true });
    } else if (text.startsWith('(*', i)) {
      let depth = 1;
      i += 2;
      while (i < text.length && depth) {
        if (text.startsWith('(*', i)) { depth++; i += 2; }
        else if (text.startsWith('*)', i)) { depth--; i += 2; }
        else i++;
      }
      regions.push({ start, end: i, atEnd: depth > 0 });
    } else if (text[i] === '"') {
      let closed = false;
      i++;
      while (i < text.length) {
        if (text[i] === '\\') i = Math.min(i + 2, text.length);
        else if (text[i++] === '"') { closed = true; break; }
      }
      regions.push({ start, end: i, atEnd: !closed });
    } else {
      const token = ['<<', '>>'].includes(text.slice(i, i + 2)) ? text.slice(i, i + 2) : text[i];
      if (OPEN.has(token)) stack.push({ start, close: OPEN.get(token) });
      else if (CLOSE.has(token) && stack.at(-1)?.close === token) stack.pop();
      i += token.length;
    }
  }
  return { regions, stack };
}

function inTrivia(scanResult, offset) {
  return scanResult.regions.some(region => offset >= region.start
    && (offset < region.end || (offset === region.end && region.atEnd)));
}

function wordRange(document, offset) {
  let start = offset, end = offset;
  while (start > 0 && /[A-Za-z0-9_]/.test(document.text[start - 1])) start--;
  while (end < document.text.length && /[A-Za-z0-9_]/.test(document.text[end])) end++;
  if (start > 0 && document.text[start - 1] === '\\') start--;
  return { start, end, prefix: document.text.slice(start, offset) };
}

function pointAt(document, offset) {
  let line = 0;
  while (line + 1 < document.lines.length && document.lines[line + 1] <= offset) line++;
  return { line, character: offset - document.lines[line] };
}

function ownerOf(binding) {
  const { node } = binding;
  const parent = node.parent;
  return parent && (parent.childForFieldName('name')?.id === node.id || DECLARATIONS.has(parent.type))
    ? parent : node;
}

function moduleName(binding) {
  if (binding.kind === 'module') return binding.node.text;
  for (let scope = binding.scope; scope; scope = scope.parent) {
    if (scope.node.type === 'module') return scope.node.childForFieldName('name')?.text || '';
  }
  return path.basename(filePath(binding.document.uri) || '', '.tla');
}

function compact(text) { return text.replace(/\s+/g, ' ').trim(); }

function cleanComment(text) {
  return text.split(/\r?\n/).filter(line => !/^[()*\s]+$/.test(line)).map(line => line.trim()
    .replace(/^\\\*\s?/, '').replace(/^\(\*+\s?/, '').replace(/\s?\*+\)$/, '')
    .replace(/^\*+\s?/, '').replace(/\s+$/, '')).filter(line => !/^\*+$/.test(line)).join('\n').trim();
}

function adjacentComments(owner, after = false) {
  const comments = [];
  let previous = owner;
  for (let node = after ? owner.nextNamedSibling : owner.previousNamedSibling;
    node && COMMENTS.has(node.type); node = after ? node.nextNamedSibling : node.previousNamedSibling) {
    const a = after ? previous.endIndex : node.endIndex;
    const b = after ? node.startIndex : previous.startIndex;
    const gap = owner.tree.rootNode.text.slice(a, b);
    if (!/^\s*$/.test(gap) || (gap.match(/\n/g) || []).length > 1) break;
    if (after) comments.push(node.text); else comments.unshift(node.text);
    previous = node;
  }
  return comments.map(cleanComment).filter(Boolean).join('\n');
}

function bindingInfo(binding, navigation) {
  const owner = ownerOf(binding);
  const name = binding.node.text;
  let parameters = owner.childrenForFieldName('parameter').filter(node => node.isNamed && !COMMENTS.has(node.type))
    .map(node => compact(node.text));
  if (owner.type === 'operator_declaration' && !parameters.length) {
    parameters = owner.namedChildren.filter(node => node.type === 'placeholder').map(node => node.text);
  }
  let signature = name;
  if (binding.node.type === 'infix_op_symbol' && parameters.length === 2) {
    signature = `${parameters[0]} ${name} ${parameters[1]}`;
  } else if (binding.node.type === 'prefix_op_symbol' && parameters.length) {
    signature = `${name} ${parameters[0]}`;
  } else if (binding.node.type === 'postfix_op_symbol' && parameters.length) {
    signature = `${parameters[0]} ${name}`;
  } else if (parameters.length) signature += `(${parameters.join(', ')})`;
  let parameterStart = name.length + 1;
  const parameterRanges = parameters.map((parameter, index) => {
    let start = parameterStart;
    if (binding.node.type === 'infix_op_symbol') start = index === 0 ? 0 : parameters[0].length + name.length + 2;
    if (binding.node.type === 'postfix_op_symbol') start = 0;
    parameterStart = start + parameter.length + 2;
    return [start, start + parameter.length];
  });
  if (owner.type === 'function_definition') {
    signature += `[${owner.namedChildren.filter(node => node.type === 'quantifier_bound').map(node => compact(node.text)).join(', ')}]`;
  }
  const module = moduleName(binding);
  const bundled = path.dirname(filePath(binding.document.uri) || '') === navigation.standardModulePath;
  const dummy = bundled && ['Naturals', 'Integers', 'Reals'].includes(module);
  let kind = binding.kind === 'module' || binding.kind === 'instance' ? 9
    : binding.kind === 'operator' || binding.kind === 'recursive' ? 3 : 6;
  const declaration = owner.type === 'operator_declaration' ? owner.parent : owner;
  let prefix = '';
  if (declaration.type === 'constant_declaration') { prefix = 'CONSTANT '; kind = 21; }
  if (declaration.type === 'variable_declaration') prefix = 'VARIABLE ';
  if (owner.type === 'module') signature = `MODULE ${name}`;
  const body = owner.childForFieldName('definition');
  const inline = body ? owner.namedChildren.filter(node => COMMENTS.has(node.type) && node.endIndex <= body.startIndex)
    .map(node => cleanComment(node.text)).filter(Boolean).join('\n') : '';
  const anchor = owner.parent?.type === 'local_definition' ? owner.parent : owner;
  const documentation = (inline || (bundled ? adjacentComments(anchor, true) : adjacentComments(anchor))).slice(0, 4000);
  let preview = prefix + signature;
  if (['operator_definition', 'function_definition', 'module_definition', 'theorem', 'assumption'].includes(owner.type) && !dummy) {
    preview = owner.text.split(/\r?\n/).slice(0, 14).join('\n');
    if (preview.length > 1200) preview = `${preview.slice(0, 1200)}…`;
    else if (preview.length < owner.text.length) preview += '\n…';
  }
  return { name, signature, parameters, parameterRanges, kind, module, bundled, preview, documentation,
    note: dummy ? '官方标准模块中的占位定义；实际语义由 TLA+ 工具实现。' : '' };
}

function formatted(info, markdown, preview = false, includeCode = true) {
  const code = preview ? info.preview : info.signature;
  const source = `${info.bundled ? 'TLA+ 标准库' : '模块'}: ${info.module}`;
  return { kind: markdown ? 'markdown' : 'plaintext', value: [
    includeCode && (markdown ? `\`\`\`tla\n${code}\n\`\`\`` : code), source, info.documentation, info.note,
  ].filter(Boolean).join('\n\n') };
}

class LanguageFeatures {
  constructor(navigation) {
    this.navigation = navigation;
    this.configure({});
  }

  configure(params) {
    const capabilities = params.capabilities?.textDocument || {};
    this.markdownHover = capabilities.hover?.contentFormat?.includes('markdown') || false;
    this.markdownCompletion = capabilities.completion?.completionItem?.documentationFormat?.includes('markdown') || false;
    this.markdownSignature = capabilities.signatureHelp?.signatureInformation?.documentationFormat?.includes('markdown') || false;
    this.parameterOffsets = capabilities.signatureHelp?.signatureInformation?.parameterInformation?.labelOffsetSupport || false;
  }

  hover(uri, pos) {
    const document = this.navigation.load(uri);
    const node = document?.token(pos);
    if (!node) return null;
    const bindings = this.navigation.bindingsAt(document, node);
    if (!bindings.length) return null;
    return { contents: { kind: this.markdownHover ? 'markdown' : 'plaintext', value: bindings.map(binding =>
      formatted(bindingInfo(binding, this.navigation), this.markdownHover, true).value).join('\n\n---\n\n') },
    range: { start: position(node.startPosition), end: position(node.endPosition) } };
  }

  // Replace the token under the caret with a valid expression and close only
  // delimiters with no matching closer anywhere in the original buffer. This
  // recovers scopes for `Op(` / `I!` without changing the live document or disk.
  probe(document, offset, scanned, callback) {
    const span = wordRange(document, offset);
    const closers = scanned.stack.filter(item => item.start < span.start).reverse().map(item => item.close).join('');
    const text = document.text.slice(0, span.start) + PROBE + closers + document.text.slice(span.end);
    const temporary = new Document(document.uri, text, this.navigation.parser);
    try {
      const node = temporary.token(pointAt(temporary, span.start));
      return callback(temporary, node, span, span.start);
    } finally { temporary.tree.delete(); }
  }

  modules(document, scope) {
    const result = new Map();
    for (let current = scope; current; current = current.parent) {
      for (const name of current.modules.keys()) if (!result.has(name)) result.set(name, '内部模块');
    }
    for (const directory of this.navigation.moduleDirectories(document)) {
      let files = [];
      try { files = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name); }
      catch (error) { if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error; }
      for (const uri of this.navigation.open) {
        const file = filePath(uri);
        if (file && path.dirname(file) === directory) files.push(path.basename(file));
      }
      for (const file of files) {
        if (!/^[A-Za-z0-9_]+\.tla$/.test(file)) continue;
        const name = file.slice(0, -4);
        if (!result.has(name)) result.set(name, directory === this.navigation.standardModulePath ? 'TLA+ 标准库' : '模块');
      }
    }
    return result;
  }

  completion(uri, pos) {
    const document = this.navigation.load(uri);
    const offset = document?.offset(pos);
    if (offset === null || offset === undefined) return [];
    const scanned = scan(document.text);
    if (inTrivia(scanned, offset)) return [];
    return this.probe(document, offset, scanned, (temporary, node, span) => {
      if (!node || node.text !== PROBE || node.type !== 'identifier_ref') return [];
      const scope = temporary.scopes.get(node.id);
      if (!scope) return [];
      const range = { start: pointAt(document, span.start), end: pointAt(document, span.end) };
      const matches = name => name.toLowerCase().startsWith(span.prefix.toLowerCase());
      if (node.parent.type === 'extends' || node.parent.type === 'instance') {
        return [...this.modules(document, scope)].filter(([name]) => matches(name)).sort(([a], [b]) => a.localeCompare(b))
          .map(([label, detail]) => ({ label, kind: 9, detail, textEdit: { range, newText: label } }));
      }
      // Record fields, proof selectors and substituted names are not ordinary
      // lexical references. WITH's left side uses the source module's exports.
      let visible;
      if (node.parent.type === 'substitution' && node.parent.namedChildren[0]?.id === node.id) {
        const instance = node.parent.parent;
        const name = instance.namedChildren.find(child => child.type === 'identifier_ref');
        visible = this.navigation.visible(this.navigation.module(scope, name?.text), true);
      } else {
        const parts = qualifiedParts(node);
        const index = parts.findIndex(part => part.id === node.id);
        if (!parts.length) for (let parent = node.parent; parent; parent = parent.parent) {
          if (parent.type === 'prefixed_op' && (operatorName(parent.childForFieldName('op'))?.id === node.id
            || node.parent.type === 'subexpr_component')) return [];
        }
        if (index > 0) {
          let bindings = this.navigation.resolve(scope, key(parts[0]));
          for (let i = 1; i < index; i++) bindings = this.navigation.members(bindings, key(parts[i]));
          visible = new Map();
          for (const binding of bindings) for (const [name, members] of this.navigation.visible(
            this.navigation.memberScope(binding), true, new Set(), Boolean(binding.instance))) {
            visible.set(name, [...(visible.get(name) || []), ...members]);
          }
        } else visible = this.navigation.visible(scope);
      }
      return [...visible.values()].flatMap(bindings => {
        const unique = [...new Map(bindings.map(binding => [JSON.stringify(location(binding)), binding])).values()];
        // Ambiguous imports have no safe completion target.
        if (unique.length !== 1) return [];
        const binding = unique[0];
        if (binding.kind === 'module' || !matches(binding.node.text)) return [];
        const info = bindingInfo(binding, this.navigation);
        return [{ label: info.name, kind: info.kind, detail: `${info.signature} · ${info.module}`,
          documentation: formatted(info, this.markdownCompletion), insertTextFormat: 1,
          textEdit: { range, newText: info.name } }];
      }).sort((a, b) => a.label.localeCompare(b.label));
    });
  }

  signatureAt(document, offset) {
    for (let call = document.tree.rootNode.namedDescendantForIndex(offset, offset); call; call = call.parent) {
      if (!['bound_op', 'bound_nonfix_op'].includes(call.type)) continue;
      const open = call.children.find(node => node.type === '(');
      const close = call.children.findLast(node => node.type === ')');
      if (!open || !close || offset < open.endIndex || offset > close.startIndex || call.hasError) continue;
      const name = operatorName(call);
      // token() also excludes comments, proofs and PlusCal bodies.
      if (!document.token(position(name.startPosition))) return null;
      const bindings = this.navigation.bindingsAt(document, name);
      const activeParameter = call.children.filter(node => node.type === ',' && node.endIndex <= offset).length;
      const signatures = bindings.map(binding => bindingInfo(binding, this.navigation))
        .filter(info => info.parameters.length > 0).map(info => ({ label: info.signature,
          documentation: formatted(info, this.markdownSignature, false, false),
          parameters: info.parameters.map((label, index) => ({ label: this.parameterOffsets ? info.parameterRanges[index] : label })),
          activeParameter: Math.min(activeParameter, info.parameters.length - 1),
        }));
      return signatures.length ? { signatures, activeSignature: 0, activeParameter: signatures[0].activeParameter } : null;
    }
    return null;
  }

  signatureHelp(uri, pos) {
    const document = this.navigation.load(uri);
    const offset = document?.offset(pos);
    if (offset === null || offset === undefined) return null;
    const scanned = scan(document.text);
    if (inTrivia(scanned, offset)) return null;
    return this.signatureAt(document, offset)
      || this.probe(document, offset, scanned, (temporary, _node, _span, point) => this.signatureAt(temporary, point));
  }
}

module.exports = { LanguageFeatures };
