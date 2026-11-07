'use strict';

// The engine primes animation motion on Reset. Text uses the next scene
// counter and first advances on the update that reaches its start time.
function storyboardPose(layer, tick, text = false) {
  const elapsed = Math.max(0, tick - layer.startTime);
  const steps = elapsed + (text ? Number(layer.startTime > 0 && tick >= layer.startTime) : 1);
  const position = layer.position.map((origin, axis) => {
    const velocity = layer.velocity?.[axis] || 0;
    const accel = layer.accel?.[axis] || 0;
    const friction = layer.friction?.[axis] ?? 1;
    if (friction === 1) return origin + steps * velocity + accel * steps * (steps - 1) / 2;
    const power = Math.pow(friction, steps);
    const sum = (1 - power) / (1 - friction);
    return origin + velocity * sum + accel * (steps - sum) / (1 - friction);
  });
  return {...layer, position};
}

function storyboardWindow(bounds, localCoord) {
  if (!bounds?.some(value => value !== 0)) return '';
  const [left,top,right,bottom] = bounds;
  const [w,h] = localCoord;
  return 'inset(' + [top/h, 1-right/w, 1-bottom/h, left/w].map((value,i) => 'calc('+100*value+'% '+(i===0||i===3?'-':'+')+' var(--story-d'+(i%2===0?'y':'x')+', 0%))').join(' ') + ')';
}

// Runs inside the storyboard webview. Video elements survive each clock paint so
// decoding and the editable preview clock can advance independently.
function paintStoryboardCanvas(scene) {
  const canvas = $('canvas');
  const plane = (n, foreground) => (Number(n) || 0) * 4 + (foreground ? 2 : 1);
  const css = 'position:absolute;inset:0;pointer-events:none;';
  const svg = content => '<svg viewBox="0 0 '+model.localCoord.join(' ')+'" preserveAspectRatio="none" aria-hidden="true" style="'+css+'width:100%;height:100%;overflow:hidden">'+content+'</svg>';
  const art = [];
  const videos = new Set();
  if (scene.clearColor[0] >= 0) {
    const z = plane(scene.clearLayerNo,false)-1;
    const [src,dst=0] = String(scene.clearAlpha||'255,0').split(',').map(n=>Math.min(255,Math.max(0,Number(n)||0))/255);
    art.push('<div data-story-clear style="'+css+'z-index:'+z+';background:rgba(0,0,0,'+(1-dst)+')"></div>',
      '<div style="'+css+'z-index:'+z+';mix-blend-mode:plus-lighter;background:rgba('+scene.clearColor.join(',')+','+src+')"></div>');
  }
  for (const bg of scene.backgrounds || []) {
    const z = plane(bg.layerNo,false);
    if (bg.type === 'video') {
      if (!bg.url) {
        art.push('<span class="muted" style="position:absolute;z-index:'+z+'">'+esc('Missing video: '+bg.path)+'</span>');
        continue;
      }
      const id = String(bg.line);
      videos.add(id);
      let video = canvas.querySelector('video[data-story-video="'+id+'"]');
      if (!video) {
        video = document.createElement('video');
        video.dataset.storyVideo=id;
        video.preload='auto';video.muted=true;video.playsInline=true;
        video.style.cssText=css+'width:100%;height:100%';
        video.addEventListener('loadedmetadata',()=>syncVideo(video));
        video.addEventListener('error',()=>{
          if(!video.isConnected)return;
          const status=document.createElement('span');
          status.className='muted';status.dataset.storyVideoError=id;
          status.textContent='Video preview unavailable: '+bg.path;canvas.appendChild(status);
        });
        canvas.appendChild(video);
      }
      if (video.dataset.source !== bg.url) {
        canvas.querySelector('[data-story-video-error="'+id+'"]')?.remove();
        video.dataset.source=bg.url;
        video.src=bg.url;
      }
      video.style.zIndex=z;
      video.style.objectFit=({stretch:'fill',zoomfill:'cover'})[bg.scaleMode]||'contain';
      video.dataset.tick=previewTick;
      video.dataset.playing=previewPlaying?'1':'0';
      syncVideo(video);
      continue;
    }
    if (!['normal','anim','parallax'].includes(bg.type)) continue;
    const layer={...bg,startTime:0,endTime:null,facing:1,
      position:[model.localCoord[0]/2+bg.position[0]+previewTick*bg.velocity[0],bg.position[1]+previewTick*bg.velocity[1]]};
    art.push('<div style="'+css+'z-index:'+z+'">'+svg(storyboardLayerVisual(scene,layer))+'</div>');
  }
  for (const old of canvas.querySelectorAll('[data-story-video],[data-story-video-error]')) {
    if (!videos.has(old.dataset.storyVideo || old.dataset.storyVideoError)) old.remove();
  }
  for (const layer of scene.layers) {
    const spritePose=storyboardPose(layer,previewTick);
    const visual=storyboardLayerVisual(scene,spritePose);
    const clip=storyboardWindow(layer.textWindow,model.localCoord);
    const marker=storyboardLayerMarkup(scene,layer.text?storyboardPose(layer,previewTick,true):spritePose);
    art.push('<div data-story-art="'+layer.index+'" style="'+css+'z-index:'+plane(layer.layerNo??2,true)+'">'+
      (visual?svg(visual):'')+(layer.text&&clip?'<div style="'+css+'clip-path:'+clip+'">'+marker+'</div>':marker)+'</div>');
  }
  let root=canvas.querySelector('[data-story-artwork]');
  if(!root){root=document.createElement('div');root.dataset.storyArtwork='';root.style.display='contents';canvas.appendChild(root);}
  root.innerHTML=art.join('')+storyboardFadeOverlay(scene);

  function syncVideo(video) {
    if(!video.isConnected || !Number.isFinite(video.duration) || video.readyState<1)return;
    const target=Math.min(Math.max(0,video.duration-0.001),Number(video.dataset.tick)/60);
    const playing=video.dataset.playing==='1';
    if(Math.abs(video.currentTime-target)>(playing?0.2:0.008)&&!video.seeking) video.currentTime=target;
    if(playing&&video.paused&&!video.ended)video.play().catch(()=>{});
    if(!playing&&!video.paused)video.pause();
  }
}
module.exports={paintStoryboardCanvas,storyboardPose,storyboardWindow};
