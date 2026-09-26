# Learning and Advanced Experience Audit

Baseline: IKEMEN 1.0. The extension is intentionally a creation environment
over Visual Studio Code. Learning and Advanced are presentation choices over
the same project files and capabilities; neither mode changes generated game
behavior.

## Product rules

1. Learning mode explains terms, consequences, ownership, and the next safe
   action close to the control that needs them.
2. Advanced mode favors denser layouts, keyboard access, multi-select, batch
   work, and collapsed explanations. Help remains available on demand.
3. A user may choose the mode independently for ZSS, Lua, CNS, assets, and
   stage/screenpack work.
4. Project rules, validation, and mutation safeguards never weaken in Advanced
   mode.
5. JNP naming and organizational standards remain optional profiles. Learning
   material may teach them but must identify them as project conventions rather
   than IKEMEN requirements.
6. Native IKEMEN 1.0 capability is checked before adding an extension-owned
   abstraction.
7. Lua guidance must distinguish deterministic gameplay/online boundaries from
   local shell, screenpack, tooling, and other presentation uses.

## Current coverage

| Area | Learning/Advanced applied now | Completion boundary | Status |
| --- | --- | --- | --- |
| ZSS editor intelligence | Yes: completions, hover notes, visual structure, required-option snippets, reviewed controller insertion, and explainable diagnostics | Every added diagnostic must include a tested explanation | Complete |
| Lua editor intelligence | Yes: completions, hover notes, visual structure, online boundary, and offline project-module ownership path | Add API-specific recipes only from verified project use cases | Complete |
| CNS editor intelligence | Yes: completions, hover notes, native section structure, controller option highlighting, concept bridge, and reviewed CNS-to-ZSS conversion | Conversion is loss-aware: unsupported constructs block apply and ambiguous compatibility behavior remains reviewable | Complete |
| SFF workspace | Yes: active mode, state-aware checklist, four-stage Learning recipe, reviewed actions, and Advanced shortcuts/batch paths | New bulk operations require demonstrated repeated use | Complete |
| AIR workspace | Yes: active mode, checklist, progressive action/collision/runtime/source recipe, direct box editing, and Advanced shortcuts | Runtime simulation remains IKEMEN-owned | Complete |
| SND workspace | Yes: active mode, checklist, split-profile/prefix/manifest recipe, controller bridges, and Advanced shortcuts | Final mixing and playback behavior remain IKEMEN-owned | Complete |
| Palette workspace | Yes: staged master protection, preview scope, comparison, assignment, commit guidance, and guarded mutations inside SFF | No separate palette archive format is invented | Complete |
| Throw Creator | Yes: dual tick timelines, timing proposals, bind/event/part planning, collision and onion overlays, reviewed timing mutation, saved plans, live mirror pose preview, and native scaffold output | Actual throw behavior, physics, interruption, and draw order remain live-IKEMEN tested | Complete on desktop |
| Stage workspace | Yes: active mode, staged checklist, offline coordinate/camera/BG/parallax recipes, visual placement, and reviewed writes | Deeper recipes follow demonstrated project needs | Complete |
| Screenpack/fight UI workspace | Yes: active mode, staged checklist, offline ownership/localcoord/position/Lua recipes, visual placement, and reviewed writes | Additional screen recipes follow demonstrated project needs | Complete |
| Character selection workspaces | Yes: Safe Roster Manager resolves the active motif, SelectBG/grid presentation, and character portraits for reviewed drag-and-drop select.def ordering; protected slots stay grouped. Advanced motif layout editing remains separate | Specialized animated/dynamic motif behavior remains authoritative only in IKEMEN runtime | Complete |
| Command/movelist workspace | Yes: active mode, checklist, primitive filtering, editable timing, syntax recipe, diagnostics, movelist preview, and Advanced shortcuts | Project-specific recognizers remain explicit presets | Complete |
| Character/project creation | Safe all-or-nothing creator offers explicit guided or clean baselines plus dependency review | Multi-character game architecture remains a deliberate project decision | Complete |
| Character production workflow | Separate My Next Tasks, Full Workflow, and Team Board views use editable inherited profiles and persistent per-character evidence; automatic checks never pass work | Project teams own completion decisions and profile expansion | Complete |
| Mobile/web extension | Per-domain settings plus portable catalogs, completion, hover, controller insertion, outline, and review with honest capability fallbacks | Native archive tools and executables require a verified portable implementation | Complete within reported capability boundary |

## Implementation sequence

### Phase 1 — make the selected experience visible and truthful

- Show the active domain and mode in every major workspace.
- Add a consistent, collapsible `What am I editing?` section.
- Open teaching sections by default only in Learning mode.
- Keep every explanation reachable in Advanced mode.

### Phase 2 — guided asset workflows

- SFF: Import → classify → axis → palette → validate → rebuild/save.
- AIR: choose action/frame → preview → edit collision → review runtime bridge.
- SND: assign profile → name events → validate prefixes → build/rebuild.
- Palettes: protect master → preview → assign → compare → commit.

Status: state-aware checklists are implemented for SFF, AIR, SND, palettes,
stages, screenpacks/fight UI, and commands/movelists. They report
`Done`, `Next`, `Review`, and `Later` from currently available evidence. Deeper
project-specific controls require evidence before they are added.

One-click navigation is implemented for every checklist family.
The buttons route to existing panels and controls, so they do not duplicate or
bypass the underlying authoring and save operations. More granular task-level
teaching and additional evidence-driven bulk operations remain subject to review.

The Advanced shortcut/bulk pass is implemented. Each supported
visual workspace exposes a compact bar of high-frequency actions, including
the existing batch tools where they apply. These shortcuts reuse the same
controls used by Learning mode and therefore preserve identical authored
semantics and mutation safeguards. Further domain-specific batch operations
require the same review when repeated real project work justifies them.

### Phase 3 — guided stage and UI workflows

- Stage: local coordinates → camera → BG placement → parallax → validation.
- Screenpack: file ownership → screen/section → element → preview data → apply.
- Explain which Lua uses are presentation-side and which must not own online
  gameplay state.

Status: the first task-specific stage and screenpack recipe pass is implemented
offline. Learning opens it by default; Advanced retains it collapsed. Character
creation also presents a reviewed dependency checklist and an explicit guided
or clean-baseline choice. Experience settings affect recommendation and
disclosure only; the user's selected scaffold remains authoritative.

### Phase 4 — faster Advanced surfaces

- Add command search, bulk selection, batch validation, and compact inspector
  summaries without removing safeguards.
- Remember layout, filters, selections, and mode-appropriate disclosure per
  workspace.

### Phase 5 — teaching quality and regression coverage

- Test both presentation modes for every workspace.
- Test that they produce identical authored output from the same reviewed input.
- Keep documentation offline-first and versioned to IKEMEN 1.0.
- Retain official online documentation and wiki links as optional update and
  verification paths.

Update: the language-authoring pass now inserts active required controller
options, offers a reviewed optional-field wizard, parses CNS with its own
section grammar, and exposes offline ZSS, CNS, and Lua authoring paths. Learning
and Advanced generate the same selected controller fields and values; only the
optional teaching comments differ.

Update: a cross-domain semantic-equivalence test now verifies every controller
snippet, reviewed controller output, ZSS/Lua completion and hover payload,
explicit character scaffold choice, and Advanced shortcut target. A separate
diagnostic coverage gate requires explanations for all current ZSS analyzer,
AIR timing-sync, and authored-function diagnostic codes.

Update: the browser capability audit corrected archiveParsing to false until a
real virtual-filesystem adapter exists. Browser hosts now provide portable
controller browsing/insertion, ZSS/controller/trigger completion, CNS
controller completion, Lua API completion, bundled hover help, text structure,
and a lightweight non-mutating ZSS review. SFF/SND remain honest placeholders;
native builders, external editors, and IKEMEN launch remain unavailable.

## Definition of done

The experience system is complete when a learner can discover the next safe
action without already knowing Fighter Factory, MUGEN, ZSS, or Lua terminology;
an experienced author can reach the same actions with minimal navigation; and
switching experience modes never changes project semantics or bypasses review,
backup, stale-file, or rollback-safety rules.
