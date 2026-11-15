'use strict';
const fs=require('node:fs'),path=require('node:path');
const transient=error=>['EBUSY','EPERM','EACCES'].includes(error?.code);
async function publishFolder(fileApi,staging,folder,validate,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 for(let attempt=0;;attempt++){await validate();if(fileApi.existsSync(folder))throw Error('The destination appeared during export. Choose a new folder name.');try{await fileApi.promises.rename(staging,folder);return;}catch(error){if(!transient(error)||attempt>=4)throw error;await pause(50*2**attempt);}}
}
async function cleanupFolder(fileApi,staging){await fileApi.promises.rm(staging,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
async function exportPackage(content,{vscode,sourcePath,defaultName,validate=async()=>{},review=async()=>true}={}){
 const picked=await vscode.window.showOpenDialog({title:'Choose where to export the sound package',defaultUri:vscode.Uri.file(path.dirname(sourcePath)),canSelectFolders:true,canSelectFiles:false,canSelectMany:false});if(!picked?.length)return null;
 const parent=path.resolve(picked[0].fsPath),validateInput=value=>{if(!value.trim()||/[<>:"/\\|?*\x00-\x1f]|[ .]$/.test(value)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(value))return 'Enter a valid folder name.';if(fs.existsSync(path.join(parent,value)))return 'This folder already exists. Choose a new name.';};
 const name=await vscode.window.showInputBox({title:'New sound package folder',value:defaultName||path.parse(sourcePath).name+'-sounds',validateInput});if(name===undefined)return null;const invalid=validateInput(name);if(invalid)throw Error(invalid);
 const folder=path.join(parent,name);if(!await review(folder))return null;await validate();
 let primaryError;const staging=await fs.promises.mkdtemp(path.join(parent,'.ikemaker-sounds-'));
 if(path.dirname(path.resolve(staging))!==parent||!path.basename(staging).startsWith('.ikemaker-sounds-'))throw Error('The package staging folder escaped its chosen parent.');
 try{
  await fs.promises.mkdir(path.join(staging,'sounds'));
  for(const file of content.files){const target=path.resolve(staging,file.file);if(!target.startsWith(path.resolve(staging)+path.sep)||path.dirname(target)!==path.join(staging,'sounds'))throw Error('Sound package paths must stay inside its sounds folder.');await fs.promises.writeFile(target,file.bytes,{flag:'wx'});}
  await fs.promises.writeFile(path.join(staging,'manifest.txt'),content.text,{flag:'wx'});await publishFolder(fs,staging,folder,validate);
 }catch(error){primaryError=error;throw error;}finally{try{await cleanupFolder(fs,staging);}catch(cleanupError){if(primaryError){primaryError.message+=' Cleanup also failed: '+cleanupError.message;primaryError.cleanupError=cleanupError;}else if(!fs.existsSync(folder))throw cleanupError;else void vscode.window.showWarningMessage('The sound package was exported to '+folder+', but temporary cleanup failed: '+cleanupError.message);}} 
 return folder;
}
module.exports={exportPackage,publishFolder,cleanupFolder};
