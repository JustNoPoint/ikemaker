'use strict';

const fs = require('fs');
const path = require('path');
const def = require('./def_model');
const {embeddedActions} = require('./def_actions');
const {parseSelectDef} = require('./select_def_model');
const {rosterCells, portraitFor, resolveCharacterDef, specialCharacter} = require('./select_roster_preview');
const {selectRosterReference} = require('./screenpack_flow');

function defaultHudScreen(screens) {
  const index = screens.findIndex(screen => screen.normalized === 'lifebar');
  return Math.max(0,index);
}

// For a selected team variant, prefer matching companion sections and then their
// authored singles defaults. Transient round/combo overlays are visible only
// while editing their own section.
function hudScreenIndices(screens, active) {
  const name = screens[active]?.normalized || '';
  const match = /^(.*?)(lifebar|powerbar|face|name|time)$/.exec(name);
  const prefix = match?.[1] || '';
  const team = prefix.replace(/_\d+p\s*$/i,' ');
  const result = [];
  for (const kind of ['lifebar','powerbar','face','name','time']) {
    const index = [prefix+kind,team+kind,kind].map(candidate=>screens.findIndex(s=>s.normalized===candidate)).find(i=>i>=0);
    if(index!==undefined && !result.includes(index)) result.push(index);
  }
  if(!result.includes(active)) result.push(active);
  return result;
}

function hudComponentPosition(screen, elementIndex, overrides, screenIndex) {
  const item=screen.elements[elementIndex];
  const direct=overrides[screenIndex+':'+elementIndex];
  if(direct) return direct.slice();
  const point=item.position.slice();
  if(item.properties.pos || item.base==='') return point;
  let name=item.base;
  while(name.includes('.')){
    name=name.slice(0,name.lastIndexOf('.'));
    const parent=screen.elements.findIndex(candidate=>candidate.base===name);
    if(parent>=0){
      const origin=hudComponentPosition(screen,parent,overrides,screenIndex);
      return [origin[0]+point[0],origin[1]+point[1]];
    }
  }
  const base=screen.elements.findIndex(candidate=>candidate.base==='');
  if(base<0)return point;
  const origin=hudComponentPosition(screen,base,overrides,screenIndex);
  return [origin[0]+point[0],origin[1]+point[1]];
}

function linkedMotif(filename, root, preferred) {
  if (!root && !preferred) return '';
  const candidates = preferred ? [preferred] : [];
  if (!preferred && root) {
    const ini=path.join(root,'save','config.ini');
    if(fs.existsSync(ini)){
      const raw=/^\s*motif\s*=\s*([^;\r\n]+)/im.exec(fs.readFileSync(ini,'utf8'))?.[1];
      if(raw) candidates.push(path.resolve(root,def.unquote(raw.trim())));
    }
    if(!candidates.length)candidates.push(path.join(root,'data','system.def'));
  }
  for(const candidate of candidates){
    if(!fs.existsSync(candidate))continue;
    const doc=def.parseDef(fs.readFileSync(candidate,'utf8'),candidate);
    const files=def.sections(doc,'Files');
    if(files.length!==1)continue;
    const keys=files[0].entries.filter(e=>e.normalized==='fight');
    if(keys.length>1)continue;
    const ref=keys.length?def.unquote(keys[0].value):'fight.def';
    const resolved=ref&&require('./select_roster_preview').resolveAsset(ref,candidate);
    if(resolved&&path.resolve(resolved).toLowerCase()===path.resolve(filename).toLowerCase()) return candidate;
  }
  return '';
}

function populateFighterArt(filename, document, type, root, sourceMotif, model, screens, images, spriteInfo) {
  if(type==='lifebar')for(const screen of screens){
    screen.hudDrawOrder=screen.elements.map((_,index)=>index).sort((a,b)=>hudOrder(screen.elements[a])-hudOrder(screen.elements[b]));
    if(!/(lifebar|powerbar)$/.test(screen.normalized))continue;
    const source=document.sections.find(section=>section.line===screen.line);
    screen.barRanges={};
    for(const entry of source?.entries||[]){
      const key=/^(p[1-8])\.(range\.x|range\.y|warn\.range|scalefill|levelbars)$/.exec(entry.normalized);
      if(!key)continue;
      const ranges=screen.barRanges[key[1]]||={};
      if(key[2].startsWith('range.'))ranges[key[2].slice(-1)]=def.tuple(entry.value);
      else if(key[2]==='warn.range')ranges.warn=def.tuple(entry.value);
      else ranges[key[2]]=Boolean(def.number(entry.value,0));
    }
  }
  const motif=type==='lifebar'?linkedMotif(filename,root,sourceMotif):filename;
  const motifDoc=motif===filename?document:motif?def.parseDef(fs.readFileSync(motif,'utf8'),motif):null;
  const roster=motifDoc&&selectRosterReference(motif,motifDoc);
  const cells=roster?.file&&fs.existsSync(roster.file)?rosterCells(parseSelectDef(fs.readFileSync(roster.file,'utf8'))):[];
  const players=cells.filter(cell=>cell.members[0]&&!specialCharacter(cell.members[0].name)&&!Number(cell.hidden)).slice(0,8).map(cell=>cell.members[0]);
  const cache=new Map(),characterActions=new Map();
  for(const screen of screens){
    if(!(/^(?:.*\s)?face$/.test(screen.normalized)||screen.normalized==='select info'))continue;
    for(const item of screen.elements){
      const player=/^p([1-8])\.face$/.exec(item.base);
      if(!player)continue;
      item.characterArt={detail:'No visible roster character is assigned to this sample slot.'};item.assetSprite=null;item.actionLine=null;
      const slot=Number(player[1]),entry=players[slot-1];
      if(!entry)continue;
      let sprite=item.sprite,offset=[0,0];
      if(item.animation!==null&&screen.normalized==='select info'){
        if(!characterActions.has(entry.name)){
          const character=resolveCharacterDef(roster.file,entry.name);
          let actions={};
          if(character){
            const files=def.sectionMap(def.sections(def.parseDef(fs.readFileSync(character,'utf8'),character),'Files')[0]);
            const air=files.anim&&path.resolve(path.dirname(character),def.unquote(files.anim));
            if(air&&fs.existsSync(air))actions=embeddedActions(fs.readFileSync(air,'utf8'));
          }
          characterActions.set(entry.name,actions);
        }
        const frame=characterActions.get(entry.name)[item.animation]?.frames?.find(f=>f.sprite[0]>=0 && f.sprite[1]>=0);
        if(frame){sprite=frame.sprite;offset=frame.offset;}
      }
      if(!sprite){item.characterArt.detail='Character animation '+item.animation+' has no available preview frame.';continue;}
      const key='fighter:'+slot+':'+sprite.join(',');
      if(!cache.has(key))cache.set(key,portraitFor(roster.file,entry,{sprite}));
      const portrait=cache.get(key);
      if(!portrait.src){item.characterArt.detail=entry.name+' · '+portrait.detail;continue;}
      const scale=portrait.preload?1:(portrait.portraitScale||1)*model.localCoord[0]/(portrait.localCoord?.[0]||320);
      images[key]=portrait.src;
      spriteInfo[key]={width:portrait.width,height:portrait.height,axisX:portrait.axisX,axisY:portrait.axisY};
      item.characterArt={key,scale,offset};
    }
  }
  return players.map(entry=>entry.name);
}

function hudOrder(item) {
  const component=item.base.replace(/^p\d+\./,'');
  if (/^bg[0-2]/.test(component)) return Number(component[2]);
  if (component.startsWith('red')) return 4;
  if (component==='mid') return 5;
  if (component.startsWith('front')||component==='face') return 6;
  if (component==='top') return 9;
  if (component==='warn') return 10;
  return 8;
}

function hudVariant(screen,item,sample) {
  const name=screen.normalized;
  const bar=/(lifebar|powerbar)$/.exec(name);
  const warning=/^(p\d+)\.warn$/.exec(item.base);
  if(warning && bar?.[1]==='lifebar'){
    const [high,low]=screen.barRanges?.[warning[1]]?.warn||[0,0];
    return sample.life<=high && sample.life>=low;
  }
  const prefix=/^(p\d+)\.(front|counter|value|bg[0-2])(\d*|max)$/.exec(item.base);
  const timer=name==='time' && /^counter(\d*)$/.exec(item.base);
  if(!timer && !(bar&&prefix))return true;
  const family=timer?'counter':prefix[1]+'.'+prefix[2];
  const variants=screen.elements.filter(value=>value.base.startsWith(family)&&/^(?:\d*|max)$/.test(value.base.slice(family.length)));
  const value=timer?sample.timer:bar[1]==='lifebar'?sample.life:sample.power;
  const maxEntry=variants.find(entry=>entry.base===family+'max');
  if(bar?.[1]==='powerbar'&&value>=3000&&maxEntry)return maxEntry===item;
  const level=entry=>entry.base.endsWith('max')?Infinity:Number(entry.base.slice(family.length))||0;
  const eligible=variants.filter(entry=>level(entry)<=value).sort((a,b)=>level(b)-level(a));
  return eligible[0]===item;
}

function hudBarClip(screen,item,sample,overrides,screenIndex) {
  const part=/^(p[1-8])\.(front\d*|mid)$/.exec(item.base);
  if(!part || !screen.barRanges?.[part[1]]) return null;
  const ranges=screen.barRanges[part[1]],useY=Boolean(ranges.y?.some(value=>value!==0)),range=useY?ranges.y:ranges.x;
  if(!range || range[0]===range[1])return null;
  const index=screen.elements.findIndex(e=>e.base===part[1]);
  const origin=index>=0?hudComponentPosition(screen,index,overrides,screenIndex):[0,0];
  const vertical=useY,axis=vertical?1:0,begin=origin[axis]+range[0];
  let ratio=screen.normalized.endsWith('powerbar')?sample.power/3000:sample.life/100;
  if(screen.normalized.endsWith('powerbar')&&ranges.levelbars)ratio=sample.power/1000-Math.min(Math.floor(sample.power/1000),2);
  if(ranges.scalefill)return {scaleX:vertical?1:ratio,scaleY:vertical?ratio:1};
  const span=(range[1]-range[0]+Math.sign(range[1]-range[0]))*Math.max(0,Math.min(1,ratio));
  const low=span<0?begin+span+1:begin;
  return vertical?{x:-1e6,y:low,width:2e6,height:Math.abs(span)}:{x:low,y:-1e6,width:Math.abs(span),height:2e6};
}

function hudClientScript(){
  return [hudScreenIndices,hudComponentPosition,hudVariant,hudBarClip].map(fn=>fn.toString()).join('\n');
}

module.exports={defaultHudScreen,hudScreenIndices,hudComponentPosition,hudVariant,hudBarClip,populateFighterArt,hudClientScript};
