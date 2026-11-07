'use strict';
const {parseDef}=require('./def_model');
function setEntry(text,line,key,value){
 if(!/^[\w.-]+$/.test(key)||/[\r\n]/.test(String(value)))throw Error('Invalid scoped Stage property.');
 const document=parseDef(text),section=document.sections.find(x=>x.name&&x.line===line);if(!section)throw Error('The Stage section changed.');const entry=section.entries.find(x=>x.normalized===key.toLowerCase()),parts=String(text).split(/(\r\n|\r|\n)/);
 if(entry){const i=entry.line*2,raw=parts[i];let comment=-1,quoted=false;for(let p=0;p<raw.length;p++){if(raw[p]==='"'&&raw[p-1]!=='\\')quoted=!quoted;if(raw[p]===';'&&!quoted){comment=p;break}}const code=comment<0?raw:raw.slice(0,comment),suffix=comment<0?'':raw.slice(comment),equals=code.indexOf('='),prefix=code.slice(0,equals+1),body=code.slice(equals+1),leading=body.match(/^\s*/)[0],trailing=body.match(/\s*$/)[0];parts[i]=prefix+leading+value+trailing+suffix;return parts.join('');}
 const next=document.sections.find(x=>x.line>line),index=next?next.line*2:parts.length,eol=String(text).includes('\r\n')?'\r\n':'\n';parts.splice(index,0,(index===parts.length&&!/[\r\n]$/.test(text)?eol:'')+key+' = '+value+eol);return parts.join('');
}
function sectionSource(text,section){const parts=String(text).split(/(\r\n|\r|\n)/),document=parseDef(text),next=document.sections.find(x=>x.line>section.line);return parts.slice(section.line*2,next?next.line*2:parts.length).join('');}
module.exports={setEntry,sectionSource};
