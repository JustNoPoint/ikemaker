'use strict';

function clientScript(options = {}) {
  const panel = String(options.panel || 'panel');
  const handle = String(options.handle || 'handle');
  const margin = Math.max(0, Math.min(32, Number(options.margin) || 4));
  if (!/^[A-Za-z_$][\w$]*$/.test(panel) || !/^[A-Za-z_$][\w$]*$/.test(handle)) throw new Error('Floating panel drag expressions must be simple identifiers.');
  return `(()=>{const dragPanel=${panel},dragHandle=${handle},dragMargin=${margin};if(!dragPanel||!dragHandle)return;const initialPosition=dragPanel.getBoundingClientRect();dragHandle.setAttribute('aria-label','Move panel; arrow keys move, Shift moves 10 pixels, Home resets');dragHandle.tabIndex=0;dragHandle.setAttribute('role','button');dragHandle.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown ArrowLeft ArrowRight Home');dragHandle.title='Move panel with arrow keys; Shift moves 10 pixels; Home resets';let dragState=null,suppressDragClick=false;
    const clampValue=(value,min,max)=>Math.max(min,Math.min(max,value));
    const clampPosition=(left,top)=>{const rect=dragPanel.getBoundingClientRect(),maxLeft=Math.max(dragMargin,window.innerWidth-rect.width-dragMargin),maxTop=Math.max(dragMargin,window.innerHeight-rect.height-dragMargin);dragPanel.style.left=clampValue(left,dragMargin,maxLeft)+'px';dragPanel.style.top=clampValue(top,dragMargin,maxTop)+'px'};
    dragPanel.ikemenClampDrag=()=>{const rect=dragPanel.getBoundingClientRect();clampPosition(rect.left,rect.top)};
    dragHandle.addEventListener('keydown',event=>{if(event.target!==dragHandle)return;const delta=event.shiftKey?10:1,rect=dragPanel.getBoundingClientRect();if(event.key==='Home')clampPosition(initialPosition.left,initialPosition.top);else if(event.key==='ArrowLeft')clampPosition(rect.left-delta,rect.top);else if(event.key==='ArrowRight')clampPosition(rect.left+delta,rect.top);else if(event.key==='ArrowUp')clampPosition(rect.left,rect.top-delta);else if(event.key==='ArrowDown')clampPosition(rect.left,rect.top+delta);else return;event.preventDefault();event.stopPropagation()});window.addEventListener('resize',()=>dragPanel.ikemenClampDrag());
    const finishDrag=(event,cancelled=false)=>{if(!dragState||event.pointerId!==dragState.pointerId)return;const moved=dragState.moved;dragState=null;dragPanel.classList.remove('dragging');dragHandle.style.cursor='grab';if(dragHandle.hasPointerCapture?.(event.pointerId))dragHandle.releasePointerCapture?.(event.pointerId);suppressDragClick=!cancelled&&moved;event.preventDefault?.();event.stopPropagation?.()};
    dragHandle.addEventListener('pointerdown',event=>{if(event.button!==0||event.target?.closest?.('button,input,select,textarea,a,[contenteditable="true"]'))return;suppressDragClick=false;const rect=dragPanel.getBoundingClientRect();dragState={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,left:rect.left,top:rect.top,moved:false};dragHandle.setPointerCapture?.(event.pointerId);dragPanel.classList.add('dragging');dragHandle.style.cursor='grabbing';event.preventDefault();event.stopPropagation()});
    dragHandle.addEventListener('pointermove',event=>{if(!dragState||event.pointerId!==dragState.pointerId)return;const dx=event.clientX-dragState.startX,dy=event.clientY-dragState.startY;dragState.moved=dragState.moved||dx!==0||dy!==0;clampPosition(dragState.left+dx,dragState.top+dy);event.preventDefault();event.stopPropagation()});
    dragHandle.addEventListener('pointerup',event=>finishDrag(event,false));
    dragHandle.addEventListener('pointercancel',event=>finishDrag(event,true));
    dragHandle.addEventListener('lostpointercapture',event=>finishDrag(event,true));
    dragHandle.addEventListener('selectstart',event=>event.preventDefault());
    dragHandle.addEventListener('click',event=>{if(!suppressDragClick)return;suppressDragClick=false;event.preventDefault();event.stopImmediatePropagation?.()},{capture:true});
  })();`;
}

module.exports = { clientScript };
