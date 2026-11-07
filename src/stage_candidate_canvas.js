'use strict';
const {hash}=require('./mutation_safety'),{candidateReceipt}=require('./stage_candidate_preview');
function createStageCandidateCanvas(owner,env){
 let pending;
 const current=record=>{try{return !owner.disposed&&!owner.invalidated&&owner.filename===record.candidate.ownerFilename&&owner.generation===record.candidate.ownerGeneration&&owner.payload?.sourceHash===record.candidate.sourceHash&&hash(env.read())===record.candidate.sourceHash;}catch{return false;}};
 const refuse=(record,reason)=>{if(record.resolved)return;record.resolved=true;record.resolve(null);Promise.resolve().then(()=>env.refuse?.(reason)).catch(()=>{});};
 return{
  async previewCandidate(candidate){
   if(pending)throw Error('Finish the current Stage candidate review first.');
   if(candidate?.kind!=='stage-candidate'||hash(candidate.text)!==candidate.candidateHash||!/^[a-f0-9]{48}$/.test(candidate.token))throw Error('Invalid Stage candidate review.');
   const record={candidate,ready:false,resolved:false};if(!current(record))throw Error('Stage candidate source or owner changed before Canvas review.');
   const html=await env.build(candidate);if(!current(record))throw Error('Stage candidate source changed while preparing artwork.');
   let resolve;const result=new Promise(done=>resolve=done);record.resolve=resolve;pending=record;owner.candidateReview=record;
   try{if(await env.post({type:'stageCandidateCanvas',action:'show',token:candidate.token,generation:candidate.ownerGeneration,candidateHash:candidate.candidateHash,html})===false)throw Error('Stage candidate Canvas is unavailable. No changes were applied.');}catch(error){pending=undefined;owner.candidateReview=undefined;throw error;}
   return result;
  },
  handle(message){
   if(!pending)return false;const record=pending,c=record.candidate;
   // While reviewing, every other host route is blocked, including forged Undo,
   // toolbar navigation and mutations. Inspection remains inside the isolated frame.
   if(!message||message.token!==c.token||message.generation!==c.ownerGeneration||message.candidateHash!==c.candidateHash)return true;
   if(message.type==='stageCandidateError'&&typeof message.reason==='string'){refuse(record,'Candidate preview could not render: '+message.reason.slice(0,512));return true;}
   if(message.type==='stageCandidateReady'&&Object.keys(message).sort().join()==='candidateHash,generation,hasDrafts,token,type'&&typeof message.hasDrafts==='boolean'){if(!current(record)){refuse(record,'Stage source changed during candidate inspection. Nothing was applied.');return true;}record.ready=!message.hasDrafts;return true;}
   if(message.type==='stageCandidateChoice'&&Object.keys(message).sort().join()==='accepted,candidateHash,generation,token,type'&&typeof message.accepted==='boolean'&&!record.resolved){
    if(message.accepted&&!current(record)){refuse(record,'Stage source changed before candidate approval. Nothing was applied.');return true;}if(message.accepted&&!record.ready)return true;
    record.resolved=true;record.resolve(message.accepted?candidateReceipt(c):null);
   }return true;
  },
  cancel(reason){if(pending&&!pending.resolved){if(reason)refuse(pending,reason);else{pending.resolved=true;pending.resolve(null);}}},
  async clearCandidate(token){if(!pending||pending.candidate.token!==token)return false;const record=pending;pending=undefined;owner.candidateReview=undefined;if(!record.resolved)record.resolve(null);if(!owner.disposed)await env.post({type:'stageCandidateCanvas',action:'hide',token});return true;},
  pending:()=>pending
 };
}
function stageCandidateFrameHtml(html,candidate,nonce){
 const data=JSON.stringify({token:candidate.token,generation:candidate.ownerGeneration,candidateHash:candidate.candidateHash,label:candidate.label,detail:candidate.detail}).replace(/</g,'\\u003c');
 const shim=`<script>function acquireVsCodeApi(){return{getState:()=>undefined,setState:()=>{},postMessage:message=>{if(['stageCandidateReady','stageCandidateChoice'].includes(message?.type))parent.postMessage(message,'*')}}}window.onerror=message=>parent.postMessage({...${data},type:'stageCandidateError',reason:String(message).slice(0,512)},'*');</script>`;
 let result=html.replace('<head>','<head>'+shim).replace('</body>',`<script>(${candidateInspectorClient.toString()})(${data})</script></body>`);
 if(nonce)result=result.replace(/<(script|style)(?=[\s>])/gi,(_,tag)=>'<'+tag+' nonce="'+nonce+'"');return result;
}
function candidateInspectorClient(candidate){
 const bridge=acquireVsCodeApi(),section=document.createElement('section');section.id='stageCandidateBanner';section.setAttribute('role','region');section.setAttribute('aria-label','Review Stage candidate');section.style.cssText='padding:8px;border:2px solid var(--accent,#38d5d5);flex:0 0 auto;background:var(--panel,#181b20)';
 const title=document.createElement('strong');title.textContent=candidate.label+' — Canvas preview';const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('pre');summary.textContent='Review destination and changes';text.textContent=candidate.detail;text.style.cssText='white-space:pre-wrap;max-height:180px;overflow:auto';details.append(summary,text);
 const status=document.createElement('p');status.id='stageCandidateStatus';status.setAttribute('role','status');status.textContent='Loading candidate artwork. No files have been written.';const apply=document.createElement('button'),cancel=document.createElement('button');apply.id='stageCandidateApply';apply.textContent='Apply reviewed change';apply.disabled=true;cancel.id='stageCandidateCancel';cancel.textContent='Cancel preview';
 section.append(title,details,status,apply,cancel);document.body.insertBefore(section,document.querySelector('.app'));
 const inspect=new Set(['stageCandidateApply','stageCandidateCancel','fit','guides','stagePrevious','stageNext']);
 function disable(){for(const button of document.querySelectorAll('button'))if(!inspect.has(button.id)&&!button.dataset.stageNavMode){button.disabled=true;button.title='Candidate review: inspect layers and camera, then Apply or Cancel.';}for(const select of document.querySelectorAll('select'))if(!['backgroundKind','backgroundView','stageDirectSelect'].includes(select.id))select.disabled=true;for(const field of document.querySelectorAll('input,textarea'))if(!['cameraX','cameraY','cameraZoom','timeline','backgroundFilter','stageBackgroundScroll'].includes(field.id)&&!field.closest('#backgrounds'))field.disabled=true;}
 disable();new MutationObserver(disable).observe(document.body,{subtree:true,childList:true});
 document.addEventListener('dragstart',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
 document.addEventListener('mousedown',event=>{if(event.target.id==='canvas'&&event.button===0){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('keydown',event=>{if(event.target.id==='canvas'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','BackSpace'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();}},true);
 const post=(type,extra={})=>bridge.postMessage({type,token:candidate.token,generation:candidate.generation,candidateHash:candidate.candidateHash,...extra});
 apply.onclick=()=>{if(apply.disabled)return;apply.disabled=true;cancel.disabled=true;status.textContent='Applying the reviewed candidate…';post('stageCandidateChoice',{accepted:true});};cancel.onclick=()=>{apply.disabled=true;cancel.disabled=true;post('stageCandidateChoice',{accepted:false});};
 let artworkReady=false,policyReceived=false,blockedReason='';const update=()=>{apply.disabled=!artworkReady||!policyReceived||Boolean(blockedReason);if(blockedReason)status.textContent=blockedReason;};window.addEventListener('message',event=>{const m=event.data;if(event.source!==parent||m?.type!=='stageCandidatePolicy'||m.token!==candidate.token||m.generation!==candidate.generation||m.candidateHash!==candidate.candidateHash||typeof m.blockedReason!=='string')return;policyReceived=true;blockedReason=m.blockedReason;update();});
 const deadline=Date.now()+10000;function ready(){try{assertCaptureArtworkReady();artworkReady=true;status.textContent='Inspect the candidate group, layers and camera. Canvas does not simulate BGCtrl or attached-code behavior. Apply writes only the reviewed destination; Cancel keeps the original preview.';update();post('stageCandidateReady');}catch(error){status.textContent=error.message;if(Date.now()<deadline&&/loading/i.test(error.message))setTimeout(ready,50);}}ready();cancel.focus({preventScroll:true});
}
function installStageCandidateCanvas(env){
 const {window,document,post}=env;let active;
 function hide(token){if(!active||active.token!==token)return;const previous=active;active=null;previous.frame.remove();for(const [node,inert]of previous.inert)if(node.isConnected)node.inert=inert;if(previous.focus?.isConnected)previous.focus.focus({preventScroll:true});}
 window.addEventListener('message',event=>{const message=event.data;if(message?.type==='stageCandidateCanvas'){
  if(message.action==='hide'){hide(message.token);return;}if(message.action!=='show'||active||typeof message.html!=='string')return;
  const frame=document.createElement('iframe');frame.title='Stage candidate Canvas review';frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('role','dialog');frame.setAttribute('aria-modal','true');frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:10000;background:#101217';const inert=[...document.body.children].map(node=>[node,Boolean(node.inert)]);for(const [node]of inert)node.inert=true;active={frame,inert,focus:document.activeElement,token:message.token,generation:message.generation,candidateHash:message.candidateHash,hasDrafts:Boolean(env.drafts?.())};frame.onload=()=>{if(active?.frame===frame)frame.contentWindow.postMessage({type:'stageCandidatePolicy',token:active.token,generation:active.generation,candidateHash:active.candidateHash,blockedReason:active.hasDrafts?'Candidate inspection only: finish or cancel the original position/floor/seam/depth preview before applying this change. Cancel returns to those previews unchanged.':''},'*');};document.body.append(frame);frame.srcdoc=message.html;return;
 }if(!active||event.source!==active.frame.contentWindow||message?.token!==active.token||message.generation!==active.generation||message.candidateHash!==active.candidateHash||!['stageCandidateReady','stageCandidateChoice','stageCandidateError'].includes(message.type))return;post(message.type==='stageCandidateReady'?{...message,hasDrafts:active.hasDrafts}:message);
 });return{active:()=>Boolean(active)};
}
module.exports={createStageCandidateCanvas,stageCandidateFrameHtml,installStageCandidateCanvas};
