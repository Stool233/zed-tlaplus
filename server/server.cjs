#!/usr/bin/env node
'use strict';

const { Navigation, canonical } = require('./navigation.cjs');
const { LanguageFeatures } = require('./features.cjs');

function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

async function main() {
  const navigation = await Navigation.create();
  const features = new LanguageFeatures(navigation);
  let initialized = false;
  let shutdown = false;
  const versions = new Map();
  function dispatch(message) {
    const { id, method, params = {} } = message;
    const request = Object.hasOwn(message, 'id');
    function result(value) { if (request) send({ id, result: value }); }
    function error(code, text) { if (request) send({ id, error: { code, message: text } }); }
    if (method === 'exit') {
      navigation.dispose();
      process.exit(shutdown ? 0 : 1);
    }
    if (shutdown) return error(-32600, 'Server has shut down');
    if (method === 'initialize') {
      if (initialized) return error(-32600, 'Already initialized');
      navigation.configure(params);
      features.configure(params);
      initialized = true;
      return result({
        capabilities: {
          positionEncoding: 'utf-16',
          textDocumentSync: { openClose: true, change: 2 },
          definitionProvider: true,
          hoverProvider: true,
          completionProvider: { triggerCharacters: ['!', '\\'] },
          signatureHelpProvider: { triggerCharacters: ['(', ','], retriggerCharacters: [')'] },
        },
        serverInfo: { name: 'TLA+ Language Server', version: '0.3.0' },
      });
    }
    if (!initialized) return error(-32002, 'Server not initialized');
    switch (method) {
      case 'initialized':
      case '$/cancelRequest':
      case '$/setTrace':
      case 'textDocument/didSave':
        return;
      case 'shutdown':
        shutdown = true;
        return result(null);
      case 'textDocument/didOpen': {
        const doc = params.textDocument;
        navigation.update(doc.uri, doc.text);
        versions.set(canonical(doc.uri), doc.version);
        return;
      }
      case 'textDocument/didChange': {
        const uri = canonical(params.textDocument.uri);
        const version = params.textDocument.version;
        if (!navigation.open.has(uri) || version <= versions.get(uri)) return;
        for (const change of params.contentChanges) {
          const doc = navigation.documents.get(uri);
          if (change.range) {
            const start = doc.offset(change.range.start);
            const end = doc.offset(change.range.end);
            if (start === null || end === null || end < start) throw new Error('Invalid edit range');
            navigation.update(uri, doc.text.slice(0, start) + change.text + doc.text.slice(end));
          } else {
            navigation.update(uri, change.text);
          }
        }
        versions.set(uri, version);
        return;
      }
      case 'textDocument/didClose':
        navigation.close(params.textDocument.uri);
        versions.delete(canonical(params.textDocument.uri));
        return;
      case 'textDocument/definition':
        return result(navigation.definition(params.textDocument.uri, params.position));
      case 'textDocument/hover':
        return result(features.hover(params.textDocument.uri, params.position));
      case 'textDocument/completion':
        return result(features.completion(params.textDocument.uri, params.position));
      case 'textDocument/signatureHelp':
        return result(features.signatureHelp(params.textDocument.uri, params.position));
      default:
        return error(-32601, `Method not found: ${method}`);
    }
  }

  let pending = Buffer.alloc(0);
  process.stdin.on('data', chunk => {
    pending = Buffer.concat([pending, chunk]);
    while (true) {
      const boundary = pending.indexOf('\r\n\r\n');
      if (boundary < 0) return;
      const header = pending.subarray(0, boundary).toString('ascii');
      const length = /^Content-Length:\s*(\d+)\s*$/im.exec(header);
      if (!length || Number(length[1]) > 64 * 1024 * 1024) {
        console.error('Invalid or oversized LSP Content-Length');
        process.exit(1);
      }
      const end = boundary + 4 + Number(length[1]);
      if (pending.length < end) return;
      const body = pending.subarray(boundary + 4, end);
      pending = pending.subarray(end);
      let message;
      try { message = JSON.parse(body.toString('utf8')); }
      catch { send({ id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
      if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
        send({ id: message?.id ?? null, error: { code: -32600, message: 'Invalid Request' } });
        continue;
      }
      try { dispatch(message); }
      catch (error) {
        // stdout is reserved for framed JSON-RPC messages.
        console.error(error.stack || String(error));
        if (Object.hasOwn(message, 'id')) {
          send({ id: message.id, error: { code: -32603, message: 'Internal error' } });
        }
      }
    }
  });
  process.stdin.on('end', () => navigation.dispose());
}

main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });
