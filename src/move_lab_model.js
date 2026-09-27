'use strict';

const fs = require('fs');
const path = require('path');
const { resolveAssigned } = require('./related_work');
const { parseCodeStructure, flatten } = require('./code_structure_model');
const { actionTracks, normalizedPlan, validatePlan, TEMPLATES } = require('./throw_creator_model');
const metadataRegistry = require('./metadata_registry');
const { contextFor } = require('./project_context_model');
const { parseHitDefs } = require('./hitdef_model');
const { stateNumberAt } = require('./hitdef_preview_model');
const { parseConstants, moveGroups } = require('./move_constants_model');
const { hash } = require('./mutation_safety');

function exists(filename) { return Boolean(filename && fs.existsSync(filename)); }
function language(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return ext === '.lua' ? 'lua' : ['.cns', '.inp', '.cmd', '.jnp'].includes(ext) ? 'cns' : 'zss';
}
function readCurrent(filename, openDocuments = []) {
  const resolved = path.resolve(filename).toLowerCase();
  const open = openDocuments.find((document) => path.resolve(document.fileName || '').toLowerCase() === resolved);
  return open ? open.getText() : fs.readFileSync(filename, 'utf8');
}
function sourceOutline(filename, openDocuments = []) {
  if (!exists(filename)) return null;
  const text = readCurrent(filename, openDocuments), tree = parseCodeStructure(text, language(filename), filename), items = flatten(tree);
  return {
    filename,
    name: path.basename(filename),
    language: tree.language || language(filename),
    states: items.filter((item) => item.kind === 'state').map((item) => ({ title: item.title, line: item.startLine, endLine: item.endLine })),
    controllers: items.filter((item) => item.kind === 'controller').map((item) => ({ title: item.title, line: item.startLine })),
    functions: items.filter((item) => item.kind === 'function').map((item) => ({ title: item.title, line: item.startLine }))
  };
}
function contextLabel(defPath) {
  const character = path.basename(path.dirname(defPath));
  const root = path.dirname(path.dirname(path.dirname(defPath)));
  try {
    const filename = metadataRegistry.find(defPath), loaded = filename ? metadataRegistry.read(filename) : null, context = contextFor(defPath, loaded?.root || root, loaded?.registry || { projects: [], characters: [], assets: {} });
    return { character: context.character?.name || character, project: context.project?.name || path.basename(root), ownership: context.ownership, profile: context.project?.workflowProfile || '', defPath };
  } catch (_) { return { character, project: path.basename(root), ownership: 'character', profile: '', defPath }; }
}
function throwPlans(defPath, airText = '') {
  const directory = path.join(path.dirname(defPath), '.ikemen-tools', 'throw-plans'), tracks = actionTracks(airText);
  if (!fs.existsSync(directory)) return { templates: Object.entries(TEMPLATES).map(([id, value]) => ({ id, label: value.label })), plans: [] };
  const plans = fs.readdirSync(directory).filter((name) => /\.json$/i.test(name)).map((name) => {
    const filename = path.join(directory, name);
    try {
      const plan = normalizedPlan(JSON.parse(fs.readFileSync(filename, 'utf8'))), checked = validatePlan(plan, tracks);
      return { filename, name: plan.name, template: plan.template, p1Action: plan.p1Action, p2Action: plan.p2Action, events: plan.events.length, parts: plan.parts.length, valid: checked.valid, issues: checked.issues };
    } catch (error) { return { filename, name, valid: false, issues: [{ level: 'error', message: error.message }] }; }
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { templates: Object.entries(TEMPLATES).map(([id, value]) => ({ id, label: value.label })), plans };
}
function hitDefSyntax(filename, text) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.zss') return 'zss';
  return /\bhitdef\s*\{/i.test(text) ? 'zss' : 'cns';
}
function lineAt(text, offset) { return text.slice(0, Math.max(0, offset)).split(/\r?\n/).length - 1; }
function attackLibrary(assets, openDocuments = []) {
  const controllers = [];
  for (const filename of (assets.code || []).filter(exists)) {
    const text = readCurrent(filename, openDocuments), syntax = hitDefSyntax(filename, text), blocks = parseHitDefs(text, syntax);
    blocks.forEach((block, index) => {
      const state = stateNumberAt(text, block.start), attr = block.values.attr || '', damage = block.values.damage || '';
      controllers.push({
        id: `${path.resolve(filename).toLowerCase()}#${index}`, filename, fileLabel: path.basename(filename), index,
        line: lineAt(text, block.start), stateNumber: Number.isInteger(state) ? state : null,
        label: `${Number.isInteger(state) ? `State ${state}` : path.basename(filename)} · HitDef ${index + 1}`,
        detail: [attr && `attr ${attr}`, damage && `damage ${damage}`].filter(Boolean).join(' · '), sourceHash: hash(text), syntax
      });
    });
  }
  let constantProfiles = [];
  if (assets.constants && exists(assets.constants)) {
    try {
      const constantsText = readCurrent(assets.constants, openDocuments), sourceHash = hash(constantsText);
      constantProfiles = moveGroups(parseConstants(constantsText)).map((move) => ({
        id: move.id, prefix: move.prefix, moveID: Number.isFinite(Number(move.values.moveID)) ? Number(move.values.moveID) : null,
        linkedControllerIds: controllers.filter((item) => Number.isInteger(item.stateNumber) && item.stateNumber === Number(move.values.moveID)).map((item) => item.id),
        defPath: assets.def, sourceFilename: assets.constants, sourceHash
      }));
    } catch (_) { constantProfiles = []; }
  }
  return { controllers, constantProfiles };
}
function validAttackReference(reference, library) {
  if (!reference || typeof reference.id !== 'string') return null;
  const item = (library?.controllers || []).find((candidate) => candidate.id === reference.id);
  if (!item) return null;
  const sameFile = path.resolve(item.filename || '').toLowerCase() === path.resolve(reference.filename || '').toLowerCase();
  return sameFile && item.index === reference.index && item.line === reference.line && item.sourceHash === reference.sourceHash ? item : null;
}
function buildMoveLabModel(defPath, openDocuments = [], diagnostics = []) {
  const assets = resolveAssigned(defPath), sources = (assets.code || []).filter(exists).map((filename) => sourceOutline(filename, openDocuments)).filter(Boolean);
  const airText = assets.air && exists(assets.air) ? readCurrent(assets.air, openDocuments) : '';
  const files = [
    ['DEF', assets.def], ['AIR', assets.air], ['SFF', assets.sff], ['SND', assets.snd], ['Commands', assets.commands], ['Constants', assets.constants],
    ...sources.map((source) => ['Code', source.filename])
  ].filter((entry, index, all) => entry[1] && all.findIndex((other) => path.resolve(other[1]).toLowerCase() === path.resolve(entry[1]).toLowerCase()) === index)
    .map(([kind, filename]) => {
      let ownership = kind === 'DEF' ? contextLabel(defPath).ownership : '';
      try { const registryFile = metadataRegistry.find(filename), loaded = registryFile ? metadataRegistry.read(registryFile) : null; ownership = contextFor(filename, loaded?.root || path.dirname(defPath), loaded?.registry || { projects: [], characters: [], assets: {} }).ownership; } catch (_) {}
      return { kind, filename, name: path.basename(filename), exists: exists(filename), ownership };
    });
  return {
    context: contextLabel(defPath), assets, files, sources,
    totals: {
      states: sources.reduce((sum, item) => sum + item.states.length, 0),
      controllers: sources.reduce((sum, item) => sum + item.controllers.length, 0),
      functions: sources.reduce((sum, item) => sum + item.functions.length, 0),
      diagnostics: diagnostics.length
    },
    diagnostics, attacks: attackLibrary(assets, openDocuments),
    throws: throwPlans(defPath, airText)
  };
}

module.exports = { language, readCurrent, sourceOutline, contextLabel, throwPlans, hitDefSyntax, attackLibrary, validAttackReference, buildMoveLabModel };
