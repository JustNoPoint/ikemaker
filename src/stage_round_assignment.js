'use strict';
const path=require('node:path'),{parseDef,kind,unquote}=require('./def_model'),{setEntry}=require('./stage_source_edits');
function roundAssignments(text){
 const document=parseDef(text),infos=document.sections.filter(s=>s.normalized==='info');
 if(kind(document)!=='stage'||infos.length!==1)throw Error('Round assignment requires a Stage with one unambiguous [Info] section.');
 const info=infos[0],seen=new Set(),rounds=[];
 for(const entry of info.entries){const match=/^round(\d+)def$/.exec(entry.normalized);if(!match)continue;const round=Number(match[1]);if(!Number.isSafeInteger(round)||round<0||round>2147483647)throw Error('An authored round number is outside the engine int32 range. Review its source.');if(round<2)throw Error('Authored round0def / round1def needs source review: key 0 is the main Stage, and round 1 starts on that main Stage outside cycling. This editor will not reinterpret those declarations.');if(seen.has(round))throw Error('Duplicate round binding '+round+' (including padded numeric aliases) requires source review.');seen.add(round);rounds.push({round,key:entry.key,path:unquote(entry.value),line:entry.line,value:entry.value});}
 const loops=info.entries.filter(e=>e.normalized==='roundloop');if(loops.length>1)throw Error('Duplicate RoundLoop requires source review.');
 const raw=loops[0]?.value||'0';if(!/^[+-]?\d+$/.test(raw))throw Error('RoundLoop must be a literal engine integer before using this editor.');
 return {info,rounds:rounds.sort((a,b)=>a.round-b.round),roundLoop:BigInt(raw)!==0n,loopEntry:loops[0]};
}
function planRoundAssignment(text,filename,options){
 const base=roundAssignments(text);let next=text;const changes=[];
 if(options.removeRound!==undefined){
  if(options.targetDef!==undefined)throw Error('Choose either assignment or removal.');
  const existing=base.rounds.find(row=>row.round===options.removeRound);if(!existing)throw Error('Choose an authored round assignment to remove.');
  const parts=text.split(/(\r\n|\r|\n)/);parts[existing.line*2]='; '+parts[existing.line*2];next=parts.join('');changes.push({key:existing.key,before:existing.value,after:'(removed; original source retained as a comment)'});
 }
 if(options.targetDef!==undefined){
  const round=options.round;if(!Number.isInteger(round)||round<2||round>999)throw Error('Choose a round from 2 to 999. Round 1 starts on the main Stage.');
  const relative=path.relative(path.dirname(filename),options.targetDef).replace(/\\/g,'/');if(!relative||/[\r\n";]/.test(relative))throw Error('Choose a representable Stage reference.');
  const existing=base.rounds.find(row=>row.round===round),key=existing?.key||'round'+round+'def',value='"'+relative+'"';
  if(existing?.value!==value){next=setEntry(next,base.info.line,key,value);changes.push({key,before:existing?.value||'(not assigned)',after:value});}
 }
 if(options.roundLoop!==undefined){if(typeof options.roundLoop!=='boolean')throw Error('Choose a round sequence mode.');if(options.roundLoop!==base.roundLoop){next=setEntry(next,base.info.line,base.loopEntry?.key||'roundloop',options.roundLoop?'1':'0');changes.push({key:'roundloop',before:base.loopEntry?.value||'0 (default)',after:options.roundLoop?'1':'0'});}}
 const result=roundAssignments(next);return {before:text,text:next,changes,rounds:result.rounds,roundLoop:result.roundLoop};
}
function roundAssignmentReview(filename,plan,target){
 const cycle=['Main Stage (key 0)',...plan.rounds.filter(row=>row.round!==0).map(row=>'key '+row.round+': '+(row.path||'(empty)'))].join(' → ');
 return 'Main Stage: '+filename+'\n'+plan.changes.map(c=>c.key+': '+c.before+' → '+c.after).join('\n')+(target?'\nExisting Stage: '+target.filename+(target.dirty?'\nUNSAVED target Stage edits are retained. Save that Stage too before testing; its current disk version otherwise loads.':'\nThe target Stage files remain unchanged.'):'')+'\n\n'+(plan.roundLoop?'Cycle sorted Stage keys every round, including main key 0, then repeat:\n'+cycle:'Use authored round numbers. Round 1 starts on the main Stage. Rounds without an assignment retain the current Stage, including rounds after the last assignment.')+'\n\nRoundNDef and RoundLoop are read only from the main Stage selected for the match. Attached entities remain owned by that main Stage; target attached declarations do not replace them. The active Stage contributes its Music settings; character music and persistence rules can affect playback. Use Music & Sounds to author those settings. This is round-boundary Stage selection, not a mid-match area transition.\n\nUNSAVED native main-Stage edit. Save the main DEF to use these assignments in game. Native or Stage Undo restores the reviewed text changes.';
}
module.exports={roundAssignments,planRoundAssignment,roundAssignmentReview};
