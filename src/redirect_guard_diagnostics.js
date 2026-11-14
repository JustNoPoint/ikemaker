'use strict';

const {maskedLine} = require('./basic_syntax_diagnostics');
const selector = String.raw`(?:-?\d+|var\s*\(\s*\d+\s*\)|\$[\w]+)`;
const redirectPattern = new RegExp(String.raw`\b(helperindex|helper|enemynear|enemy|target|partner|playerid|playerindex|player|parent|root)\s*(?:\(\s*(${selector})(?:\s*,\s*(\d+))?\s*\))?\s*,`, 'gi');
const queryPattern = new RegExp(String.raw`\b(explodvar|projvar)\s*\(\s*(${selector})\s*,\s*(\d+)\s*,\s*[\w.]+(?:\s+[xyz])?\s*\)`, 'gi');
const existence = {playerid:'PlayerIDExist', player:'PlayerNoExist', playerindex:'PlayerIndexExist', helperindex:'HelperIndexExist'};
const counts = {helper:'NumHelper', target:'NumTarget', explodvar:'NumExplod', projvar:'NumProjID'};
const compact = value => value.toLowerCase().replace(/\s+/g, '');

function requirement(name, id, idx) {
  if (name === 'root' || name === 'parent') return {key:name === 'root' ? 'IsHelper' : 'ParentExist', min:1};
  if (existence[name]) return id && {key:existence[name] + '(' + id + ')', min:1};
  if (counts[name]) {
    let key = counts[name];
    if (name === 'projvar' && Number(id) < 0) key = 'NumProj';
    else if (name === 'projvar' && !/^\d+$/.test(id)) return null;
    else if (id !== undefined && !(name === 'helper' && Number(id) <= 0) &&
             !(name === 'target' && Number(id) < 0) && !(name === 'explodvar' && id === '-1')) key += '(' + id + ')';
    return {key, min:Number(idx || 0) + 1};
  }
  if (id && !/^\d+$/.test(id)) return null;
  return {key:name === 'partner' ? 'NumPartner' : 'NumEnemy', min:Number(id || 0) + 1};
}

function proves(expression, {key, min}) {
  // Split only at the outer level. Negated or nested disjunctions cannot establish a guard by accident.
  function proof(source, nesting) {
    if (!source || nesting > 24) return false;
    let depth = 0, start = 0, outer = source.startsWith('(');
    const and = [], or = [];
    for (let i=0;i<source.length;i++) {
      const ch = source[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth < 0) return false;
      if (depth) continue;
      if (i < source.length-1) outer = false;
      const op = source.slice(i,i+2);
      if (op === '||') {or.push(source.slice(start,i)); start=i+2; i++;}
      if (op === '&&') and.push(i++);
    }
    if (depth) return false;
    if (outer) return proof(source.slice(1,-1),nesting+1);
    if (or.length) return [...or,source.slice(start)].every(branch=>proof(branch,nesting+1));
    if (and.length) {
      let from=0;
      for (const end of [...and,source.length]) {
        if (proof(source.slice(from,end),nesting+1)) return true;
        from=end+2;
      }
      return false;
    }
    // A specific positive count also proves that at least that many entities exist overall.
    const any = /^(numhelper|numtarget|numexplod|numproj|ishelper)$/.exec(compact(key));
    let name = compact(key);
    if (any) {
      const specific = /^(numhelper|numtarget|numexplod|numprojid|ishelper)\((?:-?\d+|var\(\d+\))\)/.exec(source);
      if (specific && specific[1].replace('numprojid','numproj') === name) name = specific[0];
    }
    if (source === name) return min === 1;
    const reverse = /^(-?\d+)(<=|<|==|=|!=)([a-z].*)$/.exec(source);
    if (reverse) return proof(reverse[3] + ({'<':'>', '<=':'>='}[reverse[2]] || reverse[2]) + reverse[1],nesting+1);
    const op = /^(.*?)(>=|>|!=|==|=)(-?\d+)$/.exec(source);
    if (!op || op[1] !== name) return false;
    const value = Number(op[3]);
    if (op[2] === '>') return value + 1 >= min;
    if (op[2] === '!=') return value === 0 && min === 1;
    return value >= min;
  }
  return proof(compact(expression),0);
}

function falseProves(source, guard) {
  const expr = compact(source);
  if (/^![a-z][\w]*(?:\((?:-?\d+|var\(\d+\))\))?$/.test(expr)) return proves(expr.slice(1),guard);
  const m = /^(.*?)(<=|<|==|=)(-?\d+)$/.exec(expr);
  if (!m) return false;
  if (m[2] === '<=' || m[2] === '<') return proves(m[1] + (m[2] === '<=' ? '>' : '>=') + m[3],guard);
  return m[3] === '0' && proves(m[1],guard);
}

function guardedBranch(prefix, guard) {
  // Cond evaluates only its chosen branch. Ignore commas inside nested expressions.
  for (const match of prefix.matchAll(/\bcond\s*\(/gi)) {
    const start = match.index + match[0].length, commas = [];
    let depth = 0, ended = false;
    for (let i=start;i<prefix.length;i++) {
      if (prefix[i] === '(') depth++;
      else if (prefix[i] === ')' && --depth < 0) { ended = true; break; }
      else if (prefix[i] === ',' && depth === 0) commas.push(i);
    }
    if (ended || !commas.length) continue;
    const condition = prefix.slice(start,commas[0]);
    if (commas.length === 1 && proves(condition,guard)) return true;
    if (commas.length === 2 && falseProves(condition,guard)) return true;
  }
  return false;
}

function nameForIkemenOnly(condition) {
  return /^(?:ParentExist|PlayerNoExist|PlayerIndexExist|HelperIndexExist)/i.test(condition);
}

function accesses(expr) {
  const hits = [...expr.matchAll(redirectPattern), ...expr.matchAll(queryPattern)].sort((a,b)=>a.index-b.index);
  return hits.filter(hit => {
    // A redirected owner needs its own count. Never insert the caller's count for that owner.
    const prefix = expr.slice(0, hit.index).split(/&&|\|\||[{};]/).pop();
    return !/\b(?:helper|enemynear|enemy|partner|target|playerid|player|playerindex|helperindex|root|parent|p2|stateowner)\s*(?:\([^;{}]*?\))?\s*,[^&|;{}]*$/i.test(prefix);
  });
}

function redirectProblems(text, languageId) {
  const cns = languageId === 'ikemen-cns', lines = text.split(/\r?\n/);
  const code = lines.map(line => maskedLine(line, languageId).text);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const results = [];
  function inspect(line, offset, expr, protectedBy, makeFix) {
    for (const hit of accesses(expr)) {
      const name = hit[1].toLowerCase(), guard = requirement(name, hit[2], hit[3]);
      if (!guard || protectedBy(guard) || guardedBranch(expr.slice(0,hit.index),guard)) continue;
      const prefix = expr.slice(0,hit.index);
      if (cns && /&&\s*\(*\s*$/.test(prefix) && !prefix.includes('||') &&
          proves(prefix.replace(/&&\s*\(*\s*$/, ''), guard)) continue;
      if (cns && /\|\|\s*\(*\s*$/.test(prefix) && falseProves(prefix.replace(/\|\|\s*\(*\s*$/, ''),guard)) continue;
      const condition = guard.key + (guard.min > 1 ? ' > ' + (guard.min - 1) : '');
      const fix = makeFix(condition, hit);
      const diagnostic = {line, start:offset + hit.index, length:hit[1].length, severity:'warning', code:'redirect-guard',
        message:hit[1] + ' lookup may run while the entity is absent and repeat a debug warning. Check ' + condition + ' before evaluating it.'};
      results.push({diagnostic, fixes:fix ? [fix] : []});
    }
  }
  function inspectController(name, anchor, fields, protectedBy, fixFor) {
    const param = key => fields.find(f=>f.key === key);
    const redirect = param('redirectid');
    let guard, location = anchor;
    if (redirect) {
      const id = redirect.expr.trim();
      if (!new RegExp('^' + selector + '$','i').test(id)) return;
      guard = requirement('playerid',id);
      location = {line:redirect.line,start:redirect.offset,length:id.length};
    } else {
      const kind = {modifyexplod:'explodvar', modifyprojectile:'projvar'}[name.toLowerCase()];
      if (!kind) return;
      const id = param('id')?.expr.trim() ?? '-1', idx = param('index')?.expr.trim() ?? '-1';
      if (!new RegExp('^' + selector + '$','i').test(id) || !/^-?\d+$/.test(idx)) return;
      guard = requirement(kind,id,String(Math.max(0,Number(idx))));
    }
    if (!guard || protectedBy(guard)) return;
    const condition = guard.key + (guard.min > 1 ? ' > ' + (guard.min-1) : '');
    results.push({diagnostic:{...location,code:'redirect-guard',severity:'warning',
      message:name + ' can run with a missing ' + (redirect ? 'RedirectID' : 'effect') + '. Check ' + condition + ' before running the controller.'},
      fixes:[fixFor(condition)]});
  }
  if (cns) {
    let fields = [];
    function finish() {
      const shared = fields.filter(f=>f.group === 'all');
      const groups = new Map();
      for (const field of fields) if (field.group && field.group !== 'all') {
        if (!groups.has(field.group)) groups.set(field.group, []);
        groups.get(field.group).push(field);
      }
      for (const f of fields) {
        if (!/[,()]/.test(f.expr)) continue;
        const protectedBy = guard => {
          if (shared.some(other => (f.group !== 'all' || other.line < f.line) && proves(other.expr,guard))) return true;
          if (!f.group) return groups.size > 0 && [...groups.values()].every(rows=>rows.some(r=>proves(r.expr,guard)));
          return (groups.get(f.group)||[]).some(r=>r.line < f.line && proves(r.expr,guard));
        };
        inspect(f.line, f.offset, f.expr, protectedBy, condition => {
          const key = f.group ? 'trigger' + f.group : 'triggerall';
          const indent = lines[f.line].match(/^\s*/)[0];
          return {title:'Require ' + condition + ' for ' + (f.group ? key : 'this controller') + (nameForIkemenOnly(condition) ? ' (IKEMEN)' : ''), changes:[{line:f.line,start:0,length:0,text:indent + key + ' = ' + condition + eol}]};
        });
      }
      const type = fields.find(f=>f.key === 'type');
      if (type) inspectController(type.expr.trim(),{line:type.line,start:type.offset,length:type.expr.trim().length}, fields, guard =>
        shared.some(f=>proves(f.expr,guard)) || groups.size > 0 && [...groups.values()].every(rows=>rows.some(f=>proves(f.expr,guard))),
        condition=>({title:'Require ' + condition + ' before the controller runs',changes:[{line:type.line,start:0,length:0,
          text:lines[type.line].match(/^\s*/)[0] + 'triggerall = ' + condition + eol}]}));
      fields = [];
    }
    let state = false;
    for (let line=0;line<code.length;line++) {
      if (/^\s*\[/.test(code[line])) { finish(); state = /^\s*\[\s*State(?:\s|,|\])/i.test(code[line]); continue; }
      if (!state) continue;
      const field = /^\s*([\w.]+(?:\([^)]*\))?)\s*=\s*/.exec(code[line]);
      if (field) fields.push({line,key:field[1].toLowerCase(),group:/^trigger(all|\d+)$/i.exec(field[1])?.[1].toLowerCase(),offset:field[0].length,expr:code[line].slice(field[0].length)});
    }
    finish();
  } else {
    const stack = [];
    let pending = '';
    for (let line=0;line<code.length;line++) {
      if (/^\s*\[/.test(code[line])) {stack.length=0; pending='';continue;}
      for (const match of code[line].matchAll(/([^{};]*)([{};]|$)/g)) {
        const [,part,end] = match;
        const head = /^\s*(?:else\s+)?(?:if|while)\s+/i.exec(part);
        const expr = head ? part.slice(head[0].length) : part;
        const offset = match.index + (head?.[0].length || 0);
        inspect(line, offset, expr, guard=>stack.some(scope=>proves(scope.condition,guard)), (condition,hit)=>{
          if (head && end === '{' && !pending.trim()) {
            const raw = lines[line].slice(offset,offset+expr.length).trimEnd();
            return {title:'Require ' + condition + ' before this condition',changes:[{line,start:offset,length:raw.length,text:'cond(' + condition + ', (' + raw + '), 0)'}]};
          }
          // A scalar read can keep surrounding arithmetic and use an explicit missing-value fallback.
          const query = /^(?:explodvar|projvar)$/i.test(hit[1]);
          const scalar = /^\s*(?:(?:pos|vel)\s+[xyz]|var\(\s*\d+\s*\)|fvar\(\s*\d+\s*\)|life|maxlife|power|time|stateno|anim|id|facing|ctrl)(?![\w.])/i;
          const operand = query ? '' : scalar.exec(expr.slice(hit.index+hit[0].length))?.[0];
          if (operand === undefined) return null;
          const length = hit[0].length + operand.length, start = offset + hit.index;
          if (/^\s*(?::=|[+\-*/]=)/.test(expr.slice(hit.index+length))) return null;
          if (!/^\s*(?:$|[+\-*/<>=!&|),\]])/.test(expr.slice(hit.index+length))) return null;
          const raw = lines[line].slice(start,start+length);
          return {title:'Use 0 for this read when ' + condition + ' is false',changes:[{line,start,length,text:'cond(' + condition + ', (' + raw + '), 0)'}]};
        });
        pending = (pending + ' ' + part).slice(-4096);
        const current = stack.at(-1);
        if (current?.controller) {
          const param = /^\s*([\w.]+)\s*:\s*/.exec(part);
          if (param) current.fields.push({key:param[1].toLowerCase(),expr:part.slice(param[0].length),line,offset:match.index+param[0].length});
        }
        if (end === '{') {
          const condition = /^\s*(?:else\s+)?(?:if|while)\s+(.+)$/i.exec(pending)?.[1] || '';
          const controller = /^\s*([a-z_]\w*)\s*$/i.exec(part)?.[1];
          stack.push({condition,controller,fields:[],line,start:match.index + part.indexOf(controller)});
        } else if (end === '}') {
          const frame = stack.pop();
          if (frame?.controller) inspectController(frame.controller,{line:frame.line,start:frame.start,length:frame.controller.length},frame.fields,
            guard=>stack.some(scope=>proves(scope.condition,guard)),condition=>({
              title:'Require ' + condition + ' before the controller runs',changes:[
                {line:frame.line,start:frame.start,length:0,text:'if ' + condition + ' { '},
                {line,start:match.index + part.length + 1,length:0,text:' }'}
              ]}));
        }
        if (end) pending='';
      }
    }
  }
  return results;
}
module.exports = {redirectProblems};
