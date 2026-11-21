'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {pinned}=require('./snapshot_binding');

const pinnedEngine='73bcd922ec7e3b471a0bfc16c9d00a756e9d8abc7e0f11819a6b1bac4d63f27f';
const fieldNames=Object.freeze([
  'posX','posY','posZ','velX','velY','velZ','configuredYAccel','effectiveGravity',
  'stateNo','prevStateNo','anim','ctrl','moveType','stateType','physics','stateTime','hitPauseTime','pauseTime',
  'facing','cameraPosX','localCoordX','localCoordY','stateOwnerSlot','animOwnerSlot','spriteOwnerSlot','runOrder',
  'spriteGroup','spriteImage','drawPalGroup','drawPalIndex','palNo'
]);
const disabled=new Set(['runOrder','drawPalGroup','drawPalIndex']);
const numeric=new Set(['posX','posY','posZ','velX','velY','velZ','configuredYAccel','cameraPosX','localCoordX','localCoordY']);
const owner=new Set(['stateOwnerSlot','animOwnerSlot','spriteOwnerSlot']);
const missingReason={'-i':'inactive','-r':'failed-redirect','-b':'budget'};
const fieldReason={'-f':'failed-read','-a':'unavailable'};

function verifyStockTelemetryPhase(runtime,engineSha256){
  if(engineSha256!==pinnedEngine||process.env.LUA_PATH)return false;
  try{
    for(const [relative,digest] of Object.entries(pinned)){
      const filename=path.join(runtime,relative);
      const stat=fs.lstatSync(filename);
      if(!stat.isFile()||fs.realpathSync(filename)!==filename||stat.size>1024*1024||
         createHash('sha256').update(fs.readFileSync(filename)).digest('hex')!==digest)return false;
    }
    const mods=path.join(runtime,'external/mods');
    if(!fs.lstatSync(mods).isDirectory()||fs.realpathSync(mods)!==mods)return false;
    // Pinned main.lua discovers Lua modules recursively. Unknown modules can change the loop.
    if(!fs.readdirSync(mods,{withFileTypes:true}).every(entry=>entry.isFile()&&
      (entry.name==='ikemeter_bridge.lua'||entry.name.startsWith('-')||!entry.name.toLowerCase().endsWith('.lua'))))return false;
    if(fs.existsSync(path.join(runtime,'external/script/ikemeter_bridge.lua'))||
       fs.existsSync(path.join(runtime,'resources/defaultConfig.ini')))return false;
    const config=path.join(runtime,'save/config.ini');
    const stat=fs.lstatSync(config);
    if(!stat.isFile()||fs.realpathSync(config)!==config||stat.size>128*1024)return false;
    const text=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(config));
    if(/\r(?!\n)|[\0\uFEFF]/.test(text))return false;
    let section='';
    const observed={system:[],motif:[],lua:[],modules:[]};
    const scopedSections=new Set();
    for(const raw of text.split('\n')){
      const line=raw.split(';',1)[0].trim(), header=/^\[([^\]]+)\]$/.exec(line);
      if(line.endsWith('\\')||(line.startsWith('[')&&!header))return false;
      if(header){
        section=header[1];
        const normalized=section.trim().toLowerCase();
        if(normalized==='config'||normalized==='common'){
          if(scopedSections.has(normalized)||!['Config','Common'].includes(section))return false;
          scopedSections.add(normalized);
        }
        continue;
      }
      if(!['Config','Common'].includes(section)||!line)continue;
      const pair=/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line);
      if(!pair)return false;
      if(section==='Config'&&/^system$/i.test(pair[1]))observed.system.push(pair[2]);
      if(section==='Config'&&/^motif$/i.test(pair[1]))observed.motif.push(pair[2]);
      if(section==='Common'&&/^lua/i.test(pair[1]))observed.lua.push(pair[1]==='Lua'?pair[2]:null);
      if(section==='Common'&&/^modules/i.test(pair[1]))observed.modules.push(pair[1]==='Modules'?pair[2]:null);
    }
    return observed.system.length===1&&observed.system[0]==='external/script/main.lua'&&
      observed.motif.length===1&&observed.motif[0]==='data/ikemen1/system.def'&&
      observed.lua.length===1&&observed.lua[0]==='loop()'&&
      observed.modules.length===1&&observed.modules[0]==='';
  }catch{return false;}
}

function telemetrySession(engineSha256,rootSlots,enabled,ownedStreams){
  return {engineSha256,rootSlots:[...rootSlots],
    capabilities:Object.fromEntries(fieldNames.map(key=>[key,disabled.has(key)?'disabled':
      enabled&&key!=='effectiveGravity'?'stock':'unavailable'])),
    diagnostics:{stdout:ownedStreams?'owned-stream':'unavailable',stderr:ownedStreams?'owned-stream':'unavailable',internalConsole:'unavailable'}};
}

function int32(value,min=-2147483648,max=2147483647){
  if(!/^-?(?:0|[1-9]\d{0,9})$/.test(value))throw Error('root telemetry integer is malformed');
  const n=Number(value);
  if(n<min||n>max)throw Error('root telemetry integer is outside its field range');
  return n;
}
function decode(key,value){
  if(numeric.has(key)){
    if(!/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)||!Number.isFinite(Number(value)))throw Error('root telemetry number is malformed');
    return Number(value);
  }
  if(key==='ctrl'){
    if(value!=='true'&&value!=='false')throw Error('root telemetry ctrl is malformed');
    return value==='true';
  }
  if(['moveType','stateType','physics'].includes(key)){
    if(value.length!==1||!(key==='moveType'?'IAH':'SCALN').includes(value))throw Error('root telemetry enum is malformed');
    return value;
  }
  if(key==='facing'){
    if(value!=='1'&&value!=='-1')throw Error('root telemetry facing is malformed');
    return Number(value);
  }
  if(owner.has(key))return int32(value,0,12);
  if(key==='spriteGroup'||key==='spriteImage')return int32(value,0,65535);
  return int32(value);
}
function parsePlayerTelemetry(fields,session,enabled){
  const {rootSlots,capabilities}=session;
  const rootKeys=Object.keys(fields).filter(key=>/^root\d+$/.test(key));
  if(!enabled||fields.rootObservation==='unavailable'){
    if(rootKeys.length)throw Error('unbracketed root telemetry');
    return {paused:null,roots:[],missingSlots:rootSlots.map(slot=>({slot,reason:enabled?'unavailable':'unsupported'}))};
  }
  if(!['running','paused'].includes(fields.rootObservation)||rootKeys.length!==rootSlots.length||
     rootKeys.some(key=>!rootSlots.some(slot=>key===`root${slot}`)))throw Error('root telemetry coverage is malformed');
  const roots=[],missingSlots=[],ids=new Set();
  for(const slot of rootSlots){
    const row=fields[`root${slot}`];
    if(Object.hasOwn(missingReason,row)){missingSlots.push({slot,reason:missingReason[row]});continue;}
    const [rawId,rawTeam,...cells]=row.split(',');
    if(cells.length!==fieldNames.length)throw Error('root telemetry row has the wrong number of fields');
    const id=int32(rawId,0),teamSide=rawTeam==='-f'?null:int32(rawTeam,1,2);
    if(ids.has(id))throw Error('duplicate root telemetry identity');
    ids.add(id);
    const values={},reasons={};
    for(const [index,key] of fieldNames.entries()){
      const cell=cells[index],capability=capabilities[key];
      if(capability==='disabled'||capability==='unavailable'){
        const expected=capability==='disabled'?'-d':'-u';
        if(cell!==expected)throw Error('root telemetry contradicts its capability');
        values[key]=null;reasons[key]=capability==='disabled'?'disabled':'unsupported';
      }else if(Object.hasOwn(fieldReason,cell)){
        values[key]=null;reasons[key]=fieldReason[cell];
      }else values[key]=decode(key,cell);
    }
    roots.push({slot,teamSide,id,values,reasons});
  }
  return {paused:fields.rootObservation==='paused',roots,missingSlots};
}

module.exports={fieldNames,verifyStockTelemetryPhase,telemetrySession,parsePlayerTelemetry};
