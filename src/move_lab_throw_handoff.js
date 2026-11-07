'use strict';
const crypto=require('node:crypto'),path=require('node:path'),fs=require('node:fs');
function planSnapshot(defPath){const folder=path.join(path.dirname(defPath),'.ikemen-tools','throw-plans');return fs.existsSync(folder)?fs.readdirSync(folder).filter(name=>/\.json$/i.test(name)).sort().map(name=>[name,digest(fs.readFileSync(path.join(folder,name)))]):[];}
const tickets=new Map(),key=value=>path.resolve(value||'.').toLowerCase(),digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
function literal(value){const text=String(value??'').trim();return /^-?\d+$/.test(text)&&Number.isSafeInteger(Number(text))&&Math.abs(Number(text))<=1000000000?Number(text):null;}
function controllerMatches(part,name,needsValue=true){
 const syntax=/^\s*type\s*=/im.test(part.text)?'cns':'zss';
 const masked=require('./state_transfer_model').maskSource(part.text,syntax);
 const header=syntax==='cns'
  ?new RegExp('^[ \\t]*type[ \\t]*=[ \\t]*'+name+'\\b','gim')
  :new RegExp('\\b'+name+'\\s*\\{','gi');
 const found=[];
 for(const match of masked.matchAll(header)){
  const body=masked.slice(match.index+match[0].length);
  const end=syntax==='cns'?body.search(/^\s*\[/m):body.indexOf('}');
  const section=end<0?body:body.slice(0,end);
  const value=syntax==='cns'?/^[ \t]*value[ \t]*=[ \t]*([^\r\n]+)/im.exec(section):/\bvalue\s*:\s*([^;}]+)/i.exec(section);
  if(needsValue&&!value)continue;
  let expression='';
  if(value){
   const start=match.index+match[0].length+value.index+value[0].length-value[1].length;
   expression=part.text.slice(start,start+value[1].trimEnd().length).trim();
  }
  found.push({index:match.index,value:expression});
 }
 return found;
}
function reversalCaptures(part){
 const masked=require('./state_transfer_model').maskSource(part.text,'cns'),headers=[...masked.matchAll(/^[ \t]*\[State[^\]\r\n]*\]/gim)],found=[];
 for(let i=0;i<headers.length;i++){
  const begin=headers[i].index,end=i+1<headers.length?headers[i+1].index:masked.length,block=masked.slice(begin,end);
  if(!/^[ \t]*type[ \t]*=[ \t]*reversaldef[ \t]*(?:\r?\n|$)/im.test(block))continue;
  const fields={};for(const match of block.matchAll(/^[ \t]*(p2stateno|p2getp1state|attr|reversal\.attr)[ \t]*=[ \t]*([^\r\n]*)/gim))fields[match[1].toLowerCase()]=part.text.slice(begin+match.index+match[0].length-match[2].length,begin+match.index+match[0].length).trim();
  if(!Object.hasOwn(fields,'p2stateno'))continue;
  found.push({index:begin,fields,filename:part.filename,line:part.line+part.text.slice(0,begin).split(/\r?\n/).length-1,controllerStart:begin,controllerEnd:end});
 }
 return found;
}
function inspectHandshake(data,source,read){
 const evidence={entry:'',target:'',capture:'',captureAttributes:'',codeOwner:'unresolved',animationOwner:'unresolved',release:'',participantStatus:[],links:[],detail:'Select an exact code state or supply a proposed relationship. AIR and StateDef numbers are not assumed equivalent.'};
 if(!source)return evidence;
 const catalog=(data.sources||[]).flatMap(outline=>(outline.states||[]).map(state=>({...state,filename:outline.filename}))),numberOf=state=>literal(/State(?:Def)?\s+(-?\d+)/i.exec(state.title)?.[1]);
 const states=catalog.filter(state=>key(state.filename)===key(source.filename)&&source.line>=state.line&&source.line<=(state.endLine??state.line));
 if(states.length!==1)return evidence;
 const state=states[0],entry=numberOf(state);if(entry!==null)evidence.entry=String(entry);
 const segment=item=>({filename:item.filename,line:item.line,text:read(item.filename).split(/\r?\n/).slice(item.line,(item.endLine??item.line)+1).join('\n')}),entrySegment=segment(state);
 evidence.links.push({filename:source.filename,line:state.line,label:state.title});
 const attacks=(data.attacks?.controllers||[]).filter(item=>key(item.filename)===key(source.filename)&&item.line>=state.line&&item.line<=(state.endLine??state.line));
 const hitCaptures=attacks.filter(item=>{const value=String(item.hitdefValues?.p2stateno??'').trim();return value!==''&&(literal(value)??0)>=0;});
 const reversals=reversalCaptures(entrySegment),reversalLiterals=reversals.filter(item=>(literal(item.fields.p2stateno)??-1)>=0);
 const captures=[...hitCaptures,...reversalLiterals],candidates=hitCaptures.length?hitCaptures:attacks;
 if(reversals.length===1&&!hitCaptures.length&&reversalLiterals.length===1){
  const reversal=reversals[0],values=reversal.fields;
  const conditions=require('./move_transition_conditions').transitionConditions(entrySegment.text,{controllerStart:reversal.controllerStart,controllerEnd:reversal.controllerEnd},'cns');
  evidence.capture=conditions.expressions.join('\n');evidence.captureAttributes=[values.attr,values['reversal.attr']].filter(Boolean).join(' / ');evidence.target=values.p2stateno;
  const ownership=String(values.p2getp1state??'');evidence.codeOwner=ownership==='0'?'defender':ownership===''||ownership==='1'?'attacker':'unresolved';
  evidence.links.push({filename:reversal.filename,line:reversal.line,label:'Capture controller / ReversalDef conditions'});
 }
 if(candidates.length===1&&!reversals.length){
  const attack=candidates[0],values=attack.hitdefValues||{},full=read(attack.filename),lineStart=(()=>{let line=0;for(let index=0;index<full.length;index++)if(full[index]==='\n'&&++line===attack.line)return index+1;return 0;})();
  const conditions=require('./move_transition_conditions').transitionConditions(full,{controllerStart:Number.isInteger(attack.start)?attack.start:lineStart,controllerEnd:Number.isInteger(attack.end)?attack.end:lineStart+String(attack.sourceText||'').length},attack.syntax==='cns'?'cns':'zss');
  evidence.capture=conditions.expressions.join('\n');evidence.captureAttributes=String(values.attr||'');evidence.target=captures.length?String(values.p2stateno):'';
  const ownership=String(values.p2getp1state??'');evidence.codeOwner=(ownership==='1'||(!ownership&&evidence.target))?'attacker':ownership==='0'?'defender':'unresolved';evidence.links.push({filename:attack.filename,line:attack.line,label:'Capture controller / conditions'});
 }
 // TargetState enters the controller owner's state table. A HitDef with
 // p2stateno also uses that table unless p2getp1state explicitly overrides it.
 const transfers=controllerMatches(entrySegment,'TargetState').filter(transfer=>(literal(transfer.value)??0)>=0);
 for(const transfer of transfers)addLink(entrySegment,transfer,'Target transition / TargetState');
 if(captures.length>1||reversals.length>1){
  for(const attack of hitCaptures)evidence.links.push({filename:attack.filename,line:attack.line,label:'Inspect capture / HitDef '+attack.hitdefValues.p2stateno});
  for(const reversal of reversals)evidence.links.push({filename:reversal.filename,line:reversal.line,label:'Inspect capture / ReversalDef '+reversal.fields.p2stateno});
  evidence.target='';evidence.codeOwner='unresolved';evidence.participantStatus.push('Multiple capture controllers. Review the individual conditions.');
 }
 if(!captures.length&&!reversals.length&&!evidence.target&&transfers.length&&transfers.every(item=>item.value===transfers[0].value)){
  evidence.target=transfers[0].value;evidence.codeOwner='attacker';
 }
 function addLink(part,match,label){
  evidence.links.push({filename:part.filename,line:part.line+part.text.slice(0,match.index).split(/\r?\n/).length-1,label});
 }
 const targetNumber=literal(evidence.target),targetStates=targetNumber===null?[]:catalog.filter(item=>numberOf(item)===targetNumber);
 const status=(label,number,matches)=>number===null?label+': unresolved / dynamic':matches.length===1?label+' '+number+': Match - uniquely found in assigned source':matches.length?label+' '+number+': Mismatch - ambiguous ('+matches.length+' definitions)':label+' '+number+': Mismatch - missing from assigned source (a proposed state may be reviewed)';
 evidence.participantStatus.push(status('Entry state',entry,catalog.filter(item=>numberOf(item)===entry)));
 evidence.participantStatus.push(evidence.codeOwner==='attacker'?status('Target state',targetNumber,targetStates):'Target state: '+(evidence.target||'unresolved')+'; '+evidence.codeOwner+' ownership - assignment not proven in attacker source');
 let targetSegment=null;if(evidence.codeOwner==='attacker'&&targetStates.length===1){targetSegment=segment(targetStates[0]);evidence.links.push({filename:targetSegment.filename,line:targetSegment.line,label:'Target custom state'});}
 for(const part of [entrySegment,targetSegment].filter(Boolean)){
  for(const name of ['TargetBind','BindToTarget','BindToRoot','BindToParent']){
   for(const bind of controllerMatches(part,name,false))addLink(part,bind,'Inspect bind / '+name);
  }
 }
 if(targetSegment){
  for(const change of controllerMatches(targetSegment,'ChangeState'))addLink(targetSegment,change,'Follow custom state / ChangeState '+change.value);
 }
 if(targetSegment){const animations=controllerMatches(targetSegment,'ChangeAnim2');if(animations.length===1){evidence.animationOwner='attacker';evidence.links.push({filename:targetSegment.filename,line:targetSegment.line+targetSegment.text.slice(0,animations[0].index).split(/\r?\n/).length-1,label:'Target animation / ChangeAnim2'});}}
 const releaseSegment=targetSegment,releases=releaseSegment?controllerMatches(releaseSegment,'SelfState'):[];
 if(releases.length===1){evidence.release=releases[0].value;evidence.links.push({filename:releaseSegment.filename,line:releaseSegment.line+releaseSegment.text.slice(0,releases[0].index).split(/\r?\n/).length-1,label:'Target release / SelfState'});}
 else if(releases.length>1){
  evidence.participantStatus.push('Multiple target exits. Inspect the conditions and enter the intended release.');
  for(const release of releases)addLink(releaseSegment,release,'Inspect release / SelfState '+release.value);
 }
 evidence.detail='Authored capture conditions and attributes are separate. Dynamic expressions remain unresolved; proposed fields do not author or verify missing states.';
 return evidence;
}
const TEXT=['entry','target','capture','release'],OWNERS=new Set(['attacker','defender','custom','unresolved']);
function validChoices(value){return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(name=>['kind',...TEXT,'codeOwner','animationOwner','p1Action','p2Action','mode','tick','frame','timelineScope','inspectionToken'].includes(name))&&(value.inspectionToken===undefined||typeof value.inspectionToken==='string'&&/^[a-f0-9]{48}$/.test(value.inspectionToken))&&['throw','custom'].includes(value.kind)&&TEXT.every(name=>typeof value[name]==='string'&&value[name].length<=2048)&&OWNERS.has(value.codeOwner)&&OWNERS.has(value.animationOwner)&&['p1Action','p2Action'].every(name=>value[name]===null||Number.isSafeInteger(value[name])&&Math.abs(value[name])<=1000000)&&['tick','frame'].every(name=>Number.isSafeInteger(value[name])&&value[name]>=0&&value[name]<=1000000)&&value.mode==='throw'&&typeof value.timelineScope==='string'&&value.timelineScope.length<=256);}
function reviewHandshake(data,evidence,choices){
 if(!validChoices(choices))throw Error('The throw/custom-state review is invalid.');
 const actions=data.visual?.actions||[],unique=number=>Number.isSafeInteger(number)&&actions.filter(item=>item.number===number).length===1;
 const p1State=literal(choices.entry),p2State=literal(choices.target),issues=[];
 if(choices.kind!=='throw')issues.push('Custom method retained. Use the direct source links; Throw Creator is optional for a reviewed throw proposal.');
 if(p1State===null||p2State===null)issues.push('Supply explicit proposed P1 and target StateDef numbers before continuing. Authored dynamic expressions are preserved below.');
 if(p1State!==null&&p1State===p2State)issues.push('P1 and target custom StateDefs must be distinct.');
 for(const number of [p1State,p2State]){if(number===null)continue;const states=(data.sources||[]).flatMap(source=>(source.states||[]).filter(state=>new RegExp('State(?:Def)?\\s+'+number+'(?:\\D|$)','i').test(state.title)));if(states.length>1)issues.push('StateDef '+number+' is duplicated. Resolve the participant source before continuing.');}
 if(!unique(choices.p1Action)||!unique(choices.p2Action))issues.push('Choose unambiguous, existing P1/P2 AIR actions.');
 if(!choices.capture.trim()||!choices.release.trim())issues.push('Review the capture condition and release/return path.');
 if(choices.codeOwner!=='attacker'||choices.animationOwner!=='attacker')issues.push('Throw Creator uses attacker-owned custom states and AIR actions. Keep a defender-owned or unresolved custom method in direct state editing, or explicitly review an attacker-owned proposal.');
 const proposedStatus=[['Proposed entry',p1State],['Proposed target',p2State]].map(([label,number])=>{const matches=(data.sources||[]).flatMap(source=>(source.states||[]).filter(state=>new RegExp('State(?:Def)?\\s+'+number+'(?:\\D|$)','i').test(state.title)));return number===null?label+': unresolved':matches.length===1?label+' '+number+': Match':matches.length?label+' '+number+': Mismatch - ambiguous':label+' '+number+': Mismatch - not authored; unsaved proposal only';});
 return Object.freeze({choices:{...choices},proposedStatus,authored:JSON.parse(JSON.stringify(evidence)),p1State,p2State,p1Action:choices.p1Action,p2Action:choices.p2Action,canContinue:issues.length===0,issues});
}
function planMatches(review,plan){return Boolean(plan&&review.canContinue&&['p1State','p2State','p1Action','p2Action'].every(name=>Number(plan[name])===review[name]));}
function choosePlan(review,{draft,saved=[],create}){
 if(draft){if(!planMatches(review,draft))throw Error('Throw Creator already has a different retained draft. Finish or keep that draft before opening this relationship. Nothing was replaced.');return{plan:draft,draft:true};}
 const matches=saved.filter(item=>planMatches(review,item.plan));if(matches.length>1)throw Error('More than one saved throw plan matches. Open the intended plan in Throw Creator first; no plan was guessed.');
 if(matches.length===1)return{plan:matches[0].plan,draft:false,filename:matches[0].filename};
 const plan=create('Reviewed Move Lab Throw');return{plan:{...plan,id:'move-lab-'+crypto.randomBytes(6).toString('hex'),p1State:review.p1State,p2State:review.p2State,p1Action:review.p1Action,p2Action:review.p2Action,notes:['Reviewed Move Lab proposal (not authored source).','Capture: '+review.choices.capture,'Target state code: '+review.choices.codeOwner+'; animation: '+review.choices.animationOwner,'Release/return: '+review.choices.release,'Authored target expression: '+(review.authored.target||'unresolved')].join('\n')},draft:true};
}
function inspectProof(owner,evidence,signature,files,read){const token=crypto.randomBytes(24).toString('hex');owner.throwInspection={token,signature,proofs:[...new Set(files)].map(filename=>({filename,hash:digest(read(filename))}))};owner.throwLinks=new Map(evidence.links.map((link,index)=>['throw-source:'+token+':'+index,{...link,signature,hash:digest(read(link.filename))}]));return{...evidence,inspectionToken:token,links:[...owner.throwLinks].map(([slot,link])=>({slot,label:link.label,lineLabel:path.basename(link.filename)+':'+(link.line+1)}))};}
function inspectionCurrent(owner,token,signature,read){const proof=owner.throwInspection;if(!proof||proof.token!==token||proof.signature!==signature)return false;try{return proof.proofs.every(item=>digest(read(item.filename))===item.hash);}catch{return false;}}
function createTicket({owner,defPath,review,proofs,read,current,restore}){
 if(owner.throwTicket?.token)tickets.delete(owner.throwTicket.token);
 const token=crypto.randomBytes(24).toString('hex'),entry={owner,defPath:key(defPath),review,plans:JSON.stringify(planSnapshot(defPath)),proofs:proofs.map(filename=>({filename:path.resolve(filename),hash:digest(read(filename))})),read,current,restore,target:null};tickets.set(token,entry);
 owner.panel?.onDidDispose?.(()=>tickets.delete(token));return Object.freeze({kind:'move-lab-throw',token});
}
// Saved-plan hashes authorize opening. Once bound, that exact target may save
// its own plan and return; origin selection/source proofs remain mandatory.
function ticket(reference,defPath,targetPanel){const entry=reference?.kind==='move-lab-throw'&&tickets.get(reference.token);if(!entry||entry.defPath!==key(defPath)||!entry.current())return null;try{if((!targetPanel||entry.target!==targetPanel)&&entry.plans!==JSON.stringify(planSnapshot(defPath)))return null;if(entry.proofs.some(proof=>digest(entry.read(proof.filename))!==proof.hash))return null;}catch{return null;}return entry;}
function bind(reference,defPath,panel){const entry=ticket(reference,defPath);if(!entry)return false;entry.target=panel;panel.onDidDispose?.(()=>{if(entry.target===panel)entry.target=null;});return true;}
async function returnToMoveLab(reference,defPath,panel){const entry=ticket(reference,defPath,panel);if(!entry||entry.target!==panel)return false;return await entry.restore()!==false;}
function publicHandoff(reference,entry){return{token:reference.token,tick:entry.review.choices.tick,frame:entry.review.choices.frame,summary:'Reviewed '+entry.review.p1State+' → '+entry.review.p2State+' · capture: '+entry.review.choices.capture};}
function clientScript({hostId='content'}={}){return `
let moveThrowTicket='',moveThrowReview=null,moveThrowEvidence=null,moveThrowInspection='',moveThrowObservedEpoch=selectionEpoch;const moveThrowDrafts={...(vscode.getState()?.moveThrowDrafts||{})};
function saveMoveThrowFields(){const root=document.getElementById('moveThrowHandshake');if(!root)return;const value={};for(const name of ['kind','entry','target','capture','release','codeOwner','animationOwner','p1Action','p2Action'])value[name]=root.querySelector('[data-throw-field="'+name+'"]').value;moveThrowDrafts[model.defPath]=value;vscode.setState({...vscode.getState(),moveThrowDrafts})}
function renderMoveThrowHandshake(){if(mode!=='throw')return;const root=document.createElement('section');root.className='card';root.id='moveThrowHandshake';root.innerHTML='<b>Throw / custom-state handshake</b><p>Review the participants before optionally continuing in Throw Creator. Proposed fields do not change authored code.</p><div data-throw-evidence></div><label>Method <select data-throw-field="kind"><option value="throw">Throw proposal</option><option value="custom">Keep custom method / direct state editing</option></select></label><label>Proposed P1 entry StateDef <input data-throw-field="entry"></label><label>Proposed target StateDef <input data-throw-field="target"></label><label>Capture condition <input data-throw-field="capture"></label><label>Target state code belongs to <select data-throw-field="codeOwner"><option value="unresolved">Unresolved / dynamic</option><option value="attacker">Attacker</option><option value="defender">Defender</option><option value="custom">Custom method</option></select></label><label>Target animation belongs to <select data-throw-field="animationOwner"><option value="unresolved">Unresolved / dynamic</option><option value="attacker">Attacker</option><option value="defender">Defender</option><option value="custom">Custom method</option></select></label><label>Release / return path <input data-throw-field="release"></label><label>Proposed P1 AIR action <select data-throw-field="p1Action"></select></label><label>Proposed P2 AIR action <select data-throw-field="p2Action"></select></label><div><button id="reviewMoveThrow" disabled>Review Handshake</button><button id="continueMoveThrow" disabled>Continue in Throw Creator</button><button id="stayMoveThrow">Stay in Move Lab</button></div><p id="moveThrowReviewStatus" role="status"></p>';document.getElementById('content').append(root);
const saved=moveThrowDrafts[model.defPath]||{};for(const name of ['p1Action','p2Action']){const select=root.querySelector('[data-throw-field="'+name+'"]'),empty=document.createElement('option');empty.value='';empty.textContent='Unresolved — choose an AIR action';select.append(empty);for(const action of model.visual?.actions||[]){const option=document.createElement('option');option.value=action.number;option.textContent=String(action.number);select.append(option)}select.value=saved[name]??model.visual?.[name]??''}for(const name of ['kind','entry','target','capture','release','codeOwner','animationOwner'])if(saved[name]!==undefined)root.querySelector('[data-throw-field="'+name+'"]').value=saved[name];for(const field of root.querySelectorAll('[data-throw-field]'))field.onchange=()=>{moveThrowTicket='';document.getElementById('continueMoveThrow').disabled=true;saveMoveThrowFields()};
document.getElementById('reviewMoveThrow').onclick=()=>{saveMoveThrowFields();const choices={...moveThrowDrafts[model.defPath],p1Action:root.querySelector('[data-throw-field="p1Action"]').value===''?null:Number(root.querySelector('[data-throw-field="p1Action"]').value),p2Action:root.querySelector('[data-throw-field="p2Action"]').value===''?null:Number(root.querySelector('[data-throw-field="p2Action"]').value),mode,tick:Math.max(0,Math.round(tick)),frame:Number.isSafeInteger(model.handoffFrame)?model.handoffFrame:(()=>{let end=0;const frames=model.visual?.p1?.frames||[];for(let index=0;index<frames.length;index++){end+=Math.max(1,Number(frames[index].time)||1);if(tick<end)return index}return Math.max(0,frames.length-1)})(),timelineScope:model.eventTimeline?.scope?.id||'air-only',inspectionToken:moveThrowInspection};vscode.postMessage({type:'moveLabThrowReview',generation,selectionEpoch,choices})};document.getElementById('continueMoveThrow').onclick=()=>{if(moveThrowReview?.choices?.tick!==Math.max(0,Math.round(tick))){moveThrowTicket='';document.getElementById('continueMoveThrow').disabled=true;document.getElementById('moveThrowReviewStatus').textContent='The preview frame changed. Review the handshake again.';}if(moveThrowTicket)vscode.postMessage({type:'moveLabThrowContinue',generation,selectionEpoch,token:moveThrowTicket})};document.getElementById('stayMoveThrow').onclick=()=>{moveThrowTicket='';saveMoveThrowFields();document.getElementById('continueMoveThrow').disabled=true;document.getElementById('moveThrowReviewStatus').textContent='Staying in Move Lab. Your proposed fields are retained; no source changed.'};vscode.postMessage({type:'moveLabThrowInspect',generation,selectionEpoch})}
const beforeThrowHandshakeRender=render;render=()=>{saveMoveThrowFields();moveThrowTicket='';beforeThrowHandshakeRender();renderMoveThrowHandshake()};renderMoveThrowHandshake();
window.addEventListener('message',event=>{const message=event.data||{};if(message.type==='moveLabToolbarState'&&moveThrowObservedEpoch!==selectionEpoch){moveThrowObservedEpoch=selectionEpoch;moveThrowTicket='';moveThrowInspection='';document.getElementById('continueMoveThrow')?.setAttribute('disabled','');document.getElementById('reviewMoveThrow')?.setAttribute('disabled','');if(mode==='throw')vscode.postMessage({type:'moveLabThrowInspect',generation,selectionEpoch});}if(['moveLabThrowEvidence','moveLabThrowReviewed'].includes(message.type)&&(message.generation!==generation||message.selectionEpoch!==selectionEpoch))return;if(message.type==='moveLabThrowEvidence'){moveThrowEvidence=message.evidence;moveThrowInspection=message.evidence.inspectionToken;document.getElementById('reviewMoveThrow')?.removeAttribute('disabled');const root=document.getElementById('moveThrowHandshake');if(!root)return;const host=root.querySelector('[data-throw-evidence]');host.textContent=(message.evidence.participantStatus||[]).join(' | ')+'. Authored evidence: entry '+(message.evidence.entry||'unresolved')+'; target '+(message.evidence.target||'unresolved')+'; code owner '+message.evidence.codeOwner+'; animation owner '+message.evidence.animationOwner+'; capture condition '+(message.evidence.capture||'unresolved')+'; capture attributes '+(message.evidence.captureAttributes||'not authored')+'; release '+(message.evidence.release||'unresolved')+'. '+message.evidence.detail;for(const link of message.evidence.links||[]){const button=document.createElement('button');button.textContent=link.label+' · '+link.lineLabel;button.onclick=()=>vscode.postMessage({type:'moveLabThrowSource',generation,selectionEpoch,slot:link.slot});host.append(button)}if(!moveThrowDrafts[model.defPath])for(const name of ['entry','target','capture','release','codeOwner','animationOwner'])root.querySelector('[data-throw-field="'+name+'"]').value=message.evidence[name]||'';}if(message.type==='moveLabThrowReviewed'){const root=document.getElementById('moveThrowHandshake');if(!root||['kind','entry','target','capture','release','codeOwner','animationOwner','p1Action','p2Action'].some(name=>root.querySelector('[data-throw-field="'+name+'"]').value!==String(message.review.choices?.[name]??'')))return;moveThrowReview=message.review;moveThrowTicket=message.review.canContinue?message.token:'';const button=document.getElementById('continueMoveThrow'),status=document.getElementById('moveThrowReviewStatus');if(button)button.disabled=!moveThrowTicket;if(status)status.textContent=message.review.canContinue?'Reviewed proposal. '+(message.review.proposedStatus||[]).join(' | ')+'. Continue is optional; navigation does not write source.':message.review.issues.join(' ');}if(message.type==='moveLabThrowStatus'){const status=document.getElementById('moveThrowReviewStatus');if(status)status.textContent=message.text;}if(message.type==='moveLabThrowRestore'){mode=message.mode;tick=message.tick;saveShellState();render();draw();syncMoveTimeline();}});
`.replace("document.getElementById('content').append(root)",`document.getElementById(${JSON.stringify(hostId)}).append(root)`);}
function richClientScript(){return `
(function(getRich){let model={},mode='overview',tick=0,generation=0,selectionEpoch=0;function saveShellState(){}function draw(){}function syncMoveTimeline(){}function render(){document.getElementById('moveThrowHandshake')?.remove();}
${clientScript({hostId:'richMoveThrowMount'})}
const button=document.getElementById('throwCreator');if(button){button.textContent='Review Throw / Custom State Handshake';button.onclick=()=>{const current=getRich();current.flush();generation++;moveThrowInspection='';const mount=document.getElementById('richMoveThrowMount')||document.createElement('section');mount.id='richMoveThrowMount';if(!mount.parentElement)(document.querySelector('.layout .right')||document.querySelector('main')||document.body).append(mount);model={defPath:current.model.files.defPath,visual:{actions:current.model.airActions||[],p1Action:current.move?.timeline?.actionNumber,p2Action:undefined},handoffFrame:current.frame||0,eventTimeline:{scope:{id:'air-only'}}};mode='throw';tick=(current.move?.timeline?.frames||[]).slice(0,current.frame||0).reduce((total,frame)=>total+Math.max(1,Number(frame.time)||1),0);render();mount.scrollIntoView({block:'nearest'});};}
window.addEventListener('message',event=>{const message=event.data||{};if(message.type==='moveLabThrowRichRestore'){const current=getRich();if(message.selection?.kind==='constants'){if(current.model.moves.some(move=>move.id===message.selection.id))current.selectMove(message.selection.id,undefined,message.frameIndex);else document.getElementById('status').textContent='The originating move changed; no other move was selected.';}else if(message.selection?.componentReference)current.direct.select(message.selection.componentReference);}});
})(()=>({model,move,frame,selectMove,direct:moveDirectUi,flush:saveState}));
`;}
async function handleRich(owner,message,services){
 if(!services.isCurrent()||!owner.panel.active)return false;
 const signature=JSON.stringify(owner.displaySelection);
 if(message.type==='moveLabThrowSource'){const link=owner.throwLinks?.get(message.slot);return link&&link.signature===signature&&digest(services.read(link.filename))===link.hash?services.openSource(link):false;}
 if(message.type==='moveLabThrowContinue'){const reference=owner.throwTicket;if(reference?.token!==message.token||!ticket(reference,owner.assets.defPath)?.review.canContinue){owner.panel.webview.postMessage({type:'moveLabThrowStatus',text:'The originating selection or source changed. Review the relationship again; no other participant was selected.'});return false;}return services.open(reference);}
 const data=require('./move_lab_model').buildMoveLabModel(owner.assets.defPath,services.documents||[],[]);data.visual={actions:owner.model.airActions||[]};
 const source=await services.source(),evidence=inspectHandshake(data,source,services.read),proofs=[owner.assets.defPath,owner.assets.air,owner.assets.constants,...(owner.assets.code||[]),source?.filename].filter(Boolean);
 if(message.type==='moveLabThrowInspect'){owner.panel.webview.postMessage({type:'moveLabThrowEvidence',generation:message.generation,selectionEpoch:message.selectionEpoch,evidence:inspectProof(owner,evidence,signature,proofs,services.read)});return true;}
 if(message.type==='moveLabThrowReview'){
  if(!inspectionCurrent(owner,message.choices?.inspectionToken,signature,services.read)){owner.panel.webview.postMessage({type:'moveLabThrowStatus',text:'The inspected selection changed. Open the handshake review again; your proposed fields are retained.'});return false;}
  const review=reviewHandshake(data,evidence,message.choices),selection=JSON.parse(signature),reference=createTicket({owner,defPath:owner.assets.defPath,review,proofs,read:services.read,current:()=>services.isCurrent()&&JSON.stringify(owner.displaySelection)===signature,restore:async()=>{if(!services.isCurrent()||JSON.stringify(owner.displaySelection)!==signature)return false;owner.panel.reveal(undefined,false);owner.panel.webview.postMessage({type:'moveLabThrowRichRestore',selection,frameIndex:review.choices.frame});return true;}});
  owner.throwTicket=reference;owner.panel.webview.postMessage({type:'moveLabThrowReviewed',generation:message.generation,selectionEpoch:message.selectionEpoch,token:reference.token,review});return true;
 }
 return false;
}
module.exports={literal,planSnapshot,inspectProof,inspectionCurrent,inspectHandshake,validChoices,reviewHandshake,planMatches,choosePlan,createTicket,ticket,bind,returnToMoveLab,publicHandoff,clientScript,richClientScript,handleRich};
