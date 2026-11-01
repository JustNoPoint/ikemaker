'use strict';

const path = require('path');
const { hash } = require('./mutation_safety');
const { parseAir } = require('./air_preview_model');
const { parseCodeStructure, flatten } = require('./code_structure_model');
const { parseStateDefaultAnimation, componentIdentity } = require('./state_animation_authority');
const { parseChangeAnimations, proveStateComponent } = require('./state_change_animation_authority');
const { parseExplodAnimationReferences } = require('./explod_animation_reference_authority');
const { parseCollisionReferences } = require('./collision_reference_authority');
const { parseCollisionEligibilityReferences } = require('./collision_eligibility_reference_authority');
const { parseCollisionContactReferences } = require('./collision_contact_reference_authority');
const { parseCollisionQueryReferences } = require('./collision_query_reference_authority');
const { parseCollisionOverlapReferences } = require('./collision_overlap_reference_authority');
const { parseProjectileCollisionOverlapReferences } = require('./projectile_collision_overlap_reference_authority');
const { maskSource } = require('./state_transfer_model');

const MAX_DEF_BYTES = 1024 * 1024;
const MAX_AIR_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_FILES = 256;
const MAX_USES_TOTAL = 4096;
const MAX_USES_PER_ACTION = 256;

const canonical = value => path.resolve(String(value || '')).toLowerCase();
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function syntaxFor(filename, explicit) { return explicit === 'zss' || /\.zss$/i.test(filename || '') ? 'zss' : 'cns'; }
function stateComponents(source, defPath) {
  const text = String(source.text || ''), syntax = syntaxFor(source.filename, source.syntax), lines = text.split(/\r?\n/), tree = parseCodeStructure(text, syntax, source.filename);
  return flatten(tree).filter(item => item.kind === 'state').map(item => {
    const block = lines.slice(item.startLine, item.endLine + 1).join('\n').replace(/[\r\n]+$/, ''), rangeHash = hash(block), signature = String(item.signature || item.title || '').trim();
    const stableId = `${canonical(source.filename)}:state:${item.startLine}:${item.endLine}:${rangeHash}`;
    const component = { kind: 'state', syntax, text: block, sourceText: block, filename: path.resolve(source.filename), sourceHash: source.sourceHash, startLine: item.startLine, endLine: item.endLine, rangeHash, stableId, signature, reference: { defPath: path.resolve(defPath) } };
    return proveStateComponent({ componentIdentity: componentIdentity(component), stableId, stateSignature: signature, syntax, filename: component.filename, startLine: item.startLine, endLine: item.endLine, rangeHash }, text, defPath) ? component : null;
  }).filter(Boolean);
}
function structuralComponents(source, defPath) {
  const text = String(source.text || ''), syntax = syntaxFor(source.filename, source.syntax), lines = text.split(/\r?\n/), tree = parseCodeStructure(text, syntax, source.filename);
  return flatten(tree).filter(item => item.kind === 'state' || item.kind === 'function').map(item => {
    const block = lines.slice(item.startLine, item.endLine + 1).join('\n').replace(/[\r\n]+$/, ''), rangeHash = hash(block), signature = String(item.signature || item.title || '').trim(), kind = item.kind;
    return { kind, syntax, text: block, sourceText: block, filename: path.resolve(source.filename), sourceHash: source.sourceHash, startLine: item.startLine, endLine: item.endLine, rangeHash, stableId: `${canonical(source.filename)}:${kind}:${item.startLine}:${item.endLine}:${rangeHash}`, signature, reference: { defPath: path.resolve(defPath) } };
  });
}
function literalAction(expression) { const value = String(expression || '').trim(); if (!/^(?:0|[1-9]\d*)$/.test(value)) return null; const number = Number(value); return Number.isSafeInteger(number) ? number : null; }
function lineOffsets(text) { const starts = [0]; for (let at = 0; at < text.length; at += 1) if (text[at] === '\n') starts.push(at + 1); return starts; }
function maskedExclusions(text, syntax, start, end) { if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) return []; const source=String(text||''),masked = maskSource(source, syntax === 'zss' ? 'zss' : 'cns'), output = []; let open = -1; for (let at = start; at < end; at += 1) { const hidden = masked[at] !== source[at] && /\s/.test(masked[at] || '') && !/\s/.test(source[at] || ''); if (hidden && open < 0) open = at; if (!hidden && open >= 0) { output.push({ start: open, end: at }); open = -1; } } if (open >= 0) output.push({ start: open, end }); let quote=-1;for(let at=start;at<end;at+=1){if(source[at]!=='"'||source[at-1]==='\\')continue;if(quote<0)quote=at;else{output.push({start:quote,end:at+1});quote=-1;}}if(quote>=0)output.push({start:quote,end});output.sort((a,b)=>a.start-b.start||a.end-b.end);const merged=[];for(const span of output){const prior=merged.at(-1);if(prior&&span.start<=prior.end)prior.end=Math.max(prior.end,span.end);else merged.push({...span});}return merged; }
function hasCustomState(text, syntax) { return /@customstate\b/i.test(maskSource(String(text || ''), syntax === 'zss' ? 'zss' : 'cns')); }
function defaultOccurrences(component, sourceText) {
  if (component.kind !== 'state') return [];
  const lines = String(component.text || '').split(/\r?\n/), sourceStarts = lineOffsets(String(sourceText || '')), found = [];
  if (component.syntax === 'cns') {
    for (let line = 1; line < lines.length; line += 1) {
      const code = lines[line].replace(/;.*/, ''); if (/^\s*\[/.test(code)) break;
      const match = /^\s*(anim)\s*=\s*(.*?)\s*$/i.exec(code); if (match) { const absoluteLine = component.startLine + line, rawStart = match.index + match[0].indexOf(match[2]), leading = match[2].length - match[2].trimStart().length, expression = match[2].trim(), valueStart = (sourceStarts[absoluteLine] ?? -1) + rawStart + leading; found.push({ expression, line: absoluteLine, fieldStart: (sourceStarts[absoluteLine] ?? -1) + match.index + match[0].indexOf(match[1]), valueStart, valueEnd: valueStart + expression.length }); }
    }
  } else {
    const header = String(lines[0] || '').replace(/#.*/, ''), pattern = /\banim\s*:\s*([^;\]]+)/gi; let match;
    while ((match = pattern.exec(header))) { const rawStart = match.index + match[0].indexOf(match[1]), leading = match[1].length - match[1].trimStart().length, expression = match[1].trim(), valueStart = (sourceStarts[component.startLine] ?? -1) + rawStart + leading; found.push({ expression, line: component.startLine, fieldStart: (sourceStarts[component.startLine] ?? -1) + match.index, valueStart, valueEnd: valueStart + expression.length }); }
  }
  return found.map(item => ({ ...item, action: literalAction(item.expression), available: found.length === 1 && literalAction(item.expression) !== null && !/@customstate\b/i.test(component.text), reason: found.length > 1 ? 'The StateDef has duplicate anim declarations.' : /@customstate\b/i.test(component.text) ? 'This StateDef is custom-state-sensitive, so character AIR ownership is unresolved.' : literalAction(item.expression) === null ? 'The authored default anim expression is dynamic, negative, or not a conservative integer literal.' : '' }));
}
function occurrenceStatus(record, actionCount) {
  if (!record.available || !Number.isInteger(record.action)) return 'unresolved';
  if (!actionCount) return 'missing';
  if (actionCount > 1) return 'ambiguous';
  return 'exact';
}
function buildAirActionUsageSnapshot(context = {}) {
  const unavailable = reason => freeze({ complete: false, reason, inventoryHash: '', publicUses: freeze({ available: false, reason, items: freeze([]), occurrences: freeze([]), issues: freeze([]), total: 0, exactTotal: 0, unresolvedTotal: 0 }), publicCollisions: freeze({ available: false, reason, items: freeze([]), total: 0, relationTotals: freeze({}) }), authorities: new Map(), targetAuthorities: new Map(), collisionAuthorities: new Map() });
  const defText = String(context.defText || ''), airText = String(context.airText || ''), defPath = path.resolve(context.defPath || ''), airPath = path.resolve(context.airPath || '');
  if (!defPath || context.defDirty || Buffer.byteLength(defText, 'utf8') > MAX_DEF_BYTES) return unavailable('Save or revert the character DEF before inspecting exact authored animation uses.');
  if (!airPath || Buffer.byteLength(airText, 'utf8') > MAX_AIR_BYTES) return unavailable('The assigned AIR is unavailable or exceeds the exact-reference limit.');
  const assigned = Array.isArray(context.assignedSources) ? context.assignedSources.map(item => path.resolve(item)) : [], sources = Array.isArray(context.sources) ? context.sources : [];
  if (context.inventoryComplete !== true || !assigned.length || assigned.length !== sources.length || assigned.length > MAX_SOURCE_FILES) return unavailable('The complete bounded assigned state-source inventory is unavailable.');
  let aggregate = 0;
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index], text = String(source?.text || ''), bytes = Buffer.byteLength(text, 'utf8'); aggregate += bytes;
    if (source?.available !== true || source.dirty || canonical(source.filename) !== canonical(assigned[index]) || bytes > MAX_SOURCE_BYTES || aggregate > MAX_SOURCE_TOTAL_BYTES || hash(text) !== source.sourceHash) return unavailable('An assigned state source is dirty, unavailable, stale, or exceeds the exact-reference limits.');
  }
  const parsedActions = parseAir(airText), counts = new Map(); for (const action of parsedActions) counts.set(action.number, (counts.get(action.number) || 0) + 1);
  const issues = [...counts].filter(([, count]) => count !== 1).map(([action]) => freeze({ action, reason: `Action ${action} is duplicated in the assigned AIR, so exact authored uses are unavailable.` }));
  const uses = [], collisionUses = [];
  for (const source of sources) {
    const components = structuralComponents(source, defPath), states = new Map(stateComponents(source, defPath).map(component => [`${component.startLine}:${component.endLine}`, component])), changes = parseChangeAnimations(source.text, syntaxFor(source.filename, source.syntax)), explods = parseExplodAnimationReferences(source.text, syntaxFor(source.filename, source.syntax));
    for (const structural of components.filter(component => component.kind === 'state')) {
      const component = states.get(`${structural.startLine}:${structural.endLine}`) || structural;
      for (const parsed of defaultOccurrences(component, source.text)) uses.push({ kind: 'default', action: parsed.action, component, source, expression: parsed.expression, line: parsed.line, fieldStart: parsed.fieldStart, controllerStart: -1, controllerEnd: -1, valueStart: parsed.valueStart, valueEnd: parsed.valueEnd, available: parsed.available, reason: parsed.reason, warning: '' });
    }
    for (const record of changes) {
      const component = components.filter(item => record.controllerLine >= item.startLine && record.controllerLine <= item.endLine).sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0] || null;
      const kind = record.kind || 'changeanim', inProvenState = component?.kind === 'state' && states.has(`${component.startLine}:${component.endLine}`), customSensitive = kind === 'changeanim' && /@customstate\b/i.test(component?.text || '');
      uses.push({ kind, action: record.action, component, source, expression: record.expression, line: record.controllerLine, fieldStart: -1, controllerStart: record.controllerStart, controllerEnd: record.controllerEnd, valueStart: record.valueStart, valueEnd: record.valueEnd, available: Boolean(record.available && inProvenState && !customSensitive), reason: component?.kind === 'function' ? `${kind === 'changeanim2' ? 'ChangeAnim2' : 'ChangeAnim'} is authored inside a Function; caller/runtime ownership is unresolved.` : !component ? `${kind === 'changeanim2' ? 'ChangeAnim2' : 'ChangeAnim'} is outside a proven StateDef or Function scope.` : customSensitive ? 'ChangeAnim inside a custom-state-sensitive StateDef may target the runtime recipient AIR, so character AIR ownership is unresolved.' : record.reason || '', warning: record.warning || '' });
    }
    for (const record of explods) {
      const component = components.filter(item => record.controllerLine >= item.startLine && record.controllerLine <= item.endLine).sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0] || null;
      const inProvenState = component?.kind === 'state' && states.has(`${component.startLine}:${component.endLine}`), customSensitive = /@customstate\b/i.test(component?.text || '');
      uses.push({ kind: 'explod-anim', action: record.action, component, source, expression: record.expression, line: record.controllerLine, fieldStart: -1, controllerStart: record.controllerStart, controllerEnd: record.controllerEnd, valueStart: record.valueStart, valueEnd: record.valueEnd, available: Boolean(record.available && inProvenState && !customSensitive), reason: component?.kind === 'function' ? 'Explod is authored inside a Function; caller/runtime ownership is unresolved.' : !component || !inProvenState ? 'Explod is outside a proven ordinary StateDef.' : customSensitive ? 'Explod inside a custom-state-sensitive StateDef has unresolved animation ownership.' : record.reason || '', warning: record.warning || '' });
    }
    const sourceSyntax = syntaxFor(source.filename, source.syntax);
    const collisionRecords = parseCollisionReferences(source.text, sourceSyntax).concat(parseCollisionEligibilityReferences(source.text, sourceSyntax), parseCollisionContactReferences(source.text, sourceSyntax).filter(record => record.evidenceRelevant !== false), parseCollisionQueryReferences(source.text, sourceSyntax), parseCollisionOverlapReferences(source.text, sourceSyntax), parseProjectileCollisionOverlapReferences(source.text, sourceSyntax)).sort((a, b) => a.controllerStart - b.controllerStart || a.controllerEnd - b.controllerEnd || a.kind.localeCompare(b.kind));
    for (const record of collisionRecords) {
      const component = components.filter(item => record.controllerLine >= item.startLine && record.controllerLine <= item.endLine).sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0] || null;
      const inProvenState = component?.kind === 'state' && states.has(`${component.startLine}:${component.endLine}`), stateNumber = component?.kind === 'state' && /^-?\d+$/.test(String(component.signature || '').trim()) ? Number(component.signature) : null;
      collisionUses.push({ ...record, component, source, inProvenState, stateNumber: Number.isSafeInteger(stateNumber) ? stateNumber : null });
    }
  }
  if (uses.length + collisionUses.length > MAX_USES_TOTAL) return unavailable('The assigned sources exceed the combined bounded animation/collision reference index.');
  const inventoryHash = hash(JSON.stringify(sources.map(source => ({ filename: canonical(source.filename), sourceHash: source.sourceHash }))));
  const authorities = new Map(), targetAuthorities = new Map(), collisionAuthorities = new Map(), items = [], occurrences = [], perAction = new Map(), omitted = new Map();
  for (const use of uses) {
    const source = use.source;
    const status = occurrenceStatus(use, counts.get(use.action) || 0), scope = use.component?.kind || 'global';
    const controllerLabel = use.kind === 'changeanim2' ? 'ChangeAnim2' : use.kind === 'explod-anim' ? 'Explod anim' : 'ChangeAnim';
    const occurrenceId = hash(JSON.stringify({ kind: use.kind, file: canonical(source.filename), sourceHash: source.sourceHash, line: use.line, start: use.valueStart, expression: use.expression }));
    const targetRoute = status === 'exact' ? String(context.targetToken?.({ occurrenceId, action: use.action }) || '') : '';
    const publicTargetRoute = /^[0-9a-f]{48}$/.test(targetRoute) ? targetRoute : '';
    occurrences.push(freeze({ id: occurrenceId, action: Number.isInteger(use.action) ? use.action : null, kind: use.kind, status, scope, expression: use.expression, expressionStart: use.valueStart, expressionEnd: use.valueEnd, excludedSpans: maskedExclusions(source.text, syntaxFor(source.filename, source.syntax), use.valueStart, use.valueEnd), controllerStart: use.controllerStart, controllerEnd: use.controllerEnd, warning: use.warning || '', reason: status === 'missing' ? `Assigned AIR has no Action ${use.action}.` : status === 'ambiguous' ? `Assigned AIR has duplicate Action ${use.action} declarations.` : use.reason || '', label: use.kind === 'default' ? `${use.component?.title || `State ${use.component?.signature || '?'}`} · default anim` : `${scope === 'function' ? `Function ${use.component?.signature || '?'}` : scope === 'global' ? 'Unproven scope' : use.component?.title || `State ${use.component?.signature || '?'}`} · ${controllerLabel}`, file: path.basename(source.filename), sourcePath: path.resolve(source.filename), sourceHash: source.sourceHash, sourceVersion: Number.isSafeInteger(source.version) ? source.version : null, line: use.line, targetRoute: publicTargetRoute }));
    if (publicTargetRoute) { const action = parsedActions.find(item => item.number === use.action), expressionText = source.text.slice(use.valueStart, use.valueEnd), controllerText = use.kind === 'default' ? '' : source.text.slice(use.controllerStart, use.controllerEnd); targetAuthorities.set(publicTargetRoute, freeze({ schema: 'ikemaker.air-expression-target-route', version: 1, route: publicTargetRoute, generation: Number(context.generation), occurrenceId, kind: use.kind, action: use.action, defPath, defHash: hash(defText), inventoryHash, sourcePath: path.resolve(source.filename), sourceHash: source.sourceHash, sourceVersion: Number.isSafeInteger(source.version) ? source.version : null, expressionStart: use.valueStart, expressionEnd: use.valueEnd, expressionHash: hash(expressionText), controllerStart: use.controllerStart, controllerEnd: use.controllerEnd, controllerHash: hash(controllerText), airPath, airHash: hash(airText), actionHash: hash(JSON.stringify(action)), actionLine: action.line })); }
    if (status !== 'exact' || !use.component || !source) continue;
    const count = perAction.get(use.action) || 0; if (count >= MAX_USES_PER_ACTION) { omitted.set(use.action, (omitted.get(use.action) || 0) + 1); continue; } perAction.set(use.action, count + 1);
    const component = use.component;
    const usageIdentity = hash(JSON.stringify({ kind: use.kind, component: componentIdentity(component), line: use.line, controllerStart: use.controllerStart, valueStart: use.valueStart, action: use.action }));
    const route = String(context.token?.({ usageIdentity, action: use.action }) || ''); if (!/^[0-9a-f]{48}$/.test(route)) continue;
    const action = parsedActions.find(item => item.number === use.action), controllerText = use.kind !== 'default' ? source.text.slice(use.controllerStart, use.controllerEnd) : '', valueText = source.text.slice(use.valueStart, use.valueEnd);
    const authority = freeze({ schema: 'ikemaker.air-action-usage-route', version: 1, route, generation: Number(context.generation), usageIdentity, kind: use.kind, action: use.action, defPath, defHash: hash(defText), inventoryHash, airPath, airHash: hash(airText), actionHash: hash(JSON.stringify(action)), sourcePath: path.resolve(source.filename), sourceHash: source.sourceHash, componentIdentity: componentIdentity(component), stableId: component.stableId, syntax: component.syntax, stateSignature: component.signature, startLine: component.startLine, endLine: component.endLine, rangeHash: component.rangeHash, expression: use.expression, line: use.line, fieldStart: use.fieldStart, controllerStart: use.controllerStart, controllerEnd: use.controllerEnd, controllerHash: hash(controllerText), valueStart: use.valueStart, valueEnd: use.valueEnd, valueHash: hash(valueText) });
    authorities.set(route, authority); items.push(freeze({ id: occurrenceId, action: use.action, kind: use.kind, label: use.kind === 'default' ? `${component.title || `State ${component.signature}`} · default anim` : `${component.title || `State ${component.signature}`} · ${use.kind === 'changeanim2' ? 'ChangeAnim2' : use.kind === 'explod-anim' ? 'Explod anim' : 'ChangeAnim'}`, expression: use.expression, warning: use.warning || '', file: path.basename(source.filename), line: use.line, route }));
  }
  const publicItems = items.map(item => freeze({ ...item, omitted: omitted.get(item.action) || 0 }));
  const unresolvedTotal = occurrences.filter(item => item.status !== 'exact').length;
  const collisionItems = [], relationTotals = { 'proven-explicit': 0, 'same-state': 0, 'conditional/dynamic': 0, 'global/shared': 0, unresolved: 0 }, collisionPerAction = new Map();
  const componentKey = component => component ? componentIdentity(component) : '';
  for (const use of collisionUses) {
    const componentId = componentKey(use.component), contactUse = use.category === 'contact-consumer', queryUse = use.category === 'collision-inspection', contactPolicy = use.controllerPolicy || {}, relatedActions = [...new Set(uses.filter(candidate => componentId && componentKey(candidate.component) === componentId && (occurrenceStatus(candidate, counts.get(candidate.action) || 0) === 'exact' || (contactUse && /custom-state-sensitive/i.test(candidate.reason || '') && !hasCustomState(candidate.component?.text,candidate.component?.syntax) && Number.isInteger(candidate.action) && counts.get(candidate.action) === 1))).map(candidate => candidate.action))].sort((a, b) => a - b);
    if (contactUse && contactPolicy.projectile) relatedActions.splice(0, relatedActions.length);
    const queryOwnerGroup = use.kind === 'clsnoverlap' ? use.ownerGroup : use.kind === 'projclsnoverlap' ? use.targetGroup : use.queryGroup;
    if (queryUse && (use.kind === 'projclsnoverlap' || !/^(?:clsn1|clsn2)$/i.test(queryOwnerGroup || ''))) relatedActions.splice(0, relatedActions.length);
    let relation = 'unresolved', reason = use.reason || '';
    const eligibility = use.category === 'eligibility-filtering', contact = contactUse, query = queryUse, subject = eligibility ? 'eligibility/filter' : contact ? 'contact consumer' : query ? 'collision read/query' : 'geometry mutation', customSensitive = hasCustomState(use.component?.text,use.component?.syntax);
    const indexed = context.collisionCapabilities?.indexed, stringExpressions = context.collisionCapabilities?.stringExpressions, dummyGroup = context.collisionCapabilities?.dummyGroup;
    const fieldCompatibility = field => {
      const value = String(field.expression || '').trim();
      if (query && (field.key === 'group' || field.key === 'owner.group')) { if (/^dummy$/i.test(value)) return dummyGroup === true ? 'nightly' : dummyGroup === false ? 'unsupported-on-stable' : 'unresolved'; return /^(?:clsn1|clsn2|size)$/i.test(value) ? 'stable' : 'unresolved'; }
      if (query && field.key === 'target.group') return /^(?:clsn1|clsn2|size)$/i.test(value) ? 'stable' : 'unresolved';
      if (contact && ['p2clsncheck', 'p2clsnrequire'].includes(field.key)) { if (/^(?:all|dummy)$/i.test(value)) return indexed === true ? 'nightly' : indexed === false ? 'unsupported-on-stable' : 'unresolved'; if (!/^(?:none|clsn1|clsn2|size)$/i.test(value)) return 'unresolved'; }
      if (contact && ['attr', 'hitflag', 'guardflag', 'reversal.attr', 'reversal.guardflag', 'reversal.guardflag.not'].includes(field.key) && field.literal === false) return stringExpressions === true ? 'nightly' : stringExpressions === false ? 'unsupported-on-stable' : 'unresolved';
      if ((use.kind === 'transformclsn' && ['group', 'index', 'pivot'].includes(field.key)) || (eligibility && ['clsn.group', 'clsn.index'].includes(field.key))) return indexed === true ? 'nightly' : indexed === false ? 'unsupported-on-stable' : 'unresolved';
      return 'stable';
    };
    const projectedFields = use.fields.map(field => freeze({ ...field, compatibility: fieldCompatibility(field) })), requiredField = contact && use.requiredKey ? projectedFields.find(field => field.key === use.requiredKey) : null;
    const contactBlocked = contact && (customSensitive || (use.requiredKey && (!requiredField || requiredField.compatibility === 'unsupported-on-stable' || requiredField.compatibility === 'unresolved')) || projectedFields.some(field => ['p2clsncheck', 'p2clsnrequire'].includes(field.key) && !['stable', 'nightly'].includes(field.compatibility)));
    const queryGroupFields = query ? projectedFields.filter(field => ['group', 'owner.group', 'target.group'].includes(field.key)) : [], queryBlocked = query && (customSensitive || use.redirect || !use.available || !queryGroupFields.length || queryGroupFields.some(field => !['stable', 'nightly'].includes(field.compatibility)));
    const semanticBlocked = contactBlocked || queryBlocked;
    if ((contact && (!use.available || semanticBlocked)) || queryBlocked) relatedActions.splice(0, relatedActions.length);
    if (contact && contactPolicy.projectile && use.available && !semanticBlocked && use.component?.kind === 'state') { relation = 'unresolved'; reason = `${use.label} is authored in this StateDef, but projectile animation-to-AIR ownership is not inferred from the player's current Action.`; }
    else if (use.available && !semanticBlocked && use.component?.kind === 'function') { relation = 'global/shared'; reason = eligibility ? 'Function-scoped eligibility/filter authoring is shared; callers are not inferred.' : contact ? 'Function-scoped contact consumer is shared; callers and runtime box ownership are not inferred.' : query ? 'Function-scoped collision read is shared; callers, effective boxes, index, and value are not inferred.' : 'Function-scoped geometry mutation is shared; callers are not inferred.'; }
    else if (use.available && !semanticBlocked && use.inProvenState && Number.isSafeInteger(use.stateNumber) && use.stateNumber < 0) { relation = 'global/shared'; reason = eligibility ? 'Negative StateDef eligibility/filter authoring is global/shared; runtime association is not inferred.' : contact ? 'Negative StateDef contact consumer is global/shared; runtime Action/box ownership is not inferred.' : query ? 'Negative StateDef collision read is global/shared; effective boxes, index, and value are not inferred.' : 'Negative StateDef geometry mutation is global/shared; runtime association is not inferred.'; }
    else if (query && use.available && !semanticBlocked && use.inProvenState) { relation = 'conditional/dynamic'; reason = use.kind === 'projclsnoverlap' ? 'Runtime ProjClsnOverlap selects a changing projectile-list entry and target; no containing-StateDef AIR Action, projID, collision family/index, effective geometry, or boolean result is proven.' : use.kind === 'clsnoverlap' ? (relatedActions.length ? 'Runtime ClsnOverlap occurs in the same StateDef; the current Action, target player, effective groups, and boolean result are not proven.' : /^(?:size|dummy)$/i.test(queryOwnerGroup || '') ? 'Runtime owner Size/Dummy overlap context is whole-character data and is not assigned to an AIR Action or authored box.' : 'Runtime ClsnOverlap has no exact animation candidate in this StateDef; target ownership, effective groups, and result are not proven.') : relatedActions.length ? 'Runtime ClsnVar read occurs in the same StateDef; the current Action, effective group contents, index, and value are not proven.' : /^(?:size|dummy)$/i.test(queryOwnerGroup || '') ? 'Runtime Size/Dummy collision read is whole-character context and is not assigned to an AIR Action or authored box.' : 'Runtime ClsnVar read has no exact animation candidate in this StateDef; effective group contents, index, and value are not proven.'; }
    else if (use.available && !semanticBlocked && use.inProvenState && relatedActions.length) { relation = use.conditional ? 'conditional/dynamic' : 'same-state'; reason = relation === 'same-state' ? (eligibility ? 'Eligibility/filter authored in the same StateDef; runtime association is not proven.' : contact ? 'Contact consumer authored in the same StateDef; runtime Action/box ownership is not proven.' : 'Related in the same StateDef; runtime association is not proven.') : `Condition, trigger, or dynamic ${subject} makes the same-StateDef relationship runtime-dependent.`; }
    else if (use.available && !semanticBlocked && use.inProvenState) { relation = use.conditional ? 'conditional/dynamic' : 'unresolved'; reason = use.conditional ? `Conditional or dynamic ${subject} has no exact animation candidate in this StateDef.` : 'No exact animation occurrence identifies an Action relationship in this StateDef.'; }
    else if (query && semanticBlocked && !reason) reason = customSensitive ? 'Custom-state-sensitive collision-query ownership is unresolved.' : 'Collision-query syntax, target compatibility, or runtime ownership is unresolved.';
    relationTotals[relation] += 1;
    const occurrenceId = hash(JSON.stringify({ kind: use.kind, file: canonical(use.source.filename), sourceHash: use.source.sourceHash, start: use.controllerStart, end: use.controllerEnd })), route = use.sourceExact ? String(context.collisionToken?.({ occurrenceId, kind: use.kind }) || '') : '', publicRoute = /^[0-9a-f]{48}$/.test(route) ? route : '';
    const targetStatus = query ? (/(?:clsn|projclsn)overlap/.test(use.kind || '') && !use.available ? 'unresolved' : /^dummy$/i.test(queryOwnerGroup || '') ? dummyGroup === true ? 'nightly-dummy' : dummyGroup === false ? 'unsupported-on-stable' : 'unresolved' : 'stable-1.0') : indexed === true ? 'nightly-indexed' : indexed === false && context.collisionCapabilities?.status === 'unsupported' ? 'stable-1.0' : 'unresolved';
    if (publicRoute) {
      const sharedAuthority = { version: 1, route: publicRoute, generation: Number(context.generation), occurrenceId, kind: use.kind, defPath, defHash: hash(defText), inventoryHash, sourcePath: path.resolve(use.source.filename), sourceHash: use.source.sourceHash, sourceVersion: Number.isSafeInteger(use.source.version) ? use.source.version : null, componentIdentity: componentId, airPath, airHash: hash(airText), capabilityFingerprint: String(context.collisionCapabilities?.fingerprint || targetStatus) };
      collisionAuthorities.set(publicRoute, query ? freeze({ schema: 'ikemaker.collision-query-source-route', ...sharedAuthority, callStart: use.callStart, callEnd: use.callEnd, callHash: hash(use.source.text.slice(use.callStart, use.callEnd)) }) : freeze({ schema: 'ikemaker.collision-source-route', ...sharedAuthority, controllerStart: use.controllerStart, controllerEnd: use.controllerEnd, controllerHash: hash(use.source.text.slice(use.controllerStart, use.controllerEnd)) }));
    }
    for (const action of relatedActions) collisionPerAction.set(action, (collisionPerAction.get(action) || 0) + 1);
    collisionItems.push(freeze({ id: occurrenceId, kind: use.kind, controller: use.label, category: use.category, controllerPolicy: use.controllerPolicy || null, relation, reason: semanticBlocked && !reason ? (customSensitive ? `Custom-state-sensitive ${query ? 'collision-query' : 'contact'} ownership is unresolved.` : `${query ? 'Collision-query' : 'Contact selector'} compatibility or runtime ownership is unresolved for this target.`) : reason, relatedActions: freeze(relatedActions), label: `${use.component?.kind === 'function' ? `Function ${use.component.signature || '?'}` : use.component?.kind === 'state' ? `State ${use.component.signature || '?'}` : 'Unproven scope'} · ${use.label}`, file: path.basename(use.source.filename), sourcePath: path.resolve(use.source.filename), sourceHash: use.source.sourceHash, sourceVersion: Number.isSafeInteger(use.source.version) ? use.source.version : null, line: use.controllerLine, controllerStart: use.controllerStart, controllerEnd: use.controllerEnd, callStart: use.callStart, callEnd: use.callEnd, fields: freeze(projectedFields), derivedEvidence: freeze(use.derivedEvidence || []), effectiveExplanation: use.effectiveExplanation || '', compatibility: targetStatus, route: publicRoute }));
  }
  const perActionOmitted = freeze(Object.fromEntries([...collisionPerAction].filter(([, count]) => count > MAX_USES_PER_ACTION).map(([action, count]) => [action, count - MAX_USES_PER_ACTION])));
  return freeze({ complete: true, reason: '', inventoryHash, publicUses: freeze({ available: true, reason: '', items: freeze(publicItems), occurrences: freeze(occurrences), issues: freeze(issues), total: uses.length, exactTotal: items.length, unresolvedTotal }), publicCollisions: freeze({ available: true, reason: '', items: freeze(collisionItems), total: collisionItems.length, relationTotals: freeze(relationTotals), perActionOmitted }), authorities, targetAuthorities, collisionAuthorities });
}
function validateAirActionUsageAuthority(authority, context = {}) {
  if (authority?.schema !== 'ikemaker.air-action-usage-route' || authority.version !== 1 || authority.generation !== Number(context.generation) || !/^[0-9a-f]{48}$/.test(authority.route || '')) return null;
  const rebuilt = buildAirActionUsageSnapshot({ ...context, token: item => item.usageIdentity === authority.usageIdentity && item.action === authority.action ? authority.route : '0'.repeat(48) }), candidate = rebuilt.authorities.get(authority.route);
  if (!candidate || Object.keys(candidate).length !== Object.keys(authority).length) return null;
  for (const key of Object.keys(candidate)) if (candidate[key] !== authority[key]) return null;
  return candidate;
}

function validateAirExpressionTargetAuthority(authority, context = {}) {
  if (authority?.schema !== 'ikemaker.air-expression-target-route' || authority.version !== 1 || authority.generation !== Number(context.generation) || !/^[0-9a-f]{48}$/.test(authority.route || '')) return null;
  const rebuilt = buildAirActionUsageSnapshot({ ...context, targetToken: item => item.occurrenceId === authority.occurrenceId && item.action === authority.action ? authority.route : '0'.repeat(48) });
  const candidate = rebuilt.targetAuthorities.get(authority.route);
  if (!candidate || Object.keys(candidate).length !== Object.keys(authority).length) return null;
  for (const key of Object.keys(candidate)) if (candidate[key] !== authority[key]) return null;
  return candidate;
}

function validateCollisionSourceAuthority(authority, context = {}) {
  if (!['ikemaker.collision-source-route', 'ikemaker.collision-query-source-route'].includes(authority?.schema) || authority.version !== 1 || authority.generation !== Number(context.generation) || !/^[0-9a-f]{48}$/.test(authority.route || '')) return null;
  const rebuilt = buildAirActionUsageSnapshot({ ...context, collisionToken: item => item.occurrenceId === authority.occurrenceId && item.kind === authority.kind ? authority.route : '0'.repeat(48) }), candidate = rebuilt.collisionAuthorities.get(authority.route);
  if (!candidate || Object.keys(candidate).length !== Object.keys(authority).length) return null;
  for (const key of Object.keys(candidate)) if (candidate[key] !== authority[key]) return null;
  return candidate;
}

module.exports = { MAX_DEF_BYTES, MAX_AIR_BYTES, MAX_SOURCE_BYTES, MAX_SOURCE_TOTAL_BYTES, MAX_SOURCE_FILES, MAX_USES_TOTAL, MAX_USES_PER_ACTION, buildAirActionUsageSnapshot, validateAirActionUsageAuthority, validateAirExpressionTargetAuthority, validateCollisionSourceAuthority };
