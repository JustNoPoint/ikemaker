'use strict';

const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,'src',name),'utf8');
const stage=read('stage_workspace.js'),screenpack=read('screenpack_workspace.js'),storyboard=read('storyboard_workspace.js'),library=read('visual_component_library.js');

assert(stage.includes('Save reusable BG…')&&stage.includes('Insert saved BG…')&&stage.includes('Manage saved BGs…'));
assert(stage.includes('Saved BGs are the reusable recipe/favorites workflow'));
assert(stage.includes('Inherit properties…')&&stage.includes('inheritSectionEntries('),'Stage exposes reusable BG capture/insertion alongside reviewed property inheritance');

assert(screenpack.includes('Save reusable element…')&&screenpack.includes('Insert saved element…')&&screenpack.includes('Manage saved elements…'));
assert(screenpack.includes('Saved elements are the reusable recipe/favorites workflow'));
assert(screenpack.includes('captureUiElement(')&&screenpack.includes('insertUiElement('),'Screenpack reuse captures and inserts a complete prefixed UI element group');

assert(storyboard.includes('Save reusable scene…')&&storyboard.includes('Insert saved scene…')&&storyboard.includes('Manage saved scenes…'));
assert(storyboard.includes('Saved scenes are the reusable recipe/favorites workflow'));
assert(storyboard.includes('Save the selected complete scene to the reusable visual component library'));
assert(storyboard.includes("captureSection(text,scene.line,'storyboard-scene'")&&storyboard.includes('insertSectionComponent(text,picked.component)'),'Storyboard reuse captures and inserts complete scenes');

for(const source of [stage,screenpack,storyboard])assert(source.includes("createVisualComponentLibrary(context.globalState||context.workspaceState)")||source.includes('createVisualComponentLibrary(context.globalState || context.workspaceState)'));
assert(library.includes("const STORAGE_KEY = 'ikemaker.visualComponents.v1'"),'all three surfaces intentionally share one reusable component persistence schema');
assert(!/ikemaker\.(?:stage|screenpack|storyboard)(?:Recipes|Favorites)/.test(stage+screenpack+storyboard),'no duplicate recipe/favorites persistence schema was introduced');

console.log('Stage, Screenpack, and Storyboard clearly surface one shared reusable-component recipe workflow');
