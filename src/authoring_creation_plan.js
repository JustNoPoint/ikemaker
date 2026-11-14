'use strict';

const path = require('path');
const { blankSff } = require('./asset_templates');
const { stageDef, screenpackDef, screenpackSelectDef, fightDef } = require('./workspace_templates');
const { TYPES: STORYBOARD_TYPES, storyboardTemplate } = require('./storyboard_model');
const { profileChoices } = require('./authoring_creation_profiles');

const COORDINATE_PROFILES = Object.freeze(profileChoices().filter(item => item.localcoord).map(item => Object.freeze({ id: item.value, label: item.label, description: item.description, localCoord: Object.freeze(item.localcoord) })));

function normalizeLocalCoord(value) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('Local coordinates must contain width and height.');
  const result = value.map(Number);
  if (!result.every(item => Number.isSafeInteger(item) && item >= 1 && item <= 16384)) throw new Error('Local coordinates must be whole numbers from 1 to 16384.');
  return result;
}

function parseLocalCoord(value) {
  const match = /^\s*(\d+)\s*[,x×]\s*(\d+)\s*$/i.exec(String(value || ''));
  if (!match) throw new Error('Enter coordinates as width,height, for example 320,240.');
  return normalizeLocalCoord([Number(match[1]), Number(match[2])]);
}

function planFile(filename, content, role) { return Object.freeze({ filename: path.resolve(filename), content, role }); }
function creationPlan(kind, targetFile, options = {}) {
  const target = path.resolve(targetFile), directory = path.dirname(target), base = path.basename(target, path.extname(target));
  const localCoord = normalizeLocalCoord(options.localCoord || [320, 240]);
  let files, label, existing = [];
  if (kind === 'stage') {
    const sffName = `${base}.sff`;
    files = [planFile(target, stageDef(options.name || base.replace(/[_-]+/g, ' '), sffName, { localCoord, author: options.author }), 'Stage definition'), planFile(path.join(directory, sffName), blankSff(), 'Stage sprites')];
    label = 'Stage';
  } else if (kind === 'screenpack') {
    const fightFile = options.fightFile || 'fight.def';
    const selectFile = 'select.def', selectPath = path.join(directory, selectFile);
    files = [
      planFile(target, screenpackDef({ localCoord, name: options.name || base.replace(/[_-]+/g, ' '), author: options.author, fightFile, selectFile }), 'Screenpack definition'),
      planFile(path.join(directory, fightFile), fightDef({ localCoord, name: options.fightName, author: options.author }), 'Fight UI definition'),
      planFile(path.join(directory, 'system.sff'), blankSff(), 'Screenpack sprites'),
      planFile(path.join(directory, 'fight.sff'), blankSff(), 'Fight UI sprites')
    ];
    if (options.reuseSelect) existing = [Object.freeze({ filename: path.resolve(selectPath), role: 'Existing character and stage roster' })];
    else files.push(planFile(selectPath, screenpackSelectDef(), 'Character and stage roster'));
    label = 'Screenpack / Fight UI';
  } else if (kind === 'storyboard') {
    const type = STORYBOARD_TYPES[options.type] ? options.type : 'opening', sffName = `${base}.sff`;
    files = [planFile(target, storyboardTemplate(type, options.name || base.replace(/[_-]+/g, ' '), sffName, { localCoord, duration: options.duration, author: options.author }), 'Storyboard definition'), planFile(path.join(directory, sffName), blankSff(), 'Storyboard sprites')];
    label = STORYBOARD_TYPES[type].label;
  } else throw new Error(`Unsupported visual authoring kind: ${kind}.`);
  const seen = new Set();
  for (const file of files) { const key = file.filename.toLowerCase(); if (seen.has(key)) throw new Error(`The plan assigns ${file.filename} more than once.`); seen.add(key); }
  return Object.freeze({ kind, label, target, localCoord: Object.freeze(localCoord), files: Object.freeze(files), existing: Object.freeze(existing), summary: `${label} · ${localCoord[0]} × ${localCoord[1]} · ${files.length} new files${existing.length ? ' + existing roster' : ''}` });
}

module.exports = { COORDINATE_PROFILES, normalizeLocalCoord, parseLocalCoord, creationPlan };
