'use strict';

const {
  MODES, TARGET_KINDS, SAFEGUARD_DEFINITIONS, SAFEGUARD_IDS, PRESETS,
  createShaderProject, setSafeguard, selectPreset, setTargetKind,
  safeguardConflicts, graphSafeguardConflicts, buildAiShaderBrief
} = require('./shader_workshop_model');
const { normalizeShaderPreview } = require('./shader_preview_model');
const { BY_ID:TRUSTED_EFFECTS } = require('./shader_effect_catalog');
const { classifySafeguards } = require('./shader_safeguard_policy');
const { protect } = require('./webview_policy');

const MESSAGE_TYPES=Object.freeze(['set-engine','set-mode','edit-graph','set-target','select-preset','set-safeguard','prepare-ai','set-parameter','set-code','select-preview-frame','escape']);
const MAX_AI_DESCRIPTION_BYTES=4096;

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function scriptJson(value){return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,char=>({ '<':'\\u003c','>':'\\u003e','&':'\\u0026','\u2028':'\\u2028','\u2029':'\\u2029' }[char]));}
function exactKeys(value,keys){if(!value||typeof value!=='object'||Array.isArray(value))return false;const actual=Object.keys(value).sort(),expected=[...keys].sort();return actual.length===expected.length&&actual.every((key,index)=>key===expected[index]);}
function boundedText(value,max){return typeof value==='string'&&Buffer.byteLength(value,'utf8')<=max?value:'';}
function enhancePreviewClient(page){
  return page
    .replace('let current=Number(slider.value),timer=null,pending=null;', 'let current=Number(slider.value),timer=null,pending=null,playing=false;')
    .replace("const stop=()=>{if(timer)clearTimeout(timer);timer=null;play.textContent='Play'}", "const stop=()=>{if(timer)clearTimeout(timer);timer=null;playing=false;play.textContent='Play'}")
    .replace("image.style.transform='translate('+value.x+'px,'+value.y+'px) scale('+value.scaleX+','+value.scaleY+') rotate('+value.angle+'deg)';", "const transform='translate('+value.x+'px,'+value.y+'px) scale('+value.scaleX+','+value.scaleY+') rotate('+value.angle+'deg)';image.style.transform=transform;const shaderCanvas=document.getElementById('shaderCanvas');if(shaderCanvas)shaderCanvas.style.transform=transform;")
    .replace("timer=setTimeout(()=>{if(show(current+1<frameCount?current+1:loopStart))schedule()}", "timer=setTimeout(()=>{timer=null;if(show(current+1<frameCount?current+1:loopStart))schedule()}")
    .replace("play.onclick=()=>{if(timer){stop();persist();return}play.textContent='Pause';schedule()}", "play.onclick=()=>{if(playing){stop();persist();return}playing=true;play.textContent='Pause';schedule()}")
    .replace("pending=null;show(requested)}})", "pending=null;show(requested);if(playing)schedule()}})");
}

function rememberWorkshopView(vscode, documentKey) {
  const read = () => vscode?.getState?.() || {};
  const before = read().shaderView;
  const description = document.getElementById('aiDescription');
  const variations = document.getElementById('variations');
  function remember() {
    const active = document.activeElement;
    const focusKey = active?.id ? {id:active.id} : active?.dataset.param ? {param:active.dataset.param} : null;
    vscode?.setState?.({...read(),shaderView:{documentKey,scroll:window.scrollY,focusKey,
      description:description.value,variations:variations.value}});
  }
  if(before?.documentKey===documentKey){
    description.value=before.description;
    variations.value=before.variations;
    requestAnimationFrame(()=>{
      if(before.focusKey?.id)document.getElementById(before.focusKey.id)?.focus({preventScroll:true});
      if(before.focusKey?.param)Array.from(document.querySelectorAll('[data-param]')).find(el=>el.dataset.param===before.focusKey.param)?.focus({preventScroll:true});
      window.scrollTo(0,before.scroll);
    });
  }
  document.addEventListener('input',remember);
  document.addEventListener('focusin',remember);
  window.addEventListener('scroll',remember,{passive:true});
}

class ShaderWorkshopSession{
  constructor(options={}){
    this.project=options.project?.schema==='ikemaker.shader-workshop/v1'?options.project:createShaderProject(options);
    this.aiDescription='';this.aiBrief=null;this.notice='';this.generation=0;
    this.preview=normalizeShaderPreview(options.preview||{});this.previewFrame=0;
  }
  snapshot(){return Object.freeze({project:this.project,aiDescription:this.aiDescription,aiBrief:this.aiBrief,notice:this.notice,preview:this.preview,previewFrame:this.previewFrame,generation:this.generation});}
  setPreview(value){this.preview=normalizeShaderPreview(value);this.previewFrame=0;this.notice='';this.generation+=1;return this.snapshot();}
  rememberPreviewFrame(frame){
    if(!Number.isInteger(frame)||!this.preview.frames.length)return false;
    this.previewFrame=Math.max(0,Math.min(this.preview.frames.length-1,frame));
    return this.snapshot();
  }
  handleMessage(message){
    if(!message||!MESSAGE_TYPES.includes(message.type)||message.generation!==this.generation)return false;
    if(message.type==='set-engine'){
      if(!exactKeys(message,['type','generation','engine'])||!['1.0','nightly'].includes(message.engine))return false;
      this.project=Object.freeze({...this.project,engine:message.engine});
      this.notice='';this.generation++;return this.snapshot();
    }
    if(message.type==='edit-graph'){
      const fields={add:['typeId'],remove:['id'],connect:['id','input','from'],value:['id','value']};
      if(this.project.mode!=='graph'||!Object.hasOwn(fields,message.op)||!exactKeys(message,['type','generation','op',...fields[message.op]]))return false;
      try{
        this.project=require('./shader_graph_editor').editGraph(this.project,{...message,type:message.typeId});
        this.notice='';
      }catch(error){this.notice=error.message;}
      this.generation++;return true;
    }
    if(message.type==='set-code') {
      if(!exactKeys(message,['type','generation','vertex','fragment']) || this.project.mode!=='code') return false;
      const {shaderText}=require('./shader_workshop_model');
      this.project={...this.project,code:{vertex:shaderText(message.vertex),fragment:shaderText(message.fragment)}};
      this.generation++;return true;
    }
    if(message.type==='set-parameter') {
      if(!exactKeys(message,['type','generation','id','value']) || this.project.mode!=='preset')return false;
      const effect=TRUSTED_EFFECTS.get(this.project.presetId),schema=effect?.parameters[message.id];
      if(!schema || !Object.hasOwn(effect.parameters,message.id))return false;
      const value=message.value;
      if(schema.kind==='color' ? !Array.isArray(value)||value.length!==4||!value.every(Number.isFinite) : !Number.isFinite(value))return false;
      const values=require('./shader_effect_catalog').normalizeParameters(effect,{...this.project.parameters[effect.id],[message.id]:value});
      this.project={...this.project,parameters:{...this.project.parameters,[effect.id]:values}};
      this.generation++;return true;
    }
    if(message.type==='set-mode'){
      if(!exactKeys(message,['type','generation','mode'])||!MODES.includes(message.mode))return false;
      this.project=message.mode==='graph' && !this.project.graph.nodes.length
        ? require('./shader_workshop_model').replaceGraph(this.project,require('./shader_graph').initialGraph())
        : Object.freeze({...this.project,mode:message.mode});this.notice='';this.generation+=1;return this.snapshot();
    }
    if(message.type==='set-target'){
      if(!exactKeys(message,['type','generation','targetKind'])||!TARGET_KINDS.includes(message.targetKind))return false;
      const previous=this.project.presetId;this.project=setTargetKind(this.project,message.targetKind);this.notice=previous!==this.project.presetId?'The previous preset did not support this target and was reset to Unmodified.':'';this.generation+=1;return this.snapshot();
    }
    if(message.type==='select-preset'){
      if(!exactKeys(message,['type','generation','presetId'])||!PRESETS.some(item=>item.id===message.presetId))return false;
      try{this.project=selectPreset(this.project,message.presetId);this.notice='';}catch(error){this.notice=error.message;}this.generation+=1;return this.snapshot();
    }
    if(message.type==='set-safeguard'){
      if(!exactKeys(message,['type','generation','id','enabled'])||!SAFEGUARD_IDS.includes(message.id)||typeof message.enabled!=='boolean')return false;
      this.project=setSafeguard(this.project,message.id,message.enabled);this.notice='';this.generation+=1;return this.snapshot();
    }
    if(message.type==='prepare-ai'){
      if(!exactKeys(message,['type','generation','description','variations']))return false;
      const description=boundedText(message.description,MAX_AI_DESCRIPTION_BYTES),variations=message.variations;
      if(!description.trim()||!Number.isInteger(variations)||variations<1||variations>3)return false;
      this.aiDescription=description;this.aiBrief=buildAiShaderBrief(this.project,description,{variations});this.notice='Proposal brief prepared. No AI service was contacted and no project files were included.';this.generation+=1;return this.snapshot();
    }
    if(message.type==='select-preview-frame'){
      if(!exactKeys(message,['type','generation','frame'])||!Number.isInteger(message.frame)||!this.preview.frames.length)return false;
      return this.rememberPreviewFrame(message.frame);
    }
    if(!exactKeys(message,['type','generation']))return false;
    if(this.aiBrief||this.aiDescription){this.aiBrief=null;this.aiDescription='';this.notice='';this.generation+=1;return this.snapshot();}
    return false;
  }
}

function renderShaderWorkshopHtml(state,options={}){
  const snapshot=state?.project?state:{project:createShaderProject(),generation:0,aiDescription:'',aiBrief:null,notice:'',preview:normalizeShaderPreview(),previewFrame:0},project=snapshot.project,generation=Number.isSafeInteger(snapshot.generation)?snapshot.generation:0;
  const preset=PRESETS.find(item=>item.id===project.presetId)||PRESETS[0],conflicts=project.mode==='preset' && project.target.kind!=='fullscreen'?safeguardConflicts(project):[],toolbarHtml=String(options.toolbarHtml||''),toolbarStyle=String(options.toolbarStyle||''),toolbarClient=String(options.toolbarClient||''),rendererScript=String(options.rendererScript||''),rendererError=String(options.rendererError||'');
  const engineSection = `<section aria-label="Shader engine compatibility"><label>Game version <select data-engine-target><option value="" disabled${project.engine?'':' selected'}>Choose engine</option><option value="1.0"${project.engine==='1.0'?' selected':''}>IKEMEN 1.0</option><option value="nightly"${project.engine==='nightly'?' selected':''}>Nightly</option></select></label>
    ${project.engine==='nightly' ? '<p>Nightly character exports use the sprite shader library. ShaderSet uses <code>name</code>. Explod and Projectile use <code>shader.name</code>.</p>' :
      '<h3>IKEMEN 1.0 shaders</h3><p>Character effects use a complete sprite fragment shader. Register it in the character DEF under <code>[Shaders]</code>. ShaderSet, Explod and Projectile use <code>shader</code>. The controller accepts up to 16 float parameters, <code>shaderparam.p0</code> through <code>shaderparam.p15</code>.</p>'}
    <p>Fullscreen effects use <code>[Video] ExternalShaders</code>. Imported shader code keeps its original syntax when you change the game version.</p></section>`;
  const targets=TARGET_KINDS.map(kind=>`<option value="${escapeHtml(kind)}"${project.target.kind===kind?' selected':''}>${escapeHtml(kind.replaceAll('-',' '))}</option>`).join('');
  const presets=PRESETS.map(item=>`<button class="preset${project.presetId===item.id?' active':''}" type="button" data-message="select-preset" data-preset-id="${escapeHtml(item.id)}"${item.targetKinds&&!item.targetKinds.includes(project.target.kind)?' disabled':''}><b>${escapeHtml(item.label)}${TRUSTED_EFFECTS.has(item.id)?'':' (design only)'}</b><span>${escapeHtml(item.description)}</span></button>`).join('');
  let graph=null,graphError='';
  if(project.mode==='graph')try{graph=require('./shader_graph').graphPlan(project);}catch(error){graphError=error.message;}
  const trustedEffect=project.mode==='graph'?graph?.effect:TRUSTED_EFFECTS.get(preset.id),policy=trustedEffect?classifySafeguards(project,trustedEffect):SAFEGUARD_DEFINITIONS.map(item=>({id:item.id,status:project.safeguards[item.id]?'blocked':'advisory',message:project.safeguards[item.id]?'This design-only effect cannot execute in the trusted renderer.':'Disabled by the user.'})),policyById=new Map(policy.map(item=>[item.id,item]));
  const safeguards=SAFEGUARD_DEFINITIONS.map(item=>{const state=policyById.get(item.id);return `<label class="safeguard" data-policy-status="${escapeHtml(state.status)}"><input type="checkbox" data-safeguard="${escapeHtml(item.id)}"${project.safeguards[item.id]?' checked':''}><span><b>${escapeHtml(item.label)} <em>${escapeHtml(state.status)}</em></b><small>${escapeHtml(item.description)}</small><small>${escapeHtml(state.message)}</small></span></label>`}).join('');
  const graphWarning=graphError || graph?.policy.filter(row=>row.status==='blocked').map(row=>row.label).join(', ');
  const conflictHtml=graphWarning?'<p role="status">Review graph: '+escapeHtml(graphWarning)+'</p>':project.mode==='code' ? '<p>Imported GLSL controls its own sampling, palette and alpha. Test its appearance in IKEMEN.</p>' : conflicts.length?`<section class="conflicts" aria-label="Safeguard conflicts"><h2>Review required</h2>${conflicts.map(item=>`<p><b>${escapeHtml(item.safeguardId)}</b> — ${escapeHtml(item.message)}</p>`).join('')}</section>`:'<p class="clear" role="status">The selected effect respects every enabled safeguard.</p>';
  const modes=MODES.map(mode=>`<button type="button" data-message="set-mode" data-mode="${mode}"  aria-pressed="${project.mode===mode}">${escapeHtml(mode==='ai'?'AI Assist':mode[0].toUpperCase()+mode.slice(1))}</button>`).join('');
  const brief=snapshot.aiBrief?`<div class="brief"><b>Private proposal brief ready</b> <button data-message="copy-brief">Copy proposal</button><p>${escapeHtml(snapshot.aiBrief.intent)}</p><small>${snapshot.aiBrief.variations} variation${snapshot.aiBrief.variations===1?'':'s'} · no pixels · no project files · safeguards host-owned</small></div>`:'';
  const preview=snapshot.preview?.schema==='ikemaker.shader-preview/v1'?snapshot.preview:normalizeShaderPreview(),previewIndex=Math.max(0,Math.min(preview.frames.length-1,Number(snapshot.previewFrame)||0)),frame=preview.frames[previewIndex];
  const nextPreviewIndex=preview.frames.length?(previewIndex+1<preview.frames.length?previewIndex+1:preview.loopStart):0,cachedPreviewIndices=new Set([previewIndex,nextPreviewIndex]);
  const previewFrames=scriptJson(preview.frames.map((item,index)=>({dataUri:cachedPreviewIndices.has(index)?item.dataUri:'',label:item.label,width:item.width,height:item.height,ticks:item.ticks,hold:item.hold,missing:item.missing,x:item.x,y:item.y,scaleX:item.scaleX,scaleY:item.scaleY,angle:item.angle})));
  const previewHtml=frame?`<div class="preview-stage"><canvas id="shaderCanvas" hidden aria-label="Trusted offline shader preview"></canvas><img id="previewImage" src="${frame.dataUri}" alt="${escapeHtml(frame.label)}"><div id="previewLabel" class="preview-label">${escapeHtml(frame.label)}</div></div><div id="shaderStatus" class="shader-status" role="status">${escapeHtml(rendererError||'Decoded source preview · no IKEMEN process')}</div><div class="preview-nav"><button id="previewPrevious" type="button" title="Previous preview frame" aria-label="Previous preview frame" data-ikm-action-icon="◀"><span data-ikm-action-label>Previous preview frame</span></button><input id="previewSlider" aria-label="Preview frame" type="range" min="0" max="${preview.frames.length-1}" value="${previewIndex}"><button id="previewNext" type="button" title="Next preview frame" aria-label="Next preview frame" data-ikm-action-icon="▶"><span data-ikm-action-label>Next preview frame</span></button><button id="previewPlay" type="button"${preview.frames.length<2?' disabled':''}>Play</button><span id="previewCount">${previewIndex+1} / ${preview.frames.length}</span></div><small>${project.target.kind==='fullscreen'?'Fullscreen sprite stand-in · ':''}Decoded ${escapeHtml(preview.sourceKind.toUpperCase())} source preview · ${project.mode==='code'?'imported shader runs in IKEMEN':rendererScript?'trusted offline effect':trustedEffect?'effect blocked or design-only':'design-only effect'} · no IKEMEN process</small>`:`<div class="preview-card"><b>No sprite or animation selected</b><p>${escapeHtml(preset.description)}</p><small>In the SFF viewer, use Sprites → Preview Selected Sprite in Shader Workshop. In AIR, use Animations → Preview Current Animation in Shader Workshop. Choose Fullscreen to export a supported preset for IKEMEN OpenGL.</small></div>`;
  const params=trustedEffect && project.mode==='preset' ? require('./shader_effect_catalog').normalizeParameters(trustedEffect,project.parameters[trustedEffect.id]):{};
  const parameterControls=Object.entries(params).map(([key,value])=>{
    const spec=trustedEffect.parameters[key];
    if(spec.kind==='color')return `<label>${escapeHtml(key)} <input type="color" data-param="${key}" value="#${value.slice(0,3).map(n=>Math.round(n*255).toString(16).padStart(2,'0')).join('')}"></label>`;
    return `<label>${escapeHtml(key)} <input type="number" data-param="${key}" step="${spec.integer||key==='pixelSize'?1:0.01}" min="${spec.min}" max="${spec.max}" value="${value}"></label>`;
  }).join(' ');
  const beforeAfter=frame && rendererScript ? '<button id="compareOriginal" type="button" aria-pressed="false">Show original</button>' : '';
  const codePanel=project.mode==='code' ? `<section><h2>Shader source</h2><label>Vertex<textarea id="vertexCode">${escapeHtml(project.code.vertex)}</textarea></label><label>Fragment<textarea id="fragmentCode">${escapeHtml(project.code.fragment)}</textarea></label><p>Imported source is previewed in IKEMEN. Apply edits before changing controls or exporting.</p><button id="applyCode">Apply source edits</button></section>`:'';
  const actions=[['import-source','Import shader files…'],['open-project','Open shader project…'],['save-project','Save shader project…'],['pick-sprite','Choose SFF sprite…'],['pick-action','Choose AIR action…'],['reset-preset','Unmodified preview']];
  if(frame)actions.push(['reload-source','Reload preview source']);
  const projectControls=actions.map(([id,label])=>`<button data-message="${id}">${label}</button>`).join('');
  const runtimeTarget=['fullscreen','sprite','animation','explod','projectile'].includes(project.target.kind);
  const exportable=runtimeTarget && (project.mode==='code' || project.mode==='graph' && graph && !graphWarning || project.mode==='preset' && trustedEffect && !policy.some(r=>r.status==='blocked') && !(project.target.kind==='fullscreen' && preset.id==='hit-flash'));
  const exportControls=exportable?`<button data-message="export-fullscreen">Export IKEMEN OpenGL shader…</button> <button data-message="export-vulkan">Export with Vulkan SPIR-V…</button>`:'<p>Export needs a supported target and executable preset or imported source. Review any blocked safeguards below. Hit Flash needs a character target.</p>';
  const page=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${toolbarStyle}:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px var(--vscode-font-family)}button,select,textarea,input{font:inherit}.top{position:sticky;top:0;z-index:2;padding:8px 12px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}.modes,.row,.preview-nav{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.modes button[aria-pressed="true"],.preset.active{outline:2px solid var(--vscode-focusBorder)}main{display:grid;grid-template-columns:minmax(220px,290px) minmax(320px,1fr) minmax(260px,360px);gap:10px;padding:10px}.panel{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);padding:10px;min-width:0}.panel h2{font-size:14px;margin:0 0 8px}.presets{display:grid;gap:6px;max-height:60vh;overflow:auto}.preset{text-align:left;display:grid;gap:3px;padding:7px;color:var(--vscode-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border)}.preset span,.safeguard small{color:var(--vscode-descriptionForeground)}.preview{min-height:280px;display:grid;place-items:center;gap:8px;padding:8px;background:repeating-conic-gradient(#252525 0 25%,#333 0 50%) 0/24px 24px;border:1px solid var(--vscode-panel-border)}.preview-card{max-width:80%;padding:20px;text-align:center;background:#121821dd;border:1px solid #477198}.preview-stage{position:relative;min-height:190px;width:100%;display:grid;place-items:center;overflow:hidden}.compare-original #shaderCanvas{display:none!important}.compare-original #previewImage{display:block!important;visibility:visible!important}.preview-stage img,.preview-stage canvas{max-width:100%;max-height:340px;object-fit:contain;image-rendering:pixelated;transform-origin:center}.preview-label{position:absolute;left:4px;bottom:4px;padding:3px 6px;background:#111c}.shader-status{max-width:100%;padding:3px 6px;background:#111c;color:var(--vscode-descriptionForeground)}.preview-nav{width:100%}.preview-nav input{min-width:100px;flex:1}.preview>small{background:#111c;padding:3px 6px}.safeguards{display:grid;gap:7px}.safeguard{display:flex;align-items:start;gap:7px}.safeguard span{display:grid;gap:2px}.conflicts{border-left:4px solid var(--vscode-inputValidation-warningBorder);padding:8px;background:var(--vscode-textBlockQuote-background)}.conflicts h2{margin:0}.clear{border-left:4px solid var(--vscode-testing-iconPassed);padding:8px}.panel textarea{width:100%;min-height:100px}.ai textarea{width:100%;min-height:95px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:7px}.brief{margin-top:8px;padding:8px;border:1px solid var(--vscode-focusBorder)}.notice{min-height:1.4em;color:var(--vscode-descriptionForeground)}button:focus-visible,select:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid var(--vscode-focusBorder)}@media(max-width:900px){main{grid-template-columns:1fr}.presets{max-height:none}}@media(forced-colors:active){.preset.active,.modes button[aria-pressed="true"]{outline:2px solid Highlight}}</style></head><body>${toolbarHtml}<div class="top"><div class="row"><b>Shader Workshop</b><label>Target <select id="target">${targets}</select></label><span>Engine-independent design mode</span></div>${engineSection}<div class="modes" aria-label="Workshop mode">${modes}</div><div class="row">${projectControls}</div><div class="notice" role="status">${escapeHtml(snapshot.notice||'No engine process or shader code is being executed.')}</div></div><main><section class="panel">${project.mode==='graph'?require('./shader_graph_editor').renderGraph(project):'<h2>Effect recipes</h2><div class="presets">'+presets+'</div>'}</section><section class="panel"><h2>${project.mode==='graph'?'Graph preview':escapeHtml(preset.label)}</h2><div class="row">${parameterControls}</div>${codePanel}<div class="preview">${previewHtml}${beforeAfter}</div>${project.target.kind==='fullscreen' && frame?'<small>Sprite stand-in. The game applies the effect to the complete frame.</small>':''}${exportControls}${conflictHtml}<section class="ai"><h2>Describe an effect</h2><textarea id="aiDescription" maxlength="4096" placeholder="Example: pulsing blue outline while charging">${escapeHtml(snapshot.aiDescription||'')}</textarea><div class="row"><label>Variations <select id="variations"><option>1</option><option>2</option><option selected>3</option></select></label><button id="prepareAi" type="button">Prepare AI Proposal</button></div>${brief}</section></section><aside class="panel"><h2>Output safeguards</h2><p data-ikm-help="Safeguard settings">Project defaults. Generation tools cannot change these switches.</p><div class="safeguards">${safeguards}</div></aside></main><script>(()=>{const vscode=typeof acquireVsCodeApi==='function'?acquireVsCodeApi():null,generation=${generation},frames=${previewFrames},frameCount=frames.length,loopStart=${preview.loopStart},send=message=>vscode?.postMessage({...message,generation});(${require('./shader_graph_editor').installGraphControls.toString()})(send);${toolbarClient}document.addEventListener('click',event=>{const target=event.target.closest('[data-message]');if(!target||target.disabled)return;const message={type:target.dataset.message};if(target.dataset.mode)message.mode=target.dataset.mode;if(target.dataset.presetId)message.presetId=target.dataset.presetId;send(message)});document.querySelectorAll('[data-safeguard]').forEach(input=>input.addEventListener('change',()=>send({type:'set-safeguard',id:input.dataset.safeguard,enabled:input.checked})));document.querySelector('[data-engine-target]').addEventListener('change',event=>send({type:'set-engine',engine:event.target.value}));document.getElementById('target').addEventListener('change',event=>send({type:'set-target',targetKind:event.target.value}));document.querySelectorAll('[data-param]').forEach(e=>e.onchange=()=>send({type:'set-parameter',id:e.dataset.param,value:e.type==='color'?[...e.value.slice(1).match(/../g).map(v=>parseInt(v,16)/255),1]:Number(e.value)}));const compare=document.getElementById('compareOriginal');if(compare)compare.onclick=()=>{const original=compare.getAttribute('aria-pressed')!=='true';compare.setAttribute('aria-pressed',String(original));compare.textContent=original?'Show effect':'Show original';document.querySelector('.preview-stage')?.classList.toggle('compare-original',original);};const apply=document.getElementById('applyCode');if(apply)for(const editor of document.querySelectorAll('#vertexCode,#fragmentCode'))editor.addEventListener('input',()=>{for(const control of document.querySelectorAll('button,input,select'))if(control!==apply)control.disabled=true;});if(apply)apply.onclick=()=>send({type:'set-code',vertex:document.getElementById('vertexCode').value,fragment:document.getElementById('fragmentCode').value});document.getElementById('prepareAi').addEventListener('click',()=>send({type:'prepare-ai',description:document.getElementById('aiDescription').value,variations:Number(document.getElementById('variations').value)}));const slider=document.getElementById('previewSlider'),image=document.getElementById('previewImage'),label=document.getElementById('previewLabel'),count=document.getElementById('previewCount'),play=document.getElementById('previewPlay');if(slider){let current=Number(slider.value),timer=null,pending=null;const stop=()=>{if(timer)clearTimeout(timer);timer=null;play.textContent='Play'},show=frame=>{current=(frame+frameCount)%frameCount;const value=frames[current];slider.value=String(current);label.textContent=value.label;count.textContent=(current+1)+' / '+frameCount;if(!value.dataUri){pending=current;send({type:'request-preview-frame',frame:current});return false}image.src=value.dataUri;image.alt=value.label;image.style.transform='translate('+value.x+'px,'+value.y+'px) scale('+value.scaleX+','+value.scaleY+') rotate('+value.angle+'deg)';globalThis.ikemakerShaderRenderFrame?.({...value,index:current});return true},persist=()=>send({type:'select-preview-frame',frame:current}),schedule=()=>{if(frames[current].hold){stop();return}timer=setTimeout(()=>{if(show(current+1<frameCount?current+1:loopStart))schedule()},Math.max(1,frames[current].ticks)*1000/60)};show(current);document.getElementById('previewPrevious').onclick=()=>{stop();if(show(current-1))persist()};document.getElementById('previewNext').onclick=()=>{stop();if(show(current+1))persist()};slider.oninput=()=>{stop();show(Number(slider.value))};slider.onchange=persist;play.onclick=()=>{if(timer){stop();persist();return}play.textContent='Pause';schedule()};addEventListener('message',event=>{const packet=event.data;if(packet?.type!=='shader.preview.packet'||packet.generation!==generation||!Array.isArray(packet.frames)||packet.frames.length<1||packet.frames.length>2)return;for(const value of packet.frames){if(!Number.isSafeInteger(value.index)||value.index<0||value.index>=frameCount||typeof value.dataUri!=='string'||!value.dataUri.startsWith('data:image/png;base64,'))continue;Object.assign(frames[value.index],value)}if(pending!==null&&frames[pending].dataUri){const requested=pending;pending=null;show(requested)}})}document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('target')?.disabled)send({type:'escape'})});(${rememberWorkshopView.toString()})(vscode,${scriptJson(options.documentKey||project.id)})})();</script>${rendererScript?`<script>${rendererScript}</script>`:''}</body></html>`;
  return protect(enhancePreviewClient(page),options.resourceSource||'');
}

function createShaderWorkshopSession(options){return new ShaderWorkshopSession(options);}
module.exports={MESSAGE_TYPES,MAX_AI_DESCRIPTION_BYTES,ShaderWorkshopSession,createShaderWorkshopSession,renderShaderWorkshopHtml};
