# Throw Authoring and Live Preview Bridge Specification

Baseline: IKEMEN 1.0. Status: implemented in IKEMaker 0.64.0 and retained in
the audited 0.64.1 cohesion build as a reviewed
offline authoring workflow. Generated gameplay remains subject to live IKEMEN
testing and owner signoff.

## Implemented workflow

**Open Throw Creator** now provides:

- independently selected P1 and P2 AIR tracks with real tick boundaries;
- play/pause, single-tick stepping, event stepping, and loop intervals;
- Independent, Match P1 ticks, Match P1 boundaries, and Hold Last P2 timing;
- non-destructive timing proposals and a separately confirmed AIR-duration edit;
- draggable P2 bind keyframes stored in character coordinates;
- editable interaction events, values, notes, facing, states, and handoff;
- all four SFF part-bank labels plus explicit owner, lane, Explod, priority,
  LayerNo, synchronization, creation, and removal data;
- P1, P2, and part onion skins plus Clsn1/Clsn2 preview;
- saved versioned plans under `.ikemen-tools/throw-plans`;
- validation for missing actions, release/cleanup, invalid timing intervals,
  unfinished parts, duplicate Explod IDs, and stale AIR changes;
- review-PNG export and reviewed ZSS scaffold preview/save; and
- direct access to the neutral Authoring Bridge installer.

The tool never inserts the scaffold into an arbitrary gameplay file. Live
IKEMEN remains authoritative for target ownership, physics, interruption,
camera, death, Simul/Tag, and actual draw ordering.

## Purpose

Extend the two-character Move Constants/AIR canvas with an optional **Throw
Creator** mode. It must help an author coordinate P1's throw animation, P2's
custom get-thrown animation, interaction parts, target binding, and runtime
drawing order without claiming that a visual preview is authoritative game
simulation.

The existing hit/get-hit overlay remains the simpler default mode. Throw mode
is opt-in and must not change AIR or ZSS until the user reviews an explicit
patch.

## Dual animation timeline

- Show P1 and P2 as two visible, independently selectable AIR tracks.
- Allow Play, Pause, single-tick stepping, previous/next event, and looping a
  selected interval.
- Show both element boundaries and real tick duration. Frame count alone is
  not a reliable synchronization measure.
- P2 may use fewer sprite elements than P1. A P2 element can span several P1
  elements or ticks.
- Provide timing modes:
  - **Independent**: preserve both authored AIR timings.
  - **Match P1 ticks**: map P2 elements across P1's total selected interval.
  - **Match P1 boundaries**: align reviewed P2 changes with chosen P1 element
    boundaries.
  - **Hold last P2 pose**: retain P2's last element while P1 finishes.
- “Match P1” means matching the selected P1 timeline interval, not requiring
  equal sprite counts. It must preview the proposed timing before changing AIR.
- Allow a reviewed handoff marker where P2 leaves the throw animation for a
  separate fall, bounce, slam, recovery, or other state while P1 continues.

## Interaction events

The timeline should support named markers for:

- grab/contact;
- `TargetState` and `ChangeAnim2` start;
- bind start, bind position changes, and bind release;
- facing changes;
- damage and throw-hit application;
- slam/launch/fall/bounce state handoff;
- hit spark, sound, camera, pause, and screen-shake cues;
- interaction-part creation/removal;
- P1 and P2 sprite-priority changes; and
- restoration/cleanup at interruption, miss, release, and state exit.

Markers must remain movable without destructively rewriting code. Generation
produces a reviewed ZSS scaffold and a readable authoring plan.

## Positioning and anchors

- Drag P2 relative to P1 at any reviewed bind keyframe.
- Store positions in character coordinates, not canvas pixels.
- Offer snapping to P1/P2 axes, feet/ground, collision edges, and optional
  artist-authored hand/body anchors.
- Allow facing and horizontal flip controls for both characters.
- Display a path between bind keyframes and distinguish held positions from
  interpolated visual previews. `TargetBind` itself should be generated only
  for authored ticks/intervals.
- Provide size/scale compatibility previews for short, tall, wide, and
  differently scaled opponents. These are warnings and visual checks, not
  automatic corrections.

## Runtime drawing and interaction parts

Keep these concepts separate in the interface:

1. **SFF layer bank** stores aligned cosmetic/part sprites at group offsets.
2. **Player `SprPriority`** orders P1 and P2 relative to one another.
3. **IKEMEN `LayerNo`** assigns the broader runtime layer group.
4. **HitDef `p1sprpriority` / `p2sprpriority`** changes player ordering at
   contact.
5. **Explod `sprpriority` / `LayerNo`** controls an interaction part's draw
   position.
6. **Explod `syncid`, `synclayer`, and `syncparams`** keep parts synchronized
   with their intended owner/layer.

The canvas should expose lanes such as P1 Back Part, P1, Between Players, P2,
P2 Front Part, and Foreground. Each lane maps to explicit reviewed runtime
settings. It must support all four existing SFF part banks, while allowing more
than four runtime Explods when the authored move requires them.

Parts must declare an owner: P1, P2, helper, projectile, or manual review.
Throws and multipart interactions remain human-reviewed; folder names and
sprite names are never enough to infer final ownership or ordering.

## Validation and safety

- Verify every `ChangeAnim2` action and referenced sprite exists in P1's AIR/SFF.
- Warn about zero/infinite AIR durations, missing release markers, unmatched
  bind lifetimes, missing cleanup, and a P2 animation that ends before the
  intended handoff without a hold rule.
- Preview Clsn1/Clsn2, Size/push boxes, axes, ground line, hit sparks, and
  interaction parts together.
- Support onion skin independently for P1, P2, and parts.
- Restore temporary facing, control, binding, and drawing changes on every
  authored exit path.
- Generate code as an inspectable patch using `TargetState`, `ChangeAnim2`,
  `TargetBind`, `SprPriority`, and reviewed Explod settings. Never silently
  insert it into an arbitrary state.
- Retain source hashes and refuse to apply a stale preview after AIR/ZSS changes.

## Neutral live-preview integration module

The extension needs an optional game-side bridge to reproduce a reviewed
canvas setup in a local IKEMEN training launch. This is extension integration,
not JNP gameplay code, so it must use neutral names.

Proposed package identity:

- Display name: **IKEMEN Tools Authoring Bridge**
- Module filename: `ikemen_tools_authoring_bridge.zss`
- Generated launch profile: `ikemen_tools_preview_profile.zss`
- Reserved symbol/map prefix: `IkTools_Preview_`

Rules:

- Package the bridge template with the VS Code extension.
- Install it into a project or character only after explicit confirmation.
- Do not edit IKEMEN's default Lua files or common files.
- Implement match behavior in ZSS. Lua may help an offline editor/menu shell,
  but must not participate in deterministic match behavior or online features.
- Remain disabled by default and activate only for a launch explicitly labeled
  **Live Authoring Preview**.
- Keep the ordinary **Live Training Preview** launch unchanged.
- Write a temporary, reviewable launch profile containing P1/P2 character,
  stage, relative position, height, facing, chosen actions/states, timing mode,
  and optional throw-event markers.
- Refuse online/netplay activation. The module is a local authoring aid, not a
  gameplay dependency.
- Use a versioned bridge contract so an extension update can detect an older
  installed module and offer a reviewed migration.
- Provide an uninstall/disable action and ensure release builds work normally
  when the bridge and generated profile are absent.

The installed bridge provides opt-in starting position, facing, animation
request, and the shared animation audit. Throw Creator's **Live Authoring
Preview** links a generated mirror-training profile, launches the match, and
automatically disables that profile after 30 seconds; an immediate Disable
action is also present. Throw Creator separately generates the event/state
scaffold for reviewed integration. Arbitrary hot injection into an already
running process is deliberately not claimed; generated states must still be
tested as authored game code.

## Further quality-of-life recommendations

- Save reusable throw-authoring plans beside the character rather than inside
  AIR comments.
- Compare two timing proposals side by side before applying one.
- Add undo/redo for position, timing, event, and layer changes.
- Export a contact sheet or short video/GIF for animator review.
- Add notes per tick/marker so animator and coder decisions remain together.
- Provide templates for stationary grab, command throw, running throw, air
  throw, wall slam, and multipart cinematic throw, while leaving every value
  editable.
- Allow a compatibility roster to batch-preview the same throw against several
  body types without claiming universal compatibility.
