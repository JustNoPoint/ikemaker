'use strict';
// Standalone generated client. These filters never change authored/session
// visibility or persistent shot appearance. Capture draws the persistent scene.
function createStageReadabilityFocusClient(env){
 const {document,window,container,render}=env,modes=[['all','All'],['behind','Behind fighters'],['fighters','Fighters'],['front','In front']],listeners=[];
 let mode='all',pointer=null,keys=new Set(),captures=0,disposed=false;
 const root=document.createElement('div');root.className='guide';root.setAttribute('role','group');root.setAttribute('aria-label','Readability focus');
 const buttons=new Map();for(const [id,label]of modes){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-label','Focus '+label.toLowerCase());button.title='Preview only; existing visibility is retained. Captures use the full persistent scene.';buttons.set(id,button);root.append(button);}
 const hold=document.createElement('button');hold.type='button';hold.textContent='Hold dim foreground';hold.title='Hold pointer, Space or Enter. Release, Escape or loss of focus restores persistent dim.';hold.setAttribute('aria-label','Hold to dim foreground');root.append(hold);container.append(root);
 const listen=(target,type,fn)=>{target.addEventListener(type,fn);listeners.push(()=>target.removeEventListener(type,fn));};
 const held=()=>pointer!==null||keys.size>0;
 function sync(){for(const [id,button]of buttons){button.setAttribute('aria-pressed',String(id===mode));button.classList.toggle('active',id===mode);}hold.setAttribute('aria-pressed',String(held()));hold.classList.toggle('active',held());}
 function changed(before){sync();if(before!==held()&&!disposed)render();}
 function releasePointer(id){if(pointer===null||id!==undefined&&id!==pointer)return;const before=held(),captured=pointer;pointer=null;try{if(hold.hasPointerCapture?.(captured))hold.releasePointerCapture(captured);}catch{}changed(before);}
 function releaseAll(){const before=held(),captured=pointer;pointer=null;keys.clear();try{if(captured!==null&&hold.hasPointerCapture?.(captured))hold.releasePointerCapture(captured);}catch{}changed(before);}
 function setMode(next){if(disposed||!buttons.has(next))return false;if(mode===next)return true;mode=next;sync();render();return true;}
 for(const [id,button]of buttons)listen(button,'click',()=>{if(!button.disabled)setMode(id);});
 listen(hold,'pointerdown',event=>{if(disposed||hold.disabled||event.button!==0||event.isPrimary===false||pointer!==null)return;event.preventDefault();hold.focus?.({preventScroll:true});const before=held();pointer=event.pointerId??0;try{hold.setPointerCapture?.(pointer);}catch{}changed(before);});
 listen(window,'pointerup',event=>releasePointer(event.pointerId??0));listen(window,'pointercancel',event=>releasePointer(event.pointerId??0));listen(hold,'lostpointercapture',event=>releasePointer(event.pointerId??0));
 listen(hold,'keydown',event=>{if(disposed||hold.disabled||![' ','Spacebar','Enter'].includes(event.key))return;event.preventDefault();const before=held();keys.add(event.key==='Spacebar'?' ':event.key);changed(before);});
 listen(window,'keyup',event=>{const key=event.key==='Spacebar'?' ':event.key;if(!keys.has(key))return;event.preventDefault();const before=held();keys.delete(key);changed(before);});
 listen(hold,'blur',releaseAll);listen(window,'blur',releaseAll);
 listen(window,'keydown',event=>{if(event.key==='Escape'&&held()){event.preventDefault();event.stopPropagation?.();releaseAll();}});
 sync();
 return {
  mode:()=>mode,holding:held,setMode,
  backgroundVisible(layer,capture=false){return capture||captures>0||mode==='all'||mode==='behind'&&(layer===-1||layer===0)||mode==='front'&&layer===1;},
  fightersVisible(capture=false){return capture||captures>0||mode==='all'||mode==='fighters';},
  foregroundDim(persistent,capture=false){return Boolean(persistent)||(!capture&&captures===0&&held());},
  withCapture(callback){captures++;try{return callback();}finally{captures--;}},
  dispose(){if(disposed)return;const focused=mode!=='all';mode='all';const wasHeld=held();releaseAll();if(focused&&!wasHeld)render();disposed=true;for(const remove of listeners)remove();root.remove();}
 };
}
module.exports={createStageReadabilityFocusClient};
