'use strict';
const {maskSource,parseStateSource}=require('./state_transfer_model');
function requiredContact(expressions) {
 const groups=new Map(), always=new Set();
 for(const expression of expressions){
  const match=/^trigger(all|\d+)\s*=\s*(.+)$/i.exec(expression.trim());
  if(!match)continue;
  const key=match[1].toLowerCase();
  if(key!=='all'&&!groups.has(key))groups.set(key,new Set());
  const atoms=key==='all'?always:groups.get(key);
  // A single bare contact condition is sufficient evidence. Other expressions
  // may contribute additional gates without weakening this required one.
  const value=match[2].trim().toLowerCase();
  if(['movehit','moveguarded','movecontact'].includes(value))atoms.add(value);
 }
 for(const [atom,label] of [['movehit','On hit'],['moveguarded','On guard'],['movecontact','On hit or guard']]){
  if(always.has(atom)||(groups.size&&[...groups.values()].every(group=>group.has(atom))))return label;
 }
 return '';
}
let cachedText=null,cachedBranches=[];
function zssBranches(text) {
 if(text===cachedText)return cachedBranches;
 const masked=maskSource(text,'zss'),stack=[],branches=[];
 let heading=null;
 for(const token of masked.matchAll(/\b(?:if|else|while|for|switch)\b|[{};]/gi)){
  const start=token.index,word=token[0].toLowerCase();
  if(word==='{'){
   const block={start,end:null,heading};
   stack.push(block);
   if(heading!==null)branches.push(block);
   heading=null;
  }else if(word==='}'){
   const block=stack.pop();
   if(block)block.end=start;
   heading=null;
  }else if(word===';')heading=null;
  else if(!(word==='if'&&heading!==null&&masked.slice(heading,start).trim().toLowerCase()==='else'))heading=start;
 }
 cachedText=text;
 cachedBranches=branches;
 return branches;
}
function transitionConditions(text,transfer,syntax){
 const body=String(text).slice(transfer.controllerStart,transfer.controllerEnd),lines=body.split(/\r?\n/);
 const expressions=syntax==='cns'?lines.filter(line=>/^\s*trigger(?:all|\d+)\s*=/i.test(line)).map(line=>line.trim()):
  zssBranches(text).filter(branch=>branch.start<transfer.controllerStart&&branch.end!==null&&transfer.controllerStart<branch.end)
   .map(branch=>text.slice(branch.heading,branch.start).trim());
 const masked=expressions.map(value=>maskSource(value,syntax));
 const gate=syntax==='cns'?requiredContact(masked):'';
 const labels=gate?[gate]:[];for(const [pattern,label]of [[/\bmovehit\b/i,'MoveHit'],[/\bmovecontact\b/i,'MoveContact'],[/\bmoveguarded\b/i,'MoveGuarded'],[/\banimtime\b/i,'AnimTime'],[/\b(?:var|fvar|map)\s*\(/i,'Authored variable/map']])if(masked.some(value=>pattern.test(value)))labels.push(label);
 for(const [index,value] of expressions.entries())for(const match of value.matchAll(/\bcommand\s*(?:=|==)\s*"([^"\r\n]{1,120})"/gi))if(masked[index].slice(match.index,match.index+7).toLowerCase()==='command')labels.push('Command '+match[1]);
 return{expressions:expressions.slice(0,32),labels:[...new Set(labels)],omitted:Math.max(0,expressions.length-32),complete:syntax==='cns',detail:syntax==='cns'?'Authored controller triggers; numbered trigger groups retain their authored AND/OR structure.':'Structural enclosing condition excerpts; verify complete branching and timing in source. Conditions are not evaluated.'};
}
function functionStateTransitions(component) {
 if(component?.kind!=='function'||component.syntax!=='zss')return [];
 const text=component.text||'';
 return parseStateSource(text,component.filename,'zss').transfers.filter(transfer=>transfer.kind==='changestate').map(transfer=>({
  available:false, expression:transfer.expression, label:'ChangeState', sourceLine:component.startLine+transfer.line,
  reason:transfer.dynamic?'Destination is computed in this function. Inspect its caller and arguments.':'Inspect this state transfer in the function source.',
  conditions:transitionConditions(text,transfer,'zss')
 }));
}
module.exports={transitionConditions,functionStateTransitions};
