'use strict';

const { classifyRuntimeValue, classifyArguments, summarizeRuntimeValue, summarizeArguments } = require('./runtime_value_kind');
const { parseStateSource } = require('./state_transfer_model');
const { enabledCapabilityIds } = require('./catalog_capability_filter');
const TRIGGER_CATALOG=require('../data/triggers.json');
const TRIGGER_BY_NAME=new Map(TRIGGER_CATALOG.map(entry=>[String(entry.name||'').toLowerCase(),entry]).filter(([name])=>name));
const TRIGGER_NAMES=new Set(TRIGGER_BY_NAME.keys());
const CONTROLLER_BY_NAME=new Map(require('../data/sctrl.json').map(entry=>[String(entry.name||'').toLowerCase(),entry]).filter(([name])=>name));

function controllerContract(name){const catalog=CONTROLLER_BY_NAME.get(String(name||'').toLowerCase());return catalog?{name:catalog.name,signature:catalog.name,documentation:catalog.description||'',catalogMatch:true,metadata:{status:catalog.status||'documented','option count':String((catalog.params||[]).length),visibilityCapabilityId:catalog.capabilityId||''}}:{name:String(name||''),signature:String(name||''),documentation:'',catalogMatch:false,metadata:{status:'not in bundled catalog','option count':'unknown',visibilityCapabilityId:''}};}

const REDIRECTS = [
  ['root', /\broot\s*,/i, null],
  ['parent', /\bparent\s*,/i, 'numHelper'],
  ['helper', /\bhelper(?:\s*\([^)]*\))?\s*,/i, 'numHelper'],
  ['target', /\btarget(?:\s*\([^)]*\))?\s*,/i, 'numTarget'],
  ['enemy', /\benemy(?:Near)?(?:\s*\([^)]*\))?\s*,/i, 'numEnemy'],
  ['partner', /\bpartner(?:\s*\([^)]*\))?\s*,/i, 'numPartner'],
  ['player/playerID', /\b(?:player|playerID)\s*\([^)]*\)\s*,/i, null],
  ['stateOwner', /\bstateOwner\s*,/i, null]
];

function withoutComment(line) {
  let quote = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"' && line[i - 1] !== '\\') quote = !quote;
    if (line[i] === '#' && !quote) return line.slice(0, i);
  }
  return line;
}

function withoutLegacyComment(line){let quote=false;for(let index=0;index<line.length;index+=1){if(line[index]==='"'&&line[index-1]!=="\\")quote=!quote;if(line[index]===';'&&!quote)return line.slice(0,index);}return line;}

function lineOffsets(text) {
  const lines = text.split(/\r?\n/);
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + (text.slice(offset + line.length, offset + line.length + 2) === '\r\n' ? 2 : 1);
  }
  return { lines, offsets };
}

function issue(line, start, length, severity, code, message, help) {
  return { line, start, length: Math.max(1, length), severity, code, message, help };
}

function enclosingContext(lines, line, distance = 6) {
  return lines.slice(Math.max(0, line - distance), line + 1).map(withoutComment).join(' ');
}

function withoutStrings(line) {
  let quote = false;
  let result = '';
  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (character === '"' && line[i - 1] !== '\\') {
      quote = !quote;
      result += ' ';
    } else result += quote ? ' ' : character;
  }
  return result;
}

function opponentAvailabilitySeverity(value) {
  const policy = String(value || 'off').toLowerCase();
  if (policy === 'warning') return 'warning';
  if (policy === 'information' || policy === 'info' || policy === 'convention') return 'information';
  return null;
}

function negativeStateContexts(lines) {
  const result = [];
  let negative = false;
  for (const raw of lines) {
    const line = withoutComment(raw);
    const state = /^\s*\[\s*StateDef\s+([^;\]]+)/i.exec(line);
    const func = /^\s*\[\s*Function\b/i.test(line);
    if (state) negative = /^\s*-\d+\s*$/.test(state[1]);
    else if (func) negative = false;
    result.push(negative);
  }
  return result;
}

function customStateContexts(lines) {
  const result = [];
  let customState = false, exception = false;
  for (const raw of lines) {
    const code = withoutComment(raw);
    if (/^\s*\[\s*(?:StateDef|Function)\b/i.test(code)) { customState = false; exception = false; }
    if (/@customstate\b/i.test(raw)) customState = true;
    if (/@anim-owner-exception\b/i.test(raw)) exception = true;
    result.push({ customState, exception });
  }
  return result;
}

function controllerSource(lines, start) {
  let depth = 0, opened = false;
  const source = [];
  for (let line = start; line < lines.length; line += 1) {
    const code = withoutStrings(withoutComment(lines[line])); source.push(code);
    for (const character of code) {
      if (character === '{') { opened = true; depth += 1; }
      else if (character === '}' && opened) depth -= 1;
    }
    if (opened && depth <= 0) break;
  }
  return source.join('\n');
}

function hasEngineTimeZeroContract(lines, line) {
  const rawLines = lines.slice(Math.max(0, line - 8), line + 1);
  const rawContext = rawLines.join(' ');
  if (/@time-zero\s+engine\b/i.test(rawContext)) return true;

  const context = rawLines.map(withoutComment).join(' ');
  if (/\bstateNo\s*=\s*const\s*\(\s*State[A-Za-z0-9_.]*\s*\)/i.test(context)) return true;

  const literal = /\bstateNo\s*=\s*(\d+)\b/i.exec(context);
  return Boolean(literal && Number(literal[1]) >= 0 && Number(literal[1]) <= 199);
}

function normalizePrefixes(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean))];
}

function usesPrefix(name, prefixes) {
  return prefixes.some((prefix) => name.startsWith(prefix));
}

function boundedObservation(value,maximum=512){const source=String(value??'').trim();if(Buffer.byteLength(source,'utf8')<=maximum)return source;let result='';for(const character of source){if(Buffer.byteLength(`${result}${character}…`,'utf8')>maximum)break;result+=character;}return `${result}…`;}

function runtimeOwnerBefore(line,index){
  const before=String(line||'').slice(0,index),args='\\((?:[^()]|\\([^()]*\\))*\\)',match=new RegExp(`(?:^|[^A-Za-z0-9_])((?:root|parent|partner|p2|stateOwner|target(?:\\s*${args})?|helper(?:\\s*${args})?|enemy(?:Near)?(?:\\s*${args})?|player(?:ID)?\\s*${args}))\\s*,\\s*$`,'i').exec(before);
  return match?boundedObservation(match[1].replace(/\s+/g,''),256):'self';
}

function analyzeCommandReferences(text, commandNames, options = {}) {
  if (!Array.isArray(commandNames)) return [];
  const known = new Set(commandNames.map(String)), { lines } = lineOffsets(text), issues = [];
  for (let i = 0; i < lines.length; i += 1) {
    let line = withoutComment(lines[i]);
    if (options.semicolonComments) {
      let quoted = false;
      for (let position = 0; position < line.length; position += 1) {
        if (line[position] === '"' && line[position - 1] !== '\\') quoted = !quoted;
        if (line[position] === ';' && !quoted) { line = line.slice(0, position); break; }
      }
    }
    if (!line.trim()) continue;
    const structure = withoutStrings(line), pattern = /\bcommand\s*(?:!?=)/gi;
    for (let match = pattern.exec(structure); match; match = pattern.exec(structure)) {
      let quote = match.index + match[0].length;
      while (/\s/.test(line[quote] || '')) quote += 1;
      if (line[quote] !== '"') continue;
      let end = quote + 1;
      while (end < line.length && (line[end] !== '"' || line[end - 1] === '\\')) end += 1;
      if (end >= line.length) continue;
      const name = line.slice(quote + 1, end);
      if (!name || known.has(name)) continue;
      const caseVariants = [...known].filter(candidate => candidate.toLowerCase() === name.toLowerCase());
      issues.push(issue(i, quote + 1, name.length, 'error', 'missing-command',
        `CRITICAL: Command "${name}" is referenced but no exact [Command] name exists in the resolved character command catalog.${caseVariants.length ? ` Differently cased definition${caseVariants.length === 1 ? '' : 's'}: ${caseVariants.map(candidate => `"${candidate}"`).join(', ')}.` : ''}`,
        'Define this exact command name or correct the reference. IKEMEN can fail to load or run a character with an unresolved command reference; IKEMaker will not rename or create one automatically.'));
    }
  }
  return issues;
}

function nightlyStringCompatibilityIssues(records, capabilities) {
  if (!capabilities || enabledCapabilityIds(capabilities).has('zss.runtime-strings')) return [];
  const findings = [], seen = new Set(), add = (record, subject) => {
    const key = `${record.line}:${record.start}:${subject}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(issue(record.line, record.start, String(record.name || subject).length, 'error', 'unsupported-nightly-string', `${subject} uses a runtime string, but this project targets an engine without verified ZSS runtime-string support.`, 'Review the exact engine target in Project & Team Manager, or replace this authored string contract deliberately. IKEMaker will not change the target or rewrite source automatically.'));
  };
  for (const record of records.maps || []) if (record.valueKind === 'string') add(record, `Map ${record.name}`);
  for (const record of records.constants || []) if (record.declaration && record.valueKind === 'string') add(record, `Constant ${record.name}`);
  for (const record of records.locals || []) if (record.valueKind === 'string') add(record, `${record.localKind === 'parameter' ? 'Function parameter' : 'Scoped local'} ${record.name}`);
  for (const record of records.calls || []) if ((record.argumentKinds || []).includes('string')) add(record, `Function call ${record.name}`);
  return findings;
}

function nightlyBareFlagIssues(lines, capabilities) {
  if (!capabilities || enabledCapabilityIds(capabilities).has('zss.runtime-strings')) return [];
  const findings = [], pattern = /\b(HitDefAttr|MoveType|P2MoveType|Physics|PrevMoveType|PrevStateType|ReversalDefAttr|StateType|P2StateType|TeamMode)\b/gi;
  for (let line = 0; line < lines.length; line += 1) {
    const code = withoutStrings(withoutComment(lines[line]));
    for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
      const after = code.slice(match.index + match[0].length);
      if (/^\s*(?::|!?=|==)/.test(after)) continue;
      findings.push(issue(line, match.index, match[0].length, 'error', 'unsupported-nightly-string', `Bare ${match[1]} returns a runtime string only on a verified supporting Nightly; this project target requires the comparison form.`, 'Add an intentional explicit comparison for this project target, or review the exact engine target in Project & Team Manager. IKEMaker will not rewrite the expression or switch engines automatically.'));
    }
    const callPattern = /\b(GetHitVar|HitDefVar)\s*\(\s*(attr|guardflag|hitflag)\s*\)/gi;
    for (let match = callPattern.exec(code); match; match = callPattern.exec(code)) {
      const trigger = match[1].toLowerCase(), parameter = match[2].toLowerCase();
      if ((trigger === 'gethitvar' && parameter === 'hitflag') || (trigger === 'hitdefvar' && parameter === 'attr')) continue;
      const after = code.slice(match.index + match[0].length);
      if (/^\s*(?:!?=|==)/.test(after)) continue;
      findings.push(issue(line, match.index, match[0].length, 'error', 'unsupported-nightly-string', `${match[1]}(${match[2]}) returns a runtime string only on a verified supporting Nightly; this project target requires the comparison form.`, 'Add an intentional explicit comparison for this project target, or review the exact engine target in Project & Team Manager. IKEMaker will not rewrite the expression or switch engines automatically.'));
    }
  }
  return findings;
}

function nightlyStringMapAddIssues(records, capabilities) {
  if (!capabilities || !enabledCapabilityIds(capabilities).has('zss.runtime-strings')) return [];
  const identity = record => `${String(record.runtimeOwner || 'self').toLowerCase()}\0${String(record.name).toLowerCase()}`;
  const stringMaps = new Set((records.maps || []).filter(record => record.access === 'write' && record.valueKind === 'string').map(identity));
  return (records.maps || []).filter(record => record.access === 'add' && (record.valueKind === 'string' || stringMaps.has(identity(record)))).map(record => issue(record.line, record.start, record.name.length, 'error', 'string-map-add', record.valueKind === 'string' ? `Map ${record.name} adds a string value, but MapAdd/+= cannot add string values.` : `Map ${record.name} has an exact string assignment for the same runtime owner, but MapAdd/+= cannot add string values.`, 'Use := when replacing the string value, or keep numeric accumulation in a separate map. Review runtime control flow if this map intentionally changes type; IKEMaker will not rewrite it automatically.'));
}

function dynamicCommandOperands(rawLine) {
  const line = withoutStrings(withoutComment(String(rawLine || ''))), operands = [], pattern = /\b(SelfCommand|Command)\s*(?:!?=|==)\s*((?:map\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\))|\$([A-Za-z_][A-Za-z0-9_]*))/gi;
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    const start = match.index + match[0].lastIndexOf(match[2]);
    operands.push({ trigger: match[1], expression: match[2], kind: match[3] ? 'map' : 'local', name: match[3] || match[4], start, length: match[2].length });
  }
  return operands;
}

function nightlyCommandExpressionIssues(lines, capabilities) {
  if (!capabilities || enabledCapabilityIds(capabilities).has('command.nightly-expressions')) return [];
  const findings = [];
  for (let line = 0; line < lines.length; line += 1) {
    for (const operand of dynamicCommandOperands(lines[line])) findings.push(issue(line, operand.start, operand.length, 'error', 'unsupported-nightly-command-expression', `${operand.trigger} uses a dynamic command name from ${operand.expression}, but this project target does not have verified command-expression support.`, 'Use an intentional quoted command name for this target, or review the exact engine target in Project & Team Manager. IKEMaker will not resolve the runtime value, rewrite source, or switch engines automatically.'));
  }
  return findings;
}

function nightlyRedirectedCommandIssues(lines, capabilities) {
  if (!capabilities) return [];
  const enabled = enabledCapabilityIds(capabilities);
  if (!enabled.has('command.nightly-expressions') || enabled.has('command.redirected-expression-fix')) return [];
  const findings = [];
  const redirect = String.raw`(?:root|parent|partner|p2|stateOwner|enemy(?:Near)?(?:\s*\((?:[^()]|\([^()]*\))*\))?|target(?:\s*\((?:[^()]|\([^()]*\))*\))?|helper(?:\s*\((?:[^()]|\([^()]*\))*\))?|player(?:ID)?\s*\((?:[^()]|\([^()]*\))*\))`;
  const pattern = new RegExp(`\\b(${redirect})\\s*,\\s*(SelfCommand|Command)\\s*(?:!=|==|=)`, 'gi');
  for (let line = 0; line < lines.length; line += 1) {
    const code = withoutStrings(withoutComment(String(lines[line] || '')));
    for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
      const triggerStart = match.index + match[0].toLowerCase().lastIndexOf(match[2].toLowerCase());
      findings.push(issue(line, triggerStart, match[2].length, 'warning', 'nightly-command-redirect-bug', `${match[2]} is evaluated through ${match[1]}, but this selected Nightly predates the verified redirect-evaluation fix.`, 'Review this condition against the caller and redirected player, or select a verified descendant target containing the fix. IKEMaker will not rewrite the redirect or switch engines automatically.'));
    }
  }
  return findings;
}

const NIGHTLY_STRING_PREFIX_PARAMETERS = Object.freeze({
  changeanim: Object.freeze({ value: 1 }),
  changestate: Object.freeze({ anim: 1 }),
  explod: Object.freeze({ anim: 1 }),
  gamemakeanim: Object.freeze({ value: 1 }),
  hitdef: Object.freeze({ sparkno: 1, 'guard.sparkno': 1, hitsound: 2, guardsound: 2 }),
  modifyexplod: Object.freeze({ anim: 1 }),
  playsnd: Object.freeze({ value: 2 }),
  projectile: Object.freeze({ projanim: 1, projhitanim: 1, projremanim: 1, projcancelanim: 1 }),
  superpause: Object.freeze({ anim: 1, sound: 2 })
});

function positivelyStringBearingExpression(source) {
  const value = String(source || '').trim();
  return /(?:^|[^\\])['"]/.test(value) || /\$[A-Za-z_][A-Za-z0-9_]*/.test(value) || /\bmap\s*\(/i.test(value) || /\bcall\s+[A-Za-z_][A-Za-z0-9_.]*\s*\(/i.test(value);
}

const EXPANDED_STRING_CONTROLLER_FIELDS=Object.freeze({
  assertcommand:/^name$/,dialogue:/^text\d+$/,forcefeedback:/^waveform$/,
  lifebaraction:/^text$/,loadfile:/^path$/,mapadd:/^map$/,mapreset:/^exclude(?:[2-8])?$/,mapset:/^map$/,
  matchrestart:/^(?:stagedef|p[1-8]def)$/,modifyplayer:/^(?:displayname|lifebarname|helpername)$/,
  playbgm:/^bgm$/,remapsprite:/^preset$/,savefile:/^path$/,storyboard:/^path$/,
  hitby:/^(?:attr|value2?)$/,nothitby:/^(?:attr|value2?)$/,hitdef:/^(?:attr|hitflag|guardflag)$/,
  modifyhitdef:/^(?:attr|hitflag|guardflag)$/,projectile:/^(?:attr|hitflag|guardflag)$/,
  modifyprojectile:/^(?:attr|hitflag|guardflag)$/,reversaldef:/^reversal\.(?:attr|guardflag(?:\.not)?)$/,
  modifyreversaldef:/^reversal\.(?:attr|guardflag(?:\.not)?)$/,hitoverride:/^(?:attr|guardflag(?:\.not)?)$/,
  gethitvarset:/^attr$/,shaderset:/^name$/
});
function expandedStringFieldRole(controller,name){
  if(EXPANDED_STRING_CONTROLLER_FIELDS[controller]?.test(name)){
    if(/(?:^|\.)(?:attr)$/.test(name)||/^value2?$/.test(name))return'dynamic attribute expression';
    if(/(?:hitflag|guardflag)/.test(name))return'dynamic hit/guard flag expression';
    if(name==='map')return'dynamic map name';
    if(name==='waveform')return'dynamic force-feedback waveform';
    return'dynamic text/name/path expression';
  }
  return/(?:^|\.)shader\.name$/.test(name)?'dynamic shader name':'';
}

function controllerStringRequirement(controller, name, source) {
  controller = String(controller || '').toLowerCase();
  name = String(name || '').toLowerCase();
  const value = String(source || '').trim(), expandedRole = expandedStringFieldRole(controller, name);
  if (expandedRole && !/^"(?:[^"\\]|\\.)*"$/.test(value) && positivelyStringBearingExpression(value)) {
    return Object.freeze({ capabilityId: 'zss.expanded-string-expressions', role: expandedRole, expression: value });
  }
  const expected = NIGHTLY_STRING_PREFIX_PARAMETERS[controller]?.[name], args = expected ? topLevelArguments(value) : [];
  if (expected && args.length === expected + 1 && positivelyStringBearingExpression(args[0])) {
    const sound = new Set(['hitdef.hitsound', 'hitdef.guardsound', 'superpause.sound', 'playsnd.value']).has(`${controller}.${name}`);
    return Object.freeze({ capabilityId: 'zss.runtime-strings', role: sound ? 'dynamic sound prefix' : 'dynamic animation prefix', expression: args[0] });
  }
  return null;
}

function runtimeStringControllerOperands(lines) {
  const observations = new Map();
  const add = (line, value) => observations.set(line, [...(observations.get(line) || []), value]);
  const soundFields = new Set(['playsnd.value', 'hitdef.hitsound', 'hitdef.guardsound', 'superpause.sound']);
  const loggerControllers=new Set(['printtoconsole','displaytoclipboard','appendtoclipboard']);
  let controller = '', depth = 0;
  for (let line = 0; line < lines.length; line += 1) {
    const raw = String(lines[line] || ''), structure = withoutStrings(withoutComment(raw));
    if (!controller) {
      const header = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\{/.exec(structure);
      if (!header) continue;
      const normalized = header[1].toLowerCase();
      controller = normalized;
      depth = 0;
    }

    const fieldPattern = /\b([A-Za-z_][A-Za-z0-9_.]*)\s*:\s*([^;}\r\n]+)/g;
    for (let field = fieldPattern.exec(withoutComment(raw)); field; field = fieldPattern.exec(withoutComment(raw))) {
      const name = field[1].toLowerCase(), value = field[2].trim();
      let expression = '', role = '',visibilityCapabilityId='zss.runtime-strings';
      if (controller === 'helper' && name === 'name' && positivelyStringBearingExpression(value)) {
        expression = value;
        role = 'dynamic helper name';
      } else if(loggerControllers.has(controller)&&name==='params'){
        expression=value;role='runtime logger parameter';
      } else if(expandedStringFieldRole(controller,name)&&positivelyStringBearingExpression(value)){
        expression=value;role=expandedStringFieldRole(controller,name);visibilityCapabilityId='zss.expanded-string-expressions';
      } else {
        const expected = NIGHTLY_STRING_PREFIX_PARAMETERS[controller]?.[name], args = expected ? topLevelArguments(value) : [];
        if (expected && args.length === expected + 1 && positivelyStringBearingExpression(args[0])) {
          expression = args[0];
          role = soundFields.has(`${controller}.${name}`) ? 'dynamic sound prefix' : 'dynamic animation prefix';
        }
      }
      if (!expression) continue;
      const valueStart = field.index + field[0].lastIndexOf(field[2]), expressionStart = raw.indexOf(expression, valueStart);
      if (expressionStart < 0) continue;
      const operandPattern = /\bmap\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)|\$([A-Za-z_][A-Za-z0-9_]*)/gi;
      for (let operand = operandPattern.exec(expression); operand; operand = operandPattern.exec(expression)) add(line, {
        kind: operand[1] ? 'map' : 'local', name: operand[1] || operand[2], start: expressionStart + operand.index,
        length: operand[0].length, metadata: { 'string usage': 'runtime string input', 'string role': role, 'string controller': controller, 'string field': name, visibilityCapabilityId }
      });
    }

    for (const character of structure) {
      if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
    }
    if (depth <= 0) { controller = ''; depth = 0; }
  }
  return observations;
}

function nightlyControllerStringPositionIssues(lines, capabilities) {
  if (!capabilities) return [];
  const enabled=enabledCapabilityIds(capabilities),allowPrefixes=enabled.has('zss.runtime-strings'),allowExpanded=enabled.has('zss.expanded-string-expressions'),findings = [];
  if(allowPrefixes&&allowExpanded)return findings;
  let controller = '', depth = 0;
  for (let line = 0; line < lines.length; line += 1) {
    const raw = String(lines[line] || ''), structure = withoutStrings(withoutComment(raw));
    if (!controller) {
      const header = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\{/.exec(structure);
      if (!header) continue;
      const normalized = header[1].toLowerCase();
      controller = normalized;
      depth = 0;
    }

    const fieldPattern=/\b([A-Za-z_][A-Za-z0-9_.]*)\s*:\s*([^;}\r\n]+)/g;
    for(let field=fieldPattern.exec(withoutComment(raw));field;field=fieldPattern.exec(withoutComment(raw))){
      const name = field[1].toLowerCase(), value = field[2].trim(), start = Math.max(0, raw.indexOf(value,field.index));
      const expandedRole=expandedStringFieldRole(controller,name);
      if (expandedRole&&!allowExpanded&&!/^"(?:[^"\\]|\\.)*"$/.test(value)&&positivelyStringBearingExpression(value)) {
        findings.push(issue(line,start,value.length,'error','unsupported-expanded-string-expression',`${field[1]} uses a runtime ${expandedRole}, but this project target supports only its literal or legacy form.`,'Use the literal/legacy field form for this target, or review the exact engine target in Project & Team Manager. IKEMaker will not resolve the string, rewrite source, or switch engines automatically.'));
      } else if (!allowPrefixes&&controller === 'helper' && name === 'name' && !/^"(?:[^"\\]|\\.)*"$/.test(value) && positivelyStringBearingExpression(value)) {
        findings.push(issue(line, start, value.length, 'error', 'unsupported-nightly-string-position', 'Helper name uses a runtime string expression, but this project target supports only a quoted literal name.', 'Use a quoted literal Helper name for this target, or review the exact engine target in Project & Team Manager. IKEMaker will not resolve the value, rewrite source, or switch engines automatically.'));
      } else {
        const expected = NIGHTLY_STRING_PREFIX_PARAMETERS[controller]?.[name], args = expected ? topLevelArguments(value) : [];
        if (!allowPrefixes&&expected && args.length === expected + 1 && positivelyStringBearingExpression(args[0])) {
          const expressionStart = Math.max(0, raw.indexOf(args[0], start));
          findings.push(issue(line, expressionStart, args[0].length, 'error', 'unsupported-nightly-string-position', `${field[1]} uses a runtime animation or sound prefix expression, but this project target does not have verified support for that parameter form.`, 'Use the stable literal/numeric field syntax for this target, or review the exact engine target in Project & Team Manager. IKEMaker will not resolve the prefix, rewrite source, or switch engines automatically.'));
        }
      }
    }

    for (const character of structure) {
      if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
    }
    if (depth <= 0) { controller = ''; depth = 0; }
  }
  return findings;
}

function expandedStringTriggerIssues(lines,capabilities){
  if(!capabilities||enabledCapabilityIds(capabilities).has('zss.expanded-string-expressions'))return[];
  const findings=[];
  for(let line=0;line<lines.length;line+=1){
    const raw=String(lines[line]||''),code=withoutComment(raw),structure=withoutStrings(code),patterns=[/\b(HitDefAttr|ReversalDefAttr)\b\s*(?:=|!=)\s*(.+?)(?=\s*(?:&&|\|\||\{|$))/gi,/\b(GetHitVar|HitDefVar|ProjVar)\s*\(([^()]*)\)\s*(?:=|!=)\s*(.+?)(?=\s*(?:&&|\|\||\{|$))/gi];
    for(let patternIndex=0;patternIndex<patterns.length;patternIndex+=1)for(let match=patterns[patternIndex].exec(code);match;match=patterns[patternIndex].exec(code)){
      if(/^\s+$/.test(structure.slice(match.index,match.index+match[1].length)))continue;
      const parameter=patternIndex===0?'attr':String(topLevelArguments(match[2]).slice(-1)[0]||'').toLowerCase();if(!['attr','guardflag','hitflag'].includes(parameter))continue;
      const expression=String(match[patternIndex===0?2:3]||'').trim();if(!positivelyStringBearingExpression(expression))continue;
      const start=Math.max(match.index,raw.indexOf(expression,match.index));findings.push(issue(line,start,expression.length,'error','unsupported-expanded-string-expression',`${match[1]} compares ${parameter} with a runtime string expression, but this project target supports only its legacy comparison form.`,'Use a literal legacy attribute/flag comparison for this target, or review the exact engine target in Project & Team Manager. IKEMaker will not resolve the expression, rewrite source, or switch engines automatically.'));
    }
  }
  return findings;
}

function expandedStringTriggerOperands(lines){
  const observations=new Map(),add=(line,value)=>observations.set(line,[...(observations.get(line)||[]),value]);
  for(let line=0;line<lines.length;line+=1){
    const raw=String(lines[line]||''),code=withoutComment(raw),structure=withoutStrings(code),patterns=[/\b(HitDefAttr|ReversalDefAttr)\b\s*(?:=|!=)\s*(.+?)(?=\s*(?:&&|\|\||\{|$))/gi,/\b(GetHitVar|HitDefVar|ProjVar)\s*\(([^()]*)\)\s*(?:=|!=)\s*(.+?)(?=\s*(?:&&|\|\||\{|$))/gi];
    for(let patternIndex=0;patternIndex<patterns.length;patternIndex+=1)for(let match=patterns[patternIndex].exec(code);match;match=patterns[patternIndex].exec(code)){
      if(/^\s+$/.test(structure.slice(match.index,match.index+match[1].length)))continue;
      const parameter=patternIndex===0?'attr':String(topLevelArguments(match[2]).slice(-1)[0]||'').toLowerCase();if(!['attr','guardflag','hitflag'].includes(parameter))continue;
      const expression=String(match[patternIndex===0?2:3]||'').trim();if(!positivelyStringBearingExpression(expression))continue;
      const expressionStart=Math.max(match.index,raw.indexOf(expression,match.index)),operandPattern=/\bmap\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)|\$([A-Za-z_][A-Za-z0-9_]*)/gi;
      for(let operand=operandPattern.exec(expression);operand;operand=operandPattern.exec(expression))add(line,{kind:operand[1]?'map':'local',name:operand[1]||operand[2],start:expressionStart+operand.index,length:operand[0].length,metadata:{'string usage':'runtime string input','string role':'dynamic attr/flag comparison','string controller':match[1].toLowerCase(),'string field':parameter,visibilityCapabilityId:'zss.expanded-string-expressions'}});
    }
  }
  return observations;
}

const DEPTH_CAMERA_FIELDS = Object.freeze(['zboundtop', 'zboundbot', 'ztension', 'ztensionvel', 'zautocenter']);

function nightlyDepthCameraIssues(lines, capabilities) {
  if (!capabilities || enabledCapabilityIds(capabilities).has('stage.depth-camera')) return [];
  const findings = [], names = DEPTH_CAMERA_FIELDS.join('|'), stageVarPattern = new RegExp(`\\bStageVar\\s*\\(\\s*camera\\.(${names})\\s*\\)`, 'gi');
  for (let line = 0; line < lines.length; line += 1) {
    const raw = String(lines[line] || ''), code = withoutStrings(withoutComment(raw));
    for (let match = stageVarPattern.exec(code); match; match = stageVarPattern.exec(code)) findings.push(issue(line, match.index, match[0].length, 'error', 'unsupported-nightly-depth-camera', `StageVar(camera.${match[1]}) requires the verified Z-depth camera capability.`, 'Use a stable StageVar parameter for this target, or review the exact engine target in Project & Team Manager. IKEMaker will not rewrite source or switch engines automatically.'));
  }
  return findings;
}

function nightlyExpandedShaderIssues(lines, capabilities) {
  if (!capabilities || enabledCapabilityIds(capabilities).has('render.expanded-shaders')) return [];
  const findings = [];
  for (let line = 0; line < lines.length; line += 1) {
    const code = withoutStrings(withoutComment(String(lines[line] || '')));
    const stage = /\bStageVar\s*\(\s*(shadow\.shader|reflection\.shader)\s*\)/ig;
    for (let match = stage.exec(code); match; match = stage.exec(code)) findings.push(issue(line, match.index, match[0].length, 'error', 'unsupported-nightly-shader-surface', `${match[1]} requires the verified expanded-shader capability.`, 'Use shader fields supported by the selected target, or review the exact engine target in Project & Team Manager. IKEMaker will not rewrite source or switch engines automatically.'));
    const variable = /\b(ExplodVar|ProjVar)\s*\(([^()]*)\)/ig;
    for (let match = variable.exec(code); match; match = variable.exec(code)) {
      const args = topLevelArguments(match[2]);
      if (args.length === 3 && /^shader$/i.test(args[2])) findings.push(issue(line, match.index, match[0].length, 'error', 'unsupported-nightly-shader-surface', `${match[1]}(..., shader) requires the verified expanded-shader capability.`, 'Use a parameter supported by the selected target, or review the exact engine target in Project & Team Manager. IKEMaker will not rewrite source or switch engines automatically.'));
    }
  }
  return findings;
}

function capabilityCatalogIssues(lines, capabilities) {
  if (!capabilities) return [];
  const enabled = enabledCapabilityIds(capabilities), findings = [];
  let active = null, depth = 0;
  for (let line = 0; line < lines.length; line += 1) {
    const raw = String(lines[line] || ''), structure = withoutStrings(withoutComment(raw));
    for (const match of structure.matchAll(/\b([A-Za-z_][A-Za-z0-9_.]*)\b/g)) {
      const catalog = TRIGGER_BY_NAME.get(match[1].toLowerCase()), before = structure.slice(0, match.index), after = structure.slice(match.index + match[0].length);
      if (!catalog?.capabilityId || enabled.has(String(catalog.capabilityId).toLowerCase()) || /\b(?:call|Function)\s*$/i.test(before) || /^\s*\(/.test(after)) continue;
      findings.push(issue(line, match.index, match[0].length, 'error', 'unsupported-engine-capability', `${catalog.name} requires the unavailable ${catalog.capabilityId} engine capability for this project target.`, 'Review the exact project engine target, or replace this trigger deliberately. IKEMaker will not rewrite source or switch engines automatically.'));
    }
    if (!active) {
      const headers = [...structure.matchAll(/\b([A-Za-z_][A-Za-z0-9_.]*)\s*\{/g)];
      for (const header of headers) {
        const catalog = CONTROLLER_BY_NAME.get(header[1].toLowerCase());
        if (!catalog || (!catalog.capabilityId && !(catalog.params || []).some(parameter => parameter.capabilityId))) continue;
        active = { catalog, start: header.index, startLine: line };
        depth = 0;
        if (catalog.capabilityId && !enabled.has(String(catalog.capabilityId).toLowerCase())) findings.push(issue(line, header.index, header[1].length, 'error', 'unsupported-engine-capability', `${catalog.name} requires the unavailable ${catalog.capabilityId} engine capability for this project target.`, 'Review the exact project engine target, or replace this controller deliberately. IKEMaker will not remove the controller, rewrite source, or switch engines automatically.'));
        break;
      }
    }
    if (!active) continue;
    if (!active.catalog.capabilityId || enabled.has(String(active.catalog.capabilityId).toLowerCase())) {
      const field = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*:/.exec(withoutComment(raw));
      if (field) {
        let parameter = (active.catalog.params || []).find(item => String(item.name).toLowerCase() === field[1].toLowerCase());
        const dynamicShaderParameter = ['ModifyBGCtrl', 'ModifyShadow', 'ModifyReflection', 'Text', 'AfterImage'].includes(active.catalog.name) && /^shader\.param(?:[0-9]|1[0-5])$/i.test(field[1])
          || active.catalog.name === 'ModifyStageVar' && /^(?:shadow|reflection)\.shader\.param(?:[0-9]|1[0-5])$/i.test(field[1])
          || ['Explod', 'Projectile'].includes(active.catalog.name) && /^afterimage\.shader\.param(?:[0-9]|1[0-5])$/i.test(field[1]);
        if (!parameter && dynamicShaderParameter) parameter = { name: field[1], capabilityId: 'render.expanded-shaders' };
        if (parameter?.capabilityId && !enabled.has(String(parameter.capabilityId).toLowerCase())) findings.push(issue(line, field.index, field[1].length, 'error', 'unsupported-engine-capability', `${active.catalog.name}.${parameter.name} requires the unavailable ${parameter.capabilityId} engine capability for this project target.`, 'Use parameters supported by the selected target, or review the exact project engine target. IKEMaker will not remove the field, rewrite source, or switch engines automatically.'));
      }
    }
    const counted = line === active.startLine ? structure.slice(active.start) : structure;
    for (const character of counted) {
      if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
    }
    if (depth <= 0) { active = null; depth = 0; }
  }
  return findings;
}

function nightlyAudioSampleRateIssues(lines, capabilities) {
  if (!capabilities || enabledCapabilityIds(capabilities).has('audio.sample-rate-query')) return [];
  const findings = [];
  for (let line = 0; line < lines.length; line += 1) {
    const code = withoutStrings(withoutComment(String(lines[line] || '')));
    const bgm = /\bBGMVar\s*\(\s*sampleRate\s*\)/gi;
    for (let match = bgm.exec(code); match; match = bgm.exec(code)) findings.push(issue(line, match.index, match[0].length, 'error', 'unsupported-engine-capability', 'BGMVar(sampleRate) requires the unavailable audio.sample-rate-query engine capability for this project target.', 'Use a BGMVar parameter supported by the selected target, or review the exact engine target in Project & Team Manager. IKEMaker will not rewrite source or switch engines automatically.'));
    const sound = /\bSoundVar\s*\(\s*[^,()]+\s*,\s*sampleRate\s*\)/gi;
    for (let match = sound.exec(code); match; match = sound.exec(code)) findings.push(issue(line, match.index, match[0].length, 'error', 'unsupported-engine-capability', 'SoundVar(channel, sampleRate) requires the unavailable audio.sample-rate-query engine capability for this project target.', 'Use a SoundVar parameter supported by the selected target, or review the exact engine target in Project & Team Manager. IKEMaker will not rewrite source or switch engines automatically.'));
  }
  return findings;
}

function defMapCapabilityIssues(text, capabilities, file = 'character.def') {
  if (!capabilities) return [];
  const enabled=enabledCapabilityIds(capabilities);
  if (enabled.has('def.auto-typed-maps')&&enabled.has('zss.runtime-strings')) return [];
  const records=collectRecords(String(text||''),file);
  return (records.maps||[]).filter(record=>record.declaration&&record.valueKind==='string').map(record=>issue(record.line,record.start,String(record.name||'map').length,'error','unsupported-nightly-string',`Character DEF map ${record.name} uses a quoted string default, but this project target does not have verified auto-typed DEF map and runtime-string support.`,'Use a numeric default supported by the selected target, or review the exact engine target in Project & Team Manager. IKEMaker will not rewrite the value or switch engines automatically.'));
}

function defMapValueIssues(text, capabilities) {
  if (!capabilities || !enabledCapabilityIds(capabilities).has('def.auto-typed-maps')) return [];
  const findings=[],lines=String(text||'').split(/\r?\n/);let section='';
  for(let line=0;line<lines.length;line+=1){const raw=lines[line],code=withoutLegacyComment(raw),header=/^\s*\[\s*([^\]]+)\s*\]/.exec(code);if(header){section=header[1].trim().toLowerCase();continue;}if(section!=='map')continue;const entry=/^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/.exec(code);if(!entry)continue;const value=entry[2].trim();let valid=false;if(/^"/.test(value))valid=value.length>=2&&value.endsWith('"');else valid=/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(value);if(!valid)findings.push(issue(line,raw.indexOf(entry[2]),Math.max(1,entry[2].length),'error','invalid-def-map-value',`Character DEF map ${entry[1]} must use a quoted string, integer, or floating-point literal on this engine target.`,'Quote string defaults, or author a numeric literal. IKEMaker will not guess, coerce, or rewrite the value.'));}
  return findings;
}

function typedConstantIssues(text, capabilities, options = {}) {
  if (!capabilities) return [];
  const enabled = enabledCapabilityIds(capabilities).has('zss.runtime-strings'), findings = [], lines = String(text || '').split(/\r?\n/);
  let section = '';
  for (let line = 0; line < lines.length; line += 1) {
    const raw = lines[line], code = (options.legacy ? withoutLegacyComment : withoutComment)(raw);
    const header = /^\s*\[\s*([^\]]+)\s*\]/.exec(code);
    if (header) { section = header[1].trim().toLowerCase(); continue; }
    if (section !== 'constants') continue;
    const entry = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/.exec(code);
    if (!entry) continue;
    const value = entry[2].trim(), quoted = value.startsWith('"') && value.length >= 2 && value.endsWith('"'), numeric = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(value);
    if (!enabled && quoted && options.compatibility !== false) findings.push(issue(line, raw.indexOf(entry[2]), Math.max(1, entry[2].length), 'error', 'unsupported-nightly-string', `Constant ${entry[1]} uses a quoted string value, but this project target does not have verified auto-typed constant and runtime-string support.`, 'Use a numeric constant supported by the selected target, or review the exact engine target in Project & Team Manager. IKEMaker will not rewrite the value or switch engines automatically.'));
    else if (enabled && !quoted && !numeric) findings.push(issue(line, raw.indexOf(entry[2]), Math.max(1, entry[2].length), 'error', 'invalid-typed-constant-value', `Constant ${entry[1]} must use a quoted string, integer, or floating-point literal on this engine target.`, 'Quote a string default, or author a numeric literal. IKEMaker will not guess, coerce, or rewrite the value.'));
  }
  return findings;
}

function analyzeZss(text, options = {}) {
  const mapPrefixes = normalizePrefixes(options.mapPrefixes !== undefined ? options.mapPrefixes : options.mapPrefix);
  const functionPrefixes = normalizePrefixes(options.functionPrefixes !== undefined ? options.functionPrefixes : options.functionPrefix);
  const opponentSeverity = String(options.authorName || '').trim() ? opponentAvailabilitySeverity(options.opponentAvailability) : null;
  const { lines } = lineOffsets(text);
  const issues = [];
  const records = collectRecords(text);
  const inNegativeState = negativeStateContexts(lines);
  const customState = customStateContexts(lines);

  for (const syntax of records.functionSyntaxErrors || []) issues.push(issue(syntax.line, syntax.start, syntax.length, 'error', 'invalid-function-header', syntax.message, 'Use [Function Name(arg1, arg2) result1, result2]. Arguments and returns are untyped variable names; current IKEMEN does not support type annotations or default parameter values.'));
  const functionDeclarations=new Map();for(const record of records.functions||[]){const key=record.name.toLowerCase();if(!functionDeclarations.has(key))functionDeclarations.set(key,[]);functionDeclarations.get(key).push(record);}for(const declarations of functionDeclarations.values())if(declarations.length>1)for(const record of declarations.slice(1))issues.push(issue(record.line,record.start,record.name.length,'error','duplicate-function-declaration',`Function ${record.name} is declared more than once in this source. IKEMEN keeps the first loaded declaration.`,'Remove or rename the duplicate. IKEMaker will not guess which body you intended to call.'));
  issues.push(...nightlyStringCompatibilityIssues(records, options.capabilities));
  issues.push(...nightlyBareFlagIssues(lines, options.capabilities));
  issues.push(...nightlyStringMapAddIssues(records, options.capabilities));
  issues.push(...nightlyCommandExpressionIssues(lines, options.capabilities));
  issues.push(...nightlyRedirectedCommandIssues(lines, options.capabilities));
  issues.push(...nightlyControllerStringPositionIssues(lines, options.capabilities));
  issues.push(...expandedStringTriggerIssues(lines, options.capabilities));
  issues.push(...nightlyDepthCameraIssues(lines, options.capabilities));
  issues.push(...nightlyExpandedShaderIssues(lines, options.capabilities));
  issues.push(...capabilityCatalogIssues(lines, options.capabilities));
  issues.push(...nightlyAudioSampleRateIssues(lines, options.capabilities));
  issues.push(...require('./nightly_string_assistance').dynamicMapKeyIssues(text, options.capabilities));
  issues.push(...require('./nightly_string_assistance').dynamicStateTypeIssues(text, options.capabilities));
  issues.push(...require('./nightly_string_assistance').runtimeStringSemanticsIssues(text, options.capabilities));
  issues.push(...typedConstantIssues(text, options.capabilities, { compatibility: false }));

  issues.push(...require('./unused_let_analysis').analyzeUnusedLets(text, { severity: options.unusedLetSeverity }).issues);
  issues.push(...analyzeCommandReferences(text, options.commandNames));
  issues.push(...require('./zss_sound_lifecycle').analyzeSoundLifecycle(text));
  for(const record of records.functions){
    const documented=Object.keys(record.parameterDocs||{}),authored=(record.params||[]).map(value=>String(value).replace(/\s*=.*$/,'').trim()).filter(Boolean);
    if(!documented.length)continue;
    const missing=authored.filter(value=>!documented.includes(value)),removed=documented.filter(value=>!authored.includes(value));
    if(missing.length||removed.length)issues.push(issue(record.line,record.start,record.name.length,'information','stale-function-comment',`Function comment parameters do not match ${record.name}${record.signature}.`,`Run Comment Assistance → Update Comment for Function Signature. Missing: ${missing.join(', ')||'none'}; no longer in signature: ${removed.join(', ')||'none'}. IKEMaker will not rewrite the comment automatically.`));
  }
  for(const record of records.locals.filter(value=>!value.declaration&&value.metadata?.declared==='false'))issues.push(issue(record.line,record.start,record.name.length+(record.sigil?1:0),'information','unresolved-scoped-name',`No exact parameter or earlier let declaration for $${record.name} was found in ${record.metadata.scope}.`,'Review the spelling and declaration order in this exact scope. Equal names in other functions or StateDefs are separate scopes; IKEMaker will not link or create one automatically.'));

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = withoutComment(raw);
    if (!line.trim()) continue;
    const context = enclosingContext(lines, i);

    const timeZero = /\btime\s*=\s*0\b/i.exec(line);
    if (timeZero && inNegativeState[i] && !hasEngineTimeZeroContract(lines, i)) {
      issues.push(issue(i, timeZero.index, timeZero[0].length, 'information', 'negative-time-zero',
        '`time = 0` in a negative StateDef depends on state and engine processing order.',
        'Use `time <= 1` only when a two-tick window is safe, use an entry latch for exactly-once work, or add `# @time-zero engine` for a verified hardcoded engine contract.'));
    }

    // Redirects that can disappear between team modes or during state transitions.
    for (const [name, pattern, guard] of REDIRECTS) {
      const match = pattern.exec(line);
      if (!match) continue;
      if (guard && !new RegExp(`\\b${guard}\\b`, 'i').test(context)) {
        issues.push(issue(i, match.index, match[0].length, 'warning', 'redirect-guard',
          `${name} redirect has no nearby ${guard} validity guard.`,
          `Guard the redirect in the same condition/block; ${name} may not exist in every Simul, Tag, Turns, or lifecycle frame.`));
      }
      if (name === 'root' && !/\bnumHelper\b/i.test(context)) {
        issues.push(issue(i, match.index, match[0].length, 'information', 'root-context',
          'root redirect assumes this code is executing as a helper.',
          'If this function can run for both a player and helper, branch on numHelper or document the ownership contract.'));
      }
    }

    const p2Line = withoutStrings(line);
    const p2 = /\bp2\s*,/i.exec(p2Line);
    if (p2 && opponentSeverity) {
      issues.push(issue(i, p2.index, p2[0].length, opponentSeverity, 'opponent-guard',
        'Author-rule heuristic: review this P2 redirect\'s selected-opponent contract.',
        'P2 is a persistent engine-selected opponent, not simply enemyNear, and is not inherently wrong in Simul. This is the identified author\'s contextual advice, not a game rule, syntax error, or runtime error. Verify that the current P2 selection is the intended target and guard only when the surrounding operation requires it.'));
    }

    const partner = /\bpartner\s*,/i.exec(line);
    if (partner && !/\bteamMode\s*=\s*(?:simul|tag)\b/i.test(context)) {
      issues.push(issue(i, partner.index, partner[0].length, 'information', 'team-mode',
        'partner redirect is not visibly restricted to a team mode.',
        'Check teamMode and numPartner when behavior should differ between Single, Simul, Tag, and Turns.'));
    }

    const playerNumber = /\bplayer\s*\(\s*[1-8]\s*\)\s*,/i.exec(line);
    if (playerNumber) {
      issues.push(issue(i, playerNumber.index, playerNumber[0].length, 'warning', 'literal-player-slot',
        'Literal player-slot redirect is fragile in Simul and Tag.',
        'Prefer playerID, enemy, partner, target, teamLeader, or an ID stored during an explicit handshake.'));
    }

    if (/\b(?:targetState|selfState)\s*\{/i.test(line)) {
      const match = /\b(?:targetState|selfState)\b/i.exec(line);
      if (/\btargetState\b/i.test(match[0]) && !/\bnumTarget\b/i.test(context)) {
        issues.push(issue(i, match.index, match[0].length, 'error', 'targetstate-guard',
          'targetState has no nearby numTarget guard.',
          'A target can be released or replaced before this controller executes.'));
      }
      // Ownership annotations are comments, so inspect raw context here rather
      // than enclosingContext(), which intentionally removes comments.
      const annotationContext = lines.slice(Math.max(0, i - 30), i + 1).join(' ');
      if (!/@customstate\b/i.test(annotationContext)) {
        issues.push(issue(i, match.index, match[0].length, 'information', 'customstate-contract',
          'Custom-state transfer has no nearby ownership annotation.',
          'Consider # @customstate controller=attacker plus @position-owner, @facing-owner, and @sync annotations.'));
      }
    }

    const animationOwner = /\b(?:changeAnim|explod)\s*\{/i.exec(line);
    if (animationOwner && customState[i].customState) {
      const block = controllerSource(lines, i);
      if (!/\banimPlayerNo\s*:/i.test(block)) issues.push(issue(i, animationOwner.index, animationOwner[0].length, 'warning', 'customstate-anim-owner',
        'Custom-state animation work does not explicitly declare animPlayerNo.',
        'Choose the intended AIR owner for this controller and declare animPlayerNo. Animation and sprite ownership are separate; do not infer the value automatically.'));
    }
    const legacyCustomAnimation = /\bchangeAnim2\s*\{/i.exec(line);
    if (legacyCustomAnimation && customState[i].customState && !customState[i].exception) {
      issues.push(issue(i, legacyCustomAnimation.index, legacyCustomAnimation[0].length, 'information', 'customstate-anim-owner-exception',
        'ChangeAnim2 does not expose the explicit animPlayerNo contract used by this project rule.',
        'Use an ownership-explicit supported route, or document the reviewed exception with # @anim-owner-exception and its intended AIR/sprite owners.'));
    }

    if (/\b(?:posSet|posAdd|velSet|velAdd|turn|changeState|selfState)\s*\{/i.test(line)
        && /\b(?:target|enemy|partner|player(?:ID)?\s*\([^)]*\))\s*,/i.test(line)) {
      const match = /\b(?:posSet|posAdd|velSet|velAdd|turn|changeState|selfState)\b/i.exec(line);
      issues.push(issue(i, match.index, match[0].length, 'warning', 'cross-entity-write',
        'This frame writes movement/state through another entity redirect.',
        'Processing order can change when MoveType becomes A. Use one position owner and a GameTime-stamped handshake for same-frame coordination.'));
    }

    const orderFlag = /\b(?:runFirst|runLast)\b/i.exec(line);
    if (orderFlag) {
      issues.push(issue(i, orderFlag.index, orderFlag[0].length, 'information', 'forced-order',
        `${orderFlag[0]} changes normal player processing order.`,
        'Use only for a documented global ordering contract; it can hide cross-entity synchronization assumptions.'));
    }

    const loop = /^\s*while\b/i.exec(line);
    if (loop) {
      const block = lines.slice(i, Math.min(lines.length, i + 40)).map(withoutComment).join('\n');
      const condition = line.replace(/^\s*while\s*/i, '').replace(/\{.*$/, '').trim();
      const identifiers = condition.match(/\b[A-Za-z_][A-Za-z0-9_.]*\b/g) || [];
      const changesCondition = identifiers.some((id) => new RegExp(`(?:\\b${escapeRegExp(id)}\\b\\s*(?::=|[+\\-*/]?=)|(?:map|var|fvar)\\s*\\([^)]*${escapeRegExp(id)}[^)]*\\)\\s*:=)`, 'i').test(block));
      if (!/\bbreak\b/i.test(block) && !changesCondition) {
        issues.push(issue(i, loop.index, loop[0].length, 'warning', 'loop-progress',
          'Loop condition has no obvious update or break in the following block.',
          'IKEMEN caps loops, but a capped loop can still waste a frame and conceal a logic error.'));
      }
      if (/\b(?:enemy|partner|target|helper|player(?:ID)?)\s*(?:\([^)]*\))?\s*,/i.test(block)) {
        issues.push(issue(i, loop.index, loop[0].length, 'information', 'loop-redirect',
          'Loop contains redirected entity access.',
          'Revalidate the redirect inside the loop and avoid assuming entity enumeration or processing order is stable.'));
      }
    }
  }

  for (const record of records.maps) {
    if (mapPrefixes.length && record.name && !usesPrefix(record.name, mapPrefixes)) {
      issues.push(issue(record.line, record.start, record.name.length, 'information', 'map-prefix',
        `Map "${record.name}" does not use an allowed namespace (${mapPrefixes.join(', ')}).`,
        'Prefix owned maps to reduce collisions when injecting shared systems into other characters.'));
    }
  }
  for (const record of records.functions.filter((r) => r.declaration)) {
    // IkSys_* declarations are engine-owned common-state API, not extension-user symbols.
    if (functionPrefixes.length && !usesPrefix(record.name, functionPrefixes) && !record.name.startsWith('IkSys_')) {
      issues.push(issue(record.line, record.start, record.name.length, 'information', 'function-prefix',
        `Function "${record.name}" does not use an allowed namespace (${functionPrefixes.join(', ')}).`,
        'Prefix owned functions to avoid collisions across loaded ZSS modules.'));
    }
  }

  return { issues, records };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function topLevelArguments(source) {
  const text = String(source || ''), values = []; let start = 0, depth = 0, quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) { if (character === quote && text[index - 1] !== '\\') quote = ''; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) { values.push(text.slice(start, index).trim()); start = index + 1; }
  }
  const final = text.slice(start).trim(); if (final || values.length) values.push(final);
  return values;
}

function callRecords(line) {
  const records = [], pattern = /\bcall\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(/gi;
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    const open = match.index + match[0].lastIndexOf('('); let close = -1, depth = 1, quote = '';
    for (let index = open + 1; index < line.length; index += 1) {
      const character = line[index];
      if (quote) { if (character === quote && line[index - 1] !== '\\') quote = ''; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '(' || character === '[' || character === '{') depth += 1;
      else if (character === ')' || character === ']' || character === '}') { depth -= 1; if (depth === 0) { close = index; break; } }
    }
    if (close < 0) continue;
    const args = topLevelArguments(line.slice(open + 1, close));
    records.push({ name: match[1], start: match.index + match[0].indexOf(match[1]), arity: args.length, args });
    pattern.lastIndex = close + 1;
  }
  return records;
}

function balancedNamedCalls(source,names){
  const text=String(source||''),allowed=[...new Set((names||[]).map(String).filter(Boolean))];if(!allowed.length)return[];
  const escaped=allowed.map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).sort((a,b)=>b.length-a.length),pattern=new RegExp(`\\b(${escaped.join('|')})\\s*\\(`,'gi'),records=[];
  for(let match=pattern.exec(text);match;match=pattern.exec(text)){
    const open=match.index+match[0].lastIndexOf('(');let close=-1,depth=1;
    for(let index=open+1;index<text.length;index+=1){const character=text[index];if(character==='('||character==='['||character==='{')depth+=1;else if(character===')'||character===']'||character==='}'){depth-=1;if(depth===0){close=index;break;}}}
    if(close<0)continue;records.push({name:match[1],start:match.index,open,close,argument:text.slice(open+1,close).trim()});pattern.lastIndex=close+1;
  }
  return records;
}

function runtimeStringTriggerObservation(line, name, start) {
  const source = String(line || ''), trigger = String(name || '').toLowerCase(), afterName = source.slice(start + String(name || '').length);
  const simple = new Set(['hitdefattr', 'movetype', 'p2movetype', 'physics', 'prevmovetype', 'prevstatetype', 'reversaldefattr', 'statetype', 'p2statetype', 'teammode']);
  if (simple.has(trigger)) return /^\s*(?::|!?=|==)/.test(afterName) ? null : { valueKind: 'string', valueSummary: 'runtime string from bare flag trigger' };
  if (!['gethitvar', 'hitdefvar'].includes(trigger)) return null;
  const call = /^\s*\(\s*(attr|guardflag|hitflag)\s*\)/i.exec(afterName);
  if (!call) return null;
  const parameter = call[1].toLowerCase();
  if ((trigger === 'gethitvar' && parameter === 'hitflag') || (trigger === 'hitdefvar' && parameter === 'attr')) return null;
  const afterCall = afterName.slice(call[0].length);
  return /^\s*(?:!?=|==)/.test(afterCall) ? null : { valueKind: 'string', valueSummary: `runtime string from bare ${name}(${parameter})` };
}

function adjacentDocumentation(lines,line,{parameters=false,commentMarker='#'}={}){
  const marker=String(commentMarker||'#').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),comment=new RegExp(`^\\s*${marker}\\s?(.*)$`);
  const block=[];for(let index=line-1;index>=0&&block.length<16;index-=1){const match=comment.exec(lines[index]||'');if(!match)break;block.unshift(match[1].trim());}
  const parameterDocs={},purpose=[];for(const value of block){const parameter=parameters?/^@param\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:—|-)\s*(.*)$/i.exec(value):null;if(parameter)parameterDocs[parameter[1]]=parameter[2].slice(0,512);else if(value)purpose.push(value);}
  const documentation=purpose.join(' ').slice(0,2048);return {documentation,parameterDocs};
}

function adjacentFunctionDocumentation(lines,line){return adjacentDocumentation(lines,line,{parameters:true});}

function collectRecords(text, file = '') {
  const lines = text.split(/\r?\n/);
  const functionHeaders = require('./zss_function_syntax').parseFunctionHeaders(text), functionHeadersByLine = new Map(functionHeaders.filter(value => value.valid).map(value => [value.line, value]));
  const dynamicMapKeysByLine = new Map();for(const value of require('./nightly_string_assistance').dynamicMapKeySites(text)){if(!dynamicMapKeysByLine.has(value.line))dynamicMapKeysByLine.set(value.line,[]);dynamicMapKeysByLine.get(value.line).push(value);}
  const records = { maps: [], variables: [], locals: [], redirects: [], controllers: [], triggers: [], constants: [], commands: [], functions: [], calls: [], states: [], stateReferences: [], resources: [], functionSyntaxErrors: functionHeaders.flatMap(value => value.errors || []) };
  const add = (bucket, name, line, start, extra = {}) => records[bucket].push({ name, line, start, file, ...extra });
  let owner = null, section = '', sectionLine=-1,scopeParameters=new Set(),scopeLocals=new Set();
  const legacy=/\.(?:cns|cmd|st)$/i.test(file),ini=/\.def$/i.test(file);
  const stringOperandsByLine=new Map();if(!legacy&&!ini)for(const source of [runtimeStringControllerOperands(lines),expandedStringTriggerOperands(lines)])for(const [line,values] of source)stringOperandsByLine.set(line,[...(stringOperandsByLine.get(line)||[]),...values]);
  const ownerByLine = [];

  lines.forEach((raw, lineNumber) => {
    const line = legacy||ini?withoutLegacyComment(raw):withoutComment(raw);
    const commandOperands = legacy ? [] : dynamicCommandOperands(raw);
    const stringOperands = stringOperandsByLine.get(lineNumber) || [];
    const sectionHeader=/^\s*\[\s*([^\];]+)/.exec(line);if(sectionHeader){section=sectionHeader[1].trim().split(/\s+/)[0].toLowerCase();sectionLine=lineNumber;}
    let match;
    const mapPattern = /\bmap\s*\(\s*([A-Za-z_](?:[A-Za-z0-9_.]*[A-Za-z0-9_])?)\s*\)/gi;
    while ((match = mapPattern.exec(line))) {
      const rest = line.slice(match.index + match[0].length);
      const mutation=/^\s*(:=|\+=)\s*([^;{}]+)/.exec(rest),comparison=/^\s*(?:!?=|==)\s*([^;{}]+)/.exec(rest),observed=String(mutation?.[2]||comparison?.[1]||'').trim();
      const commandOperand=commandOperands.find(value=>value.kind==='map'&&value.name.toLowerCase()===match[1].toLowerCase()&&match.index>=value.start&&match.index<value.start+value.length);
      const stringOperand=stringOperands.find(value=>value.kind==='map'&&value.name.toLowerCase()===match[1].toLowerCase()&&match.index>=value.start&&match.index<value.start+value.length);
      const docs=mutation?adjacentDocumentation(lines,lineNumber,{commentMarker:legacy?';':'#'}):{documentation:''};
      add('maps', match[1], lineNumber, match.index + match[0].indexOf(match[1]), {
        // In ZSS, := mutates a map. A single = is comparison and therefore a read.
        access: mutation?.[1] === '+=' ? 'add' : mutation ? 'write' : 'read',
        observedValue:mutation?observed:'',
        valueKind:observed?classifyRuntimeValue(observed).kind:'unknown',
        valueSummary:observed?summarizeRuntimeValue(observed):'',
        documentation:docs.documentation,
        runtimeOwner:runtimeOwnerBefore(line,match.index),metadata:{...(commandOperand?{usage:'dynamic command name','command trigger':commandOperand.trigger,commandVisibilityCapabilityId:'command.nightly-expressions'}:{}),...(stringOperand?.metadata||{})},...(owner||{})
      });
    }
    for(const dynamic of dynamicMapKeysByLine.get(lineNumber)||[])add('maps',`<dynamic key at ${lineNumber+1}:${dynamic.start+1}>`,lineNumber,dynamic.start,{access:dynamic.access,literal:false,valueKind:'unknown',valueSummary:'',metadata:{kind:'dynamic map key','key evidence':dynamic.summary,capabilityId:'zss.dynamic-map-keys'},runtimeOwner:runtimeOwnerBefore(line,dynamic.start),...(owner||{})});
    if (ini && section === 'map' && !/^\s*\[/.test(line)) {
      const initial = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (initial) {
        const observed = String(initial[2] || '').trim();
        add('maps', initial[1], lineNumber, line.indexOf(initial[1]), {
          access: 'write', declaration: true, runtimeOwner: 'self',
          metadata: { source: 'character DEF [Map] default', kind: 'initial value', capabilityId: 'def.auto-typed-maps' },
          observedValue: observed, valueKind: observed ? classifyRuntimeValue(observed).kind : 'unknown', valueSummary: observed ? summarizeRuntimeValue(observed) : ''
        });
      }
    }
    const variablePattern = /\b(sysvar|fvar|var)\s*\(\s*([^)]*?)\s*\)/gi;
    while ((match = variablePattern.exec(line))) {
      const rest = line.slice(match.index + match[0].length);
      add('variables', `${match[1].toLowerCase()}(${match[2].trim()})`, lineNumber, match.index, {
        kind: match[1].toLowerCase(), index: match[2].trim(), access: /^\s*(?::=|=)/.test(rest) ? 'write' : 'read',runtimeOwner:runtimeOwnerBefore(line,match.index),...(owner||{})
      });
    }
    const redirectPattern=/(?:^|[^A-Za-z0-9_])((?:root|parent|partner|p2|stateOwner|enemy(?:Near)?(?:\s*\((?:[^()]|\([^()]*\))*\))?|target(?:\s*\((?:[^()]|\([^()]*\))*\))?|helper(?:\s*\((?:[^()]|\([^()]*\))*\))?|player(?:ID)?\s*\((?:[^()]|\([^()]*\))*\)))\s*,/gi;
    while((match=redirectPattern.exec(line))){const name=match[1].replace(/\s+/g,''),start=match.index+match[0].indexOf(match[1]);add('redirects',name,lineNumber,start,{access:'read',runtimeOwner:name,...(owner||{})});}
    if(!legacy&&owner){const controller=/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(line);if(controller&&!/^(?:if|else|for|while|switch)$/i.test(controller[1])){const contract=controllerContract(controller[1]);add('controllers',contract.name,lineNumber,line.indexOf(controller[1]),{access:'use',signature:contract.signature,documentation:contract.documentation,catalogMatch:contract.catalogMatch,metadata:contract.metadata,...(owner||{})});}}
    const expressionCode=withoutStrings(line),triggerPattern=/\b[A-Za-z_][A-Za-z0-9_]*\b/g;while((match=triggerPattern.exec(expressionCode))){const token=match[0],afterToken=expressionCode.slice(match.index+token.length);if(/^(?:map|var|fvar|sysvar|const)$/i.test(token)&&/^\s*\(/.test(afterToken))continue;const catalog=TRIGGER_BY_NAME.get(token.toLowerCase());if(catalog){const runtimeString=runtimeStringTriggerObservation(expressionCode,token,match.index)||{};add('triggers',catalog.name||token,lineNumber,match.index,{access:'read',signature:catalog.signature||catalog.name||token,returnType:catalog.returnType||'',documentation:catalog.description||'',metadata:{status:catalog.status||'documented',source:catalog.source||'bundled trigger catalog',visibilityCapabilityId:catalog.capabilityId||''},...runtimeString,...(owner||{})});}}
    if(section==='constants'&&!/^\s*\[/.test(line)){
      const constant=/^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/.exec(line);
      if(constant){const docs=adjacentDocumentation(lines,lineNumber,{commentMarker:legacy?';':'#'});add('constants',constant[1],lineNumber,line.indexOf(constant[1]),{access:'write',declaration:true,observedValue:constant[2],valueKind:classifyRuntimeValue(constant[2]).kind,valueSummary:summarizeRuntimeValue(constant[2]),documentation:docs.documentation});}
    }
    if(section==='command'&&!/^\s*\[/.test(line)){
      const command=/^\s*name\s*=\s*"([^"\r\n]+)"\s*$/i.exec(line);
      if(command){const metadata={},direct=adjacentDocumentation(lines,lineNumber,{commentMarker:legacy?';':'#'}),header=adjacentDocumentation(lines,sectionLine,{commentMarker:legacy?';':'#'}),documentation=direct.documentation||header.documentation,labels={command:'sequence',time:'time',steptime:'step time','command.autogreater':'auto-greater','buffer.time':'buffer time','buffer.hitpause':'buffer during hitpause','buffer.pauseend':'buffer through pause end','buffer.shared':'shared buffer'};for(let scan=lineNumber+1;scan<lines.length;scan+=1){const next=legacy?withoutLegacyComment(lines[scan]):withoutComment(lines[scan]);if(/^\s*\[/.test(next))break;const field=/^\s*(command|time|steptime|command\.autogreater|buffer\.(?:time|hitpause|pauseend|shared))\s*=\s*(.*?)\s*$/i.exec(next);if(field)metadata[labels[field[1].toLowerCase()]]=boundedObservation(field[2]);}add('commands',command[1],lineNumber,line.indexOf(command[1]),{access:'write',declaration:true,metadata,documentation});}
    }
    const func = functionHeadersByLine.get(lineNumber);
    if (func) {
      const params = func.params, parameterNames = func.params;
      const docs=adjacentFunctionDocumentation(lines,lineNumber);
      add('functions', func.name, lineNumber, func.start, { declaration: true, signature: func.signature, displaySignature: func.displaySignature, sourceSignature: func.sourceSignature, params, returns: func.returnNames, arity: params.length, documentation:docs.documentation,parameterDocs:docs.parameterDocs });
      owner = { ownerKind: 'function', ownerName: func.name, ownerLine: lineNumber };
      scopeParameters=new Set(parameterNames);scopeLocals=new Set();
      for(const parameter of func.parameters)add('locals',parameter.name,parameter.line,parameter.character,{access:'write',declaration:true,localKind:'parameter',identity:`function:${func.name}:${lineNumber}:${parameter.name}`,metadata:{scope:`Function ${func.name}`,kind:'parameter'},documentation:docs.parameterDocs[parameter.name]||'',observedValue:'',valueKind:'unknown',valueSummary:'',...owner});
    }
    const state = /^\s*\[\s*StateDef\s+([^;\]]+)/i.exec(line);
    if (state) {
      const name = state[1].trim();
      const docs=adjacentDocumentation(lines,lineNumber,{commentMarker:legacy?';':'#'});
      add('states', name, lineNumber, line.indexOf(state[1]), { kind: 'state',documentation:docs.documentation });
      owner = { ownerKind: 'state', ownerName: name, ownerLine: lineNumber };
      scopeParameters=new Set();scopeLocals=new Set();
    } else if (!func && /^\s*\[\s*[^\]]+\]/.test(line) && !(legacy&&/^\s*\[\s*State(?:\s|,)/i.test(line))){owner = null;scopeParameters=new Set();scopeLocals=new Set();}
    if(!legacy&&owner&&['function','state'].includes(owner.ownerKind)){
      const scopeLabel=owner.ownerKind==='function'?`Function ${owner.ownerName}`:`StateDef ${owner.ownerName}`;
      const declared=/^\s*let\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::=|=)\s*([^;{}]*)/i.exec(line);
      if(declared){const observed=String(declared[2]||'').trim();scopeLocals.add(declared[1]);const docs=adjacentDocumentation(lines,lineNumber);add('locals',declared[1],lineNumber,line.indexOf(declared[1]),{access:'write',declaration:true,localKind:'local',identity:`${owner.ownerKind}:${owner.ownerName}:${owner.ownerLine}:${declared[1]}`,metadata:{scope:scopeLabel,kind:'local'},documentation:docs.documentation,observedValue:observed,valueKind:observed?classifyRuntimeValue(observed).kind:'unknown',valueSummary:observed?summarizeRuntimeValue(observed):'',...owner});}
      const localPattern=/\$([A-Za-z_][A-Za-z0-9_]*)/g;let localMatch;
      while((localMatch=localPattern.exec(line))){const name=localMatch[1],kind=scopeParameters.has(name)?'parameter':'local',rest=line.slice(localMatch.index+localMatch[0].length),write=/^\s*(?::=|=)\s*([^;{}]*)/.exec(rest),access=write?'write':'read',observed=String(write?.[1]||'').trim(),commandOperand=commandOperands.find(value=>value.kind==='local'&&value.name===name&&localMatch.index===value.start),stringOperand=stringOperands.find(value=>value.kind==='local'&&value.name===name&&localMatch.index>=value.start&&localMatch.index<value.start+value.length);add('locals',name,lineNumber,localMatch.index,{access,declaration:false,localKind:kind,sigil:'$',identity:`${owner.ownerKind}:${owner.ownerName}:${owner.ownerLine}:${name}`,metadata:{scope:scopeLabel,kind,declared:String(scopeParameters.has(name)||scopeLocals.has(name)),...(commandOperand?{usage:'dynamic command name','command trigger':commandOperand.trigger,commandVisibilityCapabilityId:'command.nightly-expressions'}:{}),...(stringOperand?.metadata||{})},observedValue:observed,valueKind:observed?classifyRuntimeValue(observed).kind:'unknown',valueSummary:observed?summarizeRuntimeValue(observed):'',...owner});}
    }
    ownerByLine[lineNumber] = owner ? { ...owner } : null;
    for (const call of callRecords(line)) add('calls', call.name, lineNumber, call.start, { arity: call.arity, args: call.args, argumentKinds:classifyArguments(call.args), argumentSummaries:summarizeArguments(call.args), ...(owner || {}) });
  });
  const uncommentedLines=lines.map(line=>legacy?withoutLegacyComment(line):withoutComment(line)),uncommented=uncommentedLines.join('\n'),resourceStructure=uncommentedLines.map(withoutStrings).join('\n');
  const addResourceMatches=(kind,controller,field,role,access)=>{
    const expression=new RegExp(`\\b${controller}\\s*\\{([^}]*)\\}`,'gi'),wanted=new RegExp(`\\b${field}\\s*:\\s*([^;}\\r\\n]+)`,'i');let match;
    while((match=expression.exec(resourceStructure))){const found=wanted.exec(match[1]),controllerBefore=resourceStructure.slice(0,match.index),controllerLine=(controllerBefore.match(/\n/g)||[]).length,controllerStart=match.index-(controllerBefore.lastIndexOf('\n')+1);if(!found){if(role==='creation')add('resources',`${kind} (id omitted)`,controllerLine,controllerStart,{kind,id:'(id omitted)',role,access,literal:false,runtimeOwner:runtimeOwnerBefore(uncommentedLines[controllerLine],controllerStart),metadata:{'id status':'omitted / unresolved'},...(ownerByLine[controllerLine]||{})});continue;}const raw=found[1],id=raw.trim(),bodyOffset=match.index+match[0].indexOf(match[1]),offset=bodyOffset+found.index+found[0].lastIndexOf(raw)+(raw.length-raw.trimStart().length),before=resourceStructure.slice(0,offset),line=(before.match(/\n/g)||[]).length,start=offset-(before.lastIndexOf('\n')+1),metadata={};
      if(role==='creation'){const fields=kind==='helper'?[['stateNo','state']]:kind==='explod'?[['removeTime','remove time'],['bindTime','bind time'],['removeOnGetHit','remove on get hit']]:kind==='projectile'?[['projRemoveTime','remove time'],['projHits','hit count'],['projMissTime','miss time']]:[];for(const [name,label] of fields){const value=new RegExp(`\\b${name}\\s*:\\s*([^;}\\r\\n]+)`,'i').exec(match[1]);if(value)metadata[label]=boundedObservation(value[1]);}}
      add('resources',`${kind} ${id}`,line,start,{kind,id,role,access,literal:/^-?\d+$/.test(id),runtimeOwner:runtimeOwnerBefore(uncommentedLines[controllerLine],controllerStart),metadata,...(ownerByLine[line]||{})});}
  };
  addResourceMatches('helper','helper','id','creation','create');
  addResourceMatches('explod','explod','id','creation','create');
  addResourceMatches('projectile','projectile','projID','creation','create');
  addResourceMatches('explod','modifyExplod','id','mutation','write');
  addResourceMatches('explod','explodBindTime','id','mutation','write');
  addResourceMatches('explod','removeExplod','id','cleanup','remove');
  if(legacy){
    const headers=[];for(let line=0;line<lines.length;line+=1){const header=/^\s*\[\s*([^\]\r\n]+)\]/.exec(withoutLegacyComment(lines[line]));if(header)headers.push({line,header:header[1]});}
    for(let index=0;index<headers.length;index+=1){const startLine=headers[index].line,endLine=headers[index+1]?.line??lines.length;if(!/^State(?:\s|,)/i.test(headers[index].header))continue;const fields=new Map();for(let line=startLine+1;line<endLine;line+=1){const parsed=/^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/.exec(withoutLegacyComment(lines[line]));if(parsed&&!fields.has(parsed[1].toLowerCase()))fields.set(parsed[1].toLowerCase(),{value:parsed[2],line,start:(lines[line]||'').indexOf(parsed[2])});}
      const type=String(fields.get('type')?.value||'').trim().toLowerCase(),spec=type==='helper'?{kind:'helper',id:'id',role:'creation',access:'create',metadata:[['stateno','state']]}:type==='explod'?{kind:'explod',id:'id',role:'creation',access:'create',metadata:[['removetime','remove time'],['bindtime','bind time'],['removeongethit','remove on get hit']]}:type==='modifyexplod'||type==='explodbindtime'?{kind:'explod',id:'id',role:'mutation',access:'write',metadata:[]}:type==='removeexplod'?{kind:'explod',id:'id',role:'cleanup',access:'remove',metadata:[]}:type==='projectile'?{kind:'projectile',id:'projid',role:'creation',access:'create',metadata:[['projremovetime','remove time'],['projhits','hit count'],['projmisstime','miss time']]}:null;
      const typeField=fields.get('type');if(typeField){const contract=controllerContract(typeField.value);add('controllers',contract.name,typeField.line,Math.max(0,typeField.start),{access:'use',signature:contract.signature,documentation:contract.documentation,catalogMatch:contract.catalogMatch,metadata:contract.metadata,...(ownerByLine[typeField.line]||{})});}
      if(!spec)continue;const identity=fields.get(spec.id),id=String(identity?.value||'').trim(),location=identity||typeField;if((!identity||!id)&&spec.role!=='creation')continue;const resourceId=identity&&id?id:'(id omitted)',metadata={};for(const [field,label] of spec.metadata){const observed=fields.get(field);if(observed)metadata[label]=boundedObservation(observed.value);}if(resourceId==='(id omitted)')metadata['id status']='omitted / unresolved';add('resources',`${spec.kind} ${resourceId}`,location.line,Math.max(0,location.start),{kind:spec.kind,id:resourceId,role:spec.role,access:spec.access,literal:/^-?\d+$/.test(resourceId),runtimeOwner:'self',metadata,...(ownerByLine[location.line]||{})});
    }
  }
  const addResourceCalls=(kind,names,role)=>{for(const call of balancedNamedCalls(resourceStructure,names)){const id=call.argument;if(!id)continue;const before=resourceStructure.slice(0,call.open+1),line=(before.match(/\n/g)||[]).length,start=call.open+1-(before.lastIndexOf('\n')+1),callStart=call.start-(resourceStructure.lastIndexOf('\n',call.start)+1);add('resources',`${kind} ${id}`,line,start,{kind,id,role,access:'read',literal:/^-?\d+$/.test(id),runtimeOwner:runtimeOwnerBefore(uncommentedLines[line],callStart),...(ownerByLine[line]||{})});}};
  addResourceCalls('helper',['numHelper','helper'],'reference');
  addResourceCalls('explod',['numExplod'],'reference');
  addResourceCalls('projectile',['numProjID','projContactTime','projGuardedTime','projHitTime','projCancelTime'],'reference');
  const constantReference=/\bconst\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)/gi;let constantMatch;
  while((constantMatch=constantReference.exec(uncommented))){const name=constantMatch[1],offset=constantMatch.index+constantMatch[0].indexOf(name),before=uncommented.slice(0,offset),line=(before.match(/\n/g)||[]).length,start=offset-(before.lastIndexOf('\n')+1);add('constants',name,line,start,{access:'read',declaration:false,...(ownerByLine[line]||{})});}
  const commandReference=/\bcommand\s*(?:!?=)\s*"([^"\r\n]+)"/gi;let commandMatch;
  while((commandMatch=commandReference.exec(uncommented))){const name=commandMatch[1],offset=commandMatch.index+commandMatch[0].indexOf(name),before=uncommented.slice(0,offset),line=(before.match(/\n/g)||[]).length,start=offset-(before.lastIndexOf('\n')+1);add('commands',name,line,start,{access:'read',declaration:false,...(ownerByLine[line]||{})});}
  const parsedStates=parseStateSource(text,file,legacy?'ikemen-cns':'zss');
  for(const reference of parsedStates.transfers)if(['changestate','selfstate'].includes(reference.kind)&&!reference.ambiguous&&!reference.dynamic&&Number.isInteger(reference.literal))add('stateReferences',String(reference.literal),reference.line,reference.character,{kind:'state',declaration:false,...(ownerByLine[reference.line]||{})});
  return records;
}

module.exports = { analyzeZss, analyzeCommandReferences, collectRecords, nightlyStringCompatibilityIssues, nightlyBareFlagIssues, nightlyStringMapAddIssues, nightlyCommandExpressionIssues, nightlyRedirectedCommandIssues, nightlyAudioSampleRateIssues, defMapCapabilityIssues, defMapValueIssues, typedConstantIssues, dynamicCommandOperands, runtimeStringControllerOperands, expandedStringTriggerOperands, controllerStringRequirement, withoutComment, withoutLegacyComment, topLevelArguments, callRecords, balancedNamedCalls, runtimeOwnerBefore, adjacentDocumentation, adjacentFunctionDocumentation, boundedObservation };
