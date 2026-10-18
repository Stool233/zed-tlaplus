'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Navigation } = require('../server/navigation.cjs');

function marked(input) {
  let text = '', end = 0;
  const marks = {};
  for (const match of input.matchAll(/«([^:]+):([^»]+)»/g)) {
    text += input.slice(end, match.index);
    const lines = text.split('\n');
    marks[match[1]] = { start: { line: lines.length - 1, character: lines.at(-1).length },
      end: { line: lines.length - 1, character: lines.at(-1).length + match[2].length } };
    text += match[2];
    end = match.index + match[0].length;
  }
  return { text: text + input.slice(end), marks };
}

async function fixture(t, inputs, allowInvalid = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tla navigation 中文 '));
  const nav = await Navigation.create();
  t.after(() => { nav.dispose(); fs.rmSync(directory, { recursive: true, force: true }); });
  const files = {};
  for (const [name, input] of Object.entries(inputs)) {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const parsed = marked(input);
    const tree = nav.parser.parse(parsed.text);
    try {
      if (!allowInvalid) assert.equal(tree.rootNode.hasError, false, `${name}: ${tree.rootNode}`);
    } finally { tree.delete(); }
    fs.writeFileSync(file, parsed.text);
    files[name] = { ...parsed, file, uri: pathToFileURL(file).href };
  }
  nav.configure({ rootUri: pathToFileURL(directory).href });
  return {
    nav, files, directory,
    jump(from, mark, to = from, target = 'decl') {
      assert.deepEqual(nav.definition(files[from].uri, files[from].marks[mark].start),
        [{ uri: files[to].uri, range: files[to].marks[target] }], `${from}:${mark} -> ${to}:${target}`);
    },
    noJump(from, mark) {
      assert.equal(nav.definition(files[from].uri, files[from].marks[mark].start), null, `${from}:${mark}`);
    },
  };
}

test('module variables, constants, named assumptions, theorems and operator parameters', async t => {
  const f = await fixture(t, { 'Main.tla': String.raw`---- MODULE Main ----
CONSTANT «max:Max», «predicate:P»(_)
VARIABLE «count:count»
ASSUME «assumption:Limit» == Max > 0
«increment:Increment»(«param:delta») == count' = «refCount:count» + «refParam:delta»
Next == «refInc:Increment»(«refMax:Max»)
THEOREM «theorem:Safety» == «refP:P»(count)
Check == «refThm:Safety» /\ «refAssume:Limit»
====` });
  for (const [ref, target] of [['refCount','count'], ['refParam','param'], ['refInc','increment'],
    ['refMax','max'], ['refP','predicate'], ['refThm','theorem'], ['refAssume','assumption']]) {
    f.jump('Main.tla', ref, 'Main.tla', target);
  }
});

test('LET nesting shadows outside names and does not leak into other operators', async t => {
  const f = await fixture(t, { 'Main.tla': String.raw`---- MODULE Main ----
CONSTANT «global:x»
Op(«param:x») == LET «local:F»(«localParam:x») == «inner:x»
                      G == «call:F»(«argument:x»)
                  IN G
Other == «outside:x»
Missing == «leaked:F»
====` });
  f.jump('Main.tla','inner','Main.tla','localParam');
  f.jump('Main.tla','call','Main.tla','local');
  f.jump('Main.tla','argument','Main.tla','param');
  f.jump('Main.tla','outside','Main.tla','global');
  f.noJump('Main.tla','leaked');
});

test('bound variables in quantifiers, functions, sets, CHOOSE and LAMBDA', async t => {
  const f = await fixture(t, { 'Main.tla': String.raw`---- MODULE Main ----
CONSTANT «global:x», S, Apply(_)
Quant == \A «quant:x» \in «domain:x», y \in «otherDomain:x» : «qref:x» = y
Tuple == \E <<«tuple:x», y>> \in S : «tref:x» = y
Unbounded == \A «unbounded:x» : «uref:x» = x
Choose == CHOOSE «choose:x» \in «chooseDomain:x» : «cref:x» = x
Fun[«function:x» \in S] == «fref:x»
Literal == [«literal:x» \in S |-> «lref:x»]
Filter == {«filter:x» \in S : «filterRef:x» = x}
Map == {«mapRef:x» : «map:x» \in S}
Lambda == Apply(LAMBDA «lambda:x» : «lambdaRef:x»)
====` });
  for (const [ref, target] of [['domain','global'], ['otherDomain','global'], ['qref','quant'],
    ['tref','tuple'], ['uref','unbounded'], ['chooseDomain','global'], ['cref','choose'],
    ['fref','function'], ['lref','literal'], ['filterRef','filter'], ['mapRef','map'], ['lambdaRef','lambda']]) {
    f.jump('Main.tla',ref,'Main.tla',target);
  }
});

test('EXTENDS transitive exports, module names, LOCAL privacy and cycle protection', async t => {
  const f = await fixture(t, {
    'Main.tla': '---- MODULE Main ----\nEXTENDS «module:Middle»\nUse == «ref:Value»\nHidden == «hidden:Secret»\nMissing == «missing:Absent»\n====',
    'Middle.tla': '---- MODULE «decl:Middle» ----\nEXTENDS Base\n====',
    'Base.tla': '---- MODULE Base ----\nEXTENDS Main\n«decl:Value» == 42\nLOCAL Secret == 1\n====',
  });
  f.jump('Main.tla','module','Middle.tla');
  f.jump('Main.tla','ref','Base.tla');
  f.noJump('Main.tla','hidden');
  f.noJump('Main.tla','missing');
});

test('named and unnamed INSTANCE, WITH source and target, chained qualifications', async t => {
  const f = await fixture(t, {
    'Main.tla': `---- MODULE Main ----
CONSTANT «outer:x»
«alias:I» == INSTANCE «module:Base» WITH «withLeft:x» <- «withRight:x»
Use == «refAlias:I»!«ref:Value»(«arg:x»)
Chain == I!Child!«nested:Leaf»
INSTANCE Base WITH x <- x
Plain == «plain:Value»(x)
====`,
    'Base.tla': '---- MODULE «module:Base» ----\nCONSTANT «x:x»\n«decl:Value»(y) == x + y\nChild == INSTANCE Leaf\n====',
    'Leaf.tla': '---- MODULE Leaf ----\n«decl:Leaf» == 7\n====',
  });
  f.jump('Main.tla','module','Base.tla','module');
  f.jump('Main.tla','withLeft','Base.tla','x');
  f.jump('Main.tla','withRight','Main.tla','outer');
  f.jump('Main.tla','refAlias','Main.tla','alias');
  f.jump('Main.tla','ref','Base.tla');
  f.jump('Main.tla','arg','Main.tla','outer');
  f.jump('Main.tla','nested','Leaf.tla');
  f.jump('Main.tla','plain','Base.tla');
});

test('parameterized instances keep call arguments in the caller scope', async t => {
  const f = await fixture(t, {
    'Main.tla': '---- MODULE Main ----\nCONSTANT «x:x»\nI(v) == INSTANCE Base WITH c <- v\nUse == I(«arg:x»)!«op:Op»(«arg2:x»)\n====',
    'Base.tla': '---- MODULE Base ----\nCONSTANT c\n«decl:Op»(y) == c + y\n====',
  });
  f.jump('Main.tla','op','Base.tla');
  f.jump('Main.tla','arg','Main.tla','x');
  f.jump('Main.tla','arg2','Main.tla','x');
});

test('inner module lookup and LOCAL INSTANCE are lexical', async t => {
  const f = await fixture(t, {
    'Main.tla': '---- MODULE Main ----\nEXTENDS Outer\nUse == «ref:Visible»\nOther == «hidden:Hidden»\n====',
    'Outer.tla': `---- MODULE Outer ----
---- MODULE «module:Inner» ----
«decl:Visible» == 1
====
I == INSTANCE «moduleRef:Inner»
Visible == I!«innerRef:Visible»
LOCAL INSTANCE Private
Inside == «privateRef:Hidden»
====`,
    'Private.tla': '---- MODULE Private ----\n«decl:Hidden» == 1\n====',
  });
  f.jump('Outer.tla','moduleRef','Outer.tla','module');
  f.jump('Outer.tla','innerRef','Outer.tla');
  f.jump('Outer.tla','privateRef','Private.tla');
  f.noJump('Main.tla','hidden');
});

test('ignores comments, strings, record keys, unrelated files and unsupported selectors', async t => {
  const f = await fixture(t, {
    'Main.tla': String.raw`---- MODULE Main ----
VARIABLE x, field
\* «comment:x»
(* outer (* nested *) «block:x» *)
Text == "«string:x»"
Record == [«key:field» |-> x].«property:field»
Update == [Record EXCEPT !.«update:field» = x]
Op == lbl:: x
Selector == Op!«label:lbl»
Missing == «missing:Unrelated»
====`,
    'Unrelated.tla': '---- MODULE Unrelated ----\nUnrelated == 1\n====',
  });
  for (const mark of ['comment','block','string','key','property','update','label','missing']) f.noJump('Main.tla',mark);
});

test('symbolic operators normalize ASCII/Unicode and UTF-16 offsets survive emoji and CRLF', async t => {
  const f = await fixture(t, { 'Main.tla': String.raw`---- MODULE Main ----
CONSTANT «global:x»
a «decl:\prec» b == a = b
Value == (* 中文😀 *) x «ref:≺» x
Other == (* 😀 *) «x:x»
====`.replaceAll('\n', '\r\n') });
  f.jump('Main.tla','ref');
  f.jump('Main.tla','x','Main.tla','global');
});

test('modulePaths, unsaved imported buffers, close and external edits', async t => {
  const f = await fixture(t, {
    'Main.tla': '---- MODULE Main ----\nEXTENDS Library\nUse == «ref:Value»\n====',
    'lib/Library.tla': '---- MODULE Library ----\n«decl:Value» == 1\n====',
  });
  f.noJump('Main.tla','ref');
  f.nav.configure({ rootUri: pathToFileURL(f.directory).href, initializationOptions: { modulePaths: ['lib'] } });
  f.jump('Main.tla','ref','lib/Library.tla');
  const original = f.files['lib/Library.tla'];
  const changed = marked('---- MODULE Library ----\n\n\n«decl:Value» == 2\n====');
  f.nav.update(original.uri, changed.text);
  assert.equal(f.nav.definition(f.files['Main.tla'].uri, f.files['Main.tla'].marks.ref.start)[0].range.start.line, 3);
  f.nav.close(original.uri);
  f.jump('Main.tla','ref','lib/Library.tla');
  fs.writeFileSync(original.file, changed.text);
  assert.equal(f.nav.definition(f.files['Main.tla'].uri, f.files['Main.tla'].marks.ref.start)[0].range.start.line, 3);
});

test('partial syntax errors do not prevent navigation elsewhere; invalid positions return null', async t => {
  const f = await fixture(t, { 'Main.tla': '---- MODULE Main ----\nVARIABLE «decl:x»\nGood == «ref:x»\nBroken == IF\n====' }, true);
  f.jump('Main.tla','ref');
  assert.equal(f.nav.definition(f.files['Main.tla'].uri, { line: -1, character: 0 }), null);
  assert.equal(f.nav.definition(f.files['Main.tla'].uri, { line: 999, character: 0 }), null);
});

test('RECURSIVE declarations navigate calls to the actual definition', async t => {
  const f = await fixture(t, { 'Main.tla': '---- MODULE Main ----\nRECURSIVE F(_)\n«decl:F»(x) == IF x = 0 THEN 0 ELSE «ref:F»(x)\n====' });
  f.jump('Main.tla','ref');
});

test('comments between module and qualified names do not change resolution', async t => {
  const f = await fixture(t, {
    'Main.tla': '---- MODULE Main ----\nCONSTANT c\nI == INSTANCE (* note *) «module:Base» WITH (* note *) «sub:c» <- c\nUse == I!(* note *)«ref:Value»\nINSTANCE (* note *) Base WITH c <- c\nPlain == «plain:Value»\n====',
    'Base.tla': '---- MODULE «module:Base» ----\nCONSTANT «c:c»\n«decl:Value» == c\n====',
  });
  f.jump('Main.tla','module','Base.tla','module');
  f.jump('Main.tla','sub','Base.tla','c');
  f.jump('Main.tla','ref','Base.tla');
  f.jump('Main.tla','plain','Base.tla');
});

test('bundled WASM grammar parses the shipped TLA+ and PlusCal examples', async t => {
  const nav = await Navigation.create();
  t.after(() => nav.dispose());
  const examples = path.join(__dirname, '../examples');
  for (const name of fs.readdirSync(examples).filter(name => name.endsWith('.tla'))) {
    const tree = nav.parser.parse(fs.readFileSync(path.join(examples, name), 'utf8'));
    try { assert.equal(tree.rootNode.hasError, false, name); }
    finally { tree.delete(); }
  }
});
