'use strict';

// Offsets always refer to the original editor text, including CRLF and inline comments.
function inspectMoveControllers(source, syntax, includeAccesses = true) {
  const cns = syntax !== 'zss';
  const mask = source.split('');
  let quote = '', comment = false;
  const starts = [0];
  for (let i=0;i<source.length;i++) {
    const ch = source[i];
    if (ch === '\n') { starts.push(i+1); comment=false; quote=''; continue; }
    if (comment) { mask[i]=' '; continue; }
    if (quote) {
      mask[i]='~';
      if (ch === '\\' && i+1<source.length && source[i+1]!=='\n') mask[++i]='~';
      else if (ch === quote) quote='';
    } else if (ch === '"') { quote=ch; mask[i]='~'; }
    else if (ch === (cns ? ';' : '#') || (!cns && ch==='/' && source[i+1]==='/')) { comment=true; mask[i]=' '; }
  }
  const clean=mask.join('');
  const blocks=[];
  const lineAt=offset=>{
    let lo=0,hi=starts.length;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(starts[mid]<=offset)lo=mid;else hi=mid;}
    return lo;
  };
  function field(block, from, to, delimiter) {
    const raw=clean.slice(from,to);
    const match=/^\s*([\w.]+(?:\(\s*\d+\s*\))?)\s*([:=])\s*(\S[\s\S]*?)\s*$/.exec(raw);
    if (!match || match[2]!==delimiter) return;
    const start=from+raw.indexOf(match[2])+1+raw.slice(raw.indexOf(match[2])+1).match(/^\s*/)[0].length;
    const end=start+match[3].length, key=match[1].toLowerCase(), value=source.slice(start,end);
    block.fields.push({key,value,start,end,line:lineAt(start)});
    if (cns && key==='type') block.type=value.toLowerCase();
  }
  if (cns) {
    let block;
    for (let line=0;line<starts.length;line++) {
      const start=starts[line], end=starts[line+1]??source.length, raw=clean.slice(start,end);
      if (/^\s*\[/.test(raw)) {
        if (block) block.end=start;
        block=null;
        if (/^\s*\[\s*state(?:\s|,|\])/i.test(raw)) {
          block={type:'',line,start,end:source.length,insert:end,fields:[],guards:[]};
          blocks.push(block);
        }
      } else if (block) field(block,start,end,'=');
    }
  } else {
    const stack=[];
    let from=0;
    for(let i=0;i<clean.length;i++) {
      const ch=clean[i];
      if(ch==='\n' && /^\s*\[/.test(clean.slice(starts[lineAt(i)],i))) {from=i+1;continue;}
      if(!'{};'.includes(ch))continue;
      const part=clean.slice(from,i), frame=stack.at(-1);
      if(ch==='{') {
        const name=/^\s*([a-z_]\w*)\s*$/i.exec(part);
        const header=source.slice(from,i).trim();
        if(name && !/^(?:else|ignorehitpause|persistent)$/i.test(name[1])) {
          const start=from+part.indexOf(name[1]);
          const block={type:name[1].toLowerCase(),line:lineAt(start),start,insert:i+1,end:i+1,fields:[],guards:stack.map(x=>x.guard).filter(Boolean),guardRanges:stack.map(x=>x.range).filter(Boolean)};
          blocks.push(block);stack.push({block});
        } else stack.push({guard:header,range:{start:from,end:i}});
      } else {
        if(frame?.block)field(frame.block,from,i,':');
        if(ch==='}') {if(frame?.block)frame.block.end=i+1;stack.pop();}
      }
      from=i+1;
    }
  }
  return blocks.filter(block=>block.type && block.end>block.insert).map(block=>{
    const conditions=block.fields.filter(f=>/^trigger(?:all|\d+)$/.test(f.key));
    if (!includeAccesses) return {...block,conditions};
    const writes=[];
    for(const f of block.fields) {
      const expr=clean.slice(f.start,f.end);
      for(const match of expr.matchAll(/\b((?:sys)?f?var|map)\s*\([^()]*\)\s*:=/gi)){
        writes.push({line:f.line,value:source.slice(f.start+match.index,f.start+match.index+match[0].length-2).trim()});
      }
    }
    const accesses=[];
    const record=(slot,role,owner,line)=>{
      if(!accesses.some(a=>a.slot===slot&&a.role===role&&a.owner===owner&&a.line===line))accesses.push({slot,role,owner,line});
    };
    for(const f of [...(block.guardRanges||[]),...block.fields]){
      const expr=clean.slice(f.start,f.end);
      for(const m of expr.matchAll(/\b(?:(root|parent|helper(?:\([^()]*\))?|target(?:\([^()]*\))?|playerid\([^()]*\))\s*,\s*)?((?:sys)?f?var|map)\s*\(([^()]*)\)/gi)){
        const display = m[2]+'('+source.slice(f.start+m.index+m[0].length-m[3].length-1,f.start+m.index+m[0].length-1).trim()+')';
        record(display,/^\s*:=/.test(expr.slice(m.index+m[0].length))?'write':'read',m[1]||'self',lineAt(f.start+m.index));
      }
    }
    const writer=/^(parent|root|team)?(map|var)(set|add)$/.exec(block.type);
    if(writer){
      for(const f of block.fields){
        const slot=/^f?var\(.*\)$/.test(f.key)?f.key:
          ['v','fv','map'].includes(f.key)?({v:'var',fv:'fvar',map:'map'}[f.key]+'('+f.value+')'):null;
        if(slot)record(slot,writer[3],writer[1]||'self',f.line);
      }
    }
    return {...block,conditions,writes,accesses};
  });
}

function changeControllerField(source, blocks, key, values, syntax) {
  if(!blocks.length || blocks.length!==values.length || !/^[a-z][\w.]*$/i.test(key)) throw Error('Select a controller field.');
  const edits=[];
  for(const [i,block] of blocks.entries()){
    const value=String(values[i]).trim();
    if(!value || /[\r\n;{}#]/.test(value))throw Error('Enter one parameter expression per controller.');
    const fields=block.fields.filter(f=>f.key===key);
    if(fields.length>1)throw Error('Resolve the duplicate field in the source editor first.');
    if(fields.length) {
      const f=fields[0];
      if(f.value!==value)edits.push({start:f.start,end:f.end,text:value});
    } else {
      const newline=source.includes('\r\n')?'\r\n':'\n';
      const text=syntax==='zss'?' '+key+': '+value+'; ':key+' = '+value+newline;
      edits.push({start:block.insert,end:block.insert,text});
    }
  }
  for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);
  return source;
}
// Shown as a separate ZSS draft. Every iteration evaluates its own guard and controller parameters.
function countedControllerPreview(blocks, syntax) {
  if (blocks.length < 2 || blocks.length > 256 || syntax==='zss') return '';
  const first=blocks[0];
  if (!['explod','removeexplod','playsnd','stopsnd'].includes(first.type))return '';
  const allowedGuard = /^\s*(?:!?time|time\s*(?:=|>=|<=|>|<)\s*\d+|[01])\s*$/i;
  if (!first.conditions.length || first.conditions.some(f=>f.key!=='trigger1'||!allowedGuard.test(f.value)))return '';
  const rows=blocks.map(b=>b.fields.filter(f=>f.key!=='type' && !/^trigger/.test(f.key)));
  const signature=b=>JSON.stringify(b.conditions.map(f=>[f.key,f.value.toLowerCase().replace(/\s+/g,'')]));
  if(blocks.some(b=>b.type!==first.type || signature(b)!==signature(first)))return '';
  const keys=rows[0].map(f=>f.key);
  if(new Set(keys).size!==keys.length || keys.some(k=>['persistent','ignorehitpause'].includes(k)) || rows.some(r=>JSON.stringify(r.map(f=>f.key))!==JSON.stringify(keys)))return '';
  const params=[];
  for(const [i,key] of keys.entries()){
    const values=rows.map(r=>r[i].value);
    if(values.some(v=>/[{};#$]/.test(v)))return '';
    let value=values[0];
    if(!values.every(v=>v===value)){
      if(!values.every(v=>/^-?\d+$/.test(v)&&Number.isSafeInteger(Number(v))))return '';
      const base=Number(value),step=Number(values[1])-base;
      if(values.some((v,j)=>Number(v)!==base+j*step))return '';
      value=base+' + $effectIndex * ('+step+')';
    }
    params.push('        '+key+': '+value+';');
  }
  return ['for effectIndex = 0; '+(blocks.length-1)+'; 1 {','    if '+first.conditions.map(f=>'('+f.value+')').join(' && ')+' {','      '+first.type+'{',...params,'      }','    }','}'].join('\n');
}

function assignmentPreview(block, syntax) {
  if(syntax==='zss'||block.type!=='null'||block.fields.some(f=>!['type','triggerall','trigger1'].includes(f.key)))return '';
  // Earlier conditions in a numbered group determine whether later writes run.
  // Only extract a final direct write, where Null discards its boolean result.
  const numbered=block.conditions.filter(f=>f.key==='trigger1');
  const last=numbered.at(-1);
  if(!last || !/^(?:f?var\(\s*\d+\s*\)|map\(\s*[a-z_]\w*\s*\))\s*:=\s*[^;{}]+$/i.test(last.value) || /&&|\|\||\^\^/.test(last.value))return '';
  const guards=[...block.conditions.filter(f=>f.key==='triggerall'),...numbered.slice(0,-1)];
  if(guards.some(f=>/[:{};]|&&|\|\||\^\^/.test(f.value)))return '';
  const lines=guards.map((f,i)=>'  '.repeat(i)+'if '+f.value+' {');
  lines.push('  '.repeat(guards.length)+last.value+';');
  for(let i=guards.length-1;i>=0;i--)lines.push('  '.repeat(i)+'}');
  return lines.join('\n');
}
module.exports={inspectMoveControllers,changeControllerField,countedControllerPreview,assignmentPreview};
