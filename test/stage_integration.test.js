'use strict';

const assert = require('assert');
const { scanStageIntegration, crossReferenceStage, attachedCharacterTemplates } = require('../src/stage_integration');

const scan = scanStageIntegration(`modifyStageBG{ID: 101; actionno: 1}\nmodifyBGCtrl{sctrlID: 301; value: 0}\nmodifyStageVar{camera.boundleft: -200}\nlet x = stageConst(WaterGround);\nlet y = stageBGVar(101,0,actionno);\nlifebarAction{text: "Wall Break"}`, 'interaction.zss');
assert.strictEqual(scan.modifyStageBg[0].target, 101);
assert.strictEqual(scan.modifyBgCtrl[0].target, 301);
assert.deepStrictEqual(scan.modifyStageVar[0].parameters, ['camera.boundleft']);
assert.deepStrictEqual(scan.stageConstants, ['WaterGround']);
assert.strictEqual(scan.lifebarActions, 1);
const refs = crossReferenceStage({ backgrounds: [{ id: 101 }], controllers: [{ sctrlid: 301 }], constants: { WaterGround: '1' } }, [scan]);
assert.strictEqual(refs.issues.length, 0);
const bad = crossReferenceStage({ backgrounds: [], controllers: [], constants: {} }, [scan]);
assert.strictEqual(bad.issues.length, 3);
const template = attachedCharacterTemplates({ name: 'Breakable Wall', prefix: 'Wall_', sff: '../wall.sff' });
assert.match(template.def, /sprite = \.\.\/wall\.sff/);
assert.match(template.zss, /map\(Wall_RoundReady\)/);
assert.match(template.zss, /noAutoTurn/);
console.log('Stage integration tests passed');
