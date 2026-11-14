'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function fileSha(filename) {
  const digest=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024),fd=fs.openSync(filename,'r');
  try{for(let bytes=fs.readSync(fd,buffer,0,buffer.length,null);bytes>0;bytes=fs.readSync(fd,buffer,0,buffer.length,null))digest.update(buffer.subarray(0,bytes));}
  finally{fs.closeSync(fd);}
  return digest.digest('hex');
}
const inside = (root, filename) => {
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(filename));
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
const relativeFile = (root, filename) => {
  if (!inside(root, filename)) throw new Error('The selected file is outside this game.');
  if (!fs.statSync(filename).isFile()) throw new Error('The selected file is not a regular file.');
  return path.relative(root, filename).replace(/\\/g, '/');
};
function fingerprint(root, files, read) {
  return [...new Set(files.map(filename => path.resolve(filename)))].sort().map(filename => ({
    file: relativeFile(root, filename), sha256: read ? sha(read(filename)) : fileSha(filename)
  }));
}
function recipeId(character, stateNo, mode='forced', commandName='') {
  const identity=`${character.toLowerCase()}\0${stateNo}`;
  return `move-${sha(mode==='natural'?`${identity}\0natural\0${commandName}`:identity).slice(0, 16)}`;
}
function stateNumber(component) {
  if(component?.kind!=='state')return null;
  const header=String(component.signature||component.sourceText||component.title||'');
  const match=/^\s*(-?\d+)\s*$/.exec(header)||/\b(?:StateDef|State)\s+(-?\d+)\b/i.exec(header);
  return match?Number(match[1]):null;
}
function plan(root, input, read) {
  if (!Number.isInteger(input.stateNo) || input.stateNo < 0) throw new Error('Select a numbered StateDef before testing.');
  const mode=input.mode==='natural'?'natural':'forced',commandName=String(input.commandName||'');
  if(mode==='natural'&&(!commandName||commandName.length>120||/[\x00-\x1f]/.test(commandName)))throw new Error('Select one exact authored command name for the input test.');
  const character = relativeFile(root, input.defPath);
  const opponent = relativeFile(root, input.opponentDef || input.defPath);
  const stage = relativeFile(root, input.stagePath);
  const distance = Number(input.distance), facing = Number(input.facing);
  if (!Number.isFinite(distance) || distance < 0 || distance > 2000) throw new Error('Distance must be from 0 to 2000 game units.');
  if (facing !== 1 && facing !== -1) throw new Error('Facing must be right (+1) or left (-1).');
  const expectedSpawn=['none','helper','projectile','explod','any'].includes(input.expectedSpawn)?input.expectedSpawn:'any';
  const expectedPeakIncrease=input.expectedPeakIncrease===''||input.expectedPeakIncrease===null||input.expectedPeakIncrease===undefined?null:Number(input.expectedPeakIncrease);
  if(expectedPeakIncrease!==null&&(!['helper','projectile','explod'].includes(expectedSpawn)||!Number.isSafeInteger(expectedPeakIncrease)||expectedPeakIncrease<1||expectedPeakIncrease>16))throw new Error('An exact peak increase from 1 to 16 requires Helper, Projectile, or Explod expectation.');
  const sources = fingerprint(root, [input.defPath, ...input.sourceFiles], read);
  if (!sources.some(item => item.file === character)) throw new Error('The character DEF is missing from the source binding.');
  return { schemaVersion: 1, id: recipeId(character, input.stateNo,mode,commandName), kind: 'move-repeat', mode, commandName, character, opponent, stage,
    stateNo: input.stateNo, distance, facing, distanceTolerance: 8, idleState: Number.isInteger(input.idleState) ? input.idleState : 0,
    autoRunOnce: input.autoRunOnce !== false,
    expectedSpawn,expectedPeakIncrease,
    sources, sourceDigest: sha(JSON.stringify(sources)), binding: input.binding || null, createdAt: input.createdAt || new Date().toISOString() };
}
function sourceStatus(root, recipe, read) {
  try {
    const current = fingerprint(root, recipe.sources.map(item => path.join(root, item.file)), read);
    return { current, changed: JSON.stringify(current) !== JSON.stringify(recipe.sources), sourceDigest: sha(JSON.stringify(current)) };
  } catch (error) { return { current: [], changed: true, error: error.message }; }
}
function planPath(root, recipe) { return path.join(root, '.ikemen', 'test-sessions', `${recipe.id}.move.json`); }
function savePlan(root, recipe) {
  const filename = planPath(root, recipe);
  require('./mutation_safety').transactionalWrite(fs, filename, JSON.stringify(recipe, null, 2) + '\n', { label: 'save-repeatable-move-test', journalRoot: root, allowExisting: true });
  return filename;
}
function readPlans(root) {
  const directory = path.join(root, '.ikemen', 'test-sessions');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => /^move-[a-f0-9]{16}\.move\.json$/.test(name)).map(name => {
    try { const value = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')); return value.kind === 'move-repeat' ? value : null; }
    catch (_) { return null; }
  }).filter(Boolean);
}

module.exports = { inside, relativeFile, fingerprint, recipeId, stateNumber, plan, sourceStatus, planPath, savePlan, readPlans };
