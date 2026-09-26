# IKEMaker

**Development and AI transparency:** IKEMaker is designed and directed by JustNoPoint (JNP), with OpenAI Codex used extensively to write code, review changes, and assist with testing and documentation. AI assistance is an explicit part of this project's development process. It does not mean every feature has been verified; release notes distinguish completed checks from known issues and outstanding testing.

JustNoPoint brings years of hands-on fighting-game development, including writing and extensively reworking code across approximately 20 complex HDBZ characters as part of a full game. IKEMaker's direction draws on that experience: recognizing and adapting code in context, connecting related systems, and reducing the need to recall syntax from a blank file.

## Downloads

Compiled packages stay on the [IKEMaker Releases page](https://github.com/JustNoPoint/ikemaker/releases); they are not committed to this repository.

- **Windows Offline ZIP:** installs IKEMaker when VS Code is already present. The standard package contains no Lua Language Server.
- **Windows Online Bootstrap ZIP:** can obtain the official VS Code installer when needed, then installs IKEMaker. The standard package contains no Lua Language Server.
- **With-LuaLS ZIP variants:** the same Offline and Online packages with the reviewed Lua Language Server VSIX available behind an explicit `[y/N]` choice. Pressing Enter skips that companion and leaves any existing Lua installation unchanged.
- **VSIX:** the raw IKEMaker extension for manual installation or the verified updater. It neither contains nor automatically requests LuaLS.

Upgrading IKEMaker does not remove or disable a Lua extension already installed, and IKEMaker does not repair LuaLS environment diagnostics. Users decide whether to keep or disable that separate extension. No package includes IKEMEN GO, MUGEN, characters, stages, game content, private workspace files, or credentials.

## Source history

The reviewed 0.78.0 source was imported after its immutable prerelease as an honestly labeled baseline. The existing `v0.78.0` tag still identifies the original release commit and was not moved or rewritten. That baseline import removed personal path/name metadata and excluded the large prebuilt LuaLS VSIX from Git. Versions 0.78.1 through 0.78.4 are separate normal source commits; future release tags should identify their actual source commits.

Version 0.78.6 expands **Command & Movelist** authoring without imposing an input style. The editable input timeline now has a selected step, prominent add/insert controls, duplicate, remove, and accessible left/right reordering while preserving custom native syntax as authored. Its picker distinguishes absolute L/R from facing-relative B/F and changes only newly inserted steps. Built-in command presets now open as complete editable drafts—including paired definitions—before an explicit Apply, warn about existing command names, reject stale target files, and can be saved as workspace-scoped custom presets without writing support files into character or game folders.

Version 0.78.5 adds a focused **Palette Workshop** to Player mode for people who customize characters primarily through palettes. It can preview and safely add or replace an ACT/indexed-PNG palette, open the palette-only create/edit/export organizer, or browse the current character's palette folder. It reuses the existing reviewed write confirmations and deliberately does not expose the full SFF viewer, general sprite import, code editing, or other character-authoring tools.

Version 0.78.4 makes ACT palette table order explicit instead of guessing which application wrote an unmarked file. ACT import/compare/replace and export in the SFF viewer now ask for file order (0 → 255) or the Reversed Photoshop method (255 → 0), visibly include the active convention, separate one-time overrides from remembered changes, and apply the same choice in both directions. Safe Palette Placement starts ACT files from the remembered choice, retains its generic per-operation table reversal for ACT and indexed PNG, and only shows preference remembering for ACT. The SFF palette editor now labels its existing safe staging route **Add Palette(s) from Project Library**, exposes **Add One Palette…**, and honestly directs multiple additions through repeated reviewed staging plus **Review Staged**; batch selection is not claimed. Existing files are never rewritten merely by previewing or changing the preference.

Version 0.78.3 adds the first personal example shelf inside Pinned Sources. A user can pin the current ZSS, CNS, or Lua block with a personal label, keep it in extension workspace state, and reopen, rename, remove, or explicitly relink it without writing to character or game folders. Entries remain isolated by character/project owner, identify explicitly linked shared sources, show compact excerpts, relocate only on one exact content match, and visibly report changed, missing, ambiguous, or no-longer-linked sources instead of silently opening an old line.

Version 0.78.2 corrects the JNP Move Constants P2 preview transform by storing its axis in authored/world coordinates instead of absolute screen pixels. Zoom and resize now share the P1 camera origin, preserve P2's authored coordinates, and scale the visible P1–P2 relationship consistently; prior saved screen positions migrate without an initial jump. Shared classic HitDef values now use decimal-safe quick inputs and reviewed checkmark Apply actions while retaining Source navigation, stale-source rejection, shared-impact confirmation, normal Undo, and unsaved-document review.

Version 0.78.1 makes Lua Language Server a genuinely optional companion and moves opponent-availability advice into an identified-author rule that is off by default. IKEMaker's VSIX never declares another extension for automatic installation. Standard Windows packages omit LuaLS entirely; clearly labeled `With-LuaLS` variants carry its official VSIX for users who choose it.

Version 0.77.9 makes the existing Project Maps browser visibly accessible from IKEMaker Tools > ZSS, CNS, and Lua and as the first action under Project Data > Maps. The Project Data action remains available while the older workspace-wide ZSS inventory is scanning or empty, and it is explicitly labeled as a separate scoped multi-format browser. Launches without reliable context offer character selection; Lua and unresolved launches remain browse-only rather than implying unsupported insertion.

Version 0.77.8 replaces the deep map disclosure tree with a results-first full-window browser. Current File, Ryu Files, Template Files, Assigned Runtime Files, and All Available scopes show distinct map/file totals; selecting JNP or any parent immediately lists every descendant map. Fixed breadcrumbs and next-group controls progressively narrow that list with explicit remaining-map and “fewer” counts, while search, results, and map details remain visible without scrolling through a hierarchy. Visual authoring contexts now augment their small edit list with the owning character DEF, its exact assignments, character files, universal shared files, and the configured game template. The Ryu/SF6 fixture verifies 2 character, 20 template, 19 assigned, and 22 unique available code files.

Version 0.77.7 adds recognition-first map authoring. Project maps are collected into conservative name-suggested families, searchable by exact name, source reminder, and filename, and available through a remembered grouped picker or a full contract browser. Confirmed Author > Game prefixes keep DvS, SF6, DS4, and HDBZ inventories isolated while retaining actually linked shared maps. The browser shows source notes, observed values, exact uses, incomplete-scan status, and explicitly unknown ownership/receiver fields. Safe insertion is available in ZSS/CNS text editors, explicitly opted-in code `.txt` tabs, and applicable visual coding fields; AIR and non-code asset fields are excluded. Every insertion revalidates the captured editor version or visual-field value before using the normal Undo/draft pipeline. Equality comparisons and CNS trigger comparisons are no longer misclassified as map writes.

Version 0.77.6 standardizes fighter and coordinate viewers on the navy grid used by Spatial Composer: the same background, grid, and axis colors now appear in AIR, Move Constants, Universal HitDef, Move Lab, Helper Lab, Throw Creator, Spatial Composer, and animation comparison. Full grids were added where a viewer previously showed only a floor line. Stage, screenpack, SFF, and PalFX retain their meaningful scene or transparency backgrounds.

Version 0.77.5 adds direct AIR timeline authoring. Frame group/index, offsets, duration, flip, blend, scale, and angle update automatically while typing; Add, Duplicate, and Delete operate on the selected element with collision-aware deletion and normal Undo. The frame editor remains visible even when the optional AIR inspector is hidden, AIR source opens as a nested tab without the viewer stealing focus, and Previous/Next Issue navigates confirmed missing-sprite elements.

Version 0.77.4 fixes the JNP Move Constants hit-spark drag coordinate-space defect that could turn a small motion into a large jump. Spark, helper spawn, Explod/position, and throw placement viewers now finish interrupted pointer gestures safely and provide explicit Find controls that pan to off-screen authored objects without changing their coordinates. Zoom remains a view-only operation and never clamps or rewrites placement values.

Version 0.77.3 makes Connected Code ownership literal: a StateDef, connected state, or function assigned from outside the character folder is labeled shared, including template-owned move states such as the SF6 State 200. Character-local overrides remain unlabeled, and the explanation warns when a template edit can affect multiple characters.

Version 0.77.2 makes visual placement handles behave like editing tools. JNP Move Constants and the universal HitDef Editor now let authors drag hit-spark markers into safe drafts; Helper Lab adds a draggable projectile/spawn marker while retaining Shift-drag panning; Explod and Position placement remain directly draggable. The JNP contact-result panel now provides compact per-move editors for damage, hitstun, ground slide time, guard stun, and counter/punish values, while showing inherited classic HitDef values and linking to their shared source so shared profile changes are not mistaken for move-local edits.

Version 0.77.1 adds an explicit retained/custom exact-build installer. It freezes and rechecks a selected sibling manifest and ZIP before feeding the same validated archive, baseline comparison, full backup, conflict review, journal, rollback, and project-adoption pipeline as an online Nightly. Bundled independent records identify reviewed artifacts; other exact versions and custom forks require a separate unsupported-build override and remain user-asserted. Compatibility recommendations may be overridden, but filesystem safety, backup, rollback, and live-change checks cannot. The selected build remains pinned and future automatic upgrades remain unauthorized.

Version 0.77.0 adds project-aware engine updates. Weekly discovery presents an immutable Stay / Review / Remind decision with evidence-based risk guidance. The reviewed migration path resolves an exact official release asset, validates its published and downloaded hashes, compares live files against the authenticated 1.0 baseline, preserves and records local overrides, creates a complete restorable engine/config/registry snapshot, journals every allowlisted replacement, and refuses unsafe archive paths or destructive rollback. No engine or project content is changed until the user approves the exact operation and validates its final footprint.

Version 0.76.6 protects connected-code drafts across refresh, reload, character changes and source movement. Drafts retain their immutable starting text/hash, conflict instead of silently rebasing, require explicit rebase/discard, participate in close/recovery protection, preserve newer typing during in-flight Apply, and refresh Saved/Unsaved and diagnostics without losing the selected AIR element or collapsed layout.

Version 0.76.5 consolidates the JNP Move Constants screen into a focused Attack Workspace: selected move/state/AIR context and unsaved status remain visible, AIR/CLSN opens on the exact selected element, relevant Problems and isolated connected code share the workspace, field help explains project values, and advanced tools stay collapsed. It preserves the universal viewer/text tab placement contract and leaves the future guided Flow Mode in the approved backlog.

Version 0.76.4 restores the universal placement rule: a visual workspace first opens in the shared viewer group beside text code, while users remain free to move viewer tabs afterward. Version 0.76.3 makes real CNS/ZSS HitDef controllers the universal Move Lab attack list and separates JNP Move Constants into an explicitly optional, project-specific modular profile area. Version 0.76.0 adds project-bound engine targets, a versioned capability catalog, automatic official/custom-fork knowledge discovery, side-by-side installed-build registration, explicit reviewed adoption history, and target-aware launch resolution. Existing projects remain on the pinned IKEMEN GO 1.0 stable contract unless their owner explicitly adopts another exact build. Version 0.75.7 removes the redundant raw/text tab after a directly opened SFF or SND successfully reaches its visual workspace; AIR intentionally remains text plus visual. It also adds the offline-first Help & Learning Center with task-oriented screen maps, direct workspace links, compatibility guidance, and a reviewed MUGEN-to-IKEMEN path. The full-game audit now survives protected editor/runtime folders and recognizes stable `system.base.def` motifs. Version 0.75.6 protects the configured CS background color (`#00F5BA` for JNP work), detects exact and near visible-color collisions, and assigns traceable unique provisional replacements.

Version 0.75.3 makes Windows file-opening setup unmistakable in Quick Start and Personal Workspace, including SFF, AIR, SND, and code formats. It also waits until VS Code finishes restoring its window before selecting the IKEMaker sidebar, so Explorer no longer overrides the saved IKEMaker startup preference.

Version 0.75.2 adds a multi-reference palette tray to the SFF palette workspace. Load many ACT files or indexed PNG images together, focus one reference grid, copy individual indexed colors into the non-destructive preview, and batch-adapt selected old palettes through reusable `destination=source` index macros. An explicit **Flip 256-color table order** conversion handles applications whose tables run opposite Photoshop; it can be previewed, saved in a conversion recipe, combined with index mappings, and batch-exported without overwriting originals. Direct HTML/hex color entry, palette-slot insertion, and the limited Palette Construction workflow remain included.

Version 0.71.5 adds an opt-in Windows file-opening assistant to Quick Start and Personal Workspace and Preferences. It registers selected IKEMEN formats as **Open with IKEMaker** choices and can open Windows Default Apps for explicit double-click assignments. Shared extensions such as DEF, SND, ACT, ST, and Lua require deliberate selection. New IKEMEN and MUGEN characters use the neutral `.inp` input extension by default, while project-specific extensions such as HDBZ's `.mfg` can be selected and registered. Legacy CMD receives only a safe context-menu action so Windows command scripts remain executable.

Version 0.71.4 displays the installed IKEMaker version persistently in the VS Code status bar and as the first entry under IKEMaker Quick Start. The status text appears after VS Code startup without requiring a file or information document to be opened; clicking it is only an optional shortcut for copying the version or opening IKEMaker.

Version 0.71.3 makes the deliberate GIF-to-AIR timing conversion tick-aware. GIF timing is cumulatively quantized instead of rounding each frame independently. When any source frame is shorter than one 60 Hz IKEMEN tick, the converter explains that an exact one-to-one conversion is impossible and requires a choice: resample to 60 Hz while preserving approximate duration and possibly omitting source frames, or preserve every frame at a minimum of one tick and accept longer playback.

Version 0.71.2 makes Artist Intake and Two-SFF Assembly strictly SFF-only. They do not create, replace, or infer AIR data; the destination/template AIR remains authoritative and untouched. A separate deliberate **GIF → AIR** action now lives in the AIR viewer. It maps a chosen GIF frame count to an explicitly selected action and SFF group/index range. Compilation GIFs default to uniform one-tick elements for later authoring; custom uniform timing and GIF-delay reference timing require deliberate selection, and existing actions require replacement confirmation.

Version 0.71.1 corrects Artist Intake timing authority: GIF and source-image delays are ignored by default. The draft AIR uses one-tick frames only for neutral browsing and labels timing unassigned. Source delays may still be preserved as provenance and used only through an explicit reference-timing checkbox.

Version 0.71.0 adds a non-destructive **Artist Intake** workspace for animation GIFs, PNG sprite sheets, and loose frame folders. It detects exact duplicate frames, preserves artist originals and labels, suggests editable IKEMaker sequence names and group families, and produces working PNGs, provenance, a reviewed manifest, and a temporary SprMaker2 build package. A companion **Two-SFF Assembly** workspace opens a source and destination archive together; whole groups or Ctrl/Shift-selected sprites can be dragged into destination groups as explicit additions or replacements. Identity collisions stop instead of silently overwriting, replacements can retain the destination axis, and the final archive remains a reviewed SprMaker2 rebuild that preserves the destination palette table.

Version 0.63.0 adds a reviewed **CNS → ZSS Converter** for individual state files and DEF-driven character batches. It preserves triggerall/trigger-number logic, StateDefs, controllers, parameters, comments, persistence, and hit-pause timing; separates mixed constants sections from state code; reports uncertain compatibility behavior; blocks unsupported conversions; retains every original CNS; and can transactionally update only the character DEF's `st` assignments after an exact side-by-side review.

Version 0.62.1 reorganizes IKEMaker around clear responsibilities. **Quick Start** exposes the common open-character, connected-work, workflow, roster, and launch paths first. Authoring remains grouped by asset type; every audit, diagnostic suite, stage rig, and recovery action now lives under **Debug and Testing**. Universal standards, game/project profiles, and personal workspace preferences are three separate areas. All visual workspaces retain the same responsive **Related Work / Game / Infinite VS / Training** control strip with the complete keyboard shortcuts visible on wider screens.

Version 0.62.0 adds an audit-first **Character Health & Cleanup** workspace. It follows a character DEF across its assigned CNS, CMD, JNP, ZSS, and AIR files; reports missing dependencies, shadowed or exact duplicate parameters, unknown controller options, malformed rows, duplicate AIR actions, and intentionally reviewable sprite-less actions; and publishes navigable findings to VS Code Problems. Repairs support exact diff preview, behavior-preserving selection, comment-or-delete policies, offline controller guidance, transactional backups, mutation history, and immediate undo. The IKEMEN GO 1.0 compatibility layer recognizes legacy parameter aliases used by stock characters, while configurable project allowances and a conservative custom profile prevent destructive assumptions.

Version 0.61.1 added one cohesive navigation and launch shell across every visual creation screen. **Related Work…** discovers the current character and game context, then opens connected source code, SFF, AIR, SND, palette/PalFX tools, move data, command data, dependency trees, roster/menu/story/stage/screenpack editors, production workflow, testing, and recovery without requiring a return to the sidebar. Existing direct bridges retain their select.def or character context where applicable.

Version 0.58 adds guided character sessions and AIR-to-SFF missing-frame diagnostics. Opening a character now proposes focused screen sets for essentials, connection tracing, animation repair, attack properties, sound work, complete connected code, and workflow/QA; each character remembers its choices. Version 0.57 added direct character navigation, explicit definition tracing, the Character Connection Tree, and the restored ZSS/CNS controller inserter. Version 0.56 added the workflow-stabilization layer described in [Workflow-Stabilization-Architecture.md](data/Workflow-Stabilization-Architecture.md).

## Project scope

This extension is intentionally an IKEMEN game-development environment built
on Visual Studio Code. Visual editing, guided creation, previewing, validation,
asset management, code generation, batch processing, and integrated learning
tools are all valid parts of its scope when they make creation faster and
simpler.

That broad editor scope does not authorize unnecessary runtime systems. The
characters, game templates, and shared modules should still prefer native
IKEMEN features and add abstractions only for concrete, reviewed project needs.
Project-specific naming and workflow rules exposed by the extension must remain
configurable rather than mandatory for other creators.

## Visual ZSS and Lua structure workspace

Use **IKEMEN: Open Visual Code Structure** on a ZSS, CNS, or Lua file to keep a
clickable code tree beside the normal text editor. It recognizes states,
functions, nested conditions and loops, controllers, assignments, Lua
callbacks, tables, and module imports. Selecting a card reveals the owning
source line, while text-editor selection highlights the narrowest matching
card. Search, filters, persistent collapse state, responsive layout, and
expandable plain-language explanations are built in.

The workspace header provides explicit **Online Docs** and **Wiki** buttons.
Selecting a recognized controller also exposes a collapsed, fully offline
**Controller documentation** section. Its bundled reference lists parameter
names, expected value formats, required/optional status, and compatibility.
Options used by the source block are highlighted, making large controllers
such as HitDef easier to audit without leaving the editor.

### Lua Language Server integration

**Lua Language Server** by sumneko is the recommended general Lua editor. It
provides parsing, syntax diagnostics, formatting, rename/refactoring, symbols,
references, and ordinary Lua completion. IKEMEN Creator Tools adds the
IKEMEN-specific layer: offline API help, visual structure, project/module and
asset connections, guided screenpack authoring, and rollback-boundary guidance.

IKEMaker does not declare `sumneko.lua` as an extension-pack dependency and
never downloads or installs it automatically. Standard Windows packages do not
contain LuaLS. Clearly labeled `With-LuaLS` packages contain its official,
unmodified VSIX and ask whether to install it with **No** as the default. Each
extension keeps its own version, license, updates, settings, and uninstall entry.

Use **IKEMEN: Check Lua Authoring Support** to see both layers. Use **IKEMEN:
Install LuaLS Definitions into Project** to place a generated `---@meta`
library under `.ikemen-tools/luals`. This teaches LuaLS the documented IKEMEN
1.0 globals without editing default IKEMEN Lua or loading the metadata at
runtime. The action is explicit, transactional, refreshable, and project-local.
IKEMaker's own Lua completion, hover help, structure, and offline documentation
remain available when LuaLS is absent.

## Learning and Advanced experience

Use **IKEMEN: Configure Learning / Advanced Experience** to choose how much
guidance the extension presents for each area. ZSS, Lua, CNS, asset tools, and
stage/screenpack tools can be configured independently.

The **CNS Veteran / Learning ZSS and Lua** preset keeps CNS and asset work
compact while expanding explanations for the two languages still being
learned. Learning and Advanced modes use the same underlying tools and files;
they change presentation, not project behavior. Explanations remain available
on demand in Advanced mode.

The domain-by-domain implementation status and acceptance rules are maintained
in `data/Experience-Coverage-Audit.md`. In particular, Advanced mode never
weakens validation, backups, stale-file checks, or online-safety guidance.
The executable equivalence gate and its proof scope are documented in
`data/Experience-Semantic-Equivalence.md`.

SFF, AIR, SND, stage, screenpack/fight UI, and command/movelist workspaces now
show their active experience. Learning opens a nearby `What am I editing?`
guide that explains file ownership and the next safe workflow step. Advanced
keeps the same guide available but collapsed, leaving more room for dense
authoring controls. Palette work follows the asset experience inside the SFF
workspace.

The contextual guide includes a live workflow checklist. It derives `Done`,
`Next`, `Review`, and `Later` steps from the currently loaded archive,
animation, definition, command, profile, diagnostics, and attached assets. The
checklist is advisory: it never marks a file complete by altering project data,
and unresolved sprite classifications still require human review.

Each workflow step includes a **Go** action. It activates or focuses the
workspace's existing inspector tab, source list, validation area, profile
operation, manifest control, or save control. These links do not create a
second write path: the destination control retains its normal review,
confirmation, stale-file, backup, and transaction behavior.

Advanced mode also exposes a compact shortcut bar for high-frequency and
bulk-oriented work. Depending on the workspace, this includes unresolved
sprite review, batch axes, batch Clsn2, marked sound export, split-contract
auditing, manifests/rebuilds, diagnostics, position application, command
filters, and movelist access. The bar is hidden in Learning mode to preserve a
guided reading order.

## Native language intelligence

ZSS, CNS, and Lua editors provide context-aware completion and hover documentation
from the bundled IKEMEN 1.0 references. The editor can:

- complete all 155 state controllers;
- offer only valid, not-yet-authored options inside a recognized controller;
- preserve dotted options such as `ground.velocity` and `fall.recover`;
- complete and explain 158 official IKEMEN trigger additions and expansions;
- complete and explain 338 documented IKEMEN Lua functions and hook entries;
- show fuller teaching notes in Learning mode and concise reference material
  in Advanced mode.

The trigger and Lua API catalogs are generated from locally archived official
IKEMEN wiki sources. Hover summaries work offline; the optional link opens the
official online reference.

ZSS controller completion now activates every catalogued required option as a
snippet field instead of inserting a block whose required values are commented
out. Use **ZSS: Insert State Controller with Options…** for the reviewed path:
choose a controller, select only the optional fields this use needs, enter each
required/selected value, and insert one undoable native block. Learning adds a
short ownership note; Advanced inserts the same controller and values without
the teaching comments.

ZSS safety diagnostics now offer **Explain IKEMEN diagnostic** from the editor
lightbulb. The bundled explanation states what the finding means and lists
review steps without applying an automatic fix. Coverage includes redirect and
team validity, negative-state timing, custom-state ownership, cross-entity
writes, forced ordering, loops, optional namespaces, AIR timing synchronization,
and authored-function lookup/order/signature problems.

The Visual Code Structure workspace has separate native structure paths for
ZSS, CNS, and Lua. CNS is parsed as StateDef sections containing State
controller sections, numbered triggers, and `name = value` assignments; it is
not treated as brace-based ZSS. Offline language paths explain ZSS controller
ownership, CNS trigger-group and CNS-to-ZSS concepts, and project-owned Lua
module/rollback boundaries. Learning opens the relevant path; Advanced keeps
it available collapsed.

## Authored ZSS navigation and safe rename

Use normal VS Code navigation directly on project-owned ZSS symbols:

- **Go to Definition** resolves authored functions, map writes, variable
  writes, state declarations, and literal `changeState`/`selfState` targets.
- **Find All References** searches every indexed ZSS file for matching
  function calls, map access, variable access, and supported state targets.
- **Rename Symbol** is deliberately limited to authored functions and map
  names, where the parser can identify every replacement range. VS Code shows
  its normal preview before changes are applied.

The index is invalidated as files change and reuses parsed records between
navigation requests. Native controllers and triggers are never offered as
rename targets.

## Create a character from nothing

Use **IKEMEN: Create New Character** when no character files exist yet. First
choose either a MUGEN-compatible CNS character or a native IKEMEN 1.0 ZSS
character. MUGEN creation then offers SFF 2.0 for strict MUGEN 1.0 support or
SFF 2.1 for MUGEN 1.1. Native IKEMEN creation always uses SFF 2.1 because a
lower format provides no authoring benefit there. Then choose the destination DEF, display name, and an explicit
scaffold style before anything is written. The currently selected experience
recommends a style but never silently chooses it. **Guided starter** includes a
clearly labeled X / State 200 teaching example. **Clean baseline** creates the
same engine-appropriate ownership boundaries without an example attack. The
pre-creation review lists every file and the required SFF, AIR, coordinate,
constants, command/state, common-file, and sound follow-up work. The starter
creates:

- MUGEN: DEF, constants CNS, state CNS, CMD, AIR, explicitly selected SFF 2.0
  or 2.1, and SND files;
- IKEMEN: DEF, constants CNS, ZSS, CMD with D/W support, movelist, AIR, SFF 2.1,
  and SND files;
- a short character-local review checklist;
- either the deliberately small teaching example or the explicitly selected
  clean baseline, without inventing a game system;
- an automatically registered character workbench.

Creation is all-or-nothing. Any existing target blocks the entire operation,
no file is overwritten, and a mid-write failure removes only files created by
that attempt. The blank SFF intentionally contains no placeholder artwork.
The creator verifies `data/common1.cns` for MUGEN or
`data/common1.cns.zss` plus `data/common.cmd` for IKEMEN. If they are missing,
it can populate the missing set from another installation of the matching
engine; it never fabricates incomplete common states or overwrites existing
commons. Explanatory IKEMEN-only constant comments are added only to newly
generated constants and never injected into user-created files.

Lua cards show a deliberately conservative rollback boundary:

- **Front-end / presentation** for identifiable motif, screenpack, menu,
  options, selection, and pre-match module work.
- **Review timing** where the execution phase cannot be inferred.
- **Rollback unsafe** for apparent match-time input or gameplay ownership.

This is guidance rather than a safety proof. Menus and screenpacks may use
project-owned Lua modules, but rollback-relevant input, movement, collision,
damage, meter, and state behavior belongs in native deterministic systems.
Do not edit IKEMEN's default Lua files for a project module.

## Character Production Workflow

Use **IKEMEN: Open Production Workflow** from a character DEF, the IKEMEN
Toolbox, or the character's saved Workbench. A reusable JNP production
foundation owns the common assets/code/QA/evidence/signoff process. Separate
SF, DS vs SF, DS4 / Vampire Soldier, and HDBZ profiles own game policy. HDBZ
shares the foundation but remains outside the three-game Capcom shell.

The versioned **First Grounded Light Normal** block captures the full learning
and signoff path established with the first reference character without making
that character's mechanics universal. **Profile tools…** can duplicate a
profile, inherit from another profile, import a reusable block, or export a
phase as a project block. This supports branching a workflow per game and
selectively carrying proven process improvements between them.

**Project Tickets** is a Jira-style Kanban board with parent epics, child
tickets, task checklists, assignments, discussion, testing, review, and
enforced completion dependencies. **My Next Tasks** shows unfinished profile
work that is unassigned or assigned to the configured team member.
**Character Workflow** shows the reusable character-production path, while
**Responsibilities** groups that profile work by discipline. Every profile
step can retain an assignee, status, note, and evidence reference.

Project tickets live in `.ikemen/workflows/team-board.json`. Pasted reports
enter a reviewable Report Intake queue; the extension preserves the source
text and does not invent classifications. Reviewers accept a report as a
typed ticket or reject it with a retained reason. Epics such as `Build All Characters`
cannot close until their required child tickets are complete, and tickets with
task checklists cannot close while tasks remain unchecked.

The same project data includes an active/inactive Team Directory with Animator,
CS, Coder, Voice, Sound, QA, Director, Stage, Screenpack, and Palette roles.
Ticket creators and assignees become watchers; comments notify watchers and
support both `@person` and `@role` mentions through My Inbox. No private
operating-system account name is used as a workflow identity.

Automatic checks only report `DETECTED`, `MISSING`, or a warning. They never
mark work passed. Project profiles can inherit bundled profiles and import
versioned blocks without copying the whole checklist. Removed IDs retain
their progress as orphaned history and recover it if the ID returns. Open the
bundled **Production Workflow Guide** for the profile format and scope rules.

## Roster Manager and Character Select preview

Open `select.def` with **IKEMEN: Open Visual select.def Editor** to use the
Safe Mode Roster Manager. Its roster page resolves the active motif and renders
the motif's local coordinates, SelectBG layers, rows, columns, cell size,
spacing, cell background, random-select artwork, and configured character
portrait sprite/scale/offset. It also honors per-cell `cell.<col>-<row>.skip`
rules (including wildcard rules) and loads `defname_preload.sff` portraits when
they are available, falling back to the character SFF when needed.

The roster workspace has a VSelect-style left inventory for Characters,
Arcade Order, Stages, and Excluded entries. Normal portraits support Ctrl/Shift
multi-selection and can be dragged between cells as a group. The preview holds the
new order until **Review & apply roster order** is confirmed. Applying changes
only normal character-line placement in `select.def`; comments, parameters,
custom sections, and protected slot blocks remain in place. The edit stays
unsaved and undoable until the normal Save command is used. Slot blocks are
shown as grouped locked cells because moving or flattening their members would
change slot semantics. Their members remain editable: create a slot from a
character, add an installed alternate, and set each member's `select`, `next`,
and `previous` commands without flattening the block.

The Roster Manager separates `exclude=1` characters from visible cells and
provides named choices for visible, hidden, locked, hidden-random, and excluded
behavior. Selected-character properties expose path, order, assigned stage,
and visibility, including bulk edits. Characters may be dropped onto arcade
order or exclusion lanes. Its Stages page can discover normal stage DEFs and
ZIP stage entries. It keeps the full motif select screen visible beside a
VSelect-style stage list: select one or several portraits and drag them onto a
stage, or drag a stage back onto the selected portraits. Assigned characters
are listed beneath each stage. When a dedicated stage portrait is unavailable,
the preview derives a clearly labeled static thumbnail from the stage background
and falls back to text when no safe image can be resolved.
The motif canvas renders both configured large portraits, supports mouse-wheel,
button, fit, and typed-percentage zoom, and keeps the motif's real coordinate
space rather than resizing portraits to arbitrary cells.
The header supplies Open Motif, Reload, Undo, Redo, Launch IKEMEN, Save, and
Show Code controls so the common VSelect-style workflow stays in one surface.
The persistent summary appears above navigation. The primary roster workspace
uses the familiar Characters, Arcade Order, Stages, and Excluded views in its
left inventory instead of duplicating them as top-level pages. Larger editing
cards remain available through a collapsed optional detailed-list view.
Options separates `select.def [Options]` matchmaking rules from the current
IKEMEN `save/config.ini`: its normal `[Options]` values are shown first and the
remaining engine, video, sound, input, arcade, netplay, and debug sections are
collapsible. Story authoring opens the dedicated Advanced Story and Dialogue
Builder instead of duplicating a partial Story tab inside the roster editor.
The Player Tools tab is the non-technical hub for launching IKEMEN, installing
characters or stages, importing palettes, assigning stages and arcade orders,
editing player menu modes, opening story/dialogue tools, and reaching options.
Portrait, stage-preview, and layout routes are grouped there as guided visual
asset tools. Custom and unknown `select.def` records remain under the clearly
marked Creator / Raw Data page.

The separate Character Select Layout Builder remains the advanced place to
change motif grid or presentation values. Safe Mode never writes the motif.
Missing or unreadable portraits are labeled instead of replaced with invented
artwork.

## Native Menu & Modes editor

Use **IKEMEN: Open Player Menu & Mode Recipes** for the small, player-facing
surface or **IKEMEN: Open Complete Menu & Modes Editor** for creator access.
Both views read the same `system.def` and `select.def`; Player Mode limits the
presentation, while Creator Mode retains the complete menu tree, built-in
action catalog, native submenus, source navigation, mode orders, and roster
length settings.

The editor verifies built-in leaf actions against the current game's
`external/script/main.lua` when available. Screenpack `menu.itemname.*`
structure and flexible submenus are treated as native IKEMEN 1.0 features.
Mode-specific `order<gamemode>` and `<gamemode>.maxmatches` are likewise
treated as native `select.def` configuration. Only a leaf whose behavior is
absent from the installed action table is identified as requiring an external
module.

The **Fight Everyone** recipe preserves Arcade by repurposing the native Time
Attack action and writes a finite `timeattack.maxmatches` list calculated from
the current positive roster orders. It previews the exact order counts and
requires confirmation. Keeping both Time Attack and Fight Everyone as separate
leaf actions requires a small alias module; the editor states that boundary
rather than pretending a display label implements a mode. Boss Rush is
identified as an official external-module mode.

For players who only want to install characters, **Add installed characters…**
scans the active game's `chars` folder and presents a searchable multi-select
list. It inserts only the chosen DEF references into `[Characters]`; character
files and the motif are untouched. Existing motif-backed portrait dragging
then handles visual reordering without requiring the user to learn line syntax.

## Sprite and palette import assistant

Use **IKEMEN: Open Sprite & Palette Import Assistant** before bringing new PNG
sprites into an SFF. The assistant reports image dimensions, indexed versus
true-color storage, transparent palette index, and whether the selected set
shares one palette. A set is marked ready only when every PNG is indexed,
transparent color 0 is preserved, and one palette is shared.

The assistant never quantizes, remaps, or overwrites source artwork. True-color
sprites and mismatched palettes are sent back for explicit artist review, then
the existing SFF manifest/import workspace remains the reviewed write path.

Safe Roster Mode also has a **Palettes** inventory. Open ACT files or indexed
PNGs there, then drag a color card onto a character portrait. Choose only the
color number: IKEMaker automatically detects whether it is replacing an
existing slot or preparing a new one. Existing colors receive a before/after
character preview plus an exact replacement summary before any write. Empty
color numbers receive the same visual preview and are prepared as a pending
safe update; the character SFF remains unchanged until the update is finished.
Technical rebuild choices stay out of Player Mode and remain available in the
SFF creator workspace when inspection is needed.

## JNP move constants editor

Use **IKEMEN: Open JNP Move Constants Editor** on a character DEF to edit the
existing `normal.*`, `special.*`, and `hyper.*` constants visually. The first
schema is based on the completed standing-light-punch workflow and includes
classification, move identity, active/recovery elements, damage, hit/guard
timing, counter and punish-counter behavior, and hit-spark position.

The center canvas uses the character's assigned default palette and matching
AIR action. Its timeline separates startup, authored active window, and
recovery. A darker same-character P2 preview compares normal hit, Counter Hit,
and Punish Counter values while showing the estimated spark position. The
preview is deliberately advisory: **Live Training Preview** remains authoritative
for state behavior, physics, project systems, and exact reactions.

Only constants already present in the character are offered or changed. Each
value is applied as one normal, undoable text edit and is not automatically
saved. Missing classifications are never invented silently, which lets this
workspace expand move by move as JNP reviews the shared constants standard.

## Offline documentation library

The extension bundles readable guidance for Lua/online boundaries, the visual
workspace, and native command timing. **IKEMEN: Open Offline Documentation
Library** works without network access. The existing upstream documentation
scanner can offer **Update Offline Library**, which downloads official wiki and
IKEMEN 1.0 documentation into VS Code extension storage only after explicit
confirmation. Update checks never overwrite these copies automatically and
never modify game source code.

## Native command presets from the HDBZ parser handoff

The Command & Movelist workspace now separates **Simple Native** presets from
**Advanced Normalized** recognizers. Paired native QCF/QCB/DP/reverse-DP
definitions cover held-direction release windows without maps. Capcom B-F and
Down-Up charge examples use IKEMEN 1.0 native syntax. Optional-diagonal HCF/HCB and
360/720 timing remains an advanced deterministic ZSS/map case and is presented
as a reviewed skeleton instead of being misrepresented as an ordinary command.

## AIR code and visual workspace

Opening an AIR file now keeps its text editor visible and automatically opens
an SFF-backed visual companion beside it. The companion reads unsaved editor
changes, retains the editable AIR source as the authority, and provides an
action list, frame thumbnails, playback, LoopStart behavior, AIR offsets,
horizontal/vertical flips, palette preview, and four configurable layer banks.
Playback is stopped by default. Decoded sprite and layer images are cached and
swapped as one completed frame, preventing blank flashes between elements.

The canvas shares the SFF workspace's fit, 100%, zoom slider, mouse-wheel zoom,
drag panning, directional panning, grid/background, and front/behind axis
controls. **Go to frame code** and the collision-source buttons return directly
to the corresponding AIR line.

Effective Clsn1 and Clsn2 boxes are shown per animation element. Element Clsn1
is red, Clsn1Default is yellow, element Clsn2 is blue, and Clsn2Default is
purple. Each overlay and translucent fill can be toggled independently. The
inspector also reports whether each effective set came from the current element
or a default block and retains access to the existing batch-Clsn2 and hit-region
tools. Set `ikemenZss.airAutoOpenWorkspace` to false if a project should open
the companion only through **AIR: Open Animation & Layer Preview**.

The collision inspector can edit either the current element block or its
effective default block. Boxes can be drawn on the canvas, selected, moved,
corner-resized, changed through exact coordinate fields, or deleted. Changes
remain a preview until **Apply to AIR** is pressed. Default edits receive an
additional broad-impact confirmation; applied edits update the open AIR text
document without automatically saving it. **Revert** abandons the visual edit,
and navigation is blocked while an unapplied box edit exists.

Visible boxes no longer require an Edit command. Click a box to target it,
click the same overlapping area repeatedly to cycle nested boxes, and hold
Shift while clicking to build or reduce a multi-box selection. Dragging the
interior moves every selected box together; corner handles resize the primary
box.

The **Push** tab displays IKEMEN's native Size push rectangle in green. Baseline
editing targets `stand.sizebox`, `crouch.sizebox`, `air.sizebox`, or
`down.sizebox` in the character constants resolved through its DEF file. A
per-frame exception is stored in a character-path-scoped authoring plan under
`.ikemen-tools/air-pushboxes/`, never as invented AIR syntax. The plan can copy
an `OverrideClsn` controller using `group: Size` for reviewed placement in the
owning state or update hook. This preserves the distinction between AIR Clsn
geometry, native constant Size boxes, and runtime push-box overrides.

## SFF sprite workspace

The browser uses an ultrawide-friendly five-pane workspace: Groups and Sprites
on the left, the sprite canvas in the center, and Inspector plus SFF Tools on
the right. The L1/L2/R1/R2 toolbar buttons independently collapse those four
side panes. Dragged widths and pane visibility are retained by the viewer;
secondary panes automatically yield space on narrower displays.

Use **SFF and Sprites → Open SFF Sprite Browser** or right-click an `.sff` in
the Explorer. The browser opens SFF v2.x archives directly without extracting
their contents. It lists sprites by group and image number, decodes only the
selected image, draws its axis against a fixed crosshair, identifies linked
images and palette indices, and lists references found in neighboring AIR
files.

Sprite, Display, and Animations tabs keep the interface compact. The viewer
also provides previous/next navigation, fit and zoom controls, persistent
mouse-drag camera panning, and optional axis, grid, transparency-color, and
previous-sprite onion-skin displays.

The **Palettes** inspector tab lists embedded SFF palettes, resolves linked
palette data, displays all 256 indexed colors, and can apply an embedded or
imported ACT palette to the sprite, onion-skin, and layer preview without
modifying the archive. The displayed palette can be exported as a 768-byte ACT
file. **Compare ACT** reports exactly how many RGB indices differ before any
write. **Replace from ACT** validates that the selected palette owns a complete
256-color table, blocks linked-palette writes, preserves SFF alpha values, and
creates a timestamped backup when backups are enabled.

The displayed or edited colors can also be exported as a Photoshop ACO file
for the Swatches panel and as a 16 × 16 PNG grid containing all 256 indices.
**Export Artist Palette Pack** creates the complete handoff in one selected
folder: ACT for IKEMEN and Photoshop, a named Photoshop ACO, an ordered RGBA
GPL palette for Aseprite, the PNG swatch grid, and a short index-contract
README. The Aseprite file preserves alpha and explicitly identifies index 0 as
the transparency slot. None of these exports sort, merge, or deduplicate colors.

Click any palette swatch to edit that exact index with a color picker or numeric
RGB fields while previewing the result on the sprite, onion skin, and layers.
**Reset Color Edits** reloads the stored palette. **Save Color Edits** reports
the number of changed indices and requires confirmation before replacing only
that palette's RGB table. Mouse-wheel zoom remains anchored near the cursor.

**Assign to Sprites** applies the selected embedded palette to the current
indexed sprite, the marked multi-selection, the current group, or every indexed
sprite. It changes only the SFF palette-index field in affected sprite headers,
shows the exact count before writing, and follows the backup preference. Under
the JNP profile, `1,0` remains reserved for group `59000` palette-template
sprites and broad player-palette assignments skip those protected templates.

The **Project Palette Library** remembers a workspace-folder-specific palette
directory, including ACT and indexed PNG files in its subfolders. Indexed PNG
palettes are read directly from their `PLTE`/`tRNS` tables without rendering or
reindexing the image. Library palettes can be previewed on the sprite or
compared with the selected embedded palette without writing. Replacement still
goes through **Save Color Edits**, preserving the same confirmation, backup,
linked-palette, alpha, and protected-master checks.

SFF and AIR previews resolve their initial display palette from the character
DEF `pal.defaults` list. The first available default (normally `1,1`) is used
for sprites, thumbnails, animation strips, onion skin, and layer previews even
when a sprite header is assigned to a different construction palette. Preview
settings are non-destructive. A user may remember a different palette for the
SFF screen, remember another for the AIR screen, or override an individual
sprite group across both screens. These choices are stored in
`.ikemen-tools/palette-preview.json`; they do not change SFF palette indices.

The IKEMaker sidebar and command palette include **Create New SFF 2.1**,
**Create New AIR**, and **Create New SND**. Blank SFF and SND files use valid
empty archive headers and open directly in their visual workspaces. A new AIR
opens as editable code and automatically gains visual preview when its nearby
character DEF identifies an SFF.

The **PalFX Editor** includes a separate **True-Color FX Composer** for 32-bit
character effects. It keeps the original single-PalFX preset workflow, while
adding one base effect plus up to four overlay clones with independent PalFX,
animation, Explod ID offset, sprite priority, blend mode, and alpha. A PNG can
be loaded for an approximate composite preview. Profiles persist per workspace
and can generate an Explod stack, a selected-layer ModifyExplod block, or a
normalized runtime JSON record. IKEMEN remains the final blend/alpha authority.
Each profile can declare its Character Options placement: Character Color,
Color Variant, or FX Color; parent color; default full-selector visibility;
and stable ordering. These are creator defaults. FX and user-created colors do
not enter Classic Quick Select; player visibility, Favorites, and Weighted
preferences remain separate Character Options data.
The future player-facing implementation contract is recorded in
`data/True-Color-In-Game-Color-Editor-Spec.md`.

The Roster Manager renders motif SelectBG layers on both sides of the character
grid, static cell artwork, and representative visible frames from animated
motif definitions. It preserves the motif local-coordinate aspect ratio while
fitting and zooming, applies character portrait-resolution compensation, and
provides persistent Names and Numbers display toggles for an unobstructed
small-portrait view.

**Stage as New Palette** assigns a new explicit group/number to a library file
for the next palette-preserving SprMaker2 rebuild. The external build plan keeps
the source path and SHA-256 fingerprint, rejects IDs already embedded or staged,
and refuses the build if an approved source changes. **Review Staged** can remove
an entry without deleting its source file. Staging never rewrites the current
SFF; the new palette enters the archive only through the reviewed rebuild.

**Stage as Child Variant** records the selected embedded color as the parent
while assigning the library palette its own stable SFF coordinate. Palette
library folders are scanned recursively, so each base color may have as many
community variants as required. Variant relationships are metadata rather than
being inferred from a filename or a fixed-size numeric block. `1,1` is labeled
as the P1 default and `1,2` as the P2 default.

**Stage Linked Alias** creates a required destination such as `2,1 -> 1,1` for
the next rebuild. **Fill Transform Slots** adds every missing form coordinate
in the selected character, layer, or projectile/FX bank. Generated SprMaker2
definitions set `pal.detectduplicates = 1` and `pal.discardduplicates = 0` so
the coordinate remains present for `RemapPal` while identical color data is
linked instead of maintained as independent copies.

The recommended source library keeps every authored color in `Base`; a form
folder contains only palettes that visibly change in that form. Unchanged form
colors do not need duplicate PNGs. After review, their required SFF coordinates
are linked to the base palette. Duplicate images remain supported for legacy
Fighter Factory importing, but are not required. A missing form image by itself
is unresolved or unavailable and is never silently linked.
For the new IKEMEN workflow, every palette coordinate requested by gameplay
must be present as independent colors or a linked alias; missing-palette debug
messages are not considered an acceptable completed state. Older HDBZ folders
may intentionally be incomplete because that workflow later tolerated them.

The SFF palette panel also maintains **User-Created Palettes** as player-owned
save data. Named saves live at
`save/palettes/<character-id>/<palette-id>/palette.act` with a versioned
`palette.json` record; they never enter the authoritative project palette
library or SFF build plan automatically. **Deploy to Game** copies a selected
save into an explicitly configured character-DEF runtime ACT slot. Existing
CVSQ-style entries such as `pal7 = colors/custom.act` are detected and can be
preserved with **Import Runtime Slot**, but no palette number is globally
reserved or silently replaced. See `data/User-Created-Palette-Standard.md`.

**Audit Palette Setup** checks duplicate IDs, broken palette links, and missing
sprite palette assignments for every project. When the optional JNP naming
profile is active, it also verifies the protected `1,0` full-CS palette,
default `1,1` gameplay assignment, and uncropped `59000,0` master-template
contract. JNP `1,0` is deliberately immutable in the direct replacement UI;
turning the profile off removes project-specific policy without disabling the
native SFF safety checks.

**Protect Selected as Master** creates an immutable project-side
`master-palette.json` and `master-palette.act` under
`.ikemen-tools/palette-masters/`. The record preserves all 256 RGBA colors and
fingerprints every indexed sprite's encoded image data and palette assignment.
Later comparisons report changed colors, missing protected sprites, altered
index data, changed palette assignments, and newly added indexed sprites. An
existing master is never silently overwritten.

Image payloads remain read-only in the browser. Axis adjustments can be saved
directly with backups; structural sprite changes use the reviewed manifest and
SprMaker2 rebuild path. SFF v1 preview and broader direct archive editing remain
later phases.

## SND archive workspace and native split profiles

Open an `.snd` file directly or choose **SND and Sound Profiles → Open SND
Archive Workspace**. The workspace reads the archive without extracting it,
groups entries by sound group, shows duration and PCM format, draws a waveform,
and plays the selected entry. Selection, marks, loop, and volume are retained.
Single sounds or a marked batch can be exported as WAV, and a configured audio
editor such as Audacity can be launched on an extracted working copy.

The portable `.ikemen-sound-profile.json` beside a character describes separate
character-FX, language voice, custom voice, shared-FX, or legacy archives. It
stores relative paths, globally safe character-qualified CommonFX prefixes, and
function-oriented event names. The viewer can assign the loaded archive to a
profile slot, name events, generate one or every native CommonFX DEF, copy the
character DEF `fx = ...` line, and copy a native prefixed call such as:

```zss
playSnd{value: RYUEN200, 0}
```

Prefixes attach directly to the group number. The extension never generates a
combined fallback archive: character effects and each selectable voice remain
independent, avoiding duplicate sounds and preserving language replacement.
Runtime selection stays in native IKEMEN/CommonFX code rather than Lua so it can
be used by rollback-safe game logic.

**Audit Split Archive Contract** checks that every default voice event exists in
alternate voice packs, identifies extra or unnamed entries, and reports missing
archives. **Scan Character Sound References** lists prefixed, ordinary `S`, and
unprefixed PlaySnd/HitSound/GuardSound calls in the character source area.

Structural SND edits are manifest-driven. Add, replace, and remove operations
update the readable SndMaker input named by the profile's `buildManifest` field;
the loaded archive remains untouched until **Rebuild with SndMaker** is
confirmed. Inputs are checked for duplicate identities and missing WAV files,
existing outputs are optionally backed up, and the rebuilt archive is reloaded.
**Create Build Workspace from SND** bootstraps that workflow from an existing
archive by exporting its sounds into `.ikemen-tools/sound-build/<archive>/wav`,
writing the manifest, and recording its portable relative path in the profile.
The Windows extension includes SndMaker and finds it automatically. Configure
`ikemenZss.sndMakerPath` only to override the bundled or project-local copy.
`ikemenZss.audioEditorPath` and `ikemenZss.sndCreateBackups` remain available in
extension settings.

## Offline Windows installation

The Windows offline ZIP is the simplest distribution for players and creators:

1. Extract the entire ZIP.
2. Double-click **Install IKEMEN Creator Tools.cmd**.
3. Restart Visual Studio Code if it was already open.

The VSIX contains SprMaker2 and SndMaker, so SFF and SND building needs no
separate download, internet connection, or path configuration after install.
Project-local copies and explicitly configured absolute paths remain supported
as overrides. **IKEMEN: Show Bundled Build Toolchain** reports whether both
packaged builders are ready.

The package deliberately excludes `MUGEN.exe`, IKEMEN GO, games, characters,
stages, screenpacks, and commercial assets. Browser and mobile VS Code hosts
continue to disable native Windows builders and clearly report that limitation.

## Mobile and browser compatibility foundation

The extension has separate desktop (`main`) and browser (`browser`) activation
entries. The browser entry is self-contained and uses only the VS Code API; it
does not import Node filesystem, path, process, or child-process modules.
Language grammars and snippets therefore remain available in browser-hosted VS
Code, along with platform reporting and the mobile documentation. The browser
entry now also loads the bundled controller, trigger, and Lua API catalogs
through VS Code's virtual filesystem. It supplies portable controller browsing,
filtering, required-field completion, reviewed insertion, ZSS/CNS/Lua symbol
completion and hover descriptions, a read-only text structure report, and a
clearly labeled lightweight current-file ZSS review.

Use **IKEMEN: Show Platform Capabilities** to see what the active host has
actually enabled. **IKEMEN: Open Android / iPhone Feature Matrix** opens the
printable contract stored in `data/mobile-platform-feature-matrix.md`. Native
builders, external desktop editors, and IKEMEN process launch are capability
gated. Android code-server/Node hosts are detected separately from ordinary
Linux desktops through their Android or Termux environment markers.

The browser entry currently supplies explicit unchanged-archive placeholders
for SFF and SND custom editors while their binary adapters are migrated to the
VS Code virtual-filesystem API. Browser capability reporting therefore marks
archive parsing unavailable. It never presents those placeholders as working
archive editors. Every other contributed command is either implemented in the
browser entry or reports why it is unavailable instead of producing a missing
command or attempting a Windows executable.

This foundation intentionally does not bundle Windows `.exe` files for mobile.
Portable JavaScript SFF/SND writers and an Android APK intent bridge remain
separate future implementations that must be tested before their capability
flags can be enabled. The complete Windows desktop workflow remains unchanged.

## Character requirements and SFF review

The IKEMEN sidebar now includes a manifest-driven character requirements audit.
Use **SFF and Sprites → Open Character Requirements Profile** to create the
workspace file `.ikemen-character-requirements.json`.

The profile supports:

- required sprite group/index pairs;
- required AIR action numbers;
- project-defined axis-reference copies, including a feet-axis convention;
- temporary or unassigned group ranges;
- explicit intentional omissions.

Project-specific SFF build and animation profiles live under
`.ikemen/profiles/sff`. SF6, DS vs. SF, DS4, and HDBZ therefore maintain
independent required/custom animation lists and confirmed exceptions without
requiring a network connection or AI. Use **SFF: Open Project Build and
Animation Profile** to edit one.

Standard get-hit source frames use power-of-10 image indices by default:
source frame `0,1,2,3` becomes SFF index `0,10,20,30`. Use **SFF: Apply Project
Get-Hit Indexing** to preview and write those changes to a manifest. Changed
rows return to `REVIEW`; the extension will not silently alter an approved
identity while building. A project profile may disable the rule, exclude a
confirmed sequence, or provide an explicit per-frame exception table.

**Audit Character Requirements** compares an approved CSV manifest with an AIR
file and writes `IKEMEN_character_requirements_audit.md` beside the manifest.
It reports missing requirements, empty required actions, AIR references absent
from the manifest, unassigned sprites, and missing axis-reference copies.

New profiles enable a shared animation-standard registry. The conservative
IKEMEN 1.0 baseline is checked in AIR files and appears as a warning in the
Problems panel when required actions are missing. JNP's feet, middle, and head
get-hit reference copies are a separate project-level set. Enter their exact
source and target group/index mappings in `axisCopies`; the extension flags
unmapped roles and does not invent sprite assignments.

Use **ZSS and CNS → Install Authoring Bridge into Character** to copy and link
the neutral `ikemen_tools_authoring_bridge.zss` module. It is disabled by
default, runs only in training mode, and provides opt-in preview placement plus
an in-game baseline animation audit. **Open Animation Standards Registry**
shows the shared standard list.

**Review Unassigned Sprites** moves a complete named sequence to a reviewed base
group. It first backs up the manifest and marks moved rows `REVIEW`; it does not
edit an SFF directly. **Create Missing Axis Copies** similarly creates proposed
manifest rows that share the source image and require axis review before they
can enter an approved build.

Example axis-copy entry:

```json
{
  "sourceGroup": 5000,
  "sourceIndex": 0,
  "targetGroup": 5000,
  "targetIndex": 10,
  "label": "Middle axis",
  "offsetX": 0,
  "offsetY": 24
}
```

Exact group/index assignments remain project decisions. The extension does not
silently invent classifications or promote recommendations to requirements.

Local VS Code language support focused on navigating large IKEMEN GO character
projects over the long term.

## Features

- Recognizes `.zss` as IKEMEN Zantei State Script.
- Adds StateDefs and Functions to VS Code **Outline** and breadcrumbs.
- Adds a dedicated **ZSS Navigator** to the Explorer sidebar.
- Shows the active file immediately and optionally indexes all workspace ZSS files.
- Clicking a state or function jumps to its declaration.
- Folds complete StateDef and Function sections.
- Provides syntax highlighting and starter snippets.
- Supports numeric, negative, expression-based, and multi-line StateDefs.
- Uses the nearest descriptive `#` comment as the state/function name.
- Provides a **ZSS State Controllers** sidebar containing 155 controllers.
- Groups controllers as IKEMEN New, Changed/Expanded, or MUGEN Compatible.
- Clicking a controller inserts clean native ZSS with its options commented out.
- Filters by controller name, description, classification, or parameter name.
- Links each controller to its merged documentation section.
- Maintains a workspace **JNP Data / ID Registry** for maps, variables,
  functions, states, and helper/explod/projectile IDs.
- Audits frame and entity safety for Single, Simul, Tag, and Turns code.
- Checks custom-state synchronization, redirected writes, function order and
  arguments, loop progress, and project namespaces.
- Advises when `time = 0` in a negative StateDef may depend on processing order,
  while recognizing standard engine/common-state checks and the explicit
  `# @time-zero engine` contract annotation.
- Generates one-tick guard-proximity helper animations from the first effective
  `Clsn1` in an AIR action.
- Creates regeneration-safe managed ZSS blocks containing a shared invisible
  `ClsnProxy` helper state and a move-specific spawn function.
- Cross-checks each inferred `*.firstActiveElement` constant against the first
  effective Clsn1 element in the move's AIR action.
- Generates and builds uncropped SFF v2.1 packages from reviewed sprite
  manifests, with explicit layer matching and recoverable redundancy cleanup.
- Opens stage, screenpack, and fight/lifebar DEF files in type-aware visual
  workspaces without modifying IKEMEN's default files.
- Previews stage layers, camera bounds, starts, clipping windows, tiled art,
  embedded-animation first frames, camera/zoom sweeps, and parallax coverage.
- Previews screenpack and fight UI layers at their authored local coordinates,
  including safe-area guides, parent-relative offsets, clipping windows,
  mirrored P1/P2 layouts, and optional editor-only sample data.
- Generates optional project-owned stage interaction characters and optional
  character UI bridges using native IKEMEN 1.0 stage and fight-screen interfaces.

## Stage and screenpack development

Right-click a `.def` file and choose **IKEMEN: Open Visual DEF Workspace**. The
extension inspects the file first and opens the appropriate workspace:

- The **Stage Workspace** shows layers -1 through 1, camera positions and zoom
  extremes, floor and player-start guides, BG IDs, controller `sctrlid` values,
  round-stage references, attached-character links, and validation findings.
  Parallax elements include a camera/zoom coverage estimate. Because the engine
  owns the final perspective calculation, the estimate is explicitly labeled
  as an authoring aid and should be confirmed in IKEMEN.
- **Stage Rig** launches that stage with two invisible development characters.
  Directions move P1, `D` + directions moves only P2, and `W` + directions
  moves both with P2 reversed. Fine/fast travel, separate resets, stress
  presets, automatic sweeps, coordinate locks, markers, native pause/frame
  advance, and an honest BGCtrl schedule estimate support deeper diagnosis.
  A complete three-line control guide appears at the bottom of the game screen.
  `B+C` hides or restores measurements and BGCtrl notices; `Y+Z` independently
  hides or restores the button guide. Choose visibility before native debug
  Pause, which freezes player processing. The selected visibility remains in
  the paused frame.
  The Stage Workspace adds matching camera presets, timeline scrubbing, and
  session-only A/B captures without saving camera bookmarks. The generated rig
  is development-only and is excluded from public-copy builds.
- The **Screenpack / Fight UI Workspace** groups visual sections by purpose,
  shows layers -1 through 2, local-coordinate and aspect-safe guides, resolves
  parent anchors, and supports reviewed position edits while preserving whether
  the source used `pos` or `offset`.

Both workspaces keep edits in preview until the user explicitly applies a
reviewed value. Their panels survive ordinary editor-tab switching and restore
with VS Code's saved window state. Use **Create Optional UI Preview Profile**
for names, life, meter, score, timer, combo, and team examples that exist only
in the editor. These profiles do not impose character metadata or runtime code.

Both workspaces also provide offline, collapsible task recipes. Stage guidance
walks through coordinate space, camera proofing, BG ownership, and motion-based
parallax review. Screenpack guidance walks through owning files/sections,
localcoord, `pos` versus `offset`, representative preview data, and the Lua
presentation boundary. Learning opens these recipes by default; Advanced keeps
the identical reference available in a collapsed section.

**Create Project-Owned Stage Interaction Helper** creates a separate attached
character beside the stage and can add the stage's `AttachedChar` entry after
review. **Generate Optional Character UI Bridge** uses native `FightScreenVar`
and `LifebarAction` calls and retains ordinary fight-screen behavior when the
optional UI is absent. Match-time behavior must remain deterministic; Lua is
not used for rollback-sensitive stage or UI state.

The visual workspaces intentionally do not claim exact runtime simulation for
3D models, shader output, complete animation playback, fonts, or engine camera
internals. They expose authored data and likely errors, then leave final visual
and rollback verification to the configured IKEMEN 1.0 runtime.

## SFF build workflow

Use the Command Palette commands under **SFF**:

- **Open Naming & Classification Standard** opens the bundled artist/coder
  naming guide, alias table, Special families, compact Hyper allocation, and
  Honda multipart-move example.
- **Generate SprMaker2 Build Files from Approved Manifest** validates an
  approved CSV manifest, enforces the selected project's get-hit index policy,
  verifies every source hash, stages the PNGs without
  altering them, and writes `sprmake2.def`, a build command file, mapping CSV,
  selected-profile snapshot, and validation report. Development builds keep
  autocrop disabled. The generated `sprmake2.def` remains directly editable
  through **SFF: Open SprMaker2 Build Text** for users who prefer text.
- **Build Approved Manifest with SprMaker2** performs the same validation and
  then runs the configured SprMaker2 executable.

The SND workspace likewise keeps its ordinary SndMaker `build.txt` editable.
Use **SND: Open SndMaker Build Text** to open any standalone legacy build text,
or use the guided sound-profile shell to locate and validate its assigned
manifest.
- **Import Layer Folder into Manifest** accepts an exact `Layer1` through
  `Layer4` folder or asks which layer an explicitly selected folder represents.
  Files must match a unique base sprite name and inherit its group, index, and
  axis. Layer banks add 10000 to the base group for each layer. Intake also
  records `LayerRole`, `SuggestedSyncLayer`, and `LayerOwner`, keeping the SFF
  storage bank separate from artistic purpose and runtime draw order.
- **Review Redundant Layer Frames** lets you keep and dismiss a byte-identical
  warning, remove it from the build manifest, or move its source to a chosen
  recoverable backup before removal. Dismissals are tied to both file hashes;
  changed files reopen the warning.
- **Review Interaction Part Ordering** lists only unresolved front, back, and
  mixed parts. A coder selects the visually confirmed P1/P2/helper/projectile
  owner and front/back order. The tool records that human decision and creates
  a manifest backup; it never infers throw composition or generates throw code.
- **Review / Reset Dismissed Layer Warnings** restores selected warnings for a
  fresh review.

PSD is preferred for multipart artist handoff. Name the complete body layer
`BASE`; use `COSMETIC 1`-`COSMETIC 4`, `PART FRONT`, and `PART BACK` for aligned
pieces, and put `PART` in the PSD filename when interaction parts exist.
Equivalent exported folders use the same role names and exact base filenames.
IKEMEN `Explod` `syncid`/`synclayer` provides native owner-relative ordering;
throw parts intended relative to P2 remain an explicit coder review.

The extension never silently classifies an unresolved sprite. Only rows marked
`APPROVED` are eligible to build, and source-image cleanup is a separate,
confirmed operation with a manifest backup.

## Throw Creator

Use **Character Authoring → Open Throw Creator** for a dedicated two-character
throw workspace. It combines P1 and P2 AIR tracks on a real-tick timeline,
supports independent or P1-matched timing, draggable bind keyframes, facing,
handoff and interaction events, and explicit runtime-part lanes. Clsn1/Clsn2
and independent P1/P2/part onion skins are available on the shared canvas.

Plans are saved beside the character under `.ikemen-tools/throw-plans` and keep
source hashes. Timing changes are proposed before a confirmed, backed-up AIR
edit. ZSS output opens as a reviewed scaffold or saves to a new file; it is
never silently inserted into an existing StateDef. The six starting templates
cover stationary, command, running, air, wall-slam, and multipart cinematic
throws without making their values mandatory.

The approved future two-character throw-authoring workflow and the neutral,
optional game-side authoring bridge are specified in
`data/throw-authoring-and-live-preview-bridge.md`. The bridge is extension
integration rather than JNP gameplay code, uses its own `IkTools_Preview_`
namespace, remains local-training-only, and does not modify default IKEMEN Lua
or common files.

Hyper validation follows the shared project standard: animation families mirror
Special families at `special +2000`, classified blocks occupy `3000-4399`,
grounded sequences advance by ten, matching air versions use `+50`, and
`4400-4999` is reviewed Hyper animation overflow. Hyper StateDefs separately
remain in `3000-3999`. Add a
`FunctionalFamily`, `MoveFamily`, or `ClassificationFamily` column when a
filename alias does not identify the family clearly.

## Guard-proximity helper generator

Open an AIR file, right-click its `[Begin Action xxx]` header, and choose
**AIR: Generate Guard-Proximity Helper…**. The command reads `xxx` directly
from that line. If it is run from another line, it asks for the source action
number as a fallback. Then confirm the custom constant that identifies the
move's first active element. The command:

- creates or refreshes action `900000 + source action`;
- copies the first effective `Clsn1` into a one-tick proxy animation;
- creates or updates managed helper code in `normal_helpers.zss` or a selected
  ZSS file; and
- copies the move's integration call to the clipboard.

Generated blocks are marked and can be regenerated safely. Load the selected
helper ZSS file from the character DEF once, then place the copied call in the
attack wrapper. The generator never inserts managed code at an arbitrary cursor
because that makes later regeneration and duplicate detection unreliable.

## Frame and entity safety audit

Diagnostics appear directly in the editor and in VS Code's Problems panel.
Run **ZSS: Audit Current File** from an editor context menu, or run **ZSS:
Audit Workspace for Frame and Entity Safety** from the Command Palette.

The audit identifies:

- `enemy`, `partner`, `target`, `helper`, and `parent` redirects without a
  nearby existence guard
- opponent reads without `numEnemy`
- literal `player(1)` through `player(8)` slots that can break in team modes
- partner logic without visible `teamMode` and `numPartner` checks
- cross-entity position, velocity, facing, and state writes
- `targetState` without `numTarget` or a documented custom-state contract
- loops with no obvious condition update or `break`, and redirected loops
- `RunFirst` and `RunLast` ordering overrides
- missing owned functions, argument mismatches, forward calls, and duplicate
  declarations
- owned maps/functions outside the configured project namespaces
- stale `firstActiveElement` constants after AIR startup or active-frame edits

The first-active-element check follows StateDef function calls to associate a
constant with its move number, then reads the first effective Clsn1 from the
AIR file beside that character's constants. It mirrors IKEMEN's handling of
duplicate action keys by inspecting the first definition. Diagnostics refresh
when a ZSS, CNS, or AIR file is saved.

Warnings are intentionally conservative. They identify an ownership, lifetime,
team-mode, or frame-order contract that should be explicit; they do not imply
that every advanced redirect is invalid.

An unqualified `time = 0` inside StateDef -1, -2, -3, or -4 receives an
informational processing-order advisory. Checks tied to a standard state number
from 0 through 199 or a `const(State...)` state are recognized automatically.
For another hardcoded engine feature confirmed by IKEMEN development, place
`# @time-zero engine` within eight lines above the expression. Use `time <= 1`
only when executing across a two-tick window is safe; use an explicit latch when
the operation must occur exactly once.

For custom states, the `customstatecontract` snippet inserts ownership notes.
Use a single position/facing owner. For same-tick information shared between
entities, prefer a GameTime-stamped, two-phase map handshake over relying on
which player processes first. The `synchandshake` snippet provides a starting
point. `RunFirst` and `RunLast` remain available for deliberate global
contracts, but should not be the first fix for an unsynchronized custom state.

## JNP Data / ID Registry

Expand **JNP Data / ID Registry** in Explorer to see project-wide map reads and
writes, vars/fvars/sysvars, function declarations and calls, StateDefs, and
resource IDs. Clicking an entry jumps to its first occurrence. Repeated
functions, states, or resource IDs receive a warning icon for review.

Prefix enforcement is disabled by default. Configure any number of allowed
namespaces with `ikemenZss.mapPrefixes` and `ikemenZss.functionPrefixes`.
An empty list means no prefix warnings. These are resource-scoped settings, so
each workspace or workspace folder can use its own project prefixes. Generated
helper names use the separately configurable `ikemenZss.generatedSymbolPrefix`.
Guard and hit-reaction generators can override that shared value with
`ikemenZss.guardHelperSymbolPrefix` and `ikemenZss.hitReactionSymbolPrefix`.
Static analysis cannot resolve every runtime name
or calculated ID, so dynamic systems should still keep an annotated ledger.

## Release and documentation monitor

The extension checks the latest official IKEMEN GO release metadata, the official
wiki, and the merged State Controller, Trigger, and Redirection documentation
after seven elapsed days while VS Code is open. The interval can be changed or
automatic checks can be disabled in Settings.

Run **IKEMEN: Check Release and Documentation Changes** for an immediate check,
or **IKEMEN: Show Last Upstream Update Report** to reopen the saved report.
Right-click a character `.def` file and choose **IKEMEN: Check Changes for This
DEF** to force the same upstream check while restricting migration
candidate searches to that DEF and its resolved `[Files]` entries, including
shared files outside the character directory.
The report identifies changed sources, added and removed/renamed feature
headings, and possible workspace uses that need migration review.

The State Controller documentation is also compared with the **ZSS State
Controllers** Explorer. When controller membership, classification, or
documentation links change, the extension offers a previewed update. Approved
catalogs are stored in extension storage and refresh the Explorer immediately.
Existing parameter templates are retained, and newly discovered controllers
are inserted with all parameters inactive. Character source is never rewritten
automatically; migration candidates require review and gameplay testing.

## Navigation

1. Open a `.zss` file.
2. Open Explorer and expand **ZSS Navigator**.
3. Expand `Current: filename.zss`.
4. Click a State or Function.

The built-in Outline view also works through **View: Open View... → Outline**.
Breadcrumbs can be enabled with **View → Appearance → Breadcrumbs**.

For the clearest labels, place a short descriptive comment immediately above a
declaration:

```zss
# Standing
[StateDef 0; type: S; movetype: I; physics: S;]
```

The navigator displays this as `State 0 — Standing`.

## State Controller insertion

1. Place the text cursor inside a ZSS state or function.
2. Expand **ZSS State Controllers** in Explorer.
3. Expand a compatibility group and click a controller.

For example, clicking `ChangeState` inserts:

```zss
changeState{
	# value: state_no; # required
	# ctrl: ctrl_flag;
	# anim: anim_no;
}
```

All options begin commented out so insertion cannot silently change gameplay.
Enable and edit only the parameters needed for that use. Use the filter icon in
the view title to search the controller catalog. Controller data was generated
from the [Ikemen GO Merged Documentation](https://potsmugen.github.io/ikemen-merged-docs/sctrl).

## Selection wrappers

Select one or more complete lines in a ZSS editor, then right-click and choose:

- **ZSS: Wrap with ignoreHitPause**
- **ZSS: Wrap with persistent…**
- **ZSS: Wrap with ignoreHitPause + persistent…**

The persistent commands ask for an interval. The extension expands a selection
to complete lines, preserves its base indentation, indents its contents one
level, and keeps the transformed block selected. With no selection, it inserts
an empty wrapper and places the caret inside.

Wrappers are applied separately because `persistent` and `ignoreHitPause` are
execution modifiers for logical code blocks, not fields inside an individual
state controller.

## AIR Clsn2 batch editor

AIR files use dedicated collision-box colors matching IKEMEN's debug display:

- Clsn1 hitbox identifiers are red.
- Clsn2 hurtbox identifiers are blue.

Select one complete `Clsn2` or `Clsn2Default` block in an `.air` file,
right-click in the editor, and choose **AIR: Batch Apply Selected Clsn2…**.
The selected rectangles are used directly; coordinate entry is no longer
required. The editor supports:

- Action-heading filters for all matching actions, headings containing
  `crouch`, or headings containing `jump`

- Action ranges: `0-19, 40-49, 100, 105`
- Range exclusions: `0-999 !200-299`
- One-based animation-element ranges: `all`, `1`, `1-3`, `1-10 !4`
- Multiple rectangles separated by semicolons
- Replace, append, per-element clear, action-wide clear, and `Clsn2Default`
- Optional coordinate normalization
- Structural preservation of `Clsn1` data
- Missing-action skips
- Diff preview before applying
- A single workspace edit, allowing one-step Undo

Example rectangle input:

```text
-13,-79,16,0; -7,-93,5,-79
```

The tool parses AIR action and animation-element boundaries rather than using
global regular-expression replacement.

## Visual AIR collision editor

The visual AIR phase will render the SFF sprite and the effective collision
data for the selected animation element. Authored collision overlays default
to visible; non-AIR diagnostic geometry defaults to hidden.

Initial color contract:

- `Clsn1`: red
- `Clsn2`: blue
- `Clsn1Default`: yellow
- `Clsn2Default`: purple
- effective IKEMEN player push/size box: green

Purple deliberately replaces Fighter Factory's green `Clsn2Default` display so
green remains unambiguous for IKEMEN's native `stand.sizebox`,
`crouch.sizebox`, `air.sizebox`, or `down.sizebox`. A legend and independently
configurable colors remain required. Defaults are source-aware editor colors;
they do not alter AIR syntax or runtime behavior.

The collision editor must support drawing a rectangle, dragging it, resizing
from handles, duplicating, deleting, and adding multiple boxes. It must expose
both explicit per-element boxes and inherited `Default` boxes without silently
converting one form into the other. Apply scope must be explicit: current box,
current element, selected elements, whole action, or default declaration.
Every write requires an exact text diff and must remain undoable.

Optional overlays, all disabled initially, will cover:

- effective player push/size geometry;
- effective runtime collision geometry produced by IKEMEN `OverrideClsn`;
- temporary `Width` and `Height` changes;
- `Depth` geometry where a project uses the Z axis;
- player and projectile guard-distance regions;
- stage/screen boundaries and character origin/axis guides.

`PlayerPush`, `SizePushOnly`, and throw/reversal collision modes are behaviors,
not additional authored AIR rectangles. The editor should describe their
effect and visualize the effective geometry when possible rather than inventing
new box syntax. Existing Clsn2 batch tools and semantic hit-region metadata
remain available alongside the visual editor.

### IKEMEN collision-aware presentation

The AIR viewer should distinguish three layers:

1. **Authored geometry** — literal `Clsn1`, `Clsn2`, and inherited default
   declarations from the AIR file.
2. **Effective geometry** — boxes after a statically resolvable IKEMEN
   controller or a captured runtime frame changes them.
3. **Interaction rules** — controllers and HitDef options that choose how boxes
   interact but do not create another rectangle.

Effective geometry keeps the semantic color of its box family while changing
its line treatment:

- AIR source box: solid line and faint fill.
- `OverrideClsn` replacement or appended box: dotted line, stronger fill, and
  an `OVR` badge. Effective Clsn1 remains red/orange, Clsn2 remains blue/cyan,
  and Size remains green/lime.
- `OverrideClsn` removal: ghosted source rectangle with a diagonal strike and
  a `REMOVED` badge.
- `TransformClsn` scale or rotation: solid source outline plus a dashed
  transformed outline, an origin marker, and the scale/angle values.
- `Width` or `Height`: dashed base Size box plus solid effective green box;
  changed edges receive an orange highlight.

The inspector should explain the following native features when they are found:

- `OverrideClsn`: target group (`Clsn1`, `Clsn2`, or `Size`), target index,
  whether the operation replaces, appends, removes one, removes all, or clears
  active overrides, and its resulting rectangle when resolvable.
- `TransformClsn`: effective scale and angle.
- `ClsnVar`: selected box coordinates (`Left`, `Top`, `Right`, `Bottom`) and a
  copyable trigger example for the selected index and animation element.
- `AnimElemVar(NumClsn1/NumClsn2)`: effective box counts for the selected AIR
  element.
- `ClsnOverlap` and `ProjClsnOverlap`: highlight the two participating box
  families and describe that these are overlap queries, not authored boxes.
- Helper `ClsnProxy`: draw proxy boxes with a dotted ownership connector to the
  parent and identify that contact affects the parent.
- Helper `OwnClsnScale`: show whether helper collision scaling uses the helper
  or root size constants.
- Projectile `ProjClsnScale` and `ProjClsnAngle`: show source and transformed
  projectile collision outlines.
- HitDef `p2clsncheck` and `p2clsnrequire`: identify whether contact tests use
  defender `Clsn1`, `Clsn2`, `Size`, or `None`; dim box families excluded by
  the current rule.
- `PlayerPush` and `SizePushOnly`: show status badges beside the Size overlay
  because these change push behavior rather than authoring boxes.

The IKEMEN 1.0 documentation calls the direct modification controller
`OverrideClsn`; it does not define a `ModifyClsn` controller. `TransformClsn`
is the separate native scale/rotation controller. If a later stable engine
renames or adds a controller, update the parser from that version's bundled
documentation instead of accepting an assumed alias silently.

Static preview must be conservative. Literal rectangles, scale values, angles,
and unconditional controllers can be evaluated in the editor. Triggered,
state-dependent, redirected, or expression-driven results must be labeled
`runtime-dependent` unless a captured training/debug frame supplies the actual
effective coordinates. The viewer must never save an inferred runtime result
back into AIR automatically.

### Complete IKEMEN 1.0 collision feature bridge

The AIR workspace help/inspector should list every relevant IKEMEN 1.0 feature,
including entries that do not produce a drawable rectangle:

| Feature | Kind | What the user needs to understand | Visual treatment |
|---|---|---|---|
| `Clsn1` | AIR declaration | Attack/contact box for the current element | Solid red |
| `Clsn2` | AIR declaration | Hurt/receiving box for the current element | Solid blue |
| `Clsn1Default` | AIR declaration | Inherited Clsn1 declaration used until an element overrides it | Yellow source-aware overlay |
| `Clsn2Default` | AIR declaration | Inherited Clsn2 declaration used until an element overrides it | Purple source-aware overlay |
| `stand.sizebox` | Character Size constant | Native standing push/contact size rectangle | Green, optional |
| `crouch.sizebox` | Character Size constant | Native crouching push/contact size rectangle | Green, optional |
| `air.sizebox` | Character Size constant | Native airborne push/contact size rectangle | Green, optional |
| `down.sizebox` | Character Size constant | Native lying/down push/contact size rectangle | Green, optional |
| Legacy `ground.back/front`, `air.back/front`, `height` | Size fallback | Builds legacy width/height geometry when native sizeboxes are absent | Dashed green fallback |
| `Width` | State controller | Temporarily changes horizontal push width for one tick | Base/effective Size comparison |
| `Height` | State controller | Temporarily changes vertical push height for one frame | Base/effective Size comparison |
| `Depth` | State controller | Temporarily changes Z-depth size | Optional depth projection |
| `OverrideClsn` | State controller | Replaces, appends, removes, or clears Clsn1, Clsn2, or Size overrides | Dotted effective geometry |
| `TransformClsn` | State controller | Scales and/or rotates effective collision geometry | Dashed transformed outline |
| `ClsnProxy` | Helper parameter | Helper collision contact is credited to its parent | Dotted proxy plus ownership connector |
| `OwnClsnScale` | Helper parameter | Helper uses its own size scale instead of the root's | Scale-source badge |
| `ProjClsnScale` | Projectile parameter | Scales projectile collision geometry | Source/effective projectile outline |
| `ProjClsnAngle` | Projectile parameter | Rotates projectile collision geometry | Source/effective projectile outline |
| `p2clsncheck` | HitDef parameter | Chooses defender Clsn1, Clsn2, Size, or None for contact checking | Interaction badge; dim excluded families |
| `p2clsnrequire` | HitDef parameter | Requires the defender to possess the selected box family even if another family overlaps | Requirement badge/warning |
| ReversalDef collision | Controller behavior | Reversal contact compares attack Clsn1 geometry | Clsn1-vs-Clsn1 explanation |
| `ProjTypeCollision` | AssertSpecial flag | Uses overlapping Clsn2 boxes for projectile/player clash behavior | Clash badge; highlight participating Clsn2 |
| `SizePushOnly` | AssertSpecial flag | Player pushing uses only Size boxes rather than requiring Size and Clsn2 overlap | Push-rule badge |
| `PlayerPush` | State controller | Enables/disables player overlap resolution; it does not author a box | Push-rule badge |
| `AnimElemVar(NumClsn1)` | Trigger | Returns the effective Clsn1 count for the animation element | Inspector value |
| `AnimElemVar(NumClsn2)` | Trigger | Returns the effective Clsn2 count for the animation element | Inspector value |
| `ClsnVar` | Trigger | Reads Back, Front, Top, or Bottom for Clsn1, Clsn2, or Size by index | Coordinate inspector/copyable example |
| `ClsnOverlap` | Trigger | Tests any selected Clsn1/Clsn2/Size pairing using IKEMEN's transformed collision system | Query explanation and overlap highlight |
| `ProjClsnOverlap` | Trigger | Tests an owned projectile against another player's Clsn1, Clsn2, or Size | Query explanation and overlap highlight |
| `IsClsnProxy` | Trigger | Reports whether the current helper is a collision proxy | Inspector value |
| `DebugMode(ClsnDisplay)` | Trigger | Reports whether engine collision display is active | Debug-state indicator |
| Lua `toggleClsnDisplay` | Front-end API | Toggles engine runtime collision display; unsuitable as authored AIR data | Documentation only |

Also explain ordinary engine conventions even though they are not separate
syntax options: a normal HitDef conventionally connects attacker Clsn1 against
defender Clsn2; ReversalDef uses attack-box interaction; missing Clsn2 has
legacy compatibility implications; and Size geometry can be used for throws.
Rectangles used only as render windows are not collision geometry and must not
be presented as Clsn boxes merely because they use the same four-number shape.

The **Runtime** tab implements the first static authoring bridge for these
features. It can save action/element plans and generate reviewed native code
for `AttackDist`/`guard.dist`, `attack.depth`, `Depth`, `Width`, `Height`,
`OverrideClsn`, and `TransformClsn`. Guard range uses cyan dashes, effective
Width/Height uses orange dashes, runtime overrides use cyan-blue dots,
transforms use white dashes, and true Z-axis values use a labeled magenta stage
band rather than a misleading side-view rectangle. Plans live under
`.ikemen-tools/air-runtime-geometry`; they never become fake AIR declarations.
The panel also identifies `ClsnProxy` and `OwnClsnScale` as Helper parameters,
not additional authored boxes.

The **Rules** tab bridges collision features that do not create rectangles. It
generates copyable native syntax for `AnimElemVar(NumClsn1/NumClsn2)`,
`ClsnVar`, `ClsnOverlap`, `ProjClsnOverlap`, `DebugMode(ClsnDisplay)`,
`IsClsnProxy`, HitDef `p2clsncheck`/`p2clsnrequire`, `PlayerPush`,
`SizePushOnly`, `ProjTypeCollision`, Helper `ClsnProxy`/`OwnClsnScale`, and
projectile `ProjClsnScale`/`ProjClsnAngle`. `NoClsn2Push` is intentionally not
generated because no such flag or parameter exists in the checked IKEMEN 1.0 compiler
or current official wiki.

The **Source** tab automatically follows the nearby character DEF and scans
only the code files declared by that character. It reports collision-related
`HitDef`, `OverrideClsn`, `TransformClsn`, `Width`, `Height`, `Depth`,
`PlayerPush`, relevant `AssertSpecial` flags, Helper collision ownership, and
projectile collision transforms for the selected AIR action and element.
Direct `anim` and `animElemNo(0)` conditions are labeled **explicit**.
Matching a positive StateDef number to an AIR action is labeled **inferred**.
Shared negative states, functions, and multi-branch call paths remain visibly
**shared** or **ambiguous**. Reusable function calls are traced across the
character's declared files, but ambiguous branches are never presented as a
definite runtime result. Every finding links to its authored source line.

## Snippets

- `statedef` — StateDef skeleton
- `function` — Function skeleton
- `sctrl` — block-style controller
- `cfgmap` — configuration map assignment

- `customstatecontract` — custom-state ownership annotations
- `synchandshake` — GameTime-stamped map synchronization

## Design notes

## Archive and animation organization

SFF sprites, embedded palettes, AIR actions, and SND sounds can be reorganized
without changing their engine identities. Each workspace remembers its chosen
view and offers numerical, functional-category, name, and original source/archive
ordering where applicable. Project naming categories remain optional; disabling
the naming profile leaves native numeric organization intact.

Display organization is deliberately separate from structural edits:

- A view sort never changes a group, index, AIR action number, palette ID, or sound ID.
- SND physical build order can be sorted through the reviewed SndMaker manifest,
  with a preview and backup. Its group/index identities remain unchanged.
- SFF structural changes continue through the SprMaker2 manifest and rebuild flow.
- AIR source-block reordering and palette-table remapping are not performed by a
  view sort. Those operations can affect comments, references, palette links, and
  sprite palette indices, so they require a separate reviewed remapping workflow.

Functional categories include movement/required sprites, guards, gethits/KOs,
intros, taunts, win poses, normal types, command normals, throws, system actions,
specials, hypers, community ranges, temporary ranges, cosmetic layers, and archives.
SND categories also distinguish common effects, attacks, specials, hypers,
gethits, presentation, system/UI, and the +10000 voice families.

## Native asset controller bridges

The SFF workspace can generate reviewed ZSS examples for `Offset`, `RemapPal`,
`RemapSprite` (direct or named preset), `ChangeAnim`, and `Explod`. The selected
sprite supplies its native group/index; destinations, triggers, and ownership
remain explicit review decisions. This associates visual assets with native
controllers without embedding gameplay rules inside the SFF editor.

The optional JNP transformation convention recognizes four RemapSprite form
slots. Base items stay within `0-9999`; Forms 1-4 use the same group with item
offsets `+10000`, `+20000`, `+30000`, and `+40000`. This remains orthogonal to
the four layer group banks. The SFF viewer labels recognized form sprites,
shows their base item, fills direct destinations from a selected slot, and
copies semantic named presets with `reset: 1`. Folder names begin with an
explicit `Form1`-`Form4`; labels such as SSB never silently choose a slot.

The SND workspace provides matching examples for `PlaySnd`, `ModifySnd`,
`SndPan`, `StopSnd`, `PlayBgm`, and `ModifyBgm`, plus the related `BGMVar`
queries. Split-archive CommonFX prefixes are retained automatically for selected
sounds. A FreqMul audition selector previews the chosen sound at common pitch/
speed multipliers before copying code. Browser audition is a production preview;
IKEMEN remains authoritative for final in-game mixing, panning, channels, and
loop behavior.

## Command and displayed-movelist editor

Open **ZSS and CNS → Open Command & Movelist Editor** from the IKEMEN sidebar,
or open it from a character DEF, CMD/JNP command file, or DAT movelist. The
workspace follows the character DEF's native `[Files]` assignments so command
recognition and the pause-menu move text can be reviewed together.

The command side displays every `[Command]` as a step timeline and keeps the two
timing concepts explicit: `time` is the deadline for the whole command, while
`steptime` is the allowed delay from one completed step to the next. Its editable
timeline keeps IKEMEN's single native step lifetime synchronized across every
transition, while the final step edits the completed-command buffer. Hover help
explains every field, including repeated-direction `autogreater` expansion and
the fact that `steptime = -1` inherits `time` rather than creating an unlimited
window. It exposes native `autogreater` and `buffer.*` controls, explains `/`, `~`, `+`, `|`, `>`,
relative/absolute directions and neutral, warns about mixed step operators, and
flags the project's offline-only `m` compatibility input. Suggested negative-edge
counterparts are guidance only; the editor does not implement a second input
history or invent gameplay routing policy.

The command browser is organized for real authoring work: multi-step motions and
sequences are listed first, while one-step buttons, directions, holds, and button
combinations are grouped under a collapsed **Basic / raw inputs** section. Search,
family filters, and persistent per-command hiding affect only the editor view and
never delete or rewrite native command definitions.

The movelist side edits the assigned native DAT text, previews IKEMEN glyph tokens,
lists `movelist`, `movelist1`, and later DEF assignments, and can copy a native
`ChangeMovelist` example. Writes require a reviewed confirmation and are applied
through VS Code documents so normal editor undo/history remains available.

The navigation parser is deliberately tolerant rather than a full compiler. It
only depends on IKEMEN 1.0 ZSS declaration boundaries (`[StateDef ...]` and
`[Function ...]`), keeping it resilient when the supported IKEMEN 1.0 compiler
adds triggers and controllers.

The frame-sync audit follows StateDef-to-function calls and checks both ends of
authored attack activity:

- `*.firstActiveElement` must match the first effective AIR Clsn1 element.
- `*.idleElement` must match the element immediately after the final effective
  AIR Clsn1 element, where recovery and Punish Counter vulnerability begin.

## Move-local Clsn2 hit reactions

Right-click a `Clsn2[index]` coordinate line in an AIR action and choose
`AIR: Assign Selected Clsn2 Hit Reaction`. Select Forced High, Forced Low,
Default reaction, or Remove assignment. The extension associates the AIR action
with its numeric state, then maintains the character-specific generated block
in `normals_extras.zss` beside that AIR file. It creates the extras file and its
`StateDef -4` scaffold when needed, opens the destination, and reveals the
updated block for immediate review. Shared normal StateDefs are never modified.
Runtime support currently covers Clsn2 indices 0 through 7 and applies these
overrides only to standing defenders.

## CNS syntax coloring

Files ending in `.cns` use the dedicated IKEMEN CNS language mode. Its default
colors mirror the supplied reference: semicolon comments are italic gray,
section headers are bright green, parameter names and assignment operators are
bright white, and numeric values are red. Decimal, signed, hexadecimal, and
scientific-notation values are recognized.

## Universal sizebox scaling

Place the cursor on a `stand.sizebox`, `crouch.sizebox`, `air.sizebox`, or
`down.sizebox` assignment in a CNS file and right-click **CNS: Scale Selected
Sizebox to Character**. The command reads that file's `xscale` and `yscale`,
then converts the selected project-reference box into native character
coordinates. The default reference scale is `1.185, 1.185` and can be changed
in IKEMaker settings.

The generated line retains its original source box and reference scale in a
comment. Re-running the command therefore recalculates from the original box
instead of compounding previous scaling.

## IKEMEN sidebar and launch shortcuts

Open the **IKEMEN** icon in the Activity Bar for grouped launch, SFF, AIR,
ZSS/CNS, project-file, and documentation actions.

**Ctrl+Alt+F5** launches IKEMEN normally. **Ctrl+Alt+F6** finds the character
owning the active file (or the configured default character) and starts an
Infinite Quick VS mirror on the default stage, with both time and the round-win
requirement set to `-1`. It uses ordinary versus behavior rather than training
mode and remains active until the user exits. **Ctrl+Alt+F7** launches the
current/default character as a separate Training mirror match.

**Training: Current Character Mirror** remains a separate launch action for
projects whose training behavior is available. **Training: Configure Match**
supports independent Single, Simul, Turns, and Tag teams, participant counts,
characters, and stage selection. All three universal shortcuts are exposed as
title-bar and context-menu actions on every IKEMEN visual editor, with their
key combinations included in the command labels. SFF and SND custom editors
receive matching editor-title actions; AIR, Palette/PalFX, Stage, Screenpack,
roster, code-structure, command, story, workflow, and other IKEMEN visual
workspaces receive the same webview-title actions.

Configure `ikemenZss.ikemenPath`, `ikemenZss.defaultTrainingCharacter`, and
`ikemenZss.defaultTrainingStage` in workspace settings. The launcher uses
IKEMEN's native command-line match setup. Training actions additionally use the
external training module's `-training` hook; no default IKEMEN Lua file is
modified.

## Reviewed direct-save safety

Stage and screenpack visual workspaces now identify their save authority in the
status bar. Their Apply actions reject stale previews, stage changes through a
temporary file, and replace the destination only after the complete write is
ready. Multi-file stage-interaction generation commits as one transaction and
restores the original files if any replacement fails.

Optional hidden backups and a capped mutation journal are controlled by
`ikemenZss.mutationBackups`, `ikemenZss.mutationHistory`, and
`ikemenZss.mutationHistoryLimit`. Use **IKEMEN: Open Recovery Center**
from the command palette or the Standards & Help section of the IKEMEN sidebar
to inspect direct mutations. Editor-based changes continue to use normal VS
Code dirty state and undo history; SprMaker/SndMaker rebuild authority remains
separate and explicitly labeled in its own workspace.

Palette master records, palette build plans, per-screen/group preview choices,
sound profiles, native CommonFX definitions, and SndMaker manifests use the same
safety service. Creating a sound-build workspace is one all-or-nothing bulk
transaction, with a single summarized history record regardless of how many WAV
sources it exports. SFF and SND headers show the applicable backup/history
policy; direct SFF binary edits still retain their separate SFF-specific backup
setting, combined with the shared backup policy.

Direct SFF sprite-header and embedded-palette edits now reject a save when the
archive changed after it was loaded. Axis changes, group renames, palette
assignments, palette RGB edits/reversal/replacement, and Save As use staged
binary replacement without decoding or re-encoding sprite image data.
SprMaker2 manifests have their own stale-file protection and remain the source
of truth for rebuild workflows. Importing sprites from another SFF commits the
extracted PNG sources and the manifest together; layer-source backup moves are
reversed if the corresponding manifest update cannot be committed.

The **Recovery Center** presents this mutation history as a searchable,
filterable workspace instead of raw JSON. Recoverable entries can open the
current file or backup, compare both versions, and restore a backup after
confirmation. A restore protects the current version first and records its own
history entry. Bulk operations remain summarized and do not expose an unsafe
one-file restore.

SndMaker rebuilds now protect an existing SND before the external builder runs,
restore it if the build fails, and journal the completed output when it
succeeds. AIR push-box and runtime-geometry plans use the same safety service.
A test-enforced direct-write authority audit keeps authoritative saves routed
through the reviewed mutation layer.

### Non-destructive proofing and batch review

The asset workspaces deliberately stop short of becoming image or audio
editors. Palette indexing and palette-table maintenance remain the only pixel
authoring performed inside the extension. SFF and AIR visual workspaces offer
black, white, gray, blue, and custom proof backgrounds and can export the
visible review canvas to a standalone PNG. A proof export includes visible
axes, layers, and enabled AIR boxes, but never changes the SFF, AIR, palette,
collision data, or source images.

SFF, AIR, and SND lists support persistent multi-selection, **Mark Visible**,
and **Clear** controls with selection totals. Filters define what Mark Visible
adds to the batch. SFF group/category rows can also be toggled as a whole with
Ctrl+click. These selections feed the existing reviewed export, manifest, and
batch operations; they do not trigger an operation by themselves.

### Complete Project and release cropping

The **Complete Project / Public Copy** tools capture the intended JNP defaults,
audit exact SFF release coverage, and create a separate public game copy. The
development game is never reset or cropped in place. Player-created palettes,
logs, and replays are removed only from the copy, while captured controls,
menus, player options, sound, and visual settings are restored there.

Every SFF must be explicitly assigned either a palette-preserving manifest
autocrop build or a human `verified-cropped` signoff. Unresolved and newly
discovered archives block completion. The SFF viewer also exposes **Crop SFF**
for current-sprite, current-group, and complete-archive scopes through the same
reviewed SprMaker2 source workflow.

Finish Product also owns the player-visible release label. Registered motif
`system.def` files use IKEMEN's native `footer.version.text` field under
`[Title Info]`. Each full or patched release suggests advancing the saved
display version by one tenth (`1.0` to `1.1`, with `1.9` becoming `2.0`), but
the author can enter any version number or named release and review the exact
text shown in game. Only the finished copy is changed; the development
screenpack is not rewritten. After a successful build, the chosen value is
recorded in the release profile so the next release receives the correct
suggestion. Newly created screenpacks include a visible `Version 0.0` starter
field.

### Test and diagnostic sessions

**IKEMaker: Open Test & Diagnostic Suite** provides a motif-independent
development workspace. Test Session filters an offline registry by explicit
scope, launches the current character mirror with an in-game checklist, reads
known character logger evidence, accepts human pass/fail signoff, and writes a
JSON result under `save/logs`. Diagnostic Session exposes IKEMEN's native
collision, debug, wireframe, lifebar, VSync, speed, pause, frame-step,
reset/reload, save/load-state, console, force-standing, and full-restore
operations through the same temporary overlay.

The generated module is a one-use bootstrap under
`external/mods/IKEMaker_test_session.lua`: IKEMEN loads it through its standard
external module loader, then the module removes itself. Session plans and
project-authored registries live beneath `.ikemen/test-sessions` and
`.ikemen/tests`. Finish Project excludes all three locations even if a crashed
launch leaves a bootstrap behind.

Bundled profiles include Default/Universal, SF6, DSvsSF, DS4, and HDBZ.
Universal suites are portable, while game tests require an explicit matching
profile. Production order never implies inheritance. The JNP screenpack retains its local
Developer Options. Player-facing Training options remain outside both systems;
forced Normal/Counter/Punish selection is the explicit ownership example.

In game, `F8` toggles the overlay. `F9` advances the selection. In a Test
Session, `F10` marks pass, `F11` marks fail, and `F12` saves evidence. In a
Diagnostic Session, `F10` executes the selected native operation. Project teams
can create and edit `.ikemen/tests/project-tests.json` directly from the suite.
