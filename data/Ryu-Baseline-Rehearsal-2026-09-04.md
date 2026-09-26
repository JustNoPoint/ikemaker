# Ryu Baseline v1 — automated rehearsal checkpoint

Date: 2026-09-04  
Authority: read-only automated inventory; **not owner sign-off**

Owner-confirmed evidence update: JustNoPoint confirmed on 2026-09-04 that the complete sLP contact-result matrix, both-player attack/damage/life/meter/drive/score displays, lack of debug-only display dependence, and live palette presentation had already been completed successfully. These checks do not need to be repeated solely for this baseline freeze.

## Automated result

- `chars/Ryu/Ryu.def` resolved successfully.
- Every referenced sprite, animation, sound, command, constants, and state file exists.
- Active SFF: `Ryu_Development.sff`
- SFF header: `2.0.1.0` (IKEMEN/SFF v2.1 encoding), 613 sprites, 3 palettes, no duplicate group/index IDs.
- Active AIR: `Anim.air`, 499 actions, no empty actions.
- VS Code live rehearsal after installing 0.56.2 selected `Ryu.def` ahead of the shared `template.def` even while focus was inside a visual workspace.
- The AIR workspace reports `DEF default 1,1` and displays `Palette 1,1` as the selected preview palette.
- Opening the SFF from Ryu's AIR workspace resolved the DEF-assigned `Ryu_Development.sff`, not the retained legacy `Sprite.sff` editor tab.
- The sLP contact marker was visible on active element 3 and absent on startup element 1 and recovery element 5.
- Shared and SF6-specific state dependencies resolve.
- The authoritative registry identifies Ryu as an SF6-owned character.
- Ryu’s DEF loads 21 files and has no forbidden ownership direction.
- The current template DEF is explicitly classified as SF6 game-owned; its 19 referenced files have no forbidden ownership direction.

This establishes that the character definition and archive inventory are structurally loadable. It does **not** establish visual correctness, correct default palette propagation, correct axes, complete required animation behavior, correct runtime mechanics, or source accuracy.

## Manual gates still open

1. Repair and visually approve the known SFF/AIR omissions from the rebuild.
2. Repair and approve the known disappearing frames. Review the remaining feet/middle/head axis-reference copies and ticket any deliberately deferred animation work.
3. Review and finalize the drafted `Ryu-Baseline-v1-Lesson-Packet.md` after asset cleanup.
4. Have JustNoPoint/JNP explicitly sign off `Ryu Baseline v1` before Demitri inherits the process.

## Owner-confirmed completed gates

- Palette presentation is correct in live IKEMEN.
- Normal hit, guard, Counter Hit, Punish Counter, air hit, corner interaction, armor absorption, and Armor Break were completed.
- Forced-low-region testing is not part of the logger-completion gate.
- Damage, combo damage, scaling, life, red life, Super meter, Drive meter, and score were reviewed for P1 and P2.
- The player-facing information is not dependent on debug display text and does not have an outstanding clipping issue.

## Workflow friction exposed

- Structural archive checks cannot replace sprite-by-sprite visual review.
- The SFF version byte display is technically accurate but should also present the friendly label “SFF v2.1.”
- Exact pane widths remain under VS Code/user control; the extension can restore tab groups and viewer state, not guaranteed pixel widths.
- Binary references must be coordinated through SFF/SND manifests; the generic text impact scanner intentionally reports this boundary.
- A custom visual editor can leave `activeTextEditor` empty. Version 0.56.2 keeps concrete open characters ahead of the shared template in that state and includes a regression check for the ordering rule.

## Rehearsal command

Run the lightweight audit against any character definition:

`node tools/baseline-rehearsal-audit.js <character.def>`

The audit is read-only and is suitable for the small fixture characters as well as production characters.
