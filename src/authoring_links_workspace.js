'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {wrapBlock,scanLinks,planUpdate}=require('./authoring_links');
const {resolveAssigned}=require('./related_work');
const tools={
  throw:['Throw Maker','ikemen.throwCreator.open'],
  helper:['Helper Lab','ikemen.helperLab.open'],
  command:['Command Maker','ikemen.commandMovelist.openEditor'],
  'move-variant':['Move Lab','ikemen.moveLab.open'],
  trajectory:['Trajectory','ikemen.trajectory.openAssist'],
  explod:['Explod Lab','ikemen.explodComposer.open'],
  palfx:['PalFX','zss.openPalFxEditor'],
  layer:['Character layer','air.openAnimationPreview'],
  stage:['Stage Maker','ikemen.stage.openWorkspace']
};
const syntax=file=>path.extname(file).slice(1).toLowerCase();
const key=file=>process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);
function legacyLinks(text){
  const rows=[];
  for(const m of text.matchAll(/^[ \t]*[#;] IKEMaker (managed costume (layer[1-4]) \S+ Explod (\d+)|costume preflight (layer[1-4]) Explod (\d+)|managed reaction group v1 (ikm_rg_[a-f0-9]+) ([^\r\n]+))/gm)){
    const stage=!!m[6];
    let label=stage?'Stage reaction':m[2]||m[4];
    if(stage){try{label=JSON.parse(m[7]).target.name||label;}catch{}}
    let blockEnd=m.index+m[0].length,id=stage?m[6]:'explod-'+(m[3]||m[5]);
    if(stage){
      const closing='# End IKEMaker managed reaction group '+m[6];
      const at=text.indexOf(closing,blockEnd);
      if(at>=0)blockEnd=at+closing.length;
    }else{
      const line=text.slice(m.index).split(/\r?\n/,1)[0];
      try{
        const sealed=require('./costume_explod_workspace').managedSpecification(line,text,m.index);
        if(sealed){blockEnd=sealed.end;id=sealed.spec.linkId||id;label=sealed.spec.linkLabel||label;}
      }catch{}
    }
    rows.push({label,bank:m[1].match(/ bank:(\d+) /)?.[1],tool:stage?'stage':'layer',id,role:stage?'background reaction':m[2]?'pose update':'setup',mode:'native',status:'existing generator',start:m.index,end:blockEnd});
  }
  if(text.includes('; IKEMaker generated layer animation')){
    const lines=text.split(/(?<=\n)/),offsets=[0];
    for(const line of lines)offsets.push(offsets.at(-1)+line.length);
    const actions=require('./costume_explod_model').airActions(text);
    actions.forEach((a,i)=>{
      if(!a.marker)return;
      const source=a.marker.source;
      rows.push({label:'Action '+a.number+' · '+source,tool:'layer',id:source,role:'AIR '+a.number,
        bank:source.match(/^(?:body-signatures:|foreign-poses:)?bank:(\d+)$/)?.[1],
        mode:'native',status:'generated AIR',start:offsets[a.headerLine-1],end:i+1<actions.length?offsets[actions[i+1].headerLine-1]-1:text.length});
    });
  }
  return rows;
}
const linksIn=text=>[...scanLinks(text),...legacyLinks(text)];
const textFile=f=>['zss','air','cns','st','cmd','def','lua','inp','jnp','txt'].includes(syntax(f));
function liveText(api,filename){
  const open=api.workspace.textDocuments.find(d=>!d.isClosed&&key(d.fileName)===key(filename));
  return open?open.getText():fs.readFileSync(filename,'utf8');
}
async function inventory(api,seed,ownerHint){
  if(!seed) return [];
  const owners=syntax(seed)==='def'?[seed]:require('./viewer_navigation').associatedDefs(seed,file=>liveText(api,file));
  let owner=owners[0];
  if(ownerHint&&owners.some(file=>key(file)===key(ownerHint)))owner=owners.find(file=>key(file)===key(ownerHint));
  else if(owners.length>1){
    const pick=await api.window.showQuickPick(owners.map(file=>({label:path.basename(file),description:file,file})),{title:'Choose the owner of these code links'});
    if(!pick)return null;
    owner=pick.file;
  }
  const files=new Set([seed]);
  function addDef(file){
    const assets=resolveAssigned(file,liveText(api,file));
    for(const f of [file,assets.air,...assets.code])if(f)files.add(f);
  }
  if(owner){
    try{
    for(const f of require('./copied_layer_links').locations(owner))files.add(f);
    addDef(owner);
    const doc=require('./def_model').parseDef(liveText(api,owner),owner);
    if(doc.sections.some(s=>s.normalized==='stageinfo')){
      const resolveAsset=(ref,from)=>{
        const local=path.resolve(path.dirname(from),ref);
        if(fs.existsSync(local))return local;
        return path.resolve(path.dirname(path.dirname(owner)),ref);
      };
      for(const target of require('./stage_code_targets').stageCodeTargets(owner,liveText(api,owner),{resolveAsset,readText:f=>liveText(api,f)}))
        if(target.available&&target.filename)files.add(target.filename);
    }
    }catch{ /* A missing owner must not hide links in the selected source. */ }
  }
  const rows=[];
  Object.defineProperty(rows,'owner',{value:owner});
  for(const file of files){
    if(!textFile(file))continue;
    let text;
    try{text=liveText(api,file);}catch{continue;}
    for(const row of linksIn(text))rows.push({...row,file,owner});
  }
  for(const row of rows.filter(r=>r.status==='generated AIR'&&r.bank)){
    const owners=rows.filter(r=>r.tool==='layer'&&r.role==='pose update'&&r.bank===row.bank);
    if(owners.length===1)row.id=owners[0].id;
  }
  return rows;
}

async function chooseFile(api){
  const pick=await api.window.showOpenDialog({title:'Locate linked code or its owner',canSelectMany:false,filters:{'IKEMaker sources':['def','zss','cns','st','cmd','air','lua','inp','jnp','txt']}});
  return pick?.[0]?.fsPath;
}
const rowItem=row=>({label:row.label,description:(tools[row.tool]?.[0]||row.tool)+' · '+row.role,detail:path.basename(row.file)+' · '+row.status,row});
async function reveal(api,row){
  const document=await api.workspace.openTextDocument(api.Uri.file(row.file));
  const matches=linksIn(document.getText()).filter(r=>(r.id===row.id||r.status==='generated AIR'&&r.bank===row.bank)&&r.role===row.role&&r.tool===row.tool);
  const exact=matches.length===1?matches[0]:matches.find(r=>r.start===row.start);
  if(!exact)return api.window.showWarningMessage('The link moved or changed. Refresh the linked code list.');
  const editor=await api.window.showTextDocument(document,{preview:false});
  const position=document.positionAt(exact.start);
  editor.selection=new api.Selection(position,position);
  editor.revealRange(new api.Range(position,position),api.TextEditorRevealType.InCenter);
}
async function show(api,seed){
  let file=seed?.fsPath||seed?.filename||(typeof seed==='string'?seed:null)||api.window.activeTextEditor?.document.fileName||await chooseFile(api);
  const ownerHint=seed?.ownerDef||seed?.context?.ownerDef;
  while(file){
    const rows=await inventory(api,file,ownerHint);if(!rows)return;
    const pending=require('./copied_layer_links').pending(rows.owner,rows).map(receipt=>({label:'Awaiting paste · '+receipt.label+' · '+receipt.role,description:'Character layer',detail:'Expected file: '+receipt.expected,receipt}));
    const picked=await api.window.showQuickPick([...rows.map(rowItem),...pending,{label:'Locate pasted block in another file…',browse:true}],{title:rows.length||pending.length?'Show linked code':'No links found in these sources',matchOnDetail:true,matchOnDescription:true});
    if(!picked)return;
    if(picked.row)return reveal(api,picked.row);
    if(picked.receipt){
      const locate=await api.window.showQuickPick([{label:'Locate pasted block in another file…',browse:true}],{title:'Awaiting paste · '+picked.receipt.role,placeHolder:'Expected file: '+picked.receipt.expected});
      if(!locate)return;
      const chosen=await chooseFile(api);if(!chosen)return;
      const match=legacyLinks(liveText(api,chosen)).filter(r=>r.id===picked.receipt.id&&r.role===picked.receipt.role);
      if(match.length!==1){await api.window.showWarningMessage('This file must contain exactly one copy of the selected layer block.');continue;}
      await require('./copied_layer_links').locate(rows.owner,chosen);
      return reveal(api,{...match[0],file:chosen,owner:rows.owner});
    }
    file=await chooseFile(api);
  }
}
function replaceSourceRange(api, editor, range, replacement){
  if(api.WorkspaceEdit && api.workspace.applyEdit){
    const edit=new api.WorkspaceEdit();
    edit.replace(editor.document.uri,range,replacement);
    return api.workspace.applyEdit(edit);
  }
  return editor.edit(builder=>builder.replace(range,replacement));
}
async function selection(api){
  const editor=api.window.activeTextEditor,doc=editor?.document;
  if(!doc||!textFile(doc.fileName))return api.window.showInformationMessage('Open a supported text source to link its code.');
  const text=doc.getText(),version=doc.version,picked=editor.selection;
  const start=doc.offsetAt(new api.Position(picked.start.line,0));
  const last=Math.max(picked.start.line,picked.end.line-(picked.end.character===0&&picked.end.line>picked.start.line?1:0));
  const end=doc.offsetAt(doc.lineAt(last).range.end);
  const rows=linksIn(text),overlaps=rows.filter(r=>r.start<end&&r.end>start),existing=overlaps[0];
  if(overlaps.length>1 || existing && !picked.isEmpty && (start<existing.start || end>existing.end))
    return api.window.showInformationMessage('Select one linked block, or select complete lines outside existing links.');
  const all=await inventory(api,doc.fileName);if(!all)return;
  if(existing){
    const resolved=all.find(r=>key(r.file)===key(doc.fileName)&&r.start===existing.start&&r.role===existing.role);
    const siblings=all.filter(r=>r.id===(resolved?.id||existing.id)&&r.tool===existing.tool);
    const choices=siblings.map(rowItem);
    if(existing.mode==='managed')choices.push({label:'Compare with generated block on clipboard…',compare:true});
    if(tools[existing.tool])choices.push({label:'Open '+tools[existing.tool][0],tool:true});
    if(existing.mode==='reference'&&existing.status==='reference')choices.push({label:'Remove link and keep code',remove:true});
    const answer=await api.window.showQuickPick(choices,{title:existing.label+' · '+existing.role});
    if(answer?.row)return reveal(api,answer.row);
    if(answer?.compare){
      const proposed=(await api.env.clipboard.readText()).trimEnd();
      const incoming=scanLinks(proposed);
      if(incoming.length!==1||incoming[0].tool!==existing.tool||incoming[0].id!==existing.id||incoming[0].role!==existing.role||incoming[0].status!=='clean')
        return api.window.showInformationMessage('Copy one complete managed block for this same installation and role.');
      const copies=siblings.filter(r=>r.role===existing.role);
      if(copies.length!==1)return api.window.showWarningMessage('This role has multiple copies. Choose the authoritative installation before updating.');
      const plan=planUpdate(text,proposed);
      if(plan.status==='unchanged')return api.window.showInformationMessage('The installed block already matches.');
      if(existing.status==='incomplete')return api.window.showWarningMessage('Repair the block boundaries before comparing.');
      const before=await api.workspace.openTextDocument({language:doc.languageId,content:text.slice(existing.start,existing.end)});
      const after=await api.workspace.openTextDocument({language:doc.languageId,content:proposed});
      await api.commands.executeCommand('vscode.diff',before.uri,after.uri,'Installed ↔ generated · '+existing.label);
      if(plan.status!=='update')return api.window.showInformationMessage('This block has local changes. Review and merge the differences in the source.');
      const apply=await api.window.showInformationMessage('Replace the reviewed installed block?',{modal:true},'Update linked block');
      if(apply!=='Update linked block')return;
      if(doc.version!==version)return api.window.showWarningMessage('Source changed during review. Compare the current block again.');
      const edit=new api.WorkspaceEdit();edit.replace(doc.uri,new api.Range(doc.positionAt(plan.start),doc.positionAt(plan.end)),plan.text);
      return api.workspace.applyEdit(edit);
    }
    if(answer?.tool){
      const row={...existing,file:doc.fileName,owner:siblings[0]?.owner};
      if(row.owner&&['helper','throw'].includes(row.tool)){
        const options=row.tool==='helper'?await require('./helper_workspace').linkedHelperOpen(row):[await require('./throw_creator_workspace').linkedThrowOpen(row)].filter(Boolean);
        const target=options.length===1?options[0]:options.length?await api.window.showQuickPick(options,{title:'Choose the helper spawn'}):null;
        if(target)return api.commands.executeCommand(target.command,target.uri,target.options);
        if(options.length)return;
      }
      const native=tools[existing.tool][1],owner=siblings[0]?.owner;
      let target=owner||doc.fileName;
      if(existing.tool==='layer'&&owner)target=resolveAssigned(owner,liveText(api,owner)).air||doc.fileName;
      if(['trajectory','move-variant','palfx'].includes(existing.tool))target=doc.fileName;
      return api.commands.executeCommand(native,api.Uri.file(target));
    }
    if(answer?.remove){
      if(doc.version!==version)return api.window.showWarningMessage('The source changed. Review the link again.');
      return replaceSourceRange(api,editor,new api.Range(doc.positionAt(existing.start),doc.positionAt(existing.end)),text.slice(existing.bodyStart,existing.bodyEnd));
    }
    return;
  }
  if(picked.isEmpty)return api.window.showInformationMessage('Select the complete lines you want to link.');
  const choices=[...new Map(all.map(r=>[r.tool+'/'+r.id,r])).values()].map(rowItem);
  const item=await api.window.showQuickPick([...choices,{label:'Create a new link…',create:true}],{title:'Link selected code to IKeMaker',matchOnDescription:true});
  if(!item)return;
  let object=item.row;
  if(!object){
    const kind=await api.window.showQuickPick(Object.entries(tools).map(([tool,[label]])=>({tool,label})),{title:'Which editor owns this link?'});
    if(!kind)return;
    const label=await api.window.showInputBox({title:'Name this code link',prompt:'For example, EX Fireball or Ryu beard',validateInput:s=>s.trim()?'':'Enter a name.'});
    if(!label)return;
    object={tool:kind.tool,id:crypto.randomUUID(),label};
  }
  const role=await api.window.showInputBox({title:'Role of the selected code',value:'reference',prompt:'For example, spawn, cleanup, or facing-rule',validateInput:s=>/^[A-Za-z0-9_.:-]{1,128}$/.test(s)?'':'Use letters, numbers, dashes or underscores.'});
  if(!role)return;
  let code;
  try{code=wrapBlock(text.slice(start,end),{...object,role,syntax:syntax(doc.fileName),mode:'reference'});}
  catch{return api.window.showWarningMessage('The selected lines contain incomplete or existing link markers. Review those boundaries first.');}
  const answer=await api.window.showInformationMessage('Link these lines to '+object.label+'?',{modal:true,detail:code},'Add reference');
  if(answer!=='Add reference')return;
  if(doc.version!==version)return api.window.showWarningMessage('The source changed. Review the selection again.');
  return replaceSourceRange(api,editor,new api.Range(doc.positionAt(start),doc.positionAt(end)),code);
}
function register(api,context){
  context.subscriptions.push(api.commands.registerCommand('ikemen.links.show',seed=>show(api,seed)),api.commands.registerCommand('ikemen.links.selection',()=>selection(api)));
}
module.exports={register,inventory,legacyLinks,selection,show};
