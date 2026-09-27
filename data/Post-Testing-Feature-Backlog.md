# IKEMaker Post-Testing Feature Backlog

These ideas are intentionally deferred until JustNoPoint/JNP finishes the
0.64.1 production test pass. They must not expand the current release or hide
problems discovered during stabilization.

## Viewer zoom anchoring and coordinate-transform audit

Status: corrected in the 0.78.2 source batch on 2026-09-26 for the confirmed
JNP Move Constants reproduction. Broader viewer work remains evidence-driven;
no all-viewer sweep was performed.

JNP Move Constants was the confirmed reproduction case: the P2 reaction-preview
axis used absolute screen pixels while P1 and AIR offsets used zoomed authored
coordinates. The correction is bounded to that viewer and its new pure transform
helper. Other viewers remain unchanged unless direct evidence finds the same
defect.

Zoom must be a view-only operation: it must not alter authored or preview world
positions. Screen-space distance from the chosen zoom pivot naturally scales;
it is neither possible nor correct to keep every independent screen point fixed
while scaling the view.

The implemented correction stores P2 relative to the same authored/world origin
used by P1, collision boxes, and hit-spark placement. Toolbar and pointer-pivot
zoom preserve the logical P2 coordinates. Older retained absolute-screen state
is migrated through the prior viewport and zoom so reopening does not introduce
an initial jump. Resize changes the shared canvas origin without rewriting P2.

Focused automated checks cover world/screen round trips, old-state migration,
zoom scaling, and pointer-pivot stability. Manual verification remains useful
for toolbar zoom, mouse-wheel zoom, 100%, Fit, resize, restored state, P2 drag,
and hit-spark alignment. Other viewers should be changed only if their own
evidence or genuinely shared transform code demonstrates the same defect.

## State Controller nightly-change review markers

Status: specified and deferred on 2026-09-25. Do not implement during the
current curriculum and IKEMaker testing pass.

When an IKEMEN engine knowledge refresh discovers a newly added State
Controller or a modification to an existing controller, place a visible red
asterisk beside that controller in the State Controllers tree. A parent group
also receives a red asterisk while any controller beneath it remains
unreviewed. This applies to both newly added controllers and changed/expanded
controller definitions; the marker must be derived from the difference between
the previously acknowledged engine-knowledge snapshot and the newly selected
build's snapshot, not merely from which static category contains the item.

Opening/viewing the individual controller clears its marker after its current
documentation and options have actually been displayed. Right-clicking a group
must offer **Clear all change markers in this group** (or equivalently clear,
explicit wording) to acknowledge every marked descendant at once. Clearing a
marker changes review state only; it never changes controller data, project
code, the selected engine build, or compatibility policy.

Review state must persist per user/workspace and per exact engine knowledge
snapshot so acknowledged entries do not reappear on restart or an unchanged
weekly check. If a later Nightly modifies the same controller again, its marker
returns. Use the red asterisk together with an accessible text/tooltip such as
"New or changed in selected engine build" so the status does not rely on color
alone. Group counts should remain controller counts rather than unread counts;
an optional tooltip may report the number still unreviewed.

## Shared classic HitDef quick editing

Status: implemented in the 0.78.2 source batch on 2026-09-26.

In JNP Move Constants, the values under **Shared classic HitDef values** must
have the same immediate editing affordance as the move-local contact-result
fields above them: an appropriately sized numeric input and a checkmark button
that applies that one reviewed value. This includes chip damage, P1/P2 hit
pause, P1/P2 guard pause, air hitstun, ground hit velocity X, guard velocity X,
air hit velocity X/Y, Y acceleration, and any later classic HitDef values added
to this summary. Decimal and negative values must remain editable without
rounding or clipping.

These fields are shared-profile values, not move-local overrides. Keep the
**Source** action available and visibly label the shared scope. Before applying,
the UI must identify the shared profile and explain that every move using it
can change. The implemented quick edit checks the whole source hash plus the
exact map name, line, and previous value; explains shared impact before applying;
edits only the numeric literal in the normal open text document; and leaves
Save/Undo under normal editor control. It does not create automatic backups or a
move-local constant. A successful apply refreshes all affected summaries.
Cancellation does not write the source; invalid or stale values are rejected.

## Attack workspace and future guided Flow Mode (approved September 24, 2026)

### Current implementation: JNP Move Constants / Move Lab

SF6 is the primary implementer. Use Ryu standing light punch as the reference
workflow: understand the move, adjust constants, timing and collision boxes,
edit connected code, save, then test from one cohesive workspace.

- Header: character, move, state, AIR action and unsaved status.
- Animation preview: playback, frame stepping, visible collision boxes and an
  Edit AIR / CLSN action embedding or reusing the existing editor while retaining
  the current move and selected frame.
- Group constants by purpose. Provide contextual plain-language explanations of
  ZSS expressions, units, timing and the places that read each constant.
- Integrate existing lint results in a compact expandable Problems area. Link
  issues to the relevant constant, code and animation frame where resolvable.
- Check AIR references and attack timing, including active windows without
  attack collision boxes. Distinguish confirmed errors, likely mismatches and
  unresolved analysis. Hitpause, animation switching, conditional branches,
  loops and manual animation control can legitimately defeat simple duration
  comparisons; explain limits instead of inventing certainty.
- Reuse existing move-isolation tools in collapsible, live-editable connected
  code sections: move state, attack logic, cancels and referenced functions.
  Show source files and shared-code impact. Keep Open in Text Editor optional.
- Clearly show dirty files, save behavior and undo. Respect existing autosave
  preferences and handle external edits without silent overwrite.
- Keep advanced sections hidden initially; remember layout and user choices.
- Refine with a shared timeline for startup, active periods, recovery, hitboxes
  and cancel windows, linked to the animation selection where supported.

Deliver in small stages: (1) understand with preview, linked constants, lint
and explanations; (2) edit AIR/CLSN and connected code inline; (3) refine timeline,
timing checks and layout persistence. Reuse established infrastructure rather
than maintaining competing editors. Basic movement expansion is deferred.

### Future scope: guided Flow Mode (record now; do not implement in this batch)

An optional guided workflow should lead new coders through character development
one task at a time: standing, walking, jumping, guarding, and later dashes,
gethit/recovery and attacks. It should help the user understand ZSS and IKEMaker
while producing real project work in the existing authoring screens.

- Present a suggested sequence with task purpose, prerequisites, relevant files,
  animation/code requirements and a clear completion checklist.
- Open the focused tools for the current task in the same cohesive workspace.
  Explain the relevant ZSS concepts in context with editable examples.
- Preserve progress per project/character, support resume, revisit and skip, and
  keep free navigation available to experienced users.
- Separate authored work, automated validation and user-tested behavior; never
  claim gameplay was verified solely because files or constants exist.
- Adapt to the character/project and engine capabilities rather than enforcing
  one universal implementation or overwriting existing work.
- Treat Flow Mode as optional guidance within the existing Player/Simple/
  Workspace architecture, not a fourth competing UI mode or a separate editor.

### Review and installation checkpoint

Before installing any build containing this update, SF6 must provide this task
with the changed-file summary, focused test results, limitations and recommended
manual tests. Reply through Notes/Shared/NEW_DEV_CHAT_COMMUNICATION.txt, including
exact source/build identity. This task reviews the result before installation;
SF6 must wait for that review outcome. Keep testing bounded to changed behavior
and avoid taking desktop control without the user's direction.

## AIR editor parity follow-ups (recorded September 25, 2026)

Status: identified during the Ryu AIR/SFF production test and deferred until
the current curriculum and critical viewer testing are complete. The direct
frame fields plus Add, Duplicate, and Delete are already implemented; the items
below are the remaining useful Fighter Factory/SFF-editor parity work.

- Add safe timeline reordering for AIR elements. Moving an element must carry
  its explicit Clsn blocks and Interpolate directives without changing default
  collision inheritance, LoopStart meaning, comments, or unrelated formatting.
- Add optional onion-skin preview for adjacent elements, with clear current/
  previous/next distinction and no changes to AIR or SFF data.
- Add reviewed bulk operations that apply selected properties—offset, time,
  transparency/blend, flip, scale, or angle—to later or marked elements. Show
  the affected element count and preserve VS Code Undo.
- Add visible action-level New, Duplicate, and Delete controls comparable to
  the SFF editor's item controls. Keep frame deletion visibly distinct from
  deleting the entire animation, and require review for multi-action deletion.

These should extend the existing AIR viewer rather than create another editor.
They must retain the current source-hash/conflict protections, normal text-tab
access, missing-sprite warnings, live preview refresh, and one-window tab-group
behavior.

## Phase 1 expert workflow: recognition, reuse, and contextual editing (2026-09-25)

Status: deferred backlog only; not part of the current implementation or release.
Schedule this work when JustNoPoint/JNP is nearing the end of live development
session and explicitly chooses to hand remaining usage over to backlog work.
He is comfortable exhausting remaining usage at that point, not while he still
needs it for live work. This note does not start a goal, authorize a background
run, or override the current testing/stabilization priorities. Implement in small,
reviewable slices when activated; larger work belongs with SF6 as primary coder.

### Design basis

JustNoPoint has coded approximately 20 full, complex HDBZ characters over years of
full-game development, including substantial work from scratch. He designs the
logic and can readily understand, edit, and extend code once it is visible.
Blank-file syntax recall is the friction point, not lack of programming expertise.
Optimize for recognition, navigation, comparison, and direct editing. Do not
turn this into a remedial course, forced wizard, or repeated explanation of
fundamentals. The optional beginner Flow Mode above remains a separate use case.

### Suggested order and scope

1. **Personal example shelf and find-similar code.** The bounded personal shelf
   is implemented in the 0.78.3 source; broader find-similar remains deferred. Pin existing blocks with
   JustNoPoint's own labels and source links. From the current move/block, find relevant
   implementations in the active project and explicitly linked shared code.
   Show enough surrounding conditions and dependencies to judge suitability.
   Distinguish a working reference from unverified or outdated code; detect when
   a pinned source changes instead of silently presenting a stale copy.
2. **Intent search within existing tools.** Search behavior such as “turn toward
   opponent,” “stop horizontal movement,” or “hit once,” and return relevant
   controllers, maps, and project examples. Extend the controller/map browsers
   and existing search surfaces rather than create another competing screen.
   Let users add their own search aliases. Start with indexed documentation and
   source metadata; do not require AI calls for ordinary lookup.
3. **Adapt an example with visible dependencies.** Preview substitutions for
   states, animations, maps, sounds, and runtime IDs. Show missing references,
   source ownership, game/engine compatibility, and shared effects before Apply.
   Preserve project namespaces and do not copy another game's logic implicitly.
   Keep the proposed code directly editable, with a normal diff and Undo.
4. **On-demand block explanation and focused diagnostics.** Expose conditions,
   actions, state transitions, and dependencies beside the actual code when
   requested. Offer “why might this not run?” checks for unresolved references,
   conflicting values, and statically identifiable trigger/reachability issues.
   Label uncertainty; static analysis must not claim runtime proof. Link findings
   to exact source or the relevant viewer, without forcing explanatory panels open.
5. **Compare and resume in context.** Compare the current move/block with a chosen
   working reference, focusing on meaningful code/parameter differences. Restore
   the character, move, frame, and user-marked unfinished task when requested.
   Reuse existing workspace/session persistence and keep any suggested next steps
   optional rather than enforcing a development sequence.

### Cohesion, storage, and acceptance

- Put actions beside the code or current Move Lab task; prefer collapsible or
  pinned sections and keyboard access. Respect Player/Simple/Workspace visibility
  and user choices about advanced controls. Avoid extra tabs and mandatory tips.
- Recognition aids must keep code immediately accessible. Explanations and intent
  search should support expert judgment rather than hide implementation details.
- Store local labels, pins, aliases, and resume preferences in disclosed extension
  workspace state by default. No automatic sidecar files, backups, or source
  changes. User approval is required before creating/modifying project files;
  temporary files, if needed, must be disclosed. Use existing explicit Apply and
  stale-source protections rather than repetitive additional confirmations.
- A useful first acceptance exercise: find a known working block, inspect its
  dependencies, adapt it into a reviewed draft, and compare the result without
  memorizing identifiers or opening a chain of editor tabs. Cancellation leaves
  project files unchanged. Project filtering keeps DvS, SF6, DS4, and TeamZ2/HDBZ
  examples appropriately scoped, with deliberate cross-project reference browsing.
- Test each activated slice with focused regressions and a short recommended
  manual check. Do not grow an open-ended testing obligation or take desktop
  control without JustNoPoint's direction. Keep this work in Phase 1; do not pull in
  Phase 2 capture/reconstruction work merely to supply examples.

## Project Data browser access and category expansion (2026-09-25)

### Now — visible Map Browser entry points (SF6 implementation)

User requested a small immediate access update after design refinement:
- Add **Browse Maps…** under IKEMaker Tools > ZSS, CNS & Lua.
- Add **Browse Maps…** as the first action under Project Data > Maps. Keep it
  present even when the inventory is empty or its scan has not completed; opening
  a browser should not require waiting for the legacy workspace-wide logger.
- Reuse the existing map browser command/panel, progressive scopes, and project
  resolution. Repeated activation should reveal the same browser rather than
  multiply windows. Preserve existing right-click and Command Palette access.
- A tree-origin launch uses the explicitly selected character/project context.
  If no reliable context exists, offer the existing character/project selection
  rather than inheriting an unrelated retained panel. No valid insertion target
  means browse-only; opening from the Lua tools group does not authorize Lua
  map insertion. Preserve project/destination matching and stale-source guards.
- The existing Project Data Maps logger scans ZSS across the workspace, whereas
  the new browser has a scoped multi-format registry. Do not silently present
  those counts as equivalent. For this small access change, label the logger's
  broader scope if needed; defer wholesale registry consolidation. Do not select
  a map from an unrelated project merely because its name matches.
- SF6 should implement and perform focused checks of both entry points, empty/
  unresolved context, repeated opening, and preserved browse-only behavior.
  Submit changed-file summary and focused results for source review, then exact
  VSIX/hash review before installation. Do not bundle deferred browsers below.

### Later — consistent browsers for every logged Project Data category

Status: deferred Phase 1 backlog for SF6, after JustNoPoint is nearing the end of live
work and chooses to allocate remaining usage. Not an instruction to begin now.

Build on the map browser's full-window results/detail pattern. Each Project Data
category gets a visible **Browse…** action opening its own category within the
same reusable browser shell. Allow category switching in place; retain optional
pin/open-separately behavior for users who prefer multiple views. Do not require
one open window per category or replace useful source navigation in the tree.

Initial categories and useful distinctions:
- Maps: contracts, read/write/use locations, author/game and assignment scope.
- Variables: var/fvar/sysvar families, number/name, read/write sites and runtime
  owner. Equal numeric slots on different actors are not automatically conflicts.
- Functions and function calls: definitions, signatures, callers/callees and
  unresolved or ambiguous targets. Link both directions instead of conflating
  a definition with its individual call sites.
- State numbers: definitions, transitions, custom-state relationships and source
  ownership. Do not conflate AIR action numbers with StateDef numbers.
- Helpers, Explods and projectiles: separate resource kinds, creation sites,
  references, mutation/removal sites, owner/lifetime information where known,
  and unresolved dynamic IDs. Same-number reuse is not automatically an error.
- Add further categories only where the logger actually supports them; do not
  show unsupported inventories as complete or fabricate contracts from names.

Cross-category refinements: a relationship action from a map to its writing
function/state, from a call to its definition, and from a resource reference to
its creation/cleanup code; consistent source badges and scope/search/count rules;
optional usage/definition comparison; copy exact identifier and reveal source;
read-only inspection by default. Intent descriptions and explanations stay
on-demand, respecting JustNoPoint's expert recognition-based workflow.

Use a shared, project-aware index and explicit per-category parsers/adapters.
Keep assigned runtime sources distinct from unassigned references, current game
isolated, duplicates contextualized by source/owner, and unknown/dynamic values
visible. File navigation and browsing must not create/modify project files.
Any future editing needs an explicit reviewed Apply, stale-source protection and
Undo; no automatic sidecars/backups. Preserve optional pane visibility and the
existing Player/Simple/Workspace modes. Implement category by category with
focused tests, not one large rewrite or an unbounded new testing queue.

## Activated priority batch for JNP's return Thursday (2026-09-26)

User authorization: JNP explicitly asked this task and SF6 to work on the most useful IKEMaker backlog items for his workflow while he is busy until Thursday, October 1. This activates the bounded items below despite earlier deferral notes. It does not authorize exhausting the usage allowance: preserve approximately 30% Thursday, with SF6 monitoring at batch boundaries, reducing optional work at 40% remaining and stopping at the nearest safe checkpoint once account usage reaches 35% remaining or less. No new release/publication or local installation is implied.

SF6 remains primary implementer. This task supplies design and consolidated high-value review. First reconcile the current branch and recent user requests so none of the work already completed is repeated and no current prefix/source-baseline regression is carried forward.

Priority order; finish/test each useful slice before taking the next:
1. Resolve active regressions affecting current work, especially any currently reported prefix behavior. Confirm the user's intended baseline with existing SF6 context; do not infer that a previously reviewed release supersedes later fixes.
2. Reproduce and fix the recorded JNP Move Constants P2 zoom/coordinate defect, if still present. Limit initial scope to that viewer and directly shared transform code. Define the intended zoom pivot correctly: authored/world coordinates must not change; zoom naturally changes screen-space distances from the pivot. Do not try to keep every independent screen-space point stationary under scaling, as the older backlog wording implies. Verify P1/P2/CLSN/hitspark alignment using the same camera transform, zoom round-trips and restoration without writes. Expand to other viewers only if shared code/evidence warrants it, not an all-viewer audit.
3. Shared classic HitDef quick editing in the existing Move Constants view, if still missing. Reuse existing reviewed Apply, shared-source label, impact disclosure, conflict and Undo behavior; preserve decimal/negative drafts. No automatic project files/backups. Earlier references to backup/history in this backlog do not authorize restoring auto-backups or overriding current user consent policy.
4. Completed in the 0.78.3 source: the smallest personal example shelf pins an existing block with a label/source link, scoped to the current character/project plus deliberately linked shared sources; it reopens current code and marks moved, changed, missing, ambiguous, or no-longer-linked references. It is visible and collapsible inside Pinned Sources and stored in disclosed extension workspace state. Automatic adaptation, semantic/AI search, dependency substitution and a new general browser framework remain deferred.

Requirements: bounded tests for changed behavior, a short manual test list for JNP, no desktop takeover, no edits to live character/game content without explicit user approval. Use fixtures for authoring tests. Preserve Player/Simple/Workspace mode organization, and avoid adding default-open panes. Keep reference scope isolated across games/authors. Record completed/current/deferred status clearly, with exact commit and focused results.

Defer broad Project Data category expansion, full Flow Mode, Phase 2, tournament runner, all-viewer parity sweep and broad help rewrite. Do not consume the remaining budget merely to use it. Batch review requests; send this task a consolidated handoff only for consequential design uncertainty or completed meaningful work, not routine mechanical checks. Tool messaging may require user approval; leave TXT handoffs and continue independent authorized slices rather than repeatedly requesting permission or polling.

## Phase 2 research and data acquisition

Status: DEFERRED PHASE 2. This entire research, capture, inference, and conversion
group sits immediately above the two lowest-priority items. It is not part of
the active workflow batch, curriculum, stabilization, or release work.

Internal dependency order: establish evidence provenance and the normalized source
contract first; treat GIF conversion and its expanded capture timeline as Phase 2;
then treat collision and velocity as sibling calibrated measurement paths. Define
the Move Constants integration contract early and prove one narrow end-to-end path
before expanding acquisition coverage.

Shared acceptance requirements: immutable source/frame identity; original versus
derived timing; project, game, revision, participant, axis and facing ownership;
measured versus authored versus unresolved values; recalculation dependencies
after calibration changes; source-versus-target comparison; and explicit reviewed
Apply with conflict detection and Undo. No automatic project backups or history
files are created.

### Reference and Knowledge Intake workspace

Status: PHASE 2 RESEARCH. This is the provenance and decision foundation for the
rest of this deferred group. Full behavior is recorded in
`Reference-Knowledge-Intake-Workspace-Spec.md`.

Accept URLs, pasted research, local documents/media, community discussions,
manual decisions, and emulator evidence. Preserve offline source snapshots and
atomic claims with revision, scope, provenance, confidence, conflicts, and
review status. Imported material is evidence, never instruction or an automatic
project rule. Provide two-way links to characters, mechanics, assets, source
profiles, code, tests, workflows, and tickets. Use Morrigan and Demitri as the
first proving fixture while keeping Vampire Savior facts, DSvsSF choices, and
DS4 choices distinct.

### Legacy source-game acquisition lab

Status: PHASE 2 RESEARCH. Implement the normalized capture contract and a
narrow source profile before expanding emulator coverage. Full research and proposed architecture are recorded in
`Legacy-Capcom-SNK-Data-Acquisition-Research.md`.

The first profiles should target Capcom CPS-1/2/3 and SNK Neo Geo. Prefer
version-identified MAME/FBNeo memory and Lua trace exports for timing, position,
velocity, state, collision, palette, and sound-command data. Preserve raw
captures separately from decoded meanings and derived IKEMEN values. Existing
community hitbox decoders should export structured rectangles directly; the
fixed-camera image importer below remains a fallback and visual verification
path.

For CPS-1/2, prioritize a shared normalized capture record plus read-only CPS
Register, OBJ List, and SCROLL/Stage inspectors. Preserve raw CPS-A/CPS-B
registers, object/tile descriptors, palette-page state, rowscroll tables, layer
order, and per-pen priority masks. Prove one frozen-frame reconstruction before
animation sweeps or batch ripping. CPS-B layouts remain board/revision profiled;
do not assume a single register map across games or that CPS-1 and CPS-2 are
identical.

IKEMaker should also act as an external-emulator session front end and a
reviewed sprite-ripping interface. It may launch configured MAME, FBNeo,
Flycast, Flycast Dojo, and PCSX2 profiles,
control capture/trace actions, and consume adapter output without embedding or
bundling the emulator. Sprite isolation must be object-aware or use matched
suppression/differential captures: global hardware layer toggles cannot separate
P1 from P2, projectiles, shadows, or other objects sharing the sprite plane.
Game-provided debug cheats that cycle animation frames should appear as an
optional profile capability named Animation Frame Sweep.

The first conversion implementation must prioritize a normalized per-tick
intermediate format, calibrated/versioned source profiles using stable guest
addresses where possible, and source-versus-IKEMEN animation/trajectory/box
comparison. State-graph discovery, move recipes, palette-independent frame
matching, multi-pass object isolation, audio-command tracing, and transactional
code generation follow after that foundation is proven. Full rules are recorded
in `Legacy-Capcom-SNK-Data-Acquisition-Research.md`.

Add a character-owned companion reconstruction pass after the normalized trace
and comparison foundation. It records owned objects in root-relative and world
coordinates, discovers binding/following/orbit/easing and animation-response
patterns, and proposes reviewed AIR/SFF layers, Explods, or persistent helpers.
BB Hood's butterflies and dog are the required fixture because they exercise
two different companion behaviors tied to the same character.

Palette capture must preserve source index provenance: local tile pen, palette
bank, hardware palette index, remapped/indirect pen, raw palette word, decoded
color, transparency, and owning object. IKEMaker should export indexed images
from that ordered data without PNG palette optimization, and show a reviewed
source-to-IKEMEN index map before SFF staging.

Darkstalkers stage acquisition should use palette-separated Stage Source
Packages. Rip indexed tiles, layout, object layers, and scrolling metadata once;
store palette variants and dynamic palette-write timelines separately. Permit a
palette from another game/revision to reuse the package only after graphics and
layout hashes/signatures match. Structural differences remain unresolved rather
than being mistaken for palette-only changes.

Add a reviewed screenshot palette-transfer fallback for console ports such as
Sega Saturn. Align one or more clean native screenshots with the known indexed
stage render, infer an RGB assignment for each established source index, show
confidence/conflicts, and save a named visual palette variant. Label it
visually recovered: screenshots cannot prove the port's actual hidden palette
index numbers or ordering. Do not build a Saturn-specific emulator adapter or
memory/CRAM profile for this edge case.

Before implementing the lab, add the two-field project classification defined
in `IKEMaker-Information-Architecture.md`: distribution intent and content
basis. IKEMaker's normal tools remain classification-neutral; the JNP source
acquisition lab is confined to hobby/non-commercial fan-project profiles and
must reject transfers into any project classified as commercial/original.

#### Jesuszilla Cheat Engine tables and Caddie Machine reference

Deferred reference: <https://github.com/Jesuszilla/cheatengine-scripts>. A
read-only README/repository-listing review found tables for Vampire Savior,
CvS2, MvC2, MSH, and SS6. The documented capabilities include selected-object
hitbox/data display, 240p-normalized display values while retaining raw table
data, and Caddie Machine animation logging in MUGEN AIR format using source-game
sprite indices. This is a promising optional input source, not a required
dependency or a validated integration.

When Phase 2 begins, evaluate a source-backed import session that retains source
game, region/build, emulator/version, table revision, game speed, raw versus
normalized coordinate units, object identity, and capture tick. User-reviewed
start/end markers should split logged streams into named moves; source sprite
indices must map explicitly to destination SFF entries. Measured data and artist
annotations may coexist for P1, P2, FX, bind intervals, wall impact, and release-
to-velocity events, with a complete preview before any explicit project Apply.

The documented limitations are material: Caddie Machine does not split
animations, timing follows the running speed, and Capcom turbo frame skipping
can alter the log. Vampire Savior's default selectable Normal is documented as
Turbo 1; true Normal requires the options menu. Emulator and game-version
compatibility must be profiled. Do not equate 60 fps GIF resampling with measured
game ticks or infer velocity, damage, meter, hit pause, binding export, or other
unsupported fields from the README. Inspect the actual table/export paths under
controlled capture when this deferred work starts. Check the repository's
license and author permission before any reuse or redistribution. Never download,
attach to a process, or execute a table merely because it is referenced here.

### Animated GIF data collection bridge

Status: PHASE 2 RESEARCH. GIF conversion, including further development of the
existing timing converter, belongs to this deferred group. Existing installed
behavior may remain available, but it is not an active Phase 1 development item.

The existing GIF timing converter is reusable Source Game Lab infrastructure,
not merely a one-way AIR convenience. The Phase 2 design may let it open or
create a Lab capture containing the original GIF delays and the complete mapping
to the 60-Hz working timeline.

JustNoPoint's required expansion is to collect and convert P1 animation timing, P2
reaction timing, hit/contact timing, hitspark placement/timing, and separate FX
placement/timing. Supported results must feed target-ready AIR timing/actions,
move/hit settings, and correctly owned effect/helper code proposals. Logs and
annotations alone do not satisfy this requirement.

Proposed UI uses synchronized P1, P2, hitspark, and per-FX tracks with
onset/end/duration, contact markers and per-frame placement. Each placement
retains an explicit P1/P2/world/screen anchor, facing, scale, camera, crop and
aspect calibration. Manual correction and whole-move review/application are
required. A GIF and its delays do not prove source logic ticks, recover omitted
frames, or by themselves establish true hitpause, hitstun, guardstun, or
recovery; those fields remain unresolved unless corroborated.

#### Frame-linked event meaning (approved expansion, 2026-09-24)

Artist-provided GIFs may depict P2 striking a wall or floor after the original
attack. Preserve JustNoPoint's supplied explanations as annotations attached to the
original frame or frame range, and carry those associations through the 60-Hz
conversion. Event meaning must not be inferred solely from a visible spark.

Each event records its participants, event type, source frames, associated
effects, placement anchor and the user's original note. Distinguish attack
contact from wall impact, floor impact, landing, knockdown, wall/ground bounce
and secondary effects such as dust or debris. Link later impacts to the move
sequence without treating them as additional attack hits.

These distinctions must inform generated timing, placement and gameplay
proposals: an attack pause and a later wall-impact pause are separate events;
a wall spark belongs at its annotated impact anchor, not automatically at P1's
attack contact point. Preserve explicit user corrections; mark ambiguous or
contradictory events for review rather than guessing engine behavior. Notes
describe intended meaning but do not establish otherwise unmeasured durations.

Acceptance example: a GIF shows P1 hitting P2, P2 hitting a wall, then landing
with dust. All three events and their effects remain separately identified
after resampling, with their notes available from the generated proposals.

#### Participant choreography and movement control (approved expansion, 2026-09-24)

Provide a shared choreography timeline for P1, P2 and each participating helper
or FX object. Record axis placements and applicable velocities for every
participant, not only the attacker. JustNoPoint can annotate throw-like or cinematic
intent and the exact points where binding gives way to velocity-driven motion.
A throw label does not imply that every phase is bound: movement control is
explicit per participant and per frame range.

Required track data and behavior:

- Axis position, facing and coordinate reference (world, screen or relative to
  another participant), with scale and source-frame/target-tick associations.
- Movement-control intervals: velocity-driven, bound, scripted positioning or
  stationary. Preserve observed paths separately from the chosen control model;
  displacement during a binding must not automatically become gameplay velocity.
- Binding target, relative offsets, start/end boundaries and facing/mirroring
  rules. Record which participant controls the relationship.
- Release boundary, initial X/Y velocity, acceleration/gravity and explicit
  preserve/replace momentum behavior. Specify transition ordering so binding
  and free movement do not accidentally apply together at release.
- Optional contact anchors such as hand, foot or shoulder, distinct from the
  character axis, to describe grabs and other alignment constraints.
- Separate camera position/zoom information so camera motion is not mistaken
  for participant movement; support facing changes and side switches.
- Linked grab, damage, release, wall-impact, bounce and landing events, with
  effects attached to the correct participant/event and coordinate anchor.
- Miss/interruption/exit behavior that releases bindings and restores any
  sequence-owned camera/effect state appropriately.

Keep user annotations and corrections attached to the original frame ranges
through resampling. Distinguish measured values from authored choices and
unresolved estimates. A cinematic sequence may position or bind both players
for most of its duration; do not force its path into a velocity model. Do not
invent camera calibration or source timing from ambiguous GIF evidence.

Reviewed choreography must feed usable target binding, positioning, release
and movement code alongside AIR timing and effect/event proposals. Reuse the
existing whole-move preview/apply/compare workflow, preserving prior authored
values and the link back to source evidence.

Acceptance example: grab connects -> P2 binds to P1 -> both participants follow
scripted choreography -> P2 releases with a specified velocity -> wall impact
-> fall/landing. Verify independent axes, binding offsets, release timing,
mirrored facing, separate camera motion, correctly associated effects and
cleanup on interruption. No unintended velocity is generated for bound phases.

### Reference-image and video collision capture

Status: PHASE 2 RESEARCH. This is a sibling measurement path to the velocity calculator.

#### Goal

Allow an author to import screenshots, extracted frames, or video containing a
game/emulator collision-box display, calibrate that reference to an IKEMEN AIR
frame, and create reviewed Clsn data in the existing AIR workspace.

#### Feasibility levels

1. **Colored collision-box screenshots — high feasibility.** If the source
   visibly draws stable red, blue, yellow, green, purple, or other configured
   rectangle colors, IKEMaker can inspect the pixels, find rectangle edges,
   classify them from a user-selected legend, and propose Clsn coordinates.
   Conventional image processing should be preferred over generative AI.
2. **Extracted video frames with a visible collision-box overlay — feasible
   only from a fixed capture.** The source must not use a moving, zooming, or
   otherwise dynamic camera. IKEMaker can accept the extracted frame images,
   use a user-assigned axis and fixed scale, track colored rectangles, and let
   the user associate frames with AIR elements. Accepting a PNG frame sequence
   is the intended implementation; automatic dynamic-camera compensation is
   outside scope.
3. **Ordinary gameplay with invisible collision boxes — not authoritative.** A
   model could only estimate boxes from silhouettes, poses, sparks, and contact
   results. Such output may be offered as a low-confidence drawing aid, never as
   an automatic or verified conversion.

#### Required calibration

- Source resolution and any fixed crop, letterbox, stretch, or emulator scale.
- A character origin/axis. If the source does not contain one, IKEMaker must
  allow the user to place or numerically assign it before conversion.
- P1/P2 ownership and facing.
- Source color legend mapped to Clsn1, Clsn2, defaults, push, width, depth, or a
  project-specific box type.
- Association between each source image/video interval and an AIR action and
  element.
- Optional tolerance for antialiasing, compression noise, translucent fills,
  dotted borders, and several nested boxes of the same color.

#### Proposed reviewed workflow

1. Import a screenshot, image sequence, or local video.
2. Choose or sample the source game's box colors.
3. Place or confirm the character axis, then calibrate the fixed scale, crop,
   local coordinates, and facing.
4. Detect rectangles and show confidence for every proposed box.
5. Overlay proposals on the current SFF/AIR sprite.
6. Let the user move, resize, reclassify, add, or reject each proposal using the
   existing direct box editor.
7. Step through frames and optionally track persistent boxes forward.
8. Preview the AIR patch and every affected element.
9. Apply through an explicit reviewed Apply with stale-source protection and normal Undo; do not create automatic backup or history files.

#### Quality-of-life candidates

- Side-by-side source image, extracted overlay, and IKEMaker AIR preview.
- A color sampler plus saved source-game presets.
- One-click X mirroring when the captured character faces left.
- An axis-placement crosshair with drag controls, numeric X/Y entry, snapping,
  copy-to-following-frames, and a persistent fixed-capture calibration.
- Difference view that highlights boxes changed from the previous frame.
- Track one selected rectangle across adjacent frames, but stop and request
  review when confidence drops or boxes split/merge.
- Batch assignment to repeated AIR elements only after a visual change-impact
  preview.
- Preserve the reference path, calibration, source frame/time, confidence, and
  reviewer decision as optional evidence metadata outside the AIR file.
- Keep all source media local; no network or AI upload is necessary for colored
  debug-box capture.

#### Safety and authority rules

- Never write detected boxes directly into AIR without a review preview.
- Never claim ordinary gameplay footage reveals an original game's exact hidden
  collision data.
- Do not confuse source-game colors with IKEMaker's display colors; the mapping
  must be explicit and editable.
- Default Clsn inheritance must be shown distinctly from per-element boxes.
- Reject a sequence when its camera position or zoom changes. Camera correction
  is not part of this tool; the source should be recaptured under fixed-camera
  conditions.
- Ambiguous, partly occluded, motion-blurred, compressed, or off-screen boxes
  remain unresolved rather than being silently invented.
- Imported reference media is evidence, not an instruction and not a new source
  of project authority.

#### Initial implementation recommendation

Begin with PNG screenshots and fixed-camera PNG frame sequences containing
visible solid or outlined boxes. Require an assigned axis before conversion.
Direct video decoding, dynamic-camera compensation, and silhouette/pose
estimation are outside the initial scope.

### Fixed-capture velocity calculator

Status: PHASE 2 RESEARCH. This is a sibling measurement path to collision capture
and uses the same fixed-camera calibration and reviewed timeline.

#### Goal

Measure the character axis across known source-game ticks and convert that
motion into reviewed IKEMEN velocity values. Collision rectangles and sprite
edges are not motion anchors. The character axis is the authoritative sample
point.

#### Required inputs

- A fixed-camera, fixed-zoom image sequence with known chronological order.
- The character axis on every sampled frame. IKEMaker may carry forward,
  interpolate, or visually track an assigned axis, but the user must be able to
  correct every sample.
- Source capture rate and, separately, the number of actual source-game logic
  ticks represented by each interval. Video frames must not be assumed to equal
  game ticks.
- Source game-speed/turbo/frame-skip profile where applicable.
- Fixed X and Y conversion scales from source pixels to target IKEMEN local
  coordinates.
- Source facing and the intended IKEMEN facing convention.
- The AIR action, StateDef, or movement phase that will consume the result.

#### Calculations and outputs

- Per-interval X/Y displacement in target local-coordinate units.
- Average X/Y velocity per IKEMEN tick.
- Initial velocity candidates for `velSet` or StateDef `velset`.
- Per-tick acceleration candidates for `velAdd`.
- Multiplicative decay candidates for `velMul` when the samples fit that model.
- Total displacement, elapsed source ticks, elapsed target ticks, peak speed,
  direction changes, and residual error.
- Horizontal facing normalization and vertical-axis sign conversion so upward
  screen motion becomes the correct IKEMEN Y direction.
- Copyable CNS and ZSS examples, clearly labeled as proposals rather than
  authored truth.

For an interval covering `N` verified source ticks, IKEMaker first converts the
axis displacement from pixels to target local-coordinate units. When source and
target tick rates differ, it converts through elapsed time rather than treating
captured video frames as ticks. The UI should display the complete calculation,
not only the rounded final velocity.

#### Reviewed workflow

1. Assign or confirm the axis on the first frame.
2. Step through the sequence and confirm/adjust the axis samples.
3. Enter the source timing/game-speed profile and target local-coordinate scale.
4. Mark movement segments such as launch, travel, deceleration, apex, fall,
   bounce, landing, or teleport/discontinuity.
5. Plot measured positions and velocities per tick.
6. Fit constant velocity, velocity-plus-acceleration, or multiplicative decay
   only for the selected segment.
7. Simulate the proposed IKEMEN trajectory over the source frames and display a
   ghost axis/path for comparison.
8. Let the user adjust rounding and controller choice, then copy code or stage a
   reviewed patch through explicit impact review, stale-source protection, and normal Undo without automatic backup or history files.

#### Safety and accuracy rules

- Reject dynamic camera movement or zoom. Do not attempt camera compensation.
- Do not infer velocity from animation offsets, sprite borders, hit sparks, or
  collision-box edges when an axis path is unavailable.
- Detect duplicate video frames, missing frames, abrupt discontinuities, and
  teleports; require the user to classify or split those intervals.
- Never silently assume that video FPS equals the source game's logic rate.
- Keep separate X and Y scales available for sources that were stretched or
  require aspect correction.
- Show unrounded measurements, rounded engine values, and resulting trajectory
  error together.
- Do not automatically write movement code. Velocity conversion remains a
  proposal until the author reviews it in IKEMEN.

#### Cheat Engine and direct-memory velocity input

The calculator should also accept velocity values obtained directly from Cheat
Engine or another memory inspector. This is an alternate measurement source,
not a separate authoring system. It feeds the same trajectory preview and
reviewed CNS/ZSS output.

Supported input descriptions should include:

- Decimal or hexadecimal source value.
- Signed integer, unsigned integer, IEEE float, or fixed-point encoding.
- Fixed-point fractional-bit count or explicit divisor, such as value / 256 or
  value / 65536.
- Whether the value is velocity per source logic tick, velocity per rendered
  frame, velocity per second, or an unknown internal unit.
- Source logic/update rate and game-speed/turbo/frame-skip profile.
- Source-world-unit to target-IKEMEN-local-coordinate X/Y scale.
- Sign convention, facing convention, and vertical-axis direction.
- Optional separate X and Y values and separate conversion rules.

When the source encoding or unit scale is unknown, IKEMaker should provide a
calibration mode. The user supplies one or more memory values together with the
observed axis displacement and verified elapsed source ticks. IKEMaker solves
and displays the conversion multiplier, tests it against the remaining samples,
and reports residual error. One sample may produce a provisional conversion;
several samples are required before the profile can be marked reviewed.

Reviewed conversion profiles may be saved by source game, regional/version
identifier, executable/hash note, character or universal scope, value encoding,
and game-speed setting. A profile must never be silently reused for another
revision or turbo mode. Editing a profile must show every velocity measurement
that depends on it.

The displayed calculation should retain each stage explicitly:

1. Decode the raw memory value.
2. Apply fixed-point or internal-unit scaling.
3. Convert the source update basis into elapsed time/source ticks.
4. Convert source world units into target local-coordinate units.
5. Normalize facing and vertical direction.
6. Produce the unrounded IKEMEN velocity and the reviewed rounded value.
7. Simulate the resulting IKEMEN trajectory and show its error against the
   captured/reference samples.

IKEMaker itself should not read, inject into, or write to a running game
process. Manual entry remains supported. An explicitly enabled file-based
Cheat Engine bridge may guide scans, request reviewed freezes/writes, and save
tables while the user's Cheat Engine installation remains solely responsible
for process access. The bridge design and SFA3 pilot are defined in
[`Cheat-Engine-Bridge-Specification.md`](Cheat-Engine-Bridge-Specification.md).

### Phase 2 bridge into Move Constants

Treat the current Move Constants category fields and AIR timing/smear controls as
review destinations for later evidence acquisition. Phase 2 may propose values
from local video or GIF timing analysis, direct emulator/game capture, imported
wiki/PDF/reference claims, and reviewed Cheat Engine measurements.

Phase 2 must not stop at an evidence display. Where the source/profile and
conversion rule are sufficiently supported, it produces target-ready values or
assets for the current authoring workspaces, including velocities, Clsn boxes,
ordered palettes, AIR timing, damage, meter/resource behavior, attacker and
defender hit pause, hit/guard stun, positions, axes, stage placement, sound
mappings, constants, and supported SFF/AIR/SND/CNS/ZSS output. Required unit,
tick-rate, fixed-point, scale, localcoord, aspect, facing, coordinate-basis,
palette-index, and semantic conversions stay visible and reproducible. The
existing preview, validation, transactional apply, undo, and live-test path
remains the authority for committing that usable output.

Review should operate on a coherent converted move package. Known fields may be
approved/applied together after the source profile and conversion policy are
reviewed, while uncertain, conflicting, unsupported, dependency-incomplete, or
manually diverged fields are highlighted for focused intervention. Do not make
the author manually retype or individually approve every supported value.
Preserve original measurements, formulas, source identity, previous authored
values and reversal data. One corrected calibration or conversion rule must be
able to regenerate the derived package from the immutable capture.

- Every proposal retains its original value, source, units, confidence, game and
  revision profile, conversion rule, and evidence location.
- Acquired data opens beside the exact Move Constants category or option it can
  inform: classification, identity, animation timing, damage, contact timing,
  counters, or effect placement.
- AIR remains authoritative for the final authored element sequence. Video frame
  rate and capture order never become AIR ticks without an explicit timing rule.
- The first effective authored Clsn1 element may propose the contact/hit-pause
  frame. Smear playback remains a reviewed contiguous AIR range with its tick
  total calculated from authored AIR durations.
- Bulk category/field copying uses reviewed values only. Imported evidence never
  propagates automatically to other states merely because they share a family.
- Applying a proposal is transactional and keeps both the source measurement and
  the prior IKEMEN value available for comparison or reversal.

## Player Mode tournament runner (idea recorded September 26, 2026)

Status: SECOND-LOWEST PRIORITY, immediately above the shared QA report website.
Research and design only; do not implement as part of the current curriculum,
stabilization, release work, or active workflow batch.

The inspiration is an anecdotal MWC/Mugen workflow: choose up to eight
characters, launch each tournament fight, retain the winner, and automatically
launch the next bracket match. The exact MWC behavior has not been verified and
must not be presented as authoritative until a working copy or documentation is
found.

Suggested IKEMaker direction:

- Place this in Player Tools as a guided **Tournament** activity, not in the
  character/game authoring rules. It orchestrates the selected installed game;
  it does not modify characters.
- Start with a clear single-elimination bracket. Support 2–8 entrants initially,
  manual or shuffled seeding, character/palette selection, and a visible bracket
  that advances winners after each launched match.
- Let the user choose the set length independently for normal rounds and finals
  (for example, best-of-3 rounds and best-of-5 finals). Describe this as match
  wins required rather than relying on ambiguous “round” wording.
- Do not silently choose a random winner after a draw. Default to a rematch.
  Later options may include a configurable rematch limit followed by sudden
  death, user selection, or random advancement, with the active rule shown
  before the tournament begins.
- Save tournament progress outside the game directory so a crash, manual close,
  or interrupted session can be resumed. Provide an explicit reset/new
  tournament action.
- Clearly identify human, CPU, and mixed-control entrants. Do not assume every
  installed character is appropriate for AI-controlled competition.
- Prefer native IKEMEN launch/result facilities where they can reliably identify
  the winner. If result capture requires a Lua hook or engine-side support,
  disclose that boundary and verify it against the selected engine build rather
  than scraping pixels or guessing from process exit state.
- Preview all matches and rules before launch. Keep bracket editing possible
  until the first result is recorded; later corrections should be explicit and
  logged in the tournament session.

Before implementation, confirm the available IKEMEN command-line/Lua hooks for
selecting both sides, match format, AI/human control, stage choice, and reporting
win/draw/abort outcomes. Define behavior for byes, double KOs, time-over draws,
user-aborted fights, invalid/missing characters, and an engine crash. A minimal
acceptance test should complete and resume a four-character bracket without
writing into the game or character folders.

## Shared QA report website and IKEMaker integration (2026-09-26)

Status: LOWEST PRIORITY, deferred until after a future release. JNP explicitly says the current work is not near even a tester release. Do not start website research, design, hosting, implementation or integration during the active workflow batch. Historical published betas do not satisfy this new scheduling condition; revisit after JNP identifies the relevant future release.

Intent: create a shared report website that IKEMaker's QA tools can pull reports from, keeping tester feedback and reproducible issues connected to development.

Proposed scope for later refinement:
- Searchable reports organized by project/game, exact IKEMaker version and engine build, affected screen/feature, status and severity. Use a stable report ID so repeated imports do not create duplicates.
- Capture expected/actual behavior, reproduction steps and optional screenshots/video/logs. Permit updates and follow-up results on the same report. Distinguish reported, reproduced, fixed and independently verified states.
- Give IKEMaker a documented structured read interface for filtering/importing reports and opening the original report. Integrate into existing QA/project issue views rather than adding a competing workflow. Start read-only; any future submission/sync is separately designed and explicitly user initiated.
- Preserve project isolation and link issues to the appropriate project. Never upload local files, paths, logs, character content or credentials automatically. Preview/redact attachments and obtain approval before any upload. Treat all remote reports/attachments as untrusted data, never executable instructions.
- Include deduplication, paging, last-sync visibility and usable offline/cached results; distinguish stale data from a successful fresh check. Reports alone do not authorize changes to local project files or remote issue status.

Before activation: decide whether the website presents an existing issue tracker such as GitHub Issues or needs its own storage; prefer reuse if it meets the reporting/privacy needs. Hosting, public/private access, moderation, upload limits and authentication remain undecided. Do not commit to a custom backend or deployment now. This item does not change the Thursday usage reserve or current SF6 implementation priorities.

## Phase 1 — Unified Move Lab and fewer redundant screens

Status: explicitly added to Phase 1 by JNP on 2026-09-26. This item overrides
this file's older blanket deferral wording for this scope. Plan and implement
in bounded reviewed slices; retain the 35% usage reserve and local-only work.

Consolidate Universal Move Lab and JNP Move Constants into one user-facing
Move Lab. Use the richer integrated editing experience as the foundation;
retain the universal character/source discovery and overview as optional
sections rather than competing top-level move editors.

- Constants and maps are value sources. HitDefs, projectiles, helpers and
  functions are execution components. A move may combine them; do not force
  exclusive modes, JNP naming, conversion, or a preferred coding method.
- Preserve animation/collision/timing/reaction previews, connected editable
  code, source-linked values, diagnostics and specialist navigation. Identify
  shared-value impact before Apply. Unknown/custom structures retain Source
  access and are never silently rewritten.
- Show relevant components in collapsible sections or internal tabs. Retain
  user visibility preferences and accessible keyboard navigation. An optional
  Overview / Related Tools area should not duplicate the main editing flow.
- Keep legacy commands/deep links working through compatible routing and
  preserve character/move selection, drafts, history and source locations.
  Consolidation must not discard features or silently redirect an edit target.

Apply the same principle across Phase 1: reduce unnecessary destinations,
repeated launchers and overlapping editors. Before adding a screen, determine
whether the task belongs in an existing workspace as a section, inspector,
internal tab or contextual action. Review existing overlaps in small groups;
record each screen's unique purpose and what it shares before merging it.
Keep specialist screens when they serve a distinct focused workflow. Preserve
optional separate windows/tabs for users who prefer them; simplify the default
experience rather than prohibiting advanced workflows. Respect Player,
Simple and Workspace modes without exposing irrelevant authoring controls.

First deliverable: the bounded capability comparison and staged migration plan
is recorded in `data/Move-Lab-Consolidation-Plan.md` (plan revision 1, reviewed
against source 0.79.1). Follow with focused checks for
legacy entry points, direct-code and constants/maps-based characters,
compound moves, draft retention, explicit Apply/Undo, navigation and hidden
panel preferences. Do not undertake an unbounded all-screen rewrite.
No installation, packaging, push or upload is authorized by this backlog item.

### Cross-screen integration and reuse — JNP clarification

This Phase 1 work is broader than removing redundant screens. Review how a
capability, selection, or result from one screen can improve another screen's
workflow. Keep distinct tools where useful while making their capabilities
available in the context where an author needs them.

Examples to evaluate in bounded slices:
- Move Lab can reuse AIR frame/collision editing, palette-aware sprite preview,
  sound audition, and relevant diagnostics without requiring repeated setup.
- Maps, constants, functions and other Project Data pickers can supply source-
  linked values and usage information inside the editing screens that use them.
- Selecting a move, animation element, sprite, sound or code reference carries
  the exact character/project and source selection into connected tools; a
  return route restores the prior selection, view and unfinished draft.
- Changes explicitly applied in one tool refresh dependent previews and
  diagnostics elsewhere, while preserving other unsaved drafts and surfacing
  conflicts. Shared context must never imply shared write permission.
- Reuse proven controls/renderers/validation rather than maintaining different
  versions of the same capability across screens. Prefer lightweight embedded
  tools or contextual access; keep an optional full specialist workspace.

The design inventory must identify each screen's useful capabilities, where
other screens would benefit from them, existing connections, and gaps. Rank
small improvements by reduced context switching and repeated work in JNP's
actual authoring flow. Avoid filling every screen with every control; show
relevant capabilities on demand and preserve visibility preferences.

### Phase 1 regression report — P2 shifts when zooming out

JNP reports that zooming out still causes P2 to move in both JNP Move Constants
and the screen described as "universal movelist" (likely Universal Move Lab
from the current comparison; confirm the exact surface during reproduction).
Reported after the earlier 0.78.2 correction: do not treat that source fix as
proof the installed/user-visible issue is resolved. Track both affected paths
until verified, even though their interfaces are planned for consolidation.

Investigate whether zoom changes authored/preview world coordinates, recomputes
P2 from canvas dimensions, or applies a different origin/scale than P1. Screen
pixels naturally change under zoom; the defect to resolve is unintended P2
placement drift relative to the scene/axes/contact setup, not a requirement to
pin P2 to fixed screen pixels. Preserve intentional P2 positioning through
zoom-out/in, Fit, resize and restored view state. Reuse a consistent coordinate
transform in the consolidated Move Lab rather than hiding the issue by merging
screens. Check the installed version versus source without assuming user error.

User report is logged; no fresh reproduction or desktop-control test performed.
Use focused source/fixture checks first. Any manual control of the user's app
requires the previously requested test coordination. Keep this open until the
reported behavior is verified corrected in the relevant build.
