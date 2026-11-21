'use strict';

const fs = require('fs');
const path = require('path');
const model = require('./costume_explod_model');
const { exactStateSources } = require('./exact_state_sources');
const { normalizePreviewLayers,orderedPreviewLayers } = require('./preview_layers_model');
const { maskSource } = require('./state_transfer_model');
const { parseDef, sections, value, unquote } = require('./def_model');
const { assignedPath } = require('./character_dependency_model');

function pathKey(filename) {
  const resolved = path.resolve(filename);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function assignments(owner, text) {
  const definition = parseDef(text, owner);
  const files = sections(definition, 'files')[0];
  const versions = sections(definition, 'info').flatMap(info => info.entries.filter(entry => entry.normalized === 'ikemenversion'));
  const version = unquote(versions[0]?.value || '').split('.');
  const ikemenVersion = versions.length === 1 && version.every(part => /^\d+$/.test(part)) && Number(version[0]) >= 1;
  return {
    air: assignedPath(owner, value(files, 'anim', value(files, 'air'))),
    sff: assignedPath(owner, value(files, 'sprite', value(files, 'sff'))),
    ikemenVersion, states: exactStateSources(owner, text),
    cmd: assignedPath(owner, value(files, 'cmd'), 'cmd')
  };
}

function language(filename) { return /\.zss$/i.test(filename) ? 'zss' : 'cns'; }

// Only [State ...] controllers belong to a CNS StateDef. Command and other
// sections can follow it in a combined source and must stay outside it.
function allStateSections(text, syntax) {
  const masked = maskSource(text, syntax);
  const headers = [...masked.matchAll(/^[ \t\uFEFF]*\[\s*([\w.]+)\b([^\]]*)\]/gm)]
    .filter(match => syntax === 'zss' ? /^(statedef|function)$/i.test(match[1]) : !/^state$/i.test(match[1]));
  // A generated StateDef may own the marker line immediately above its header.
  // End the preceding section before that marker so a later insertion cannot
  // split the marker from the sealed header/body it describes.
  const boundary = header => {
    const before=text.slice(0,header.index),previous=before.replace(/\r?\n$/, '');
    const start=previous.lastIndexOf('\n')+1,line=previous.slice(start);
    return /^[ \t]*[#;] IKEMaker (?:managed costume|costume preflight) [^\r\n]*$/.test(line)?start:header.index;
  };
  return headers.flatMap((header, index) => {
    const number=header[2].split(';',1)[0].trim();
    if(!/^statedef$/i.test(header[1])||! /^[+-]?\d+$/.test(number))return [];
    return [{stateNumber:number,start:header.index,end:headers[index+1]?boundary(headers[index+1]):text.length}];
  });
}
function globalSections(text, syntax, stateNumber) {
  return allStateSections(text,syntax).filter(section=>section.stateNumber===String(stateNumber)).map(({start,end})=>({start,end}));
}

function insertion(text, offset, snippet) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = snippet.trim().replace(/\r?\n/g, eol);
  if (!block) return null;
  const before = text.slice(0, offset);
  const separator = !before || before.endsWith(eol + eol) ? '' : before.endsWith(eol) ? eol : eol + eol;
  return { offset, code: separator + block + eol + (offset < text.length ? eol : '') };
}

function stateInsertion(text, stateCode, existing, stateNumber) {
  const header = '[StateDef ' + stateNumber + ']';
  const lines = stateCode.split(/\r?\n/);
  const headerLine = lines.findIndex(line => line.trim().toLowerCase() === header.toLowerCase());
  if (existing && headerLine >= 0) lines.splice(headerLine, 1);
  if (!existing && headerLine < 0) lines.unshift(header, '');
  const snippet = lines.join('\n');
  return insertion(text, existing?.end ?? text.length, snippet);
}

function usedExplodIds(sources) {
  const used = new Set();
  for (const source of sources) {
    const syntax = language(source.document.fileName);
    const masked = maskSource(source.text, syntax);
    const blocks = syntax === 'zss' ? masked.matchAll(/\b(?:explod|modifyexplod|removeexplod)\s*\{([^}]*)\}/gi)
      : masked.matchAll(/^[ \t]*\[\s*state\b[^\]]*\]([^\[]*)/gim);
    for (const [, body] of blocks) {
      if (syntax === 'cns' && !/^\s*type\s*=\s*(?:explod|modifyexplod|removeexplod)\s*$/im.test(body)) continue;
      const id = /(?:^|[;\n])\s*id\s*[:=]\s*(\d+)[ \t]*(?=[;\r\n]|$)/im.exec(body);
      if (id) used.add(Number(id[1]));
    }
    for (const match of masked.matchAll(/\bnumexplod\s*\(\s*(\d+)\s*\)/gi)) used.add(Number(match[1]));
  }
  return used;
}

async function snapshot(api, filename) {
  const document = await api.workspace.openTextDocument(api.Uri.file(filename));
  return { document, text: document.getText(), version: document.version };
}

function sffStamp(filename) {
  const stat = fs.statSync(filename, { bigint: true });
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join('/');
}

function checkReview(sources, filename, stamp) {
  for (const { document, text, version } of sources) {
    if (document.isClosed || document.version !== version || document.getText() !== text) {
      throw new Error(`${path.basename(document.fileName)} changed during review. Reopen Use Costume Layer to regenerate the preview.`);
    }
  }
  if (sffStamp(filename) !== stamp) throw new Error('The assigned SFF changed during review. Refresh the viewer and review the layer again.');
}


function managedSpecification(marker,text,start) {
  const match=/ ; ikm2=([A-Za-z0-9_-]{1,16000}) ; chars=(\d+) ; sha256=([a-f0-9]{64})$/.exec(marker);
  if(!match)return null;
  const spec=JSON.parse(Buffer.from(match[1],'base64url').toString('utf8'));
  if(spec.version!==2||!['pre','post'].includes(spec.statePhase)||!['frozen','follow'].includes(spec.explodClock)||typeof spec.foreignPoses!=='boolean'||typeof spec.omitHeader!=='boolean'||!(spec.scopeAction==='all'||Number.isInteger(spec.scopeAction)||Array.isArray(spec.scopeAction)&&spec.scopeAction.length<=4096&&spec.scopeAction.every(Number.isInteger)))throw Error('The installed costume generation metadata is invalid. Review its source.');
  const eol = text.startsWith('\r\n', start + marker.length) ? '\r\n' : '\n';
  const bodyStart = start + marker.length + eol.length;
  const length = Number(match[2]);
  const hash = require('./mutation_safety').hash;
  let end = bodyStart + length;
  if (!Number.isSafeInteger(length) || length < 1 || length > text.length * 2) throw Error('Invalid generated costume block length.');
  if (hash(text.slice(bodyStart, end)) !== match[3]) {
    // Changing the document EOL in VS Code converts every generated line. Recover
    // the original bytes for verification while keeping offsets in the current file.
    const previousEol = eol === '\n' ? '\r\n' : '\n';
    const span = text.slice(bodyStart, bodyStart + length * 2);
    const original = span.split(eol).join(previousEol).slice(0, length);
    if (original.length !== length || hash(original) !== match[3]) throw Error('An installed generated costume block was edited. No composition edits were applied. Review its source first.');
    end = bodyStart + original.split(previousEol).join(eol).length;
  }
  if (end > text.length || end < text.length && !/^\r?\n/.test(text.slice(end))) throw Error('An installed generated costume block was edited. Review its source first.');
  return {spec,baseMarker:marker.slice(0,match.index),end};
}
function managedBody(code,stateNumber,omitHeader,eol) {
  let lines=code.trim().split(/\r?\n/);if(omitHeader)lines=lines.filter(line=>line.trim().toLowerCase()!==('[statedef '+stateNumber+']').toLowerCase());return lines.join(eol);
}
function sealManagedBlock(marker,code,spec,stateNumber,eol='\n') {
  const body=managedBody(code,stateNumber,spec.omitHeader,eol),metadata=Buffer.from(JSON.stringify(Object.fromEntries(Object.entries({version:2,...spec}).sort(([a],[b])=>a.localeCompare(b))))).toString('base64url');
  return marker+' ; ikm2='+metadata+' ; chars='+body.length+' ; sha256='+require('./mutation_safety').hash(body)+eol+body;
}
function managedRefreshPatch(text,start,marker,previous,next,stateNumber,syntax,spec) {
  const sealed=managedSpecification(marker,text,start),eol=text.includes('\r\n')?'\r\n':'\n';
  let end,baseMarker=marker;
  if(sealed){end=sealed.end;baseMarker=sealed.baseMarker;spec={...spec,omitHeader:sealed.spec.omitHeader};}
  else {const prior=upgradeCostumePatch(text,start,marker,previous,next,stateNumber,syntax,true);if(!prior)return null;end=prior.end;spec={...spec,omitHeader:prior.omitHeader};}
  const code=sealManagedBlock(baseMarker,next,spec,stateNumber,eol);
  return text.slice(start,end)===code?{unchanged:true}:{offset:start,end,code};
}

function spritePair(value){const match=/^\s*(\d{1,5})\s*,\s*(\d{1,5})\s*$/.exec(String(value||''));return match&&Number(match[1])<=65535&&Number(match[2])<=65535?`${Number(match[1])},${Number(match[2])}`:'';}
async function chooseForeignPosePlan(api,{title,prior,installed,actions,sprites}){
  if(installed&&!prior){const choice=await api.window.showQuickPick([
    {label:'Keep the installed continuous behavior',legacy:true,description:'Preserve the existing authored effect across opponent animations.'},
    {label:'Guard opponent poses',legacy:false,description:'Choose static artwork or an explicit timed Action for each pose.'}
  ],{title,placeHolder:'This installed timed layer predates opponent-pose guards'});if(!choice)return null;if(choice.legacy)return{legacy:true};}
  const previous=prior||{},policy=await api.window.showQuickPick([
    {label:'Use a static pose in opponent animations',policy:'static',description:'Default for body accessories; unmatched poses hide the effect.'},
    {label:'Continue the original animation',policy:'continue',description:'For an aura or other independent effect; explicit pose Actions can still override it.'}
  ].sort((a,b)=>Number(b.policy===(previous.policy||'static'))-Number(a.policy===(previous.policy||'static'))),{title,placeHolder:'How should this timed layer behave during opponent-controlled animations?'});
  if(!policy)return null;
  const banks=[...new Set((sprites||[]).map(sprite=>Math.floor(Number(sprite.group)/10000)).filter(bank=>Number.isInteger(bank)&&bank>=1&&bank<=6))].sort((a,b)=>a-b);
  let bank={bank:null};
  if(policy.policy==='static'){
    const preferred=Object.hasOwn(previous,'bank')?previous.bank:banks[0]??null;
    bank=await api.window.showQuickPick([
      {label:'No fallback bank',bank:null,description:'Use explicit sprite mappings, timed Actions, or hide unmatched poses.'},
      ...banks.map(value=>({label:`Sprite bank ${value}`,bank:value,description:'Use matching group/index artwork from this bank as a static pose.'}))
    ].sort((a,b)=>Number(b.bank===preferred)-Number(a.bank===preferred)),{title,placeHolder:'Choose optional static artwork for opponent-supplied poses'});
    if(!bank)return null;
  }
  const available=new Set((sprites||[]).map(sprite=>`${sprite.group},${sprite.number}`));
  const mapping=policy.policy==='static'?{...(previous.mapping||{})}:{},timed={...(previous.timed||{})};
  for(let count=0;policy.policy==='static'&&count<64;count++){
    const choice=await api.window.showQuickPick([
      {label:'Done with static pose mappings',done:true},
      {label:'Map one opponent pose to a static sprite…',add:true},
      ...Object.entries(mapping).map(([pose,target])=>({label:`Remove ${pose} → ${target?`${target.group},${target.index??target.number}`:'hidden'}`,remove:pose}))
    ],{title,placeHolder:'Optional exact pose overrides. Unmapped poses use the fallback bank or hide.'});
    if(!choice)return null;if(choice.done)break;if(choice.remove){delete mapping[choice.remove];continue;}
    const pose=spritePair(await api.window.showInputBox({title,prompt:'Opponent pose group,index',placeHolder:'5000,0',validateInput:value=>available.has(spritePair(value))?undefined:'Choose an opponent pose sprite that exists in the assigned SFF.'}));if(!pose)return null;
    if(!available.has(pose))throw Error('The mapped opponent pose is no longer in the assigned SFF. Refresh the viewer and review again.');
    const target=spritePair(await api.window.showInputBox({title,prompt:`Static costume sprite for pose ${pose}: group,index`,placeHolder:'15000,0',validateInput:value=>available.has(spritePair(value))?undefined:'Choose a sprite that exists in the assigned SFF.'}));if(!target)return null;
    if(!available.has(target))throw Error('The mapped costume sprite is no longer in the assigned SFF. Refresh the viewer and review again.');
    const [group,index]=target.split(',').map(Number);mapping[pose]={group,index};
  }
  for(let count=0;count<64;count++){
    const choice=await api.window.showQuickPick([
      {label:'Done with pose-specific timed Actions',done:true},
      {label:'Assign one opponent pose to a timed Action…',add:true},
      ...Object.entries(timed).map(([pose,target])=>({label:`Remove ${pose} → Action ${target?.action??target}`,remove:pose}))
    ],{title,placeHolder:'Optional timed overrides. These take precedence over static sprite mappings.'});
    if(!choice)return null;if(choice.done)break;if(choice.remove){delete timed[choice.remove];continue;}
    const pose=spritePair(await api.window.showInputBox({title,prompt:'Opponent pose group,index',placeHolder:'5000,0',validateInput:value=>available.has(spritePair(value))?undefined:'Choose an opponent pose sprite that exists in the assigned SFF.'}));if(!pose)return null;
    if(!available.has(pose))throw Error('The timed opponent pose is no longer in the assigned SFF. Refresh the viewer and review again.');
    const action=await api.window.showQuickPick(actions.map(item=>({label:`Action ${item.number}`,description:item.name||'Existing AIR Action',action:item.number})),{title,placeHolder:`Timed costume Action for opponent pose ${pose}`});if(!action)return null;
    const phase=await api.window.showQuickPick([{label:'Restart on each new pose',continue:false},{label:'Keep phase when the next pose uses this Action',continue:true}],{title,placeHolder:'How should this pose-specific Action change between poses?'});if(!phase)return null;
    timed[pose]={action:action.action,continue:phase.continue};
  }
  return{policy:policy.policy,bank:bank.bank,...(Object.keys(mapping).length?{mapping}:{}),...(Object.keys(timed).length?{timed}:{})};
}
async function chooseLayerRecipe(api,{title,layer,prior,actions,sprites}){
  const banks=[...new Set((sprites||[]).map(sprite=>Math.floor(Number(sprite.group)/10000)).filter(value=>value>=1&&value<=6))];
  const bank=banks.includes(layer.source?.bank)?layer.source.bank:banks[0]??null;
  const action=actions.some(item=>item.number===(prior?.runtimeAction??layer.source?.action))?(prior?.runtimeAction??layer.source?.action):actions[0]?.number;
  const entries=[];
  if(prior){
    entries.push({label:'Keep saved layer recipe',recipePreset:'saved',description:`${prior.runtimeMode==='body-pose'?'Body detail':prior.foreignPose?.policy==='static'?'Timed accessory':'Continuous aura'} · retain Action, pause, visibility and pose exceptions`,detail:'Review the existing generated code with its saved settings.'});
  }
  if(layer.source?.kind!=='animation')entries.push({label:'Body detail',recipePreset:'body',runtimeMode:'body-pose',description:'Follow the displayed body sprite, including opponent poses.',detail:'Recommended numbering: add a fixed offset to each base group and keep its index (200,3 → 10200,3 for bank 1). A reviewed mapping can override individual poses.'});
  if(action!==undefined){
    entries.push({label:'Timed accessory',recipePreset:'timed',runtimeMode:'independent-animation',policy:'static',action,bank,description:`Play Action ${action}; use static matching artwork during opponent animations.`,detail:`Pause with the player · hide with the owner · fallback bank ${bank??'none'} · unmatched poses hide.`});
    entries.push({label:'Continuous aura',recipePreset:'aura',runtimeMode:'independent-animation',policy:'continue',action,description:`Play Action ${action} through opponent animations.`,detail:'Pause with the player · hide with the owner · keep the same animation phase.'});
  }
  entries.push({label:prior?'Customize saved recipe…':'Customize recipe…',recipePreset:'custom',description:'Review Action, pause, visibility, fallback bank and exact pose exceptions.'});
  const preferred=prior?'saved':layer.source?.kind==='animation'?'timed':'body';
  return api.window.showQuickPick(entries.sort((a,b)=>Number(b.recipePreset===preferred)-Number(a.recipePreset===preferred)),{title,placeHolder:'Choose one complete in-game layer recipe; customize only the settings you need'});
}
async function openCostumeLayer(context, services = {}) {
  const api = services.api || require('vscode');
  const composition = normalizePreviewLayers(context.composition);
  const layer = composition.layers.find(item => item.id === composition.primary);
  const selectionNote = (composition.selected || []).filter(id => id !== 'base').length > 1 ? `Only primary layer ${layer.label} is installed in this review. Other selected layers require their own Use Costume Layer review.` : '';
  if (layer.id === 'base' || !layer.enabled) throw new Error('Select an enabled overlay layer in the viewer.');
  if ((context.airOnly || layer.source.kind !== 'animation') && (layer.source.kind !== 'bank' || layer.source.bank < 1)) throw new Error('In Layer artwork, choose Follow base and select the sprite bank containing the costume frames. Then generate the layer Actions.');
  if (!context.sffPath || !path.isAbsolute(context.sffPath)) throw new Error('Open the assigned character SFF before generating a costume layer.');
  const title = (context.airOnly ? 'Generate Layer Animations · ' : 'Use Costume Layer · ') + layer.label;
  const owners = [];
  async function addOwner(filename) {
    if (!path.isAbsolute(filename)) return;
    const def = await snapshot(api, filename);
    const assets = assignments(filename, def.text);
    if (assets.air && assets.sff && pathKey(assets.sff) === pathKey(context.sffPath) &&
        (!context.airPath || pathKey(assets.air) === pathKey(context.airPath))) {
      owners.push({ label: path.basename(filename), description: filename, def, assets });
    }
  }
  for (const filename of new Set(context.ownerDefs || [])) await addOwner(filename);
  if (!owners.length) {
    const choice = await api.window.showOpenDialog({ title: 'Choose the character DEF that assigns this viewer’s assets',
      defaultUri: api.Uri.file(path.dirname(context.sffPath)), filters: { 'Character definitions': ['def'] },
      canSelectMany: false, canSelectFiles: true, canSelectFolders: false, openLabel: 'Use character DEF' });
    if (!choice?.length) return;
    await addOwner(choice[0].fsPath);
  }
  if (!owners.length) throw new Error('Open the AIR or SFF assigned by the character DEF to use its costume layer.');
  const owner = owners.length === 1 ? owners[0] : await api.window.showQuickPick(owners, { title, placeHolder: 'Choose the character that will use this costume' });
  if (!owner) return;
  const { assets } = owner;
  const linkSpec=(slot,id)=>({...((slot===layer.id&&context.equipment)?{equipment:context.equipment}:{}),linkId:require('./authoring_links').stableId('layer',pathKey(owner.def.document.fileName),slot,id),linkLabel:composition.layers.find(item=>item.id===slot)?.label||slot});
  const stamp = sffStamp(assets.sff);
  const air = await snapshot(api, assets.air);
  const baseActions = model.airActions(air.text).filter(item => !item.marker);
  const actionIds = baseActions.map(item => item.number);
  const statePaths = new Map(assets.states.map(filename => [pathKey(filename), filename]));
  const allPaths = new Map(statePaths);
  if (assets.cmd) allPaths.set(pathKey(assets.cmd), assets.cmd);
  const sources = context.airOnly ? [] : await Promise.all([...allPaths.values()].map(filename => snapshot(api, filename)));
  let priorRecipe;
  if(!context.airOnly)for(const source of sources)for(const match of source.text.matchAll(/^[^\r\n]+/gm)) {
    if(match[0].startsWith((language(source.document.fileName)==='zss'?'# ':'; ')+'IKEMaker managed costume '+layer.id+' ')) {
      priorRecipe=managedSpecification(match[0],source.text,match.index)?.spec;
    }
  }
  const selectedRecipe=!context.airOnly&&context.runtimeMode===undefined&&priorRecipe?.runtimeMode!=='legacy'?await chooseLayerRecipe(api,{title,layer,prior:priorRecipe,actions:baseActions,sprites:context.sprites}):null;
  if(!context.airOnly&&context.runtimeMode===undefined&&priorRecipe?.runtimeMode!=='legacy'&&!selectedRecipe)return;
  let runtimeMode = selectedRecipe?.recipePreset==='saved'?priorRecipe.runtimeMode:selectedRecipe?.runtimeMode || context.runtimeMode || (layer.source.kind === 'animation' ? 'independent-animation' : priorRecipe?.runtimeMode === 'independent-animation' ? 'independent-animation' : 'body-pose');
  let runtimePause = selectedRecipe&&selectedRecipe.recipePreset!=='saved'&&selectedRecipe.recipePreset!=='custom'?'owner':priorRecipe?.runtimePause || 'owner';
  let runtimeVisibility = selectedRecipe&&selectedRecipe.recipePreset!=='saved'&&selectedRecipe.recipePreset!=='custom'?'1':priorRecipe?.runtimeVisibility || '1';
  let runtimeVisibilityPolicy = selectedRecipe&&selectedRecipe.recipePreset!=='saved'&&selectedRecipe.recipePreset!=='custom'?'owner':priorRecipe?.runtimeVisibilityPolicy || 'owner';
  let runtimeAction = selectedRecipe&&selectedRecipe.recipePreset!=='saved'&&selectedRecipe.recipePreset!=='custom'?selectedRecipe.action:priorRecipe?.runtimeAction ?? layer.source.action;
  let foreignPose = ['saved','custom'].includes(selectedRecipe?.recipePreset)?(priorRecipe?.foreignPose||priorRecipe?.runtimeMode==='independent-animation'&&{policy:'continue',bank:null}):undefined;
  const chooseProfile=async()=>{
    const profile = await api.window.showQuickPick([
      { label:'Follow body pose', description:'Match displayed sprite group/index, including opponent custom states; inherit owner drawing effects where supported.', runtimeMode:'body-pose' },
      { label:'Play a timed animation', description:'Use one existing AIR Action with its own timing; it does not follow each body sprite.', runtimeMode:'independent-animation' }
    ].sort((a,b)=>Number(b.runtimeMode===runtimeMode)-Number(a.runtimeMode===runtimeMode)), { title, placeHolder:'Choose how this layer follows the character in game' });
    if(!profile)return false;
    runtimeMode=profile.runtimeMode;
    return true;
  };
  const chooseAction=async()=>{
    const animation = await api.window.showQuickPick([...baseActions].sort((a,b)=>Number(b.number===runtimeAction)-Number(a.number===runtimeAction)).map(action=>({label:'Action '+action.number, description:action.name || 'Existing character animation', action:action.number})), {title,placeHolder:'Choose the existing animation for this timed layer'});
    if (!animation) return false;
    runtimeAction = animation.action;
    return true;
  };
  const choosePause=async()=>{
    const pause = await api.window.showQuickPick([
      { label:'Pause with the player', runtimePause:'owner' },
      { label:'Keep playing during pauses', runtimePause:'never' },
      { label:'Freeze the first frame', runtimePause:'always' }
    ].sort((a,b)=>Number(b.runtimePause===runtimePause)-Number(a.runtimePause===runtimePause)), { title, placeHolder:'How should this animation behave during pauses?' });
    if (!pause) return false;
    runtimePause = pause.runtimePause;
    return true;
  };
  const chooseVisibility=async()=>{
    const visible = await api.window.showQuickPick([
      { label:'Hide with the character', expression:'1', policy:'owner' },
      { label:'Keep visible when the character is invisible', expression:'1', policy:'always' },
      { label:'Only while the player is alive', expression:'alive' },
      { label:'Use a visibility condition...', custom:true }
    ].sort((a,b)=>{const selected=item=>item.custom?!['1','alive'].includes(runtimeVisibility):item.expression===runtimeVisibility&&(item.policy||'owner')===runtimeVisibilityPolicy;return Number(selected(b))-Number(selected(a));}), { title, placeHolder:'When should this layer be visible?' });
    if (!visible) return false;
    const previousVisibility=runtimeVisibility;
    runtimeVisibilityPolicy = visible.policy || runtimeVisibilityPolicy;
    runtimeVisibility = visible.expression;
    if (visible.custom) {
      runtimeVisibility = await api.window.showInputBox({ title, prompt:'Visibility trigger (for example: stateno = 200)', value:previousVisibility });
      if (runtimeVisibility === undefined) return false;
    }
    return true;
  };
  const chooseOpponent=async()=>{
    const choice=await chooseForeignPosePlan(api,{title,prior:foreignPose,installed:priorRecipe?.runtimeMode==='independent-animation',actions:baseActions,sprites:context.sprites});
    if(!choice)return false;
    foreignPose=choice.legacy?{policy:'continue',bank:null}:choice;
    return true;
  };
  if(!context.airOnly&&selectedRecipe?.recipePreset==='custom'){
    const banks=[...new Set((context.sprites||[]).map(sprite=>Math.floor(Number(sprite.group)/10000)).filter(value=>value>=1&&value<=6))];
    if(runtimeMode==='independent-animation'&&!foreignPose)foreignPose={policy:'static',bank:banks.includes(layer.source?.bank)?layer.source.bank:banks[0]??null};
    for(let count=0;count<64;count++){
      const timed=runtimeMode==='independent-animation';
      const entries=[
        {label:'Done · review generated code',setting:'done'},
        ...(layer.source.kind==='animation'?[]:[{label:'Behavior',description:timed?'Timed animation':'Follow body pose',setting:'profile'}]),
        {label:'Action',description:timed?String(runtimeAction??'choose an Action'):'Follows displayed body sprite',setting:'action'},
        {label:'Pause',description:timed?({owner:'With player',never:'Keep playing',always:'Frozen first frame'}[runtimePause]||runtimePause):'Inherits body pose',setting:'pause'},
        {label:'Visibility',description:timed?`${runtimeVisibilityPolicy==='always'?'Always':'With owner'} · ${runtimeVisibility}`:'Inherits body pose',setting:'visibility'},
        {label:'Opponent poses',description:timed?`${foreignPose?.policy||'static'} · bank ${foreignPose?.bank??'none'} · ${Object.keys(foreignPose?.mapping||{}).length} static · ${Object.keys(foreignPose?.timed||{}).length} timed overrides`:'Matches displayed body sprite',setting:'opponent'}
      ];
      const selected=await api.window.showQuickPick(entries,{title,placeHolder:'Recipe settings · choose only an exception to edit, or review the generated code'});
      if(!selected)return;
      if(selected.setting==='done')break;
      if(selected.setting==='profile'){if(!await chooseProfile())return;if(runtimeMode==='independent-animation'&&!foreignPose)foreignPose={policy:'static',bank:banks.includes(layer.source?.bank)?layer.source.bank:banks[0]??null};continue;}
      if(!timed){if(!await chooseProfile())return;if(runtimeMode==='body-pose')continue;if(!foreignPose)foreignPose={policy:'static',bank:banks.includes(layer.source?.bank)?layer.source.bank:banks[0]??null};}
      if(selected.setting==='action'&&!await chooseAction())return;
      if(selected.setting==='pause'&&!await choosePause())return;
      if(selected.setting==='visibility'&&!await chooseVisibility())return;
      if(selected.setting==='opponent'&&!await chooseOpponent())return;
      if(count===63)throw Error('Too many recipe setting edits. Reopen the layer review.');
    }
  } else if (!context.airOnly && runtimeMode === 'independent-animation' && !selectedRecipe) {
    if(!await chooseAction()||!await choosePause()||!await chooseVisibility()||!await chooseOpponent())return;
  } else if(selectedRecipe?.recipePreset==='timed')foreignPose={policy:'static',bank:selectedRecipe.bank};
  else if(selectedRecipe?.recipePreset==='aura')foreignPose={policy:'continue',bank:null};
  const scopes = [];
  if (!context.airOnly) scopes.push({ label: 'Every matching SFF sprite (includes custom states)', action: 'all', foreignPoses: true,
    description: 'Follow this character’s sprites during opponent-controlled throws, including poses absent from its AIR.' });
  scopes.push({ label: 'All character Actions', action: 'all', foreignPoses: false,
    description: context.airOnly ? 'Create layer animations for matching body poses' : 'Follow the animations in this character’s AIR.' });
  if (actionIds.includes(context.action)) scopes.push({ label: 'Current Action ' + context.action, action: context.action });
  else scopes.push({ label: 'Choose one Action…', choose: true });
  const scope = !context.airOnly && runtimeMode !== 'legacy' ? { action:'all', foreignPoses:runtimeMode === 'body-pose' } : await api.window.showQuickPick(scopes, { title, placeHolder: context.airOnly ? 'Choose Actions for the layer animations' : 'Where should the costume layer appear?' });
  if (!scope) return;
  let scopeAction = scope.action;
  if (scope.choose) {
    const selection = await api.window.showQuickPick(actionIds.map(action => ({ label: 'Action ' + action, action })), { title, placeHolder: 'Choose the character Action' });
    if (!selection) return;
    scopeAction = selection.action;
  }
  const input = { airText: air.text, sprites: context.sprites, layer, scopeAction, occupiedActionIds: actionIds };
  const currentSprites = (services.readSff || require('./sff_reader').readSff)(assets.sff).sprites;
  if (currentSprites.length !== context.sprites.length || currentSprites.some((sprite, i) =>
    sprite.group !== context.sprites[i].group || sprite.number !== context.sprites[i].number)) {
    throw new Error('The SFF sprite list changed. Refresh the viewer and select the layer again.');
  }
  if (context.airOnly) {
    const generate = services.generateAir || model.buildLayerAnimations;
    const result = generate(input);
    return reviewResult(api, { title, result, air, reviewed: [owner.def, air], assets, stamp, selectionNote });
  }
  if (!assets.ikemenVersion) throw new Error('The costume Explod needs IKEMEN GO 1.0 or newer for ModifyExplod anim. Set ikemenversion = 1.0 or newer in [Info] of ' + owner.def.document.fileName + ', then reopen the costume review.');
  const phase = runtimeMode !== 'legacy' ? {stateNumber:'+1', statePhase:'post'} : await api.window.showQuickPick([
    { label: 'After move code (State +1)', description: 'Recommended for animation changes during the tick', statePhase: 'post', stateNumber: '+1' },
    { label: 'Before move code (State -4)', description: 'Update the costume before the current move runs', statePhase: 'pre', stateNumber: model.COSTUME_STATE_NUMBER }
  ], { title, placeHolder: 'When should the costume follow the player’s animation?' });
  if (!phase) return;
  const { stateNumber, statePhase } = phase;
  const postGlobals = sources.flatMap(source => globalSections(source.text, language(source.document.fileName), '+1').map(section => ({source, section})));
  if (stateNumber === '+1' && postGlobals.length > 1) throw Error('Multiple assigned StateDef +1 sections exist. Resolve the duplicate global sections before applying costume code.');
  const marker = 'IKEMaker managed costume ' + layer.id + ' ' + layer.source.kind + ':' + (layer.source.kind === 'animation' ? runtimeAction : layer.source.bank) + ' ';
  const order = orderedPreviewLayers(composition).filter(item=>item.id==='base'||item.enabled);
  const syncLayer = order.indexOf(layer) - order.findIndex(item => item.id === 'base');
  const generate = services.generate || model.buildCostumeExplod;
  function makeResult(filename, explodId, extra = {}) {
    const equipment=((extra.layer?.id || layer.id) === layer.id ? context.equipment : undefined) || extra.equipment;
    if(equipment){
      const files=sections(parseDef(owner.def.text,owner.def.document.fileName),'files')[0];
      if(files?.entries.some(entry=>/^pal\d+$/i.test(entry.normalized)&&unquote(entry.value).trim()))throw Error('Equipment palette switching requires embedded SFF palettes. Remove external ACT assignments before baking and reviewing again.');
      const hash=require('crypto').createHash('sha256').update(fs.readFileSync(assets.sff)).digest('hex');
      if(equipment.archiveHash&&equipment.archiveHash!==hash)throw Error('The equipment palette pairs belong to a different SFF revision. Reopen the silhouette bake review after changing or undoing the archive.');
    }

    return generate({ ...input, runtimeMode, runtimeAction, runtimePause, runtimeVisibility,runtimeVisibilityPolicy, ...(runtimeMode==='independent-animation'?{foreignPose}:{}), foreignPoses: !!scope.foreignPoses, allowForeignOnly: !!scope.foreignPoses, statePhase, layer:{...layer, syncLayer}, baseLayer:composition.layers.find(item=>item.id==='base'),
      explodId, language:language(filename), ...extra, equipment });
  }
  const installed=[];
  for(const source of sources)for(const match of source.text.matchAll(/^[^\r\n]+/gm)){
    const found=/^[#;] IKEMaker managed costume (layer[1-4]) (bank|mapping|animation):(\d+) Explod (\d+)(?: ; ikm2=[^\r\n]+)?$/.exec(match[0]);
    if(found)installed.push({source,match,layerId:found[1],sourceKind:found[2],bank:Number(found[3]),id:Number(found[4])});
  }
  for(const slot of new Set(installed.map(record=>record.layerId)))if(installed.filter(record=>record.layerId===slot).length!==1)throw Error('Multiple installed blocks own costume '+slot+'. Review the source before refreshing the composition.');
  const rank=slot=>order.findIndex(item=>item.id===slot.id)-order.findIndex(item=>item.id==='base');
  function* recordOptions(record){
    const text=record.source.text,at=record.match.index,line=record.match[0],sealed=managedSpecification(line,text,at);
    if(sealed){const spec={runtimeMode:'legacy',...sealed.spec};if(spec.runtimeMode==='independent-animation'&&!spec.foreignPose)spec.foreignPose={policy:'continue',bank:null};yield{spec,previous:''};return;}
    let body=text.slice(at+line.length);
    const boundary=/^[ \t]*(?:[#;] IKEMaker managed costume |\[(?:statedef|function)\b)/gim;let next=boundary.exec(body);
    if(next&&/^\s*\[statedef/i.test(next[0])&&/^\s*(?:[#;][^\n]*\r?\n)?\s*$/.test(body.slice(0,next.index)))next=boundary.exec(body);
    if(next)body=body.slice(0,next.index);
    const ownHeader=/^\s*(?:[#;][^\n]*\r?\n)?\s*\[statedef\s+([+-]?\d+)\]/i.exec(body),section=allStateSections(text,language(record.source.document.fileName)).find(item=>at>item.start&&at<item.end),header=ownHeader?.[1]||section?.stateNumber;
    const oldPhase=String(header)==='+1'?'post':String(header)==='-4'?'pre':null;if(!oldPhase)throw Error('Cannot establish the installed costume global state. No composition changes were applied.');
    const oldRank=/\bsynclayer\s*[:=]\s*(-?\d+)/i.exec(body),oldPriority=/\bsprpriority\s*[:=]\s*(-?\d+)/i.exec(body),oldPos=/\bpos\s*[:=]\s*(-?\d+)[^,;\r\n]*,\s*(-?\d+)/i.exec(body),oldLabel=/IKEMaker costume layer "([^"\r\n]+)"/.exec(body);
    const current=composition.layers.find(item=>item.id===record.layerId),oldLayer={...current,label:oldLabel?.[1]||current.label,x:Number(oldPos?.[1]||0),y:Number(oldPos?.[2]||0),syncLayer:Number(oldRank?.[1]||1),runtimeRendering:/\bsyncid\s*[:=]\s*0(?:[;\r\n]|$)/i.test(body)?'independent':'grouped',runtimePriority:Number(oldPriority?.[1]||0)};
    const clock=/\banimfreeze\s*[:=]\s*1(?:[;\r\n]|$)/i.test(body)?'frozen':'follow';
    const literals=[...body.matchAll(/\banim\s*=\s*(-?\d+)/gi)].map(match=>Number(match[1])),ranges=[...body.matchAll(/\banim\s*>=\s*(-?\d+)\s*&&\s*anim\s*<=\s*(-?\d+)/gi)].map(match=>[Number(match[1]),Number(match[2])]);
    const admitted=actionIds.filter(id=>literals.includes(id)||ranges.some(([first,last])=>id>=first&&id<=last)),inferred=admitted.length===1?admitted[0]:admitted;
    const scopes=[...new Map(['all',scopeAction,...(admitted.length?[inferred]:[])].map(value=>[JSON.stringify(value),value])).values()],hadForeign=/animElemVar/i.test(body),oldDraw=!/\blayerno\s*[:=]\s*layerno/i.test(body),oldForeign=hadForeign&&!/_foreign/.test(body);
    for(const oldScope of scopes)for(const foreignPoses of [hadForeign,!hadForeign])for(const legacyForeignPoses of [oldForeign,!oldForeign])for(const legacyDrawSync of [oldDraw,!oldDraw]){
      try{const previous=makeResult(record.source.document.fileName,record.id,{layer:oldLayer,baseLayer:{x:0,y:0,order:0},runtimeMode:'legacy',scopeAction:oldScope,statePhase:oldPhase,explodClock:clock,foreignPoses,allowForeignOnly:foreignPoses,legacyForeignPoses,legacyDrawSync});yield{spec:{runtimeMode:'legacy',scopeAction:oldScope,statePhase:oldPhase,explodClock:clock,foreignPoses},previous:previous.stateCode};}catch(_){}
    }
  }

  function refreshRecord(record,result,spec){
    for(const old of recordOptions(record)){
      if(old.spec.statePhase!==spec.statePhase)continue;
      const patch=managedRefreshPatch(record.source.text,record.match.index,record.match[0],old.previous,result.stateCode,String(model.COSTUME_STATE_PHASES[spec.statePhase]),language(record.source.document.fileName),{...spec,version:2});if(patch){if(!patch.unchanged&&spec.runtimeMode==='independent-animation')patch.code=patch.code.replace(/(IKEMaker managed costume layer[1-4] animation:)\d+/, '$1'+spec.runtimeAction);return patch;}
    }
    throw Error('Installed costume '+record.layerId+' differs from a recognized generated block. No composition edits were applied. Review manual edits, source choice, scope or timing first.');
  }
  function preflightPatches(result,source,id,removed=null,slotId=layer.id,generatedSource=source) {
    if(!result.preStateCode)return [];
    const prefix=(language(source.document.fileName)==='zss'?'# ':'; ')+'IKEMaker costume preflight '+slotId+' Explod '+id;
    const hits=sources.flatMap(item=>[...item.text.matchAll(/^[^\r\n]+/gm)].filter(match=>match[0].replace(/^[#;] /,'').startsWith('IKEMaker costume preflight '+slotId+' Explod '+id+' ; ikm2=')).map(match=>({source:item,match})));
    if(hits.length>1)throw Error('Multiple costume preflight blocks exist. Review the generated source before applying.');
    const spec={version:2,...linkSpec(slotId,id),scopeAction:'all',statePhase:'pre',explodClock:'frozen',foreignPoses:false,omitHeader:false};delete spec.equipment;
    if(hits.length){
      const hit=hits[0],sealed=managedSpecification(hit.match[0],hit.source.text,hit.match.index),eol=hit.source.text.includes('\r\n')?'\r\n':'\n';
      const preCode=language(hit.source.document.fileName)===language(generatedSource.document.fileName)?result.preStateCode:makeResult(hit.source.document.fileName,id,{runtimeMode:'body-pose',layer:{...composition.layers.find(item=>item.id===slotId),syncLayer:rank({id:slotId})}}).preStateCode;
      const code=sealManagedBlock(sealed.baseMarker,preCode,{...spec,omitHeader:sealed.spec.omitHeader},'-4',eol);
      return hit.source.text.slice(hit.match.index,sealed.end)===code?[]:[{source:hit.source,patch:{offset:hit.match.index,end:sealed.end,code}}];
    }
    const destinations=sources.flatMap(item=>globalSections(item.text,language(item.document.fileName),'-4').filter(section=>item!==source||!removed||section.start<removed.offset||section.start>=removed.end).map(section=>({source:item,section})));
    if(destinations.length>1)throw Error('Multiple assigned StateDef -4 sections exist. Resolve the duplicate global sections before applying costume code.');
    const target=destinations[0]?.source||source,destination=destinations[0]?.section,text=target.text,eol=text.includes('\r\n')?'\r\n':'\n';
    const preCode=language(target.document.fileName)===language(generatedSource.document.fileName)?result.preStateCode:makeResult(target.document.fileName,id,{runtimeMode:'body-pose',layer:{...composition.layers.find(item=>item.id===slotId),syncLayer:rank({id:slotId})}}).preStateCode;
    const targetPrefix=(language(target.document.fileName)==='zss'?'# ':'; ')+'IKEMaker costume preflight '+slotId+' Explod '+id;
    const patch=insertion(text,destination?.end??text.length,sealManagedBlock(targetPrefix,preCode,{...spec,omitHeader:!!destination},'-4',eol));
    return [{source:target,patch}];
  }
  function refreshPeers(primaryResult,primaryId){
    const patches=[],airCodes=[primaryResult.airCode],airReplacements=[];let stagedAir=air.text;
    function stage(result) {
      for(const patch of [...(result.airReplacements||[])].sort((a,b)=>b.offset-a.offset)) {
        const oldBlock=patch.oldBlock??stagedAir.slice(patch.offset,patch.end),original=air.text.indexOf(oldBlock);
        if(!oldBlock||original<0||air.text.indexOf(oldBlock,original+1)>=0)throw Error('Cannot uniquely identify the managed AIR atlas for refresh. No edits were applied.');
        airReplacements.push({...patch,offset:original,end:original+oldBlock.length,oldBlock});
        stagedAir=stagedAir.slice(0,patch.offset)+patch.code+stagedAir.slice(patch.end);
      }
      if(result.airCode)stagedAir+='\n'+result.airCode;
    }
    stage(primaryResult);
    for(const record of installed.filter(record=>record.layerId!==primaryId)){
      const slot=composition.layers.find(item=>item.id===record.layerId);
      if(!slot?.enabled||slot.source.kind!==record.sourceKind||record.sourceKind!=='animation'&&slot.source.bank!==record.bank)throw Error('Installed costume '+record.layerId+' is disabled or has different artwork. Restore its source or review/remove its generated block before refreshing the composition.');
      const options=recordOptions(record);let matched=null;
      for(const old of options){
        const result=makeResult(record.source.document.fileName,record.id,{...old.spec,layer:{...slot,syncLayer:rank(slot)},scopeAction:old.spec.scopeAction,statePhase:old.spec.statePhase,explodClock:old.spec.explodClock,foreignPoses:old.spec.foreignPoses,allowForeignOnly:old.spec.foreignPoses,airText:stagedAir});
        const patch=managedRefreshPatch(record.source.text,record.match.index,record.match[0],old.previous,result.stateCode,String(model.COSTUME_STATE_PHASES[old.spec.statePhase]),language(record.source.document.fileName),{...old.spec,version:2});
        if(patch){matched={patch,result};break;}
      }
      if(!matched)throw Error('Installed costume '+record.layerId+' was edited or uses an unsupported legacy generation. No composition changes were applied.');
      patches.push(...preflightPatches(matched.result,record.source,record.id,null,record.layerId));
      if(!matched.patch.unchanged)patches.push({source:record.source,patch:matched.patch});
      if(matched.result.airCode)airCodes.push(matched.result.airCode);
      stage(matched.result);
    }
    return{patches,result:{...primaryResult,airReplacements,airCode:airCodes.filter(Boolean).join('\n'),summary:{...primaryResult.summary,warnings:[...primaryResult.summary.warnings,'This review refreshes every recognized installed costume layer to the current composition order; all listed source patches apply together.']}}};
  }
  const primary=installed.find(record=>record.layerId===layer.id);
  if(primary){
    if(primary.sourceKind!==layer.source.kind||primary.sourceKind!=='animation'&&primary.bank!==layer.source.bank)throw Error('The installed selected costume uses different artwork. Review/remove its old generated block before changing the source.');
    let installedSpec = recordOptions(primary).next().value?.spec;
    if (runtimeMode !== 'legacy' && installedSpec?.runtimeMode === 'legacy') {
      const choice = await api.window.showQuickPick([
        {label:'Upgrade to displayed-pose following (recommended)',upgrade:true,description:'Review moving this layer from its old global state to State +1'},
        {label:'Keep the existing costume behavior',upgrade:false}
      ],{title,placeHolder:'This layer uses an older costume recipe'});
      if (!choice) return;
      if (choice.upgrade) {
        const filename=primary.source.document.fileName,syntax=language(filename),text=primary.source.text;
        let end;
        const sealed=managedSpecification(primary.match[0],text,primary.match.index);
        if(sealed) end=sealed.end;
        else for(const old of recordOptions(primary)) {
          const verified=upgradeCostumePatch(text,primary.match.index,primary.match[0],old.previous,old.previous,String(model.COSTUME_STATE_PHASES[old.spec.statePhase]),syntax,true);
          if(verified){end=verified.end;break;}
        }
        if(end===undefined)throw Error('The installed costume differs from recognized generated code. No upgrade edits were applied.');
        const destination=postGlobals[0]?.section,postSource=postGlobals[0]?.source||primary.source;
        const postText=postSource.text,postFilename=postSource.document.fileName;
        const result=makeResult(postFilename,primary.id,{runtimeMode:'body-pose',statePhase:'post'});
        const spec={version:2,...linkSpec(layer.id,primary.id),scopeAction:'all',foreignPoses:true,statePhase:'post',runtimeMode:'body-pose',explodClock:result.summary.explodClock,omitHeader:!!destination};
        const originalMarker=sealed?.baseMarker||primary.match[0],marker=originalMarker.replace(/^[#;]/,language(postFilename)==='zss'?'#':';');
        const eol=postText.includes('\r\n')?'\r\n':'\n';
        const add=insertion(postText,destination?.end??postText.length,sealManagedBlock(marker,result.stateCode,spec,'+1',eol));
        const remove={offset:primary.match.index,end,code:''};
        const peers=refreshPeers(result,layer.id);
        peers.patches.push(...preflightPatches(result,primary.source,primary.id,remove,layer.id,postSource));
        return reviewResult(api,{title:'Upgrade costume following · '+layer.label,result:peers.result,air,reviewed:[owner.def,air,...sources],assets,stamp,target:postSource,statePatch:add,statePatches:[...peers.patches,{source:postSource,patch:add},{source:primary.source,patch:remove}],stateNumber:'+1',global:destination,selectionNote});
      }
    }
    if (runtimeMode === 'independent-animation' && installedSpec?.runtimeMode === 'independent-animation') installedSpec={...installedSpec,runtimeAction,runtimePause,runtimeVisibility,runtimeVisibilityPolicy,foreignPose};
    if (runtimeMode === 'legacy' && installedSpec?.runtimeMode === 'legacy') installedSpec = {...installedSpec,scopeAction,foreignPoses:!!scope.foreignPoses,statePhase};
    const filename=primary.source.document.fileName,result=makeResult(filename,primary.id,installedSpec),spec={...linkSpec(layer.id,primary.id),...installedSpec,...(result.summary.equipment?{equipment:result.summary.equipment}:{}),linkLabel:layer.label,explodClock:result.summary.explodClock};
    const patch=refreshRecord(primary,result,spec),peers=refreshPeers(result,layer.id),statePatches=[...peers.patches,...preflightPatches(result,primary.source,primary.id),...(patch.unchanged?[]:[{source:primary.source,patch}])];
    return reviewResult(api,{title:'Update costume composition · '+layer.label,result:peers.result,air,reviewed:[owner.def,air,...sources],assets,stamp,target:primary.source,statePatch:patch.unchanged?null:patch,statePatches,stateNumber:result.summary.statedef,selectionNote});
  }
  const candidates = sources.filter(source => (stateNumber !== '+1' || !postGlobals.length || source === postGlobals[0].source) && (statePaths.has(pathKey(source.document.fileName)) || globalSections(source.text, language(source.document.fileName), stateNumber).length));
  if (!candidates.length) throw new Error('Assign a state file in the character DEF before generating costume code.');
  const characterDir = path.dirname(owner.def.document.fileName);
  const choices = candidates.flatMap(source => {
    const relative = path.relative(characterDir, source.document.fileName);
    const shared = path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep);
    const globals = globalSections(source.text, language(source.document.fileName), stateNumber);
    return (globals.length ? globals : [null]).map(global => ({source, relative, shared, global}));
  }).sort((a, b) => Number(a.shared) - Number(b.shared) || Number(Boolean(b.global)) - Number(Boolean(a.global)));
  const picked = await api.window.showQuickPick(choices.map(item => {
    const file = item.source.document.fileName;
    const location = item.global ? 'Insert in existing StateDef ' + stateNumber + ' at line ' +
      (item.source.text.slice(0, item.global.start).split('\n').length) : 'Append a new StateDef ' + stateNumber;
    return { ...item, label:path.basename(file), description:item.relative,
      detail:item.shared ? location + ' · Outside this character folder. Other characters may use this file.' : location };
  }), {title, placeHolder:'Choose the assigned state source for the overlay'});
  if (!picked) return;
  const used = usedExplodIds(sources);
  let defaultId = 71000;
  while (used.has(defaultId)) defaultId++;
  const validateId = input => !/^\d+$/.test(input) || Number(input) > 2147483647 ? 'Enter a nonnegative 32-bit integer.'
    : used.has(Number(input)) ? 'This Explod ID already occurs in the assigned character code.' : undefined;
  const id = await api.window.showInputBox({ title, prompt: 'Explod ID for this costume layer', value: String(defaultId), validateInput: validateId });
  if (id === undefined) return;
  if (validateId(id)) throw new Error(validateId(id));
  const target = picked.source, filename = target.document.fileName;
  const result = makeResult(filename, Number(id));
  if (result.summary.statedef !== stateNumber) throw new Error('The generated StateDef does not match the reviewed destination.');
  const installedMarker = (language(filename) === 'zss' ? '# ' : '; ') + marker + 'Explod ' + id;
  const eol=target.text.includes('\r\n')?'\r\n':'\n',spec={version:2,...linkSpec(layer.id,Number(id)),scopeAction,foreignPoses:!!scope.foreignPoses,statePhase,runtimeMode,runtimeAction,runtimePause,runtimeVisibility,runtimeVisibilityPolicy,...(runtimeMode==='independent-animation'?{foreignPose}:{}),explodClock:result.summary.explodClock,omitHeader:!!picked.global,...(result.summary.equipment?{equipment:result.summary.equipment}:{})};
  const statePatch=insertion(target.text,picked.global?.end??target.text.length,sealManagedBlock(installedMarker,result.stateCode,spec,stateNumber,eol));
  if (!statePatch) throw new Error('No costume controllers were generated.');
  const peers=refreshPeers(result,layer.id);
  return reviewResult(api, { title, result:peers.result, air, reviewed: [owner.def, air, ...sources], assets, stamp, target, statePatch,statePatches:[...peers.patches,...preflightPatches(result,target,Number(id)),{source:target,patch:statePatch}], global: picked.global, stateNumber,selectionNote });
}

// Only replace an exact earlier IKEMaker block. Authored neighbors stay outside the edit.
function upgradeCostumePatch(text, start, marker, previous, next, stateNumber, syntax,allowUnchanged=false) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const globals = globalSections(text, syntax, stateNumber);
  const embedded = globals.some(section => start > section.start && start < section.end);
  function block(code, omitHeader) {
    let lines = code.trim().split(/\r?\n/);
    if (omitHeader) lines = lines.filter(line => line.trim().toLowerCase() !== ('[statedef ' + stateNumber + ']').toLowerCase());
    return [marker, ...lines].join(eol);
  }
  for (const omitHeader of embedded ? [false, true] : [false]) {
    const original = block(previous, omitHeader), code = block(next, omitHeader);
    if (text.startsWith(code, start)) return allowUnchanged?{unchanged:true,offset:start,end:start+code.length,code,omitHeader}:null;
    const end = start + original.length;
    if (original !== code && text.startsWith(original, start) && (end === text.length || /^\r?\n/.test(text.slice(end)))) {
      return {offset:start, end, code,...(allowUnchanged?{omitHeader}:{})};
    }
  }
  return null;
}

const pendingEdits = new Set();
function stateClipboardPlan(operations) {
  if (!Array.isArray(operations) || !operations.length) throw new Error('No reviewed state edits are available to copy.');
  return operations.map(({source,patch}, index) => {
    const filename = source.document.fileName, comment = language(filename) === 'zss' ? '#' : ';';
    const action = patch.code === '' ? `Remove characters ${patch.offset}–${patch.end}` : patch.end === undefined ? `Insert at character ${patch.offset}` : `Replace characters ${patch.offset}–${patch.end}`;
    return [`${comment} IKEMaker reviewed state edit ${index + 1}/${operations.length}`,
      `${comment} File: ${filename}`,
      `${comment} ${action} in the reviewed source snapshot.`,
      ...(patch.code ? [patch.code.trim()] : [`${comment} Remove the reviewed generated block; no replacement code.`])].join('\n');
  }).join('\n\n');
}
async function reviewResult(api, { title, result, air, reviewed, assets, stamp, target, statePatch,statePatches, global, stateNumber, selectionNote='' }) {
  const airPatch = insertion(air.text, air.text.length, result.airCode);
  const airOperations=[...(result.airReplacements||[]),...(airPatch?[airPatch]:[])].sort((a,b)=>b.offset-a.offset);
  for(let i=0;i<airOperations.length;i++) {
    const patch=airOperations[i];
    if(!Number.isInteger(patch.offset)||patch.offset<0||(patch.end!==undefined&&(!Number.isInteger(patch.end)||patch.end<patch.offset||patch.end>air.text.length))||typeof patch.code!=='string')throw Error('The generated AIR replacement is invalid. No edits were applied.');
    if(i&&((patch.end??patch.offset)>airOperations[i-1].offset))throw Error('Generated AIR patches overlap. No edits were applied.');
    if(patch.oldBlock!==undefined&&air.text.slice(patch.offset,patch.end)!==patch.oldBlock)throw Error('The generated AIR block changed. Reopen the costume review.');
  }
  const hasAir=airOperations.length>0;
  checkReview(reviewed, assets.sff, stamp);
  const map = (result.actions || []).map(action => `Action ${action.baseAction} → ${action.layerAction} · ${action.mappedFrames} mapped, ${action.blankFrames} blank`);
  const warnings = [...(result.summary?.warnings || [])];
  if (result.summary?.requires) warnings.push(result.summary.requires);
  const summary = result.summary || {};
  const counts = `${summary.created ?? 0} new · ${summary.updated ?? 0} updated · ${summary.reused ?? 0} reused · ${summary.skipped?.length || 0} Actions skipped · ${summary.blankFrames ?? 0} blank elements`;
  const pose = summary.foreignPoseAction;
  const throwInfo = pose && summary.runtimeMode === 'body-pose' ? `${pose.poses} mapped poses, including opponent-controlled throws. Unmapped sprites hide the layer. AIR lookup action ${pose.action}.` : pose && summary.runtimeMode !== 'independent-animation' ? `Every matching SFF sprite · ${pose.poses} covered in custom states · Action ${pose.action} ${pose.status}.` : pose ? `${pose.poses} poses in AIR lookup Action ${pose.action} (${pose.status}).` : '';
  const foreign=summary.foreignPose,foreignInfo=summary.runtimeMode==='independent-animation'&&foreign?`Opponent poses · ${foreign.policy==='continue'?'continue original Action':'static pose'}${foreign.bank?' · fallback bank '+foreign.bank:''} · ${foreign.mappedStaticCount||0} explicit static mappings · ${foreign.timedCount||0} timed Action overrides · ${foreign.missingCount||0} unmatched pose(s)${foreign.policy==='continue'?' continue the original animation.':' hide the accessory.'}`:'';
  const orderedStateOperations=(statePatches||[...(statePatch?[{source:target,patch:statePatch}]:[])]).slice().sort((a,b)=>pathKey(a.source.document.fileName).localeCompare(pathKey(b.source.document.fileName))||b.patch.offset-a.patch.offset);
  const stateOperations=[];
  for(const item of orderedStateOperations){
    const last=stateOperations.at(-1);
    if(last&&pathKey(last.source.document.fileName)===pathKey(item.source.document.fileName)&&last.patch.offset===item.patch.offset&&last.patch.end===undefined&&item.patch.end===undefined){
      last.patch={...last.patch,code:last.patch.code+item.patch.code};
    } else stateOperations.push({...item});
  }
  const hasState=stateOperations.length>0;
  const runtimeInfo = summary.runtimeMode === 'independent-animation' ? 'Independent animation · Action ' + summary.runtimeAction + ' · uses its own AIR timing · ' + (summary.runtimePause === 'never' ? 'keeps playing during pauses' : summary.runtimePause === 'always' ? 'frozen first frame' : 'pauses with the player') + ' · ' + (summary.runtimeVisibilityPolicy === 'always' ? 'stays visible when the character is invisible' : 'hides with the character') : summary.runtimeMode === 'body-pose' ? 'Body overlay · follows the displayed sprite group and index after move code (State +1)' : '';
  const recipeInfo = summary.runtimeMode === 'body-pose' ? 'Layer recipe · Body detail' : summary.runtimeMode === 'independent-animation' ? `Layer recipe · ${foreign?.policy === 'continue' ? 'Continuous aura' : 'Timed accessory'}` : '';
  const previewText = [title, selectionNote, recipeInfo, runtimeInfo, foreignInfo, counts, throwInfo, hasAir ? 'Update generated Actions in ' + assets.air : 'Reuse existing Actions in ' + assets.air,
    target && (!hasState ? 'Reuse matching costume code in ' : statePatch?.end !== undefined ? 'Update the previously generated block in ' : global ? 'Insert into StateDef ' + stateNumber + ' in ' : 'Append to ') + target.document.fileName,
    ...warnings, map.join('\n'), hasAir && 'Generated AIR (reviewed additions and replacements)', ...airOperations.map(patch=>patch.code.trim()),
    hasState && 'Generated state code (all installed composition patches)', ...stateOperations.map(item=>item.source.document.fileName+'\n'+item.patch.code.trim())].filter(Boolean).join('\n\n').replace(/\r\n/g, '\n');
  const preview = await api.workspace.openTextDocument({ content: previewText, language: 'plaintext' });
  await api.window.showTextDocument(preview, { preview: true });
  const apply = 'Apply reviewed edits', copyAir = 'Copy AIR Actions', copyState = 'Copy reviewed state edits (per file)';
  if (!hasAir && !hasState) {
    if (air.document.isDirty) {
      await api.window.showTextDocument(air.document, { preview: false });
      const save = 'Save ' + path.basename(assets.air);
      if (await api.window.showInformationMessage('The matching Actions are already in the edited AIR.', save) === save) {
        checkReview(reviewed, assets.sff, stamp);
        if (!await air.document.save()) throw new Error('Could not save ' + assets.air + '. The AIR is still open in the editor.');
        return { reused: true, saved: true };
      }
    } else {
      api.window.showInformationMessage(target ? 'The AIR and installed costume code already match this review.' : 'The matching layer Actions already exist in the assigned AIR.');
    }
    return { reused: true };
  }
  const choices = [apply];
  if (hasAir) choices.push(copyAir);
  if (hasState) choices.push(copyState);
  const copyPart='Copy one generated block…';
  if(stateOperations.filter(item=>item.patch.code).length>1)choices.push(copyPart);
  const choice = await api.window.showInformationMessage(title + ' · Review the code in the preview.', ...choices);
  if (!choices.includes(choice)) return;
  checkReview(reviewed, assets.sff, stamp);
  if (preview.getText().replace(/\r\n/g, '\n') !== previewText) throw new Error('The preview was edited. Reopen Use Costume Layer to review fresh output.');
  if(choice===copyPart){
    const part=await api.window.showQuickPick(stateOperations.filter(item=>item.patch.code).map(item=>({
      label:item.patch.code.includes('IKEMaker costume preflight')?'Setup · State -4':'Layer update · '+path.basename(item.source.document.fileName),
      detail:item.patch.code.trimStart().split(/\r?\n/,1)[0].split(' ; ikm2=')[0],item
    })),{title:'Copy one reviewed layer block'});
    if(!part)return;
    checkReview(reviewed,assets.sff,stamp);
    await api.env.clipboard.writeText(part.item.patch.code.trim());
    await require('./copied_layer_links').remember(reviewed[0]?.document.fileName,[part.item]);
    return {copied:true};
  }
  if (choice === copyAir || choice === copyState) {
    await api.env.clipboard.writeText(choice === copyAir ? airOperations.map(patch=>patch.code).join('\n\n') : stateClipboardPlan(stateOperations));
    if(choice===copyState)await require('./copied_layer_links').remember(reviewed[0]?.document.fileName,stateOperations);
    return { copied: true };
  }
  const changed = [...airOperations.map(patch=>[air,patch]), ...stateOperations.map(item=>[item.source,item.patch])].filter(([, patch]) => patch);
  const keys = changed.map(([source]) => pathKey(source.document.fileName));
  if (keys.some(key => pendingEdits.has(key))) throw new Error('Another layer edit is being applied. Reopen the review once it finishes.');
  for (const key of keys) pendingEdits.add(key);
  try {
    const edit = new api.WorkspaceEdit();
    for(const patch of airOperations){
      if(patch.end!==undefined)edit.replace(air.document.uri,new api.Range(air.document.positionAt(patch.offset),air.document.positionAt(patch.end)),patch.code);
      else edit.insert(air.document.uri,air.document.positionAt(patch.offset),patch.code);
    }
    for(const {source,patch}of stateOperations){
      if(patch.end!==undefined)edit.replace(source.document.uri,new api.Range(source.document.positionAt(patch.offset),source.document.positionAt(patch.end)),patch.code);
      else edit.insert(source.document.uri,source.document.positionAt(patch.offset),patch.code);
    }
    if (!await api.workspace.applyEdit(edit)) throw new Error('The editor declined the costume changes. Reopen the review and try again.');
  } finally {
    for (const key of keys) pendingEdits.delete(key);
  }
  const expected=new Map();for(const [source,patch]of changed){const key=pathKey(source.document.fileName),entry=expected.get(key)||{document:source.document,text:source.text,version:source.document.version};entry.text=entry.text.slice(0,patch.offset)+patch.code+entry.text.slice(patch.end??patch.offset);expected.set(key,entry)}
  const after=[...expected.values()];
  for (const source of after) if (source.document.getText() !== source.text) throw new Error('The editor result differs from the reviewed edits. Inspect the changed files before saving.');
  // Focus the real edited file so Ctrl+S always addresses character source.
  await api.window.showTextDocument(after[0].document, { preview: false });
  const save = changed.length === 1 ? 'Save ' + path.basename(after[0].document.fileName) : 'Save all edited files';
  if (await api.window.showInformationMessage(target ? 'Costume edits applied.' : 'Layer Actions added to the AIR.', save) === save) {
    for (const item of after) {
      if (item.document.isClosed || item.document.version !== item.version || item.document.getText() !== item.text) {
        throw new Error(path.basename(item.document.fileName) + ' changed after the costume edit. Review and save it from its editor.');
      }
      if (!await item.document.save()) throw new Error('Could not save ' + item.document.fileName + '. The edit remains open in the editor.');
    }
    return { applied: true, saved: true };
  }
  return { applied: true };
}

module.exports = { managedSpecification, allStateSections, openCostumeLayer, upgradeCostumePatch, assignments, globalSections, stateInsertion, usedExplodIds, stateClipboardPlan };
