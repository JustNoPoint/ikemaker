'use strict';

const fs = require('fs');
const path = require('path');
const { readCharacterAssignments } = require('./character_dependency_model');
const relevant = filename => /\.(?:zss|cns|air|def)$/i.test(filename || '');
const identity = filename => path.resolve(filename).toLowerCase();

// Keep background diagnostics inside the edited character. Open buffers win
// over disk, including unsaved DEF assignment changes and shared state files.
async function collectFrameSyncScopes(vscode, seed, options = {}) {
  const cancelled = options.cancelled || (() => false);
  const buffers = new Map((vscode.workspace.textDocuments || []).filter(doc => !doc.isClosed && doc.uri?.scheme === 'file').map(doc => [identity(doc.fileName), doc]));
  const seeds = new Set([seed?.fileName || seed?.fsPath || seed || vscode.window.activeTextEditor?.document?.fileName, ...[...buffers.values()].filter(doc => doc.isDirty && relevant(doc.fileName)).map(doc => doc.fileName)].filter(value => typeof value === 'string' && relevant(value)));
  const groups = new Map(), covered = new Set();
  const definitions = new Set();
  const contexts = options.contexts || [];
  for (const filename of seeds) {
    if (cancelled()) return [];
    for (const context of contexts) {
      const relative = context.root ? path.relative(context.root, filename) : '..';
      if (context.ownerDef && ((context.files || []).some(file => identity(file) === identity(filename)) || (relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)))) definitions.add(context.ownerDef);
    }
    const nearest = options.nearestDef?.(filename); if (nearest) definitions.add(nearest);
  }
  if (options.workspace) {
    const limit = vscode.workspace.getConfiguration('ikemenZss').get('maxAuditFiles', 1000);
    const uris = await vscode.workspace.findFiles('**/*.{zss,cns,air,def}', '**/{.git,node_modules}/**', limit);
    for (const uri of uris) {
      if (/\.def$/i.test(uri.fsPath)) definitions.add(uri.fsPath);
      else seeds.add(uri.fsPath);
    }
  }
  const io = { existsSync: fs.existsSync, readFileSync(filename, encoding) { return buffers.get(identity(filename))?.getText() ?? fs.readFileSync(filename, encoding); } };
  for (const def of definitions) {
    if (cancelled()) return [];
    const inventory = readCharacterAssignments(def, io);
    const files = inventory.files.filter(file => /\.(?:zss|cns|air)$/i.test(file));
    if (files.length) groups.set(identity(def), files);
    for (const file of files) covered.add(identity(file));
  }
  for (const filename of seeds) if (!covered.has(identity(filename)) && /\.(?:zss|cns|air)$/i.test(filename)) {
    const folder = identity(path.dirname(filename));
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(filename);
  }
  const scopes = [], loaded = new Map();
  for (const candidates of groups.values()) {
    const documents = [];
    for (const filename of new Set(candidates)) {
      if (cancelled()) return [];
      const key = identity(filename);
      if (!loaded.has(key)) {
        let document = buffers.get(key);
        if (!document) {
          try {
            const text = await (options.readFile || fs.promises.readFile)(filename, 'utf8');
            const lines = text.split(/\r?\n/);
            document = { fileName: filename, uri: vscode.Uri.file(filename), getText: () => text, lineCount: lines.length, lineAt: line => ({ text: lines[line] || '' }) };
          } catch (_) { continue; }
        }
        loaded.set(key, document);
      }
      documents.push(loaded.get(key));
    }
    scopes.push(documents);
  }
  return scopes;
}

// A new request invalidates in-flight publication, then waits for its I/O to
// finish. Superseded queued requests never begin another scan.
function createLatestAuditRunner(run) {
  let generation = 0, tail = Promise.resolve();
  const request = options => {
    const ticket = ++generation;
    const cancelled = () => ticket !== generation;
    const result = tail.catch(() => {}).then(() => cancelled() ? 0 : run({ ...options, cancelled }));
    tail = result;
    return result;
  };
  request.invalidate = () => { generation++; };
  return request;
}
module.exports = { collectFrameSyncScopes, createLatestAuditRunner };
