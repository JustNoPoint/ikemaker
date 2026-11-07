'use strict';
// Experimental source generator for owned executable fixtures. No production mutation/UI capability.
const {expression}=require('./stage_reaction_plan');
function surfacePrototype(options){
 const namespace=options.namespace;if(typeof namespace!=='string'||!/^ikm_surface_[a-z0-9_]{1,40}$/i.test(namespace))throw Error('Choose a prototype surface namespace.');
 const {x1,y1,x2,y2}=options.segment||{};if(![x1,y1,x2,y2].every(Number.isFinite)||x2<=x1||Math.max(...[x1,y1,x2,y2].map(Math.abs))>100000)throw Error('Choose explicit finite left-to-right segment endpoints.');
 const participants=options.participants;if(!Array.isArray(participants)||!participants.length||new Set(participants).size!==participants.length||participants.some(n=>!Number.isInteger(n)||n<1||n>8))throw Error('Choose explicit active participant slots for the prototype.');
 const scale=options.ownerWidth/options.stageWidth;if(!Number.isFinite(scale)||scale<=0)throw Error('Provide source coordinate widths.');
 const segment={x1:x1*scale,x2:x2*scale,y1:y1*scale,y2:y2*scale},condition=expression(options.condition),tolerance=2*scale,rows=['# EXPERIMENTAL GroundLevelOffset segment. Requires a compatible participant landing/walk/break adapter.','# No native CreatePlatform/projectile collider and no generic fighter compatibility claim.','if !isHelper && roundState = 2 && ('+condition+') {'];
 for(const participant of participants){const map=key=>'map("'+namespace+'_p'+participant+'_'+key+'")',set=(key,value)=>'mapSet{map:"'+namespace+'_p'+participant+'_'+key+'";value:'+value+'}';
  rows.push('  if playerNoExist('+participant+') {','    '+set('id','(player('+participant+'),ID)'),
   '    '+set('x','(player('+participant+'),pos x) + cameraPos x'),
   '    '+set('y','(player('+participant+'),pos y) + (player('+participant+'),groundLevel)'),
   '    '+set('surface',segment.y1+' + ('+map('x')+' - '+segment.x1+') * '+(segment.y2-segment.y1)+' / '+(segment.x2-segment.x1)),
   '    if '+map('x')+' = ['+segment.x1+','+segment.x2+'] && '+map('y')+' <= '+map('surface')+' + '+tolerance+' {',
   '      groundLevelOffset{redirectid:'+map('id')+';value:'+map('surface')+'}',
   '    }','  }');
 }
 rows.push('}');return{kind:'experimental-ground-segment',namespace,segment:options.segment,participants,source:rows.join('\n')+'\n',limitations:['Offsets do not detach standing fighters when a surface disappears.','Grounded slope walking requires an explicit participant-owned position/ground adapter.','Throws, custom physics, private landing checks, hitpause/pause and competing ground writers require separate acceptance.']};
}
module.exports={surfacePrototype};
