'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const {hash}=require('./mutation_safety');
const { registerCharacterToolPanel } = require('./authoring_context_registry');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { readSff, spriteDataUri } = require('./sff_reader');
const { assignedDefault } = require('./palette_preview');
const { parseConstants, moveGroups, fieldsFor, actionTimeline, reactionSummary, updateConstant, resolveMoveTargets, copyMoveFields, hitPauseTicks, airTimingProposal } = require('./move_constants_model');
const { chooseCharacterDef } = require('./character_picker');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');
const { fieldExplanation, timingProblems, connectedCode, diagnosticProblems } = require('./attack_workspace_model');

let session = null;
let formDrafts=new (require('./form_drafts').FormDrafts)();
let codeFormDrafts=new (require('./form_drafts').FormDrafts)();
const draftKey=(def,id)=>'move-constants:'+def.toLowerCase()+'#'+id;
const codeDraftKey=(def,id)=>'move-code:'+def.toLowerCase()+'#'+id;
function clean(value) { return String(value || '').replace(/\s*;.*/, '').trim().replace(/^['"]|['"]$/g, ''); }
function safe(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
const identity = filename => path.resolve(filename || '').toLowerCase();
function constantsReference(move, assets, model, extra = {}) {
  return move ? { defPath: assets.defPath, profileId: move.id, prefix: move.prefix, sourceFilename: assets.constants, sourceHash: model.timingSources?.constants, actionNumber: move.timeline?.actionNumber, ...extra } : null;
}
function validConstantsReference(reference, assets, model) {
  if (!reference || identity(reference.defPath) !== identity(assets.defPath) || identity(reference.sourceFilename) !== identity(assets.constants) || reference.sourceHash !== model.timingSources?.constants) return null;
  const move = model.moves.find(item => item.id === reference.profileId);
  if (!move || move.prefix !== reference.prefix) return null;
  if (reference.actionNumber !== undefined && reference.actionNumber !== move.timeline?.actionNumber) return null;
  if (reference.frameIndex !== undefined && (!Number.isInteger(reference.frameIndex) || reference.frameIndex < 0 || reference.frameIndex >= (move.timeline?.frames?.length || 0))) return null;
  return move;
}

function characterAssets(defPath) {
  const text = fs.readFileSync(defPath, 'utf8'), folder = path.dirname(defPath), find = (name) => new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'im').exec(text);
  const resolve = (match) => match ? path.resolve(folder, clean(match[1]).replace(/[\\/]/g, path.sep)) : '';
  const constants = resolve(find('cns')), air = resolve(find('anim')), sff = resolve(find('sprite'));
  if (!constants || !air || !sff || ![constants, air, sff].every(fs.existsSync)) throw new Error('The character DEF must resolve an existing cns, anim, and sprite file.');
  const assigned = require('./related_work').resolveAssigned(defPath);
  return { ...assigned, defPath, folder, constants, air, sff, code: assigned.code || [] };
}

async function chooseDef(uri) {
  return chooseCharacterDef(uri, { title: 'Move Lab — Constants Character' });
}

async function currentText(filename) {
  const open = vscode.workspace.textDocuments.find((document) => path.resolve(document.fileName).toLowerCase() === path.resolve(filename).toLowerCase());
  return open ? open.getText() : fs.readFileSync(filename, 'utf8');
}

function contactProfile(assignments, move) {
  const strength = ['', 'light', 'medium', 'heavy'][Number(move.values.attackStrength)] || '';
  if (!strength) return [];
  const prefix = `JNP_SF6_cfg_normal_${strength}_`, wanted = [
    ['guard_damage', 'Chip damage'], ['hit_pause_p1', 'Hit pause P1'], ['hit_pause_p2', 'Hit pause P2'],
    ['guard_pause_p1', 'Guard pause P1'], ['guard_pause_p2', 'Guard pause P2'], ['air_hit_time', 'Air hitstun'],
    ['ground_velocity_x', 'Ground hit velocity X'], ['guard_velocity_x', 'Guard velocity X'],
    ['air_velocity_x', 'Air hit velocity X'], ['air_velocity_y', 'Air hit velocity Y'], ['y_accel', 'Air Y acceleration']
  ];
  return wanted.map(([suffix, label]) => { const item = assignments.get((prefix + suffix).toLowerCase()); return item ? { ...item, label, sharedLabel: `${strength} normal profile` } : null; }).filter(Boolean);
}

async function modelFor(assets) {
  const constantsText = await currentText(assets.constants), airText = await currentText(assets.air), parsed = parseConstants(constantsText), moves = moveGroups(parsed);
  const archive = readSff(assets.sff), palette = assignedDefault(archive, assets.sff).index, airActions = require('./air_preview_model').parseAir(airText);
  const reactionSpecs = [
    { id: 'stand-high', label: 'Standing high', action: 5000, posture: 'standing' },
    { id: 'stand-low', label: 'Standing low', action: 5001, posture: 'standing' },
    { id: 'crouching', label: 'Crouching', action: 5010, posture: 'crouching' },
    { id: 'airborne', label: 'Airborne', action: 5020, posture: 'airborne' }
  ];
  const reactionPreviews = reactionSpecs.map((spec) => {
    const action = airActions.find((item) => item.number === spec.action); if (!action) return null;
    const frames = action.frames.map((frame) => {
      const sprite = archive.sprites.find((item) => item.group === frame.group && item.number === frame.index); let image = null;
      if (sprite) try { image = { src: spriteDataUri(archive, sprite, palette), width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY }; } catch (_) {}
      return { ...frame, image };
    });
    return { ...spec, frames, loopStart: action.loopStart, totalTicks: frames.reduce((sum, frame) => sum + Math.max(1, Number(frame.time) || 1), 0) };
  }).filter(Boolean);
  const output = [], openDocuments = vscode.workspace.textDocuments || [], wanted = new Set([assets.constants, assets.air, ...(assets.code || [])].filter(Boolean).map(file => path.resolve(file).toLowerCase())), diagnostics = [], sharedAssignments = new Map(), sharedProfile = require('./move_constants_shared_profile');
  for (const filename of assets.code || []) {
    let text = ''; try { text = await currentText(filename); } catch (_) { continue; }
    const lines = text.split(/\r?\n/);
    for (let line = 0; line < lines.length; line++) {
      const assignment = sharedProfile.parseAssignmentLine(lines[line]);
      if (assignment) sharedAssignments.set(assignment.name.toLowerCase(), { name: assignment.name, value: assignment.value, filename, line, sourceHash: hash(text) });
    }
  }
  for (const [uri, items] of (vscode.languages?.getDiagnostics?.() || [])) if (uri?.fsPath && wanted.has(path.resolve(uri.fsPath).toLowerCase())) for (const item of items) diagnostics.push({ filename: uri.fsPath, line: item.range.start.line, character: item.range.start.character, severity: item.severity, message: item.message, source: item.source || 'IKEMEN' });
  for (const move of moves) {
    const timeline = actionTimeline(airText, move), images = {};
    if (timeline.state === 'ready') for (const frame of timeline.frames) {
      const key = `${frame.group},${frame.index}`; if (images[key]) continue;
      const sprite = archive.sprites.find((item) => item.group === frame.group && item.number === frame.index);
      if (sprite) try { images[key] = { src: spriteDataUri(archive, sprite, palette), width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY }; } catch (_) {}
    }
    const codeSections = connectedCode(assets, move, openDocuments), fields = fieldsFor(move).map(field => ({ ...field, explanation: fieldExplanation(field) }));
    output.push({ ...move, fields, timeline, images, codeSections, contactProfile: contactProfile(sharedAssignments, move), problems: [...timingProblems({ ...move, timeline }), ...diagnosticProblems(diagnostics, codeSections)], reactionPreviews, reactions: { normal: reactionSummary(move, 'normal'), counter: reactionSummary(move, 'counter'), punish: reactionSummary(move, 'punish') } });
  }
  const fileStatus = [assets.constants, assets.air, ...(assets.code || [])].filter(Boolean).map(filename => { const document=openDocuments.find(item=>path.resolve(item.fileName).toLowerCase()===path.resolve(filename).toLowerCase()); return { filename, label:path.basename(filename), dirty:Boolean(document?.isDirty) }; });
  const codePrefix=codeDraftKey(assets.defPath,''),codeDrafts={};
  for(const [key,value] of Object.entries(codeFormDrafts.entries||{}))if(key.startsWith(codePrefix)&&value&&Object.keys(value).length)codeDrafts[key.slice(codePrefix.length)]=value;
  return { character: path.basename(assets.folder), files: assets, fileStatus, timingSources:{constants:hash(constantsText),air:hash(airText)}, moves: output, codeDrafts, formDrafts:Object.fromEntries(output.map(move=>[move.id,formDrafts.read(draftKey(assets.defPath,move.id))||{}])) };
}

function html(model) { const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{display:flex;flex-direction:column;margin:0;height:100vh;overflow:hidden;font:12px var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground)}button,input,select{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:5px}button{cursor:pointer;background:var(--vscode-button-secondaryBackground)}header{min-height:46px;flex-shrink:0;max-height:35vh;overflow:auto;display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:7px 10px;border-bottom:1px solid var(--vscode-panel-border)}.grow{flex:1}.layout{flex:1;min-height:0;display:grid;grid-template-columns:360px minmax(480px,1fr) 300px}.rail{overflow:auto;padding:10px}.left{border-right:1px solid var(--vscode-panel-border)}.right{border-left:1px solid var(--vscode-panel-border)}.center{display:grid;grid-template-rows:minmax(350px,1fr) 150px;min-width:0}.stage{position:relative;overflow:hidden;background:linear-gradient(#101827,#202838);border-bottom:1px solid var(--vscode-panel-border)}canvas{position:absolute;inset:0;display:block;width:100%;height:100%;image-rendering:pixelated;cursor:grab}canvas:active{cursor:grabbing}.timeline{display:flex;overflow:auto;gap:5px;padding:8px}.frame{min-width:92px;border:2px solid var(--vscode-panel-border);padding:4px;text-align:center}.frame.selected{outline:2px solid var(--vscode-focusBorder)}.frame.startup{border-color:#7f8c9a}.frame.active,.frame.authored-window{border-color:#49d17d}.frame.recovery{border-color:#dfb64b}.frame.hitpause{box-shadow:inset 0 -5px #c47cff}.frame.hp-start{border-left-width:6px}.frame.hp-freeze{border-right-width:6px;border-right-color:#ff9f43}.frame img{width:80px;height:84px;object-fit:contain;image-rendering:pixelated}.move-picker{margin-bottom:10px}.move-picker input{width:100%;margin:5px 0}.move-list{height:180px;overflow:auto;border:1px solid var(--vscode-panel-border);padding:3px}.move-item{display:block;width:100%;text-align:left;margin:2px 0;border-left:3px solid transparent}.move-item.active{border-left-color:var(--vscode-focusBorder);background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.category{margin:10px 0;border:1px solid var(--vscode-panel-border)}.category summary{padding:7px;font-weight:700;cursor:pointer}.category-actions{display:flex;gap:5px;padding:0 7px 5px;flex-wrap:wrap}.category-actions button{flex:1}.field{display:grid;grid-template-columns:18px minmax(70px,1fr) minmax(60px,90px);gap:5px;align-items:center;padding:4px 7px}.field input,.field select{width:100%}.field input[type=checkbox]{width:auto}.field button{padding:4px}.field-actions{grid-column:2 / -1;display:flex;gap:5px;justify-content:flex-end}.muted{color:var(--vscode-descriptionForeground)}.card{padding:8px;margin:8px 0;background:var(--vscode-editor-inactiveSelectionBackground)}.contact-summary{margin:6px 0;padding:6px;background:var(--vscode-textBlockQuote-background)}.quick-grid{display:grid;grid-template-columns:1fr;gap:4px}.quick-field{display:grid;grid-template-columns:minmax(95px,1fr) 72px 30px;gap:4px;align-items:center}.quick-field input{width:100%}.quick-field button{padding:4px}.profile-values{margin-top:8px;border-top:1px solid var(--vscode-panel-border);padding-top:6px}.profile-values summary{cursor:pointer;font-weight:700}.profile-value{display:grid;grid-template-columns:minmax(95px,1fr) 92px 30px auto auto;gap:5px;align-items:center;margin:4px 0}.profile-value input{width:100%;text-align:right}.profile-conflict{grid-column:1 / -1}.modes,.playback,.opponent-controls{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.opponent-controls input{width:68px}.toggle.active,.modes button.active{outline:2px solid var(--vscode-focusBorder)}.legend{display:grid;grid-template-columns:14px 1fr;gap:5px}.swatch{height:10px}.warning{color:var(--vscode-charts-yellow)}h2,h3{margin:6px 0}@media(max-width:1000px){.layout{grid-template-columns:300px 1fr}.right{display:none}}
@media(max-width:650px){.layout{display:block;overflow:auto}.layout .rail{overflow:visible}.layout .center{height:480px}.layout .right{display:block}}</style></head><body><header><b>Move Lab</b><span class="context">Constants integration</span><span id="character"></span><span id="moveTitle"></span><div class="playback"><button id="previous" title="Previous AIR element">◀</button><button id="play" title="Play or stop this AIR action">Play</button><button id="next" title="Next AIR element">▶</button><button id="showClsn1" class="toggle active" title="Toggle attack collision boxes">Clsn1</button><button id="showClsn2" class="toggle active" title="Toggle hurt collision boxes">Clsn2</button><button id="fitView" title="Fit the current sprite in the canvas">Fit</button><button id="actualView" title="Use 100% sprite scale">100%</button><input id="viewZoom" type="range" min="25" max="800" step="25" value="200" title="Preview zoom"><span id="viewZoomValue">200%</span></div><button id="moveOverview">Overview / Related Tools</button><button id="airWorkspace">Edit in AIR Workspace</button><button id="throwCreator" title="Coordinate P1 and P2 throw animations, binds, events, and parts">Throw Creator</button><button id="linkedCode">Common / Functions…</button><button id="openConstants">Constants</button><button id="openAir">AIR Text</button><button id="launch">Live Training Preview</button><span class="grow"></span><button id="refresh">Refresh</button></header><main class="layout"><aside class="rail left"><div class="move-picker"><h3>Attack library</h3><input id="moveSearch" type="search" placeholder="Filter attacks…" aria-label="Filter attacks"><div id="moveList" class="move-list"></div></div><h3>Move characteristics</h3><p class="muted">Edit and apply one value with ✓. Copy sends one option, checked options, or a whole category to one or more existing move/state profiles after review.</p><div id="fields"></div></aside><section class="center"><div class="stage"><canvas id="canvas" width="960" height="540" title="Mouse wheel zooms. Drag the yellow spark to draft its X/Y values, drag P2 to position the opponent, or drag empty canvas space to pan. Double-click to center."></canvas></div><div class="timeline" id="timeline"></div></section><aside class="rail right"><h3>Opponent reaction estimate</h3><div class="modes"><button data-mode="normal" class="active">Normal</button><button data-mode="counter">Counter Hit</button><button data-mode="punish">Punish Counter</button></div><div class="reaction" id="reaction"><div class="spark" id="spark"></div></div><div class="card" id="reactionData"></div><div class="legend"><span class="swatch" style="background:#7f8c9a"></span><span>Startup</span><span class="swatch" style="background:#49d17d"></span><span>Active / authored active window</span><span class="swatch" style="background:#dfb64b"></span><span>Recovery</span><span class="swatch" style="background:#ff3b45"></span><span>Clsn1 (attack)</span><span class="swatch" style="background:#3d8dff"></span><span>Clsn2 (hurt)</span><span class="swatch" style="background:#ffd84a"></span><span>Default Clsn1</span><span class="swatch" style="background:#b26cff"></span><span>Default Clsn2</span><span class="swatch" style="background:#ffd84d;border-radius:50%"></span><span>Estimated hit spark (active frames only)</span></div><p class="muted">Animation starts stopped. Mouse wheel zooms the canvas. Drag the yellow spark marker to draft that active window's X/Y pair; use each field's ✓ button to apply it to code. Drag P2 to reposition the reaction preview, or drag empty space to pan. Spark X is defender-relative, so the canvas estimates contact from the leading edge of the active Clsn1. Separate active windows use explicit spark2X/spark2Y, spark3X/spark3Y, and so on; missing pairs are not guessed. Live Training Preview remains the authority for exact contact placement, physics, states, hit pause, and project systems.</p><div id="status" class="warning"></div></aside></main><script>
${require('./move_constants_view_transform').clientScript()}${require('./move_constants_shared_profile').clientScript()}const vscode=acquireVsCodeApi(),saved=vscode.getState()||{},imageCache=new Map();let model=${safe(model)},move=null,frame=0,mode='normal',draft={},profileDrafts=saved.profileDrafts&&typeof saved.profileDrafts==='object'?{...saved.profileDrafts}:{},profilePending={},profileRequestSerial=0,playing=false,timer=null,showClsn1=true,showClsn2=true,opponentEnabled=saved.opponentEnabled!==false,reactionId=saved.reactionId||'stand-high',viewZoom=moveView.clampZoom(saved.viewZoom??2),panX=Number(saved.panX)||0,panY=Number(saved.panY)||0,viewportWidth=Number(saved.viewportWidth)||960,viewportHeight=Number(saved.viewportHeight)||540;const restoredOpponent=moveView.migrateOpponent(saved,viewZoom,viewportWidth,viewportHeight);let opponentWorldX=restoredOpponent.x,opponentWorldY=restoredOpponent.y;const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function saveState(){moveDrafts.stage();saved.advancedOpen=$('advancedTools')?.open||false;saved.connectedOpen=$('connectedCode')?.open!==false;saved.openCode=[...document.querySelectorAll('.code-section[open]')].map(x=>x.dataset.section);vscode.setState({...vscode.getState(),defPath:model.files.defPath,selectedMove:move?.id,selectedFrame:frame,draft:{...draft},profileDrafts:{...profileDrafts},opponentEnabled,opponentWorldX,opponentWorldY,reactionId,viewZoom,panX,panY,viewportWidth,viewportHeight,advancedOpen:saved.advancedOpen,connectedOpen:saved.connectedOpen,openCode:saved.openCode})}
function publishMoveContext(){if(move)vscode.postMessage({type:'moveIntegrationContext',sourceId:move.id,frameIndex:frame})}
function selectMove(id,restoredDraft,restoredFrame=0){stop();move=model.moves.find(x=>x.id===id)||model.moves[0]||null;frame=Math.max(0,Math.min((move?.timeline?.frames?.length||1)-1,Number(restoredFrame)||0));draft=moveDrafts.select(move?.id===id?restoredDraft:undefined);render();saveState();publishMoveContext();vscode.postMessage({type:'viewerSelectionChanged',navigationSelection:{id:move?.id}})}
function renderMoveList(){const query=$('moveSearch').value.trim().toLowerCase(),items=model.moves.filter(x=>(x.prefix+' '+x.id+' '+x.values.moveID).toLowerCase().includes(query));$('moveList').innerHTML=items.map(x=>'<button class="move-item '+(move?.id===x.id?'active':'')+'" data-move="'+esc(x.id)+'"><b>'+esc(x.values.moveID??'—')+'</b> · '+esc(x.prefix)+'</button>').join('')||'<p class="muted">No matching attacks.</p>';document.querySelectorAll('[data-move]').forEach(x=>x.onclick=()=>selectMove(x.dataset.move))}
function stop(){playing=false;if(timer){clearTimeout(timer);timer=null}if($('play'))$('play').textContent='Play'}
function advance(delta=1,fromPlayback=false){const frames=move?.timeline.frames||[];if(!frames.length)return;let next=frame+delta;if(next>=frames.length)next=fromPlayback&&Number.isInteger(move.timeline.loopStart)?move.timeline.loopStart:0;if(next<0)next=frames.length-1;frame=next;renderTimeline();renderHeader();draw();if(fromPlayback)schedule();else{saveState();publishMoveContext()}}
function schedule(){if(!playing)return;const current=move?.timeline.frames?.[frame],ticks=Math.max(1,Number(current?.time)||1);timer=setTimeout(()=>advance(1,true),ticks*1000/60)}
function togglePlay(){if(playing)return stop();if(!(move?.timeline.frames||[]).length)return;playing=true;$('play').textContent='Stop';schedule()}
function value(s){return Object.prototype.hasOwnProperty.call(draft,s)?Number(draft[s]):Number(move.values[s]??0)}
function hasValue(s){return Object.prototype.hasOwnProperty.call(draft,s)||Object.prototype.hasOwnProperty.call(move.values,s)}
function profileDraftKey(item){return String(item?.filename||'').replace(/\\\\/g,'/').toLowerCase()+'#'+String(item?.name||'').toLowerCase()}
function profileDraft(item){const key=profileDraftKey(item);return Object.prototype.hasOwnProperty.call(profileDrafts,key)?sharedProfile.normalizeDraft(profileDrafts[key],item):null}
function sparkValues(f){if(!f?.clsnActive)return null;const hit=Math.max(1,Number(f.activeWindow)||1),xKey=hit===1?'sparkX':'spark'+hit+'X',yKey=hit===1?'sparkY':'spark'+hit+'Y';return hasValue(xKey)&&hasValue(yKey)?{hit,xKey,yKey,x:value(xKey),y:value(yKey)}:null}
function previewOrigin(){const canvas=$('canvas');return{x:canvas.width/2+panX,y:canvas.height*.8+panY}}function opponentScreenPoint(){const origin=previewOrigin();return moveView.screenPoint(origin.x,origin.y,opponentWorldX,opponentWorldY,viewZoom)}
function sparkPoint(f,scale,ox,oy){const spark=sparkValues(f);if(!spark)return null;const leading=(f.clsn1||[]).reduce((edge,box)=>Math.max(edge,Number(box[0])||0,Number(box[2])||0),0),opponent=opponentScreenPoint(),anchorX=opponentEnabled?opponent.x:ox+leading*scale,anchorY=opponentEnabled?opponent.y:oy;return{...spark,valueX:spark.x,valueY:spark.y,anchorX,anchorY,x:anchorX+spark.x*scale,y:anchorY+spark.y*scale}}
function cachedImage(info){if(!info?.src)return null;if(imageCache.has(info.src))return imageCache.get(info.src);const image=new Image();image.onload=draw;image.src=info.src;imageCache.set(info.src,image);return image}
function reactionPreview(){return move?.reactionPreviews?.find(item=>item.id===reactionId)||move?.reactionPreviews?.[0]||null}
function reactionFrame(){const preview=reactionPreview(),attack=move?.timeline.frames?.[frame],attackFrames=move?.timeline.frames||[];if(!preview?.frames?.length||!attack)return null;const contacts=attackFrames.filter((item,index)=>item.clsnActive&&item.start<=attack.start&&(index===0||attackFrames[index-1].activeWindow!==item.activeWindow)),contact=contacts.length?contacts[contacts.length-1]:null;let tick=contact?Math.max(0,attack.start-contact.start):0;for(const item of preview.frames){if(tick<Math.max(1,Number(item.time)||1))return item;tick-=Math.max(1,Number(item.time)||1)}return preview.frames[preview.frames.length-1]}
function coordinateText(value){return String(Number(Number(value).toFixed(6)))}
function renderOpponentControls(){const select=$('reactionAction'),previews=move?.reactionPreviews||[];select.innerHTML=previews.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.label)+' · Action '+item.action+'</option>').join('')||'<option value="">No standard get-hit actions found</option>';if(!previews.some(item=>item.id===reactionId))reactionId=previews[0]?.id||'';select.value=reactionId;$('showOpponent').checked=opponentEnabled;$('opponentX').value=coordinateText(opponentWorldX);$('opponentY').value=coordinateText(opponentWorldY);$('stage').classList.toggle('opponent',opponentEnabled)}
function drawOpponent(ctx,scale){if(!opponentEnabled)return;const f=reactionFrame(),info=f?.image,image=cachedImage(info),axis=opponentScreenPoint(),x=axis.x,y=axis.y;if(!image?.complete)return;ctx.save();ctx.globalAlpha=.68;ctx.filter='brightness(.38) saturate(.55)';ctx.translate(x+(f.x||0)*scale,y+(f.y||0)*scale);ctx.scale(f.flags?.includes('H')?scale:-scale,f.flags?.includes('V')?-scale:scale);ctx.imageSmoothingEnabled=false;ctx.drawImage(image,-info.axisX,-info.axisY);ctx.restore();ctx.save();ctx.strokeStyle='rgba(110,210,255,.65)';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(x-10,y);ctx.lineTo(x+10,y);ctx.moveTo(x,y-10);ctx.lineTo(x,y+10);ctx.stroke();ctx.restore()}
function fieldControl(f){const v=value(f.suffix),name=move.prefix+'.'+f.suffix;if(f.type==='enum')return '<select data-field="'+f.suffix+'">'+f.values.map((x,i)=>'<option value="'+i+'" '+(i===v?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select>';if(f.type==='boolean')return '<select data-field="'+f.suffix+'"><option value="0" '+(!v?'selected':'')+'>No</option><option value="1" '+(v?'selected':'')+'>Yes</option></select>';return '<input data-field="'+f.suffix+'" type="number" value="'+v+'" '+(f.min!==undefined?'min="'+f.min+'"':'')+'>'}
function sendCopy(suffixes){const values={};for(const suffix of suffixes)values[suffix]=value(suffix);vscode.postMessage({type:'copyFields',sourceId:move.id,suffixes,values})}
function renderFields(){const groups={};for(const f of move.fields.filter(x=>x.present))(groups[f.category]||(groups[f.category]=[])).push(f);$('fields').innerHTML=Object.entries(groups).map(([name,fields])=>{const air=name==='Animation timing'?'<button data-import-air title="Read active collision and authored frame durations from this move AIR action">Import from AIR…</button>':'';return '<details class="category" open data-category="'+esc(name)+'"><summary>'+esc(name)+'</summary><div class="category-actions">'+air+'<button data-copy-category="'+esc(name)+'" title="Copy every option in this category to other existing move/state profiles">Copy category…</button><button data-copy-checked="'+esc(name)+'" title="Copy only the checked options in this category">Copy checked…</button></div>'+fields.map(f=>'<div class="field" title="'+esc(move.prefix+'.'+f.suffix)+'"><input type="checkbox" data-copy-select="'+f.suffix+'" aria-label="Select '+esc(f.label)+' for copying"><label>'+esc(f.label)+'</label>'+fieldControl(f)+'<span class="field-actions"><button data-source="'+f.suffix+'" title="Open this constant in its text editor">Source</button><button data-apply="'+f.suffix+'" title="Apply this value to the current move">✓</button><button data-copy-one="'+f.suffix+'" title="Copy only '+esc(f.label)+' to other moves">Copy</button></span></div>').join('')+'</details>'}).join('');document.querySelectorAll('[data-field]').forEach(x=>x.oninput=()=>{draft[x.dataset.field]=Number(x.value);saveState();draw();renderReaction();renderTimeline()});document.querySelectorAll('[data-source]').forEach(x=>x.onclick=()=>vscode.postMessage({type:'open',file:'constants',sourceId:move.id,suffix:x.dataset.source}));document.querySelectorAll('[data-apply]').forEach(x=>x.onclick=()=>vscode.postMessage({type:'apply',defPath:model.files.defPath,sourceId:move.id,suffix:x.dataset.apply,base:moveDrafts.base(x.dataset.apply),name:move.prefix+'.'+x.dataset.apply,value:value(x.dataset.apply)}));document.querySelectorAll('[data-copy-one]').forEach(x=>x.onclick=()=>sendCopy([x.dataset.copyOne]));document.querySelectorAll('[data-copy-category]').forEach(x=>x.onclick=()=>sendCopy(groups[x.dataset.copyCategory].map(f=>f.suffix)));document.querySelectorAll('[data-copy-checked]').forEach(x=>x.onclick=()=>{const root=x.closest('details'),suffixes=[...root.querySelectorAll('[data-copy-select]:checked')].map(i=>i.dataset.copySelect);if(suffixes.length)sendCopy(suffixes);else $('status').textContent='Check one or more options in this category first.'});document.querySelectorAll('[data-import-air]').forEach(x=>x.onclick=()=>vscode.postMessage({type:'importAirTiming',sourceId:move.id}))}
function phase(i,f){const first=value('firstActiveElement'),idle=value('idleElement');return i+1<first?'startup':i+1>=idle?'recovery':f.clsnActive?'active':'authored-window'}
function renderTimeline(){const frames=move.timeline.frames||[],hpStart=value('hitPauseAnimateStartElement'),hpFreeze=value('hitPauseFreezeElement');$('timeline').innerHTML=frames.map((f,i)=>{const img=move.images[f.group+','+f.index],element=i+1,inRange=hpStart>0&&element>=hpStart&&element<hpFreeze,role=(element===hpStart?' · hit-pause start':'')+(element===hpFreeze?' · freeze here':'');return '<button class="frame '+phase(i,f)+(i===frame?' selected':'')+(inRange?' hitpause':'')+(element===hpStart?' hp-start':'')+(element===hpFreeze?' hp-freeze':'')+'" data-frame="'+i+'" title="Right-click to assign hit-pause animation timing">'+(img?'<img src="'+img.src+'">':'')+'<b>Element '+element+'</b><br>'+f.time+' tick'+(f.time===1?'':'s')+'<br><span class="muted">'+f.start+'–'+f.end+role+'</span></button>'}).join('')||'<p class="warning">AIR action '+move.timeline.actionNumber+' was not found.</p>';document.querySelectorAll('[data-frame]').forEach(x=>{x.onclick=()=>{stop();frame=Number(x.dataset.frame);renderTimeline();draw();saveState();publishMoveContext()};x.oncontextmenu=e=>{e.preventDefault();stop();frame=Number(x.dataset.frame);renderTimeline();draw();saveState();publishMoveContext();vscode.postMessage({type:'frameTimingMenu',sourceId:move.id,element:frame+1})}});document.querySelector('[data-frame="'+frame+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'})}
function paintBox(ctx,box,color,f,scale,ox,oy){const flipX=f.flags?.includes('H')?-1:1,flipY=f.flags?.includes('V')?-1:1,x1=box[0]*flipX,x2=box[2]*flipX,y1=box[1]*flipY,y2=box[3]*flipY,x=ox+Math.min(x1,x2)*scale,y=oy+Math.min(y1,y2)*scale,w=Math.abs(x2-x1)*scale,h=Math.abs(y2-y1)*scale;ctx.fillStyle=color+'30';ctx.strokeStyle=color;ctx.lineWidth=2;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h)}
function setViewZoom(next,pointer){const canvas=$('canvas'),old=viewZoom,value=moveView.clampZoom(next);if(pointer){const rect=canvas.getBoundingClientRect(),px=(pointer.clientX-rect.left)*canvas.width/rect.width,py=(pointer.clientY-rect.top)*canvas.height/rect.height,nextPan=moveView.zoomPan(old,value,panX,panY,px,py,canvas.width/2,canvas.height*.8);panX=nextPan.x;panY=nextPan.y}viewZoom=value;$('viewZoom').value=Math.round(value*100);$('viewZoomValue').textContent=Math.round(value*100)+'%';saveState();draw()}
function centerView(){panX=0;panY=0;saveState();draw()}
function resizePreviewCanvas(){const canvas=$('canvas'),width=Math.round(canvas.clientWidth),height=Math.round(canvas.clientHeight);if(width<1||height<1)return false;if(width===canvas.width&&height===canvas.height&&width===viewportWidth&&height===viewportHeight)return false;viewportWidth=width;viewportHeight=height;canvas.width=width;canvas.height=height;renderOpponentControls();saveState();return true}
function fitView(){resizePreviewCanvas();const f=move?.timeline.frames?.[frame],info=f&&move.images[f.group+','+f.index],canvas=$('canvas');if(!info)return centerView();viewZoom=Math.max(.25,Math.min(4,Math.min(canvas.width*.55/info.width,canvas.height*.65/info.height)));centerView();$('viewZoom').value=Math.round(viewZoom*100);$('viewZoomValue').textContent=Math.round(viewZoom*100)+'%'}
function draw(){resizePreviewCanvas();if(!move)return;const canvas=$('canvas'),ctx=canvas.getContext('2d'),f=move.timeline.frames?.[frame],scale=viewZoom,baseX=canvas.width/2+panX,baseY=canvas.height*.8+panY,ox=baseX+(f?.x||0)*scale,oy=baseY+(f?.y||0)*scale;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#132033';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#34475e';const step=Math.max(16,30*scale),gx=((baseX%step)+step)%step,gy=((baseY%step)+step)%step;for(let x=gx;x<canvas.width;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke()}for(let y=gy;y<canvas.height;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke()}ctx.strokeStyle='#5cb6ff';ctx.beginPath();ctx.moveTo(0,baseY);ctx.lineTo(canvas.width,baseY);ctx.stroke();if(!f)return;drawOpponent(ctx,scale);const info=move.images[f.group+','+f.index],image=cachedImage(info);if(image?.complete){ctx.save();ctx.translate(ox,oy);ctx.scale(f.flags?.includes('H')?-scale:scale,f.flags?.includes('V')?-scale:scale);ctx.imageSmoothingEnabled=false;ctx.drawImage(image,-info.axisX,-info.axisY);ctx.restore()}if(showClsn2)for(const b of f.clsn2||[])paintBox(ctx,b,f.clsn2Source==='default'?'#b26cff':'#3d8dff',f,scale,ox,oy);if(showClsn1)for(const b of f.clsn1||[])paintBox(ctx,b,f.clsn1Source==='default'?'#ffd84a':'#ff3b45',f,scale,ox,oy);const point=sparkPoint(f,scale,ox,oy);if(point){ctx.strokeStyle='#ffd84d';ctx.fillStyle='rgba(255,216,77,.3)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(point.x,point.y,8,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(point.x-12,point.y);ctx.lineTo(point.x+12,point.y);ctx.moveTo(point.x,point.y-12);ctx.lineTo(point.x,point.y+12);ctx.stroke();ctx.fillStyle='#ffd84d';ctx.fillText('Hit '+point.hit+' spark',point.x+14,point.y-10)}ctx.fillStyle='#fff';ctx.fillText(move.prefix+' · element '+(frame+1)+'/'+move.timeline.frames.length+' · '+phase(frame,f)+' · ticks '+f.start+'–'+f.end+' / '+move.timeline.totalTicks,12,20)}
function calculateReaction(){const base=move.reactions[mode],supp=value('suppressCounterBonuses'),damage=value('damage'),pct=mode==='counter'?value('counterHitDamagePercent'):mode==='punish'?value('punishCounterDamagePercent'):100,bonus=mode==='counter'?value('counterHitBonusTime'):mode==='punish'?value('punishCounterBonusTime'):0;return{...base,damage:Math.round(damage*(supp?100:pct)/100),hitstun:value('groundHitTime')+(supp?0:bonus),guardStun:value('guardHitTime'),driveDamage:mode==='punish'&&!supp?value('punishCounterDriveDamage'):0}}
function renderReaction(){
  const r=calculateReaction(),preview=reactionPreview(),quick=(suffix,label)=>hasValue(suffix)?'<label class="quick-field"><span>'+esc(label)+'</span><input type="number" data-quick="'+suffix+'" value="'+value(suffix)+'"><button data-quick-apply="'+suffix+'" title="Apply this drafted value to code">✓</button></label>':'';
  const modeFields=mode==='counter'?quick('counterHitDamagePercent','Counter damage %')+quick('counterHitBonusTime','Bonus hitstun')+quick('counterHitReactionState','Reaction state'):mode==='punish'?quick('punishCounterDamagePercent','Punish damage %')+quick('punishCounterBonusTime','Bonus hitstun')+quick('punishCounterDriveDamage','Drive damage')+quick('punishCounterReactionState','Reaction state')+quick('punishCounterHardKnockdown','Hard knockdown')+quick('punishCounterDownTime','Down time'):'';
  const profile=(move.contactProfile||[]).map((item,index)=>{const stored=profileDraft(item),conflict=stored&&sharedProfile.draftConflict(stored,item),key=profileDraftKey(item),pending=profilePending[key];return '<div class="profile-value"><span>'+esc(item.label)+'</span><input type="number" step="any" data-profile-value="'+index+'" value="'+esc(stored?stored.value:item.value)+'" aria-label="'+esc(item.label)+' shared value"><button data-profile-apply="'+index+'" title="'+(conflict?'Review the changed shared source before applying':'Apply this shared value after impact review')+'" '+(conflict||pending?'disabled':'')+'>✓</button><button data-profile-source="'+index+'" title="Open the shared '+esc(item.sharedLabel)+' source">Source</button>'+(conflict?'<button data-profile-rebase="'+index+'" title="Keep the draft value but accept the currently displayed shared source as its new review base">Use current</button><span class="profile-conflict warning">SOURCE CHANGED — open Source, review it, then choose Use current before applying.</span>':'')+'</div>'}).join('');
  $('reactionData').innerHTML='<b>'+esc(mode==='normal'?'Normal Hit':mode==='counter'?'Counter Hit':'Punish Counter')+'</b><div class="contact-summary">Result: '+r.damage+' damage · '+r.hitstun+'t hitstun · '+r.guardStun+'t guard stun'+(r.driveDamage?' · '+r.driveDamage+' drive damage':'')+(preview?'<br>Reaction: '+esc(preview.label)+' (Action '+preview.action+')':'<br>No standard get-hit action found')+'</div><div class="quick-grid">'+quick('damage','Base damage')+quick('groundHitTime','Ground hitstun')+quick('groundSlideTime','Ground slide time')+quick('guardHitTime','Guard stun')+modeFields+'</div>'+(profile?'<details class="profile-values" open><summary>Shared classic HitDef values</summary>'+profile+'<p class="muted">These are inherited by every move using the same '+esc(move.contactProfile[0].sharedLabel)+'. Open Source before changing them because the change is shared. Guard reactions use guard stun plus guard velocity; HitDef has no separate guard.slidetime field. Priority, juggle, power, flags, reaction types, fall/recovery, sparks, and sounds remain in the connected shared function until the profile exposes a safe override.</p></details>':'');
  document.querySelectorAll('[data-quick]').forEach(input=>{input.oninput=()=>{draft[input.dataset.quick]=Number(input.value);const field=document.querySelector('[data-field="'+input.dataset.quick+'"]');if(field)field.value=input.value;saveState();draw();renderTimeline();renderHeader()};input.onchange=renderReaction});
  document.querySelectorAll('[data-quick-apply]').forEach(button=>button.onclick=()=>{const suffix=button.dataset.quickApply;vscode.postMessage({type:'apply',defPath:model.files.defPath,sourceId:move.id,suffix,base:moveDrafts.base(suffix),name:move.prefix+'.'+suffix,value:value(suffix)})});
  document.querySelectorAll('[data-profile-value]').forEach(input=>input.oninput=()=>{const item=move.contactProfile[Number(input.dataset.profileValue)];if(item){const key=profileDraftKey(item);profileDrafts[key]=sharedProfile.createDraft(input.value,item,profileDrafts[key]);saveState();renderHeader()}});
  document.querySelectorAll('[data-profile-apply]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.profileApply),item=move.contactProfile[index],input=document.querySelector('[data-profile-value="'+index+'"]');if(!item||!input)return;const key=profileDraftKey(item);if(!Object.prototype.hasOwnProperty.call(profileDrafts,key))profileDrafts[key]=sharedProfile.createDraft(input.value,item);const stored=sharedProfile.normalizeDraft(profileDrafts[key],item);if(sharedProfile.draftConflict(stored,item))return renderReaction();const requestId='profile-'+(++profileRequestSerial);profilePending[key]={requestId};renderReaction();vscode.postMessage({type:'applyProfile',requestId,sourceId:move.id,index,filename:item.filename,line:item.line,name:item.name,base:item.value,sourceHash:item.sourceHash,value:stored.value,draftRevision:stored.revision,draftBase:stored.base,draftSourceHash:stored.sourceHash})});
  document.querySelectorAll('[data-profile-rebase]').forEach(button=>button.onclick=()=>{const item=move.contactProfile[Number(button.dataset.profileRebase)];if(!item)return;const key=profileDraftKey(item);profileDrafts[key]=sharedProfile.rebaseDraft(profileDrafts[key],item);saveState();renderReaction();renderHeader()});
  document.querySelectorAll('[data-profile-source]').forEach(button=>button.onclick=()=>{const item=move.contactProfile[Number(button.dataset.profileSource)];if(item)vscode.postMessage({type:'openProfileSource',filename:item.filename,line:item.line})});
}
function renderHeader(){const action=move?.timeline?.actionNumber??'—',state=move?.values?.moveID??'—',dirtyFiles=(model.fileStatus||[]).filter(x=>x.dirty).map(x=>x.label),profileItems=model.moves.flatMap(item=>item.contactProfile||[]),profileKeys=new Set(profileItems.map(profileDraftKey)),profileEntries=Object.entries(profileDrafts).filter(([key])=>profileKeys.has(key)),profileConflict=profileEntries.some(([key,value])=>{const item=profileItems.find(entry=>profileDraftKey(entry)===key);return item&&sharedProfile.draftConflict(value,item)}),dirty=[...dirtyFiles,...(Object.keys(draft).length?['move values']:[]),...(profileEntries.length?[profileConflict?'shared HitDef draft (source changed)':'shared HitDef draft']:[]),...(codeDraftStore.hasDrafts()?['connected code draft']:[])];$('headerMeta').textContent='State '+state+' · AIR '+action+' · element '+(frame+1);$('dirtyStatus').textContent=dirty.length?'Unsaved: '+dirty.join(', '):'Saved sources';$('dirtyStatus').classList.toggle('clean',!dirty.length)}
function renderProblems(){const items=move.problems||[],errors=items.filter(x=>x.level==='error').length,review=items.filter(x=>x.level==='warning'||x.level==='likely').length;$('problems').innerHTML='<details class="problems" '+(errors?'open':'')+'><summary>Problems · '+errors+' error'+(errors===1?'':'s')+' · '+review+' review</summary>'+(items.map((item,index)=>'<div class="problem '+esc(item.level||'info')+'"><b>'+esc(item.title||item.message||'Review')+'</b><br><span>'+esc(item.detail||item.message||'')+'</span><div class="code-actions"><button data-problem="'+index+'">Show source</button></div></div>').join('')||'<div class="problem info">No move-specific problems detected.</div>')+'<div class="problem info">Static timing checks are guidance. Conditional branches, animation changes, loops, and project systems can make different durations intentional; live training remains authoritative.</div></details>';document.querySelectorAll('[data-problem]').forEach(button=>button.onclick=()=>{const item=items[Number(button.dataset.problem)];if(Number.isInteger(item?.frameIndex)){frame=item.frameIndex;renderTimeline();renderHeader();draw();return}if(item?.sectionId){const target=[...document.querySelectorAll('.code-section')].find(x=>x.dataset.section===item.sectionId);if(target){target.open=true;target.scrollIntoView({block:'nearest'});saveState();return}}vscode.postMessage({type:'openProblem',sourceId:move.id,index:Number(button.dataset.problem)})})}
function syncCodeActions(root,section){const state=codeDraftStore.actionState(section),apply=root?.querySelector('[data-apply-code]'),discard=root?.querySelector('[data-discard-code]'),rebase=root?.querySelector('[data-rebase-code]');if(apply)apply.disabled=!state.canApply;if(discard)discard.disabled=!state.canDiscard;if(rebase)rebase.disabled=state.pending}
function renderCode(){const sections=move.codeSections||[],allSections=model.moves.flatMap(item=>item.codeSections||[]),orphans=codeDraftStore.orphaned(allSections),remembered=new Set(saved.openCode||[]),hasRemembered=Array.isArray(saved.openCode),outerOpen=saved.connectedOpen!==false;$('codeSections').innerHTML='<details id="connectedCode" class="connected-code" '+(outerOpen?'open':'')+'><summary>Connected code · '+sections.length+'</summary><p class="muted">Only the selected move’s state and directly connected functions are shown. Shared functions can affect other moves. Apply edits into the open document, then use normal Undo and Save.</p>'+orphans.map((item,index)=>'<div class="problem error"><b>Retained draft source block is no longer present.</b><br>'+esc(item.draft.filename||item.sectionId)+' · '+esc(item.draft.signature||item.draft.kind||'source block')+'<div class="code-actions"><button data-discard-orphan="'+index+'">Discard orphaned draft</button></div></div>').join('')+sections.map((section,index)=>{const state=codeDraftStore.actionState(section),open=remembered.has(section.id)||(!hasRemembered&&section.kind==='move-state');return '<details class="code-section" data-section="'+esc(section.id)+'" '+(open?'open':'')+'><summary>'+esc(section.title||section.kind)+' · '+esc(section.fileLabel||section.filename.split(/[\\/]/).pop())+(section.shared?' · shared':'')+(state.conflict?' · SOURCE CHANGED':'')+'</summary><p class="muted">'+esc(section.explanation||'')+(section.controllers?.length?'<br>Controllers: '+esc(section.controllers.join(', ')):'')+'</p>'+(state.conflict?'<div class="problem error"><b>Source changed after this draft began.</b><br>Compare the full source, then explicitly rebase or discard this retained draft. Apply is disabled.</div>':'')+'<textarea class="code-editor" data-code="'+index+'" spellcheck="false">'+esc(codeDraftStore.value(section))+'</textarea><div class="code-actions"><button data-apply-code="'+index+'" '+(!state.canApply?'disabled':'')+'>Apply to open document</button>'+(state.conflict?'<button data-rebase-code="'+index+'" '+(state.pending?'disabled':'')+'>Rebase onto current source</button>':'')+'<button data-discard-code="'+index+'" '+(!state.canDiscard?'disabled':'')+'>Discard draft</button><button data-open-code="'+index+'">Open full text</button></div></details>'}).join('')+'</details>';document.querySelectorAll('[data-code]').forEach(area=>area.oninput=()=>{const section=sections[Number(area.dataset.code)],root=area.closest('.code-section');codeDraftStore.stage(section,area.value);syncCodeActions(root,section);renderHeader()});document.querySelectorAll('[data-apply-code]').forEach(button=>button.onclick=()=>{const section=sections[Number(button.dataset.applyCode)];if(codeDraftStore.apply(section)){$('status').textContent='Applying connected code…';syncCodeActions(button.closest('.code-section'),section)}});document.querySelectorAll('[data-discard-code]').forEach(button=>button.onclick=()=>{const section=sections[Number(button.dataset.discardCode)];codeDraftStore.discard(section);renderCode();renderHeader()});document.querySelectorAll('[data-discard-orphan]').forEach(button=>button.onclick=()=>{codeDraftStore.discardId(orphans[Number(button.dataset.discardOrphan)].sectionId);renderCode();renderHeader()});document.querySelectorAll('[data-rebase-code]').forEach(button=>button.onclick=()=>{const section=sections[Number(button.dataset.rebaseCode)];codeDraftStore.rebase(section);renderCode();renderHeader()});document.querySelectorAll('[data-open-code]').forEach(button=>button.onclick=()=>vscode.postMessage({type:'openCodeSection',sourceId:move.id,id:sections[Number(button.dataset.openCode)].id}));$('connectedCode').ontoggle=saveState;document.querySelectorAll('.code-section').forEach(x=>x.ontoggle=saveState)}
function render(){if(!move)return;$('character').textContent=model.character;$('moveTitle').textContent='— '+move.prefix;$('viewZoom').value=Math.round(viewZoom*100);$('viewZoomValue').textContent=Math.round(viewZoom*100)+'%';renderMoveList();renderFields();renderTimeline();renderOpponentControls();renderProblems();renderCode();renderHeader();draw();renderReaction();moveDrafts.notice()}
function initialMoveSelection(){const requestedProfile=model.openReference?.profileId,savedMatches=!requestedProfile||saved.selectedMove===requestedProfile,restoreLegacy=saved.defPath===model.files.defPath&&savedMatches;return{id:requestedProfile||(saved.defPath===model.files.defPath?saved.selectedMove:model.moves[0]?.id),draft:restoreLegacy?saved.draft:undefined,frame:model.openReference?.frameIndex??(restoreLegacy?saved.selectedFrame:0)}}$('moveSearch').oninput=renderMoveList;$('play').onclick=togglePlay;$('previous').onclick=()=>{stop();advance(-1)};$('next').onclick=()=>{stop();advance(1)};$('showClsn1').onclick=()=>{showClsn1=!showClsn1;$('showClsn1').classList.toggle('active',showClsn1);draw()};$('showClsn2').onclick=()=>{showClsn2=!showClsn2;$('showClsn2').classList.toggle('active',showClsn2);draw()};$('fitView').onclick=fitView;$('actualView').onclick=()=>setViewZoom(1);$('viewZoom').oninput=e=>setViewZoom(Number(e.target.value)/100);$('moveOverview').onclick=()=>vscode.postMessage({type:'moveOverview',sourceId:move.id,frameIndex:frame});$('airWorkspace').onclick=()=>vscode.postMessage({type:'airWorkspace',sourceId:move.id,frameIndex:frame});$('throwCreator').onclick=()=>vscode.postMessage({type:'throwCreator'});document.querySelectorAll('[data-mode]').forEach(x=>x.onclick=()=>{mode=x.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b===x));renderReaction()});$('linkedCode').onclick=()=>vscode.postMessage({type:'linkedCode',sourceId:move.id});$('openConstants').onclick=()=>vscode.postMessage({type:'open',file:'constants',sourceId:move.id});$('openAir').onclick=()=>vscode.postMessage({type:'open',file:'air',sourceId:move.id});$('launch').onclick=()=>vscode.postMessage({type:'launch'});$('refresh').onclick=()=>vscode.postMessage({type:'refresh'});$('advancedTools').open=Boolean(saved.advancedOpen);$('advancedTools').ontoggle=saveState;window.addEventListener('message',e=>{if(e.data.type==='model'){stop();const keep=move?.id,keepFrame=frame;model=e.data.model;imageCache.clear();selectMove(keep,undefined,keepFrame)}else if(e.data.type==='moveLabSelect'){const requested=model.moves.find(item=>item.id===e.data.reference?.profileId&&item.prefix===e.data.reference?.prefix);if(requested)selectMove(requested.id,undefined,e.data.reference.frameIndex)}else if(e.data.type==='profileApplied'){const key=profileDraftKey(e.data),next=sharedProfile.acknowledgeDraft(profileDrafts[key],e.data);if(next===null)delete profileDrafts[key];else if(next!==undefined)profileDrafts[key]=next;if(profilePending[key]?.requestId===e.data.requestId)delete profilePending[key];saveState();renderHeader()}else if(e.data.type==='profileFailed'){const key=profileDraftKey(e.data);if(profilePending[key]?.requestId===e.data.requestId)delete profilePending[key];renderReaction();renderHeader();if(e.data.text)$('status').textContent=e.data.text}else if(e.data.type==='status')$('status').textContent=e.data.text;else if(e.data.type==='codeSectionApplied'){codeDraftStore.acknowledge(e.data);renderHeader()}else if(e.data.type==='codeSectionFailed'){codeDraftStore.failed(e.data.requestId);renderCode();renderHeader();$('status').textContent='Connected-code apply was stopped; the draft is retained.'}});${require('./move_constants_drafts').clientScript()}${require('./move_code_drafts').clientScript()}const initialSelection=initialMoveSelection();selectMove(initialSelection.id,initialSelection.draft,initialSelection.frame);
$('showOpponent').onchange=e=>{opponentEnabled=e.target.checked;$('stage').classList.toggle('opponent',opponentEnabled);saveState();draw()};
$('reactionAction').onchange=e=>{reactionId=e.target.value;saveState();draw();renderReaction()};
$('opponentX').oninput=e=>{if(Number.isFinite(Number(e.target.value)))opponentWorldX=Number(e.target.value);saveState();draw()};
$('opponentY').oninput=e=>{if(Number.isFinite(Number(e.target.value)))opponentWorldY=Number(e.target.value);saveState();draw()};
$('resetOpponent').onclick=()=>{opponentWorldX=40;opponentWorldY=-1;renderOpponentControls();saveState();draw()};
const canvas=$('canvas');let pointer=null,drag=null;
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height,dx:canvas.width/r.width,dy:canvas.height/r.height}}
function currentSparkPoint(){const f=move?.timeline?.frames?.[frame],baseX=canvas.width/2+panX,baseY=canvas.height*.8+panY,ox=baseX+(f?.x||0)*viewZoom,oy=baseY+(f?.y||0)*viewZoom;return f?sparkPoint(f,viewZoom,ox,oy):null}
function overSpark(e){const point=currentSparkPoint();if(!point)return null;const p=canvasPoint(e);return Math.hypot(p.x-point.x,p.y-point.y)<=18?point:null}
function overOpponent(e){if(!opponentEnabled)return false;const f=reactionFrame(),info=f?.image;if(!f||!info)return false;const p=canvasPoint(e),axis=opponentScreenPoint(),cx=axis.x+(f.x||0)*viewZoom,cy=axis.y+(f.y||0)*viewZoom,sx=(f.flags?.includes('H')?1:-1)*viewZoom,sy=(f.flags?.includes('V')?-1:1)*viewZoom,x1=cx-info.axisX*sx,x2=cx+(info.width-info.axisX)*sx,y1=cy-info.axisY*sy,y2=cy+(info.height-info.axisY)*sy;return p.x>=Math.min(x1,x2)&&p.x<=Math.max(x1,x2)&&p.y>=Math.min(y1,y2)&&p.y<=Math.max(y1,y2)}
const findSparkButton=document.createElement('button');findSparkButton.id='findSpark';findSparkButton.textContent='Find Spark';findSparkButton.title='Pan the view to the current hit spark without changing its values';$('actualView').after(findSparkButton);findSparkButton.onclick=()=>{const point=currentSparkPoint();if(!point){$('status').textContent='No hit spark is available on this frame.';return}panX+=canvas.width/2-point.x;panY+=canvas.height/2-point.y;saveState();draw();$('status').textContent='Centered the current hit spark without changing its X/Y values.'};
canvas.onpointerdown=e=>{pointer=e.pointerId;canvas.setPointerCapture(e.pointerId);const spark=overSpark(e),mode=spark?'spark':overOpponent(e)?'opponent':'pan';if(mode==='spark')stop();drag={mode,x:e.clientX,y:e.clientY,opponentWorldX,opponentWorldY,panX,panY,sparkX:spark?.valueX,sparkY:spark?.valueY,sparkAnchorX:spark?.anchorX,sparkAnchorY:spark?.anchorY,xKey:spark?.xKey,yKey:spark?.yKey}};
canvas.onpointermove=e=>{if(e.pointerId===pointer&&drag){const p=canvasPoint(e),dx=(e.clientX-drag.x)*p.dx,dy=(e.clientY-drag.y)*p.dy;if(drag.mode==='spark'){const nextX=Math.round(drag.sparkX+dx/viewZoom),nextY=Math.round(drag.sparkY+dy/viewZoom);draft[drag.xKey]=nextX;draft[drag.yKey]=nextY;const xField=document.querySelector('[data-field="'+drag.xKey+'"]'),yField=document.querySelector('[data-field="'+drag.yKey+'"]');if(xField)xField.value=nextX;if(yField)yField.value=nextY;$('status').textContent='Spark position drafted. Apply both X and Y with their ✓ buttons when ready.';renderReaction();renderTimeline()}else if(drag.mode==='opponent'){opponentWorldX=drag.opponentWorldX+dx/viewZoom;opponentWorldY=drag.opponentWorldY+dy/viewZoom;$('opponentX').value=coordinateText(opponentWorldX);$('opponentY').value=coordinateText(opponentWorldY)}else{panX=drag.panX+dx;panY=drag.panY+dy}draw();return}canvas.style.cursor=overSpark(e)?'crosshair':overOpponent(e)?'move':'grab'};
const endDrag=e=>{if(e.pointerId!==pointer)return;const sparkEdited=drag?.mode==='spark';pointer=null;drag=null;canvas.style.cursor='grab';saveState();if(sparkEdited)moveDrafts.notice()};canvas.onpointerup=endDrag;canvas.onpointercancel=endDrag;
canvas.onlostpointercapture=e=>{if(e.pointerId===pointer)endDrag(e)};
canvas.onwheel=e=>{e.preventDefault();setViewZoom(viewZoom*(e.deltaY<0?1.12:.89),e)};canvas.ondblclick=centerView;const previewResizeObserver=new ResizeObserver(()=>draw());previewResizeObserver.observe(canvas.parentElement);
</script></body></html>`;
  return page
    .replace('button,input,select{', 'button,input,select,textarea{')
    .replace('.grow{flex:1}', '.grow{flex:1}.header-meta,.dirty-status{padding:3px 7px;border-radius:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}.dirty-status.clean{opacity:.7}.advanced-tools{display:inline-flex;gap:4px;align-items:center}.advanced-tools summary{cursor:pointer}')
    .replace('grid-template-columns:360px minmax(480px,1fr) 300px', 'grid-template-columns:360px minmax(480px,1fr) 320px')
    .replace('.center{display:grid;grid-template-rows:minmax(350px,1fr) 150px;min-width:0}', '.center{display:grid;grid-template-rows:minmax(330px,1fr) 150px minmax(180px,auto);min-width:0;overflow:auto}.workbench{padding:8px;border-top:1px solid var(--vscode-panel-border)}')
    .replace('.category{margin:10px 0;border:1px solid var(--vscode-panel-border)}.category summary{padding:7px;font-weight:700;cursor:pointer}', '.category,.code-section,.problems{margin:10px 0;border:1px solid var(--vscode-panel-border)}.category summary,.code-section summary,.problems summary{padding:7px;font-weight:700;cursor:pointer}')
    .replace('.field input,.field select{width:100%}', '.field-help{grid-column:2 / -1;color:var(--vscode-descriptionForeground);font-size:11px}.field input,.field select{width:100%}')
    .replace('.field-actions{grid-column:2 / -1;display:flex;gap:5px;justify-content:flex-end}', '.field-actions{grid-column:2 / -1;display:flex;gap:5px;justify-content:flex-end}.code-actions{display:flex;gap:5px;padding:0 7px 5px;flex-wrap:wrap}.code-editor{display:block;width:calc(100% - 14px);min-height:150px;margin:0 7px 7px;font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size);white-space:pre;tab-size:4}.problem{padding:7px;border-top:1px solid var(--vscode-panel-border)}.problem.error{border-left:4px solid var(--vscode-errorForeground)}.problem.warning,.problem.likely{border-left:4px solid var(--vscode-charts-yellow)}.problem.info{border-left:4px solid var(--vscode-descriptionForeground)}')
    .replace('<header><b>Move Lab</b><span class="context">Constants integration</span><span id="character"></span><span id="moveTitle"></span>', '<header><b>Move Lab</b><span class="header-meta">Constants integration</span><span id="character"></span><span id="moveTitle"></span><span id="headerMeta" class="header-meta"></span><span id="dirtyStatus" class="dirty-status clean">Saved sources</span>')
    .replace('<button id="airWorkspace">Edit in AIR Workspace</button>', '<button id="airWorkspace">Edit AIR / CLSN</button>')
    .replace("+fieldControl(f)+'<span class=\"field-actions\">", "+fieldControl(f)+'<div class=\"field-help\">'+esc(f.explanation||'')+'</div><span class=\"field-actions\">")
    .replace('<button id="throwCreator" title="Coordinate P1 and P2 throw animations, binds, events, and parts">Throw Creator</button><button id="linkedCode">Common / Functions…</button><button id="openConstants">Constants</button><button id="openAir">AIR Text</button>', '<details id="advancedTools" class="advanced-tools"><summary>Advanced tools</summary><button id="throwCreator" title="Coordinate P1 and P2 throw animations, binds, events, and parts">Throw Creator</button><button id="linkedCode">Find profile uses…</button><button id="openConstants">Constants text</button><button id="openAir">AIR text</button></details>')
    .replace('<div class="timeline" id="timeline"></div></section>', '<div class="timeline" id="timeline"></div><div class="workbench"><div id="problems"></div><div id="codeSections"></div></div></section>')
    .replace('</header>', `${launchControlsHtml('move_constants')}</header>`)
    .replace('<div class="stage"><canvas', '<div class="stage" id="stage"><canvas')
    .replace('<h3>Opponent reaction estimate</h3>', '<h3>Opponent reaction preview</h3><div class="opponent-controls"><label><input id="showOpponent" type="checkbox" checked> Show P2</label><select id="reactionAction" title="Choose an authored get-hit AIR action"></select><button id="resetOpponent" title="Return P2 to the default authored preview position">Reset</button></div><div class="opponent-controls"><label>World X <input id="opponentX" type="number" step="any"></label><label>World Y <input id="opponentY" type="number" step="any"></label></div><p class="muted">Drag the darkened P2 directly in the AIR canvas. Its authored/world coordinates stay unchanged when zooming; only its screen distance from the zoom pivot scales. Select standing-high, standing-low, crouching, or airborne reactions when those standard actions exist.</p><h3>Contact result</h3>')
    .replace('<div class="reaction" id="reaction"><div class="spark" id="spark"></div></div>', '')
    .replace('Spark X is defender-relative, so the canvas estimates contact from the leading edge of the active Clsn1.', 'Spark X is defender-relative. With P2 visible it follows the draggable defender axis; without P2 the canvas estimates contact from the leading edge of active Clsn1.')
    .replace('</script></body>', `globalThis.ikemenNavigationSelection=()=>move?{id:move.id}:undefined;globalThis.ikemenCanRestoreNavigation=ref=>model.moves.some(item=>item.id===ref.id)&&Object.keys(draft).length===0&&Object.keys(profileDrafts).length===0;globalThis.ikemenRestoreNavigation=ref=>selectMove(ref.id);${launchControlsClientScript()}</script></body>`);
}

async function refresh() { const owner=session,assets=owner?.assets;if(!owner)return;const model=await modelFor(assets);if(session!==owner||owner.assets!==assets)return;owner.model=model;owner.panel.webview.postMessage({type:'model',model}); }
async function applyMoveValues(sourceId, values, statusText, owner=session, expectedText, expectedAir) {
  if(session!==owner)return;
  const current = await currentText(owner.assets.constants), moves = moveGroups(parseConstants(current)), move = moves.find((item) => item.id === String(sourceId).toLowerCase());
  if (!move) throw new Error('The selected move is no longer present. Refresh and try again.');
  const applicable = Object.entries(values).filter(([suffix]) => Object.prototype.hasOwnProperty.call(move.values, suffix));
  if (!applicable.length) throw new Error('None of the selected timing fields exist in this move profile. Add the fields to the profile before importing AIR timing.');
  let next = current;
  for (const [suffix, value] of applicable) next = updateConstant(next, `${move.prefix}.${suffix}`, value);
  const document = await vscode.workspace.openTextDocument(owner.assets.constants);
  const airUnchanged=expectedAir===undefined||await currentText(owner.assets.air)===expectedAir;
  if(session!==owner)return;
  if(!airUnchanged)throw new Error('The AIR changed while choosing timing. Refresh and review before applying.');
  if(document.getText()!==current||(expectedText!==undefined&&current!==expectedText))throw new Error('The constants changed while choosing timing. Refresh and review before applying.');
  const edit = new vscode.WorkspaceEdit(), last = document.lineAt(document.lineCount - 1);
  edit.replace(document.uri, new vscode.Range(0, 0, last.lineNumber, last.text.length), next); if(!await vscode.workspace.applyEdit(edit)||session!==owner)return;
  owner.panel.webview.postMessage({ type: 'status', text: statusText }); return refresh();
}
async function openMoveSource(message) {
  const owner=session,assets=owner?.assets;if(!owner)return;
  const move = owner.model.moves.find(item => item.id === message.sourceId);
  if (!move) return;
  let filename = assets[message.file], line = 0;
  if (message.type === 'linkedCode') {
    const files = require('./related_work').resolveAssigned(assets.defPath).code;
    const matches = [];
    for (const file of files.filter(file => file !== assets.constants)) {
      const lines = (await currentText(file)).split(/\r?\n/);
      lines.forEach((text, index) => { if (text.toLowerCase().includes(move.prefix.toLowerCase())) matches.push({label: path.basename(file) + ':' + (index + 1), description: text.trim(), filename: file, line: index}); });
    }
    if (!matches.length) return vscode.window.showInformationMessage('No connected code refers directly to this move prefix. Use Text Editors to browse the assigned files.');
    const picked = await vscode.window.showQuickPick(matches, {title: 'Open code using ' + move.prefix, matchOnDescription: true});
    if (!picked) return;
    filename = picked.filename; line = picked.line;
  } else if (message.file === 'constants') {
    const parsed = parseConstants(await currentText(filename));
    const declaration = message.suffix ? parsed.byName.get((move.prefix + '.' + message.suffix).toLowerCase()) : parsed.values.find(item => item.name.toLowerCase().startsWith(move.prefix.toLowerCase() + '.'));
    if (!declaration) return vscode.window.showInformationMessage('The selected constant is no longer present. Refresh the viewer.');
    line = declaration.line;
  } else if (message.file === 'air') {
    const action = require('./gif_air_model').actionRange(await currentText(filename), move.timeline.actionNumber);
    if (!action) return vscode.window.showInformationMessage('This animation is not present in the assigned AIR.');
    line = action.start;
  } else return;
  const document=await vscode.workspace.openTextDocument(filename), navigation=require('./viewer_navigation');
  if(session!==owner||owner.assets!==assets)return;
  return navigation.openReferenceSource({filename,line,character:0,text:document.lineAt(line).text},navigation.currentPoint(assets.defPath,'constants',{navigationSelection:{id:move.id}},owner.panel));
}

function codeSectionFor(owner, sourceId, id) {
  const move = owner.model.moves.find(item => item.id === sourceId);
  return move?.codeSections?.find(item => item.id === id);
}
async function openSourceLocation(owner, filename, line = 0) {
  const allowed = new Set([owner.assets.constants, owner.assets.air, ...(owner.assets.code || [])].filter(Boolean).map(file => path.resolve(file).toLowerCase()));
  if (!filename || !allowed.has(path.resolve(filename).toLowerCase())) return;
  const document = await vscode.workspace.openTextDocument(filename);
  if (session !== owner || owner.assets !== session.assets) return;
  const safeLine = Math.max(0, Math.min(document.lineCount - 1, Number(line) || 0));
  return require('./viewer_navigation').openReferenceSource({ filename, line: safeLine, character: 0, text: document.lineAt(safeLine).text }, require('./viewer_navigation').currentPoint(owner.assets.defPath, 'constants', {}, owner.panel));
}

async function handle(message) {
  if(message.type==='moveFormDraft'){
    if(!session?.draftDefs.has(message.defPath?.toLowerCase())||typeof message.sourceId!=='string'||!message.draft||typeof message.draft!=='object')return;
    await formDrafts.stage(draftKey(message.defPath,message.sourceId),message.draft);return;
  }
  if(message.type==='moveCodeDraft'){
    if(!session?.draftDefs.has(message.defPath?.toLowerCase())||typeof message.sectionId!=='string'||message.sectionId.length>1000||!message.draft||typeof message.draft!=='object')return;
    if(JSON.stringify(message.draft).length>250000)return;
    const key=codeDraftKey(message.defPath,message.sectionId);
    if(!Object.keys(message.draft).length)await codeFormDrafts.discard(key);else await codeFormDrafts.stage(key,message.draft);
    return;
  }
  const owner=session,assets=owner?.assets;if(!owner)return;
  if (await handleLaunchMessage(message, assets.defPath, 'constants', owner.panel)) return;
  if(session!==owner||owner.assets!==assets)return;
  if(message.type==='moveIntegrationContext'){
    const move=owner.model.moves.find(item=>item.id===message.sourceId),frameIndex=Number(message.frameIndex);
    if(!move||!Number.isInteger(frameIndex)||frameIndex<0||frameIndex>=(move.timeline?.frames?.length||0))return;
    require('./move_lab_context').remember(assets.defPath,{kind:'constants',reference:constantsReference(move,assets,owner.model,{frameIndex,overviewReference:owner.overviewReference})});return;
  }
  if(owner.busy){if(message.type==='applyProfile')owner.panel.webview.postMessage({type:'profileFailed',requestId:message.requestId,filename:message.filename,name:message.name,text:'Another edit is being reviewed. This shared HitDef draft was retained.'});return;}
  const mutating=['apply','applyProfile','importAirTiming','frameTimingMenu','copyFields','applyCodeSection'].includes(message.type);if(mutating)owner.busy=true;
  try{
  const expectedText=mutating?await currentText(assets.constants):undefined;
  if(session!==owner||owner.assets!==assets)return;
  const timing=['importAirTiming','frameTimingMenu'].includes(message.type),expectedAir=timing?await currentText(assets.air):undefined;
  if(session!==owner||owner.assets!==assets)return;
  if(timing&&(owner.model.timingSources?.constants!==hash(expectedText)||owner.model.timingSources?.air!==hash(expectedAir)))throw new Error('The constants or AIR changed since this preview. Refresh before assigning timing.');
  if (message.type === 'refresh') return refresh();
  if (message.type === 'moveOverview') {
    const current = await modelFor(assets); if(session!==owner||owner.assets!==assets)return;
    const move = current.moves.find(item => item.id === message.sourceId), returnTo = constantsReference(move, assets, current, {frameIndex:Number(message.frameIndex),overviewReference:owner.overviewReference});
    if (!returnTo) return vscode.window.showWarningMessage('That move profile changed. Refresh and choose it again.');
    if(!validConstantsReference(returnTo,assets,current))return vscode.window.showWarningMessage('That move frame changed. Refresh and choose it again.');
    const prior=owner.overviewReference&&typeof owner.overviewReference.mode==='string'?owner.overviewReference:{defPath:assets.defPath,mode:'overview'};
    return vscode.commands.executeCommand('ikemen.moveLab.open', vscode.Uri.file(assets.defPath), { preset: true, reference: { ...prior, defPath:assets.defPath, returnTo } });
  }
  if (message.type === 'airWorkspace') { const move=owner.model.moves.find(item=>item.id===message.sourceId); if(!move)return; const document=await vscode.workspace.openTextDocument(assets.constants), parsed=parseConstants(document.getText()), declaration=parsed.byName.get((move.prefix+'.moveID').toLowerCase()); if(!declaration||session!==owner||owner.assets!==assets)return; return require('./viewer_navigation').openConnected(assets.constants,'air',{group:move.timeline.actionNumber,frameIndex:Number.isInteger(message.frameIndex)?message.frameIndex:0},{filename:assets.constants,line:declaration.line,character:0,text:document.lineAt(declaration.line).text},require('./viewer_navigation').currentPoint(assets.defPath,'constants',{navigationSelection:{id:move.id}},owner.panel)); }
  if (message.type === 'openProfileSource') return openSourceLocation(owner, message.filename, message.line);
  if (message.type === 'applyProfile') {
    const move=owner.model.moves.find(item=>item.id===message.sourceId),item=move?.contactProfile?.[Number(message.index)],shared=require('./move_constants_shared_profile');
    const response={requestId:message.requestId,filename:message.filename,name:message.name,value:String(message.value??''),draftRevision:Number(message.draftRevision),draftBase:Number(message.draftBase),draftSourceHash:String(message.draftSourceHash||'')};
    const fail=async(text,show=true)=>{if(show)await vscode.window.showWarningMessage(text);if(session===owner)owner.panel.webview.postMessage({type:'profileFailed',...response,text});};
    if(!item||item.filename!==message.filename||item.line!==Number(message.line)||item.name!==message.name||item.value!==Number(message.base)||item.sourceHash!==message.sourceHash){await fail('The shared HitDef row changed after this Apply began. Refresh and review the retained draft.');return;}
    if(response.draftBase!==item.value||response.draftSourceHash!==item.sourceHash||!Number.isInteger(response.draftRevision)){await fail('This shared HitDef draft was based on an older source. Review the current source before applying.');return;}
    const draft=shared.parseDraft(message.value);
    if(!draft){await fail('Enter a complete decimal or negative number before applying this shared HitDef value.');return;}
    const document=await vscode.workspace.openTextDocument(item.filename),before=document.getText();
    if(hash(before)!==item.sourceHash){await fail('This shared HitDef source changed after the value was displayed. Refresh and review it before applying.');return;}
    const line=document.lineAt(item.line),plan=shared.assignmentEdit(line.text,item.name,item.value,draft.text);
    if(!plan){await fail('The shared HitDef assignment no longer matches the displayed value. Refresh and review it before applying.');return;}
    const approved=await vscode.window.showWarningMessage(`Apply shared ${item.label}?`,{modal:true,detail:`${item.name}: ${item.value} → ${draft.text}\n\nThis changes the ${item.sharedLabel} used by every move that inherits it. The edit remains unsaved in its normal text document so Undo and review stay available.`},'Apply Shared Value');
    if(approved!=='Apply Shared Value'||session!==owner){if(session===owner)await fail('Shared HitDef Apply was cancelled; the draft was retained.',false);return;}
    if(document.getText()!==before){await fail('The shared HitDef source changed during review. Refresh before applying.');return;}
    const edit=new vscode.WorkspaceEdit();edit.replace(document.uri,new vscode.Range(item.line,plan.start,item.line,plan.end),plan.text);
    if(!await vscode.workspace.applyEdit(edit)||session!==owner){if(session===owner)await fail('The shared HitDef edit could not be applied; the draft was retained.',false);return;}
    owner.panel.webview.postMessage({type:'profileApplied',...response});
    owner.panel.webview.postMessage({type:'status',text:`${item.name} changed in the shared open document. Review every affected move, then save normally.`});return refresh();
  }
  if (message.type === 'openCodeSection') { const section=codeSectionFor(owner,message.sourceId,message.id); if(section)return openSourceLocation(owner,section.filename,section.startLine); return; }
  if (message.type === 'openProblem') { const move=owner.model.moves.find(item=>item.id===message.sourceId),problem=move?.problems?.[Number(message.index)]; if(problem?.filename)return openSourceLocation(owner,problem.filename,problem.line); if(problem?.field)return openMoveSource({type:'open',file:'constants',sourceId:message.sourceId,suffix:problem.field}); if(problem?.source==='AIR timing')return openMoveSource({type:'open',file:'air',sourceId:message.sourceId}); return; }
  if (message.type === 'applyCodeSection') {
    const section=codeSectionFor(owner,message.sourceId,message.id);
    if(!section||typeof message.text!=='string'||message.text.length>100000)return;
    const key=codeDraftKey(assets.defPath,section.stableId),stored=codeFormDrafts.read(key);
    const document=await vscode.workspace.openTextDocument(section.filename);
    const conflict=require('./move_code_drafts').applyConflict(section,stored,message,hash(document.getText()));
    if(conflict==='draft-changed')throw new Error('The retained connected-code draft changed. Review it before applying.');
    if(conflict==='source-refreshed')throw new Error('The connected-code source changed after this draft began. Compare, then explicitly rebase or discard the retained draft.');
    if(conflict==='source-changed')throw new Error('The source file changed outside this workspace. Your draft was retained; refresh and compare before applying.');
    const start=document.lineAt(section.startLine).range.start,end=document.lineAt(section.endLine).range.end,edit=new vscode.WorkspaceEdit();
    edit.replace(document.uri,new vscode.Range(start,end),message.text);
    if(!await vscode.workspace.applyEdit(edit)||session!==owner)return;
    const cleared=await codeFormDrafts.discard(key,stored);
    owner.panel.webview.postMessage({type:'codeSectionApplied',id:section.id,requestId:message.requestId,cleared});
    owner.panel.webview.postMessage({type:'status',text:'Connected code changed in the open document. Review it, then use normal Save or Undo.'});
    return refresh();
  }
  if (message.type === 'throwCreator') return vscode.commands.executeCommand('ikemen.throwCreator.open', vscode.Uri.file(session.assets.defPath));
  if (message.type === 'open' || message.type === 'linkedCode') return openMoveSource(message);
  if (message.type === 'launch') { await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(session.assets.defPath), { preview: false }); return vscode.commands.executeCommand('ikemen.launchTrainingCurrent'); }
  if (message.type === 'apply') {
    const owner=session;
    if(message.defPath!==owner.assets.defPath)return;
    const document=await vscode.workspace.openTextDocument(owner.assets.constants);
    if(session!==owner||message.defPath!==owner.assets.defPath)return;
    const current=moveGroups(parseConstants(document.getText())).find(move=>move.id===message.sourceId);
    if(!current||message.name!==current.prefix+'.'+message.suffix||current.values[message.suffix]!==message.base){await vscode.window.showWarningMessage('This constant changed after the draft was created. Refresh to review the retained draft and source values.');return;}
    const next=updateConstant(document.getText(),message.name,message.value),edit=new vscode.WorkspaceEdit(),last=document.lineAt(document.lineCount-1);
    edit.replace(document.uri,new vscode.Range(0,0,last.lineNumber,last.text.length),next);
    if(!await vscode.workspace.applyEdit(edit))return;
    const key=draftKey(message.defPath,message.sourceId),fields=formDrafts.read(key)||{},field=fields[message.suffix];
    if(field?.base===message.base){if(field.value===message.value)delete fields[message.suffix];else field.base=message.value;try{await formDrafts.stage(key,fields);}catch(error){await vscode.window.showWarningMessage('The constant was applied, but updating its recovery draft failed: '+error.message);}}
    await owner.panel.webview.postMessage({type:'moveFieldApplied',defPath:message.defPath,sourceId:message.sourceId,suffix:message.suffix,base:message.base,value:message.value});
    if(session!==owner)return;
    owner.panel.webview.postMessage({type:'status',text:message.name+' changed in the open document. Review, then save normally.'});return refresh();
  }
  if (message.type === 'importAirTiming') {
    const move = session.model.moves.find((item) => item.id === String(message.sourceId).toLowerCase());
    if (!move || move.timeline.state !== 'ready') return vscode.window.showWarningMessage('This move does not resolve an AIR action to import.');
    const proposal = airTimingProposal(move.timeline, move.values);
    if (proposal.state !== 'ready') return vscode.window.showWarningMessage('No effective Clsn1 frame was found. The first contact/hit-pause frame cannot be inferred safely.');
    const entries = Object.entries(proposal.values).filter(([suffix]) => Object.prototype.hasOwnProperty.call(move.values, suffix));
    const detail = entries.map(([suffix, value]) => `${suffix} = ${value}`).join('\n');
    const approved = await vscode.window.showInformationMessage(`Import authored AIR timing into ${move.prefix}?`, { modal: true, detail: `${detail}\n\nThe first effective Clsn1 element becomes the contact/hit-pause frame. Any existing smear range remains authored by your thumbnail selections; its tick total is recalculated when valid.` }, 'Import Timing');
    if (approved !== 'Import Timing') return;
    return await applyMoveValues(move.id, proposal.values, `Imported AIR timing into ${move.prefix}. Review the contact frame and smear range, then save normally.`, owner, expectedText, expectedAir);
  }
  if (message.type === 'frameTimingMenu') {
    const move = session.model.moves.find((item) => item.id === String(message.sourceId).toLowerCase()), element = Number(message.element);
    if (!move || !Number.isInteger(element)) return;
    const choice = await vscode.window.showQuickPick([
      { label: 'Start smear playback here', description: `Element ${element} begins advancing during hit pause`, action: 'start' },
      { label: 'Freeze on this frame', description: `Elements before ${element} play; element ${element} holds`, action: 'freeze' },
      { label: 'Clear smear playback range', description: 'Disable authored animation-through-hit-pause timing', action: 'clear' }
    ], { title: `${move.prefix} — AIR element ${element}`, placeHolder: 'Assign this thumbnail’s hit-pause smear role' });
    if (!choice) return;
    if (choice.action === 'clear') return await applyMoveValues(move.id, { hitPauseAnimateStartElement: 0, hitPauseFreezeElement: 0, hitPauseAnimateTicks: 0 }, `Cleared the hit-pause smear range for ${move.prefix}.`, owner, expectedText, expectedAir);
    if (choice.action === 'start') {
      const freeze = Number(move.values.hitPauseFreezeElement) || 0, validFreeze = freeze > element ? freeze : 0;
      return await applyMoveValues(move.id, { hitPauseAnimateStartElement: element, hitPauseFreezeElement: validFreeze, hitPauseAnimateTicks: validFreeze ? hitPauseTicks(move.timeline.frames, element, validFreeze) : 0 }, `Smear playback starts at AIR element ${element}${validFreeze ? ` and advances for ${hitPauseTicks(move.timeline.frames, element, validFreeze)} tick(s)` : '; right-click its freeze frame next'}.`, owner, expectedText, expectedAir);
    }
    const start = Number(move.values.hitPauseAnimateStartElement) || 0;
    if (!start) return vscode.window.showWarningMessage('Assign the smear playback start thumbnail first.');
    if (element <= start) return vscode.window.showWarningMessage(`The freeze frame must come after smear start element ${start}.`);
    const ticks = hitPauseTicks(move.timeline.frames, start, element);
    return await applyMoveValues(move.id, { hitPauseFreezeElement: element, hitPauseAnimateTicks: ticks }, `The smear advances from element ${start} through the frame before element ${element} (${ticks} AIR tick(s)), then freezes on element ${element}.`, owner, expectedText, expectedAir);
  }
  if (message.type === 'copyFields') {
    const current = expectedText, parsed = parseConstants(current), moves = moveGroups(parsed), source = moves.find((item) => item.id === String(message.sourceId).toLowerCase());
    if (!source) throw new Error('The source move is no longer present. Refresh and try again.');
    const available = moves.filter((item) => item.id !== source.id).map((item) => `${item.values.moveID ?? '—'} (${item.prefix})`).join(', ');
    const input = await vscode.window.showInputBox({ title: `Copy ${message.suffixes.length} option(s) from ${source.prefix}`, prompt: 'Enter destination move/state IDs or constant prefixes separated by commas.', placeHolder: 'Example: 210, 220, 250', value: '', validateInput: (value) => value.trim() ? undefined : 'Enter at least one destination.' });
    if (input === undefined) return;
    const resolved = resolveMoveTargets(moves, input, source.id);
    if (resolved.unresolved.length) return vscode.window.showErrorMessage(`No existing move-constant profile matches: ${resolved.unresolved.join(', ')}. Available: ${available}`);
    if (!resolved.selected.length) return vscode.window.showWarningMessage('No destination moves were selected.');
    const identity = message.suffixes.some((suffix) => ['moveID', 'hitIndex', 'hitDefID'].includes(suffix));
    const targetLabel = resolved.selected.map((item) => `${item.values.moveID ?? '—'} (${item.prefix})`).join(', ');
    const approved = await vscode.window.showWarningMessage(`Copy ${message.suffixes.length} option(s) from ${source.prefix} to ${resolved.selected.length} move(s)?`, { modal: true, detail: `${targetLabel}${identity ? '\n\nIdentity fields are included. Review duplicated move, hit, and HitDef IDs carefully.' : ''}\n\nExisting values will be replaced; missing selected options will be added to the existing destination profile.` }, 'Copy Options');
    if (approved !== 'Copy Options') return;
    const plan = copyMoveFields(current, source.id, resolved.selected.map((item) => item.id), message.suffixes, message.values || {}), document = await vscode.workspace.openTextDocument(assets.constants), edit = new vscode.WorkspaceEdit(), last = document.lineAt(document.lineCount - 1);
    if(session!==owner||owner.assets!==assets)return;
    if(document.getText()!==current)throw new Error('The constants changed while choosing copy options. Refresh and review before copying.');
    edit.replace(document.uri, new vscode.Range(0, 0, last.lineNumber, last.text.length), plan.text); if(!await vscode.workspace.applyEdit(edit)||session!==owner)return; owner.panel.webview.postMessage({ type: 'status', text: `Copied ${plan.fields.length} option(s) to ${plan.targets.length} move(s): ${plan.updated} replaced, ${plan.inserted} added. Review, then save normally.` }); return refresh();
  }
  }finally{if(mutating)owner.busy=false;}
}

async function openMoveConstantsWorkspace(uri, options = {}) {
  if(session?.busy){vscode.window.showInformationMessage('Wait for the current Move Lab edit to finish before switching context.');return session.panel;}
  const previous=session,defPath = await chooseDef(uri), requested=options?.reference || null; if (!defPath||session!==previous||session?.busy) return;
  if(session && options.history){
    if(path.resolve(session.assets.defPath).toLowerCase()!==path.resolve(defPath).toLowerCase()){
      vscode.window.showInformationMessage('Another character is open in the Move Lab constants integration. Close that workspace before restoring this history item so its pending edits remain protected.');return;
    }
    revealInViewerGroup(session.panel,false,vscode.ViewColumn.Active);return session.panel;
  }
  if(session&&path.resolve(session.assets.defPath).toLowerCase()===path.resolve(defPath).toLowerCase()){
    if(requested){const owner=session,current=await modelFor(owner.assets);if(session!==owner||owner.busy)return owner.panel;if(!validConstantsReference(requested,owner.assets,current)){vscode.window.showWarningMessage('That constants profile or source changed. Refresh Move Lab and choose it again.');return owner.panel;}owner.model=current;owner.overviewReference=requested.overviewReference||owner.overviewReference;await owner.panel.webview.postMessage({type:'model',model:current});await owner.panel.webview.postMessage({type:'moveLabSelect',reference:requested});}
    revealInViewerGroup(session.panel,false,vscode.ViewColumn.Active);return session.panel;
  }
  let assets, model;
  if(requested){try { assets = characterAssets(defPath); model = await modelFor(assets); } catch (error) { return vscode.window.showErrorMessage(`Move Lab — Constants: ${error.message}`); }if(!validConstantsReference(requested,assets,model)){vscode.window.showWarningMessage('That constants profile or source changed. Refresh Move Lab and choose it again.');return;}}
  if(session&&path.resolve(session.assets.defPath).toLowerCase()!==path.resolve(defPath).toLowerCase()){if(!await require('./viewer_close').prepare([session.panel],vscode)||session!==previous)return;await Promise.all([formDrafts.flush(),codeFormDrafts.flush()]);}
  if(!model){try { assets = characterAssets(defPath); model = await modelFor(assets); } catch (error) { return vscode.window.showErrorMessage(`Move Lab — Constants: ${error.message}`); }}
  model.openReference=requested;
  if(session!==previous||session?.busy)return;
  if (!model.moves.length) return vscode.window.showWarningMessage('No normal.*, special.*, or hyper.* move-constant groups were found in [Constants].');
  if (session) { session.draftDefs.add(defPath.toLowerCase()); session.assets = assets; session.model = model; session.overviewReference=model.openReference?.overviewReference||null; registerCharacterToolPanel(session.panel, defPath, model.character, Object.values(assets).filter((item) => typeof item === 'string')); session.panel.title = `${model.character} — Move Lab · Constants`; session.panel.webview.html = require('./webview_policy').protect(html(model)); revealInViewerGroup(session.panel, false, vscode.ViewColumn.Active);return session.panel; }
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenMoveConstants', `${model.character} — Move Lab · Constants`, preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  attachPanel(panel, assets, model);
  return panel;
}

function attachPanel(panel, assets, model) {
  registerCharacterToolPanel(panel, assets.defPath, model.character, Object.values(assets).filter(item => typeof item === 'string'));
  session = { panel, assets, model, overviewReference:model.openReference?.overviewReference||null, busy:false, draftDefs:new Set([assets.defPath.toLowerCase()]) };
  panel.title = `${model.character} — Move Lab · Constants`;
  panel.webview.options = { ...panel.webview.options, enableScripts: true };
  panel.webview.html = require('./webview_policy').protect(html(model));
  panel.webview.onDidReceiveMessage(message => session?.panel===panel&&handle(message).catch(error => { if(message?.type==='applyCodeSection')panel.webview.postMessage({type:'codeSectionFailed',requestId:message.requestId});return vscode.window.showErrorMessage(`Move Constants Editor: ${error.message}`); }));
  const listeners=[],isWatched=filename=>{const owner=session;if(!owner||owner.panel!==panel||!filename)return false;return [owner.assets.constants,owner.assets.air,...(owner.assets.code||[])].filter(Boolean).some(file=>path.resolve(file).toLowerCase()===path.resolve(filename).toLowerCase());};
  const scheduleRefresh=()=>{const owner=session;if(!owner||owner.panel!==panel)return;clearTimeout(owner.refreshTimer);owner.refreshTimer=setTimeout(()=>{if(session!==owner)return;if(owner.busy){scheduleRefresh();return;}refresh().catch(error=>vscode.window.showErrorMessage(`Move Constants Editor: ${error.message}`));},180);};
  listeners.push(vscode.workspace.onDidChangeTextDocument(event=>{if(isWatched(event.document.fileName))scheduleRefresh();}));
  listeners.push(vscode.workspace.onDidSaveTextDocument(document=>{if(isWatched(document.fileName))scheduleRefresh();}));
  if(vscode.languages.onDidChangeDiagnostics)listeners.push(vscode.languages.onDidChangeDiagnostics(event=>{if(event.uris.some(uri=>isWatched(uri.fsPath)))scheduleRefresh();}));
  require('./viewer_close').support(panel,{isBusy:()=>session?.panel===panel&&!!session.busy,keepDraft:()=>Promise.all([formDrafts.flush(),codeFormDrafts.flush()])});
  panel.onDidDispose(() => { for(const listener of listeners)listener.dispose?.();if(session?.panel===panel){clearTimeout(session.refreshTimer);session=null;} });
}
async function restoreMoveConstantsWorkspace(panel, state) {
  try {
    if (!state || typeof state.defPath !== 'string' || !path.isAbsolute(state.defPath)) throw new Error('The saved character path is unavailable. Reopen Move Lab from the character.');
    if (session) throw new Error('Another Move Lab constants integration is already open.');
    const assets = characterAssets(state.defPath), model = await modelFor(assets);
    if (!model.moves.length) throw new Error('The saved character no longer contains move-constant groups.');
    attachPanel(panel, assets, model);
  } catch (error) {
    panel.dispose();
    vscode.window.showWarningMessage(`Move Lab constants integration could not be restored: ${error.message}`);
  }
}
function registerMoveConstantsWorkspace(context) {
  formDrafts=new (require('./form_drafts').FormDrafts)(context.workspaceState,'ikemaker.moveConstantDrafts.v1');
  codeFormDrafts=new (require('./form_drafts').FormDrafts)(context.workspaceState,'ikemaker.moveCodeDrafts.v1');
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.moveConstants.open', openMoveConstantsWorkspace));
  context.subscriptions.push(vscode.window.registerWebviewPanelSerializer('ikemenMoveConstants', { deserializeWebviewPanel: restoreMoveConstantsWorkspace }));
}

module.exports = { registerMoveConstantsWorkspace, openMoveConstantsWorkspace, characterAssets, contactProfile, modelFor, html, constantsReference, validConstantsReference };
