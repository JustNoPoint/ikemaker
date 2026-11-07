'use strict';
const {TextDecoder}=require('node:util');
function canonical(text){return String(text).replace(/^\uFEFF/,'').replace(/\r\n|\r/g,'\n');}
function stageDiskEdit(raw,current,next){
 if(!Buffer.isBuffer(raw))throw Error('The original Stage byte snapshot is unavailable.');
 const bom=raw.length>=3&&raw[0]===239&&raw[1]===187&&raw[2]===191,body=bom?raw.subarray(3):raw;let text;
 try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body)}catch{throw Error('This unopened Stage is not valid UTF-8. Open its native editor with the correct encoding before editing.');}
 if(canonical(text)!==canonical(current))throw Error('The raw Stage source and reviewed text differ. Nothing was changed.');
 const parts=text.split(/(\r\n|\r|\n)/),old=[];for(let i=0;i<parts.length;i+=2)old.push({text:parts[i],eol:parts[i+1]||''});
 const lines=canonical(next).split('\n'),mapped=new Map(),counts=new Map();for(const row of old)if(row.eol)counts.set(row.eol,(counts.get(row.eol)||0)+1);const fallback=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'\n';
 if(old.length===lines.length){for(let i=0;i<lines.length;i++)mapped.set(i,old[i].eol);}
 else{
  let left=0,rightOld=old.length-1,rightNew=lines.length-1;while(left<old.length&&left<lines.length&&old[left].text===lines[left]){mapped.set(left,old[left].eol);left++;}while(rightOld>=left&&rightNew>=left&&old[rightOld].text===lines[rightNew]){mapped.set(rightNew,old[rightOld].eol);rightOld--;rightNew--;}
  // Retain unchanged interior lines in source order; new/replaced lines inherit local dominant EOL.
  const rows=new Map();for(let i=left;i<=rightOld;i++){if(!rows.has(old[i].text))rows.set(old[i].text,[]);rows.get(old[i].text).push(i);}let previous=left-1;for(let i=left;i<=rightNew;i++){const candidates=rows.get(lines[i]);while(candidates?.length&&candidates[0]<=previous)candidates.shift();if(candidates?.length){previous=candidates.shift();mapped.set(i,old[previous].eol);}}
 }
 const output=lines.map((line,i)=>line+(i===lines.length-1?'':mapped.get(i)||fallback)).join('');return Buffer.concat([bom?Buffer.from([239,187,191]):Buffer.alloc(0),Buffer.from(output,'utf8')]);
}
module.exports={canonical,stageDiskEdit};
