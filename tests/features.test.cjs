'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { Navigation } = require('../server/navigation.cjs');
const { LanguageFeatures } = require('../server/features.cjs');

function marked(source) {
  let text = '', end = 0;
  const marks = {};
  for (const match of source.matchAll(/«(\w+)»/g)) {
    text += source.slice(end, match.index);
    const lines = text.split('\n');
    marks[match[1]] = { line: lines.length - 1, character: lines.at(-1).length };
    end = match.index + match[0].length;
  }
  return { text: text + source.slice(end), marks };
}

async function fixture(t, inputs, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tla editor 中文 '));
  const nav = await Navigation.create();
  const features = new LanguageFeatures(nav);
  const files = {};
  t.after(() => { nav.dispose(); fs.rmSync(directory, { recursive: true, force: true }); });
  for (const [name, source] of Object.entries(inputs)) {
    const file = path.join(directory, name), parsed = marked(source);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, parsed.text);
    files[name] = { ...parsed, uri: pathToFileURL(file).href, file };
  }
  nav.configure({ rootUri: pathToFileURL(directory).href, initializationOptions: options });
  const query = (method, mark, file = 'Main.tla') => features[method](files[file].uri, files[file].marks[mark]);
  return { nav, features, directory, files, query,
    labels(mark, file) { return query('completion', mark, file).map(item => item.label); } };
}

test('bundled libraries support definition, documentation, completion and transitive imports offline', async t => {
  const f = await fixture(t, { 'Main.tla': `---- MODULE Main ----
EXTENDS Sequences, Integers, FiniteSets
Use == «len»Len(<<1>>) + «card»Cardinality({1})
NatSet == «nat»Nat
Partial == App«complete»
====` });
  const { uri, marks } = f.files['Main.tla'];
  for (const [mark, module] of [['len', 'Sequences'], ['card', 'FiniteSets'], ['nat', 'Naturals']]) {
    const [target] = f.nav.definition(uri, marks[mark]);
    assert.equal(path.basename(fileURLToPath(target.uri)), `${module}.tla`);
    assert.ok(fs.existsSync(fileURLToPath(target.uri)));
  }
  assert.match(f.query('hover', 'len').contents.value, /The length of sequence s/);
  assert.match(f.query('hover', 'card').contents.value, /defined only for finite sets/);
  assert.doesNotMatch(f.query('hover', 'len').contents.value, /^\)$/m);
  assert.deepEqual(f.labels('complete'), ['Append']);
  const nat = f.query('hover', 'nat').contents.value;
  assert.match(nat, /Placeholder definition/);
  assert.doesNotMatch(nat, /== \{ \}/);
});

test('standard modules do not introduce names unless imported, and LOCAL imports remain private', async t => {
  const f = await fixture(t, { 'Main.tla': '---- MODULE Main ----\nEXTENDS Sequences\nUse == «all»unknown\n====' });
  const labels = f.labels('all');
  assert.ok(labels.includes('Append'));
  assert.ok(!labels.includes('Nat'));
  assert.ok(!labels.includes('Cardinality'));
  f.nav.update(f.files['Main.tla'].uri, '---- MODULE Main ----\nUse == Len(<<>>)\n====');
  assert.equal(f.features.hover(f.files['Main.tla'].uri, { line: 1, character: 7 }), null);
  assert.ok(!f.features.completion(f.files['Main.tla'].uri, { line: 1, character: 7 }).some(item => item.label === 'Append'));
});

test('project and configured modules override bundled versions; unsaved content updates all features', async t => {
  const f = await fixture(t, {
    'Main.tla': '---- MODULE Main ----\nEXTENDS Sequences\nUse == «call»Len(«arg»1)\n====',
    'lib/Sequences.tla': '---- MODULE Sequences ----\n\\* Custom implementation.\nLen(value) == value\n====',
  }, { modulePaths: ['lib'] });
  assert.match(f.query('hover', 'call').contents.value, /Custom implementation/);
  assert.match(f.query('hover', 'call').contents.value, /Len\(value\)/);
  f.nav.update(f.files['lib/Sequences.tla'].uri, '---- MODULE Sequences ----\nLen(newValue) == newValue\n====');
  assert.equal(f.query('signatureHelp', 'arg').signatures[0].label, 'Len(newValue)');
  f.nav.close(f.files['lib/Sequences.tla'].uri);
  assert.equal(f.query('signatureHelp', 'arg').signatures[0].label, 'Len(value)');
  fs.writeFileSync(path.join(f.directory, 'Sequences.tla'), '---- MODULE Sequences ----\nLen(projectValue) == projectValue\n====');
  assert.equal(f.query('signatureHelp', 'arg').signatures[0].label, 'Len(projectValue)');
});

test('hover shows comments, signatures, source modules and exact UTF-16 ranges', async t => {
  const f = await fixture(t, { 'Main.tla': String.raw`---- MODULE Main ----
VARIABLE count
\* Increase the counter.
\* 中文说明。
Increment(delta) == count' = count + delta
Use == (* 中文😀 *) «call»Increment(1)
Var == «variable»count
====`.replaceAll('\n', '\r\n') });
  f.features.configure({ capabilities: { textDocument: { hover: { contentFormat: ['markdown'] } } } });
  const hover = f.query('hover', 'call');
  assert.equal(hover.contents.kind, 'markdown');
  assert.match(hover.contents.value, /```tla\nIncrement\(delta\)/);
  assert.match(hover.contents.value, /Increase the counter\.\n中文说明/);
  assert.match(hover.contents.value, /Module: Main/);
  assert.deepEqual(hover.range.start, f.files['Main.tla'].marks.call);
  assert.equal(hover.range.end.character - hover.range.start.character, 'Increment'.length);
  assert.match(f.query('hover', 'variable').contents.value, /VARIABLE count/);
});

test('completion follows lexical shadowing, LET and quantifier domains with no punctuation candidates', async t => {
  const f = await fixture(t, { 'Main.tla': String.raw`---- MODULE Main ----
CONSTANT x
Op(x) == LET Local(y) == «inner»y IN «inside»Local(x)
After == «outside»x
Quant == \A x \in «domain»x : «bound»x = x
====` });
  assert.ok(f.labels('inner').includes('y'));
  assert.ok(f.labels('inside').includes('Local'));
  assert.ok(!f.labels('inside').includes('y'));
  assert.ok(!f.labels('outside').includes('Local'));
  assert.equal(f.query('completion', 'inside').filter(item => item.label === 'x').length, 1);
  assert.equal(f.query('completion', 'inside').find(item => item.label === 'x').kind, 6);
  assert.equal(f.query('completion', 'domain').find(item => item.label === 'x').kind, 21);
  assert.equal(f.query('completion', 'bound').find(item => item.label === 'x').kind, 6);
  assert.ok(f.labels('inner').every(label => !['(', ')', ','].includes(label)));
});

test('qualified completion respects INSTANCE exports, chained instances, arguments and WITH', async t => {
  const f = await fixture(t, {
    'Main.tla': `---- MODULE Main ----
CONSTANT caller
I(v) == INSTANCE Base WITH «with»c <- v
Use == I(caller)!«member»Value(1)
Nested == I(caller)!Child!«child»Leaf
Argument == I(caller)!Value(«argument»caller)
====`,
    'Base.tla': '---- MODULE Base ----\nCONSTANT c\nValue(y) == c + y\nLOCAL Secret == 1\nChild == INSTANCE Nested\n====',
    'Nested.tla': '---- MODULE Nested ----\nLeaf == 1\n====',
  });
  assert.deepEqual(f.labels('member').sort(), ['Child', 'Value']);
  assert.deepEqual(f.labels('child'), ['Leaf']);
  assert.ok(f.labels('with').includes('c'));
  assert.ok(f.labels('argument').includes('caller'));
  assert.ok(!f.labels('argument').includes('c'));
  assert.equal(f.query('signatureHelp', 'argument').signatures[0].label, 'Value(y)');
  assert.match(f.query('hover', 'member').contents.value, /Module: Base/);
});

test('completion recovers unfinished qualified names and calls without modifying live documents', async t => {
  const f = await fixture(t, { 'Main.tla': '---- MODULE Main ----\nI == INSTANCE Sequences\nUse(p) == I!«cursor»\n====' });
  assert.ok(f.labels('cursor').includes('Append'));
  const original = f.nav.load(f.files['Main.tla'].uri);
  assert.equal(original.text, f.files['Main.tla'].text);
  assert.equal(original.tree.rootNode.text, original.text);
  const partial = marked('---- MODULE Main ----\nEXTENDS Sequences\nUse(p) == Append(«cursor»\n====');
  f.nav.update(original.uri, partial.text);
  assert.ok(f.features.completion(original.uri, partial.marks.cursor).some(item => item.label === 'p'));
  assert.equal(f.features.signatureHelp(original.uri, partial.marks.cursor).signatures[0].label, 'Append(s, e)');
  assert.equal(f.nav.load(original.uri).text, partial.text);
});

test('module completion includes standard, configured and unsaved modules', async t => {
  const f = await fixture(t, {
    'Main.tla': '---- MODULE Main ----\nEXTENDS Seq«extends»\nI == INSTANCE «instance»Unknown\n====',
    'lib/Custom.tla': '---- MODULE Custom ----\n====',
  }, { modulePaths: ['lib'] });
  const uri = pathToFileURL(path.join(f.directory, 'Unsaved.tla')).href;
  f.nav.update(uri, '---- MODULE Unsaved ----\n====');
  assert.deepEqual(f.labels('extends'), ['Sequences']);
  for (const module of ['Custom', 'Naturals', 'Unsaved']) assert.ok(f.labels('instance').includes(module));
});

test('completion replaces the entire identifier and preserves Unicode, CRLF and following calls', async t => {
  const f = await fixture(t, { 'Main.tla': '---- MODULE Main ----\r\nEXTENDS Sequences\r\nUse == (* 😀 *) App«cursor»end(<<>>, 1)\r\n====' });
  const [item] = f.query('completion', 'cursor');
  assert.equal(item.label, 'Append');
  const { text } = f.files['Main.tla'];
  const doc = f.nav.load(f.files['Main.tla'].uri);
  const changed = text.slice(0, doc.offset(item.textEdit.range.start)) + item.textEdit.newText
    + text.slice(doc.offset(item.textEdit.range.end));
  assert.equal(changed, text);
  assert.equal(item.textEdit.range.end.character - item.textEdit.range.start.character, 6);
});

test('editor features ignore comments, strings, PlusCal, fields and unsupported proof selectors', async t => {
  const f = await fixture(t, { 'Main.tla': String.raw`---- MODULE Main ----
VARIABLE x, field, label
F(a, b) == a
\* «comment»x F(
(* outer (* nested *) «block»x *)
Text == "«string»x F("
Record == [«key»field |-> x].«property»field
Update == [Record EXCEPT !.«update»field = x]
Op == lbl:: x
Selector == Op!«label»lbl
Numeric == Op!1!«numeric»label
(* --algorithm Example { variable «pcal»x = 0; begin Skip: skip; } *)
====` });
  for (const mark of ['comment', 'block', 'string', 'key', 'property', 'update', 'label', 'numeric', 'pcal']) {
    assert.deepEqual(f.labels(mark), [], mark);
    assert.equal(f.query('signatureHelp', mark), null, mark);
    assert.equal(f.query('hover', mark), null, mark);
  }
  for (const text of ['\\* F(', '(* F(', '"F(']) {
    const source = '---- MODULE Main ----\nF(x) == x\nUse == ' + text;
    const uri = f.files['Main.tla'].uri;
    f.nav.update(uri, source);
    const pos = { line: 2, character: ('Use == ' + text).length };
    assert.deepEqual(f.features.completion(uri, pos), []);
    assert.equal(f.features.signatureHelp(uri, pos), null);
  }
});

test('signature help counts arguments structurally and recovers incomplete calls', async t => {
  const cases = [
    ['F(«cursor»1, 2)', 'F(a, b)', 0],
    ['F(1, «cursor»2)', 'F(a, b)', 1],
    ['F(G(1, «cursor»2), 3)', 'G(x, y)', 1],
    ['F(G(1, 2), «cursor»3)', 'F(a, b)', 1],
    ['F(<<1, 2>>, «cursor»3)', 'F(a, b)', 1],
    ['F([a |-> 1, b |-> 2], «cursor»3)', 'F(a, b)', 1],
    ['F({1, 2}, «cursor»3)', 'F(a, b)', 1],
    [String.raw`F(\A x,y \in {1,2} : x = y, «cursor»TRUE)`, 'F(a, b)', 1],
    ['F("(,)", (* , (* nested *) *) «cursor»3)', 'F(a, b)', 1],
    ['F(«cursor»', 'F(a, b)', 0],
    ['F(G(1, 2), «cursor»', 'F(a, b)', 1],
    ['F(1, 2)«cursor»', null],
  ];
  const f = await fixture(t, { 'Main.tla': '---- MODULE Main ----\n====' });
  for (const [expression, label, active] of cases) {
    const source = marked('---- MODULE Main ----\nF(a,b) == a\nG(x,y) == y\nUse == ' + expression + '\n====');
    const uri = f.files['Main.tla'].uri;
    f.nav.update(uri, source.text);
    const help = f.features.signatureHelp(uri, source.marks.cursor);
    if (label === null) assert.equal(help, null, expression);
    else {
      assert.equal(help?.signatures[0].label, label, expression);
      assert.equal(help.activeParameter, active, expression);
    }
  }
});

test('higher-order and constant operators expose parameter signatures', async t => {
  const f = await fixture(t, { 'Main.tla': `---- MODULE Main ----
EXTENDS Sequences
CONSTANT P(_, _)
Apply(Op(_), value) == Op(«operator»value)
Use == SelectSeq(<<1>>, «higher»P)
Other == P(1, «constant»2)
====` });
  assert.equal(f.query('signatureHelp', 'operator').signatures[0].label, 'Op(_)');
  assert.equal(f.query('signatureHelp', 'higher').signatures[0].label, 'SelectSeq(s, Test(_))');
  assert.equal(f.query('signatureHelp', 'constant').signatures[0].label, 'P(_, _)');
  f.features.configure({ capabilities: { textDocument: { signatureHelp: { signatureInformation: {
    parameterInformation: { labelOffsetSupport: true },
  } } } } });
  const signature = f.query('signatureHelp', 'constant').signatures[0];
  assert.deepEqual(signature.parameters.map(parameter => parameter.label), [[2, 3], [5, 6]]);
  assert.equal(signature.activeParameter, 1);
  assert.doesNotMatch(signature.documentation.value, /P\(_/);
});

test('cyclic and diamond imports terminate, deduplicate exports and suppress ambiguous names', async t => {
  const f = await fixture(t, {
    'Main.tla': '---- MODULE Main ----\nEXTENDS A, B\nUse == «cursor»Value\n====',
    'A.tla': '---- MODULE A ----\nEXTENDS Base, Main\nConflict == 1\nLOCAL Hidden == 1\n====',
    'B.tla': '---- MODULE B ----\nEXTENDS Base\nConflict == 2\n====',
    'Base.tla': '---- MODULE Base ----\nValue == 1\n====',
  });
  const labels = f.labels('cursor');
  assert.equal(labels.filter(label => label === 'Value').length, 1);
  assert.ok(!labels.includes('Hidden'));
  assert.ok(!labels.includes('Conflict'));
});

test('bundled standard modules match pinned upstream hashes and parse with the shipped grammar', async t => {
  const nav = await Navigation.create();
  t.after(() => nav.dispose());
  const provenance = JSON.parse(fs.readFileSync(path.join(nav.standardModulePath, 'provenance.json'), 'utf8'));
  assert.equal(Object.keys(provenance.sha256).filter(name => name.endsWith('.tla')).length, 10);
  for (const [name, hash] of Object.entries(provenance.sha256)) {
    const source = fs.readFileSync(path.join(nav.standardModulePath, name));
    assert.equal(createHash('sha256').update(source).digest('hex'), hash, name);
    if (name.endsWith('.tla')) {
      const tree = nav.parser.parse(source.toString('utf8'));
      try { assert.equal(tree.rootNode.hasError, false, name); }
      finally { tree.delete(); }
    }
  }
});
