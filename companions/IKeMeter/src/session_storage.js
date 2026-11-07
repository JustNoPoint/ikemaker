'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {currentUserSid,restrictDirectory}=require('./session_bootstrap');

function powershell(script,executable=process.env.IKEMETER_PWSH||'pwsh.exe'){try{return execFileSync(executable,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$PSStyle.OutputRendering='PlainText';$ProgressPreference='SilentlyContinue';"+script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();}catch(error){throw new Error('Protected session storage verification failed: '+(error.stderr?.trim()||error.code||'PowerShell unavailable'));}}
function literal(value){return "'"+value.replaceAll("'","''")+"'";}
function localAppData(executable){
  if(process.platform!=='win32')throw new Error('Protected session storage requires Windows');
  const value=powershell("[Environment]::GetFolderPath('LocalApplicationData')",executable);
  if(!value)throw new Error('Windows LocalApplicationData is unavailable');
  return value;
}
function equal(a,b){return process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;}
function inside(child,parent){const relative=path.relative(parent,child);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
function assertUnredirected(directory){
  if((process.platform==='win32'&&!/^[A-Za-z]:[\\/]/.test(directory))||!path.isAbsolute(directory)||directory.startsWith('\\\\')||directory.startsWith('//'))throw new Error('Session storage requires an absolute local path');
  const resolved=path.resolve(directory),volume=path.parse(resolved).root;
  let current=volume;
  for(const part of resolved.slice(volume.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part);let stat;
    try{stat=fs.lstatSync(current);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(stat.isSymbolicLink()||!stat.isDirectory()||!equal(fs.realpathSync(current),current))throw new Error('Session storage has a linked, redirected or non-directory ancestor');
  }
  return resolved;
}
function verifyPrivateDirectory(directory,sid,executable){
  if(!/^S-1-[0-9-]+$/.test(sid))throw new Error('Invalid storage owner SID');
  // Check every existing ancestor for reparse attributes, including non-symlink
  // Windows reparse points. Existing explicit grants must not survive unnoticed.
  powershell(`$ErrorActionPreference='Stop';$item=Get-Item -Force -LiteralPath ${literal(directory)};while($null -ne $item){if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Session storage has a reparse ancestor'};$item=$item.Parent};$acl=Get-Acl -LiteralPath ${literal(directory)};if(-not $acl.AreAccessRulesProtected){throw 'Session storage ACL inheritance is enabled'};foreach($ace in $acl.Access){if($ace.AccessControlType -eq 'Allow' -and $ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne ${literal(sid)}){throw 'Session storage grants another principal access'}}`,executable);
}
function prepareSessionStorage(options={}){
  const root=options.root===undefined?path.join((options.localAppData||(()=>localAppData(options.powershell)))(),'IKeMeter'):options.root;
  if(typeof root!=='string')throw new Error('Invalid session storage root');
  const directory=assertUnredirected(root);
  if(equal(directory,path.parse(directory).root)||inside(os.homedir(),directory)||inside(os.tmpdir(),directory))throw new Error('Session storage requires a dedicated application directory');
  for(const forbidden of [options.packageRoot,options.runtime].filter(Boolean)){
    const target=path.resolve(forbidden);
    if(inside(directory,target)||inside(target,directory))throw new Error('Session storage must be separate from package and gameplay paths');
  }
  const getDriveType=options.getDriveType||((value)=>powershell(`([IO.DriveInfo]::new([IO.Path]::GetPathRoot(${literal(value)}))).DriveType.ToString()`,options.powershell));
  if(getDriveType(directory)!=='Fixed')throw new Error('Session storage requires a fixed local volume; mapped, removable and unknown drives are refused');
  const sid=options.sid||currentUserSid(),restrict=options.restrict||restrictDirectory,verify=options.verify||((folder,owner)=>verifyPrivateDirectory(folder,owner,options.powershell));
  const sessions=path.join(directory,'sessions');
  for(const folder of [directory,sessions]){
    assertUnredirected(folder);
    try{fs.mkdirSync(folder,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
    assertUnredirected(folder);restrict(folder,sid);verify(folder,sid);
  }
  return {root:directory,sessions,sid,notice:'Protected session files use your per-user LocalAppData/IKeMeter folder.'};
}
module.exports={prepareSessionStorage,assertUnredirected,verifyPrivateDirectory};
