'use strict';

const path=require('path');
const crypto=require('crypto');
const {parseCodeStructure,flatten}=require('./code_structure_model');

const SUPPORTED=new Set(['zss','ikemen-cns','lua']);
const ACTIONS=Object.freeze([
  {id:'declaration',label:'Document Current Function / State',description:'Create a concise purpose comment and honest parameter placeholders.'},
  {id:'update-parameters',label:'Update Comment for Function Signature',description:'Keep authored comment text and reconcile @param lines with the current signature.'},
  {id:'improve',label:'Improve This Comment',description:'Replace the current comment line with one exact line you author.'},
  {id:'selection',label:'Explain Selected Code as Comment',description:'Insert only the explanation you provide above the selected lines.'},
  {id:'todo',label:'Add TODO / Reason Comment',description:'Record one explicit unfinished task or reason at the current line.'}
]);
function digest(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
function grammar(languageId,filename=''){if(languageId==='lua'||/\.lua$/i.test(filename))return'lua';if(languageId==='ikemen-cns'||/\.(?:cns|st|cmd)$/i.test(filename))return'cns';return'zss';}
function prefix(languageId,filename=''){return grammar(languageId,filename)==='zss'?'#':grammar(languageId,filename)==='lua'?'--':';';}
function declaration(text,languageId,filename,line){
  const candidates=flatten(parseCodeStructure(text,grammar(languageId,filename),filename)).filter(item=>['function','state'].includes(item.kind)&&item.startLine<=line&&item.endLine>=line);
  return candidates.sort((left,right)=>(left.endLine-left.startLine)-(right.endLine-right.startLine))[0]||null;
}
function parameterNames(node){
  if(!node||node.kind!=='function')return[];
  const signature=String(node.signature||''),match=/\(([^)]*)\)/.exec(signature);
  return match?match[1].split(',').map(value=>value.trim().replace(/\s*=.*$/,'')).filter(value=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)).slice(0,32):[];
}
function cleanOneLine(value,max=512){const result=String(value||'').trim().replace(/[\r\n]+/g,' ');return Buffer.byteLength(result,'utf8')<=max?result:'';}
function basePlan(input,text,extra={}){return Object.freeze({...extra,sourceHash:digest(text),sourceVersion:Number.isInteger(input.version)?input.version:null,filename:path.resolve(String(input.filename||'.'))});}
function planComment(input={}){
  const text=String(input.text||''),lines=text.split(/\r?\n/),line=Math.max(0,Math.min(lines.length-1,Number(input.line)||0)),comment=prefix(input.languageId,input.filename),indent=/^\s*/.exec(lines[line]||'')?.[0]||'',action=String(input.action||''),purpose=cleanOneLine(input.purpose);
  if(!ACTIONS.some(item=>item.id===action)||!purpose)return null;
  let insertionLine=line,title='Comment',body=[];
  if(action==='declaration'){
    const node=declaration(text,input.languageId,input.filename,line);if(!node)return null;
    insertionLine=node.startLine;title=node.kind==='function'?`Function ${node.title||node.signature||''}`:node.title||node.signature||node.kind;const declarationIndent=/^\s*/.exec(lines[insertionLine]||'')?.[0]||'';
    body=[`${declarationIndent}${comment} ${title}: ${purpose}`,...parameterNames(node).map(name=>`${declarationIndent}${comment} @param ${name} — TODO: describe ${name}.`)];
  }else if(action==='selection'){
    if(!input.hasSelection)return null;insertionLine=Math.max(0,Number(input.selectionStartLine)||line);const selectionIndent=/^\s*/.exec(lines[insertionLine]||'')?.[0]||'';body=[`${selectionIndent}${comment} ${purpose}`];title='Selected code';
  }else{body=[`${indent}${comment} TODO: ${purpose}`];title='TODO / reason';}
  const eol=text.includes('\r\n')?'\r\n':'\n',insertText=`${body.join(eol)}${eol}`;
  return basePlan(input,text,{operation:'insert',action,title,insertionLine,insertText,preview:body.join('\n')});
}
function planParameterUpdate(input={}){
  const text=String(input.text||''),lines=text.split(/\r?\n/),line=Math.max(0,Math.min(lines.length-1,Number(input.line)||0)),node=declaration(text,input.languageId,input.filename,line),comment=prefix(input.languageId,input.filename);
  if(!node||node.kind!=='function')return null;
  let start=node.startLine;const escaped=comment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),commentLine=new RegExp(`^\\s*${escaped}(?:\\s|$)`);
  while(start>0&&commentLine.test(lines[start-1]||''))start-=1;
  if(start===node.startLine)return null;
  const block=lines.slice(start,node.startLine),descriptions=new Map(),other=[];
  for(const source of block){const match=new RegExp(`^(\\s*)${escaped}\\s*@param\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?:—|-)\\s*(.*)$`).exec(source);if(match)descriptions.set(match[2],match[3]);else other.push(source);}
  const indent=/^\s*/.exec(lines[node.startLine]||'')?.[0]||'',params=parameterNames(node),body=[...other,...params.map(name=>`${indent}${comment} @param ${name} — ${descriptions.get(name)||`TODO: describe ${name}.`}`)],eol=text.includes('\r\n')?'\r\n':'\n',replacement=`${body.join(eol)}${eol}`;
  return basePlan(input,text,{operation:'replace-lines',action:'update-parameters',title:`Function ${node.title}`,startLine:start,endLineExclusive:node.startLine,replacement,preview:body.join('\n')});
}
function planImproveComment(input={}){
  const text=String(input.text||''),lines=text.split(/\r?\n/),line=Math.max(0,Math.min(lines.length-1,Number(input.line)||0)),source=lines[line]||'',comment=prefix(input.languageId,input.filename),escaped=comment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=new RegExp(`^(\\s*)${escaped}\\s?(.*)$`).exec(source),purpose=cleanOneLine(input.purpose);
  if(!match||!purpose)return null;const replacement=`${match[1]}${comment} ${purpose}`;
  return basePlan(input,text,{operation:'replace-line',action:'improve',title:'Existing comment',line,endCharacter:source.length,replacement,preview:replacement});
}

async function run(vscode){
  const configured=vscode.workspace.getConfiguration?.('ikemenZss').get('commentAssistance.mode','manual')||'manual';
  if(configured==='off')return vscode.window.showInformationMessage('Comment Assistance is disabled for this workspace. Change IKEMaker › Comment Assistance: Mode to Manual to use it.');
  const editor=vscode.window.activeTextEditor,document=editor?.document;
  if(!document||!SUPPORTED.has(document.languageId))return vscode.window.showInformationMessage('Open a ZSS, CNS, or Lua source file before using comment assistance.');
  const chosen=await vscode.window.showQuickPick(ACTIONS,{title:'Comment Assistance',placeHolder:'Choose one explicit, previewed comment operation.'});if(!chosen)return false;
  const hasSelection=!editor.selection.isEmpty;
  if(chosen.id==='selection'&&!hasSelection)return vscode.window.showInformationMessage('Select the code to explain, then run Comment Assistance again.');
  let purpose='';
  if(chosen.id!=='update-parameters'){purpose=await vscode.window.showInputBox({title:chosen.id==='todo'?'TODO / reason text':chosen.id==='selection'?'Explanation to place above the selection':chosen.id==='improve'?'Replacement comment text':'Purpose of the current function or state',prompt:'IKEMaker uses exactly this authored meaning and does not infer intent.',ignoreFocusOut:true,validateInput:value=>!cleanOneLine(value)?'Enter one line of 512 UTF-8 bytes or fewer.':undefined});if(purpose===undefined)return false;}
  const text=document.getText(),input={text,filename:document.fileName,languageId:document.languageId,line:editor.selection.active.line,selectionStartLine:editor.selection.start.line,hasSelection,version:document.version,action:chosen.id,purpose},model=chosen.id==='update-parameters'?planParameterUpdate(input):chosen.id==='improve'?planImproveComment(input):planComment(input);
  if(!model)return vscode.window.showInformationMessage(chosen.id==='declaration'?'Place the cursor inside a parsed Function or StateDef. No comment was inserted.':chosen.id==='update-parameters'?'Place the cursor inside a parsed function with a directly adjacent comment block. Nothing was changed.':chosen.id==='improve'?'Place the cursor on a source comment. Nothing was changed.':'The requested comment could not be created.');
  const answer=await vscode.window.showInformationMessage(`Preview comment for ${model.title}`,{modal:true,detail:`${model.preview}\n\nOnly this comment will be inserted. The native editor keeps Undo and the file is not saved automatically.`},'Insert Comment');
  if(answer!=='Insert Comment')return false;
  if(document.version!==model.sourceVersion||digest(document.getText())!==model.sourceHash)return vscode.window.showWarningMessage('The source changed while the comment was being reviewed. Nothing was inserted; run Comment Assistance again.');
  const edit=new vscode.WorkspaceEdit();
  if(model.operation==='insert')edit.insert(document.uri,new vscode.Position(model.insertionLine,0),model.insertText);
  else if(model.operation==='replace-lines')edit.replace(document.uri,new vscode.Range(model.startLine,0,model.endLineExclusive,0),model.replacement);
  else edit.replace(document.uri,new vscode.Range(model.line,0,model.line,model.endCharacter),model.replacement);
  if(!await vscode.workspace.applyEdit(edit))return vscode.window.showWarningMessage('VS Code did not insert the reviewed comment. Nothing was saved.');
  return true;
}
function registerCommentAssistance(vscode,context){const disposable=vscode.commands.registerCommand('ikemen.comments.assist',()=>run(vscode));context.subscriptions.push(disposable);return disposable;}

module.exports={ACTIONS,SUPPORTED,grammar,prefix,declaration,parameterNames,planComment,planParameterUpdate,planImproveComment,run,registerCommentAssistance,digest,cleanOneLine};
