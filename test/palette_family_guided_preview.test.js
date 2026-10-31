'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {encodeIndexedPng,readIndexedPng}=require('../src/palette_indexed_png');
const template=require('../src/palette_family_template_sync');
const {COMPACT_SECTIONS,PALETTE_FAMILY_ROUTES,sourceHtml,paletteFamilyPresentation}=require('../src/palette_workspace_view');

assert(COMPACT_SECTIONS.some(([id,label])=>id==='palette-family'&&label==='Palette Family & Image Sync'));
assert.deepStrictEqual(PALETTE_FAMILY_ROUTES,[['template','index'],['template','visual'],['template','sync'],['template','finish'],['modify','remap'],['modify','sync'],['modify','review'],['modify','finish']]);
assert(PALETTE_FAMILY_ROUTES.every(([mode])=>!['add','replace','editStandard','batch'].includes(mode)),'familiar Standard workflows stay unchanged');
const html=sourceHtml({session:{context:{kind:'existing-sff',section:'index-migration'},target:{filename:'family.sff'},sources:[],facts:{preview:'none',staged:'none',embedded:'saved',builtOutput:'none',adoption:'none'},stale:false,staleReasons:[],organizer:{semanticEntries:[]},family:{status:'none',config:{namedMappingIds:[],explicitRangeMappings:[],aliasDecisions:{},defaults:{}},template:{},reverseSync:{},output:{}}},palettes:[]});
assert.match(html,/Palette Family & Image Sync/);
assert.match(html,/for\(const\[mode,step\]of data\.familyRoutes\)/,'guided routes come from one testable projection');
assert.match(html,/data-body="palette-family"/);
assert.match(html,/const routedFamilyRender=renderFamily/);
assert.match(html,/host\.replaceChildren\(\.\.\.legacy\.childNodes\)/,'the technical legacy host delegates to one visible family host');
assert.match(html,/legacySection\.hidden=true/,'the empty compatibility section cannot remain visible');
assert.match(html,/legacyTool\.onclick=.*palette-family/s,'the legacy All tools entry redirects to the first-class family section');
for(const status of ['browsing','paused','summary'])assert.strictEqual(paletteFamilyPresentation({status},null),'browse',status+' keeps Quick Browse visible');
for(const recovery of ['ready','needs-workshop'])assert.strictEqual(paletteFamilyPresentation({status:'none'},{template:{syncReview:{recovery:{status:recovery}}}}),'browse',recovery+' recovery remains visible');
assert.strictEqual(paletteFamilyPresentation({status:'none'},{workflow:{current:{}}}),'browse','a retained workflow remains visible on sync steps');
assert.strictEqual(paletteFamilyPresentation({status:'none'},{template:{syncReview:{}}}),'sync','an idle sync step uses the compact sync presentation');
assert.match(html,/familyPresentation\(session\.family,family\)==='sync'/,'guided step and retained workflow state jointly choose presentation');
assert.match(html,/className='family-recovery sync-conflict'/,'recovery is a composable card beside retained Quick Browse state');
assert.match(html,/familyPresentation\(session\.family,family\)!=='browse'/,'the recovery card is rendered for browse, paused, summary, and recovery presentations');
assert.match(html,/familyBrowseSaveRecovered[\s\S]*familySaveRecoveredCopy/,'ready recovery exposes the separate indexed-copy action');
assert.match(html,/familyBrowseRecoveryWorkshop[\s\S]*action:'workshop'/,'needs-workshop recovery exposes a direct continuation without replacing Quick Browse');
assert.match(html,/Preview .*Sprite.*Template image/s);
assert.match(html,/familyPreviewMode/);
assert.match(html,/familyFocusPending/);
assert.match(html,/@media\(max-width:520px\).*family-preview-choice/s);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-family-preview-'));
try{
  const filename=path.join(root,'template.png'),indices=Buffer.from([0,1,2,1]),colors=Array.from({length:256},(_,index)=>index===0?[11,22,33,0]:[index,index,index,255]);
  fs.writeFileSync(filename,encodeIndexedPng({width:2,height:2},indices,colors,{bitDepth:8}));
  const before=fs.readFileSync(filename),authority=template.loadAuthority(filename),candidateColors=colors.map(color=>color.slice());candidateColors[2]=[90,91,92,255];
  const preview=template.exactPreview(authority,candidateColors,{index:1,color:[200,10,20,128]});
  assert.strictEqual(preview.kind,'template-image');assert.strictEqual(preview.width,2);assert.strictEqual(preview.height,2);assert.strictEqual(preview.indexPlaneHash,authority.indexPlaneHash);
  const decoded=readIndexedPng(Buffer.from(preview.dataUri.split(',')[1],'base64'));
  assert.deepStrictEqual([...decoded.indices],[...indices],'template preview retains the exact reviewed index plane and dimensions');
  assert.deepStrictEqual(decoded.colors[0],[11,22,33,0],'transparent index 0 is preserved exactly');
  assert.deepStrictEqual(decoded.colors[1],[200,10,20,128],'current per-palette override is visible without changing authority');
  assert.deepStrictEqual(decoded.colors[2],[90,91,92,255],'the selected candidate palette table colors the remaining template indexes');
  assert.deepStrictEqual(fs.readFileSync(filename),before,'template preview is read-only');
  fs.appendFileSync(filename,Buffer.from([0]));
  assert.throws(()=>template.exactPreview(authority,candidateColors),'stale template authority fails closed');
}finally{fs.rmSync(root,{recursive:true,force:true})}

console.log('Palette Family guided reachability and exact template preview tests passed');
