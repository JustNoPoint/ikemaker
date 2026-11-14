'use strict';

// Pure controller emitter for a timed accessory in opponent-owned animations.
// The ordinary Action remains independent. A foreign pose either selects one
// static atlas element, selects an explicit timed Action, continues the owner's
// Action by policy, or hides the Explod when no artwork was approved.
function buildIndependentForeignState({lang,header,label,id,flag,plan,table,params,update,freeze,pause,x,y}) {
  const foreign='animPlayerNo > 0 && animPlayerNo != playerNo';
  const valid='spritePlayerNo = playerNo && spriteVar(width) > 0';
  const target=`map(${flag}_target)`,slot=`map(${flag}_slot)`,keep=`map(${flag}_continue)`;
  const previous=`map(${flag}_wasforeign)`,previousGroup=`map(${flag}_group)`,previousImage=`map(${flag}_image)`;
  const changed=`(!${previous} || ${previousGroup} != spriteVar(group) || ${previousImage} != spriteVar(image))`;
  const exists=`numExplod(${id})`,staticOn=table?`${slot} > 0`:'0',timedOn=`${target} >= 0`;
  const switchTimed=`explodVar(${id}, 0, anim) != ${target} || (${foreign} && !${keep} && ${changed})`;
  const sign=axis=>`ifElse(animElemVar(${axis==='x'?'h':'v'}flip), -1, 1)`;
  const position=(axis,offset)=>`${offset} * const(size.${axis}scale) * scale ${axis} + animElemVar(${axis}offset) * ${sign(axis)} * scale ${axis} * const240p(320) / (player(animPlayerNo), localcoord x) * (player(animPlayerNo), const(size.${axis}scale))`;
  const drawnScale=axis=>`const(size.${axis}scale) * scale ${axis} * animElemVar(${axis}scale) * ${sign(axis)}`;
  const visible=params.find(([key])=>key==='syncparams')[1];
  const native=`animElemVar(xscale) = 1 && animElemVar(yscale) = 1 && animElemVar(angle) = 0 && !animElemVar(hflip) && !animElemVar(vflip) && animElemVar(alphasource) = 255 && animElemVar(alphadest) = 0`;
  const staticDraw=[['pos',`${position('x',x)}, ${position('y',y)}`],['scale',`ifElse(${visible}, ${drawnScale('x')}, 0), ifElse(${visible}, ${drawnScale('y')}, 0)`],['angle','angle + animElemVar(angle)'],['syncparams',`(${visible}) && (${native})`],['trans','addalpha'],['alpha','ifElse(alpha source != 255 || alpha dest != 0, alpha source, animElemVar(alphasource)), ifElse(alpha source != 255 || alpha dest != 0, alpha dest, animElemVar(alphadest))']];
  const staticFields=new Map(staticDraw);
  const staticParams=params.map(([key,value])=>[key,key==='anim'?table?.action:key==='animelem'?slot:key==='animfreeze'?1:key==='ignorehitpause'?1:staticFields.has(key)?staticFields.get(key):value]);
  if(!staticParams.some(([key])=>key==='animelem'))staticParams.push(['animelem',slot]);
  staticParams.push(['trans',staticFields.get('trans')],['alpha',staticFields.get('alpha')],['layerno','layerno'],['under','isAsserted(drawunder)']);
  const timedParams=params.map(([key,value])=>[key,key==='anim'?target:value]);
  const staticUpdate=update.filter(([key])=>!['id','animelem','animfreeze'].includes(key)).map(([key,value])=>[key,key==='ignorehitpause'?1:staticFields.has(key)?staticFields.get(key):value]);
  staticUpdate.push(['trans',staticFields.get('trans')],['alpha',staticFields.get('alpha')]);
  const zfields=rows=>rows.map(([key,value])=>`${key}: ${value};`).join(' ');
  const lookup=table?.ranges||[];
  const timed=[...plan.timed].map(([pose,value])=>{const [group,image]=pose.split(',').map(Number);return{group,image,...value};});
  if(lang==='zss'){
    const lines=[header,'ignorehitpause if !isHelper {',
      `\t${target} := -1;`, `\t${slot} := 0;`, `\t${keep} := 0;`,
      `\tif !(${foreign})${plan.policy==='static'?` && ${valid}`:''} {${target} := ${params.find(([key])=>key==='anim')[1]}; ${keep} := 1;}`,
      ...(plan.policy==='continue'?[`\telse {${target} := ${params.find(([key])=>key==='anim')[1]}; ${keep} := 1;}`]:[]),
      `\tif (${foreign}) && ${valid} {`,
      ...lookup.map(row=>`\t\tif spriteVar(group) = ${row.group} && ${row.first===row.end?`spriteVar(image) = ${row.first}`:`spriteVar(image) >= ${row.first} && spriteVar(image) <= ${row.end}`} {${slot} := ${row.first===row.end?row.element:`${row.element} + spriteVar(image) - ${row.first}`};}`),
      ...timed.map(row=>`\t\tif spriteVar(group) = ${row.group} && spriteVar(image) = ${row.image} {${slot} := 0; ${target} := ${row.action}; ${keep} := ${row.continue?1:0};}`),
      '\t}',
      `\tif !(${staticOn}) && !(${timedOn}) {if ${exists} {removeExplod{id: ${id};}}}`,
      ...(table?[`\telse if ${staticOn} {`,
        `\t\tif !${exists} {explod{${zfields(staticParams)}}}`,
        `\t\telse {if explodVar(${id}, 0, anim) != ${table.action} {modifyExplod{id: ${id}; anim: ${table.action}; animelem: ${slot};}} else if explodVar(${id}, 0, animelem) != ${slot} {modifyExplod{id: ${id}; animelem: ${slot};}} modifyExplod{${zfields([['id',id],['animelem',slot],['animfreeze',1],...staticUpdate])}}}`,
        '\t}']:[]),
      `\telse {`,
      `\t\tif !${exists} {explod{${zfields(timedParams)}}}`,
      `\t\telse {`,
      `\t\t\tif ${switchTimed} {modifyExplod{id: ${id}; anim: ${target}; animelem: 1; animelemtime: 0;}}`,
      ...(pause==='never'?[]:[`\t\t\telse if ${freeze} {modifyExplod{id: ${id}; animelem: explodVar(${id}, 0, animelem); animelemtime: explodVar(${id}, 0, animelemtime);}}`]),
      `\t\t\tmodifyExplod{${zfields(update)}}`,
      '\t\t}', '\t}',
      `\t${previous} := (${foreign});`,
      `\tif (${foreign}) && ${valid} {${previousGroup} := spriteVar(group); ${previousImage} := spriteVar(image);}`,
      '}'];
    return lines.join('\n');
  }
  const cblock=(name,type,triggers,fields,ignore='1')=>[`[State +1, ${label}: ${name}]`,`type = ${type}`,'triggerall = !IsHelper',...triggers.map(trigger=>`trigger1 = ${trigger}`),...fields.map(([key,value])=>`${key} = ${value}`),`ignorehitpause = ${ignore}`,''];
  const set=(name,value,triggers)=>cblock(name,'MapSet',triggers.length?triggers:['1'],[['map',`"${flag}_${name}"`],['value',value]]);
  const poseCondition=row=>[`spriteVar(group) = ${row.group}`,row.first===row.end?`spriteVar(image) = ${row.first}`:`spriteVar(image) >= ${row.first} && spriteVar(image) <= ${row.end}`];
  const timedIgnore=pause==='never'?'1':pause==='owner'?'IsAsserted(AnimateHitPause)':'0';
  const lines=[header,
    ...set('target',-1,[]),...set('slot',0,[]),...set('continue',0,[]),
    ...set('target',params.find(([key])=>key==='anim')[1],[`!(${foreign})`,...(plan.policy==='static'?[valid]:[])]),
    ...set('continue',1,[`!(${foreign})`,...(plan.policy==='static'?[valid]:[])]),
    ...(plan.policy==='continue'?[...set('target',params.find(([key])=>key==='anim')[1],[foreign]),...set('continue',1,[foreign])]:[]),
    ...lookup.flatMap(row=>set('slot',row.first===row.end?row.element:`${row.element} + SpriteVar(Image) - ${row.first}`,[foreign,valid,...poseCondition(row)])),
    ...timed.flatMap(row=>[...set('slot',0,[foreign,valid,`SpriteVar(Group) = ${row.group}`,`SpriteVar(Image) = ${row.image}`]),...set('target',row.action,[foreign,valid,`SpriteVar(Group) = ${row.group}`,`SpriteVar(Image) = ${row.image}`]),...set('continue',row.continue?1:0,[foreign,valid,`SpriteVar(Group) = ${row.group}`,`SpriteVar(Image) = ${row.image}`])]),
    ...cblock('hide unmatched pose','RemoveExplod',[`!(${staticOn})`, `!(${timedOn})`,exists],[['id',id]]),
    ...(table?[...cblock('create static foreign pose','Explod',[staticOn,`!${exists}`],staticParams.filter(([key])=>key!=='ignorehitpause')),
      ...cblock('switch static foreign pose','ModifyExplod',[staticOn,exists,`ExplodVar(${id}, 0, anim) != ${table.action}`],[['id',id],['anim',table.action],['animelem',slot]]),
      ...cblock('seek static foreign pose','ModifyExplod',[staticOn,exists],[['id',id],['animelem',slot],['animfreeze',1],...staticUpdate])]:[]),
    ...cblock('create timed or owned accessory','Explod',[timedOn,`!(${staticOn})`,`!${exists}`],timedParams.filter(([key])=>key!=='ignorehitpause'),timedIgnore),
    ...cblock('switch timed pose','ModifyExplod',[timedOn,`!(${staticOn})`,exists,`(${switchTimed})`],[['id',id],['anim',target],['animelem',1],['animelemtime',0]],timedIgnore),
    ...(pause==='never'?[]:cblock('hold timed phase','ModifyExplod',[timedOn,`!(${staticOn})`,exists,`!(${switchTimed})`,freeze],[['id',id],['animelem',`ExplodVar(${id}, 0, animelem)`],['animelemtime',`ExplodVar(${id}, 0, animelemtime)`]],timedIgnore)),
    ...cblock('follow timed owner','ModifyExplod',[timedOn,`!(${staticOn})`,exists],update,timedIgnore),
    ...set('wasforeign',`(${foreign})`,[]),
    ...set('group','SpriteVar(Group)',[foreign,valid]),
    ...set('image','SpriteVar(Image)',[foreign,valid])];
  return lines.join('\n');
}

module.exports={buildIndependentForeignState};
