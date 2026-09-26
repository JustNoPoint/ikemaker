'use strict';

const exact = {
  attr: 'Classifies the attack by state type and attack type, such as S, NA.',
  damage: 'Sets hit damage and optional guard damage.',
  pausetime: 'Sets attacker and target hit pause in ticks.',
  guard_pausetime: 'Sets attacker and target pause when the attack is guarded.',
  sparkno: 'Chooses the hit spark animation.',
  guard_sparkno: 'Chooses the guard spark animation.',
  sparkxy: 'Offsets the spark from the contact point.',
  hitsound: 'Chooses the sound played on a successful hit.',
  guardsound: 'Chooses the sound played when guarded.',
  ground_type: 'Chooses the target reaction type while grounded.',
  air_type: 'Chooses the target reaction type while airborne.',
  ground_slidetime: 'How long a grounded target slides before stopping.',
  ground_hittime: 'How long a grounded target remains in hit reaction.',
  air_hittime: 'How long an airborne target remains in hit reaction.',
  guard_hittime: 'How long the target remains in guard reaction.',
  ground_velocity: 'Applies target velocity on a grounded hit.',
  air_velocity: 'Applies target velocity on an airborne hit.',
  guard_velocity: 'Applies target velocity when the attack is guarded.',
  fall: 'Controls whether the hit knocks the target down.',
  fall_recover: 'Controls whether the target may recover from the fall.',
  fall_recovertime: 'Sets when fall recovery becomes available.',
  hitonce: 'Prevents this controller from hitting the same target more than once.',
  kill: 'Controls whether hit damage may KO the target.',
  guard_kill: 'Controls whether guard damage may KO the target.',
  id: 'Assigns an identifier used by related triggers and controllers.',
  value: 'Supplies the controller\'s primary value.',
  x: 'Supplies the horizontal value or offset.',
  y: 'Supplies the vertical value or offset.',
  time: 'Sets the duration in game ticks.',
  anim: 'Chooses an animation number.',
  state: 'Chooses a state number.',
  stateno: 'Chooses a state number.',
  name: 'Sets the named map, helper, resource, or property.',
  redirectid: 'Redirects the controller to an entity with the matching ID.',
  ignorehitpause: 'Allows evaluation during hit pause when enabled.',
  persistent: 'Controls how often the controller can run within its state.'
};

function describeOption(name, controller = '') {
  const key = String(name || '').toLowerCase();
  if (exact[key]) return exact[key];
  if (/^(ground|air|guard)\./.test(key)) return `Configures the ${key.split('.')[0]} result for ${controller || 'this controller'}.`;
  if (/sound/.test(key)) return 'Chooses or configures a sound resource.';
  if (/anim/.test(key)) return 'Chooses or configures an animation resource.';
  if (/velocity|vel/.test(key)) return 'Controls horizontal or vertical velocity.';
  if (/pos|offset|spacing/.test(key)) return 'Controls a position, distance, or visual offset.';
  if (/damage/.test(key)) return 'Controls damage or damage-related behavior.';
  if (/scale|mul/.test(key)) return 'Scales or multiplies the associated value.';
  if (/color|alpha|pal/.test(key)) return 'Controls color, transparency, or palette behavior.';
  if (/team|player|target|owner/.test(key)) return 'Chooses which game entity the option affects.';
  if (/time|duration|pause/.test(key)) return 'Controls timing or duration in game ticks.';
  if (/^(id|index|group|layer)/.test(key)) return 'Identifies or orders the associated engine resource.';
  return `Configures “${name}” for ${controller || 'this controller'}. Review the expected value shown below.`;
}

module.exports = { describeOption };
