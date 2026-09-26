'use strict';

function numbers(pattern, text) {
  const result = [];
  let match;
  while ((match = pattern.exec(text))) result.push(Number(match[1]));
  return result;
}

function names(pattern, text) {
  const result = [];
  let match;
  while ((match = pattern.exec(text))) result.push(match[1].trim());
  return result;
}

function blocks(controller, text) {
  const result = [];
  const pattern = new RegExp(`${controller}\\s*\\{([\\s\\S]*?)\\}`, 'gi');
  let match;
  while ((match = pattern.exec(text))) result.push({ body: match[1], index: match.index, line: text.slice(0, match.index).split(/\r?\n/).length });
  return result;
}

function scanStageIntegration(text, filename = '') {
  const source = String(text || '');
  const bg = blocks('modifyStageBG', source).map((item) => ({ ...item, target: numbers(/\bID\s*:\s*(-?\d+)/gi, item.body)[0] ?? -1 }));
  const ctrl = blocks('modifyBGCtrl', source).map((item) => ({ ...item, target: numbers(/\b(?:ID|sctrlID)\s*:\s*(-?\d+)/gi, item.body)[0] ?? -1 }));
  const vars = blocks('modifyStageVar', source).map((item) => ({ ...item, parameters: names(/\b([a-z][\w.]+)\s*:/gi, item.body) }));
  return {
    filename,
    modifyStageBg: bg,
    modifyBgCtrl: ctrl,
    modifyStageVar: vars,
    stageConstants: names(/\bstageConst\s*\(\s*([^\)]+)\)/gi, source),
    stageVariables: names(/\bstageVar\s*\(\s*([^\)]+)\)/gi, source),
    stageBgReads: numbers(/\bstageBGVar\s*\(\s*(-?\d+)/gi, source),
    redirects: names(/\bredirectID\s*:\s*([^;\}\r\n]+)/gi, source),
    helpers: numbers(/\bhelper\s*\{[\s\S]*?\bID\s*:\s*(-?\d+)/gi, source),
    lifebarActions: blocks('lifebarAction', source).length,
    fightScreenVars: names(/\bfightScreenVar\s*\(\s*([^\)]+)\)/gi, source)
  };
}

function crossReferenceStage(model, scans) {
  const issues = [], bgIds = new Set(model.backgrounds.filter((item) => item.id !== null).map((item) => item.id));
  const ctrlIds = new Set(model.controllers.filter((item) => item.sctrlid !== null).map((item) => item.sctrlid));
  const constants = new Set(Object.keys(model.constants).map((name) => name.toLowerCase()));
  for (const scan of scans) {
    for (const use of scan.modifyStageBg) if (use.target >= 0 && !bgIds.has(use.target)) issues.push({ severity: 'warning', code: 'missing-bg-target', message: `${scan.filename}: ModifyStageBG targets BG ID ${use.target}, which is not declared by this stage.`, line: use.line });
    for (const use of scan.modifyBgCtrl) if (use.target >= 0 && !ctrlIds.has(use.target)) issues.push({ severity: 'warning', code: 'missing-bgctrl-target', message: `${scan.filename}: ModifyBGCtrl targets sctrlid ${use.target}, which is not declared by this stage.`, line: use.line });
    for (const name of scan.stageConstants) if (!constants.has(name.toLowerCase())) issues.push({ severity: 'review', code: 'missing-stage-constant', message: `${scan.filename}: StageConst(${name}) has no matching constant in this stage.` });
  }
  return { bgIds: [...bgIds], controllerIds: [...ctrlIds], scans, issues };
}

function attachedCharacterTemplates(options = {}) {
  const name = String(options.name || 'Stage Interaction').replace(/[\r\n"]/g, '').trim() || 'Stage Interaction';
  const prefix = String(options.prefix || 'Stage_').replace(/[^A-Za-z0-9_.]/g, '') || 'Stage_';
  const sff = String(options.sff || '../stage.sff').replace(/\\/g, '/');
  return {
    def: `[Info]\nname = "${name}"\ndisplayname = "${name}"\nauthor = "Project stage team"\nikemenversion = 1.0\nlocalcoord = 320,240\n\n[Files]\nsprite = ${sff}\nanim = interaction.air\nst = interaction.zss\n`,
    air: `; Intentionally empty. Add only animations owned by this stage interaction.\n`,
    zss: `# Project-owned IKEMEN stage interaction.\n# Static presentation belongs in the stage DEF. Add helpers only for persistent entities or collision.\n\n[StateDef 5900; anim: -2;]\nchangeState{value: 0}\n\n[StateDef 0; type: S; moveType: I; physics: N; anim: -2; ctrl: 0;]\nassertSpecial{flag: invisible; flag2: noShadow; flag3: noAutoTurn; flag4: noStandGuard; flag5: noCrouchGuard; flag6: noAirGuard}\nplayerPush{value: 0}\nnotHitBy{value: SCA}\n\n[StateDef -4]\n# Coordinate global stage behavior here.\n# Use BG id with ModifyStageBG and BGCtrl sctrlid with ModifyBGCtrl.\n# Keep rollback-relevant behavior deterministic and independent of Lua.\nif roundState = 0 && stageVar(StageInfo.ResetBG) = 1 {\n    map(${prefix}RoundReady) := 1;\n}\n`,
    readme: `# ${name}\n\nThis attached character is owned by its stage. Keep static art and camera settings in the stage DEF. Use this code only for interactions that require runtime state, collision, player redirects, or changes to targetable stage backgrounds/controllers.\n\nTarget BG elements with their \`id\`. Target BGCtrl blocks with their \`sctrlid\`. Verify all generated behavior in the configured IKEMEN 1.0 build.\n`
  };
}

module.exports = { scanStageIntegration, crossReferenceStage, attachedCharacterTemplates };
