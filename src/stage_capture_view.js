'use strict';

function html() {
  return `<section id="stageCaptureView" hidden aria-label="Engine frames" style="position:absolute;inset:0;z-index:6;overflow:auto;background:var(--vscode-editor-background);padding:8px;box-sizing:border-box">
    <header style="display:flex;justify-content:space-between;align-items:center"><h3>Engine frames</h3><button id="stageCaptureClose">Back to canvas</button></header>
    <img id="stageCaptureImage" alt="" style="display:block;width:100%;height:auto;max-height:65vh;object-fit:contain;image-rendering:pixelated">
    <div class="actions"><button id="stageCapturePrev">Previous frame</button><button id="stageCaptureNext">Next frame</button><button id="stageCaptureRefresh">Capture now</button></div>
    <p id="stageCaptureTick" role="status"></p>
  </section>`;
}

function client(generation, send) {
  const view=document.getElementById('stageCaptureView');
  const picture=document.getElementById('stageCaptureImage');
  const previous=document.getElementById('stageCapturePrev');
  const next=document.getElementById('stageCaptureNext');
  const refresh=document.getElementById('stageCaptureRefresh');
  const status=document.getElementById('stageCaptureTick');
  const open=document.getElementById('stageEngineFrames');
  const close=document.getElementById('stageCaptureClose');
  let frames=[],index=0,pending=false,ready=false,showing=false;

  function draw(){
    open.hidden=!frames.length;open.setAttribute('aria-expanded',String(showing&&frames.length>0));
    view.hidden=!frames.length||!showing;
    previous.disabled=index===0;
    next.disabled=index>=frames.length-1;
    refresh.disabled=pending||!ready;
    if(!frames.length){picture.removeAttribute('src');return;}
    const frame=frames[index];
    if(picture.getAttribute('src')!==frame.image)picture.src=frame.image;
    picture.alt='IKEMEN engine capture requested at StageTime '+frame.stageTick;
    status.textContent='Frame '+(index+1)+' of '+frames.length+' · requested at StageTime '+frame.stageTick+' · GameTime '+frame.gameTick;
  }
  open.onclick=()=>{showing=true;draw();close.focus()};
  close.onclick=()=>{showing=false;draw();open.focus()};
  previous.onclick=()=>{index=Math.max(0,index-1);draw()};
  next.onclick=()=>{index=Math.min(frames.length-1,index+1);draw()};
  refresh.onclick=()=>{pending=true;draw();send('stageCaptureRefresh')};
  window.addEventListener('message',({data})=>{
    if(data?.generation!==generation)return;
    if(data.type==='stageRebuildState'){
      ready=data.status.state==='ready';
      if(!ready){pending=false;frames=[];index=0;}
      draw();
    }else if(data.type==='stageCaptureFrames'){
      if(!frames.length)showing=true;frames=data.frames;index=Math.max(0,frames.length-1);pending=false;draw();
    }else if(data.type==='stageCaptureFailed'){
      pending=false;draw();status.textContent=data.reason;
    }
  });
}

function publish(owner,rig,captures) {
  if(owner.disposed||owner.rebuildRig!==rig)return;
  const frames=owner.engineFrameRig===rig?owner.engineFrames||[]:[];
  for(const frame of captures){
    if(frame.session!==rig.session||!Buffer.isBuffer(frame.png))continue;
    if(frames.some(previous=>previous.sequence===frame.sequence))continue;
    frames.push({sequence:frame.sequence,stageTick:frame.stageTick,gameTick:frame.gameTick,image:'data:image/png;base64,'+frame.png.toString('base64')});
  }
  owner.engineFrameRig=rig;
  owner.engineFrames=frames.slice(-8);
  return owner.panel.webview.postMessage({type:'stageCaptureFrames',generation:owner.generation,frames:owner.engineFrames});
}

async function refreshFrame(owner) {
  const rig=owner.rebuildRig;
  if(owner.engineCapturePending||owner.disposed||owner.rebuildState?.state!=='ready'||!rig?.capture)return;
  owner.engineCapturePending=rig;
  const generation=owner.generation;
  try{
    const frame=await rig.capture();
    if(owner.generation===generation)await publish(owner,rig,[frame]);
  }catch(error){
    if(!owner.disposed&&owner.rebuildRig===rig&&owner.generation===generation)
      await owner.panel.webview.postMessage({type:'stageCaptureFailed',generation,reason:'Capture failed. '+error.message});
  }finally{if(owner.engineCapturePending===rig)owner.engineCapturePending=null;}
}
module.exports={html,client,publish,refreshFrame};
