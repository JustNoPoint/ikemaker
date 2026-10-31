'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PRIMARY_ACTIONS, COMPACT_SECTIONS, sourceHtml, paletteWorkflowTransition, templateRegionRect } = require('../src/palette_workspace_view');

const source = fs.readFileSync(path.join(__dirname, '../src/palette_workspace_view.js'), 'utf8');
const routeContract = source.slice(source.indexOf('workflowModes='), source.indexOf('function renderTopologyLayout'));
for (const [id, title] of COMPACT_SECTIONS) {
  assert(routeContract.includes(`'${id}'`), `${title} (${id}) must remain reachable from the persistent desk or a Standard/Advanced task path`);
}

const controller = fs.readFileSync(path.join(__dirname, '../src/palette_workspace_controller.js'), 'utf8');
assert.strictEqual((controller.match(/service\.rebindSourceContext\(filename, options\)/g)||[]).length,2,'both an already-visible source panel and a reopened retained source must rebind explicit owner and return context');
assert.match(controller,/paletteWorkspaceAdvance[^\n]+add-staged/,'successful palette staging emits the executable Standard Add transition event');
for (const [action, label] of PRIMARY_ACTIONS) {
  assert(new RegExp(`action(?:===| === )['"]${action}['"]|action === ['"]${action}['"]`).test(controller), `${label} (${action}) requires a controller route`);
}

const session = { context: { kind: 'existing-sff', section: 'embedded' }, target: { filename: 'reachability.sff' }, sources: [], selection: { sprite: { physicalIndex: 0, group: 0, number: 0 }, palette: { physicalIndex: 0, group: 1, number: 1 } }, facts: { preview: 'none', staged: 'none', embedded: 'saved', builtOutput: 'none', adoption: 'none' }, stale: false, staleReasons: [], organizer: { semanticEntries: [] } };
const html = sourceHtml({ session, palettes: [{ physicalIndex: 0, group: 1, number: 1, colors: [[0, 0, 0, 0]] }] });
assert.deepStrictEqual(paletteWorkflowTransition({tier:'standard',mode:'add',step:'work'},'add-staged'),{tier:'standard',mode:'add',step:'build',focusSection:'plan-build'},'successful Standard Add staging advances to its visible Build & Verify step');
assert(html.includes("activeTier==='standard'&&activeMode!=='add'"),'Standard Add keeps its compact step navigation visible');
assert(html.includes("event.data?.type==='paletteWorkspaceAdvance'"),'the staged-plan host event drives the tested workflow transition');
for (const marker of ['Palette tools level', 'Standard', 'Advanced', 'All tools…', 'Fallback index of every Palette Workshop tool', 'This retained section has no visible route.', "activeTier='standard';activeMode='add'", "style.flexWrap='wrap'", 'The workshop lands on intent', 'desk.hidden=needed.size===0', 'Find a palette tool', 'New blank palette', 'Open palette workspace…', 'Palette lifecycle action']) assert(html.includes(marker), `missing Palette Workshop reachability marker: ${marker}`);
assert(html.includes("for(const item of [switcher,help,choices,intro,tabs,panel,desk,store])if(item)sections.append(item);for(const button"),'the final task-first arrangement keeps every workflow surface reachable without performing a second redraw');
for(const [,label] of PRIMARY_ACTIONS)assert(html.includes(label),`${label} must remain searchable in All tools`);
for(const marker of ['Create Image Template','1 Choose Images','2 Review Colors','3 Build Template Image','4 Optional Palette / Indexes','ordinary unindexed image','No palette, indexed image, or blank canvas is required.','Load existing palette (optional)…','templateChooseImages','templateLoadPalette'])assert(html.includes(marker),`missing image-first template marker: ${marker}`);
for(const marker of ['Edit the current primary template…','Import a recolored copy of this template…','Review an expanded copy of this template…','Review a completely new template candidate…','templateReviewDerivative','templateReviewExpansion','templateReviewCandidate','never combined with the current template'])assert(html.includes(marker),`missing explicit template intake path: ${marker}`);
for(const marker of ['Return Original Submitted Indexed Candidate…','templateReturnToOwner','intakePresentation','Use Reviewed Candidate','No file chooser is needed.'])assert(html.includes(marker)||controller.includes(marker),`missing retained primary-template return handoff: ${marker}`);
for(const marker of ['representative sprite images','Include in image template','required for ','replaceable without losing retained colors','Remove image and these colors','removeTemplateImageAndColors'])assert(html.includes(marker),`missing template color-coverage safeguard: ${marker}`);
for(const marker of ['Image Clean','Choose images for Image Clean…','post:imageCleanChooseImages','Quickly clean indexed artwork','large brush footprint for a fast delete/fill','verified cleaned copies'])assert(html.includes(marker),`missing dedicated Image Clean workflow marker: ${marker}`);
for(const marker of ['chooseImageCleanFiles','palette-image-clean-inline','Image Clean requires indexed working copies with at most 256 colors','imageCleanRepairSources','Originals stay unchanged'])assert(controller.includes(marker),`missing Image Clean controller/gate marker: ${marker}`);
for(const marker of ['Assign Transparent Color','Assign as Transparent Color','Select area to clean','Open image','Warning: some colors also appear outside this area','Remove selected area only','Remove these colors everywhere','Remove selected area','Nothing changes until you choose.','Original PNG files remain unchanged.','reviewTemplateRegionExclusion','applyTemplateRegionExclusion','sharedDecision','setTemplateCleanupFillFromImage'])assert(html.includes(marker)||controller.includes(marker),`missing template region-cleanup marker: ${marker}`);
for(const marker of ['Warning: new colors overlap a retained cleanup region','Ignore the new colors','Remove the new colors going forward','Continue deleting the selected area','resolveTemplateRegionContinuation','regionContinuationWarning'])assert(html.includes(marker)||controller.includes(marker),`missing retained-region continuation warning marker: ${marker}`);
assert.deepStrictEqual(templateRegionRect({start:{x:10,y:20},end:{x:60,y:70},imageRect:{left:10,top:20,width:100,height:100},sourceWidth:200,sourceHeight:200}),{x:0,y:0,width:100,height:100},'display coordinates map to exact source pixels');
assert.deepStrictEqual(templateRegionRect({start:{x:60,y:70},end:{x:10,y:20},imageRect:{left:10,top:20,width:100,height:100},sourceWidth:200,sourceHeight:200}),{x:0,y:0,width:100,height:100},'reverse drags map identically');
assert.deepStrictEqual(templateRegionRect({start:{x:-50,y:-50},end:{x:1500,y:900},imageRect:{left:0,top:0,width:1024,height:512},sourceWidth:2000,sourceHeight:1000}),{x:0,y:0,width:2000,height:1000},'selection clamps at every source edge after preview downscaling');
assert.deepStrictEqual(templateRegionRect({start:{x:512,y:256},end:{x:768,y:384},imageRect:{left:0,top:0,width:1024,height:512},sourceWidth:2000,sourceHeight:1000}),templateRegionRect({start:{x:1024,y:512},end:{x:1536,y:768},imageRect:{left:0,top:0,width:2048,height:1024},sourceWidth:2000,sourceHeight:1000}),'pixel mapping remains invariant across zoom');
for(const marker of ['Primary swatch overlay shown','templateLayout.overlay?.zones','pointer-events:none','templateOverlay'])assert(html.includes(marker)||controller.includes(marker),`missing expanded-template swatch overlay: ${marker}`);
assert(html.includes("post('sync')"),'the visible Sync Palette Images button must invoke its host navigation route');
assert(html.includes('[data-section="palette-family"]'),'the visible Sync button must focus the palette-family flow containing Import, Export, and Two-Way choices');
assert(html.indexOf('const taskFirstArrange=arrangeWorkspace') > html.indexOf('All tools…'), 'the task-first landing layer must run after the complete fallback catalog is created');

const toolbar = fs.readFileSync(path.join(__dirname, '../src/launch_controls.js'), 'utf8');
assert(toolbar.includes("palette:{new:'ikemen.palette.createScratch',open:'ikemen.palette.openWorkspace'}"), 'Palette New and Open must remain routed from the universal header');

for(const marker of ['templateChooseImages','templateScanFolder','Load optional palette index reference','templatePaletteAuthority','indexAuthority','templateImageCoverage','removeTemplateImageAndColors','templateReviewDerivative','templateReviewExpansion','templateReviewCandidate','recover-with-overlay','review-expanded-candidate'])assert(controller.includes(marker),`missing image-template controller/session route: ${marker}`);

console.log('Palette Workshop Standard, Advanced, fallback-tool, primary-action, narrow-width, and header reachability tests passed');
