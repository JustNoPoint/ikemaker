'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { hash } = require('./mutation_safety');
const catalog = require('../data/sctrl.json').find((item) => String(item.name).toLowerCase() === 'hitdef');
const { describeOption } = require('./controller_option_guidance');
const { parseHitDefs, chooseHitDef, groupedParameters, updateHitDef, newHitDef, STARTER } = require('./hitdef_model');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const { nearestCharacterDef, characterCandidates, chooseCharacterDef } = require('./character_picker');
const { resolveAssigned } = require('./related_work');
const { currentContext, registerCharacterToolPanel } = require('./authoring_context_registry');
const { readSff } = require('./sff_reader');
const { assignedDefault } = require('./palette_preview');
const { stateNumberAt, previewModel } = require('./hitdef_preview_model');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { sourceState, saveSourceDocument } = require('./source_document_save');

let session = null;
let formDrafts=new (require('./form_drafts').FormDrafts)();
const draftKey=(file,index)=>file.toLowerCase()+'#'+index;
function safe(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
function syntaxFor(document) {
  if (document.languageId === 'zss') return 'zss';
  if (document.languageId === 'ikemen-cns') return 'cns';
  const ext = path.extname(document.fileName).toLowerCase();
  if (ext === '.zss') return 'zss';
  if (['.cns', '.cmd', '.txt'].includes(ext)) return /\bhitdef\s*\{/i.test(document.getText()) ? 'zss' : 'cns';
  return '';
}
function eligible(editor) { return editor && syntaxFor(editor.document); }

function currentText(filename) {
  const open = vscode.workspace.textDocuments.find((document) => path.resolve(document.fileName).toLowerCase() === path.resolve(filename).toLowerCase());
  return open ? open.getText() : fs.readFileSync(filename, 'utf8');
}
function detectedDef(document) {
  const nearest = nearestCharacterDef(document.fileName); if (nearest) return nearest;
  if (session?.defPath && fs.existsSync(session.defPath)) return session.defPath;
  const context = currentContext(), contextual = context?.type === 'character' && context.files.find((item) => /\.def$/i.test(item));
  if (contextual && fs.existsSync(contextual)) return contextual;
  return characterCandidates(vscode.Uri.file(document.fileName)).current[0] || '';
}
function visualModel(document, offset, defPath, requestedP1, requestedP2) {
  if (!defPath) return { state: 'unavailable', detail: 'Open a character or choose one to enable AIR/SFF previews.' };
  const assets = resolveAssigned(defPath);
  if (!assets.air || !assets.sff || !fs.existsSync(assets.air) || !fs.existsSync(assets.sff)) return { state: 'unavailable', detail: 'The chosen character DEF does not resolve an existing AIR and SFF.', defPath };
  try {
    const archive = readSff(assets.sff), palette = assignedDefault(archive, assets.sff).index, state = stateNumberAt(document.getText(), offset), result = previewModel(currentText(assets.air), archive, palette, requestedP1 ?? state, requestedP2 ?? 5000);
    return { ...result, defPath, character: path.basename(path.dirname(defPath)), stateNumber: state, files: assets, palette: assignedDefault(archive, assets.sff) };
  } catch (error) { return { state: 'unavailable', detail: error.message, defPath }; }
}

function documentModel(document, offset, defPath = '', requestedP1, requestedP2) {
  const text = document.getText(), syntax = syntaxFor(document), blocks = parseHitDefs(text, syntax), current = chooseHitDef(blocks, offset);
  const groups = groupedParameters(catalog).map((group) => ({ ...group, parameters: group.parameters.map((parameter) => ({
    ...parameter,
    description: describeOption(parameter.name, 'HitDef'),
    value: current && current.values[parameter.key] !== undefined ? current.values[parameter.key] : STARTER[parameter.key] || '',
    enabled: Boolean(current && current.entries[parameter.key]) || (!current && Object.prototype.hasOwnProperty.call(STARTER, parameter.key))
  })) }));
  return { formDraft:formDrafts.read(draftKey(document.fileName,current?blocks.indexOf(current):-1)), sourceHash: hash(text), file: document.fileName, fileLabel: path.basename(document.fileName), sourceState: sourceState(document, path.basename(document.fileName)), syntax, blocks: blocks.map((item, index) => ({ index, start: item.start, end: item.end })), currentIndex: current ? blocks.indexOf(current) : -1, duplicates: current ? current.duplicates : [], groups, description: catalog.description || '', url: catalog.url || '', visual: visualModel(document, current?.start ?? offset, defPath || detectedDef(document), requestedP1, requestedP2) };
}

function page(model) { return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;height:100vh;overflow:hidden;font:12px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}button,input,select{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:5px 7px}button{cursor:pointer;background:var(--vscode-button-secondaryBackground)}header{min-height:48px;height:auto;flex-wrap:wrap;display:flex;gap:6px;align-items:center;padding:8px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}.grow{flex:1}.file{max-width:25vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--vscode-descriptionForeground)}main{height:calc(100vh - 48px);display:grid;grid-template-columns:minmax(360px,520px) minmax(420px,1fr) minmax(260px,340px);gap:8px;padding:8px}.fields,.right{overflow:auto}.intro,.preview,.notice{border:1px solid var(--vscode-panel-border);padding:10px;margin-bottom:10px}.notice{color:var(--vscode-charts-yellow)}details.group{border:1px solid var(--vscode-panel-border);margin-bottom:8px}details.group>summary{cursor:pointer;padding:9px;font-weight:700;background:var(--vscode-sideBar-background)}.field{display:grid;grid-template-columns:22px minmax(120px,175px) minmax(145px,1fr);gap:7px;align-items:center;padding:6px 8px;border-top:1px solid color-mix(in srgb,var(--vscode-panel-border),transparent 45%)}.field input[type=checkbox]{width:auto}.field input[type=text]{width:100%}.name{font-family:var(--vscode-editor-font-family);font-weight:600}.name button{padding:1px 4px;margin-left:4px}.hint{grid-column:2/4;color:var(--vscode-descriptionForeground);font-size:11px;margin-top:-4px}.visual{min-width:0;display:grid;grid-template-rows:auto minmax(280px,1fr) 145px;border:1px solid var(--vscode-panel-border)}.visual-tools{display:flex;gap:5px;align-items:center;flex-wrap:wrap;padding:7px;background:var(--vscode-sideBar-background)}.visual-tools select{max-width:155px}.stage{position:relative;overflow:hidden;background:#152033}.stage canvas{position:absolute;inset:0;display:block;width:100%;height:100%;image-rendering:pixelated;cursor:grab}.stage canvas:active{cursor:grabbing}.timeline{overflow:auto;padding:6px;border-top:1px solid var(--vscode-panel-border)}.track{display:flex;gap:4px;min-width:max-content;margin-bottom:5px}.track-label{position:sticky;left:0;z-index:1;width:65px;background:var(--vscode-sideBar-background);padding:6px}.frame{min-width:66px;padding:4px;text-align:center}.frame.active{outline:2px solid var(--vscode-focusBorder)}.right{align-self:stretch}.preview pre{white-space:pre-wrap;max-height:40vh;overflow:auto}.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}.muted{color:var(--vscode-descriptionForeground)}.active{outline:2px solid var(--vscode-focusBorder)}.fields,.right{min-width:0}@media(max-width:1100px){body{overflow:auto;height:auto}main{height:auto;display:flex;flex-direction:column}.visual{order:0;height:600px;flex:none}.fields{order:1;overflow:visible}.right{order:2;display:block;overflow:visible}.file{max-width:100%}}@media(max-width:500px){.field{grid-template-columns:22px minmax(0,1fr)}.field input[type=text]{grid-column:2}.hint{grid-column:2}}
</style></head><body><header><b>Universal HitDef Editor</b><span class="file" id="file"></span><button id="previous" title="Select the previous HitDef in this file">◀</button><span id="count"></span><button id="next" title="Select the next HitDef in this file">▶</button><button id="follow" title="Reload the HitDef nearest the text editor cursor">Follow Cursor</button><button id="chooseCharacter" title="Choose which character supplies the AIR and SFF preview">Character…</button><button id="new">New HitDef</button><button id="apply" class="primary">Apply to Code</button><span class="grow"></span>${launchControlsHtml('hitdef')}</header><main><section class="fields"><div class="intro"><b>Direct controller editing</b><p>Common options are visible first. Expand a specialist group only when the move needs it. Checked options are written; unchecking an existing option removes that line when you apply.</p></div><div id="warning"></div><div id="groups"></div></section><section class="visual"><div class="visual-tools"><button id="play">Play</button><button id="prevFrame">◀</button><button id="nextFrame">▶</button><label>P1 <select id="p1Action"></select></label><label>P2 <select id="p2Action"></select></label><label title="Darken P2 only as a positioning aid. PalFX preview automatically uses P2's normal assigned palette."><input id="shadeP2" type="checkbox" checked> Position shade</label><button id="fit">Fit</button><button id="actual">100%</button><button id="throwCreator" title="Open the full bind and throw sequencing workspace">Throw Creator…</button></div><div class="stage"><canvas id="canvas" width="1000" height="600" title="Mouse wheel zooms. Drag the yellow spark to draft sparkxy, or drag empty space to pan. Double-click to center."></canvas></div><div class="timeline"><div id="visualStatus" class="muted"></div><div id="p1Track" class="track"></div><div id="p2Track" class="track"></div></div></section><aside class="right"><div class="preview"><b>Generated controller preview</b><pre id="preview"></pre></div><details class="preview"><summary><b>HitDef documentation</b></summary><p>${String(model.description).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</p><p class="muted">Descriptions below are bundled for offline use. The controller list remains the complete authority for every documented option.</p></details><div class="preview"><b>State bridge</b><p class="muted">Use the ↗ buttons beside p1stateno and p2stateno to open their destination state. Bind controllers belong to those state flows; use Throw Creator for synchronized bind sequences.</p></div><div id="status" class="muted"></div></aside></main><script>
const vscode=acquireVsCodeApi(),saved=vscode.getState()||{};let model=${safe(model)},visual=model.visual,tick=0,playing=false,timer=null,zoom=Math.max(.25,Math.min(8,Number(saved.zoom)||2)),panX=Number(saved.panX)||0,panY=Number(saved.panY)||0;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),images=new Map(),fxImages=new Map();
document.querySelector('header').style.cssText+='height:auto;min-height:48px;flex-wrap:wrap';document.querySelector('main').style.height='calc(100vh - 76px)';
let sourceSavePending=false;const saveCodeButton=document.createElement('button'),saveCodeStatus=document.createElement('span');saveCodeButton.id='saveCode';saveCodeButton.textContent='Save Code';saveCodeButton.title='Save the complete open code document to disk; unapplied HitDef fields remain drafts.';saveCodeStatus.id='saveStatus';saveCodeStatus.className='muted';document.getElementById('previous').before(saveCodeButton,saveCodeStatus);function renderSourceSave(state,message=''){saveCodeStatus.textContent=message||(!state?.available?'Source unavailable':state.dirty?'Unsaved document changes':'Saved to disk');saveCodeStatus.title=state?.filename||model.file;saveCodeButton.disabled=sourceSavePending||!state?.available||!state?.dirty}renderSourceSave(model.sourceState);saveCodeButton.onclick=()=>{sourceSavePending=true;renderSourceSave(model.sourceState,'Saving complete code document…');vscode.postMessage({type:'saveCode'})};window.addEventListener('message',event=>{const message=event.data;if(message.type==='sourceSaveStatus'){sourceSavePending=false;renderSourceSave(message.state,message.message||'')}if(message.type==='model'&&message.model?.sourceState)renderSourceSave(message.model.sourceState)});
function parameters(){return [...document.querySelectorAll('[data-option]')].map(row=>({name:row.dataset.option,enabled:row.querySelector('input[type=checkbox]').checked,value:row.querySelector('input[type=text]').value}))}
function parameter(name){return parameters().find(x=>x.name.toLowerCase()===name.toLowerCase())||{enabled:false,value:''}}function value(name,fallback=''){const p=parameter(name);return p.enabled?p.value:fallback}function tuple(name,fallback=[0,0]){const p=String(value(name,'')).split(',').map(Number);return p.length&&p.every(Number.isFinite)?p:fallback}function number(name,fallback=0){const n=Number(value(name,''));return Number.isFinite(n)?n:fallback}
function preview(){const enabled=parameters().filter(x=>x.enabled&&x.value.trim()),zss=model.syntax==='zss';document.getElementById('preview').textContent=zss?'hitDef {\\n'+enabled.map(x=>'  '+x.name+': '+x.value+';').join('\\n')+'\\n}':'[State ?, HitDef]\\ntype = HitDef\\ntrigger1 = AnimElem = 1\\n'+enabled.map(x=>x.name+' = '+x.value).join('\\n')}
function image(info){if(!info?.src)return null;if(images.has(info.src))return images.get(info.src);const img=new Image();img.onload=draw;img.src=info.src;images.set(info.src,img);return img}
function palfx(){const time=number('palfx.time',0),mul=tuple('palfx.mul',[256,256,256]),add=tuple('palfx.add',[0,0,0]),active=parameter('palfx.time').enabled&&time!==0;return{active,time,mul:[mul[0]??256,mul[1]??256,mul[2]??256],add:[add[0]||0,add[1]||0,add[2]||0]}}
function fxImage(info,fx){const src=image(info);if(!src?.complete)return null;if(!fx.active)return src;const key=info.src+'|'+fx.mul.join(',')+'|'+fx.add.join(',');if(fxImages.has(key))return fxImages.get(key);const c=document.createElement('canvas');c.width=info.width;c.height=info.height;const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=false;x.drawImage(src,0,0);const data=x.getImageData(0,0,c.width,c.height);for(let i=0;i<data.data.length;i+=4)for(let n=0;n<3;n++)data.data[i+n]=Math.max(0,Math.min(255,data.data[i+n]*fx.mul[n]/256+fx.add[n]));x.putImageData(data,0,0);fxImages.set(key,c);return c}
function trackFrame(track,at){if(!track?.frames?.length)return null;let left=Math.max(0,at);for(const frame of track.frames){const duration=Math.max(1,Number(frame.time)||1);if(left<duration)return frame;left-=duration}return track.frames[track.frames.length-1]}
function total(track){return(track?.frames||[]).reduce((sum,f)=>sum+Math.max(1,Number(f.time)||1),0)}
function boxes(ctx,frame,x,y,face,color,key){if(!frame)return;ctx.strokeStyle=color;ctx.fillStyle=color+'28';for(const b of frame[key]||[]){const a=x+b[0]*face*zoom,c=x+b[2]*face*zoom,top=y+b[1]*zoom,bottom=y+b[3]*zoom;ctx.fillRect(Math.min(a,c),Math.min(top,bottom),Math.abs(c-a),Math.abs(bottom-top));ctx.strokeRect(Math.min(a,c),Math.min(top,bottom),Math.abs(c-a),Math.abs(bottom-top))}}
function arrow(ctx,x,y,velocity,color){const vx=(velocity[0]||0)*12*zoom,vy=(velocity[1]||0)*12*zoom;if(!vx&&!vy)return;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+vx,y+vy);ctx.stroke();const a=Math.atan2(vy,vx);ctx.beginPath();ctx.moveTo(x+vx,y+vy);ctx.lineTo(x+vx-Math.cos(a-.45)*9,y+vy-Math.sin(a-.45)*9);ctx.lineTo(x+vx-Math.cos(a+.45)*9,y+vy-Math.sin(a+.45)*9);ctx.closePath();ctx.fill()}
function drawSprite(ctx,frame,x,y,face,opponent,fx){const info=frame?.image,img=opponent?fxImage(info,fx):image(info);if(!img?.complete&&!img?.getContext)return;const flip=(frame.flags||'').includes('H')?-1:1;ctx.save();ctx.translate(x+(frame.x||0)*zoom,y+(frame.y||0)*zoom);ctx.scale(face*flip*zoom,(frame.flags||'').includes('V')?-zoom:zoom);if(opponent&&document.getElementById('shadeP2').checked&&!fx.active){ctx.globalAlpha=.68;ctx.filter='brightness(.38) saturate(.55)'}ctx.imageSmoothingEnabled=false;ctx.drawImage(img,-info.axisX,-info.axisY);ctx.restore();boxes(ctx,frame,x,y,face,'#ff3b45','clsn1');boxes(ctx,frame,x,y,face,'#3d8dff','clsn2')}
function draw(){const canvas=document.getElementById('canvas'),w=Math.max(1,Math.round(canvas.clientWidth)),h=Math.max(1,Math.round(canvas.clientHeight));if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.fillStyle='#132033';ctx.fillRect(0,0,w,h);const floor=h*.78+panY,p1x=w*.42+panX,step=Math.max(16,30*zoom),gx=((p1x%step)+step)%step,gy=((floor%step)+step)%step;ctx.strokeStyle='#34475e';for(let x=gx;x<w;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=gy;y<h;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}const fx=palfx(),shakeTime=number('envshake.time',0),shakeAmp=number('envshake.ampl',0),shakeFreq=number('envshake.freq',60),shakePhase=number('envshake.phase',0),shake=shakeTime!==0?Math.sin((tick+shakePhase)*shakeFreq*Math.PI/180)*shakeAmp:0;ctx.save();ctx.translate(0,shake);const snap=tuple('snap',[85,0]),p2x=p1x+(parameter('snap').enabled?snap[0]*zoom:85*zoom),p2y=floor+(parameter('snap').enabled?snap[1]*zoom:0);ctx.strokeStyle='#5cb6ff';ctx.beginPath();ctx.moveTo(0,floor);ctx.lineTo(w,floor);ctx.stroke();let p1face=number('p1facing',1)>=0?1:-1,p2face=parameter('p2facing').enabled?(number('p2facing',-1)>=0?p1face:-p1face):-p1face;if(parameter('p1getp2facing').enabled)p1face=number('p1getp2facing',-1)>=0?p2face:-p2face;drawSprite(ctx,trackFrame(visual?.p1,tick),p1x,floor,p1face,false,fx);drawSprite(ctx,trackFrame(visual?.p2,tick),p2x,p2y,p2face,true,fx);const spark=tuple('sparkxy',[0,0]);if(parameter('sparkxy').enabled){ctx.strokeStyle='#ffd84d';ctx.beginPath();ctx.arc(p1x+spark[0]*zoom,floor+spark[1]*zoom,8,0,Math.PI*2);ctx.stroke()}arrow(ctx,p2x,p2y,tuple('ground.velocity',[0,0]),'#ffb04d');ctx.fillStyle='#fff';ctx.fillText('P1'+(visual?.stateNumber!==null?' · State '+visual.stateNumber:''),p1x-28,floor+22);ctx.fillText('P2 · '+(fx.active?'normal palette + PalFX':'position preview'),p2x-45,p2y+22);ctx.restore();document.getElementById('visualStatus').textContent=visual?.state==='ready'?(visual.character+' · P1 Action '+visual.p1Action+' · P2 Action '+visual.p2Action+' · tick '+tick+(fx.active?' · PalFX color-accurate P2 (no darkening)':'')+(shakeTime!==0?' · envshake preview':'')):(visual?.detail||'No character preview available.')}
function actionOptions(selected){return(visual?.actions||[]).map(a=>'<option value="'+a.number+'" '+(a.number===selected?'selected':'')+'>'+a.number+' · '+a.frames+'f / '+a.ticks+'t</option>').join('')}
function renderTrack(id,label,track){let start=0;document.getElementById(id).innerHTML='<span class="track-label">'+label+'</span>'+(track?.frames||[]).map((f,i)=>{const at=start;start+=Math.max(1,Number(f.time)||1);return'<button class="frame '+(trackFrame(track,tick)===f?'active':'')+'" data-tick="'+at+'">'+(f.image?'<img src="'+f.image.src+'" style="width:52px;height:48px;object-fit:contain;image-rendering:pixelated">':'')+'<br>'+f.group+','+f.index+' · '+f.time+'t</button>'}).join('');document.querySelectorAll('#'+id+' [data-tick]').forEach(x=>x.onclick=()=>{stop();tick=Number(x.dataset.tick);renderTracks();draw()})}
function renderTracks(){renderTrack('p1Track','P1',visual?.p1);renderTrack('p2Track','P2',visual?.p2)}
function renderVisual(){const p1=document.getElementById('p1Action'),p2=document.getElementById('p2Action');p1.innerHTML=actionOptions(visual?.p1Action);p2.innerHTML=actionOptions(visual?.p2Action);if(visual?.p1Action!==undefined)p1.value=visual.p1Action;if(visual?.p2Action!==undefined)p2.value=visual.p2Action;tick=0;images.clear();fxImages.clear();renderTracks();draw()}
function stop(){playing=false;clearInterval(timer);document.getElementById('play').textContent='Play'}function play(){if(playing)return stop();playing=true;document.getElementById('play').textContent='Pause';timer=setInterval(()=>{const end=Math.max(total(visual?.p1),total(visual?.p2),1);tick=(tick+1)%end;renderTracks();draw()},1000/60)}function step(amount){stop();const end=Math.max(total(visual?.p1),total(visual?.p2),1);tick=(tick+amount+end)%end;renderTracks();draw()}
function render(){document.body.dataset.codeLanguage=model.syntax==='zss'?'zss':'ikemen-cns';document.getElementById('file').textContent=model.fileLabel;document.getElementById('count').textContent=model.currentIndex<0?'No HitDef':(model.currentIndex+1)+' / '+model.blocks.length;document.getElementById('previous').disabled=model.currentIndex<=0;document.getElementById('next').disabled=model.currentIndex<0||model.currentIndex>=model.blocks.length-1;document.getElementById('warning').innerHTML=model.duplicates.length?'<div class="notice">Duplicate options must be resolved in text before applying: '+esc([...new Set(model.duplicates)].join(', '))+'</div>':'';document.getElementById('groups').innerHTML=model.groups.map(g=>'<details class="group" '+(g.open?'open':'')+'><summary>'+esc(g.label)+' · '+g.parameters.length+'</summary>'+g.parameters.map(p=>'<div class="field" data-option="'+esc(p.name)+'" title="'+esc(p.description)+'"><input type="checkbox" '+(p.enabled?'checked':'')+' aria-label="Include '+esc(p.name)+'"><span class="name">'+esc(p.name)+(p.required?' *':'')+(['p1stateno','p2stateno'].includes(p.key)?'<button data-open-state="'+p.key+'" title="Open this destination state">↗</button>':'')+'</span><input type="text" data-ikemen-map-field="expression" data-ikemen-map-id="hitdef-'+esc(p.key)+'" aria-label="'+esc(p.name)+' value" value="'+esc(p.value)+'" placeholder="'+esc(p.placeholder||'value')+'"><span class="hint">'+esc(p.description)+'</span></div>').join('')+'</details>').join('');document.querySelectorAll('.field input').forEach(x=>x.addEventListener('input',()=>{preview();fxImages.clear();draw()}));document.querySelectorAll('[data-open-state]').forEach(x=>x.onclick=()=>vscode.postMessage({type:'openState',state:Number(value(x.dataset.openState,''))}));globalThis.ikemenRestoreHitdefDraft?.();preview();renderVisual()}
document.getElementById('apply').onclick=()=>vscode.postMessage({type:'apply',file:model.file,sourceHash:globalThis.ikemenHitdefDraftBase(),changes:parameters(),index:model.currentIndex});document.getElementById('new').onclick=()=>vscode.postMessage({type:'new',file:model.file,index:model.currentIndex,sourceHash:globalThis.ikemenHitdefDraftBase(),changes:parameters()});document.getElementById('follow').onclick=()=>vscode.postMessage({type:'follow'});document.getElementById('chooseCharacter').onclick=()=>vscode.postMessage({type:'chooseCharacter'});document.getElementById('previous').onclick=()=>vscode.postMessage({type:'select',index:model.currentIndex-1});document.getElementById('next').onclick=()=>vscode.postMessage({type:'select',index:model.currentIndex+1});document.getElementById('play').onclick=play;document.getElementById('prevFrame').onclick=()=>step(-1);document.getElementById('nextFrame').onclick=()=>step(1);document.getElementById('p1Action').onchange=e=>vscode.postMessage({type:'previewActions',p1:Number(e.target.value),p2:Number(document.getElementById('p2Action').value)});document.getElementById('p2Action').onchange=e=>vscode.postMessage({type:'previewActions',p1:Number(document.getElementById('p1Action').value),p2:Number(e.target.value)});document.getElementById('shadeP2').onchange=draw;document.getElementById('throwCreator').onclick=()=>vscode.postMessage({type:'throwCreator'});document.getElementById('fit').onclick=()=>{zoom=2;panX=panY=0;vscode.setState({...vscode.getState(),zoom,panX,panY});draw()};document.getElementById('actual').onclick=()=>{zoom=1;draw()};
const canvas=document.getElementById('canvas');let drag=null,pointer=null;
const findSparkButton=document.createElement('button');findSparkButton.id='findSpark';findSparkButton.textContent='Find Spark';findSparkButton.title='Pan the view to the current hit spark without changing sparkxy';document.getElementById('actual').after(findSparkButton);
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height,dx:canvas.width/r.width,dy:canvas.height/r.height}}
function sparkCanvasPoint(){if(!parameter('sparkxy').enabled)return null;const w=Math.max(1,Math.round(canvas.clientWidth)),h=Math.max(1,Math.round(canvas.clientHeight)),spark=tuple('sparkxy',[0,0]),shakeTime=number('envshake.time',0),shakeAmp=number('envshake.ampl',0),shakeFreq=number('envshake.freq',60),shakePhase=number('envshake.phase',0),shake=shakeTime!==0?Math.sin((tick+shakePhase)*shakeFreq*Math.PI/180)*shakeAmp:0;return{x:w*.42+panX+spark[0]*zoom,y:h*.78+panY+spark[1]*zoom+shake,values:spark}}
findSparkButton.onclick=()=>{const point=sparkCanvasPoint();if(!point){document.getElementById('status').textContent='Enable sparkxy before centering its marker.';return}panX+=canvas.width/2-point.x;panY+=canvas.height/2-point.y;vscode.setState({...vscode.getState(),zoom,panX,panY});draw();document.getElementById('status').textContent='Centered the sparkxy marker without changing its values.'};
function overSpark(e){const spark=sparkCanvasPoint();if(!spark)return null;const p=canvasPoint(e);return Math.hypot(p.x-spark.x,p.y-spark.y)<=18?spark:null}
function sparkControls(){const row=[...document.querySelectorAll('[data-option]')].find(x=>x.dataset.option.toLowerCase()==='sparkxy');return row?{row,check:row.querySelector('input[type=checkbox]'),input:row.querySelector('input[type=text]')}:null}
canvas.onpointerdown=e=>{pointer=e.pointerId;const spark=overSpark(e);if(spark)stop();drag={mode:spark?'spark':'pan',x:e.clientX,y:e.clientY,panX,panY,spark:spark?.values,sparkCanvasX:spark?.x,sparkCanvasY:spark?.y};canvas.setPointerCapture(e.pointerId)};
canvas.onpointermove=e=>{if(e.pointerId===pointer&&drag){const p=canvasPoint(e),dx=(e.clientX-drag.x)*p.dx,dy=(e.clientY-drag.y)*p.dy;if(drag.mode==='spark'){const controls=sparkControls();if(controls){const nextX=Math.round(drag.spark[0]+dx/zoom),nextY=Math.round(drag.spark[1]+dy/zoom);controls.check.checked=true;controls.input.value=nextX+', '+nextY;preview();fxImages.clear();draw();document.getElementById('status').textContent='sparkxy position drafted. Use Apply to Code when ready.'}}else{panX=drag.panX+dx;panY=drag.panY+dy;draw()}return}canvas.style.cursor=overSpark(e)?'crosshair':'grab'};
const endDrag=e=>{if(e.pointerId!==pointer)return;const controls=drag?.mode==='spark'?sparkControls():null;pointer=null;drag=null;canvas.style.cursor='grab';if(controls)controls.input.dispatchEvent(new Event('input',{bubbles:true}));vscode.setState({...vscode.getState(),zoom,panX,panY})};canvas.onpointerup=endDrag;canvas.onpointercancel=endDrag;canvas.onlostpointercapture=endDrag;
canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.25,Math.min(8,zoom*(e.deltaY<0?1.12:.89)));vscode.setState({...vscode.getState(),zoom,panX,panY});draw()};canvas.ondblclick=()=>{panX=panY=0;draw()};window.addEventListener('message',e=>{if(e.data.type==='model'){stop();model=e.data.model;visual=model.visual;render()}else if(e.data.type==='visual'){stop();visual=e.data.visual;renderVisual()}else if(e.data.type==='status')document.getElementById('status').textContent=e.data.text});${require('./hitdef_drafts').clientScript()}${launchControlsClientScript()}const canvasObserver=new ResizeObserver(()=>draw());canvasObserver.observe(canvas.parentElement);render();
</script><script>globalThis.ikemenNavigationSelection=()=>({sourceHash:model.sourceHash,index:model.currentIndex,defPath:visual?.defPath||'',p1Action:visual?.p1Action,p2Action:visual?.p2Action});globalThis.ikemenCanRestoreNavigation=reference=>JSON.stringify(reference)===JSON.stringify(globalThis.ikemenNavigationSelection());globalThis.ikemenRestoreNavigation=()=>{};</script></body></html>`; }

async function resolveEditor() {
  const owner=session,uri=owner?.uri;
  if (eligible(vscode.window.activeTextEditor) && (!uri || vscode.window.activeTextEditor.document.uri.toString() === uri.toString())) return vscode.window.activeTextEditor;
  if (uri) {
    const document = await vscode.workspace.openTextDocument(uri);
    if(session!==owner||owner.uri!==uri)return null;
    return vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === uri.toString()) || { document, selection: { active: document.positionAt(owner.offset || 0) } };
  }
  return null;
}
async function refresh(index) {
  const owner=session,uri=owner?.uri;if(!owner)return;
  const editor = await resolveEditor(); if (!editor||session!==owner||owner.uri!==uri) return;
  const document = editor.document, offset = Number.isInteger(index) && index >= 0 ? parseHitDefs(document.getText(), syntaxFor(document))[index]?.start || 0 : document.offsetAt(editor.selection.active);
  session.uri = document.uri; session.offset = offset; session.index = Number.isInteger(index) ? index : undefined;
  const model = documentModel(document, offset, session.defPath, session.p1Action, session.p2Action);
  if (model.visual?.defPath) session.defPath = model.visual.defPath;
  session.panel.webview.postMessage({ type: 'model', model });
}
async function openStateDefinition(defPath, state) {
  if (!Number.isFinite(Number(state))) return vscode.window.showWarningMessage('Enter a numeric destination state first.');
  const assets = resolveAssigned(defPath || ''), files = (assets.code || []).filter((filename) => filename && fs.existsSync(filename));
  const escaped = String(Number(state)).replace('-', '\\-'), patterns = [new RegExp(`^\\s*\\[\\s*StateDef\\s+${escaped}(?:\\s|,|\\])`, 'im'), new RegExp(`\\bstateDef\\s+${escaped}\\s*\\{`, 'i')], matches = [];
  for (const filename of files) {
    const text = currentText(filename), found = patterns.map((pattern) => pattern.exec(text)).find(Boolean);
    if (found) matches.push({ filename, offset: found.index });
  }
  if (!matches.length) return vscode.window.showWarningMessage(`State ${state} was not found in the chosen character's assigned code files.`);
  let target = matches[0];
  if (matches.length > 1) {
    const picked = await vscode.window.showQuickPick(matches.map((item) => ({ label: path.basename(item.filename), description: item.filename, item })), { title: `Open State ${state}` });
    if (!picked) return; target = picked.item;
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target.filename)), editor = await vscode.window.showTextDocument(document, { preview: false }), position = document.positionAt(target.offset);
  editor.selection = new vscode.Selection(position, position); editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}
async function resolveHitDefSource(seed) {
  let filename = seed?.fsPath || (typeof seed === 'string' ? seed : '');
  if (!filename) {
    if (eligible(vscode.window.activeTextEditor)) return { editor: vscode.window.activeTextEditor, defPath: '' };
    const activeFile = vscode.window.activeTextEditor?.document.fileName || '';
    filename = /\.def$/i.test(activeFile) ? activeFile : await chooseCharacterDef(undefined, { title: 'HitDef Editor — Choose Character' });
    if (!filename) return null;
  }
  let source = filename;
  const defPath = /\.def$/i.test(filename) ? filename : '';
  if (defPath) {
    const choices = [];
    for (const file of [...new Set(resolveAssigned(defPath).code || [])]) {
      if (!fs.existsSync(file)) continue;
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      const syntax = syntaxFor(document);
      if (!syntax) continue;
      const count = parseHitDefs(document.getText(), syntax).length;
      choices.push({ label: path.basename(file), description: `${count} HitDef${count === 1 ? '' : 's'} · ${path.relative(path.dirname(defPath), file)}`, file, count });
    }
    choices.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (!choices.length) { vscode.window.showWarningMessage('This character has no supported assigned code files. Open a ZSS or CNS source file first.'); return null; }
    const chosen = await vscode.window.showQuickPick(choices, { title: 'HitDef Editor — Choose Connected Source', placeHolder: 'Choose an existing attack controller or a source for a new HitDef.' });
    if (!chosen) return null;
    source = chosen.file;
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(source));
  return { editor: await vscode.window.showTextDocument(document, { preview: false }), defPath };
}
async function openHitDefEditor(seed, options={}) {
  if(session?.busy){await vscode.window.showWarningMessage('Wait for the current HitDef edit to finish before reopening this view.');return session.panel;}
  const reference=options?.preset?options.reference:null,filename=seed?.fsPath||(typeof seed==='string'?seed:'');let resolved;
  if(reference){
    if(!filename||!fs.existsSync(filename)||typeof reference.sourceHash!=='string'||!Number.isInteger(reference.index))return;
    const document=await vscode.workspace.openTextDocument(vscode.Uri.file(filename));if(hash(document.getText())!==reference.sourceHash)return;
    const blocks=parseHitDefs(document.getText(),syntaxFor(document));if(reference.index<0||reference.index>=blocks.length)return;
    const editor=await vscode.window.showTextDocument(document,{preview:false}),position=document.positionAt(blocks[reference.index].start);editor.selection=new vscode.Selection(position,position);editor.revealRange?.(new vscode.Range(position,position),vscode.TextEditorRevealType?.InCenter);resolved={editor,defPath:reference.defPath&&fs.existsSync(reference.defPath)?reference.defPath:''};
  }else resolved = await resolveHitDefSource(seed);
  if (!resolved) return;
  const { editor } = resolved;
  if (!eligible(editor)) return vscode.window.showWarningMessage('Open a ZSS, CNS, CMD, or compatible text code file first.');
  const offset = editor.document.offsetAt(editor.selection.active), defPath = resolved.defPath || detectedDef(editor.document), model = documentModel(editor.document, offset, defPath, reference?.p1Action, reference?.p2Action);
  if(session?.busy)return session.panel;
  if(session&&session.uri.toString()!==editor.document.uri.toString()){const previous=session;if(!await require('./viewer_close').prepare([previous.panel],vscode)||session!==previous)return;await formDrafts.flush();}
  if (session) { session.draftFiles.add(editor.document.fileName.toLowerCase()); session.uri = editor.document.uri; session.offset = offset; session.index = model.currentIndex; session.defPath = model.visual?.defPath || defPath; session.p1Action = model.visual?.p1Action; session.p2Action = model.visual?.p2Action; session.panel.webview.html = require('./webview_policy').protect(page(model)); const sessions=require('./viewer_sessions');if(sessions.has(session.panel))sessions.updateSource(session.panel,editor.document.fileName);else sessions.register(session.panel,editor.document.fileName,'hitdef',true);session.panel.reveal(preferredViewerColumn(vscode.ViewColumn.Active), false); return session.panel; }
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenHitDefEditor', 'HitDef Editor', preferredViewerColumn(vscode.ViewColumn.Active, editor.viewColumn), { enableScripts: true, retainContextWhenHidden: true }));
  session = { panel, draftFiles:new Set([editor.document.fileName.toLowerCase()]), uri: editor.document.uri, offset, index: model.currentIndex, defPath: model.visual?.defPath || defPath, p1Action: model.visual?.p1Action, p2Action: model.visual?.p2Action }; panel.webview.html = require('./webview_policy').protect(page(model));
  require('./viewer_sessions').register(panel,editor.document.fileName,'hitdef',true);
  if (session.defPath) registerCharacterToolPanel(panel, session.defPath, 'HitDef Editor', [editor.document.fileName, model.visual?.files?.air, model.visual?.files?.sff].filter(Boolean));
  require('./viewer_close').support(panel,{isBusy:()=>session?.panel===panel&&!!session.busy,keepDraft:()=>formDrafts.flush()});
  panel.onDidDispose(() => { if(session?.panel===panel)session = null; });
  panel.webview.onDidReceiveMessage(async (message) => {
    const owner=session,sourceUri=owner?.uri?.toString();if(owner?.panel!==panel)return;
    if(['hitdefDraft','hitdefDiscardDraft'].includes(message.type)){
      if(typeof message.file!=='string'||!session?.draftFiles.has(message.file.toLowerCase())||!Number.isInteger(message.index))return;
      const key=draftKey(message.file,message.index);
      try{if(message.type==='hitdefDiscardDraft')await formDrafts.discard(key);else if(typeof message.draft?.base==='string'&&Array.isArray(message.draft.fields))await formDrafts.stage(key,message.draft);}
      catch(error){vscode.window.showWarningMessage('The HitDef draft remains in this session but could not be stored for reopening: '+error.message);}
      return;
    }
    if(await handleLaunchMessage(message,owner.defPath||owner.uri.fsPath,'code',panel))return;
    if(message.type==='saveCode'){
      if(owner.busy)return panel.webview.postMessage({type:'sourceSaveStatus',state:sourceState((await vscode.workspace.openTextDocument(owner.uri)),path.basename(owner.uri.fsPath)),message:'Wait for the current HitDef edit to finish before saving.'});
      owner.busy=true;try{const document=await vscode.workspace.openTextDocument(owner.uri),result=await saveSourceDocument(document,path.basename(document.fileName));return panel.webview.postMessage({type:'sourceSaveStatus',state:sourceState(document,path.basename(document.fileName)),message:result.message});}finally{owner.busy=false;}
    }
    if(owner.busy)return;const mutating=['apply','new'].includes(message.type);if(mutating)owner.busy=true;try{
    const target = await resolveEditor(); if (!target||session!==owner||session.uri.toString()!==sourceUri) return;
    const document = target.document, text = document.getText(), syntax = syntaxFor(document), blocks = parseHitDefs(text, syntax);
    if (message.type === 'follow') { session.p1Action = undefined; return refresh(); }
    if (message.type === 'select') { session.index = message.index; session.p1Action = undefined; return refresh(message.index); }
    if (message.type === 'previewActions') {
      session.p1Action = message.p1; session.p2Action = message.p2;
      return panel.webview.postMessage({ type: 'visual', visual: visualModel(document, session.offset, session.defPath, session.p1Action, session.p2Action) });
    }
    if (message.type === 'chooseCharacter') {
      const chosen = await chooseCharacterDef(undefined, { title: 'HitDef Preview Character' }); if (!chosen||session!==owner||session.uri.toString()!==sourceUri) return;
      session.defPath = chosen; session.p1Action = undefined; session.p2Action = undefined; registerCharacterToolPanel(panel, chosen, 'HitDef Editor', [document.fileName]); return refresh(session.index);
    }
    if (message.type === 'openState') return openStateDefinition(session.defPath, message.state);
    if (message.type === 'throwCreator') return vscode.commands.executeCommand('ikemen.throwCreator.open', session.defPath ? vscode.Uri.file(session.defPath) : undefined);
    if (['apply', 'new'].includes(message.type) && (message.file!==document.fileName || message.sourceHash !== hash(text))) {
      const warning = 'The source changed after this preview. Use Follow Cursor to reload it before applying.';
      panel.webview.postMessage({ type: 'status', text: warning });
      return vscode.window.showWarningMessage(warning);
    }
    if (message.type === 'apply') {
      const block = blocks[message.index]; if (!block) return vscode.window.showWarningMessage('No existing HitDef is selected. Use New HitDef instead.');
      try {
        const next = updateHitDef(text, block, message.changes), edit = new vscode.WorkspaceEdit(); edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(text.length)), next); if(!await vscode.workspace.applyEdit(edit))return panel.webview.postMessage({type:'status',text:'VS Code did not apply the HitDef edit. Nothing was saved.'}); await acknowledgeDraft(document.fileName,message.index,message.sourceHash,message.changes,panel);if(session!==owner||session.uri.toString()!==sourceUri)return; session.index = message.index; await refresh(message.index); panel.webview.postMessage({ type: 'status', text: 'HitDef applied to the open document—not saved to disk yet. Use Undo to reverse the complete edit.' });
      } catch (error) { vscode.window.showErrorMessage(error.message); }
      return;
    }
    if (message.type === 'new') {
      const selected = Object.fromEntries(message.changes.filter((item) => item.enabled && String(item.value).trim()).map((item) => [item.name, item.value])), insert = target.selection.active, insertOffset = document.offsetAt(insert), controller = newHitDef(syntax, 'New', selected), prefix = insert.character ? '\n' : '', edit = new vscode.WorkspaceEdit(); edit.insert(document.uri, insert, `${prefix}${controller}`); if(!await vscode.workspace.applyEdit(edit))return panel.webview.postMessage({type:'status',text:'VS Code did not insert the HitDef. Nothing was saved.'}); await acknowledgeDraft(document.fileName,message.index,message.sourceHash,message.changes,panel);if(session!==owner||session.uri.toString()!==sourceUri)return; session.offset = insertOffset + prefix.length; await refresh(); panel.webview.postMessage({ type: 'status', text: 'New HitDef inserted into the open document—not saved to disk yet.' });
    }
    }finally{if(mutating)owner.busy=false;}
  });
  return panel;
}

async function acknowledgeDraft(file,index,base,fields,panel){
  const key=draftKey(file,index),draft={base,fields};
  try{await formDrafts.discard(key,draft);}catch(error){await vscode.window.showWarningMessage('The HitDef was applied successfully, but clearing its stored draft failed. An older recovery draft may appear when reopened: '+error.message);}
  await panel.webview.postMessage({type:'hitdefDraftApplied',key,draft});
}
function registerHitDefWorkspace(context) {
  formDrafts=new (require('./form_drafts').FormDrafts)(context.workspaceState);
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.hitDef.openEditor', openHitDefEditor),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (!session || !eligible(event.textEditor) || event.textEditor.document.uri.toString() !== session.uri.toString()) return;
      session.offset = event.textEditor.document.offsetAt(event.selections[0].active);
    })
  );
  if(vscode.workspace.onDidChangeTextDocument)context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => { if (session && event.document.uri.toString() === session.uri.toString()) session.panel.webview.postMessage({ type: 'sourceSaveStatus', state: sourceState(event.document, path.basename(event.document.fileName)) }); }));
  if(vscode.workspace.onDidSaveTextDocument)context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => { if (session && document.uri.toString() === session.uri.toString()) session.panel.webview.postMessage({ type: 'sourceSaveStatus', state: sourceState(document, path.basename(document.fileName)) }); }));
}
module.exports = { registerHitDefWorkspace, openHitDefEditor, documentModel, syntaxFor, page, visualModel, resolveHitDefSource };
