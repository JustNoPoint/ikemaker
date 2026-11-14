'use strict';
const def=require('./def_model');
const {storyboardModel}=require('./storyboard_model');

function moveStoryboardScene(text,sceneKey,direction){
  if(!['up','down'].includes(direction))throw new Error('Choose Up or Down for the scene move.');
  const model=storyboardModel(def.parseDef(text)),scenes=model.scenes;
  if(new Set(scenes.map(scene=>scene.key)).size!==scenes.length)throw new Error('Duplicate scene headings must be resolved before reordering.');
  const from=scenes.findIndex(scene=>scene.key===sceneKey),to=from+(direction==='up'?-1:1);
  if(from<0||to<0||to>=scenes.length)return{changed:false,text,from,to};
  const remap=index=>index===from?to:index===to?from:index;
  const setAt=(source,heading,key,value)=>{const doc=def.parseDef(source),section=doc.sections.find(item=>item.normalized===heading);if(!section)throw new Error('The scene order changed before review.');return def.setSectionEntry(def.parseDef('\n'+source),section.line+1,key,String(value)).slice(1)};
  let next=text;
  if(model.startScene>=0&&model.startScene<scenes.length&&remap(model.startScene)!==model.startScene)next=setAt(next,'scenedef','startscene',remap(model.startScene));
  for(const scene of scenes)if(scene.jump!==null&&scene.jump>=0&&scene.jump<scenes.length&&remap(scene.jump)!==scene.jump)next=setAt(next,scene.key,'jump',remap(scene.jump));
  const doc=def.parseDef(next),ordered=storyboardModel(doc).scenes,a=ordered[Math.min(from,to)],b=ordered[Math.max(from,to)];
  const end=section=>doc.sections.find(item=>item.line>section.line)?.line??doc.lines.length;
  const lines=[...doc.lines],aEnd=end(a),bEnd=end(b),result=[...lines.slice(0,a.line),...lines.slice(b.line,bEnd),...lines.slice(aEnd,b.line),...lines.slice(a.line,aEnd),...lines.slice(bEnd)].join(next.includes('\r\n')?'\r\n':'\n');
  return{changed:result!==text,text:result,from,to,sourceName:scenes[from].name,targetName:scenes[to].name};
}
module.exports={moveStoryboardScene};
