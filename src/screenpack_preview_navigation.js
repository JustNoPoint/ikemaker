'use strict';

function clockControls(){
  return '<div class="guide"><label>Preview tick <input id="motifPreviewTick" type="number" min="0" step="1" value="0" style="width:7em"></label><button id="motifPreviewPlay" type="button">Pause</button></div>';
}
function menuControls(){
  return '<div id="motifMenuTraversal" class="guide" hidden><select id="motifMenuItem" aria-label="Preview menu item"></select><button type="button" id="motifMenuGo">Enter</button><button type="button" id="motifMenuBack">Back</button></div>';
}

// Keep the clock in authored 60 Hz ticks. Scrubbing stops playback and leaves
// the chosen pose available to the same renderer used by drag and selection.
function makeClock(now) {
  let base=0, started=now(), running=true;
  return {
    tick(){return base+(running?Math.max(0,Math.floor((now()-started)*0.06)):0);},
    seek(tick){const value=Number(tick);base=Number.isFinite(value)?Math.max(0,Math.floor(value)):0;started=now();running=false;},
    play(){if (!running) {started=now();running=true;}},
    pause(){base=this.tick();running=false;},
    get running(){return running;}
  };
}

function destination(page,path,item,groups) {
  const full=path?path+'.'+item:item;
  if (groups.some(g=>g.path===full)) return {page,path:full};
  if (item==='back') return path ? {page,path:path.split('.').slice(0,-1).join('.')} : {page:'title info',path:''};
  if (page==='title info' && item==='options') return {page:'option info',path:''};
  if (page==='title info' && ['arcade','versus','training','teamarcade','teamversus','teamcoop','survival','survivalcoop','watch'].includes(item))
    return {page:'select info',path:''};
  return null;
}

function menuWindow(items,cursor,visible) {
  const count=Number.isFinite(visible)&&visible>0?Math.max(1,Math.floor(visible)):items.length;
  const selected=Math.max(0,Math.min(items.length-1,Number(cursor)||0));
  const start=Math.max(0,selected-count+1);
  return {start,end:Math.min(items.length,start+count)};
}

function traversalClientScript(){
  return `
  let menuCursor=0,menuCursorKey='',pendingMenuPath=null;
  const menuTrail=[],menuDestination=${destination.toString()},menuVisibleWindow=${menuWindow.toString()};
  function menuJump(target){
    if(!target)return;
    const targetIndex=model.screens.findIndex(screen=>screen.normalized===target.page);
    if(targetIndex<0)return;
    if(targetIndex===screenIndex){previewMenuPath=target.path;menuCursor=0;syncPreviewMenus();render();}
    else{pendingMenuPath=target;requestScreen(targetIndex);}
  }
  function syncMenuTraversal(){
    const box=document.getElementById('motifMenuTraversal'),picker=document.getElementById('motifMenuItem');
    if(!box||!picker)return;
    const page=current(),items=currentMenuItems(),key=screenIndex+'|'+previewMenuPath;
    if(key!==menuCursorKey){menuCursorKey=key;menuCursor=0;}
    const back=document.getElementById('motifMenuBack'),go=document.getElementById('motifMenuGo');
    const externalMenu=typeof data!=='undefined'&&(data.type==='lifebar'||data.workspaceMode==='select-layout');
    const mainMenu=externalMenu||page.normalized!=='title info'&&model.screens.some(s=>s.normalized==='title info');
    box.hidden=!items.length&&!menuTrail.length&&!mainMenu;
    picker.hidden=!items.length;go.hidden=!items.length;
    picker.innerHTML='';
    for(const [index,item] of items.entries()){
      const option=document.createElement('option');option.value=String(index);option.textContent=item.text;picker.appendChild(option);
    }
    menuCursor=Math.max(0,Math.min(items.length-1,menuCursor));
    picker.value=String(menuCursor);
    const target=menuDestination(page.normalized,previewMenuPath,items[menuCursor]?.name,page.menuGroups||[]);
    go.disabled=!target||!model.screens.some(s=>s.normalized===target.page);
    go.title=go.disabled?'This action runs in IKEMEN.':'Preview the destination';
    back.disabled=!menuTrail.length&&!previewMenuPath&&!mainMenu;
    back.title=menuTrail.length||previewMenuPath?'Return to the previous preview page':'Return to the screenpack main menu';
    picker.onchange=()=>{menuCursor=Number(picker.value)||0;syncMenuTraversal();render();};
    go.onclick=()=>{if(go.disabled)return;if(items[menuCursor]?.name==='back'&&menuTrail.length){menuJump(menuTrail.pop());return;}
      menuTrail.push({page:page.normalized,path:previewMenuPath});menuJump(target);};
    back.onclick=()=>{
      if(menuTrail.length)return menuJump(menuTrail.pop());
      if(previewMenuPath)return menuJump({page:page.normalized,path:previewMenuPath.split('.').slice(0,-1).join('.')});
      if(externalMenu)return post('openMainMenu');
      if(mainMenu)menuJump({page:'title info',path:''});
    };
  }`;
}
module.exports={clockControls,menuControls,makeClock,destination,menuWindow,traversalClientScript};
