'use strict';

const fs = require('fs');
const path = require('path');
const { parseDef, unquote } = require('./def_model');
const { collectRecords } = require('./analyzer');

const FILE_EXTENSIONS = new Set(['.def', '.sff', '.air', '.snd', '.zss', '.cns', '.inp', '.cmd', '.jnp', '.act', '.dat', '.txt', '.json', '.csv', '.lua']);
const CODE_EXTENSIONS = new Set(['.zss', '.cns', '.inp', '.cmd', '.jnp']);

function kindFor(filename) {
  return ({ '.def': 'Definition', '.sff': 'Sprites', '.air': 'Animation', '.snd': 'Sound', '.act': 'Palette', '.lua': 'Lua', '.zss': 'Code', '.cns': 'Code', '.inp': 'Commands', '.cmd': 'Legacy Commands', '.jnp': 'Commands' })[path.extname(filename).toLowerCase()] || 'Data';
}

function referencedPath(owner, input) {
  const value = unquote(String(input || '').trim()).trim();
  if (!value || value.includes(',') || !FILE_EXTENSIONS.has(path.extname(value).toLowerCase())) return '';
  return path.resolve(path.dirname(owner), value.replace(/[\\/]/g, path.sep));
}

function inferredGameRoot(owner) {
  let current = path.dirname(path.resolve(owner));
  while (true) {
    if (path.basename(current).toLowerCase() === 'chars') return path.dirname(current);
    const parent = path.dirname(current);
    if (parent === current) return '';
    current = parent;
  }
}

// MUGEN and IKEMEN do not resolve stcommon like an ordinary character-owned
// file.  The compiler searches the character path, game root/motif paths, and
// data/. IKEMEN also retries legacy CNS names with ".zss" appended. Preserve
// the normal character-relative result when none of those engine paths exists
// so genuinely missing assignments still remain visible.
function assignedPath(owner, input, key = '', io = fs) {
  const rawValue = unquote(String(input || '').trim()).trim();
  let local = referencedPath(owner, input);
  if (!local && /^cmd$/i.test(String(key || '').trim()) && rawValue && !rawValue.includes(',') && path.extname(rawValue)) {
    local = path.resolve(path.dirname(owner), rawValue.replace(/[\\/]/g, path.sep));
  }
  if (!local || !/^(?:cmd|stcommon)$/i.test(String(key || '').trim())) return local;
  const raw = rawValue.replace(/[\\/]/g, path.sep);
  const root = inferredGameRoot(owner);
  const candidates = [local];
  if (root) candidates.push(path.resolve(root, raw), path.resolve(root, 'data', raw));
  const withZssFallback = [];
  for (const candidate of candidates) {
    withZssFallback.push(candidate);
    if (!/\.zss$/i.test(candidate)) withZssFallback.push(`${candidate}.zss`);
  }
  for (const candidate of withZssFallback) {
    try { if (io.existsSync(candidate)) return candidate; } catch (_) {}
  }
  return local;
}

function buildCharacterDependencyModel(defPath, io = fs) {
  const root = path.resolve(defPath), nodes = new Map(), edges = [], edgeKeys = new Set(), visitedDefs = new Set();
  const exists = (filename) => { try { return io.existsSync(filename); } catch (_) { return false; } };
  const addNode = (filename) => {
    const resolved = path.resolve(filename);
    if (!nodes.has(resolved)) nodes.set(resolved, { id: resolved, filename: resolved, label: path.basename(resolved), kind: kindFor(resolved), exists: exists(resolved) });
    return nodes.get(resolved);
  };
  const addEdge = (from, to, type, label, targetLine = 0) => {
    const key = `${from}\0${to}\0${type}\0${label}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key); edges.push({ from, to, type, label, targetLine });
  };
  const visitDef = (filename) => {
    const resolved = path.resolve(filename);
    addNode(resolved);
    if (!exists(resolved) || visitedDefs.has(resolved.toLowerCase())) return;
    visitedDefs.add(resolved.toLowerCase());
    let document;
    try { document = parseDef(io.readFileSync(resolved, 'utf8'), resolved); } catch (_) { return; }
    for (const section of document.sections) for (const entry of section.entries || []) {
      const target = assignedPath(resolved, entry.value, entry.key, io);
      if (!target) continue;
      const node = addNode(target);
      if (/^cmd$/i.test(entry.key)) node.kind = path.extname(target).toLowerCase() === '.cmd' ? 'Legacy Commands' : 'Commands';
      addEdge(resolved, target, 'assignment', `[${section.name || 'Root'}] ${entry.key}`, 0);
      if (path.extname(target).toLowerCase() === '.def') visitDef(target);
    }
  };
  visitDef(root);

  const assignedCode = new Set(edges.filter((edge) => edge.type === 'assignment' && /^\[Files\]\s+(?:cmd|command|cns|constants|common|st\d*)$/i.test(edge.label)).map((edge) => path.resolve(edge.to).toLowerCase()));
  const sources = [...nodes.values()].filter((node) => node.exists && (CODE_EXTENSIONS.has(path.extname(node.filename).toLowerCase()) || assignedCode.has(path.resolve(node.filename).toLowerCase()))).map((node) => {
    try { return { node, records: collectRecords(io.readFileSync(node.filename, 'utf8'), node.filename) }; } catch (_) { return { node, records: collectRecords('', node.filename) }; }
  });
  const functions = new Map(), states = new Map();
  const index = (map, key, value) => { const normalized = String(key || '').toLowerCase(); if (!map.has(normalized)) map.set(normalized, []); map.get(normalized).push(value); };
  for (const source of sources) {
    for (const item of source.records.functions || []) index(functions, item.name, { source, item });
    for (const item of source.records.states || []) index(states, item.name, { source, item });
  }
  for (const source of sources) {
    for (const call of source.records.calls || []) for (const target of functions.get(String(call.name).toLowerCase()) || []) {
      if (source.node.id !== target.source.node.id) addEdge(source.node.id, target.source.node.id, 'function', `calls ${call.name}()`, target.item.line || 0);
    }
    for (const reference of source.records.stateReferences || []) for (const target of states.get(String(reference.name).toLowerCase()) || []) {
      if (source.node.id !== target.source.node.id) addEdge(source.node.id, target.source.node.id, 'state', `state ${reference.name}`, target.item.line || 0);
    }
  }
  const base = path.dirname(root);
  return {
    root,
    character: path.basename(base),
    nodes: [...nodes.values()].map((node) => ({ ...node, relative: path.relative(base, node.filename) || path.basename(node.filename) })),
    edges,
    summary: {
      files: nodes.size,
      missing: [...nodes.values()].filter((node) => !node.exists).length,
      assignments: edges.filter((edge) => edge.type === 'assignment').length,
      codeLinks: edges.filter((edge) => edge.type !== 'assignment').length
    }
  };
}

module.exports = { FILE_EXTENSIONS, CODE_EXTENSIONS, kindFor, referencedPath, inferredGameRoot, assignedPath, buildCharacterDependencyModel };
