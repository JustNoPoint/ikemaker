'use strict';

const styles = `
#pushboxesPanel{padding:8px;line-height:1.4}
#pushboxesPanel[hidden]{display:none!important}
.push-catalog-controls,.push-catalog-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#pushCatalogStatus{min-height:1.4em;margin:6px 0}
#pushboxesPanel details{border:1px solid var(--vscode-panel-border);margin:6px 0;padding:6px;overflow-wrap:anywhere}
#pushboxesPanel summary{cursor:pointer}
.push-catalog-use{padding:6px 0;border-top:1px solid var(--vscode-panel-border);margin-top:6px}
.push-catalog-baselines{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:6px;margin-top:6px}
.push-catalog-baselines>div{padding:6px;border:1px solid var(--vscode-panel-border)}
#pushCatalogProfiles{min-width:0}
`;

const markup = `<section id="pushboxesPanel" hidden role="tabpanel" aria-labelledby="airBrowserPushBoxesTab">
  <div class="push-catalog-controls">
    <button id="pushCatalogNew" type="button">New Profile…</button>
    <button id="pushCatalogRefresh" type="button">Refresh Sources</button>
    <button id="pushCatalogOwner" type="button" hidden>Choose Owner…</button>
    <span id="pushCatalogContext" class="muted"></span>
  </div>
  <p id="pushCatalogStatus" role="status" aria-live="polite"></p>
  <details open><summary>Constants baselines</summary><div id="pushCatalogConstants" class="push-catalog-baselines"></div></details>
  <div id="pushCatalogFrameDrafts"></div>
  <div id="pushCatalogProfiles" aria-label="Reusable profiles"></div>
</section>`;

function clientScript() {
  return `
  const pushboxesPanel=document.getElementById('pushboxesPanel'),pushCatalogProfiles=document.getElementById('pushCatalogProfiles'),pushCatalogConstants=document.getElementById('pushCatalogConstants'),pushCatalogStatus=document.getElementById('pushCatalogStatus'),pushCatalogOwner=document.getElementById('pushCatalogOwner');
  let pushCatalog=null,pushCatalogBusy=false,pushCatalogRevision=0,pushCatalogVisible=false;
  function requestPushCatalog(type,extra={}){
    if(pushCatalogBusy)return;
    pushCatalogBusy=true;
    const request=++pushCatalogRevision;
    pushCatalogStatus.textContent=type==='pushCatalogSnapshot'?'Reading the current owner and code…':'Opening push-box review…';
    updatePushCatalogButtons();
    vscode.postMessage({type,request,renderToken:model.browserRenderToken,...extra});
  }
  function updatePushCatalogButtons(){
    for(const button of pushboxesPanel.querySelectorAll('button'))button.disabled=pushCatalogBusy||button.dataset.lock==='true';
    document.getElementById('pushCatalogNew').disabled=pushCatalogBusy||!pushCatalog||!pushCatalog.constants.length;
    pushCatalogOwner.hidden=pushCatalog?.ownerChoices!==true;
  }
  function catalogButton(parent,label,command,profile,use,disabled=false){
    const button=document.createElement('button');
    button.type='button';button.textContent=label;button.dataset.lock=String(disabled);
    button.onclick=()=>requestPushCatalog('pushCatalogEdit',{
      command,profileId:profile?.profileId,useId:use?.id,action:selected?.number,
      element:collisionElement+1,marked:[...marked]
    });
    parent.append(button);
  }
  function catalogText(parent,text,className=''){
    const item=document.createElement('div');item.textContent=text;
    if(className)item.className=className;
    parent.append(item);return item;
  }
  function renderPushCatalog(){
    if(!pushCatalog)return;
    const expanded=new Set([...pushCatalogProfiles.querySelectorAll('details[open]')].map(node=>node.dataset.profile));
    pushCatalogProfiles.replaceChildren();pushCatalogConstants.replaceChildren();
    document.getElementById('pushCatalogContext').textContent=[pushCatalog.ownerLabel,pushCatalog.target].filter(Boolean).join(' · ');
    for(const baseline of pushCatalog.constants){
      const row=document.createElement('div');pushCatalogConstants.append(row);
      catalogText(row,baseline.label);
      const unresolved=baseline.unsupportedLines?.length||baseline.localizedLines?.length;
      catalogText(row,(unresolved?'':baseline.box.join(', ')+' · ')+baseline.provenance,'muted');
      if(baseline.line&&baseline.file){
        const button=document.createElement('button');button.type='button';button.textContent='Open constants line';
        button.onclick=()=>requestPushCatalog('pushCatalogOpenConstants',{pose:baseline.pose});row.append(button)
      }
    }
    const shapes=new Map();
    for(const profile of pushCatalog.profiles)shapes.set(profile.description,(shapes.get(profile.description)||0)+1);
    const labels={
      draft:'Unplaced draft',installed:'Authored source preview',missing:'Source marker missing',incomplete:'Link incomplete',
      ambiguous:'Ambiguous link',unsupported:'Unsupported source',unresolved:'Unresolved source','needs-remap':'Needs AIR review',
      'needs-review':'Needs source review','unresolved-owner':'Owner unresolved','unresolved-placement':'Placement unresolved'
    };
    if(!pushCatalog.profiles.length&&pushCatalog.constants.length)catalogText(pushCatalogProfiles,'Create a profile or refresh existing sources to start.','muted');
    const frameDrafts=document.getElementById('pushCatalogFrameDrafts');frameDrafts.replaceChildren();
    if(pushCatalog.frameDrafts?.length){
      const details=document.createElement('details'),summary=document.createElement('summary');
      summary.textContent='Saved frame drafts';details.append(summary);frameDrafts.append(details);
      for(const item of pushCatalog.frameDrafts)catalogText(details,item.geometry+' · '+item.uses.map(use=>'Action '+use.action+' element '+use.element+(use.status==='review'?' needs review':'')).join(', '),'muted');
    }
    for(const profile of pushCatalog.profiles){
      const card=document.createElement('details'),heading=document.createElement('summary');
      card.dataset.profile=profile.profileId;card.open=expanded.has(profile.profileId)||pushCatalog.profiles.length===1;
      heading.textContent=profile.name+' · '+profile.description+' · '+(profile.uses.length===1?'1 use':profile.uses.length+' uses');
      card.append(heading);pushCatalogProfiles.append(card);
      if(shapes.get(profile.description)>1)catalogText(card,'Geometry shared by '+shapes.get(profile.description)+' distinct profiles.','muted');
      if(profile.poseHint)catalogText(card,'Pose: '+profile.poseHint,'muted');
      const profileActions=catalogText(card,'','push-catalog-actions');
      catalogButton(profileActions,'Bind to Elements…','bind',profile,null,!selected);
      catalogButton(profileActions,'Rename…','rename',profile);
      catalogButton(profileActions,'Duplicate…','duplicate',profile);
      catalogButton(profileActions,'Edit Profile…','edit',profile);
      for(const use of profile.uses){
        const row=catalogText(card,'','push-catalog-use'),evidence=use.evidence;
        catalogText(row,'Action '+use.action+' · elements '+use.elements.join(', '));
        catalogText(row,[labels[evidence.status]||evidence.status,evidence.source?.dirty?'Unsaved code':evidence.status==='installed'?'Saved code':'',evidence.edited?'Source edited':'',evidence.profileDiffers?'Source geometry differs from profile':'',evidence.reason].filter(Boolean).join(' · '),'muted');
        if(use.placement)catalogText(row,use.placement.file+' · StateDef '+(evidence.source?.stateLabel??use.placement.stateOrHook)+(evidence.source?.controllerLine?' · line '+evidence.source.controllerLine:''),'muted');
        if(evidence.animationScope)catalogText(row,evidence.animationScope,'muted');
        if(evidence.interactions?.length)catalogText(row,'Controllers that may interact: '+evidence.interactions.map(item=>'OverrideClsn '+item.group+' at line '+item.line).join(', '),'muted');
        const actions=catalogText(row,'','push-catalog-actions'),stale=evidence.status==='needs-remap';
        catalogButton(actions,'Preview','preview',profile,use,stale);
        if(use.placement)catalogButton(actions,evidence.source?.controllerLine?'Open Source':'Open StateDef','open',profile,use);
        if(stale)catalogButton(actions,'Review Binding…','remap',profile,use);
        else{
          catalogButton(actions,'Review Code…','install',profile,use,!pushCatalog.supported||!pushCatalog.owner);
          catalogButton(actions,'Copy Recipe…','copy',profile,use,!pushCatalog.supported||!pushCatalog.owner);
        }
        catalogButton(actions,'Edit This Use…','edit',profile,use);
        catalogButton(actions,'Unlink…','unlink',profile,use);
      }
    }
    updatePushCatalogButtons();
  }
  document.getElementById('pushCatalogNew').onclick=()=>requestPushCatalog('pushCatalogEdit',{command:'new'});
  document.getElementById('pushCatalogRefresh').onclick=()=>requestPushCatalog('pushCatalogSnapshot');
  pushCatalogOwner.onclick=()=>requestPushCatalog('pushCatalogChooseOwner');
  addEventListener('message',event=>{
    const message=event.data||{};
    if(message.type!=='pushCatalogSnapshot'&&message.type!=='pushCatalogFinished')return;
    if(message.renderToken!==model.browserRenderToken)return;
    if(Number.isInteger(message.request)&&message.request!==pushCatalogRevision)return;
    pushCatalogBusy=false;
    if(message.catalog){pushCatalog=message.catalog;renderPushCatalog()}
    pushCatalogStatus.textContent=message.error||message.status||message.catalog?.reason||'';
    updatePushCatalogButtons();
  });
  const otherPrimary=renderPrimary;
  renderPrimary=()=>{
    otherPrimary();
    const visible=primaryView==='pushboxes';
    pushboxesPanel.hidden=!visible;
    if(visible&&!pushCatalogVisible)requestPushCatalog('pushCatalogSnapshot');
    pushCatalogVisible=visible;
  };
  if(primaryView==='pushboxes'){pushCatalogVisible=true;pushboxesPanel.hidden=false;requestPushCatalog('pushCatalogSnapshot')}
  const otherBusy=globalThis.ikemenIsBusy;
  globalThis.ikemenIsBusy=()=>pushCatalogBusy||otherBusy?.()===true;
  `;
}

function install(page) {
  return page
    .replace('</style>', styles + '</style>')
    .replace(/(<button [^>]*data-primary="references"[^>]*>[^<]*<\/button>)/, '$1<button id="airBrowserPushBoxesTab" role="tab" aria-controls="pushboxesPanel" data-primary="pushboxes">Push Boxes</button>')
    .replace('</main>', markup + '</main>')
    .replace('</script>', clientScript() + '</script>');
}

module.exports = { install };
