'use strict';

// Project recipes describe the real SF6 template contract. They remain
// reference-only outside a compatible project and never masquerade as IKEMEN
// engine requirements.
const RECIPES = [
  {
    id: 'project.sf6.recipe.normal.slp', kind: 'recipe', source: 'Project: SF6 Template — JustNoPoint',
    family: 'Normals', label: 'Standing Light Punch (sLP)',
    detail: 'The current complete SF6 standing-light-normal design, centered on its move function with a small State 200 engine shell plus constants, shared family systems, assets, contact lifecycle, and cleanup.',
    compatibility: 'SF6 Template capability pack', beginnerSafe: false,
    explanation: 'The move function is the primary authored unit. State 200 is deliberately only the engine-facing shell that establishes state attributes and calls JNP_SF6_StandingLightPunch. The current sLP function delegates family-wide behavior to JNP_SF6_LightPunch; future move-specific behavior belongs in the per-move function rather than bloating the StateDef. State -4 and State -1 retain lifecycle and routing that must remain active outside the move state.',
    ownershipLevels: [
      { id: 'commonState', label: 'Common normal state', detail: 'Default StateDef, routing, and lifecycle supplied by the shared template.' },
      { id: 'sharedFamily', label: 'Shared normal-family function', detail: 'Reusable SF6 behavior shared by compatible normals.' },
      { id: 'characterFunction', label: 'Character move function', detail: 'The normal authored home for character and move uniqueness.' },
      { id: 'characterOverride', label: 'Character state override', detail: 'Optional full ownership transfer for a move that cannot follow the common normal contract.' }
    ],
    modes: [
      { id: 'configure', label: 'Configure Common Normal', detail: 'Keep the common state and author the character function, constants, animation, and assets.' },
      { id: 'extend', label: 'Extend Common Normal', detail: 'Keep the common lifecycle and add supported unique behavior inside the character move function.' },
      { id: 'override', label: 'Override Common Normal', detail: 'Use a character-owned StateDef only when the move is fundamentally incompatible; review every transferred responsibility first.' }
    ],
    parameters: [
      { name: 'stateNo', type: 'state number', value: 200 },
      { name: 'animation', type: 'animation', value: 200 },
      { name: 'command', type: 'command', value: 'x' },
      { name: 'constantPrefix', type: 'constant family', value: 'normal.slp' },
      { name: 'wrapper', type: 'function', value: 'JNP_SF6_StandingLightPunch' }
    ],
    dependencies: [
      'SF6 shared light-normal functions and configuration maps',
      'SF6 combo scaling and cancel contracts',
      'SF6 attack metadata, reaction-region, armor, Drive, and UI-event contracts',
      'Custom corner-recoil lifecycle in State -4',
      'Animation 200 with authored active/recovery element boundaries',
      'Character voice group 200 and character-FX sound 10200,0'
    ],
    sections: [
      {
        id: 'commandRoute', label: 'Command route — standing LP',
        detail: 'Temporary engine-command route from controllable standing/crouching states. The shared cancel routes are separate project infrastructure.',
        ownership: 'commonState', referenceOnly: true,
        sourceFileHint: 'SF6template/normals.zss', symbol: 'StateDef -1'
      },
      {
        id: 'state', label: 'State 200 engine shell',
        detail: 'The small engine-facing StateDef. It establishes native state attributes and hands execution to the move function.',
        ownership: 'commonState', referenceOnly: true,
        sourceFileHint: 'SF6template/normals.zss', symbol: 'StateDef 200'
      },
      {
        id: 'wrapper', label: 'Primary sLP move function',
        detail: 'The authored home of the move. Today it supplies the normal.slp configuration to the shared light-punch family; unique sLP behavior should grow here rather than in State 200.',
        ownership: 'characterFunction',
        allowedFileTypes: ['zss'],
        snippet: '[Function JNP_SF6_StandingLightPunch()]\ncall JNP_SF6_LightPunch(\n\t1,\n\tconst(normal.slp.contactSource),\n\tconst(normal.slp.deliveryType),\n\tconst(normal.slp.weaponSubtype),\n\tconst(normal.slp.attackStrength),\n\tconst(normal.slp.guardClass),\n\tconst(normal.slp.throwClass),\n\tconst(normal.slp.knockdownClass),\n\tconst(normal.slp.moveID),\n\tconst(normal.slp.hitIndex),\n\tconst(normal.slp.hitDefID),\n\tconst(normal.slp.armorBreak),\n\tconst(normal.slp.firstActiveElement),\n\tconst(normal.slp.idleElement),\n\tconst(normal.slp.damage),\n\tconst(normal.slp.groundHitTime),\n\tconst(normal.slp.groundSlideTime),\n\tconst(normal.slp.guardHitTime),\n\tconst(normal.slp.sparkX), const(normal.slp.sparkY),\n\tconst(normal.slp.suppressCounterBonuses),\n\tconst(normal.slp.counterHitDamagePercent),\n\tconst(normal.slp.counterHitBonusTime),\n\tconst(normal.slp.punishCounterDamagePercent),\n\tconst(normal.slp.punishCounterBonusTime),\n\tconst(normal.slp.punishCounterDriveDamage));\n${0}'
      },
      {
        id: 'constants', label: 'sLP move constants contract',
        detail: 'The move-specific animation, damage, counter, punish-counter, and effect-placement portion. Shared metadata and HitDef values are additional project contracts.',
        ownership: 'characterFunction',
        allowedFileTypes: ['ikemen-cns'],
        snippet: '; Standing light punch\nnormal.slp.contactSource = ${1:1}\nnormal.slp.deliveryType = ${2:1}\nnormal.slp.weaponSubtype = ${3:0}\nnormal.slp.attackStrength = ${4:1}\nnormal.slp.guardClass = ${5:1}\nnormal.slp.throwClass = ${6:0}\nnormal.slp.knockdownClass = ${7:0}\nnormal.slp.moveID = ${8:200}\nnormal.slp.hitIndex = ${9:1}\nnormal.slp.hitDefID = ${10:2000}\nnormal.slp.armorBreak = ${11:0}\nnormal.slp.firstActiveElement = ${12:3}\nnormal.slp.hitPauseAnimateStartElement = ${13:3}\nnormal.slp.hitPauseFreezeElement = ${14:5}\nnormal.slp.hitPauseAnimateTicks = ${15:3}\nnormal.slp.idleElement = ${16:5}\nnormal.slp.damage = ${17:300}\nnormal.slp.groundHitTime = ${18:14}\nnormal.slp.groundSlideTime = ${19:14}\nnormal.slp.guardHitTime = ${20:9}\nnormal.slp.counterHitBonusTime = ${21:2}\nnormal.slp.counterHitDamagePercent = ${22:120}\nnormal.slp.counterHitReactionState = 0\nnormal.slp.punishCounterBonusTime = ${23:4}\nnormal.slp.punishCounterDamagePercent = ${24:120}\nnormal.slp.punishCounterDriveDamage = ${25:2000}\nnormal.slp.punishCounterReactionState = 0\nnormal.slp.punishCounterHardKnockdown = 0\nnormal.slp.punishCounterDownTime = 0\nnormal.slp.suppressCounterBonuses = 0\nnormal.slp.sparkX = ${26:-15}\nnormal.slp.sparkY = ${27:-104}\n${0}'
      },
      {
        id: 'sharedLightPunch', label: 'Shared light-punch family implementation',
        detail: 'Reusable family infrastructure currently called by the sLP move function: HitDef, scaling, classification, region selection, metadata, sounds, resources, recovery, and cleanup. Keep family-wide logic here; keep unique move logic in JNP_SF6_StandingLightPunch.',
        ownership: 'sharedFamily', referenceOnly: true, sourceFileHint: 'SF6template/sf6_normal_functions.zss', symbol: 'JNP_SF6_LightPunch'
      },
      {
        id: 'state4Lifecycle', label: 'Shared State -4 LP lifecycle',
        detail: 'Required project infrastructure: combo commit, corner recoil, fresh-contact reset, hit-pause animation, cancel-window countdowns, and interruption cleanup for State 200/400.',
        ownership: 'commonState', referenceOnly: true, sourceFileHint: 'SF6template/normals.zss', symbol: 'StateDef -4'
      },
      {
        id: 'cancelRoutes', label: 'Shared LP cancel routes',
        detail: 'Required project infrastructure in State -1: Drive Rush, Drive Impact, sLP/cLP chains, and contact-window policy.',
        ownership: 'commonState', referenceOnly: true, sourceFileHint: 'SF6template/normals.zss', symbol: 'StateDef -1'
      },
      {
        id: 'assets', label: 'Animation and sound ownership',
        detail: 'Required assets: animation 200, character voices 200,0–2, and character FX 10200,0. Missing assets are reported rather than invented.',
        ownership: 'characterFunction', referenceOnly: true
      }
    ]
  },
  {
    id: 'project.sf6.recipe.normal.characterOverride', kind: 'recipe', source: 'Project: SF6 Template — JustNoPoint',
    family: 'Normals', label: 'Character-Owned Normal Override Review',
    detail: 'Transfers a fundamentally incompatible normal from the common implementation to a character-owned StateDef only after its responsibilities are reviewed.',
    compatibility: 'SF6 Template capability pack', beginnerSafe: false, referenceOnly: true,
    explanation: 'An override is not simply another StateDef. It takes ownership of the lifecycle previously guaranteed by common code. IKEMaker currently reviews this contract but does not generate or replace the state automatically.',
    ownershipLevels: [{ id: 'characterOverride', label: 'Character state override', detail: 'The character owns the StateDef and every intentionally retained or replaced responsibility.' }],
    validationChecklist: [
      'Character StateDef intentionally overrides the common state number.',
      'Entry initialization and stale-contact reset are supplied.',
      'HitDef activation and animation boundaries are defined.',
      'Cancel-source initialization and intended cancel routes are supplied.',
      'Hit-pause animation policy is supplied or intentionally omitted.',
      'Attack metadata, reaction-region, armor, and resource publication are supplied or intentionally replaced.',
      'Corner-recoil integration is supplied or another policy is explicitly selected.',
      'Hit, guard, interruption, and animation-end cleanup are supplied.',
      'Control return and standing/crouching exit behavior are supplied.',
      'Training diagnostics and required AIR/SFF/SND assets are resolved.'
    ],
    sections: [
      { id: 'ownership', label: 'State ownership transfer', detail: 'Confirm the character deliberately owns the conflicting StateDef and identify the common state it replaces.', ownership: 'characterOverride', referenceOnly: true },
      { id: 'entry', label: 'Entry and contact initialization', detail: 'Review fresh activation, stale MoveContact clearing, cancel-source initialization, and local latches.', ownership: 'characterOverride', referenceOnly: true },
      { id: 'attack', label: 'Attack and project contracts', detail: 'Review HitDef, metadata, reactions, armor, resources, corner policy, and diagnostics.', ownership: 'characterOverride', referenceOnly: true },
      { id: 'exit', label: 'Exit and cleanup', detail: 'Review every hit/guard/interruption/end path and return of control.', ownership: 'characterOverride', referenceOnly: true }
    ]
  }
];

module.exports = { RECIPES };
