'use strict';

function lineText(text) { return String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/); }
function label(value, fallback) { const text = String(value || '').trim(); return text || fallback; }
function node(kind, title, startLine, depth = 0, extra = {}) {
  return { kind, title, startLine, endLine: startLine, depth, children: [], ...extra };
}

const ZSS_DOCS = {
  state: { title: 'State definition', summary: 'A StateDef owns character behavior for one state number. Negative StateDefs are shared update or command-routing hooks.' },
  function: { title: 'ZSS function', summary: 'A reusable expression function. ZSS functions cannot recurse; keep inputs and returned meaning visible.' },
  condition: { title: 'Conditional branch', summary: 'Runs its nested controllers only while the condition is true. ignoreHitPause and persistent wrappers change evaluation timing.' },
  loop: { title: 'Loop', summary: 'Repeats nested code. Confirm that a counter changes or a break can be reached.' },
  controller: { title: 'State controller', summary: 'An engine action such as ChangeState, HitDef, MapSet, Helper, or Explod. Expand this card to review its owning block and source line.' },
  assignment: { title: 'Value assignment', summary: 'Updates a local variable, map, or other writable value. Map updates are rollback-safe when authored in deterministic ZSS gameplay code.' },
  block: { title: 'Code block', summary: 'A nested scope grouped by braces.' }
};

const LUA_DOCS = {
  function: { title: 'Lua function', summary: 'A reusable front-end function. Lua is appropriate for menus, screenpacks, file/profile selection, presentation, and pre-match setup.' },
  condition: { title: 'Lua conditional', summary: 'Selects a front-end path. If it runs during a match, verify that it never owns rollback-relevant gameplay state or input.' },
  loop: { title: 'Lua loop', summary: 'Repeats front-end work. Keep rendering and menu loops separate from authored fighter behavior.' },
  table: { title: 'Lua table', summary: 'Stores named or indexed data, commonly used for menu definitions, motif data, and configuration.' },
  require: { title: 'Module import', summary: 'Loads another Lua module. Prefer project modules and motif module hooks over editing IKEMEN default Lua files.' },
  callback: { title: 'Callback or assigned function', summary: 'A function attached to a table or variable, often used by menus and screenpack hooks.' },
  statement: { title: 'Lua statement', summary: 'Front-end script code. Treat any match-time input, physics, damage, state, or meter mutation as rollback-unsafe.' }
};

function docFor(language, kind) { return (language === 'lua' ? LUA_DOCS : ZSS_DOCS)[kind] || (language === 'lua' ? LUA_DOCS.statement : ZSS_DOCS.block); }

function closeTo(stack, depth, endLine) {
  while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
    stack.pop().endLine = Math.max(stack[stack.length]?.startLine || 0, endLine);
  }
}

function parseZssStructure(text) {
  const lines = lineText(text), root = node('root', 'File', 0, -1, { language: 'zss' }), stack = [root];
  let braceDepth = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index], code = raw.replace(/#.*/, '').trim();
    if (!code) continue;
    const leadingCloses = (code.match(/^\}+/) || [''])[0].length;
    if (leadingCloses) { braceDepth = Math.max(0, braceDepth - leadingCloses); closeTo(stack, braceDepth + 1, index - 1); }
    let item = null;
    const state = code.match(/^\[\s*StateDef\s+([^;\]]+)/i);
    const fn = code.match(/^\[\s*Function\s+([^;\]]+)/i);
    const conditional = code.match(/^(ignoreHitPause\s+)?(?:persistent\([^\)]*\)\s+)?(?:else\s+)?if\s+(.+?)\s*\{/i);
    const loop = code.match(/^(?:for|while)\b\s*(.*?)\s*\{/i);
    if (state) item = node('state', `State ${state[1].trim()}`, index, 0, { signature: state[1].trim() });
    else if (fn) item = node('function', label(fn[1], 'Function'), index, 0, { signature: fn[1].trim() });
    else if (conditional) item = node('condition', label(conditional[2], 'if'), index, braceDepth, { signature: code.replace(/\s*\{\s*$/, '') });
    else if (loop) item = node('loop', label(loop[1], code.split(/\s+/)[0]), index, braceDepth, { signature: code.replace(/\s*\{\s*$/, '') });
    else {
      const controller = code.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
      const assignment = code.match(/^(.+?)(?::=|(?<![<>=!])=(?!=))\s*(.+?);?$/);
      if (controller && !/^(if|else|for|while|switch)$/i.test(controller[1])) item = node('controller', controller[1], index, braceDepth, { signature: code.replace(/\s*\{.*$/, '') });
      else if (assignment) item = node('assignment', assignment[1].trim(), index, braceDepth, { signature: code.replace(/;\s*$/, '') });
    }
    if (item) {
      item.doc = docFor('zss', item.kind);
      if (item.kind === 'state' || item.kind === 'function') { while (stack.length > 1) stack.pop().endLine = index - 1; root.children.push(item); stack.push(item); braceDepth = 0; }
      else { while (stack.length > 1 && stack[stack.length - 1].depth >= item.depth + 1) stack.pop().endLine = index - 1; stack[stack.length - 1].children.push(item); if (code.includes('{')) stack.push(item); }
    }
    const opens = (code.match(/\{/g) || []).length, closes = Math.max(0, (code.match(/\}/g) || []).length - leadingCloses);
    braceDepth = Math.max(0, braceDepth + opens - closes);
    closeTo(stack, braceDepth + 1, index);
  }
  while (stack.length > 1) stack.pop().endLine = lines.length - 1;
  root.endLine = Math.max(0, lines.length - 1);
  return root;
}

function parseCnsStructure(text) {
  const lines = lineText(text), root = node('root', 'File', 0, -1, { language: 'cns' });
  const sections = [];
  for (let index = 0; index < lines.length; index += 1) {
    const header = /^\s*\[\s*([^\]]+)\s*\]/.exec(lines[index].replace(/;.*/, ''));
    if (header) sections.push({ index, header: header[1].trim() });
  }
  let currentState = null;
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex], endLine = (sections[sectionIndex + 1] ? sections[sectionIndex + 1].index : lines.length) - 1;
    const stateDef = /^statedef\s+(.+)$/i.exec(section.header);
    if (stateDef) {
      if (currentState) currentState.endLine = section.index - 1;
      currentState = node('state', `State ${stateDef[1].trim()}`, section.index, 0, { signature: stateDef[1].trim(), doc: docFor('zss', 'state') });
      currentState.endLine = endLine;
      root.children.push(currentState);
      for (let line = section.index + 1; line <= endLine; line += 1) {
        const assignment = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*(?:;.*)?$/.exec(lines[line]);
        if (!assignment) continue;
        currentState.children.push(node('assignment', assignment[1], line, 1, { signature: `${assignment[1]} = ${assignment[2]}`, doc: docFor('zss', 'assignment') }));
      }
      continue;
    }
    if (!/^state(?:\s|$)/i.test(section.header)) continue;
    const sectionLines = lines.slice(section.index + 1, endLine + 1);
    const typeLine = sectionLines.findIndex((value) => /^\s*type\s*=/i.test(value.replace(/;.*/, '')));
    const typeMatch = typeLine >= 0 && /^\s*type\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/i.exec(sectionLines[typeLine].replace(/;.*/, ''));
    const title = typeMatch ? typeMatch[1] : label(section.header.replace(/^state\s*/i, ''), 'State controller');
    const controller = node('controller', title, section.index, 1, { signature: `[${section.header}]`, doc: docFor('zss', 'controller') });
    controller.endLine = endLine;
    for (let line = section.index + 1; line <= endLine; line += 1) {
      const assignment = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*(?:;.*)?$/.exec(lines[line]);
      if (!assignment || assignment[1].toLowerCase() === 'type') continue;
      const isTrigger = /^trigger(?:all|\d+)$/i.test(assignment[1]);
      controller.children.push(node(isTrigger ? 'condition' : 'assignment', isTrigger ? assignment[2] : assignment[1], line, 2, {
        signature: `${assignment[1]} = ${assignment[2]}`,
        doc: docFor('zss', isTrigger ? 'condition' : 'assignment')
      }));
    }
    (currentState || root).children.push(controller);
    if (currentState) currentState.endLine = Math.max(currentState.endLine, endLine);
  }
  if (currentState) currentState.endLine = Math.max(currentState.endLine, lines.length - 1);
  root.endLine = Math.max(0, lines.length - 1);
  return root;
}

function luaRisk(text, filename = '') {
  const value = String(text || ''), file = String(filename || '').replace(/\\/g, '/').toLowerCase();
  const gameplay = /\b(assertinput|player\s*\(|getplayer|lifeset|power|damage|hitdef|changestate|velset|posset|mapset)\b/i.test(value);
  const frontEnd = /(?:screenpack|motif|menu|select|options?|external\/mods|external\/script)/.test(file) || /\b(motif|menu|screenpack|select|options?|main\.f_)\b/i.test(value);
  if (gameplay) return { level: 'unsafe', label: 'Rollback unsafe', summary: 'This looks like match-time gameplay or input ownership. Keep it in deterministic ZSS/native systems for online play.' };
  if (frontEnd) return { level: 'safe', label: 'Front-end / presentation', summary: 'Suitable for menus, screenpacks, presentation, profiles, and pre-match setup when it does not own match-time gameplay.' };
  return { level: 'review', label: 'Review timing', summary: 'Lua is not rollback-tracked. Confirm this runs outside rollback-sensitive match simulation.' };
}

function stripLuaComment(line) { return line.replace(/--.*$/, '').trim(); }
function parseLuaStructure(text, filename = '') {
  const lines = lineText(text), root = node('root', 'File', 0, -1, { language: 'lua', risk: luaRisk(text, filename) }), stack = [{ node: root, close: 'root' }];
  const add = (item, close = '') => { item.doc = docFor('lua', item.kind); item.risk = luaRisk(item.signature || item.title, filename); stack[stack.length - 1].node.children.push(item); if (close) stack.push({ node: item, close }); };
  for (let index = 0; index < lines.length; index += 1) {
    const code = stripLuaComment(lines[index]); if (!code) continue;
    if (/^end\b/.test(code) || /^until\b/.test(code)) { if (stack.length > 1) stack.pop().node.endLine = index; continue; }
    if (/^(elseif|else)\b/.test(code)) { if (stack.length > 1 && stack[stack.length - 1].node.kind === 'condition') stack.pop().node.endLine = index - 1; }
    let match;
    if ((match = code.match(/^(?:local\s+)?function\s+([\w.:]+)\s*\(([^)]*)\)/))) add(node('function', match[1], index, stack.length - 1, { signature: code }), 'end');
    else if ((match = code.match(/^([\w.\[\]'\"]+)\s*=\s*function\s*\(([^)]*)\)/))) add(node('callback', match[1], index, stack.length - 1, { signature: code }), 'end');
    else if ((match = code.match(/^(?:elseif|if)\s+(.+?)\s+then\b/))) add(node('condition', label(match[1], 'if'), index, stack.length - 1, { signature: code }), 'end');
    else if ((match = code.match(/^(?:for|while)\s+(.+?)\s+do\b/))) add(node('loop', label(match[1], 'loop'), index, stack.length - 1, { signature: code }), 'end');
    else if (/^repeat\b/.test(code)) add(node('loop', 'repeat … until', index, stack.length - 1, { signature: code }), 'until');
    else if ((match = code.match(/^(?:local\s+)?([A-Za-z_][\w.]*)\s*=\s*\{/))) add(node('table', match[1], index, stack.length - 1, { signature: code }), '}');
    else if ((match = code.match(/^local\s+([A-Za-z_]\w*)\s*=\s*require\s*\(?["']([^"']+)/))) add(node('require', `${match[1]} ← ${match[2]}`, index, stack.length - 1, { signature: code }));
    const closeBraces = (code.match(/\}/g) || []).length;
    for (let i = 0; i < closeBraces && stack.length > 1 && stack[stack.length - 1].close === '}'; i += 1) stack.pop().node.endLine = index;
  }
  while (stack.length > 1) stack.pop().node.endLine = lines.length - 1;
  root.endLine = Math.max(0, lines.length - 1);
  return root;
}

// Resolve a blank insertion line using declaration ranges and lexical brace ownership.
// Quoted braces and comments never open or close a controller block.
function zssInsertionContext(text, line) {
  const lines = lineText(text);
  const owner = require('./parser').parseZss(text).find(item => line > item.declarationEndLine && line <= item.endLine);
  if (!owner) return { valid: false, label: 'Outside a state or function body', issue: 'Place the cursor after the intended StateDef or Function declaration.' };
  const title = `${owner.type} ${owner.signature} at line ${owner.startLine + 1}`;
  if ((lines[line] || '').trim()) return { valid: false, label: title, issue: 'Place the cursor on a blank line between controllers.' };
  const following = lines.slice(line + 1, owner.endLine + 1).map(value => value.replace(/#.*/, '').trim()).find(Boolean) || '';
  if (/^else\b/i.test(following)) return { valid: false, label: title, issue: 'This line separates an if block from its else branch. Choose a line inside the branch or after the complete if/else chain.' };
  const stack = [];
  let pending = '', quote = '', escaped = false, malformed = false;
  for (let row = owner.declarationEndLine + 1; row < line; row++) {
    for (const ch of lines[row]) {
      if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
      if (ch === '#') break;
      if (ch === '"' || ch === "'") { quote = ch; pending += ' value '; continue; }
      if (ch === '{') {
        const prefix = pending.trim();
        const controls = /^(?:(?:ignorehitpause|persistent\s*\([^)]*\))\s+)*(?:if\b|else\b|while\b|for\b|switch\b)/i.test(prefix) || /^(?:ignorehitpause|persistent\s*\([^)]*\))$/i.test(prefix);
        stack.push({ valid: controls && stack.every(block => block.valid && (!block.switch || block.hasCase)), switch: /^(?:(?:ignorehitpause|persistent\s*\([^)]*\))\s+)*switch\b/i.test(prefix), hasCase: false, label: prefix || 'Unrecognized block' });
        pending = '';
      } else if (ch === '}') { if (!stack.length) malformed = true; else stack.pop(); pending = ''; }
      else if (ch === ':' && stack.at(-1)?.switch && /^(?:case\b.+|default)\s*$/i.test(pending.trim())) { stack.at(-1).hasCase = true; pending = ''; }
      else if (ch === ';') pending = '';
      else pending += ch;
    }
    pending += ' ';
  }
  const block = stack.at(-1);
  if (malformed || quote || pending.trim()) return { valid: false, label: block?.label || title, issue: 'The cursor is inside an unfinished statement or an unbalanced block. Choose a complete controller boundary.' };
  if (block && (!block.valid || (block.switch && !block.hasCase))) return { valid: false, label: block.label, issue: 'The cursor is inside controller parameters or outside a supported controller list. Place it between controllers in a state, function, conditional, loop, or switch case.' };
  return { valid: true, label: block ? `${title} → ${block.label}` : title, issue: '' };
}

function flatten(root) { const output = []; const visit = (value) => { for (const child of value.children || []) { output.push(child); visit(child); } }; visit(root); return output; }
function parseCodeStructure(text, language, filename = '') {
  if (language === 'lua' || /\.lua$/i.test(filename)) return parseLuaStructure(text, filename);
  if (language === 'cns' || /\.cns$/i.test(filename)) return parseCnsStructure(text);
  return parseZssStructure(text);
}

module.exports = { parseCodeStructure, parseZssStructure, parseCnsStructure, parseLuaStructure, luaRisk, flatten, docFor, zssInsertionContext };
