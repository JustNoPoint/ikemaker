'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return {}; return originalLoad.call(this, request, parent, main); };
const { readHistory, safeResolve, recoveryHtml } = require('../src/mutation_history');
Module._load = originalLoad;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-recovery-center-'));
try {
  const tools = path.join(root, '.ikemen-tools'); fs.mkdirSync(tools);
  const filename = path.join(tools, 'mutations.json');
  const data = { version: 1, entries: [{ time: '2026-09-01T12:00:00Z', operation: 'sff-axis', file: 'chars/Ryu/Ryu.sff', backup: '.ikemen-tools/backups/Ryu.sff.bak', bytes: 50, beforeHash: 'A', afterHash: 'B' }, { time: '2026-09-01T12:01:00Z', operation: 'bulk', file: '2 files', files: ['a', 'b'], bytes: 10 }] };
  fs.writeFileSync(filename, JSON.stringify(data), 'utf8');
  const uri = { fsPath: filename };
  assert.strictEqual(readHistory(uri).entries.length, 2);
  assert.strictEqual(safeResolve(root, 'chars/Ryu/Ryu.sff'), path.join(root, 'chars', 'Ryu', 'Ryu.sff'));
  assert.throws(() => safeResolve(root, '../outside.txt'), /leaves the project root/);
  const html = recoveryHtml(uri, data);
  assert.match(html, /IKEMEN Recovery Center/);
  assert.match(html, /Restore This Backup/);
  assert.match(html, /Recoverable backups/);
  assert.match(html, /globalThis\.ikemenNavigationSelection=\(\)=>\(\{search:search\.value,kind:kind\.value,sourceIndex:selected\?selected\.sourceIndex:null\}\)/);
  assert.match(html, /\['all','recoverable','bulk'\]\.includes\(reference\.kind\)/);
  assert.match(html, /model\.entries\.find\(entry=>entry\.sourceIndex===reference\.sourceIndex\)/);
  const allowedStyleNonce = /style-src 'nonce-([^']+)'/.exec(html)[1];
  for (const [, attrs] of html.matchAll(/<style\b([^>]*)>/g)) assert(attrs.includes('nonce=\"' + allowedStyleNonce + '\"'), 'shared styles must satisfy the rendered content security policy');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  assert.strictEqual(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0][1]));
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log('Mutation Recovery Center tests passed');
