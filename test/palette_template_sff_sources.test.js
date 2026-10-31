'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','src','palette_workspace_controller.js'),'utf8');
for(const marker of [
  'chooseSffTemplateSprites(state)',
  "label:'Current SFF'",
  "label:'Choose another SFF…'",
  "scope:'truecolor'",
  "scope:'all-indexed'",
  "includeTruecolor:true",
  'spritePng(archive,sprite,null,isIndexed)',
  'intake.chooseReviewedSprites',
  'review.semanticDuplicates',
  "sourceKind:choice.includeTruecolor?'sff-mixed':'sff-indexed'",
  'chooseIndexedTemplateFolder()',
  'readIndexedPng(fs.readFileSync(item.filename))',
  "action==='templateUseSffSprites'",
  "action==='templateScanIndexedFolder'"
])assert(source.includes(marker),`missing SFF/indexed-folder template source behavior: ${marker}`);
assert(source.includes("templateSource:{kind:sourceKind,indexed:chosen.indexed===true"),'the inline template session retains its exact source kind and SFF manifest');
console.log('Palette template SFF, mixed truecolor, and pre-indexed-folder source tests passed');
