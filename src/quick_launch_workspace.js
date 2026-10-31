"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vscode = require("vscode");
const model = require("./quick_launch_presets");

const STORAGE_KEY = "ikemen.quickLaunchPresets.v1";
let extensionContext = null;
let active = null;

function initialize(context) {
  extensionContext = context;
}
function rootKey(root) {
  return path.resolve(root).replace(/\\/g, "/").toLowerCase();
}
function readRoot(root) {
  const all = extensionContext?.workspaceState?.get(STORAGE_KEY, {}) || {},
    saved = all[rootKey(root)] || {};
  return {
    presets: Array.isArray(saved.presets)
      ? saved.presets
          .slice(0, 80)
          .map((item) => model.normalizePreset(item, item.mode))
      : [],
    last: saved.last || {},
  };
}
async function writeRoot(root, value) {
  const all = extensionContext?.workspaceState?.get(STORAGE_KEY, {}) || {};
  all[rootKey(root)] = {
    presets: value.presets
      .slice(0, 80)
      .map((item) => model.normalizePreset(item, item.mode)),
    last: value.last || {},
  };
  await extensionContext.workspaceState.update(STORAGE_KEY, all);
}
function files(root, folder) {
  const base = path.join(root, folder),
    result = [];
  if (!fs.existsSync(base)) return result;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".def"))
        result.push(path.relative(root, full).replace(/\\/g, "/"));
    }
  };
  visit(base);
  return result.sort((a, b) => a.localeCompare(b));
}
function nonce() {
  return crypto.randomBytes(18).toString("base64");
}
function musicUris(panel, root, presets) {
  const values = {}, prefix = path.resolve(root) + path.sep;
  for (const preset of presets || []) {
    const relative = model.normalizeRelative(preset.music), full = relative && path.resolve(root, relative);
    if (full && full.toLowerCase().startsWith(prefix.toLowerCase()) && fs.existsSync(full)) values[relative] = panel.webview.asWebviewUri(vscode.Uri.file(full)).toString();
  }
  return values;
}
function html(panel, state) {
  const n = nonce(),
    safe = (value) => JSON.stringify(value).replace(/</g, "\\u003c"),
    musicState = { ...state, musicUris: musicUris(panel, state.root, state.presets) };
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${panel.webview.cspSource}; media-src ${panel.webview.cspSource}; connect-src ${panel.webview.cspSource}; script-src 'nonce-${n}'"><style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:10px;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:12px var(--vscode-font-family)}button,input,select{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);min-height:26px;padding:4px 6px}button{background:var(--vscode-button-secondaryBackground);cursor:pointer}button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}.top,.presetbar,.actions,.compact-actions{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.top{position:sticky;top:-10px;z-index:3;margin:-10px -10px 9px;padding:8px 10px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}.top b{margin-right:auto}.mode[aria-pressed=true]{outline:2px solid var(--vscode-focusBorder)}.presetbar{margin-bottom:8px}.presetbar select{flex:1;min-width:120px}.icon{width:28px;padding:0}.field{display:grid;grid-template-columns:72px minmax(130px,1fr) auto;gap:5px;align-items:center;margin:6px 0}.field input,.field select{width:100%}.field small{grid-column:2/-1;color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}.music-note{color:var(--vscode-descriptionForeground);font-size:11px}.card{padding:8px;border:1px solid var(--vscode-panel-border);margin:8px 0}.card h2{font-size:12px;margin:0 0 7px}.advanced{margin-top:9px;border-top:1px solid var(--vscode-panel-border);padding-top:7px}.advanced summary{cursor:pointer;font-weight:700}.side{margin:8px 0;padding:7px;background:var(--vscode-sideBar-background)}.sidehead{display:grid;grid-template-columns:1fr 95px 58px;gap:5px;align-items:center}.members{display:grid;gap:6px;margin-top:7px}.member{display:grid;grid-template-columns:22px minmax(120px,1fr) repeat(3,minmax(48px,64px));gap:4px;align-items:center}.member input{width:100%;min-width:0}.member .wide{grid-column:2/-1}.runtime{display:grid;grid-template-columns:repeat(3,minmax(70px,1fr));gap:6px}.runtime label{display:grid;gap:2px}.summary{padding:7px;margin:8px 0;background:var(--vscode-textBlockQuote-background)}.status{min-height:18px;color:var(--vscode-descriptionForeground)}.status.error{color:var(--vscode-errorForeground)}.actions{position:sticky;bottom:-10px;margin:8px -10px -10px;padding:8px 10px;border-top:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}.actions .primary{margin-left:auto}@media(max-width:430px){.field{grid-template-columns:62px minmax(90px,1fr) auto}.member{grid-template-columns:22px minmax(90px,1fr) repeat(2,minmax(42px,55px))}.member [data-guard]{grid-column:2}.runtime{grid-template-columns:1fr}.top b{width:100%}}@media(forced-colors:active){.mode[aria-pressed=true]{outline:2px solid Highlight}}
</style></head><body><header class="top"><b>Match Setup</b><button class="mode" data-mode="versus">Quick VS</button><button class="mode" data-mode="training">Training</button></header><div class="presetbar"><select id="preset" aria-label="Saved match preset"></select><button class="icon" id="save" title="Save preset">▣</button><button class="icon" id="clone" title="Clone preset">⧉</button><button class="icon" id="rename" title="Rename preset">✎</button><button class="icon" id="remove" title="Delete preset">×</button></div><section class="card"><h2>Match</h2><div class="field"><label for="p1">Player 1</label><input id="p1" list="characters" placeholder="chars/name/name.def"><span class="compact-actions"><button class="icon" data-current title="Use current character">●</button><button class="icon" data-browse="p1" title="Browse character DEF">…</button></span><small id="p1path"></small></div><div class="field"><label for="p2">Opponent</label><input id="p2" list="characters" placeholder="chars/name/name.def"><span class="compact-actions"><button class="icon" data-mirror title="Mirror Player 1">⇉</button><button class="icon" data-browse="p2" title="Browse character DEF">…</button></span><small id="p2path"></small></div><div class="field"><label for="stage">Stage</label><input id="stage" list="stages" placeholder="stages/name.def"><span class="compact-actions"><button class="icon" data-roster title="Open Roster Manager / select-screen editor">▦</button><button class="icon" data-browse="stage" title="Browse stage DEF">…</button></span><small id="stagepath"></small></div><div class="field"><label for="music">Test music</label><input id="music" placeholder="Use character or stage music"><span class="compact-actions"><button class="icon" id="audition" title="Play or pause selected music">▶</button><button class="icon" data-browse="music" title="Browse game music">…</button><button class="icon" id="clearMusic" title="Use normal character/stage music">×</button></span><small id="musicpath" class="music-note"></small></div><div class="compact-actions"><button id="swap">⇄ Swap fighters</button><button id="roster">Open Select Screen Editor…</button></div></section><details class="advanced"><summary>Advanced match options</summary><p>Quick VS and Training use the same team and player options. Empty overrides use the game defaults.</p><div id="sides"></div><section class="side"><h2>Match rules</h2><div class="runtime"><label>Time<input id="time" type="number" min="-1" max="9999"></label><label>Rounds<input id="rounds" type="number" min="-1" max="99"></label><label>Draws<input id="draws" type="number" min="-1" max="99"></label></div><p><code>-1</code> keeps the infinite Quick VS / Training default.</p><pre id="args"></pre></section></details><datalist id="characters"></datalist><datalist id="stages"></datalist><audio id="audio" hidden></audio><div class="summary" id="summary"></div><div class="status" id="status" role="status" aria-live="polite"></div><footer class="actions"><button id="close">Close</button><button class="primary" id="run">Run this setup</button></footer><script nonce="${n}">
(()=>{'use strict';const vscode=acquireVsCodeApi(),boot=${safe(state)},$=id=>document.getElementById(id);let mode=boot.mode,presets=boot.presets,current=null;const clone=value=>JSON.parse(JSON.stringify(value));for(const value of boot.characters){const o=document.createElement('option');o.value=value;$('characters').append(o)}for(const value of boot.stages){const o=document.createElement('option');o.value=value;$('stages').append(o)}const defaults=selectedMode=>({id:'new-'+Date.now().toString(36),name:selectedMode==='training'?'Training setup':'Quick VS setup',mode:selectedMode,stage:boot.defaultStage,p1:{teamMode:0,count:1,members:[{character:boot.currentCharacter}]},p2:{teamMode:0,count:1,members:[{character:boot.currentCharacter}]},time:-1,rounds:-1,draws:-1,runtime:{speed:1,windowed:false,noSound:false}});const member=(side,index,sideKey)=>{const entry=side.members[index]||{character:''},row=document.createElement('div');row.className='member';row.innerHTML='<b>'+(index+1)+'</b><input data-char placeholder="chars/name/name.def" list="characters"><input data-color type="number" min="1" max="256" placeholder="Pal" title="Palette / color"><input data-ai type="number" min="0" max="8" placeholder="AI"><input data-input type="number" min="0" max="8" placeholder="Input"><input class="wide" data-life type="number" placeholder="Life"><input data-lifemax type="number" placeholder="Max life"><input data-power type="number" placeholder="Power"><input data-dizzy type="number" placeholder="Dizzy"><input data-guard type="number" placeholder="Guard">';const bind=(selector,key)=>{const input=row.querySelector(selector);input.value=entry[key]??'';input.oninput=()=>{if(input.value==='')delete entry[key];else entry[key]=selector==='[data-char]'?input.value:Number(input.value);if(key==='character'&&index===0)$(sideKey).value=input.value;refreshText()}};bind('[data-char]','character');bind('[data-color]','color');bind('[data-ai]','ai');bind('[data-input]','input');bind('[data-life]','life');bind('[data-lifemax]','lifeMax');bind('[data-power]','power');bind('[data-dizzy]','dizzyPoints');bind('[data-guard]','guardPoints');return row};const renderSides=()=>{const host=$('sides');host.replaceChildren();for(const key of ['p1','p2']){const side=current[key],box=document.createElement('section');box.className='side';box.innerHTML='<div class="sidehead"><b>'+(key==='p1'?'Player 1 team':'Opponent team')+'</b><select data-mode aria-label="Team mode"><option value="0">Single</option><option value="1">Simul</option><option value="2">Turns</option><option value="3">Tag</option></select><input data-count aria-label="Team member count" type="number" min="1" max="8"></div><div class="members"></div>';const modeSelect=box.querySelector('[data-mode]'),count=box.querySelector('[data-count]'),members=box.querySelector('.members');modeSelect.value=side.teamMode;count.value=side.teamMode===0?1:side.count;count.disabled=side.teamMode===0;const rebuild=()=>{const wanted=side.teamMode===0?1:Math.max(2,Math.min(8,Number(count.value)||2));side.count=wanted;while(side.members.length<wanted)side.members.push(clone(side.members.at(-1)||{character:''}));side.members=side.members.slice(0,wanted);members.replaceChildren(...side.members.map((_,index)=>member(side,index,key)));syncPrimary();refreshText()};modeSelect.onchange=()=>{side.teamMode=Number(modeSelect.value);count.disabled=side.teamMode===0;count.value=side.teamMode===0?1:Math.max(2,Number(count.value)||2);rebuild()};count.onchange=rebuild;rebuild();host.append(box)}};const syncPrimary=()=>{$('p1').value=current.p1.members[0]?.character||'';$('p2').value=current.p2.members[0]?.character||'';$('stage').value=current.stage||'';$('time').value=current.time;$('rounds').value=current.rounds;$('draws').value=current.draws;for(const key of ['p1','p2','stage'])$(key+'path').textContent=$(key).value||'Not set'};const pull=()=>{current.mode=mode;current.p1.members[0].character=$('p1').value.trim();current.p2.members[0].character=$('p2').value.trim();current.stage=$('stage').value.trim();current.time=Number($('time').value);current.rounds=Number($('rounds').value);current.draws=Number($('draws').value)};const refreshText=()=>{pull();const p=value=>String(value||'').split('/').pop().replace(/\.def$/i,'')||'Not set',names=['Single','Simul','Turns','Tag'];$('summary').textContent=p(current.p1.members[0]?.character)+' vs '+p(current.p2.members[0]?.character)+' · '+(mode==='training'?'Training':'Quick VS')+' · '+p(current.stage)+' · '+names[current.p1.teamMode];$('args').textContent='Preview: '+(mode==='training'?'-loadmotif 1 -training 1':'-loadmotif')+' -time '+current.time+' -rounds '+current.rounds+' -draws '+current.draws+' … -s '+current.stage};const refreshFromPrimary=()=>{refreshText();renderSides()};const renderPresets=selected=>{const select=$('preset');select.replaceChildren();const filtered=presets.filter(item=>item.mode===mode);for(const item of filtered){const o=document.createElement('option');o.value=item.id;o.textContent=item.name;select.append(o)}const fresh=document.createElement('option');fresh.value='';fresh.textContent='+ New setup';select.append(fresh);const found=filtered.find(item=>item.id===selected)||filtered[0];select.value=found?.id||'';current=clone(found||defaults(mode));renderSides();syncPrimary();refreshText()};const setMode=value=>{mode=value;for(const button of document.querySelectorAll('[data-mode]'))if(button.classList.contains('mode'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));renderPresets(boot.last[mode])};for(const button of document.querySelectorAll('.mode'))button.onclick=()=>setMode(button.dataset.mode);$('preset').onchange=()=>renderPresets($('preset').value);for(const id of ['p1','p2','stage','time','rounds','draws'])$(id).oninput=refreshText;for(const id of ['p1','p2'])$(id).onchange=refreshFromPrimary;document.querySelector('[data-current]').onclick=()=>{$('p1').value=boot.currentCharacter;refreshFromPrimary()};document.querySelector('[data-mirror]').onclick=()=>{$('p2').value=$('p1').value;refreshFromPrimary()};$('swap').onclick=()=>{const a=$('p1').value;$('p1').value=$('p2').value;$('p2').value=a;refreshFromPrimary()};for(const button of document.querySelectorAll('[data-browse]'))button.onclick=()=>vscode.postMessage({type:'browse',target:button.dataset.browse});for(const button of document.querySelectorAll('[data-roster],#roster'))button.onclick=()=>vscode.postMessage({type:'openRoster'});$('save').onclick=()=>{pull();vscode.postMessage({type:'save',preset:current})};$('clone').onclick=()=>{pull();vscode.postMessage({type:'clone',preset:current})};$('rename').onclick=()=>{pull();vscode.postMessage({type:'rename',preset:current})};$('remove').onclick=()=>vscode.postMessage({type:'delete',id:current.id,mode});$('run').onclick=()=>{pull();vscode.postMessage({type:'run',preset:current})};$('close').onclick=()=>vscode.postMessage({type:'close'});addEventListener('message',event=>{const message=event.data;if(message.type==='state'){presets=message.presets;boot.last=message.last;renderPresets(message.selected);$('status').textContent=message.status||'';$('status').className='status'+(message.error?' error':'');return}if(message.type==='browseResult'){if(['p1','p2','stage'].includes(message.target)){$(message.target).value=message.value;refreshFromPrimary()}return}if(message.type==='status'){$('status').textContent=message.text;$('status').className='status'+(message.error?' error':'')}});setMode(mode)})();
</script><script nonce="${n}">
(()=>{'use strict';
  const boot=${safe(musicState)},$=id=>document.getElementById(id),audio=$('audio');
  let presets=boot.presets||[],sampleRate=0,source='';
  const details=document.createElement('details');details.className='advanced';details.innerHTML='<summary>Music loop test</summary><div class="runtime"><label>Volume<input id="musicVolume" type="number" min="0" max="100"></label><label>Loop start<input id="loopStart" type="number" min="0" step="1" title="IKEMEN sample position"></label><label>Loop end<input id="loopEnd" type="number" min="0" step="1" title="0 uses the file end"></label></div><div class="compact-actions"><button id="markStart">Set start at playhead</button><button id="markEnd">Set end at playhead</button><label><input id="previewLoop" type="checkbox" checked> Preview loop</label></div><p class="music-note">Loop points use audio samples, matching IKEMEN. Set them from the audition playhead or type an exact value.</p>';
  $('music').closest('.field').after(details);
  const stateFor=id=>presets.find(item=>item.id===id)||{};
  const syncAudition=()=>{const button=$('audition');button.disabled=!source;button.title=source?'Play or pause selected music':'Choose custom test music before auditioning.'};
  const render=()=>{const item=stateFor($('preset').value),test=item.musicTest||{};$('music').value=item.music||'';$('musicVolume').value=test.volume??100;$('loopStart').value=test.loopStart??0;$('loopEnd').value=test.loopEnd??0;source=boot.musicUris?.[item.music]||'';if(source)audio.src=source;else audio.removeAttribute('src');$('musicpath').textContent=item.music?'Custom launch override · '+item.music:'Game rules · stage music (Quick VS/Training does not enable opponent select.def music)';syncAudition()};
  const capture=()=>({music:$('music').value.trim(),musicTest:{volume:Number($('musicVolume').value)||0,loopStart:Math.max(0,Number($('loopStart').value)||0),loopEnd:Math.max(0,Number($('loopEnd').value)||0)}});
  document.addEventListener('click',event=>{if(['save','clone','rename','run'].includes(event.target?.id))document.dispatchEvent(new CustomEvent('ikemenMusicCapture',{detail:capture()}));},true);
  $('preset').addEventListener('change',render);$('musicVolume').addEventListener('input',()=>{audio.volume=Math.max(0,Math.min(1,(Number($('musicVolume').value)||0)/100))});$('clearMusic').onclick=()=>{$('music').value='';source='';audio.pause();audio.removeAttribute('src');$('audition').textContent='▶';$('musicpath').textContent='Game rules · stage music (Quick VS/Training does not enable opponent select.def music)';syncAudition()};
  $('audition').onclick=async()=>{if(!source){$('musicpath').textContent='Choose custom test music before auditioning.';syncAudition();return}$('audition').textContent=audio.paused?'❚❚':'▶';if(audio.paused){try{await audio.play()}catch(_){$('musicpath').textContent='Cannot audition this format here · it can still be tested in IKEMEN';$('audition').textContent='▶'}}else audio.pause()};
  audio.onpause=()=>{$('audition').textContent='▶'};audio.onplay=()=>{$('audition').textContent='❚❚'};audio.ontimeupdate=()=>{if(!sampleRate||!$('previewLoop').checked)return;const start=Number($('loopStart').value)||0,end=Number($('loopEnd').value)||0;if(end>start&&audio.currentTime*sampleRate>=end)audio.currentTime=start/sampleRate};
  const mark=id=>{if(!sampleRate){$('musicpath').textContent='Play the track once so its sample rate can be decoded.';return}$(id).value=Math.max(0,Math.round(audio.currentTime*sampleRate))};$('markStart').onclick=()=>mark('loopStart');$('markEnd').onclick=()=>mark('loopEnd');
  addEventListener('message',async event=>{const message=event.data;if(message.type==='state'){presets=message.presets||[];queueMicrotask(render)}if(message.type==='browseResult'&&message.target==='music'){source=message.uri||'';$('music').value=message.value||'';$('musicpath').textContent='Custom launch override · '+(message.value||'');if(source){audio.src=source;sampleRate=0;try{const context=new AudioContext(),bytes=await fetch(source).then(r=>r.arrayBuffer()),decoded=await context.decodeAudioData(bytes);sampleRate=decoded.sampleRate;await context.close()}catch(_){sampleRate=0}}syncAudition()}});render();
})();
</script></body></html>`;
  const bridge = `const ikemenAcquire=acquireVsCodeApi;let ikemenSharedApi,ikemenHostBusy=false;const ikemenBusyControls=()=>document.querySelectorAll('#save,#clone,#rename,#remove,#run,#close,[data-browse],[data-roster],#roster');const ikemenSetBusy=(value,text)=>{ikemenHostBusy=Boolean(value);for(const control of ikemenBusyControls()){if(ikemenHostBusy){if(!control.disabled)control.dataset.quickBusyDisabled='true';control.disabled=true;control.title='Wait for the current Match Setup action to finish.'}else if(control.dataset.quickBusyDisabled==='true'){delete control.dataset.quickBusyDisabled;control.disabled=false;if(control.title==='Wait for the current Match Setup action to finish.')control.removeAttribute('title')}}const status=document.getElementById('status');if(status&&text)status.textContent=text};addEventListener('message',event=>{if(event.data?.type==='quickLaunchBusy')ikemenSetBusy(event.data.busy,event.data.status)});globalThis.acquireVsCodeApi=()=>{if(ikemenSharedApi)return ikemenSharedApi;const raw=ikemenAcquire();ikemenSharedApi={getState:()=>raw.getState(),setState:value=>raw.setState(value),postMessage:message=>{if(ikemenHostBusy){const status=document.getElementById('status');if(status)status.textContent='Wait for the current Match Setup action to finish.';return false}if(message&&message.preset){const music=document.getElementById('music'),volume=document.getElementById('musicVolume'),start=document.getElementById('loopStart'),end=document.getElementById('loopEnd');message.preset.music=music?music.value.trim():'';message.preset.musicTest={volume:volume?Number(volume.value)||0:100,loopStart:start?Math.max(0,Number(start.value)||0):0,loopEnd:end?Math.max(0,Number(end.value)||0):0};}ikemenSetBusy(true,'Match Setup action in progress…');return raw.postMessage(message)}};return ikemenSharedApi};`;
  const outcomeBridge=bridge.replace("if(event.data?.type==='quickLaunchBusy')ikemenSetBusy(event.data.busy,event.data.status)","if(event.data?.type==='quickLaunchBusy'){const status=document.getElementById('status'),prior=status?.textContent||'';ikemenSetBusy(event.data.busy,event.data.status);if(!event.data.busy&&prior&&!/(in progress|^Wait)/i.test(prior)&&status)status.textContent=prior}");
  return page
    .replace('-loadmotif 1 -training 1', '-training 1')
    .replace('<header class="top"><b>Match Setup</b><button class="mode" data-mode="versus">Quick VS</button><button class="mode" data-mode="training">Training</button></header>','<header class="top"><b>Match Setup</b><span role="group" aria-label="Match mode"><button class="mode" data-mode="versus">Quick VS</button><button class="mode" data-mode="training">Training</button></span></header>')
    .replace('<button class="icon" id="audition" title="Play or pause selected music">▶</button>','<button class="icon" id="audition" title="Choose custom test music before auditioning" aria-label="Play or pause selected music" disabled>▶</button>')
    .replace('<div class="status" id="status" role="status" aria-live="polite"></div>','<div class="status" id="status" role="status" aria-live="polite">Match setup controls are ready.</div>')
    .replace("const bind=(selector,key)=>{const input=row.querySelector(selector);input.value=entry[key]??'';", "const bind=(selector,key)=>{const input=row.querySelector(selector),sideName=sideKey==='p1'?'Player 1':'Opponent',fieldName={character:'character',color:'palette',ai:'AI level',input:'input source',life:'life',lifeMax:'maximum life',power:'power',dizzyPoints:'dizzy points',guardPoints:'guard points'}[key]||key;input.setAttribute('aria-label',sideName+' member '+(index+1)+' '+fieldName);input.value=entry[key]??'';")
    .replace('count.disabled=side.teamMode===0;const rebuild=',"count.disabled=side.teamMode===0;count.title=count.disabled?'Single mode always has exactly one team member.':'Choose 2–8 team members.';const rebuild=")
    .replace('count.disabled=side.teamMode===0;count.value=',"count.disabled=side.teamMode===0;count.title=count.disabled?'Single mode always has exactly one team member.':'Choose 2–8 team members.';count.value=")
    .replace(`<script nonce="${n}">`, `<script nonce="${n}">${outcomeBridge}`);
}
function exact(message, keys) {
  return (
    message &&
    (Object.getPrototypeOf(message) === Object.prototype ||
      Object.getPrototypeOf(message) === null) &&
    Object.keys(message).sort().join("|") === keys.slice().sort().join("|")
  );
}
async function chooseDef(root, target) {
  const folder = target === "stage" ? "stages" : "chars",
    picked = await vscode.window.showOpenDialog({
      title: target === "stage" ? "Choose stage DEF" : "Choose character DEF",
      defaultUri: vscode.Uri.file(path.join(root, folder)),
      canSelectMany: false,
      filters: { "IKEMEN definitions": ["def"] },
    });
  if (!picked?.[0]) return "";
  const relative = path.relative(root, picked[0].fsPath).replace(/\\/g, "/");
  if (
    relative.startsWith("../") ||
    path.isAbsolute(relative) ||
    !relative.toLowerCase().startsWith(folder + "/")
  ) {
    vscode.window.showErrorMessage(
      `Choose a DEF inside this game’s ${folder} folder.`,
    );
    return "";
  }
  return relative;
}
async function chooseMusic(root) {
  const preferred = [path.join(root, "sound"), root].find((value) => fs.existsSync(value));
  const picked = await vscode.window.showOpenDialog({
    title: "Choose music to test",
    defaultUri: vscode.Uri.file(preferred),
    canSelectMany: false,
    filters: { "IKEMEN music": ["ogg", "mp3", "wav", "flac", "opus"] },
  });
  if (!picked?.[0]) return null;
  const relative = path.relative(root, picked[0].fsPath).replace(/\\/g, "/");
  if (relative.startsWith("../") || path.isAbsolute(relative)) {
    vscode.window.showErrorMessage("Choose music inside this IKEMEN game so the engine can load it reliably.");
    return null;
  }
  return { relative, uri: picked[0] };
}
function postState(owner, selected, status = "", error = false) {
  return owner.panel.webview.postMessage({
    type: "state",
    presets: owner.store.presets,
    last: owner.store.last,
    selected,
    status,
    error,
  });
}
async function handle(owner, message) {
  const isActive=()=>!owner.disposed&&(!owner.isActive||owner.isActive()),persist=owner.writeRoot||writeRoot,validate=owner.validatePreset||model.validatePreset;
  if(!isActive())return;
  if (exact(message, ["type"]) && message.type === "close")
    return owner.panel.dispose();
  if (exact(message, ["type"]) && message.type === "openRoster")
    return vscode.commands.executeCommand("ikemen.selectDef.openWorkspace");
  if (
    exact(message, ["type", "target"]) &&
    message.type === "browse" &&
    ["p1", "p2", "stage", "music"].includes(message.target)
  ) {
    if (message.target === "music") {
      const picked = await chooseMusic(owner.root);
      if (picked&&!owner.disposed) await owner.panel.webview.postMessage({ type: "browseResult", target: "music", value: picked.relative, uri: owner.panel.webview.asWebviewUri(picked.uri).toString() });
      return;
    }
    const value = await chooseDef(owner.root, message.target);
    if (value&&!owner.disposed)
      await owner.panel.webview.postMessage({
        type: "browseResult",
        target: message.target,
        value,
      });
    return;
  }
  if (exact(message, ["type", "id", "mode"]) && message.type === "delete") {
    const exists=owner.store.presets.some(item=>item.id===message.id);
    if(!exists)return owner.panel.webview.postMessage({type:'status',text:'This setup has not been saved yet, so there is no preset to delete.',error:true});
    owner.store.presets = owner.store.presets.filter(
      (item) => item.id !== message.id,
    );
    if (owner.store.last[message.mode] === message.id)
      delete owner.store.last[message.mode];
    await persist(owner.root, owner.store);
    if(!isActive())return;
    return postState(owner, "", "Preset deleted.");
  }
  if (
    !exact(message, ["type", "preset"]) ||
    !["save", "clone", "rename", "run"].includes(message.type)
  )
    return;
  let preset = model.normalizePreset(message.preset, message.preset?.mode);
  if (message.type === "run") {
    const validation = validate(preset, owner.root, fs.existsSync);
    if (!validation.ok)
      return owner.panel.webview.postMessage({
        type: "status",
        text: validation.errors.join(" "),
        error: true,
      });
    owner.store.last[preset.mode] = preset.id;
    await persist(owner.root, owner.store);
    if(!isActive())return;
    await owner.run(validation.preset);
    if(!isActive())return;
    return owner.panel.webview.postMessage({
      type: "status",
      text: `Launched ${model.summary(validation.preset)}.`,
      error: false,
    });
  }
  const title =
    message.type === "rename"
      ? "Rename match preset"
      : message.type === "clone"
        ? "Clone match preset"
        : owner.store.presets.some((item) => item.id === preset.id)
          ? ""
          : "Name match preset";
  if (title) {
    const name = await vscode.window.showInputBox({
      title,
      value: message.type === "clone" ? `${preset.name} copy` : preset.name,
      validateInput: (value) =>
        value.trim() ? undefined : "Enter a preset name.",
    });
    if (!name||owner.disposed) return;
    preset.name = name.trim();
  }
  if (message.type === "clone")
    preset.id = `preset-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const index = owner.store.presets.findIndex((item) => item.id === preset.id);
  if (index >= 0) owner.store.presets[index] = preset;
  else owner.store.presets.push(preset);
  owner.store.last[preset.mode] = preset.id;
  await persist(owner.root, owner.store);
  if(!isActive())return;
  return postState(
    owner,
    preset.id,
    message.type === "clone"
      ? "Preset cloned."
      : message.type === "rename"
        ? "Preset renamed."
        : "Preset saved.",
  );
}
async function open(options) {
  if (!extensionContext)
    throw new Error("Quick launch presets are not initialized.");
  const mode = options.mode === "training" ? "training" : "versus",
    root = path.resolve(options.root);
  if (active && !active.disposed && active.root === root) {
    active.mode = mode;
    active.panel.reveal(undefined, true);
    active.panel.webview.html = html(active.panel, {
      root,
      mode,
      presets: active.store.presets,
      last: active.store.last,
      characters: files(root, "chars"),
      stages: files(root, "stages"),
      currentCharacter: options.currentCharacter || "",
      defaultStage: options.defaultStage || "stages/stage0.def",
    });
    return active.panel;
  }
  if (active && !active.disposed) active.panel.dispose();
  const panel = vscode.window.createWebviewPanel(
    "ikemenQuickLaunch",
    "IKEMEN Match Setup",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(root)] },
  );
  require('./viewer_group').trackViewerPanel(panel);
  const owner = {
    panel,
    root,
    mode,
    store: readRoot(root),
    run: options.run,
    writeRoot,
    isActive:()=>active===owner&&!owner.disposed,
    disposed: false,
    pending: false,
  };
  active = owner;
  panel.webview.html = html(panel, {
    root,
    mode,
    presets: owner.store.presets,
    last: owner.store.last,
    characters: files(root, "chars"),
    stages: files(root, "stages"),
    currentCharacter: options.currentCharacter || "",
    defaultStage: options.defaultStage || "stages/stage0.def",
  });
  panel.webview.onDidReceiveMessage(
    async (message) => {
      if(owner.pending){await panel.webview.postMessage({type:'quickLaunchBusy',busy:true,status:'Wait for the current Match Setup action to finish.'});return;}
      owner.pending=true;await panel.webview.postMessage({type:'quickLaunchBusy',busy:true,status:'Match Setup action in progress…'});
      try{return await handle(owner,message)}catch(error){return panel.webview.postMessage({type:'status',text:error.message||String(error),error:true})}finally{owner.pending=false;if(!owner.disposed)await panel.webview.postMessage({type:'quickLaunchBusy',busy:false,status:'Match setup controls are ready.'})}
    },
    null,
    extensionContext.subscriptions,
  );
  panel.onDidDispose(() => {
    owner.disposed = true;
    if (active === owner) active = null;
  });
  return panel;
}

module.exports = { initialize, open, readRoot, writeRoot, html, handle, STORAGE_KEY };
