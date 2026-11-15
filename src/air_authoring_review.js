'use strict';

const collisionCleanup = require('./air_collision_cleanup');
const {scan, cleanup} = collisionCleanup;
function silhouetteBox(image,sprite,frame) { return collisionCleanup.silhouetteBoxes(image,sprite,frame)[0] || null; }
const {resolveStandards} = require('./animation_standards');
const characterStandards = resolveStandards(['ikemen-1.0-character-core']);
const DEFAULT_NAMES = Object.freeze(Object.fromEntries(
  [...characterStandards.requiredAnimations, ...characterStandards.recommendedAnimations]
    .map(({ action, label }) => [action, label])
));
function suggestedNames(text, suggestions) {
  if (!suggestions || typeof suggestions !== 'object' || Array.isArray(suggestions)) throw Error('Suggestions must map action IDs to labels.');
  for (const [id,label] of Object.entries(suggestions)) if (!/^-?\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || typeof label !== 'string' || label.length > 200 || /[\r\n\0]/.test(label)) throw Error('Each suggestion needs a whole action ID and a single-line label of up to 200 characters.');
  const lines=[...text.matchAll(/[^\r\n]*(?:\r\n|\n|$)/g)].filter(item=>item[0].length), patches=[], rows=[], eol=text.includes('\r\n')?'\r\n':'\n', seen=new Set();
  for (let index=0;index<lines.length;index++) {
    const match=/^\s*\[Begin\s+Action\s+(-?\d+)\s*\](.*)/i.exec(lines[index][0]); if(!match)continue;
    const id=Number(match[1]); if(seen.has(id))throw Error('Duplicate action IDs require AIR Source review.');seen.add(id);
    let before=index-1,after=index+1;while(before>=0&&!lines[before][0].trim())before--;while(after<lines.length&&!lines[after][0].trim())after++;
    const authored=/;\s*\S/.test(match[2]) || (before>=0&&/^\s*;\s*\S/.test(lines[before][0])) || (after<lines.length&&/^\s*;\s*\S/.test(lines[after][0]));
    const label=Object.prototype.hasOwnProperty.call(suggestions,String(id))?suggestions[id].trim():'';
    if(!authored&&label){patches.push({start:lines[index].index,end:lines[index].index,text:'; '+label+eol});rows.push('Action '+id+' → '+label);}
  }
  return {patches,rows,detail:rows.join('\n')+'\nOnly missing labels are inserted. Authored comments, IDs, timing and file order are preserved.'};
}
function blockText(kind, boxes, eol, isDefault = false) { const name = kind === 'clsn1' ? 'Clsn1' : 'Clsn2'; return name + (isDefault ? 'Default' : '') + ': ' + boxes.length + eol + boxes.map((box, index) => name + '[' + index + '] = ' + box.rect.join(', ') + eol).join(''); }
function pinnedCopy(text, request) {
  const { actions } = scan(text), source = actions.find(item => item.number === request.sourceAction)?.frames[request.sourceElement], destination = actions.find(item => item.number === request.action);
  const kinds = request.kinds || ['clsn2'], indices = request.elements;
  if (!source || !destination || !Array.isArray(indices) || !indices.length || indices.length > 4096 || new Set(indices).size !== indices.length || kinds.some(kind => !['clsn1', 'clsn2'].includes(kind)) || !kinds.length) throw Error('Choose an exact pinned source, box types and destination elements.');
  const patches = [], rows = [], eol = text.includes('\r\n') ? '\r\n' : '\n'; let materialized = 0;
  for (const index of indices) {
    const frame = Number.isSafeInteger(index) && destination.frames[index]; if (!frame) throw Error('A destination element is missing.');
    if (request.action === request.sourceAction && index === request.sourceElement) continue;
    let insertion = '';
    let copied=false;
    for (const kind of kinds) { if(!source.effective[kind]||!source.effective[kind].boxes.length&&request.clearEmptySource!==true)continue;const boxes = source.effective[kind].boxes, local = frame.local[kind], replacement = blockText(kind, boxes, eol); if (local) patches.push({ start: local.start, end: local.end, text: replacement }); else { insertion += replacement;if(frame.effective[kind]?.isDefault)materialized++; }copied=true; }
    if (insertion) patches.push({ start: frame.start, end: frame.start, text: insertion });
    if(copied)rows.push('Action ' + destination.number + ', element ' + (index + 1));
  }
  return { patches, rows, detail: 'Source Action ' + request.sourceAction + ', element ' + (request.sourceElement + 1) + '\nTypes: ' + kinds.filter(kind=>source.effective[kind]).join(', ') + '\nAffected frames: ' + rows.length + '\n' + rows.join('\n') + '\nInherited destination blocks made local: '+materialized+'. Inherited source geometry is copied into local destination overrides. Absent source types are skipped; empty source kinds are skipped unless explicitly reviewed to clear destination boxes. The source frame, shared defaults and unrelated box types remain unchanged.' };
}
function install(page) {
  return page.replace('<button id="quickReuseClsn"', '<button id="reviewSuggestedNames">Name actions…</button><button id="reviewCollisionCleanup">Cleanup boxes…</button><button id="copyPinnedCollisions" title="Review pinned onion collision boxes for selected timeline frames">Pinned boxes…</button><button id="quickReuseClsn"')
    .replace('</script></body>', `const airReviewTools=document.createElement('div');airReviewTools.className='timeline-actions';airReviewTools.style.order='7';airReviewTools.setAttribute('aria-label','Reviewed AIR authoring');for(const id of ['copyPinnedCollisions','reviewCollisionCleanup','reviewSuggestedNames'])airReviewTools.append(document.getElementById(id));document.getElementById('compactFrameTools').after(airReviewTools);for(const button of airReviewTools.querySelectorAll('button')){button.disabled=model.sourceKind==='stage'||model.transfer?.role==='source';if(button.disabled)button.title='Available in a writable standalone AIR file.'}document.getElementById('reviewSuggestedNames').onclick=()=>{if(navigationAllowed())beginActionMutation({type:'reviewSuggestedNames',sourceFingerprint:model.sourceFingerprint,action:action?.number})};document.getElementById('reviewCollisionCleanup').onclick=()=>{if(action&&navigationAllowed())beginActionMutation({type:'reviewCollisionCleanup',sourceFingerprint:model.sourceFingerprint,action:action.number,actions:selectedActions.has(action.number)?[...selectedActions]:[action.number]})};document.getElementById('copyPinnedCollisions').onclick=()=>{if(!action||!navigationAllowed())return;const source=globalThis.ikemenTickOnion?.source?.();if(!source){document.getElementById('timelineStatus').textContent='Choose Pinned tick in the onion controls first.';return}beginActionMutation({type:'copyPinnedCollisions',sourceFingerprint:model.sourceFingerprint,...source,action:action.number,elements:selectedFrames.size?[...selectedFrames]:[frameIndex]})};</script></body>`);
}
const CLEANUP_PREFERENCES = 'ikemen.air.collisionCleanupPreferences';
async function configureCleanup(vscode, storage) {
  const saved = storage?.get(CLEANUP_PREFERENCES) || {};
  const integerDefault = (key, fallback, maximum) =>
    String(Number.isInteger(saved[key]) && saved[key] >= 1 && saved[key] <= maximum ? saved[key] : fallback);
  function preferred(items, key, value) {
    const match = items.find(item => item[key] === value);
    return match ? [match, ...items.filter(item => item !== match)] : items;
  }
  const pick=(items,title)=>vscode.window.showQuickPick(items,{title});
  const operation=await pick([{label:'Propose silhouette collision boxes',mode:'silhouette'},{label:'Sort and normalize existing collision boxes',mode:'normalize'}],'Collision cleanup operation');if(!operation)return null;
  const kind=await pick([{label:'Clsn2 hurt/contact boxes',kind:'clsn2',hurtOnly:true},{label:'Clsn1 attack/reversal boxes',kind:'clsn1',hurtOnly:false},...(operation.mode==='normalize'?[{label:'Both collision kinds',kind:'both',hurtOnly:false}]:[])],'Collision box kind');if(!kind)return null;
  const result={...operation,...kind};
  if(operation.mode==='silhouette'){
    const count=await vscode.window.showInputBox({title:'Maximum silhouette boxes per frame',value:integerDefault('boxCount',3,100),prompt:'1–100. Empty bands are skipped; fewer boxes may fit a small or separated silhouette.',validateInput:value=>Number.isSafeInteger(Number(value))&&Number(value)>=1&&Number(value)<=100?undefined:'Enter a whole number from 1 to 100.'});if(count===undefined)return null;result.boxCount=Number(count);
    const layout=await pick(preferred([{label:'Auto',layout:'auto',description:'Choose cuts that cover the least empty space.'},{label:'Stacked',layout:'stacked',description:'Fit horizontal bands from top to bottom.'},{label:'Side by side',layout:'side-by-side',description:'Fit vertical bands from left to right.'}],'layout',saved.layout || 'stacked'),'Silhouette box layout');if(!layout)return null;result.layout=layout.layout;
    const threshold=await vscode.window.showInputBox({title:'Alpha cutoff',value:integerDefault('alphaThreshold',32,255),prompt:'1–255. Include pixels with alpha at least this value. Indexed sprite index 0 stays transparent.',validateInput:value=>Number.isSafeInteger(Number(value))&&Number(value)>=1&&Number(value)<=255?undefined:'Enter a whole alpha value from 1 to 255.'});if(threshold===undefined)return null;result.alphaThreshold=Number(threshold);
    const scope=await pick([{label:'Only frames with their own boxes',explicitOnly:true,includeAbsent:false,description:'Skip inherited defaults and absent boxes; deliberate empty stays empty.'},{label:'Existing local and inherited boxes',explicitOnly:false,includeAbsent:false,description:'Inherited geometry becomes a local override; shared defaults stay unchanged.'},{label:'Include frames without boxes',explicitOnly:false,includeAbsent:true,description:'Opt in to new local boxes; deliberate empty stays empty.'}],'Collision ownership scope');if(!scope)return null;Object.assign(result,scope);
  }else{
    const sort=await pick(preferred([{label:'Numeric index',sort:'index'},{label:'Top → bottom',sort:'top-bottom'},{label:'Bottom → top',sort:'bottom-top'},{label:'Left → right',sort:'left-right'},{label:'Right → left',sort:'right-left'},{label:'Smallest area first',sort:'smallest-area'},{label:'Largest area first',sort:'largest-area'}],'sort',saved.sort),'Geometric box order');if(!sort)return null;result.sort=sort.sort;
    const scope=await pick([{label:'Local declarations and shared defaults',explicitOnly:false},{label:'Only frame-local declarations',explicitOnly:true}],'Declarations to normalize');if(!scope)return null;result.explicitOnly=scope.explicitOnly;
    const numbering=await pick([{label:'Retain numeric box identities',reindex:false,description:'Reorder source lines and comments, preserving references to each numeric slot.'},{label:'Renumber boxes in the chosen order',reindex:true,description:'Explicit opt-in: review old → new slots and index-sensitive assigned code before Apply.'}],'Numeric collision box identities');if(!numbering)return null;result.reindex=numbering.reindex;
  }
  return result;
}
async function handle(env) {
  const { vscode, session, message } = env, document = await vscode.workspace.openTextDocument(session.airPath), baseline = env.actionMutationBaseline(document);
  const cancel = () => session.panel.webview.postMessage({ type: 'actionMutationCancelled', actionRequestId: message.actionRequestId });
  if (message.sourceFingerprint !== require('./air_batch_scope').sourceFingerprint(baseline.text)) throw Error('The AIR changed after the displayed selection. Refresh the viewer before reviewing changes.');
  let plan,referenceReview,collisionOptions;
  if (message.type === 'reviewSuggestedNames') {
    const storageKey='ikemen.air.suggestedNames';
    const profileNames=env.context?.globalState?.get(storageKey) || DEFAULT_NAMES;
    const suggestions={...(env.context?.workspaceState?.get(storageKey,profileNames)||profileNames)};
    for (;;) {
      const pending=suggestedNames(baseline.text,suggestions);
      const choice=await vscode.window.showQuickPick([{label:'Review missing action names',description:pending.rows.length+' suggested labels',review:true},{label:'Save suggestions',description:'Remember this list without changing AIR source.',save:true},{label:'Save as default for all workspaces',profile:true},{label:'Import action-names.txt...',loadFile:true},{label:'Export action-names.txt...',saveFile:true},{label:'Add a custom action suggestion',add:true},...Object.entries(suggestions).sort((a,b)=>Number(a[0])-Number(b[0])).map(([id,label])=>({label:'Action '+id,description:label,id}))],{title:'Suggested action names',placeHolder:'Edit a label, add a custom ID, save suggestions, or review unnamed actions'});
      if(!choice)return cancel();
      if(choice.profile){
        if(!env.context?.globalState)throw Error('Profile storage is unavailable.');
        await env.context.globalState.update(storageKey,{...suggestions});
        void vscode.window.showInformationMessage('Saved default action names for workspaces without their own list.');
        return cancel();
      }
      if(choice.loadFile){
        const files=await vscode.window.showOpenDialog({title:'Import suggested names into this list',canSelectMany:false,filters:{'Action names':['txt']}});
        if(!files?.length)continue;
        const fs=require('fs'),filename=files[0].fsPath;
        if(fs.statSync(filename).size>1048576)throw Error('Action names file exceeds 1 MB.');
        Object.assign(suggestions,require('./air_action_name_file').parseActionNames(fs.readFileSync(filename,'utf8')));
        continue;
      }
      if(choice.saveFile){
        const file=await vscode.window.showSaveDialog({title:'Export suggested AIR action names',filters:{'Action names':['txt']}});
        if(!file)continue;
        const fs=require('fs'),safety=require('./mutation_safety'),filename=file.fsPath;
        const observed=fs.existsSync(filename)?fs.readFileSync(filename):Buffer.alloc(0);
        safety.transactionalWrite(fs,filename,require('./air_action_name_file').writeActionNames(suggestions),
          safety.optionsFromConfig(vscode,filename,'export-air-action-names',{expectedHash:safety.hash(observed),allowExisting:true}));
        void vscode.window.showInformationMessage('Exported suggested action names.');
        continue;
      }
      if(choice.save){if(!env.context?.workspaceState)throw Error('Workspace suggestion storage is unavailable.');await env.context.workspaceState.update('ikemen.air.suggestedNames',suggestions);void vscode.window.showInformationMessage('Saved suggested action names. AIR source was not changed.');return cancel();}if(choice.review)break;
      const id=choice.add?await vscode.window.showInputBox({title:'Custom action ID',validateInput:value=>/^-?\d+$/.test(value)&&Number.isSafeInteger(Number(value))?undefined:'Enter a whole action number.'}):choice.id;
      if(id===undefined)continue;
      const label=await vscode.window.showInputBox({title:'Suggested name for Action '+Number(id),value:suggestions[Number(id)]||'',prompt:'Leave empty to remove this suggestion.',validateInput:value=>value.length<=200&&!/[\r\n\0]/.test(value)?undefined:'Use one line of up to 200 characters.'});
      if(label!==undefined){if(label.trim())suggestions[Number(id)]=label.trim();else delete suggestions[Number(id)];}
    }
    plan=suggestedNames(baseline.text,suggestions);
    session.suggestedActionNames=suggestions;
  } else if (message.type === 'reviewCollisionCleanup') {
    const operation = await configureCleanup(vscode, env.context?.globalState);
    if (!operation) return cancel();
    collisionOptions = operation;
    referenceReview=require('./air_collision_reference_review').capture(session,vscode);
    if(operation.reindex&&!referenceReview.complete)throw Error('Renumbering requires an exact, readable assigned-code inventory. '+referenceReview.referenceStatus);
    const silhouette=require('./sff_silhouette').spriteSilhouette, cache=new Map();
    const artwork=(pose,options)=>{const identity=pose.group+','+pose.index,key=identity+':'+options.alphaThreshold;if(cache.has(key))return cache.get(key);let value=null;try {const sprite=session.byKey?.get(identity);if(sprite&&session.archive)value={sprite,image:silhouette(session.archive,sprite,null,{alphaThreshold:options.alphaThreshold})};}catch(_){}cache.set(key,value);return value;};
    plan=cleanup(baseline.text,{...message,...operation,references:referenceReview.references,referenceStatus:referenceReview.referenceStatus},artwork);
  } else {
  const choices = await vscode.window.showQuickPick([{ label: 'Clsn2 hurt/contact boxes', kind: 'clsn2', picked: true }, { label: 'Clsn1 attack/reversal boxes', kind: 'clsn1' }], { title: 'Copy pinned onion boxes', canPickMany: true });
  if (!choices?.length) return cancel();
  const pinnedSource=scan(baseline.text).actions.find(item=>item.number===message.sourceAction)?.frames[message.sourceElement],emptyKinds=choices.filter(item=>pinnedSource?.effective[item.kind]?.boxes.length===0);let clearEmptySource=false;
  if(emptyKinds.length){const emptyChoice=await vscode.window.showQuickPick([{label:'Skip empty pinned types',description:'Preserve authored destination boxes.',clear:false},{label:'Clear destination boxes for empty pinned types',description:'Explicitly replace matching destination boxes with an empty local block.',clear:true}],{title:'Empty pinned collision types: '+emptyKinds.map(item=>item.kind).join(', ')});if(!emptyChoice)return cancel();clearEmptySource=emptyChoice.clear;}
  plan = pinnedCopy(baseline.text, { ...message, clearEmptySource,kinds: choices.map(item => item.kind) });
  }
  if (!plan.patches.length) { void vscode.window.showInformationMessage('No AIR changes proposed. '+plan.rows.join('\n')); return cancel(); }
  const applyLabel=message.type==='reviewSuggestedNames'?'Apply Reviewed Names':'Apply Reviewed Boxes';
  if (await vscode.window.showWarningMessage('Review AIR changes', { modal: true, detail: plan.detail }, applyLabel) !== applyLabel) return cancel();
  env.requireActionMutationBaseline(await vscode.workspace.openTextDocument(session.airPath), baseline);
  if(referenceReview)require('./air_collision_reference_review').validate(referenceReview,vscode);
  await env.applyActionMutation(session, document, plan.patches, { actionRequestId: message.actionRequestId, action: message.action });
  if (collisionOptions && env.context?.globalState) {
    const storage = env.context.globalState;
    const previous = storage.get(CLEANUP_PREFERENCES) || {};
    const {boxCount, layout, alphaThreshold, sort} = collisionOptions;
    const accepted = collisionOptions.mode === 'silhouette' ? {boxCount, layout, alphaThreshold} : {sort};
    await storage.update(CLEANUP_PREFERENCES, {...previous, ...accepted});
  }
  if(message.type==='reviewSuggestedNames')await env.context?.workspaceState?.update('ikemen.air.suggestedNames',session.suggestedActionNames);
}
module.exports = { scan, blockText, pinnedCopy, silhouetteBox, cleanup, suggestedNames, DEFAULT_NAMES, install, configureCleanup, handle };
