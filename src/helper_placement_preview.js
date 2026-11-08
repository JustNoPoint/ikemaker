'use strict';

const {maskSource} = require('./state_transfer_model');
const {spriteDataUri} = require('./sff_reader');

function startingAnimation(files, stateNo) {
  let declarations=0, animation=null;
  const candidate=new RegExp('^\\s*\\[\\s*statedef\\s+'+stateNo+'(?=\\s|;|\\])','im');
  for(const {filename,text} of files) {
    if(!candidate.test(text))continue;
    const zss=/\.zss$/i.test(filename);
    const source=maskSource(text,zss?'zss':'cns');
    const headers=/^\s*\[\s*statedef\s+(-?\d+)\s*((?:;[^\]]*)?)\]/gim;
    for(const match of source.matchAll(headers)) {
      if(Number(match[1])!==stateNo) continue;
      declarations++;
      const body=zss?match[2]:source.slice(match.index+match[0].length).split(/^\s*\[/m,1)[0];
      const assignments=[...body.matchAll(zss?/(?:^|;)\s*anim\s*:\s*([^;\]]+)/gi:/^\s*anim\s*=\s*([^\r\n]+)/gim)];
      if(assignments.length===1 && /^\d+$/.test(assignments[0][1].trim())) animation=Number(assignments[0][1]);
    }
  }
  return declarations===1?animation:null;
}

function flatPose(actions, number, archive) {
  const frame=actions.find(action=>action.number===number)?.frames[0];
  if(!frame)return null;
  const sprite=archive.sprites.find(item=>item.group===frame.group&&item.number===frame.index);
  if(!sprite)return null;
  return {action:number,group:frame.group,index:frame.index,x:frame.x,y:frame.y,flags:frame.flags,
    width:sprite.width,height:sprite.height,scaleX:frame.scaleX,scaleY:frame.scaleY,angle:frame.angle,axisX:sprite.axisX,axisY:sprite.axisY,
    image:spriteDataUri(archive,sprite)};
}

function samplePlacement(postype,position,facing,width) {
  const bounds={left:-width/2,right:width/2,p1:-width/4,p2:width/4};
  const targets={...bounds,front:bounds.right,back:bounds.left,none:0};
  const side=postype==='p2'?-1:1, anchor=targets[postype]??0;
  return {bounds,anchor,x:anchor+side*position[0],y:position[1],facing:(facing<0?-1:1)*side};
}

function placementMarkup() {
  return '<div class="card"><h2>Helper spawn preview</h2><canvas data-helper-placement width="840" height="330" style="height:clamp(180px,29vh,300px);min-height:0;cursor:default" role="img" aria-label="Helper placement relative to the selected spawn origin"></canvas><p class="muted" data-helper-placement-status></p></div>';
}

function installPlacementPreview(){
  const canvas=document.querySelector('[data-helper-placement]');if(!canvas)return;
  const status=document.querySelector('[data-helper-placement-status]'),preview=model.preview||{};
  const ctx=canvas.getContext('2d'),images=new Map();
  function pose(art,x,y,facing,scale,opacity){
    if(!art)return;
    let img=images.get(art.image);
    if(!img){img=new Image();images.set(art.image,img);img.onload=()=>{if(canvas.isConnected)draw()};img.src=art.image;}
    if(!img.complete||!img.naturalWidth)return;
    ctx.save();ctx.globalAlpha=opacity;ctx.translate(x,y);ctx.scale(facing*scale,scale);
    ctx.translate(art.x,art.y);ctx.rotate((art.angle||0)*Math.PI/180);
    ctx.scale((art.scaleX??1)*(art.flags?.includes('H')?-1:1),(art.scaleY??1)*(art.flags?.includes('V')?-1:1));
    ctx.drawImage(img,-art.axisX,-art.axisY);ctx.restore();
  }
  function draw(){
    const type=$('postype')?.value||plan.postype;
    const position=[Number($('x')?.value??plan.position[0]),Number($('y')?.value??plan.position[1])];
    const state=Number($('stateNo')?.value??plan.stateNo),width=preview.localWidth||320;
    const result=samplePlacement(type,position,Number($('facing')?.value??plan.facing),width);
    const art=preview.stateNo===state&&preview.helper,rect=canvas.getBoundingClientRect();
    canvas.width=Math.max(200,Math.round(rect.width));canvas.height=Math.max(150,Math.round(rect.height));
    let left=Math.min(result.bounds.left,result.x),right=Math.max(result.bounds.right,result.x);
    let top=Math.min(-width*.38,result.y-width*.15),bottom=Math.max(width*.08,result.y+width*.08);
    for(const [pose,originX,originY,face] of [[preview.creator,result.bounds.p1,0,1],[art,result.x,result.y,result.facing]]){
      if(!pose)continue;
      const angle=(pose.angle||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
      for(const dx of [-pose.axisX,pose.width-pose.axisX])for(const dy of [-pose.axisY,pose.height-pose.axisY]){
        const ax=dx*(pose.scaleX??1)*(pose.flags?.includes('H')?-1:1),ay=dy*(pose.scaleY??1)*(pose.flags?.includes('V')?-1:1);
        const x=originX+face*(pose.x+ax*cos-ay*sin),y=originY+pose.y+ax*sin+ay*cos;
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      }
    }
    const scale=Math.min((canvas.width-42)/(right-left),(canvas.height-52)/(bottom-top));
    const px=v=>(canvas.width-(right-left)*scale)/2+(v-left)*scale,py=v=>28+(v-top)*scale;
    const ground=py(0),sx=px(result.x),sy=py(result.y),anchor=px(result.anchor);
    ctx.fillStyle='#111827';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.lineWidth=1;ctx.strokeStyle='#536376';ctx.beginPath();ctx.moveTo(28,ground);ctx.lineTo(canvas.width-28,ground);ctx.stroke();
    ctx.font='12px sans-serif';ctx.textAlign='center';
    for(const [key,label] of [['p1','Creator'],['p2','Opponent']]){
      const x=px(result.bounds[key]);ctx.fillStyle='#a7bed2';ctx.fillRect(x-1,ground-12,2,18);ctx.fillText(label,x,ground+24);
    }
    pose(preview.creator,px(result.bounds.p1),ground,1,scale,.56);
    ctx.strokeStyle='#e4a943';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(anchor,ground);ctx.lineTo(sx,sy);ctx.stroke();ctx.setLineDash([]);
    pose(art,sx,sy,result.facing,scale,1);
    ctx.strokeStyle='#ffbf55';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx,sy,8,0,2*Math.PI);ctx.moveTo(sx,sy);ctx.lineTo(sx+result.facing*20,sy);ctx.lineTo(sx+result.facing*15,sy-4);ctx.stroke();
    ctx.fillStyle='#ffcf79';ctx.textAlign='left';ctx.fillText('Helper spawn',16,23);
    status.textContent='Example arena · creator faces right · '+type+' origin · offset '+position.join(', ')+' · facing '+(result.facing>0?'right':'left')+' · '+(art?'State '+state+' opens on AIR '+art.action+', sprite '+art.group+','+art.index+'.':'Spawn marker · no resolved opening sprite for State '+state+'.');
    canvas.setAttribute('aria-label',status.textContent);
  }
  for(const id of ['postype','x','y','facing','stateNo'])$(id)?.addEventListener('input',draw);
  if(typeof ResizeObserver==='function'){
    const observer=new ResizeObserver(()=>{if(canvas.isConnected)draw();else observer.disconnect();});
    observer.observe(canvas);
  }
  draw();
}
function clientScript(){return [samplePlacement,placementMarkup,installPlacementPreview].map(fn=>fn.toString()).join('\n');}
module.exports={startingAnimation,flatPose,samplePlacement,clientScript};
