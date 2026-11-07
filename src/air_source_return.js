'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {parseAir}=require('./air_preview_model');
const returns=new Map(),key=file=>path.resolve(file||'.').toLowerCase();
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function readText(filename,services){const doc=(services.getDocuments?.()||services.documents||[]).find(item=>!item.isClosed&&key(item.fileName)===key(filename));return doc?doc.getText():fs.readFileSync(filename,'utf8');}
function captureAirSourceReturn(session,services={}){
 if(session?.airPath)returns.delete(key(services.sourceFile||session.airPath));
 const selection=session?.sourceReturnSelection&&session.sourceReturnSelection.context===session.sourceReturnContext?session.sourceReturnSelection:null,selectedAction=selection?.action??session?.selectedAction,selectedFrame=selection?.frameIndex??session?.selectedFrame;
 if(session?.unavailable||session?.disposed||!session?.airPath||!session?.sffPath||!Number.isInteger(selectedAction)||!Number.isInteger(selectedFrame))return false;
 const owners=[...new Set((session.ownerDefs||[]).filter(Boolean).map(file=>path.resolve(file)))];
 if(owners.length>1)return false;
 const airPath=path.resolve(session.airPath),sffPath=path.resolve(session.sffPath),ownerDef=owners[0]||'',sffBytes=fs.readFileSync(sffPath),stat=fs.statSync(sffPath);
 const actions=parseAir(readText(airPath,services)).filter(action=>action.number===selectedAction),frame=actions.length===1?actions[0].frames[selectedFrame]:null;if(!frame||selection&&(frame.group!==selection.group||frame.index!==selection.index))return false;
 const connectedAirBinding=session.connectedAirBinding?Object.freeze({...session.connectedAirBinding}):null;
 const sourcePath=path.resolve(services.sourceFile||airPath),token=Object.freeze({sourcePath,airPath,sffPath,ownerDef,connectedAirBinding,ownerHash:ownerDef?hash(readText(ownerDef,services)):'',sffHash:hash(sffBytes),sffDevice:String(stat.dev),sffInode:String(stat.ino),action:selectedAction,frameIndex:selectedFrame,frameCount:actions[0].frames.length,frameGroup:frame.group,frameNumber:frame.index});
 returns.delete(key(sourcePath));returns.set(key(sourcePath),token);while(returns.size>64)returns.delete(returns.keys().next().value);return true;
}
function resolveAirSourceReturn(filename,ownerDef='',services={}){
 const token=returns.get(key(filename));if(!token)return{available:false};
 try{
  if(key(filename)!==key(token.sourcePath)||String(ownerDef?key(ownerDef):'')!==String(token.ownerDef?key(token.ownerDef):''))throw Error('The AIR return belongs to a different character.');
  const stat=fs.statSync(token.sffPath);
  if(String(stat.dev)!==token.sffDevice||String(stat.ino)!==token.sffInode||hash(fs.readFileSync(token.sffPath))!==token.sffHash)throw Error('The sprite archive changed since this AIR viewer opened its source.');
  if(token.ownerDef){
   const ownerText=readText(token.ownerDef,services);if(hash(ownerText)!==token.ownerHash)throw Error('The character definition changed since the AIR source handoff.');
   const assigned=services.resolveAssigned&&!token.connectedAirBinding?services.resolveAssigned(token.ownerDef,ownerText):null;
   const resolved=assigned?{sffPath:assigned.sff,airPath:assigned.air}:(services.resolveBinding||require('./air_viewer').resolveAirCharacterFiles)(token.airPath,[token.ownerDef],{openDocuments:services.getDocuments?.()||services.documents||[]},token.connectedAirBinding);
   if(!resolved?.sffPath||key(resolved.sffPath)!==key(token.sffPath)||(resolved.airPath&&key(resolved.airPath)!==key(token.airPath)))throw Error('The character no longer assigns this exact AIR and sprite archive, or its connected binding is ambiguous.');
  }
  const matches=parseAir(readText(token.airPath,services)).filter(action=>action.number===token.action);
  if(matches.length!==1)throw Error('The returning AIR action was deleted or is ambiguous.');
  if(!matches[0].frames[token.frameIndex])throw Error('The returning AIR frame was deleted.');
  if(matches[0].frames.length!==token.frameCount||matches[0].frames[token.frameIndex].group!==token.frameGroup||matches[0].frames[token.frameIndex].index!==token.frameNumber)throw Error('The returning AIR frame sequence changed.');
  return{available:true,token};
 }catch(error){returns.delete(key(filename));return{available:false,refused:true,reason:error.message+' Open the intended animation explicitly.'};}
}
function clearAirSourceReturn(filename){returns.delete(key(filename));}
function retainAirReturnOwner(ownerDef=''){for(const [source,token]of returns)if((token.ownerDef?key(token.ownerDef):'')!==(ownerDef?key(ownerDef):''))returns.delete(source);}
function recordAirReturnFrame(session,message){
 const selection=message.navigationSelection,requestId=message.requestId;
 if(!selection||!session.sourceReturnContext||selection.context!==session.sourceReturnContext||key(selection.airPath)!==key(session.airPath)||key(selection.sffPath)!==key(session.sffPath)||!Number.isSafeInteger(requestId)||requestId<0||requestId<=(session.sourceReturnRequestId??-1)||!Number.isInteger(selection.action)||!Number.isInteger(selection.frameIndex)||selection.frameIndex<0)return false;
 const frame=session.sourceReturnFrameRefs?.get(`${selection.action}:${selection.frameIndex}`);
 if(!frame||frame.group!==message.frame?.group||frame.index!==message.frame?.index)return false;
 session.sourceReturnRequestId=requestId;session.sourceReturnSelection={context:selection.context,action:selection.action,frameIndex:selection.frameIndex,group:frame.group,index:frame.index};return true;
}
async function openAirSourceReturn(filename,ownerDef,services){
 const resolved=resolveAirSourceReturn(filename,ownerDef,services);
 if(resolved.refused){services.inform(resolved.reason);return{handled:true,opened:false};}
 if(!resolved.available)return{handled:false};
 const token=resolved.token;
 const opened=await services.open(token.airPath,{preserveFocus:false,action:token.action,frameIndex:token.frameIndex,ownerDef:token.ownerDef,connectedAirBinding:token.connectedAirBinding,sourceReturnGuard:()=>{if(returns.get(key(filename))!==token){services.inform('A newer AIR source handoff superseded this return. Use Animations again.');return false;}const current=resolveAirSourceReturn(filename,ownerDef,services);if(!current.available||current.token!==token){services.inform(current.reason||'The AIR return changed before it could open.');return false;}return true;}});
 return{handled:true,opened};
}
module.exports={captureAirSourceReturn,resolveAirSourceReturn,clearAirSourceReturn,retainAirReturnOwner,recordAirReturnFrame,openAirSourceReturn};
