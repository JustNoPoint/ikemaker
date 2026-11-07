'use strict';
function mountStageAttachedEntities(env){
 const section=env.document.createElement('section');section.setAttribute('aria-label','Stage attached entities');section.className='stage-attached-entities';
 const create=env.document.createElement('button');create.id='stageAttachedCreate';create.textContent='Create / link entity…';create.title='Create an invisible controller or full character, or link an existing authored entity';create.setAttribute('aria-label','Create or link Stage attached entity');create.onclick=()=>env.send({type:'createStageAttachedEntity',generation:env.generation});
 const edit=env.document.createElement('button');edit.id='stageAttachedEdit';edit.textContent='Edit linked entity…';edit.title='Choose the exact attached owner for Stage Code or Move Lab';edit.disabled=!env.count;edit.onclick=()=>env.send({type:'editStageAttachedEntity',generation:env.generation});
 section.append(create,edit);env.container.append(section);return section;
}
module.exports={mountStageAttachedEntities};
