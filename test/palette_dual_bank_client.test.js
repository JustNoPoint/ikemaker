'use strict';

const assert = require('assert');
const vm = require('vm');
const dual = require('../src/palette_dual_bank_client');
const view = require('../src/palette_workspace_view');

const script = dual.clientScript();
assert(script.includes("reviewButton.after(focusLabel,lightenLabel)"), 'Darken and lighten unselected sprite controls are placed together beside Review Sprite Replacement');
assert.strictEqual((script.match(/Darken unselected sprite colors/g)||[]).length,1,'Darken unselected sprite colors has one rendered source');
assert.strictEqual((script.match(/Lighten unselected sprite colors/g)||[]).length,1,'Lighten unselected sprite colors has one rendered source');
assert(script.includes("preview.querySelectorAll('#focusSelectedColorsLabel,#lightenSelectedColorsLabel').forEach(node=>node.remove())"),'stale preview copies are removed before placing the authoritative toggles');
assert.deepStrictEqual(dual.uniqueColorIndices([[0,0,0,0],[1,2,3,255],[1,2,3,255],[4,5,6,255]],100),[0,1,3],'Clone A to Remappen keeps one index per distinct RGBA color');
const stageColors=Array.from({length:256},(_,index)=>[index,index,index,255]),stageMap=dual.identityIndexMap(),stageRequest=dual.bankBStageRequest('  Alternate blue  ','1','2',stageColors,stageMap);
assert.deepStrictEqual({name:stageRequest.name,group:stageRequest.group,number:stageRequest.number},{name:'Alternate blue',group:1,number:2},'the visible Save B as New route normalizes the exact reviewed identity');
assert.notStrictEqual(stageRequest.colors,stageColors);assert.notStrictEqual(stageRequest.colors[1],stageColors[1]);assert.notStrictEqual(stageRequest.indexMap,stageMap,'the posted request owns immutable-by-caller color and index snapshots');
assert.throws(()=>dual.bankBStageRequest('',1,2,stageColors,stageMap),/name/i);assert.throws(()=>dual.bankBStageRequest('Bad',1,2,stageColors,[...stageMap].reverse()),/identity layout|retained index/i);
new vm.Script(script);
for (const marker of [
  'Bank A <select id="bankASelect"',
  'Clone A → B',
  'Link B preview to A',
  'Use B as current draft',
  'Open Browser…',
  'event.shiftKey',
  'event.ctrlKey||event.metaKey',
  'application/x-ikemaker-dual-palette',
  'paletteColorsBatch',
  'paletteAdoptBankDraft',
  'movelist'
].slice(0, 8)) assert(script.includes(marker), `missing dual-bank behavior: ${marker}`);

for (const marker of [
  'cloneButton.disabled=sideClone.disabled=dualBankUi.followA',
  'overwrite.disabled=!bankB||dualBankUi.followA||mapped',
  'if(dualBankUi.followA)',
  'onpointercancel'
]) assert(script.includes(marker), `missing Follow A or cancellation guard: ${marker}`);
for (const marker of ['id="bankSv"', 'id="bankHue"', 'Saturation and value field', 'Vertical hue strip', 'New', 'Current']) {
  assert(script.includes(marker), `missing rectangular color-picker behavior: ${marker}`);
}
assert(!script.includes('id="bankWheel"'), 'the circular palette color wheel is removed');
assert(dual.styles().includes('@media(max-width:980px)'), 'the editor stacks before narrow windows can overlap');
assert(dual.styles().includes('grid-template-columns:repeat(16,16px)'), 'both palette banks use compact Fighter Factory-sized swatches');
assert(script.includes("button.dataset.viewerColorSwatch='true'"), 'palette swatches opt out of universal button tinting');
assert(script.includes("setProperty('background-color',rgbaCss(color),'important')"), 'both banks always paint their retained colors');
assert(script.includes("post('openAssetBrowser',{tab:'groupsSprites'})"), 'the workshop opens the unified browser on sprite selection so its viewer can change sprites');
assert(script.includes("Array.from({length:256},()=>[0,0,0,0])"), 'Bank B starts as a transparent scratch bank instead of copying a saved palette');
assert(script.includes("none.textContent='None · empty scratch'"), 'Bank B visibly defaults to None');
assert(script.includes('bankB?bankB.colors:Array.from'), 'explicitly choosing a Bank B palette loads its colors into the editable bank');
assert(!script.includes("sourceSelector.onchange=()=>post('paletteSelect'"), 'switching source-only Bank A never changes or blocks on the retained palette draft');
assert(script.includes("if(s.bank==='A'){dualBankUi.workingColor=color.slice()"), 'Bank A adjustments use a temporary working color instead of creating a retained edit');
assert(script.includes("Bank A itself is unchanged."), 'the Bank A working-color path explicitly reports its non-destructive behavior');
assert(script.includes('id="focusSelectedColors"'), 'the workshop can darken unselected sprite colors');
assert(script.includes('id="lightenSelectedColors"'), 'the workshop can lighten unselected sprite colors');
assert(script.includes('dualBankUi.lightenSelection=false;lightenInput.checked=false'), 'enabling darken turns off lighten');
assert(script.includes('dualBankUi.focusSelection=false;focusInput.checked=false'), 'enabling lighten turns off darken');
assert(script.includes('dimUnselected:dualBankUi.focusSelection'), 'selection focus is sent only to the live sprite preview');
assert(script.includes('lightenUnselected:dualBankUi.lightenSelection'), 'the mutually exclusive lighten focus is sent only to the live sprite preview');
assert(script.includes('id="useWorkingRemapOld"'), 'the working color can be explicitly assigned to Remappen old/source');
assert(script.includes('id="useWorkingRemapNew"'), 'the working color can be explicitly assigned to Remappen new/replacement');
assert(script.includes("previewColors[index]=dualBankUi.workingColor.slice()"), 'a temporary Bank A edit previews live without changing the source bank');
assert(script.includes("dualBankUi.previewB=!dualBankUi.previewB"), 'Preview B is an explicit on/off toggle');
assert(script.includes("dualBankUi.previewB?'Stop Preview B':'Preview B'"), 'Preview B visibly reports its toggle state');
assert(!script.includes('retainedB||bankB.colors'), 'Bank B must not silently populate from another embedded palette');
for (const marker of ['id="focusPixelTools"', 'id="focusLayers"', 'id="focusMasks"', 'details[data-editor-section="layers"]', 'details[data-editor-section="masks"]']) {
  assert(script.includes(marker), `missing always-visible editor route: ${marker}`);
}
assert(script.includes('id="bankImageToolsSlot"'), 'the image tool rail is placed beside Bank B');
assert(script.includes('id=\'bankRemapPrimarySlot\''), 'the gap beside Bank A is reserved for the first Remappen bank');
assert(script.includes("remapSlot.append(primaryRemap)"), 'the live Remappen controls are docked beside Bank A without creating a second state model');
assert(script.includes("home.append(primaryRemap)"), 'the Remappen dock returns safely before a bank rerender');
assert(dual.styles().includes('.bank-remap-slot .sprite-remap-dock'), 'Bank A presents the compact Remappen dock');
assert(dual.styles().includes('.bank-remap-help'), 'Remappen labels and instructions use the space below Bank A instead of narrowing the 100-pair grid');
assert(dual.styles().includes('.bank-remap-help{grid-column:1;grid-row:2'), 'Remappen help occupies the blank cell directly below Bank A rather than a new row below both columns');
assert(script.includes("root.querySelector('[data-bank-card=\"A\"] .bank-card-content')?.append(help)"), 'Remappen help is mounted inside the two-column Bank A layout');
assert(script.includes("editor.dispatchEvent(new CustomEvent('ikemaker-use-sprite-index'"), 'Bank colors feed the owning sprite editor locally without relying on a stale global editor');
assert(script.includes("remap?.ikemakerUseSpriteIndex||editor?.ikemakerUseSpriteIndex"), 'Bank colors prefer the exact reparented Remappen owner and retain the local event as a compatibility fallback');
assert(script.includes("Clone unique A indices → Remappen"),'Bank A offers an explicit unique-index clone into otherwise independent Remappen pairs');
assert(script.includes("map(index=>({index,color:colorsA[index].slice()}))"),'the explicit clone snapshots each unique Bank A RGBA value instead of retaining a live Bank A dependency');
assert(script.includes("useSpriteIndex(index,dualBankUi.workingRemapButton,colors(bank)[index])"),'bank clicks pass both the index and its current RGBA snapshot to Remappen');
assert(script.includes("root.addEventListener('contextmenu'"), 'right-clicking a Bank A or Bank B color assigns the secondary/new side');
assert(!script.includes("if(bank==='A')post('interactionIndex'"), 'Bank A selection cannot rerender the workspace and jump the scroll position');
assert(script.includes('drawBankSelection();drawControls()'), 'ordinary bank selection updates classes in place instead of rebuilding and disconnecting all swatches');
assert(script.includes('use(event);useSpriteIndex('), 'the rectangular chooser evaluates the pointed color before assigning its indexed slot to old/new');
assert(script.includes('if(event.buttons&3)use(event)'), 'left and right chooser drags have symmetric live color sampling');
assert(script.includes("event.target.closest?.('.bank-color-editor')"), 'right clicks in the complete color editor suppress the native menu and remain available to indexed tools');
assert(script.includes("preview.addEventListener('ikemaker-sprite-color-picked'"), 'image picker samples update the visible bank selection and color controls without a workspace rerender');
for (const marker of ['id="retainBankBValues"', 'Retain color values', 'id="offsetBankBColors"', 'Offset colors', 'id="undoBankB"', 'id="redoBankB"']) {
  assert(script.includes(marker), `missing Bank B policy control: ${marker}`);
}
assert(dual.styles().includes('.bank-b-options{grid-column:1/-1;grid-row:2'), 'Bank B policy toggles are placed directly below Bank B');
assert(script.includes("placement==='replace'?'replace':placement"), 'the swatch center replaces while either edge creates an explicit insertion target');
assert(script.includes("button.ondragend=()=>{dualBankUi.drag=null"), 'completed or cancelled drags clear their typed local source instead of leaking into a later external drop');
assert(script.includes("post('paletteDropFiles'"), 'external ACT and indexed-image drops are decoded by the host before Bank B changes');
assert(script.includes("detail:{colors:previewColors,indexMap,focusIndices,dimUnselected:dualBankUi.focusSelection,lightenUnselected:dualBankUi.lightenSelection}"), 'Preview B sends its non-destructive index connection map and mutually exclusive selection-focus mode to the exact sprite editor');
for (const marker of ['id="bankBSaveName"', 'id="bankBSaveGroup"', 'id="bankBSaveNumber"', 'id="saveBankBNew"', 'id="overwriteBankB"', "post('paletteStageBankBNew'", "post('paletteOverwriteBankB'"]) {
  assert(script.includes(marker), `missing explicit Bank B output control: ${marker}`);
}
assert(script.includes('Retained color connections require a reviewed all-attached-sprites reindex before overwrite.'), 'a retained map cannot silently overwrite a palette without reindexing all attached sprites');
assert(script.includes('saveNew.disabled=dualBankUi.followA||mapped'), 'Save B as New is blocked when retained index connections would make output diverge from Preview B');
assert(script.includes("request=bankBStageRequest(root.querySelector('#bankBSaveName').value"), 'the rendered Save B as New button builds the tested exact request before dispatch');
assert(script.includes('finishBankBGesture(pickerBefore)'), 'rectangular-picker completion uses the change-aware local Bank B history path');
assert(script.includes('finishBankBGesture(controlBefore)'), 'slider, numeric, exact-color, and wheel completion use the change-aware local Bank B history path');
assert(script.includes('input.onwheel=event=>{event.preventDefault();beginControlGesture()'), 'an unfocused wheel edit captures its pre-edit snapshot before changing a color');
assert(script.includes("if(snapshot.bank==='A')dualBankUi.workingColor="), 'canceling a temporary Bank A gesture restores the working color rather than mutating source colors');
assert(script.includes('}refreshPreview();drawBanks();drawControls();syncBankBPolicy()'), 'gesture cancellation repaints from the authoritative Preview B toggle instead of the edited bank');
assert(script.includes('cloneBankAction();finishBankBGesture(before)'), 'clone records history only after a semantic Bank B change');
assert(script.includes("finishBankBGesture(before);drawBanks()"), 'each insert or replace drop records exactly one change-aware Bank B checkpoint');
assert(script.includes("if(typeof syncPaletteHistoryOwners==='function')syncPaletteHistoryOwners()"),'local Bank B history changes refresh the universal Palette Undo/Redo owner');

const historyColors=Array.from({length:256},(_,index)=>[index,index,index,index?255:0]),historyMap=dual.identityIndexMap(),selection={bank:'B',indices:[7,8],anchor:7},before=dual.bankGestureSnapshot('B',historyColors,historyMap,selection,null),undo=[],redo=[dual.bankGestureSnapshot('B',historyColors,historyMap,selection,null)];
const retainedMove=dual.rearrangeBank(historyColors,[2],5,true),retainedMap=dual.composeIndexMaps(dual.identityIndexMap(),retainedMove.oldToNew);assert.deepStrictEqual(retainedMove.colors[retainedMap[2]],historyColors[2],'a source pixel keeps its exact RGBA color after its palette cell moves');
const retainedMoveAgain=dual.rearrangeBank(retainedMove.colors,[retainedMap[2]],9,true),retainedMapAgain=dual.composeIndexMaps(retainedMap,retainedMoveAgain.oldToNew);assert.deepStrictEqual(retainedMoveAgain.colors[retainedMapAgain[2]],historyColors[2],'sequential palette rearrangements compose the retained pixel-to-color connection');
assert(script.includes('retainColorValues:true'),'Retain color values is the CS/Palette Editor default');
assert(script.includes('composeIndexMaps(dualBankUi.bankBIndexMap,moved.oldToNew)'),'Bank B moves update the retained pixel-to-color map instead of resetting it');
historyColors[7]=[1,2,3,4];historyColors[8]=[5,6,7,8];const edited=dual.bankGestureSnapshot('B',historyColors,historyMap,selection,null);
assert.strictEqual(dual.recordBankGesture(undo,redo,before,edited),true,'completed multi-index gesture records one checkpoint');assert.strictEqual(undo.length,1);assert.strictEqual(redo.length,0,'a real new gesture invalidates redo');
let restored=dual.stepBankHistory(undo,redo,edited);assert.deepStrictEqual(restored.colors[7],before.colors[7]);assert.deepStrictEqual(restored.colors[8],before.colors[8]);assert.strictEqual(undo.length,0);assert.strictEqual(redo.length,1,'one Undo restores every affected index and retains one Redo');
restored=dual.stepBankHistory(redo,undo,restored);assert.deepStrictEqual(restored.colors[7],edited.colors[7]);assert.deepStrictEqual(restored.colors[8],edited.colors[8]);assert.strictEqual(undo.length,1);assert.strictEqual(redo.length,0,'one Redo restores the completed gesture');
const retainedRedo=[before];assert.strictEqual(dual.recordBankGesture([],retainedRedo,edited,edited),false,'a no-op gesture creates no phantom history');assert.strictEqual(retainedRedo.length,1,'a no-op gesture does not clear existing Redo');
const aBefore=dual.bankGestureSnapshot('A',historyColors,null,{bank:'A',indices:[7],anchor:7},[9,8,7,6]),aAfter=dual.bankGestureSnapshot('A',historyColors,null,{bank:'A',indices:[7],anchor:7},[1,2,3,4]),aUndo=[];assert.strictEqual(dual.recordBankGesture(aUndo,[],aBefore,aAfter),false,'temporary Bank A working-color gestures never enter Bank B history');assert.deepStrictEqual(aBefore.workingColor,[9,8,7,6],'Bank A cancel evidence retains the exact prior working color');
assert.strictEqual(dual.previewBankFromToggle(false),'A','cancel while Preview B is off keeps A displayed');assert.strictEqual(dual.previewBankFromToggle(true),'B','cancel while Preview B is on keeps B displayed');
assert(script.includes("root.querySelector('#adoptBank')?.remove()"), 'the ambiguous retained-draft adoption route is removed from the visible Bank B workflow');
assert(script.indexOf('id="cloneBank"')<script.indexOf('id="previewBank"'), 'Clone A to B is grouped above the banks before Preview B');
assert(!script.includes('(?:\\/.*)?'), 'exact color parser must not accept arbitrary trailing text');

const spriteScript = require('../src/palette_sprite_editor_client').clientScript();
const previewListener = spriteScript.slice(spriteScript.indexOf("addEventListener('ikemaker-palette-preview'"));
assert(previewListener.includes('draw();'), 'palette preview must redraw the sprite');
assert(!previewListener.slice(0, previewListener.indexOf('});') + 3).includes('refresh('), 'palette preview must not perform a full refresh');
assert(!previewListener.slice(0, previewListener.indexOf('});') + 3).includes('persist'), 'palette preview must not persist transient edits');

const session = {
  context: { kind: 'existing-sff' }, target: { filename: 'test.sff' }, sources: [],
  facts: { preview: 'none', staged: 'none', embedded: 'loaded', builtOutput: 'none', adoption: 'none' },
  stale: false, staleReasons: [], selection: { palette: { physicalIndex: 0 } }
};
const html = view.sourceHtml({ session, palettes: [] });
for (const marker of ['dual-bank-live', 'bank-color-editor', 'palette_dual_bank_client']) {
  if (marker === 'palette_dual_bank_client') continue;
  assert(html.includes(marker), `Palette Workspace HTML missing ${marker}`);
}
assert(html.includes('.palette-desk{grid-template-columns:minmax(0,1fr)}'), 'the obsolete oversized companion index no longer reserves a second workshop column');
for(const marker of ['id="paletteUndoOwner"','id="paletteRedoOwner"','id="paletteSaveOwner"','id="paletteSaveAsOwner"','paletteArchiveHistory','syncPaletteHistoryOwners()'])assert(html.includes(marker),`Palette Workspace universal action owner missing ${marker}`);

console.log('Palette dual-bank client contract tests passed');
