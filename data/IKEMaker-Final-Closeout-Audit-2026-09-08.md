# IKEMaker Final Closeout Audit — 2026-09-08

Version audited: 0.64.1  
Production target: IKEMEN 1.0

## Result

The Windows desktop creation environment is feature-complete within its stated
authority. No additional editor family is required before normal production
testing begins. The extension contributes 132 commands; every contributed
command has a desktop registration or an explicit browser-host fallback.
All 113 automated test files pass.

The Throw Creator gap is closed in 0.64.0. The 0.64.1 cohesion pass adds a
shared accessibility foundation for the visual workspaces: visible keyboard
focus, reduced-motion support, forced-color support, automatic accessible
control names, labeled canvases, and clearer screenpack layer controls. The
Throw Creator model was also exercised against
Ryu's actual `Anim.air`: Actions 800 and 801 resolve as 22- and 24-tick tracks,
validate successfully, and produce the reviewed two-StateDef scaffold.

## Completed creation surfaces

- Character opening, focused work sessions, connection tree, health review,
  workflow, tickets, evidence, and signoff.
- ZSS, CNS, Lua, DEF, commands, movelist, controller insertion, navigation,
  visual code structure, and reviewed CNS-to-ZSS conversion.
- SFF, AIR, palette, PalFX/true-color FX authoring, SND split profiles, archive
  logs, requirements, aliases, groups, layers, collisions, runtime geometry,
  backups, and recovery.
- Throw Creator with P1/P2 timelines, bind keyframes, events, part lanes,
  timing proposals, live mirror pose preview, and reviewed native output.
- Stage, Stage Rig, screenpack/fight UI, roster/select.def, character-select
  layout, stages, arcade order, exclusions, player tools, story, and dialogue.
- Debug/test sessions, project/game/user profiles, workspace presets, offline
  documentation, platform capability reporting, and Complete Project/public
  copy construction.

## Required acceptance work, not missing implementation

1. Use Throw Creator on a copied real throw and compile/test its generated
   scaffold in IKEMEN. Visual preview cannot prove target ownership, physics,
   interruption, death, Tag, camera, or final drawing behavior.
2. Finish Ryu's known disappearing/missing frames, axis-copy review, lesson
   packet, and JNP Baseline v1 signoff.
3. Rehearse Complete Project on a disposable full-game copy before a public
   release.
4. Perform a clean-profile VS Code installation rehearsal before distributing
   IKEMaker.

These are owner/runtime acceptance gates. They do not justify another broad
feature-development phase.

## Deliberately deferred boundaries

- The installed HDBZ player updater/launcher remains deferred until public
  releases resume. IKEMaker already produces the full package, manifest,
  checksums, and upload inputs.
- Browser/mobile SFF and SND archive adapters, portable writers, Android native
  builders, and an Android IKEMEN intent bridge remain future platform work.
- IKEMEN 1.1 syntax and engine changes remain isolated in the watchlist. They do
  not weaken the current 1.0 grammar or validation contract.
- Character Options, the in-game true-color editor, the Capcom game shell, and
  Shuffle Battle are game/runtime projects. IKEMaker contains their authoring
  contracts and supporting editors, but it must not impersonate their gameplay
  implementation.
- A live running IKEMEN process is not hot-patched from VS Code. Throw Creator
  uses a temporary, training-only, auto-disarmed launch profile and generates
  native code for the game to execute normally.

## Optional later improvements

These are useful but are not closeout requirements:

- batch-preview a throw against a deliberately selected compatibility roster;
- export a multi-tick contact sheet or GIF/video, rather than one review PNG;
- add plan-local undo/redo beyond the current saved-plan, VS Code, backup, and
  Recovery Center layers;
- implement portable archive adapters after real Android/iOS host testing; and
- add updater delta packages only when a real release channel and hosting limit
  require them.

## Scope rule after closeout

Freeze broad feature development. A new request enters the current release only
when it fixes data loss, a broken command, misleading behavior, an inconsistent
bridge, or a repeated production bottleneck demonstrated by actual use. Other
ideas belong in the next-version backlog.
