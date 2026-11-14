'use strict';

const punchNames = new Map([
  ['motion_23', 'Punch Mash (3 presses)'],
  ['motion_24', 'EX Two-Punch Mash (4 presses)']
]);

function familyDisplayName(family) {
  return (family.parserOnly && punchNames.get(family.id)) || family.id;
}

function kickMashPreset(pair) {
  const id = pair ? 'ex_kick_mash' : 'kick_mash';
  const key = suffix => 'map(ikm_' + id + '_' + suffix + ')';
  const ready = key('ready'), count = key('count'), timer = key('timer');
  const buttons = ['a', 'b', 'c'].map(button => '(command = "' + button + '")');
  const [a, b, c] = buttons;
  const two = '(' + [a + ' && ' + b, a + ' && ' + c, b + ' && ' + c].join(' || ') + ')';
  const accept = pair ? two : '!'+two+' && ('+buttons.join(' || ')+')';
  const ticks = pair ? '12' : 'cond('+a+', 14, cond('+b+', 10, 4))';
  const threshold = pair ? 4 : 3;
  const label = pair ? 'EX Two-Kick Mash (4 presses)' : 'Kick Mash (3 presses)';
  const explanation = pair ? 'Press two kicks together four times. Pairs may change. Each pair refreshes a 12-tick window.' : 'Press any single kick three times. LK, MK and HK refresh the window by 14, 10 and 4 ticks respectively.';
  const snippet = [
    '# '+label+'. Place once before move routes in the root player update.',
    '# Requires one-tick press commands named a, b and c (LK, MK and HK).',
    '# Move entry condition on the recognition tick: '+ready,
    'ignoreHitPause if !isHelper && !AILevel {',
    '  '+ready+' := 0;',
    '  if '+timer+' > 0 {',
    '    '+timer+' := '+timer+' - 1;',
    '  } else {',
    '    '+count+' := 0;',
    '  }',
    '  if '+accept+' {',
    '    '+timer+' := '+ticks+';',
    '    '+count+' := '+count+' + 1;',
    '    if '+count+' >= '+threshold+' {',
    '      '+ready+' := 1;',
    '      '+count+' := 0;',
    '    }',
    '  }',
    '}'
  ].join('\n');
  return {id, label, explanation, kind: 'mapped', category: 'Kick mash', snippet, kickMash: true};
}

module.exports = { familyDisplayName, kickMashPresets: [kickMashPreset(false), kickMashPreset(true)] };
