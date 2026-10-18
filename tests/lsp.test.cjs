'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function client(t) {
  const child = spawn(process.execPath, [path.join(__dirname, '../server/server.cjs')], { stdio: 'pipe' });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const requests = new Map();
  let buffer = Buffer.alloc(0), sequence = 0, stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  child.stdout.on('data', data => {
    buffer = Buffer.concat([buffer, data]);
    while (true) {
      const split = buffer.indexOf('\r\n\r\n');
      if (split < 0) return;
      const header = buffer.subarray(0, split).toString();
      const match = /^Content-Length: (\d+)$/im.exec(header);
      assert.ok(match, `Non-LSP stdout: ${header}`);
      const end = split + 4 + Number(match[1]);
      if (buffer.length < end) return;
      const message = JSON.parse(buffer.subarray(split + 4, end));
      buffer = buffer.subarray(end);
      requests.get(message.id)?.(message);
      requests.delete(message.id);
    }
  });
  function send(message, fragmented = false) {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
    const frame = Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n`), body]);
    if (fragmented) {
      // Split headers, multibyte UTF-8 and JSON tokens across writes.
      for (let i = 0; i < frame.length; i += 7) child.stdin.write(frame.subarray(i, i + 7));
    } else child.stdin.write(frame);
  }
  return {
    child, stderr: () => stderr,
    notify(method, params, fragmented) { send({ method, params }, fragmented); },
    request(method, params, fragmented) {
      const id = ++sequence;
      const reply = new Promise(resolve => requests.set(id, resolve));
      send({ id, method, params }, fragmented);
      return reply;
    },
  };
}

test('real stdio LSP: initialization, UTF-16 edits, unsaved buffers, close and shutdown', { timeout: 15000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tla lsp 中文 '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const uri = pathToFileURL(path.join(directory, 'Main.tla')).href;
  const source = '---- MODULE Main ----\r\nVARIABLE x\r\nUse == (* 中文😀 *) x\r\n====';
  fs.writeFileSync(path.join(directory, 'Main.tla'), source);
  const c = client(t);
  assert.equal((await c.request('textDocument/definition', {})).error.code, -32002);
  const init = await c.request('initialize', { rootUri: pathToFileURL(directory).href }, true);
  assert.equal(init.result.capabilities.definitionProvider, true);
  assert.equal(init.result.capabilities.positionEncoding, 'utf-16');
  assert.equal(init.result.capabilities.textDocumentSync.change, 2);
  c.notify('initialized', {});
  c.notify('textDocument/didOpen', { textDocument: { uri, languageId: 'tlaplus', version: 1, text: source } }, true);
  const pos = { line: 2, character: source.split('\n')[2].lastIndexOf('x') };
  const definition = () => c.request('textDocument/definition', { textDocument: { uri }, position: pos });
  let result = (await definition()).result;
  assert.deepEqual(result, [{ uri, range: { start: { line: 1, character: 9 }, end: { line: 1, character: 10 } } }]);

  // Two incremental edits in one notification apply to successive document states.
  c.notify('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [
    { range: { start: { line: 1, character: 9 }, end: { line: 1, character: 10 } }, text: 'count' },
    { range: { start: pos, end: { ...pos, character: pos.character + 1 } }, text: 'count' },
  ] });
  result = (await definition()).result;
  assert.equal(result[0].range.end.character, 14);
  // Stale changes must not overwrite the newer document.
  c.notify('textDocument/didChange', { textDocument: { uri, version: 1 }, contentChanges: [{ text: source }] });
  assert.equal((await definition()).result[0].range.end.character, 14);

  // Full sync is valid even when the server also supports incremental edits.
  c.notify('textDocument/didChange', { textDocument: { uri, version: 3 }, contentChanges: [{ text: source.replace('VARIABLE x', 'VARIABLE y') }] });
  assert.equal((await definition()).result, null);
  c.notify('textDocument/didClose', { textDocument: { uri } });
  assert.equal((await definition()).result[0].range.end.character, 10);
  assert.equal((await c.request('not/a/method', {})).error.code, -32601);
  assert.equal((await c.request('shutdown')).result, null);
  const exit = once(c.child, 'exit');
  c.notify('exit');
  assert.equal((await exit)[0], 0, c.stderr());
  assert.equal(c.stderr(), '');
});

test('stdio LSP navigates to an imported unsaved module and honors modulePaths', { timeout: 15000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tla imports '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'lib'));
  const mainUri = pathToFileURL(path.join(directory, 'Main.tla')).href;
  const libUri = pathToFileURL(path.join(directory, 'lib', 'Lib.tla')).href;
  const c = client(t);
  await c.request('initialize', {
    workspaceFolders: [{ name: 'test', uri: pathToFileURL(directory).href }],
    initializationOptions: { modulePaths: ['lib'] },
  });
  c.notify('textDocument/didOpen', { textDocument: { uri: mainUri, version: 1,
    text: '---- MODULE Main ----\nEXTENDS Lib\nUse == Op\n====' } });
  c.notify('textDocument/didOpen', { textDocument: { uri: libUri, version: 1,
    text: '---- MODULE Lib ----\n\nOp == 1\n====' } });
  const response = await c.request('textDocument/definition', {
    textDocument: { uri: mainUri }, position: { line: 2, character: 7 },
  });
  assert.deepEqual(response.result, [{ uri: libUri, range: { start: { line: 2, character: 0 }, end: { line: 2, character: 2 } } }]);
  await c.request('shutdown');
  const exit = once(c.child, 'exit');
  c.notify('exit');
  assert.equal((await exit)[0], 0, c.stderr());
});

test('stdio LSP exposes standard library hover, completion and signatures after incremental edits', { timeout: 15000 }, async t => {
  const c = client(t);
  const uri = pathToFileURL(path.join(os.tmpdir(), 'zed-tla-unsaved-features', 'Main.tla')).href;
  const init = await c.request('initialize', { capabilities: { textDocument: {
    hover: { contentFormat: ['markdown'] },
    completion: { completionItem: { documentationFormat: ['markdown'], snippetSupport: true } },
    signatureHelp: { signatureInformation: { documentationFormat: ['markdown'], parameterInformation: { labelOffsetSupport: true } } },
  } } });
  assert.equal(init.result.serverInfo.version, '0.3.0');
  assert.equal(init.result.capabilities.hoverProvider, true);
  assert.ok(init.result.capabilities.completionProvider.triggerCharacters.includes('!'));
  assert.ok(init.result.capabilities.signatureHelpProvider.triggerCharacters.includes('('));
  c.notify('textDocument/didOpen', { textDocument: { uri, version: 1,
    text: '---- MODULE Main ----\nEXTENDS Sequences\nUse(p) == Append(p, <<>>)\n====' } }, true);
  const request = (method, character) => c.request(`textDocument/${method}`, {
    textDocument: { uri }, position: { line: 2, character },
  });
  let response = await request('hover', 11);
  assert.equal(response.result.contents.kind, 'markdown');
  assert.match(response.result.contents.value, /appending element e/);
  const help = (await request('signatureHelp', 20)).result;
  assert.equal(help.signatures[0].label, 'Append(s, e)');
  assert.equal(help.activeParameter, 1);
  assert.equal(help.signatures[0].documentation.kind, 'markdown');
  assert.deepEqual(help.signatures[0].parameters.map(parameter => parameter.label), [[7, 8], [10, 11]]);
  const definition = (await request('definition', 11)).result[0];
  assert.match(definition.uri, /standard_modules\/Sequences\.tla$/);
  c.notify('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{
    range: { start: { line: 2, character: 10 }, end: { line: 2, character: 24 } }, text: 'App',
  }] });
  response = await request('completion', 13);
  assert.deepEqual(response.result.map(item => item.label), ['Append']);
  assert.equal(response.result[0].documentation.kind, 'markdown');
  assert.deepEqual(response.result[0].textEdit, {
    range: { start: { line: 2, character: 10 }, end: { line: 2, character: 13 } }, newText: 'Append',
  });
  c.notify('textDocument/didChange', { textDocument: { uri, version: 3 }, contentChanges: [{
    text: '---- MODULE Main ----\nEXTENDS Sequences\nUse(p) == Append(\n====',
  }] });
  assert.equal((await request('signatureHelp', 17)).result.activeParameter, 0);
  assert.ok((await request('completion', 17)).result.some(item => item.label === 'p'));
  assert.equal((await request('hover', 999)).result, null);
  await c.request('shutdown');
  const exit = once(c.child, 'exit');
  c.notify('exit');
  assert.equal((await exit)[0], 0, c.stderr());
  assert.equal(c.stderr(), '');
});
