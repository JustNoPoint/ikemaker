'use strict';
const assert=require('assert');const {parseSndBuffer,soundBuffer}=require('../src/snd_reader');const {deleteSoundsFromSnd,renumberSoundsInSnd}=require('../src/snd_direct_edit');
function fixture(){const parts=[Buffer.from('RIFF\x04\x00\x00\x00WAVE','binary'),Buffer.from('RIFF\x04\x00\x00\x00WAVE','binary')],out=Buffer.alloc(24+parts.reduce((n,p)=>n+16+p.length,0));out.write('ElecbyteSnd\0','binary');out.writeUInt16LE(1,12);out.writeUInt32LE(2,16);out.writeUInt32LE(24,20);let at=24;parts.forEach((part,i)=>{const next=at+16+part.length;out.writeUInt32LE(next,at);out.writeUInt32LE(part.length,at+4);out.writeInt32LE(10,at+8);out.writeInt32LE(i,at+12);part.copy(out,at+16);at=next});return parseSndBuffer(out,'fixture.snd')}
{const a=fixture(),b=parseSndBuffer(deleteSoundsFromSnd(a,[0]));assert.equal(b.entries.length,1);assert.deepEqual([b.entries[0].group,b.entries[0].index],[10,1]);assert.ok(soundBuffer(b,b.entries[0]).equals(soundBuffer(a,a.entries[1])))}
{const a=fixture(),b=parseSndBuffer(renumberSoundsInSnd(a,[1],20,new Map([[1,5]])));assert.deepEqual(b.entries.map(e=>[e.group,e.index]),[[10,0],[20,5]])}
{const a=fixture(),b=parseSndBuffer(deleteSoundsFromSnd(a,[0,1]));assert.equal(b.entries.length,0)}
console.log('SND direct delete/renumber preserves WAV payloads and supports empty archives');
