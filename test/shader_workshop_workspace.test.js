'use strict';

const assert=require('assert');
const {createShaderWorkshopSession,renderShaderWorkshopHtml,MESSAGE_TYPES}=require('../src/shader_workshop_workspace');

const session=createShaderWorkshopSession({id:'test',name:'Workshop Test',now:1});
const message=payload=>({...payload,generation:session.snapshot().generation});
let html=renderShaderWorkshopHtml(session.snapshot(),{nonce:'fixture'});
assert(html.includes('Shader Workshop')&&html.includes('Engine-independent design mode'));
assert(html.includes('Preserve palette colors')&&html.includes('Preserve transparent pixels'));
assert.strictEqual((html.match(/data-safeguard=/g)||[]).length,9);
assert(html.includes('No engine process or shader code is being executed.'));
assert(!html.includes('src="http')&&!html.includes('fetch(')&&!html.includes('eval('),'offline shell does not load or execute remote shader content');

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
session.setPreview({sourceKind:'air',sourceLabel:'Decoded AIR action 200',loopStart:1,frames:[{dataUri:png,label:'Element 1',ticks:2},{dataUri:png,label:'Element 2',ticks:4}]});
html=renderShaderWorkshopHtml(session.snapshot(),{nonce:'fixture'});
assert(html.includes('id="previewImage" src="data:image/png;base64,')&&html.includes('Decoded AIR source preview'));
assert(html.includes('Previous preview frame')&&html.includes('Next preview frame')&&html.includes('id="previewPlay"'));
assert(html.includes('setTimeout(')&&!html.includes('setInterval('),'AIR playback advances locally at frame tick timing without host rerenders');
session.setPreview({sourceKind:'air',sourceLabel:'Three-frame stream',loopStart:0,frames:[{dataUri:png,label:'Element 1',ticks:1},{dataUri:png,label:'Element 2',ticks:1},{dataUri:png,label:'Element 3',ticks:1}]});
html=renderShaderWorkshopHtml(session.snapshot());
assert(html.includes('playing=false')&&html.includes('timer=null;if(show')&&html.includes('if(playing)schedule()'),'playback remains active and resumes after a streamed third frame arrives');
assert(html.includes('shaderCanvas.style.transform=transform'),'the trusted WebGL canvas receives the same AIR element transform as the decoded fallback image');
assert.strictEqual(session.handleMessage(message({type:'select-preview-frame',frame:1})).previewFrame,1);
assert.strictEqual(session.handleMessage(message({type:'select-preview-frame',frame:99})).previewFrame,2,'preview navigation clamps to the available frames');

assert.strictEqual(session.handleMessage(message({type:'set-safeguard',id:'preservePaletteColors',enabled:false})).project.safeguards.preservePaletteColors,false);
assert.strictEqual(session.snapshot().project.safeguards.preserveTransparentPixels,true,'palette and transparency remain independent in the UI controller');
assert.strictEqual(session.handleMessage(message({type:'set-safeguard',id:'preserveTransparentPixels',enabled:false,forged:true})),false);
assert.strictEqual(session.handleMessage(message({type:'select-preset',presetId:'outline'})).project.presetId,'outline');
html=renderShaderWorkshopHtml(session.snapshot());assert(html.includes('Review required')&&html.includes('Preserve sprite silhouette'));
assert.strictEqual(session.handleMessage(message({type:'set-target',targetKind:'fullscreen'})).project.target.kind,'fullscreen');
assert.strictEqual(session.handleMessage(message({type:'select-preset',presetId:'crt'})).project.presetId,'crt');
assert.strictEqual(session.handleMessage(message({type:'set-target',targetKind:'sprite'})).project.presetId,'passthrough','changing to an incompatible target resets the preset safely');

const ai=session.handleMessage(message({type:'prepare-ai',description:'Soft blue aura',variations:3}));assert.strictEqual(ai.aiBrief.intent,'Soft blue aura');assert.strictEqual(ai.aiBrief.includesSourcePixels,false);assert(ai.notice.includes('No AI service was contacted'));
assert.strictEqual(session.handleMessage(message({type:'prepare-ai',description:'x',variations:4})),false);
assert.strictEqual(session.handleMessage(message({type:'escape'})).aiBrief,null,'Escape clears the local staged AI brief');
assert.strictEqual(session.handleMessage(message({type:'escape'})),false);
assert(!MESSAGE_TYPES.some(type=>/save|write|execute|launch|apply/.test(type)),'initial workshop surface has no execution or write message');

console.log('Shader Workshop renders bounded sprite and animation previews with independent safeguards and a no-contact AI staging boundary');
