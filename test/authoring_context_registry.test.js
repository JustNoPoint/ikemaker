'use strict';

const assert = require('assert');
const path = require('path');
const registry = require('../src/authoring_context_registry');

function panel() {
  const disposeHandlers = [], viewHandlers = [];
  return {
    active: false,
    onDidDispose(handler) { disposeHandlers.push(handler); return { dispose() {} }; },
    onDidChangeViewState(handler) { viewHandlers.push(handler); return { dispose() {} }; },
    activate() { this.active = true; for (const handler of viewHandlers) handler({ webviewPanel: this }); },
    dispose() { for (const handler of disposeHandlers) handler(); }
  };
}

const root = path.join('C:', 'game', 'chars', 'Ryu'), visual = panel();
const registrySnapshots=[];const registrySubscription=registry.subscribeRegistry(snapshot=>registrySnapshots.push(snapshot));
const context = registry.registerAuthoringPanel(visual, { type: 'character', key: root, label: 'Ryu', root, files: [path.join(root, 'Ryu.def')] });
const rebound = registry.registerAuthoringPanel(visual, { type: 'character', key: root.toUpperCase(), label: 'Ryu', root, files: [path.join(root, 'Ryu.def'), path.join(root, 'Ryu.def')] });
assert.strictEqual(rebound, context, 're-registering a panel preserves the legacy entry identity');
assert.strictEqual(registry.openContexts().length, 1, 're-registering a panel does not duplicate its context');
const snapshot = registry.contextSnapshot(context);
assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.files));
assert.strictEqual(snapshot.identity, `character\0${registry.normalized(root)}`);
const lease = registry.acquireContextDraftLease(context, 'test');
assert(lease);
assert.strictEqual(registry.releaseContextDraftLease(context, {}), false);
assert.strictEqual(registry.releaseContextDraftLease(context, lease), true);
assert.strictEqual(registry.contextOwnsFile(context, path.join(root, 'states', 'normal.zss')), true);
assert.strictEqual(registry.contextOwnsFile(context, path.join('C:', 'game', 'chars', 'Goku', 'G.def')), false);
const source = panel(), states = path.join(root, 'states', 'normal.zss');
const sourceContext = registry.registerAuthoringPanel(source, { type: 'character', key: root, label: 'Ryu Source', root, files: [states], activeSurfaceId: 'code.structure' });
assert.strictEqual(registry.openContexts().length, 1, 'two panels share one canonical open context');
assert.deepStrictEqual(registry.contextSnapshot(context).files.map(registry.normalized).sort(), [path.join(root, 'Ryu.def'), states].map(registry.normalized).sort(), 'connected files are the union of panel contributions');
const sharedLease = registry.acquireContextDraftLease(context, 'air.viewer');
assert(sharedLease);
assert.strictEqual(registry.acquireContextDraftLease(sourceContext, 'code.structure'), null, 'a second viewer cannot acquire a competing draft lease');
registry.setContextSelection(context, { action: 400 });
assert.deepStrictEqual(sourceContext.selection, { action: 400 }, 'selection changes immediately reach every legacy panel entry');
assert.strictEqual(sourceContext.selectionRevision, context.selectionRevision);
visual.dispose();
assert.strictEqual(registry.contextSnapshot(sourceContext).draftLease.owner, 'air.viewer', 'disposing one panel preserves the shared model and lease');
assert.deepStrictEqual(sourceContext.files.map(registry.normalized), [registry.normalized(states)], 'disposing a panel removes only its connected-file contribution');
visual.activate();
source.activate();
assert.strictEqual(registry.currentContext().label, 'Ryu Source');
const finishClose = registry.beginContextClose(sourceContext);
assert.strictEqual(registry.isClosingFile(path.join(root, 'Anim.air')), true);
assert.strictEqual(registry.isClosingFile(path.join('C:', 'game', 'chars', 'Goku', 'Anim.air')), false);
finishClose();
assert.strictEqual(registry.isClosingFile(path.join(root, 'Anim.air')), false);
assert.strictEqual(registry.disposeContextPanels(sourceContext), 1);
assert.strictEqual(registry.openContexts().length, 0);
assert(registrySnapshots.some(items=>items.length===1)&&registrySnapshots.at(-1).length===0,'global registry observers receive bounded open-context lifecycle snapshots');

const sharedFolder=path.join('C:','game','chars','SharedSlot'),ownerA=path.join(sharedFolder,'A.def'),ownerB=path.join(sharedFolder,'B.def'),panelA=panel(),panelB=panel();
registry.registerAuthoringPanel(panelA,{type:'character',key:sharedFolder,label:'A',root:sharedFolder,ownerDef:ownerA,files:[ownerA]});
registry.registerAuthoringPanel(panelB,{type:'character',key:sharedFolder,label:'B',root:sharedFolder,ownerDef:ownerB,files:[ownerB]});
assert.strictEqual(registry.openContexts().filter(entry=>entry.root===sharedFolder).length,2,'same-folder DEF variants remain separate loaded entities');
assert.deepStrictEqual(registry.matchingPanels({type:'character',key:registry.normalized(sharedFolder),ownerDef:ownerA}).map(entry=>entry.panel),[panelA],'exact owner DEF prevents one character close from claiming another panel that shares the same folder key');
const ownerless=panel();registry.registerAuthoringPanel(ownerless,{type:'character',key:sharedFolder,label:'Legacy folder context',root:sharedFolder,files:[sharedFolder]});
assert(!registry.matchingPanels({type:'character',key:registry.normalized(sharedFolder),ownerDef:ownerA}).some(entry=>entry.panel===ownerless),'an ownerless legacy context cannot be claimed by an exact same-folder DEF variant');
const finishOwnerClose=registry.beginContextClose({type:'character',key:registry.normalized(sharedFolder),root:sharedFolder,ownerDef:ownerA,files:[ownerA]});
assert.strictEqual(registry.isClosingOwner(ownerA),true,'the exact closing character owner is visible to lazy viewer restorers');
assert.strictEqual(registry.isClosingOwner(ownerB),false,'a different character owner remains open even when it shares the same folder');
finishOwnerClose();assert.strictEqual(registry.isClosingOwner(ownerA),false);
panelA.dispose();panelB.dispose();ownerless.dispose();

console.log('Authoring context registry tests passed');

// The native editor header participates in coding context without becoming a
// visual viewer that reservation enforcement would move out of its own group.
const viewerGroups=require('../src/viewer_group');
const header=panel();header.viewColumn=1;let headerMoves=0;header.reveal=()=>{headerMoves++;};
viewerGroups.reserveViewerColumns('header-regression',[1,2]);
const headerContext={type:'character',key:root,root,files:[states]};
registry.registerAuthoringPanel(header,headerContext,{visualViewer:false});
registry.registerAuthoringPanel(header,headerContext,{visualViewer:false});
viewerGroups.relocateReservedViewerPanels();
assert(!viewerGroups.trackedPanels().includes(header),'context binding must not register the header as an asset viewer');
assert.strictEqual(headerMoves,0,'rebinding after source tabs load cannot relocate the header');
assert(registry.openContexts().length>0,'header retains its shared coding context');
header.dispose();viewerGroups.releaseViewerColumns('header-regression');
registrySubscription.dispose();
