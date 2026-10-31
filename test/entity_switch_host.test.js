'use strict';

const assert = require('assert');
const path = require('path');
const header = require('../src/entity_header');
const { createEntitySwitchCoordinator } = require('../src/entity_switch_coordinator');
const { MAX_RETAINED_STATE_BYTES } = require('../src/entity_switch_coordinator');
const { createEntitySwitchHost, validateIntent, validateAdapter, ADAPTER_RETAINED_STATE_KEY } = require('../src/entity_switch_host');

function descriptor(name) { return { kind:'character', projectId:'sf6', ownerFile:path.resolve(`C:/Game/chars/${name}/${name}.def`), label:name }; }
function panel() { const messages=[],disposals=[],listeners=[];return{messages,receive:message=>Promise.all(listeners.map(listener=>listener(message))),webview:{postMessage:async message=>messages.push(message),onDidReceiveMessage(fn){listeners.push(fn);return{dispose(){const index=listeners.indexOf(fn);if(index>=0)listeners.splice(index,1);}}}},onDidDispose(fn){disposals.push(fn);return{dispose(){}}},dispose(){for(const fn of disposals)fn()}}; }
function adapter(id, log, overrides = {}) {
  return {
    id, surfaceId:id, transferPinned:false,
    async supports(transaction) { log.push(`${id}:supports:${transaction.to.label}`); return true; },
    async prepare(transaction) { log.push(`${id}:prepare:${transaction.from?.label || 'none'}>${transaction.to.label}`); return { retained:true, id }; },
    async validate(_transaction, prepared) { log.push(`${id}:validate:${prepared.id}`); return true; },
    async commit(_transaction, prepared) { log.push(`${id}:commit:${prepared.id}`); },
    async rollback(_transaction, prepared) { log.push(`${id}:rollback:${prepared?.id || 'none'}`); },
    ...overrides
  };
}

(async () => {
  assert(validateIntent({type:header.SWITCH_MESSAGE,identity:'x',revision:0}));
  assert(validateIntent({type:header.PREVIOUS_MESSAGE,revision:1}));
  assert(validateIntent({type:header.OPEN_MESSAGE}));
  assert(validateIntent({type:header.READY_MESSAGE}));
  assert(validateIntent({type:header.REORDER_MESSAGE,identity:'x',beforeIdentity:null,revision:0}));
  assert(validateIntent({type:header.MOVE_MESSAGE,identity:'x',direction:-1,revision:0}));
  assert(validateIntent({type:header.PIN_MESSAGE,identity:'x',pinned:true,revision:0}));
  assert.strictEqual(validateIntent({type:header.MOVE_MESSAGE,identity:'x',direction:2,revision:0}),null);
  assert.strictEqual(validateIntent({type:header.SWITCH_MESSAGE,identity:'x',revision:0,filename:'forged.def'}),null,'clients cannot supply paths or extra switch authority');
  assert.strictEqual(validateIntent({type:header.OPEN_MESSAGE,identity:'forged'}),null,'Open Entity has no client-selected path or descriptor');
  assert.throws(() => validateAdapter({id:'x',surfaceId:'s'}), /requires supports/);

  const coordinator=createEntitySwitchCoordinator(),ryu=coordinator.register(descriptor('Ryu'),{active:true}),ken=coordinator.register(descriptor('Ken'));
  const opened=[],host=createEntitySwitchHost({coordinator,openEntity:async capture=>{opened.push(capture);return{status:'cancelled'};}}),viewer=panel();
  const headerBinding=host.registerHeader(viewer,{surfaceId:'air',adapterId:'air.viewer'});
  assert.throws(()=>host.registerHeader(viewer,{surfaceId:'air',adapterId:'air.viewer'}),/already registered/,'duplicate header bindings cannot leave a stale disposable able to remove the live binding');
  await Promise.resolve();
  let projection=viewer.messages.at(-1);
  assert.strictEqual(projection.type,header.STATE_MESSAGE);
  assert.strictEqual(projection.entities.length,1,'multi-entity tabs remain suppressed until the exact header adapter is registered');
  assert.strictEqual(projection.canOpen,true,'an explicit host Open Entity callback enables only the path-free button contract');
  const beforeReady=viewer.messages.length;
  const readyResult=await host.handleMessage(viewer,{type:header.READY_MESSAGE});
  assert.strictEqual(readyResult.status,'ready');assert.strictEqual(viewer.messages.length,beforeReady+1,'a freshly rendered header receives the current projection on demand');
  const beforeRoutedReady=viewer.messages.length;await viewer.receive({type:header.READY_MESSAGE});assert.strictEqual(viewer.messages.length,beforeRoutedReady+1,'registered headers route their own ready handshake without per-viewer message plumbing');
  let organization=await host.handleMessage(viewer,{type:header.PIN_MESSAGE,identity:ken,pinned:true,revision:coordinator.snapshot().revision});assert.strictEqual(organization.status,'reordered');assert.strictEqual(coordinator.snapshot().entities[0].identity,ken);assert.strictEqual(coordinator.snapshot().activeIdentity,ryu,'organizing tabs never activates another entity');
  organization=await host.handleMessage(viewer,{type:header.PIN_MESSAGE,identity:ken,pinned:false,revision:coordinator.snapshot().revision});assert.strictEqual(organization.status,'reordered');
  organization=await host.handleMessage(viewer,{type:header.REORDER_MESSAGE,identity:ryu,beforeIdentity:ken,revision:coordinator.snapshot().revision});assert.strictEqual(organization.status,'reordered');assert.deepStrictEqual(coordinator.snapshot().entities.map(item=>item.identity),[ryu,ken]);

  let result=await host.handleMessage(viewer,{type:header.SWITCH_MESSAGE,identity:ken,revision:coordinator.snapshot().revision});
  assert.strictEqual(result.status,'unavailable');
  assert.strictEqual(coordinator.snapshot().activeIdentity,ryu,'no cosmetic switch commits without safe adapters');

  const log=[],airRegistration=host.registerAdapter(adapter('air.viewer',log));
  await Promise.resolve();projection=viewer.messages.at(-1);
  assert.strictEqual(projection.entities.length,2,'safe adapter completion releases the synchronized projection');
  const staleRevision=projection.revision;
  coordinator.retain(ryu,{action:7});
  result=await host.handleMessage(viewer,{type:header.SWITCH_MESSAGE,identity:ken,revision:staleRevision});
  assert.strictEqual(result.status,'stale');
  assert.strictEqual(coordinator.snapshot().activeIdentity,ryu);

  result=await host.handleMessage(viewer,{type:header.SWITCH_MESSAGE,identity:ken,revision:coordinator.snapshot().revision});
  assert.strictEqual(result.status,'committed');
  assert.strictEqual(coordinator.snapshot().activeIdentity,ken);
  assert.deepStrictEqual(log,['air.viewer:supports:Ken','air.viewer:prepare:Ryu>Ken','air.viewer:validate:air.viewer','air.viewer:commit:air.viewer']);
  result=await host.handleMessage(viewer,{type:header.PREVIOUS_MESSAGE,revision:coordinator.snapshot().revision});
  assert.strictEqual(result.status,'committed');
  assert.strictEqual(coordinator.snapshot().activeIdentity,ryu);

  result=await host.handleMessage(viewer,{type:header.OPEN_MESSAGE});
  assert.strictEqual(result.status,'cancelled');
  assert.strictEqual(opened.length,1);
  assert.deepStrictEqual(Object.keys(opened[0]).sort(),['activeIdentity','panel','revision'],'Open Entity receives host state only, never a client path');

  const openCoordinator=createEntitySwitchCoordinator(),openA=openCoordinator.register(descriptor('OpenA'),{active:true}),openLog=[];let openB='';const openHost=createEntitySwitchHost({coordinator:openCoordinator,openEntity:async()=>{openB=openCoordinator.register(descriptor('OpenB'));return{status:'opened',identity:openB};}}),openPanel=panel();openHost.registerHeader(openPanel,{surfaceId:'open',adapterId:'open.adapter'});openHost.registerAdapter(adapter('open.adapter',openLog));const openedResult=await openHost.handleMessage(openPanel,{type:header.OPEN_MESSAGE});assert.strictEqual(openedResult.status,'opened');assert.strictEqual(openCoordinator.snapshot().activeIdentity,openB,'Open Entity adopts the registered entity only through the same adapter transaction');assert(openLog.some(item=>item.startsWith('open.adapter:commit')));openHost.dispose();

  const racedCoordinator=createEntitySwitchCoordinator(),racedA=racedCoordinator.register(descriptor('OpenRaceA'),{active:true}),racedB=racedCoordinator.register(descriptor('OpenRaceB')),racedLog=[],gate={};gate.promise=new Promise(resolve=>{gate.resolve=resolve;});let racedOpened='';const racedHost=createEntitySwitchHost({coordinator:racedCoordinator,openEntity:async()=>{await gate.promise;racedOpened=racedCoordinator.register(descriptor('OpenRaceLoaded'));return{status:'opened',identity:racedOpened};}}),racedPanel=panel();racedHost.registerHeader(racedPanel,{surfaceId:'open-race',adapterId:'open-race.adapter'});racedHost.registerAdapter(adapter('open-race.adapter',racedLog));const pendingOpen=racedHost.handleMessage(racedPanel,{type:header.OPEN_MESSAGE});await racedCoordinator.switchTo(racedB);gate.resolve();const racedResult=await pendingOpen;assert.strictEqual(racedResult.status,'cancelled');assert.strictEqual(racedCoordinator.snapshot().activeIdentity,racedB,'a slow Open Entity picker cannot override a newer entity selection');assert(!racedLog.some(item=>item.includes('OpenRaceLoaded')),'the stale Open Entity result never reaches viewer adapters');racedHost.dispose();

  const closedCoordinator=createEntitySwitchCoordinator(),closedA=closedCoordinator.register(descriptor('OpenClosedA'),{active:true}),closedGate={};closedGate.promise=new Promise(resolve=>{closedGate.resolve=resolve;});let closedOpened='';const closingHost=createEntitySwitchHost({coordinator:closedCoordinator,openEntity:async()=>{await closedGate.promise;closedOpened=closedCoordinator.register(descriptor('OpenClosedLoaded'));return{status:'opened',identity:closedOpened};}}),closingPanel=panel();closingHost.registerHeader(closingPanel,{surfaceId:'open-close',adapterId:'open-close.adapter'});closingHost.registerAdapter(adapter('open-close.adapter',[]));const closingRequest=closingHost.handleMessage(closingPanel,{type:header.OPEN_MESSAGE});closingPanel.dispose();closedGate.resolve();const closingResult=await closingRequest;assert.strictEqual(closingResult.status,'cancelled');assert.strictEqual(closedCoordinator.snapshot().activeIdentity,closedA,'a disposed requesting header cannot trigger a late entity adoption');closingHost.dispose();

  const blocker=panel(),blockerBinding=host.registerHeader(blocker,{surfaceId:'snd',adapterId:'snd.viewer'});
  await Promise.resolve();
  assert.strictEqual(viewer.messages.at(-1).entities.length,1,'one unadapted entity-dependent header suppresses switching globally');
  const sndLog=[],sndRegistration=host.registerAdapter(adapter('snd.viewer',sndLog,{async prepare(){return{ok:false,reason:'Unsaved SND draft cannot be retained.'}}}));
  result=await host.handleMessage(viewer,{type:header.SWITCH_MESSAGE,identity:ken,revision:coordinator.snapshot().revision});
  assert.strictEqual(result.status,'cancelled');
  assert.strictEqual(coordinator.snapshot().activeIdentity,ryu,'a dirty adapter veto leaves the prior entity coherent');
  assert(log.some(item=>item.startsWith('air.viewer:rollback')),'already prepared adapters roll back after a later dirty veto');

  sndRegistration.dispose();blockerBinding.dispose();
  const transferLog=[],transfer=host.registerAdapter(adapter('transfer.source',transferLog,{transferPinned:true}));
  const transferHeader=panel(),transferHeaderBinding=host.registerHeader(transferHeader,{surfaceId:'sff-transfer',adapterId:'transfer.source'});
  result=await host.handleMessage(viewer,{type:header.SWITCH_MESSAGE,identity:ken,revision:coordinator.snapshot().revision});
  assert.strictEqual(result.status,'committed');
  assert.deepStrictEqual(transferLog,[],'normal switching never retargets a Transfer-pinned endpoint');

  const failingLog=[],failureRegistration=host.registerAdapter(adapter('code.viewer',failingLog,{async commit(){throw new Error('late UI failure')}})),failureHeader=panel(),failureHeaderBinding=host.registerHeader(failureHeader,{surfaceId:'code',adapterId:'code.viewer'});
  result=await host.handleMessage(viewer,{type:header.SWITCH_MESSAGE,identity:ryu,revision:coordinator.snapshot().revision});
  assert.strictEqual(result.status,'failed');
  assert.strictEqual(coordinator.snapshot().activeIdentity,ken,'commit failure does not publish the destination identity');
  assert(failingLog.some(item=>item.startsWith('code.viewer:rollback'))&&log.filter(item=>item.startsWith('air.viewer:rollback')).length>=2,'all prepared non-pinned adapters receive rollback');

  failureHeaderBinding.dispose();failureRegistration.dispose();
  const throwingLog=[],throwingRegistration=host.registerAdapter(adapter('stage.viewer',throwingLog,{async prepare(){throw new Error('retention failed')}})),throwingHeader=panel(),throwingHeaderBinding=host.registerHeader(throwingHeader,{surfaceId:'stage',adapterId:'stage.viewer'});
  result=await host.handleMessage(viewer,{type:header.SWITCH_MESSAGE,identity:ryu,revision:coordinator.snapshot().revision});
  assert.strictEqual(result.status,'cancelled');
  assert(log.filter(item=>item.startsWith('air.viewer:rollback')).length>=3,'an adapter prepare exception still rolls back adapters prepared earlier in the batch');

  assert.strictEqual((await host.handleMessage(panel(),{type:header.OPEN_MESSAGE})).handled,false,'unregistered panels cannot send entity intents');
  assert.strictEqual((await host.handleMessage(viewer,{type:header.OPEN_MESSAGE,ownerFile:'forged'})).handled,false,'invalid extra fields are rejected');
  throwingHeaderBinding.dispose();throwingRegistration.dispose();transferHeaderBinding.dispose();transfer.dispose();headerBinding.dispose();airRegistration.dispose();
  assert.strictEqual(host.dispose(),true);assert.strictEqual(host.dispose(),false);

  const closedHost=createEntitySwitchHost({coordinator:createEntitySwitchCoordinator()}),observer=panel();closedHost.registerHeader(observer,{surfaceId:'static-help',observerOnly:true});
  assert.strictEqual(closedHost.ready(),false,'observer headers cannot authorize cosmetic switching without a real adapter');closedHost.dispose();

  const retainedCoordinator=createEntitySwitchCoordinator(),first=retainedCoordinator.register(descriptor('First'),{active:true,retainedState:{action:7,nested:{preserved:true},[ADAPTER_RETAINED_STATE_KEY]:{legacy:{scroll:1}}}}),second=retainedCoordinator.register(descriptor('Second'),{retainedState:{action:20}}),retainedHost=createEntitySwitchHost({coordinator:retainedCoordinator}),retainedPanelA=panel(),retainedPanelB=panel();
  retainedHost.registerHeader(retainedPanelA,{surfaceId:'air',adapterId:'retained.air'});retainedHost.registerHeader(retainedPanelB,{surfaceId:'code',adapterId:'retained.code'});
  retainedHost.registerAdapter(adapter('retained.air',[],{async prepare(){return{token:'air',retainedState:{action:9,frame:2}}},async validate(){return true}}));
  retainedHost.registerAdapter(adapter('retained.code',[],{async prepare(){return{token:'code',retainedState:{file:'states.zss',cursor:44}}},async validate(){return{ok:false,reason:'Keep this code draft on the first entity.'}}}));
  result=await retainedHost.handleMessage(retainedPanelA,{type:header.SWITCH_MESSAGE,identity:second,revision:retainedCoordinator.snapshot().revision});
  assert.strictEqual(result.status,'cancelled');
  let retainedFirst=retainedCoordinator.snapshot().entities.find(item=>item.identity===first).retainedState,retainedSecond=retainedCoordinator.snapshot().entities.find(item=>item.identity===second).retainedState;
  assert.deepStrictEqual({action:retainedFirst.action,nested:retainedFirst.nested},{action:7,nested:{preserved:true}},'capturing adapter UI state preserves unrelated prior entity fields');
  assert.deepStrictEqual(retainedFirst[ADAPTER_RETAINED_STATE_KEY],{legacy:{scroll:1},'retained.air':{action:9,frame:2},'retained.code':{file:'states.zss',cursor:44}},'two adapter captures merge under exact adapter ids before a later cancellation');
  assert.deepStrictEqual(retainedSecond,{action:20},'source capture never leaks into the destination entity state');
  retainedHost.dispose();

  const vetoCoordinator=createEntitySwitchCoordinator(),vetoFirst=vetoCoordinator.register(descriptor('VetoFirst'),{active:true,retainedState:{prior:true}}),vetoSecond=vetoCoordinator.register(descriptor('VetoSecond')),vetoHost=createEntitySwitchHost({coordinator:vetoCoordinator}),vetoPanel=panel();vetoHost.registerHeader(vetoPanel,{surfaceId:'veto',adapterId:'veto.viewer'});vetoHost.registerAdapter(adapter('veto.viewer',[],{async prepare(){return{ok:false,reason:'Draft is not ready.',retainedState:{cursor:18}}}}));
  result=await vetoHost.handleMessage(vetoPanel,{type:header.SWITCH_MESSAGE,identity:vetoSecond,revision:vetoCoordinator.snapshot().revision});
  assert.strictEqual(result.status,'cancelled');
  assert.deepStrictEqual(vetoCoordinator.snapshot().entities.find(item=>item.identity===vetoFirst).retainedState,{prior:true,[ADAPTER_RETAINED_STATE_KEY]:{'veto.viewer':{cursor:18}}},'a prepare veto still retains the UI state returned with that veto');
  vetoHost.dispose();

  async function rejectedCapture(capture) {
    const c=createEntitySwitchCoordinator(),a=c.register(descriptor('CaptureA'),{active:true,retainedState:{keep:'exact'}}),b=c.register(descriptor('CaptureB')),h=createEntitySwitchHost({coordinator:c}),p=panel();h.registerHeader(p,{surfaceId:'capture',adapterId:'capture.viewer'});let rolledBack=0;h.registerAdapter(adapter('capture.viewer',[],{async prepare(){return{retainedState:capture}},async rollback(){rolledBack++}}));const outcome=await h.handleMessage(p,{type:header.SWITCH_MESSAGE,identity:b,revision:c.snapshot().revision}),state=c.snapshot().entities.find(item=>item.identity===a).retainedState;h.dispose();return{outcome,state,rolledBack};
  }
  const malformed=Object.create({polluted:true});malformed.safe='value';
  let rejected=await rejectedCapture(malformed);
  assert.strictEqual(rejected.outcome.status,'cancelled');assert.deepStrictEqual(rejected.state,{keep:'exact'});assert.strictEqual(rejected.rolledBack,1,'malformed capture rejection rolls back prepared UI state without changing retained state');
  const poisoned=Object.create(null);poisoned.__proto__={polluted:true};
  rejected=await rejectedCapture(poisoned);
  assert.strictEqual(rejected.outcome.status,'cancelled');assert.deepStrictEqual(rejected.state,{keep:'exact'});assert.strictEqual({}.polluted,undefined,'prototype-polluting retained keys are rejected without mutating Object.prototype');
  rejected=await rejectedCapture({payload:'x'.repeat(MAX_RETAINED_STATE_BYTES)});
  assert.strictEqual(rejected.outcome.status,'cancelled');assert.deepStrictEqual(rejected.state,{keep:'exact'});assert.strictEqual(rejected.rolledBack,1,'oversize aggregate rejection preserves the prior state and rolls back preparation');

  console.log('Entity switch host gates projections, validates bounded intents, routes explicit Open Entity, coordinates rollback, and preserves Transfer pins');
})().catch(error=>{console.error(error);process.exitCode=1;});
