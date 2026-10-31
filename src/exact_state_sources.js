'use strict';

const path=require('path');
const {parseDef,sections}=require('./def_model');
const {assignedPath}=require('./character_dependency_model');

function exactStateSources(defPath,text,io){
 const document=parseDef(String(text??''),path.resolve(defPath)),files=sections(document,'files')[0],result=[],seen=new Set();if(!files)return result;
 for(const entry of files.entries||[]){if(!/^st(?:common|\d*)$/i.test(String(entry.key||'').trim()))continue;const filename=assignedPath(defPath,entry.value,entry.key,io),key=filename?path.resolve(filename).toLowerCase():'';if(!key||seen.has(key))continue;seen.add(key);result.push(path.resolve(filename));}
 return result;
}

module.exports={exactStateSources};
