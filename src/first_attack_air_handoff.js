'use strict';
const path = require('path');
function request(options, airPath, owners) {
  const seed = options.createActionIfMissing;
  const integer = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!seed || !integer(options.action, 2147483647) || !integer(seed.group, 65535) || !integer(seed.index, 65535)
      || typeof options.ownerDef !== 'string' || !path.isAbsolute(options.ownerDef) || !(owners || []).some(owner => path.resolve(owner).toLowerCase() === path.resolve(options.ownerDef).toLowerCase())) return null;
  return { action: options.action, group: seed.group, index: seed.index, airPath: path.resolve(airPath), ownerDef: path.resolve(options.ownerDef) };
}
function refreshArchive(session, reader, preferences) {
  if(!session.sffPath)return null;
  const archive=reader.readSff(session.sffPath);
  if(session.archive?.buffer?.equals(archive.buffer))return null;
  const value={airPath:session.airPath,sffPath:session.sffPath,
    sprites:archive.sprites.map(sprite=>({group:sprite.group,index:sprite.number,paletteIndex:sprite.paletteIndex??null})),
    palettes:archive.palettes.map(palette=>({index:palette.index,group:palette.group,number:palette.number})),
    palettePreview:preferences(archive,session.sffPath,'air')};
  session.archive=archive;session.byKey=new Map(archive.sprites.map(sprite=>[sprite.group+','+sprite.number,sprite]));
  return value;
}
function clientScript() { return String.raw`
(()=>{
 const same=(a,b)=>String(a||'').replace(/\\/g,'/').toLowerCase()===String(b||'').replace(/\\/g,'/').toLowerCase();
 function receive(seed){
  if(!seed||!same(seed.airPath,model.airPath)||!(model.sessionOwnerDefs||[]).some(owner=>same(owner,seed.ownerDef))||model.transfer?.role==='source')return;
  const matches=model.actions.filter(item=>item.number===seed.action);
  if(matches.length===1){selectAction(seed.action);return}
  if(matches.length||![seed.action,seed.group,seed.index].every(value=>Number.isInteger(value)&&value>=0)||seed.action>2147483647||seed.group>65535||seed.index>65535)return;
  if(newActionDialog.open||!navigationAllowed()||actionMutationBusy)return;
  openNewActionDialog();if(!newActionDialog.open)return;
  document.getElementById('newActionNumber').value=String(seed.action);
  document.getElementById('newActionGroup').value=String(seed.group);
  document.getElementById('newActionIndex').value=String(seed.index);
  document.getElementById('newActionTime').value='3';
  updateNewActionHint();document.getElementById('newActionHint').textContent+=' Starter sprite '+seed.group+','+seed.index+'. Choose another using Starter sprite group and index above.';document.getElementById('newActionNumber').focus();
 }
 function refresh(value){
  if(!value||!same(value.airPath,model.airPath)||!same(value.sffPath,model.sffPath))return;
  const sprites=new Map(value.sprites.map(sprite=>[sprite.group+','+sprite.index,sprite]));
  for(const item of model.actions)for(const frame of item.frames){const sprite=sprites.get(frame.group+','+frame.index);frame.spriteMissing=frame.group>=0&&frame.index>=0&&!sprite;frame.spritePaletteIndex=sprite?.paletteIndex??null;}
  model.missingSpriteFrames=model.actions.reduce((count,item)=>count+item.frames.filter(frame=>frame.spriteMissing).length,0);
  model={...model,palettes:value.palettes,palettePreview:value.palettePreview};
  const select=document.getElementById('palette'),selected=select.value;select.textContent='';
  const own=document.createElement('option');own.value='sprite';own.textContent='Sprite palettes (default)';select.append(own);
  for(const palette of model.palettes){const option=document.createElement('option');option.value=String(palette.index);option.textContent='Palette '+palette.group+','+palette.number;select.append(option)}select.value=selected;
  thumbs.clear();thumbs.generation=(thumbs.generation||0)+1;actionThumbs.clear();imageCache.clear();
  document.getElementById('sync').textContent='Live AIR preview · '+model.actions.length+' actions · '+model.missingSpriteFrames+' missing sprite frame(s)';
  const preserveForm=frameFormsDirty()||Boolean(edit?.dirty);if(!preserveForm){renderActions();renderStrip();requestFrame()}else draw();
 }
 addEventListener('message',event=>{if(event.data?.type==='firstAttackSpriteArchive')refresh(event.data.value);if(event.data?.type==='firstAttackAction')receive(event.data.request)});
 receive(model.firstAttackAction);
})();`; }
function install(html) { return html.replace('</script></body>', clientScript() + '</script></body>'); }
module.exports = { request, refreshArchive, clientScript, install };
