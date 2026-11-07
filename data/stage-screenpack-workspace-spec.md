# IKEMEN Stage and Screenpack Workspace Specification

Status: implementation specification for IKEMEN ZSS Tools. The configured IKEMEN 1.0 engine and its bundled files are authoritative.

Project stage profiles may declare a source display family (`CPS2`, `CPS3`, `CvS2`, or native/new), a reviewed proportional correction, conversion status, and whether cross-game use is placeholder or final. Corrections are asset/layer scoped; the workspace must not assume a global whole-game squeeze because CvS2 and newly authored art may already have the intended proportions. Game-specific visual direction remains in the owning project's documentation rather than becoming a universal stage rule.

## Design rules

1. A visual preview must preserve the source DEF as the authority. It may model, annotate, and propose edits, but it must label approximations.
2. Opening and inspecting files is non-destructive. Direct writes require an explicit Apply or Save action. Generated snippets are shown before insertion.
3. Coordinates come from the file's `localcoord`. The editor must not force 320x240, 640x480, or 1280x720.
4. IKEMEN defaults remain untouched. Templates, attached characters, helpers, and UI modules are project-owned files.
5. Native engine behavior is preferred over generated systems. New helpers are used only when stage DEF, motif DEF, fight DEF, or existing ZSS capabilities cannot provide the behavior.
6. Unknown parameters remain visible as raw source and are not silently reclassified.

## Stage workspace

### Current authoring workflow

Open a Stage DEF, select its background in the stack, then use the **Stage** menu
or compact toolbar icons. Inspection and Canvas previews do not write the DEF.
In a narrow editor the inspector continues below the canvas. This is a guide to
the development workspace; physical acceptance remains separate from source and
browser checks.

| Task | Access and next step | Output and boundary |
| --- | --- | --- |
| Check artwork coverage | **Artwork coverage…** → choose/pick a viewport row → **Sample current pose** or camera/zoom edges. Use **Sweep visible rows** for the whole viewport, **Continue sweep** for a paused chunk, or **Cancel sampling**. | Filled, exposed and unresolved strips/areas at the selected tick. Refused or unvisited rows are not covered. Intentional transparency is not automatically a defect; fighters/guides/HUD are excluded. |
| Fit floor and adjacent art | Select the floor and use its floor-alignment helper. For adjacent artwork choose **Align layer seam…**, lock the reference, and pick corresponding artwork points. Add pair B only when constraining target width/scale. | Inspect the candidate at the reference and second camera poses, then review the target-only patch. One still cannot determine both position and scroll rate. Unsupported motion, rotation and projection cases need rig verification. |
| Reuse layers or make a variant | Multi-select layers → **Save selected assembly…**. **Insert assembly…** maps destination art/IDs; **New round variant…** copies calibrated layout with replacement art. | Review the candidate group in the existing Stage canvas before final approval. Cancel returns to the prior drafts/selection. Replacement artwork can expose new seams even when floor/camera fields are preserved. Any parent Round binding is a separate disclosed change in the final review. Native candidate Cancel/Apply/Undo, bound variant Undo/Redo and standalone creation/Open/Undo were verified. Standalone native Redo remains a manual check. |
| Compare repeatable shots | **Camera preset…** → saved or project camera shots → Save/Recall/Compare/accepted reference. | Named pose, tick, selected-layer and fighter/action/palette references plus a ready-artwork snapshot. Cross-coordinate recall asks whether to retain or scale X/Y; missing references remain explicit. Saving a shot does not patch Stage source. |
| Inspect code and motion | **Stage Code…** opens DEF sections, BGCtrl, embedded AIR, assigned attached sources and relevant registered project Lua. **BGCtrl schedule** provides previous/next change, affected-layer isolation and an interval loop on the existing **Preview tick**. | Source/reference lookup is read only. Native/Integrated presentation keeps the owning Stage available for return. Attached triggers/functions execute in character CNS/ZSS, not in the Stage DEF. Select **Inspect motion owners…** in the layer inspector for authored velocity/sine, position links, AIR, matching BGCtrl and declared attached writes/references. **Open source**, **Solo affected layers**, and attached **Move Lab → Return to Stage** retain the owning Stage. This integration has bounded native verification with camera/tick/position drafts retained; dynamic runtime writers remain unresolved, not inferred. |
| Author optional depth | **Depth authoring…** → enable overlay → choose movement/scaling/ghost handles or numeric fields → **Review & apply depth…**. | Movement/ghost Z is Stage-local; Scaling reference Z is engine units. Preview uses the displayed runtime-width context. Unknown runtime width remains an estimate. Authored-version gates, zero-scale/zero-depth inversion refusals and engine fallback behavior remain explicit. The ghost is diagnostic; encounters require a real applicable project. |
| Verify a structural change | **Rebuild preview at this camera…** → review the snapshot and camera → launch the owned disposable Stage Rig. **Stop rebuilt preview** stops that game. | Declared resources and reviewed editor snapshots are copied into a fresh verified runtime; project files remain unchanged. Base camera is acknowledged from engine samples. Runtime tick, AIR and controller state restart; separate Zoom/attached render effects and project-wide modules are not certified. This requires a trusted local Windows workspace and the exact supported runtime. |

An approved source Apply uses Stage history; an open native DEF receives an
unsaved edit and must be saved before an ordinary game launch uses it. Apply or
cancel conflicting previews first. The small **Live preview…** pilot is separate:
it sends only supported start X/delta X changes to its owned game, with identity
and readback checks. It does not save the project. Keep Canvas estimates and
bounded engine evidence distinct from full runtime parity.

### Stage code and contextual assistance

Use **Stage → IKEMaker: Stage Code…**, its compact source icon, the inspector,
or **Open controller code**. Exact file/line navigation retains the Stage; the
Integrated presentation uses the same native text editor below its compact
header. Reference lookup uses the existing themed Help surface and creates no
project files.

| Source | Assistance and boundary |
| --- | --- |
| Stage DEF / BGCtrlDef / BGCtrl | **Ctrl+Space** offers documented standard section/key names and literal background/controller types. Hover gives parameter signatures, examples and packaged source. Optional wiki parameter additions are lookup-only; documentation alone does not establish runtime support. RHS values remain authored. |
| Embedded AIR | Open the exact authored action or use the connected AIR route. AIR remains animation data; it is not scanned as ZSS or offered character triggers. The Stage DEF provider does not claim AIR-frame completion. |
| Attached CNS / ZSS | Open the exact assigned owner/source, including declared shared/common files. Existing language tools supply triggers, controllers, functions/calls and maps as supported by that grammar. Custom suffixes use explicit assignment/configuration rather than an unrelated active character. |
| Registered project Lua | Declared modules and autoload files stay clearly shared project sources and use Lua tools. Inline Common.Lua opens its exact configuration line; use the applicable Lua reference there rather than treating the entire INI as Lua. Custom loaders and runtime execution are not inferred. |

Readonly native decoding preserves current position/depth previews, visibility,
locks and saved drafts. Real source/disk changes still invalidate stale work.
Native Save may normalize line endings; opening a source does not write it.
Temporary readability focus and hold-to-dim preserve authored visibility and
persistent shot settings; captures use the full persistent scene. Return and
Undo respect the exact retained owner and refuse stale/replaced resources.

### Main canvas

- Composites referenced SFF sprites in DEF order.
- Separately toggles stage layers -1, 0, and 1.
- Supports pan, mouse-wheel zoom, fit stage, fit camera, and reset view.
- Camera controls expose X, Y, current zoom, start zoom, zoom-out, and zoom-in.
- Overlays show local-coordinate frame, camera bounds, movement bounds, screen edge bounds, floor (`zoffset`), tension, vertical tension, and up to eight player starts.
- Background selection outlines the rendered element and links to its source line.
- Debug-background mode shows uncovered canvas regions without changing `debugbg` in the stage.

### Background inspector

- Shows source order, name, type, sprite/animation, ID, SctrlId, layer, start, delta, scale, zoom delta, velocity, tiling, window, transparency, angles, projection, and masking.
- Supports temporary visibility, solo, locking, reordering proposals, and value overrides in preview.
- Dragging an unlocked background proposes new `start` coordinates.
- A source patch panel shows exact lines before edits are applied.
- Missing sprites, invalid layers, suspicious windows, duplicate IDs, and interaction elements without target IDs are reported.

### Parallax assistant

- Draws top and bottom edges, vanishing direction, source width, and effective trapezoid.
- Supports both `width` and `xscale` authoring forms without silently converting between them.
- Shows floor-seam and screen-edge coverage at camera-left, center, and camera-right.
- Sweeps between zoom-out and zoom-in and warns about exposed gaps or excessive overdraw.
- Compares `AutoResizeParallax` with explicit `ZoomDelta`, `ZoomScaleDelta`, and `XBottomZoomDelta` behavior.
- Calculates suggested values but always labels them as suggestions requiring engine verification.
- Provides non-destructive camera presets, A/B session captures, and named per-Stage/project shots with accepted-reference comparisons. Shots store pose/readability context rather than changing authored camera values.

### Timeline and interaction views

- BGCtrl timeline shows controller groups, target IDs, start/end times, loop time, and controller type.
- Round preview selects the main stage or a `RoundXDef` stage while retaining the main stage's documented music and attached-character ownership.
- Interaction view lists up to four attached characters, stage constants, BG `id`, BGCtrl `sctrlid`, and references made by `ModifyStageVar`, `ModifyStageBG`, `ModifyBGCtrl`, `StageConst`, `StageVar`, `StageBGVar`, and `RedirectID`.
- Interaction code generators create a project-owned attached-character skeleton, optional helper state, reset block, and clearly named maps. They do not inject code into engine defaults.

### Source-stage reconstruction

The Source Game Lab may feed ripped stage assets and recorded layer traces into
the Stage Workspace. Static image analysis can suggest initial placement, but
movement and parallax should be solved from several fixed-resolution captures
with recorded source camera and layer coordinates whenever possible.

For each source layer, preserve:

- source asset/tile/object identity and ordered palette bank;
- starting position, axis/origin, dimensions, crop, flip, priority, and window;
- camera-relative and world-relative position over source logic ticks;
- sprite/animation element and its duration over time;
- scale, zoom, shear, line-scroll, rowscroll, and deformation observations;
- visibility, loop boundary, phase, and reset behavior;
- evidence, inferred formula, residual error, and confidence;
- interaction classification and linked event observations.

The reconstruction workspace should accept left-edge, center, right-edge,
vertical-extreme, and zoom-extreme captures. The user can mark stable landmarks,
ground, source origin, and the corners of a perspective floor. IKEMaker then
suggests `start`, `delta`, tiling, window, scale/zoom response, and parallax
values, previews the complete camera sweep, and measures uncovered seams and
positional error. Every generated DEF value remains a reviewed proposal.

### Deterministic movement and animation recorder

Most source stages use repeatable movement rather than randomness. Record each
layer for enough logic ticks to observe at least two matching cycles, retaining
the source camera separately so camera travel is not mistaken for layer motion.
Track both layer position and displayed animation element.

The pattern solver may propose:

- constant position or constant velocity;
- linear acceleration/deceleration;
- periodic sine/cosine motion;
- stepped or keyframed movement;
- ping-pong motion;
- discrete animation sequences with per-element durations;
- nested loops, delayed starts, pauses, and round resets;
- palette cycles or state-based palette changes;
- coordinated motion shared by several layers.

Show the measured trace, proposed mathematical curve or controller schedule,
cycle length, phase, and residual error together. A formula is accepted only
when it reproduces repeated observations. Unmatched behavior remains sampled or
unresolved rather than being forced into the nearest curve. Random behavior,
when encountered, is explicitly labeled and not inferred from one recording.

Animation timing is recorded on source logic ticks and remains separate from
video-frame frequency. Layer motion, sprite animation, palette animation, and
camera motion appear as synchronized but independently editable timeline lanes.

### Interactive stage-layer classification

Every imported layer has an explicit interaction field:

- `None / presentation only`;
- `Battle-reactive decoration` (reacts without affecting gameplay);
- `Proximity or region reactive`;
- `Hit reactive`;
- `Damageable / breakable`;
- `Player-collidable or push-affecting`;
- `Hazard / gameplay-affecting`;
- `Round, timer, KO, or match-state reactive`;
- `Stage transition / phase change`;
- `Scripted/custom`;
- `Unresolved`.

An interactive label never invents its trigger. The capture session records
controlled event trials—round start, player entry/exit, proximity, specific hit,
damage accumulation, destruction, knockdown, timer point, KO, and round reset—
and aligns the event tick with layer state, animation, position, collision,
palette, and sound changes. A user may attach notes and manually identify an
interaction when memory data is unavailable.

Presentation-only deterministic behavior should prefer ordinary stage DEF and
BGCtrl output. Gameplay-independent reactions may use BGCtrl or a project-owned
attached character as appropriate. Damageable objects, collision, hazards, and
other gameplay state belong to a deterministic project-owned attached character
or helper bridge. The editor must identify which side owns each generated part
and must not hide gameplay code inside a decorative stage controller.

Interactive-layer previews expose trigger regions, health/damage state,
collision, current phase, affected layers/controllers, emitted sound/effects,
reset behavior, and online/determinism status. Source behavior is evidence;
projects may deliberately rebalance or omit it while retaining the original
observation.

### IKEMaker Stage Rig

- The Stage Workspace can launch the current stage with two invisible, collisionless development characters without adding either character to `select.def`.
- Directions move P1. Holding the configured `D` button while using directions moves only P2. Holding `W` moves both simultaneously, with P2's movement reversed so camera tension, zoom, and separation can be tested quickly.
- The in-game overlay shows both players' world and screen positions, live front/back stage-edge distance, authored start positions, playable stage bounds, camera bounds, screen padding, zoom range, tension, vertical follow, floor tension, and `zoffset`.
- The rig is regenerated under `chars/.ikemaker-stage-rig` for the selected stage. It is extension-owned test material, is never a gameplay dependency, and is forcibly excluded from Complete Project/public-copy output.
- X and Y provide configurable fine and fast movement. A, B, and C reset P1, P2, or both. A+B cycles camera-stress presets, X+Y cycles automatic horizontal/vertical sweeps, Z cycles X/Y coordinate locks, and A+C toggles player markers.
- A three-line button guide is displayed along the bottom of the game screen by default. It names every Stage Rig direction, button, combination, Pause, and frame-advance action rather than requiring the user to remember the controls.
- B+C toggles the detailed measurements and BGCtrl notices. Y+Z independently toggles the bottom button guide. This allows either layer—or both—to be cleared for an unobstructed paused-frame inspection.
- IKEMEN's native Pause and Scroll Lock debug keys provide pause/resume and single-frame advance without consuming more character buttons.
- Native debug Pause freezes player processing, so visibility should be chosen before entering Pause; the selected visibility remains in the frozen frame.
- BGCtrl blocks are shown through an authored schedule estimate. It is explicitly not presented as hidden live engine state; the complete scrub-able timeline remains in the Stage Workspace.
- The Stage Workspace adds camera presets, a non-destructive preview sweep, a BGCtrl timing scrubber, and session-only A/B comparison captures. It intentionally does not save camera bookmarks.

## Screenpack and fight-UI workspace

### Editing a motif and its scenes

- Open the motif's `system.def` and use **Page** to switch between its screens. Use **+ Page** to add a supported screen or a menu entry. Arcade is a game mode reached through the title menu. A named submenu can lead to Arcade and other modes.
- On a page with authored artwork, expand **Background planes**, select a plane and drag it or edit its coordinates and drawing layer. Use **Preview tick** to inspect a pose. Apply the reviewed change to save the DEF.
- Choose **Character Select Layout** to place the grid, portraits and cursors. Roster Manager controls which characters occupy the slots. A missing portrait identifies the character and sprite reference to check in its SFF.
- Choose **Match HUD** to open the motif's assigned fight definition. Vary preview life, power and time to check the bars and timer at different match values.
- In Storyboard Maker, select a scene and scrub its timeline to inspect its background and layers. Drag the artwork to review a new placement. For a video scene, scrubbing seeks the local media when its format is supported.

### Shared canvas

- Uses motif or lifebar `localcoord`, with explicit preview conversion when they differ.
- Offers presets for configured window aspect, 4:3, 16:9, ultrawide, and user-defined safe areas.
- Supports pan, mouse-wheel zoom, rulers, grid, snap, guides, center lines, margins, and anchor readouts.
- Keeps the same shell as SFF, AIR, and code views so switching assets is not visually disruptive.

### Screen selection

- Groups sections into title, menus/submenus, select, versus, victory/results, options, pause/training, continue, storyboards, and fight UI.
- Shows engine-reserved menu items and custom module items without treating custom submenu names as errors.
- Supports single, simul, tag, and turns previews with configurable team sizes up to the engine-supported player count.
- Uses sample names, portraits, life, power, guard, stun, red life, score, timer, rounds, and combo values for realistic previews.

### Element inspector

- Groups related `.pos`, `.offset`, `.spr`, `.anim`, `.font`, `.scale`, `.facing`, `.vfacing`, `.layerno`, `.window`, `.angle`, PalFX, and shear values.
- Toggles and solos elements and layers -1 through 2 plus supported top layers.
- Dragging proposes the appropriate position or offset edit and never writes both accidentally.
- Shows windows and clipping rectangles directly on canvas.
- Provides alignment, equal spacing, mirror P1/P2, copy layout, multi-select movement, and batch offset tools.
- Links selected elements to source and referenced SFF, animation, font, sound, or character portrait.

### Character-specific UI integration

- Prefer native fight-screen data, `LifebarAction`, `FightScreenVar`, player/team prefix operators, and existing display elements.
- Project-specific UI code lives in a reusable project module or character file and calls configured lifebar actions; it does not rewrite the base screenpack at runtime.
- Preview profiles may provide character maps, portrait groups, gauge maxima, and optional UI layers. They are editor data and never become mandatory character metadata.
- Online-safe UI must use deterministic engine/ZSS state. Lua-only match behavior is marked offline-only and is not generated as an online dependency.

## Validation levels

- Error: engine cannot resolve the asset/value or the value contradicts a hard limit.
- Warning: likely visual or behavioral problem that may still be intentional.
- Review: valid but ambiguous choice, such as shared IDs or extreme parallax.
- Information: native feature, inferred relationship, or portability note.

Validation profiles are optional. Native file integrity remains active even when project-specific style guidance is disabled.

## Initial delivery sequence

1. Shared DEF parser, type detection, source-line mapping, stage/screenpack models, and tests.
2. Read-only stage canvas and parameter inspector using referenced SFF sprites.
3. Camera, bounds, player starts, layer toggles, and parallax sweep.
4. Explicit preview overrides and reviewed source patches.
5. Read-only motif/fight UI canvas and screen/element inspector.
6. Drag positioning, alignment, windows, team variants, and reviewed source patches.
7. Attached-character and character-UI integration inspectors/generators.
8. Cross-platform capability gates, desktop regression, real-engine comparison checklist, packaging, and installation.

## Evidence and limitations

- Screenpack-specific parameters are still incompletely documented upstream. The configured engine's `system.base.def`, current bundled motif, and real runtime are required reference fixtures.
- A canvas preview cannot guarantee pixel-identical engine output for every legacy compatibility behavior, shader, video, 3D model, or timing controller. Such views must state what is approximate and provide one-click engine testing.
- 3D models are included in the data model and validation, but a complete glTF renderer is a later adapter rather than a blocker for the 2D workspace.
