'use strict';
const fs=require('fs');
const path=require('path');

const TEXT_EXTENSIONS=new Set(['.def','.zss','.cns','.st','.cmd','.inp','.jnp','.dat','.lua','.txt']);
const MAX_DOCUMENTS=256,MAX_DOCUMENT_BYTES=16*1024*1024,MAX_TOTAL_BYTES=64*1024*1024;
function eligible(document){return Boolean(document&&!document.isClosed&&document.uri?.scheme==='file'&&TEXT_EXTENSIONS.has(path.extname(document.fileName||'').toLowerCase()));}
function inventory(documents){return [...new Map((documents||[]).filter(eligible).map(document=>[path.resolve(document.fileName).toLowerCase(),document])).values()];}
function snapshot(documents){if(documents.length>MAX_DOCUMENTS)throw new Error(`Text Save As is limited to ${MAX_DOCUMENTS} open documents per reviewed set.`);let total=0;const evidence=new Map();for(const document of documents){const text=String(document.getText()),size=Buffer.byteLength(text,'utf8');if(size>MAX_DOCUMENT_BYTES)throw new Error(`${path.basename(document.fileName)} exceeds the 16 MiB text Save As limit.`);total+=size;if(total>MAX_TOTAL_BYTES)throw new Error('The reviewed text Save As set exceeds the 64 MiB total limit.');evidence.set(document,{fileName:document.fileName,version:document.version,text});}return evidence;}
function assertFresh(documents,evidence){for(const document of documents){const before=evidence.get(document);if(!before||document.isClosed||document.fileName!==before.fileName||(before.version!==undefined&&document.version!==before.version)||String(document.getText())!==before.text)throw new Error(`${path.basename(before?.fileName||document.fileName||'A selected document')} changed while choosing a destination. Nothing was copied; review Save As again.`);}}
function bytes(row){const document=row.document,text=row.text??String(document.getText());let bom=false;try{const source=fs.readFileSync(document.fileName);bom=source.length>=3&&source[0]===0xef&&source[1]===0xbb&&source[2]===0xbf;}catch(_){ }return Buffer.from((bom&&text.charCodeAt(0)!==0xfeff?'\ufeff':'')+text,'utf8');}
function uniqueDestinationRows(documents,folder,evidence=new Map()){const rows=documents.map(document=>({document,text:evidence.get(document)?.text,destination:path.join(folder,path.basename(document.fileName))})),seen=new Set();for(const row of rows){const key=path.resolve(row.destination).toLowerCase();if(seen.has(key))throw new Error(`Two selected documents would both be saved as ${path.basename(row.destination)}.`);seen.add(key);if(fs.existsSync(row.destination))throw new Error(`Nothing was copied because ${path.basename(row.destination)} already exists in that folder.`);}return rows;}
function writeSet(rows){const created=[];try{for(const row of rows){fs.writeFileSync(row.destination,bytes(row),{flag:'wx'});created.push(row.destination);}return created;}catch(error){for(const filename of created)try{fs.unlinkSync(filename)}catch(_){ }throw error;}}
async function run(options={}){
  const vscode=options.vscode||require('vscode'),focused=options.focused,all=inventory(options.documents||vscode.workspace.textDocuments),available=focused&&eligible(focused)&&!all.includes(focused)?[focused,...all]:all,evidence=snapshot(available);
  if(!available.length)return vscode.window.showInformationMessage('No open IKEMaker text documents are available for Save As. AIR files use AIR Save As.');
  const scope=await vscode.window.showQuickPick([
    {label:'Focused document',description:'Save one copy of the focused text document.',id:'focused'},
    {label:'All open text documents',description:'Save copies of every eligible open text document. AIR files are excluded.',id:'all'},
    {label:'Select text documents…',description:'Choose the text documents to copy. AIR files are excluded.',id:'select'}
  ],{title:'Text Save As',placeHolder:'What do you want to save as a copy?'});
  if(!scope)return null;
  let selected;
  if(scope.id==='focused'){
    if(!focused||!eligible(focused))return vscode.window.showInformationMessage('The focused document is not an eligible text document. AIR files use AIR Save As.');
    const destination=await vscode.window.showSaveDialog({title:`Save ${path.basename(focused.fileName)} As`,saveLabel:'Save Copy',defaultUri:vscode.Uri.file(path.join(path.dirname(focused.fileName),path.parse(focused.fileName).name+' copy'+path.extname(focused.fileName)))});
    if(!destination)return null;if(fs.existsSync(destination.fsPath))return vscode.window.showWarningMessage('Choose a new filename. Text Save As does not replace an existing file.');
    assertFresh([focused],evidence);writeSet([{document:focused,text:evidence.get(focused).text,destination:destination.fsPath}]);await vscode.window.showInformationMessage(`Saved copy: ${destination.fsPath}`);return[destination.fsPath];
  }
  selected=scope.id==='all'?available:(await vscode.window.showQuickPick(available.map(document=>({label:path.basename(document.fileName),description:document.fileName,document})),{title:'Select text documents to save as copies',canPickMany:true,placeHolder:'AIR files are intentionally excluded.'}))?.map(item=>item.document);
  if(!selected?.length)return null;
  const folder=(await vscode.window.showOpenDialog({title:`Choose an empty folder for ${selected.length} text ${selected.length===1?'copy':'copies'}`,openLabel:'Use Folder',canSelectFiles:false,canSelectFolders:true,canSelectMany:false}))?.[0];
  if(!folder)return null;const contents=fs.readdirSync(folder.fsPath);if(contents.length)return vscode.window.showWarningMessage('Choose an empty folder so the complete Save As set can be created without replacing files.');
  assertFresh(selected,evidence);const rows=uniqueDestinationRows(selected,folder.fsPath,evidence),created=writeSet(rows);await vscode.window.showInformationMessage(`Saved ${created.length} text ${created.length===1?'copy':'copies'} to ${folder.fsPath}. AIR files were excluded.`);return created;
}
module.exports={TEXT_EXTENSIONS,MAX_DOCUMENTS,MAX_DOCUMENT_BYTES,MAX_TOTAL_BYTES,eligible,inventory,snapshot,assertFresh,uniqueDestinationRows,writeSet,run};
