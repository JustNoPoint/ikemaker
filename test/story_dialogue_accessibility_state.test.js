'use strict';
const assert = require('assert');
const Module = require('module'), original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return { window:{}, workspace:{ getConfiguration:()=>({ get:(_, value)=>value }) }, commands:{}, Uri:{ file:fsPath=>({fsPath}), parse:value=>({fsPath:value.replace(/^file:\/\/\//,'')}) }, ViewColumn:{}, TextEditorRevealType:{}, Selection:class{}, Range:class{} };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/story_dialogue_workspace');
Module._load = original;

const availability = workspace.storyDialogueControlAvailability;
assert.deepStrictEqual(availability({ sourceCount:0, selected:-1 }, 'sourcePrevious'), { disabled:true, reason:'No sources are available in this view.' });
assert.deepStrictEqual(availability({ sourceCount:3, selected:-1 }, 'sourceNext'), { disabled:true, reason:'Select a source before moving to the next one.' });
assert.match(availability({ sourceCount:3, selected:0 }, 'sourcePrevious').reason, /first source/);
assert.strictEqual(availability({ sourceCount:3, selected:1 }, 'sourcePrevious').disabled, false);
assert.match(availability({ sourceCount:3, selected:2 }, 'sourceNext').reason, /last source/);
assert.match(availability({ sourceCount:1, selected:0 }, 'sourceRange').reason, /Only one source/);
assert.strictEqual(availability({ sourceCount:1, selected:-1 }, 'sourceSelect').disabled, false, 'the sole source remains selectable when no source is selected');
assert.match(availability({ sourceCount:1, selected:0 }, 'sourceSelect').reason, /only available source is already selected/);
assert.match(availability({ sourceCount:0, selected:-1 }, 'sourceSelect').reason, /No sources/);
assert.match(availability({ sourceCount:2, selected:-1 }, 'sourceOpen').reason, /Select a source/);
assert.strictEqual(availability({ lineCount:19, maxLines:20 }, 'addLine').disabled, false);
assert.match(availability({ lineCount:20, maxLines:20 }, 'addLine').reason, /maximum of 20/);
assert.match(availability({ hasRecoveredDraft:false }, 'discardDialogue').reason, /No recovered dialogue draft/);
assert.strictEqual(availability({ hasRecoveredDraft:true }, 'discardDialogue').disabled, false);
for (const control of ['createArc','copyDialogue','insertDialogue']) {
  assert.match(availability({ pendingMutations:1 }, control).reason, /Wait for the current Story or Dialogue action/);
  assert.strictEqual(availability({ pendingMutations:0 }, control).disabled, false);
}

const target = workspace.storyDialogueTabTarget;
assert.strictEqual(target(0, 'ArrowLeft', 3), 2);
assert.strictEqual(target(2, 'ArrowRight', 3), 0);
assert.strictEqual(target(1, 'Home', 3), 0);
assert.strictEqual(target(1, 'End', 3), 2);

const navigation={generation:1,selected:-1,count:0,navMode:'list',view:'dialogue',items:[],readout:'No dialogue source selected'};
const toolbar=require('../src/universal_toolbar_adapter').adapt('story.dialogue',{});
const page=workspace.html({file:'C:/game/data/select.def',selectUri:'file:///C:/game/data/select.def',arcs:[],portraitGroup:9100,maxLines:20,formDraft:null,selectSourceState:{available:false},insertedSourceState:{available:false},navigation,toolbar},'dialogue');
for (const contract of [
  'role="tablist" aria-label="Story and Dialogue views"', 'role="tabpanel" aria-labelledby="storyTabDialogue"',
  'role="status" aria-live="polite"', '<label for="enemy">Enemy internal name</label>',
  'aria-label="Dialogue speaker"', 'aria-label="Dialogue text"', '@media(max-width:680px)',
  'refreshControlStates()', "storyDialogueTabTarget(index,event.key,storyTabs.length)"
]) assert(page.includes(contract), `missing Story Dialogue accessibility contract: ${contract}`);

console.log('Story Dialogue actionable states, semantic views, named beats, and narrow layout passed');
