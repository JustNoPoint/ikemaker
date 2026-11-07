'use strict';
const { hash } = require('./mutation_safety');
const { cleanValue, planHelperMapInitializer } = require('./helper_map_binding');
const MAX_BYTES = 256 * 1024;

function scan(text, syntax) {
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new Error('The exact Helper controller is empty or exceeds the patch limit.');
  const structural = text.split(''), code = text.split(''); let quote = '', escaped = false;
  for (let at = 0; at < text.length; at++) {
    const ch = text[at], next = text[at + 1];
    if (quote) { structural[at] = ' '; if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; structural[at] = ' '; continue; }
    if (syntax === 'cns' && ch === ';' || syntax === 'zss' && (ch === '#' || ch === '/' && next === '/')) {
      for (; at < text.length && text[at] !== '\n' && text[at] !== '\r'; at++) structural[at] = code[at] = ' ';
      at--;
    }
  }
  if (quote) throw new Error('An unterminated Helper string prevents exact patching.');
  const masked = structural.join(''), uncommented = code.join(''), properties = [];
  let begin = 0, end = text.length;
  if (syntax === 'zss') {
    const blocks = [...masked.matchAll(/\bhelper\s*\{/gi)];
    if (blocks.length !== 1 || masked.slice(0, blocks[0].index).trim()) throw new Error('The source does not isolate one Helper controller.');
    begin = masked.indexOf('{', blocks[0].index) + 1; end = masked.indexOf('}', begin);
    if (end < 0 || /[{}]/.test(masked.slice(begin, end)) || masked.slice(end + 1).trim()) throw new Error('The Helper controller has ambiguous block structure.');
  } else {
    if ((masked.match(/^\s*\[/gm) || []).length !== 1 || (masked.match(/^\s*type\s*=\s*helper\s*$/gmi) || []).length !== 1) throw new Error('The source does not isolate one CNS Helper controller.');
  }
  const pattern = syntax === 'zss' ? /(?:^|[;\r\n])[ \t]*([A-Za-z][\w.]*)[ \t]*:[ \t]*/g : /^[ \t]*([A-Za-z][\w.]*)[ \t]*=[ \t]*/gm;
  const body = masked.slice(begin, end); let match;
  while ((match = pattern.exec(body))) {
    const start = begin + match.index + match[0].indexOf(syntax === 'zss' ? ':' : '=', match[0].indexOf(match[1]) + match[1].length) + 1; let finish = start;
    while (finish < end && !/[\r\n]/.test(masked[finish]) && !(syntax === 'zss' && masked[finish] === ';')) finish++;
    let valueStart = start, valueEnd = finish;
    while (valueStart < valueEnd && /\s/.test(uncommented[valueStart])) valueStart++;
    while (valueEnd > valueStart && /\s/.test(uncommented[valueEnd - 1])) valueEnd--;
    properties.push({ name: match[1], key: match[1].toLowerCase(), start: valueStart, end: valueEnd, value: text.slice(valueStart, valueEnd) });
  }
  return { properties, close: end, masked };
}

function binding(spawn, text) {
  const helper = require('./helper_authoring_model'), source = String(text || ''), raw = source.slice(spawn.startIndex, spawn.endIndex);
  if (spawn.sourceHash && spawn.sourceHash !== hash(source) || spawn.controllerHash && spawn.controllerHash !== hash(raw)) throw new Error('The selected Helper controller changed before loading.');
  scan(raw, spawn.syntax);
  const baseline = helper.planFromSpawn(spawn);
  return Object.freeze({ version: 1, filename: spawn.filename, uid: spawn.uid, syntax: spawn.syntax, ownerState: spawn.ownerState, start: spawn.startIndex, end: spawn.endIndex, sourceHash: hash(source), controllerHash: hash(raw), raw, baseline });
}

const fields = {
  name: ['name', p => JSON.stringify(p.name), value => /^"(?:[^"\\]|\\.)*"$/.test(value)],
  id: ['id', p => String(p.id)], stateNo: ['stateno', p => String(p.stateNo)], position: ['pos', p => p.position.join(', ')], postype: ['postype', p => p.postype, value => /^(p1|p2|front|back|left|right|none)$/i.test(value)], facing: ['facing', p => String(p.facing)], keyCtrl: ['keyctrl', p => p.keyCtrl.join(', ')],
  ownPal: ['ownpal', p => String(+p.ownPal)], remapPal: ['remappal', p => p.remapPal.join(', ')], extendsMap: ['extendsmap', p => String(+p.extendsMap)], immortal: ['immortal', p => String(+p.immortal)], clsnProxy: ['clsnproxy', p => String(+p.clsnProxy)], ownProjectile: ['ownprojectile', p => String(+p.ownProjectile)], ownClsnScale: ['ownclsnscale', p => String(+p.ownClsnScale)], inheritJuggle: ['inheritjuggle', p => String(p.inheritJuggle)], inheritChannels: ['inheritchannels', p => String(p.inheritChannels)], preserve: ['preserve', p => String(+p.preserve)], standby: ['standby', p => String(p.standby)], pauseMoveTime: ['pausemovetime', p => String(p.pauseMoveTime)], superMoveTime: ['supermovetime', p => String(p.superMoveTime)]
};
const numeric = value => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?:\s*,\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)*$/.test(value);
function addProperty(text, syntax, name, value) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  if (syntax === 'cns') return text + (text.endsWith('\n') ? '' : eol) + name + ' = ' + value + eol;
  const parsed = scan(text, syntax), before = text.slice(0, parsed.close), separator = /[;{]\s*$/.test(parsed.masked.slice(0, parsed.close)) ? '' : ';';
  return before + separator + ' ' + name + ': ' + value + ';' + text.slice(parsed.close);
}
function patch(capture, requested) {
  const helper = require('./helper_authoring_model');
  if (!capture || capture.version !== 1 || hash(capture.raw || '') !== capture.controllerHash) throw new Error('Reload the exact existing Helper before editing; an old UID alone cannot authorize replacement.');
  const before = capture.raw, parsed = scan(before, capture.syntax), baseline = helper.normalizeHelper(capture.baseline), plan = helper.normalizeHelper(requested), changes = [], additions = [];
  if (plan.language !== capture.syntax) throw new Error('Existing Helper syntax cannot be converted through field editing.');
  if (plan.trigger !== baseline.trigger) throw new Error('Authored conditions and trigger assignments are preserved. Edit them explicitly in source.');
  for (const [field, [key, serialize, literal = numeric]] of Object.entries(fields)) {
    if (JSON.stringify(plan[field]) === JSON.stringify(baseline[field])) continue;
    const matches = parsed.properties.filter(item => item.key === key);
    if (matches.length > 1 || matches.length && !literal(matches[0].value)) throw new Error(`Authored ${key} is dynamic or ambiguous and remains read-only. Edit its exact expression in source.`);
    const value = serialize(plan); if (matches.length) changes.push({ ...matches[0], after: value }); else additions.push({ key, value });
  }
  let after = before;
  for (const change of changes.sort((a,b) => b.start - a.start)) after = after.slice(0, change.start) + change.after + after.slice(change.end);
  for (const item of additions) after = addProperty(after, capture.syntax, item.key, item.value);
  const originalMaps = new Map(baseline.maps.map(item => [item.name.toLowerCase(), item])), nextMaps = new Map();
  for (const item of plan.maps) { const key = item.name.toLowerCase(); if (nextMaps.has(key)) throw new Error('Duplicate creation map names require an explicit source edit.'); nextMaps.set(key, item); }
  for (const key of originalMaps.keys()) if (!nextMaps.has(key)) throw new Error('Removing an authored creation map requires an explicit source edit.');
  for (const [key, item] of nextMaps) {
    if (originalMaps.get(key)?.value === item.value) continue;
    const component = { kind: 'helper', syntax: capture.syntax, sourceText: after, rangeHash: hash(after), stableId: capture.uid };
    after = planHelperMapInitializer(component, { category: 'maps', assigned: true, name: item.name, status: 'resolved' }, { mode: originalMaps.has(key) ? 'replace' : 'add', value: cleanValue(item.value) }).after;
  }
  return Object.freeze({ before, after, changed: after !== before, plan, preservedConditions: true });
}

function safeBinding(value) {
  if (!value || value.version !== 1 || typeof value.filename !== 'string' || typeof value.uid !== 'string' || !['cns','zss'].includes(value.syntax) || typeof value.raw !== 'string' || Buffer.byteLength(value.raw,'utf8') > MAX_BYTES || hash(value.raw) !== value.controllerHash || !/^[a-f0-9]{64}$/.test(value.sourceHash || '') || !Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end) || value.end - value.start !== value.raw.length || value.start < 0 || !value.baseline) return null;
  return { version:1,filename:value.filename,uid:value.uid,syntax:value.syntax,ownerState:value.ownerState,start:value.start,end:value.end,sourceHash:value.sourceHash,controllerHash:value.controllerHash,raw:value.raw,baseline:require('./helper_authoring_model').normalizeHelper(value.baseline) };
}
function generation(plan, capture) {
  const normalized = require('./helper_authoring_model').normalizeHelper(plan);
  try {
    const result = patch(capture, normalized), issues = [{level:'info',message:'Exact field patch: authored conditions, unknown properties, dynamic expressions, and surrounding bytes are preserved. The owned StateDef is not regenerated.'}];
    if (/^\s*trigger\w*\s*=.*:=/mi.test(result.before)) issues.push({level:'warning',message:'Authored trigger assignments change state while evaluating conditions. Their expressions remain verbatim.'});
    const readOnlyFields=[],properties=scan(capture.raw,capture.syntax).properties;
    for(const [field,[key,,literal=numeric]]of Object.entries(fields)){const matches=properties.filter(item=>item.key===key);if(matches.length>1||matches.length&&!literal(matches[0].value))readOnlyFields.push({field,expression:matches.map(item=>item.value).join(' / '),reason:'Authored dynamic or ambiguous property; edit its exact expression in source.'});}
    return { valid:true,plan:normalized,issues,code:result.after,spawnCode:result.after,stateCode:'',creationControllerCode:result.after,exactPatch:result,readOnlyFields };
  } catch (error) { return {valid:false,plan:normalized,issues:[{level:'error',message:error.message}],code:capture?.raw||'',spawnCode:'',stateCode:'',creationControllerCode:'',exactPatch:null}; }
}

module.exports = { MAX_BYTES, scan, binding, patch, safeBinding, generation };
