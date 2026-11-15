'use strict';
const path = require('path');
const { parseHitDefs } = require('./hitdef_model');

const { callRecords } = require('./analyzer');

// Trace authored numeric inputs along one state-to-HitDef call chain.
// This supplies a setup preview, since the game can later change a map.
function sparkSetup(nodes, functions, field, constants) {
  if(!field)return null;
  const maps=new Map();
  let args=[];
  function distinct(values){
    return values.length&&values.every(value=>value!=null&&value===values[0])?values[0]:null;
  }
  for(let i=0;i<nodes.length;i++){
    const node=nodes[i],next=nodes[i+1];
    const targetCalls=next?node.invocations.filter(call=>functions.get(call.name.toLowerCase())===next):[];
    if(next&&targetCalls.length!==1)return null;
    const body=node.body.slice(0,targetCalls[0]?.start);
    function resolve(expression,allowLocal=true){
      const text=String(expression||'').trim().toLowerCase();
      if(/^[+-]?\d+(?:\.\d+)?$/.test(text))return Number(text);
      const ref=/^(const|map)\(\s*([\w.]+)\s*\)$/.exec(text);
      if(ref)return ref[1]==='const'?constants.get(ref[2]):maps.get(ref[2]);
      if(!/^\$\w+$/.test(text))return null;
      const name=text.slice(1),index=node.params.indexOf(name);
      if(index>=0)return args[index];
      if(!allowLocal)return null;
      const locals=[...body.matchAll(/\blet\s+(\w+)\s*=\s*([^;]+);/gi)].filter(item=>item[1].toLowerCase()===name);
      return distinct(locals.map(item=>resolve(item[2],false)));
    }
    if(!next){
      const values=field.split(',').map(part=>resolve(part));
      const offsets=values.map(item=>typeof item==='number'?item:item?.value);
      if(offsets.length!==2||!offsets.every(Number.isFinite))return null;
      const keys=values.map(item=>item?.name);
      return {offsets,keys:keys.every(Boolean)&&keys[0]!==keys[1]?keys:null};
    }
    for(const call of node.invocations){
      if(call.start>=targetCalls[0].start)break;
      const setter=functions.get(call.name.toLowerCase());
      if(!setter)continue;
      for(const write of setter.body.matchAll(/\bmap\(\s*([\w.]+)\s*\)\s*:=\s*([^;]+);/gi)){
        const param=setter.params.indexOf(write[2].trim().toLowerCase().replace(/^\$/,''));
        const value=param>=0?resolve(call.args[param]):null,key=write[1].toLowerCase();
        maps.set(key,maps.has(key)?distinct([maps.get(key),value]):value);
      }
    }
    args=targetCalls[0].args.map(arg=>resolve(arg));
  }
  return null;
}

// Resolve literal StateDef animations and the function calls which lead to each HitDef.
function attackChoices(sources, airText, constants=new Map()) {
  const names = new Map();
  const lines = airText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const header = /^\s*\[begin\s+action\s+(-?\d+)\s*\]/i.exec(lines[i]);
    if (header) names.set(Number(header[1]), /^\s*;\s*(.*)/.exec(lines[i-1] || '')?.[1]?.trim() || '');
  }
  const states = [], functions = new Map();
  for (const {filename,text,syntax} of sources) {
    const blocks = parseHitDefs(text,syntax);
    const headers = [...text.matchAll(/^[ \t]*\[[ \t]*(?:statedef[ \t]+(-?\d+)\b|function[ \t]+(\w+)\s*\()/gim)];
    for (let i=0; i<headers.length; i++) {
      const match=headers[i], end=headers[i+1]?.index ?? text.length;
      const raw=text.slice(match.index,end);
      const body=raw.replace(syntax==='zss'?/"[^"\r\n]*"|#[^\r\n]*/g:/"[^"\r\n]*"|;[^\r\n]*/g,'');
      const params=(/^\s*\[function\s+\w+\s*\(([^)]*)\)/i.exec(body)?.[1]||'').toLowerCase().split(',').map(name=>name.trim());
      const node={filename,body,params,invocations:callRecords(body),blocks,calls:[...body.matchAll(/\bcall\s+(\w+)\s*\(/gi)].map(call=>call[1]), hits:[]};
      blocks.forEach((block,index)=>{if(block.start>=match.index&&block.start<end)node.hits.push(index);});
      if(match[2]){
        const key=match[2].toLowerCase();
        if(!functions.has(key))functions.set(key,node);
      }else{
        const state=Number(match[1]);
        const declaration=syntax==='zss'?body.split(']')[0]:body.split(/^\s*\[state\b/im)[0];
        const anim=/(?:^|;)\s*anim\s*[:=]\s*(-?\d+)[ \t]*(?=;|\r?$)/im.exec(declaration);
        if(state>=0&&anim&&names.has(Number(anim[1])))states.push({...node,state,anim:Number(anim[1])});
      }
    }
  }
  const choices=[];
  for(const state of states){
    const seen=new Set();
    function visit(node,chain,parents){
      if(!node||seen.has(node))return;
      seen.add(node);
      const nodes=[...parents,node];
      for(const index of node.hits) choices.push({filename:node.filename,index,state:state.state,anim:state.anim,
        sparkSetup:sparkSetup(nodes,functions,node.blocks[index].values.sparkxy,constants),label:names.get(state.anim)||('State '+state.state),source:path.basename(state.filename),chain});
      for(const name of node.calls)visit(functions.get(name.toLowerCase()),[...chain,name],nodes);
    }
    visit(state,[],[]);
  }
  return choices;
}
module.exports={attackChoices};
