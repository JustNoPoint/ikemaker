# Viewer Cohesion Plan

This is the implementation contract for bringing every IKEMaker viewer into one recognizable shell without making unrelated viewers pretend to have the same data model.

## Shared contract

Every launch-control viewer receives:

- the same core dropdown order, including **Stage** and **Screenpack**;
- guarded access to the complete SFF, AIR, and SND action catalogs;
- a compact quick-action rail of consistently sized buttons with titles and accessible labels;
- previous and next buttons, a selection slider, and a truthful `current / total` readout whenever the viewer owns a selectable collection;
- no more than two visible quick-action rows before specialty actions move into a viewer-specific dropdown;
- one mutation owner for every action—menus and quick buttons route to the existing owner instead of copying its behavior;
- selection sliders that navigate authored items only. Zoom, playback, animation time, audio position, and timeline ticks remain separately labeled controls.

The header is reserved for identity, status, shared dropdowns, and global refresh. Persistent viewer icons and favorites belong in the viewer's quick rail.

## Priority 1 — character assets and move coding

| Viewer | Selection navigator | Compact actions | Specialty dropdown |
| --- | --- | --- | --- |
| SFF | Sprites | Add, delete, duplicate, change image, export, edit | SFF |
| AIR | Actions plus frames | Action, frame, and contact-box actions | AIR |
| SND | Archives plus sounds | Add, delete, replace, export, play, loop, pause, stop | SND |
| Move Constants | States/moves; AIR elements remain canvas-local | Overview, AIR/CLSN, source, live preview | Move Lab |
| Move Lab shell | Items in the active mode | Exact source, preview, constants, diagnostics | Move Lab Shell |
| HitDef | HitDef controllers | Apply, revert, source, copy, preview | HitDef |
| Helpers | Helper/projectile recipes | New, duplicate, validate, preview, source | Helpers |
| Throws | Throw events plus existing tick transport | Add/remove event, P1/P2, timing, code, live preview | Throws |
| Spatial Composer | Events plus existing tick timeline | Add/delete, play, preview code, insert | Spatial |

## Priority 2 — stage and screenpack core viewers

| Viewer | Selection navigator | Compact actions | Specialty dropdown |
| --- | --- | --- | --- |
| Stage | Background stack; BGCtrl time remains separate | Add, duplicate, remove, source, layers, guides, fit, reset, Stage Rig | Stage |
| Screenpack | Screens plus elements | Add screen/element, source, Lua, mirror, guides, fit, layers | Screenpack |
| Roster | Roster entries | Add, remove, reorder, properties, stage, preview | Roster |
| Menus & Modes | Modes/menu entries | Add, remove, reorder, source files, reload | Menus & Modes |
| Story & Dialogue | Dialogue/arc entries | Add, remove, reorder, portraits, branches, reload | Story & Dialogue |
| Storyboard | Scenes | Add, duplicate, remove, layer, source, apply | Storyboard |

## Priority 3 — code, project, and review viewers

| Viewer | Selection navigator | Compact actions | Specialty dropdown |
| --- | --- | --- | --- |
| Commands & Movelist | Commands plus displayed-list entries | Add, duplicate, delete, revert, conflicts, glyph, source | Commands |
| Code Structure | Source nodes | Parent/child, source, why-not-run, docs | Code Structure |
| CNS Converter | Input files | Findings, source, copy, save, apply | Converter |
| Character Health | Audited files | Safe select, preview, apply, undo, report | Health |
| Dependencies | Dependency nodes | Source, back, forward, refresh | Dependencies |
| Mutation History | History entries | Preview, restore, affected source, filter | Recovery |
| Production Workflow | Milestones/checks | Status, evidence, owner, next incomplete | Workflow |
| Test Session | Suites/tests | Run, evidence, source, next failed | Tests |
| Project Manager | Active project/team/ticket items | Add, edit, archive, open | Project Manager |

## Priority 4 — preparation and palette viewers

| Viewer | Selection navigator | Compact actions | Specialty dropdown |
| --- | --- | --- | --- |
| Artist Intake | Source frames | Select, assign, all, none, package | Artist Intake |
| SFF Assembly | Groups/sprites on the active side | Include, exclude, remap, compare, build | Assembly |
| Palette Import | Candidates/sources | Accept, review, remap, preview | Palette Import |
| Palette Index Organizer | Palette indexes | Previous, next, category, lock, apply, export | Palette Indexes |
| PalFX | Layers | Add, duplicate, delete, enable, reset, apply | PalFX |

## Acceptance checks

- Stage and Screenpack menus exist on every launch-control surface.
- Full asset action catalogs route safely from non-asset viewers.
- Every selectable viewer has arrows, a range control, and a readable selection count.
- Quick icons share one fixed size and every icon has a tooltip and accessible name.
- Persistent buttons do not remain orphaned in the header or below unrelated content.
- A command is never reimplemented merely to expose it in another location.
- Specialty overflow keeps the viewer uncluttered and does not hide core navigation.

## Coding Viewer and Authoring Browser contract

New Dev re-reviewed this scope after the Fighter Factory layout reference clarified the intended hierarchy.

### Fixed viewer header

- The canonical menu/dropdown catalog and universal 27×27 quick-icon strip remain fixed when the selected code file changes.
- Coding uses the same semantic button colors, tooltips, disabled reasons, accessible names, action search, Stage/Screenpack access, and one host-owned command bridge as every other viewer.
- Specialist actions never insert themselves into the universal strip. Context-specific actions live in the viewer body or its categorized dropdowns.

### Coding body

- Outer VS Code tabs are the Coding, SFF, SND, and AIR viewers for one character context. Inner Coding tabs are only the connected text/code files.
- The file navigator is `arrow – file tabs – arrow`, followed by one bounded slider and `N of M · filename`. Header controls never move or change identity while this selection changes.
- The main viewer offers Tabs and compact grouped Cards. Cards render truthful code families as compact wrapping hands of the same file buttons; they are not a second dashboard.
- List, search, long inventories, and overflow navigation remain Authoring Browser features.
- Visual, Source, Split, Open Full Text, nested visual code structure, diagnostics, and contextual recipe launchers belong below file navigation.
- Source is bound to the exact native VS Code document. Native dirty state, Save, Undo, and Redo are authoritative; no Apply/Discard/body Save row is shown once live-edit authority is active.
- Live editing requires serialized bounded revision/generation messages, exact context/document/version/fingerprint validation, post-apply verification, recovery before mutation, stale-edit blocking, and native-editor fallback for oversized files.
- Tabs expose exact-path tooltips and saved/dirty/read-only/conflict status without expanding the fixed header.
- Source-text folding is not simulated by deleting or hiding textarea content. Nested folding begins in Visual Code Structure; the native editor remains the source-folding escape hatch until a range-safe editor widget exists.

### Authoring Browser ownership

- The Browser stays manual-open only and owns List/search/filter/sort views, Code Navigator, Project Data Maps, Controllers, Connected Files, symbols/contracts, diagnostics, and recipe/library overflow.
- Code uses list/tree/cards rather than fake thumbnails. Thumbnail modes are reserved for records with truthful visual previews, such as AIR actions, sprites, portraits, and palette images.
- Browser providers remain read-only by default. Recipe insertion or any mutation leaves the provider path and enters a separately authorized reviewed mutation workflow.
- Useful later QoL: contextual `Recipes…` and `Reveal current file in Browser` launchers, current-family labels, recent/pinned files without header reordering, persisted per-context file/mode/split state, and a compact problems/status line.
- Browser provider failures remain isolated; Escape closes child/search/browser layers in order; closing the character owner closes its floating Browser without opening one automatically later.

### Acceptance additions

- Two characters can keep distinct editor groups; shared code-file ambiguity fails closed.
- Reopening an exact Coding/SFF/SND/AIR owner reuses it without creating a duplicate, and a character session may safely move that owner into its proven context group.
- Arrow, tab, slider, and card selection share one host-committed state and cannot diverge after a veto, stale generation, or failed document open.
- Rapid/out-of-order typing, external edits, apply failure/throw/no-op/wrong post-state, context takeover, switching, close/dispose, native Undo/Redo, Save failure/retry, and large-file fallback receive executable coverage before sign-off.
