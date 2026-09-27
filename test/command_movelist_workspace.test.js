'use strict';

const assert = require('assert');
const Module = require('module');
const vm = require('vm');
const original = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return {};
  return original.call(this, request, parent, isMain);
};
const workspace = require('../src/command_movelist_workspace');
const { workspaceExperience } = require('../src/experience_model');
Module._load = original;

const data = {
  files: { defFile: 'Ryu.def', commandFile: 'Ryu.cmd', movelistFile: 'Ryu.dat', movelists: [] },
  defaults: { time: 15, stepTime: -1, autoGreater: 1, bufferTime: 1, bufferHitpause: 1, bufferPauseend: 1, bufferShared: 1 },
  commands: [
    { name: 'x', command: 'x', time: 1, stepTime: 1, diagnostics: [] },
    { name: 'fireball', command: 'D, DF, F, x', time: 15, stepTime: 10, diagnostics: [] }
  ],
  movelistText: 'First\r\nSecond\n', movelistEol: '\r\n', initialCommandIndex: 1, knownTimings: [], presets: [], insertableInputs: [],
  glyphCatalog: { state: 'ready', motif: 'data/system.def', archiveFile: 'data/glyphs.sff', baseFile: 'data/system.base.def', tokens: ['_QDF', '^P'], entries: [
    { token: '_QDF', label: 'Quarter circle forward', sprite: [2,0], state: 'ready', src: 'data:image/png;base64,AA==' },
    { token: '^P', label: 'Any punch', sprite: [3,0], state: 'unresolved', reason: 'Test sprite missing' }
  ] }
};
const output = workspace.enhanceCommandHtml(workspace.html(data));
assert(output.includes('Gameplay motions and sequences'));
assert(output.includes('Basic / raw inputs'));
assert(output.includes('hiddenCommands'));
assert(output.includes('commandSearch'));
assert(output.includes('+ Add Input Step'));
assert(output.includes('Insert Before'));
assert(output.includes('Move Left'));
assert(output.includes('L/R are absolute screen directions'));
assert(output.includes('Choose and preview'));
assert(output.includes('Apply preset definition set'));
assert(output.includes("type:'applyPresetDraft'"));
assert(output.includes("saveCurrentPreset.id='saveCurrentPreset'"));
assert(output.includes("type:'saveCustomPreset',id:'',text:block(values())"));
assert(output.includes('commandDrafts'));
assert(output.includes('presetDrafts'));
assert(output.includes('movelistDraft'));
assert(output.includes('Visual Editor'));
assert(output.includes('Append Glyph'));
assert(output.includes('Loaded compound motions remain one glyph'));
assert(output.includes('glyphCatalog'));
assert(output.includes("event.data.type==='customPresetsUpdated'"));
assert(output.includes("event.target!==event.currentTarget&&event.target.closest('input,textarea,select,button')"));
assert(output.includes('restoreCommandSelection()'));
assert(output.includes("commandDrafts.new=restoredUi.activeCommandDraft"));
assert(!output.includes('per-step timer'));
const script = output.match(/<script>([\s\S]*)<\/script>/)[1];
assert.doesNotThrow(() => new Function(script));

const keyHandlerSource=script.match(/addEventListener\('keydown',(event=>\{[^\n]+?\}),true\)/)[1];
const keyHandler=vm.runInNewContext('('+keyHandlerSource+')');let stopped=false,prevented=false;
keyHandler({target:{closest:selector=>selector.includes('input')?{}:null},currentTarget:{},stopPropagation:()=>{stopped=true;},preventDefault:()=>{prevented=true;},key:' '});
assert(stopped,'step-token keyboard input must not bubble into the card shortcut');assert(!prevented,'typing a space in a token input must keep its default editing behavior');

const focusHandlerSource=script.match(/addEventListener\('focusin',(event=>\{[^\n]+?\})\);/)[1];
const focusContext={selectedStep:0,document:{querySelectorAll:()=>[{classList:{toggle(){}}},{classList:{toggle(){}}},{classList:{toggle(){}}}]},byId:id=>focusContext.controls[id]||(focusContext.controls[id]={disabled:false}),controls:{},steps:()=>['D','DF','F'],storeCommandDraft(){},persistUi(){}};
const focusHandler=vm.runInNewContext('('+focusHandlerSource+')',focusContext);focusHandler({target:{closest:selector=>selector==='.stepToken'?{dataset:{index:'2'}}:null}});
assert.strictEqual(focusContext.selectedStep,2);assert.strictEqual(focusContext.controls.moveStepLeft.disabled,false);assert.strictEqual(focusContext.controls.moveStepRight.disabled,true);

const restoreLine=script.split(/\r?\n/).find(line=>line.includes('function restoreCommandSelection()'));
const newDraft={values:{name:'new_move',command:'D, DF, F, x'},selectedStep:3},newContext={restoredUi:{activeCommandKey:'new',activeCommandDraft:newDraft},commandDrafts:{},data:{commands:[{name:'x'}]},selected:0,selectedStep:0,orphanDraft:false,commandDraftKey:()=>''};
vm.runInNewContext(restoreLine+';restoreCommandSelection()',newContext);assert.strictEqual(newContext.selected,1,'new-command slot survives webview recreation');assert.deepStrictEqual(newContext.commandDrafts.new,newDraft);
const orphanDraft={values:{name:'old_move',command:'B, F, x'},selectedStep:1},orphanContext={restoredUi:{activeCommandKey:'existing:removed:0',activeCommandDraft:orphanDraft},commandDrafts:{},data:{commands:[{name:'replacement'}]},selected:0,selectedStep:0,orphanDraft:false,commandDraftKey:index=>'existing:replacement:'+index};
vm.runInNewContext(restoreLine+';restoreCommandSelection()',orphanContext);assert.strictEqual(orphanContext.selected,1);assert.strictEqual(orphanContext.orphanDraft,true);assert.deepStrictEqual(orphanContext.commandDrafts.new,orphanDraft,'changed-source draft is recovered instead of attached to the wrong command');

// Execute the generated webview startup and pool refresh together. A pool-only
// update must not replay startup restoration or change the form's Apply target.
function fakeElement(id,elements){const classes=new Set(id==='presetPanel'||id==='movelistWorkspace'?['hidden']:[]),listeners={};let value='';const element={id,innerHTML:'',textContent:'',disabled:false,dataset:{},scrollTop:0,selectionStart:0,selectionEnd:0,style:{setProperty(){}},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,force){const on=force===undefined?!classes.has(x):force;on?classes.add(x):classes.delete(x);return on;}},addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn)},focus(){},scrollIntoView(){},setAttribute(){},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end},querySelector(){return null},after(child){elements[child.id]=child}};Object.defineProperty(element,'value',{get:()=>value,set:next=>{value=id==='movelistEditor'?String(next).replace(/\r\n|\r/g,'\n'):String(next)}});return element}
const elements={},windowListeners={},sentMessages=[],savedStates=[];
const webviewDocument={getElementById(id){return elements[id]||(elements[id]=fakeElement(id,elements))},createElement(){return fakeElement('',elements)},querySelectorAll(){return[]},querySelector(){return null},addEventListener(){}};
const addWindowListener=(type,fn)=>{(windowListeners[type]||(windowListeners[type]=[])).push(fn)};
const webviewContext={document:webviewDocument,window:{addEventListener:addWindowListener,dispatchEvent(){}},addEventListener:addWindowListener,MessageEvent:class{constructor(type,options){this.type=type;this.data=options?.data}},acquireVsCodeApi:()=>({getState:()=>({}),setState:state=>savedStates.push(state),postMessage:message=>sentMessages.push(message)}),setTimeout:fn=>{fn();return 1},clearTimeout(){},requestAnimationFrame:fn=>fn(),console};webviewContext.globalThis=webviewContext;
vm.createContext(webviewContext);vm.runInContext(script,webviewContext);
assert.strictEqual(vm.runInContext('selected',webviewContext),1,'a direct CMD/INP caret entry starts on the resolved command rather than the first definition');
assert.strictEqual(vm.runInContext("editCommandSteps('D,\tDF , F','replace',1,'DB')",webviewContext),'D,\tDB , F','the generated client contains the complete narrow step-edit implementation');
assert(elements.chooseGlyphRoot,'the glyph preview exposes an explicit game-folder recovery route');elements.chooseGlyphRoot.onclick();assert.strictEqual(sentMessages.at(-1).type,'chooseGlyphRoot');
assert.strictEqual(elements.movelistEditor.value,'First\nSecond\n','the realistic textarea view normalizes CRLF while the authoritative draft remains separate');elements.glyphChoice.value='_QDF';elements.movelistVisualTab.onclick();elements.appendGlyph.onclick();elements.saveMovelist.onclick();const mixedApply=sentMessages.findLast(message=>message.type==='saveMovelist');assert.strictEqual(mixedApply.text,'First _QDF\r\nSecond\n','a visual edit preserves untouched mixed line endings and the trailing newline in the Apply payload');
vm.runInContext('selectCommand(1)',webviewContext);assert.strictEqual(elements.name.value,'fireball');
for(const listener of windowListeners.message||[])listener({data:{type:'customPresetsUpdated',presets:[{id:'custom:test',label:'Saved',kind:'native',category:'Custom',explanation:'Saved',custom:true,previewText:'[Command]'}]}});
assert.strictEqual(vm.runInContext('selected',webviewContext),1,'pool refresh preserves the current command selection');assert.strictEqual(elements.name.value,'fireball','pool refresh preserves the displayed command draft');
elements.applyCommand.onclick();const applied=sentMessages.findLast(message=>message.type==='saveCommand');assert.strictEqual(applied.index,1);assert.strictEqual(applied.values.name,'fireball','Apply still targets the command displayed after pool refresh');
elements.sequence.value='\t/D,~45$L ,  R+x,\t>F|DF  ';vm.runInContext('selectedStep=1',webviewContext);elements.inputChoice.value='B';elements.insertAfter.onclick();assert.strictEqual(elements.sequence.value,'\t/D,~45$L ,  B, R+x,\t>F|DF  ','the generated timeline client preserves custom spacing outside its inserted step');
vm.runInContext('selectCommand(data.commands.length)',webviewContext);elements.name.value='pending_custom';elements.name.oninput();for(const listener of windowListeners.message||[])listener({data:{type:'customPresetsUpdated',presets:[]}});assert.strictEqual(vm.runInContext('selected',webviewContext),2,'pool refresh preserves the pending new-command slot');assert.strictEqual(elements.name.value,'pending_custom','pool refresh preserves the pending new-command draft');
elements.movelistEditor.value='Text only';elements.movelistEditor.oninput();elements.movelistVisualTab.onclick();assert(elements.movelistSourcePane.classList.contains('hidden'),'visual tab hides only the source pane');assert(!elements.movelistVisualPane.classList.contains('hidden'),'visual tab opens inside the same movelist workspace');assert.strictEqual(elements.movelistEditor.value,'Text only','switching modes keeps one shared draft');elements.glyphChoice.value='_QDF';elements.appendGlyph.onclick();assert.strictEqual(elements.movelistEditor.value,'Text only _QDF','text-only lines support visual glyph insertion');elements.movelistSourceTab.onclick();assert.strictEqual(elements.movelistEditor.value,'Text only _QDF','returning to Source does not reload disk text');elements.saveMovelist.onclick();const movelistApply=sentMessages.findLast(message=>message.type==='saveMovelist');assert.strictEqual(movelistApply.text,'Text only _QDF','the visual edit reaches the existing explicit Apply path');assert(elements.movelistPreview.innerHTML.includes('data:image/png;base64,AA=='),'loaded glyphs render from their real image payload');
assert.strictEqual(vm.runInContext("glyphParts('_DOES_NOT_EXIST <tag attr=\\\"_QDF\\\"').filter(part=>part.kind==='glyph').length",webviewContext),0,'generated client preserves unknown glyph prefixes and unfinished markup');assert.deepStrictEqual(Array.from(vm.runInContext("glyphParts('_QDF').filter(part=>part.kind==='glyph').map(part=>part.token)",webviewContext)),['_QDF'],'generated client uses the same longest-token parser as the model');let restoredFocus=0;elements.movelistVisual.querySelector=()=>({focus(){restoredFocus++}});elements.movelistEditor.value='Move _QDF^P';elements.movelistEditor.oninput();elements.movelistVisualTab.onclick();elements.glyphRight.onclick();assert(restoredFocus>0,'moving a glyph restores keyboard focus to the replacement node');const afterMove=elements.movelistEditor.value;elements.removeGlyph.onclick();assert(restoredFocus>1,'keyboard focus restoration permits a continued remove action after rerender');assert.notStrictEqual(elements.movelistEditor.value,afterMove,'the continued focused operation edits the selected glyph');
elements.movelistSourceTab.onclick();elements.movelistEditor.value='_QDF';elements.movelistEditor.oninput();elements.movelistVisualTab.onclick();elements.glyphChoice.value='^P';elements.appendGlyph.onclick();assert.strictEqual(elements.movelistEditor.value,'_QDF^P','generated visual insertion may create adjacent loaded glyphs without adding or rewriting separators');assert(elements.movelistVisual.innerHTML.includes('data-glyph="0"')&&elements.movelistVisual.innerHTML.includes('data-glyph="1"'),'both adjacent glyphs remain rendered and selectable after insertion');elements.saveMovelist.onclick();const adjacentApply=sentMessages.findLast(message=>message.type==='saveMovelist');assert.strictEqual(adjacentApply.text,'_QDF^P','adjacent visual glyphs survive the explicit Apply payload exactly');
elements.movelistSourceTab.onclick();elements.movelistEditor.value='_UNKNOWN\nLater content remains visible';elements.movelistEditor.oninput();assert(elements.glyphWarningStatus.textContent.includes('possible engine glyph reference'),'unknown mapped-looking tokens produce a non-blocking engine advisory');elements.nextGlyphIssue.onclick();assert.strictEqual(elements.movelistEditor.selectionStart,0,'Next glyph warning navigates the Source subtab to the token');assert.strictEqual(elements.movelistEditor.value,'_UNKNOWN\nLater content remains visible','warning navigation never truncates or rewrites the draft');
assert(output.includes('Commands · Learning'));
assert(output.includes('<details open><summary><b>What am I editing?</b>'));
assert(output.includes('details class="task-recipes" open'));
assert(output.includes('Build the sequence step by step'));
assert(output.includes('class="guided-workflow"'));
assert(output.includes('[Next] Locate the character command and movelist files'));
assert(output.includes('data-workflow-action="anchor:timeline"'));
assert(output.includes("closest('[data-workflow-action]')"));
assert(!output.includes('Advanced shortcuts'));
const advanced = workspace.enhanceCommandHtml(workspace.html(data), workspaceExperience('commands', 'advanced'));
assert(advanced.includes('Commands · Advanced'));
assert(!advanced.includes('<details open><summary><b>What am I editing?</b>'));
assert(advanced.includes('details class="task-recipes"'));
assert(!advanced.includes('details class="task-recipes" open'));
assert(advanced.includes('class="guided-workflow"'));
assert(advanced.includes('Advanced shortcuts'));
assert(advanced.includes('data-workflow-action="control:applyCommand"'));

console.log('Command workspace organization tests passed');

// Source targets must follow the visible editor, even when both files exist.
const sourceData={files:{defFile:'owner.def',commandFile:'input.cmd',movelistFile:'moves.dat'},commands:[{startLine:4},{startLine:19}]};
assert.deepStrictEqual(workspace.sourceTarget(sourceData,{type:'openSource',tab:'command',index:1}),{filename:'input.cmd',line:19});
assert.deepStrictEqual(workspace.sourceTarget(sourceData,{type:'openSource',tab:'movelist',index:1}),{filename:'moves.dat',line:0});
assert.deepStrictEqual(workspace.sourceTarget(sourceData,{type:'openDef',tab:'movelist'}),{filename:'owner.def',line:0});
assert.equal(workspace.sourceTarget({...sourceData,files:{commandFile:'input.cmd'}},{type:'openSource',tab:'movelist'}).filename,undefined,'missing movelist must not open unrelated command source');
assert.equal(workspace.sourceTarget(sourceData,{type:'openSource',tab:'command',index:99}).line,0,'new command has no existing section');
const sent=[];
const sourceHandler=script.match(/byId\('openSource'\)\.onclick=([^;]+);/)[1];
const client={ikemenNavigationSelection:()=>({tab:'movelist',file:'moves.dat'}),activeTab:'movelist',selected:1,vscode:{postMessage:m=>sent.push(m)}};
vm.runInNewContext('('+sourceHandler+')()',client);
assert.equal(sent[0].tab,'movelist');assert.equal(sent[0].index,1);

assert.equal(sent[0].navigationSelection.file,'moves.dat','native source button carries the current history selection');
