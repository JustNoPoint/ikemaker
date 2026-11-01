'use strict';

const assert = require('assert');
const path = require('path');
const { characterFolder, characterLabel, characterKey, reusableViewColumn, sourceColumnFor, matchingPeer, rememberCodeFile, registerCharacterPanel, addCharacterPanelOwner, characterPanelOwners, matchingCharacterPanels, sharedCharacterPanels, restoredUnownedCharacterPanels, releaseCharacterPanelOwner, hasCharacterPanel } = require('../src/character_view_policy');

const asset = path.join('C:', 'game', 'chars', 'Ryu', 'files', 'Anim.air');
assert.strictEqual(characterFolder(asset), path.join('C:', 'game', 'chars', 'Ryu'));
assert.strictEqual(characterLabel(asset), 'Ryu');
assert.strictEqual(characterKey(asset), path.join('C:', 'game', 'chars', 'Ryu').toLowerCase());
assert.strictEqual(characterKey(path.join('C:', 'game', 'data', 'common1.cns')), '');
assert.strictEqual(characterKey(path.join('C:', 'game', 'chars', 'template', 'shared.zss')), '');
assert.strictEqual(reusableViewColumn([{ panel: { viewColumn: 3 } }], 2), 3);
assert.strictEqual(reusableViewColumn([], 2), 2);
assert.strictEqual(sourceColumnFor(3, -2), 2);
assert.strictEqual(sourceColumnFor(1, -2), -2);
const ryuAir = { characterKey: 'ryu', kind: 'air', panel: { viewColumn: 3 } };
const gokuSff = { characterKey: 'goku', kind: 'sff', panel: { viewColumn: 2 } };
const ryuSff = { characterKey: 'ryu', kind: 'sff', panel: { viewColumn: 2 } };
assert.strictEqual(matchingPeer([ryuAir, gokuSff, ryuSff], ryuAir, gokuSff), ryuSff);
assert.strictEqual(rememberCodeFile(path.join('C:', 'game', 'chars', 'Ryu', 'states.zss'), 2), true);
assert.strictEqual(rememberCodeFile(path.join('C:', 'game', 'data', 'common1.cns'), 2), false);

const disposeListeners=[];
const templatePanel={active:false,onDidChangeViewState(){return{dispose(){}}},onDidDispose(listener){disposeListeners.push(listener);return{dispose(){}}}};
const templateAsset=path.join('C:','game','chars','template','Ryu.sff');
registerCharacterPanel(templatePanel,templateAsset,'sff');
const templateContext={type:'character',key:path.join('C:','game','chars','template').toLowerCase(),root:path.join('C:','game','chars','template'),files:[templateAsset]};
assert.strictEqual(matchingCharacterPanels(templateContext)[0].panel,templatePanel,'reserved character-folder viewers remain exactly discoverable for workbench close');
assert.strictEqual(hasCharacterPanel(templatePanel),true);
for(const listener of disposeListeners)listener();
assert.strictEqual(hasCharacterPanel(templatePanel),false);

const ownerRyu=path.join('C:','game','chars','Ryu','Ryu.def'),ownerKen=path.join('C:','game','chars','Ken','Ken.def'),sharedAsset=path.join('C:','game','chars','template','sf6commonspr.sff');
const ownerChanges=[];
const ownedPanel={active:true,onDidChangeViewState(){return{dispose(){}}},onDidDispose(){return{dispose(){}}}};
registerCharacterPanel(ownedPanel,sharedAsset,'sff',undefined,{ownerDef:ownerRyu,onOwnersChanged:owners=>ownerChanges.push([...owners])});
const ryuContext={type:'character',key:path.dirname(ownerRyu).toLowerCase(),root:path.dirname(ownerRyu),ownerDef:ownerRyu,files:[ownerRyu]};
assert.strictEqual(matchingCharacterPanels(ryuContext)[0].panel,ownedPanel,'a shared-template SFF opened by Ryu closes through explicit session provenance even when the DEF does not reference it');
addCharacterPanelOwner(ownedPanel,ownerKen);
assert.deepStrictEqual(characterPanelOwners(ownedPanel).map(value=>value.toLowerCase()).sort(),[ownerKen,ownerRyu].map(value=>path.resolve(value).toLowerCase()).sort());
assert.deepStrictEqual(ownerChanges.at(-1).map(value=>value.toLowerCase()).sort(),[ownerKen,ownerRyu].map(value=>path.resolve(value).toLowerCase()).sort(),'adding a second owner publishes the complete persisted owner set');
assert.strictEqual(matchingCharacterPanels(ryuContext).length,0,'a viewer shared by Ryu and Ken is not destroyed when only Ryu closes');
assert.strictEqual(sharedCharacterPanels(ryuContext)[0].panel,ownedPanel);
releaseCharacterPanelOwner(ryuContext);
assert.deepStrictEqual(ownerChanges.at(-1).map(value=>value.toLowerCase()),[path.resolve(ownerKen).toLowerCase()],'releasing Ryu publishes Ken as the sole persisted owner before restart');
const kenContext={...ryuContext,key:path.dirname(ownerKen).toLowerCase(),root:path.dirname(ownerKen),ownerDef:ownerKen,files:[ownerKen]};
assert.strictEqual(matchingCharacterPanels(kenContext)[0].panel,ownedPanel,'the final remaining session owner may close the shared viewer');
const standalone={active:false,onDidChangeViewState(){return{dispose(){}}},onDidDispose(){return{dispose(){}}}};
registerCharacterPanel(standalone,sharedAsset,'sff',undefined,{standalone:true});
assert(!matchingCharacterPanels({...ryuContext,files:[ownerRyu,sharedAsset]}).some(entry=>entry.panel===standalone),'the same shared SFF opened standalone is retained even when the character references it');
const legacy={active:true,onDidChangeViewState(){return{dispose(){}}},onDidDispose(){return{dispose(){}}}};
registerCharacterPanel(legacy,sharedAsset,'sff',undefined,{restoredUnowned:true});
assert(restoredUnownedCharacterPanels().some(entry=>entry.panel===legacy),'restored legacy viewers are discoverable for the one-time explicit close choice');
assert(!matchingCharacterPanels({...ryuContext,files:[ownerRyu,sharedAsset]}).some(entry=>entry.panel===legacy),'a connected legacy viewer remains unowned when the user keeps it open');
const inactiveLegacy={active:false,onDidChangeViewState(){return{dispose(){}}},onDidDispose(){return{dispose(){}}}};
registerCharacterPanel(inactiveLegacy,sharedAsset,'sff',undefined,{restoredUnowned:true});
assert(!matchingCharacterPanels({...ryuContext,files:[ownerRyu,sharedAsset]}).some(entry=>entry.panel===inactiveLegacy),'an inactive legacy viewer is never adopted or closed implicitly');
addCharacterPanelOwner(legacy,ownerRyu);
assert(matchingCharacterPanels(ryuContext).some(entry=>entry.panel===legacy),'the explicit Close-with-owner choice clears legacy state and makes the viewer closeable');

for(const kind of ['air','snd']){
  const changes=[],panel={active:false,onDidChangeViewState(){return{dispose(){}}},onDidDispose(){return{dispose(){}}}};
  registerCharacterPanel(panel,sharedAsset,kind,undefined,{ownerDefs:[ownerRyu],onOwnersChanged:owners=>changes.push([...owners])});
  addCharacterPanelOwner(panel,ownerKen);
  assert.deepStrictEqual(characterPanelOwners(panel).map(value=>value.toLowerCase()).sort(),[ownerRyu,ownerKen].map(value=>path.resolve(value).toLowerCase()).sort(),`${kind.toUpperCase()} reuse records the second exact character owner`);
  assert.strictEqual(matchingCharacterPanels(ryuContext).some(entry=>entry.panel===panel),false,`${kind.toUpperCase()} remains open while another character still owns it`);
  releaseCharacterPanelOwner(ryuContext);
  assert.deepStrictEqual(changes.at(-1).map(value=>value.toLowerCase()),[path.resolve(ownerKen).toLowerCase()],`${kind.toUpperCase()} publishes the surviving owner for restart persistence`);
  const restored={active:false,onDidChangeViewState(){return{dispose(){}}},onDidDispose(){return{dispose(){}}}};
  registerCharacterPanel(restored,sharedAsset,kind,undefined,{ownerDefs:changes.at(-1)});
  assert(matchingCharacterPanels(kenContext).some(entry=>entry.panel===restored),`${kind.toUpperCase()} restored with its persisted final owner closes with that owner`);
}

console.log('Character viewer tab-group policy tests passed');
