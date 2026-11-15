'use strict';

function selectionClipboard(width, height, pixels, channels, selection, colors = null) {
  const bounds = selection || {x:0,y:0,w:width,h:height};
  if (bounds.w * bounds.h > 1000000) throw new Error('Copied artwork is limited to one million pixels.');
  const rgba = new Uint8ClampedArray(bounds.w * bounds.h * 4), indices = channels === 1 ? new Int16Array(bounds.w * bounds.h).fill(-1) : null;
  const mask = new Uint8Array(bounds.w * bounds.h);
  for (let y=0;y<bounds.h;y++) for (let x=0;x<bounds.w;x++) {
    const sx=x+bounds.x,sy=y+bounds.y,source=sy*width+sx,to=y*bounds.w+x;
    if (sx<0||sy<0||sx>=width||sy>=height||selection?.mask&&!selection.mask[source]) continue;
    if (channels===1) {
      const index=pixels[source];if(index<=0)continue;
      indices[to]=index;rgba.set(colors[index],to*4);mask[to]=1;
    } else {
      if(!pixels[source*4+3])continue;
      rgba.set(pixels.subarray(source*4,source*4+4),to*4);mask[to]=1;
    }
  }
  return {width:bounds.w,height:bounds.h,rgba,indices,mask,colors:colors?colors.map(color=>color.slice()):null};
}

function convertClipboard(clipboard, kind, colors = null) {
  if (!clipboard || !Number.isInteger(clipboard.width) || !Number.isInteger(clipboard.height) || clipboard.width<1 || clipboard.height<1 || clipboard.width*clipboard.height>1000000 || clipboard.rgba?.length!==clipboard.width*clipboard.height*4) throw new Error('Paste needs an image of at most one million pixels.');
  const count=clipboard.width*clipboard.height;
  if(clipboard.mask&&clipboard.mask.length!==count||clipboard.indices&&clipboard.indices.length!==count)throw new Error('The copied selection does not match its image dimensions.');
  const mask=Uint8Array.from(clipboard.mask||Array.from({length:count},(_,pixel)=>clipboard.rgba[pixel*4+3]?1:0));
  if(kind==='indexed') {
    const pixels=new Int16Array(count).fill(-1);
    const lookup=new Map();for(let index=1;index<colors.length;index++){const key=colors[index].join(',');if(!lookup.has(key))lookup.set(key,[]);lookup.get(key).push(index);}
    const missing=new Set(),ambiguous=new Set();
    for(let pixel=0;pixel<count;pixel++)if(mask[pixel]) {
      const key=Array.from(clipboard.rgba.subarray(pixel*4,pixel*4+4)).join(','),original=clipboard.indices?.[pixel];
      // Preserve index separation whenever this exact destination slot still matches.
      if(Number.isInteger(original)&&original>0&&colors[original]?.join(',')===key){pixels[pixel]=original;continue;}
      const matches=lookup.get(key);
      if(!matches)missing.add(key);else if(matches.length>1)ambiguous.add(key);else pixels[pixel]=matches[0];
    }
    if(ambiguous.size)throw new Error(ambiguous.size+' color(s) match multiple destination palette indexes. Use SFF Creator to review an explicit index mapping; no pixels changed.');
    if(missing.size)throw new Error(missing.size+' pasted color(s) are absent from this palette. Import through SFF Creator to review palette mapping; no pixels changed.');
    return {width:clipboard.width,height:clipboard.height,pixels,mask,rgba:Uint8ClampedArray.from(clipboard.rgba),channels:1};
  }
  if(kind==='rgb24'&&Array.from(mask).some((selected,pixel)=>selected&&clipboard.rgba[pixel*4+3]!==255))throw new Error('RGB24 cannot preserve partial pasted alpha. Convert explicitly to RGBA in SFF Creator first.');
  return {width:clipboard.width,height:clipboard.height,pixels:Uint8ClampedArray.from(clipboard.rgba),mask,rgba:Uint8ClampedArray.from(clipboard.rgba),channels:4};
}

function pastePixels(destination, width, height, floating, offsetX, offsetY) {
  const result=destination.slice();
  for(let y=0;y<floating.height;y++)for(let x=0;x<floating.width;x++){
    const from=y*floating.width+x,dx=x+offsetX,dy=y+offsetY;
    if(!floating.mask[from]||dx<0||dy<0||dx>=width||dy>=height)continue;
    const to=(dy*width+dx)*floating.channels;
    if(floating.channels===1)result[to]=floating.pixels[from];else {
      const sourceAlpha=floating.pixels[from*4+3]/255,destinationAlpha=result[to+3]/255,alpha=sourceAlpha+destinationAlpha*(1-sourceAlpha);
      for(let channel=0;channel<3;channel++)result[to+channel]=alpha?Math.round((floating.pixels[from*4+channel]*sourceAlpha+result[to+channel]*destinationAlpha*(1-sourceAlpha))/alpha):0;
      result[to+3]=Math.round(alpha*255);
    }
  }
  return result;
}

function installFloatingPaste(options) {
  const {mount,viewport,canvas,context,width,height,kind}=options;
  const bar=document.createElement('div'),copy=document.createElement('button'),paste=document.createElement('button'),place=document.createElement('button'),cancel=document.createElement('button'),status=document.createElement('p');
  bar.className='sprite-editor-bar';copy.textContent='Copy visible selection';paste.textContent='Paste copied artwork';place.textContent='Place paste';cancel.textContent='Cancel paste';status.setAttribute('role','status');
  place.disabled=cancel.disabled=true;bar.append(copy,paste,place,cancel);viewport.after(bar,status);
  let floating=null,drag=null,epoch=0;
  function colors(){return options.colors?.()||null;}
  function update(){place.disabled=cancel.disabled=!floating;options.redraw();}
  function start(clipboard){
    if(floating){status.textContent='Place or cancel the current paste first.';return;}
    try{floating={...convertClipboard(clipboard,kind,colors()),x:0,y:0};
      const offscreen=document.createElement('canvas');offscreen.width=floating.width;offscreen.height=floating.height;
      const ctx=offscreen.getContext('2d'),image=ctx.createImageData(floating.width,floating.height);image.data.set(floating.rgba);
      for(let pixel=0;pixel<floating.mask.length;pixel++)if(!floating.mask[pixel])image.data[pixel*4+3]=0;
      ctx.putImageData(image,0,0);floating.canvas=offscreen;
      status.textContent='Floating paste: drag to position, Enter / Place paste to commit, Escape to cancel. '+(kind==='indexed'?'Placement adds a new paint layer.':'Placement flattens into the truecolor draft.');update();viewport.focus();}
    catch(error){status.textContent=error.message;}
  }
  function commit(){if(!floating)return;options.commit(floating);floating=null;drag=null;epoch++;status.textContent='Paste placed in the draft. Review Sprite Replacement to write it to the archive.';update();}
  function abort(){floating=null;drag=null;epoch++;status.textContent='Paste cancelled; draft pixels are unchanged.';update();}
  copy.onclick=()=>{try{globalThis.ikemenSpriteClipboard=options.copy?options.copy():selectionClipboard(width,height,options.read(),kind==='indexed'?1:4,options.selection(),colors());status.textContent='Copied visible selection. Paste copied artwork starts a movable preview.';}catch(error){status.textContent=error.message;}};
  paste.onclick=()=>start(globalThis.ikemenSpriteClipboard);place.onclick=commit;cancel.onclick=abort;
  const reviewButton=mount.querySelector(kind==='indexed'?'#spriteReview':'#tcReview');
  reviewButton?.addEventListener('click',event=>{if(floating){event.preventDefault();event.stopImmediatePropagation();status.textContent='Place or cancel the floating paste before reviewing the replacement.';}},true);
  const down=canvas.onpointerdown,move=canvas.onpointermove,up=canvas.onpointerup,abortPointer=canvas.onpointercancel;
  canvas.onpointerdown=event=>{if(!floating)return down?.(event);if(event.button!==0)return;const point=options.point(event);drag={x:point.x,y:point.y,startX:floating.x,startY:floating.y};canvas.setPointerCapture(event.pointerId);viewport.focus();};
  canvas.onpointermove=event=>{if(!floating)return move?.(event);if(!drag)return;const point=options.point(event);floating.x=drag.startX+point.x-drag.x;floating.y=drag.startY+point.y-drag.y;update();};
  canvas.onpointerup=event=>{if(!floating)return up?.(event);drag=null;};canvas.onpointercancel=event=>{if(!floating)return abortPointer?.(event);drag=null;};
  viewport.addEventListener('keydown',event=>{
    if(floating&&['Escape','Enter'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();event.key==='Escape'?abort():commit();return;}
    if(event.target!==viewport)return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='c'){event.preventDefault();event.stopImmediatePropagation();copy.onclick();}
  },true);
  viewport.addEventListener('paste',async event=>{
    const file=Array.from(event.clipboardData?.items||[]).find(item=>item.type==='image/png')?.getAsFile();if(!file){if(globalThis.ikemenSpriteClipboard){event.preventDefault();event.stopImmediatePropagation();paste.onclick();}return;}
    event.preventDefault();event.stopImmediatePropagation();const token=++epoch;
    if(file.size>16000000){status.textContent='Pasted PNG is limited to 16 MB.';return;}
    let header;try{header=new DataView(await file.slice(0,24).arrayBuffer());}catch(_){status.textContent='Could not read the pasted PNG.';return;}
    if(header.byteLength<24||header.getUint32(0)!==0x89504e47||header.getUint32(4)!==0x0d0a1a0a||header.getUint32(16)<1||header.getUint32(20)<1||header.getUint32(16)*header.getUint32(20)>1000000){status.textContent='Paste needs a PNG of at most one million pixels.';return;}
    const url=URL.createObjectURL(file);
    try{const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Could not decode the pasted PNG.'));img.src=url;});if(token!==epoch||!mount.isConnected)return;if(image.width*image.height>1000000)throw new Error('Pasted artwork is limited to one million pixels.');const offscreen=document.createElement('canvas');offscreen.width=image.width;offscreen.height=image.height;const ctx=offscreen.getContext('2d');ctx.drawImage(image,0,0);start({width:image.width,height:image.height,rgba:ctx.getImageData(0,0,image.width,image.height).data});}catch(error){if(token===epoch)status.textContent=error.message;}finally{URL.revokeObjectURL(url);}
  });
  return {
    active:()=>Boolean(floating),
    draw(){
      if(!floating)return;
      context.drawImage(floating.canvas,floating.x,floating.y);
      context.save();context.strokeStyle='#00d6ff';context.lineWidth=1;context.setLineDash([2,2]);
      context.strokeRect(floating.x+.5,floating.y+.5,floating.width,floating.height);context.restore();
    }

  };
}

function clientScript(){return [selectionClipboard,convertClipboard,pastePixels,installFloatingPaste].map(fn=>fn.toString()).join('\n');}
module.exports={selectionClipboard,convertClipboard,pastePixels,clientScript};
