'use strict';

const vscode = require('vscode');
const { openViewerSource, currentPoint } = require('./viewer_navigation');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const fs = require('fs');
const path = require('path');
const { parseDef, kind, setSectionEntry, sectionMap } = require('./def_model');
const { stageModel, validateStage, parallaxDimensions } = require('./stage_model');
const { analyzeParallax } = require('./parallax_assistant');
const { attachedCharacterTemplates, scanStageIntegration, crossReferenceStage } = require('./stage_integration');
const { readSff, spriteDataUri } = require('./sff_reader');
const { embeddedActions } = require('./def_actions');
const { hash, transactionalWrite, transactionalWriteSet, optionsFromConfig, policyFromConfig } = require('./mutation_safety');
const { mode } = require('./experience');
const { workspaceExperience } = require('./experience_model');
const { workflowFor, workflowHtml, advancedActionBarHtml, taskRecipesHtml, workflowClientScript } = require('./guided_workflows');
const { launchStageRig } = require('./stage_rig');
const { chooseFileOrFolder } = require('./open_target_picker');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');
const { registerAuthoringPanel } = require('./authoring_context_registry');
const { appendStageBackground, duplicateSection, deleteSection } = require('./visual_def_authoring');

const panelMessageHandlers = new WeakMap();

const openPanels = new Map();
function panelKey(filename, workspaceMode = '') { return path.resolve(filename).toLowerCase() + '|' + workspaceMode; }
function trackPanel(panel, filename, workspaceMode = '') {
  const key = panelKey(filename, workspaceMode), existing = openPanels.get(key);
  if (existing && existing !== panel) { panel.dispose(); return false; }
  if (!existing) {
    openPanels.set(key, panel);
    panel.onDidDispose(() => { if (openPanels.get(key) === panel) openPanels.delete(key); });
    const folder = path.dirname(filename), broad = path.basename(folder).toLowerCase() === 'stages';
    registerAuthoringPanel(panel, { type: 'stage', key: filename, label: path.basename(filename, path.extname(filename)), root: broad ? '' : folder, files: [filename] });
  }
  return true;
}


function mutationOptions(filename, label, overrides = {}) {
  return optionsFromConfig(vscode, filename, label, { journalRoot: gameRoot(filename) || path.dirname(filename), ...overrides });
}

function gameRoot(filename) {
  let current = path.dirname(filename);
  for (let depth = 0; depth < 12; depth += 1) {
    // Packaged games commonly rename Ikemen_GO.exe (HDBZWin.exe, for example).
    // Prefer the nearest complete game layout so a nested game is not mistaken
    // for a parent developer installation that happens to keep Ikemen_GO.exe.
    const hasChars = fs.existsSync(path.join(current, 'chars'));
    const hasGameData = fs.existsSync(path.join(current, 'data', 'select.def'))
      || fs.existsSync(path.join(current, 'data', 'system.def'))
      || fs.existsSync(path.join(current, 'data', 'system.base.def'));
    if ((hasChars && hasGameData)
      || fs.existsSync(path.join(current, 'Ikemen_GO.exe'))
      || fs.existsSync(path.join(current, 'data', 'system.base.def'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function resolveAsset(reference, filename) {
  if (!reference) return null;
  const cleaned = String(reference).replace(/\\/g, path.sep).replace(/\//g, path.sep);
  if (path.isAbsolute(cleaned) && fs.existsSync(cleaned)) return cleaned;
  const root = gameRoot(filename);
  const candidates = [path.resolve(path.dirname(filename), cleaned)];
  if (root) candidates.push(path.resolve(root, cleaned), path.resolve(root, 'data', cleaned), path.resolve(root, 'stages', cleaned));
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function stagePayload(filename, experience = workspaceExperience('stage', 'learning')) {
  const text = fs.readFileSync(filename, 'utf8');
  const document = parseDef(text, filename);
  if (kind(document) !== 'stage') throw new Error('This DEF does not contain the Camera, StageInfo, and BGDef structure expected of a stage.');
  const model = stageModel(document);
  const animations = embeddedActions(text);
  let archive = null, sffError = '', sffPath = '';
  if (model.sff) {
    sffPath = resolveAsset(model.sff, filename);
    try { archive = readSff(sffPath); } catch (error) { sffError = error.message; }
  }
  const images = {};
  const spriteInfo = {};
  if (archive) for (const background of model.backgrounds) {
    const reference = background.sprite || (background.action !== null && animations[background.action] && animations[background.action].sprite);
    if (!reference) continue;
    const key = reference.join(',');
    if (images[key]) continue;
    const sprite = archive.sprites.find((item) => item.group === reference[0] && item.number === reference[1]);
    if (!sprite) continue;
    try {
      images[key] = spriteDataUri(archive, sprite);
      spriteInfo[key] = { width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY };
    } catch (_) {}
  }
  const backgrounds = model.backgrounds.map((item) => {
    const reference = item.sprite || (item.action !== null && animations[item.action] && animations[item.action].sprite);
    const info = reference && spriteInfo[reference.join(',')];
    const embeddedAction = item.action !== null && animations[item.action];
    return { ...item, assetSprite: reference ? [...reference] : null, actionLine: embeddedAction ? embeddedAction.line : null, parallax: parallaxDimensions(item, info && info.width), parallaxAnalysis: analyzeParallax(model, item, info) };
  });
  const interactionScans = [];
  for (const attached of model.attachedChars) {
    const charDef = resolveAsset(attached.path, filename);
    if (!charDef || !fs.existsSync(charDef)) continue;
    try {
      const charDocument = parseDef(fs.readFileSync(charDef, 'utf8'), charDef), files = sectionMap(charDocument.sections.find((section) => section.normalized === 'files'));
      const references = Object.entries(files).filter(([key, value]) => /^(?:st\d*|cns)$/.test(key) && /\.(?:zss|cns)$/i.test(value)).map(([, value]) => resolveAsset(value.replace(/^"|"$/g, ''), charDef));
      for (const source of [...new Set(references)]) if (source && fs.existsSync(source)) interactionScans.push(scanStageIntegration(fs.readFileSync(source, 'utf8'), path.relative(path.dirname(filename), source).replace(/\\/g, '/')));
    } catch (_) {}
  }
  const integration = crossReferenceStage(model, interactionScans);
  const animationIssues = model.backgrounds
    .filter((item) => item.action !== null && !animations[item.action])
    .map((item) => ({ severity: 'error', code: 'missing-animation', line: item.line, message: `${item.name} references missing Begin Action ${item.action}.` }));
  const issues = [...validateStage(model, archive), ...animationIssues, ...integration.issues];
  const rigConfig = vscode.workspace && vscode.workspace.getConfiguration
    ? vscode.workspace.getConfiguration('ikemenZss', vscode.Uri.file(filename))
    : { get: (_key, fallback) => fallback };
  const rigSpeed = rigConfig.get('stageRigMoveSpeed', 2);
  return {
    filename, fileLabel: path.basename(filename), sourceHash: hash(text), mutation: policyFromConfig(vscode, filename), experience, sffPath, sffError, images, spriteInfo, animations,
    model: { ...model, source: undefined, backgrounds },
    rig: { speed: rigSpeed, fineSpeed: rigConfig.get('stageRigFineMoveSpeed', Math.max(0.05, rigSpeed / 4)), fastSpeed: rigConfig.get('stageRigFastMoveSpeed', rigSpeed * 4) },
    integration,
    issues
  };
}

function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }

function stageSpriteHandoff(payload, request) {
  const selected = payload?.model?.backgrounds?.find((item) => item.line === Number(request?.line) && item.name === request?.name);
  const reference = selected && selected.assetSprite;
  if (!selected || !reference || reference[0] !== Number(request?.group) || reference[1] !== Number(request?.number)) return null;
  return { sffPath: payload.sffPath, group: reference[0], number: reference[1], selected };
}

function stageHtml(payload) {
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
  :root{color-scheme:dark;--panel:#181b20;--line:#343b46;--muted:#9aa5b1;--accent:#38d5d5;--warn:#ffcc54;--danger:#ff6b6b}*{box-sizing:border-box}body{margin:0;background:#101217;color:#e8edf2;font:12px var(--vscode-font-family,Segoe UI);overflow:hidden}.app{height:100vh;display:grid;grid-template-columns:250px minmax(360px,1fr) 300px;grid-template-rows:auto minmax(0,1fr) auto}.toolbar{grid-column:1/4;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 10px;background:var(--panel);border-bottom:1px solid var(--line);overflow-x:auto}button,select,input{font:inherit;color:inherit;background:#262b33;border:1px solid #46505d;border-radius:3px;padding:5px}button:hover{border-color:var(--accent)}button.active{background:#15525a;border-color:var(--accent)}.side{min-width:0;background:var(--panel);overflow:auto;padding:10px}.left{border-right:1px solid var(--line)}.right{border-left:1px solid var(--line)}h2,h3{margin:5px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#b9c8d6}.canvas-wrap{position:relative;overflow:hidden;background:repeating-conic-gradient(#151a20 0 25%,#11161b 0 50%) 50%/24px 24px}.canvas-pan{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}canvas{display:block;background:#27112b;box-shadow:0 0 0 1px #566270}.bg{display:grid;grid-template-columns:24px 1fr auto;gap:5px;align-items:center;padding:5px;border-bottom:1px solid #272d35;cursor:pointer}.bg.selected{background:#16464d}.bg .meta{color:var(--muted);font-size:10px}.layers{display:flex;gap:5px}.status{grid-column:1/4;padding:5px 10px;background:var(--panel);border-top:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row{display:grid;grid-template-columns:90px 1fr;gap:7px;margin:5px 0;align-items:center}.value{font-family:var(--vscode-editor-font-family,monospace);color:#dce7ef}.issue{padding:6px;margin:5px 0;border-left:3px solid #5d6875;background:#22272e}.issue.warning{border-color:var(--warn)}.issue.error{border-color:var(--danger)}.issue.info{border-color:#62a9ff}.issue.active{border-color:var(--warn);background:#3c3420}.guide{display:flex;gap:4px;flex-wrap:wrap}.small{color:var(--muted);font-size:10px}.drag{color:var(--accent);font-weight:600}.patch{width:100%;min-height:54px;background:#11151a;color:#dce7ef;font-family:monospace;resize:vertical}.separator{border-top:1px solid var(--line);margin:10px 0}.badge{padding:2px 5px;border-radius:9px;background:#333b46}.camera{width:150px;padding:2px}.fit{margin-left:auto}.compare{position:absolute;inset:16px;z-index:5;background:#101217eF;border:1px solid var(--accent);padding:12px;display:none;overflow:auto}.compare.open{display:block}.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.compare img{width:100%;image-rendering:pixelated;border:1px solid var(--line)}.compact{width:62px}.row input,.row select{min-width:0;width:100%}.toolbar button{white-space:nowrap}.bg>div{min-width:0;overflow-wrap:anywhere}@media(max-width:1100px){body{overflow:auto}.app{height:auto;min-height:100vh;grid-template-columns:minmax(0,1fr);grid-template-rows:auto 380px auto auto auto}.toolbar,.status{grid-column:1}.toolbar{grid-row:1}.canvas-wrap{grid-row:2}.left{grid-row:3;max-height:360px}.right{grid-row:4;overflow:visible}.status{grid-row:5;white-space:normal;overflow-wrap:anywhere}.compare-grid{grid-template-columns:1fr}}
  </style></head><body><div class="app">
  <div class="toolbar"><b>Stage Workspace</b><span id="title"></span><span class="badge" id="coord"></span><span class="badge" title="Change this with IKEMEN: Configure Learning / Advanced Experience">${payload.experience.label}</span><button id="stageRig" title="Launch the configurable two-player camera diagnostic rig.">▶ Stage Rig</button><div class="layers"><button data-layer="-1" class="active">Layer -1</button><button data-layer="0" class="active">Layer 0</button><button data-layer="1" class="active">Layer 1</button></div><button id="guides" class="active">Guides</button><label>Camera X <input class="camera" id="cameraX" type="range"></label><label>Y <input class="camera" id="cameraY" type="range"></label><label>Zoom <input class="camera" id="cameraZoom" type="range" min="0.1" max="4" step="0.01"></label><select id="cameraPreset" title="Preview authored camera stress positions"><option value="">Camera preset…</option><option value="start">Authored start</option><option value="left">Left bound</option><option value="right">Right bound</option><option value="high">High bound</option><option value="low">Low bound</option><option value="wide">Zoom out</option><option value="tight">Zoom in</option></select><button id="previewSweep" title="Animate the editor camera through its bounds; this does not alter the stage.">Sweep</button><label>BGCtrl <input class="camera" id="timeline" type="range" min="0" max="600" step="1" value="0"></label><span id="timelineValue">0</span><button id="captureA">Capture A</button><button id="captureB">Capture B</button><button id="compare">Compare</button><button class="fit" id="fit">Fit</button><button id="reset">Reset</button></div>
  <aside class="side left"><h2>Background stack</h2><div class="guide"><button id="addBg" title="Create a new normal, animated, or parallax stage background">+ Background</button><button id="duplicateBg" title="Duplicate the selected background">Duplicate</button><button id="removeBg" title="Remove the selected background section">Remove</button></div><div id="backgrounds"></div><div class="separator"></div><h3>Stage services</h3><div id="services"></div><div class="separator"></div><h3>Validation</h3><div id="issues"></div></aside>
  <main class="canvas-wrap" id="viewport"><div class="canvas-pan" id="pan"><canvas id="canvas"></canvas></div><div class="compare" id="comparePanel"><div class="guide"><b>Stage comparison</b><button id="closeCompare">Close</button></div><p class="small">Captures stay in this editor session and are never written to disk.</p><div class="compare-grid"><div><h3>Capture A</h3><img id="imageA"></div><div><h3>Capture B</h3><img id="imageB"></div></div></div></main>
  <aside class="side right"><h2>Selected element</h2><div id="inspector"></div><button id="source">Open source line</button><div class="separator"></div><h3>Preview position</h3><div class="row"><span>Start X</span><input id="startX" type="number" step="1"></div><div class="row"><span>Start Y</span><input id="startY" type="number" step="1"></div><textarea id="patch" class="patch" readonly></textarea><div class="guide"><button id="copy">Copy patch</button><button id="apply">Apply reviewed position</button><button id="discard">Discard preview</button></div><p class="small">Drag the selected background on the canvas or enter coordinates. Applying changes only its Start value in this BG section.</p><div class="separator"></div><details ${payload.experience.guidanceOpen ? 'open' : ''}><summary><b>What am I editing?</b></summary><p class="small"><b>${payload.experience.title}.</b> ${payload.experience.guidance}</p></details><details><summary><b>Stage Rig controls</b></summary><div class="row"><span>Normal speed</span><input class="compact" id="rigSpeed" type="number" min="0.1" step="0.1" value="${payload.rig.speed}"></div><div class="row"><span>Fine speed</span><input class="compact" id="rigFine" type="number" min="0.05" step="0.05" value="${payload.rig.fineSpeed}"></div><div class="row"><span>Fast speed</span><input class="compact" id="rigFast" type="number" min="0.1" step="0.5" value="${payload.rig.fastSpeed}"></div><p class="small">Directions: P1 · D+directions: P2 · W+directions: both/reversed<br>X/Y: fine/fast · A/B/C: reset P1/P2/both<br>A+B: stress presets · X+Y: auto sweep · Z: lock X/Y/both · A+C: markers<br>B+C: measurements/info · Y+Z: bottom button guide<br>Pause key: pause/resume · Scroll Lock: single frame. Set either visibility toggle before native Pause; the paused inspection remains unobstructed.</p><button id="stageRigPanel">Launch with these speeds</button></details></aside>
  <div class="status" id="status"></div></div>
  <script>
  const vscode=acquireVsCodeApi(),data=${safeJson(payload)},model=data.model,canvas=document.getElementById('canvas'),ctx=canvas.getContext('2d'),viewport=document.getElementById('viewport'),pan=document.getElementById('pan');
  document.getElementById('source').insertAdjacentHTML('afterend','<div class="guide" style="margin-top:5px"><button id="assetSprite" data-ikemen-destination="sff" disabled>Open sprite in SFF</button><button id="assetAction" data-ikemen-destination="stage" disabled>Open embedded action</button></div><p class="small">Asset buttons navigate to the exact authored destination. Editing remains owned by that destination workspace.</p>');document.getElementById('source').dataset.ikemenDestination='stage';
  const images={},visible={[-1]:true,0:true,1:true};let selected=0,viewScale=1,panX=0,panY=0,guides=true,drag=null,previewStarts=model.backgrounds.map(x=>[...x.start]),bounds=[],captureA='',captureB='',sweepTimer=null,sweepDirection=1;
  canvas.width=model.localCoord[0];canvas.height=model.localCoord[1];document.getElementById('title').textContent=model.name;document.getElementById('coord').textContent=model.localCoord.join(' × ');
  for(const [key,src] of Object.entries(data.images)){const image=new Image();image.onload=render;image.src=src;images[key]=image}
  const cameraX=document.getElementById('cameraX'),cameraY=document.getElementById('cameraY'),cameraZoom=document.getElementById('cameraZoom');cameraX.min=model.camera.bounds[0];cameraX.max=model.camera.bounds[1];cameraX.step=1;cameraX.value=model.camera.start[0];cameraY.min=model.camera.bounds[2];cameraY.max=model.camera.bounds[3];cameraY.step=1;cameraY.value=model.camera.start[1];cameraZoom.min=Math.min(.1,model.camera.zoom[1]);cameraZoom.max=Math.max(2,model.camera.zoom[2]);cameraZoom.value=model.camera.zoom[0];
  function fit(){const pad=30;viewScale=Math.min((viewport.clientWidth-pad)/canvas.width,(viewport.clientHeight-pad)/canvas.height);panX=panY=0;transform()}
  function transform(){pan.style.transform='translate(calc(-50% + '+panX+'px),calc(-50% + '+panY+'px)) scale('+viewScale+')';document.getElementById('status').textContent='View '+Math.round(viewScale*100)+'% | camera '+cameraX.value+', '+cameraY.value+' | zoom '+Number(cameraZoom.value).toFixed(2)+' | Direct save · backups '+(data.mutation.backups?'on':'off')+' · history '+(data.mutation.history?'on':'off')+' | '+pathLabel();render()}
  function pathLabel(){return data.fileLabel+(data.sffError?' | SFF unavailable; see validation details':'')}
  function art(item){const frame=item.action!==null&&data.animations[item.action],ref=item.sprite||(frame&&frame.sprite),key=ref&&ref.join(',');return{frame,ref,key,image:key&&images[key],info:key&&data.spriteInfo[key]}}
  function bgScreen(item,index){const start=previewStarts[index],asset=art(item),offset=asset.frame?asset.frame.offset:[0,0],info=asset.info;const hidden=item.hidden?10000000:0;const x=hidden+model.localCoord[0]/2+start[0]+offset[0]-Number(cameraX.value)*item.delta[0]-(info?info.axisX:0);const y=hidden+model.stageInfo.zOffset+start[1]+offset[1]-Number(cameraY.value)*item.delta[1]-(info?info.axisY:0);return{x,y,info}}
  function stageTransform(){const z=Number(cameraZoom.value),anchor=model.camera.zoomAnchor==='bottom'?[model.localCoord[0]/2,model.stageInfo.zOffset]:[model.localCoord[0]/2,model.localCoord[1]/2];ctx.translate(anchor[0],anchor[1]);ctx.scale(z,z);ctx.translate(-anchor[0],-anchor[1])}
  function drawParallax(image,x,y,item,shape,scaleX,scaleY){const h=image.height*scaleY,top=shape.top*scaleX,bottom=shape.bottom*scaleX,slices=Math.min(image.height,180);for(let row=0;row<slices;row++){const t=row/slices,next=(row+1)/slices,w=top+(bottom-top)*t,w2=top+(bottom-top)*next,dy=y+h*t,dh=Math.max(1,h/slices+1);ctx.drawImage(image,0,image.height*t,image.width,image.height/slices,x+(top-w)/2,dy,Math.max(w,w2),dh)}ctx.strokeStyle=selected===item.order?'#38d5d5':'rgba(255,204,84,.7)';ctx.strokeRect(x,y,top,h);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(top-bottom)/2,y+h);ctx.lineTo(x+(top+bottom)/2,y+h);ctx.lineTo(x+top,y);ctx.stroke()}
  function drawNormal(image,p,item,index,sx,sy){const w=image.width*sx,h=image.height*sy,stepX=w+(item.tileSpacing[0]||0),stepY=h+(item.tileSpacing[1]||0),xs=item.tile[0]?[-2,-1,0,1,2]:[0],ys=item.tile[1]?[-2,-1,0,1,2]:[0];for(const tx of xs)for(const ty of ys)ctx.drawImage(image,p.x+tx*stepX,p.y+ty*stepY,w,h);if(index===selected){ctx.strokeStyle='#38d5d5';ctx.lineWidth=2;ctx.strokeRect(p.x,p.y,w,h)}bounds[index]={x:p.x,y:p.y,w,h}}
  function render(){ctx.save();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#28112c';ctx.fillRect(0,0,canvas.width,canvas.height);stageTransform();bounds=[];for(const layer of [-1,0,1])for(let i=0;i<model.backgrounds.length;i++){const item=model.backgrounds[i];if(item.layer!==layer||!visible[layer])continue;const asset=art(item),image=asset.image,p=bgScreen(item,i);if(!image||!image.complete)continue;const sx=item.scaleStart[0],sy=item.scaleStart[1];ctx.save();ctx.globalAlpha=item.trans==='addalpha'?Math.max(0,Math.min(1,item.alpha[0]/256)):1;ctx.translate(p.x,p.y);if(item.angle)ctx.rotate(item.angle*Math.PI/180);ctx.transform(1,0,item.xShear,1,0,0);ctx.translate(-p.x,-p.y);if(item.type==='parallax'&&item.parallax)drawParallax(image,p.x,p.y,item,item.parallax,sx,sy);else drawNormal(image,p,item,i,sx,sy);ctx.restore();if(item.window){ctx.save();ctx.strokeStyle=i===selected?'#ffcc54':'rgba(255,204,84,.55)';ctx.setLineDash([6,4]);ctx.strokeRect(item.window[0],item.window[1],item.window[2]-item.window[0],item.window[3]-item.window[1]);ctx.restore()}}if(guides)drawGuides();ctx.restore();}
  function drawGuides(){ctx.save();ctx.lineWidth=1;ctx.setLineDash([7,5]);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.strokeRect(0,0,model.localCoord[0],model.localCoord[1]);ctx.strokeStyle='#ffcc54';ctx.beginPath();ctx.moveTo(0,model.stageInfo.zOffset);ctx.lineTo(model.localCoord[0],model.stageInfo.zOffset);ctx.stroke();const cx=model.localCoord[0]/2-Number(cameraX.value);ctx.strokeStyle='#ff6b6b';ctx.strokeRect(cx+model.camera.bounds[0],model.camera.bounds[2],model.camera.bounds[1]-model.camera.bounds[0],model.localCoord[1]-model.camera.bounds[2]);ctx.setLineDash([]);ctx.font='11px sans-serif';for(const p of model.playerStarts.slice(0,8)){const x=model.localCoord[0]/2+p.x-Number(cameraX.value),y=model.stageInfo.zOffset+p.y;ctx.fillStyle=p.player<=2?'#ffffff':'#9aa5b1';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.fillText('P'+p.player,x+8,y-4)}ctx.restore()}
  function list(){const host=document.getElementById('backgrounds');host.innerHTML='';model.backgrounds.forEach((item,index)=>{const row=document.createElement('div');row.className='bg'+(index===selected?' selected':'');row.innerHTML='<input type="checkbox" checked><div><b>'+escapeHtml(item.name)+'</b><div class="meta">'+item.type+' · layer '+item.layer+' · '+(item.sprite?item.sprite.join(','):'anim '+item.action)+'</div></div><span>#'+(index+1)+'</span>';row.querySelector('input').checked=!item.hidden;row.querySelector('input').onchange=e=>{item.hidden=!e.target.checked;render()};row.onclick=e=>{if(e.target.tagName==='INPUT')return;selected=index;list();inspect();render()};host.appendChild(row)});services();issues()}
  function services(){
    const host=document.getElementById('services'),items=[];
    items.push(model.attachedChars.length+' attached character(s)');items.push(model.roundDefs.length+' round-swapped stage(s)');items.push(Object.keys(model.constants).length+' stage constant(s)');items.push(model.backgrounds.filter(x=>x.id!==null).length+' BG target ID(s)');items.push(model.controllers.filter(x=>x.sctrlid!==null).length+' controller target ID(s)');
    items.push(data.integration.scans.length+' interaction code file(s) scanned');
    host.innerHTML=items.map(x=>'<div class="row"><span>•</span><span>'+x+'</span></div>').join('');
    if(model.controllers.length){const tick=Number(document.getElementById('timeline').value)||0;host.innerHTML+='<h3>BGCtrl timeline · tick '+tick+'</h3>'+model.controllers.map(x=>'<div class="issue info '+(ctrlActive(x,tick)?'active':'')+'"><b>'+escapeHtml(x.name)+'</b><br>'+escapeHtml(x.type||'unspecified')+' · time '+x.time.join(', ')+' · sctrlid '+(x.sctrlid??'—')+(ctrlActive(x,tick)?'<br><b>Scheduled now</b>':'')+'</div>').join('')}
    if(model.roundDefs.length){host.innerHTML+='<h3>Round stages</h3>'+model.roundDefs.map(x=>'<div class="small">Round '+x.round+': '+escapeHtml(x.path)+'</div>').join('')}
    if(data.integration.scans.length){host.innerHTML+='<h3>Interaction cross-links</h3>'+data.integration.scans.map(x=>'<div class="issue info"><b>'+escapeHtml(x.filename)+'</b><br>BG writes '+x.modifyStageBg.length+' · BGCtrl writes '+x.modifyBgCtrl.length+' · camera/stage writes '+x.modifyStageVar.length+' · constants '+x.stageConstants.length+'</div>').join('')}
  }
  function ctrlActive(item,tick){const start=Number(item.time[0])||0,end=Number(item.time[1])||start,loop=Number(item.time[2])||-1;if(tick<start)return false;if(loop>0)return((tick-start)%loop)<=Math.max(0,end-start);return tick<=end}
  function cameraPreset(value){if(value==='start'){cameraX.value=model.camera.start[0];cameraY.value=model.camera.start[1];cameraZoom.value=model.camera.zoom[0]}if(value==='left')cameraX.value=model.camera.bounds[0];if(value==='right')cameraX.value=model.camera.bounds[1];if(value==='high')cameraY.value=model.camera.bounds[2];if(value==='low')cameraY.value=model.camera.bounds[3];if(value==='wide')cameraZoom.value=model.camera.zoom[1];if(value==='tight')cameraZoom.value=model.camera.zoom[2];render()}
  function toggleSweep(){const button=document.getElementById('previewSweep');if(sweepTimer){clearInterval(sweepTimer);sweepTimer=null;button.classList.remove('active');button.textContent='Sweep';return}button.classList.add('active');button.textContent='Stop sweep';sweepTimer=setInterval(()=>{let x=Number(cameraX.value)+sweepDirection*Math.max(1,(model.camera.bounds[1]-model.camera.bounds[0])/180);if(x>=model.camera.bounds[1]){x=model.camera.bounds[1];sweepDirection=-1}if(x<=model.camera.bounds[0]){x=model.camera.bounds[0];sweepDirection=1}cameraX.value=x;render()},16)}
  function capture(slot){render();const value=canvas.toDataURL('image/png');if(slot==='A')captureA=value;else captureB=value;document.getElementById('image'+slot).src=value;document.getElementById('status').textContent='Captured comparison '+slot+' in memory. '+pathLabel()}
  function showCompare(){document.getElementById('imageA').src=captureA;document.getElementById('imageB').src=captureB;document.getElementById('comparePanel').classList.add('open')}
  function issues(){document.getElementById('issues').innerHTML=data.issues.length?data.issues.map(x=>'<div class="issue '+x.severity+'"><b>'+x.severity.toUpperCase()+'</b><br>'+escapeHtml(x.message)+'</div>').join(''):'<div class="issue info">No model-level issues found.</div>'}
  function inspect(){
    const item=model.backgrounds[selected];
    if(!item){document.getElementById('inspector').textContent='No background elements.';return}
    const rows=[['Type',item.type],['Source line',item.line+1],['Sprite / anim',item.sprite?item.sprite.join(','):'Action '+item.action],['Layer',item.layer],['ID',item.id??'—'],['SctrlId',item.sctrlid??'—'],['Delta',item.delta.join(', ')],['Scale',item.scaleStart.join(', ')],['Zoom delta',item.zoomDelta.join(', ')],['Velocity',item.velocity.join(', ')],['Window',item.window?item.window.join(', '):'—'],['Projection',item.projection]];
    if(item.parallax){
      rows.push(['Parallax form',item.parallax.mode],['Top width',Math.round(item.parallax.top*100)/100],['Bottom width',Math.round(item.parallax.bottom*100)/100],['Auto resize',item.autoResizeParallax?'Yes':'No']);
      if(item.parallaxAnalysis)rows.push(['Camera sweep',item.parallaxAnalysis.coverage],['Failing samples',item.parallaxAnalysis.failing],['Largest gap',Math.round(item.parallaxAnalysis.maxGap*100)/100]);
    }
    document.getElementById('inspector').innerHTML=rows.map(x=>'<div class="row"><span>'+x[0]+'</span><span class="value">'+escapeHtml(String(x[1]))+'</span></div>').join('')+(item.parallaxAnalysis?'<p class="small">'+escapeHtml(item.parallaxAnalysis.note)+'</p>':'');
    const spriteButton=document.getElementById('assetSprite'),actionButton=document.getElementById('assetAction');spriteButton.disabled=!item.assetSprite||!data.sffPath||Boolean(data.sffError);spriteButton.title=item.assetSprite?'Open sprite '+item.assetSprite.join(',')+' in '+(data.sffPath||'the stage SFF'):'This background has no resolvable sprite';actionButton.disabled=item.actionLine===null;actionButton.title=item.actionLine===null?'This background does not use an embedded Begin Action':'Open Begin Action '+item.action+' in the stage DEF';
    document.getElementById('startX').value=previewStarts[selected][0];document.getElementById('startY').value=previewStarts[selected][1];patch()
  }
  function patch(){const item=model.backgrounds[selected],s=previewStarts[selected];document.getElementById('patch').value='[BG '+item.name+']\\nstart = '+round(s[0])+', '+round(s[1])}
  function setStart(){previewStarts[selected]=[Number(document.getElementById('startX').value)||0,Number(document.getElementById('startY').value)||0];patch();render()}
  function escapeHtml(x){return x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function round(x){return Math.round(x*1000)/1000}
  document.querySelectorAll('[data-layer]').forEach(button=>button.onclick=()=>{const layer=Number(button.dataset.layer);visible[layer]=!visible[layer];button.classList.toggle('active',visible[layer]);render()});cameraX.oninput=cameraY.oninput=cameraZoom.oninput=render;document.getElementById('cameraPreset').onchange=e=>cameraPreset(e.target.value);document.getElementById('previewSweep').onclick=toggleSweep;document.getElementById('timeline').oninput=e=>{document.getElementById('timelineValue').textContent=e.target.value;services()};document.getElementById('captureA').onclick=()=>capture('A');document.getElementById('captureB').onclick=()=>capture('B');document.getElementById('compare').onclick=showCompare;document.getElementById('closeCompare').onclick=()=>document.getElementById('comparePanel').classList.remove('open');document.getElementById('guides').onclick=e=>{guides=!guides;e.target.classList.toggle('active',guides);render()};document.getElementById('fit').onclick=fit;document.getElementById('reset').onclick=()=>{cameraX.value=model.camera.start[0];cameraY.value=model.camera.start[1];cameraZoom.value=model.camera.zoom[0];fit()};document.getElementById('startX').oninput=document.getElementById('startY').oninput=setStart;document.getElementById('discard').onclick=()=>{previewStarts[selected]=[...model.backgrounds[selected].start];inspect();render()};document.getElementById('copy').onclick=()=>vscode.postMessage({type:'copyPatch',text:document.getElementById('patch').value});document.getElementById('apply').onclick=()=>vscode.postMessage({type:'applyStart',sectionLine:model.backgrounds[selected].line,value:round(previewStarts[selected][0])+', '+round(previewStarts[selected][1]),name:model.backgrounds[selected].name});
  document.getElementById('source').onclick=()=>{const item=model.backgrounds[selected];if(item)vscode.postMessage({type:'openSource',line:item.line,navigationSelection:globalThis.ikemenNavigationSelection()})};
  document.getElementById('assetSprite').onclick=()=>{const item=model.backgrounds[selected];if(item&&item.assetSprite)vscode.postMessage({type:'openStageSprite',line:item.line,name:item.name,group:item.assetSprite[0],number:item.assetSprite[1]})};document.getElementById('assetAction').onclick=()=>{const item=model.backgrounds[selected];if(item&&item.actionLine!==null)vscode.postMessage({type:'openSource',line:item.actionLine,navigationSelection:globalThis.ikemenNavigationSelection()})};
  document.getElementById('addBg').onclick=()=>vscode.postMessage({type:'addBackground'});document.getElementById('duplicateBg').onclick=()=>{const item=model.backgrounds[selected];if(item)vscode.postMessage({type:'duplicateBackground',line:item.line,name:item.name})};document.getElementById('removeBg').onclick=()=>{const item=model.backgrounds[selected];if(item)vscode.postMessage({type:'removeBackground',line:item.line,name:item.name})};
  function launchRig(){vscode.postMessage({type:'launchStageRig',speed:Number(document.getElementById('rigSpeed').value),fineSpeed:Number(document.getElementById('rigFine').value),fastSpeed:Number(document.getElementById('rigFast').value)})}document.getElementById('stageRig').onclick=launchRig;document.getElementById('stageRigPanel').onclick=launchRig;
  canvas.onmousedown=e=>{const item=model.backgrounds[selected];if(!item)return;drag={x:e.clientX,y:e.clientY,start:[...previewStarts[selected]]};canvas.classList.add('drag')};window.onmousemove=e=>{if(!drag)return;const rect=canvas.getBoundingClientRect(),zoom=Number(cameraZoom.value),dx=(e.clientX-drag.x)*canvas.width/rect.width/zoom,dy=(e.clientY-drag.y)*canvas.height/rect.height/zoom;previewStarts[selected]=[round(drag.start[0]+dx),round(drag.start[1]+dy)];inspect();render()};window.onmouseup=()=>{drag=null;canvas.classList.remove('drag')};viewport.onwheel=e=>{e.preventDefault();viewScale=Math.max(.1,Math.min(6,viewScale*(e.deltaY<0?1.1:.9)));transform()};
  window.onresize=fit;vscode.setState({...vscode.getState(),filename:data.filename});list();inspect();setTimeout(fit,20);
  </script></body></html>`;
  return page.replace('<button id="stageRig"', `${launchControlsHtml('stage')}<button id="stageRig"`).replace('</p></details><details><summary><b>Stage Rig controls', `</p>${workflowHtml(workflowFor('stage', { localCoord: payload.model.localCoord, hasSff: Boolean(payload.sffPath), sffError: payload.sffError, backgrounds: payload.model.backgrounds.length, issues: payload.issues }))}</details>${taskRecipesHtml('stage', payload.experience)}${advancedActionBarHtml('stage', payload.experience)}<details><summary><b>Stage Rig controls`).replace('</script></body>', `${require('./stage_navigation').clientScript()}${launchControlsClientScript()}${workflowClientScript()}</script></body>`);
}

async function populate(panel, filename) {
  if (!trackPanel(panel, filename)) return;
  panel.webview.options = { enableScripts: true };
  const payload = stagePayload(filename, workspaceExperience('stage', mode('stageUi', vscode.Uri.file(filename))));
  panel.title = `Stage: ${payload.model.name}`;
  panel.webview.html = require('./webview_policy').protect(stageHtml(payload), panel.webview.cspSource);
  const previousHandler = panelMessageHandlers.get(panel);
  if (previousHandler) previousHandler.dispose();
  const handler = panel.webview.onDidReceiveMessage(async (message) => {
    if (await handleLaunchMessage(message, filename, 'stage', panel)) return;
    if (message.type === 'launchStageRig') {
      await launchStageRig(vscode.Uri.file(filename), { speed: message.speed, fineSpeed: message.fineSpeed, fastSpeed: message.fastSpeed });
      return;
    }
    if (message.type === 'openSource') {
      await openViewerSource(filename, message.line, currentPoint(filename, 'stage', message, panel));
      return;
    }
    if (message.type === 'openStageSprite') {
      const target = stageSpriteHandoff(payload, message);
      if (!target) return vscode.window.showWarningMessage('The selected stage background changed. Refresh the Stage Workspace and choose it again.');
      if (!payload.sffPath || payload.sffError || !fs.existsSync(payload.sffPath)) return vscode.window.showWarningMessage('The stage SFF is not currently available. Review the Stage Workspace validation details.');
      if (hash(fs.readFileSync(filename, 'utf8')) !== payload.sourceHash) { await populate(panel, filename); return vscode.window.showWarningMessage('The stage changed on disk. The Stage Workspace was refreshed; choose the background again.'); }
      await vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(target.sffPath), undefined, { group: target.group, number: target.number });
      return;
    }
    if (message.type === 'copyPatch') { await vscode.env.clipboard.writeText(String(message.text || '')); return vscode.window.showInformationMessage('Stage position patch copied.'); }
    if (message.type === 'addBackground') {
      const name = await vscode.window.showInputBox({ title: 'New background name', value: `Background ${payload.model.backgrounds.length + 1}`, validateInput: (value) => value.trim() ? undefined : 'Enter a background name.' }); if (!name) return;
      const selectedType = await vscode.window.showQuickPick([{ label: 'Normal sprite', value: 'normal' }, { label: 'Animated background', value: 'anim' }, { label: 'Parallax floor or plane', value: 'parallax' }], { title: 'Background type' }); if (!selectedType) return;
      const reference = await vscode.window.showInputBox({ title: selectedType.value === 'anim' ? 'Animation number' : 'Sprite group,index', value: selectedType.value === 'anim' ? '0' : '0,0' }); if (reference === undefined) return;
      try { const text = fs.readFileSync(filename, 'utf8'), next = appendStageBackground(text, { name, type: selectedType.value, action: reference, sprite: reference }); transactionalWrite(fs, filename, next, mutationOptions(filename, 'add-stage-background', { expectedHash: payload.sourceHash })); await populate(panel, filename); } catch (error) { vscode.window.showErrorMessage(`Could not add background: ${error.message}`); } return;
    }
    if (message.type === 'duplicateBackground') {
      const name = await vscode.window.showInputBox({ title: 'Duplicate background as', value: `${message.name} Copy` }); if (!name) return;
      try { const text = fs.readFileSync(filename, 'utf8'), next = duplicateSection(text, message.line, `BG ${name.replace(/^BG\s+/i, '')}`); transactionalWrite(fs, filename, next, mutationOptions(filename, 'duplicate-stage-background', { expectedHash: payload.sourceHash })); await populate(panel, filename); } catch (error) { vscode.window.showErrorMessage(`Could not duplicate background: ${error.message}`); } return;
    }
    if (message.type === 'removeBackground') {
      const answer = await vscode.window.showWarningMessage(`Remove BG ${message.name}?`, { modal: true, detail: 'This removes the complete background section. Recovery history and configured backups remain active.' }, 'Remove Background'); if (answer !== 'Remove Background') return;
      try { const text = fs.readFileSync(filename, 'utf8'), next = deleteSection(text, message.line); transactionalWrite(fs, filename, next, mutationOptions(filename, 'remove-stage-background', { expectedHash: payload.sourceHash })); await populate(panel, filename); } catch (error) { vscode.window.showErrorMessage(`Could not remove background: ${error.message}`); } return;
    }
    if (message.type !== 'applyStart') return;
    const answer = await vscode.window.showWarningMessage(`Apply Start = ${message.value} to BG ${message.name}?`, { modal: true }, 'Apply');
    if (answer !== 'Apply') return;
    try {
      const text = fs.readFileSync(filename, 'utf8'), document = parseDef(text, filename);
      const next = setSectionEntry(document, Number(message.sectionLine), 'start', String(message.value));
      const result = transactionalWrite(fs, filename, next, mutationOptions(filename, 'stage-bg-position', { expectedHash: payload.sourceHash }));
      await populate(panel, filename);
      vscode.window.showInformationMessage(`Updated BG ${message.name} position.${result.backup ? ` Backup: ${path.basename(result.backup)}` : ''}`);
    } catch (error) { vscode.window.showErrorMessage(`Could not update stage position: ${error.message}`); }
  });
  panelMessageHandlers.set(panel, handler);
}

async function openStageWorkspace(uri) {
  let filename = uri && uri.fsPath;
  if (!filename) {
    const active = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
    if (active && /\.def$/i.test(active.fsPath)) {
      try { if (kind(parseDef(fs.readFileSync(active.fsPath, 'utf8'), active.fsPath)) === 'stage') filename = active.fsPath; } catch (_) {}
    }
  }
  if (!filename) {
    filename = await chooseFileOrFolder({ title: 'Open IKEMEN Stage', filters: { 'IKEMEN stage': ['def'] }, extensions: ['def'], predicate: (candidate) => kind(parseDef(fs.readFileSync(candidate, 'utf8'), candidate)) === 'stage', maxDepth: 4, invalidMessage: 'That DEF is not an IKEMEN stage.', emptyMessage: 'No stage DEF files were found in that folder.' });
  }
  if (!filename) return;
  try {
    if (kind(parseDef(fs.readFileSync(filename, 'utf8'), filename)) !== 'stage') return vscode.window.showErrorMessage('Choose a stage DEF containing Camera, StageInfo, and BGDef sections.');
  } catch (error) { return vscode.window.showErrorMessage(`Could not read stage DEF: ${error.message}`); }
  const existing = openPanels.get(panelKey(filename));
  if (existing) { revealInViewerGroup(existing); return existing; }
  try {
    const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenStageWorkspace', `Stage: ${path.basename(filename)}`, preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
    await populate(panel, filename);
    return panel;
  } catch (error) { vscode.window.showErrorMessage(`Could not open stage workspace: ${error.message}`); }
}

async function createStageInteraction(uri) {
  let stageFilename = uri && uri.fsPath;
  if (!stageFilename) {
    const active = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
    if (active && /\.def$/i.test(active.fsPath)) stageFilename = active.fsPath;
  }
  if (!stageFilename) return vscode.window.showWarningMessage('Open or right-click a stage DEF before creating its interaction helper.');
  let parsed, model;
  try { parsed = parseDef(fs.readFileSync(stageFilename, 'utf8'), stageFilename); model = stageModel(parsed); }
  catch (error) { return vscode.window.showErrorMessage(`Could not read stage: ${error.message}`); }
  const base = path.basename(stageFilename, path.extname(stageFilename));
  const name = await vscode.window.showInputBox({ title: 'Stage interaction name', value: `${model.name} Interaction`, validateInput: (value) => value.trim() ? undefined : 'Enter a name.' });
  if (!name) return;
  const prefix = await vscode.window.showInputBox({ title: 'Map/function namespace', value: `${base.replace(/[^A-Za-z0-9_]/g, '_')}_`, prompt: 'Project-owned prefix used by generated maps. You can change it per project.' });
  if (prefix === undefined) return;
  const target = await vscode.window.showSaveDialog({ title: 'Save attached-character DEF', defaultUri: vscode.Uri.file(path.join(path.dirname(stageFilename), base, 'interaction.def')), filters: { 'IKEMEN character definition': ['def'] } });
  if (!target) return;
  const directory = path.dirname(target.fsPath), stem = path.basename(target.fsPath, '.def');
  const relativeSff = model.sff ? path.relative(directory, resolveAsset(model.sff, stageFilename)).replace(/\\/g, '/') : '../stage.sff';
  const templates = attachedCharacterTemplates({ name, prefix, sff: relativeSff });
  const files = [
    [target.fsPath, templates.def.replace(/interaction\.air/g, `${stem}.air`).replace(/interaction\.zss/g, `${stem}.zss`)],
    [path.join(directory, `${stem}.air`), templates.air], [path.join(directory, `${stem}.zss`), templates.zss], [path.join(directory, 'README.md'), templates.readme]
  ];
  const existing = files.filter(([filename]) => fs.existsSync(filename));
  if (existing.length) {
    const answer = await vscode.window.showWarningMessage(`${existing.length} interaction file(s) already exist. Replace them?`, { modal: true }, 'Replace');
    if (answer !== 'Replace') return;
  }
  try {
    transactionalWriteSet(fs, files, mutationOptions(stageFilename, 'stage-interaction-files', { allowExisting: true }));
  } catch (error) { return vscode.window.showErrorMessage(`Could not create stage interaction files: ${error.message}`); }
  const add = await vscode.window.showInformationMessage('Created the project-owned stage interaction files.', 'Add AttachedChar to Stage', 'Open ZSS');
  if (add === 'Add AttachedChar to Stage') {
    if (model.attachedChars.length >= 4) return vscode.window.showWarningMessage('This stage already declares four attached characters. The files were created but the stage was not changed.');
    const info = parsed.sections.find((section) => section.normalized === 'info');
    if (!info) return vscode.window.showWarningMessage('The files were created, but the stage has no Info section to update.');
    const key = model.attachedChars.length === 0 ? 'attachedChar' : `attachedChar${model.attachedChars.length + 1}`;
    const relative = path.relative(path.dirname(stageFilename), target.fsPath).replace(/\\/g, '/');
    const next = setSectionEntry(parsed, info.line, key, relative);
    transactionalWrite(fs, stageFilename, next, mutationOptions(stageFilename, 'stage-attached-character'));
    vscode.window.showInformationMessage(`Added ${key} = ${relative}`);
  } else if (add === 'Open ZSS') await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(directory, `${stem}.zss`))), { preview: false });
}

function registerStageWorkspace(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.stage.openWorkspace', openStageWorkspace),
    vscode.commands.registerCommand('ikemen.stage.createInteraction', createStageInteraction),
    vscode.commands.registerCommand('ikemen.stage.launchRig', launchStageRig),
    vscode.window.registerWebviewPanelSerializer('ikemenStageWorkspace', { async deserializeWebviewPanel(panel, state) {
      if (!state || !state.filename || !fs.existsSync(state.filename)) { panel.dispose(); return; }
      try { await populate(panel, state.filename); } catch (error) { panel.dispose(); vscode.window.showErrorMessage(`Could not restore stage workspace: ${error.message}`); }
    } })
  );
}

module.exports = { registerStageWorkspace, openStageWorkspace, createStageInteraction, stagePayload, stageHtml, stageSpriteHandoff, resolveAsset, gameRoot };
