'use strict';

const BROWSER_BOUNDS = Object.freeze({
  files:256,
  nodes:4096,
  depth:8,
  stringBytes:4096,
  textBytes:1024,
  sourceBytes:4*1024*1024,
  aggregateBytes:2*1024*1024,
  aliases:512,
  queryBytes:512
});

function cloneBounded(value, label = 'Authoring Browser data', bounds = BROWSER_BOUNDS) {
  const budget={nodes:0,bytes:0};
  const charge=(bytes)=>{budget.bytes+=bytes;if(budget.bytes>bounds.aggregateBytes)throw new RangeError(`${label} exceeds its aggregate byte limit.`);};
  function visit(current, trail, depth, ancestors) {
    if(depth>bounds.depth)throw new RangeError(`${label} exceeds its depth limit.`);
    if(current===null){charge(4);return current;}
    if(typeof current==='boolean'){charge(current?4:5);return current;}
    if(typeof current==='number'){
      if(!Number.isFinite(current))throw new TypeError(`${trail} contains a non-finite number.`);
      charge(Buffer.byteLength(String(current),'utf8'));
      return current;
    }
    if(typeof current==='string'){
      const bytes=Buffer.byteLength(current,'utf8');
      if(bytes>bounds.stringBytes)throw new RangeError(`${trail} exceeds its string limit.`);
      charge(bytes);
      return current;
    }
    if(!current||typeof current!=='object'||(!Array.isArray(current)&&Object.getPrototypeOf(current)!==Object.prototype))throw new TypeError(`${trail} must contain only plain serializable data.`);
    if(ancestors.has(current))throw new TypeError(`${trail} contains a cycle.`);
    budget.nodes+=1;
    if(budget.nodes>bounds.nodes)throw new RangeError(`${label} exceeds its node limit.`);
    charge(2);
    const nextAncestors=new Set(ancestors);nextAncestors.add(current);
    if(Array.isArray(current))return current.map((child,index)=>visit(child,`${trail}[${index}]`,depth+1,nextAncestors));
    const result={};
    for(const [key,child] of Object.entries(current)){
      if(child===undefined)continue;
      const keyBytes=Buffer.byteLength(key,'utf8');
      if(keyBytes>bounds.stringBytes)throw new RangeError(`${trail} contains an oversized key.`);
      charge(keyBytes+1);
      if(typeof child==='function'||typeof child==='symbol'||typeof child==='bigint')throw new TypeError(`${trail}.${key} is not read-only data.`);
      result[key]=visit(child,`${trail}.${key}`,depth+1,nextAncestors);
    }
    return result;
  }
  return visit(value,label,0,new Set());
}

module.exports={BROWSER_BOUNDS,cloneBounded};
