'use strict';

const { commandBlock } = require('./command_movelist_model');

const policies = [
  { id: 'capcom', label: 'Capcom', relative: true, grace: 16 },
  { id: 'snk', label: 'SNK', relative: false, grace: 10 },
  { id: 'hdbz', label: 'HDBZ hybrid', relative: false, grace: 16 }
];
const ring = ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'];

function block(name, command, time = 1, steptime = 1) {
  return { name, command, time, steptime, autogreater: 0, bufferTime: 1, bufferHitpause: 1, bufferPauseend: 1, bufferShared: 1 };
}

function chargePreset(policy) {
  const { id, label, relative, grace } = policy;
  const base = 'ikm_' + id + '_bfbf';
  const sides = relative ? [['B', 'F']] : [['L', 'R'], ['R', 'L']];
  const blocks = sides.map(([back, forward]) => block(base + '_' + back.toLowerCase() + '_x',
    '~45$' + back + ', ' + [forward, back, forward, 'x'].join(', '), 4 * grace, grace));
  const route = relative ? 'command = "' + blocks[0].name + '"' :
    blocks.map((b, i) => '(facing = ' + (i ? '-1' : '1') + ' && command = "' + b.name + '")').join(' || ');
  return { id: 'charge-super-' + id, label: label + ' charge B,F,B,F', category: 'Simple Native', kind: 'native', blocks,
    explanation: 'Hold ' + (relative ? 'relative back' : 'physical left or right') + ' for 45 ticks. Native uses a uniform ' + grace + '-tick step limit. ' + (id === 'snk' ? 'Both physical directions are included. Use the supplied facing condition.' : 'Map setup gives the first forward 16 ticks and later stages 10 ticks each.'),
    route, setup: id === 'snk' ? null : id };
}

// A question mark marks one independently optional direction. Every generated path
// retains its own step timer and shares the motion's result name.
const optionalMotions = [
  ['hcf', 'Half-circle forward', 'B DB? D DF? F', 50],
  ['hcb', 'Half-circle back', 'F DF? D DB? B', 50],
  ['dhcf', 'Double half-circle forward', 'B DB? D DF? F B DB? D DF? F', 100],
  ['dhcb', 'Double half-circle back', 'F DF? D DB? B F DF? D DB? B', 100],
  ['hcf_b', 'Half-circle forward, back', 'B DB? D DF? F B', 40],
  ['hcb_f', 'Half-circle back, forward', 'F DF? D DB? B F', 40],
  ['f_hcf', 'Forward, half-circle forward', 'F B DB? D DF? F', 60],
  ['b_hcb', 'Back, half-circle back', 'B F DF? D DB? B', 60],
  ['qcf_hcb', 'Quarter-circle forward, half-circle back', 'D DF F DF? D DB? B', 60],
  ['qcb_hcf', 'Quarter-circle back, half-circle forward', 'D DB B DB? D DF? F', 60],
  ['dqcf', 'Capcom double quarter-circle forward', 'D DF F D DF F?', 60],
  ['dqcb', 'Capcom double quarter-circle back', 'D DB B D DB B?', 60]
];

function optionalPreset([family, label, pattern, time]) {
  const name = 'ikm_' + family + '_x';
  let paths = [[]];
  for (const token of pattern.split(' ')) {
    const optional = token.endsWith('?');
    const direction = optional ? token.slice(0, -1) : token;
    const included = paths.map(path => [...path, direction]);
    paths = optional ? paths.concat(included) : included;
  }
  return { id: 'optional-' + family, family, label, setup: ['hcf', 'hcb'].includes(family) ? family : null, category: 'Optional inputs', kind: 'native',
    explanation: pattern + ' then x. Steps marked ? can be skipped individually. Each included step renews the 10-tick step window within the ' + time + '-tick total.',
    route: 'command = "' + name + '"',
    blocks: paths.map(([start, ...steps]) => block(name, ['~' + start, ...steps, 'x'].join(', '), time, 10)) };
}

function circlePreset(turns) {
  const degrees = turns * 360, name = 'ikm_circle' + degrees + '_x', blocks = [];
  for (const start of [0, 2, 4, 6]) for (const delta of [2, 6]) {
    const steps = Array.from({ length: 4 * turns }, (_, n) => ring[(start + delta * n) % 8]);
    blocks.push(block(name, ['~' + steps[0], ...steps.slice(1), 'x'].join(', '), 80 * turns, 20));
  }
  return { id: turns === 1 ? 'circle-native' : 'circle720-native', family: 'circle' + degrees,
    label: degrees + ' from any cardinal, either rotation', kind: 'native', category: 'Optional inputs',
    explanation: (turns * 4) + ' ordered world-space cardinals, then x. Choose optional maps for a 20-tick window renewed by each correctly ordered diagonal.',
    setup: turns === 1 ? 'circle' : 'circle720', route: 'command = "' + name + '"', blocks };
}

function circleTracker(label, delta, prefix, cardinals) {
  const key = suffix => 'map(' + prefix + label + '_' + suffix + ')';
  const count = key('count'), last = key('last'), timer = key('timer');
  return `        if ${timer} > 0 && $dir = (${last} + ${delta}) % 8 {
            ${timer} := 20;
        } else if $dir >= 0 && $dir % 2 = 0 {
            if ${timer} > 0 && $dir = (${last} + ${2 * delta}) % 8 {
                ${count} := ${count} + 1;
            } else {
                ${count} := 1;
            }
            ${last} := $dir;
            ${timer} := 20;
            if ${count} = ${cardinals} { map(${prefix}ready) := 10; ${count} := 0; ${timer} := 0; }
        } else if ${timer} > 0 {
            ${timer} := ${timer} - 1;
        }`;
}

function circleSetup(turns) {
  const prefix = turns === 1 ? 'ikm_circle_' : 'ikm_circle720_';
  const events = ring.map(dir => block(prefix + dir.toLowerCase(), dir));
  const dir = events.reduceRight((rest, b, i) => 'cond(command = "' + b.name + '", ' + i + ', ' + rest + ')', '-1');
  return {
    events, ready: prefix + 'ready', button: prefix + 'button_x',
    body: `    if roundState != 2 {
        map(${prefix}cw_timer) := 0;
        map(${prefix}ccw_timer) := 0;
        map(${prefix}ready) := 0;
    } else {
        map(${prefix}ready) := max(0, map(${prefix}ready) - 1);
        let dir = ${dir};
${circleTracker('cw', 1, prefix, turns * 4)}
${circleTracker('ccw', 7, prefix, turns * 4)}
    }`
  };
}

function halfCircleSetup(family) {
  const prefix = 'ikm_' + family + '_input_';
  const order = family === 'hcf' ? ['B', 'DB', 'D', 'DF', 'F'] : ['F', 'DF', 'D', 'DB', 'B'];
  const events = order.map(dir => block(prefix + dir.toLowerCase(), dir));
  const [start, firstDiagonal, down, secondDiagonal, finish] = events.map(b => 'command = "' + b.name + '"');
  const stage = 'map(' + prefix + 'stage)', timer = 'map(' + prefix + 'timer)', ready = 'map(' + prefix + 'ready)';
  return {events, ready: prefix + 'ready', button: prefix + 'x',
    body: `    if roundState != 2 {
        ${stage} := 0;
        ${timer} := 0;
        ${ready} := 0;
    } else {
        ${ready} := max(0, ${ready} - 1);
        if ${timer} <= 0 { ${stage} := 0; }
        if ${start} {
            ${stage} := 1;
            ${timer} := 10;
        } else if ${stage} = 2 && ${finish} {
            ${ready} := 10;
            ${stage} := 0;
        } else if ${stage} = 1 && ${down} {
            ${stage} := 2;
            ${timer} := 10;
        } else if (${stage} = 1 && ${firstDiagonal}) || (${stage} = 2 && ${secondDiagonal}) {
            ${timer} := 10;
        } else {
            ${timer} := max(0, ${timer} - 1);
        }
    }` };
}

function chargeSetup(policy) {
  const prefix = 'ikm_' + policy.id + '_super_';
  const events = [];
  const key = name => 'map(' + prefix + name + ')';
  const event = (name, sequence) => {
    events.push(block(prefix + name, sequence));
    return 'command = "' + prefix + name + '"';
  };
  const sides = policy.relative ? ['B'] : ['L', 'R'];
  const starts = sides.map(side => {
    const opposite = side === 'B' ? 'F' : side === 'L' ? 'R' : 'L';
    const name = prefix + 'start_' + side.toLowerCase();
    events.push(block(name, '~45$' + side + ', ' + opposite, policy.grace, policy.grace));
    const facing = side === 'B' ? '' : 'facing = ' + (side === 'L' ? '1' : '-1') + ' && ';
    return '(' + facing + 'command = "' + name + '")';
  });
  const qualified = starts.join(' || ');
  const fwd = event('fwd', 'F'), back = event('back', 'B');
  const stage = key('stage'), timer = key('timer'), ready = key('ready');
  return {
    events, ready: prefix + 'ready', button: prefix + 'x',
    body: `    if roundState != 2 {
        ${stage} := 0;
        ${timer} := 0;
        ${ready} := 0;
    } else {
        ${ready} := max(0, ${ready} - 1);
        if ${timer} <= 0 { ${stage} := 0; }
        if ${stage} = 2 && ${fwd} {
            ${ready} := 10;
            ${stage} := 0;
        } else if ${stage} = 1 && ${back} {
            ${stage} := 2;
            ${timer} := 10;
        } else if ${stage} = 0 && (${qualified}) {
            ${stage} := 1;
            ${timer} := 10;
        } else { ${timer} := max(0, ${timer} - 1); }
    }`
  };
}

function setupParts(preset, button = 'x') {
  if (!['x', 'y', 'z', 'a', 'b', 'c'].includes(button)) throw new Error('Choose an attack button.');
  const policy = policies.find(p => p.id === preset.setup);
  let setup;
  if (policy) setup = chargeSetup(policy);
  if (['circle', 'circle720'].includes(preset.setup)) setup = circleSetup(preset.setup === 'circle' ? 1 : 2);
  if (['hcf', 'hcb'].includes(preset.setup)) setup = halfCircleSetup(preset.setup);
  if (!setup) throw new Error('No map setup exists for this preset.');
  const buttonName = setup.button.slice(0, -1) + button;
  const condition = 'map(' + setup.ready + ') > 0 && command = "' + buttonName + '"';
  return { commands: [...setup.events, block(buttonName, button)].map(commandBlock).join('\n\n'),
    update: '# Human input only. Keep your CPU move trigger separate. Inside the root character’s [StateDef -4], once per game tick.\nignoreHitPause if !isHelper && !AILevel {\n' + setup.body + '\n}',
    route: '# Inside [StateDef -1]. Replace 1000 with the move state.\nif ctrl && stateType != A && ' + condition + ' {\n    map(' + setup.ready + ') := 0;\n    changeState{value: 1000}\n}' };
}

module.exports = { policyPresets: [circlePreset(1), circlePreset(2), ...optionalMotions.map(optionalPreset), ...policies.map(chargePreset)], setupParts };
