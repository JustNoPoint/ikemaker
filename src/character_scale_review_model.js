'use strict';

const crypto = require('crypto');
const path = require('path');

const SCHEMA = 'ikemaker.character-scale-review';
const VERSION = 1;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_CONTROLLERS = 4096;
const POLICIES = Object.freeze({
  follow: Object.freeze({ id: 'follow', label: 'Follow Character Size', position: true, size: true }),
  fixed: Object.freeze({ id: 'fixed', label: 'Keep Fixed Size', position: true, size: false }),
  position: Object.freeze({ id: 'position', label: 'Position Only', position: true, size: false }),
  size: Object.freeze({ id: 'size', label: 'Size Only', position: false, size: true }),
  manual: Object.freeze({ id: 'manual', label: 'Manual', position: false, size: false })
});
const CONTROLLERS = new Set(['explod', 'modifyexplod', 'helper', 'projectile', 'modifyprojectile', 'bindtoparent', 'bindtoroot', 'bindtotarget', 'targetbind']);
const POSITION_FIELDS = new Set(['pos', 'offset']);
const SIZE_FIELDS = new Set(['scale', 'projscale', 'size.xscale', 'size.yscale']);
const GAMEPLAY_FIELDS = new Set(['velocity', 'vel', 'accel', 'remvelocity', 'projclsnscale', 'ownclsnscale']);
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function digest(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
function normalizePath(value) { return path.normalize(path.resolve(String(value || '.'))); }
function finiteScale(value) { return Number.isFinite(value) && value > 0 && value <= 1000; }
function lines(text) { const rows = []; let start = 0, line = 0; while (start <= text.length) { const lf = text.indexOf('\n', start), rawEnd = lf < 0 ? text.length : lf, end = rawEnd > start && text[rawEnd - 1] === '\r' ? rawEnd - 1 : rawEnd; rows.push({ line, start, end, text: text.slice(start, end) }); if (lf < 0) break; start = lf + 1; line += 1; } return rows; }
function visible(line) { let quote = ''; for (let i = 0; i < line.length; i += 1) { const ch = line[i]; if (quote) { if (ch === quote && line[i - 1] !== '\\') quote = ''; } else if (ch === '"' || ch === "'") quote = ch; else if (ch === ';') return line.slice(0, i); } return line; }
function numericParts(expression) { const parts = String(expression).split(',').map(item => item.trim()); if (!parts.length || parts.some(item => !NUMBER.test(item))) return null; const values = parts.map(Number); return values.every(Number.isFinite) ? { parts, values } : null; }
function formatScaled(original, value) { const text = String(original).trim(); if (/^[+-]?\d+$/.test(text) && Number.isInteger(value)) return String(value); const decimals = (text.match(/\.(\d+)/) || [,''])[1].length; const rounded = Math.abs(value) < 1e-12 ? 0 : value; return decimals ? rounded.toFixed(Math.min(decimals, 8)).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1') : Number(rounded.toPrecision(12)).toString(); }

function parseScaleEvidence(text, filename = '') {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES) return freeze({ status: 'blocked', reason: 'The assigned constants source is unavailable or exceeds the review limit.', filename: normalizePath(filename), sourceHash: '', fields: {} });
  let section = ''; const found = { xscale: [], yscale: [], 'proj.doscale': [] };
  for (const row of lines(text)) {
    const source = visible(row.text), header = /^\s*\[\s*([^\]]+)\s*\]\s*$/.exec(source); if (header) { section = header[1].trim().toLowerCase(); continue; }
    const match = /^\s*(xscale|yscale|proj\.doscale)\s*=\s*(.*?)\s*$/i.exec(source); if (!match || section !== 'size') continue;
    const expression = match[2].trim(), parsed = numericParts(expression), valueStart = row.start + source.indexOf(match[2]) + (match[2].length - match[2].trimStart().length);
    found[match[1].toLowerCase()].push({ line: row.line, expression, value: parsed?.values.length === 1 ? parsed.values[0] : null, start: valueStart, end: valueStart + expression.length });
  }
  const fields = {}; const issues = [];
  for (const key of ['xscale', 'yscale']) { const list = found[key]; if (list.length !== 1) issues.push(list.length ? `${key} is duplicated in [Size].` : `${key} is missing from [Size].`); else if (!finiteScale(list[0].value)) issues.push(`${key} must be one finite positive numeric literal.`); else fields[key] = list[0]; }
  const doscale = found['proj.doscale']; if (doscale.length === 1 && doscale[0].value !== null) fields['proj.doscale'] = doscale[0]; else if (doscale.length > 1) issues.push('proj.doscale is duplicated in [Size].');
  return freeze({ status: issues.length ? 'blocked' : 'ready', reason: issues.join(' '), filename: normalizePath(filename), sourceHash: digest(text), fields });
}
function parseLocalcoord(text){let section='';const values=[];for(const row of lines(String(text||''))){const source=visible(row.text),header=/^\s*\[\s*([^\]]+)\s*\]\s*$/.exec(source);if(header){section=header[1].trim().toLowerCase();continue;}if(section!=='info')continue;const match=/^\s*localcoord\s*=\s*(.*?)\s*$/i.exec(source);if(!match)continue;const parsed=numericParts(match[1]);values.push(parsed?.values.length===2?parsed.values:null);}return values.length===0?null:values.length===1&&values[0]?values[0]:'unresolved';}

function scaleTransition(previous, current) {
  if (previous?.status !== 'ready' || current?.status !== 'ready') return freeze({ status: 'blocked', reason: previous?.status !== 'ready' ? previous?.reason || 'The previous character scale is unresolved.' : current?.reason || 'The current character scale is unresolved.' });
  const oldX = previous.fields.xscale.value, oldY = previous.fields.yscale.value, newX = current.fields.xscale.value, newY = current.fields.yscale.value;
  if (![oldX, oldY, newX, newY].every(finiteScale)) return freeze({ status: 'blocked', reason: 'Scale ratios require finite positive old and new values.' });
  const ratioX = newX / oldX, ratioY = newY / oldY, changedX = ratioX !== 1, changedY = ratioY !== 1;
  return freeze({ status: changedX || changedY ? 'changed' : 'unchanged', old: [oldX, oldY], current: [newX, newY], ratio: [ratioX, ratioY], changed: [changedX, changedY], transitionHash: digest(`${previous.filename}\0${previous.sourceHash}\0${current.sourceHash}\0${oldX},${oldY}>${newX},${newY}`) });
}

function cnsBlocks(text) {
  const rows = lines(text), blocks = [];
  for (let i = 0; i < rows.length; i += 1) {
    const header = /^\s*\[\s*state\b[^\]]*\]\s*$/i.exec(visible(rows[i].text)); if (!header) continue;
    let endRow = rows.length; for (let j = i + 1; j < rows.length; j += 1) if (/^\s*\[[^\]]+\]\s*$/.test(visible(rows[j].text))) { endRow = j; break; }
    const section = rows.slice(i + 1, endRow), type = section.map(row => /^\s*type\s*=\s*([A-Za-z][\w.]*)/i.exec(visible(row.text))).find(Boolean)?.[1]?.toLowerCase();
    if (type && CONTROLLERS.has(type)) blocks.push({ syntax: 'cns', kind: type, start: rows[i].start, end: endRow < rows.length ? rows[endRow].start : text.length, line: rows[i].line, rows: section });
    i = Math.max(i, endRow - 1);
  }
  return blocks;
}
function maskZss(text){const out=[...text];let quote='',lineComment=false,blockComment=false;for(let i=0;i<text.length;i+=1){const ch=text[i],next=text[i+1];if(lineComment){if(ch==='\n')lineComment=false;else out[i]=' ';continue;}if(blockComment){if(ch==='*'&&next==='/'){out[i]=out[i+1]=' ';i+=1;blockComment=false;}else if(ch!=='\n'&&ch!=='\r')out[i]=' ';continue;}if(quote){if(ch===quote&&text[i-1]!=='\\')quote='';if(ch!=='\n'&&ch!=='\r')out[i]=' ';continue;}if(ch==='/'&&next==='/'){out[i]=out[i+1]=' ';i+=1;lineComment=true;continue;}if(ch==='/'&&next==='*'){out[i]=out[i+1]=' ';i+=1;blockComment=true;continue;}if(ch==='"'||ch==="'"){quote=ch;out[i]=' ';}}
  return out.join('');}
function braceEnd(text, open) { let depth = 0, quote = ''; for (let i = open; i < text.length; i += 1) { const ch = text[i]; if (quote) { if (ch === quote && text[i - 1] !== '\\') quote = ''; continue; } if (ch === '"' || ch === "'") { quote = ch; continue; } if (ch === '{') depth += 1; else if (ch === '}' && --depth === 0) return i + 1; } return -1; }
function zssBlocks(text) { const blocks = [],masked=maskZss(text),pattern = /\b(explod|modifyexplod|helper|projectile|modifyprojectile|bindtoparent|bindtoroot|bindtotarget|targetbind)\b\s*(?:\([^{}]*\))?\s*\{/ig; let match; while ((match = pattern.exec(masked)) && blocks.length < MAX_CONTROLLERS) { const open = masked.indexOf('{', match.index), end = braceEnd(masked, open); if (end < 0) break; const bodyStart = open + 1, body = text.slice(bodyStart, end - 1),maskedBody=masked.slice(bodyStart,end-1),maskedRows=lines(maskedBody); blocks.push({ syntax: 'zss', kind: match[1].toLowerCase(), start: match.index, end, line: text.slice(0, match.index).split('\n').length - 1, rows: lines(body).map((row,index) => ({ ...row,masked:maskedRows[index]?.text||'', start: row.start + bodyStart, end: row.end + bodyStart })) }); pattern.lastIndex = end; } return blocks; }
function fieldsFor(block) { const fields = new Map(); for (const row of block.rows) { const source = block.syntax==='zss'?row.masked:visible(row.text), match = /^\s*([A-Za-z][\w.]*)\s*(?::|=)\s*(.*?)\s*[,;]?\s*$/.exec(source); if (!match) continue; const name = match[1].toLowerCase(), local = source.indexOf(match[2]) + (match[2].length - match[2].trimStart().length), rawLength=match[2].trim().replace(/[,;]\s*$/,'').length,raw=row.text.slice(local,local+rawLength).trim(),start = row.start + local; const item = { name, expression: raw, start, end: start + raw.length, line: row.line + block.line + 1 }; const list = fields.get(name) || []; list.push(item); fields.set(name, list); } return fields; }
function one(fields, name) { const list = fields.get(name) || []; return list.length === 1 ? list[0] : null; }
function attachment(block, fields) {
  if (block.kind === 'bindtoparent' || block.kind === 'bindtoroot') return { kind: 'unknown', confidence: 'runtime-owner-unresolved', reason: `${block.kind} names a hierarchy relation, but static source assignment does not prove that its runtime parent/root is the changed character.` };
  if (block.kind === 'bindtotarget' || block.kind === 'targetbind') return { kind: 'opponent', confidence: 'runtime', reason: 'The target identity and target scale are runtime-dependent.' };
  const space = one(fields, 'space')?.expression.toLowerCase(), postype = one(fields, 'postype')?.expression.toLowerCase();
  if (space === 'screen') return { kind: 'screen', confidence: 'proven', reason: 'space=screen is screen-space UI/placement.' };
  if (postype === 'p2') return { kind: 'opponent', confidence: 'proven', reason: 'postype=P2 is opponent-relative.' };
  if (['front','back','left','right','none'].includes(postype)) return { kind: 'world', confidence: 'proven', reason: `postype=${postype} uses a world/camera edge rather than body attachment.` };
  if (postype === 'p1') return { kind: 'body', confidence: 'character-relative', reason: 'postype=P1 proves a character-relative anchor, but not a specific hand/body part.' };
  return { kind: 'unknown', confidence: 'unknown', reason: 'No exact attachment/position-space evidence establishes intent.' };
}
function inspectSpatialEvidence(input = {}) {
  const sourcePath = normalizePath(input.sourcePath || '.'), text = String(input.text || '');
  if (Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES) return freeze({ schema:'ikemaker.spatial-evidence', version:1, sourcePath, sourceHash:'', status:'blocked', reason:'The source exceeds the 16 MiB spatial-evidence limit.', controllers:[], omitted:0 });
  const sourceHash=digest(text),all=[...cnsBlocks(text),...zssBlocks(text)].sort((left,right)=>left.start-right.start),blocks=all.slice(0,MAX_CONTROLLERS),wanted=new Set(['space','postype','pos','offset','scale','facing','bindid','bindtime','localcoord','velocity','vel','accel','remvelocity','projscale','projclsnscale','ownclsnscale']);
  const controllers=blocks.map(block=>{
    const fields=fieldsFor(block),values=[];
    for(const [name,occurrences] of fields)if(wanted.has(name))for(const field of occurrences)values.push({name,expression:field.expression,line:field.line,start:field.start,end:field.end,duplicate:occurrences.length>1});
    const anchor=attachment(block,fields),space=one(fields,'space')?.expression||'',postype=one(fields,'postype')?.expression||'',position=one(fields,'pos')||one(fields,'offset')||null,scale=one(fields,'scale')||one(fields,'projscale')||null;
    return{ id:effectId(sourcePath,block,sourceHash), syntax:block.syntax, controller:block.kind, line:block.line, start:block.start, end:block.end, attachment:anchor, coordinate:{space,postype,position:position?{field:position.name,expression:position.expression,line:position.line}:null,scale:scale?{field:scale.name,expression:scale.expression,line:scale.line}:null,facing:one(fields,'facing')?.expression||'',localCoord:Array.isArray(input.localCoord)?[...input.localCoord]:null}, fields:values, limitations:[...(values.some(field=>field.duplicate)?['Duplicate supported fields require manual resolution.']:[]),...(anchor.confidence==='runtime'||anchor.confidence==='runtime-owner-unresolved'?['Runtime recipient identity is unresolved by static source.']:[])] };
  });
  return freeze({schema:'ikemaker.spatial-evidence',version:1,sourcePath,sourceHash,status:all.length>MAX_CONTROLLERS?'incomplete':'ready',reason:all.length>MAX_CONTROLLERS?`${all.length-MAX_CONTROLLERS} controller(s) omitted by the review bound.`:'',controllers,omitted:Math.max(0,all.length-MAX_CONTROLLERS)});
}
function compensationStatus(expression,axes){const parts=String(expression).split(',').map(part=>part.trim().toLowerCase().replace(/\s+/g,''));let seen=false,proven=true;for(const axis of axes){const token=axis===0?'xscale':'yscale',part=parts[Math.min(axis,parts.length-1)]||'',reference=new RegExp(`(?:const\\(size\\.${token}\\)|size\\.${token})`,'i'),exact=new RegExp(`^(?:(?:[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))\\*)?const\\(size\\.${token}\\)(?:\\*(?:[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)))?$`,'i');if(reference.test(part)){seen=true;if(!exact.test(part))proven=false;}else proven=false;}return seen?(proven?'proven':'suspected'):'none';}
function replacementFor(field, ratios, axes = [0, 1]) { const parsed = numericParts(field.expression); if (!parsed || ![1,2,3].includes(parsed.values.length)) return null; const after = [...parsed.values]; for (const axis of axes) if (axis < after.length) after[axis] *= ratios[axis]; const replacement = parsed.parts.map((part, index) => formatScaled(part, after[index])).join(', '); return replacement === field.expression ? null : { before: field.expression, replacement, start: field.start, end: field.end }; }
function effectId(sourcePath, block, sourceHash) { return digest(`${normalizePath(sourcePath)}\0${sourceHash}\0${block.kind}\0${block.start}\0${block.end}`).slice(0, 32); }

function analyzeSource(input) {
  const { sourcePath, text, transition, policies = {}, includeGameplay = false, gameplaySelections = {}, owners = [] } = input;
  if (transition?.status !== 'changed') return freeze({ findings: [], controllers: 0, omitted: 0 });
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES) return freeze({ findings: [{ classification: 'unresolved', reason: 'Source unavailable or over the review limit.', sourcePath: normalizePath(sourcePath) }], controllers: 0, omitted: 1 });
  const sourceHash = digest(text), blocks = [...cnsBlocks(text), ...zssBlocks(text)].sort((a,b)=>a.start-b.start).slice(0, MAX_CONTROLLERS), findings = [];
  for (const block of blocks) {
    const fields = fieldsFor(block), id = effectId(sourcePath, block, sourceHash), policy = POLICIES[policies[id]] || null, anchor = attachment(block, fields), add = (fieldName, category, options = {}) => {
      const matches=fields.get(fieldName)||[];
      if(matches.length>1){findings.push({id:`${id}:${fieldName}:duplicate`,effectId:id,sourcePath:normalizePath(sourcePath),sourceHash,owners:[...new Set(owners.map(normalizePath))],syntax:block.syntax,controller:block.kind,controllerStart:block.start,controllerEnd:block.end,line:block.line,field:fieldName,expression:'(duplicated)',category,classification:'unresolved',reason:`${fieldName} is authored ${matches.length} times in this controller. Duplicate supported fields require manual resolution and cannot be rewritten.`,attachment:anchor,policy:policy?.id||'',policyLabel:policy?.label||'Unset',gameplay:category==='gameplay',patch:null});return;}
      const field = matches[0]; if (!field) return;
      const axes = fieldName === 'size.xscale' ? [0] : fieldName === 'size.yscale' ? [1] : [0,1];
      const compensation=compensationStatus(field.expression,axes),already=compensation==='proven';
      let classification = 'unresolved', reason = '';
      const synchronizedExplod=fieldName==='scale'&&['explod','modifyexplod'].includes(block.kind)&&numericParts(one(fields,'syncparams')?.expression||'')?.values[0]===1&&Boolean(one(fields,'syncid'));
      const doscaledProjectile=fieldName==='projscale'&&block.kind==='projectile'&&transition.projDoScale===true;
      if (already||synchronizedExplod||doscaledProjectile) { classification = 'already-compensated'; reason = synchronizedExplod?'syncid with syncparams=1 inherits synchronized character draw scale; the position remains separately classified.':doscaledProjectile?'[Size] proj.doscale is enabled, so creation-time projectile scale already receives character scale.': 'The authored expression already references character scale/inheritance; multiplying it again could compound the correction.'; }
      else if(compensation==='suspected'){classification='unresolved';reason='The expression references character scale, but its formula is dynamic or not a proven direct compensation. Inspect it manually; no rewrite is offered.';}
      else if(transition.localcoordChanged){classification='unresolved';reason='Character localcoord changed with xscale/yscale, so a simple scale-only ratio is not authoritative.';}
      else if (category === 'position' && anchor.kind !== 'body') { classification = anchor.kind === 'screen' || anchor.kind === 'world' || anchor.kind === 'opponent' ? 'intentionally-unchanged' : 'unresolved'; reason = anchor.reason; }
      else if (category === 'gameplay') {
        if (!includeGameplay || !gameplaySelections[`${id}:${fieldName}`]) { classification = 'gameplay-review'; reason = 'Gameplay-related scaling is separately opt-in and requires explicit field selection.'; }
        else if(options.gameplayMode==='manual'){classification='unresolved';reason='Pinned-engine semantics classify this gameplay field as report/manual-only; no proportional rewrite is offered.';}
        else if (!policy || policy.id === 'manual') { classification = 'unresolved'; reason = 'Gameplay review is enabled, but this effect still needs one explicit non-Manual intent policy.'; }
        else if(options.gameplayMode==='position'&&!policy.position){classification='intentionally-unchanged';reason=`${policy.label} does not opt this attachment-position field into scaling.`;}
        else if(options.gameplayMode==='size'&&!policy.size){classification='intentionally-unchanged';reason=`${policy.label} does not opt this collision-size field into scaling.`;}
        else { const replacement = replacementFor(field, transition.ratio, axes); if (replacement) { classification = 'proposed'; reason = `Separately selected gameplay review applies independent X/Y scale ratios under ${policy.label}.`; options.patch = replacement; } else { classification = 'unresolved'; reason = 'The gameplay expression is dynamic, malformed, unchanged, or outside the narrow numeric-literal rewrite grammar.'; } }
      }
      else if (!policy) { classification = 'unresolved'; reason = 'No explicit per-effect intent policy is set.'; }
      else if (policy.id === 'manual' || !policy[category]) { classification = 'intentionally-unchanged'; reason = `${policy.label} does not change this ${category} field.`; }
      else { const replacement = replacementFor(field, transition.ratio, axes); if (replacement) { classification = 'proposed'; reason = `${policy.label} applies independent X/Y scale ratios to this exact numeric literal.`; options.patch = replacement; } else { classification = 'unresolved'; reason = 'The expression is dynamic, malformed, unchanged, or outside the narrow numeric-literal rewrite grammar.'; } }
      findings.push({ id: `${id}:${fieldName}`, effectId: id, sourcePath: normalizePath(sourcePath), sourceHash, owners: [...new Set(owners.map(normalizePath))], syntax: block.syntax, controller: block.kind, controllerStart: block.start, controllerEnd: block.end, line: block.line, field: fieldName, expression: field.expression, category, classification, reason, attachment: anchor, policy: policy?.id || '', policyLabel: policy?.label || 'Unset', gameplay: category === 'gameplay', patch: options.patch || null });
    };
    if (POSITION_FIELDS.has('pos') && ['explod','modifyexplod','helper'].includes(block.kind)) add('pos', 'position');
    if (['projectile'].includes(block.kind)) add('offset', 'position');
    if (['explod','modifyexplod'].includes(block.kind)) add('scale', 'size');
    if (block.kind === 'helper') { add('size.xscale', 'size'); add('size.yscale', 'size'); add('ownclsnscale', 'gameplay',{gameplayMode:'manual'}); }
    if (['bindtoparent','bindtoroot','bindtotarget'].includes(block.kind)) add('pos', 'gameplay',{gameplayMode:'manual'});
    if (['projectile','modifyprojectile'].includes(block.kind)) { add('projscale', 'size'); add('projclsnscale', 'gameplay',{gameplayMode:'size'}); }
    if (['projectile','modifyprojectile'].includes(block.kind)) for (const name of ['velocity','vel','accel','remvelocity']) add(name, 'gameplay',{gameplayMode:'manual'});
    const synthetic=(field,reason,category='size')=>findings.push({id:`${id}:${field}`,effectId:id,sourcePath:normalizePath(sourcePath),sourceHash,owners:[...new Set(owners.map(normalizePath))],syntax:block.syntax,controller:block.kind,controllerStart:block.start,controllerEnd:block.end,line:block.line,field,expression:'(omitted)',category,classification:'already-compensated',reason,attachment:anchor,policy:policy?.id||'',policyLabel:policy?.label||'Unset',gameplay:category==='gameplay',patch:null});
    if(block.kind==='helper'&&!one(fields,'size.xscale')&&!one(fields,'size.yscale'))synthetic('size.xscale/yscale','Omitted Helper size scale inherits the creator size in the pinned engine; no rewrite is needed.');
    if(block.kind==='projectile'&&!one(fields,'projclsnscale'))synthetic('projclsnscale','Omitted projectile collision scale inherits the creator/animation-owner collision base scale.','gameplay');
  }
  return freeze({ findings, controllers: blocks.length, omitted: Math.max(0, [...cnsBlocks(text), ...zssBlocks(text)].length - blocks.length) });
}

function coverage(findings, metadata = {}) {
  const counts = { checked: findings.length, proposed: 0, alreadyCompensated: 0, intentionallyUnchanged: 0, unresolvedUnsupported: 0, gameplayReview: 0 };
  for (const item of findings) { if (item.classification === 'proposed') counts.proposed += 1; else if (item.classification === 'already-compensated') counts.alreadyCompensated += 1; else if (item.classification === 'intentionally-unchanged') counts.intentionallyUnchanged += 1; else if (item.classification === 'gameplay-review') counts.gameplayReview += 1; else counts.unresolvedUnsupported += 1; }
  const incomplete = counts.unresolvedUnsupported > 0 || counts.gameplayReview > 0 || (metadata.notScanned || []).length > 0,sharedOwnerFindings=findings.filter(item=>(item.owners||[]).length>1).length;
  return freeze({ ...counts, sharedOwnerFindings, complete: !incomplete, scope: metadata.scope || 'assigned character controller sources', engineTarget: metadata.engineTarget || 'pinned IKEMEN GO stable semantics', baseline: metadata.baseline || null, notScanned: [...(metadata.notScanned || [])], statement: incomplete ? 'Partial review only; the whole character is not certified fixed.' : 'All discovered in-scope fields were classified; this is not live runtime certification.' });
}

function createReview(input = {}) {
  const transition = input.transition, findings = [], notScanned = [];
  for (const source of input.sources || []) { try { const result = analyzeSource({ ...source, transition, policies: input.policies || {}, includeGameplay: input.includeGameplay === true, gameplaySelections: input.gameplaySelections || {} }); findings.push(...result.findings); if (result.omitted) notScanned.push(`${source.sourcePath}: ${result.omitted} controller(s) omitted by bounds`); } catch (error) { notScanned.push(`${source.sourcePath}: ${error.message}`); } }
  const report = coverage(findings, { scope: input.scope, engineTarget: input.engineTarget, baseline: input.baseline || null, notScanned });
  const semantic = { schema: SCHEMA, version: VERSION, defPath: normalizePath(input.defPath), transition, policies: { ...(input.policies || {}) }, includeGameplay: input.includeGameplay === true, gameplaySelections:{...(input.gameplaySelections||{})}, findings, coverage: report, limitations: ['Dynamic during-move scaling is deferred.', 'Numeric offsets do not prove a hand/body attachment.', 'Preview models authored evidence and never certifies runtime behavior.'] };
  return freeze({ ...semantic, reviewHash: digest(JSON.stringify(semantic)) });
}

function previewForFinding(finding, transition, reviewHash = '') {
  const patch = finding?.patch, parsedBefore = patch ? numericParts(patch.before) : null, parsedAfter = patch ? numericParts(patch.replacement) : null;
  return freeze({ schema: 'ikemaker.character-scale-preview', version: 1, reviewHash, effectId: finding?.effectId || '', findingId:finding?.id||'', sourcePath:finding?.sourcePath||'', sourceHash:finding?.sourceHash||'', controllerStart:finding?.controllerStart??null, controllerEnd:finding?.controllerEnd??null, controller: finding?.controller || '', field: finding?.field || '', attachment: finding?.attachment || { kind:'unknown', confidence:'unknown', reason:'No evidence.' }, character: { oldScale: transition?.old || [], newScale: transition?.current || [] }, effect: { before: parsedBefore?.values || null, after: parsedAfter?.values || null, sourceExpression: finding?.expression || '', modeled: Boolean(parsedBefore && parsedAfter), reason: patch ? finding.reason : 'No exact numeric before/after preview is available.' }, camera: 'shared-authored-coordinate-frame', writesFiles: false, limitations: parsedBefore && parsedAfter ? ['This preview models authored literal coordinates/scales only. Runtime animation, redirects, and dynamic state are not fabricated.'] : ['Numeric/source comparison only; visualization lacks exact authority.'] });
}

module.exports = { SCHEMA, VERSION, POLICIES, digest, parseScaleEvidence, parseLocalcoord, scaleTransition, inspectSpatialEvidence, analyzeSource, createReview, coverage, previewForFinding, numericParts, formatScaled };
