'use strict';

const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { validRect } = require('./sff_quick_sheet_review');
const { approvedPolygon } = require('./sff_quick_sheet_polygon');
const { pageDestinations, assertDistinctCutDestinations } = require('./sff_sheet_destinations');
let storage;
function configure(folder) { storage = folder && path.join(folder, 'sprite-sheet-drafts'); }
function folderFor(key) {
  if (!storage || !/^[a-f0-9-]{36}$/.test(key)) throw Error('The saved sheet could not be located.');
  return path.join(storage,key);
}
function revisions(folder) {
  return fs.readdirSync(folder).filter(name=>/^\d{10}\.json$/.test(name)).sort();
}
function read(key) {
  const dir=folderFor(key), name=revisions(dir).at(-1);
  if (!name) throw Error('This sheet has no saved review.');
  const data=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
  if (data.key!==key || data.revision!==Number(name.slice(0,10))) throw Error('The sheet review record is inconsistent.');
  return data;
}
// Publish a complete revision atomically. Concurrent reviewers cannot replace each other's revision.
function save(data, expected) {
  const dir=folderFor(data.key);
  fs.mkdirSync(dir,{recursive:true});
  const latest=Number(revisions(dir).at(-1)?.slice(0,10)||0);
  if(latest!==expected) throw Error('This staged sheet changed in another editor. Reopen its latest revision.');
  const next={...data,revision:latest+1}, temp=path.join(dir,crypto.randomUUID()+'.tmp');
  const text=JSON.stringify(next);
  if(Buffer.byteLength(text)>32*1024*1024)throw Error('This sheet review exceeds 32 MiB. Stage a smaller region.');
  fs.writeFileSync(temp,text,{flag:'wx'});
  try { fs.linkSync(temp,path.join(dir,String(next.revision).padStart(10,'0')+'.json')); }
  catch(error){if(error.code==='EEXIST')throw Error('The saved sheet changed. Reopen the latest revision.');throw error;}
  finally { fs.unlinkSync(temp); }
  return next;
}
function sameFile(a,b) {
  if (!a || !b) return false;
  return path.relative(path.resolve(a),path.resolve(b)) === '';
}
async function chooseSource(api,targetFile,providedPath) {
  const drafts=[];
  if(storage && fs.existsSync(storage))for(const key of fs.readdirSync(storage)){
    try {const draft=read(key);if((!draft.targetFile||sameFile(targetFile,draft.targetFile))&&(!providedPath||sameFile(providedPath,draft.filename)))drafts.push(draft);}catch{/* An incomplete record is unavailable. */}
  }
  if(drafts.length){
    const picks=drafts.sort((a,b)=>b.updated-a.updated).map(draft=>{
      const pending=draft.cuts.filter(c=>!draft.written[c.id]).length;
      return {label:'Resume '+path.basename(draft.filename),description:pending+' pending · '+(draft.cuts.length-pending)+' written'+(draft.canvas.region?' · region '+draft.canvas.region.x+','+draft.canvas.region.y:''),detail:draft.filename,draft};
    });
    const choice=await api.window.showQuickPick([...picks,{label:'Start another sheet or region…'}],{title:'Advanced SFF · Sheet thumbnails'});
    if(!choice)return null;
    if(choice.draft){
      const d=choice.draft;
      let includeWritten=false;
      if(d.cuts.some(c=>d.written[c.id])){
        const scope=await api.window.showQuickPick([{label:'Continue with pending cuts',all:false},{label:'Review all cuts, including written sprites',all:true}],{title:path.basename(d.filename)});
        if(!scope)return null;includeWritten=scope.all;
      }
      return {filename:d.filename,resumeDraft:{...d,includeWritten}};
    }
  }
  const filename=providedPath || (await api.window.showOpenDialog({title:'Choose artwork for Sheet Thumbnails',canSelectMany:false,filters:{'Sprite sheets':['png','psd','pcx']}}))?.[0]?.fsPath;
  return filename?{filename}:null;
}
function validatedCuts(cuts,canvas){
  if(!Array.isArray(cuts)||cuts.length>4096)throw Error('A sheet review supports up to 4096 cuts.');
  const ids=new Set();
  return cuts.map(c=>{
    if(!validRect(c,canvas.width,canvas.height)||typeof c.id!=='string'||!c.id||c.id.length>128||ids.has(c.id)||(c.id in Object.prototype || c.id==='prototype'))throw Error('Review the sheet bounds and unique cut IDs.');
    ids.add(c.id);
    const polygon=approvedPolygon(c,canvas), identity=c.identity;
    if(identity&&![identity.group,identity.index].every(v=>Number.isInteger(v)&&v>=0&&v<=65535))throw Error('Group and index must be whole numbers from 0 through 65535.');
    return {id:c.id,x:c.x,y:c.y,width:c.width,height:c.height,...(polygon?{polygon}:{}),...(identity?{identity:{group:identity.group,index:identity.index}}:{})};
  });
}
async function reviewWithDraft(api,review,model,context,resume,verify){
  const {canvas}=context;
  if(resume && (resume.canvas.sourceHash!==canvas.sourceHash || JSON.stringify(resume.canvas)!==JSON.stringify(canvas) || JSON.stringify(resume.pages)!==JSON.stringify(context.pages)))throw Error('The source pixels, region or selected layers changed since staging. Start a new sheet review.');
  const written=resume?.written||{},prior=resume?.cuts||[];
  const visible=resume?prior.filter(c=>resume.includeWritten||!written[c.id]).map(c=>({...c,written:!!written[c.id]})):model.rectangles;
  const result=await review(api,{...model,advanced:true,rectangles:visible});
  if(!result)return null;
  verify();
  const all=validatedCuts(result.allCuts||result.rectangles,canvas);
  const byId=new Map(all.map(c=>[c.id,c]));
  const selected=(result.rectangles||[]).map(c=>byId.get(c.id));
  if(selected.some(c=>!c)||new Set(selected).size!==selected.length)throw Error('The selected batch contains unknown or repeated cuts.');
  if(result.action!=='stage' && selected.some(c=>written[c.id]))throw Error('The selection includes a sprite already recorded as written.');
  const kept=prior.filter(c=>written[c.id]&&!byId.has(c.id));
  const cuts=[...kept,...all.map(c=>written[c.id]?prior.find(item=>item.id===c.id):c)];
  if(cuts.length>4096)throw Error('This sheet review already contains 4096 cuts. Start another region.');
  for(const cut of cuts)if(cut.identity)pageDestinations(cut.identity,context.pages.length);
  assertDistinctCutDestinations(cuts,context.pages.length,written);
  const data=save({...context,key:resume?.key||crypto.randomUUID(),cuts,written,updated:Date.now()},resume?.revision||0);
  if(result.action==='stage'){void api.window.showInformationMessage('Saved '+cuts.length+' cuts. Resume from Sheet Thumbnails in Advanced SFF Creator.');return null;}
  return {rectangles:selected,draftKey:data.key};
}
function recordWritten(filename,entries){
  for(const key of new Set(entries.map(e=>e.draftKey))){
    const d=read(key);
    if(d.targetFile&&!sameFile(filename,d.targetFile))throw Error('The written SFF differs from the staged destination.');
    const written={...d.written};
    for(const e of entries.filter(e=>e.draftKey===key)){
      if(!d.cuts.some(c=>c.id===e.cutId))throw Error('A written cut is missing from this revision.');
      (written[e.cutId]??=[]);
      if(!written[e.cutId].some(v=>v.group===e.group&&v.index===e.index))written[e.cutId].push({group:e.group,index:e.index});
    }
    save({...d,targetFile:d.targetFile||path.resolve(filename),written,updated:Date.now()},d.revision);
  }
}
module.exports={configure,chooseSource,reviewWithDraft,recordWritten,read};
