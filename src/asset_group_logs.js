'use strict';
const vscode=require('vscode'),fs=require('fs'),path=require('path');
const {readSff}=require('./sff_reader'),{systemName}=require('./sff_names');
const {hash,transactionalWrite}=require('./mutation_safety');
function dirtyDocument(filename){return vscode.workspace?.textDocuments?.find(document=>document.isDirty&&path.resolve(document.fileName).toLowerCase()===path.resolve(filename).toLowerCase());}
function renderLog(text,kind,entries){
 const preserved=new Map(),comments=[];
 for(const line of text.split(/\r?\n/)){if(!line.trim())continue;if(line.startsWith('#')){if(!/^# (IKEMEN |Identity |Convention |Entries |Retained |No longer )/.test(line))comments.push(line);continue;}const parts=line.split('|').map(part=>part.trim());if(parts[0])preserved.set(parts[0],{name:parts[1]||'',custom:parts[2]||'',notes:parts.slice(3).join(' | ')});}
 const lines=[`# IKEMEN ${kind} LOG`,'# Identity | Convention name | Custom name | Notes','# Convention names change only when you explicitly refresh this log.',''];
 const active=new Set();let added=0;
 for(const entry of entries){const id=String(entry.id),old=preserved.get(id)||{};active.add(id);if(!preserved.has(id))added++;lines.push(`${id} | ${entry.name} | ${old.custom||''} | ${old.notes||''}`);}
 const orphaned=[...preserved].filter(([id])=>!active.has(id));
 if(orphaned.length){lines.push('','# No longer in the current archive — retained names and notes');for(const [id,old]of orphaned)lines.push(`${id} | ${old.name} | ${old.custom} | ${old.notes}`);}
 if(comments.length)lines.push('','# Retained comments',...comments);
 return {content:lines.join('\r\n')+'\r\n',added,retained:orphaned.length,count:entries.length};
}
function writeLog(filename,kind,entries,options={}){
 if(dirtyDocument(filename))throw Error('Save or revert the open log before refreshing it. Unsaved notes were left untouched.');
 const exists=fs.existsSync(filename),before=exists?fs.readFileSync(filename,'utf8'):'',preview=renderLog(before,kind,entries);
 return transactionalWrite(fs,filename,preview.content,{label:kind.toLowerCase().replace(/\s+/g,'-')+'-refresh',backup:false,journal:false,expectedHash:options.expectedHash||hash(before),allowExisting:options.allowExisting??exists});
}
async function chooseFile(extension){const active=vscode.window.activeTextEditor?.document?.uri;if(active?.fsPath?.toLowerCase().endsWith(extension))return active.fsPath;return (await vscode.window.showOpenDialog({canSelectMany:false,filters:{[extension.slice(1).toUpperCase()]:[extension.slice(1)]}}))?.[0]?.fsPath||'';}
function entriesFor(filename,extension){if(extension==='.sff'){const groups=new Map();for(const sprite of readSff(filename).sprites)groups.set(sprite.group,(groups.get(sprite.group)||0)+1);return [...groups].sort((a,b)=>a[0]-b[0]).map(([group,count])=>({id:String(group),name:`${systemName(group).name} (${count} sprites)`}));}const seen=new Set(),entries=[],pattern=/^\s*\[Begin Action\s+(-?\d+)\s*\]/gim,text=fs.readFileSync(filename,'utf8');let match;while((match=pattern.exec(text))){const action=Number(match[1]);if(!seen.has(action)){seen.add(action);entries.push({id:String(action),name:systemName(action).name});}}return entries.sort((a,b)=>Number(a.id)-Number(b.id));}
async function openLog(uri,extension,refresh=false){
 const filename=uri?.fsPath||await chooseFile(extension);if(!filename)return;
 const kind=extension==='.sff'?'SFF GROUP':'AIR ACTION',suffix=extension==='.sff'?'_SFF_Groups.txt':'_AIR_Actions.txt',output=path.join(path.dirname(filename),path.basename(filename,path.extname(filename))+suffix),exists=fs.existsSync(output);
 if(exists&&!refresh)return vscode.window.showTextDocument(vscode.Uri.file(output),{preview:false});
 if(dirtyDocument(output))throw Error('Save or revert the open log before refreshing it. Unsaved notes were left untouched.');
 const sourceHash=hash(fs.readFileSync(filename)),before=exists?fs.readFileSync(output,'utf8'):'',entries=entriesFor(filename,extension),preview=renderLog(before,kind,entries),action=exists?'Refresh Log':'Create Log';
 const answer=await vscode.window.showWarningMessage(`${action}: ${output}\n\n${preview.count} current entries; ${preview.added} new entries; ${preview.retained} removed entries retained with their notes. Custom names, notes and comments are preserved.`,{modal:true},action);
 if(answer!==action)return;
 if(hash(fs.readFileSync(filename))!==sourceHash)throw Error('The source archive changed during review. Nothing was written; refresh again to review current entries.');
 writeLog(output,kind,entries,{expectedHash:hash(before),allowExisting:exists});
 return vscode.window.showTextDocument(vscode.Uri.file(output),{preview:false});
}
function registerAssetGroupLogs(context){
 const guarded=(extension,refresh)=>async uri=>{try{return await openLog(uri,extension,refresh);}catch(error){return vscode.window.showErrorMessage('Asset log: '+error.message);}};
 context.subscriptions.push(vscode.commands.registerCommand('sff.openGroupLog',guarded('.sff',false)),vscode.commands.registerCommand('air.openActionLog',guarded('.air',false)),vscode.commands.registerCommand('sff.refreshGroupLog',guarded('.sff',true)),vscode.commands.registerCommand('air.refreshActionLog',guarded('.air',true)));
}
module.exports={registerAssetGroupLogs,writeLog,renderLog,openLog};
