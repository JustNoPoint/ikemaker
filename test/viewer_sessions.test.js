'use strict';
const assert=require('assert'),Module=require('module');
const original=Module._load;
Module._load=function(name,parent,main){if(name==='./viewer_navigation'&&parent?.filename.endsWith('viewer_sessions.js'))return{archiveContext:()=>({ownerDef:'C:/Game/hero.def',prefix:'f',record:{source:'Archive selected manually'}})};return original.call(this,name,parent,main);};
function panel(){const listeners=[],dispose=[];return{listeners,viewColumn:2,active:true,onDidDispose:fn=>dispose.push(fn),dispose:()=>dispose.forEach(fn=>fn()),webview:{onDidReceiveMessage:fn=>listeners.push(fn),postMessage:message=>{queueMicrotask(()=>listeners.forEach(fn=>fn({type:'ikemenPresetState',id:message.id,reference:{group:200,frameIndex:1}})));return true;}}};}
(async()=>{
 const sessions=require('../src/viewer_sessions'),a=panel();sessions.register(a,'C:/Game/hero.air','air');
 assert.equal(sessions.find('c:\\game\\HERO.air','air'),a);
 let result=await sessions.capture();assert.equal(result.length,1);assert.deepEqual(result[0].reference,{group:200,frameIndex:1});assert.deepEqual(result[0].archiveContext,{ownerDef:'C:/Game/hero.def',prefix:'f',manual:true});assert.equal(result[0].group,2);
 sessions.updateSource(a,'C:/Game/other.air');assert.equal(sessions.find('C:/Game/hero.air','air'),undefined);assert.equal((await sessions.capture())[0].file,'C:/Game/other.air');
 a.webview.postMessage=()=>false;await assert.rejects(sessions.capture(),/did not respond/);
 a.webview.postMessage=()=>{sessions.updateSource(a,'C:/Game/third.air');a.dispose();return false;};await assert.rejects(sessions.capture(),/changed/);
 assert.deepEqual(await sessions.capture(),[]);
 const hitdef=panel();sessions.register(hitdef,'C:/Game/hero.zss','hitdef',true);assert(sessions.has(hitdef),'HitDef now has an exact source/controller restore route');hitdef.dispose();
 const manager=panel();sessions.register(manager,'C:/Game/.ikemen/project-registry.json','project_manager');assert(sessions.has(manager),'project manager has a stable registry-owned restore route');manager.dispose();
 const story=panel();sessions.register(story,'C:/Game/data/select.def','story_dialogue');assert(sessions.has(story),'Story & Dialogue has a stable roster-owned restore route');story.dispose();
 const intake=panel();sessions.register(intake,'C:/Art/frames/000.png','artist_intake',true);assert(sessions.has(intake),'Artist Intake has a source-bound typed restore route');intake.dispose();
 const assembly=panel();sessions.register(assembly,'C:/Art/base.sff','sff_assembly',true);assert(sessions.has(assembly),'SFF Assembly has an exact two-source restore route');assembly.dispose();
 const moveLab=panel();sessions.register(moveLab,'C:/Game/hero.def','move_lab',true);assert(sessions.has(moveLab),'Move Lab has a character-bound typed route');moveLab.dispose();
 const spatial=panel();sessions.register(spatial,'C:/Game/hero.def','spatial_composer',true);assert(sessions.has(spatial),'Spatial Composer has a character-bound typed route');spatial.dispose();
 const helper=panel();sessions.register(helper,'C:/Game/hero.def','helper',true);assert(sessions.has(helper),'Helper Lab has a character-bound typed route');helper.dispose();
 const throwCreator=panel();sessions.register(throwCreator,'C:/Game/hero.def','throw_creator',true);assert(sessions.has(throwCreator),'Throw Creator has a character-bound typed route');throwCreator.dispose();
 console.log('Typed session capture retains selection/context, updates reused sources, and fails safely on missing responses and disposal');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>Module._load=original);
