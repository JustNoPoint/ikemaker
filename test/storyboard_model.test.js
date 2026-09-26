'use strict';
const assert = require('assert');
const { parseDef } = require('../src/def_model');
const { storyboardTemplate, storyboardModel, appendScene, duplicateScene, deleteScene, appendLayer } = require('../src/storyboard_model');
let text = storyboardTemplate('opening', 'Ryu Intro', 'intro.sff'); let model = storyboardModel(parseDef(text));
assert.deepStrictEqual(model.localCoord, [320,240]); assert.strictEqual(model.sff, 'intro.sff'); assert.strictEqual(model.scenes.length, 1);
text = appendScene(text, 1); model = storyboardModel(parseDef(text)); assert.strictEqual(model.scenes.length, 2);
text = duplicateScene(text, model.scenes[1].line, 2); assert.match(text, /\[Scene 2\]/);
model = storyboardModel(parseDef(text)); text = deleteScene(text, model.scenes[2].line); assert.doesNotMatch(text, /\[Scene 2\]/);
assert.match(storyboardTemplate('credits'), /layer0\.text = Credits/);
model = storyboardModel(parseDef(text)); text = appendLayer(text, model.scenes[0].line, { index: 1, kind: 'text', text: 'Round one' }); assert.match(text, /layer1\.text = """Round one"""/);
console.log('Storyboard model tests passed');

for (const value of ['Audit credits; thank you', 'Player #1 says "Go!"', '  keep spaces  ', 'literal """ quotes; # end', 'path\\', '']) {
  const source = storyboardTemplate('credits');
  const scene = storyboardModel(parseDef(source)).scenes[0];
  const written = appendLayer(source, scene.line, {index:1,kind:'text',text:value});
  assert.strictEqual(storyboardModel(parseDef(written)).scenes[0].layers[1].text, value);
}
assert.throws(() => appendLayer(storyboardTemplate('credits'), 11, {index:1,kind:'text',text:'one\ntwo'}), /one line/);
console.log('Storyboard literal text punctuation round-trip tests passed');

const offsetSource = storyboardTemplate('credits');
assert.match(offsetSource, /layer0\.offset = 160,120/);
assert.doesNotMatch(offsetSource, /layer0\.pos/);
const offsetLayer = appendLayer(offsetSource, storyboardModel(parseDef(offsetSource)).scenes[0].line, {index:1,kind:'text',text:'Visible'});
assert.match(offsetLayer, /layer1\.offset = 160,120/);
assert.match(offsetLayer, /layer1\.textwindow = 0,0,320,240/);
const combinedPosition = storyboardModel(parseDef('[SceneDef]\n[Scene 0]\nlayerall.pos = 10,20\nlayer0.offset = 30,40\nlayer0.spr = 0,0'));
assert.deepStrictEqual(combinedPosition.scenes[0].layers[0].position,[40,60]);
console.log('Storyboard native offset and text window tests passed');

// The engine interprets these as button tokens, not enable/disable flags.
for (const kind of Object.keys(require('../src/storyboard_model').TYPES)) {
  const sceneDef = require('../src/def_model').sectionMap(parseDef(storyboardTemplate(kind)).sections.find(s => s.normalized === 'scenedef' || s.name === 'SceneDef'));
  assert.strictEqual(sceneDef['key.skip'], 's');
  assert.strictEqual(sceneDef['key.cancel'], 'a, b, c, x, y, z, m');
}
console.log('Storyboard template input defaults match native engine buttons');
