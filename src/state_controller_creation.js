'use strict';

const crypto = require('crypto');
const path = require('path');

const KINDS = Object.freeze(['helper', 'explod', 'projectile']);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function helperTargetEvidence(snapshot,number){
  if(!Number.isSafeInteger(number)||number<0)return null;
  const matches=snapshot?.index?.[String(number)]||[];
  if(matches.length!==1)return null;
  const {source,declaration}=matches[0];
  return Object.freeze({number,filename:path.resolve(source.filename),sourceHash:source.sourceHash,line:declaration.line,start:declaration.start,end:declaration.end});
}
function helperTargetCatalog(snapshot,limit=8192){
  if(!snapshot?.index)return{available:false,targets:[],omitted:0};
  const states=Object.keys(snapshot.index).map(Number).filter(Number.isSafeInteger).sort((a,b)=>a-b),targets=[];let omitted=0;
  for(const number of states){const evidence=helperTargetEvidence(snapshot,number);if(!evidence)continue;if(targets.length>=limit){omitted++;continue;}targets.push({number,fileLabel:path.basename(evidence.filename),filename:evidence.filename,sourceHash:evidence.sourceHash,line:evidence.line});}
  return{available:true,targets,omitted};
}
function literalStateNumber(signature) {
  const value = String(signature || '');
  const match = /^\s*(-?\d+)\s*$/.exec(value) || /^\s*\[\s*statedef\s+(-?\d+)\s*(?:;[^\]]*)?\]\s*$/i.exec(value);
  return match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : null;
}
function boundedNumber(value, label, maximum = 2147483647) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(`${label} must be a non-negative whole number within the engine range.`);
  return value;
}
function controllerLines({ syntax, kind, stateNumber, targetState, action, resourceId }) {
  if (!KINDS.includes(kind)) throw new Error('Choose Helper, Explod, or native Projectile.');
  if (!['cns', 'zss'].includes(syntax)) throw new Error('This selected state does not use supported CNS or ZSS syntax.');
  boundedNumber(resourceId, 'The resource ID');
  if (kind === 'helper') {
    boundedNumber(targetState, 'The Helper starting StateDef');
    if (targetState === stateNumber) throw new Error('Choose another StateDef so the new Helper does not spawn itself recursively.');
  } else boundedNumber(action, 'The assigned AIR action');
  if (syntax === 'cns') {
    const heading = `[State ${stateNumber}, IKEMaker ${kind === 'helper' ? 'Helper' : kind === 'explod' ? 'Explod' : 'Projectile'} ${resourceId}]`;
    if (kind === 'helper') return [heading, 'type = Helper', 'trigger1 = Time = 0', 'helpertype = normal', `name = "Helper ${resourceId}"`, `id = ${resourceId}`, `stateno = ${targetState}`, 'postype = p1', 'pos = 0, 0', 'ownpal = 1'];
    if (kind === 'explod') return [heading, 'type = Explod', 'trigger1 = Time = 0', `anim = ${action}`, `id = ${resourceId}`, 'postype = p1', 'pos = 0, 0', 'bindtime = 1', 'removetime = -2'];
    return [heading, 'type = Projectile', 'trigger1 = Time = 0', `projid = ${resourceId}`, `projanim = ${action}`, 'projremovetime = -1', 'velocity = 4, 0', 'attr = S, SP', 'damage = 20, 0'];
  }
  if (kind === 'helper') return ['if time = 0 {', '\thelper{', `\t\tid: ${resourceId};`, `\t\tstateno: ${targetState};`, `\t\tname: "Helper ${resourceId}";`, '\t\tpostype: p1;', '\t\tpos: 0, 0;', '\t\townpal: 1;', '\t}', '}'];
  if (kind === 'explod') return ['if time = 0 {', '\texplod{', `\t\tid: ${resourceId};`, `\t\tanim: ${action};`, '\t\tpostype: p1;', '\t\tpos: 0, 0;', '\t\tbindtime: 1;', '\t\tremovetime: -2;', '\t}', '}'];
  return ['if time = 0 {', '\tprojectile{', `\t\tprojid: ${resourceId};`, `\t\tprojanim: ${action};`, '\t\tprojremovetime: -1;', '\t\tvelocity: 4, 0;', '\t\tattr: S, SP;', '\t\tdamage: 20, 0;', '\t}', '}'];
}
function lineEndOffset(text, line) {
  if (!Number.isSafeInteger(line) || line < 0) throw new Error('The selected StateDef line is invalid.');
  let start = 0;
  for (let index = 0; index < line; index += 1) { const end = text.indexOf('\n', start); if (end < 0) throw new Error('The selected StateDef moved in the source.'); start = end + 1; }
  const end = text.indexOf('\n', start), rawEnd = end < 0 ? text.length : end;
  return rawEnd > start && text[rawEnd - 1] === '\r' ? rawEnd - 1 : rawEnd;
}
function planStateControllerCreation({ sourceText, component, kind, targetState = null, action = null, resourceId }) {
  if (typeof sourceText !== 'string' || !component || component.kind !== 'state') throw new Error('Choose an exact authored StateDef before adding a controller.');
  const stateNumber = literalStateNumber(component.signature);
  if (stateNumber === null) throw new Error('This StateDef uses a dynamic number. Open its source to author the controller explicitly.');
  const syntax = String(component.syntax || '').toLowerCase(), eol = sourceText.includes('\r\n') ? '\r\n' : '\n';
  const heading = sourceText.split(/\r?\n/)[component.startLine];
  if (typeof heading !== 'string' || !new RegExp(`^\\s*\\[\\s*statedef\\s+${stateNumber}(?=\\s|;|\\])`, 'i').test(heading)) throw new Error('The selected StateDef header changed. Refresh Move Lab before adding a controller.');
  const lines = controllerLines({ syntax, kind, stateNumber, targetState, action, resourceId });
  const insertOffset = lineEndOffset(sourceText, component.endLine), insertText = `${eol}${eol}${lines.join(eol)}${eol}`;
  const afterSourceText = sourceText.slice(0, insertOffset) + insertText + sourceText.slice(insertOffset);
  return Object.freeze({ kind, syntax, stateNumber, targetState, action, resourceId, insertOffset, insertText, snippet: lines.join('\n'), beforeHash: sha(sourceText), afterHash: sha(afterSourceText), afterSourceText });
}

module.exports = { KINDS, literalStateNumber, helperTargetEvidence, helperTargetCatalog, planStateControllerCreation };
