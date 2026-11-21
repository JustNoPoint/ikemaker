'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {isDeepStrictEqual}=require('node:util');

const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0;}return table;})();
function crc32(buffer){let c=0xffffffff;for(const byte of buffer)c=crcTable[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function iniValue(text,name){const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=text.match(new RegExp(`^[ \\t]*${escaped}[ \\t]*=[ \\t]*(.*?)[ \\t]*\\r?$`,'im'));return match?.[1]||'';}
function safeScreenshotPrefix(title){const value=String(title||'').replace(/[<>:"/\\|?*]/g,'_').trim().replace(/ /g,'_');return value||'ikemen';}

function resolveScreenshotFolder(runtime){
  const root=fs.realpathSync(runtime);const config=path.join(root,'save','config.ini');let configured='';
  if(fs.existsSync(config))configured=iniValue(fs.readFileSync(config,'utf8'),'ScreenshotFolder');
  const folder=path.resolve(root,configured.replace(/[\\/]+/g,path.sep));
  if(folder!==root&&!folder.startsWith(root+path.sep))throw Error('ScreenshotFolder escapes the selected runtime');
  if(!fs.existsSync(folder)||!fs.statSync(folder).isDirectory())throw Error('Configured screenshot folder is unavailable');
  const actual=fs.realpathSync(folder);if(actual!==root&&!actual.startsWith(root+path.sep))throw Error('ScreenshotFolder junction escapes the selected runtime');return actual;
}
function resolveScreenshotPlan(runtime){const root=fs.realpathSync(runtime),config=path.join(root,'save','config.ini'),text=fs.existsSync(config)?fs.readFileSync(config,'utf8'):'';return{folder:resolveScreenshotFolder(root),prefix:safeScreenshotPrefix(iniValue(text,'WindowTitle'))};}
function pngState(folder){const result=new Map();for(const entry of fs.readdirSync(folder,{withFileTypes:true}))if(entry.isFile()&&/\.png$/i.test(entry.name)){const file=path.join(folder,entry.name),stat=fs.statSync(file);result.set(entry.name,{size:stat.size,mtimeMs:stat.mtimeMs});}return result;}
function pngDimensions(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<45||!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Engine screenshot is not a complete PNG');
  let offset=8,ihdr=null,ended=false;const idat=[];
  while(offset<buffer.length){if(offset+12>buffer.length)throw Error('Engine screenshot has a truncated PNG chunk');const length=buffer.readUInt32BE(offset),type=buffer.toString('ascii',offset+4,offset+8),dataStart=offset+8,dataEnd=dataStart+length,crcAt=dataEnd;if(dataEnd+4>buffer.length)throw Error('Engine screenshot has a truncated PNG chunk');const crcInput=buffer.subarray(offset+4,dataEnd);if(crc32(crcInput)!==buffer.readUInt32BE(crcAt))throw Error('Engine screenshot PNG checksum failed');const data=buffer.subarray(dataStart,dataEnd);if(!ihdr&&type!=='IHDR')throw Error('Engine screenshot PNG is missing its leading IHDR');if(type==='IHDR'){if(ihdr||length!==13)throw Error('Engine screenshot PNG has an invalid IHDR');ihdr=Buffer.from(data);}else if(type==='IDAT')idat.push(Buffer.from(data));else if(type==='IEND'){if(length!==0)throw Error('Engine screenshot PNG has an invalid IEND');ended=true;offset=dataEnd+4;break;}offset=dataEnd+4;}
  if(!ihdr||!ended||offset!==buffer.length||!idat.length)throw Error('Engine screenshot is not a complete PNG');
  const width=ihdr.readUInt32BE(0),height=ihdr.readUInt32BE(4),bitDepth=ihdr[8],colorType=ihdr[9],compression=ihdr[10],filter=ihdr[11],interlace=ihdr[12],channels={0:1,2:3,3:1,4:2,6:4}[colorType],allowedDepths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]}[colorType];if(!width||!height||width>16384||height>16384||!channels||!allowedDepths.includes(bitDepth)||compression!==0||filter!==0||![0,1].includes(interlace))throw Error('Engine screenshot PNG format is unsupported');
  const passes=interlace===0?[[0,0,1,1]]:[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];let expected=0;const rows=[];for(const [x0,y0,dx,dy] of passes){const pw=width<=x0?0:Math.ceil((width-x0)/dx),ph=height<=y0?0:Math.ceil((height-y0)/dy);if(!pw||!ph)continue;const rowBytes=Math.ceil(pw*channels*bitDepth/8);rows.push([ph,rowBytes]);expected+=ph*(rowBytes+1);}if(expected>536870912)throw Error('Engine screenshot PNG is unreasonably large');
  let inflated;try{inflated=zlib.inflateSync(Buffer.concat(idat),{maxOutputLength:expected});}catch{throw Error('Engine screenshot PNG pixel stream is invalid');}let cursor=0;for(const [ph,rowBytes] of rows)for(let row=0;row<ph;row++){if(inflated[cursor]>4)throw Error('Engine screenshot PNG row filter is invalid');cursor+=rowBytes+1;}
  if(inflated.length!==expected||cursor!==expected)throw Error('Engine screenshot PNG pixel stream length is invalid');return{width,height};
}
async function waitForStablePng(folder,before,options={}){
  const timeoutMs=options.timeoutMs||12000,delay=options.delay||((ms)=>new Promise(resolve=>setTimeout(resolve,ms))),started=Date.now(),prefix=options.prefix;if(typeof prefix!=='string'||!prefix)throw Error('Engine screenshot filename prefix is required');const pattern=new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[0-9]{3}\\.png$`,'i');let candidate=null,last=null,stable=0;
  while(Date.now()-started<timeoutMs){
    options.signal?.throwIfAborted();
    for(const [name,state] of pngState(folder)){if(pattern.test(name)&&!before.has(name)&&state.mtimeMs>=started-1000){if(!candidate||state.mtimeMs>candidate.state.mtimeMs)candidate={name,state};}}
    if(candidate){const file=path.join(folder,candidate.name),stat=fs.statSync(file),key=`${stat.size}:${stat.mtimeMs}`;if(key===last)stable++;else{last=key;stable=0;}if(stable>=2){const bytes=fs.readFileSync(file);pngDimensions(bytes);return{file,bytes};}}
    await delay(50);
  }
  throw Error('bounded wait expired for engine screenshot');
}
function preserveSnapshot(source,bytes,directory,metadata){
  fs.mkdirSync(directory,{recursive:true});const id=`tick-${metadata.tick}-${crypto.randomBytes(6).toString('hex')}`,imagePath=path.join(directory,`${id}.png`),metadataPath=path.join(directory,`${id}.json`);
  fs.writeFileSync(imagePath,bytes,{flag:'wx'});const dimensions=pngDimensions(bytes);const record={version:1,id,method:'stock-engine-paused-full-composite-candidate',classification:'candidate-awaiting-duplicate-verification',image:path.basename(imagePath),sourceFile:path.basename(source),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),...dimensions,...metadata};
  fs.writeFileSync(metadataPath,JSON.stringify(record,null,2)+'\n',{encoding:'utf8',flag:'wx'});return{...record,imagePath,metadataPath};
}
function preserveSnapshotPair(directory,first,second,metadata={}){
  if(!first?.id||!second?.id||!first?.sha256||!second?.sha256)throw Error('Two retained snapshots are required for stability verification');
  const provenanceMatches=typeof metadata.sessionId==='string'&&metadata.sessionId.length>0&&
    Number.isSafeInteger(metadata.epoch)&&metadata.epoch>0&&Number.isSafeInteger(metadata.tick)&&metadata.tick>=0&&
    first.id!==second.id&&first.engine?.executable==='Ikemen_GO.exe'&&/^[a-f0-9]{64}$/.test(first.engine.sha256)&&
    isDeepStrictEqual(first.engine,second.engine)&&[first,second].every(candidate=>
      candidate.sessionId===metadata.sessionId&&candidate.epoch===metadata.epoch&&candidate.tick===metadata.tick&&
      candidate.paused===true&&candidate.frame?.paused===true&&candidate.frame.tick===metadata.tick);
  const pixelsMatch=first.sha256===second.sha256&&first.width===second.width&&first.height===second.height;
  const stable=Boolean(provenanceMatches&&pixelsMatch);
  const classification=!provenanceMatches?'invalid-provenance-mismatch':
    stable?'verified-identical-paused-composite':'invalid-nonidentical-paused-composite';
  const rootCustomStates=stable?matchingRootCustomStates(first.frame.entities,second.frame.entities):[];
  fs.mkdirSync(directory,{recursive:true});
  const id=`pair-tick-${metadata.tick}-${crypto.randomBytes(6).toString('hex')}`,verificationPath=path.join(directory,`${id}.json`),record={...metadata,version:1,id,method:'duplicate-paused-engine-capture',stable,classification,captures:[{id:first.id,image:path.basename(first.imagePath),metadata:path.basename(first.metadataPath),sha256:first.sha256,width:first.width,height:first.height},{id:second.id,image:path.basename(second.imagePath),metadata:path.basename(second.metadataPath),sha256:second.sha256,width:second.width,height:second.height}]};
  if(rootCustomStates.length)record.rootCustomStates=rootCustomStates;
  fs.writeFileSync(verificationPath,JSON.stringify(record,null,2)+'\n',{encoding:'utf8',flag:'wx'});return{...record,verificationPath};
}
function snapshotInteger(value,min,max) {
  if (!/^-?(0|[1-9][0-9]{0,9})$/.test(value)) return null;
  const number = Number(value);
  return number >= min && number <= max ? number : null;
}
const customStateProvenance='stock-inCustomState-at-frozen-hook';
function addSnapshotRootCustomState(entity,fields) {
  if(entity.kind!=='player'||!Number.isInteger(entity.owner)||entity.owner<1||entity.owner>4)return entity;
  const raw=fields[`custom${entity.owner}`];
  const value=typeof raw==='string'?/^(0|[1-9][0-9]{0,9}),([01])$/.exec(raw):null;
  if(!value||snapshotInteger(value[1],0,2147483647)!==entity.runtimeId||
     entity.sourceRuntimeId!==entity.runtimeId)return entity;
  return {...entity,inCustomState:value[2]==='1',
    fieldProvenance:{...entity.fieldProvenance,inCustomState:customStateProvenance}};
}
function matchingRootCustomStates(first,second) {
  if(!Array.isArray(first)||!Array.isArray(second))return [];
  const read=(entities,owner)=>{
    const rows=entities.filter(row=>row.kind==='player'&&row.owner===owner);
    if(rows.length!==1)return null;
    const [row]=rows;
    if(!Number.isInteger(row.runtimeId)||row.runtimeId<0||row.runtimeId>2147483647||
       row.sourceRuntimeId!==row.runtimeId||typeof row.inCustomState!=='boolean'||
       row.fieldProvenance?.inCustomState!==customStateProvenance)return null;
    return row;
  };
  const observed=[];
  for(let slot=1;slot<=4;slot++){
    const left=read(first,slot),right=read(second,slot);
    if(left&&right&&left.runtimeId===right.runtimeId&&left.inCustomState===right.inCustomState){
      observed.push({slot,runtimeId:left.runtimeId,inCustomState:left.inCustomState,provenance:customStateProvenance});
    }
  }
  return observed;
}
function parseReportedOwner(value,trigger) {
  const slot=/^(0|[1-9][0-9]?)$/.test(value) ? snapshotInteger(value,0,12) : null;
  return {reportedSlot:slot===0 ? null : slot,status:slot===null ? 'unavailable' :
    slot===0 ? 'common-fx-or-undefined' : 'player-slot',provenance:`stock-${trigger}-at-hook`};
}
function parseSnapshotEntity(row,binding=false) {
  const fields = row.split(',');
  const [kindCode,owner,runtimeId,sourceRuntimeId,stateOrAuthoredId,anim,x,y,vx,vy] = fields.map(Number);
  const kind = ['unknown','player','helper','projectile'][kindCode] || 'unknown';
  const base = {kind,kindCode,owner,sourceRuntimeId,anim,x,y,vx,vy};
  const character = kind === 'player' || kind === 'helper';
  const ownerFields=fields.length===19||(binding&&fields.length===20);
  const hasAnimationFields = character && fields.length >= 17;
  const animation = {airTimingEstimate:null,authoredAirFrame:null,resolvedSprite:null};
  if (hasAnimationFields) {
    const element = snapshotInteger(fields[10],1,2147483647);
    const elapsedTicks = snapshotInteger(fields[11],0,2147483647);
    const group = snapshotInteger(fields[12],-2147483648,2147483647);
    const image = snapshotInteger(fields[13],-2147483648,2147483647);
    const durationTicks = snapshotInteger(fields[14],-2147483648,2147483647);
    const spriteGroup = snapshotInteger(fields[15],0,65535);
    const spriteImage = snapshotInteger(fields[16],0,65535);
    const authoredSprite = group !== null && image !== null ? {group,image} : null;
    if (authoredSprite || durationTicks !== null) animation.authoredAirFrame = {sprite:authoredSprite,durationTicks};
    if (element !== null && elapsedTicks !== null && (durationTicks === -1 || elapsedTicks < durationTicks)) {
      animation.airTimingEstimate = {element,elapsedTicks};
    }
    if (spriteGroup !== null && spriteImage !== null) animation.resolvedSprite = {group:spriteGroup,image:spriteImage};
  }
  const provenance = {anim:'engine-observed',positionVelocity:'engine-observed-at-hook',
    airTimingEstimate:animation.airTimingEstimate ? 'derived-from-stock-animation-triggers' : 'unavailable',
    authoredAirFrame:animation.authoredAirFrame ? 'stock-saved-air-frame-at-hook' : 'unavailable',
    resolvedSprite:animation.resolvedSprite ? 'stock-resolved-sprite-at-hook' : 'unavailable'};
  if (kind === 'projectile') {
    return {...base,...animation,observationId:runtimeId,authoredId:stateOrAuthoredId,identity:'synthetic-observation-uncertain',
      fieldProvenance:{...provenance,observationId:'synthetic-per-observation',authoredId:'engine-observed',sourceRuntimeId:'engine-observed'}};
  }
  const owners=character ? {
    animationOwner:parseReportedOwner(ownerFields ? fields[17] : undefined,'animPlayerNo'),
    spriteOwner:parseReportedOwner(ownerFields ? fields[18] : undefined,'spritePlayerNo')
  } : {};
  return {...base,...animation,...owners,runtimeId,state:stateOrAuthoredId,
    fieldProvenance:{...provenance,runtimeId:'engine-observed',state:'engine-observed'}};
}
module.exports={resolveScreenshotFolder,resolveScreenshotPlan,safeScreenshotPrefix,pngState,pngDimensions,waitForStablePng,preserveSnapshot,preserveSnapshotPair,parseSnapshotEntity,addSnapshotRootCustomState,matchingRootCustomStates};
