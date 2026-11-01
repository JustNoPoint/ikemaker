# IKEMaker Stage, UI, and Storyboard Authoring Goal

Status: completed  
Started: 2026-10-27  
Usage reserve: stop implementation before the account falls to 35% remaining.

## Outcome

Make Stage, Screenpack/UI, and Storyboard creation approachable without hiding the underlying IKEMEN files. The visual tools should remove repetitive setup, preserve exact source authority, and keep every generated or imported change reviewable and undoable.

## Priority order

1. Guided creation profiles
   - Shared Classic 320×240, Hi-res 640×480, HD 1280×720, and custom canvas choices.
   - Generate scaled starter positions instead of requiring immediate coordinate cleanup.
   - Collect useful names, author details, and type-specific defaults once.
   - Create related DEF/SFF files transactionally, then open the correct visual workspace.
2. Shared visual layer workflow
   - Consistent visibility, ordering, multi-selection, movement, naming, duplication, and removal.
   - Layer controls remain available when the central viewer is expanded.
   - Source identities and generated code stay stable when layers are hidden or reordered.
3. Layered PSD adoption
   - Inspect and preview PSD layers in their authored order.
   - Export immutable reviewed PNG evidence plus a layer manifest.
   - Continue selected layers through SFF intake with explicit group/index identities.
   - Generate Stage, UI, or Storyboard source only for layers actually adopted.
   - Never mutate the active SFF or DEF merely by previewing or exporting.
4. Reusable components and presets
   - Save selected stage backgrounds, UI element groups, storyboard scenes/layers, camera layouts, and common timing/fade arrangements.
   - Clearly distinguish navigation/workspace presets from reusable authored components.
   - Preview affected files and identity allocation before insertion.
5. Repetition reducers
   - Property inheritance and reviewed batch editing.
   - Smart unique names, scene/layer numbers, sprite identities, and paired-file defaults.
   - Duplicate complete logical components rather than requiring field-by-field recreation.
6. Asset and validation integration
   - Browse/filter sprites, animations, sounds, palettes, and existing components from the authoring context.
   - Validate missing assets, duplicate identities, unsupported PSD blend modes, invalid ranges, off-canvas elements, and unsafe output assumptions.
   - Offer focused repairs with previews; do not silently rewrite source.
7. Focused testing and launch
   - Unit-test pure planning, allocation, parsing, and generation models.
   - Add focused workspace/authority tests for each mutation route.
   - Use small representative fixtures during this goal; defer the huge SFF test until separately authorized.

## Cohesion rules

- DEF/AIR/Lua/source files remain authoritative. Visual changes must flow through the existing mutation safety, backup, dirty-document, and undo systems.
- A browser or auxiliary panel must not create a second unsynchronized draft.
- Preview is not apply. Export is not adoption. Adoption requires an explicit reviewed transaction.
- Coordinate profiles and component presets are shared concepts, not three separate implementations.
- Controls use the same names, order, icons, selection behavior, and keyboard conventions across Stage, UI, and Storyboard wherever the action is equivalent.
- Narrow layouts remain usable; expanding the viewer must not hide authoring controls.

## Current completed foundation

- Stage, UI/Screenpack, and Storyboard entries exist in the code/data creation picker.
- Each format has a visual workspace and source navigation.
- Layered PSD inspection/export supports Stage, UI, and Storyboard targets.
- Reviewed PSD exports use immutable output folders, stable layer identities, a CSV manifest, target-specific code previews, and SFF intake handoff.
- Focused layered-PSD tests and a real 17-layer PSD smoke test pass.

## Completed in this goal

- One guided creation-plan model now drives Stage, Screenpack/Fight UI, and Storyboard creation.
- Creation offers shared Classic, Hi-res, HD widescreen, and validated custom canvases.
- Starter bounds, positions, centers, floors, and layer placement scale with the selected canvas.
- The configured author name is carried into generated Stage, UI, Fight UI, and Storyboard metadata.
- A modal review lists the complete connected file set before one atomic write transaction.
- Layered PSD handoff seals the selected layer identities and exact generated source.
- A manual post-build verifier requires every expected SFF group/index exactly once before source adoption is offered.
- Source adoption is blocked by dirty or changed owner files, repeated sections/properties, missing/duplicate SFF identities, or a changed SFF during review; it requires explicit modal approval and remains copy-only when preferred.
- A shared reusable-component model can capture and safely reinsert ordered Stage background, Storyboard scene, and grouped UI element properties with non-conflicting identities.
- The shared component library is persistent and is now exposed in all three visual workspaces: Stage BG sections, Screenpack/UI element groups, and complete Storyboard scenes can be saved, explicitly replaced, inserted through native authority/undo paths, managed, and deleted without changing prior users of the component.
- A shared layer-stack model now covers stable identities, Ctrl/Shift-style multi-selection state, group movement, visibility, opacity, locks, and up/down/top/bottom ordering without crossing locked-layer barriers.
- The layered PSD workspace now exposes reviewed multi-selection, independent visibility, group movement, drag/accessibility ordering controls, stable SFF identities, and live preview/code regeneration. Layer edits invalidate stale adoption approval.
- A shared SFF sprite-reference picker now serves Stage, Screenpack/UI, and Storyboard add flows. It provides searchable unique group/index choices, dimensions and axes, duplicate-identity warnings, bounded/manual fallback, and contextual suggestions without creating a second draft.
- Stage background inheritance is now a reviewed batch operation: choose targets and exact properties, choose fill-missing or overwrite, review the impact, then commit through Stage authority and undo history.
- Stage add/duplicate and Screenpack element creation now suggest collision-safe identities. Screenpack can duplicate a complete selected element group directly under a safe new prefix. Storyboard scene/layer creation continues to allocate safe next identities.
- A shared embedded-action picker now replaces raw action-number entry for Stage animated backgrounds, Screenpack/UI animation elements, and Storyboard animation layers, with parsed frame/first-frame/source-line evidence and a validated manual fallback.
- Storyboard now validates scene flow, canvas size, durations, empty/off-canvas layers, and exposes transactional one-click repairs only for unambiguous values.

## Remaining follow-up slices

- Add embedded-action and sound pickers with the same bounded/manual semantics as the shared sprite picker.
- Add an optional thumbnail browser handoff without creating a parallel authoring draft.
- Extend reviewed inheritance/batch editing to suitable Screenpack/UI element groups and Storyboard scene arrangements.
- Expand focused validation repairs where a single safe correction can be proven; keep ambiguous repairs source-guided.
- Add exact runtime launch targets only where IKEMEN can prove the requested Screenpack or Storyboard path, rather than presenting a generic game launch as an exact test.

These are optional future expansions, not blockers for this milestone. The shipped paths keep internal visual preview truthful, expose exact Stage Rig testing, and do not mislabel a generic game launch as an exact Screenpack or Storyboard test.

## Verification

- Focused creation, reusable-component, shared layer, batch inheritance, sprite/action picker, layered-PSD adoption/intake, Stage, Screenpack, and Storyboard tests pass.
- Syntax and changed-line checks pass; only existing line-ending conversion notices remain.
- The intentionally deferred huge SFF suite was not run.
