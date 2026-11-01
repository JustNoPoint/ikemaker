'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const placement=require('../src/palette_template_placement_draft');
const {createPaletteWorkspaceSession,revisePaletteWorkspaceSession}=require('../src/palette_workspace_session');
const {sourceHtml,PALETTE_FAMILY_ROUTES}=require('../src/palette_workspace_view');

const target={filename:path.resolve('template-placement.sff'),byteHash:'a'.repeat(64),byteLength:10},plan={filename:path.resolve('template-placement.palette-plan.json'),exists:false,byteHash:'b'.repeat(64),byteLength:0};
let session=createPaletteWorkspaceSession({sessionId:'template-placement-ui',target,plan});
const draft=placement.create({authorityHash:'c'.repeat(64),topologyCandidateHash:'d'.repeat(64),sourceWidth:32,sourceHeight:16,indexes:[12,18]});
session=revisePaletteWorkspaceSession(session,session.revision,{family:{...session.family,template:{...session.family.template,placementDraft:draft}}});
assert.strictEqual(session.family.template.placementDraft.draftHash,draft.draftHash,'partial visual placement survives canonical session normalization');
const restored=createPaletteWorkspaceSession({sessionId:'template-placement-ui-restored',target,plan,restored:JSON.parse(JSON.stringify(session))});
assert.strictEqual(restored.family.template.placementDraft.draftHash,draft.draftHash,'partial visual placement survives reload');

const html=sourceHtml({session,palettes:[]});
for(const text of ['Visual template placement','Before topology','After topology','Save & Next','Review Placements','Exact fields','Drag on the image','Arrow keys move','Shift plus arrows resize'])assert.match(html,new RegExp(text));
for(const action of ['familyTemplatePlacement','familyTemplatePlacementAdvance','familyTemplateNavigate','familyTemplateNudge','familyTemplateDecisions'])assert.match(html,new RegExp(action));
assert.match(html,/onpointerdown/);assert.match(html,/onpointerup/);assert.match(html,/event\.shiftKey/);assert.match(html,/event\.key==='Enter'/);assert.match(html,/event\.key==='Escape'/);
assert.match(html,/role="group" aria-label="Place swatch/,'the interactive board retains normal screen-reader navigation semantics');
assert.match(html,/@media\(max-width:650px\)\{\.template-placement-layout,\.template-before-after\{grid-template-columns:1fr\}/,'visual review stacks in narrow docks without horizontal discovery');
assert.match(html,/optimisticallyHideTemplateImage/,'template deletion removes the selected layer from view before slower coverage validation finishes');
assert.match(html,/pending\.optimisticHidden\)renderTemplateCanvas/,'cancelled or rejected deletion restores the authoritative canvas');
assert.match(html,/templateAssetCache/,'unchanged template layer images are reused across canvas mutations');
assert(PALETTE_FAMILY_ROUTES.some(([mode,step])=>mode==='template'&&step==='visual'));
assert(PALETTE_FAMILY_ROUTES.every(([mode])=>!['add','replace','editStandard','batch'].includes(mode)),'Standard routes remain unchanged');

const controller=fs.readFileSync(path.join(__dirname,'..','src','palette_workspace_controller.js'),'utf8');
assert.match(controller,/templatePlacement\.create/);assert.match(controller,/templatePlacement\.revise/);assert.match(controller,/templatePlacement\.navigate/);assert.match(controller,/templatePlacement\.nudge/);
assert.match(controller,/familyPlacementContext[\s\S]{0,900}templatePlacement\.assertBinding/,'every retained placement action is rebound to the current exact template and topology authority');
assert.match(controller,/familyTemplate\.bindPlacementEvidence\(authority,templatePlacement\.reviewedDecisions\(draft\)\)/,'pointer, keyboard, and numeric placements receive the same server-derived overwrite evidence');
assert.match(controller,/indexMapping=migrationModel\.mapping\(context\.migration\.plan\)\.oldToNew/,'final template review consumes the reviewed topology map');
assert.doesNotMatch(controller,/familyTemplate(?:Placement|Navigate|Nudge)[\s\S]{0,600}(transactionalWrite|writeFileSync)/,'partial visual placement remains retained-session only');

console.log('Palette visual template placement session, narrow UI, pointer/keyboard parity, topology binding, and no-write tests passed');
