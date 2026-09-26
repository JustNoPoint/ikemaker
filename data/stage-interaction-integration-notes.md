# Stage Interaction and Character UI Integration Notes

## Stage interaction ownership

Ordinary stage DEF files define camera, players, bounds, backgrounds, controllers, music, constants, and presentation. Gameplay interaction belongs in a project-owned attached character when DEF and BGCtrl behavior are insufficient.

Use this path in order:

1. Static stage DEF parameter.
2. BGCtrl targeting a background `id`.
3. Attached-character controller targeting a background or BGCtrl through `id`/`sctrlid`.
4. Attached-character helper only when a persistent entity, collision box, or independent state is required.

The editor should explain which level is being used. It must not generate helpers for a static positioning problem.

Imported source-stage layers must be labeled as presentation-only,
battle-reactive decoration, region/proximity reactive, hit reactive,
damageable/breakable, collidable, hazardous/gameplay-affecting, match-state
reactive, stage-transition, scripted/custom, or unresolved. Classification does
not establish the trigger by itself. Source capture should record repeated
controlled event trials and align each event with the layer's position,
animation, palette, collision, health/state, effects, and sounds.

Repeatable ambient layer movement and animation are reconstructed from a
source-tick timeline. Prefer a verified constant, accelerated, periodic,
keyframed, ping-pong, or controller-loop model when it reproduces at least two
observed cycles. Keep camera motion in a separate lane. Unknown behavior remains
sampled or unresolved rather than being approximated silently.

## Recommended attached-character structure

- One DEF, AIR, SFF, SND, and readable ZSS entry point inside the stage folder.
- `Statedef -4` coordinates global stage behavior.
- Dedicated helper states represent independently positioned/collidable objects.
- Named maps hold persistent stage-owned state.
- `StageConst` exposes static configuration to characters; it should not be copied into character-specific constants.
- Reset behavior checks `StageInfo.ResetBG` and round state.
- Loops support the configured maximum players and verify player existence before redirecting.
- Targetable background elements use `id`; targetable controllers use `sctrlid`.
- Camera and player-side effects use native stage/player redirects where available.

Multiple attached characters are supported by IKEMEN 1.0 documentation, but the workspace must retain compatibility warnings tied to the configured 1.0 build because this area has had regressions.

## Character-specific UI

Character-specific UI should be data-driven but not mandatory for every character.

- The fight screen owns rendering and common layout.
- Characters expose only the values or events that the UI genuinely needs.
- Native fight-screen sections and `LifebarAction` are preferred for common messages and effects.
- Character maps may expose project gauges or state, but UI naming and fallback behavior belong in a project module/profile.
- A missing optional profile falls back to ordinary fight UI without warnings during community use.
- Match-time behavior intended for online play must remain deterministic and ZSS/engine-owned; Lua configuration may prepare menus but must not drive rollback state.

## Editor integration

The stage workspace cross-links:

- Stage constants to character `StageConst` reads.
- Attached-character maps/helpers to the project registry.
- `id` and `sctrlid` declarations to `ModifyStageBG` and `ModifyBGCtrl` calls.
- Stage interaction trigger regions to visible canvas overlays.

The screenpack workspace cross-links:

- Fight sections to `LifebarAction` calls.
- Character-specific preview profiles to maps and portrait groups.
- UI elements to SFF sprites, animations, fonts, and sounds.

Cross-links are advisory. They never make a project-specific convention mandatory for unrelated users.
