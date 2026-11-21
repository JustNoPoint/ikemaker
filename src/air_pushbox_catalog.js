'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { transactionalWrite, hash } = require('./mutation_safety');
const { parseNumberSet } = require('./air');
const { planLocation } = require('./pushbox_authoring');
const pushboxCode = require('./pushbox_code_links');

function resource(filename) {
  if (!filename) return '';
  const absolute = path.resolve(filename);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function catalogLocation(airPath) {
  return planLocation(airPath).replace(/\.json$/, '.catalog.json');
}

function readCatalog(airPath, ownerDef) {
  const source = catalogLocation(airPath), owner = resource(ownerDef);
  const bytes = fs.existsSync(source) ? fs.readFileSync(source) : null;
  const data = bytes ? JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) : { version: 1, air: resource(airPath), scopes: [] };
  if (data.version !== 1 || data.air !== resource(airPath) || !Array.isArray(data.scopes)) throw new Error('This push-box catalog has a different AIR identity or an unsupported format.');
  const scope = data.scopes.find(item => item.owner === owner) || { owner, profiles: [], uses: [] };
  if (!Array.isArray(scope.profiles) || !Array.isArray(scope.uses)) throw new Error('The selected push-box catalog is incomplete.');
  return { source, owner, data, scope, version: bytes && hash(bytes) };
}

function changeCatalog(airPath, ownerDef, transform) {
  const { source, owner, version, data, scope } = readCatalog(airPath, ownerDef);
  const next = transform(scope);
  if (next === scope) return scope;
  const scopes = data.scopes.filter(item => item.owner !== owner);
  if (next.profiles.length || next.uses.length) scopes.push(next);
  transactionalWrite(fs, source, JSON.stringify({ ...data, scopes }, null, 2) + '\n', {
    label: 'air-pushbox-catalog', expectedHash: version, allowExisting: Boolean(version)
  });
  return next;
}

function newProfile(values) {
  return pushboxCode.createPushboxProfile({ ...values, profileId: randomUUID(), createdAt: new Date().toISOString() });
}

function newUses(profileId, actions, actionNumbers, selection, context) {
  const numbers = [...new Set(actionNumbers)];
  if (!numbers.length) throw new Error('Select an AIR action or mark actions to bind.');
  if (numbers.some(number => !Number.isSafeInteger(number))) throw new Error('Select integer AIR action IDs.');
  const matches = parseNumberSet(selection);
  return numbers.map(number => {
    const found = actions.filter(action => action.number === number);
    if (found.length !== 1 || found[0].readOnly) throw new Error(`Action ${number} needs one unique authored definition.`);
    const action = found[0], elements = [];
    if (!action.frames.length) throw new Error(`Action ${number} has no authored AIR elements.`);
    for (let index = 1; index <= action.frames.length; index += 1) {
      if (!matches(index)) continue;
      const anchor = context.frameFingerprint(number, index);
      if (!anchor) throw new Error(`Action ${number} element ${index} has no verifiable source identity.`);
      elements.push({ index, anchor });
    }
    if (!elements.length) throw new Error(`The element range is empty for Action ${number}.`);
    if (elements.length > 128) throw new Error(`Select up to 128 elements per linked recipe. Action ${number} contains ${elements.length} selected elements.`);
    return {
      installationId: randomUUID(), profileId,
      air: { airIdentity: context.airIdentity, action: number, sourceFingerprint: context.sourceFingerprint, elements },
      binding: null
    };
  });
}

function bindingFreshness(use, context) {
  if (!use?.air || use.air.airIdentity !== context.airIdentity || use.air.sourceFingerprint !== context.sourceFingerprint) return 'The AIR source changed. Review the bound elements.';
  const { action, elements } = use.air;
  if (!elements.every(element => element.anchor === context.frameFingerprint(action, element.index))) return 'The AIR element identity changed. Review the bound elements.';
  return '';
}

function summarizeRecipe(recipe) {
  if (recipe.kind === 'size') return pushboxCode.sizeRecipeRemovesBox?.(recipe) ? 'Remove Size box' : `Size ${recipe.rect.join(', ')}`;
  if (recipe.kind === 'width') return [recipe.player && `Player width ${recipe.player.join(', ')}`, recipe.edge && `Edge width ${recipe.edge.join(', ')}`].filter(Boolean).join(' · ');
  return 'PlayerPush ' + [recipe.value !== undefined && `value ${recipe.value}`, recipe.priority !== undefined && `priority ${recipe.priority}`, recipe.affectTeam && `team ${recipe.affectTeam}`].filter(Boolean).join(' · ');
}

module.exports = { resource, catalogLocation, readCatalog, changeCatalog, newProfile, newUses, bindingFreshness, summarizeRecipe };
