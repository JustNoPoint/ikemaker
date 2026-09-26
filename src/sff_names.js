'use strict';

const SPECIALS = [
  ['Fireball', ['Hadouken']], ['DP', ['Shoryu', 'Shoryuken']], ['AirborneAdvance', ['Tatsu', 'Tiger Knee', 'Blanka Ball', 'Psycho Crusher']],
  ['GroundedAdvance', ['Donkey Kick', 'Joudan']], ['StationaryBurst', ['Hashogeki', 'Hasho']], ['ResourceCharge', ['Denjin Charge', 'Stock Charge', 'Install']],
  ['DiveAttack', ['Dive Kick', 'Dive Punch']], ['CommandGrab', ['Special Throw', 'Command Throw', '360']], ['BodyShift', ['Physical Shift', 'Special Movement']],
  ['Teleport', ['Warp', 'Vanish Teleport']], ['FloatAerialControl', ['Float', 'Hover', 'Yoga Float']], ['CommandDash', ['Special Dash', 'Rekka Dash']],
  ['CounterAttack', ['Counter High', 'Counter Mid', 'Counter Low']], ['SustainedAttack', ['Hundred Hand Slap', 'Lightning Legs', 'Electricity', 'Lariat']]
];

const EXACT = new Map([
  [0, 'Standing idle'], [5, 'Turn standing'], [6, 'Turn crouching'], [10, 'Crouch transition'], [11, 'Crouching idle'], [12, 'Rise from crouch'],
  [20, 'Walk forward'], [21, 'Walk backward'], [40, 'Jump start'], [41, 'Neutral jump'], [42, 'Forward jump'], [43, 'Backward jump'],
  [100, 'Forward dash / run'], [105, 'Backward dash / hop'], [130, 'Standing guard'], [131, 'Crouching guard'], [132, 'Aerial guard'],
  [180, 'Win pose 1'], [181, 'Win pose 2'], [190, 'Intro 1'], [191, 'Intro 2'], [192, 'Intro 3'], [193, 'Intro 4'], [195, 'Taunt 1'],
  [200, 'Standing Light Punch'], [210, 'Standing Medium Punch'], [220, 'Standing Heavy Punch'], [230, 'Standing Light Kick'], [240, 'Standing Medium Kick'], [250, 'Standing Heavy Kick'],
  [400, 'Crouching Light Punch'], [410, 'Crouching Medium Punch'], [420, 'Crouching Heavy Punch'], [430, 'Crouching Light Kick'], [440, 'Crouching Medium Kick'], [450, 'Crouching Heavy Kick'],
  [600, 'Jumping Light Punch'], [610, 'Jumping Medium Punch'], [620, 'Jumping Heavy Punch'], [630, 'Jumping Light Kick'], [640, 'Jumping Medium Kick'], [650, 'Jumping Heavy Kick'],
  [800, 'Throw attempt'], [900, 'System: Roll forward'], [910, 'System: Standing guard-break reaction'], [911, 'System: Crouching guard-break reaction'], [912, 'System: Aerial guard-break reaction'],
  [920, 'System: Standing parry'], [921, 'System: Crouching parry'], [922, 'System: Aerial parry'],
  [5000, 'Get hit: High'], [5010, 'Get hit: Mid / low'], [5020, 'Get hit: Crouching'], [5030, 'Get hit: Back / KO transition'], [5040, 'Get hit: Fall / lying / OTG'], [5052, 'Get hit: Twist-KO fall'],
  [5070, 'Get hit: Native trip transition'], [5075, 'Get hit: Trip sequence'], [5080, 'Get hit: Lie-down action'], [5120, 'Get up'], [5300, 'Dizzy'], [5950, 'Chip KO'], [9010, 'Shock reaction'],
  [59000, 'Protected master palette template']
]);

function layerInfo(group) {
  if (group >= 10000 && group < 60000) { const layer = Math.floor(group / 10000), base = group - layer * 10000; if (layer >= 1 && layer <= 4) return { layer, base }; }
  return { layer: 0, base: group };
}

function transformationInfo(item) {
  const value = Number(item);
  if (!Number.isInteger(value) || value < 0 || value > 65535) return { form: 0, baseItem: value, reserved: false };
  if (value >= 10000 && value < 50000) return { form: Math.floor(value / 10000), baseItem: value % 10000, reserved: false };
  return { form: 0, baseItem: value, reserved: value >= 50000 };
}

function transformationItem(baseItem, form) {
  const item = Number(baseItem), slot = Number(form);
  if (!Number.isInteger(item) || item < 0 || item > 9999) throw new Error('Base transformation sprite item must be 0-9999.');
  if (!Number.isInteger(slot) || slot < 0 || slot > 4) throw new Error('Transformation form must be 0-4.');
  return item + slot * 10000;
}

function commandNormal(group, start, end, posture, firstSlot) {
  if (group < start || group > end || group % 5 !== 0) return null;
  return `${posture} Command Normal ${firstSlot + Math.floor((group - start) / 5)}`;
}

function baseSystemName(group) {
  if (EXACT.has(group)) return { name: EXACT.get(group), family: '', aliases: [] };
  if (group >= 182 && group <= 189) return { name: `Win pose ${group - 178}`, family: 'Presentation', aliases: [] };
  if (group >= 194 && group <= 199) return { name: `Taunt ${group - 194}`, family: 'Presentation', aliases: [] };
  for (const [start, end, posture, first] of [[260, 295, 'Standing', 1], [460, 495, 'Crouching', 1], [660, 695, 'Jumping', 1], [700, 725, 'Standing', 9], [730, 755, 'Crouching', 9], [760, 785, 'Jumping', 9]]) {
    const name = commandNormal(group, start, end, posture, first); if (name) return { name, family: 'Command Normal', aliases: [] };
  }
  if (group >= 790 && group <= 795 && group % 5 === 0) return { name: 'Flexible Command Normal Reserve', family: 'Command Normal', aliases: [] };
  if (group >= 930 && group <= 939) return { name: `Win pose overflow ${group - 929}`, family: 'Presentation', aliases: [] };
  if (group >= 940 && group <= 949) return { name: `Intro overflow ${group - 939}`, family: 'Presentation', aliases: [] };
  if (group >= 800 && group <= 899) return { name: `Throw family ${group}`, family: 'Throw', aliases: [] };
  if (group >= 900 && group <= 999) return { name: `Character system animation ${group}`, family: 'System', aliases: [] };
  if (group >= 1000 && group <= 2399) { const block = Math.floor((group - 1000) / 100), family = SPECIALS[block], offset = group % 100, air = offset >= 50, sequence = Math.floor((offset % 50) / 10) + 1; if (family) return { name: `Special: ${family[0]} · ${air ? 'Air' : 'Ground'} sequence ${sequence}`, family: family[0], aliases: family[1] }; }
  if (group >= 2400 && group <= 2999) return { name: `Special permanent overflow ${group}`, family: 'Special overflow', aliases: [] };
  if (group >= 3000 && group <= 4399) { const block = Math.floor((group - 3000) / 100), family = SPECIALS[block], offset = group % 100, air = offset >= 50, sequence = Math.floor((offset % 50) / 10) + 1; if (family) return { name: `Hyper: ${family[0]} · ${air ? 'Air' : 'Ground'} sequence ${sequence}`, family: family[0], aliases: family[1] }; }
  if (group >= 4400 && group <= 4999) return { name: `Hyper permanent overflow ${group}`, family: 'Hyper overflow', aliases: [] };
  if (group >= 6500 && group <= 6999) return { name: `Temporary SFF intake ${group}`, family: 'Temporary intake', aliases: [] };
  if (group >= 7000 && group <= 7999) return { name: `Community optional animation ${group}`, family: 'Community standard', aliases: [] };
  if (group >= 60000 && group <= 60999) return { name: `Archived animation ${group}`, family: 'Archive', aliases: [] };
  return { name: `Unmapped group ${group}`, family: '', aliases: [] };
}

function systemName(group) {
  const layer = layerInfo(group), result = baseSystemName(layer.base);
  return { ...result, baseGroup: layer.base, layer: layer.layer, name: layer.layer ? `Layer ${layer.layer}: ${result.name}` : result.name };
}

function spriteSystemName(group, item) {
  const result = systemName(group), form = transformationInfo(item);
  return {
    ...result,
    baseItem: form.baseItem,
    form: form.form,
    transformationReserved: form.reserved,
    name: form.form ? `Form ${form.form}: ${result.name}` : result.name
  };
}

module.exports = { SPECIALS, systemName, spriteSystemName, layerInfo, transformationInfo, transformationItem };
