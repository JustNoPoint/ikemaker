'use strict';

const fs = require('fs');
const path = require('path');
const { parseDef, unquote } = require('./def_model');

const FILE_EXTENSIONS = new Set(['.def', '.sff', '.air', '.snd', '.zss', '.cns', '.st', '.inp', '.cmd', '.jnp', '.act', '.dat', '.txt', '.json', '.csv', '.lua']);
const CODE_EXTENSIONS = new Set(['.zss', '.cns', '.st', '.inp', '.cmd', '.jnp']);

function kindFor(filename) {
  return ({ '.def': 'Definition', '.sff': 'Sprites', '.air': 'Animation', '.snd': 'Sound', '.act': 'Palette', '.lua': 'Lua', '.zss': 'Code', '.cns': 'Code', '.st': 'Code', '.inp': 'Commands', '.cmd': 'Legacy Commands', '.jnp': 'Commands' })[path.extname(filename).toLowerCase()] || 'Data';
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

// State compilation searches every original path before retrying .zss paths.
// The command input loader has no .zss retry, so a missing CMD stays missing.
function assignedPath(owner, input, key = '', io = fs) {
  const rawValue = unquote(String(input || '').trim()).trim();
  let local = referencedPath(owner, input);
  if (!local && /^(?:anim|air|sprite|sff|sound|snd|pal\d*|cmd|command|cns|constants|common|st(?:common|\d*)|movelist|lua|intro\.storyboard|ending\.storyboard)$/i.test(key) && rawValue && !/[\0\r\n]/.test(rawValue)) {
    local = path.resolve(path.dirname(owner), rawValue.replace(/[\\/]/g, path.sep));
  }
  const role = String(key || '').trim();
  // Additional [Files] keys may be supplied by an engine module.
  if (!local && role && rawValue && !/[\0\r\n]/.test(rawValue)) {
    const candidate = path.resolve(path.dirname(owner), rawValue.replace(/[\\/]/g, path.sep));
    try { if (io.statSync(candidate).isFile()) local = candidate; } catch (_) {}
  }
  if (!local || !/^(?:cmd|st(?:common|\d*))$/i.test(role)) return local;
  const raw = rawValue.replace(/[\\/]/g, path.sep);
  const root = inferredGameRoot(owner);
  const candidates = [local];
  if (root) candidates.push(path.resolve(root, raw), path.resolve(root, 'data', raw));
  const withZssFallback = [...candidates];
  if (!/^cmd$/i.test(role)) for (const candidate of candidates) if (!/\.zss$/i.test(candidate)) withZssFallback.push(`${candidate}.zss`);
  for (const candidate of withZssFallback) {
    try { if (io.existsSync(candidate)) return candidate; } catch (_) {}
  }
  return local;
}

// Startup and ownership need only the DEF's direct assignments. Source parsing
// and recursive DEF traversal belong to the explicitly opened connection tree.
function readCharacterAssignments(defPath, io = fs) {
  const root = path.resolve(defPath), assignments = {}, files = [root];
  let document;
  try { document = parseDef(io.readFileSync(root, 'utf8'), root); } catch (_) { return { root, assignments, files }; }
  for (const section of document.sections) {
    if (!['files', 'arcade'].includes(section.normalized)) continue;
    for (const entry of section.entries || []) {
      if (section.normalized === 'arcade' && !/^(?:intro|ending)\.storyboard$/.test(entry.normalized)) continue;
      const target = assignedPath(root, entry.value, entry.key, io);
      if (!target) continue;
      const key = String(entry.key).toLowerCase();
      if (!assignments[key]) assignments[key] = [];
      assignments[key].push(target);
      if (!files.includes(target)) files.push(target);
    }
  }
  return { root, assignments, files };
}

function buildCharacterDependencyModel(defPath, io = fs) {
  const { collectRecords } = require('./analyzer');
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
      const target = assignedPath(resolved, entry.value, section.normalized === 'files' ? entry.key : '', io);
      if (!target) continue;
      const node = addNode(target);
      const role = section.normalized === 'files' ? entry.normalized : '';
      const kind = { sprite:'Sprites', sff:'Sprites', anim:'Animation', air:'Animation', sound:'Sound', snd:'Sound', movelist:'Data', 'ending.storyboard':'Definition', 'intro.storyboard':'Definition' }[role];
      if (kind) node.kind = kind;
      if (/^pal\d*$/.test(role)) node.kind = 'Palette';
      if (/^(?:st(?:common|\d*)|cns|constants|common)$/.test(role)) node.kind = 'Code';
      if (/^cmd$/i.test(role)) node.kind = path.extname(target).toLowerCase() === '.cmd' ? 'Legacy Commands' : 'Commands';
      addEdge(resolved, target, 'assignment', `[${section.name || 'Root'}] ${entry.key}`, 0);
      if (node.kind === 'Definition') visitDef(target);
    }
  };
  visitDef(root);

  const assignedCode = new Set(edges.filter((edge) => edge.type === 'assignment' && /^\[Files\]\s+(?:cmd|command|cns|constants|common|st(?:common|\d*))$/i.test(edge.label)).map((edge) => path.resolve(edge.to).toLowerCase()));
  const sources = [...nodes.values()].filter((node) => node.exists && (['Code','Commands','Legacy Commands'].includes(node.kind) || assignedCode.has(path.resolve(node.filename).toLowerCase()))).map((node) => {
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

module.exports = { FILE_EXTENSIONS, CODE_EXTENSIONS, kindFor, referencedPath, inferredGameRoot, assignedPath, readCharacterAssignments, buildCharacterDependencyModel };
