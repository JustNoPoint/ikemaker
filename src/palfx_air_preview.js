'use strict';

// Serialized into the PalFX webview. Only the preview source is changed on handoff.
function installAirArtwork({setComposerImage, renderComposer, basicValues, requestFrame, parseBlend, blendPixels}) {
  const box=document.getElementById('airPalFxArtwork'), canvas=box.querySelector('canvas');
  const status=box.querySelector('output'), play=box.querySelector('button');
  const source=document.createElement('canvas');
  source.width=canvas.width;
  source.height=canvas.height;
  const ctx=source.getContext('2d'), display=canvas.getContext('2d');
  let action=null, index=0, phase=0, elapsed=0, lastTime=0, animation=0, serial=0;
  const images=new Map(), pending=new Set();
  const frameKey=f=>f.group+','+f.index+':'+(f.palette??'attached');
  function receive({generation,index:loadedIndex,dataUri}){
    if(!action || generation!==action.generation || !action.frames[loadedIndex])return;
    const key=frameKey(action.frames[loadedIndex]);
    if(!dataUri){pending.delete(key);images.set(key,null);if(key===frameKey(action.frames[index]))show();return;}
    const image=new Image();
    image.onload=()=>{
      if(!action || generation!==action.generation)return;
      pending.delete(key);
      if(images.size>=24)images.delete(images.keys().next().value);
      images.set(key,image);
      if(key===frameKey(action.frames[index]))show();
    };
    image.onerror=()=>receive({generation,index:loadedIndex,dataUri:null});
    image.src=dataUri;
  }
  function paintBasic(){
    if(!action)return;
    const pixels=ctx.getImageData(0,0,source.width,source.height), data=pixels.data, values=basicValues();
    const wave=values[9]>0?Math.sin(2*Math.PI*phase/values[9]):0;
    for(let i=0;i<data.length;i+=4) {
      if(data[i+3]===0)continue;
      for(let c=0;c<3;c++)data[i+c]=(data[i+c]+values[c]+values[6+c]*wave)*values[3+c]/256;
    }
    display.fillStyle='#808080';
    display.fillRect(0,0,canvas.width,canvas.height);
    const backdrop=display.getImageData(0,0,canvas.width,canvas.height);
    blendPixels(backdrop.data,data,parseBlend(action.frames[index].blend));
    display.putImageData(backdrop,0,0);
  }
  function show(){
    const token=++serial, frame=action.frames[index];
    status.textContent=action.label+' · Element '+(index+1)+' / '+action.frames.length+' · '+frame.group+','+frame.index+(frame.blend?' · Blend '+frame.blend:'');
    function draw(image){
      if(token!==serial)return;
      ctx.clearRect(0,0,source.width,source.height);
      if(image){
        const zoom=action.fit;
        ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(source.width/2+frame.x*zoom,source.height*.7+frame.y*zoom);
        ctx.rotate(-frame.angle*Math.PI/180);ctx.scale(frame.scaleX*zoom,frame.scaleY*zoom);
        ctx.drawImage(image,-frame.axisX,-frame.axisY);ctx.restore();
      }
      setComposerImage(source,frame.blend||'');paintBasic();renderComposer();
    }
    if(frame.missing){draw(null);return;}
    const key=frameKey(frame);
    if(images.has(key)){draw(images.get(key));if(!images.get(key))status.textContent+=' · Image unavailable';return;}
    if(!pending.has(key)){pending.add(key);requestFrame(action.generation,index);}
  }
  function stop(){cancelAnimationFrame(animation);animation=0;lastTime=0;play.textContent='Play Action';play.setAttribute('aria-pressed','false');}
  function advance(time){
    const ticks=lastTime===0?0:Math.min(60,(time-lastTime)*.06);lastTime=time;
    const frame=action.frames[index];
    if(!frame.missing&&!images.has(frameKey(frame))){animation=requestAnimationFrame(advance);return;}
    phase+=ticks;elapsed+=ticks;
    let moved=false;
    while(!action.frames[index].hold && elapsed>=action.frames[index].ticks){
      elapsed-=action.frames[index].ticks;index=index+1<action.frames.length?index+1:action.loopStart;moved=true;
    }
    if(moved)show();else if(!box.closest('[hidden]') && box.offsetWidth)paintBasic();
    animation=requestAnimationFrame(advance);
  }
  play.onclick=()=>{if(animation){stop();return;}play.textContent='Pause Action';play.setAttribute('aria-pressed','true');animation=requestAnimationFrame(advance);};
  function clear(){stop();serial++;action=null;images.clear();pending.clear();box.hidden=true;}
  function open(value){
    if(!value?.frames?.length)return;
    clear();ctx.clearRect(0,0,source.width,source.height);display.clearRect(0,0,canvas.width,canvas.height);action={...value};index=value.frameIndex;phase=elapsed=0;
    let radiusX=1,above=1,below=1;
    for(const f of value.frames){
      if(f.missing)continue;
      const r=-f.angle*Math.PI/180;
      for(const x of [-f.axisX,f.width-f.axisX])for(const y of [-f.axisY,f.height-f.axisY]){
        const px=f.x+x*f.scaleX*Math.cos(r)-y*f.scaleY*Math.sin(r),py=f.y+x*f.scaleX*Math.sin(r)+y*f.scaleY*Math.cos(r);
        radiusX=Math.max(radiusX,Math.abs(px));above=Math.max(above,-py);below=Math.max(below,py);
      }
    }
    action.fit=Math.min(4,source.width*.48/radiusX,source.height*.68/above,source.height*.28/below);
    box.hidden=false;show();
  }
  return {open,clear,paintBasic,receive};
}

module.exports={installAirArtwork};
