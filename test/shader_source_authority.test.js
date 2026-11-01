'use strict';

const assert=require('assert'),path=require('path');
const {createShaderSourceAuthority}=require('../src/shader_source_authority');
const sff=path.resolve('authority.sff'),air=path.resolve('authority.air');let sffBytes=Buffer.from('sff-a'),airText='[Begin Action 200]\n1,0,0,0,4',live={version:3,getText:()=>airText};
const archive={sprites:[{index:0,group:1,number:0,paletteIndex:0},{index:1,group:1,number:0,paletteIndex:0}],palettes:[{index:0,group:1,number:1}]};
const authority=createShaderSourceAuthority({readBytes:filename=>filename===sff?sffBytes:Buffer.from(airText),parseArchive:()=>archive,getLiveDocument:filename=>filename===air?live:null});
const sprite=authority.captureSff(sff,{physicalIndex:1,group:1,number:0,palettePhysicalIndex:0});
assert.strictEqual(sprite.evidence.physicalIndex,1,'duplicate coordinates retain physical identity');assert.match(sprite.evidence.byteHash,/^[a-f0-9]{64}$/);
assert.strictEqual(authority.revalidate(sprite.evidence).evidence.byteHash,sprite.evidence.byteHash);
const animation=authority.captureAir(sff,air,200,{physicalIndex:1,group:1,number:0});
assert.strictEqual(animation.evidence.air.origin,'live-document');assert.strictEqual(animation.evidence.air.version,3);assert.strictEqual(animation.evidence.sprite.physicalIndex,1);
airText+='\n; unsaved change';live.version=4;assert.throws(()=>authority.revalidate(animation.evidence),/AIR source changed/);
airText='[Begin Action 200]\n1,0,0,0,4';live.version=3;sffBytes=Buffer.from('sff-b');assert.throws(()=>authority.revalidate(sprite.evidence),/SFF changed/);
assert.throws(()=>authority.captureSff(sff,{physicalIndex:0,group:2,number:0}),/no longer matches/);
console.log('Shader source authority binds physical SFF identity and live unsaved AIR evidence');
