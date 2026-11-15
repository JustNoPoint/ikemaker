'use strict';

const HEADER = /^\s*(Clsn[12])(Default)?\s*:\s*(\d+)\s*(;[^\r\n]*)?\s*$/i;
const BOX = /^(\s*)(Clsn[12])\s*\[\s*(\d+)\s*\]\s*=\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*(;[^\r\n]*)?\s*$/i;
const SORTS = ['index','top-bottom','bottom-top','left-right','right-left','smallest-area','largest-area'];
function scan(text, repairCounts = false) {
  const lines=[...String(text).matchAll(/[^\r\n]*(?:\r\n|\n|$)/g)].filter(line=>line[0].length),actions=[];
  let action,defaults={},pending={};
  for(let i=0;i<lines.length;i++) {
    const line=lines[i][0],heading=/^\s*\[\s*Begin\s+Action\s+(-?\d+)\s*\]/i.exec(line);
    if(heading){action={number:Number(heading[1]),start:lines[i].index,line:i,frames:[],blocks:[]};actions.push(action);defaults={};pending={};continue;}
    if(!action)continue;
    if(/^\s*(?:CopyAction|Fallthrough|Clsn\w*\s*\[\s*\d+\s*,)/i.test(line))throw Error('Inherited actions and indexed collision syntax require AIR Source review.');
    const header=HEADER.exec(line);
    if(header){
      const kind=header[1].toLowerCase(),count=Number(header[3]),boxes=[];let consumed=0,cursor=i+1,trivia=[];
      if(count>256)throw Error('Collision blocks are limited to 256 boxes.');
      while(cursor<lines.length&&(repairCounts||boxes.length<count)) {
        const raw=lines[cursor][0];
        if(/^\s*(?:;[^\r\n]*)?\s*$/.test(raw)){trivia.push(raw);cursor++;continue;}
        const box=BOX.exec(raw);if(!box||box[2].toLowerCase()!==kind)break;
        boxes.push({slot:Number(box[3]),rect:box.slice(4,8).map(Number),raw,leading:trivia.slice(),comment:box[8]||'',indent:box[1]});trivia=[];consumed=cursor-i;cursor++;
        if(boxes.length>256)throw Error('Collision blocks are limited to 256 boxes.');
      }
      if(!repairCounts&&boxes.length!==count)throw Error('Incomplete or unsupported collision block. Review AIR Source.');
      if(new Set(boxes.map(box=>box.slot)).size!==boxes.length)throw Error('Duplicate collision indices require AIR Source review.');
      if(count===0&&boxes.length)throw Error('An explicitly empty block has stray assignments. Review AIR Source rather than reviving its boxes.');
      const block={kind,isDefault:!!header[2],start:lines[i].index,end:lines[i+consumed].index+lines[i+consumed][0].length,boxes,declaredCount:count,header:line,headerComment:header[4]||'',indent:/^\s*/.exec(line)[0]};
      action.blocks.push(block);if(block.isDefault)defaults[kind]=block;else{if(pending[kind])throw Error('Multiple local collision declarations require AIR Source review.');pending[kind]=block;}i+=consumed;continue;
    }
    if(/^\s*Clsn[12]\s*(?:\[|:|Default)/i.test(line))throw Error('Unsupported collision declaration requires AIR Source review.');
    if(/^\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+/.test(line)){action.frames.push({start:lines[i].index,local:{...pending},effective:{...defaults,...pending}});pending={};}
  }
  if(new Set(actions.map(item=>item.number)).size!==actions.length)throw Error('Duplicate action IDs require AIR Source review.');
  return {actions,lines};
}
function settings(request={}) {
  const count=request.boxCount===undefined?1:Number(request.boxCount),alphaThreshold=request.alphaThreshold===undefined?1:Number(request.alphaThreshold),layout=request.layout||'auto',kind=request.kind||'clsn2',sort=request.sort||'index';
  if(!Number.isSafeInteger(count)||count<1||count>100)throw Error('Box count must be a whole number from 1 to 100.');
  if(!Number.isSafeInteger(alphaThreshold)||alphaThreshold<1||alphaThreshold>255)throw Error('Alpha cutoff must be a whole number from 1 to 255.');
  if(!['auto','stacked','side-by-side'].includes(layout)||!['clsn1','clsn2',...(request.mode==='normalize'?['both']:[])].includes(kind)||!SORTS.includes(sort))throw Error('Choose a supported box layout, collision kind and sort order.');
  return {count,alphaThreshold,layout,kind,sort};
}
function silhouetteBoxes(image,sprite,frame,request={}) {
  const options=settings(request);
  if(!image||image.hasAlpha===false)return [];
  return require('./air_silhouette_fit').fitSilhouette(image,sprite,frame,{count:options.count,layout:options.layout,alphaThreshold:options.alphaThreshold});
}
function compareBoxes(sort) {
  const bounds=box=>{const [x1,y1,x2,y2]=box.rect;return [Math.min(x1,x2),Math.min(y1,y2),Math.max(x1,x2),Math.max(y1,y2),Math.abs((x2-x1)*(y2-y1))];};
  return (left,right)=>{const a=bounds(left),b=bounds(right);return sort==='top-bottom'?a[1]-b[1]:sort==='bottom-top'?b[1]-a[1]:sort==='left-right'?a[0]-b[0]:sort==='right-left'?b[0]-a[0]:sort==='smallest-area'?a[4]-b[4]:sort==='largest-area'?b[4]-a[4]:left.slot-right.slot;};
}
function normalizeBlock(block,options,eol) {
  const ordered=block.boxes.slice().sort(compareBoxes(options.sort)),reindex=options.reindex===true;
  // Preserve numeric identities unless the artist explicitly accepts a slot remap.
  if(!reindex&&block.boxes.map(box=>box.slot).sort((a,b)=>a-b).some((slot,index)=>slot!==index))throw Error('Sparse collision indices require the explicit renumbering option. Numeric identities cannot be preserved while filling those gaps.');
  const count=ordered.length,name=block.kind==='clsn1'?'Clsn1':'Clsn2';
  const header=block.header.replace(/(:\s*)\d+/,(_,prefix)=>prefix+count),mappings=[];
  const text=header+ordered.map((box,index)=>{
    const slot=reindex?index:box.slot;if(slot!==box.slot)mappings.push({before:box.slot,after:slot});
    return (box.leading||[]).join('')+box.raw.replace(/(Clsn[12]\s*\[\s*)\d+(\s*\])/i,(_,prefix,suffix)=>prefix+slot+suffix);
  }).join('');
  return {text,mappings,commentsMoved:ordered.some((box,index)=>box!==block.boxes[index])?ordered.reduce((sum,box)=>sum+(box.comment?1:0)+(box.leading||[]).filter(line=>/^\s*;/.test(line)).length,0):0,countChanged:count!==block.declaredCount};
}
function authoredComments(block,eol) {
  const result=[];
  if(block.headerComment)result.push(block.indent+block.headerComment+eol);
  for(const box of block.boxes){result.push(...(box.leading||[]));if(box.comment)result.push(box.indent+box.comment+eol);}
  return result.join('');
}
function cleanup(text,request,artwork=()=>null) {
  const options=settings(request),parsed=scan(text,request.mode==='normalize'),patches=[],rows=[],mappings=[],selected=new Set(request.actions),eol=text.includes('\r\n')?'\r\n':'\n';let materialized=0,commentsMoved=0;
  if(!selected.size||!['normalize','silhouette'].includes(request.mode))throw Error('Choose actions and a cleanup operation.');
  for(const number of selected)if(!parsed.actions.some(action=>action.number===number))throw Error('A selected action is missing. Refresh the selection.');
  const poses=new Map(require('./air_preview_model').parseAir(text).map(action=>[action.number,action]));
  for(const action of parsed.actions.filter(action=>selected.has(action.number))) {
    if(request.mode==='normalize')for(const block of action.blocks){
      if((request.kind?(request.kind!=='both'&&block.kind!==request.kind):(request.hurtOnly!==false&&block.kind!=='clsn2'))||request.explicitOnly===true&&block.isDefault)continue;
      const normalized=normalizeBlock(block,{...options,reindex:request.reindex},eol),before=text.slice(block.start,block.end);
      if(normalized.text===before)continue;
      const elements=action.frames.map((frame,index)=>frame.effective[block.kind]===block?index+1:null).filter(Boolean);
      patches.push({start:block.start,end:block.end,text:normalized.text});commentsMoved+=normalized.commentsMoved;
      mappings.push(...normalized.mappings.map(mapping=>({...mapping,action:action.number,kind:block.kind,elements})));
      rows.push('Action '+action.number+', elements '+elements.join(', ')+': '+options.sort+' '+block.kind+(block.isDefault?'Default':'')+(normalized.countChanged?'; count corrected':'')+(normalized.mappings.length?'; slots '+normalized.mappings.map(item=>item.before+'→'+item.after).join(', '):'; numeric identities retained'));
    } else for(let index=0;index<action.frames.length;index++){
      const frame=action.frames[index],local=frame.local[options.kind],effective=frame.effective[options.kind],label='Action '+action.number+', element '+(index+1);
      if(request.explicitOnly===true&&!local){rows.push(label+': skipped inherited/absent '+options.kind+' (explicit-only)');continue;}
      if(effective&&!effective.boxes.length){rows.push(label+': preserved deliberately empty '+options.kind);continue;}
      if(!effective&&request.includeAbsent!==true){rows.push(label+': skipped absent '+options.kind+' (opt in to add new boxes)');continue;}
      const pose=poses.get(action.number)?.frames[index],image=pose&&artwork(pose,options),boxes=image&&silhouetteBoxes(image.image,image.sprite,pose,request);
      if(!boxes?.length){rows.push(label+': skipped missing, unreadable, transparent or RGB24 artwork');continue;}
      const name=options.kind==='clsn1'?'Clsn1':'Clsn2',commentText=local?authoredComments(local,eol):'',replacement=commentText+name+': '+boxes.length+eol+boxes.map((rect,slot)=>name+'['+slot+'] = '+rect.join(', ')+eol).join('');
      patches.push({start:local?local.start:frame.start,end:local?local.end:frame.start,text:replacement});
      if(!local&&effective?.isDefault)materialized++;
      if(local)commentsMoved+=(local.headerComment?1:0)+local.boxes.reduce((sum,box)=>sum+(box.comment?1:0)+(box.leading||[]).filter(line=>/^\s*;/.test(line)).length,0);
      rows.push(label+': propose '+name+' '+boxes.length+'/'+options.count+' boxes ('+options.layout+', alpha ≥ '+options.alphaThreshold+'): '+boxes.map(rect=>rect.join(', ')).join(' | '));
    }
  }
  const references=request.references||[],referenceLines=references.map(item=>item.filename+':'+item.line+' '+item.text);
  const detail=(request.mode==='normalize'?'Normalize existing declarations; sort '+options.sort+'. '+(request.reindex?'Renumbering enabled: compare the slot mappings and index-sensitive code below.':'Numeric box identities retained; code references are not rewritten.'):'Silhouette proposals: '+options.kind+', up to '+options.count+' boxes, '+options.layout+', alpha cutoff '+options.alphaThreshold)+ '\nScope: '+(request.explicitOnly?'only frame-local declarations':'local and inherited/default ownership as listed')+'\n'+rows.join('\n')+'\nInherited blocks made local: '+materialized+'. Comment lines/end-of-line comments retained or moved with their boxes: '+commentsMoved+'.\nIndex-sensitive assigned source review: '+(referenceLines.length?referenceLines.join('\n'):(request.referenceStatus||'No source inventory supplied; index-sensitive references remain unverified.'))+'\nShared defaults remain shared; silhouette proposals create local overrides. Unselected kinds and actions are preserved.';
  return {patches,rows,detail,indexMappings:mappings,commentsMoved,materialized,references};
}
module.exports={scan,settings,silhouetteBoxes,compareBoxes,normalizeBlock,cleanup,SORTS};
