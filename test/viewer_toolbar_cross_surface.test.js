'use strict';
const assert = require('assert');
const Module = require('module');

const messages = [], notices = [], opens = [], executed = [];
const targetPanel = {
  webview: { postMessage(message) { messages.push(message); return true; } },
  onDidDispose(callback) { this.disposeCallback = callback; }
};
const vscode = {
  Uri: { file: fsPath => ({ fsPath }) },
  window: { showInformationMessage(message) { notices.push(message); } },
  commands: { async executeCommand(...args) { executed.push(args); } }
};
const navigation = { async openConnected(seed, target) { opens.push({ seed, target }); return targetPanel; } };
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './viewer_navigation' && /viewer_toolbar\.js$/.test(parent?.filename || '')) return navigation;
  return original.call(this, request, parent, main);
};

(async () => {
  const toolbar = require('../src/viewer_toolbar');
  const domainNames = ['Edit', 'View', 'Palettes', 'Sprites', 'Animations', 'Sounds', 'Review', 'Build', 'Stage', 'Screenpack', 'Tools', 'Help'];
  for (const surface of ['sff', 'air', 'snd']) {
    const menus=toolbar.menuDefinitions(surface);
    for(const name of domainNames)assert(menus.some(group=>group.label===name),`${surface} exposes canonical ${name}`);
    const commandItems=menus.flatMap(group=>group.items.filter(item=>item.command).map(item=>({group:group.label,item}))),byCommand=new Map();
    for(const entry of commandItems)byCommand.set(entry.item.command,[...(byCommand.get(entry.item.command)||[]),entry]);
    for(const [command,entries] of byCommand)if(entries.length>1){assert.strictEqual(entries.length,2,`${surface} ${command} has only one specialist route and one Build shortcut`);assert(entries.some(entry=>entry.group==='Build'&&entry.item.id.startsWith('shared.build.')),`${surface} duplicates ${command} only through the reviewed Build Create New/Open shortcuts`);}
  }
  const creatorMenus=toolbar.menuDefinitions('sff_creator'),creatorItems=creatorMenus.flatMap(group=>group.items).filter(item=>!item.separator);
  assert.strictEqual(creatorMenus.map(group=>group.label).join('|'),toolbar.menuDefinitions('sff').map(group=>group.label).join('|'),'SFF Creator keeps the canonical SFF menu order');
  assert(!creatorItems.some(item=>/^Save SFF/.test(item.label)),'SFF Creator does not imply direct SFF Viewer Save authority');
  for(const item of creatorItems.filter(item=>(item.element||item.selector||item.workflowAction)&&!item.id.startsWith('sff_creator.'))){const state=toolbar.resolveActionAvailability(item,{surface:'sff_creator',seed:'C:\\char\\ryu.sff',vscode,active:true});assert.strictEqual(state.enabled,false,`${item.label} is visibly disabled when its SFF Viewer control is absent`);assert.match(state.reason,/not available in SFF Creator/);}
  for(const id of ['sff_creator.element.buildV21','sff_creator.element.openWriterComparison','sff_creator.element.build','sff_creator.element.apply','sff_creator.element.exportPlan','sff_creator.element.importPlan','sff_creator.element.discard']){const item=creatorItems.find(entry=>entry.id===id);assert(item&&toolbar.resolveActionAvailability(item,{surface:'sff_creator',seed:'C:\\char\\ryu.sff',vscode,active:true}).enabled,`${id} remains routed to an existing Creator-owned body control`);}
  for (const surface of ['move_constants', 'stage', 'screenpack']) {
    const menus = toolbar.menuDefinitions(surface);
    for (const name of ['Stage', 'Screenpack']) assert(menus.some(group => group.label === name), `${surface} exposes ${name} as a core menu`);
    const remoteSound = menus.find(group => group.label === 'Sounds').items.find(item => item.label === 'Scan Character Sound References');
    assert.deepStrictEqual({ target: remoteSound.targetSurface, action: remoteSound.targetAction }, { target: 'snd', action: 'snd.element.scanReferences' }, `${surface} exposes the complete guarded SND catalog`);
  }
  for(const surface of ['sff','air','snd','code']){
    const menus=toolbar.menuDefinitions(surface),edit=menus.find(item=>item.label==='Edit');
    assert(edit.items.some(item=>item.label==='Open / Focus Text Editor…'&&item.action==='source'),`${surface} Edit keeps the direct Text Editor route easy to find`);
    for(const groupName of ['Build','Tools','More'])assert(!menus.find(item=>item.label===groupName).items.some(item=>item.label==='Open / Focus Text Editor…'),`${surface} ${groupName} does not duplicate the Text Editor route`);
    const build=menus.find(item=>item.label==='Build').items;
    assert(build.some(item=>item.id==='shared.build.create-heading'&&item.label==='Create New'),`${surface} Build starts with the agreed Create New section`);
    assert(build.some(item=>item.id==='shared.build.open-heading'&&item.label==='Open'),`${surface} Build retains the paired Open section`);
    for(const id of ['shared.build.create-sff','shared.build.create-air','shared.build.create-snd','shared.build.create-character','shared.build.create-stage','shared.build.create-screenpack','shared.build.create-storyboard','shared.build.create-palette','shared.build.create-master-palette','shared.build.open-sff','shared.build.open-air','shared.build.open-snd','shared.build.open-file','shared.build.open-character','shared.build.open-stage','shared.build.open-screenpack','shared.build.open-storyboard','shared.build.open-palette'])assert(build.some(item=>item.id===id),`${surface} Build missing reviewed duplicate-access route ${id}`);
  }

  const project = surface => toolbar.menuDefinitions(surface).find(group => group.label === 'Project').items.filter(item => !item.separator);
  assert(project('sff').some(item => item.label === 'New SFF…') && !project('sff').some(item => item.label === 'Save SFF') && project('sff').some(item => item.label === 'Save SFF As…'), 'SFF Project keeps Save in the shared header and exposes only the distinct clone route in the dropdown');
  assert(project('air').some(item => item.label === 'New AIR…') && project('air').some(item => item.label === 'Save AIR'), 'AIR Project actions name their mutation owner');
  assert(project('snd').some(item => item.label === 'New SND…') && project('snd').some(item => item.label === 'Save SND As…') && !project('snd').some(item => item.label === 'Save SND'), 'SND Project actions expose exact-copy Save As without implying unsupported in-place archive save');
  assert(!project('sff').some(item => /AIR|SND/.test(item.label)), 'Project deliberately does not route another asset Save from SFF');
  assert(!project('air').some(item => /SFF|SND/.test(item.label)), 'Project deliberately does not route another asset Save from AIR');
  for (const label of ['Add Sprites…','Advanced SFF Creator…','Two-SFF Assembly…']) {
    const item=toolbar.menuDefinitions('code').find(group=>group.label==='Sprites').items.find(entry=>entry.label===label);
    assert.strictEqual(toolbar.resolveActionAvailability(item,{surface:'code',seed:'C:\\char\\ryu.def',vscode,active:true}).enabled,true,`${label} opens directly from the text header`);
  }

  const remoteAnimation = toolbar.menuDefinitions('sff').find(group => group.label === 'Animations').items.find(item => item.label === 'New action…');
  assert.strictEqual(remoteAnimation.targetSurface, 'air');
  assert.strictEqual(remoteAnimation.targetAction, 'air.element.newAction');
  assert.strictEqual(toolbar.resolveActionAvailability(remoteAnimation,{surface:'sff',seed:'C:\\char\\ryu.sff',vscode,active:true}).enabled,true,'connected viewer actions are selectable when a source seed can be handed off');
  assert.strictEqual(toolbar.resolveActionAvailability(remoteAnimation,{surface:'sff',seed:'',vscode,active:true}).enabled,false,'connected viewer actions remain guarded without a source seed');
  assert(!remoteAnimation.element && !remoteAnimation.selector && !remoteAnimation.command, 'cross-viewer entries carry only a stable target action ID');
  const remoteFit = toolbar.menuDefinitions('air').find(group => group.label === 'View').items.find(item => item.label === 'Fit sprite');
  assert.deepStrictEqual({ target: remoteFit.targetSurface, action: remoteFit.targetAction }, { target: 'sff', action: 'sff.element.fit' }, 'foreign View controls use the same guarded handoff');
  const remoteSoundReview = toolbar.menuDefinitions('sff').find(group => group.label === 'Sounds').items.find(item => item.label === 'Scan Character Sound References');
  assert.deepStrictEqual({ target: remoteSoundReview.targetSurface, action: remoteSoundReview.targetAction }, { target: 'snd', action: 'snd.element.scanReferences' }, 'foreign Sounds controls use the same guarded handoff');
  const remoteSoundBuild = toolbar.menuDefinitions('air').find(group => group.label === 'Sounds').items.find(item => item.label === 'Create Reviewed SND Build Workspace…');
  assert.deepStrictEqual({ target: remoteSoundBuild.targetSurface, action: remoteSoundBuild.targetAction }, { target: 'snd', action: 'snd.element.createBuild' }, 'foreign SND build controls stay organized in Sounds and use the guarded handoff');
  const sharedTool = toolbar.menuDefinitions('snd').find(group => group.label === 'Tools').items.find(item => item.label === 'Controller Browser…');
  assert.strictEqual(sharedTool.command, 'zss.openControllers');assert(!sharedTool.targetSurface, 'registered commands shared by every viewer execute directly with the current seed');
  const remoteSffTool = toolbar.menuDefinitions('snd').find(group => group.label === 'Tools').items.find(item => item.label === 'Coder Build & Numbering Standard');
  assert.deepStrictEqual({ target: remoteSffTool.targetSurface, action: remoteSffTool.targetAction }, { target: 'sff', action: 'command.sff.showNamingStandard' }, 'surface-owned commands first resolve their owning asset viewer and seed');
  for (const surface of ['sff', 'air', 'snd']) for (const group of toolbar.menuDefinitions(surface).filter(item => domainNames.includes(item.label))) for (const item of group.items.filter(item => item.targetSurface)) assert(!item.element && !item.selector && !item.special && !item.command, `${surface} remote ${group.label} entry must expose only its stable target identity`);
  const html = toolbar.menuHtml('sff');
  assert(html.includes('<div class="viewer-menu-section" role="presentation">Create New</div>')&&html.includes('<div class="viewer-menu-section" role="presentation">Open</div>'),'Build category labels are presentation text, not disabled menu options');
  assert(!html.includes('data-toolbar-action-id="shared.build.create-heading"')&&!html.includes('data-toolbar-action-id="shared.build.open-heading"'),'Build headings never enter the clickable or disabled action catalog');
  assert(html.includes('data-toolbar-target-surface="air" data-toolbar-target-action="air.element.newAction"'));
  assert(toolbar.clientScript().includes('viewerToolbarInvokeAction'));
  assert(toolbar.clientScript().includes('ikemenCanLeaveAsset'));

  for(const surface of ['sff','air','snd','code']){
    const panel={messages:[],webview:{postMessage(message){this.messages?.push?.(message);return true;},onDidReceiveMessage(){return{dispose(){}};}},onDidDispose(){}};panel.webview.messages=panel.messages;
    await toolbar.handle({type:'viewerToolbarReady',surface,mode:'workspace'},panel);
    const shortcuts=toolbar.menuDefinitions(surface).find(group=>group.label==='Build').items.filter(item=>item.command&&item.id?.startsWith('shared.build.'));
    for(const item of shortcuts){const before=executed.length;await toolbar.handleCommand({type:'viewerToolbarAction',actionId:item.id},'',panel);assert.strictEqual(executed.length,before+1,`${surface} executes ${item.id}`);assert.strictEqual(executed.at(-1)[0],item.command,`${surface} ${item.id} resolves its exact registered command`);}
  }

  await toolbar.handle({ type: 'viewerToolbarReady', surface: 'air', mode: 'workspace' }, targetPanel);
  messages.length = 0;
  assert.strictEqual(await toolbar.handleCommand({ type: 'viewerToolbarCrossSurface', source: 'sff', target: 'air', actionId: 'air.element.newAction', requestId: 'one', safeToLeave: true, busy: false }, 'C:\\char\\ryu.sff'), true);
  assert.deepStrictEqual(opens.at(-1), { seed: 'C:\\char\\ryu.sff', target: 'air' });
  assert.deepStrictEqual(messages.at(-1), { type: 'viewerToolbarInvokeAction', actionId: 'air.element.newAction' });

  const openedBeforeInvalid = opens.length;
  await toolbar.handleCommand({ type: 'viewerToolbarCrossSurface', source: 'sff', target: 'air', actionId: 'air.selector.#invented', safeToLeave: true }, 'C:\\char\\ryu.sff');
  assert.strictEqual(opens.length, openedBeforeInvalid, 'unrecognized action IDs cannot cross the host boundary');
  await toolbar.handleCommand({ type: 'viewerToolbarCrossSurface', source: 'sff', target: 'air', actionId: 'air.element.newAction', busy: true }, 'C:\\char\\ryu.sff');
  assert.strictEqual(opens.length, openedBeforeInvalid, 'busy source viewers cannot launch a target action');
  assert(notices.some(message => /Finish or revert/.test(message)));
  await toolbar.handleCommand({ type: 'viewerToolbarCrossSurface', source: 'air', target: 'air', actionId: 'air.element.newAction', safeToLeave: true }, 'C:\\char\\ryu.air');
  assert.strictEqual(opens.length, openedBeforeInvalid, 'same-surface handoffs are rejected to prevent routing loops');
  await toolbar.handleCommand({ type: 'viewerToolbarCrossSurfaceResult', ok: false, reason: 'Selection required.' }, 'C:\\char\\ryu.sff');
  assert.strictEqual(notices.at(-1), 'Selection required.');
  const help=toolbar.menuDefinitions('air').find(group=>group.label==='Help').items.find(item=>item.command==='ikemen.help.open');
  await toolbar.handleCommand({type:'viewerToolbarAction',actionId:help.id,disposition:'window'},'C:\\char\\ryu.air',targetPanel);
  assert.deepStrictEqual(executed.slice(-2).map(call=>call[0]),['ikemen.help.open','workbench.action.moveEditorToNewWindow'],'viewer toolbar right click opens then detaches the focused destination');
  assert(toolbar.clientScript().includes('Open side by side')&&!toolbar.clientScript().includes('Open as tab'),'viewer options reserve normal open/focus for left click');
  assert(toolbar.clientScript().includes("setAttribute('role','menuitem')"),'viewer placement choices expose menu semantics');
  assert(toolbar.clientScript().includes("['ArrowDown','ArrowUp','Home','End']"),'viewer placement choices support keyboard navigation');
  assert(toolbar.clientScript().includes('closePlacementMenu(true)')&&toolbar.clientScript().includes('trigger.focus()'),'Escape restores focus to the viewer action that opened placement');
  assert(toolbar.clientScript().includes('rect?.left')&&toolbar.clientScript().includes('rect?.bottom'),'keyboard placement anchors to the invoking viewer action');
  console.log('Viewer dropdown menu parity, Project ownership, and guarded cross-surface routing tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = original; });
