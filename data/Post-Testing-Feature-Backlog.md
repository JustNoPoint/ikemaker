# IKEMaker Post-Testing Feature Backlog

This is the authoritative requirements and checkpoint backlog. It contains
proposals, explicitly activated slices, source-complete checkpoints and pending
physical acceptance; it is not a queue in which every entry should be built.
The dated scope and evidence for each item govern its status. Backlog refinement
does not activate implementation, installation, paid AI, or publication.

## Next coding priorities — trigger argument selection and Transfer mode (2026-10-26)

User explicitly prioritizes these two items next. This updates scheduling; it does not authorize packaging, installation or publication. Entity tabs/synchronized switching are recorded source-complete in the closeout below; do not restart their implementation. Their installed physical acceptance remains a release gate.

1. **Trigger argument selection:** extend the EXISTING Browse/Insert Trigger workflow with selectable known argument values, comparable to controller parameter assistance. For EnvShakeVar, offer time / freq / ampl / dir as choices for its one param_name argument. Preserve editable/free expression entry, manual syntax and user methods. Distinguish ordered argument positions from alternative values; never turn four alternatives into four parameters. Show argument meaning/type and exact-target availability from verified metadata; support optional or expression arguments only where documented. Reuse shared metadata across hover, offline help, authoring browser and insertion. No new subsystem or extra viewer. Preview the resulting expression, preserve cancellation/stale-document/target checks, and never save automatically. Add focused tests for EnvShakeVar(dir), single-argument choice insertion, multi-position triggers, editable expressions, cancellation and target/source changes. The recent dir documentation correction is already source-complete; this item is the missing choice UI.
2. **Transfer mode:** implement/complete the approved two-viewer source/destination workflow and expansion below, first reconciling existing transfer capabilities so completed features are preserved. Keep compact groups/lists, multiselect, drag/drop and Copy Selected, reviewed conflicts, animation-only versus animation-with-sprites choices, palette compatibility, validated session mappings and result/recovery handling. Preserve pinned endpoints as an explicit exception to global entity switching and normal single-viewer reuse. All previously recorded transfer acceptance requirements remain in scope.

**Activated implementation checkpoint — trigger argument selection source-complete (0.79.314, 2026-10-26):** The existing Browse / Insert Trigger workflow now reads shared structured argument metadata, presents verified alternatives by ordered position, preserves free expressions and native snippet placeholders, previews the exact expression, rechecks target/source/selection authority and applies one undoable native edit without saving. `EnvShakeVar(param_name)` is modeled as one position with four alternatives (`time`, `freq`, `ampl`, `dir`), not four parameters. The same bounded position, meaning, type and target-filtered choice model feeds hover, signature help and Authoring Browser summaries. A new static **Trigger Arguments…** action under the existing editor right-click `IKEMaker -> Edit & Insert` menu resolves the exact catalog-backed call under the cursor, lets the user change one argument through a known-value or manual-expression picker, previews the complete call and revalidates the document, call and capability before editing. It recognizes nested calls, ignores comments/strings and preserves IKEMEN half-open range syntax such as `[3050, 3100)`. Commonly used trigger names reuse the existing persistent Trigger Favorites/Recents/Usage store; Recipe Library remains a separate bundled catalog and no duplicate personal-recipe store was added. Cancellation is a no-op, no source is autosaved, and 165 focused Coding Viewer acceptance files pass. Installed right-click/menu interaction remains a physical release check. Transfer mode is now the next coding priority.

**Activated implementation checkpoint — SFF Transfer lifecycle/review-copy slice source-complete; overall Transfer goal remains active (2026-10-26):** SFF Transfer now opens two exact pinned panels without entering ordinary filename reuse or global entity switching, labels Source/Destination, makes the live Source role read-only even after Swap, rejects the same physical SFF in both roles, supports exact physical multiselection, role/session-keyed compact companion lists, Copy Selected, reviewed drag/drop boundaries, Swap, guarded Change Source/Destination and guarded Exit back to the prior normal context. Browser and viewer selections project both ways without collapsing duplicate group/index occurrences. A stale marked occurrence rejects the complete batch; Swap preflights both panels and rolls back its first visual role change if the second fails; manual close evicts host authority and cannot misroute a later session. Copy and drag/drop share the canonical review path and identity scheme, never write either SFF, and may continue explicitly into the existing Advanced Two-SFF Assembly owner. Focused lifecycle, policy, browser and host tests pass, and New Dev signed off this bounded slice after its release blockers were corrected. Installed two-panel/aux-window interaction remains a physical gate. The overall Transfer goal is not complete: native conflict/apply/result/recovery ownership, palette dependency decisions, AIR animation choices, SND transfer, and their installed acceptance remain pending.

**Activated implementation checkpoint — SFF reviewed conflict/native Apply slice source-complete; overall Transfer goal remains active (2026-10-26):** Continue in Advanced Assembly now carries and independently revalidates the current ready Transfer request instead of dropping the reviewed physical selection or destination boundary. The receiving seed is exact-file/hash, exact-occurrence content/topology and request-identity bound; existing Assembly drafts require an explicit keep/replace choice. SFF conflict analysis now reports occupied identities, exact duplicate occurrences, missing linked targets, palette compatibility/import/remap/truecolor choices and missing placement. Explicit prompts produce a sealed resolution plan with add-next-free, replace, skip, manual identity, source/destination axis, link flatten/preserve/include and palette reuse/map/import/truecolor decisions. Apply remains unavailable until every gate is resolved. A resolved plan prepares immutable sprite/palette snapshots and review evidence, extends the existing preserved-archive build owner with exact physical insertion, then delegates to its private candidate, verification, stale-target lease, final confirmation, durable backup, transactional adoption and execution receipt path; no second SFF writer was added. Verified success atomically records per-item results and evidence-bound mappings, rebases the same pinned Destination to its new hash, invalidates its stale browser generation and reloads its viewer. Failed/recovery-required results cannot rebase. New Dev audited the legacy Assembly and native writer boundaries and supplied/signs off the strict handoff adapter. All 165 focused Coding Viewer acceptance files pass. Installed SprMaker2 candidate/adoption, exact cross-window insertion and recovery remain physical release gates. AIR animation-only/with-sprites Transfer and SND Transfer are still pending, so the overall goal remains active.

**Activated implementation checkpoint — Transfer mode source-complete across SFF, AIR and SND (2026-10-26):** This supersedes the pending statements in the two earlier Transfer checkpoints. All three applicable asset viewers now enter the approved two-pinned-endpoint Source/Destination mode without participating in ordinary global retargeting. Their compact transfer browsers provide searchable exact physical lists, Ctrl/Shift multiselect, Copy Selected, session/fingerprint-bound drag authority and exact before/after Destination boundaries; Swap and Change Endpoint invalidate pending authority, guarded Exit protects drafts, and partial role changes roll back. Source panels are deny-by-default read-only while pinned. SFF retains the existing Advanced Two-SFF Assembly as its sole reviewed writer and now returns evidence-bound exact physical mappings after verified candidate adoption. AIR supports animation-only copy and an animation-with-sprites continuation that accepts only a successful finalized SFF Transfer receipt; raw numeric group/index or physical position never establishes sprite equivalence. Copy Action closure, mixed insertion/replacement, duplicate action occurrences and post-edit mappings are resolved before its one explicit, undoable, unsaved WorkspaceEdit, using exact `action:number@physical` result identities. SND resolves preserve/add-next-free/manual/replace/skip decisions, exact physical source occurrences and placement, rejects malformed duplicate Destination identities during review, and delegates to its private verified SndMaker candidate, final confirmation, durable backup and transactional adoption path. Same-path and same-inode endpoint aliases reject, hostile/repeated drag identities reject, cancel and blocked paths write nothing, successful Destination results rebase and refresh the pinned viewer, and no transfer autosaves AIR source text or silently mutates Source assets. New Dev independently signed off the SFF, AIR and SND source slices after closing authority gaps. The combined Coding Viewer gate contains 189 focused files. Installed cross-webview drag/drop, real SprMaker2/SndMaker candidate/adoption and backup/recovery, dirty-editor guarded Exit/Swap, and AIR+SFF continuation across live windows remain mandatory physical release smoke tests; this checkpoint does not claim those installed checks, packaging, publication or release sign-off.

## Entity headers and viewer switching — source-complete; physical acceptance pending (2026-10-26)

**Status reconciliation:** Previously the next implementation priority; now source-complete per the synchronized source-closeout checkpoint below. Preserve these requirements for regression and installed physical acceptance. Do not reopen completed coding work unless a specific defect is found.

- Every IKEMaker header presents the same entity/context tabs or selector: characters, stages, screenpacks and other supported contexts. Selecting an entity in ANY header changes the single active entity across ALL open viewers and their companion browsers, including coding navigation. This synchronization is standard behavior, independent of the optional Grouped files setting.
- Entity-tab visual contract: When more than one entity is loaded, show a compact entity-tab strip on EVERY header. With zero or one loaded entity, hide the entire strip, including its slider/arrows, and reclaim its space; retain the active entity identity and Open Entity action in the normal header. Entity tabs are smaller than file tabs and use a distinct color treatment so the two navigation levels are immediately distinguishable. The active entity has a brighter accent; also use an outline/indicator and accessible selected state so selection is not conveyed by color alone. Preserve readable text, keyboard focus and usable click targets despite the compact styling. Reuse the existing native-text companion file-tab slider and previous/next arrow navigation pattern, including overflow handling, rather than inventing another scrolling mechanism. Slider/arrows scroll the entity strip; choosing a tab performs the synchronized entity switch. Reuse the established text-tab behavior where it already defines navigation semantics. Keep this strip present regardless of the optional Grouped files toggle, and keep its entity order/selection consistent across headers. Preserve the existing viewer-specific toolbar colors; entity accents must be visually distinct from file tabs without replacing destination-button color conventions.
- Tab organization: support drag-to-reorder for BOTH entity tabs and IKEMaker file tabs. Entity order is shared immediately across every header; file order is remembered separately per entity/context, with shared documents retaining one underlying buffer. Persist order as UI preferences, not asset/file moves. Provide clear insertion feedback, overflow auto-scroll and keyboard-accessible Move Left/Right alternatives. Reordering must not change active entity/file, trigger saves or close/reopen editors; use stable identities rather than tab indexes, and cancel a stale drag safely if the loaded set changes. Dragging organizes within its tab row; it does not transfer files between characters, change ownership, or open extra viewer windows. Preserve native VS Code tab dragging where native tabs are shown; do not promise unsupported cross-group native-tab ordering through the custom header. Verify order survives entity switches/reload, active focus remains stable, and single-entity strip hiding still works.
- Approved tab refinements (2026-10-26): prioritize modified indicators, shared-file badges and duplicate-name clarity. Aggregate unsaved native edits and viewer drafts onto the owning entity tab; provide an accessible details list of affected files/drafts, not hover-only information. Shared-file badges list all known owning contexts and reflect shared edits in each affected loaded entity. Disambiguate duplicate entity names with project/DEF-variant labels and full identity on demand.
- Add header-accessible search for loaded entities and files; choosing a result reveals/focuses it through the same protected global switching path. Add a previous-entity command/shortcut for quick alternation without losing selections or pending work.
- Support pinning entity/file tabs at the beginning while preserving order within pinned and unpinned sections; remember these choices with existing UI state. Add Restore Closed Entity for its prior navigation/views/selections only; never imply discarded edits can be recovered. Revalidate missing/stale resources before restoration.
- Retain drag-hover overflow auto-scroll near strip arrows/edges, with clear insertion feedback and no accidental entity activation while dragging. Keep secondary tab actions in a compact context menu; important navigation must also be available from the header and keyboard. These refinements extend the existing entity/file-tab scope rather than adding screens or browsers.
- Reuse one instance of each viewer per IKEMaker workspace and one browser per viewer. SFF, for example, displays only one entity's SFF at a time; switching does not create another SFF window. Existing hidden viewers adopt the new context and load lazily when opened. Do not open previously closed viewers or every source document on a switch.
- Preserve each entity's prior selections, layout, cursor positions and pending work separately. Missing or inapplicable assets show a clear empty/unavailable state for the selected entity, never stale content under the new entity's label. Stage and screenpack switching are part of acceptance, not merely future character-only architecture.
- Native text editing remains native. Add a header **Grouped files** toggle, OFF BY DEFAULT, consistent with existing No native tabs controls. When enabled, use entity-scoped file navigation and a reduced native tab display; when disabled, restore ordinary native tab display. Remember the user's choice, preserve their previous VS Code setting, and disclose its window/editor-group scope. Do not silently change global preferences. Reconcile with existing No native tabs controls so the two settings cannot fight each other.
- Switching or toggling never implicitly saves/discards edits or closes unrelated/dirty/pinned/untitled documents. Protect viewer drafts before switching; if retention is impossible, obtain the explicit existing save/discard/cancel decision before committing the global switch. Cancel keeps the previous global context coherent.
- Use exact project + entity definition identity, including same-folder DEF variants; maintain shared-file membership without duplicate document state. Guard asynchronous loads and commands so stale callbacks cannot restore the prior entity or send Save/Build/Launch to the wrong target.
- Normal browsing reuses one instance per viewer type. Explicit Transfer mode is an approved exception: allow TWO viewers of the same type for source/destination sprite, sound or animation transfer. Preserve the existing two-viewer transfer capability during entity-switching changes. Ordinary user-managed native editor splits remain available.
- Required verification: switching from EACH header updates every open viewer/browser; character -> character -> stage -> screenpack -> character; unsupported assets; retained selections and edits; shared files; same-folder variants; rapid switches/delayed loads; reload; Grouped files default-off/on/off and prior-setting restoration; no duplicate panes/browsers, no header jumps, no silent asset writes, and no wrong-entity actions. Tests must cover the shared switch coordinator and physical cross-viewer behavior before release sign-off.

**Activated implementation checkpoint — foundation slice (2026-10-26):** Source-complete and New Dev reviewed for the bounded foundation only. The authoring-context registry now preserves exact project + owner-DEF identities, including same-folder DEF variants. A central VS Code-independent coordinator owns immutable ordered entity projections, previous/active identity, bounded retained state, transactional prepare/validate/commit switching, rollback/cancellation, unsupported state, Transfer pin projection and stale-generation rejection. The shared compact entity-header shell is present in launch-control viewers and native Code Navigation, hidden with its space reclaimed until more than one entity is supplied; it includes accessible selection, search, previous, slider/arrows and host-owned switch intents. The host deliberately does not broadcast multiple entities or accept those switch intents yet: exposing cosmetic tabs before each viewer can safely retain and retarget would permit stale or wrong-entity content. Remaining coding work is the host integration and explicit retain/retarget adapters for SFF, AIR, SND, Code Navigation, Stage and Screenpack, followed by shared ordering/reorder persistence, badges/search details, restore/pinning, Grouped files and physical cross-viewer acceptance. This checkpoint makes no claim of global switching, no asset files are written, and Transfer's two-viewer exception remains preserved.

**Activated implementation checkpoint — safe adapter expansion (2026-10-26):** The central host now validates bounded header intents, aggregates per-adapter retained UI state under exact adapter ownership, and answers a fresh-header ready handshake so a replaced webview cannot miss the current projection. Exact target resolution honors dirty owner-DEF text and engine-aware assigned-source lookup. Stage, Screenpack and Code Structure now have source-tested same-panel retarget adapters with truthful unavailable states, stable selection restoration, changed-source validation, duplicate ordinary-owner protection where applicable, idempotent rollback, and no switch-time asset writes. Screenpack also retains its preview draft and normal versus Character Select Layout mode. New Dev independently reviewed and corrected the Stage/resolver slice and signed off the Screenpack slice. These adapters remain deliberately unregistered in the live global host until AIR, SFF and SND can provide the same safety guarantees; multi-entity switching is therefore still gated, and physical cross-viewer acceptance, ordering/refinement work, Grouped files and restore/pinning remain pending.

**Activated implementation checkpoint — synchronized source closeout (2026-10-26):** The desktop runtime now starts before any viewer or companion registration and owns one transactional active-entity projection. Ordinary SFF, AIR and SND viewers and their companion browsers, native Code Navigation, Code Structure, Stage and Screenpack attach exact retarget adapters to that host. Each adapter reuses its panel, retains bounded entity-specific navigation/UI state, validates owner and source evidence, rejects stale or duplicate adoption, renders a truthful unavailable state for inapplicable assets, rolls back idempotently and performs no switch-time asset write. Explicit SFF Transfer endpoints remain locally pinned and excluded from ordinary retargeting. Shared headers now include compact overflow navigation, search by entity/file detail, duplicate-name disambiguation, modified/shared badges, drag and keyboard order controls, pinning, previous-entity navigation and Restore Closed Entity. Restore retains navigation/view/selection only, never edits; owner/type/resources are revalidated before the entity can return. Native file tabs have separately persisted per-entity ordering/pinning, and Grouped files is default-off, workspace-scoped, mutually exclusive with Header-Only, and restores prior VS Code settings without overwriting independent changes. New Dev independently signed off SFF, AIR browser, Code Navigation, Grouped files, main AIR/SND adapters and Restore Closed Entity. A combined automated gate covers all ten ordinary surfaces in one no-write host transaction; 36 focused entity/adapter/lifecycle suites pass. Installed VS Code physical journeys remain required before release sign-off: switch from every header through character -> character -> stage -> screenpack -> character, exercise unsupported assets and delayed loads, verify detached/narrow headers and Transfer presentation, reload retained state, and run Grouped files off/on/off with real dirty editors. This checkpoint closes the authorized coding backlog, not those physical checks or publication.

## Current planning guide — reconciled 2026-10-21

This guide resolves stale scheduling and overlapping product requirements below.
Retain older checkpoints as evidence, not fresh instructions to repeat completed
work. Report status separately as **planned/held**, **explicitly activated**,
**source-complete**, **physical-pending**, and **released with evidence**. Never
infer one from another or infer current task activity from an old goal heading.

| Work family | Recorded position / next useful decision |
| --- | --- |
| SFF Creator/writer | Use the finite SFF writer ledger, not the earlier serializer implementation order. Active target requirements remain v2.0/v2.1 and supported SprMake2; v1/DOS tooling stays shelved. Reconcile its exact final checkpoint before scheduling any remaining host/adoption work. |
| Palette Workshop | Slices 1–10 are recorded source-tested in post-source certification. The 0.79.182 checkpoint also adds reviewed palette-number compaction with candidate comparison, Undo, preserved gaps, bounded reference authority, and no source rewrite. Installed physical acceptance and later interaction proposals remain separate work. |
| AIR collision/selected-box connections | October 18 records source closeout, including the selected-box 0.79.139 checkpoint. Installed interaction and pinned-engine physical QA remain pending; do not revive October 16's partial-parser status as current. |
| Coding/Project Knowledge/Move/Helper connections | Later source checkpoints supersede early blanket deferrals for their exact delivered subsets. Broader discovery, additional callers and adapters remain separate proposals; no claim of universal semantic coverage. |
| Held AIR tools, Layers, optional assistance | Reuse completed foundations. Split remaining proposals from the activated collision work; Layers, paid AI and new adapters do not inherit approval from collision closeout. |
| Cross-viewer/SND connectors | Extend one typed reference service and existing waveform/transport. Complete declared reference coverage, then channel connections and reviewed waveform-to-code; no parallel inventory or audio editor. |
| Recognition/reuse | Personal shelf, Similar Code, intent/example and resume checkpoints already cover bounded subsets. Schedule only an identified remaining workflow gap. |
| Help and release | Audit final navigation first, then update contextual/offline help, screenshots and links. Validate the exact release artifacts separately; no automatic publishing. |
| Flow / expanded Project Data / QA website | Preserve the character-development and specials milestones in the Phase 1 scheduling clarification. Flows are user-defined; JNP's workflow is an example, not enforced production order. |
| IkeMiner/Phase 2, community publishing, tournaments, optional workshops | Remain separately scheduled. A shared adapter/interface is not permission to implement the deferred product. |

### Shared delivery boundaries and consolidation

- One companion browser per viewer. Actions, References, Layers, sound/palette
  selectors, timeline and assistance are internal views selected by compact
  accessible icons, not extra windows. Floating moves the same instance. Older
  multi-browser experiments and the native coding workspace's recorded two-
  companion implementation are historical exceptions to reconcile against this
  latest UI rule, not templates for new viewer tools. Preserve native editors
  and existing functionality when a separately authorized migration occurs.
- Reuse one typed source/resource inventory, route authority, history/filter
  model and metadata contract. AIR, SFF, SND, Palette and labs consume projections;
  equal numbers do not establish equal assets, channels, entities or owners.
- Reuse one timeline/sampling service for authored frame properties, Layers and
  cues. Keep AIR edits, preview assumptions, generated connected code and saved
  metadata visibly separate. Do not add independent writers per tool.
- SFF Creator owns archive intake/build/adoption; Palette Workshop owns palette
  drafts and reviewed proposals through existing mutation owners. Contextual
  shortcuts keep selection and return history; they do not fork those editors.
- Source changes require an explicit reviewed user action. Browsing, filtering,
  auditioning and previewing do not create project files. Disclose temporary
  work and retain existing cancellation/recovery protections. AI is optional,
  with separate data/provider/cost review; no artwork generation is implied.
- Keep optional project standards configurable. Author/game namespaces and
  color/group conventions are project data, not universal JNP rules; HDBZ's
  TeamZ2/HDBZ identity must remain supported. Do not rename existing contracts.
- Each new slice records: concrete user task, existing owner/service reused,
  remaining delta, dependencies, explicit non-goals, evidence and physical
  checks still needed. Stop at that slice's boundary. Old “next Thursday,”
  “after reset,” or “start the next goal” prose does not auto-start work.

### Mandatory shared header and toolbar access contract — 2026-10-21

These are hard requirements for every viewer, lab and editor window, including
new windows and internal views. They supersede conflicting older UI proposals.

- Preserve the established shared header options, order, compact icon treatment,
  destination colors and browser behavior. Reuse the canonical controls; do not
  replace icons with words or invent a different header convention per screen.
  Context-specific additions must fit that shared structure.
- Every new option must be reachable from the relevant window's toolbar, either
  directly or through its existing dropdown/overflow and internal browser views.
  IKEMaker Tools, right-click menus and the Command Palette are supplementary
  routes, never the only route. This does not require a permanent button for
  every option or a duplicate editor for each access point.
- Maintain one companion browser per viewer. Toolbar access buttons switch
  views inside that browser; docking, floating or expanding relocates/reveals
  the same instance rather than creating another. Preserve selection, drafts,
  filters and navigation history when switching views.
- Keep existing header capabilities available across eligible windows. Respect
  mode and resource context without introducing contradictory header layouts;
  explain unavailable actions instead of silently making required routes vanish.
- Keep tooltips, accessible names, keyboard access, visible focus and high-
  contrast support. Destination color supplements the icon and accessible name;
  it is not the sole identifier. Accessibility labels do not require replacing
  the established visible icons with text buttons.
- Acceptance for each authorized UI change includes shared-header consistency,
  toolbar reachability of its actions, browser-instance reuse, state retention,
  and narrow/detached layout checks. Record exceptions as issues to resolve,
  not new conventions. This requirement does not itself activate implementation.

### SFF and palette source-format parity — user clarification 2026-10-21

**SFF and palette operations are not PSD-exclusive.** Decide availability from
decoded pixels, indices, palette/alpha data, timing and source provenance—not
the filename extension or whether Photoshop is installed. PSD is an intake
adapter for layer/document extraction; it does not own downstream authoring.
Do not require a PNG/BMP/PCX/GIF/SFF user to create a PSD to reach shared tools.

| Input / evidence | Shared workflow after supported decoding | Specific limitation |
| --- | --- | --- |
| Loose images, ordered folders/sequences, reviewed sheet cuts | Number/order, axis/crop, palette review, placeholders, exact duplicates/links, group/bank organization, export, Creator review and optional AIR handoff | Preserve indexed data when present. True-color palette creation/reduction requires an explicit reviewed conversion. Unknown timing stays unassigned or user-entered. |
| GIF / other already-supported timed input | Same shared workflow plus supplied timing provenance | Source-delay conversion is reviewed; do not infer gameplay events or promise an unsupported decoder. |
| Existing SFF or imported build recipe | Same supported sprite/palette organization, preview, replacement and export through exact archive/recipe authority | Respect source target/version, links and missing originals; no forced PSD round trip. |
| Standalone ACT, indexed PNG and other supported palette inputs | Palette preview/edit/library, multi-add/insert/replace, named groups, temporary palettes, galleries and supported export | No embedded palette exists in ordinary true-color pixels; distinguish extraction/quantization from lossless palette import. |
| PSD layered document | Same shared workflow after extraction, plus PSD layer hierarchy/visibility/offsets/compositing and verified Photoshop timeline extraction | Layer/document extraction is format-specific. Do not pretend flattened files contain editable source layers or PSD layers are animation frames. |

Named palette domains, exact 1:1 indexing, optional color separation, index
highlighting, reviewed index migration, duplicate detection, locked colors,
temporary palette ownership, palette gallery/template rendering, remap links,
axis matching and reusable plans apply to all compatible decoded inputs.
Show a precise data/capability reason when an operation is unavailable.

Keep these distinct: **PSD source layers** (document extraction), **SFF layer
groups** (organizational metadata/filtering), **Palette draft paint layers**
(existing non-destructive reduction overlays), and **AIR Layers** (planned
animation composition). Only source-document layer extraction requires a
layered source. Organizational groups, palette overlays and AIR composition
must not acquire a Photoshop dependency. No SFF visual-layer renderer is added.

The **Reversed Photoshop method** is an explicit palette table-order convention,
available for relevant imported/exported tables regardless of the originating
application; never auto-reverse based on extension. Preserve source order and
record any normalized mapping. Palette slots, color indices and sprite group/
index are separate identities. Add/insert shifts are not replacements; preview
affected links and unresolved code references without claiming universal repair.

Every adapter hands the same reviewed source record to downstream services:
source revision/ordinal, decoded dimensions, pixel/index/alpha representation,
palette identity, axis/crop, optional timing and provenance. Do not pad missing
metadata with guessed layers, timing, ownership or semantics. Imported copies
and outputs leave originals intact unless the user explicitly reviews otherwise.

Acceptance when implementation is authorized: compare equivalent indexed PNG,
supported BMP/PCX, sheet cut, GIF frame, PSD-extracted frame and SFF source through
the same supported numbering/axis/palette/export path. Compare normalized pixel,
index/palette and geometry evidence, not compressed file-byte equality. Test
non-PSD workflows without Photoshop, mixed-source batches, per-source palettes,
partial alpha/true color, explicit conversion, order/ACT reversal, duplicates,
missing timing, stale source, cancellation and zero source writes on preview.
An unsupported format or capability produces a clear reason, not a PSD detour.

### Practical closeout improvements (proposals, not new implementation scope)

1. Use one compact “What will change?” review in each existing mutation owner:
   target, selected scope, added/replaced/shifted/skipped counts and unresolved
   impacts. Avoid additional generic confirmation screens that repeat it.
2. Make the common path short: select sources -> review relevant differences ->
   apply. Keep advanced steps editable on demand, preserve per-item overrides,
   and never make a routine flat-image import walk through PSD layer controls.
3. Reuse cross-tool Back/Forward and typed selection envelopes. Restore the
   source item, palette, frame, filters and scroll; stale resources get repair
   choices instead of silently selecting the first item.
4. Keep one finite physical-QA queue for source-complete work, organized by user
   journey (import -> palette -> AIR -> save/reload; source -> viewer -> return).
   Link each case to its source/build identity. Do not repeat whole suites after
   unchanged code or mistake pending physical work for missing implementation.
5. Contextual Help must explain the current shared workflow, data limitations,
   Preview/Apply/Build/Adopt distinctions and equivalent non-PSD entry points.
   Screen-specific buttons link to the relevant offline page; update screenshots
   after layout stabilization. Record broken links as closeout defects.

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

Status: source implementation checkpoint completed October 15, 2026. Exact
Nightly target/catalog deltas now produce accessible controller and parent-group
markers in the shared desktop/Coding Assistance controller projection; stable
1.0 exposes no marker or acknowledgement action. Acknowledgements persist per
workspace/project context and exact effective controller contract, use signed
single-use review receipts, and fail closed on source context, target, catalog,
group membership, or browser-generation drift. A later changed contract
reappears, including a Nightly contract that returns to the stable baseline.
Command Palette routes are hidden unless the exact active Nightly projection has
unreviewed entries. New Dev approved the source slice after provider, authority,
storage, browser, workspace, command-contract, syntax, and manifest checks.
Installed marker placement, color/tooltip clarity, keyboard/screen-reader flow,
and restart persistence remain physical-test pending.

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

Status: source implementation checkpoint completed October 15, 2026. Safe
timeline reordering, bounded adjacent-frame onion skin, reviewed marked-frame
property editing, action-level New/Duplicate/Delete, and the compact Add
Animation draft are implemented through the existing AIR owner. The batch
property path uses session-secret, exact-source/action/frame tokens, patches
only the selected field bytes, rejects stale/forged selections and edit races,
and remains one VS Code Undo. New Dev signed off the source-tested slice after
the focused host/model/HTML suites passed. Installed interaction, visual onion
clarity, and actual IKEMEN save/reload behavior remain physical-test items; they
do not authorize a second AIR writer or mutation owner.

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
- After the shared dropdown-toolbar/UI overhaul, extend the existing **New
  Action** owner with a compact **Add Animation** draft dialog containing an
  optional display name, exact action number, and initial element time. Validate
  number conflicts and time syntax, show the generated AIR text, and apply
  through the existing source-hash/Undo transaction. Do not create a parallel
  AIR writer or force names into source formats/conventions that do not support
  them. Treat the name as comment/IKEMaker metadata when AIR cannot represent it
  natively. Suggest—but never silently choose—the next free action number;
  preserve a cancelled draft, offer **Create and add first frame**, and make the
  whole accepted creation one Undo transaction. Reference:
  `Screenshot 2026-10-03 233502.png`.

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
   is implemented in the 0.78.3 source; the bounded Similar Code implementation
   is recorded in the later October 14 checkpoint. Only improvements beyond
   that delivered scope remain proposals. Pin existing blocks with
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
same reusable browser shell. Allow category switching in place and retained
selection; the latest one-browser-per-viewer rule supersedes earlier optional
open-separately behavior. Do not require
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

### Nightly-only string data across Project Knowledge and coding assistance

String-capable maps and related string functionality must be treated as an
explicit Nightly engine capability throughout IKEMaker, not as a Maps-only UI
addition. Verify the actual syntax and semantics against the selected Nightly
engine source/documentation before shipping catalog entries, diagnostics,
examples, recipes, or generated code; do not infer support from a version label
or from IKEMaker itself knowing how to parse the syntax.

- Extend the shared project index and category adapters to retain typed string
  declarations, assignments, reads, writes, comparisons, function arguments and
  returns wherever the selected capability actually permits them. Preserve the
  exact literal/source range and distinguish literal text from symbol names,
  comments, display text, file paths, command names, map keys, and unresolved
  expressions. Never turn a text match into a fabricated dependency.
- Maps should display a verified value kind such as numeric, string, mixed by
  supported control flow, or unresolved; definitions/defaults, writers, readers,
  remote owner/player context, lifecycle and contracts remain connected to the
  same canonical map identity. Existing numeric-map behavior and the JNP runtime
  namespace contract remain unchanged.
- Function logging should understand content-free inferred string evidence for
  named parameters and named return variables, string-bearing calls,
  callers/callees, and unresolved dynamic flows. ZSS function headers do not
  declare parameter/return types or defaults, so the UI must never invent them.
  Project Knowledge must be able to follow a string from its producer through a
  function or map to its consumers without pretending static analysis proves a
  runtime value.
- Expand the applicable Constants, Contracts, Recipes, Examples, Problems/QA,
  Used By, Code Navigator, Visual Code Structure, hover, completion and intent
  search layers to include string-capable items. Reuse the same catalog IDs and
  browser/viewer surfaces; do not create a separate String Logger window or a
  second project index.
- Add capability-aware diagnostics only after semantics are verified: unsupported
  string use for the selected engine, incompatible numeric/string assignment,
  invalid operation or comparison, wrong function argument/return kind, and
  unresolved string-bearing map/function references. Avoid speculative errors
  when type or control flow cannot be proven; report uncertainty and exact source.
  Initial source-side compatibility coverage is complete for positively identified
  string maps, constants, scoped locals, function return/default contracts and
  call arguments. Stable 1.0 reports exact native Problems; a verified supporting
  Nightly clears them. The supporting Nightly also rejects `MapAdd`/`+=` when
  the added operand is positively identified as a string or the same runtime
  owner has a positively identified string-valued map; numeric maps, different
  owners and uncertain flows remain unflagged.
  Mixed/dynamic flow diagnostics remain future work rather than speculative
  errors.
  Uniquely resolved assigned functions now also receive one verified-Nightly
  diagnostic when a literal default proves a parameter is string or numeric and
  a call supplies the opposite literal kind. Dynamic arguments, absent defaults,
  ambiguous/incomplete catalogs, and stable targets remain silent; target
  changes refresh the native diagnostic collection.
- Recipes, controller forms, completion and optional AI may propose strings only
  when the active target capability explicitly permits the exact position and
  operation. Show the Nightly provenance and resulting source, validate every
  referenced command/map/function, and route edits through normal preview, Undo,
  stale-source checks and mutation ownership. Manual coding remains complete
  without the assistance.
- `Command` and `SelfCommand` discovery now describes dynamic command names from
  string-valued maps or scoped locals only when the exact project target enables
  `command.nightly-expressions`. Stable 1.0 keeps the original catalog contract;
  the tooling documents the capability but does not fabricate a dynamic source
  expression or infer which command name a runtime string will contain.
  A compact scoped-local recipe is now available only when both runtime-string
  visibility and that independent command-expression capability are enabled.
  The canonical browser remains metadata-only, while the traditional Recipe
  Library and final insertion host re-check the current full capability snapshot
  before showing, opening, or inserting any capability-specific section.
- Keep logs bounded and useful. Summaries may show an escaped, length-limited
  literal preview and exact source link; full text remains in source. Search and
  copy actions must preserve escapes/encoding without logging secrets or flooding
  Project Knowledge with every unrelated UI/debug string.

**Visibility and compatibility rule:** Nightly authoring is opt-in. When a user
selects or pins IKEMEN GO 1.0, the dedicated string-map/string-function sections,
filters, fields, recipes, completion items, quick actions and generated-code
choices are not shown in ordinary authoring UI—not merely disabled. Stable 1.0
projects must never receive string-only code from recipes, AI, migration, or
defaults. The background parser may still produce one precise compatibility
Problem when an existing file already contains positively identified Nightly-
only syntax, with source navigation and a change-engine-profile explanation; it
must not reveal the hidden authoring surface or rewrite the source. Switching
profiles refreshes all capability-derived views and invalidates stale proposals
without discarding source or silently applying retained Nightly drafts.

Required tests include numeric-only 1.0 projects with no string UI contribution;
explicit Nightly enable/disable and reload; typed and unresolved map flows;
function parameters/returns and nested calls; comments versus escaped/multiline
literals; same-name symbols in different scopes/owners; mixed or dynamic paths;
catalog/search/Used By consistency; recipe and completion filtering; stale
proposal rejection after a profile change; and no Nightly string generation for
an IKEMEN GO 1.0 target.

### JNP runtime map-injection namespace and identity contract

Any map that may be written onto another player or helper must use two explicit
namespace layers before its system and field name:

- `JNP_SHARED_...` for a versioned contract intended to work across multiple
  JustNoPoint games or templates.
- `JNP_SF6_...`, `JNP_DS_...`, `JNP_DS4_...`, `JNP_HDBZ_...`, or another
  declared game/template namespace for a contract owned by that game family.

A bare `JNP_...` name is not sufficient for remotely injected state. Existing
local-only maps are not automatically renamed; migration is reviewed system by
system. Example shared contact fields:

```zss
map(JNP_SHARED_contact_v1_sender_player_id)
map(JNP_SHARED_contact_v1_receiver_player_id)
map(JNP_SHARED_contact_v1_event_type)
map(JNP_SHARED_contact_v1_event_serial)
map(JNP_SHARED_contact_v1_game_time)
map(JNP_SHARED_contact_v1_valid_time)
```

The runtime PlayerID is stored as a value, never encoded into a map name or
packed together with ordering/serial information (for example, do not turn
PlayerID `3` and event `1` into the ambiguous value `31`). Sender, receiver,
event type, event serial, timestamp and lifetime remain separately inspectable.

Namespaced injection is an optional protocol, not a requirement imposed on
outside characters. An outside character may harmlessly carry unfamiliar JNP
maps without implementing the contract. JNP characters can consume the maps
locally. The sender also retains its own engine-derived contact identity as a
fallback and cross-check; injection and local capture reinforce one another.

The existing gameplay safeguard prevents one defender from being hit by two
characters on the exact same frame. Therefore no new simultaneous-hit priority
hierarchy, proposal queue, pre-contact reservation system, or multi-writer
arbitrator is currently required. The previously discussed Hyper/Special/
Normal priority ladder was an overdesign based on a state the project already
forbids; do not implement it unless later evidence shows the safeguard can be
bypassed.

The injected contact mailbox may remain a latest-event contract, protected by
its event serial, contact tick, sender/receiver PlayerIDs and validity time.
Sequential contacts replace older events deliberately rather than competing on
the same tick. Exact PlayerID capture is still required for Simul routing:
different defenders and attackers exist even though same-defender same-frame
contacts are prohibited.

Keep existing throw rules authoritative. A throw cannot acquire a defender who
has already been hit unless that move explicitly supports combo use. This is an
eligibility rule, not a general attack-priority hierarchy. Runtime IDs still
require validity/lifetime checks, and exact helper instances use runtime
PlayerID rather than assuming HelperID is unique.

If a future regression or new mechanic permits same-defender same-frame
contacts, first reproduce it and identify which safeguard was bypassed. Restore
or extend that guard before designing arbitration. Only add a priority system
when simultaneous resolution is an intentional gameplay requirement.

### ZSS diagnostic — unused `let` locals

IKEMaker should report a `let` local as an **Error** by default when its value is
never read through `$name` within the local's valid lexical scope. The rule is
an IKEMaker Problems/authoring diagnostic; it does not claim that IKEMEN itself
rejects the source or prevent users from saving/running deliberately retained
code.

Required behavior:

- Resolve lexical scope correctly: declaration order, enclosing/nested blocks,
  functions, repeated names in separate blocks, and shadowed locals. A `$name`
  outside the declaration's scope does not count as a use.
- Ignore comments, strings, disabled/commented source and same-name locals in
  unrelated scopes when counting references.
- Do not flag special function-return declarations until their native return
  semantics are parsed and tested; do not infer an ordinary unused local from
  text matching alone.
- For a pure unused calculation/literal, offer **Remove unused local**. Preview
  the exact edit and remove only the declaration statement.
- For `let result = call Function(...)`, preserve the call's possible side
  effects. Offer **Replace unused result with call** rather than deleting the
  entire statement. Any other expression with possible side effects receives
  explanation/manual review instead of an unsafe removal.
- Provide per-rule severity `Error` (default), `Warning`, `Information`, or
  `Off`, plus a narrow source suppression for a deliberate edge case. A global
  “remove every unused local” action requires a reviewed preview and must skip
  uncertain/effectful cases.
- Recompute after edits without stale diagnostics. Quick Fixes use exact-source
  identity, preserve line endings/indentation/comments, reject changed source,
  and participate in normal Undo.

Tests: simple unused/used locals; nested use; use before declaration; same name
in sibling blocks; shadowing; repeated ticks/blocks; comments and strings;
function parameters/return locals; direct and nested calls; multiline
declarations; malformed/incomplete code; suppression and every severity; stale
Quick Fix rejection; effectful expressions never silently removed.

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

Treat this as a separate **Resource & Data Collector** shell that is closely
connected to creation, not as another crowded collection of authoring panels.
Phase 1 reserves its stable Master Authoring Bar route, action/panel namespaces,
project/reference identities and reviewed handoff contracts, but does not build
or partially activate the Phase 2 shell. The shell may use its own saved dock
arrangements, caches and task-focused navigation while retaining Back/Forward,
Related Work and explicit links into the active IKEMaker project.

The creation bridge is evidence-first and review-gated. Notes, claims, captures,
measurements and recovered resources may link to characters, moves, assets,
contracts, recipes, tests and source locations. Creation screens may open the
related evidence and request a reviewed proposal; the collector may open the
exact destination editor with source and provenance attached. Nothing collected
silently edits game files, becomes a project rule or replaces authored values.
Every handoff records source/revision, ownership, confidence, units/coordinates,
license or redistribution limits, transformation history, conflicts, target
compatibility and review status. This contract must also support later GIF,
emulator, screenshot, document, community and structured-data adapters without
embedding those implementations in the Phase 1 shell.

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

#### Vampire Savior Recomp reference intake

Reference: <https://github.com/tmcleroy/vampire-savior-recomp>, reviewed
read-only on 2026-10-16. It is a GPL-3.0-only static-recompilation project for
one CPS-2 game. Use its interaction patterns and validation strategy as
clean-room research. Do not copy its code, fixed addresses, ROM-derived tables,
or Vampire Savior hardware assumptions into IKEMaker, and do not make it a
dependency. Detailed acquisition/runtime-reconstruction follow-ups belong to
IkeMiner's `docs/Runtime-Reconstruction-Research-Backlog.md`; IKEMaker owns only
the reviewed authoring, visualization, comparison, and Apply side.

Useful IKEMaker follow-ups not already captured by the Palette Workshop intake:

- Extend the cohesive SFF/AIR animation preview with an optional **Play all**
  route, configurable last-frame hold/repeat delay, slow-motion choices, plain
  or stage background, foreground-occlusion preview, scale presets, and the
  existing arrows/slider/playhead. These are specialist body/browser controls,
  not new universal-toolbar buttons. They reuse the current AIR/SFF authority
  and make no claim that a visual preview exactly reproduces engine object
  composition until physically validated.
- Let Stage tools preview an empty stage with bounded manual/automatic camera
  scrolling, foreground/background layer visibility, and selectable configured
  music where the existing Stage model proves those fields. Do not infer layer
  order, camera bounds, parallax, or sound ownership from appearance alone.
- Accept provenance-complete frame-meter and move-log packages from IkeMiner and
  compare them with authored AIR/CNS/ZSS expectations: startup, active,
  recovery, hit/block advantage, hitstop, actionable ticks, collision, and
  animation frame. Present source measurement, target authoring, and actual
  IKEMEN test evidence as three distinct columns. A measured discrepancy becomes
  a review item, never an automatic edit.
- Add capability-aware training/capture recipes for frame step, pause, slow
  motion, reset position, save-state identity, input record/replay, guard and
  reversal tests, hitboxes, input history, and health reset. IKEMaker may launch
  or explain a recipe only through an explicitly supported runtime profile;
  IkeMiner owns capture evidence and the engine remains the physical authority.
- Generalize searchable feature definitions: stable IDs, category, title,
  explanation, choices, mutual exclusion, engine/build requirements, default,
  and session-only versus persistent scope. Project/user presets must retain
  explicit differences instead of overwriting unrelated configuration. This
  complements the existing Stable 1.0/Nightly capability catalog and must not
  expose Nightly-only authoring choices to a user pinned to 1.0.
- Preserve comments, order, unknown keys, and unrelated text when a reviewed
  settings/profile writer changes one value. Session-only preview settings never
  leak into project files. All writes use existing mutation/history owners and
  stale-source checks.
- Reuse input hashes, decoded semantic comparison, and earliest-divergence
  reporting in SFF, SND, palette, shader, code-generation, and runtime-test
  verification. Compressed bytes need not match when the declared contract is
  decoded semantic equality; always retain physical hashes and explain which
  comparison passed.
- The reference shader utility is a build-time GLSL-to-SPIR-V/Metal packaging
  script, not a visual generator. Consider its multi-backend compilation pattern
  only as a later Shader Workshop export adapter: preserve editable source,
  compiler/tool versions, diagnostics, generated hashes, target platform, and a
  source fallback. Never present successful compilation as IKEMEN runtime proof.
- Retain the user-owned-data pattern for every source-game handoff. IKEMaker can
  consume reviewed metadata, images, palettes, and measurements but does not
  distribute or silently reconstruct copyrighted game assets.

Acceptance: these additions must reuse the canonical viewer toolbar/browser and
selection contracts, remain optional for traditional text-only users, preserve
source/target/provenance distinctions, gate unsupported runtime capabilities,
and require real installed IKEMEN evidence before claiming preview or generated
behavior parity.

### Animated GIF data collection bridge

Status: PHASE 2 RESEARCH. GIF conversion, including further development of the
existing timing converter, belongs to this deferred group. Existing installed
behavior may remain available, but it is not an active Phase 1 development item.

Scope clarification, 2026-10-04: broad Source Game Lab inference remains Phase
2, including multi-track P1/P2/contact/FX reconstruction. The narrow SFF Creator
intake route is no longer blocked on that research: after it has already decoded
and reviewed a GIF's exact frame sequence for SFF/PNG output, it may optionally
reuse the existing proven tick-aware conversion to hand those same frames and
source delays to the established AIR New Animation/storyboard owner. This does
not infer gameplay timing or add a second AIR writer.

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

## Phase 1 — Character-owned UI through Helper and Explod tools

Status: explicitly added to Phase 1 by JNP on 2026-09-26. Implement in bounded,
reviewed slices after the current Move Lab checkpoint; SF6 is the primary coder.
Preserve the 35% usage reserve. No installation, release, push/upload, desktop
control, or real character/game edits are authorized by this backlog entry.

Provide an optional Character UI workflow within the existing Helper Lab,
Explod Composer and UI tools. Reuse their visual controls, source navigation,
drafts and mutation services rather than adding another competing editor.
Helpers remain optional; support direct Explods, helper-owned visuals and
custom code without forcing maps, constants, naming conventions or conversion.

### First slice: generator consistency

The 0.79.5 CNS Explod generator parity correction now preserves the supported
facing, palette, transparency, hit-pause, remove-on-hit and timeline-create
settings emitted by its ZSS counterpart. Installed engine behavior remains a
runtime test boundary. The broader character-owned UI work below remains open;
it must not regress this shared generator contract. Previously the generator omitted
settings emitted by its ZSS counterpart,
including own palette/remapping, transparency, facing and hit-pause/removal
options; timeline event coverage also differs. Compare every exposed setting
and supported event against both output paths. Emit valid equivalents for the
selected engine/syntax, or clearly identify unsupported settings before Apply;
never silently drop them. Keep classic MUGEN versus IKEMEN engine support
separate from the choice of CNS versus ZSS syntax. Preserve user-authored code
and require explicit reviewed Apply. Add focused output/parse tests using
nondefault settings and event sequences. This is a source-inspection finding,
not a verified installed-build defect report.

### Character UI composition and integration

- Add contextual visual preview for native `text{}` blocks. From a code/text
  editor, the default route should open a compact window/panel focused on the
  selected block rather than forcing the entire Character UI or Explod lab
  onscreen. Preview the literal text and its `font`, `align`, `pos`, `scale`,
  `layerno`, and `removetime` behavior, including a visible P1/P2/team-side
  toggle for expressions such as `ifElse(teamSide = 1, ..., ...)`. Provide an
  explicit **Expand to Full UI/Spatial Lab** action for animation, ownership,
  lifetime, binding, multi-element, and advanced composition work.
- Apply the same compact-from-code interaction pattern to Explod, Helper, and
  native Projectile blocks. The selected source block determines which focused
  fields and overlays appear:
  - **Explod:** sprite/AIR animation, position and coordinate space, facing,
    scale, palette/remap, transparency, layer, bind behavior and lifetime.
  - **Helper:** owner/parent/root relationship, helper ID, position, facing,
    animation, scale, binding/persistence and the subset of behavior actually
    declared by the selected helper creation site.
  - **Native Projectile:** projectile/removal/hit animations, position,
    velocity/acceleration, facing, scale, collision/contact information and
    actual native projectile lifetime/removal behavior.
  Each compact preview provides an explicit route to its established full
  Helper Lab, Explod/Spatial Composer, Projectile inspector/editor, or shared
  Character UI composition workspace. Do not open every lab option merely to
  inspect or adjust a small selected block.
- Keep native text, Explod, and helper-owned UI as distinct source/controller
  types, and keep native Projectiles distinct from Helpers, even when they
  reuse the same spatial canvas, coordinate controls, collision overlays and
  preview infrastructure. Do not convert a `text{}` block into an Explod,
  require a helper merely to preview it, or redirect a native Projectile into
  Helper Lab under fictional helper semantics.
- The compact preview must identify screen-space/local-coordinate assumptions,
  screen size, anchor produced by `align`, evaluated P1/P2 position, scale,
  layer order, and authored lifetime. Allow side-by-side or toggle testing of
  common aspect ratios/localcoords without pretending arbitrary expressions
  can always be evaluated statically; retain and display unresolved source
  expressions for runtime verification.
- Changes made from the compact window remain drafts tied to the exact source
  block. Applying uses the established stale-source checks, Auto Save policy,
  undo/history, and exact-source mutation owner. Closing, expanding to the full
  lab, or returning to code must preserve the draft and source selection.
- Treat the current Counter Hit / Punish Counter `text{}` display in the SF6
  template as temporary validation scaffolding, not the intended final UI.
  Its purpose is to verify the authored hit-classification event contract until
  finished screenpack graphics consume the published event maps. Preview and
  source tools must preserve that explanation. The eventual graphical
  replacement should be able to reuse the same event contract and preview
  positioning without forcing the temporary literal text to remain or silently
  rewriting the gameplay/event-publishing logic.
- Compose character-owned icons, meters and multi-part overlays using existing
  sprite/palette/AIR selection and Explod positioning, layers and animation
  controls. Provide optional reusable starting examples with editable code.
- Expose screen-space versus character/world-relative placement clearly, with
  local-coordinate scaling and sample player/team layouts. Preview multiple
  owners, mirrored sides and camera changes; do not assume a two-player match.
- Connect display values and visibility conditions to existing maps, vars,
  constants or functions. Retain source expressions and owner context; a visual
  binding is not permission to create storage or rewrite the user's logic.
- Make create/update/remove lifetime, owner identity, duplicate-spawn guards,
  round reset, KO/state transitions and pause behavior reviewable. Avoid
  imposing ordinary move-state cleanup on a persistent HUD.
- Offer exact contextual routes among Helper Lab, Explod Composer, AIR, SFF,
  palette and the visual UI editor. Preserve source block/action/frame/archive,
  selected UI element, independent drafts and return location. Reuse the
  stage/screenpack asset integration where applicable, while distinguishing
  character-owned visuals from screenpack-owned elements.
- Retain the screenpack character-UI bridge as an optional integration path;
  it is not yet a complete helper/Explod HUD designer. Refresh dependent
  previews after explicit edits without replacing unrelated layout drafts.
- Keep advanced options collapsible, remember visibility, support keyboard
  use, and respect Player/Simple/Workspace availability. Experienced authors
  must retain full source access and their preferred implementation method.

Acceptance: fixtures for direct Explod UI and helper-owned UI; CNS/ZSS output
with nondefault supported properties; exact archive/action routing; owner/team
selection; localcoord/facing/camera preview; explicit Apply/Undo, stale-source
rejection and draft retention; no automatic source/project/backup creation.
Any necessary temporary workflow must notify the user. Engine behavior and
installed visual QA must be recorded separately from source/fixture checks.
Do not claim a full runtime simulation or ship all slices as one large rewrite.

## Phase 1 — Cohesion and shared capabilities across all labs

Status: explicit JNP requirement, 2026-09-26. Apply incrementally to every lab,
including Move, Helper, Explod/Spatial, Throw, AIR/SFF/Palette/SND, Stage and
Screenpack/UI workspaces. Extend this inventory when another lab is touched.
This is not an instruction to rebuild every screen at once or place every
option in every lab. SF6 remains primary coder; preserve the 35% reserve and
existing local-only/review boundaries.

- Use consistent names, placement and behavior for selection, search, preview,
  playback/frame stepping, zoom/reset, source access, Problems, Apply/Undo,
  draft/conflict status and related-tool navigation wherever applicable.
  Share tested controls/services rather than maintaining lookalike copies.
- Carry exact project/character or stage/UI owner, source identity/version,
  component, action/frame, sprite/palette/sound and return location between
  relevant tools. Never substitute an unrelated active editor, guessed archive
  or same-numbered object. Show unresolved/ambiguous targets for selection.
- Let capabilities benefit other labs in context: map/value/function pickers,
  usage information, sprite/palette selection, animation preview, sound audition,
  diagnostics and connected-code editing. Prefer compact inspectors/internal
  sections with optional full specialist access over repeated top-level screens.
- Apply general UI preferences consistently (labels, keyboard conventions,
  applicable visibility choices). Retain task-specific camera/playback/layout
  state per owner/view; do not blindly copy coordinates, zoom or hidden sections
  between incompatible tools. Honor Player/Simple/Workspace access.
- Preserve independent drafts, focus, selection and history on navigation.
  Explicit applied changes and Undo refresh affected previews/diagnostics
  without overwriting other drafts; source changes surface conflicts. Shared
  context never authorizes writes or means all editors share one mutable draft.
- Keep one mutation owner for each data type, explicit reviewed Apply and
  existing user Auto Save preferences. Opening, selecting, previewing or switching
  labs must not silently create/modify project files; notify necessary temporary
  workflows. Preserve advanced source access and alternative coding methods.

For each bounded implementation, record a small capability/ownership matrix:
what the lab owns, what it reuses, what it exposes to others, exact selection
and draft authority, and remaining gaps. Prioritize the user's active workflow
and existing correctness gaps before adding features. Validate at least one
real cross-lab round trip with unsaved drafts and exact return selection, plus
stale targets, owner changes and applicable keyboard/visibility behavior.
Track installed visual/engine QA separately; no blanket all-labs completion
claim from isolated helper tests. This requirement supplements the Move Lab
consolidation plan and character/stage/screenpack UI integration scope.

### Move Lab as the reference for lab integration — JNP expansion

Explicit JNP direction, 2026-09-26: the combined JNP Constants/Move Lab should
be the strongest example of cohesive editing, and its useful capabilities
should improve the other labs as they are extended. Treat its intended rich
workflow as the reference, not a claim that consolidation or installed QA is
already complete. Reuse proven parts; fix known preview issues before copying.

Concrete Phase 1 requirements:

- Helper creation includes the existing map browser/picker directly in its
  creation form, with reviewed insertion/initialization in the generated-code
  preview. Support existing maps and explicitly requested new entries, values
  or expressions, project/author/game scope, and selected helper versus
  parent/root ownership. Distinguish reading an existing map, initializing a
  helper-local map, inheriting data and writing to another owner. Do not create
  registry entries or modify shared code as a side effect of selecting a map.
  Maps remain optional; preserve vars/constants/custom code alternatives.
- Provide the same contextual map insertion in embedded code editors as in
  full coding screens. Preserve caret/selection, language syntax and draft
  revision; insertion first changes the draft, with source changes only on
  explicit Apply. Reuse existing searchable descriptions, examples and usage
  references rather than another map catalog. No unrelated SF6/DvS/DS4/HDBZ
  namespace leakage or forced naming conversion.
- Helper and Explod previews show their position relative to root, with
  clearly labeled root/parent/self/target axes as applicable. Root and parent
  must remain distinct for nested helpers. Display authored offset and derived
  world/screen position separately; respect facing, bind ownership/duration,
  coordinate space and localcoord. Switching the comparison overlay must not
  rewrite authored placement. Allow selecting the relevant root/owner in
  multi-player/team scenes; unresolved dynamic bindings stay visibly unresolved.
- Reuse HitDef information, selected/shared source attribution, diagnostics and
  exact editing routes for helpers or other components that actually attack.
  Preserve multiple HitDefs and conditional/shared-function relationships.
  Visual-only Explods must not gain a fictional HitDef; show the connected
  helper/controller's contact information when explicitly associated.
- Bring Move Lab-style P2/reaction preview into applicable helper/projectile
  workflows: choose attacker/root/helper and opponent, AIR action/frame,
  placement and contact/reaction settings. Reuse the shared scene transform,
  sprite/palette lookup and timing controls. Keep P1/P2 positions stable in
  world coordinates through zoom/pan/resize and retain scene state on return.
  Clearly label static/authored reaction estimates and unresolved behavior;
  do not present this as execution of arbitrary game code or accurate engine
  collision/AI/simul simulation without separate evidence.
- Reuse connected editable code sections, problem navigation, explicit Apply,
  shared-value impact and optional full specialist access. Retain independent
  drafts when selecting another helper, Explod, move or opponent. Default to
  only relevant sections, with advanced controls available and hideable.

Order within bounded follow-on slices: map selection/insertion at helper
creation and embedded editors; root-relative position overlays; contextual
HitDef sections; shared P2/reaction preview. Reuse the combined Move Lab's
services and contracts rather than copying its whole screen. Each slice must
include focused tests for the actual host/client interaction: correct map
owner/namespace and insertion target, nested helper parent versus root,
screen/stage placement and facing, no source writes on preview, stale source
rejection, draft retention and exact return, then applicable P2 zoom/contact
fixtures. Installed/engine QA remains separately tracked. Continue current
reviewed work first; preserve the 35% reserve and no-release boundaries.

### Preferred architecture: one Move Lab with component views

Status: explicitly approved by JNP for Phase 1, 2026-09-26. This refines and
supersedes earlier wording that could imply expanding several overlapping
Helper/Explod/Projectile labs independently. Preserve the capability inventory
and staged migration, but target one user-facing Move Lab with selectable
component views. Existing specialist code/services may remain separate behind
the interface; do not undertake a wholesale rewrite to achieve shared UI.

- A move/component list presents its main state and associated helpers,
  Explods, projectiles and functions. Select a component through an in-workspace
  button/list or an Edit in Move Lab action on its creation controller.
- Selecting a component changes the relevant inspector and connected code,
  retaining the shared scene, timeline, map picker, diagnostics and opponent
  context where applicable. Helper controls cover ownership/state/maps/binds/
  attacks; Explod controls cover animation/placement/palette/layers/lifetime;
  projectile controls cover supported movement/contact/collision/removal.
- Keep Add Component separate from selecting an existing component. Changing
  the view is navigation only: never convert helper to projectile, rewrite code,
  create files or change ownership merely because a button/tab was selected.
- Existing lab commands become compatible entry points into the appropriate
  component view as parity is achieved. Keep optional separate windows for
  authors who prefer them; retain genuinely distinct full asset/UI/graph tools.
  Do not remove a specialist route before its unique capabilities, drafts and
  deep links are preserved in the shared workflow.
- A move can contain multiple components of the same type and mix code styles.
  Resolve by exact owner/source/controller identity, never type or numeric ID
  alone. A helper may create another helper or Explod; show root, parent and
  creator separately. Dynamic or shared associations remain explicit candidates,
  not automatically inferred ownership.
- Existing mutation services retain authority, conflict checks and independent
  drafts. Select/create/apply remain distinct actions. Each component remembers
  its selection/view state without replacing the common scene or another draft.

Migration refinement: finish/review the current bounded Stage A checkpoint.
Then extend the shared shell/selection contract to component views, reusing
existing helper/spatial/HitDef services in small slices instead of building
parallel new screens. The direct-code/mixed-source Stage B requirements remain.
Review how this affects data/Move-Lab-Consolidation-Plan.md before broadening
implementation; do not declare the current routing foundation a completed merge.
Verify legacy entry points, exact controller -> component -> return, multiple
same-type components, nested ownership, retained drafts, stale sources, optional
windows and zero writes on view switching. Preserve all existing acceptance,
35% usage reserve and no installation/publication/game-edit boundaries.

## Phase 1 closeout and milestone scheduling — JNP clarification

Authoritative scheduling update from JNP, 2026-09-26. This overrides earlier
blanket deferral/scheduling wording for the four items below without reopening
all deferred expansions. Keep Phase 1 focused on agreed workflows, integration,
redundancy removal and concrete user needs; preserve the 35% usage reserve.

1. Guided Flow Mode: needed when Ryu, Demitri, Morrigan and Goku are closer to
   completion. Derive optional, game-specific flows for additional characters
   from those proven authoring workflows. Do not design a generic mandatory
   tutorial prematurely or treat the feature as cancelled. JNP's experience and
   recognition-based working style remain the design basis. This is a milestone
   dependency, not an instruction to start now or a scheduled automatic task.
2. Broader Project Data browsers: needed as work moves into specials. Prioritize
   the categories actually needed then (for example function calls, states,
   helper/projectile IDs and values), using the existing reusable browser and
   contextual pickers. Do not wait for an arbitrary usage-exhaustion window;
   do not implement every category now. Preserve owner/project/game identity
   and exact source links.
3. Recognition/reuse tools: useful even at the current stage and eligible for
   bounded near-term Phase 1 work when tied to an actual authoring task. The
   existing personal example shelf is already implemented; improve access and
   reuse rather than recreate it. Prefer searching existing project examples
   by user labels/intent and comparing a selected block with a known working
   reference in the existing coding/Move Lab UI. Show dependencies and source
   ownership. Keep source editable and insertion explicit. No blanket approval
   here for semantic/AI search infrastructure, automatic adaptation or a new
   standalone browser; evaluate those only against a concrete need. Do not
   interrupt a half-finished reviewed slice to start optional work.
4. QA report website: needed when Ryu, Demitri, Morrigan and Goku are closer to
   completion, supporting QA and repeatable work on additional characters for
   each game. This milestone refines the prior 'after a future release' wording;
   no immediate website build or deployment is requested. Use actual issues
   and testing needs from those characters to shape the reporting/integration.

These features remain recorded with explicit timing, not removed from the
roadmap. The later character milestones and specials trigger do not silently
become requirements for the current Phase 1 closeout checkpoint. Assess whether
an individual recognition/reuse improvement is worth doing now based on a named
workflow obstacle and a bounded acceptance check; retain current no-install/
no-publication/no-game-edit boundaries. Phase 2 and tournament timing are
unchanged by this clarification.

## Phase 1 — AIR editor bulk Clsn2 access and transition classification

Implemented and source-reviewed locally in IKEMaker 0.79.4. Both entry routes
now share one proposal/review/Apply owner with effective-default semantics,
editable transition/custom roles, explicit exclusions, scoped remembered
assignments and stale-source rejection. All 324 test files passed on the final
source contents. Installed UI/engine/Undo verification remains pending. Owner
discovery is deliberately bounded to nearby/ancestor on-disk DEF files rather
than claiming exhaustive project-wide or unsaved-DEF ownership discovery.

Explicit JNP workflow request, 2026-09-26. Existing air.batchApplyClsn2 currently
requires an active AIR text editor and selected Clsn2 text. Its action-heading
filter is a substring match for crouch/jump, which can misclassify transitions.
Expose the same reviewed bulk operation directly in the visual AIR editor's
collision tools, with a visible Bulk Apply Clsn2 action and existing text entry
kept compatible. Use the current selected frame's effective Clsn2 (including
inherited defaults) or an explicitly selected source; require clear source and
target previews. Reuse the mutation service; do not fabricate a text selection
or rely on whichever text editor happens to be active.

Classification must distinguish AIR action numbers from SFF sprite group numbers.
Use explicit user/project action-role overrides ahead of optional known-number
suggestions and name hints. Never require renaming animations. Show a compact
review of transition/ambiguous action assignments before bulk Apply, allowing
custom numbers, manual exclusions and alternative methods. Remember mappings
only through an explicit preference choice, without creating project sidecars
silently or repeatedly asking for mappings already confirmed for this scope.

JNP's requested transition convention:
- Stand -> crouch: crouching Clsn2 from animation element 1 onward.
- Crouch -> stand: standing Clsn2 from animation element 1 onward.
- Jump start: grounded startup, not part of the airborne/jump bulk set merely
  because its name contains 'jump'. Offer standing/source-selected startup
  boxes for review; custom projects may choose otherwise.

The current local standard action-name table identifies 10 (crouch transition),
12 (rise from crouch) and 40 (jump start). Present these as editable suggestions,
not universal enforced ownership. 'Frame 1' here means first AIR element, not
elapsed game tick. An assignment applies from that first element, not only to it.
Named-filter matches must not override an explicit transition classification.

Before explicit Apply, show source boxes, classified action numbers/names,
element ranges, excluded/ambiguous actions, operation (replace/append/default/
clear) and changed-action count. Cancel changes nothing. Respect inherited
Clsn2Default semantics, preserve Clsn1 and unrelated timing/offset/flags, reject
stale source and retain pending visual-editor drafts. Keep this available in
applicable authoring modes without requiring text-mode navigation. Focused tests:
misleading names, actions 10/12/40 and custom mappings, first-element transition
rules, inherited boxes/default versus per-element behavior, exclusions, stale
source, explicit Apply/Undo and no writes on opening/review. SF6 implements in
a bounded slice after the current correction checkpoint, preserving the 35%
reserve and existing no-install/no-publish/no-desktop-control boundaries.

### Shared bulk Clsn2 rules across text and visual AIR editors

Explicit JNP clarification, 2026-09-26: both text-editor and visual AIR-editor
entry points must use the SAME classification, action-role overrides, transition
exceptions, exclusions, target selection and reviewed mutation logic. This is
not a visual-editor-only correction. Keep existing text-selected Clsn2 input
and visual selected-frame input as source adapters into one shared operation.
Given identical source boxes, action mappings, element scope and operation,
both entry points must propose the same target actions/elements and exact AIR
edit. Use the same scoped explicitly saved preferences and review explanations;
neither path should require renaming animations or silently fall back to the
old crouch/jump substring behavior when an override exists. Add parity fixtures
covering actions 10/12/40, custom numbers and misleading names, explicit
exclusions, inherited defaults, preview/cancel and stale-source rejection.

## Phase 1 — Command editor access and Home-screen discoverability

Explicit JNP approval, 2026-09-26, following tester difficulty finding the
Command & Movelist editor. This is concrete closeout feedback, not a new editor.

- Provide an obvious Open Command & Movelist Editor action from the CMD text
  editor, not only a right-click menu or global command. Reuse the existing
  command/editor through an editor-title action or equivalent visible affordance;
  retain context-menu and Command Palette access. Audit existing contributions
  first and improve their visibility/conditions rather than duplicate them.
- Carry the actual CMD document and owning character/project into the editor;
  select the command under the caret when unambiguously resolvable. Respect
  unsaved document contents. If the CMD is shared across characters, resolve or
  ask for the owner instead of guessing the nearest unrelated character.
  Return to the same source location without losing visual or text drafts.
- Keep Commands / Movelist easy to find in character tools and related-work
  navigation, with consistent labeling. Apply in applicable authoring modes;
  do not require Workspace mode just to find a tool already allowed in Simple.
- Audit Home after mode selection/tool launch: the tester screenshot showed
  Workspace mode already active and Home occupying a narrow editor split.
  Home must not behave like an unfinished mandatory mode prompt or persistently
  consume an unwanted split. Prefer revealing the chosen tool in the intended
  editor group and an easy dismiss/return-to-Home route. Do not force-close
  user-pinned Home or rearrange user layouts without explicit action/preferences.
  Do not assume this older 0.78.0 screenshot reproduces in the current build.

Focused acceptance: CMD title/context entry visibility by supported mode;
correct current document/caret command; shared CMD owner ambiguity; dirty source;
existing editor reuse/return and retained drafts; Home mode selection then tool
launch without an extra forced split; no source writes from opening/navigation.
Reuse established navigation/mutation owners. Finish the active B1 correction
checkpoint first, preserve 35% reserve, and retain no-install/no-publication/
no-desktop-control boundaries. Source inspection is not installed UI QA.

## Phase 1 clarification — Move Lab covers all character behavior

JNP clarification, September 26, 2026: Move Lab is the centralized character
coding workspace, not an attacks-only editor. This supersedes the older basic
movement deferral for Phase 1 scope. Flow Mode remains a separate deferred
feature that supplies an optional production order; its deferral must not defer
ordinary non-attack authoring in Move Lab.

Cover standing/idle, turning, walking, crouching/transitions, jumping/landing,
running/dashing, guarding, gethit/recovery and attacks, plus custom states and
associated functions/components. A state must not require a HitDef, JNP
constants, a standard state number or an inferred matching AIR number to be
opened and edited. Respect existing user coding styles and explicit ownership.

Reuse the unified workspace's connected code, source navigation, animation and
Clsn editing, constants/maps access, diagnostics and applicable component tools.
Show relevant inspectors for the selected behavior; collapse or omit attack-only
controls for non-attacks. Users should be able to inspect and edit the connected
behavior without routinely opening separate editor tabs. Keep optional separate
editors available. Preserve independent drafts, exact source ownership, explicit
Apply, undo and return context; reuse established mutation services.

This extends the existing Move Lab consolidation, not a new parallel lab or a
requirement to emulate the entire engine. Identify unsupported/dynamic behavior
honestly. Before final Help and release, SF6 must include this scope in the finite
closeout inventory and distinguish implemented capability from remaining work.
Do not call direct-HitDef inspection full coverage. Use representative non-attack
fixtures and mixed/custom state cases to verify no-HitDef entry, editing and
context retention. Preserve the 35% usage reserve; report scope/budget constraints
rather than silently deferring this requirement or starting unrelated backlog.

### Flow Mode clarification — user-defined production flows

JNP clarification, September 26, 2026: Flow Mode lets users define their own
production flow. JNP will create a flow for his team to help keep development
on course; that flow also serves as an editable example, not a mandatory or
universal sequence. Users can create, reorder, adapt and reuse their own steps
and choose the appropriate flow for their game/project or team.

Steps should connect to the existing authoring tools and relevant project work,
with optional instructions/checklists and completion criteria. Keep reusable
flow definitions separate from each character's progress. Support sharing a
team flow and explicitly adopting revisions without silently replacing local
customizations or resetting progress. Users remain free to skip steps, work
out of order, or work without a flow; do not gate editing or enforce a coding
method. Any saved/shared flow files require an explicit user action.

This refines the previously approved deferred Flow Mode scope and supersedes
wording suggesting a fixed built-in production order. JNP's example should be
derived from the proven Ryu/Demitri/Morrigan/Goku workflows at the agreed later
milestone. It does not add Flow Mode implementation to current Phase 1 closeout.

## Phase 1 closeout — consistent viewer and destination colors

JNP approved this presentation update September 26, 2026 and delegates color
choices to implementation judgment; no mockup/example approval is required.
Keep the preferred dark appearance with subtle identity accents, not saturated
full-screen backgrounds. Use one shared destination-color registry so a button
leading to Sprites/SFF is green everywhere and matches the destination viewer.
Start with restrained families: sprites/SFF green, AIR/animation blue, palettes
violet, sound amber, Move Lab/code teal, stage/layout ochre and screenpack/UI
indigo. Tune actual shades for contrast and distinguishability; related views
may share a family. Do not create unique arbitrary colors for every utility.

Apply light tinting to headers, selected tabs, borders and section accents;
use stronger accessible accents for important destination buttons. Keep
secondary actions quiet. Color reflects destination, not the originating
screen. Preserve consistent Save/Apply/Cancel behavior and reserved error,
warning and success styling. Keep sprite/palette/code preview surfaces neutral
so displayed artwork colors remain reliable. Retain text labels and visible
keyboard focus; no information may depend on color alone.

September 27 visual clarification from the installed SFF and especially SND
viewers: the large non-preview areas surrounding the viewer should also receive
the destination's extremely dark, low-saturation tint. This includes outer
workspace gutters, toolbar bands, column backgrounds, inspector/help regions,
and the otherwise broad gray/near-black areas between controls. SND should read
as a subtly warm amber-charcoal workspace, SFF as a dark green-charcoal, AIR as
a dark blue-charcoal, and other mapped destinations should follow the same
family. Use layered near-black values rather than a flat saturated fill so
panels remain distinguishable and the hue is felt more than noticed.

The surrounding chrome follows the identity of the viewer currently open;
cross-workspace buttons still follow their destination. Therefore an SFF viewer
uses green-charcoal chrome while its Animations button remains blue, and an AIR
viewer uses blue-charcoal chrome while its Sprites button remains green. Apply
this ownership rule consistently to every mapped viewer family.

The intended usability outcomes are immediate recognition of which workspace is
currently open and less gray monotony during long authoring sessions. A user
should be able to identify AIR, SFF, SND, palette and other mapped viewers from
their peripheral chrome without reading the tab title, while the restrained
near-black treatment remains comfortable for hours of work. Review prolonged
use and rapid viewer switching as acceptance checks, not merely screenshots.

Do not tint the actual visual evidence: sprite/animation canvases, checker or
proof backgrounds, palette swatches, waveforms and other media previews remain
neutral or retain their authored/configured background. Inputs, validation,
selection, Save/Apply/Delete and warning/error states also retain their semantic
contrast. The `off` preference must restore the surrounding chrome to neutral.
Judge the result at ordinary brightness and in long sessions; reduce saturation
before reducing legibility if a destination family becomes distracting.

Use shared styling/navigation infrastructure, support a neutral/off preference,
and respect light/high-contrast themes. Do not override user theme globally or
change editor-group layouts. Verify representative narrow layouts, text/focus
contrast, destination consistency and neutral artwork rendering. Refresh Help
screenshots after this presentation change, before the release. This is a
finite Phase 1 visual-cohesion item, not a redesign or new screen family.

### Resizable viewer height and bottom splitter

JNP requirement recorded September 27, 2026. Viewer/canvas regions are becoming
too short as more controls and information are added beneath them. Applicable
viewer screens must provide a clear horizontal resize border directly below the
viewer. Dragging that border downward expands the viewer and pushes every lower
feature down in normal document flow; lower controls must not overlay the viewer,
be clipped, or be compressed to keep the original overall height. The containing
screen may scroll when the expanded layout is taller than the available editor.

Dragging upward may reduce the viewer only to a useful documented minimum. The
handle must have a visible hover/focus affordance and resize cursor, must not
steal canvas pan/object-drag gestures, and should support keyboard adjustment as
an accessible separator. Provide a direct reset-to-default action, such as a
double-click or nearby menu command, instead of requiring precise reverse
dragging. Remember the chosen height for the relevant viewer type and layout
without copying it blindly between incompatible tools or owners.

This is view state only. Resizing must not alter authored coordinates, object
placement, camera/world positions, zoom, selected frame, drafts, or source files.
The canvas should redraw into the new viewport while retaining its existing
camera and Fit/100% semantics. Apply the shared splitter behavior to viewer
surfaces with stacked controls—including Move Lab/Constants, AIR, HitDef, Helper,
Explod/Spatial, Throw, SFF/SND, Stage, and Screenpack—when each surface is touched.
Verify upward/downward dragging, minimum and reset behavior, persistence, narrow
editor widths, scrolling, keyboard focus, and no draft or selection loss.

### Whole-editor vertical scrolling below the viewer

Universal JNP viewer requirement clarified September 27, 2026 from the SFF
workspace. Every viewer's custom-editor page as a whole must scroll vertically.
The preview/canvas must be allowed to move above the visible editor area so the
user can scroll down and bring all controls, timelines, Groups, Sprites,
palettes/preview controls, Inspector, Tools, guidance, and other lower sections
into a comfortable working position. Lower features must never be trapped in the
short remainder of a fixed-height viewport beneath a permanently visible canvas.

This is an outer editor-page scrollbar, separate from internal list or inspector
scrollbars. Avoid nested wheel traps: ordinary wheel, trackpad, Page Up/Down,
Home/End, and keyboard focus movement must allow the outer page to reach all
lower content. Focusing a lower control should reveal it without changing canvas
zoom, camera position, selected sprite, drafts, or authored data. Coordinate this
with the planned viewer-height splitter: expanding the viewer increases the page
height and pushes lower features down, while the outer editor remains scrollable
past the viewer. This must be implemented and verified across all viewers,
including SFF, AIR, SND, Move Lab/Constants, HitDef, Helper, Explod/Spatial,
Throw, Stage, Screenpack, and any present or future preview-based workspace. Do
not claim shared viewer coverage while any viewer remains fixed-height or traps
its lower controls.

### Approved destination-color mapping — JNP sign-off

September 26, 2026: JNP explicitly signed off this mapping, superseding the
initial suggested families above:

| Destination | Identity color |
| --- | --- |
| Sprites / SFF | Green |
| Animations / AIR | Blue |
| Palettes | Violet |
| Sounds / SND | Amber |
| Move Lab | Teal |
| Code editors | Slate blue |
| Stage editor | Ochre |
| Screenpack / UI editor | Indigo |
| Project Data / Maps | Cyan |
| Help | Neutral silver |

Destination determines the accent everywhere: every button opening AIR uses
prominent blue regardless of its originating screen; AIR itself uses a subtle
dark-blue identity tint. Apply the same rule to all mapped destinations.
Save/Apply/Delete and warning/error semantics remain consistent action styling,
not destination colors. Exact accessible shades remain implementation judgment.
All previously recorded neutral-canvas, optional-off, theme, focus and Help
screenshot sequencing requirements still apply. No further design approval is
needed for this mapping.

## Phase 1 checkpoint and next-week handoff — 0.79.6

Checkpoint recorded September 26, 2026. Move Lab Stage B2 now lists and opens
the exact assigned CNS/ZSS StateDefs and ZSS Functions as first-class behavior
components, including non-attacks with no HitDef or constants profile. Editing
uses the existing retained connected-code draft service, explicit Apply,
discard/rebase conflict handling, the normal open-document Undo/Save flow,
shared-source disclosure, contextual Maps access, and exact source identity.
It does not infer AIR actions or behavior ownership from state numbers. The full
325-file automated suite passes. Installed visual interaction is still manual
QA and is not implied by source tests.

Resume Phase 1 next week in this order:

1. Finish specialized Move Lab component views for exact Helper, Explod and
   native/Helper projectile creation sites, including root/parent/P2 context.
   Reuse each established specialist mutation owner; selection must not create
   or convert code.
2. Add embedded exact AIR/Clsn access and the remaining field-level HitDef
   presentation only after their current guarded edit services can be reused.
   Missing or dynamic assets remain explicit and never guessed.
3. Complete Stage and Screenpack contextual asset editing without replacing
   their existing save/draft owners.
4. Correct CMD entry from the current document/caret, shared-owner ambiguity,
   selection restoration and Home routing. Preserve dirty documents and reuse
   the existing editor.
5. Implement the approved shared destination-color registry: SFF green, AIR
   blue, palettes violet, SND amber, Move Lab teal, code slate blue, stage
   ochre, screenpack/UI indigo, Project Data/maps cyan and Help neutral silver.
   Verify narrow layouts, themes, focus and neutral artwork surfaces.
6. Finish contextual Help, direct navigation and refreshed screenshots only
   after destination colors and layouts stop changing.
7. Run installed-package QA for the five release artifacts: launch and version,
   StateDef/Function selection and retained draft Apply/Undo, shared-source
   warning, Maps route, code-only characters, optional LuaLS choices, CNS Explod
   runtime behavior, AIR Clsn2 workflow, and the still-open ordinary Constants
   zoom interaction. Log observed installed/engine results separately from
   source-test claims.

### Phase 1 continuation checkpoint — 0.79.7

Recorded September 27, 2026. The Command & Movelist priority is source-complete
at this checkpoint. Timeline operations preserve pre-existing separator and
outer whitespace conventions; changing one visible step patches only that step.
Reviewed command Apply preserves comments, unknown/custom parser fields,
omitted defaults, mixed line endings and neighboring definitions. Diagnostics
and glyph warnings remain advisory and do not impose a parser or input policy.
The final source-side audit also corrects the nested movelist Source subtab:
browser textarea normalization no longer converts untouched CRLF, LF, or CR
lines. Each typed edit is reconciled against the retained raw draft, preserving
unchanged mixed line endings while newly inserted lines follow the nearest
authored local convention.

CMD, INP and JNP editor-title entry now carries the actual open document and
caret into the existing visual editor. Dirty text is parsed without requiring a
save. Exact duplicate definitions use caret occurrence identity. Reused panels
switch only when their current visual form has no unapplied changes. Shared
command ownership returns every real DEF owner, including characters without a
movelist assignment, and asks instead of silently choosing the configured
character. Unrelated nearby DEF files are no longer guessed as owners. Simple
and Workspace Home expose Commands & Movelist; Player remains code-free.

Focused command/model/workspace/lifecycle/navigation/mode/menu tests and the
complete 325-file suite pass. This is source verification only: no package was
built or installed, no live game or character was edited, and no desktop UI was
controlled. Remaining Phase 1 order resumes with specialized Move Lab Helper,
Explod and projectile component views, then embedded AIR/Clsn and remaining
field-level HitDef presentation, Stage/Screenpack contextual assets, shared
destination colors, and final Help/screenshots. Installed-package QA remains a
separate explicitly authorized activity. Phase 2, research and GIF conversion
remain deferred.

Phase 2 research and GIF conversion research remain deferred until Phase 1 is
complete, and completion does not start them automatically. Do not begin a
Phase 2 shell early. Preserve the separate milestone schedule above: user-defined
Flow Mode and the QA website wait until Ryu, Demitri, Morrigan and Goku are
closer to completion; broader Project Data grows when work reaches specials.
Tournament Player Mode remains second-lowest priority immediately above the
website, with research/GIF conversion immediately above those. Deferred work
still requires an explicit decision to begin; this checkpoint does not schedule
desktop control, installed QA, publication, or a new feature batch by itself.

### Phase 1 continuation checkpoint — 0.79.8

Recorded September 27, 2026. Move Lab now discovers exact Helper, Explod, and
native Projectile creation controllers in every assigned CNS/ZSS source,
including unsaved editor text and shared files. Each selection retains the DEF,
source and range hashes, exact lines, controller kind/index, and enclosing
StateDef/function. Nested ZSS conditions/loops and literal Root, Parent, and P2
receiver names are visible as context only; IKEMaker does not infer runtime
ownership from those names.

Creation-site selection is read-only and cannot create, convert, or rewrite
source. Helper and Explod buttons open their established specialist tools as
separate authoring surfaces; the selected source remains unchanged until the
user explicitly applies work in the owning tool. Native Projectile offers exact
source navigation rather than pretending a dedicated editor exists. Changed or
moved controllers fail their full identity check instead of retargeting.

Every exact component now includes a compact read-only **AIR / Clsn context**
catalog. It reads the current assigned AIR, including unsaved text, and lists
only complete real actions with their AIR line, frame and tick totals, explicit
LoopStart position, and effective Clsn1/Clsn2 frame and box coverage. The user
must choose an action explicitly; the choice is remembered against that exact
component source/range revision. Opening revalidates both the full component
identity and the selected action in the current AIR before handing it to the
established AIR/Clsn workspace. No StateDef, Helper, Explod, Projectile, or
HitDef number is inferred as an AIR action. AIR editing, Clsn editing, retained
drafts, Apply, Undo, and Save remain owned by the existing AIR workspace.

Direct HitDef selections now present the exact controller's explicitly authored
classic contact values (damage, pause, hit/guard stun, slide, velocities,
acceleration, sparks) and then every other authored/custom option. The summary
is deliberately read-only. **Edit HitDef** continues into the existing guarded
HitDef editor, which remains the only field-level Apply owner; duplicate option
names stay visible and must be resolved in source before guarded editing.

The approved destination colors now have a single shared registry. Universal
viewer routes use AIR blue, SFF green, SND amber, code slate blue, and Maps
cyan; recognized specialist command buttons receive their mapped destination
color dynamically. Move Lab's exact-component actions use Move Lab teal, AIR
blue, or code slate blue by destination. The styling is a border/underline cue
that preserves neutral artwork surfaces and falls back to system borders in
forced-colors mode. Screen-specific buttons that do not yet expose a command or
destination attribute remain follow-up coverage; this checkpoint does not
claim every legacy button was recolored.

A bounded final pass also classifies the AIR dialog's nested **Open AIR Source
Tab** and the SND viewer's **Open Build Manifest** / **Open Any SndMaker Text**
buttons as code destinations. These legacy IDs use the same shared registry;
their action semantics and owning editors are unchanged.

The bundled Move Lab screen guide now describes the exact component browser,
explicit AIR/Clsn catalog, stale-target behavior, optional constants profile,
and specialist mutation ownership. Screenshot replacement remains deferred
until an installed build is explicitly authorized and visually verified.

The required neutral/off preference is implemented centrally as
`ikemenZss.destinationColors`. `subtle` is the default; `off` emits no
destination accent rules while retaining destination metadata, labels,
tooltips, keyboard focus and routing. The preference is presentation-only and
does not rewrite source, alter an editor's save owner, or change action
semantics. All adopting workspaces read the same window setting when rendered.

The Stage Workspace now has the first bounded contextual-asset handoff. A
selected normal, parallax, or animated background resolves to the exact sprite
used by its preview and can open that group/index in the established SFF
workspace. An animated background can also open its embedded Begin Action at
the exact stage-DEF source line. These controls navigate only: SFF and stage
source retain their existing edit owners. If the stage changes between display
and an SFF request, the workspace refreshes and requires a new selection rather
than silently opening a stale target.

The Screenpack / Fight UI and Character Select Layout workspaces now use the
same bounded contract. A selected direct sprite or resolvable embedded
animation frame can open its exact group/index in SFF, and an embedded Begin
Action can open at its motif source line. Motif changes invalidate the displayed
selection and refresh the workspace before navigation. Text/font elements and
unresolvable expressions remain source-only rather than being guessed.

Focused component discovery, nested-context, client routing, overview, stale
identity, and host-routing checks pass. The complete 325-file source suite also
passes. No package was built or installed, no live game or character was
edited, no desktop UI was controlled, and no runtime behavior is claimed.

#### 0.79.8 capability and ownership matrix

| Surface or component | What this checkpoint exposes | Mutation owner | Draft / identity boundary | Remaining Phase 1 work |
| --- | --- | --- | --- | --- |
| Command & Movelist | Editable command steps, explicit selected-step and whole-command absolute L/R versus relative B/F conversion/insertion, reusable custom motion recipes, modifier/release/mirrored/direction-basis counterpart draft tools with retained origin review, and nested source/visual movelist glyph editing with non-writing literal and parser-aware glyph-batch impact previews | Command & Movelist's existing reviewed Apply paths | Exact CMD/INP/JNP or movelist file, current source fingerprint, retained visual/source draft | Installed interaction QA only when separately authorized; source scope is complete and convention-preserving |
| Move Lab component browser | Exact StateDef, Function, HitDef, Helper, Explod, and native Projectile discovery plus Problems/source navigation | Navigation-only; never writes component source | Character DEF, source/range hashes, controller kind/index, enclosing block, and current unsaved documents | Deeper compact component inspectors only when they reuse the established owner below |
| Direct HitDef component | Read-only authored classic/contact/custom values and exact Edit HitDef handoff | Universal HitDef Editor | Exact controller identity; duplicate options remain source-only | Optional compact embedded presentation; no second Apply implementation |
| Helper component | Exact creation site and separate Helper Lab handoff | Helper Lab | Exact creation-controller identity; Helper semantics are not inferred | Root/parent overlays, contextual contact/reaction preview, and richer map ownership controls |
| Explod component | Exact creation site and separate Spatial/Explod handoff | Spatial Composer / Explod Composer | Exact creation-controller identity; visual Explods never gain fictional HitDefs | Deeper contextual placement/palette/layer editing through the existing owner |
| Native Projectile component | Exact creation site and source navigation | Source editor | Exact creation-controller identity | Dedicated guarded editing only if a real owner is designed; do not redirect to Helper Lab |
| AIR / Clsn context | Compact real-action catalog with AIR line, frame/tick totals, explicit loop point, effective Clsn coverage, remembered explicit selection, and exact handoff | Existing AIR/Clsn workspace | Exact component source/range revision plus current assigned AIR text, including unsaved text; no number guessing | Embedded visual frame/collision interaction only if it continues to reuse AIR's sole Apply owner; installed interaction QA |
| Stage / Screenpack assets | Exact selected sprite-to-SFF and embedded-action-to-source handoffs | SFF or owning Stage/Screenpack source editor | Selected element plus current source fingerprint; stale sources refresh instead of retargeting | Deeper contextual editing and final Help/screenshots |
| Destination accents | Shared registry, forced-colors fallback, and one `subtle` / `off` preference across universal and recognized specialist routes | Presentation only; no mutation owner | Window preference; labels, focus, routing, and files are invariant | Audit remaining legacy direct-navigation buttons as their screens are touched |

Implementation commits for this continuation are `88e010c` (Command &
Movelist convention preservation), `cf32bc4` (exact Move Lab component
context), `1d0587a` (shared destination-color controls), `590a84b` (legacy
destination-route coverage), and `745a4a0` (compact exact AIR/Clsn context).
Commit `1057627` records the ownership checkpoint. These are local source
commits only; no release feed, package, installation, or live project was
changed.

Remaining Phase 1 order: deeper visual AIR/Clsn interaction and optional HitDef
presentation only where each can reuse its existing mutation owner;
deeper Stage/Screenpack contextual asset editing; remaining destination-color
coverage for newly touched routes; installed screenshot refresh and remaining
surface-specific Help; then explicitly
authorized installed-package QA. Helper-projectile semantic classification
remains separate: Helper creation sites are shown exactly, but IKEMaker does not
guess that an arbitrary Helper is a projectile. Phase 2, research, GIF
conversion, Tournament Player Mode, and the website remain deferred under the
existing priority rules.

#### Next-week Phase 1 restart checklist

This is the authoritative restart boundary after the 0.79.8 source checkpoint.
Do not treat any item below as completed by the source suite alone.

1. Decide whether Move Lab needs an in-panel visual AIR/Clsn frame preview beyond
   the completed compact catalog. If added, reuse the existing AIR workspace's
   retained draft, conflict, Apply, Undo, and Save path; do not implement another
   writer or infer an action from a component number.
2. Keep the direct HitDef summary read-only unless a compact presentation can call
   the existing Universal HitDef editor for every mutation. Preserve unknown,
   custom, duplicate, omitted, classic MUGEN, and custom-parser fields exactly.
3. Extend Helper and Explod component context only through their established
   owners. Candidate work is root/parent/P2 overlays, reaction/contact preview,
   placement/palette/layer context, and richer map ownership. Do not classify an
   arbitrary Helper as a projectile or give a visual Explod fictional HitDef data.
4. Continue Stage/Screenpack contextual editing from the completed exact SFF and
   embedded-action navigation. Any new field edit must retain the selected element
   and source fingerprint, use its existing source editor/Undo path, and refresh
   rather than retarget after a source change.
5. Apply destination metadata to new or newly touched cross-workspace buttons.
   Existing shared routes, nested AIR source, and SND manifest/maker-text routes
   are covered; do not recolor ordinary local actions merely because they are
   buttons.
6. When installation is separately authorized, replace stale Help screenshots and
   manually verify the exact packaged build. Minimum QA: Command & Movelist step
   insertion/reorder/removal without convention normalization; explicit absolute
   L/R versus relative B/F insertion; nested glyph source/visual draft recovery;
   exact component switching and return; Action 0 remaining unselected until the
   user chooses it; remembered selection isolation by component revision; unsaved
   AIR visibility; stale component/action rejection; destination-colors `subtle`
   and `off`; narrow layouts, keyboard focus, reload, Undo, Save, and no draft loss.
7. Only after those Phase 1 gates are reviewed should a new package/version or
   release-feed update be considered. Phase 2 remains a separate shell and must
   not begin implicitly from this checklist.

## Reusable and shareable user preset libraries — requested 2026-09-27

Status: user approved the full set below for future implementation, including all six additional categories alongside PalFX and commands. Scheduled backlog work, not an instruction to restart work immediately or publish. Preserve the Phase 1 closeout boundary and 35% usage reserve. SF6 is the primary implementer when scheduled.

Requested items:
- **PalFX presets:** explicitly save named effects, load/preview/edit, duplicate, rename/delete, and import/export individual presets or collections. Retain supported parameter values and clearly identify defaults or unsupported fields.
- **Command maker presets:** extend the existing user command pool with the same library and sharing actions. Preserve the user's chosen syntax and timing, including traditional motions, relative directions, and absolute left/right; never normalize conventions merely on load/import.

Additional approved preset categories, in suggested implementation order (not additional Phase 1 release blockers):
1. **Code recipes:** expand the existing example shelf with user-authored blocks and named placeholders for states, maps, animations, and sounds. Prioritize recognition and editing of real code over mandatory guided workflows.
2. **CLSN profiles:** reusable standing/crouching boxes and animation assignments, including transition exceptions. Preview against destination sprites and explicitly review mappings; do not assume matching names or frame geometry.
3. **Helper / Explod / Projectile setups:** reusable properties, positioning, bindings, map initialization, and associated code. Preserve each controller's actual semantics and existing editing owner; surface unresolved dependencies.
4. **HitDef setups:** reusable damage, hitpause, guard, spark, and related authored properties. Preserve custom/unknown values and reuse the existing guarded editor/Apply path.
5. **Movement setups:** reusable jump/dash/velocity/acceleration settings and associated code, with explicit destination references rather than assumed state numbers.
6. **Shareable workspace layouts:** optional export/import of saved panel positions, groups, sizes, and visibility. Personal layout persistence is separately requested; cross-user sharing must handle different screen sizes and unavailable panels safely.

Shared design:
- Reuse existing shelves, pools, and relevant editing screens with consistent Save / Load / Import / Export controls; avoid creating another standalone lab for every library.
- Organize by author and game/project (for example JNP/DvS, JNP/DS4, TeamZ2/HDBZ), with optional descriptions/tags and filters. Respect existing identifiers; importing must not silently rename maps or code.
- Show required assets/identifiers, compatibility, and what applying changes. Preview/stage presets before explicitly applying through the established mutation owner; library import itself must not write to a character/game project.
- Store personal presets persistently in user/extension storage by default. This is intentional user saving, not reinstatement of automatic backups. Export only to a user-chosen location; omit private absolute paths and do not bundle assets implicitly.
- Use a versioned, validated data-only sharing format. Handle duplicate names with keep-both / replace / cancel choices. Never execute imported content on import or silently overwrite existing presets.
- Keep free-form code editing and individual working methods available. Assess existing infrastructure before estimating work; defer substantial additions instead of silently enlarging the current closeout.

### Approved extension: custom-animation standards and future community publishing

Requested 2026-09-27. Add a reusable custom-animation definition/preset category for community conventions such as Shocked, Midnight Bliss, and previously documented standards. Consult the existing standards catalog before defining identifiers; do not invent action numbers or silently override community/project conventions.

Local scope: save/edit/preview/import/export definitions; searchable organization by standard, author, game/project, tags, and version. Describe purpose, required/optional actions or variants, expected frame/timing/axis/collision rules where the actual standard specifies them, dependencies, examples, and compatibility. Distinguish an established community standard from a user proposal or project-specific variant. Permit multiple versions/variants and exact identifier mapping with conflict review. Validate against the selected character and show missing requirements without enforcing adoption or rewriting unrelated animations. Adding AIR data uses the existing reviewed AIR mutation owner and explicit Apply; importing a catalog definition does not modify the character.

Separate three payloads clearly: (1) standards/metadata, (2) reusable AIR or other authored text data, (3) optional sprite/art assets. Text definitions cannot supply missing character-specific artwork. Asset sharing, if later supported, needs explicit creator attribution/permission, separate size/type validation and no assumption that uploading a definition grants rights to associated art.

Deferred website scope: alongside the previously deferred QA website, consider a community library for all approved preset categories and custom-animation definitions. User submissions, browse/search, preview and deliberate download/import; no automatic publication, installation, executable loading or project writes. Website implementation remains tied to its existing later milestone and is not a Phase 1 blocker. A public submission is not automatically an endorsed community standard. Include report/remove/moderation and clear author/version provenance before opening public uploads.

Format and safety design: a custom extension may wrap JSON or another documented text format; CSV is suitable for flat tables but nested animation/preset structures likely need a structured schema. A filename extension is not a safety boundary. Prefer a versioned data-only schema with strict type/length/count/size limits, safe rendering of descriptions, and explicit handling of unknown versions/fields. Treat imported code snippets as inert text, never execute/evaluate them on import. Reject path traversal, arbitrary file destinations, scripts/HTML execution and automatic remote dependency fetching. Avoid archive/asset bundling initially unless needed; if added, validate paths, file types and expanded sizes. Show source, changes, dependencies and conflicts before the user applies anything. Reuse the shared local library/import framework rather than separate custom importers for each category.

Status: approved backlog scope for assessment and future implementation; no immediate restart, website deployment, publication or expansion of the current release requirements. Preserve the 35% reserve and current stopping point; SF6 remains the implementer.

### Community library access and publishing from VS Code

Requested 2026-09-27. Extend the deferred community website/library scope with a visible **Browse Community Library** link in the shared preset-library UI and relevant preset pickers, plus **Publish to Community Library** for user-selected supported presets/collections/custom-animation definitions. Reuse one integration across categories instead of separate publishing screens.

Publishing must show a review of the exact outgoing content, destination, author, description, category, version, dependencies and visibility, then require an explicit Publish action. Exclude local paths, credentials, unrelated project files and artwork by default; include any supported assets only through explicit selection and permission/attribution review. Authenticate securely without embedding service credentials in the extension or shared preset. Apply the same server-side validation/moderation as website submissions; client checks alone are insufficient. Clearly distinguish pending moderation from publicly available content. On success provide the actual item URL and Open on Website action. Support deliberate updates to the author's existing entry with version/conflict checks; never silently replace someone else's item or publish on Save/Apply/autosave. Failed/uncertain requests must retain the local draft and avoid duplicate submissions on retry.

Website base URL should be configured once when a real service exists; no invented active URL or placeholder presented as a functioning service. Keep offline/local save and import/export available without an account. Status: approved deferred backlog scope, not immediate implementation/deployment or a Phase 1 release requirement. Preserve current stopping point and 35% reserve.

## Tester AIR regressions — reported 2026-09-27, investigation priority

User relays two symptoms: (1) after saving AIR changes, changes are not seen in IKEMEN; (2) viewer will not change to the next animation. Neither cause nor reproduction is verified. Treat as potential core editing/navigation regressions ahead of new preset/library work, not confirmed user error or assumed engine hot reload support.

Bounded investigation for next work period: trace visual draft -> Apply -> text document -> disk Save and show exact AIR path/assigned character DEF, dirty/saved state and failures. Check wrong owner/file selection, stale draft/model refresh and swallowed write failures. Separately distinguish persisted disk contents from engine reload behavior; do not promise a running engine hot-reloads AIR. Preserve unsaved work and existing explicit write approval. For navigation, distinguish next action/animation selection from next frame/playback, inspect selected action identity, draft guards, refresh and controls; a blocked change needs an actionable explanation without discarding work. Add targeted regression coverage for confirmed causes and document any installed/engine reproduction still needed; no desktop control or game edits without authorization.

Useful reporter details: IKEMaker version; exact edit and Save/Apply buttons used; whether the changed AIR text is visible on disk and character uses that file; whether character/match/game was reloaded; whether 'next animation' means clicking a different action, a next-action control, or advancing a frame; error/status message if any. Capture video only if those details do not resolve ambiguity. Preserve current stop/35% reserve; record this as next-work priority, not an immediate unbounded audit or release.

## Animation-editor reference improvements — approved backlog, 2026-09-27

User approved recording these after reviewing the shared bandicam_2026-09-27_22-21-54-787.mp4 feature demonstration. Future implementation by SF6; not current release blockers or an immediate restart. Inspect existing capabilities before adding duplicates. Preserve the 35% usage reserve and current work boundary.

- **Onion skin and pinned reference sprite:** compare adjacent poses or an explicitly selected reference with opacity/grayscale controls and clear axis alignment. Keep reference selection independent from the edited frame; reuse existing layer/preview infrastructure where appropriate. Prioritize for alignment work.
- **Insert sprite group into AIR:** select a real SFF group, preview ordered sprites and insertion location, choose timing/order, then explicitly apply through the existing AIR edit/Undo owner. Preserve user ordering choices and avoid silently replacing an action. Prioritize alongside onion skin.
- **Automatic per-sprite CLSN2 generation:** optional suggested boxes derived from sprite shapes, distinct from existing bulk application of authored profiles. Scope to selected frames/actions with configurable generation, preview, missing-sprite/skip reporting and explicit reviewed Apply. Preserve existing boxes unless replacement is deliberately selected. Do not present generated geometry as verified gameplay collision design or replace authored profiles. Assess feasibility and algorithm quality before promising results.
- **Animated GIF export:** first verify whether an equivalent exists. If missing, export a selected AIR animation using chosen palette and explicit preview options, with documented timing limitations and handling of loop/final hold frames. User chooses output location; no source/project mutation. Reuse rendering/export infrastructure.
- **Compact frame table beside a large preview:** refine existing AIR layout with an editable multi-row frame table and selection synchronized to timeline/preview. Integrate with saved/resizable/dockable panel work rather than building a second AIR editor or mutation path. Keep optional panels collapsible, keyboard navigation usable and unapplied drafts intact.
- **Two-project drag-and-drop transfer for AIR, SFF, and SND:** when two matching asset editors are open, allow Ctrl/Shift multi-selection in the source and drag the selection into an exact insertion point in the destination. AIR supports complete actions and individual frames across one or more actions; SFF supports complete sprite groups and individual sprites; SND supports complete sound groups and individual sounds. Show an insertion marker between destination actions/groups and between destination frame/sprite/sound indexes, with an exact numeric destination option for long lists. Keep the source read-only when appropriate.
  - A drop stages a reviewed import; it does not immediately mutate either project. Preview source/destination files, selected item counts, insertion order, destination identities, conflicts, dependencies, and the before/after result. Apply through each editor's existing Undo/mutation owner, keep Save explicit, revalidate both file fingerprints before Apply, and preserve selections/drafts on Cancel.
  - AIR must preserve raw authored frame data, comments, timing, flags, `LoopStart`, interpolation, collision boxes/defaults, and action numbers. Conflicting action numbers require Replace, a reviewed source-to-destination renumber map, or Cancel—never silent renumbering. For selected frames that depend on action-level defaults, explicitly choose safe default transfer, destination defaults, or materialized per-frame data.
  - **AIR drop dependency prompt:** when an animation/frame selection is released over the destination, scan every referenced sprite group/index against the destination SFF before applying. If any are missing, ask whether to **Import AIR and required sprites**, **Import AIR only**, or **Cancel**. The combined option must select only the required source sprites, preserve their axes and image data, include required palette/link dependencies, and display the normal SFF palette and group/index conflict review before either the AIR or SFF change is applied. AIR-only remains available because missing references can be intentional, but it must list and visibly warn about those references. Treat the AIR and sprite portions as one reviewed transaction: if either part fails or becomes stale, apply neither; Undo must reverse both. Never copy extra sprite groups, silently renumber sprite references, or rewrite AIR to accommodate a conflict.
  - SFF must preserve sprite pixels, axis, format/linkage intent, names/metadata, ordering, and palette ownership. Conflicting group/index identities require a reviewed replace/renumber/skip map. Palette changes need the existing palette safety preview and must never silently remap unrelated sprites.
  - SND must preserve audio data and declared group/index identity. Conflicts require a reviewed replace/renumber/skip map, and manifest/profile-backed projects must preview every resulting manifest and source-path change. Do not silently flatten shared archives, duplicate prefixes, rewrite `PlaySnd` references, or rebuild the destination archive merely because items were dropped.
  - Use the same interaction language in all three editors: source selection, visible drop boundary, conflict/dependency review, explicit Apply, Undo, and explicit Save. This is an addition to the existing Two-SFF Assembly workflow, not a reason to remove it; large or dependency-heavy transfers can route into that fuller review surface.

Reference observations came from sampled recording frames and a bounded source inspection, not a full feature-parity audit or installed QA. Treat exact feature gaps as items to confirm before implementation. No code implementation, desktop testing, publishing or version bump authorized by this backlog entry.

## Shared viewer layout: docking and expandable tool groups — refined 2026-09-27

User requests a cohesive design combining attempted Photoshop-like panel docking with an expandable-panel fallback inspired by the shared editor recording. This refines existing viewer-layout scope rather than creating a separate editor family. SF6 implements when scheduled; preserve the current stop, 35% reserve and current release boundaries. No immediate installation, desktop testing or publication.

### Default experience

Open one main viewer by default for fresh/unconfigured layouts, preserving deliberately chosen multi-viewer arrangements. Give the preview or primary code surface most of the space. Keep selection, playback/frame stepping, Apply/Save status and the most frequent contextual controls readily visible. Put advanced tools into clearly named groups such as Frame Tools, Collision Tools, Preview Options, or Connected Code, using the same labels across related screens. Avoid horizontal scrolling as the only way to discover essential controls. Defaults should suit ordinary monitors, not depend on an ultrawide display. Player/Simple/Workspace mode determines available tools; layout customization does not silently change modes.

### Dockable panels: evaluate first

Perform a bounded prototype using supported VS Code/webview capabilities and existing layout code before declaring docking impractical. Try dragging panel headers into clear highlighted drop zones: beside another panel, above/below it, or into a shared tab group. Provide resize dividers, minimum usable sizes, collapse/hide, and temporary maximize/restore. Use dedicated header drag handles so editing, box manipulation and text selection do not accidentally rearrange panels. Distinguish internal floating panels from actual independent OS/editor windows; do not claim native floating support unless verified.

Exact Photoshop parity is unnecessary. If full snapping/floating is disproportionate, refine the existing small AIR edit-window pattern into consistent movable/resizable panels or drawers, with predictable focus and return behavior. Report the prototype's actual constraints and smallest coherent implementation before undertaking a large custom layout framework. No duplicate editing state or second mutation owner when a panel changes position.

### Expandable tool groups: complementary and fallback layout

A labeled toolbar button opens an anchored expandable panel containing that group's options, like the reference video. This is a usable grouped form, not a long menu of unexplained commands. Keep short descriptions or contextual help where useful; use existing destination colors for navigation buttons rather than coloring every action.

- Default to one transient tool group open at a time to reduce crowding. Let users pin a group open when they need it continuously; deliberate multiple pinned groups remain possible when space permits.
- In roomy layouts a pinned group can occupy a resizable side panel. In narrow layouts use an accessible drawer or overlay with its own scrollbar, a visible close button and a clear return to the main preview. Keep playback and the current selection usable wherever space allows.
- Opening another group, dismissing with Escape, or clicking outside must preserve drafts, selection, undo context and field values. Dismissal never implicitly Applies, Saves or Discards. If an operation prevents dismissal, explain why beside the control.
- Buttons show expanded/pinned state. Keyboard activation, sensible focus order, Escape dismissal and focus return to the invoking button are required. Do not trap focus in an ordinary nonmodal panel; use proper modal behavior only when a true modal is necessary.
- Group content adapts to the current selection; changing layout must not reset that selection. Do not bury the same required action inside multiple nested collapsing boxes.
- Expandable groups can coexist with docking: users start with compact groups and may pin/dock frequently used ones. Avoid maintaining separate implementations of each tool for each layout.

### Saved setups and recovery

Persist arrangements per viewer/workspace: panel positions, relative sizes, tab groups and active tab, visibility, pinned groups and supported internal floating positions. Separate layout preferences from character/game files; do not create unsolicited project sidecars. Remember explicit user choices without automatically reopening every transient popup. Offer named Save Layout / Load Layout presets, Panels to recover hidden tools, and Reset Layout. Optional layout import/export belongs to the approved shareable-layout backlog.

Restore safely when display size, monitor count, zoom, extension version or available tools changes: clamp floating panels to visible bounds, keep essential controls reachable, tolerate missing panels and retain recoverable layout preferences. Use a simple default if a layout cannot be restored rather than presenting a blank or inaccessible viewer. Keep Reset Layout separate from resetting content or drafts.

### Cohesion and implementation order

Use one shared panel/group registry and behavior across AIR, SFF, palettes, Move Lab and other applicable viewers; reuse existing component implementations and source ownership. Each group links to its own Help subsection. Fit the compact AIR frame-table idea into this system instead of another screen.

1. Inventory existing small AIR window, resizing, collapse and layout-persistence code; avoid parallel infrastructure.
2. Prototype docking/tab grouping and saved restoration on one representative viewer. Assess actual VS Code constraints before choosing the fallback.
3. Establish shared expandable/pinnable groups and safe persistence; deliver the smallest coherent set, then reuse across viewers in scheduled work.
4. Check draft/selection preservation, exact Apply/Save ownership, keyboard/focus, narrow layouts, restoring on smaller displays, Reset Layout and absent panels. Run focused source tests; installed interaction testing requires the user's authorization.
5. Refresh Help and screenshots only after the final layout behavior settles. A larger framework must not silently become a new current-release blocker.

## SFF writer source-completion ledger — reconciled 2026-10-12

This is the finite continuation ledger for the already-authorized SFF Creator
and writer work. It records the remaining sequence inside this authoritative
backlog; it is not a second plan and does not expand Palette Workshop, SND,
Phase 2, release publication or installed physical testing.

Current target scope:

- Per JustNoPoint on 2026-10-10, active SFF Creator completion is temporarily
  limited to SFF v2.0 and v2.1. SFF v1, legacy SprMaker and DOSBox/DOSBox-X are
  **deferred/shelved for now**: they are not current completion blockers, UI
  integration work, packaging/release requirements, executable-discovery work,
  or required certification targets. Preserve already-written source, tests,
  contracts and historical evidence; do not delete or describe them as
  abandoned. Retained v1 tests may remain as preservation/non-regression
  evidence, but a failure specific only to the shelved route does not restore
  v1 work to the current completion scope; any shared failure affecting v2+
  remains blocking. Resume v1 only after separate explicit direction. SprMake2
  remains an explicit supported comparison/backend route for v2 work.

Completed foundation through this checkpoint:

- Backend-neutral intake/specification, built-in SFF v2.0/v2.1 writers and
  independent strict validators, and the SprMake2 compatibility route,
  candidate persistence, adoption review/layout approval, operation-vault
  lifecycle evidence, execution command gate/dispatch authority, outcome
  verification and durable attempt-bound result preparation/append/cleanup.
- D-D3c startup execution-attempt routing is New Dev approved and independently
  source-certified. It distinguishes pristine retry offers, restart/manual
  recovery review and durable ResultCaptured continuation without granting
  execution or recovery authority.
- D-D3d live execution and D-D4 result classification/state bridging are
  implemented and covered by retained-evidence and restart tests. They execute
  only the exact approved attempt, capture every outcome, publish the exact
  ResultCaptured child and route it to TerminalNeedsHistory,
  RestartRecoveryRequired or ManualRecoveryRequired without manufacturing
  further authority.
- D-D5a/D-D5b now cover read-only HistoryReview preparation, durable append and
  exact restart replay, plus saved HistoryReview verification. The terminal
  HistoryReview-to-Completed owner now writes/reconciles the immutable history
  record, stages a vault-owned receipt capsule bound to the exact proposed
  Completed checkpoint and mutation intent, appends/verifies Completed and only
  then publishes a cleanup marker before removing and directory-syncing the
  capsule. The retained marker binds the exact Completed head, HistoryReview
  parent and capsule hashes, so a failure before or after unlink remains a
  cleanup-only restart rather than falsely clean completion. Exact retained
  locks resume; competing or ambiguous evidence fails closed. Startup recognizes
  fresh finalization, cleanup-required, cleanup-recorded and authoritative clean
  Completed states without granting execution or history-write authority.
- The expanded two-target v2.0/v2.1 terminal integration, history writer,
  operation vault, startup router and lifecycle evidence registry tests pass.
  Built-in RAW8/PNG8 writer, strict-validator, property/golden and backend
  registry matrices also pass. This is source evidence, not installed IKEMEN
  or platform certification.

Remaining integration and release gates, in order:

Source checkpoint (2026-10-26): gate 1's isolated production-review retention
host is implemented in `sff_creator_production_review_host.js` with the real
operation-vault composition in `sff_creator_production_review_vault_adapter.js`.
Projection, adoption-impact, execution-layout and post-terminal history reviews
use separate challenged acknowledgement sets and retain separate plan/record
artifacts. The host rejects blockers, stale or competing heads, forged/reused
challenges, deterministic replay drift and same-stage artifact collisions. It
does not grant dispatch, execution, adoption or history-write authority; active
and candidate bytes, the Creator draft and the history directory remain
unchanged. New operations stop at LayoutReview. History review is only valid for
an exact pre-existing HistoryReview lifecycle and is never pre-approved. Focused
host and real-vault integration tests plus the neighboring target, adoption,
layout and history approval suites pass. Visible command/UI continuation remains
gate 3, after gate 2 production runtime authorities.

1. **Staged production approval host.** The visible v2.0/v2.1 built-in
   **TEST BUILD ONLY · No Adoption** actions may create separately named,
   strictly validated candidates inside the immutable reviewed package while
   always retaining the draft and leaving the active archive unchanged. The
   production adoption actions remain deliberately unavailable. A production
   host must present and separately
   retain the existing projection, adoption-impact/rollback, execution-layout
   and history-reconciliation reviews; one generic build confirmation must not
   synthesize their human acknowledgements. Candidate-only test builds grant no
   approval, dispatch, persistence, vault or history authority, cannot overwrite
   an existing deterministic candidate/receipt, and retain the draft on
   cancellation, drift, validation failure or collision. SprMake2, Compare and
   text/package routes remain available.
2. **Production runtime authorities.** Ship trusted pinned Windows/Linux
   certification evidence, a real replacement-capability probe, and an
   extension-owned durable state root outside workspace/active/candidate/history
   paths. Retain a fixed integration-authority artifact from CandidateBuilt
   through Completed that binds the original specification bytes/hash, explicit
   v2.0/v2.1 route envelope/hash and active target. Saved Completed verification
   must recover these bindings independently before the UI may clear a draft.

   Source checkpoint (2026-10-26): the real replacement-capability producer is
   implemented in `sff_creator_replacement_capability_probe.js`. It uses a
   uniquely owned child fixture in the active archive's parent directory,
   observes rename-to-absent, file fsync, open-handle rename and directory fsync,
   binds the exact platform/architecture/Node version/parent realpath/device,
   removes only its known regular single-link fixture files, and revalidates the
   parent identity after cleanup. Required-check failures remain false and block
   the layout; only an explicit platform-limitation error set becomes
   `unsupported-by-platform`, while I/O and unknown directory-fsync failures
   throw. Its exact artifact bytes/hash are accepted by a real v2.1 adoption
   chain and execution-layout plan without changing active/candidate bytes or
   the parent inventory. This is a production observation, not pinned physical
   Windows/Linux certification. Global-storage state-root composition and the
   retained integration-authority artifact remain open.

   Source checkpoint (2026-10-26): extension-owned durable state-root
   composition is implemented in `sff_creator_state_root.js`. The production
   adapter derives `<globalStorageUri>/sff-creator-state`, rejects overlap in
   either direction with workspace/active/candidate/history paths before it
   creates anything, rejects symlinks/junctions/realpath aliases and identity
   collisions, and retains an exclusively created file-fsynced seal binding the
   global-storage and state-root realpath/device/inode identities. Restart
   reproduces the exact authority hash; deletion/recreation, foreign unsealed
   contents and fatal sync errors fail closed. Directory-sync platform limits
   remain explicit, and no execution/adoption/platform-certification authority
   is claimed. The fixed CandidateBuilt-through-Completed integration-authority
   artifact remains open.

   Source checkpoint (2026-10-26): the fixed integration authority is now
   implemented in `sff_creator_integration_authority.js`. It binds the original
   specification artifact bytes/semantic hash, explicit v2.0/v2.1 route
   envelope/hash, operation/workspace identity, sealed global-storage root and
   original active-target identity. The all-or-none authority/state-root/route
   extension set is retained from CandidateBuilt through CandidatePersisted and
   the existing route chain. The lifecycle registry requires the inseparable
   authority pair without exceeding its 16-role bound. The ordinary saved
   Completed verifier independently recovers and verifies these bindings, so
   missing, altered, dropped or physically drifted authority fails closed.
   Focused v2.0/v2.1, restart, propagation, tamper, registry and startup suites
   pass. A broad post-fix history-review suite exceeded three minutes without
   output and was stopped; it is not claimed. Stage 2 source work is complete,
   while pinned Windows/Linux physical certification remains external/manual.
3. **Command/UI continuation and recovery presentation.** Connect those staged
   approvals and production authorities to the existing single SFF Creator
   mutation owner; do not add a parallel writer or panel. Preserve explicit
   SprMake2, built-in and Compare routes, pre-release dual-build behavior,
   legacy text workflow, intake sources and palette/axis/link decisions. No
   fallback or direct active-archive write outside the transactional owner.

   Source checkpoint (2026-10-26): production composition is source-complete in
   the existing single Creator panel. `sff_creator_workspace_continuation.js`
   and `sff_creator_production_workspace_coordinator.js` retain the exact draft
   revision, lifecycle locator, specification/route hashes and explicit v2 route
   triple after every durable transition. The visible reviewed route is gated to
   exact enabled existing SFF v2.0/v2.1 targets; v1 and new archives are excluded.
   Each review, approval, certification selection, private candidate transition,
   execution start, classification, history decision and completion requires an
   explicit user continuation. Reopen only presents Continue Review/Recovery and
   never auto-advances mutation. Ambiguous/manual recovery remains disabled for
   unsupported automatic continuation. Completed cleanup/finalization is itself
   an explicit continuation. The host clears a draft only after runtime
   `resetDraft:true` and independent ordinary saved-Completed verification.
   Drift detach releases only the draft lock while preserving the sealed recovery
   record. The single transactional executor/history writer remain authoritative;
   SprMake2, Compare, package/intake and TEST BUILD routes are unchanged.
4. **Source-completion audit and physical certification.** Prove both active built-in
   targets (SFF v2.0 and v2.1) plus the supported SprMake2 route,
   single/small-batch/folder/GIF/PSD/
   sheet/recipe intake, axes/palettes/links/naming, round-trip semantics,
   startup/recovery/history behavior, target-drift/destructive-write guards and
   direct-write ownership with focused matrices, required nearby regressions,
   the repository suite and completion audit. Then exercise the staged approvals
   and generated archives in installed VS Code and IKEMEN on the supported
   platforms. Record exact hashes and unresolved runtime limits.

   Source checkpoint (2026-10-26): the source-completion audit is complete.
   Current source proves single-panel command reachability and registration,
   package inclusion, exact v2.0/v2.1 gating with v1 exclusion, immediate
   continuation retention, restart-only presentation, one executor/writer,
   Completed-only host draft discard, drift lock detach, unchanged SprMake2 and
   TEST BUILD routes, direct-write ownership, source ordering, operation-vault and
   lifecycle evidence replay. Focused workspace/coordinator/continuation, review
   UI, certification/probe, source-order, direct-write, vault, persistence,
   transactional executor and neighboring command/lifecycle suites pass. One
   fresh live-execution-command audit invocation produced no output for four
   minutes and was stopped rather than claimed; it does not replace the focused
   green runtime/command evidence already recorded. No physical Windows, installed
   VS Code, pinned certification-environment or IKEMEN archive behavior was
   exercised in this source audit; those remain physical pending.

Source completion requires stages 1–3 and the source-audit portion of stage 4
to be implemented, New Dev pre-approved and post-reviewed, with material
findings corrected; every
registered authoritative lifecycle edge used by the shipped command must have
replayable retained evidence; startup after every mutation boundary must either
continue deterministically or stop with explicit reviewed recovery; and no
required writer route may bypass immutable specifications, independent
validation, exact target revalidation, private candidates, transactional
adoption or durable history.

Source completion does **not** claim installed VS Code interaction, IKEMEN
load/render behavior, Windows/Linux runtime certification or release readiness.
Those physical checks remain separate and may keep ordinary built-in adoption
gated without making the source implementation falsely incomplete. Palette
Workshop remains the next separate goal after this ledger is source-complete.

## Palette Workshop overhaul — retained requirements and source checkpoints

Current recorded status: Palette Workshop Slices 1–10 are source-tested; see
**Palette Workshop post-source certification** for pending physical checks.
Do not restart this overhaul from its original scheduling instructions. Later
interaction proposals require their own bounded scope and evidence.

Historical scheduling: explicitly separated from the SFF-writer completion goal by
JustNoPoint on 2026-10-10. Finish and certify the complete SFF writer first.
Do not partially fold this workshop overhaul into the SFF goal, and do not lose
the already approved palette design. Start Palette Workshop as its own goal as
soon as the SFF-writer goal is complete. Existing palette behavior needed by
the SFF writer remains supported, but broader workshop UI and workflow changes
belong to the separately tracked Palette Workshop work. The historical
instruction to start a follow-on goal is not a new activation request.

The follow-on goal retains the complete discussion and requirements recorded in
this backlog, including:

All compatible non-PSD image, SFF and standalone palette sources participate in
these workflows. Apply the source-format parity contract at the top of this
backlog; PSD source-layer extraction is the exception, not a prerequisite.

- One canonical, portable Palette Workshop that can run as its own viewer or
  beside/below the SFF sprite viewer without becoming two implementations. It
  uses the shared compact toolbar, arrows/slider, quick icons, browser panels,
  dropdowns, docking and cohesion rules. Overflow operations belong in the
  palette browser or expandable groups rather than cluttering the main viewer.
- Image-first palette work. Build a required collective source-image/contact
  view before organizing color banks; clicking an index highlights that color
  in the images or dims the others. Scan folders or explicitly selected images
  for exact unique colors, review every candidate image/color, add later images,
  and detect missed colors. Unwanted colors can be ignored for the template or
  deliberately removed from reviewed images—never silently.
- Image-template swatches use orderly, explicitly named grid regions. The
  character colors, shared effects and separately paletted effects may be
  placed in different parts of the canvas, but every separated bank remains
  inside its own row/column grid with a consistent cell size and ordering; the
  builder does not reproduce irregular stair-step or free-scattered swatches.
  Swatch regions reserve at least one swatch-cell of padding from representative
  sprite/effect art and from other regions, warn on overlap or insufficient clearance, and grow
  the canvas instead of crowding content. A compact automatic layout is the
  default; moving a complete named grid is optional advanced placement.
  Labels remain attached to their grid rather than to the nearest artwork.
  Optional one-pixel region/cell borders may use the same exact darkest opaque
  retained template color chosen for generated text. Borders are off by
  default, never consume a palette index implicitly, and remain a reviewed
  visual-template choice rather than part of the source artwork.
- Exact 1:1 indexing is a first-class final workflow. Never assume color
  separation merely because a template or master image is being created.
  Conventional color separation is an explicit optional mode with named color
  regions, shade ordering, movable individual indices and whole groups, gap
  planning for later expansion, named color-square template output, validation
  against the source images, and optional local computer-vision/AI suggestions.
- Multiple named master-palette domains are supported—for example character,
  FX, and character-specific domains—with explicitly linked sprite groups.
  Named RemapPal groups are user-defined and are not hard-coded to group 1/2 or
  transformations. Layer, overflow-sprite, RemapSprite and other numbering
  conventions are selectable project standards, optional, editable and
  omittable; JNP conventions are suggestions, never universal rules.
- The palette/index browser can show the current SFF sprite under every visible
  palette, restrict results to selected named groups/domains, show palette
  swatches/index grids, or show both. Users can cycle the SFF with arrows and a
  slider, inspect temporary palettes, create, edit, rename and delete palettes,
  and move cleanly between SFF, AIR and Palette Workshop while retaining exact
  selection and draft state.
- Index migration safely isolates existing indices, permits reordering and gap
  insertion, adds colors from another separation project, and remaps every
  affected reviewed image without breaking old color-to-pixel connections.
  It previews the mapping, rejects ambiguous/unresolved ownership, and remains
  transactional and reversible.
- Bounded manual color-separation assistance includes up to 20 reviewed source
  color replacements, 1–500-pixel rectangular brush sizing by fields or
  sliders, click/drag replacement, fill, simple layers, transparent layer
  preview and deterministic opacity-derived colors. Transparency confines
  painting/fill, drawn boundaries can isolate touching regions, and the result
  flows directly into collective-image/template creation. This is not a full
  costume-layer composer or general image editor.
  Source checkpoint (2026-10-12): the offline finite manual-reduction slice is
  implemented in the canonical retained Palette Workspace. Exact PNG authority,
  sparse bounded overlay tiles, rectangular exact-color brush/flood/separators,
  layer visibility/order/name/opacity, durable CAS undo/redo, untrusted
  per-operation suggestion review, and independently verified copy-only output
  are source-tested. Originals, SFF, AIR, palette plans, and domain metadata are
  never mutation targets. Installed webview interaction, large real-project
  performance, visual alpha/compositing acceptance, and downstream physical
  template/index-migration handoff remain physical certification work.
- Optional vision/AI assistance is packaged off by default, privacy-controlled,
  provider-neutral where practical, suggestion-only, and trained only from
  explicitly authorized/validated examples. Manual operation must remain fully
  capable without AI. Opacity by palette index remains supported, but there is
  no dedicated alternate-costume layer-composer workflow.
- Bulk import/export covers ACT, swatches and other supported palette formats,
  individually selected formats or all requested formats, plus bulk rendering
  onto a selected template image from disk or the SFF. Named group selection is
  available throughout.
- Palette galleries use per-group folders by default, numbered images such as
  `0001` with optional names, append-without-overwrite or reviewed update, and
  retained palette-name metadata. Optional two-way synchronization can map game
  palette order to gallery numbering and vice versa, flag gaps/duplicates, and
  detect exact duplicate colors across installed and folder palettes. All
  naming, folders, synchronization and overwrite behavior remain optional.
  Source checkpoint (2026-10-12): the finite bulk-export/gallery slice is
  implemented in the canonical Palette Workspace. Exact SFF v2 or standalone
  palette authority, optional indexed-template authority, named domain/group
  filtering, bounded nonrecursive gallery inventory, explicit ACT order,
  companion bundles, gap/duplicate diagnostics, append or exact-hash reviewed
  updates, durable CAS plan history/undo/redo, independently regenerated output
  verification, crash recovery, and immutable gallery-to-build proposals are
  source-tested. The active SFF, AIR, palette plan, domain registry, originals,
  and retained draft are not mutated or adopted. Installed webview interaction,
  large real-gallery performance, external-tool compatibility, visual template
  acceptance, and deliberate consumption/adoption of a build proposal remain
  physical or later-owner certification work.
- Temporary palettes have visible lifecycle/owners and can be created, viewed,
  edited, renamed and deleted. Removing the final placeholder owner may propose
  palette deletion, but only after exact dependency review; stale or unresolved
  ownership blocks automatic cleanup.

### Vampire Savior Recomp palette-editor interaction intake — 2026-10-16

Reference: <https://github.com/tmcleroy/vampire-savior-recomp>. The repository is
GPL-3.0-only. Treat the following as clean-room product/design research unless a
future licensing review deliberately approves code reuse. Do not copy source,
fixed CPS-2 addresses, ROM-derived tables, palette limits, or game-specific
assumptions into IKEMaker. The reference contains no game data and expects the
user to supply a compatible ROM set; preserve the same user-owned-source and
content-provenance boundary in every related workflow.

Fold these useful interactions into the canonical Palette Workshop rather than
adding another palette editor:

- Keep the current sprite or animation live while colors change in the retained
  draft. The selected index can blink, pulse, outline, or dim all nonmatching
  pixels so the author can locate its use immediately. This must share Palette
  Workshop's existing exact-index highlight authority, honor transparency, and
  never write merely because a preview changed.
- Let a named palette domain expose its meaningful lines/groups, such as Body,
  Character FX, Shared FX, or a user-defined domain. Offer an evidence-labelled
  **Find a useful animation** action that scans bounded SFF/AIR usage and proposes
  the animation or sprite with the strongest visible use of the selected palette
  line. It is a navigation aid, not proof of semantic ownership, and ambiguous,
  linked, truecolor, or dynamically remapped cases remain explicit.
- Add compact copy, paste, restore-original, and reset controls at the correct
  scopes: one color, a selected named group/line, one palette, or an explicitly
  reviewed domain. Clipboard payloads retain color space, alpha, source order,
  palette identity, and provenance. Paste previews affected indices and cannot
  cross incompatible domains silently.
- Add optional randomization as a reversible exploration tool. Require a clear
  first confirmation or two-step invocation, retain the exact pre-random state,
  provide immediate Undo, respect locked indices/transparency/named groups, and
  never auto-apply or auto-save randomized results.
- Saved-palette libraries may preview candidates directly on the current
  sprite/animation while stepping through them, then restore the prior draft if
  the user leaves without choosing one. Support Save As, rename, duplicate,
  delete-with-confirmation, search, named groups, human-readable metadata, and
  reload of files changed outside IKEMaker. Existing ACT/swatches/gallery import
  remains the conversion authority rather than a parallel file format.
- Where a source device has restricted channel precision, show source values,
  full preview values, and the exact quantized result side by side. Quantization
  is profile-specific and opt-in; CPS-2 four-bit RGB must never become a general
  Palette Workshop rule.
- Preserve the established cohesive layout: palette/domain browser and overflow
  library operations in the Palette Browser, selected color and high-frequency
  actions in compact quick controls, and sprite/animation arrows, slider, play,
  background, scale, Fit, speed, and repeat controls through the shared viewer
  contracts. Do not reproduce the reference tool's gamepad-only panel or fixed
  hardware row limits.

Acceptance additions: prove that candidate-library preview restores the exact
prior draft, selected-index highlighting matches indexed pixels, copy/paste and
restore cannot escape the selected authority, randomization is undoable across
reload/recovery, external reload detects stale edits, animation suggestions are
bounded and labelled, and restricted-precision previews never mutate source or
silently change project-wide palette policy.

The detailed consolidation, insertion, temporary-lifecycle, Creator-flow,
portable-panel and acceptance requirements below remain authoritative for that
separate goal. New Dev pre-signoff, per-part implementation/testing, post-review
and root verification remain required for every Palette Workshop part.

## Palette workspace consolidation — user requested 2026-09-28

Historical usability report (September 28): tester could not distinguish palette injection from preview/add/replace and stopped when an occupied destination appeared to be replaced. At that checkpoint the Player entry was a QuickPick router. Later Palette Workshop source/certification checkpoints supersede that implementation description. Preserve the requirement for one canonical working surface and reuse its mutation owners; do not rebuild the old consolidation or add another disconnected palette editor.

Scope for SF6 assessment and scheduled implementation:
- One canonical **Palette Workspace**, reachable through IKEMaker Tools > Palettes and contextual Palette buttons in SFF/AIR/roster/other relevant screens. Pass exact asset/character context and return selection/drafts. Preserve old command IDs as compatible routes where feasible; simplify menu listings without breaking shortcuts.
- Default layout: palette list/library, editable color grid, large sprite/animation preview, explicit target identity and draft/applied/saved state. Existing organizer, import and export capabilities become coherent sections/tool groups. Advanced index remapping, CS/master/reference operations stay available but collapsed; explain project-specific roles without enforcing JNP conventions on arbitrary assets.
- Top-level actions: Preview Palette (temporary only), Add Palettes (one or multiple), Replace Palette (explicit occupied target), Edit Colors, Export, Library. Replace ambiguous 'inject' wording. Add suggests unused valid slots and never silently becomes Replace. Occupied target offers another slot or explicit switch to Replace. Revalidate slots/source identity at Apply; show before/after and counts such as 'Add 3; replace none'.
- Distinguish palette slot group/number from the 256 color indices and sprite palette references. Show linked/shared palettes and affected sprites before any destructive/remapping operation. Separate visual preview selection from changing stored assignments/defaults.
- Preserve exact ACT order choice including Reversed Photoshop method; surface import/export order clearly and persist user preference. Do not reverse on every load or silently reinterpret colors.
- Honest completion: selecting Add is not completion if palette is only staged. Current Player flow can require reviewed SFF rebuild; expose staged vs embedded/saved states and a clear next action within the workspace, reusing existing build/review path. Do not hide a rebuild requirement or invent unsupported direct insertion.
- Player mode must retain palette-only creation/edit/add/replace/export access. Character, stage and screenpack assets use explicit supported context rather than forced character assumptions. Keep SFF/AIR preview palette selectors as convenient context-preserving shortcuts to the same workspace, not independent conflicting editors.
- No unsolicited project files/backups; explicit reviewed writes, failure reporting, exact target and retained drafts. Dedicated contextual Help explains Preview/Add/Replace, slots versus color indices, ACT order, Apply/Save and any rebuild.

Approved design corrections before implementation:
- **Remove redundancy and combine windows means one real working surface.** A launcher shell that merely reopens the current organizer, SFF palette panel, import assistant, and Player QuickPick is only an internal checkpoint—not completed consolidation. Preview, Add, Replace, Edit, Export, and Library must ultimately operate in the same persistent Palette Workspace with retained context and drafts. Extract shared UI and handlers into modules; do not iframe, fork, or create another parallel editor. External source tools and advanced SFF screens may remain optional actions, not required ordinary navigation.
- Implement vertically in reviewable slices. First complete one common workflow in the unified view (recommended: preview plus explicit Add/Replace and truthful staged/build completion), then migrate the remaining palette modules. Any temporary legacy handoff must be labeled transitional and must not be presented as the finished combined workspace.
- Status must show independent facts rather than a misleading universal sequence: preview/draft state, staged changes, saved embedded data, active target, and built output can coexist. Direct Replace may not require a rebuild, while a successful build does not prove the active character uses that output; show any remaining adoption step. Keep hashes and modification times available as technical details rather than primary labels.
- For an occupied Add destination, prominently offer an unused slot or an explicit switch to Replace. Keep Insert + Shift Later advanced and require a preview of affected slots and authored references before it is offered as a resolution.
- Player mode retains the complete palette-only workflow, including organizing, editing, multi-add, replacement, and export; hide only unrelated sprite/code authoring. Resolve DEF/SFF and supported stage/screenpack contexts explicitly, and support standalone palette files without guessing a character.
- As routes migrate, remove redundant user-facing menu entries while preserving their command IDs as compatibility aliases. Preserve existing mutation owners, source revalidation, draft identity, ACT-order preference, linked/alias behavior, reviewed writes, and the acceptance tests below.

Acceptance: focused existing-flow inventory first, then smallest coherent consolidation proposal for review before a broad rewrite. Verify Add into unused slots, occupied-slot collision, explicit replacement, multi-import, cancellation, stale target, linked palettes, ACT order round trip, Player access, staged-build completion and contextual return/draft preservation. Source tests where meaningful; no installed/desktop/game edits without authorization. This is concrete user workflow refinement, not a new unrelated lab. Do not silently include in current hotfix publication or restart beyond current usage/reserve boundary. SF6 remains primary coder; reviewer handles scope and final review.

### Palette batch injection clarification — user requirement 2026-09-28

User explicitly requires inserting multiple palettes either at the end of a group or at an arbitrary position, shifting existing slots at/after that position. Example: inject 30 into group 1 before existing (1,2): new palettes occupy (1,2)..(1,31), old (1,2) becomes (1,32), and every later occupied slot in group 1 shifts by +30. Preserve import order with a reorderable review, keep earlier slots and other groups unchanged, preserve gaps among shifted original slots, and validate resulting format-specific number limits/conflicts before any mutation. Append computes a valid position after the group's last occupied slot, not by palette count. This user-approved insertion workflow supersedes treating Insert+Shift as merely an obscure advanced fallback: provide a clear Add/Insert Palettes action with Append or Insert Before placement, separate from Replace. An occupied insertion position is expected and invokes the explicit reviewed shift plan, never a replacement.

Preview must show incoming order, new slots, old-to-new mapping for existing palettes, linked/shared dependencies, affected references and exact output/rebuild requirements before Apply. Reuse palette_plan/build owners and transactional/source-identity safeguards; do not create a palette-specific writer or mutation path. Emit the reviewed change into the shared ArchiveBuildSpecification and execute it through the explicitly selected SFF backend. Keep retained drafts and no partial batch staging on validation failure. Moving slots must preserve links and supported dependent references coherently; enumerate external DEF/code/map references that cannot be safely resolved and require deliberate mapping/review rather than guessing or claiming all references updated. Physical palette-table order/index and group/number identity are distinct and must be handled correctly. Do not silently renumber other groups or adopt a newly built SFF as the active source.

Duplicate warning: detect exact equivalent palette color data within the same destination group, across incoming items and existing palettes, after explicit import-order conversion. Compare actual normalized colors including supported alpha, not filenames or slot IDs; account for resolved linked palettes and distinguish intentional links. Report each duplicate pair/cluster with slot/source labels during preflight, including incoming-vs-incoming. Warning is non-blocking: users may intentionally keep identical palettes. Offer keep, skip selected incoming duplicate, or change placement where appropriate; never auto-delete, merge or replace. Recompute insertion counts/mapping after skips or reorder. Visually similar palettes are not 'identical' unless an optional separately labeled comparison says so.

Tests: the exact 30-before-(1,2) mapping, append to sparse groups, non-group-1 cases, other-group preservation, ordering, capacity/conflict/stale-source rejection, references/aliases preservation, cancellation and batch atomicity; duplicates within batch/against existing, ACT order, alpha differences, intentional duplicate acceptance and changed mapping after skip. These are palette-consolidation requirements, not additions to the already-reviewed hotfix. Preserve current reserve/scheduling constraints.

0.79.19 implementation checkpoint: the canonical route, existing-SFF Palette Workspace surface, reorderable arbitrary-count Append/Insert staging, exact duplicate inventory, reference audit, atomic source-bound plan, reviewed-build handoff, and exact built-palette verification are implemented and source-tested. Character, stage, screenpack/fight UI, exact-SFF, and standalone source entry are explicit. Remaining longer-term consolidation work is limited to migrating any still-useful advanced organizer/import-assistant capabilities fully in-place and completing cross-project drag/drop for SFF/AIR/SND; do not reopen or duplicate the completed batch insertion engine.

## Phase 1 — optional native cross-platform SFF v2.1 and SND writers — requested 2026-09-28

Status: explicitly added by JustNoPoint to the Phase 1 backlog for design,
format research, implementation and destructive-write verification. This is not
authorization to replace the current builders, remove them from Windows, or
silently change any project's selected build authority.

Create two native IKEMaker build backends:

- A deterministic cross-platform SFF v2.1 writer covering the exact sprite,
  axis, image-format/compression, palette, palette-link, group/index and ordering
  behavior required by the reviewed SFF manifests and Palette Workspace plans.
- A deterministic cross-platform SND writer covering exact group/index identity,
  source audio encoding/data, ordering and the existing sound-profile/manifest
  contract.

SprMake2 and SndMaker remain first-class selectable Windows backends. Many
developers, including JustNoPoint, trust their established output. The native
writers are an alternative for Linux/macOS portability, deterministic internal
builds and workflows that benefit from richer validation; they must not be
presented as a compulsory migration. Store the backend choice as an explicit
user/project preference outside game assets, show it at every final build, and
allow a reviewed one-build override. Existing manifests should remain usable by
both backends wherever their semantics overlap.

New Dev design recommendation: call the alternative **IKEMaker built-in** in the
UI rather than "native," which can be confused with engine-native behavior.
Use separate per-project SFF and SND backend choices: **SprMake2/SndMaker
(trusted Windows backend)**, **IKEMaker built-in (cross-platform)**, and
**Compare Both**. Never silently fall back. Compare Both writes separate verified
temporary outputs, compares decoded semantics, sizes, hashes and reports, and
adopts neither until the user explicitly chooses one. Different backends need
not produce identical bytes when compression, padding or metadata differ; every
meaningful decoded field must still match the same reviewed contract.

Introduce an immutable backend-neutral **ArchiveBuildSpecification** before
either serializer. Reserve **Project Contract** for gameplay/authoring knowledge
and “portable-panel/action contract” for extension interfaces so search, UI and
QA records do not collapse three unrelated meanings of “contract.”
The SFF contract records ordered identities, exact source hashes, dimensions,
axes, intended format/color depth, palette assignment, explicit sprite links,
palette IDs/RGBA and explicit aliases. The SND contract records ordered
group/index identities, exact WAV hashes/bytes and parsed WAV facts. Adapter
interfaces perform capability checking, temporary construction, verification
and backend description. Refactor current Maker execution behind these adapters
without changing its behavior before adding a built-in writer. Write a build
receipt containing contract hash, backend/version/options, output hash and the
verification result to development/extension storage outside game folders.

Before either native writer may replace an output, require:

- A format specification grounded in real SFF v2.1/SND fixtures and current
  parser behavior, with unknown/reserved fields preserved or rejected rather
  than guessed.
- Golden files spanning linked and independent palettes, indexed/RGB/RGBA PNG
  inputs, duplicate image/palette links, axes, sparse/reordered identities,
  supported compression modes, empty/minimal archives, and representative
  character, stage, screenpack and lifebar archives. SND fixtures must cover
  sparse identities, varied WAV formats accepted by the established tool,
  duplicate audio and metadata/alignment edge cases.
- Parse → write → parse semantic comparison, deterministic byte-for-byte repeat
  builds where the format permits, and differential comparison against
  SprMake2/SndMaker for shared supported inputs. A byte difference is not called
  equivalent until every meaningful decoded field and runtime behavior has been
  checked.
- Temporary-output construction, full validation, source fingerprint recheck,
  atomic adoption, existing Recovery Center history and rollback. Never stream a
  partial archive over the active SFF/SND. A failed or uncertain build retains
  the prior archive and complete diagnostics.
- Physical Windows and Linux testing on disposable fixtures before Linux support
  is advertised. macOS remains unverified until physically exercised. Do not use
  Wine behavior as evidence of a native backend.

Potential capabilities beyond SprMake2/SndMaker to evaluate without inventing
format behavior:

- Structured errors tied to the exact manifest row, palette, sprite or sound
  instead of only external-process text logs.
- Preflight plus post-build semantic reports, deterministic build fingerprints,
  reproducible-build comparison and an optional side-by-side native-versus-
  Elecbyte backend audit.
- In-memory or temporary proof builds for preview and dependency review without
  adopting the archive.
- Exact incremental planning and cache reuse for unchanged decoded inputs, while
  still emitting a fully validated archive; never claim partial in-place archive
  mutation unless independently proven safe.
- Explicit compression/size reporting and reviewed optimization choices among
  formats already supported by SFF v2.1, with no silent quality or palette
  changes.
- Better duplicate/link proposals, unused-data reports and source provenance,
  while preserving the user's decision and never auto-merging identities.
- Cross-platform headless build/test commands suitable for CI once the writer is
  stable, using the same manifests and validation rules as the visual workspace.

SND remains an independent writer track rather than a prerequisite for the
user-prioritized SFF Creator and built-in SFF backend. Its initial writer embeds
approved source WAV bytes exactly—no resampling, normalization, transcoding,
metadata stripping or deduplication—and preserves manifest order. Begin only
with RIFF/WAVE encodings proven in IKEMEN playback fixtures; reject unsupported
codecs, duplicate/negative IDs, invalid chunks, alignment errors and 32-bit
offset/container overflow. Establish header version and final-link conventions
from SndMaker golden files instead of guessing.

Treat SFF v2.1 as the higher-risk track. Begin with full rebuilds and a very
narrow proven PNG profile; do not implement SFF v1 initially. Preserve indexed
pixel indices rather than quantizing RGBA, require an exact validated palette
assignment, and emit palette/sprite links only when the contract explicitly
declares them. Initially constrain links to acyclic backward targets for broad
compatibility. Establish every header, prefix, flag, reserved byte, alignment,
version and true-color mapping from Elecbyte documentation, SprMake2 golden
output and engine tests. Raw/RLE8/RLE5/LZ5 encoders advance separately only
after the simpler PNG-backed profile is certified.

### Shared SFF Creator and Add Sprites review — requested 2026-10-03, refined 2026-10-04

Build one backend-neutral **SFF Creator** for staging, preview, preflight and
reviewed ArchiveBuildSpecification generation. It becomes functional first
through a safe SprMake2 adapter; the IKEMaker built-in serializer later consumes
the same immutable specification. These are not two competing creation UIs.
Keep Creator, backend, independent validator, orchestration pipeline and atomic
adoption owner as separate components. Its reviewed **Add Sprites…** workflow
must cover the useful Fighter Factory behaviors below without silently rewriting
the current archive or hiding which backend produced the candidate. Creation may
begin with a blank SFF, a clone, a reviewed template, an imported SprMake2
package/definition, or the current staged plan; all routes converge on the same
specification, review and adoption owner.

Source-format contract: the operations below apply to all supported image,
folder/sequence, sheet, GIF, existing-SFF and recipe sources with the needed
decoded data. PSD layer extraction is a format-specific adapter only. Once
extracted, its images use the same numbering, axes, crop, palette, group/bank,
sharing, placeholder, export and AIR-handoff services as non-PSD sources.

- Accept one or many source images and optionally detect group/index identity
  from filenames. Show every detected identity, matched naming pattern,
  confidence and conflict before Apply; never silently mix filename-derived and
  manually assigned numbering.
- Let the author choose the destination group, starting index and numbering
  sequence, including consecutive `1,2,3,4…` and stepped `10,20,30…` modes.
  Preserve input order unless the author explicitly reorders it. Add gap-aware
  next-free and reserved-range-aware allocation with per-row overrides.
- Provide nine-point axis anchoring (top/center/bottom × left/center/right) plus
  exact X/Y values. Preview the resulting axis against each image; never infer
  gameplay alignment from transparent bounds without showing the proposal.
- Palette choices must distinguish: use/add the image palette when needed;
  force a specified stored palette and adapt the image; or exchange/remap with
  the specified palette. Include exact palette group/index and explicit reversed
  table order. Preview index mapping, transparency and affected palette links;
  reject lossy or ambiguous conversion unless the author deliberately accepts
  a supported reviewed conversion.
- Cropping is explicit: **Do not crop**, **Crop before axis**, or **Crop after
  axis**. The preview must show pixel bounds and the final axis result so crop
  order cannot silently shift alignment.
- Identical-image handling is explicit: **Share identical sprites**, **Do not
  share**, or **Ask for each identical pair/group**. Linking is a storage choice,
  never permission to merge or discard sprite identities. Detect identity from
  exact decoded pixels, dimensions, palette/index interpretation and required
  metadata—not merely source-file bytes or a thumbnail hash.
- Resolve destination collisions explicitly with **Stop and review**, **Skip
  incoming**, **Replace staged destination**, or **Assign next free identity**.
  Do not silently overwrite, renumber, or inherit whichever choice happened to
  be used for the previous batch.
- Present the operation as a staged recipe: **Sources → Detection → Numbering →
  Axis & Crop → Palette → Sharing → Review → Apply**. Preserve the draft while
  moving between stages, expose per-sprite overrides without losing batch
  defaults, and allow the author to export/import the plan before committing.
- Support file/folder drop, a reorderable virtualized contact sheet and list
  mode, conflict/search filters, and a filename-rule sandbox that previews every
  match, confidence, collision and resulting identity before staging.
- Add a source-preparation step for batch-renaming PNG, BMP and PCX/pixel-art
  inputs. Preview every old-to-new filename, detect collisions and invalid
  names, preserve source order, and write renamed copies by default so original
  artist files are not destructively renamed without a separate explicit choice.
  **Implemented for offline review:** Creator shows the ordered old-name →
  new-name/conversion map before writing, refuses destination collisions, keeps
  originals untouched, validates every copied or converted PNG (structure, CRC,
  dimensions and format) before the atomic destination write, records source and
  output hashes/format provenance, and removes its temporary conversion folder.
  Multi-file intake explicitly chooses between the file-picker order and natural
  numeric filename order, accepts reviewed 1–12 digit padding, and shows that
  final order in the same old-to-new confirmation rather than silently sorting.
  Standard uncompressed indexed BMP, RLE8 BMP, 24/32-bit BMP, indexed PCX and
  three-plane true-color PCX use in-house converters, preserving indexed
  pixels/palettes or true-color pixels as appropriate. Configurable ImageMagick
  remains an optional fallback for unusual legacy variants; physical
  fallback/platform behavior remains hands-on testing.
- Accept animated GIF intake as a deliberate extraction recipe. Extract its
  frames into reviewed immutable PNG snapshots, preserve frame order and GIF
  delay provenance, show the complete frame-to-group/index mapping, and default
  to sequential indexes. Add three explicit completion choices: **Frames for
  SFF only**, **Frames plus reviewed AIR timing handoff**, and **Export extracted
  PNG sequence only**. The AIR handoff reuses the established tick-aware GIF
  conversion rather than creating another timing algorithm: compilation GIFs
  may use reviewed uniform one-tick timing, a custom uniform duration, or source
  GIF delays. Source-delay conversion uses cumulative 60-Hz quantization. If a
  source frame is shorter than one engine tick, require the existing explicit
  choice between 60-Hz resampling that may omit source frames or preserving
  every frame at a minimum of one tick with longer playback. Show source delay,
  cumulative time, output ticks, repeated/omitted mapping and total-duration
  error for every frame before acceptance. Timing is opt-in and never silently
  creates or rewrites AIR; the accepted frame sequence and timing proposal hand
  off to the existing AIR New Animation/storyboard owner as a separate reviewed
  transaction with action/group/index selection and replacement confirmation.
  Cancelling or rejecting AIR timing must not discard the extracted SFF frames.
  Standalone PNG export chooses a destination, previews names/order/collisions,
  writes copies atomically and does not stage an SFF or AIR.
- PSD-specific layered-document intake: accept Photoshop PSD directly in the
  Creator. This does not restrict any shared SFF/palette option to PSD. Reuse the proven Ryu export
  semantics: page 0 is the flattened composite, authored pages retain their
  canvas offsets, the first non-overlay layer can be treated as the base, and
  named beard/overlay/FX/accessory layers can be exported independently or as
  base-plus-overlay variants. Offer flattened, base-only, each-layer and
  composited-variant modes without modifying the PSD. Preserve source hash,
  layer/page names, geometry, role and order in every sprite receipt. When a PSD
  has a Photoshop animation timeline, use a Photoshop-backed timeline exporter
  to produce the actual rendered frame sequence and delays; do not mistake an
  arbitrary layer list for timeline frames. Explicitly named frame pages may be
  consumed directly when the PSD decoder exposes them. Timeline frames default
  to sequential SFF indexes, while any AIR handoff remains a separate reviewed
  transaction. Also offer **Export extracted PNG sequence only** for flattened,
  base-only, each-layer, composited-variant, explicitly named frame-page and
  Photoshop-rendered timeline results. Preview filenames, canvas dimensions,
  offsets, layer/frame provenance, order and destination collisions; never
  modify the PSD or imply that ordinary PSD layers are animation frames. When a
  Photoshop timeline supplies trusted frame delays/FPS, preserve them as timing
  provenance and offer the same optional reviewed AIR timing handoff. If timing
  is missing or ambiguous, export frames with timing explicitly unassigned
  rather than inventing it.
- Add explicit **Master**, **Stored/FX**, **Image**, and **Temporary placeholder**
  palette modes. Master/Stored conversion must preview index remapping,
  transparency and loss; exact indexed matches may proceed without remapping.
  Temporary palettes carry a stable lifecycle ID and explicit ownership links
  to placeholder sprites. Removing the last linked placeholder may stage a
  palette-deletion proposal, but never deletes automatically, never treats
  visual/color equality as ownership, and never removes a palette referenced by
  an untagged sprite, link, staged plan or external unresolved dependency.
- Let the author tag an incoming sprite or batch as **placeholder**, attach an
  optional note/replacement intent, and filter/review placeholders later.
  Placeholder metadata stays outside the binary SFF while the reviewed build
  receipt records the exact sprite and temporary-palette identities. Replacing
  or removing placeholders updates the lifecycle proposal atomically with the
  sprite batch and remains undoable through Recovery Center.
- Offer optional neighboring-sprite and AIR-frame alignment context, guide snap,
  shared-axis copy, crop-derived axis deltas, transparency/index previews and a
  palette conversion-loss heatmap. Suggestions never bypass explicit review.
- The review page lists final order, group/index, dimensions, axis, palette,
  format, crop result, link target/provenance and conflicts for every incoming
  sprite. It also provides conflict-only filtering, changed/unchanged/skipped
  counts, expected-size/compression estimates and candidate-versus-active
  comparison. Apply creates a new build specification and uses the selected
  backend, private temporary output, semantic verification, atomic adoption and
  Recovery Center history required by this section.
- Show backend capabilities and precise unavailable reasons before build. If the
  built-in backend cannot satisfy a requirement, offer the unchanged reviewed
  plan to SprMake2 without switching automatically. Provide SprMake2, IKEMaker
  built-in, Compare Both, IKEMaker-preflight/SprMake2-build and Validate Existing
  SprMake2 Output modes. Compare Both adopts neither candidate.
- Build receipts link specification, execution and candidate hashes, validation
  evidence, backend, adoption and rollback. Persistent drafts are keyed to exact
  source and target fingerprints. A newly accepted sprite batch may be handed to
  the existing AIR New Animation storyboard as a separate reviewed transaction.
- Batch cancellation, validation failure, source drift, identity conflicts,
  unsupported image/palette formats and link cycles leave the active SFF and
  staged plan unchanged. Undo reverses the complete accepted batch.
- Keyboard access, searchable actions, precise disabled reasons and a summary
  of changed/unchanged/skipped inputs are required quality-of-life behavior.
  Suggested defaults may prefill fields but never bypass the review page.

Reference screenshots: `Screenshot 2026-10-03 233414.png`, `233422.png`,
`233429.png`, and `233435.png`.

Implementation order: (0) lock documented byte layouts, fixtures and an
independent strict validator without writing archives; (1) add immutable,
versioned ArchiveBuildSpecification, private execution snapshots, backend
adapters, receipts and adoption boundaries; (2) make the SprMake2 adapter emit
only isolated candidates and validate them before adoption; (3) deliver the
shared Creator/Add Sprites UI through that adapter; (4) add comparison and
Validate Existing Output pipelines; (5) implement one tiny SFF v2.1 PNG8 plus
exact-palette built-in profile in Compare-only mode; (6) certify it through
deterministic differential fixtures and real IKEMEN load/render tests; (7) expose
opt-in built-in adoption; (8) gate true-color, explicit links and each compression
encoder separately. SND remains independently schedulable and neither archive
writer inherits credibility from the other. Stop and retain the reviewed plan
on any unsupported encoding, undocumented field, source drift, identity
conflict, link ambiguity/cycle, offset overflow, parser/validator disagreement,
nondeterminism, unexplained Maker semantic divergence, engine load/play/render
failure, atomic-replacement limitation or recovery-test failure.

#### Small-batch existing-SFF checkpoint — 2026-10-04

The Creator can now bind its retained draft to an exact existing SFF
fingerprint, populate occupied identities and embedded palette choices from that
archive, stage one or a small set of PNG sprites, and generate a full reviewed
candidate while retaining every untouched physical sprite, axis, palette
assignment, physical position and embedded palette. New identities append after
the retained physical table. Repeated group/index identities in the source are
preserved as separate physical entries with separate snapshots; attempting to
replace an identity that occurs more than once stops as ambiguous.

The primary Creator action now runs the established SprMake2 production route:
private candidate, friendly plus applicable independent strict validation,
target-fingerprint recheck, atomic adoption and Recovery Center history. The
package-only action remains available. Failure, cancellation or target drift
retains the draft and leaves the active archive unchanged. The built-in writer
remains Compare-only. Its reviewed backward palette/sprite-link support is now
implemented, but adoption still waits for the documented golden-archive and
IKEMEN runtime evidence gates.

After the private SprMake2 candidate passes validation, Creator now pauses at a
second explicit **candidate-versus-active** adoption checkpoint. It compares
the exact loaded candidate bytes with the still-current target, reports archive
byte sizes and sprite/palette totals, classifies added/removed/changed/unchanged
sprite occurrences (including duplicate identities), checks axes, dimensions,
format, palette assignment and rendered pixels, and summarizes palette-table
changes. Only **Adopt Validated Candidate** proceeds to the existing atomic
write. Cancel discards the private run while retaining both the active archive
and Creator draft.

The production path now closes the receipt chain after that decision. An
immutable execution receipt links the reviewed package receipt and
ArchiveBuildSpecification hashes to the exact validated candidate hash/size,
friendly and strict validation evidence, active-versus-candidate impact,
backend identity and either **validated-and-adopted** or
**validated-adoption-cancelled**. Successful receipts record the final target
hash and Recovery Center backup/journal identities; cancelled receipts record
no adoption and leave the retained draft available.

Exact replacement and temporary-palette lifecycle cleanup are now implemented
through the same Creator transaction. **Change Image** binds one unique physical
sprite to an indexed replacement, preserves its identity, axis, palette and
physical position, and blocks ambiguous or undeclared collisions. When a
reviewed deletion removes every exact owner of a temporary palette, Creator
shows a separate palette-deletion proposal. The proposal remains blocked by any
remaining sprite use, palette link, literal authored reference, unresolved
dynamic reference, incomplete owner evidence, archive drift or lifecycle
registry drift. Accepted sprite, palette and registry changes are sealed into
one package and are rechecked before build and again before atomic adoption.

The SprMake2 adapter now losslessly canonicalizes supported indexed PNG8
containers before its private build, including ancillary chunks, PNG filters
0–4 and split IDAT streams, while sealing original and normalized hashes plus
the unchanged decoded index/palette evidence. SprMake2 2.01beta cannot preserve
partial palette alpha and can return success without producing an archive for
that input. Creator therefore retains those source bytes exactly for Package
Only and future certified built-in use, but disables SprMake2 Build and Compare
Both with the precise palette reason. It never flattens alpha silently.

Creator now exposes **Compare Both · No Adoption** against its own reviewed
package. It reuses the exact immutable specification and source snapshots,
builds isolated SprMake2 and built-in candidates, runs independent strict
validation, writes the existing hash-addressed comparison report and adopts
neither candidate. Capability review now explicitly rejects non-PNG8,
palette-less or cropped specifications with precise reasons while leaving the
SprMake2 package and Creator draft intact. Built-in adoption remains disabled.

The v2.1 Creator test action now retains two clearly backend-labelled test
candidates from the same immutable reviewed package: one from IKEMaker and one
from SprMake2. Both are independently reopened and strictly validated, and an
atomic pair receipt plus semantic comparison report binds their source,
specification, projection, tool and validator hashes. This is test evidence
only: every execution, adoption, recovery, history and completion authority is
false, the active archive is never replaced, and the Creator draft is always
retained. A semantic mismatch may retain only an explicit
`REJECTED-NOT-EQUIVALENT` evidence set with no success receipt. The v2.0 test
action remains an explicitly single-writer IKEMaker route until a SprMake2
RAW8 adapter is separately proven.

This automatic two-SFF v2.1 action is temporary pre-release physical-comparison
behavior. After the built-in writer completes physical testing and sign-off,
the normal Creator workflow must produce only the user's selected authoritative
SFF. A separately chosen diagnostic **Compare Both / two-file** action may
remain for troubleshooting and regression evidence, but it must not stay the
default creation path.

Creator now also exposes **Validate Existing SprMake2 Output**. The author
selects an already-built SFF and a location for the matching reviewed package;
IKEMaker loads and hashes the selected bytes, validates a sealed private copy
against the package's complete sprite/palette contract, runs the independent
strict validator when the profile is eligible, and writes an immutable report.
The selected output, active target and retained draft are never adopted,
rewritten or discarded by this mode.

The Creator source step now also accepts Photoshop PSDs without changing the
original document. It implements the proven Ryu conversion semantics for the
flattened composite, base layer, isolated named beard/FX/accessory layers, and
base-plus-overlay variants while retaining canvas geometry and source hashes.
Explicitly named frame pages can be consumed directly. A separate **Photoshop
animation timeline** handoff opens the PSD in the one globally configured
Photoshop editor, gives the author a unique staging folder for Photoshop's
documented PNG image-sequence renderer, natural-sorts the rendered frames, and
adds them as sequential sprite sources with PSD/frame provenance. This handoff
does not mislabel ordinary layers as timeline frames and does not silently
create AIR timing. Fully unattended Photoshop timeline rendering and delay/FPS
capture remain a later integration gate because Photoshop exposes this through
its own timeline/image-sequence workflow rather than ImageMagick's PSD pages.

The GIF intake now offers three explicit outcomes: SFF frames only, SFF frames
plus reviewed AIR timing, or **Export PNG sequence only**. The AIR handoff reuses
the existing cumulative 60-Hz converter, sub-tick resample/preserve choice,
replacement confirmation and unsaved review edit. It receives the Creator's
final per-frame group/index identities rather than assuming a consecutive
range, so reorder, overrides and reviewed numbering remain exact. Cancelling
the AIR review leaves the staged SFF frames intact.

The SFF viewer's primary **Add Sprites…** route now opens this shared Creator
with the current archive attached. It accepts one image, any reviewed batch, a
folder, GIF frames or PSD-derived images; there is no single-sprite-only mode.
GIF/PSD decoding occurs before backend selection and therefore supplies the same
immutable PNG snapshots to SprMake2 or a future certified built-in backend. The
Actions menu separately retains **Add Sprites to Legacy SprMaker2 Manifest…**
for authors who prefer direct CSV/text maintenance. Guided Creator, legacy
SprMaker2 text, and the future built-in backend remain explicit choices rather
than silent migrations or fallbacks.

**Create New Archive Instead** now chooses the intended `.sff` destination
before a production build. SprMake2 still writes a private candidate first;
validation completes before atomic adoption, and the destination is rechecked
to remain absent. The new-archive path refuses to overwrite an existing file
and directs that case through the ordinary reviewed existing-target route.
Package-only output continues to remain self-contained in its chosen package.

The Creator's three crop choices are now functional and distinct. **Do not
crop** keeps the source canvas. **Crop source first, then calculate axis** writes
an immutable indexed PNG snapshot inside the reviewed package, preserves all
palette indexes/table entries, and calculates nine-point anchors from the
cropped dimensions. **Calculate axis first, then crop and preserve alignment**
calculates against the original canvas, seals the same reviewed indexed crop,
and records the exact crop-origin axis delta before either backend runs. Fully
transparent or non-reviewable cropped sources fail closed;
original artist files are never changed. The manifest and immutable build
specification retain the original/prepared hashes, source rectangle and exact
per-identity crop mode. A related mixed-batch defect was corrected: selecting
autocrop for only some incoming rows no longer filters uncropped incoming rows
out of the private candidate. Partial existing-SFF crop/rebuild has a separate
explicit manifest scope and retains its previous behavior.

The Creator final review now exposes the consequential choice for every ready
source before either action is enabled: final group/index, exact axis and the
dimensions used to calculate it, crop order, target/temporary/source palette,
duplicate-sharing policy and original source dimensions. This keeps the main
viewer uncluttered while making a mixed small-batch build auditable without
opening its generated CSV or specification. It also summarizes the active,
unchanged, added, skipped and planned-total sprite counts before package or
candidate creation. The source list also provides an
on-demand preview for exactly one marked input. It draws the original PNG with
the proposed final axis, reviewed crop bounds and axis-basis explanation; a
crop-before-axis result is translated back to its original source coordinates
so the crosshair and crop rectangle can be inspected together. Preview verifies
the source hash again, is size-bounded, and never writes the archive.

Each staged source row can now inherit the batch crop policy or override it
with no crop, crop-before-axis, axis-before-crop, or legacy SprMake2 autocrop.
This makes small mixed additions practical without splitting them into several
Creator runs; the per-sprite choice is repeated in final review and the sealed
build specification.

For small related batches, the source toolbar now provides **Copy First Marked
Axis to Marked**. It takes the first marked ready row's reviewed final X/Y and
writes explicit per-source overrides to every other marked row, after which the
ordinary retained draft and final review remain authoritative. It does not add
another axis engine or silently alter unmarked sprites.

The retained source list now has non-mutating search across name, path and
proposed group/index plus **All**, **Ready**, **Conflicts**, and **Changed
sources** filters. Matching results are rendered in bounded 100-row pages with
previous/next controls, an exact page/match/total count, and **Mark Shown** for
page-scoped batch work. **Unmark Shown**, **Clear Marks**, and a live total make
hidden selections reversible without removing staged sources. Hidden rows
retain their selection, order and overrides;
filtering and paging never change the staged recipe. This keeps larger GIF,
PSD, folder and sprite-sheet handoffs reviewable without putting their
management controls back into the SFF viewer. The same source step now offers
an explicit **List / Contact Sheet** switch. Contact Sheet renders at most 48
host-generated indexed thumbnails per page with a 96-pixel edge, rechecks each
source hash before decoding, enforces per-source and aggregate pixel budgets,
and reuses the exact search, filters, marks, ordering and page controls. Failed,
changed, oversized or unsupported previews remain useful labelled cards rather
than unrestricted file URLs. Exact group/index/axis/crop overrides remain in
List mode, so the thumbnail surface is a bounded visual review and never a
second draft or mutation owner.

Backend capability limits are now visible in final review before execution.
Legacy SprMake2 autocrop remains a valid SprMake2 Build and Package Only recipe,
but disables only Compare Both because it has no sealed final crop snapshot.
SprMake2-specific partial-alpha or repeated-identity blockers remain separately
labelled and do not remove the exact package-only path. The certified empty
archive built-in profile no longer demands an unused palette table.

Reviewed **Share identical data** decisions now derive their expected link
groups from decoded pixel hashes, dimensions, color depth, encoding and palette
assignment. Different PNG container bytes may therefore share when their exact
decoded interpretation matches, while equal index data under a different
palette cannot be linked accidentally. Encodings without a trusted decoded hash
continue to use the stricter encoded-byte fallback.

The Creator final review now also inventories the exact duplicate groups before
package creation. For indexed PNG8 it compares decoded indices, effective
dimensions (including the reviewed crop-before-axis result) and effective
target, temporary or source palette route. It lists every group and proposed
identity, the number of possible links, inputs without trusted decoded evidence,
and clearly labelled independent-versus-shared **source PNG byte estimates**;
these estimates are not presented as final SFF sizes because backend compression
and archive tables differ. SprMake2 exposes only one build-wide
`sprite.detectduplicates` switch, so the Creator deliberately does not present
a misleading per-group **Ask each** control for that backend. The exact group
evidence remains available to a future certified built-in mixed-link route.

Palette intent is now explicit in the Creator rather than inferred from whether
a target happens to be attached. New archives use **Image palette**. Existing
archives use a visibly labelled **Master 1,1** or **Stored/FX group,index** entry,
while **Temporary placeholder palette** retains its separate lifecycle and
ownership checks. Existing archives can also append one reviewed indexed image
palette per incoming sprite to a chosen group. Allocation begins after that
group's highest occupied number, preserves source order and exact RGBA tables,
checks the 0–65535 range, shows every final assignment, and enters the same
candidate validation path instead of pretending to reuse an embedded table.
Temporary ACT/PNG palette sources now also require an explicit **Index order
(0 → 255)** or **Reversed Photoshop order (255 → 0)** interpretation. Changing
the choice re-reads the exact source bytes, recalculates palette/partial-alpha
evidence, rechecks every staged sprite and requires a reviewed remap when the
indexes no longer match. The chosen interpretation appears in final review and
is sealed into palette provenance and the immutable specification; the
SprMake2 adapter then writes its ordinary normalized private ACT snapshot.

Palette Workshop now annotates every embedded palette backed by a temporary
lifecycle record with its lifecycle identity, owner count and note. A registry
whose sealed SFF hash no longer matches is visibly marked stale rather than
trusted. This keeps temporary-palette preview, ordinary add/create staging,
reviewed deletion and the final SprMake2 rebuild in one ownership-aware surface;
the lifecycle record remains external metadata and direct color preview does
not acquire deletion authority.

Creator drafts can now be exported and imported as a versioned JSON recipe.
The export retains batch defaults, per-sprite overrides, source hashes, target
fingerprint and project-relative recovery hints. Import rejects unsupported or
unsafe path records, resolves portable in-project paths, re-reads every source
and target, and returns changed inputs to the normal blocked review state; it
does not write or adopt an SFF merely by loading the plan.

Recorded implementation: GIF and PSD intake can also export an ordered PNG sequence without staging SFF
or AIR changes. The export is collision-safe and atomic, verifies frame bytes
again at commit, and writes a provenance manifest containing original ordinals,
GIF delays or PSD roles/pages and source identity. Extracted frames admitted to
the Creator are retained in a content-addressed project cache instead of the
operating-system temporary folder, so draft recovery is not silently broken by
temporary cleanup or restart. Photoshop timeline delay/FPS capture remains a
later integration gate because Photoshop exposes that information through its
own timeline renderer.

Parity requirement: the ordered-image export and reviewed AIR handoff are shared
services, not GIF/PSD-exclusive UI. Expose them for other supported ordered
sources and reviewed sheet/SFF selections when their decoder/reader provides
the necessary data. Preserve indexed pixels and palettes where available, and
show missing timing instead of inventing delays. This records the requirement;
it does not certify that every adapter already implements it.

#### Deferred sprite-sheet silhouette intake — requested and New Dev expanded 2026-10-04

Status: phased implementation started. The Creator now exposes **Add Sprite
Sheet…** for the first safe explicit-grid slice: indexed PNG8 input, reviewed
cell size/offset/gaps/order, visible unused-edge warnings, exact index and
256-color-table preservation, immutable cached frame snapshots and source/cut/
pixel/palette hashes handed to the ordinary Creator draft. It never writes an
SFF during extraction. The versioned pure review model also implements the
Up/Down/Left/Right distinction, the separate Group-complete Right/Stop for Axis
Review state, problem resolution, logical-group suggestions, exact Creator
handoff, and a hash-chained journal. A project-local session store now retains
the immutable source snapshot, extracted frames and exact cursor; rejects
concurrent/stale writers and unsafe paths; reclaims a proven dead-process lock;
and fails closed on changed recovery bytes. The focused responsive review panel
now shows the current frame and a bounded 48-frame contact-sheet page, exposes
visible equivalents for the keyboard actions, distinguishes ordinary Right /
Incorrect Cut from checkpoint Right / Stop for Axis Review, records and resolves
problems, saves/closes without touching the Creator draft, and resumes by exact
source hash. Its optional first-frame axis checkpoint runs the existing
silhouette matcher across the completed logical group, persists the evidence,
and hands only suggestions to Creator overrides. Creator remains authoritative
for final identities, palettes and axes. The Sources step can now run a bounded
reviewed gutter analysis before exact-grid entry: the author explicitly chooses
transparent palette entries or one exact palette index as background, chooses a
per-line noise allowance, reviews every empty row/column range and ignored-pixel
count, and receives a tight regular-grid prefill only when occupied run sizes and
gaps agree. Irregular results never invent geometry, and the author still edits
columns, rows, cell size, offset and gaps before extraction. These slices are
source-tested. An optional bounded connected-component audit now follows the
reviewed grid: the author explicitly chooses alpha/index background, 4-way or
8-way connectivity and a small-area review threshold. It reports components
crossing multiple cells, exact foreground pixels in gaps/outside cells, and
small components without deleting or reclassifying any pixels. Stable component
IDs, mask/evidence hashes and per-frame memberships survive session recovery and
flow into Creator source provenance. This is an audit—not an assumption that one
component is one frame. The focused review now also supports exact numeric
rectangle correction through visible X/Y/width/height controls and the documented
Enter route. A correction is hash-journaled, bounds-checked against the immutable
sheet, and atomically regenerates only that session's cached indexed frame while
preserving its palette/index data. Adjusted frames invalidate their old component
membership evidence and carry the reviewed rectangle into Creator provenance;
the active SFF remains untouched. Axis checkpoints now expose every group result
as editable X/Y values with per-frame trusted-reference checkboxes. Authors can
promote corrected frames, re-run the group with one reference or weighted
multi-reference consensus, and explicitly save manual edits. Reference IDs,
  algorithm, confidence/evidence and final axes persist in the journal and Creator
  handoff. Previously accepted results are changed only by the explicit Refine or
  Save Edited Axes actions. Each result now has an explicit accepted, corrected,
  rejected or unresolved state. Refine can target only checked unresolved/selected
  non-reference frames while preserving every other saved result; trusted frames
  must already be accepted/corrected. Continue is blocked while unresolved results
  remain, and rejected results deliberately omit an axis override from Creator.
  A later reviewed rectangle correction now marks the changed frame's saved axis
  decision and any non-reference decisions that depended on it as a trusted
  reference for re-review. The UI identifies those exact decisions, offers checked
  selective re-runs, and blocks both checkpoint continuation and Creator handoff
  until the author explicitly re-runs or reaffirms them; unrelated decisions are
  preserved.
  The focused review now also supports the first bounded floating-part attachment
  slice. It lists stable audited component IDs near the current frame, records an
  optional note, and requires explicit exclusive or deliberately duplicated
  ownership. Exclusive attachment rejects components already owned by another
  cut or attachment; duplicate ownership remains possible but visibly warns.
  The plan records component/mask/evidence hashes and union bounds, warns when
  the union crosses another reviewed frame or a component crosses a cut, and
  atomically regenerates only the affected cached indexed frame. Detach is a
  separate persisted action that restores the reviewed base rectangle. Attachment
  provenance reaches Creator handoff, and any prior dependent axis evidence is
  invalidated by the same targeted re-review gate as a rectangle correction.
  Axis review now loads full cached frames only on demand for a selected decision
  and offers both a bounded side-by-side view and an origin-aligned onion overlay.
  The overlay uses the saved candidate/reference axes, a visible shared-origin
  crosshair, nearest-neighbor rendering and a 20,000-pixel safety bound; it does
  not silently use unsaved field edits or preload an entire large group.
  A conservative suggestion pass now identifies unassigned audited components
  whose nearest reviewed frame is unique and within a bounded gap. Suggested
  parts are merely selected for inspection; ties remain visibly ambiguous and
  no pixels are attached until the author invokes the existing reviewed attach
  action. Individual grid cells can also be explicitly reviewed and excluded;
  they remain in the recoverable journal but are omitted from axis groups and
  Creator handoff, while an all-excluded sheet fails closed. Creator consumes
  only those included handoff rows rather than assuming every cached extraction
  remains present. In addition to row-major, column-major and snake traversal,
  setup now accepts an exact custom permutation of every row-major cell; missing,
  duplicate and out-of-range positions are rejected before extraction. Broader interactive clustering/merge/split, lasso/mask correction,
  labels/OCR and later phases below remain pending.
Do not treat the explicit-grid workspace as the completed silhouette workflow
or as authorization to change the active SFF.

Add **SFF Creator → Sources → Add Sprite Sheet…** as a focused intake
sub-workspace. Do not add permanent controls to the SFF Viewer and do not give
the extraction workspace archive-writing authority. It produces reviewed,
immutable frame snapshots and hands them to the existing Creator source list;
Creator retains final numbering, collisions, palettes, axes, sharing, backend,
validation and adoption ownership.

Keep three states visible and distinct:

- **Suggested:** grid, gutter, silhouette/component, label or ordering analysis.
- **Reviewed:** the author accepted or corrected the cut and classification.
- **Handed off:** exact hashed frame snapshots entered the Creator draft.

No detection confidence may write an SFF, allocate final sprite identities,
remove pixels, select a palette or bypass final review.

##### Extraction modes and silhouette rules

1. Start with deterministic explicit-grid extraction: cell width/height,
   offsets, spacing, expected rows/columns, live overlay, row-major,
   column-major, snake or custom order, per-cell include/exclude and sheet-edge
   remainder warnings. Save optional geometry-bound artist/source presets.
2. Add reviewed whitespace/gutter suggestions. Build a foreground mask from an
   explicitly selected background rule: alpha, eyedropper color, exact color or
   a visible tolerance. Never assume white, black, transparency or index 0 is
   background. Show empty row/column ranges, pixels crossing proposed cuts,
   empty cells, regularity, noise threshold and the reason for confidence.
3. Add bounded connected-component analysis with four/eight-way connectivity,
   minimum area, maximum clustering distance, expected frame size/count,
   alignment preference and overlap policy. One component is not automatically
   one frame: eyes, weapons, shadows, sparks, costume pieces and adjacent
   touching poses are all expected cases. Retain component membership and the
   reason behind every proposed frame cluster.
4. Treat a floating attached portion as explicit authorship. The author selects
   a base frame plus disconnected components and chooses **Attach these portions
   to this frame**. Store stable frame/component IDs, source-mask hashes, union
   bounds, exclusive or explicitly duplicated ownership, and an optional note
   such as `floating sword`, `shadow`, or `attached projectile`. Warn when the
   union rectangle crosses another frame or reuses source pixels.
5. Separate **Adjust crop rectangle** from **Edit frame membership mask**.
   Rectangle edits preserve every enclosed pixel. Lasso/component membership
   may include or exclude regions only through a kept/removed/overlap preview.
   Indexed masking requires a reviewed transparent index; otherwise allow only
   rectangle extraction or hand off an explicit palette-remap requirement.
   Provide numeric rectangles, component checklists and merge/split actions as
   non-pointer alternatives.

Useful overlays and audits include source/cut/foreground/component modes,
unassigned-foreground heatmap, overlap and clipped-pixel counters, pixel grid,
fit/zoom-to-frame, expected-frame reconciliation, duplicate-frame suggestions
without automatic removal, adjacent-frame onion overlay, shared-baseline
suggestions, sequence playback and a virtualized contact sheet with unresolved-
only and confidence/reason filters.

##### Optional labels and group suggestions

Text recognition is optional, local when available and suggestion-only. Let the
author mark likely label bands, then show recognized text, bounds, engine and
confidence. Accepted labels may suggest logical names or boundaries. Numeric
text may suggest a group number but never allocate one automatically. Never
silently discard a region as text because effects, UI glyphs, portraits and hit
sparks may resemble labels.

When labels are absent, the author chooses the first intended group and enters
an armed keyboard slideshow review. Shortcuts operate only while that dedicated
viewport has focus:

- **Up:** keep the frame in the current logical group, persist, then advance.
- **Down:** keep the frame, close that logical group, persist, then advance in a
  new logical group.
- **Left:** undo the complete most recent classification event and return to it.
- **Right:** persist **incorrect cut**, keep the current frame in place and open
  or focus a compact Problems list.
- **Enter:** inspect or correct the current cut.
- **Space:** toggle source-sheet versus extracted-frame preview.
- **Escape:** leave armed review mode without losing progress.

Down creates a logical boundary, not an implicit numeric `group + 1`. The first
logical group uses the author-selected numeric group. At final review, later
logical groups receive editable suggestions from an explicit policy: next free,
increment by 1, increment by 10, custom sequence or unresolved. Every shortcut
also has a visible button. Ignore arrows inside inputs, text areas, selects,
dialogs, lasso controls and screen-reader widgets; suppress key-repeat so one
press cannot classify multiple frames. A saved acknowledgement must complete
before the slideshow advances.

After Down closes a logical group, enter a visibly distinct **Group complete**
checkpoint before showing the next group's first frame. At this checkpoint:

- **Up / Continue** begins the next logical group immediately.
- **Right / Stop for Axis Review** persists the checkpoint, pauses the
  slideshow and opens the completed group in the existing Auto Axis review.
- **Left / Reopen Last Frame** returns to the last classification in the group.
- **Escape / Save and Close** leaves the resumable session at the checkpoint.

Right therefore retains **incorrect cut** during ordinary frame review and means
**Stop for Axis Review** only while the clearly labeled Group-complete checkpoint
has focus. Do not hide this state distinction or let Right stop in the middle of
an unfinished group. Visible buttons and shortcut help change with the state.

##### Auto Axis group-reference workflow

The first reviewed frame of a logical group can become that group's initial axis
reference. The author places or confirms its exact axis, then runs the existing
Auto Axis suggestion model over the remaining reviewed frames in that group.
This remains a proposal: extraction never writes axes into an SFF, and source-
sheet coordinates never become gameplay axes automatically.

For every proposed frame, show its reference frame(s), suggested X/Y, delta,
confidence/evidence, silhouette overlay and maximum-offset warning. The author
may accept, edit or reject each result. A corrected frame can be promoted to an
additional trusted reference so later frames use a growing reviewed set.

- Provide **Use as additional axis reference** on accepted/corrected frames.
- Scope references to the current logical group by default; reusing a named
  reference set in later groups is deliberate.
- Start with one-reference matching, then use the existing multi-reference
  weighted consensus when two or more trusted frames are available.
- Let references be enabled, disabled, ordered and annotated. Explain which
  references influenced each suggestion.
- Re-run only unresolved or explicitly selected frames after adding references;
  never silently replace previously accepted axes.
- Queue low-confidence or excessive-delta results instead of clamping them.
- Offer side-by-side/onion overlays of current frame, primary reference and
  proposed alignment.
- Show accepted, corrected, rejected and unresolved counts before **Continue to
  Next Group**.

Persist the axis checkpoint, trusted-reference IDs, exact reference image/mask
hashes, authored axes, algorithm/version, evidence and per-frame decision in the
sheet journal. Resume must restore the same group, frame and review state after
close, crash or power loss. If a cut, mask or reference changes, invalidate only
dependent unresolved suggestions and mark accepted dependent results for review;
never silently recompute and adopt them. Creator handoff includes reviewed axes
and reference/evidence provenance, while Creator's final axis review remains
authoritative.

The structured Problems list should include incorrect cut, split silhouette,
combined neighboring frames, missing floating portion, unexpected component,
clipped pixels, overlap, unassigned foreground, suspected label, empty frame,
background/transparency uncertainty, palette blocker, ordering uncertainty and
an optional typed note. Right opens this list rather than forcing the author to
remember another shortcut. Provide **Skip for later**, counts for reviewed,
remaining and problem frames, and a visible undo-history indicator.

##### Power-loss-safe session and resume contract

Workspace state alone is not sufficient. Store each project-local session at a
path such as `.ikemen-tools/drafts/sff-sheet/<session-id>/` with:

- An immutable source-sheet snapshot and exact source hash.
- A versioned session document with stable frame, component and logical-group
  IDs, current cursor, settings revision, problems and handoff state.
- A hash-chained event journal.
- Content-addressed extracted frames and separate masks/components when needed.
- A Pending Changes record that resumes the exact session.
- A live-session lock that blocks concurrent mutation.

Every meaningful action—Up/Down/Left/Right classification, accepted detection
settings, crop/lasso correction, attachment changes, reorder, accepted label,
group-number edit, problem resolution/note and final handoff—must atomically
update the session/journal and confirm persistence before the UI advances. Zoom,
pan, hover and uncommitted slider movement remain transient.

Recovery validates the immutable source hash and journal chain, replays only the
last valid event prefix, reports any interrupted/corrupt tail and never silently
rebinds to changed artist bytes. Offer **Start a new revision from changed
source** explicitly. Keep the recovery session after handoff until the author
archives or discards it. Simulate power loss between every persisted boundary,
including between extracted-frame storage and session advancement.

Each reviewed frame hands Creator provenance containing session/revision, source
sheet name/hash, stable frame ID, source rectangle, component/attachment IDs,
optional mask hash, extraction method, extracted byte and decoded-pixel hashes,
logical group token/suggestion, output order, note and problem-resolution state.
Repeated handoff must be idempotent.

Palette and axis safeguards:

- Rectangular indexed extraction preserves exact pixel indices and palette.
- Do not quantize RGBA automatically or assume every frame from one bitmap has
  one intended stored palette.
- Masked extraction requires a reviewed transparent index or explicit remap.
- Report per-frame palette divergence after correction.
- Duplicate proposals compare decoded output, not rectangles or file bytes.
- Sheet placement and transparent bounds may suggest baselines/axes only; final
  gameplay axes remain reviewed Creator decisions.
- Show how trimming changes candidate axes and retain original sheet coordinates.

##### Phased delivery and test gates

Phase 0 locks the versioned session/event/provenance schemas, limits, immutable
source snapshot, pure keyboard state machine and representative fixtures. Phase
1 delivers explicit grid extraction, contact-sheet/slideshow review, logical
group boundaries, crash-safe resume and Creator handoff. Phase 2 adds reviewed
background masks and gutter suggestions. Phase 3 adds components, clustering,
merge/split and floating attachments. Phase 4 adds rectangle/lasso membership
editing with indexed-transparency safety. Phase 5 adds author-marked labels and
optional OCR/group suggestions. Phase 6 adds recipes, large-sheet workers and
virtualization, advanced palette clusters, portable session export and final
accessibility/performance polish.

Tests must cover exact grids and ordering; ambiguous backgrounds/gutters;
touching silhouettes, dust, shadows, weapons, sparks and floating attachments;
overlap/duplicated membership; indexed masking failures; exact pixel/palette
hashes; all arrow-state transitions and undo; the Group-complete Right/Stop state
without changing ordinary Right/incorrect-cut behavior; ignored/key-repeat input;
first-frame reference confirmation; single- and multi-reference axis suggestions;
promotion of corrected frames into the trusted set; selective re-run without
overwriting accepted axes; changed-reference invalidation; axis-checkpoint crash
recovery and exact axis/evidence handoff; crash at
every event boundary; corrupt journal tails; changed originals; locking and
idempotent replay/handoff; zero SFF writes during extraction; provenance into
Creator/build receipts; unresolved-problem handoff blocking; decompression bombs,
dimension/rectangle overflow, malformed masks/polygons, recipe path traversal,
large component counts, cancellation, bounded thumbnails and virtualized lists.

Explicitly prohibit assumptions that background is white/black/transparent,
index 0 is transparent, one component equals one frame, nearby components belong
together, empty-looking pixels are dust, regular spacing proves an animation,
reading order is left-to-right, OCR is correct, a label owns the nearest row,
sheet coordinates are gameplay axes, similar/equal frames authorize sharing,
all frames use one palette, trimming is harmless, extraction order implies AIR
timing or a lasso may erase indexed pixels without a transparency decision.

## Palette tester feedback — defer until next reset (2026-09-29)

Corrected user attachment: C:/Users/Keith/OneDrive/Pictures/Screenshots/Screenshot 2026-09-29 080449.png. Replaces the mistakenly supplied palette-panel screenshot entry only; earlier approved palette consolidation requirements remain unchanged. User requests backlog recording and explicitly waits for next reset. No implementation/testing/release work now.

### Reported bug: Finish Reviewed Build appears unresponsive

KOFHERO77 reports loading palettes and using Insert+Shift Later, then clicking Finish Reviewed Build with no apparent result. Button appears enabled rather than disabled as when there are no changes. Reproduction, installed version and cause are unverified. Next work period: trace staged plan -> build command -> prerequisites/validation -> review/output selection -> completion. Ensure an enabled action either starts the expected reviewed workflow or clearly explains the blocking condition/error; show pending status and truthful final output/adoption state. Do not infer a successful build from staging or silently overwrite the active SFF. Preserve plan/drafts on failure/cancel and prevent duplicate launches. Prioritize this functional report before the optional features below.

### Requested feature: remove selected source palettes from the list

Provide a visible Remove Selected / Clear List action for the chosen import/library input list. User reports pressing Delete on a selected palette instead opens a Save as .csv window; investigate focus/shortcut routing separately, do not assume confirmed cause. Removing from the selection/list must not delete source files on disk, embedded SFF palettes or staged plan entries. If staged removal is offered, label it separately and respect atomic batch/shift dependencies. Support keyboard removal only in the appropriate list context and update ordering/preflight after changes.

### Requested feature: compact gaps in palette slot numbering

Offer a reviewed index-cleanup operation that finds unoccupied palette slots and compacts later occupied slots within a selected group/range. Reporter's example: occupied (1,5) followed by (1,8), with (1,6)/(1,7) unused, becomes (1,5) followed by (1,6). These are palette slot numbers, not the 256 color indices inside a palette. 'Empty' means an unoccupied slot; never infer an existing palette is disposable because its colors are black/transparent/identical.

Preview exact old-to-new mapping, selected boundaries/reserved slots and affected sprite/palette links before explicit Apply. Preserve ordering and other groups; do not silently close intentional reserved gaps. Reuse authoritative palette plan/build owners and stale-source checks. Update supported references coherently; surface external/dynamic DEF/code/remap dependencies that cannot be safely resolved rather than guessing or claiming universal repair. Review behavior alongside batch insertion/aliases and rebuilt-output adoption. No automatic cleanup, file deletion or unrelated renumbering.

Status: deferred backlog. At next authorized work period confirm current implementation, reproduce the build/shortcut reports with bounded checks, then schedule optional removal/compaction features. No desktop/game interaction without authorization.

## Universal Authoring Catalog, recipes, examples, and future Community Library — approved direction 2026-10-01

Status: Phase 1 foundation authorized. Community website/library delivery is explicitly post–Phase 1. Design Phase 1 identities, provenance, compatibility and package boundaries now so community support can be added later without rebuilding the authoring system. Not every suggested community feature is committed; review final scope after Phase 1.

### New Dev review gate for study-driven authoring proposals — 2026-10-02

The authoring ideas arising from the current ZSS study sessions are recorded as
proposals, not immediate implementation instructions. Before any of these ideas
are applied, New Dev must review the combined scope, identify missing cases and
risks, expand the design where useful, reconcile it with the existing catalog,
recipe, sidebar, editor and diagnostic architecture, and explicitly sign off on
an implementation slice. Batch this review later when New Dev usage is
appropriate; do not spend New Dev usage on each small lesson-derived suggestion.
This gate applies to the related `let`/local diagnostics, logic-structure
insertion, function/call discovery and insertion, contextual recommendations,
parameter assistance, visual code previews, favorites/recents/usage ranking,
and other study-driven authoring aids discussed in this section or added to it
later. Recording a proposal here does not authorize code changes.

For `call`, the later review should cover a searchable function picker available
from typed completion and the sidebar; insertion of the selected function with
editable positional placeholders (initially shown as `0` where valid); parameter
name/signature help and rollover documentation for each argument; an optional
controller-like parameter form synchronized with source; favorites first; a
user-selectable recent-versus-most-used ordering; current-file, character,
shared/common, project and all-indexed scopes; and explainable context-aware
suggestions derived from the enclosing block/state, nearby symbols and calls,
project capabilities and similar authored states. Defaults must come from parsed
signatures or declared metadata and must not imply that zero is semantically safe
for every parameter. Preserve ordinary ZSS as the source of truth.

Treat context-aware assistance as an optional full authoring feature rather than
a `call`-only behavior. It may suggest appropriate controllers, ZSS structures,
functions/calls, triggers and expressions, redirects, maps, constants, commands,
contracts, recipe sections, project conventions and related assets based on the
cursor location and surrounding code. Every suggestion must explain why it was
offered and remain a proposal until the user chooses it; never insert, rewrite or
apply code merely because a match was inferred.

Because unsolicited suggestions can be distracting, provide a clear user setting
with at least Off, Manual and Automatic modes. Off performs no proactive
suggestion work. Manual shows suggestions only after an explicit command,
shortcut or sidebar action. Automatic may surface compact suggestions while
typing, but must be dismissible, must not steal focus, and should respect a
per-project or per-language choice. Consider a low-noise mode that shows only a
small indicator/count until opened. Allow temporary session muting and make it
easy to disable from the suggestion UI itself. Keep ordinary completion and
direct catalog search usable independently of proactive suggestions.

### Editor context-menu and symbol-navigation review

New Dev should audit the current text-editor right-click menu before further
authoring actions are added. The menu currently feels overcrowded. Determine
which entries are genuinely useful at the cursor, remove or relocate redundant
IKEMaker entries where safe, and group related secondary actions into clearly
named expandable submenus similar in spirit to VS Code's Peek grouping. Keep the
small set of frequent actions directly visible. Do not hide core native editing,
navigation, accessibility or source-control commands, and do not depend on
submenus as the only keyboard-accessible route.

Function calls need direct symbol navigation. Right-clicking or invoking the
keyboard action on the function name in a statement such as
`call JNP_SF6_ComboCommitAttack(20, 1, 0);` must offer **Go to Function
Definition** and **Peek Function Definition**, resolving to the exact matching
`[Function JNP_SF6_ComboCommitAttack(...)]` declaration even when it is in
another project file. Reuse the canonical project symbol index rather than a
text-only filename search. Handle duplicate/ambiguous definitions with a compact
choice list, and explain unresolved or dynamically unavailable definitions
instead of navigating to a guess. Also consider Find All Function References and
signature/parameter help from the same symbol identity. Review native VS Code
Definition/Peek integration first so IKEMaker does not create redundant menu
commands when standard language-provider navigation can supply the behavior.

Expand this into universal code-symbol navigation rather than treating functions
as a special case. Any parsed/indexed symbol that has meaningful origins or uses
should expose appropriate Go to, Peek and Find actions. This includes maps,
constants, functions and calls, function parameters, commands/input names,
states and StateDef references, animations, helpers/player IDs and named entity
contracts, variables where ownership can be established, sprites, sounds,
palettes, files/DEF references, triggers/controllers where definitions or
documentation exist, and recipe/contract identities. Only show actions that are
valid for the symbol under the cursor.

For a map expression such as `map(JNP_UI_event_display_time)`, distinguish these
destinations instead of pretending maps always have one formal declaration:

- **Go/Peek to Contract or Declaration** when explicit project metadata or a
  documented contract defines the map.
- **Go/Peek to Initialization** for the authoritative reset/default assignment.
- **Go/Peek to First Observed Write** when no declaration or authoritative
  initializer exists, clearly labeling this as index evidence rather than a
  language declaration.
- **Find Writes**, **Find Reads**, and **Find All References**, keeping injection,
  local ownership and receiver/owner context visible where known.

Reference results need collapsible scope groups and counts for **Current File**,
**Current Character**, **Shared/Common Files**, **Current Project**, and, when
explicitly requested, **Other Indexed Projects/Reference Packs**. Do not mix
these scopes into an unexplained flat list. Remember the user's last useful
expanded scope while still showing that additional matches exist. Provide search
and filters for read/write/initialize/call/definition/contract relationships.
Use exact parsed symbol identity and project ownership where possible; surface
ambiguous dynamic references separately and never claim a text match proves the
same runtime symbol.

This navigation should connect to the existing Project Knowledge relationship
model rather than create another independent window or index. Context-menu,
keyboard, hover, sidebar, Problems/QA and Project Knowledge routes must resolve
the same canonical symbol identity and results. New Dev must review and expand
the complete symbol-kind/relationship matrix before any implementation slice.

### Editor-tab navigation and grouped project explorer proposal — 2026-10-02

The native editor-tab strip becomes difficult to navigate when many character
files and IKEMaker workspaces are open: its scrollbar is small and normally
hidden until hover. New Dev should first determine which improvements are
possible through supported VS Code APIs and settings. Do not patch private
workbench DOM/CSS or depend on undocumented tab commands merely to alter the
native strip.

The 2026-10-10 bounded implementation review confirmed that this request
targets VS Code's native editor-tab strip, not an IKEMaker-owned webview tab
row. The public tab-groups API exposes tab identity/state and close operations,
but no exact activate/reveal/scroll operation; reopening a URI cannot preserve
arbitrary custom-editor, notebook, diff, webview, preview or duplicate-resource
tab identity. Therefore IKEMaker must not inject private CSS, resize the native
scrollbar, simulate scrolling, or add misleading arrows to the editor title or
Text Toolbar Companion. Document these user-controlled native alternatives in
the eventual UI guidance without changing them automatically:
`workbench.editor.titleScrollbarSizing: "large"`,
`workbench.editor.titleScrollbarVisibility`, `workbench.editor.wrapTabs`, the
Explorer Open Editors view, Ctrl+PageUp/Ctrl+PageDown and Ctrl+Tab navigation,
and optional native tab indices/custom labels. The later Master Authoring Bar
study retains ownership of an IKEMaker navigator and must define supported tab
classes plus an exact activation mechanism before implementation. Its arrows
must be labeled and keyboard accessible, disable at the ends instead of
wrapping, distinguish duplicate names, expose dirty/pinned/preview state, and
announce active position to assistive technology.

Where supported, add a compact tab/workspace navigator to the Master Authoring
Bar with **previous/next tab** arrows and **previous/next page** double arrows.
Page movement should default to six visible entries but be configurable and
clamp cleanly at each end. Also provide a searchable open-editors/workspaces
list, recently used order, pinned/favorite destinations and keyboard access.
Keep exact editor identity when two tabs share a filename, show dirty/pinned/
preview state, and never close, reorder or save a tab as a side effect of
navigating. If supported APIs cannot scroll the native strip itself, make the
Master Authoring Bar navigator the truthful supported alternative rather than
simulating private UI interaction.

Move IKEMaker Tools and character-workbench launch/navigation into the planned
Excel-style Master Authoring Bar so they do not permanently consume the primary
left sidebar. Preserve optional sidebar shortcuts/favorites for users who choose
them, but default the left sidebar to coexist cleanly with the normal file
Explorer and other native VS Code views. Do not duplicate separate stateful
versions of a tool between the toolbar and sidebar; both routes open/focus the
same workspace or panel identity.

#### Viewer and text-editor fusion direction — 2026-10-10

Prefer cohesive task workspaces over opening many separate source tabs. Move
Lab's connected-code editor is the reference pattern: a viewer may expose the
exact source block related to the selected sprite, animation, sound, state,
controller, stage element or screenpack element; retain an unsaved draft;
detect when the underlying source changed; and offer explicit Apply, Discard,
Rebase and Open Full Text actions. Viewer-owned previous/next/page navigation,
search, lists and internal tabs may be implemented honestly because IKEMaker
owns those controls. Preserve selection, scroll position, expanded sections and
drafts while switching between visual and source views.

Do not try to replace VS Code's complete text editor inside every webview. The
embedded source view is a focused editor for one exact owned block or structured
record, not a duplicate full-file IDE: normal full-text editing remains
available through **Open Full Text** so users retain language services, search,
multi-cursor editing, extensions, source control and standard keybindings.
Embedded edits must apply through the open VS Code document so Undo works, must
never silently save to disk, and must stop on ambiguous ownership or a changed
source baseline. Viewers that cannot prove an exact reversible source mapping
remain read-only and route to the full editor.

Use a common compact shell across character, SFF, AIR, SND, palette, stage and
screenpack workspaces: visual view, focused source view and optional combined
split view; the same quick-action sizing and domain colors; one primary scroll
region where practical; and overflow in the viewer's dropdown/browser rather
than permanent button rows. Each specialist may add useful domain-specific
actions without breaking the shared layout. This fusion is a staged Phase 1 UI
cohesion follow-on and does not reopen the paused SFF writer or Palette Workshop
goals.

##### New Dev expansion: task-focused authoring workspaces — 2026-10-10

**Verdict: APPROVE WITH CONDITIONS.** Build one task workspace combining visual
inspection, semantic structure, connected resources, recipes and a bounded
source-block editor. Do not build a general-purpose webview IDE or a second
source-of-truth buffer. Reuse the Master Authoring Bar, universal viewer shell,
portable-panel, Visual Code Structure/Focus Mode and native-editor bridge
contracts rather than creating another shell.

##### First-run authoring preference and permanent opt-out

The fused workspace is optional. On first use of the new authoring experience,
show one concise, keyboard-accessible choice with an honest preview of the
difference:

- **Normal text editor:** keep VS Code source tabs as the primary editing surface;
  viewers, recipes and Visual Code Structure remain available only when launched.
- **Integrated workspace:** use the task-focused Visual/Source/Split shell while
  retaining **Open Full Text** everywhere.
- **Ask for this task:** choose when opening an applicable authoring task without
  changing the saved default.

If onboarding is dismissed, fails or has not yet run, remain in **Normal text
editor** mode. Never infer consent from opening an existing viewer, never replace
already-open source tabs, and never auto-open companion/floating panels because a
mode exists. Store the user-level preference separately from an optional explicit
workspace override, show which scope currently wins, and provide the same setting
in Settings, the Master Authoring Bar and Actions search. Changing modes affects
future routing only unless the user explicitly chooses to convert the current
layout. It must be reversible without losing tabs, drafts, selections, history or
saved viewer layouts. Existing installations receive the prompt only when first
invoking this new experience; dismissal preserves native-editor behavior and the
prompt remains manually reopenable.

##### Visible navigation for viewer-owned tabs

Every Integrated Workspace with more than one internal tab/page must provide a
prominent, always-discoverable navigator near the tab row: previous and next
arrows, a visible position slider, and a text readout such as **3 of 12 · Focused
Source**. Where the set is long, add previous/next-page controls and a searchable
tab/file list through the same compact overflow pattern. Moving the slider selects
an exact viewer-owned tab; it is not a zoom, frame, sample or timeline control.
Use clear labels/tooltips and visually separate domain sliders so their purpose
cannot be confused.

Navigation must keep the active tab visible, clamp at each end, disable unavailable
arrows, and never wrap unexpectedly. Support Left/Right, Home/End, PageUp/PageDown
and direct tab-list selection; announce the active position/name and any disabled
reason. Preserve each tab's scroll position, selection, expanded panels and safe
draft state. A pending apply, conflict or ownership transfer may block switching,
but must explain why and provide the appropriate Resolve/Discard/Keep Draft route.
Renamed, removed, filtered or capability-gated tabs update the range and focus
without selecting a different similarly named file. At narrow widths retain the
arrows, slider/readout and section picker rather than hiding navigation behind
horizontal scrolling. This applies only to IKEMaker-owned viewer tabs; it does not
claim control of VS Code's native editor-tab strip.

Offer three interchangeable presentations for the same viewer-owned destinations:
**Tab Strip**, **List**, and **Cards**. Cards group related destinations into
clearly titled sets such as Move Authoring, Character Code, Animations & Sprites,
Sounds, Shared Systems, Stage, Screenpack, QA/Testing or user-created sets. Provide
automatic suggested grouping from Authoring Context plus manual create, rename,
reorder, collapse, pin and move-between-set actions. The current card shows active
state and each card exposes concise dirty, draft, conflict, missing, read-only and
connected-file status without relying on color alone. Sets show visible item counts
and may be searched or filtered without losing their saved organization.

Cards are navigation references, not cloned tabs or independent editors. A viewer
destination has one canonical identity and shared state even when a user creates
an optional shortcut to it in more than one set. Activating any card focuses the
same underlying destination and updates the arrows, slider, tab strip and list.
Deleting a card or set removes only that organization reference and never closes,
deletes or saves its file unless a separate explicitly labeled close action is
chosen. Persist card organization independently from temporary filter/search state;
provide Reset to Suggested Groups and export/import only through reviewed workspace
layout settings. Cards need list-equivalent keyboard navigation, meaningful heading
and grid/list semantics, responsive one-column presentation, and a compact summary
instead of a dense grid at narrow widths.

##### Browser-hosted sidebar and navigator panels

Any IKEMaker-owned sidebar feature that benefits from more room may also be opened
inside the optional companion/browser: Code Navigator, Visual Code Structure,
Project Data Maps, Project Knowledge, connected resources, dependency/call graphs,
Problems/QA, recipes/examples, symbols, references/Used By, history, bookmarks,
asset thumbnails and other registered navigation panels. A visible panel picker,
search and Cards/List presentations let users combine related panels into saved
browser sets without permanently filling the main viewer or VS Code sidebar.

The sidebar and browser routes are two presentations of the same registered panel
and Authoring Context—not separate models. Selection, filters, focus sets, active
file/symbol, history, status and safe layout preferences synchronize without echo
loops. Opening a panel in the browser focuses/reparents the supported presentation
or creates an explicitly labeled read-only companion; it must not create another
editable draft or mutation owner. Closing the browser does not close source files,
discard drafts or reset the sidebar. Reopening restores the last safe panel set and
selection, while stale, missing or renamed resources fail visibly instead of being
silently replaced.

Browser panels default to navigation and inspection. Mutating actions remain
capability-gated and dispatch through the same registered owner, confirmation,
preview, Undo and recovery path used elsewhere. Users may dock the browser beside
the primary viewer, place the whole WebviewPanel in a supported floating editor
window, or return panels to the sidebar. Provide Reset Layout, Open in Main Viewer,
Return to Sidebar and Close Browser actions. Preserve keyboard and screen-reader
equivalence, resizable panels, 200% zoom, high contrast, bounded/virtualized large
maps and lists, and a usable single-panel layout at narrow widths.

##### Final New Dev cohesion gate: invariant universal strip and exact source access — 2026-10-10

**Verdict: REVISE BEFORE IMPLEMENTATION.** The task-focused Viewer/Text Editor
fusion remains approved, but no viewer migration may begin until IKEMaker defines
one invariant universal quick-icon strip and an exact source-capability contract.
The upper strip must look and behave like one application in every registered
viewer. Domain-specific tools remain inside their owning viewer and must never
insert, remove, resize or reorder universal slots.

###### One invariant upper quick-icon strip

Every registered IKEMaker viewer, authoring workspace, report and supported
whole-panel browser uses the same universal quick-icon component, icon order, slot
dimensions, row grouping and keyboard order. Render it from one immutable
definition, not per-surface conditional arrays. A surface may change enabled state,
status badge, tooltip or unavailable reason; it may not omit a slot, substitute a
domain action, or move later buttons. Responsive wrapping occurs only at fixed
group boundaries and preserves order. The strip uses no horizontal scrollbar.

The invariant strip covers suite-level routes needed from any viewer: Text/Source,
Back, Forward, Actions search, Related Work, Connected Resources, Code Structure/
Navigator, optional companion browser, Project/Manager, Move Lab, SFF, AIR, SND,
Commands/Movelist, States/Controllers, Palettes, Stage, Screenpack, Run Game,
Infinite VS, Training, Recovery/History, Backup, Switch to IkeMiner, Help and
Settings. Final icon art/grouping needs compact visual review, but stable IDs and
relative positions remain identical. Unavailable routes keep their discoverable
slot and explain why; never redirect to a similarly named file or unrelated object.

The universal region contains **only** invariant suite controls. New/Open/Save,
asset mutations, playback, loop, pause, stop, export, archive/profile switching,
frame movement, sprite operations, collisions, axes, waveform controls, palette
operations, stage rig controls, screen selection, recipes and other specialist
actions belong immediately below it in their viewer's local control row,
inspector, contextual header or categorized overflow/Actions search. Specifically,
move SND Add/Delete/Replace/Export/Play/Loop/Pause/Stop and archive/profile actions
into the SND body beside waveform, selection and archive controls. Apply the same
ownership rule to AIR, SFF, Move Lab, code, palette, stage, screenpack, story,
storyboard, command/movelist, helper, HitDef, throw, spatial, test/release/project
and future viewers. Local controls may vary; the upper strip may not.

Favorites never alter the invariant strip. Put favorites in a labeled row or
Actions surface below it. They invoke the same action IDs and cannot clone handlers
or displace universal buttons.

###### Universal Text/Source button

Every registered viewer has the same prominent **Text / Source** icon in the same
slot. Its target comes from Authoring Context and selected-object source capability,
not filename guessing. Each selection reports exactly one capability:

1. **Exact native source:** verified URI plus optional line/range/symbol; reveal it
   in the normal VS Code editor.
2. **Structured/scoped source:** verified owned block; open Source/Split and retain
   **Open Full Text** for the exact native document.
3. **Multiple exact sources:** open a constrained Connected Resources picker with
   provenance and the active selection first.
4. **Read-only source:** reveal exact source and explain why editing is unavailable.
5. **Binary/generated/no source:** keep the icon discoverable and explain the
   truthful route. SFF/SND may open a proven SprMaker/SndMaker manifest; otherwise
   state that the archive is binary and has no assigned editable source manifest.
6. **Missing, renamed, stale or ambiguous:** fail closed, identify the issue and
   offer Reconnect/Connected Resources/Open Full Text only when ownership is proven.

Selection changes update capability without moving the icon. Dirty open documents
are authoritative. Reveal/open preserves normal VS Code Undo and dirty state and
never saves. The existing broad connected-text picker remains a separate
**Connected Resources** action rather than masquerading as exact source.

###### Viewer/action inventory and scope

Create a machine-readable viewer manifest before changing chrome. Each persistent
surface declares stable ID, family/scope, shell status, universal-strip
participation, Authoring Context owner, exact-source resolver, connected resources,
primary selection identity, local panels, specialist action IDs, mutation owner,
draft/close protocol, Tab/List/Cards destinations, companion eligibility, legacy
commands and accessibility/lifecycle status. Generate audits from the registry so
an unregistered persistent webview fails review.

Inventory at minimum asset authoring (all SFF/AIR/SND/palette/PalFX surfaces),
character/code (Move Lab, Visual Code Structure, command/movelist, helper, HitDef,
throw, spatial, dependency/health, DEF/converter), stage/screenpack/story/roster/
menus, project/review/test/release, and shared companions including Pinned Sources,
Used By, comparison, Project Data Maps, Code Navigator/Knowledge and browser-hosted
panels. Modal confirmations, brief pickers, native Quick Picks and transient
previews are not viewers. Native text editors keep native chrome and supported
editor-title/context/companion routes rather than a fake webview strip.

###### Cohesive consolidation boundaries

Consolidate by authoring task and shared Authoring Context, not extension or visual
similarity. Move Lab may combine visual preview, focused source, structure,
connected files, recipes and QA. Stage, screenpack and story use the same roles
with their own models. Asset viewers share navigation/resources while SFF, AIR and
SND retain separate writers and mutation owners. Browser panels reuse canonical
selection and remain read-only unless ownership transfers with revision checks.

Every applicable Integrated viewer offers Visual/Source/Split plus Tab/List/Cards.
Its arrows, slider and readout navigate only IKEMaker-owned destinations and remain
visually distinct from frame, sound, zoom, palette and timeline controls. Shared
recipes, resources, navigator, structure, maps, QA and help come from registered
panels and adapters—not forked parsers, catalogs, models or toolbars. Focus Mode
hides presentation only, reports hidden items, and retains Show All/Open Full Text.

The Normal Text Editor, Integrated Workspace and Ask for This Task preference
remains. Native is the dismissal/default. Integrated enables viewers but retains
exact Text/Source everywhere. Mode changes preserve tabs, drafts, selection and
layout and never auto-open floating panels.

###### Cohesion implementation stages

1. Freeze migration; generate the complete viewer/action inventory and record
   duplicates, missing bridges, current source routes and legacy aliases.
2. Define immutable universal action/slot groups, exact-source capability schema
   and versioned Authoring Context messages. Preserve command IDs as aliases.
3. Add contract tests and a shell harness proving identical action/DOM/icon order,
   dimensions and unavailable states across representative viewer families.
4. Migrate SFF, AIR and SND together. Move SND specialist actions below the strip;
   provide exact AIR source and honest SFF/SND manifest/binary behavior. Do not
   alter archive writers.
5. Migrate Move Lab, Visual Code Structure and command/movelist with exact block
   reveal and Visual/Source/Split ownership.
6. Migrate remaining character tools while preserving separate drafts/owners.
7. Migrate stage, screenpack, roster, menu, story and storyboard with exact source.
8. Migrate project/review/test/release and companion/browser surfaces; add shared
   Tab/List/Cards only after one-context synchronization passes.
9. Remove bespoke duplicate source/header buttons only after parity, lifecycle,
   keyboard access and physical sign-off. Keep legacy routes until each family
   passes. Require user and New Dev sign-off after each family.

This shell work does not reopen the paused SFF writer or Palette Workshop goals.

###### Cohesion acceptance gates

- Every registered viewer has identical universal action IDs, icon/DOM/ARIA order,
  slot dimensions and responsive group boundaries, with no horizontal scrollbar.
- No specialist action appears in the universal strip. SND playback/archive/
  profile/export remains available locally and through Sounds/Actions.
- Disabled universal slots stay in place with accessible reasons; later icons do
  not shift.
- Text/Source resolves exact URI/range for supported selections and never guesses
  a same-named file. SFF/SND open a proven manifest or explain binary/no source.
- Missing/renamed/stale/ambiguous resources fail closed; dirty/external edits
  cannot apply stale ranges. Connected Resources remains distinct and shows
  provenance.
- Generated audits prove every persistent webview is registered or has a reviewed
  exclusion; do not rely on hand-maintained partial viewer lists.
- Native preference opens no viewer automatically; Integrated preserves Open Full
  Text; switching preserves tabs, drafts, selection and layout.
- Fixed sizing, visible focus, high contrast/non-color status, reduced motion,
  200% zoom and 320–400 px layouts pass.
- Tab/List/Cards/arrows/slider share one canonical destination and state. Browser/
  sidebar synchronization has no echo loops or duplicate mutation owners.
- Repeated open/close/switch/float cycles leak no listeners, timers or stale
  sessions/messages.

Public VS Code limits remain: IKEMaker cannot resize/scroll/restructure the native
tab strip, embed the native Monaco editor/full language-service UI in a webview, or
create arbitrary independent native child windows. The invariant strip applies to
IKEMaker-owned webviews. Whole WebviewPanels may move through supported editor
groups/windows; internal panels remain one-context IKEMaker presentations.

###### IKEMaker Tools parity and obsolete-entry retirement

Every current, supported option exposed by the **IKEMaker Tools** sidebar must be
reachable from the shared toolbar system without requiring that sidebar: place it
in the appropriate Project/Edit/View/Review/Build/Stage/Screenpack/Tools/Help
dropdown and Actions search, with a stable action ID, context requirements,
disabled reason and keyboard-accessible route. “Accessible through the toolbars”
does not mean every tool becomes a permanent upper icon; the invariant icon strip
stays fixed while dropdowns, Actions search, Related Work and local specialist
rows provide complete access without clutter.

Make the action registry the single source for both toolbar and Tools-sidebar
presentations. Generate the Tools tree from registered actions/categories instead
of maintaining an independent list. Add a parity audit requiring every visible
Tools entry to resolve to the same registered handler as its toolbar route, and
every generally supported toolbar tool to appear in Tools or carry a reviewed
reason for exclusion. Labels, availability, help, safety boundary and deprecation
state must remain consistent across both presentations.

Inventory and classify legacy, beta, experimental and duplicate entries before
removal. Current examples needing review include **Open SFF Browser (Comparison)**
and the AIR browser route whose legacy command ID contains `Experimental`. When
the stable SFF/AIR browser, comparison, companion or Integrated Workspace route
fully replaces one of these entries, remove the obsolete label/entry from visible
IKEMaker Tools and menus. Preserve the old command ID temporarily as a documented
compatibility alias for saved keybindings, workspace state and older deep links;
the alias dispatches the canonical action and must not create another panel or
handler. Remove an alias only after a migration period and reference audit.

Do not hide a unique working capability merely because its label says beta. First
prove feature parity, destination/lifecycle equivalence, saved-state migration and
physical UI behavior. Entries with no supported replacement remain visibly marked
legacy until a user/New Dev decision. Retired entries disappear from menus, search,
favorites and first-run choices, while stale saved favorites show a clear
replacement/removal message instead of silently invoking another tool.

Acceptance requires generated set-parity tests across the action registry, Tools
tree, all toolbar families and Actions search; no orphan visible commands; no two
visible entries that open the same canonical surface without a distinct documented
purpose; canonical browser commands open/focus one panel; legacy aliases do not
appear as duplicate actions; removed entries migrate saved favorites/keybindings
safely; and offline help/screenshots name only current user-facing routes.

Use one extension-host **Authoring Context** per selected project object. It owns
stable project/character/asset IDs, current symbol or block identity, connected
files, source revisions, selection, diagnostics, draft transaction and mutation
authority. Embedded, companion and floating views consume that same model; they
must not independently parse, retain or write competing copies.

Shared panel roles, where applicable, are:

- **Primary work surface:** canvas, waveform, timeline, layout preview or focused
  code result. Keep it dominant and do not duplicate it merely for symmetry.
- **Semantic Outline / Focus:** Visual Code Structure tree, breadcrumbs and
  relationships for the selected move, state, function, controller, stage,
  screenpack element or issue.
- **Focused Source:** exact owned block plus explicitly included nested blocks in
  Source, Visual or Split presentation. Permit editing only when a reversible
  range and registered mutation owner are proven; otherwise use read-only source
  with **Reveal/Open Full Text**.
- **Connected Resources:** exact DEF assignments, AIR/SFF/SND/code/common files,
  maps, commands, functions, tests and project knowledge, including provenance
  and dirty/missing/ambiguous state. Never guess by a similar filename.
- **Recipes & Examples:** searchable context-relevant catalog items with
  parameters, dependencies, compatibility, provenance and an exact final diff or
  insertion preview. Browsing never mutates source; applying uses the established
  owner and normal Undo.
- **Inspector, Problems/QA and Help:** contextual fields, diagnostics,
  consequences, learning material and owner/recovery details. These can dock,
  collapse or become internal tabs without losing model state.

The shared Master Authoring Bar and action registry remain the only global action
source. Every workspace receives the same Project/Edit/View/Review/Build/Stage/
Screenpack/Tools/Help families, Actions search, Related Work and connected-file
routes. Every action declares a stable ID, context, owner, change boundary,
keyboard route, disabled reason and optional icon. Show at most five stable
primary quick actions plus a transient Stop/Resolve Conflict action. Favorites
append without cloning handlers; all remaining actions stay in categorized
overflow. Fixed sizing, accessible names and domain colors remain universal.
Universally available means discoverable and capability-gated, not permanently
displaying every irrelevant or unsafe command.

Specialists contribute actions, panels, tools and Inspector fields through
manifests. Panel-header, dropdown, quick-icon and Actions-search routes all invoke
the same registered action. Preserve legacy command IDs as aliases during staged
migration.

Focus Mode hides presentation nodes only. Keep the focused root and its nested
conditions, loops, controllers and local declarations in authored order. Allow
callers/callees, shared functions, maps/constants, commands, animations, sprites,
sounds, contracts, tests and diagnostics to be included. Always show hidden-item
count, breadcrumb/back trail, **Show All**, **Reveal Full Source** and whole-file/
project search. Label uncertain and cross-file edges; never let a filter or saved
focus set change build inclusion or runtime behavior.

Expose three honest source capabilities:

1. **Native linked source:** unrestricted VS Code editing and language services.
2. **Structured direct edit:** a proven field mutation applied to the same open
   `TextDocument` through its registered owner as one Undo step.
3. **Scoped block draft:** retained exact-range draft with Apply, Compare/Rebase,
   Discard and Open Full Text. Apply must revalidate URI, document version, full
   source fingerprint, parser identity, range and draft revision. Rebase must
   display changes and cannot merely accept an unseen new baseline.

Never silently save. Applying changes the open document and preserves VS Code's
dirty state. Webview state stores presentation only; draft text, fingerprints,
request IDs, mutation leases and recovery records stay extension-host-owned. One
context has one editable draft owner. Duplicate views stay synchronized read-only
until an explicit revision-checked ownership transfer. Close, project switch,
reload and external edits use the shared fail-closed busy/draft protocol, and late
messages from disposed or stale views are ignored.

Consolidate by task, not file extension or visual similarity. Move Lab may host
Focused Source, Visual Structure, recipes, connected assets and QA for a selected
move. Stage and screenpack workspaces may use the same roles with their own models.
AIR/SFF/SND can expose connected source and structure without absorbing each
other's archive/build owners. Keep binary archive creation/adoption, external
image/audio editors, runtime windows, destructive confirmation and brief file/
name pickers separate. Never combine character, stage and screenpack mutation
contexts or tools with different transaction/lifecycle authorities.

An optional companion/browser may show large outlines, thumbnails, recipes,
dependency graphs or QA. It reuses the same Authoring Context and defaults to
read-only navigation. It can be an internal dock/tab or a whole WebviewPanel moved
with its VS Code editor group into a supported floating window. Do not promise
arbitrary child windows or independent floating mutation owners. Opening the same
context focuses the existing companion unless another read-only view is requested.

Visual Code Structure supplies parsing, nested boundaries, semantic identity,
relationships and Focus Mode; viewers do not create parallel parsers. Add domain
adapters so ZSS/CNS/Lua, AIR, stage and screenpack structures expose supported
nodes, source ranges, capabilities and confidence. Unsupported/free-form content
remains visible and routes to the native editor. Coding assistance may include
catalog completion, controller/trigger explanations, exact examples, recipes,
diagnostics, comment assistance and optional configured AI, but all suggestions
show provenance and preview and never bypass mutation ownership.

Accessibility and responsive behavior are release gates: complete keyboard/menu
equivalents, visible focus and focus return, correct ARIA tree/grid/tab/toolbar
semantics, live selection/draft/conflict/hidden-count announcements, structured
canvas alternatives, high contrast and non-color identity, reduced motion, 200%
zoom and deterministic wide through 320–400 px layouts. Compact layouts keep the
section switcher, primary surface and Apply/conflict state reachable without
horizontal scrolling.

Public VS Code boundaries remain explicit: an extension cannot alter or reliably
scroll the native tab strip, embed the native editor or its full language-service
UI in a webview, or create arbitrary native floating windows for internal panels.
Webview selection, key handling and Undo are not native behavior unless bridged.
`retainContextWhenHidden` is not recovery. A whole WebviewPanel can move through
supported editor groups/windows; internal panels remain IKEMaker-owned. Use only
verified public APIs/commands and provide truthful manual/native fallbacks.

Implementation order:

1. Inventory every viewer/editor action and assign its stable action, owner,
   context, panel role and legacy route; resolve duplicates before adding chrome.
2. Define Authoring Context, panel/action manifests, capability levels, selection
   envelopes, mutation/draft coordinator and versioned message schemas.
3. Add a read-only Visual Structure/Focus plus Connected Resources companion to
   the experimental shell and prove routing, dirty refresh, restoration, floating/
   narrow behavior and accessibility without touching legacy viewers.
4. Adapt Move Lab's scoped drafts in disposable fixtures, first fixing rebase
   review and centralizing drafts outside webview state. Prove one exact block and
   one structured direct edit before generalizing.
5. Add Recipes/Examples and Project Knowledge using stable catalog IDs and exact
   preview/Undo paths; do not create a second snippet store.
6. Migrate one representative task workspace beside its legacy screen using a
   complete parity matrix and no command redirects.
7. Expand one domain at a time only after user/New Dev sign-off. Retain legacy
   viewers until parity, lifecycle, accessibility, recovery and performance pass.

Acceptance requires: no orphaned/duplicate action handlers; stable quick actions,
favorites and overflow; renamed/dirty assignment routing; nested Focus Mode that
preserves order and reports hidden/cross-file items; read-only ambiguous-range
fallback; exact version/range/fingerprint validation; one native Undo step and no
disk save; reviewed external-edit rebase; duplicate-view write exclusion and
ownership transfer; close/reload/crash recovery; missing/renamed restoration;
recipe dependency/diff/no-op handling; echo-free selection synchronization;
float/return/reload; keyboard/screen-reader parity; high contrast, reduced motion,
200% zoom and 320–400 px layouts; virtualized large trees/lists; and repeated
open/close/move cycles without leaked listeners, timers, models or stale messages.

#### Activated coding goal — Code Viewer Slice 1 checkpoint (2026-10-12)

New Dev final verdict: **APPROVED** for the bounded source slice. The integrated
Coding Viewer now truthfully describes itself as native-document-backed rather
than claiming to be VS Code's native editor. Character Essentials and All Code
retain one grouped Coding Viewer plus SFF/SND/AIR tabs in the same resolved editor
group, while an explicit Native preference continues to use ordinary text tabs.

The viewer has one invariant universal toolbar and colored quick-action region;
all connected source tabs; arrows flanking the tab row; a synchronized slider;
and grouped Cards as hands of tabs. List remains browser-only. Typing targets the
exact VS Code `TextDocument` and its dirty/save authority. Apply, Save Draft and
Discard Draft protocol routes are removed; Ctrl+S and the universal Save action
share the exact current-document owner. Generic active-editor Save/Save As entries
are omitted from the Coding Viewer dropdown so webview focus cannot save an
unrelated editor.

Every Coding Viewer body message now uses an exact bounded schema. Forged extra
fields, ambiguous navigation, invalid modes and `list` fail closed. A grouped
character viewer is never silently restored after reload as a misleading
one-file viewer: the incomplete panel closes and tells the user to reopen
Character Essentials. Retained text involved in an external-edit conflict is
archived with source identity and is reachable through Recovery as a separate
unsaved document; opening it never overwrites the changed source or restores the
obsolete Apply/Discard row.

Focused source verification passes 10/10, with additional toolbar/action parity
tests passing 8/8. This is source evidence, not installed UI certification.
Physical testing still covers editor-group tab placement, colors and sizing,
mouse/keyboard feel, caret/scroll retention, screen-reader behavior, high DPI,
large real character sets and subjective Cards usability. Later slices may add
recovery retention management/comparison, richer native-editor companion actions,
Visual Code Structure, Project Knowledge, recipes and capability-gated string
authoring; they must preserve the single TextDocument/mutation owner established
here.

#### Activated coding goal — Code Viewer Slice 2 checkpoint (2026-10-12)

The Coding Viewer now retains bounded, host-owned caret, selection direction,
horizontal/vertical scroll and per-file presentation state across safe rerenders,
clean external refreshes and connected-file navigation. Focus is retained only
for the live panel session and is never persisted across application restart.
Presentation messages carry the exact current document identity and generation,
contain no source text, and fail closed when stale, forged or oversized. The
native `TextDocument` and `AuthoringSourceDraft` lease remain the only mutation
authority.

Tabs now expose an explicit tablist/tab/tabpanel relationship and manual keyboard
navigation with Left/Right, Home/End and Enter/Space. Cards are labeled groups of
compact navigation buttons rather than a false tablist, while sharing the same
keyboard behavior. List remains browser-only.

Recovery storage now validates a closed bounded record projection, rejects a
single oversized addition without displacing valid recovery, caps record count
and aggregate bytes, and deterministically favors the newest copy for each file
before older history. The Recovery action offers metadata inspection, a separate
unsaved copy, comparison against the exact current source, explicit clipboard
copy and confirmed deletion. It has no Apply, Restore, Save or Overwrite route.

The preserved coding, navigation, recovery, presentation, Character Essentials,
toolbar, save and UI contract suite passes 14/14. Recovery actions re-resolve the
reviewed record after every prompt, and confirmed deletion uses an atomic
revision check so a stale menu cannot open or delete a newer replacement.
Physical signoff is still
required for actual caret/focus feel, screen-reader announcements, high-DPI
scroll restoration and Cards usability.

New Dev approved the next bounded coding slice: keep the main editor unchanged
and place Code Navigator, Project Data Map and read-only Recipe Discovery in the
manual Authoring Browser. Build them from canonical code-structure, project-symbol
and catalog projections rather than arbitrary provider flattening. Browser rows
must use opaque host IDs plus context generation; the host re-resolves exact live
documents, connected-root membership, version/fingerprint and ambiguity before
reclaiming the existing grouped Coding Viewer. Browser messages may never carry
filenames, ranges, source text, commands or executable snippets. Tree/Cards,
bounded filters/search, last-good partial-provider recovery and bounded UI-only
state are included. Semantic aliases remain discovery-only. IKEMEN 1.0 must omit
all Nightly string nodes, recipes, filters and aliases through capability-policy
decisions rather than version guesses. This slice requires its own exact-source,
handoff, bounds, stale-generation, capability-leakage and accessibility tests
before implementation signoff.

Add a collapsible semantic project explorer backed by the canonical project
index. Group character content by meaningful systems such as Normals, Command
Normals, Specials, Hypers, Combo/Scaling, Reactions, Training, Shared/Common,
Assets and Tests/QA, with expandable files, symbols and related actions. A file
or symbol may appear in multiple relevant groups—`sf6_combo_scaling.zss`, for
example, may relate to Combo/Scaling, Normals and shared function relationships—
without being copied or treated as separate ownership. Every appearance must
resolve to the same underlying file/symbol identity. Support user-defined groups,
favorites, search/filter, counts, reveal in native Explorer, and a physical-file
view. Clearly distinguish semantic aliases from duplicate files and avoid
inventing classifications when evidence is insufficient.

This proposal is covered by the study-driven New Dev review gate. New Dev should
reconcile it with the Master Authoring Bar, docking/layout, Project Knowledge,
favorites/recents, responsive narrow-window behavior and native VS Code
navigation before implementation.

#### Activated coding goal — Code Viewer Slice 3 checkpoint (2026-10-12)

New Dev final verdict: **APPROVED** after three review-and-correction rounds.
The manual Authoring Browser now provides bounded canonical Code Navigator,
Project Data Map and read-only Recipe Discovery projections while leaving the
main directly editable Coding Viewer unchanged. Browser source actions carry
opaque row identities only, revalidate the exact connected live document and
its SHA-256/version, and reclaim the existing grouped Coding Viewer instead of
opening another text editor or window.

The one browser window now rebinds atomically between character contexts. Late
provider results cannot overwrite a newer character, last-known-good data is
retained only inside the same context, and a failed Ken refresh can never show
Ryu rows. Navigation remains all-or-nothing through queued owner reclamation,
target-draft preparation and caret staging: source edits or context changes
before final authorization leave the original tab, selection and caret intact.

Tree and Cards presentations have compact category/status/source/compatibility
filters, keyboard traversal, accessible roles and rerender-safe search focus,
caret and scroll. Provider/context/render projections share strict depth, node,
string and aggregate-byte limits with per-provider failure isolation. Semantic
aliases use the existing built-in and configured intent-search contract; only a
unique canonical match gains an alias, while ambiguous phrases are displayed as
non-actionable notices and never become source routes.

Project Knowledge now retains observed map values and function argument kinds,
including verified runtime strings. Typed String Map, String Function Flow and
Runtime String Log recipes are available only when the exact engine capability
policy confirms a supporting Nightly build. IKEMEN GO 1.0 keeps the user's real
source and symbols visible but receives no Nightly string recipes, enrichment,
filters or aliases. The separate Authoring Library follows the same rule,
rechecks capability at action time, uses strict bounded message schemas and
resolves opaque source IDs against the current indexed hash rather than trusting
webview filenames or line numbers.

The preserved focused suite passes 25/25, with a final 13-file authority rerun
and `git diff --check` also passing. The repository-wide suite currently stops
at the pre-existing direct-write allowlist because unrelated Palette Workshop/
SFF files (`player_palette_workspace.js` and
`sff_creator_dual_test_build.js`) are not yet represented in that reviewed
audit; this slice did not alter or waive that safety gate. Physical testing is
still required for actual Tree/Cards feel, search focus, high-DPI layouts,
screen-reader behavior, rapid character switching and large real projects.

### Scoped identifier glossary and reusable-name assistance

Extend Project Knowledge with a searchable glossary of authored identifiers and
their meanings so large projects do not lose track of established vocabulary.
Collect parsed names such as local `let` bindings (`wasStarter`), function
parameters, maps, constants, functions, commands, state/entity identifiers and
documented contract fields. Display the identifier's plain-language meaning,
kind, scope, owner/namespace, type or inferred value shape, definition/origin,
reads/writes/callers, examples, related identifiers, project/template source and
documentation confidence. Let authors add or correct descriptions without
rewriting the source merely to maintain glossary metadata.

Do not present every identifier as globally reusable. Locals and parameters are
lexically scoped and may legitimately repeat or shadow names; maps/contracts and
project symbols have different persistence and ownership. The picker must label
these differences clearly and filter candidates to names valid at the cursor.
For a new `let`, offer established naming vocabulary as optional suggestions and
show what each name has represented elsewhere, but never imply that choosing the
same spelling links the values across functions. For a reference to an existing
local, offer only locals actually visible in that scope. Persistent symbols use
their canonical indexed identities and namespace rules.

Provide filters/groups for current block/function, current file, character,
shared/common, project, template/reference pack and user-defined glossary groups.
Support favorites and recently used names, aliases/search terms, naming-pattern
warnings and detection of the same name used for materially conflicting meanings.
Insertion should use the exact valid syntax (`$local`, `map(name)`, constant,
function call, and so on), with preview/explanation when more than a bare name is
required. Integrate this with hover, completion, the optional suggestion system,
symbol navigation and recipes rather than building another disconnected picker.
This remains subject to the study-driven New Dev review and sign-off gate.

Treat the glossary as a teamwork-cohesion feature as well as individual memory
support. A project may publish a reviewed vocabulary/convention layer containing
preferred identifiers, meanings, namespaces, ownership, lifecycle, examples,
deprecated aliases and replacement guidance. Team members should see the same
project-approved vocabulary in completion, hover, pickers, recipes and review,
while personal favorites and usage history remain separate local preferences.

Changes to shared vocabulary require visible authorship using the contributor's
chosen public identity, review status, revision history and conflict-aware merge;
never silently replace a meaning because another branch or contributor used the
same spelling. Distinguish Proposed, Project Approved, Deprecated and Reference-
Only entries. Diagnostics may warn when new code introduces an inconsistent name
or meaning, but project convention severity must be configurable and clearly
separate from IKEMEN language errors. Offer the approved spelling/identifier as a
reviewable correction, never an automatic project-wide rename.

Store portable team vocabulary in explicit project-owned metadata using relative
or canonical symbol identities rather than machine-specific paths. Support
export/import through the future extension/package model, but do not upload team
code, identifiers, comments or project metadata without explicit user action and
preview. Connect vocabulary entries to contracts, QA/bugs, recipes and affected
symbols so a terminology change can be reviewed for its actual project impact.

### Project coding standards and collaboration decisions

Grow the shared vocabulary into a versioned **Project Coding Standard** inherited
from the selected template and extended by the project. Cover naming/namespaces,
maps/functions/contracts, state and asset ranges, formatting/organization,
preferred logic and redirect patterns, Simul/team safety, helper/player identity,
initialization/cleanup, diagnostics, deprecated practices and replacements. Every
rule records scope, rationale, examples/counterexamples, compatibility impact,
origin and enforcement level: Documentation, Suggestion, Warning, Error, or
Deprecated. Clearly label Universal IKEMEN, Author, Template, Game, Character and
team-local rules. Project rules must never masquerade as engine requirements.

Support a proposal lifecycle: Draft/Proposed -> Discussion -> Approved, Rejected
or Needs Revision -> Published/Deprecated/Superseded. A proposal may suggest a
better name, explanation, rule, implementation pattern, contract, recipe or
template behavior; it may present competing alternatives and tradeoffs rather
than forcing one answer. Allow proposals to target the current character/game or
the upstream template from which the project inherited. Upstream proposals do
not silently modify the template or every inheriting project: review impact,
version the template change, publish migration guidance, and let projects adopt,
defer or retain an explicit override.

Team discussion may occur inside IKEMaker or externally (for example Discord).
External discussion can satisfy a strict in-app discussion/sign-off requirement
when an authorized contributor records a decision summary, participants/date,
outcome and optional external reference/evidence. Label this as contributor-
attested external discussion unless independently imported/verified; do not claim
IKEMaker observed consensus it did not observe. Preserve only the entered summary
and explicitly attached evidence—never scrape or upload Discord/private chat
automatically.

No approval or publication may be silent. When a rule, vocabulary item, contract,
recipe or template proposal is signed off without prior in-app discussion, create
a conspicuous collaborator notice describing who approved it, when, the stated
external-discussion basis, exact changes, affected scope and migration/enforcement
impact. Surface it in a project activity/inbox view, relevant Project Knowledge
items and next-open summary for affected collaborators; allow acknowledge,
comment, challenge/reopen and propose an alternative. Notification does not grant
permission to overwrite a collaborator's work. Keep an auditable decision/revision
history and prevent authors from erasing disagreement or prior published meaning.

IKEMaker should become the durable collaboration source for decisions, standards,
contracts, QA/bugs, proposals and their relationship to code, while remaining
compatible with teams that communicate primarily elsewhere. Avoid building a
mandatory real-time chat clone: capture the actionable conclusion, provenance,
alternatives and project effect. This entire collaboration workflow remains under
the New Dev review/expansion/sign-off gate before implementation.

### Text-editor comment and inline-documentation assistance

This request is primarily for help writing useful comments directly in the code
editor, not for imposing a documentation/sign-off workflow on ordinary code
edits. General edit awareness remains the responsibility of existing IKEMaker
diagnostics/warnings and Git change notices. Do not prompt developers to explain,
test, approve or file a note for every edit, and do not make routine saving depend
on documentation.

When requested—or through an optional quiet reminder at an appropriate
declaration—help the author create or improve nearby source comments. Important
targets include functions and their parameters, shared maps/constants, contracts,
non-obvious local `let` names, state/command routing, reusable logic and temporary
workarounds. For example, above
`[Function JNP_SF6_ComboCommitAttack(starterPenalty, comboSteps, nextPenalty)]`,
IKEMaker can offer a structured comment describing the function purpose and one
line for each parameter (`starterPenalty`, `comboSteps`, `nextPenalty`) so the
author edits a useful draft instead of starting from a blank comment.

Useful actions include **Document This Function**, **Document Parameters**,
**Explain Selected Code as Comment**, **Improve This Comment**, **Add TODO/Reason
Comment**, and **Update Comment for Signature**. Draft from parsed syntax,
signature, surrounding comments, callers/references and explicit project
contracts. Keep the result concise and located beside the code it explains. Show
the proposed text before insertion; the author may edit, accept or discard it.
Never invent design intent, guarantees, ownership, completed testing or reasons
that cannot be established. Mark unresolved meaning as a question/place-holder
rather than asserting it.

Comment assistance modes should include Off, Manual and Optional Suggestions.
Suggestions must remain small, dismissible and non-blocking, with per-project and
per-language control. Favor reminders for a new undocumented reusable declaration
or a parameter/signature change that makes its adjacent comment stale; avoid
repeated prompts during ordinary statement edits. A stale-comment warning is an
authoring suggestion, not an IKEMEN error.

Provide deterministic local templates without AI. Optional AI-assisted wording
may be offered only when configured and consented to, with a preview of context
that would be sent and redaction controls. No comment is inserted, committed,
uploaded or treated as team approval without explicit author action. Parsed
comments may feed hover, parameter help, the identifier glossary and Project
Knowledge, but the source comment remains the authoritative authored text. New
Dev must review the UX, inference limits and supported documentation targets with
the wider authoring system before implementation.

### Visual Code Structure editing and semantic Focus Mode

Evolve Visual Code Structure from a primarily read-only navigator into a visual
companion to the native text editor. Both surfaces must operate on the same open
VS Code document and one source-of-truth buffer: visual edits appear immediately
in source, source edits refresh the visual model, and dirty/save/Undo state remains
truthful. Never maintain a separate visual copy of code or require a second Apply
merely to synchronize equivalent source. Structured edits may include controller
fields, function-call arguments, safe local renames, documented comments, logic
structure insertion, maps/functions/recipes and other operations for which exact
parse boundaries and validation are proven. Ambiguous or free-form work opens the
exact source location instead of guessing.

Add **Focus Mode** to reduce visual clutter while working on one move, function,
state, system, bug or recipe. “Remove junk” means filter/collapse unrelated code
from the current presentation—never delete it from the source. The focused view
should show the selected block plus user-selectable relationships such as its
callers/callees, maps/constants, controllers/triggers, commands, states,
animations, assets, contracts, diagnostics and tests. Clearly report how many
items are hidden and provide one-click Show All, breadcrumb/back navigation and
Reveal Full Source so filtering cannot make code appear absent or deleted.

Terminology clarification confirmed by the user on 2026-10-02: the intended
phrase is **hide unrelated code from the current focus**. The earlier wording
“remove junk code” was not a request to delete, rewrite, disable or exclude any
source. Preserve this distinction in UI labels, documentation and implementation
tests.

Allow useful focus scopes such as Current Block, Function, State, Move, System,
Selection and Issue. Relationships must come from the canonical project index and
display confidence/ambiguity; do not hide a dependency merely because it crosses
files or shared/common boundaries. Permit temporary inclusion/exclusion and saved
named focus sets/layouts, but never let a view filter change build inclusion or
runtime behavior. Search operates within focus by default with an obvious option
to search the whole file/character/project.

Launching Visual Code Structure from a character workbench should use the
currently selected code file when unambiguous; otherwise show a searchable list
of that character's ZSS/CNS/Lua files instead of reporting that no source is open.
The panel should also disclose that its model is file-scoped or character/project-
scoped. This expansion remains under the study-driven New Dev review gate and
must be reconciled with Project Knowledge, recipes, symbol navigation, the Master
Authoring Bar and responsive/docking behavior before implementation.

Make Visual Code Structure and Focus Mode directly accessible from every supported
ZSS/CNS/Lua text editor. Provide a clearly labeled editor-title action and a
keyboard-accessible command. The context menu may offer **Open in Visual Code
Structure** and, when the cursor/selection resolves to a supported block or
symbol, **Focus This Function/State/Block/Selection** inside the appropriate
expandable IKEMaker/navigation submenu so it does not worsen right-click clutter.
Consider an optional lightweight CodeLens or gutter action above functions/states,
but keep it disabled or configurable for users who prefer an uncluttered editor.

Opening from source must carry the exact document, cursor/selection and canonical
symbol identity into the visual surface, select/reveal the corresponding block,
and preserve a fast Back/Reveal in Text Editor route. If the selected code cannot
be parsed confidently, open the file-level structure and explain why focused
selection was unavailable rather than guessing. Reuse one existing visual session
where appropriate instead of creating duplicate panels for repeated clicks.

### Browsable triggers, expressions and math-function catalog

The bundled trigger catalog currently supports hover and context-detected code
completion, but documentation and completion alone are insufficient discovery
for authors who do not already know what to type. Add **Triggers & Expressions**
as a first-class layer of the canonical Authoring Catalog and compact State
Controllers/sidebar access—not another disconnected data source. Include IKEMEN-
new and changed triggers/functions such as `Max`, `Min` and `Clamp`, alongside
compatible MUGEN expressions, with a visible origin/status label.

Organize by purpose rather than one enormous alphabetical list: Math and Clamping,
Logic/Selection, Time/State, Movement/Position, Player/Team, Contact/Hit/Guard,
Animation, Input/Commands, Resources, Helpers/Projectiles/Explods, Maps/Variables,
Redirections, Stage/Screen and Debug/Introspection. Support search by name,
signature, intent and example; favorites, recents and project usage; hover-sized
summaries; full explanation; examples; return type; parameter meanings; validity
and safety notes; MUGEN-compatible versus IKEMEN-new/expanded status; and exact
source documentation/provenance.

Do not attach expression discovery only to a controller field named `value`.
Expressions may be valid in conditions, controller parameters, `let` expressions,
map assignments, function arguments and other parsed expression positions. From
the text editor, expose **Browse/Insert Trigger or Expression** at the cursor and
filter to syntactically valid/value-type-compatible candidates where confidence
allows. From a controller option form, reuse the same picker beside every option
that accepts an expression. From Visual Code Structure and recipes, resolve the
same catalog identities. Insertion should supply editable signature placeholders
and parameter rollover/help, never an unexplained literal.

The optional suggestion system may rank context-relevant expressions, but Manual
browse/search must remain complete and independently usable. Explain why a
recommendation appears. When context is ambiguous, show the broader catalog
instead of incorrectly claiming an expression is invalid. New Dev must review
taxonomy, type/context inference, UI placement and completeness before the
implementation slice begins.

### AIR ending semantics and measurable-hold assistance — 2026-10-02

Add explicit AIR authoring support for the distinction between a permanent
negative-time hold and an indefinite-looking finite loop. Identify and label at
least: **Permanent `-1` Hold**, **Finite Final-Frame Loop**, **Finite Multi-Frame
Loop**, **Finite Non-Looping Animation**, and malformed/ambiguous endings. Do not
present one form as universally superior or mechanically rewrite existing AIR.

For the selected action, display/preview relevant timing semantics:

- finite `AnimLength` where meaningful and why it may be unavailable/special;
- current/simulated `AnimLoopCount` progression for finite loops;
- loop point, pre-loop duration, loop duration and boundary ticks;
- how quickly a one-tick final-frame loop accumulates loop counts;
- the distinction between visually holding one sprite and permanently freezing
  animation advancement with `-1`;
- a warning that older element-timing triggers do not necessarily behave as
  though every loop were a fresh first entry.

The AIR timeline and action inspector should make `LoopStart` placement and the
looped range visually obvious. Playback may expose a small optional runtime-style
readout for elapsed tick, element, `AnimLength`, loop duration and simulated loop
count. Clearly label simulated values versus values observed from a live IKEMEN
session, and label Nightly-only triggers/features such as `AnimLoopCount` with
their compatibility provenance.

Offer a reviewed **Convert Permanent Hold to Measurable Hold…** action. The user
chooses the finite duration for the final pose; preview the exact AIR change and
resulting loop range before Apply. Also allow the inverse conversion when the
author explicitly wants a true permanent freeze. Before either conversion, scan
indexed ZSS/CNS for animation-sensitive uses such as `AnimTime`, `AnimLoopCount`,
`AnimElem`, `AnimElemNo`, `AnimElemTime`, state changes and effects/sounds tied to
the relevant action. Present exact references and explain possible behavioral
changes; never claim a text match proves impact, and never auto-update logic.

Add an optional authoring suggestion—not an engine error—for suspicious cases,
such as a one-tick final-frame loop where no rapid loop count appears intentional,
or a permanent hold used by code that expects finite length/loop observation.
Allow project/template rules to prefer measurable finite holds for new animation
work while retaining `-1` as the explicit permanent-freeze choice. Existing
animations remain unchanged until individually reviewed.

This proposal comes from the daily `AnimLength`/`AnimLoopCount` lesson and remains
under the study-driven New Dev review/expansion/sign-off gate. Verify exact stable
and Nightly engine semantics against current authoritative documentation/source
before designing diagnostics, labels or conversion behavior.

### Shared catalog and authoring surfaces

- Build one canonical Authoring Catalog for controllers, ZSS structures, triggers/expressions, redirects, maps, constants, functions, commands, contracts, recipes, recipe sections and template examples. All pages and sidebar entries resolve stable catalog IDs rather than keeping independent copies.
- Keep the State Controllers sidebar as the fastest authoring surface, but never list the entire catalog there. Provide distinct compact groups for Favorites, Recent, cursor-compatible suggestions and project recommendations, followed by controllers/structures and shortcuts to full pages. Explain why recommendations are shown. Do not turn recents into favorites.
- Dedicated pages: Recipe Library; Project Symbols & Contracts (maps, constants, functions, commands/input, state ranges, helpers/projectiles, contracts, uses and validation); Example Templates; shared Authoring Favorites management; global authoring search.
- Favorites synchronize across every surface, preserve source/provenance and compatibility, support manual grouping/order and an explicit preferred action, and retain disabled last-known entries when a pack is unavailable. Identify by namespace/pack/item/kind, never display name or path. Support follow-compatible-updates versus pin-version later.
- Search by name, alias, intent, controller/trigger, symbol, move family, project/template, author, source, tag and compatibility. Full keyboard use, visible focus, screen-reader type/source/compatibility announcements and no reliance on color alone are required.

### Universal recipe architecture

- Recipes are modular compositions above structures/controllers, never one monolithic generator. Sources are always visible: IKEMEN Standard, Project Pack, My Recipes, and later Imported Pack.
- Organize by normals, command normals, specials, EX specials, supers/hypers, throws, movement, defense/counters, projectiles/helpers, character-specific systems and shared utilities. Within families group state flow, input routing, attack definition, movement/physics, reactions/metadata, cancels, effects/sound, cleanup and diagnostics.
- Support Whole Recipe, independently meaningful Recipe Section, Explain, and exact Preview Insertion as separate actions. Explain teaches; preview lists exact code, destinations, dependencies, unresolved placeholders and insert/merge/replace/create operations.
- Universal IKEMEN Standard recipes work with no author profile or project pack. Initial set: basic normal, special, command routing, projectile/helper skeleton, cleanup/reset and common safety guards.
- Project packs extend universal sections rather than replace them. SF6 normals -> command normals -> specials -> EX -> hypers is the first deep project implementation. Project rules are labeled separately from engine syntax/errors.
- Before writes: prove structural insertion boundaries, resolve typed parameters, detect duplicate states/commands/maps/constants/functions, list missing dependencies and every changed file. Multi-file changes require explicit plan/confirmation, transactional application, validation and unified undo. Never silently overwrite, renumber, invent assets, import infrastructure or regenerate edited user code. If safe insertion cannot be proven, offer manual insertion.
- Declarative recipe schema includes stable ID, source, author, pack/schema/version compatibility, family/tags/complexity, file types/targets, parameters, ordered sections, dependencies, consumed/provided symbols, declarations, cleanup obligations, validation/conflict rules and explanation. Recipes reference primitives by stable IDs.

### Always-packaged example/reference packs

- IKEMaker always includes offline reference/example packs for SF6, Darkstalkers (DS), Darkstalkers 4 (DS4) and Hyper Dragon Ball Z (HDBZ). Verify project-preferred names, authorship and redistribution licenses; never expose the user's private/real identity instead of the chosen public identity JustNoPoint.
- Packs contain declarative capability manifests, recipes/sections, symbol/contract definitions, explanations, selected annotated permission-cleared code, compatibility signatures, validation, migrations, upstream revision and freshness. They remain universally browsable for learning and only activate project behavior after capability-based recognition or explicit activation.
- Do not infer compatibility from a folder/project name or one filename. Prefer explicit manifest/capability version, compatible contract signatures, supporting structure and user confirmation. States: compatible active; compatible available; partial/review; mismatch; reference-only; not applicable.
- Example Templates page compares input architecture, state conventions, hit metadata, cancel/reaction systems, helpers/projectiles, maps/constants/functions, cleanup and character subsystems, always separating engine capability from template choice.
- Default VSIX reference packs should not casually duplicate full characters, art, audio, engines or histories. Full source-only templates or separately downloadable examples require explicit licensing, package-size and synchronization ownership decisions. Show pack version, verified upstream revision/date and stale/unknown compatibility.

### Extensible packages and post–Phase 1 community

- Platform rule: anything users can define, extend or reuse should eventually support portable IKEMaker Extension Packages and optional website publishing. Candidates include recipes/snippets, symbols/contracts, reference packs, palettes/transform rules, naming profiles, authoring rules, layouts, learning guides, build profiles and authoring templates.
- Common package metadata: stable ID/version, public creator identity, description, separate code/docs/assets licenses, compatibility, dependencies/conflicts, permissions/capabilities, contents, examples/media, migration/update data, hashes/signatures and trust type. Declarative, asset-bearing and executable packages have progressively stronger review/isolation; opening/downloading never executes content.
- After Phase 1, add an in-app Community Library backed by the same website/catalog identity: Browse, Compatible, Installed, Updates, Favorites and My Uploads; preview contents/license/trust/compatibility/dependencies; install globally or per project where supported; validate, disable/remove/pin/update and rollback transactionally. Downloaded packages work offline. Browser use is optional.
- Community profiles use chosen public names and show published-item count, categories, account age, installs/followers, ratings and maintenance/compatibility history. Search by author and follow authors for releases/updates.
- Ratings/reviews/comments are submitted through IKEMaker only. Ratings require verified installation/use, are version-bound, one current rating per user/package, and may distinguish quality/accuracy/ease. Authors may reply but not erase criticism. Preserve moderation history; support helpful votes, reports, mute/block and conflict disclosure.
- Anti-spam baseline: verified accounts, rate/account-age/progressive limits, keyword/phrase and duplicate/near-duplicate filtering, no links in community text, detection of obfuscated/encoded/spaced/Unicode-lookalike links and QR/redirect content, reserved-name/impersonation protection, length limits, suspicious-submission holds, upload/archive scanning and moderation/appeal. No private messaging initially. Reputation supplements schema validation, signatures, malware scanning, publisher verification and manual review for executable packages; it never replaces technical safety.
- Community ranking must resist coordinated ratings/reports and must not use install count alone. Show schema/scan/license/publisher/tested-version/report status as separate signals. Telemetry is opt-in; recents remain local and may be disabled.

### Phasing

1. Phase 1A: canonical catalog IDs/provenance, global search foundation, synchronized favorites/recents, compact sidebar shortcuts and universal items.
2. Phase 1B: Recipe Library and Project Symbols & Contracts pages, explain/preview, keyboard flow and initial safe single-file insertion.
3. Phase 1C: bundled SF6/DS/DS4/HDBZ reference packs in learning mode with verified attribution/licensing/freshness.
4. Phase 1D: capability activation, project recommendations/contracts, SF6 move-family progression, version locking and safe transactional cross-file plans.
5. Later: dependency/subsystem import, personal recipes, imported/local packages.
6. Post–Phase 1: website publishing and in-app Community Library, author following, ratings/reviews/comments and moderation safeguards.

### Consolidation correction — one connected Project Knowledge workspace (2026-10-01)

User direction: do not keep adding separate Maps, Functions, Contracts, Recipes, QA, Bugs and Release windows. Extend and consolidate the existing Project Maps experience into one connected **Project Knowledge** workspace. Add layers, tabs and relationships to the existing surface; create a separate window only when the work truly requires an independent working context.

Proposed layers within one reused panel:

- **Symbols:** Maps, Functions, Constants, Commands, States, Helpers / Entities.
- **Contracts:** meanings, ownership, lifecycle, capabilities, author/game/universal classification and validation.
- **Recipes:** universal, project, personal and later imported recipes and sections.
- **QA:** Requirements, Tests, Test Sessions, Bugs, Fixes, Retests and Verification.
- **Release:** gates, blockers, approvals, known issues and affected releases.
- **Examples:** SF6, DS, DS4 and HDBZ reference/template comparisons.

The same selected identity must remain in context while changing layers. For a selected map, function, state, recipe or other item, expose connected views such as:

- Overview.
- Definition and exact source.
- Readers, writers, callers and other uses.
- Contract and allowed values/parameters.
- Ownership and lifecycle.
- Related maps, functions, constants, commands, states, entities and assets.
- Recipes that consume or provide it.
- Requirements and tests covering it.
- Open/resolved bugs, fix candidates and verification.
- Change history and affected releases.

Examples:

- Selecting `JNP_SF6_cancel_contact_type` keeps that map selected while moving among Uses, Contract, Recipes, Tests, Bugs and History.
- Selecting `JNP_SF6_StandingLightPunch` exposes parameters, callers, maps, constants, animation, sounds, ownership, recipe, tests and bugs in the same workspace.

Navigation and reuse rules:

- The State Controllers sidebar remains the fast access surface. Favorites, recents, cursor suggestions and project recommendations open the exact catalog identity and relevant layer in Project Knowledge.
- Existing commands such as Recipe Library, Project Symbols & Contracts, Example Templates and future QA & Issues become routes into the appropriate Project Knowledge layer, not independent management panels.
- Global search operates across every layer and preserves source/provenance/compatibility badges.
- Moving between Maps, Functions, Contracts, Recipes, QA and Release reuses the same webview panel instead of spawning tabs.
- Deep links retain item identity, active layer, filters and return context.
- Shared catalog IDs remain canonical; layers are views over the same graph, never separate data stores.
- Current 0.79.22–0.79.24 authoring pages are foundation work that must converge into this workspace before broad expansion.

Governing UI rule: **when information shares identity and context, add a connected layer; add a new window only when the task genuinely requires a separate working surface.**

### New highest Phase 1 priority — cohesive dockable UI and Master Authoring Bar (2026-10-01)

User decision: pause broad feature-surface expansion and make the shared UI/accessibility foundation the new priority. The goal is for every IKEMaker viewer and coding screen to feel cohesive and interchangeable rather than like a collection of unrelated tools.

Create one persistent **Master Authoring Bar** available across IKEMaker-supported coding and visual contexts, including at minimum:

- ZSS/CNS and other coding views.
- DEF.
- CMD/input.
- SFF/sprites.
- AIR/animations.
- SND/sounds.
- Stage and screenpack/fight UI.
- Move/character authoring.
- Project Knowledge, QA/testing, build and release.

The Master Authoring Bar provides access to every applicable IKEMaker section and command without placing every command directly on screen. It is the consistent global route among code, definitions, commands, sprites, animations, sounds, project knowledge, QA and related work. Actions remain context-validated at execution; seeing or favoriting an action never grants permission or bypasses compatibility checks.

Visual model: use Photoshop as the primary interaction influence, with an Excel-like contextual ribbon/tab approach only where the number of organized command families requires it. Preferred hybrid:

- Persistent global identity/navigation row: project, character/asset, Back, Forward, Source/Related Work, layout and help.
- Master section tabs or compact categories: Code, DEF, Commands, SFF, AIR, SND, Project, QA, Build/Release and context-appropriate additional families.
- Stable contextual row of up to five recommended task actions for the active screen.
- Favorited viewer actions appended after primary actions, with visible More Favorites overflow.
- Searchable **Actions** menu containing every available command grouped consistently by Edit, Selection, View, Assets, Validation, Build, Import/Export, Advanced and Help, plus recent commands, favorite status, shortcuts and disabled reasons.
- Photoshop-style tool rail for interaction tools/subtool families; right-click and click-and-hold are accelerators, while a visible dropdown marker and full keyboard path remain required.
- Contextual Inspector on the right; working surface in the center; timeline/Problems/QA/output and other supporting dock panels below or in user-selected dock/tab groups.

The Master Authoring Bar must not become another crowded toolbar. Rules:

- All feature commands are discoverable through section tabs/categories, Actions search and appropriate contextual menus, but irrelevant actions are not displayed as a permanent disabled wall.
- Primary action identity/order remains stable during normal selection changes. Context changes availability and explanations without volatile reshuffling.
- Navigation controls do not count against the five recommended task actions.
- A justified temporary sixth action may appear for an essential transient state such as Stop Test or Resolve Conflict.
- Users can favorite any compatible Actions-menu command onto a viewer action bar, reorder it by pointer or keyboard, select viewer/layout/all-compatible/project scope and reset recommended actions separately from layouts.
- Action Favorites and Authoring Favorites remain distinct while sharing one management surface.
- Stable namespaced IDs, compatibility, permissions, mutation scope, undo support and migration aliases are mandatory for actions.

Implementation checkpoint — 2026-10-04:

- The shared SFF/AIR/SND toolbar now exceeds fixed Fighter Factory-style menus
  without removing legacy buttons. Its categorized Actions search exposes the
  wider IKEMaker toolset, natural-language intent aliases, available-only and
  favorites-only filters, explicit unavailable reasons, recent actions and a
  repeat command limited to safe navigation/view/playback actions.
- Favorites synchronize between the main and floating copies of the same viewer,
  can be reordered, promote up to five shortcuts onto the visible bar, retain an
  overflow route, and visibly report persistence failures. Broader selectable
  favorite scopes (layout/all-compatible/project) remain future work.
- The shared toolbar now has a dedicated Build category for reviewed release and
  SFF index/manifest/profile workflows. Actions search can filter by category,
  announces result counts, supports Up/Down/Home/End/Enter navigation, and shows
  an action detail pane with its route, current availability and Safe Repeat
  eligibility before execution.
- Action details now use the actual viewer owner's tooltip when available and
  disclose route, current scope, file-authority boundary and recovery contract.
  Merely opening details remains zero-write; owner-specific dry-run providers and
  persistent post-action receipts are still future work.
- Known native workbench shortcuts now appear beside dropdown actions, remain
  searchable through their truthful tooltip, and appear in Action details. No
  shortcut is invented for viewer-owned mutation controls.
- Actions intent search now recognizes the new command/movelist draft tasks and
  common palette cleanup/build phrasing, routing them to the canonical workspace
  rather than adding duplicate one-off buttons.
- Existing viewer owners now expose substantially more of their functional
  controls through those menus without cloning handlers or removing the old
  buttons: SFF selection/alignment/resize/rotation/channel/layer/image options;
  AIR marking, frame ordering/apply/revert, contact-box editing, GIF intake and
  preview export; and SND marking, reference/contract/profile/manifest review,
  reviewed builds and FX generation.
- The SFF Palette dropdown now exposes the full existing Palette Workshop owner
  paths for color drafts, preview/apply, ACT import/compare/replace/export,
  reversed tables, setup audit, protected masters, library folders/files,
  append/insert, child variants, linked aliases, transform slots and staged-plan
  review. These are proxies to the canonical controls, not duplicate handlers;
  legacy buttons remain for comparison sign-off.
- A compact live context strip mirrors each viewer owner's current SFF sprite,
  AIR action/frame, or SND sound identity/status. It is presentation-only,
  synchronized from the existing selection owner, accessible as status text and
  safely elided at narrow widths. It now prefixes the asset family, mirrors the
  existing marked-count state, surfaces the first concise owner-reported warning,
  and exposes the authoritative mutation owner in its accessible title. SFF also
  publishes the selected sprite's exact neighboring AIR-reference count from its
  existing owner model. Broader resolved/unresolved reference counts remain in
  the prioritized queue below.
- Command & Movelist now includes convention-preserving absolute/relative input
  insertion, literal custom native-parser step insertion (for forms such as
  `~30$B+x`) before or after the selected step, scoped draft Undo/Redo and
  focused keyboard duplicate/remove/reorder routes, loaded-source plus live
  draft overlap review, exact changed-field review, nested visual glyph/line editing, exact
  selected-line source editing, and a byte-sensitive displayed-movelist draft
  summary. New commands and both preset-application paths inherit the target's
  nearest LF/CRLF/classic-CR convention, saved preset source is not trimmed, and
  custom-preset save/delete updates the live host registry immediately. None of
  these reviews rewrites source until explicit Apply.
- Command drafts can now be duplicated into a separate pending definition (so
  deliberate same-name alternates are retained) or reverted locally without a
  source write. Secondary `movelist1+` DAT ownership, exact-slot switching,
  serialized restoration and history reopening all retain the assigned file;
  dirty drafts refuse an implicit rebind. LF, CRLF and classic-CR movelist paths
  are covered end-to-end, and glyph recognition protects semicolons, `>` and
  glyph-looking text inside quoted/custom markup.
- Command discovery now adds diagnostics-only and same-name-family views plus a
  live shown/total count. Assigned movelist slots can switch the same visual
  editor in place through the dirty-draft handshake while retaining the separate
  exact-source route. Command rows have listbox keyboard navigation, and a
  draft-local movelist finder navigates text or glyph matches in Source or Visual
  mode without modifying the DAT.
- Command definitions can now be starred by exact name/sequence identity. An
  explicit Favorites-only view and the organized view's first group keep common
  commands reachable without reordering, duplicating, or rewriting source.
- Command timeline tokenization now recognizes only top-level comma, `+`, and
  `|` boundaries. Quoted or nested custom-parser arguments remain one literal
  step in the model, live timeline, input-basis label, diagnostics and draft
  overlap review. Single-quoted semicolons are retained before genuine trailing
  comments, and narrow edits continue to preserve surrounding source bytes.
- Timeline cards now support selection-only Left/Right/Home/End navigation and
  bounded five-step Page Up/Down jumps;
  deliberate Alt+Left/Right reorder, Ctrl/Cmd+D duplicate and Delete removal
  remain separate draft edits with their existing Undo/Redo contract.
- Selected command steps can move directly to the start or end through visible
  actions or Alt+Home/End. The operation rotates only parsed top-level step
  cores across existing positional separators and is one timeline Undo.
- A live timeline selection summary now announces selected/total steps, the
  parser-aware absolute/relative/button/custom basis and internal clipboard
  readiness without modifying source.
- Existing timing references now expose **Use Step Time** as a narrow draft-only
  action. It changes only `steptime`, leaves the command sequence untouched and
  is one timeline Undo entry before reviewed Apply.
- The selected command step now has a workspace-local exact clipboard plus
  explicit **Use Relative** and **Use Absolute** conversion. Only recognized
  native direction atoms are converted; modifiers, button relations, whitespace
  and custom-parser expressions remain untouched. Copy, paste and conversion all
  share the existing draft-only Undo/Redo and reviewed Apply path.
- A separate workspace-local whole-sequence clipboard copies and restores the
  exact authored command, including custom parser expressions and surrounding
  whitespace. Restore is one timeline Undo action; clear changes only clipboard
  state, and no path uses the operating-system clipboard or applies source.
- Reusable motion-path insertion now covers relative and absolute quarter-circle,
  double-quarter-circle, dragon-punch, half-circle, charge, full-circle and dash
  families, with facing-independent down/up charge kept in a separate group. A
  whole path inserts before or after the selected step as one Undo action, making
  common authoring faster than
  repetitive Fighter Factory-style atom entry without selecting an input policy
  or silently changing an existing command.
- **Replace with Choice** explicitly changes only the selected step to the chosen
  native input. **Motion Replace** expands a complete chosen recipe at that exact
  position. Both are single timeline Undo actions and remain unapplied drafts.
- The expanded motion library now has zero-write search, persistent Favorites,
  Favorites Only, and bounded Recents. Favorite/recent identity state is pruned
  against the current recipe catalog and clears independently from command
  drafts, preserving the user's explicit relative/absolute choice.
- Native input discovery now mirrors that scalable picker: zero-write search,
  persistent Favorites, Favorites Only and bounded successful-use Recents span
  absolute, relative, hold/neutral and button groups. Selection alone never
  alters recency, source, or the user's notation policy.
- **Combine +** and **Alternative |** can add the chosen native input to a
  selected native step as one Undo action. The controls refuse custom-parser
  expressions and refuse to mix `+` with `|`, preserving the editor's
  convention-first safety while removing repetitive syntax entry.
- Explicit **Mirror Step** and **Mirror Command** actions swap recognized native
  L/R, B/F and diagonal direction pairs. The command-wide route is one Undo
  action, preserves modifiers/relations/separators, and skips custom-parser
  steps rather than mining direction-looking text from their arguments.
- Nested displayed-movelist exact-line typing now updates the retained shared
  Source/Visual draft on every keystroke instead of waiting for field blur.
  Preview refresh and visual Undo remain grouped at the completed line edit, so
  a focused custom-tag edit can survive close/reopen without creating one Undo
  entry per character.
- Visual glyph recognition now follows every token explicitly configured by the
  resolved motif, including author-defined prefixes, while retaining strict
  token boundaries. Standalone quoted custom text is protected like tagged
  markup, so glyph-looking strings and semicolons inside it remain literal and
  later real glyphs are still editable.
- A selected displayed-movelist glyph can now be duplicated with the visible
  control or Ctrl/Cmd+D. Duplication copies the exact configured token, selects
  the new occurrence, and participates in visual draft Undo without touching
  surrounding text, tags, separators, or line endings.
- Nested visual movelist rows now mirror timeline keyboard semantics: plain
  arrows plus Home/End move glyph or line selection without editing, ten-line
  Page Up/Down jumps accelerate long lists, while Alt+arrows remain explicit
  reorder actions. Selection navigation persists but
  creates no Undo entry and changes no draft bytes.
- Selected movelist lines can move directly to the start or end through visible
  controls or Alt+Home/End. Mixed LF/CRLF/classic-CR positions remain intact and
  the move is one visual Undo action.
- Selected movelist glyphs now have matching move-to-start/end controls and
  Alt+Home/End routes. Only recognized glyph contents rotate across the existing
  text/tag/separator positions, and the action remains one visual Undo.
- Displayed-movelist lines now have a workspace-local exact clipboard with
  paste-before and paste-after controls. Custom tags, unknown tokens and empty
  lines remain literal; newly inserted boundaries follow the selected location's
  LF/CRLF/classic-CR convention, and each paste is one visual Undo action.
- The visual glyph picker now has a zero-write filter across configured token,
  friendly label and sprite identity, with a shown/total count and explicit
  clear action. A bounded recent group promotes only successfully used configured
  tokens. Filtering or recent ordering never hides or changes draft lines.
- Configured glyphs can now be deliberately pinned in a persistent Favorites
  group or viewed through Favorites Only. Favorites and recents clear
  independently; stale unavailable favorite identities are pruned during
  rendering, and none of these presentation choices change the DAT draft.
- A live visual-selection summary announces line/total, glyph/total, and the
  exact configured token. Keyboard and pointer navigation update it without
  adding Undo entries or changing draft bytes.
- A workspace-local exact glyph clipboard can copy one configured token and
  paste it before or after the selected glyph on the same or another line.
  Cross-line paste keeps every surrounding tag, separator and line ending and
  participates in visual Undo.
- Step and visual line/glyph clipboards have explicit zero-write clear actions;
  clearing clipboard state never changes or applies the current draft.
- Command discovery now keeps a bounded, clearable exact-identity recent list in
  addition to favorites. Organized and explicit recent views are presentation
  only. Search also covers diagnostic explanations, `/` focuses it, Escape
  clears it, and command rows support bounded ten-entry Page Up/Down navigation.
- Displayed-movelist find now navigates both directions with wrapping
  Next/Previous controls, Enter/Shift+Enter, and zero-write Escape/Clear Find.
  Query navigation remains available in Source and Visual modes and never
  filters, normalizes, or edits the DAT draft.
- Advisory glyph-warning navigation now wraps in both directions through
  Previous/Next controls. Warning focus remains zero-write and preserves every
  later line even when IKEMEN itself may stop at the first unresolved glyph.
- The authorized unused-`let` ZSS diagnostic now offers a reviewed file-level
  safe cleanup. It previews exact replacements, preserves direct calls, excludes
  uncertain/effectful expressions, revalidates source identity and participates
  in normal editor Undo. Other study-driven ZSS assistance remains behind the
  New Dev review gate below.

Prioritized additive toolbar/QoL queue from the New Dev review (beyond Fighter
Factory parity; retain legacy buttons until comparison sign-off):

1. Add one global **Pending Changes** tray for unapplied drafts, staged manifests,
   dirty source documents and conflicts. Each entry identifies the canonical
   Apply/Undo owner and focuses that owner; switching viewers never discards a
   draft or creates a second mutation path.
2. Build and verify the shared in-house SFF Creator and safe SprMake2 adapter,
   then add the IKEMaker built-in serializer without creating a second UI. Reuse
   the reviewed **Build Plan -> Build Execution ->
   Verified Candidate Artifact -> Adoption Transaction** architecture, canonical
   mutation owner, source-revision checks, independent validation, atomic
   adoption/recovery and receipts. Cover the already reviewed Add Sprites,
   palette and archive-assembly requirements without silently replacing the
   active archive. Keep SprMake2 and all legacy buttons available through parity
   testing and explicit comparison sign-off. Until this writer passes its gates,
   SFF batch scopes may be inspected or previewed but must not imply that Apply
   is available until a selected backend can produce an independently verified
   candidate through the adoption owner.
3. Add one reviewed batch-scope picker shared by SFF/AIR/SND: Current, Marked,
   Visible/Filtered, Group, Numeric Range, Work Set and All. Resolve stable IDs,
   source fingerprint and exact count before execution instead of inferring scope
   from whichever pane happens to have focus. AIR/SND may expose supported
   writer-backed scopes independently; SFF Apply is gated by item 2 but may use
   either the verified SprMake2 adapter or the built-in backend.

   SFF implementation checkpoint (2026-10-04): the shared resolver now drives
   direct axis offsets, PNG export, image metadata, resize/crop/rotate exports,
   aligned-canvas export, RGBA channel splitting, palette assignment, cross-SFF
   manifest import and reusable sprite-project export. Every
   consumer resolves Current, Marked, Visible/Filtered, Group, Numeric Range,
   Work Set or All against an exact archive fingerprint; output-producing paths
   reread the archive before starting, while direct mutations also recheck at
   confirmation and retain the scope mode/resolution hash in their recovery
   record or exported manifest. Cross-SFF import rechecks its source before any
   extraction, refuses image collisions and commits extracted PNGs plus the
   destination manifest atomically. Project export refuses every collision and
   atomically writes only the reviewed scope. Crop-and-rebuild already uses the
   same contract. AIR/SND adoption and
   richer selection-by predicates remain separate work; do not reintroduce a
   viewer-specific Current/Marked/Group picker.
4. Finish the synchronized selection/context strip as a compact dependency
   breadcrumb: broader resolved/unresolved Used By counts, previous/next
   reference routes, concise warning badge and mutation owner across main and
   floating copies. Asset identity, marked count, owner-reported warnings and
   SFF's exact adjacent AIR-reference count are already present.
5. Add named project-scoped work sets for marked sprites, actions and sounds,
   using stable identities and archive fingerprints with missing-item reports.
6. Add a zero-write Preview only where a real owner dry-run provider exists, then
   persistent post-action receipts linked to Changes and History. Preflight and
   receipt metadata identifies owner, exact scope, source fingerprint, changed
   files/manifests, unchanged boundaries, availability reason and recovery route.
   Action details already expose owner tooltip/purpose, scope, file-authority and
   recovery.
7. Add selection-by dialogs and reviewed batch preflights: SFF reference/palette/
   dimensions/duplicate-pixel selection and sprite intake; AIR standards/sprite/
   collision selection and frame-property batches; SND reference/format/duration/
   duplicate-audio selection and multi-WAV staging.

   SFF implementation checkpoint (2026-10-04): **Select by evidence…** now
   proposes same-palette, same-dimensions, same-format, nearby-AIR-referenced,
   nearby-AIR-unreferenced, current-image duplicate and all duplicate-image
   selections. Exact duplicate evidence hashes decoded RGBA plus dimensions and
   normalizes invisible RGB only; it does not confuse encoded PNG equality with
   rendered-pixel equality. Every proposal opens as a checked review list before
   replacing marks, and exact archive fingerprints are rechecked both after
   analysis and after review. “Unreferenced” is explicitly a nearby-AIR review
   candidate, never a deletion/unused claim. AIR and SND selection-by expansion
   remain separate work.
8. Layer optional project/character toolbar profiles over global preferences,
   plus user-named action collections that organize commands without silently
   executing macro chains. Include import/export/reset and schema migration.
9. Extend the existing Actions search with user-defined aliases, shortcut
   assignment plus collision detection, scope/profile badges and direct
   **Why unavailable?** fix routes. Do not create another launcher.
10. Complete keyboard/type-ahead/focus-return, screen-reader, high-contrast,
   reduced-motion, 200% zoom and 320–400 px floating-window verification.

New Dev refinement for going beyond Fighter Factory rather than reproducing its
destructive editing model:

- SND quick wins use canonical owners: surface archive assignment, native
  `PlaySnd` and configured bridge snippets, the character-DEF FX line and the
  unrestricted SndMaker-text route in the shared toolbar; keep group/index jump,
  archive-order/category/name sorting and FreqMul audition local to the viewer.
- Implemented SND inspection now also provides waveform/slider seek, exact time,
  Space/K and J/K/L-style transport, fine seek, Home/End, A/B audition ranges
  with optional looping, range export, mark/invert/copy-ID batch helpers, plus
  bounded persistent read-only QA filters for clipping,
  silence, DC offset, PCM format, duplicate identity and duration review. Filtered
  results feed the existing Mark Visible batch owner; no audio or archive writes
  were added.
- Make safety legible in Actions details with concise **Changes** and **Does not
  change** summaries sourced from owner metadata. Finish roving keyboard focus,
  type-ahead, focus return and selected/marked/result-count announcements before
  adding more permanent chrome.
- Extend the implemented playback-only waveform navigation with
  a zoomable overview/minimap, zoom-to-selection, zero-crossing snap and
  sample/millisecond/IKEMEN-tick rulers. Scrub/seek, exact time, Space and
  J/K/L transport, fine seek, A/B range/loop/export are already present and
  write no source archive data.
- Add a code-aware reference inspector for exact `PlaySnd`/CommonFX call sites,
  unused or unresolved sounds, duplicate events and likely channel collisions.
  Begin read-only and route every finding to exact source.
- Add read-only sound QA for clipping, leading/trailing silence, DC offset,
  loudness/true-peak bands, format outliers, exact-byte/decoded duplicates,
  duration outliers and code reference counts. Findings filter/mark/open source;
  they do not auto-fix or auto-normalize.
- Add level-matched two-sound comparison with synchronized playheads and waveform
  overlay. Keep spectrogram/transient inspection optional and lazy-loaded.
- Derived trim/fade/silence/resample/normalize recipes must preview and write a
  new WAV, then optionally stage an explicit manifest replacement. Never mutate
  the loaded archive or disguise an external-editor operation as native.
- New Animation now uses the existing canonical AIR owner through one reviewed
  form: optional source comment, next-free/conflict-aware number, current-frame
  starter sprite/offset/timing/flags, explicit LoopStart, confirmation, exact
  source revalidation, convention/EOL preservation and normal Undo are in place.
  Reserved-range explanations, templates and multi-frame batch creation remain;
  only combined sprite-plus-animation intake is blocked until the shared SFF
  Creator/specification and one verified backend adapter support the transaction.
- Shared SFF Creator work extends the reviewed Add Sprites recipe with a filename
  rule sandbox, virtualized contact-sheet overrides, neighboring/AIR-informed
  alignment suggestions, palette-conversion loss heatmaps, reserved/collision
  range planning, strong decoded-pixel/palette duplicate-link analysis, source
  provenance/drift review and candidate-versus-active branch comparison.
  Suggestions remain preview-only until explicitly accepted; Apply uses verified
  temporary output, atomic adoption, history and whole-batch undo.
- Extend the reviewed New Animation owner with source-preview templates, reserved
  range/category explanations, and a multi-frame storyboard that can reorder
  staged sprite identities and edit per-frame time/offset/flip. Show total ticks,
  loop behavior, missing sprites, hold/zero-time-loop warnings and the final AIR
  diff before one Undo transaction. Paired variants remain explicit reviewed
  plans, never inferred numbering or mirroring policy.
- ZSS should exceed Fighter Factory through asset-aware completion for real AIR,
  SFF, SND/CommonFX, maps, commands, StateDefs and functions; end-to-end and
  reverse dependency tracing; ranked **Find a working example** adaptation;
  advisory ID allocation/reservations; capability-catalog controller forms that
  round-trip unknown/custom fields byte-safely; focused trigger/lifecycle/channel
  diagnostics; and stale-source-safe refactor previews. Extend existing Recipes,
  Favorites and Examples rather than opening another snippet system.

Color and identity system:

- Preserve the established section identities (for example SFF/sprites green, AIR/animation blue, SND/sound yellow/gold, and the agreed colors for other areas).
- Extend each section's subtle dark hue beyond buttons to the Master Authoring Bar's active section indicator, dock title/border accents, tabs, selection markers and appropriate surrounding workspace chrome.
- Use low-intensity dark tints so long sessions avoid grey monotony without competing with canvas/artwork/source content.
- Color supplements explicit text, icons and accessible names; it is never the only identity/status signal.
- A dock panel linked to AIR, SFF, SND, Code, QA or another section retains that identity when moved or tabbed, making mixed layouts readable.
- Mixed/context-agnostic panels use neutral chrome plus explicit source badges rather than misleading ownership color.
- Support high contrast and user-adjustable/reduced tint strength.

Cohesion requirements:

- Shared shell, action registry, selection service, status/draft model, navigation history, layout schema and accessibility behavior across every migrated viewer.
- Consistent Save/Apply/draft/conflict language and state display.
- Consistent left-tool/right-inspector responsibilities.
- Consistent keyboard navigation, focus restoration, tool families, overflow, empty/error states, resize handles, tab groups and panel commands.
- Native VS Code source editors remain first-class and interoperate with the shell; do not build a misleading incomplete editor replacement.
- Existing viewer-specific capabilities remain available through contextual sections/Actions during migration. Do not achieve visual simplicity by removing or hiding functionality without a discoverable route.

Prototype remains bounded to Project Knowledge, State Controllers/Favorites, Source Preview and Problems/QA, now including the first Master Authoring Bar implementation and color-linked dock identity. It must prove docking/tabbing/splitting/resizing/collapse/reopen, layouts, favorites/overflow, Actions search, keyboard and screen-reader flows, responsive modes, native-source navigation, draft recovery and whole-workspace VS Code floating-window behavior before AIR/SFF/SND or other viewers migrate.

0.79.25–0.79.28 physical docking finding: VS Code native Views correctly
provide Sidebar/Panel placement, grouping and restoration, while editor webviews
provide editor groups and floating windows. They are separate docking domains.
Moving content across those domains may expose VS Code's Hold Shift behavior,
which an extension cannot remove or redefine. JustNoPoint accepts that native
convention because it enables sufficiently Photoshop-like docking without a
second fragile layout engine. Use VS Code native Views, View groups, editor
groups and floating editor windows as the Phase 1 foundation. IKEMaker should
explain Shift contextually, preserve keyboard Move View alternatives and never
open an editor tab implicitly from the normal docked route. Build a custom
internal docking canvas only if later capability testing proves a required
workflow impossible through the native surfaces.

After prototype acceptance, migrate one representative visual editor through the complete shell and tool-rail contract before broader migration. Keep legacy viewers available until each replacement meets capability parity, state migration, accessibility, recovery and performance requirements.

#### Unresolved native docking-panel reveal blocker — 0.79.29–0.79.31 (2026-10-02)

Physical testing remains failed. **Open Docking Panel Prototype** first reopened Explorer/another restored VS Code area when routed through generic Panel focus plus View focus. The 0.79.31 attempt to open `workbench.view.extension.ikemen.dockingPrototype` directly fails visibly because that command is not registered by the tester's VS Code build. The contributed `viewsContainers.panel` declaration and four registered webview providers pass isolated tests, but those tests do not prove that the installed desktop shell exposes or reveals the container.

Do not claim the docking-panel prototype works and do not continue guessing undocumented workbench command IDs. Resume only when New Dev review/usage is available. Required next investigation:

- Reproduce physically against the installed VS Code build, with Developer Tools/command enumeration where available.
- Verify whether a contributed Panel container can be revealed through a supported public API/command in the minimum supported VS Code version.
- Check whether interface-mode `when` clauses, container registration timing, restored View locations, or the startup sidebar-restoration timer interfere with reveal.
- If native reveal cannot be made deterministic, present the actual user steps for opening/moving the contributed Views or replace this experiment with a supported route; keep the floating editor probe explicitly separate.
- Add an integration/manual acceptance check that observes the visible container title and all four Views. Mocked `executeCommand` success is insufficient evidence.

#### Narrow and detached-window reachability — required acceptance rule (2026-10-02)

A detached editor tab exposed a concrete failure in the legacy SND workspace: reducing the window width could leave primary navigation and whole work panes effectively offscreen. Every migrated and legacy viewer must remain fully operable when detached or narrowed. Horizontal clipping or scrolling may not be the only route to essential sections.

- At compact widths, retain a fixed, labeled route to every major workspace section and every shared destination.
- Reflow multi-column workspaces into a usable single-column or explicit section-switching presentation before their minimum columns overflow.
- Keep the active work surface, selection controls, Save/Apply state and section chooser discoverable without restoring the window to full size.
- Hide or move lower-priority customization controls before sacrificing primary navigation.
- Test width reduction after scrolling, restoring saved state, detaching the editor, and reopening the viewer; no pane may become unreachable because an old horizontal or vertical scroll position was retained.
- Treat this as a shared shell acceptance requirement for AIR, SFF, SND, code, organizers, labs and future portable panels, while correcting confirmed legacy failures incrementally rather than claiming an untested all-viewer sweep.

#### Complete screen coverage and portable dock panels — required expansion

No existing IKEMaker screen, lab, editor, viewer, organizer, assistant or workflow may remain outside the shared navigation/action/layout system. Before migration, create a complete inventory and assign every current command/surface:

- Canonical workspace or section identity.
- Master Authoring Bar route and Actions-menu category.
- Applicable projects/assets/file types.
- Recommended primary actions.
- Tool families and Inspector providers.
- Dockable panels it supplies or consumes.
- Color identity and neutral/mixed-context behavior.
- Native VS Code editor/View interoperability.
- Favorites, search terms and Related Work routes.
- Dirty/draft/close/recovery behavior.
- Migration status, capability parity and legacy retirement criteria.

Special authoring environments such as Move Lab, HitDef Editor, Throw Creator, Helper Lab, Spatial Composer, Explod/position/camera tools, Palette Workshop, Palette Organizer/import, Artist Intake, SFF Assembly, command/movelist, stage, screenpack, story, testing, release and other existing workspaces remain directly accessible through the Master Authoring Bar, Actions search, appropriate project/asset context and Related Work. They are not hidden merely because they are more specialized than Code/SFF/AIR/SND.

Classify each existing surface as one of:

- **Workspace:** a task environment composed from multiple panels, such as Move Lab or Project Knowledge.
- **Portable panel:** a focused capability that can dock, tab, resize or appear inside more than one workspace.
- **Native editor/View integration:** ordinary source editing or lightweight quick access that remains governed by VS Code.
- **Dialog:** only brief choices, confirmations, naming, file picking or other genuinely modal decisions. A full editor/workflow must not remain trapped in a dialog.

Portable-panel contract:

- One canonical feature/model and command identity, never separate embedded and standalone implementations.
- May appear embedded in its natural parent workspace, be moved into another dock group, become a tab, or open as a separate internal dock panel.
- Opening the same context focuses/reparents the existing panel or creates another explicitly requested view; it does not silently create conflicting state.
- Selection, drafts, undo/redo, save status, source fingerprint, history and active asset remain intact when moved.
- Panel declares supported hosts, minimum size, preferred dock, responsive modes, color identity, actions, tools, Inspector contributions, dependencies and mutation authority.
- Closing a view does not discard the underlying draft without the shared close/recovery protocol.
- Layout persistence stores panel identity/context safely without storing private project data in global layouts.
- Keyboard/menu alternatives exist for detach-to-dock, tab, split, move and restore.

Palette Workshop is the first explicit example: it remains naturally available inside the SFF workspace but can be moved/opened as its own green-identified dockable panel beside the sprite viewer, AIR viewer, source or another compatible panel. Both presentations use the same palette model, staged plan, source identity, ACT-order preference, draft, review/build state and mutation owner. There must never be an “embedded Palette Workshop” and a different “standalone Palette Workshop” that can disagree.

The same model should be considered for reusable components such as timeline, collision editor, group/index browser, Inspector, source preview, Problems/QA, maps/functions/contracts, sound list/profile, animation list, palette grid, build review, runtime/test controls and other features proven useful in multiple workspaces.

#### Build-backend workspace and dual SFF/SND creation paths

The UI foundation must account for more than one archive builder without
duplicating the SFF or SND editor. **Build/Release** owns a portable Build Plan /
Build Review panel that can also appear naturally inside SFF Assembly, Palette
Workshop, SND, Project Build and release workspaces. It consumes the same
backend-neutral ArchiveBuildSpecification, reviewed manifest, staged edits, validation model
and mutation authority regardless of where the panel is shown.

Treat five roles as separate even when they share one workspace: the **SFF
Creator** owns the reviewed plan/UI; a **backend** builds one candidate; an
independent **validator** parses and verifies it; an **orchestrator** runs one or
more named pipelines; and the **adoption owner** is the only role allowed to
replace the active archive. The Creator ships first through the SprMake2 adapter,
so its QoL does not wait for or fork when the built-in serializer arrives.

For SFF, expose explicit choices for **SprMake2 (trusted Windows backend)**,
**IKEMaker built-in (cross-platform)** and **Compare Both**. Apply the equivalent
model to SND with SndMaker. Always display the chosen backend beside the final
Build action, in progress/status UI, verification results and build receipt.
Capabilities and disabled reasons must be inspectable before building; never
silently fall back, change authority or imply that byte-different archives are
equivalent without decoded semantic verification.

Also expose **IKEMaker preflight + SprMake2 build** and **Validate existing
SprMake2 output** where their exact source/specification identity can be proven.
When the built-in backend lacks a required capability, offer an explicit
same-spec handoff to SprMake2; do not call Compare Both a fallback and never
change the selected backend automatically.

A future combined path may be offered only as a named, reviewable pipeline with
clear stage ownership. Safe combinations include IKEMaker planning/preflight or
post-build validation around a SprMake2/SndMaker final build, and independent
builds followed by semantic comparison and explicit adoption. Do not splice
archive bytes, merge partially written outputs, silently substitute one backend
for another, or pass an unverified intermediate between backends. The common
pipeline is:

`reviewed plan -> capability check -> isolated temporary build(s) -> parse and
semantic verification -> comparison/review -> explicit atomic adoption ->
receipt/recovery`

Each backend writes only to a private, unique candidate location. Rehash sources
inside the captured execution snapshot, serialize only that snapshot, lock the
logical target during the build, and recheck the active archive fingerprint at
adoption. No backend may receive the active archive as its output path. Validation
must cover physical order, identities, dimensions, signed axes, decoded pixels
or indices, palette colors/assignments, explicit links, version/format/counts,
bounded offsets and link cycles—not only identity and palette totals.

Reserve registries for build backends, capability declarations, validators,
importers/exporters, preview providers and report panels. This also covers likely
future expansion already present in the backlog: cross-project SFF/AIR/SND
imports, palette staging, stage/screenpack/story assets, external editor tools,
headless/CI builds and additional verified archive formats. New providers should
contribute stable actions/panels to the existing shell rather than add another
top-level toolbar or parallel editor.

#### Reserved Phase 2 Resource & Data route

Reserve one additional Master Authoring Bar section named **Resources & Data**.
It is the future entry into the Phase 2 Resource & Data Collector shell and uses
a stable route ID now so saved layouts, favorites, Related Work links and package
contributions will not require migration later. During Phase 1 it remains
unavailable or clearly marked planned; an empty pseudo-workspace must not suggest
that Phase 2 has started.

The collector is program-like enough to own a distinct recommended workspace,
layout family, search/navigation model and large-data lifecycle, but it remains
inside the same IKEMaker information architecture. It shares portable project
identity, catalog IDs, provenance records, notes/contracts, selection links and
reviewed creation handoffs—not live mutable editor state. Heavy capture indexes,
offline source snapshots and emulator/GIF/media caches stay out of the authoring
shell's normal startup and memory path.

Phase 1 must therefore establish only the extension seams: namespaced collector
routes/actions/panels, evidence/reference IDs, bidirectional Related Work links,
a versioned proposal/handoff envelope, permissions and trust metadata, and the
ability for a creation editor to preview and explicitly accept/reject a proposal
with conflict detection and Undo. Actual intake, acquisition, conversion,
measurement and inference remain deferred until Phase 1 is complete.

#### New Dev architecture review and conditional sign-off — 2026-10-01

Verdict: **APPROVE WITH CONDITIONS** for Phase 1 UI planning and the bounded
shell prototype. This does not authorize Phase 2 work, built-in archive writers
before their gates, broad viewer migration, replacement of SprMake2/SndMaker, or
an apparently active Phase 2 workspace.

Required architecture clarifications:

- Current Phase 1 order is: complete the global Pending Changes foundation;
  finish the Build workspace/backend-neutral infrastructure and shared SFF
  Creator; harden the SprMake2 adapter around isolated verified candidates;
  implement and certify the built-in SFF backend; then enable shared SFF batch
  scopes. The built-in SND track remains independent rather than a prerequisite.
  Isolated format research, fixtures and read-only validators may start earlier,
  but no new final-write path precedes shared mutation, transaction, recovery and
  Build Review.
- Archive creation uses four identities: **Build Plan -> Build Execution ->
  Verified Candidate Artifact -> Adoption Transaction**. One plan may have
  multiple executions/candidates. Every record carries stable identity,
  project/source revision, backend/version/options, specification/source hashes,
  validation/comparison result, candidate hash, adoption status, recovery and
  QA/release links. Temporary candidate paths never enter arrangements/catalogs.
- **Compare Both** is a pipeline/orchestrator, not a writer backend. Keep distinct
  registries for backend, parser/validator, comparison, orchestration and
  adoption providers. It is meaningful only when two independent outputs exist.
- Capability negotiation is separate for SFF and SND and declares archive
  kind/version, accepted inputs, compression/encoding, palette/link/alias and
  identity behavior, platform availability, preview/compare/adopt support,
  determinism, verification level and tested runtime/platform matrix.

- One extension-host mutation coordinator owns source-revision validation,
  draft ownership, preview, validation, conflicts, Apply, multi-file
  transactions, Undo/recovery, receipts and cross-view synchronization. Existing
  specialized owners remain authoritative behind adapters until safely migrated.
- Distinguish stable feature/model ID, stable project/object context ID,
  ephemeral view-instance ID and host/layout placement ID. Opening focuses an
  existing compatible view; moving/reparenting or creating another view is
  explicit. Multiple views share a model, with one editable draft owner unless
  safe collaborative editing is proven.
- Prototype Source Preview is read-only and reveals exact locations in native VS
  Code editors. It follows/refreshes source but never becomes a competing general
  text editor or undo history.
- Project Knowledge is a lazy graph shell composed from identity, relation,
  layer/detail, selection, query/index, provenance, mutation-link and QA
  services—not a monolithic panel. Catalog item IDs, concrete project entity IDs
  and their instantiation/link IDs remain distinct.
- Build results connect to QA/release as Plan -> Execution -> Candidate ->
  Verification -> Adoption, with test/bug/fix/release relationships. Semantic
  equivalence is evidence, never automatic release approval.
- The reserved Resources & Data route is hidden by default or appears only under
  an optional Planned Features disclosure. Deep links explain unavailability;
  the route cannot execute or be favorited until implemented. Imported layouts
  retain its stable ID only as unavailable.
- Phase 1 versions only the dormant proposal envelope: proposal/schema and
  producer identity, evidence and target IDs, source fingerprint, proposed
  changes, units/coordinates/facing/ownership, confidence/unresolved fields,
  provenance/license constraints, capabilities, conflicts, review decision and
  resulting transaction receipt. It is untrusted data and cannot invoke actions.
- Lazy-load large knowledge relations, catalogs/example packs, QA evidence,
  histories, decoded SFF/SND indexes and future collector data. Workspace restore
  loads layout metadata and visible summaries, not all project data.
- Build execution locks the logical target. Parallel candidates use isolated
  unique temporary locations; adoption rechecks the active output fingerprint
  and fails on external change. Duplicate final builds and competing
  palette/SFF ownership are prevented; cancellation preserves diagnostics.
- Temporary outputs use private per-execution locations, disk/size preflight,
  bounded retention and crash cleanup/recovery; they never partially occupy game
  folders. Keeping a candidate is an explicit action.
- Writers/parsers require checked bounds/offset arithmetic, count/dimension/chunk
  limits, cycle and path-containment checks, decompression/oversize defenses,
  cancellation, bounded memory/streaming where practical, malformed fixtures,
  and fuzz/property testing. Manifest paths and metadata are untrusted.
- Arrangements may persist panel placement and backend-selection presentation,
  but never candidate artifacts/paths, draft payloads, mutation leases,
  credentials, private QA/evidence, Phase 2 captures or adoption authority.
  Actual backend preference stays in project/user settings.

Accessibility/performance gates include text—not color alone—for build diffs and
states; screen-reader status; list/tree alternatives to graphs; virtualization
for large relations/manifests; throttled progress; accessible Cancel/Stop and log
navigation; narrow Compare Both layouts; hidden-panel suspension; bounded logs,
decoding and restore memory; and measurable budgets for initial Knowledge load,
global search and semantic archive comparison.

Implementation may begin only after namespaces, surface/mutation-owner inventory,
read-only Source Preview, mutation and multi-window ownership, model/view IDs,
measurable accessibility/performance budgets and dormant Phase 2 behavior are
documented. Build UI follows a passing shell prototype. Built-in writing follows
independent validators/golden fixtures, fail-closed capability handling, proven
temporary construction/atomic adoption/recovery and QA linkage.

Master navigation should distinguish **open/focus a workspace** from **show this panel in the current workspace**. Users can intentionally compose layouts, while recommended layouts provide predictable defaults and prevent every specialized tool from automatically creating another tab/window.

#### Phase 1 implementation checkpoint — 2026-10-04

Nightly authoring remains an opt-in project capability, never the IKEMaker
default. A project pinned or explicitly assigned to Nightly should expose and
use Nightly-only options where they improve authored game code; a stable 1.0
project must not see those options in normal pickers or receive them from code
generation. For Nightly gameplay, prefer the dedicated `Dummy` collision group
for logic-only geometry such as throw/grab regions, proximity sensors, parry or
armor regions, helper interactions and special mechanic zones. Do not fake
these regions with attack/hurt boxes when Dummy expresses the intent. Dummy is
created through `OverrideClsn` and may be queried through `ClsnOverlap`,
`ClsnVar` and supported collision features; it has no inherent attack or hurt
behavior. Preserve explicit PlayerID targeting for Simul/Tag-safe queries.

The ordered foundation above is now implemented in bounded, test-covered slices:
global Pending Changes ownership; one backend-neutral SFF Creator/Add Sprites
workspace; immutable SFF build specifications and receipts; isolated SprMake2
candidates with independent strict validation and transactional adoption; a
deterministic PNG8 SFF v2.1 built-in writer kept Compare-only; and Compare Both
with no adoption authority. SprMake2 and the legacy controls remain available.

Built-in SFF certification now includes a physical bundled-SprMake2 differential
covering authored non-sorted sprite/palette order, exact palette assignment,
signed and larger axes, backward sprite and palette links, independent linked
sprite axes, repeat-build byte determinism, strict reviewed-spec validation and
semantic comparison with the built-in candidate. This is stronger parser/writer
evidence, not permission to adopt the built-in result. Real IKEMEN load/render
testing and the remaining platform matrix are still required before opt-in
built-in adoption can be enabled.

For current pre-release author testing, that adoption gate now has a deliberately
narrow exception in SFF Creator. The default action builds and canonically
validates the in-house candidate first, rebuilds the same immutable specification
with SprMake2, independently validates SprMake2 under its named compatibility
profile, requires semantic equivalence, records both exact hashes and an immutable
comparison report, and then asks for explicit final confirmation. Approval adopts
the exact in-house bytes that were compared. Any mismatch, backend failure,
cancellation, target drift, or temporary-palette lifecycle drift adopts neither.
The direct SprMake2 route remains visible, and this author-only comparison loop
does not satisfy or remove the real-IKEMEN/platform release gate.

That physical differential is now hash-locked to the reviewed bundled
SprMake2 executable and to both candidates' exact bytes. Tool replacement or
encoder byte drift therefore fails visibly and requires a deliberate evidence
update. This strengthens offline regression certification; it does not weaken
the remaining physical gate.

The certification matrix now adds physical bundled-SprMake2 differentials for
the smallest supported one-sprite/one-palette archive, that same final PNG8
snapshot explicitly reviewed as crop-before-axis, and a
two-source archive using group/index `65535,65535`, a sparse `0,65000` identity,
and both signed-axis extremes (`-32768` and `32767`). Each backend is repeat-
deterministic, independently strict-validated, semantically compared and
hash-locked together with the executable. A separate built-in golden matrix
covers a deterministic 64-byte header-only empty archive, the one-pixel minimum,
those numeric boundaries, non-sorted sparse
identities, arbitrary reviewed palette alpha, and multi-hop backward sprite and
palette link chains. These remain offline serializer/validator fixtures; they
do not substitute for real IKEMEN load/render or Linux/macOS execution evidence.

A second deterministic built-in-only property matrix now generates 32 varied
PNG8 archives from the fixed seed `5ff21c0d`. It exercises non-sorted and boundary
identities, signed-axis extremes, 27 backward sprite links, 28 backward palette
links, 31 repeated physical identities, varied dimensions/index streams and
arbitrary RGBA palette alpha. Every archive is built twice, independently
strict-validated against its immutable specification, checked for exact physical
order/axes/palette order, and challenged with a corrupted reserved header. The
32 candidate hashes are sealed by corpus hash
`1f911ab71aab79131336b5c03b008b97aa68d577df3dd8b6590fa1446df5664f`.
This broadens offline regression evidence without changing the Compare-only
backend or satisfying the remaining real-engine/platform gate.

The independent structural gate now also enforces a 65,536-palette ceiling,
an aggregate decoded-pixel budget, complete reviewed entry IDs, PNG8
compression/crop/table-order evidence, unique physical palette identities and
canonical linked metadata. Canonical built-in candidates must cover every byte
of their tables and data sections exactly. Physical SprMake2 candidates use a
separate named compatibility profile: only zero-filled layout padding and
bounded legacy unused offsets are tolerated, so preserving the supported
SprMake2 route does not weaken built-in certification. Corruption tests cover
both profiles. Adoption remains disabled.

The built-in comparison profile now accepts both reviewed crop orders because
Creator writes, hashes and dimensions the final indexed PNG snapshot before
either backend runs. **Crop source first, then calculate axis** calculates on
that prepared canvas. **Calculate axis first, then crop** retains the reviewed
original-canvas axis and seals the exact negative crop-origin delta that becomes
the stored SFF axis. The independent validator checks prepared dimensions,
decoded pixels and the applied delta; the physical differential proves both
orders have the same semantics under bundled SprMake2. Legacy unprepared
SprMake2 autocrop remains outside the built-in profile.

The built-in serializer also now preserves repeated sprite group/index
identities as distinct physical entries, keyed by their immutable entry IDs and
reviewed order rather than collapsing them through a group/index map. Strict
validation checks every occurrence separately. This is format-preservation
work for the Compare-only backend, not an adoption claim: the bundled SprMake2
probe returned success without producing an archive for a repeated-identity
manifest, so no false SprMake2 parity claim or golden fixture is recorded.
The production adapter now distinguishes that zero-exit/no-candidate condition
from an ordinary nonzero process failure and tells the author to inspect the
manifest/output; it never treats a missing candidate as a successful build.

Runtime certification no longer depends on hand-assembling test archives. The
repository now has a deterministic, empty-directory-only fixture generator for
empty, minimal, numeric-boundary, prepared-before/after-axis, linked-data and built-in-only
repeated-identity SFFs. It emits a hash/specification-locked JSON manifest with
the exact physical identities, axes, dimensions, palette assignments and manual
IKEMEN/platform checks. The manifest explicitly forbids adoption; generating
fixtures prepares the physical gate but does not satisfy it.

The certification kit now includes a manifest-byte-bound results template and
plain-language runbook. Windows x64 and Linux x64 rows require the tester,
timestamp, exact OS/architecture and IKEMEN build plus per-fixture load, reopen,
identity-table, render, transparency and linked-data results. Completed ledgers
are rejected if the fixture manifest changes. Even a fully passing ledger only
reports that the physical gate evidence is satisfied; it cannot flip built-in
adoption on by itself, preserving the separate explicit release decision.

The runtime-certification kit now emits one collision-safe sealed expected PNG
for every physical sprite occurrence, including repeated group/index entries and
links. Its manifest binds each occurrence to expected PNG bytes, decoded palette
indexes and assigned RGBA palette hashes, and gives the physical tester explicit
visual and data comparisons to record. Generation remains deterministic,
exclusive to an empty destination and marked `adoptionAllowed: false`; these
stronger oracles still do not substitute for an IKEMEN load/render result.

The first mutation consumer of the shared scope contract is SFF Crop/Rebuild.
Its single picker supports Current, Marked, Visible/Filtered, Group, inclusive
Numeric Range, project-scoped named Work Sets and All. The host resolves semantic
group/index identities in physical archive order, blocks duplicate identities,
records the exact fingerprint/count/resolution hash in the immutable build
specification and receipt, rechecks the archive from disk, and applies only via
the verified SprMake2 candidate/adoption path. The scope service itself never
writes. SFF batch axis offsets now use the same picker for both direct-header and
SprMake2-manifest routes, recheck the archive before either write, and carry the
scope mode/resolution hash into mutation evidence. PNG batch export uses the
same Current/Marked/Visible/Group/Range/Work Set/All contract and rereads the
exact archive before decoding. AIR/SND adoption and additional SFF transforms
remain later consumers of this contract rather than extra viewer buttons or
parallel mutation owners.

Marked, Visible and work-set scope resolution now rejects the complete request
when any reviewed physical sprite position is unavailable. It never filters a
stale row and proceeds with a smaller export or mutation set.

Read-only SFF image batches now use a physical-occurrence extension of that
scope contract. Repeated group/index identities remain selectable by archive
position and receive `_pNNNNN` filename suffixes, so no occurrence overwrites
another. Plain PNG export is one collision-safe atomic write set. Resize, crop,
rotate, shared-axis alignment and RGBA channel export render into private
staging folders, commit all outputs atomically only after every transform
succeeds, refuse existing destination files and clean staging on both success
and failure. Mutating identity-based SprMake2 operations remain fail-closed on
ambiguous identities; read-only export does not inherit that unnecessary limit.
Exact-archive work sets now have a version-2 physical-occurrence form for these
cases, recording both archive position and group/index under the unchanged SFF
fingerprint. Older identity-only work sets remain readable for unique archives
and fail closed if later asked to resolve a repeated identity. Direct header
axis offsets and indexed-palette assignments can use the physical form safely;
SprMake2 manifest routes continue to require unique identities.

SFF group rename now distinguishes a disjoint merge from an identity collision.
Both direct-header and SprMake2-manifest routes inventory source/destination
indexes first; overlapping destinations are blocked with the exact conflicting
indexes instead of silently creating repeated identities. A disjoint existing
destination requires an explicit **Merge Disjoint Groups** confirmation. The
active SFF fingerprint is checked again after review, and the manifest route
also retains its exact source-text hash at transactional commit.

The retained legacy SprMake2 text workflow is now guarded by the same numeric
limits instead of being treated as an unsafe compatibility escape hatch.
Duplicate-in-manifest requires one unambiguous source row and an unused
destination. Multi-image Add validates the entire sequential range, rejects an
end beyond 65535 and reports every occupied destination before writing any CSV.
Authors can still choose the old text method, but it no longer stages a batch
that SprMake2 can only fail to build later. Add, Duplicate, Delete and Replace
also retain an exact lease on the reviewed SFF: the archive fingerprint is
checked again immediately before the CSV manifest is committed, so an external
archive change cannot silently redirect a reviewed text edit onto a different
sprite set.

Cross-SFF import into the retained SprMake2 workflow now preflights the complete
incoming identity set against the destination manifest and rejects both source
duplicates and destination collisions before rendering any files. Its manifest
replacement and extracted PNG creation remain one atomic transaction, while a
per-target creation policy prevents an existing artist PNG from being replaced
even though the reviewed manifest itself is allowed to update.

Creator numbering and the backend-neutral ArchiveBuildSpecification now enforce
the actual SFF field limits before a package reaches either backend: group/index
and indexed dimensions are 0/1 through 65535 as applicable, while axes are
signed 16-bit values. Next-free allocation fails with a precise exhausted-group
message instead of drifting to index 65536, filename detection reports out-of-
range captures as review conflicts, and invalid axes/dimensions cannot enter an
immutable reviewed specification. The built-in writer retains its independent
range checks as a second serialization boundary.

Imported Creator recipes can no longer smuggle in an unsupported or mixed
per-sprite identical-data policy. Policy names are validated during planning;
because SprMake2 exposes one build-wide duplicate switch, mixed rows are blocked
with a precise explanation before packaging and are rechecked at package
construction. IKEMaker does not silently collapse them to the first row's
choice. A future certified built-in mixed-link route may consume such choices
only after its specification and UI make every link decision explicit.

Manual occupied-identity and reserved-range inputs are also authoritative review
data now rather than permissive hints. Malformed or out-of-range identities,
invalid range fields, reversed ranges, oversized labels and unbounded imported
lists fail closed with the exact row identified. Invalid text therefore cannot
be silently ignored while a Creator build appears ready.

The final Creator review now lists every source excluded by **Skip collisions**,
including its filename, requested identity and reason, and labels it as excluded
from the build. Skipped files were previously counted but omitted from the row
review, which made a valid build easier to misunderstand. Conflict-only mode
continues to show actionable blockers rather than mixing deliberate skips into
that queue.

For a brand-new archive that intentionally uses each indexed PNG's own palette,
the shared build specification now materializes every 256-color RGBA table and
assigns it the exact palette identity SprMake2 emits: the owning sprite's
group/index. The sprite points to that explicit palette entry, identical tables
carry reviewed backward links when palette sharing is selected, and candidate
verification uses the same contract. SprMake2 still receives its native
`sprite.usepal = -1` syntax; backend-neutral IDs never leak into its definition.
This closes the previous gap where a valid new PNG8 build had no palettes in the
shared specification and therefore could not use **Compare Both**. A physical
bundled-SprMake2 regression builds and strictly verifies this own-image-palette
case. Built-in adoption remains disabled pending the separate runtime/platform
gate.

The Compare-only built-in writer now also accepts the normal stored-palette
case where an indexed PNG's embedded display table differs from the explicitly
assigned SFF palette. The PNG remains immutable index evidence; the reviewed
`paletteId` is the archive interpretation, matching SprMake2 `sprite.usepal`.
A physical bundled-SprMake2 differential and independent deterministic goldens
prove semantic agreement for that case. The runtime-certification corpus adds a
separate fixture and generates its expected render with the assigned table,
while retaining the source PNG hash and decoded-index hash independently.
This removes an offline comparison limitation only; built-in adoption remains
disabled until the Windows/Linux IKEMEN physical gate passes.

SFF Creator can now preserve each incoming indexed PNG's palette when adding a
single sprite or small batch to an existing archive. The author chooses the
destination palette group; IKEMaker appends after that group's highest occupied
index, displays every sprite-to-palette assignment in final review, rejects
non-indexed sources, collisions and 16-bit range exhaustion before packaging,
and records the allocation in the immutable shared specification. Existing
sprites and palette tables remain preserved. This is the same shared
SprMake2/built-in comparison plan—not a direct viewer write or parallel palette
owner—and a bundled-SprMake2 preservation rebuild is independently strict-
validated. The resulting embedded palettes are ordinary archive palettes and
therefore flow back into Palette Workshop after explicit candidate adoption.

Viewer **Delete** and indexed **Duplicate** now enter that same retained Creator
plan instead of unexpectedly asking for a CSV manifest. Marked deletion is a
first-class deletion-only plan: exact unique identities are listed in final
review, protected 59000 templates, repeated/ambiguous identities, missing
entries, delete-and-replace conflicts and deleting the whole archive are blocked,
and every other physical sprite remains in order. Indexed duplicate extracts an
immutable source snapshot, retains its exact axis and palette, proposes the next
free index in the source group, and leaves destination, axis and identical-data
sharing available for review. Both build private SprMake2 candidates and retain
normal strict validation/adoption gates. Explicitly named legacy manifest Delete
and Duplicate commands remain in the SFF dropdown for authors who prefer the old
text workflow.

Whole-group deletion now uses the same Creator contract. The viewer resolves the
current group to its exact physical sprite indexes and stages the complete set;
Creator then applies the ordinary stale-target, duplicate-identity, protected
template, delete-and-replace and non-empty-archive checks before any package can
be built. A deletion-only draft is also treated as target-owned retained work,
so opening another SFF cannot silently move those deletions to the wrong archive.
The dropdown keeps a separately labelled legacy SprMake2-manifest group-deletion
route for authors who intentionally maintain the old text workflow.

The SFF Sprites/Actions menu also exposes **Suggest Sprite Axes…** without adding
a permanent viewer control. Its first deterministic local-analysis slice offers
alpha-bound anchors, one trusted silhouette reference or multi-reference
weighted-median consensus. It records source/reference hashes, match and
runner-up evidence, confidence, maximum search radius and a separate maximum
accepted axis delta. The user selects individual proposals; accepted values are
staged as `REVIEW` rows in the authoritative SprMake2 manifest with an immutable
evidence record. The active SFF is never edited by analysis. AIR-neighbor
selection, connected-component controls and animated before/after review remain
follow-on improvements to the same workflow rather than separate mutation paths.

SFF Creator now applies the same reviewed analysis to incoming marked sources
before either backend receives a build plan. Authors choose anchor, one-reference
or consensus mode, select the trusted reference rows, set search and maximum
axis-change limits, and accept suggestions individually. Only high-confidence
rows are preselected; lower-confidence rows require opt-in. Blocked rows and
large changes stay untouched. Accepted axes cannot enter a build until each is
visually previewed and approved. Crop-before-axis sources are analyzed in their
actual prepared coordinate space, including mixed target/reference crop modes.
Source/reference hashes, axes, crop bases, confidence and algorithm evidence are
revalidated before packaging, written to a readable sealed sidecar, and bound to
the immutable specification and receipt; manual axis/crop edits or changed
references invalidate the retained evidence.

The same reviewed scope contract now has its first SND consumer. **Remove from
Build Manifest** resolves Current, Marked, Visible/Filtered, Group, inclusive
Numeric Range, project-scoped Work Set or All against the exact SND byte
fingerprint and stable group/index identities. Duplicate archive or manifest
identities, missing manifest entries, a changed archive, or a changed manifest
block the whole operation before a write; successful removal changes only the
reviewed SndMaker manifest transactionally. The active SND and source WAV files
remain unchanged. Restored marks are discarded after an archive fingerprint
change, and Shift-selection now respects every active text/QA/marked-only filter.
Scope-backed SndMaker rebuild/adoption remains gated until it gains private
candidates, an independent strict SND validator, immutable source/build facts,
target drift checks, sealed candidate adoption and durable recovery. AIR remains
independent of that future SND writer hardening.

AIR action deletion now consumes the contract as well: Current, Marked,
Visible/Filtered, functional Category as the AIR Group equivalent, inclusive
Action-number Range, revision-bound Work Set and All. The exact open-document
text fingerprint includes reviewed unsaved edits, duplicate action numbers block
mutation, and the existing document-version/text baseline check still runs after
the scope and confirmation dialogs before the VS Code Undo-capable edit. Restored
marked actions are discarded when the AIR source fingerprint differs. The picker
is invoked from the existing Delete route and adds no permanent viewer control.
The main viewer and separate AIR Actions Browser send the same scope payload;
both invalidate restored marks across path/revision changes. Action deletion is
also blocked when it would orphan saved push-box plans, saved runtime frame
plans or unfinished frame-plan drafts.

#### Saved and shareable workspace arrangements

Users must be able to save, duplicate, rename, organize, export, import and share their dock arrangements and favorites like other professional creative applications.

A saved workspace arrangement may include:

- Dock tree, splits, tab groups and tab order.
- Active/default tabs where portable.
- Relative panel proportions and collapsed/auto-hidden state.
- Visible tool rails, tool-family order and last-used subtool where explicitly included.
- Master Authoring Bar section visibility and density.
- Recommended-action presentation overrides.
- Action Favorites, their order and scope.
- Authoring Favorite groups only when the user explicitly includes them; recipe/map/function content itself is referenced by stable ID rather than copied.
- Inspector groups and bottom-panel arrangement.
- Responsive variants or safe rules for wide, medium, narrow and very narrow layouts.
- Intended workspace/viewer types and required capabilities.

Provide scopes:

- User/global workspace arrangement.
- Viewer-type arrangement.
- Named task arrangement.
- Project-specific override.
- Team/project-shared arrangement.
- Later, downloadable Community Library arrangement package.

Sharing format requirements:

- Portable documented layout package with stable namespaced panel/action/tool/catalog IDs, schema version, IKEMaker compatibility, creator's chosen public display name, description, tags, required/optional features, preview metadata and license/redistribution choice.
- Never identify items by labels, numeric positions, local file paths or transient webview/component IDs.
- Never include source contents, unsaved drafts, evidence, usernames, machine names, absolute paths, recent files, project secrets, credentials, private notes or monitor coordinates by default.
- Project-specific bindings use declared portable project/capability identities and relative/project-owned references only after explicit review.
- Export preview lists everything included and anything removed/redacted. The user chooses whether optional Authoring Favorite organization or project bindings are included.
- Import preview shows layout name/author/version, requested panels/actions/tools, missing/incompatible features, project bindings, favorite changes, conflicts, privacy/trust classification and the exact scope where it will be installed.
- Import never silently replaces the active layout. Default to installing as a new named arrangement, previewing it, then explicitly applying it.
- Imported layouts cannot execute code, mutate project files, install dependencies or grant permissions. They are declarative UI configuration only.
- Missing panels/actions remain identifiable with recovery/explanation; aliases and migrations resolve renamed IDs without redirecting to semantically different tools.
- Relative sizes are clamped to the current window. Offscreen, zero-sized or inaccessible panels recover automatically.
- Preserve the prior arrangement as an undoable checkpoint before applying/importing another.

Favorite sharing:

- Action Favorites and Authoring Favorites remain distinct collections within the package.
- Users may share only the arrangement, arrangement plus Action Favorites, selected Authoring Favorite groups, or a complete reviewed personalization package.
- Favorite entries keep source/provenance/version/compatibility and preferred action. Missing recipes/contracts remain disabled and identifiable rather than silently substituted.
- Sharing a favorite references public/bundled content by catalog ID; it does not redistribute content whose license does not permit it.
- Project/team imports may recommend favorites but do not silently overwrite an individual's personal favorite order.

Management UI should support My Arrangements, Project/Team Arrangements, Imported Arrangements, Recommended Defaults and later Community Arrangements. Allow preview thumbnails/diagrams, duplication before editing, Reset Recommended Layout, Reset Actions Only, Revert Session Changes, layout history/checkpoints and safe-mode recovery.

The post–Phase 1 Community Library can publish and discover reviewed layout packages through the same extension/package identity system. Local file export/import and offline sharing must work first and remain fully usable without the website.

### QA, bugs and release traceability inside Project Knowledge (2026-10-01)

QA is a Phase 1 layer of the same knowledge graph, not a later standalone bug tracker. Preserve the relationship:

`Contract -> Implementation -> Recipe -> Test -> Bug -> Fix -> Retest -> Release`

Required connected capabilities:

- Requirements and acceptance criteria linked to contracts and implementation.
- Manual and automated test definitions under one inspectable model.
- Immutable/revisioned test sessions containing project revision, build/runtime/IKEMaker/pack identity, characters, stage, mode, teams, configuration, result, evidence, tester and time.
- Structured bug reports with summary, expected/actual behavior, reproduction, severity, affected build and evidence; optional priority, owner, regression status and target release.
- Bug creation from a symbol, contract, recipe, asset, validation result, build or failed test while preserving that context.
- Duplicate suggestions only; users decide. Preserve unique evidence and environment differences when reports are linked as duplicates.
- Fix candidates and change sets linked to affected contracts/files/assets and required regression tests. “Code changed” is not equivalent to “fixed.”
- Verification creates a new retest record and never overwrites the original failure. Verified requires attached evidence or an explicitly authorized waiver.
- Release readiness aggregates required tests, open blockers, contract violations, unverified fixes, stale evidence, Simul/team coverage, assets, documentation, known issues and sign-offs. Successful compilation alone never means ready.
- Known Issues uses editor-reviewed public wording and never publishes internal paths, identities, evidence or discussion automatically.

Evidence must be offline-first and privacy-aware. Support screenshots, recordings where available, logs, debug values, build output, source excerpts/diffs and notes. Capture provenance and build/runtime identity; warn about usernames, machine paths, tokens, chat text and unrelated windows. Redacted exports must be separate sanitized artifacts without hidden originals.

Authority remains separated:

1. Runtime authority: ordinary IKEMEN source/game files; no IKEMaker runtime dependency.
2. Declared project knowledge: versioned manifests, contracts, requirements, capabilities and test definitions.
3. IKEMaker workspace knowledge: indexes, favorites, drafts, local sessions/evidence and UI state.

Every fact displays provenance: parsed source, project manifest, reference pack, IKEMaker inference, user documentation or runtime observation. Disagreement is shown for review rather than hidden in an internal second truth.

Phase 1 vertical proof should run entirely through the connected workspace:

`Open a normal's cancel contract -> inspect implementation -> run guided test -> record failure/evidence -> create linked bug -> link fix -> retest -> clear release gate.`

### New Dev read-only docking prototype review — 2026-10-03

Verdict: **DO NOT APPROVE the current prototype implementation as the UI
foundation. APPROVE WITH CONDITIONS the hybrid architecture after the native
registration defect is corrected and the internal docking shell is implemented
and accepted.** No code implementation was authorized by this review.

Confirmed installed-build failure:

- VS Code's renderer log rejects the contributed Panel container ID
  `ikemen.dockingPrototype`: contributed View-container IDs allow only letters,
  numbers, `_`, and `-`. The container therefore does not exist, all four Views
  fall back into Explorer, and the generated command
  `workbench.view.extension.ikemen.dockingPrototype` is absent. This directly
  explains the reported command-not-found error and why earlier attempts either
  appeared to do nothing or reopened Explorer/another restored area.
- The installed 0.79.31 and current development source contain the same
  `docking_prototype.js`, and current `package.json` still declares the invalid
  dotted container ID. The isolated test mocks `executeCommand` as unconditional
  success and therefore cannot validate manifest schema, generated workbench
  commands, visible container placement, or the four Views in the desktop shell.
- `Open Docking Floating-Window Probe` deliberately creates a WebviewPanel in an
  editor group. Starting as an editor tab is expected for that API, not a docking
  failure. VS Code can move the whole editor tab/group into a floating window;
  it cannot turn individual internal webview regions into arbitrary native
  dock/floating panels.

Platform boundary and architecture correction:

- Keep native contributed Views for lightweight quick access that VS Code can
  move among the Primary Sidebar, Secondary Sidebar, and bottom Panel.
- Use one editor/WebviewPanel-hosted IKEMaker Docking Workspace for Photoshop-
  style snap targets, internal split panes, layered tabs, resizable/collapsible
  panels, simulated auto-hide, portable panels, saved arrangements, the Master
  Authoring Bar, tool rail, Inspector, and bottom docks. The whole workspace may
  move with its editor group or into a VS Code floating window; do not promise
  arbitrary native windows for each internal panel.
- A separate companion application could provide unrestricted native windows,
  but remains rejected because it duplicates lifecycle, commands, project state,
  accessibility, installation, and mutation ownership.

Required identity and state boundaries:

- Distinguish stable feature/model ID, stable project/object context ID,
  ephemeral panel-view instance ID, and layout/host placement ID.
- Opening an already-compatible context focuses the existing view in place.
  Reparenting/moving is explicit; another view is created only by explicit user
  request. Multiple views share one model and mutation coordinator.
- Maintain one editable draft owner unless actual collaborative editing is
  implemented. Additional views are synchronized read-only or explicitly take
  ownership after revision/conflict checks.
- Prototype Source Preview remains read-only and reveals/follows native VS Code
  source editors. It must not become a second general text editor or undo stack.
- Layout files persist presentation only. Never persist source/form draft
  payloads, mutation leases, editable authority, active build/adoption authority,
  temporary outputs, private evidence, or stale source fingerprints as permission
  to write.

Present capability inventory:

- Four inert WebviewView providers exist: Project Knowledge, Controllers &
  Favorites, read-only Source Preview, and Problems & QA.
- Each view has a local selection/note probe, viewport measurement, simple
  visibility message, CSP wrapper, and retained webview context.
- An optional WebviewPanel editor probe supports one reused editor instance,
  serializer restoration, editor-group movement, and whole-workspace floating-
  window experiments.
- The prototype does not yet implement the internal docking tree, snapping,
  internal tab groups, portable panel model, shared selection, Master Authoring
  Bar, five-action/favorites/overflow behavior, Inspector contributions, tool
  rail, responsive layout, shared draft/mutation coordination, named/shareable
  layouts, keyboard panel movement, or production accessibility behavior.

Required implementation order:

1. Correct the native container registration using a schema-valid stable ID;
   keep action/view IDs namespaced independently. Add package-schema validation
   and a real desktop acceptance check that observes the visible container title
   and all four Views. Do not derive undocumented workbench command IDs blindly;
   use a verified supported reveal route and retain a visible/manual fallback.
2. Specify the shared IDs, action registry, selection/context service,
   panel-contribution contract, one mutation/draft coordinator, native-editor
   bridge, layout schema/migrations, accessibility contract, security/message
   schema, and measurable performance budgets.
3. Build an inert internal docking-shell harness inside one WebviewPanel. Prove
   splits, snapping, tabbing, resize, collapse/reopen, explicit move/reparent,
   responsive variants, keyboard equivalents, focus restoration, serialization,
   missing-panel recovery, restart, and whole-workspace floating-window behavior.
4. Integrate only Project Knowledge, Controllers/Favorites, read-only Source
   Preview, Problems/QA, the Master Authoring Bar, identity colors, Actions
   search, up-to-five stable primary actions, favorites, and visible overflow.
5. Harden lazy loading, hidden-panel suspension, webview recreation, cross-window
   revision/conflict handling, crash recovery, native editor follow/reveal, and
   external-file-change detection.
6. Migrate one representative visual viewer before broader migration. AIR is a
   suitable proof for tool families, canvas/Inspector, playback, timeline,
   accessible structured alternatives, full-editor scrolling, resizable viewer
   height, and real-asset performance. Keep the legacy viewer until parity.
7. Migrate SFF/SND/Move Lab and specialist workspaces individually. Make Palette
   Workshop the first explicit portable-panel proof only after the panel and
   mutation contracts pass; embedded and detached presentations must share the
   same model, staged plan, draft, source identity, undo and mutation owner.

Acceptance gates before broad migration:

- A clean VS Code profile loads the extension without contribution errors; the
  normal command visibly opens the intended container/workspace, never Explorer
  by accident, and the editor/floating probe remains explicitly separate.
- Every pointer drag/right-click route has a visible keyboard/menu alternative.
  Panel focus survives move, split, collapse, reload, narrow reflow and close;
  keyboard users can move/resize/reorder panels, tabs and favorites.
- Wide, medium, narrow and very-narrow/floating layouts are deterministic. At
  narrow widths, a fixed labeled section route remains visible, essential left-
  side content and Save/Apply state remain reachable, and major work areas reflow
  or use drawers instead of depending on horizontal scrolling.
- Horizontal overflow has visible controls and keyboard/screen-reader operation.
  Full-editor vertical scrolling works; viewer height is resizable and pushes
  lower content down rather than covering or clipping it. Editor-tab navigation
  remains usable at high tab counts and narrow widths.
- Recommended primary actions remain stable and number at most five, except a
  documented transient sixth such as Stop/Resolve Conflict. Favorites append,
  never duplicate a primary action, use visible counted overflow, and retain
  stable action IDs and disabled reasons.
- High contrast, 200% zoom, reduced motion, screen-reader semantics/announcements,
  structured nonvisual canvas alternatives, and non-color identity cues pass.
  Shared AIR/SFF/SND/Code/QA colors remain supplementary.
- Hiding/reopening/restarting a webview does not lose a draft or accidentally
  Apply/Save it. Closing or switching project uses exact Apply/Discard/Cancel
  behavior. Stale drafts cannot overwrite newer source. Duplicate views cannot
  both write. Reparenting never changes mutation authority.
- Saved/shareable layouts restore presentation across restart and different
  widths, migrate renamed IDs, recover missing/offscreen panels, and contain no
  private paths, project source, drafts, mutation authority, or credentials.
- Visible panels lazy-load; hidden rendering/playback/polling suspends; large
  lists virtualize; message payloads are versioned/validated; repeated open/close
  does not leak listeners or models; performance budgets are recorded and pass.

Physical UI automation was unavailable during this review because no native-app
surface was exposed to the available computer-control runtime. The VS Code
renderer and extension-host logs supplied direct installed-build evidence of the
registration failure. A human or supported desktop integration run remains
mandatory after the manifest fix; unit mocks alone are not acceptance.

#### Revised internal docking-shell review — 2026-10-03

Verdict: **APPROVE WITH CONDITIONS.** The now-working four native contributed
Views remain useful optional sidebar/Panel access points, but they cannot provide
the requested floating Photoshop-like workspace. The primary shell should use
the same outer VS Code mechanism as AIR: one `createWebviewPanel` editor tab that
the user can move with its editor group into a VS Code floating window, with an
IKEMaker-owned docking tree inside that webview.

Reuse from the AIR/shared lifecycle:

- `createWebviewPanel`, stable view type, `trackViewerPanel`, preferred viewer
  group behavior, CSP protection, serializer registration, native source
  reveal/follow patterns, current-document refresh, and explicit panel disposal.
- `viewer_close`'s fail-closed close inspection and busy/draft negotiation as a
  starting protocol, after adapting it to shell-owned child-panel drafts.
- `viewer_sessions` only as a reference for bounded state capture and timeout;
  the docking shell needs its own versioned layout snapshot rather than encoding
  internal panels as separate VS Code editor groups.
- Navigation/history concepts may be reused, but panel layout movement is not
  navigation history and requires a separate undo/checkpoint stream.

Keep isolated from the shell:

- AIR parsing, sprite caches, timers, playback, form auto-apply, source mutation,
  runtime draft store, palette/CLSN logic, and AIR's `openPanels` session map.
- AIR's large HTML/CSS/inline client must not become the base shell. Contribute
  AIR later through stable panel/tool/Inspector adapters.
- `retainContextWhenHidden` may optimize a live session but cannot be the primary
  persistence or recovery design.

Minimum first prototype is strictly non-writing: one reused WebviewPanel with
Project Knowledge, Controllers & Favorites, read-only Source Preview, and
Problems & QA placeholder panels; horizontal/vertical split; snap targets; tab
groups/reorder; resize; collapse/reopen; explicit internal move; responsive
wide/medium/narrow/very-narrow layouts; keyboard/menu equivalents; focus return;
Master Authoring Bar shell; up to five inert recommended actions; inert favorites
with visible overflow; identity colors; and save/reset one named layout. It reads
no project files for mutation, owns no editable project draft, and exposes no
Apply/Save action.

Identity/state rules:

- Separate stable feature/model ID, stable project/context ID, ephemeral view
  instance ID, and dock/layout node ID. Opening compatible context focuses the
  existing view in place; it never implicitly reparents it. Duplicate views are
  explicit and share one model.
- The future mutation service remains extension-host-owned with one editable
  draft owner. Reparenting only changes presentation. Until that service exists,
  the prototype remains non-writing and cannot claim production draft safety.
- `vscode.setState` holds the current view instance's small, immediate UI
  snapshot so the serializer can reconstruct after webview/editor restoration.
  Extension `workspaceState` holds versioned named layouts, last-known-good
  recovery/checkpoints, schema/app version and safe user preferences. The
  serializer receives only a compact instance/layout reference plus enough
  non-sensitive fallback state to reopen safely.
- Both stores may contain presentation state only: dock tree, tabs, relative
  sizes, collapsed state, active panel, focus hint, action/favorite IDs and
  responsive variant. Neither stores source/form draft payloads, mutation leases,
  editable ownership, active transactions, temporary output, or stale source
  fingerprints as authority. Project/team-shareable layouts remain separately
  reviewed declarative exports.
- Webview state is not authoritative. On mismatch/corruption, validate IDs and
  schema, migrate aliases, clamp dimensions, drop unavailable panels visibly,
  and fall back to the last-known-good/default layout.

Whole-workspace floating is safe within VS Code's supported editor-group model:
moving the tab normally preserves the same WebviewPanel object and webview. A
window reload, extension-host restart, restored session, or VS Code recreation
may destroy that instance, so safety depends on the registered serializer plus
validated external layout/model state. Moving windows must not itself transfer
draft ownership or create a second model. Test the actual installed VS Code
behavior; do not infer it solely from `onDidChangeViewState`.

Acceptance before real panels or mutations:

- Move the whole workspace among editor groups and into/out of a VS Code floating
  window; selection, tabs, split sizes, focus target and layout survive. Reload
  the window/extension host and reopen VS Code; serializer recovery restores a
  valid bounded layout or a visible safe default.
- Pointer drag has a visible target preview and cancel path. Keyboard/menu users
  can move, split, tab, reorder, resize, collapse, reopen and reset every panel.
  Focus never disappears after a move, close, responsive reflow or restoration.
- Narrow/floating layouts retain a fixed labeled section/panel switcher, active
  content, primary actions and overflow. No important left-side panel is reachable
  only by horizontal scrolling; resize/full-page scroll never overlays lower
  content.
- Missing/renamed/duplicate/cyclic layout nodes, invalid sizes and future schema
  versions fail safely. Applying/resetting a layout creates a checkpoint; layout
  persistence cannot invoke project commands.
- Hiding the webview suspends unnecessary rendering. Repeated move/reload/open/
  close cycles do not duplicate listeners, models or panels. Payloads are bounded
  and versioned; large future panels lazy-load only when visible.
- Screen-reader roles/announcements, roving toolbar/tab focus, keyboard splitters,
  visible focus, high contrast, 200% zoom and reduced motion pass. Color is never
  the only panel identity.
- Native contributed Views and the internal shell use the same action/catalog
  identities but do not mirror mutable draft state. Opening an optional native
  View focuses/links to the shell context rather than silently creating another
  editable workspace.

Stop after the inert prototype and user review. Do not migrate AIR, Palette
Workshop, SFF/SND, Move Lab or any writing feature until lifecycle restoration,
responsive behavior, keyboard/accessibility, missing-layout recovery and repeated
floating-window tests pass in the installed extension.

#### Universal viewer-shell cohesion and migration review — 2026-10-03

Verdict: **APPROVE WITH CONDITIONS.** The AIR-style WebviewPanel plus internal
IKEMaker docking shell is approved as the common host for visual, knowledge,
workflow and review workspaces. Internal docking is available equally while the
workspace is an ordinary VS Code editor tab or after the whole tab/group is moved
to a VS Code floating window. Native source editors remain first-class and are
not replaced by a webview text editor merely to claim visual uniformity.

Shared shell API must provide registries/services rather than a base viewer with
feature logic:

- Workspace descriptor: stable workspace/type/context IDs, title, identity color
  and text label, supported hosts, required capabilities, recommended layout and
  responsive variants.
- Panel manifest: stable feature/model and panel-type IDs, instance ID, supported
  workspace/context, role, minimum/preferred size/dock, multiplicity, lazy-load
  policy, selection inputs/outputs, actions, tools, Inspector contributions,
  accessible representation, persistence schema, draft/mutation policy and close
  behavior.
- Shared services: selection/context, action registry/dispatcher, focus history,
  layout engine/store/migrations, panel lifecycle, accessibility announcements,
  native-editor bridge, model registry and extension-host mutation coordinator.
- Panel roles are explicit: canvas/preview; timeline; list/browser; Inspector;
  learning/reference; source preview/navigation; Problems/QA/output; build/review.
  A feature may contribute several roles, but each has one canonical model and
  mutation owner.

Recommended defaults preserve the primary work surface; the supplied all-bottom
SFF-style arrangement is supported as an optional preset/user layout, never the
default. Initial recommendations:

- AIR: animation list left; canvas center; Inspector right; timeline bottom;
  learning/source/Problems as tabs or collapsed supporting panels.
- SFF: group/index browser left; sprite canvas center; sprite properties/palette
  Inspector right; metadata/build/Problems bottom. Include an optional named
  `Bottom Tools` preset matching the requested bottom-docked style.
- SND: sound list left; playback/waveform or sound preview center; properties
  right; profile/build/output bottom.
- Palette: palette/library list left; sprite/color preview center; color/slot/
  ACT-order Inspector right; staged plan/build review bottom.
- Move Lab and spatial/helper/projectile tools: component/entity browser left;
  canvas/relationship preview center; contextual Inspector right; source,
  timeline/runtime/Problems bottom as applicable.
- Project Knowledge, QA and Release: identity/filter browser left; selected
  knowledge/test/issue/release content center; relationships/properties right;
  Problems, evidence, history and output bottom. No fictional canvas is required.

Layout resolution is deterministic. An explicitly selected session/named layout
wins, followed by project+viewer override, project general override, user viewer-
type layout, user global layout and the shipped recommended default. Responsive
rules then adapt the resolved layout without rewriting it. Session-only panel
moves remain reversible until explicitly saved. `Reset to Recommended` previews
and activates the shipped viewer recommendation without deleting global,
project, named-layout or favorite data. Action-favorite scope resolves separately
so changing layouts does not silently erase personal shortcuts.

`Return to Main Window` must use a verified VS Code-supported/native command for
the supported product version and offer clear instructions/native menu fallback
when unavailable. The extension API does not give IKEMaker unrestricted ownership
of VS Code windows or a guarantee that it can programmatically move an editor to
an arbitrarily identified main window. Do not fake this by disposing/recreating
the webview, because that risks draft and focus loss.

The best first real viewer after the inert prototype is **AIR**. It exercises the
widest reusable contract in one existing viewer: list, canvas, playback, timeline,
Inspector fields, collision editing, learning/reference, source navigation,
responsive behavior, persisted selection and real dirty/busy state. SFF plus
Palette Workshop is the next and stronger portable-panel proof, but it adds
palette/build/adoption complexity too early. SND alone is safer but would not
prove canvas, timeline or spatial tools.

First AIR integration is deliberately staged:

1. Host one AIR context in the shell using the existing AIR parser/model and
   extension-host session owner. Contribute Animation List, Canvas, Timeline,
   read-only Selection Details/Learning, Source Navigation and Problems panels.
   Playback and selection may work; source mutation remains routed to legacy AIR
   or disabled during the first slice.
2. Prove layout/floating/reload/responsive/accessibility behavior using real AIR
   and SFF data while maintaining one model instance and bounded sprite caches.
3. Add an AIR mutation adapter to the shared coordinator. Move one guarded edit
   path at a time, beginning with explicit frame-field Apply/Revert rather than
   implicit auto-apply. Preserve source fingerprints, VS Code workspace edit/
   Undo, busy state and close recovery.
4. Add collision, action-level and runtime-plan editing only after duplicate-view
   ownership, stale-source rejection and crash recovery pass. Keep the legacy AIR
   viewer available until complete capability and state migration parity.

Legacy toolbar migration rules:

- Inventory every button and map it to primary action, categorized Actions menu,
  contextual tool option, Inspector field/action, panel-local action, context
  menu, keyboard command or Related Work. No button disappears without a route.
- Keep at most five stable recommended primary actions; a transient sixth may be
  Stop/Pause/Resolve Conflict. Playback transport belongs with canvas/timeline,
  view toggles belong in tool options/View, and specialized edits belong in the
  Inspector or Actions menu rather than the Master bar.
- Favorites promote registered actions by stable ID after primary actions and
  use visible counted overflow; they never clone handlers or grant authority.
- Preserve old command IDs as aliases during migration so shortcuts, docs and
  existing links continue working.

Special handling/exclusions:

- Ordinary DEF, CMD, CNS/ZSS and Lua text remain native VS Code editors. They use
  shared commands, colors, navigation, optional native Views and companion shell
  panels; do not place a duplicate editable text surface inside the universal
  shell. Code Structure, recipes, contracts, preview and QA may be shell panels
  linked to the native document.
- Brief file pickers, confirmations, naming prompts and destructive review
  confirmations remain dialogs. Do not convert them into dock panels.
- Runtime IKEMEN game windows, external tools/emulators, OS file dialogs and later
  Phase 2 capture programs are external sessions linked from the shell, not
  internal panels.
- Help may be a learning/reference panel or separate read-only workspace; it does
  not own project mutations. Logs/output may be portable but require bounded,
  virtualized storage and must never become the sole copy of evidence.

Data-loss safeguards:

- One extension-host model/mutation coordinator per project object/context; one
  editable draft owner. Duplicate views are explicit and read-only/synchronized
  until ownership is transferred through revision/conflict checks.
- Moving, docking, tabbing or floating changes only presentation. It never saves,
  applies, discards, transfers edit authority or replaces a source fingerprint.
- Existing autosave/auto-apply behavior is not copied into the shell blindly.
  Pending debounce timers are cancelled or resolved before selection/layout
  transitions, and reload cannot replay a stale edit request.
- Every mutating request carries panel instance, model/context, source revision,
  draft transaction and request IDs. Replies are ignored when stale or disposed.
- Layout/webview state contains presentation only. Drafts, model truth, locks and
  mutation transactions remain extension-host managed with explicit recovery.
- Closing, reloading, moving windows and changing projects run the shared
  fail-closed busy/draft protocol. Serializer restoration never assumes a prior
  view still owns a draft.

Acceptance before SFF migration:

- AIR works as a normal editor tab and in a VS Code floating window with identical
  internal docking. Layout, selection, playback position policy, focus and safe
  panel state survive move, reload and restart; stale playback/timers do not.
- Recommended AIR layout and optional Bottom Tools preset both work. Global,
  viewer and project layouts resolve in documented order; responsive adaptation
  does not overwrite saved layouts; reset affects only the intended scope.
- Wide, medium, narrow and very-narrow modes retain labeled access to animation
  list, canvas, timeline, Inspector, source and Problems without essential
  horizontal-only reachability. Full-page scrolling and resizable canvas/timeline
  push lower content rather than overlay it.
- All drag/snap/tab/resize/collapse/reorder operations have keyboard/menu
  equivalents, visible focus restoration and screen-reader announcements.
- Master bar contains no more than five stable primary actions; categorized
  actions, favorite promotion and overflow remain usable at 200% zoom and narrow
  widths. Identity color is supplemented by text/icon labels and forced-colors
  support.
- Opening the same AIR context focuses the current view without implicit
  reparenting. Explicit duplicate view cannot mutate simultaneously. Transfer of
  edit ownership is reviewed, stale revisions fail closed, and closing either
  view cannot discard another view's draft.
- Native AIR source edits refresh all views. Shell edits use the existing source
  authority and normal Undo, reject external changes, survive supported recovery,
  and never double-apply after reload.
- Hidden panels suspend rendering/playback work; large action/frame lists and
  thumbnails remain bounded/virtualized; repeated lifecycle operations do not
  leak canvas resources, listeners, panels or sessions.
- Existing AIR capability, command, help and state-migration inventory reaches
  parity before the legacy AIR viewer is retired.

Recommended product migration order after AIR acceptance: shell/common native-
editor bridges; AIR; SFF; Palette Workshop as a portable SFF/standalone panel;
SND; shared source/recipe/controller/Project Knowledge panels; Move Lab; Spatial/
Explod; Helper and native Projectile-specific tools; HitDef/Throw/Move Constants;
Stage and Screenpack; Command/Movelist companion tools; project/build/release;
QA/testing/evidence; remaining organizers, intake, story and specialist screens.
Each migrates individually with parity, layout/state migration, accessibility,
recovery and performance gates; legacy surfaces remain until their gate passes.

Migration safety correction from JustNoPoint: **no existing/main IKEMaker viewer
is changed during the first migration phase.** The docking-shell integrations are
parallel experimental workspace versions with new view types and commands. They
reuse read-only/model adapters where this does not change existing behavior, but
the originals retain their current routes, layouts, sessions, autosave/auto-apply,
mutation owners, serializers, settings and defaults untouched.

For the first real AIR slice:

- Add an explicitly labeled experimental command such as `Open AIR Docking
  Workspace (Experimental)` and a distinct WebviewPanel view type/serializer.
  Existing `air.openAnimationPreview`, automatic opening, and legacy AIR panel
  behavior remain unchanged.
- The experimental version begins read-only except for harmless selection,
  playback/view controls and layout customization. Source opening delegates to
  the existing native editor. It must not call legacy mutation messages through
  a second editable surface merely to claim parity.
- Use fixtures or snapshots for shell work where sharing a live legacy model
  would risk two owners. If live model sharing is introduced, it remains one-way
  read-only until the central mutation coordinator and edit-lease protocol pass.
- Provide a comparison checklist/report covering every legacy action, state,
  shortcut, help route, responsive behavior, accessibility flow, persistence,
  performance and mutation safeguard. Record Missing, Equivalent, Improved,
  Intentionally Changed, or Not Applicable with evidence.
- Run the original and experimental viewers side-by-side on disposable fixtures.
  Confirm that opening/closing/reloading the experiment cannot change the
  original's layout, autosave timers, selected state, draft ownership or files.
- No existing command is redirected, no toolbar/button is removed, no setting is
  migrated, and no legacy UI is deprecated until the user explicitly reviews the
  comparison and signs off on the next migration phase. Redirects must remain
  reversible for at least the agreed compatibility window.

This parallel rule applies viewer by viewer after AIR: experimental SFF, Palette,
SND and later workspaces are added beside their originals; each earns migration
approval independently. A successful AIR experiment validates the shell, not the
automatic replacement of other viewers.

#### Selective AIR/SFF panel-decomposition correction — 2026-10-03

Verdict: **APPROVE WITH CONDITIONS.** Universal docking means every suitable
viewer can use the shared shell; it does not mean every subsection becomes a
portable panel. Decomposition is viewer-specific and must improve a demonstrated
workflow rather than maximize panel count. Existing viewers, routes, layouts,
autosave/auto-apply, serializers and mutation owners remain untouched throughout
the parallel comparison phase.

Current stopped-draft disposition:

- `air_docking_workspace.js`: **keep as a seed and rework.** Its reduced Actions
  & Thumbnails purpose matches the feedback and it is read-only apart from source
  navigation. Add actual List / Thumbnails / Combined display modes, current-
  character routing, shared selection synchronization, unsaved AIR refresh,
  bounded/lazy thumbnails, state validation and accessibility. Do not restore the
  discarded duplicate AIR canvas, timeline, Inspector, playback or editing.
- `sff_docking_workspace.js`: **do not register; rework rather than integrate.**
  The draft is one hard-coded three-column page with placeholder tool tabs, not a
  test of portable panel manifests or the shared docking shell. Its disposal
  handler also contains a syntax error, and its archive-index/image assumptions,
  palette-link display and large thumbnail/model payloads need validation. Reuse
  only the harmless read-only model/preview ideas after splitting them behind
  shared services and manifests.

AIR panel manifest:

- `air.actionsBrowser` — one portable, read-only companion panel combining Action
  List and Action Thumbnails. Modes: List, Thumbnails/Grid, Combined. Includes
  filter/sort, action number/name/category/frame count, missing-thumbnail state,
  selected-action marker, Open Selected Source and optional Focus in Main AIR.
- It may dock/tab/float inside the experimental shell or open as a small companion
  workspace. The original AIR viewer continues to own canvas, frame timeline,
  playback, frame fields, collisions, push/runtime tools, palette preview,
  source edits, action edits, Save and every mutation.
- No separate AIR Canvas, Timeline, Frame Inspector, Collision, Playback or Source
  panel is approved at this stage. Reconsider only after a specific clutter or
  cross-workspace need is demonstrated.

AIR default: one Actions Browser panel using Combined mode at normal widths, List
at narrow widths unless the user chose otherwise. Thumbnail grid is an explicit
mode, not a second simultaneous panel. The original AIR viewer remains the main
workspace. An optional small companion layout may place Actions Browser beside
AIR; it does not rearrange the original viewer.

SFF panel manifest:

- `sff.groups` — portable navigation panel: group/category search, counts, marks
  and active group. It emits selection only.
- `sff.sprites` — portable navigation panel: sprite search/filter/review filter,
  bounded thumbnails, marks and active sprite. It consumes group selection and
  emits sprite selection. Groups and Sprites are distinct panels so users can
  resize/stack/tab them, but they form one Browser family.
- `sff.canvas` — primary anchored work surface in the SFF workspace. It owns
  zoom/pan/fit/axis visual interaction and remains central in recommended layouts.
  Do not make it freely portable in the first migration because losing the main
  surface or duplicating canvas resources creates little value.
- `sff.inspector` — contextual right-side panel with tabs/sections for Sprite,
  Review and `What am I editing?` guidance. These share the selected sprite and
  belong together. Guidance may collapse but remains keyboard/search accessible.
  Review remains read-only in the first experiment; later writes use the single
  review mutation owner.
- `sff.displayLayers` — one view-options panel with Display and Layer Preview
  tabs/modes. Both control visualization of the same canvas and do not warrant
  separate portable panels. It never owns source mutations.
- `sff.palettes` — separate portable Palette panel/workspace contribution because
  it has its own list/library, preview, slot/index semantics, draft/staged plan,
  ACT order and eventual build/review lifecycle. First experiment is read-only.
  It must later reuse the one canonical Palette Workspace model and mutation
  owner, never a second embedded palette implementation.
- `sff.relatedAnimations` — separate read-only Related Animations panel because it
  crosses into AIR identity and is useful beside SFF, AIR or source. It selects/
  opens exact AIR actions but does not edit them.
- Shared `problemsQa`, `sourcePreview` and future `buildReview` panels are reused
  rather than recreated as SFF-specific tabs.

Recommended SFF default: Groups above Sprites in a resizable left Browser column;
Canvas centered and dominant; Inspector on the right; Display & Layers as a
smaller right-bottom or tabbed contextual panel; Related Animations and Problems
collapsed/tabbed along the bottom; Palettes closed or available as a right-side
tab until explicitly opened. The optional named **Bottom Tools** preset keeps the
canvas dominant above and puts Groups, Sprites, Inspector/tool tabs, Palettes,
Animations and supporting panels in user-resizable bottom groups. It is never the
default and applying it cannot alter source, selection ownership or drafts.

Current-character/context routing contract:

1. Explicit URI/context passed by an invoking viewer or Related Work action wins.
2. The active IKEMaker workspace's registered project/character/asset context and
   current selection are next.
3. The active native AIR/SFF document is next.
4. A single unambiguous assigned asset in the current character/project may be
   offered with its character name and path.
5. Otherwise show a chooser that highlights the current character's assigned
   asset and permits Browse. Never silently select an arbitrary similarly named
   file.

The original AIR/SFF viewer should expose `Open Actions Companion` / `Open SFF
Panel Comparison` with exact context, but those additions wait for explicit
approval because originals are frozen during the current run. Until then, the
experimental command resolves through the existing authoring-context registry
and an explicit chooser. Serializer restoration revalidates the saved asset and
project/character association; it does not retarget a missing file.

Shared selection/state contract:

- Selection envelope contains schema/version, project ID, character/asset context
  ID, asset URI, selection kind, action or group/index identity, source revision,
  origin view instance and monotonically increasing selection sequence.
- Extension-host selection service owns current context and broadcasts selection.
  Companion clicks request a selection change; the original may follow when open
  and compatible, but no panel steals focus or reparents implicitly.
- Prevent echo loops through origin/sequence IDs. A stale asset/source revision
  yields a refresh-required state rather than retargeting by list position.
- AIR actions derive from the current open document text, including unsaved native
  edits. SFF thumbnails derive from an exact archive fingerprint. Model/cache
  services are shared and bounded; companions do not independently become a
  second editable archive/session owner.
- Layout/webview state keeps display mode, filters, scroll/focus hint and selected
  stable identity for presentation only. The selection service/model revalidates
  them after restore. No mutation/draft authority is stored.

Comparison matrix for each experimental companion/panel records: feature/action;
original route/command; experimental route; Missing/Equivalent/Improved/
Intentionally Changed/Not Applicable; read/write owner; source/selection identity;
keyboard path; screen-reader behavior; wide/narrow/floating behavior; restore/
reload behavior; performance/memory; test evidence; known limitation; and user
decision. Side-by-side testing must confirm the experiment cannot change the
original's selection unless synchronization is enabled, and can never change its
drafts, autosave timers, files, layout or mutation session.

Exact next implementation slice after sign-off: rework only the parallel AIR
Actions Browser. Add current-character resolution/chooser, List/Thumbnails/
Combined modes, stable selection envelope, read-only optional synchronization,
unsaved AIR refresh, lazy/cancelable bounded thumbnails, serializer validation,
narrow layout and keyboard/screen-reader tests. Do not register or continue the
SFF draft in this slice. After AIR comparison acceptance, implement the SFF shell
with only Groups, Sprites, anchored Canvas and read-only Inspector manifests;
add Display/Layers, Palettes and Related Animations in later reviewable slices.

Acceptance/safety gates include: no existing command/source changes; one
experimental panel per asset focuses in place; explicit duplicate remains
read-only; missing/replaced assets fail closed; no stale thumbnail or selection
is applied to another revision; thumbnail decoding is lazy, bounded and suspended
while hidden; filters/modes work at 200% zoom and narrow floating widths; list and
grid use correct accessible roles/names and keyboard movement; thumbnail alt text
identifies the action/sprite; missing previews remain useful text entries; focus
returns after source navigation; reload/restoration cannot mutate or overwrite;
and malformed/large AIR/SFF data cannot create unbounded DOM, memory or message
payloads.

Post–Phase 1 remains responsible for heavier automation, external tracker synchronization, community report intake, networked team roles, advanced duplicate analysis, video comparison and public known-issue publishing. Design stable IDs and privacy boundaries now without implementing those systems prematurely.

### Command authoring quality-of-life checkpoint — 2026-10-04

Fighter Factory is a compatibility baseline, not the feature ceiling. The
Command & Movelist workspace now goes beyond that baseline with searchable and
persistent favorites/recents for commands, native inputs, motion recipes and
glyphs; parser-aware timeline and nested visual-movelist editing; exact internal
clipboards; direct start/end movement; wrapped find navigation; and explicit
absolute/relative conversion and mirroring. A selected-step modifier editor now
adds or removes hold, timed/plain release, exact/consecutive and legacy direction
markers on one selected step or across the whole command as one Undo action,
without rewriting unrelated modifiers, custom parser syntax, or authored
spacing. The expanded controls are grouped by task rather than presented as one
flat strip. An explicit release-counterpart action can also prepare a pending
same-name definition by changing only unreleased final native button atoms; it
never writes or replaces the original until the user reviews and applies it.
Exact same-name source families are also visible beside the editor with direct
Previous/Next navigation, so paired definitions can be reviewed without losing
the broader browser view or treating differently cased names as one family.
The exact current command sequence can now be captured as a named, bounded,
workspace-local custom motion recipe. It reuses the existing search,
favorites/recents and reversible insertion/replacement paths, preserves internal
custom-parser syntax, and can be updated or deleted without changing command
source or the active draft.
Displayed-movelist find now includes case-optional literal Replace Current,
Replace Selected Line, and Replace All. The line-scoped route affects every
exact match on only the explicitly selected visual line and disables itself
when matches exist only elsewhere. All paths preserve untouched markup and mixed
line endings, make one visual Undo entry per operation, and remain draft-only
until reviewed Apply.
Character code diagnostics now treat a literal `command = "name"` or
`command != "name"` reference
missing from the completely resolved character CMD/INP/JNP catalog as a critical
error. Resolution uses the nearest character definitions, unions deliberate DEF
variants to avoid false positives, follows unsaved assigned-command text, and
suppresses the claim when ownership, a dirty DEF assignment, or any assigned
command file is unresolved. The diagnostic links to a non-writing explanation;
it never creates, renames, or rewrites a command automatically.
The same resolved catalog now supplies exact command-name suggestions while the
author is typing inside a literal ZSS or classic CNS command comparison
reference. Suggestions are fragment-filtered and opt-in; comments, unrelated
strings, dynamic expressions, unresolved ownership, dirty DEF assignments, and
incomplete catalogs receive no guessed entries. This prevents many missing-name
errors without introducing an automatic naming or rewrite policy.
Literal command references now also participate in Go to Definition for both
ZSS and classic CNS. The route returns every exact same-name definition in the
assigned catalog, uses unsaved assigned-command text, and fails closed when the
catalog is incomplete; it never guesses among variants or rewrites a reference.
Hovering a resolved reference shows each exact definition's native sequence,
timing, source file, and line, making intentional same-name variants visible
without imposing a preferred routing policy.
Opening Command & Movelist from a caret inside a valid ZSS, classic CNS, ST, or
CMD command reference now selects its first exact same-case definition. Fresh
and reused panels share the owner-safe route; same-name family navigation stays
available, and an unapplied visual command form vetoes an implicit selection
change rather than being discarded.
Nested displayed-movelist editing now adds exact internal **Cut Line** and
**Cut Glyph** actions plus **Replace with Copied Glyph**. Cut captures the
selected byte-exact content and removes it as one visual Undo action; replacement
changes only the selected configured token. These actions remain draft-local,
preserve surrounding markup/separators/mixed line endings, and do not use the
operating-system clipboard or write the DAT until reviewed Apply.
The command timeline's exact internal step clipboard now has matching **Cut
Step** and **Replace with Copied Step** actions. Both retain custom parser text
literally, preserve untouched top-level separators, participate in timeline
Undo as one action, and remain unapplied until the normal reviewed command Apply.
Continue prioritizing reversible, context-aware actions, good empty
states, keyboard parity, and no-op-safe recency over copying legacy menu density.

### ZSS function safety and uncluttered editor checkpoint — 2026-10-04

The first broadened ZSS safety slice now uses one assigned-character function
catalog for call completion, named parameter placeholders, native Signature
Help, hover, Definition, References, guarded rename, and explicit audit
findings. Unsaved assigned ZSS text is authoritative. Dirty DEF assignments,
missing or unreadable dependencies, and unassigned current files make the
catalog incomplete; assistance and missing/arity claims then fail closed rather
than combining same-named functions from unrelated characters. Nested calls and
quoted commas are counted at top-level argument boundaries. Multiple matching
declarations remain visible ambiguity and are never silently selected.

Exact-owner asset assistance now covers literal ZSS AIR, SFF, and SND fields.
Native completion offers only verified assigned AIR actions, character-owned
sound pairs, and direct sprite pairs in recognized fields. A separate stale-
generation-safe Problems collection reports missing literals only from a
complete exact-kind catalog. Unsaved AIR text participates; dirty DEF/SFF/SND,
missing assets, custom-extension ownership uncertainty, dynamic expressions,
comments, strings, and common/F-prefixed references fail closed. This adds no
viewer control and performs no rewrite or asset import.

The next exact-runtime asset checkpoint extends that same catalog—not a parallel
index—to literal CommonFX AIR and SND references. Runtime provenance is limited
to the active fight screen, config `[Common] Fx*`, fight DEF `fx*`, and character
DEF `fx`; viewer-only configured definitions and sound profiles remain tooling
metadata. Unprefixed HitDef sparks/sounds resolve through F, explicit F follows
the character's `fightfx.prefix`, and explicitly typed custom prefixes retain
their source spelling. Completion and missing-reference warnings require the
entire config → motif → fight → CommonFX assignment chain to be clean and the
prefix/kind target to be unique. Dirty or missing controls, binary edits,
duplicate prefixes, negative sentinels, expressions, and unsupported CommonFX
sprite-pair semantics remain silent. The feature uses native completion and
Problems only and adds nothing to asset viewers or menus.

StateDef, map, and variable Definition/References now share the complete
assigned-character catalog used by functions. Map rename is likewise owner-
scoped and refuses incomplete ownership, so same-named symbols in unrelated
characters are excluded from navigation and edits.

Focused sound lifecycle/channel diagnostics now cover only three literal cases
supported by bundled IKEMEN 1.0 documentation: proven endless PlaySnd loops on
an automatic channel, StopSnd channel -1's all-player scope, and ModifySnd
position with an unspecified/automatic channel. Dynamic fields remain silent,
possible same-channel interruption is not guessed, and the findings provide
explanations without fixes or new UI.

The generic controller-form audit found that HitDef and Character Health already
retain unknown/custom fields through their guarded owners. The remaining Code
Structure option-insertion path now creates a byte-local plan using the source's
local EOL, preserves all pre-existing bytes (including comments, duplicates,
custom fields, spacing, and mixed endings), previews the exact insertion, then
revalidates URI, document version, and full text after both input and preview.
It performs one insertion through the existing owner or stops stale; no second
form, command, or mutation path was added.

UI expansion follows the user-approved density rule. ZSS text editors expose one
**IKEMaker ZSS** right-click submenu for secondary browse/insert/safety/tool
actions. Frequent function work stays in native IntelliSense, Signature Help,
hover, Definition/Peek/References, and Problems. Large function/call and symbol
sets reuse the searchable Project Symbols & Contracts browser; no AIR/SFF/SND,
Palette, or other viewer gained duplicate controls. Compact ambiguity and scope
choices remain candidates for native searchable dropdowns. This placement rule
also governs later asset-aware completion, dependencies, examples, allocation,
controller forms, diagnostics, and refactor previews.

The same browser now exposes literal forward and reverse function dependencies.
Each function can show exact functions it calls plus the Function or StateDef
scopes that call it, with source links to the actual call sites. Relationships
retain assigned/unassigned provenance and ambiguity status, remain read-only,
and explicitly do not infer dynamic or unparsed calls. This expands tracing in
the existing large-list surface instead of adding buttons to any viewer.

Advisory literal ID allocation also lives in that browser. The user chooses the
independent Helper, Explod, or Projectile namespace and a starting number;
IKEMaker reports the first unobserved literal candidate without inserting or
reserving it. Unresolved ownership, read failures, and dynamic ID expressions
remain visible limitations, so the tool never presents a partial scan as a
collision-free allocation.

The existing rename-impact preview is now source-revision guarded. Its index
captures each source hash, rereads the current document for the report, and
marks every occurrence from a changed file as refresh-required even when the
token at that one location still happens to match. Unresolved ownership and
read failures are disclosed as partial scope. The preview remains read-only and
has no Apply path.

The first contextual-assistance checkpoint is deliberately Manual-only. One
action in the existing IKEMaker ZSS submenu recognizes a bounded set of literal
contexts, searches the existing catalog/intent aliases, and explains every
suggestion. It reuses Favorites, Recents, Recipes, and Examples; it does not
create a second recommendation library. Comments, strings, and uncertain
contexts return no suggestions. Project/reference entries require prior explicit
Favorite or Recent history. Any chosen insertion goes through the established
catalog command only after the exact URI, document version, and selection are
revalidated; browsing stays non-writing. Automatic mode remains deferred.

Safe working-example adaptation is now founded only on the existing Personal
Example Shelf. A current or uniquely moved exact pin may receive user-authored
function/state/map/AIR/SND/SFF parameter roles tied to explicit, non-overlapping
byte occurrences. Choices come only from complete exact-owner catalogs. The
adapted text is literal—not a SnippetString—so dollar signs, escapes, mixed EOL,
and custom syntax survive. Exact preview plus source, owner-assignment,
destination URI/version/text/grammar, and cursor revalidation precede one
unsaved Undoable insertion through the established catalog owner. No placeholder
is inferred, no dependency is imported, and unverified bundled example packs
remain reference-only.
### Unified floating viewer workspace direction — 2026-10-03

- Adopt the AIR-style `WebviewPanel` as the standard outer host for viewers that
  may remain tabbed in VS Code or move into a native floating VS Code window.
- Build viewer features as internal, identity-colored dockable panels. For the
  SFF workspace this includes Sprite, Palettes, Review, Display, Inspector,
  animation/layer preview, and related tools rather than permanently crowding
  one fixed screen.
- Apply the same architecture across AIR, SFF, SND, code, DEF/CMD, labs, and
  special workspaces where it improves focus without fragmenting the data model.
- Combine internal panels with the Master Authoring Bar: no more than five
  primary actions remain visible, long-tail actions live in categorized toolbar
  menus, and favorites may promote chosen actions back to visible buttons.
- Every floating workspace must expose Return to Main Window, always keep every
  panel reachable at narrow widths, preserve validated layouts, and treat docking
  as presentation only. It must never duplicate draft ownership or mutation
  authority.
### AIR Actions Browser approval transition

- During comparison, retain the existing embedded AIR action list and action-management controls.
- After complete user sign-off, remove that embedded duplicate from the main AIR viewer. The portable AIR Actions Browser becomes the single owner of action navigation and management.
- The portable browser must remain restorable through the shared panel/tab restore controls and may be docked back into the VS Code window; it must not exist twice at once.
- After sign-off, opening the AIR viewer should automatically open the Actions Browser as a compact floating auxiliary window matching the approved test dimensions, initially pinned always-on-top where the host exposes a reliable native command.
- Preserve user-adjusted auxiliary-window placement and dimensions when VS Code supplies persisted bounds; use the approved compact dimensions as the first-open fallback rather than a Windows-only coordinate hack.

### Phase 1 SFF checkpoint — portable SprMake2 recipe intake — 2026-10-08

- The shared SFF Creator can now start from a portable reviewed CSV manifest or a SprMake2 DEF package as well as loose PNG, folder, GIF, PSD, sheet, replacement, deletion, duplicate, and saved Creator-plan routes.
- CSV and DEF intake preserve physical row order, exact group/index, signed axes, legacy autocrop, duplicate policy, source bytes, and recipe/row provenance before converging on the ordinary Creator conflict and final review.
- Recipe selection authorizes only files contained inside the selected portable package. Parent-path escape, unavailable sources, non-indexed PNGs, invalid bounds, and changed declared hashes stop the entire intake without partially changing the retained draft.

### Phase 1 SFF checkpoint — deterministic recoverable folder intake — 2026-10-08

- Add PNG Folder now asks whether the selected folder alone or its contained subfolders are in scope. It never silently broadens that choice.
- Files enter Creator in deterministic natural relative-path order. Symbolic links and junctions inside the selection are not followed, and real-path containment is rechecked before bytes enter the cache.
- File-count, traversal-entry and recursion-depth limits fail the entire intake with an explanation. Loose files, prepared images, sheets, GIFs and PSDs use the same no-silent-truncation merge rule.
- Every PNG is structurally and CRC validated before the first cache write. Accepted bytes receive immutable project-local working copies with original folder, relative path, source hash, batch hash and order provenance, so a retained draft remains usable after restart even if the original folder moves.
- If any reviewed source or cached working copy later disappears or becomes invalid, recovery retains that exact row, ownership identity and override as an unavailable blocker. It does not silently reinterpret the draft as a smaller batch.
- Exported Creator plans reopen only explicit, contained project-relative hints. Raw absolute/external paths are not read from imported JSON; they remain unresolved with original-path provenance. Escapes, linked paths, unexpected file types, duplicate source/palette identities and orphaned overrides fail the entire import.
- Portable plans also retain the exact reviewed mutation set: deletion and replacement rows cannot be duplicated, malformed, out of range, absent, ambiguous, protected, or silently discarded; source, palette and target SHA-256 identities are mandatory, and orphan path hints or palette rows stop the entire import.
- Retained local drafts use the same no-silent-shrink rule. Recovery quarantines malformed or repeated source, override, palette, deletion, replacement, filename-rule and reserved-range data, carries that blocker through later normalization/webview cycles, and refuses Apply or portable re-import until the damaged draft is discarded or recreated from intact reviewed inputs. A fully quarantined zero-row draft remains visible in Recovery Center, displays its blocker in final review and keeps Discard enabled.
- The preserved text-manifest route also rejects the whole reviewed deletion if any physical selection is stale, repeated, absent from the manifest, duplicated in the manifest, or ambiguous because the active SFF repeats that group/index. It never removes only the surviving subset.
- **Relink Marked Source…** repairs one changed/unavailable row only when the chosen PNG has the exact reviewed SHA-256. It copies those bytes into project recovery storage and retains destination, axis, crop, palette, sharing and placeholder ownership. Different artwork must enter as a new source review.
- Physical IKEMEN runtime/platform testing remains outstanding and built-in writer adoption remains disabled.
- Direct DEF intake supports explicit `sprite.usepal = -1` and arbitrary per-row stored ACT palette assignments. Every used `[Pal]` row is contained inside the selected package, hash-bound, normalized from an explicitly declared `pal.reverseact`, restricted to a lossless full `0,255` table and retained in the backend-neutral specification; regenerated SprMake2 option blocks restore each assignment. Unused `[Pal]` rows are reported but not imported. Partial ranges, missing or changed tables, duplicate IDs, collisions and undeclared table order fail closed. The preserved SprMake2 text workflow remains available.
- Creator List mode exposes each retained stored-palette assignment for deliberate per-row review or reassignment. The contact sheet and full axis/crop preview render the effective imported or target-SFF table, with palette identity/hash included in thumbnail cache identity, instead of displaying the PNG's embedded colors when SprMake2 or the built-in specification will use another table.
- Built-in writer adoption remains disabled. This intake depth does not replace the physical Windows/Linux IKEMEN runtime certification gate.

### Phase 1 SFF checkpoint — per-sprite duplicate policy — 2026-10-08

- Creator List review now exposes a duplicate-data choice per source, and **Review Exact Duplicate Groups…** applies one reviewed choice to each hash-verified group without changing sprite identities.
- Create Package Only preserves mixed independent/share choices per physical sprite in the immutable backend-neutral specification and mapping.
- SprMake2 remains the primary supported executable route whenever one global choice represents the plan. If choices are mixed, the package contains a clearly labelled review preview and explanation instead of a runnable `sprmake2.def` or `build.cmd`; execution rejects the package again before spawning anything.
- Built-in SFF adoption remains disabled. Mixed-policy specifications are ready for the already-tested writer semantics, but they do not bypass physical runtime/platform certification.

### Phase 1 SFF checkpoint — pre-release dual-verified built-in default — 2026-10-08

- The historical adoption-disabled notes above remain the record of the certification stages that produced the current writer. For the owner's pre-release sprite work, Creator now makes **Build Both · Apply SprMake2** the primary action.
- The in-house writer runs first and passes the canonical strict profile. SprMake2 then rebuilds the identical frozen specification in a separate private location and passes its narrower named compatibility profile. The pure comparison authority requires equivalent physical order, identities, axes, decoded indexes, effective palette colors, assignments, dimensions and link resolution.
- The comparison report binds both exact candidate hashes and records the build order. Only a second explicit confirmation may atomically apply the already-compared SprMake2 bytes to the ordinary target filename. Failure, mismatch, cancellation, target drift, or temporary-palette lifecycle drift updates nothing and retains the Creator draft.
- The independently validated IKEMaker candidate is retained as an immutable backend-and-hash-named SFF in the reviewed package. SprMake2 updates the ordinary target SFF rather than creating a second labelled copy, producing one known-good active archive and one directly loadable new-writer test archive from the same specification.
- **SprMake2 Only · Build & Apply**, **Compare Both · No Adoption**, **Create Package Only**, existing-output validation, imported SprMake2 recipes, and the legacy editable-text workflow remain available. SprMake2 has not been removed or hidden.
- This is a guarded author-testing default, not release certification. Real IKEMEN render/load checks and the remaining Windows/Linux matrix are still required before the built-in route becomes an ordinary release default.

## External studio design-study ideas — 2026-10-11

Status: backlog inspiration only. The reviewed third-party archive and unpacked
files were deleted by the user after a static documentation, screenshot, sample,
and decompiled-code study. IKEMaker must not depend on those files, copy their
implementation or assets, reproduce their wording, or assume their undocumented
behavior is correct. The suite's own license was not established. Claims may
still be useful product ideas, but an unverified claim must remain labelled
**inspiration requiring an IKEMaker design and tests**, not a verified feature.

This study does not change the current priorities: finish and physically test
the SFF v2+ writer path first; keep Palette Workshop as its own subsequent goal;
and preserve the existing Stage, Screenpack, Lifebar, AIR, SND, code-viewer,
browser, toolbar, transaction, and source-authority architecture. Do not create
five separate monolithic studio applications or import another UI system.

### Shared reviewed conversion plan

- Add an optional reusable **Conversion Plan** browser for Stage, Screenpack and
  Lifebar work. The plan selects an exact target engine/profile, localcoord or
  aspect preset, fit policy (preserve aspect, stretch, preserve coordinates),
  offsets, SFF output version, and the specific asset categories in scope.
- Show a filterable before/after table for every field IKEMaker proposes to
  change, including source file and line, old value, new value, conversion rule,
  confidence and owning viewer. Group camera, player, background, portrait,
  font, animation, BGCtrl, menu/select, sound and other specialist fields without
  flattening unlike values into one generic property grid.
- Enumerate untouched or unknown coordinate-bearing fields explicitly. A file
  containing syntax that IKEMaker cannot safely transform must never emerge as
  an apparently complete conversion with silently mixed coordinate systems.
  Let the user exclude, override or stop after reviewing the limitation.
- Preview is non-writing. Apply uses the existing exact-source authority,
  stale-source checks, transactional writer, Recovery Center and Undo model.
  Default to a reviewed new destination folder; writing over a source requires
  a separately visible choice and an exact impact summary.
- The plan should be reusable from the specialist viewer body, toolbar dropdown
  and Authoring Browser. It must not add shifting buttons to the universal quick
  strip or create a second editor/draft owner.

### Engine compatibility inspector

- Create one filterable compatibility page in the Authoring Browser, fed by the
  existing project graph and each specialist validator. Cover WinMUGEN, MUGEN
  1.0, MUGEN 1.1, IKEMEN GO 1.0 and explicitly selected Nightly capabilities;
  do not infer Nightly merely because an extension understands its features.
- Report error, warning, approximation and information separately. Include SFF
  version/truecolor/alpha constraints, AIR transforms and interpolation, layer
  or player-count limits, font formats, sound limitations, Tag/Simul/Turns
  layouts, camera/parallax/render differences, unknown keys, localcoord and
  selected runtime capability.
- Every item needs an exact source jump, plain-language reason, target profile,
  affected output and explanation of why an action is disabled. Compatibility
  claims derived only from documentation remain distinct from physically tested
  engine certification.
- Encode valid engine/SFF/output combinations. Fail closed on an incompatible
  combination rather than relying on a note asking the user to keep independent
  selectors aligned.

### Conversion manifest and recovery evidence

- Every applied conversion should emit or retain a machine-readable manifest
  through the existing history/evidence system: source and target hashes,
  selected transform policy, writer/backend and version, ordered write set,
  copied dependencies, skipped/unknown fields, warnings, backups/recovery
  location, and previewed versus physically tested status.
- Provide a concise human-readable summary beside the full evidence. Users
  should always know the difference between **Save project**, **Apply conversion**,
  **Export copy**, **Build assets**, and **Launch preview** before a write occurs.
- A multi-file operation must stage and validate the entire destination set
  before replacement. Partial success, destination drift, cancellation or a
  failed dependency copy leaves the authoritative project unchanged and keeps
  the reviewed plan recoverable.

### Disposable physical-preview recipes

- Extend existing launch controls with optional disposable preview recipes for
  Stage, Screenpack and Lifebar outputs. Copy or link only a reviewed manifest of
  required engine files into an isolated temporary root; never rewrite the
  selected engine installation or source project to prepare a preview.
- Record the canonical user-selected executable, detected/selected engine
  profile, exact arguments, staged files and hashes, runtime logs, screenshots
  when requested, outcome and cleanup status. Keep preview approximation and
  real-engine validation visibly separate.
- Do not accept a project-controlled executable or raw command line. Use strict
  argument construction without a shell, root containment, timeout, cancellation,
  process-tree cleanup and disclosed retained evidence. Missing cleanup should
  appear in Recovery Center instead of being silently abandoned.

### Palette reduction review for Palette Workshop

- When the separate Palette Workshop goal begins, include an original/result
  comparison with per-image selection, zoom/pan parity, palette/index preview,
  dither toggle, alpha threshold, optional matte/background compositing and an
  estimated color-error summary. Offer contact-sheet review for batches.
- Reduction is opt-in, copy-on-write and independently reversible per asset.
  Preserve immutable originals and explicit master-palette/index authority;
  never silently quantize truecolor or alpha data because an older output format
  was selected.
- Allow a reviewed batch policy while preserving per-image overrides. Show the
  effective palette, transparent index, index remapping and any shared-palette
  consequences before Apply. Feed accepted results through the already planned
  SFF Creator and Palette Workshop handoff rather than a separate image editor.

### Verified recipe and sample gallery

- Add optional recipe cards to the existing Authoring Library/Browser for common
  engine/aspect conversions, stage camera setups, screenpack/select layouts,
  lifebar layouts, palette reductions and later font workflows. A card states
  its source profile, target profile, prerequisites, expected result, known
  approximations, exact files it creates and certification level.
- **Copy into project** is a reviewed transaction with collision detection,
  destination preview, hashes and Undo/recovery. Recipes must use IKEMaker-owned
  or appropriately licensed minimal fixtures; do not bundle third-party sample
  characters, artwork, text or reverse-engineered implementation.
- Let users save their own reviewed conversion settings as named presets without
  presenting a successful result in one project as universal engine proof.

### Compact reusable timeline and thumbnail primitives

- Record the useful interaction concepts for later reuse rather than migrating
  a standalone Storyboard editor: AIR-frame thumbnails, tick seeking and
  snapping, clip start/end handles, interpolation visibility, audio cues,
  background/BGCtrl hierarchy, layer visibility and missing-asset thumbnails.
- Reuse these primitives inside AIR, Stage and SND bodies or their browser views
  only where they improve an existing workflow. Keep the current owner of source
  and drafts. Do not add an always-visible giant timeline, horizontal-only
  navigation, nested modal editors or another Storyboard goal through this note.
- Timeline/list navigation should follow the established arrows, bounded slider,
  range/readout, keyboard, cards/list modes, virtualization and optional panel
  layout rules shared by IKEMaker viewers.

### Lua dependency and generated-package inspection

- Expand the generated-code authority with a browser view for Lua dependencies,
  imported folders, generated scenes/modules, hook registrations, compatibility
  targets and the exact output package. Show a dependency graph, collisions,
  source/generated provenance and a reviewed artifact preview.
- Generated hooks require namespaced IDs, version/capability gating, canonical
  in-root destinations, content hashes, explicit load/unload or reload behavior,
  recovery and a native-source fallback. Avoid global `package.path` mutation,
  unrestricted `dofile`, project-controlled executable paths and unversioned
  fixed hook strings.

### Later optional font workshop

- Backlog a separate optional Font Workshop after higher-priority SFF and Palette
  work: glyph-order text intake, sheet slicing/preview, test-string preview,
  old FNT and Font v2 inspection, D0/D4/localcoord conversion, palette banks,
  merge/import, missing/duplicate glyph checks and output compatibility.
- Treat Unicode and TrueType behavior as capability-dependent and preview-only
  until tested in the selected engine. Keep this as another cohesive viewer/body
  and browser specialization, not another executable or permanent toolbar row.

### Optional player and layout preview profiles

- Later Screenpack/Lifebar work may support named preview profiles for P1-P8,
  character and portrait fixtures, portrait group/index, Single/Simul/Turns/Tag
  layouts, side/team state, missing-asset markers and arbitrary localcoord.
- Profiles are test inputs only. They do not alter source character assignments,
  imply all modes are supported by the selected engine, or turn sample rendering
  into physical certification.

### Explicit patterns not to adopt

- Do not reproduce dense fixed three-column desktop layouts, tiny controls,
  giant undifferentiated property grids, nested scrollbars, horizontal-only
  reachability, modal-editor chains or many same-weight buttons.
- Do not mix universal navigation/save/run actions with specialist actions in a
  shifting toolbar. Keep the stable universal strip; place owner-specific tools
  in the viewer body and categorized dropdowns, with browser overflow as already
  established across IKEMaker and IKEMiner.
- Do not maintain separate duplicated parsers, writers, engine settings, asset
  stores or preview logic for Stage, Screenpack, Lifebar, Font and Storyboard.
  Shared contracts and specialist adapters must remain the authority.
- Do not use monolithic JSON files with large embedded binary assets as the only
  editable project format. If portable packages are later useful, use a bounded,
  versioned manifest with independently hashed blobs, streaming/size limits,
  partial-recovery evidence and transaction-safe staging.
- Do not treat documentation claims, embedded PASS strings, internal self-tests,
  approximate previews or round-trip through the same reader/writer as independent
  engine certification. They may guide test design but must remain labelled with
  the evidence they actually provide.
# Palette Workshop post-source certification

- Palette Workshop Slices 1–10 are implemented and source-tested. Keep release state at **physical-pending** until the human test matrix is recorded; source tests must never promote it to physical-passed.
- Physically test SFF 2.0 and 2.1 palette preview/add/insert/replace/export/build comparison, exact SFF ↔ Palette Workspace and AIR ↔ Palette Workspace return, stale/ambiguous fallback, temporary placeholder owner removal and reviewed cleanup, named-group gallery append/update round trips, interruption recovery, and final build adoption.
- After physical signoff, review the certification ledger evidence and only then decide whether Palette Workshop is release-ready. No physical evidence was created during source implementation.

## External-tool update follow-up — orbital assistance and CPU authoring

Source: a 2026-10-12 community report says another MUGEN/IKEMEN authoring tool
added English-language support, orbit-calculation assistance, and AI-assisted CPU
creation. Treat these as useful product ideas, not verified capabilities or
evidence that the other implementation is correct. Do not run or depend on the
external program to implement this backlog.

Follow-up demonstration: https://x.com/stgfullpower/status/2109666938167431401
shows a short orbit-authoring workflow with a live stage preview, repeated
ghost/onion positions along the path, a visible curved trajectory, a synchronized
timeline/keyframe strip, editable side inspectors, and immediate playback around
the reference fighter. Preserve these as concrete interaction references only;
the video does not establish generated-code correctness or runtime parity.

Deferred acquisition note: obtain this newer English-capable release later for
comparative research. Do not download it as part of the current work. When the
user authorizes acquisition, use the official published source, record the URL,
release/version, timestamp, size, and cryptographic hashes, then scan the exact
archive with Windows Security and reputable multi-engine results before any
extraction. The earlier package was reported as
`Trojan:Script/Wacatac.B!ml`, so begin with static/archive inspection in an
isolated research directory and keep it outside IKEMaker, IKEMiner, game, and
character trees. Never execute the program, installer, scripts, or bundled
binaries without a separate explicit decision after the scan and inspection
results are reviewed. Preserve useful feature claims and UI ideas independently
of whether the package is ultimately trusted or run.

### Reusable Orbit / Trajectory Assist

- Add a compact **Orbit Assist** mode to the established Move Lab, Helper Lab,
  Explod/Spatial Composer, native Projectile tools, and applicable stage and
  screenpack element inspectors. Use the same trajectory model and preview
  service everywhere; do not create a different orbit calculator in each viewer.
- Let the author choose the real owner and anchor explicitly: root, parent,
  helper, P1, P2, screen, camera, stage point, or an authored expression. Keep
  local, owner-relative, world, and screen coordinates visibly distinct. Never
  guess Helper, Explod, or Projectile semantics from appearance.
- Support circle and ellipse radius, starting phase, direction, angular speed,
  duration, center offset, axis tilt, clockwise/counter-clockwise travel, finite
  arcs, loops, spirals, and optional easing. Allow X/Y formulas or sampled
  positions to remain authoritative when they cannot be represented by the
  simple controls.
- Show the path, center/anchor, current point, facing, velocity vector, sprite
  bounds, collision boxes, and optional owner/P2 reference on the shared spatial
  canvas. Provide the standard arrows, slider, tick/frame stepping, play/pause,
  onion/ghost positions, Fit, and exact numeric inspector without adding a
  permanent crowded toolbar row.
- Keep canvas selection, numeric properties, timeline/keyframes, and playback on
  one shared selection and playhead. Selecting a ghost/path point should select
  its tick and editable values; stepping or scrubbing the timeline should update
  the sprite, path marker, vectors, boxes, and source-linked inspector together.
- Let authors control ghost density and path sampling independently of the real
  simulation tick rate. Dense visual samples must not silently emit extra states,
  controllers, or keyframes, and overlapping ghosts need a visibility/opacity
  control so complex loops remain readable.
- Offer a reviewed **fit orbit from samples** operation for captured or manually
  placed points. Report residual error and ambiguous/non-orbital segments; keep
  the original samples and allow piecewise orbit/linear/keyframed sections. A
  visually similar curve is not proof of the source game's original formula.
- Preview pause, hit-pause, time scaling, facing changes, camera motion, bind
  loss, owner removal, round reset, and off-screen behavior where the selected
  controller actually supports them. Preserve target engine/version and
  localcoord assumptions in the proposal.
- Output readable CNS or ZSS expressions through the existing exact source
  mutation owner. Show generated formulas, constants, initialization, update,
  cleanup, and every affected source block as one reviewable diff. Opening or
  adjusting Orbit Assist is zero-write; stale source, unresolved ownership, or
  unsupported engine syntax blocks Apply.
- Save reusable named trajectory presets as metadata with units, coordinate
  space, engine capability, and provenance. Presets never silently impose the
  current project's group IDs, helper IDs, maps, variable ranges, or coding
  conventions on another project.
- Connect the assistant to IKEMiner's character-owned companion reconstruction:
  trace-derived following/orbit/easing patterns can arrive as local, confidence-
  labelled proposals, while IKEMaker remains the final preview/review/apply
  owner. This extends the already logged BB Hood companion fixture naturally.
- Keep the UI cohesive: an owner-specific quick action may appear inside the
  relevant viewer body; complete options live in its contextual dropdown and
  browser overflow. The universal header, destination colors, source return,
  draft recovery, keyboard access, and compact/responsive rules remain unchanged.

### Optional CPU Behavior Workshop and assistance

- Add a later **CPU Behavior Workshop** as a cohesive code/Move Lab companion,
  not a one-click character generator. Its deterministic non-AI workflow must
  remain fully useful: authors define behavior goals, ranges, prerequisites,
  command/state choices, resource and map conditions, difficulty scaling,
  reaction delay, commitment, cooldown, randomness, and deliberate mistakes.
- Build an exact project inventory first: existing commands, StateDefs/functions,
  transitions, HitDefs, movement, projectiles/helpers, meters/maps, guards,
  cancels, invulnerability, recovery, and engine/version capabilities. Missing
  or misspelled command references are critical diagnostics because they can
  break or crash supported runtimes; assistance must never invent an unavailable
  command and quietly emit it.
- Present authored CPU logic as a readable decision graph/table linked to the
  exact source ranges. Support named tactical profiles such as neutral, pressure,
  anti-air, defense, punish, zoning, resource use, and recovery without claiming
  those names are universal standards. Let profiles share reviewed rules rather
  than duplicate opaque code.
- Provide scenario-based preview and diagnostics using configured training/dummy
  fixtures: distance bands, corner/air/ground state, meter, life, team mode,
  projectile presence, hit/block outcome, and difficulty. Report unreachable
  rules, contradictory priorities, dead transitions, infinite loops, illegal
  inputs, nonexistent states/commands, unsafe controller targets, impossible
  conditions, and behavior that reads unavailable information.
- Optional AI support is packaged off by default, provider-neutral where
  practical, and privacy-controlled. Local/static analysis and templates remain
  the baseline. An enabled provider may explain behavior, propose priorities,
  translate a plain-language tactic into a draft, or compare observed play with
  intended rules, but it cannot write directly, mark its own result validated,
  or replace engine/runtime testing.
- Every generated suggestion records provider/model or local-engine identity,
  prompt/input scope, source hashes, engine target, confidence/limitations, and
  accepted/rejected edits. Never upload proprietary character code, captures, or
  project data without an explicit per-provider disclosure and user approval.
- Generated CPU code flows through the normal code viewer with syntax checking,
  command/state reference validation, diff review, Undo, Save, and stale-source
  protection. Preserve conventional text-only editing and hand-written AI as
  first-class choices; the first-run viewer preference continues to govern
  whether visual companions open automatically.
- Keep runtime evaluation separate from source plausibility. Source checks can
  certify structure and references; only recorded engine matches can validate
  actual timing, fairness, difficulty, performance, and behavior. Label imported
  matches and observations as evidence rather than training truth.

### Suggested order and acceptance boundary

1. Implement the deterministic shared trajectory model and read-only orbit
   preview with fixtures before any code generation.
2. Add reviewed CNS/ZSS proposal output and exact-source handoff, then physically
   test one Helper, one Explod, one native Projectile, and one stage/screenpack
   element at multiple localcoords and facing directions.
3. Build the deterministic CPU inventory, diagnostics, and decision-table editor
   before connecting any AI provider.
4. Add optional provider adapters only after proposal provenance, privacy,
   cancellation, offline fallback, and generated-code safety tests pass.

Acceptance requires compact/cohesive installed UI testing, keyboard and screen-
reader access, draft/reload recovery, exact owner/source preservation, no direct
asset writes, readable generated code, correct stale-source blocking, and real
IKEMEN runtime evidence. This entry is backlog scope only and does not authorize
an implementation, extension install, network upload, or change to active game
assets.

### Orbit Assist source checkpoint — 2026-10-15

- Implemented one shared, UI-independent trajectory model for circles, ellipses,
  arcs, spirals, explicit ownership, coordinate spaces, facing, easing, and
  bounded opaque formulas. The canonical model stores radians; the reviewed
  IKEMEN/MUGEN expression boundary converts angles to the engine's degree-based
  `Sin`/`Cos` triggers.
- Implemented one read-only preview contract with exact playhead ticks, arrows,
  slider, play/pause, path and independently bounded ghost density/opacity, Fit,
  pan/zoom, velocity, sprite/collision geometry hooks, and numeric inspection.
  Preview sampling cannot alter emitted timing.
- Implemented a cohesive Orbit Assist workspace using the universal toolbar and
  the existing viewer surface registry. It is reachable from the nested text
  toolbar, viewer dropdowns, IKEMEN Tools, editor context/title menus, and the
  Command Palette without adding a permanent toolbar row.
- Implemented bounded Move, Helper, Explod, Projectile, Spatial, Stage, and
  Screenpack adapter contracts. Public launches are host-classified. Stage and
  Screenpack remain preview-only; non-Spatial character adapters also fail
  closed until their specialist viewer supplies a proven owner/source route.
- Implemented reviewed CNS/ZSS `PosSet` proposals for the currently proven
  stable-1.0 Spatial route. Formula, non-linear easing, unproven coordinate
  conversion, unproven ownership, uncertain engine capability, and missing
  mutation authority block source emission instead of guessing.
- Insertion is a single native unsaved edit guarded by assigned-source identity,
  assignment-set fingerprint, URI, document version/hash, cursor, generation,
  proposal digest, artifact ID, target ID, and an immediate final recheck. The
  webview cannot submit filenames, ranges, source text, generated code, hashes,
  or owners.
- Source test checkpoint: trajectory/unit, preview, proposal, adapter, workspace,
  generated-code authority, universal-toolbar, viewer registry/dropdown, text
  toolbar, activation, accessibility, and UI command audits pass. This is not
  installed or runtime evidence.
- Still physical-pending: installed layout and keyboard/screen-reader behavior,
  source-linked sprite/AIR/collision population, actual CNS/ZSS engine syntax and
  motion timing across localcoords/facing/pause/hit-pause/camera/owner loss, and
  specialist Helper/Explod/Projectile/Move plus Stage/Screenpack mutation
  contracts. Presets, fit-from-samples, keyframed/piecewise paths, recovery, and
  IKEMiner trace handoff remain later slices.

## Coding safety checkpoint — live assigned-function diagnostics

- Source implementation now has a bounded, owner-scoped live Problems path for
  missing project-owned ZSS functions, unique-signature argument-count errors,
  and ambiguous authored declarations. It remains read-only and offers no
  automatic rewrite or placeholder generation.
- The diagnostic authority is the exact character DEF and its assigned ZSS
  graph. Dirty/unresolved ownership, missing or unsupported dependencies,
  unreadable input, and file/byte/record bounds fail closed and clear obsolete
  claims rather than mixing similarly named functions from another character.
- Every source requires a bounded reverse DEF-assignment proof across its
  declared authority domain: game character roots, workspace roots, configured
  project/template roots, ancestor evidence, workspace discovery, and open DEF
  documents. Zero owners, multiple owners, dirty ownership evidence, unreadable
  roots, or an exhausted traversal bound remain silent even when a retained
  viewer context suggests one character. Canonical paths and contained symlink
  traversal prevent duplicate or escaped-root ownership claims.
- The canonical DEF assignment index is cached by declared authority-domain
  roots and generation, shared by builds, validation, and multiple open callers.
  Relevant DEF document events, DEF filesystem watcher events, and map-registry
  invalidation advance the generation. Unchanged validation rechecks only the
  indexed assigning DEFs and open DEF evidence rather than walking `chars`
  again; unrelated sprite/audio files are neither read nor counted.
- Live diagnostics dynamically own canonical, deduplicated `**/*.def` watchers
  for every declared authority-domain root, including game/project roots outside
  the VS Code workspace. Root count and watcher creation are strict authority
  gates: the 64-root limit applies cumulatively across retained project contexts,
  and an unwatched, unresolvable, or over-budget root suppresses live findings
  before another watcher is created. The first watcher installation invalidates
  the pre-watch ownership scan and permits exactly one rebuild under active
  coverage; a changed root set on that rebuild fails closed. Create, change, and
  delete events invalidate the shared index before caller refresh; all dynamic
  watchers dispose with the diagnostic registrar.
- Document and dependency generations, versions, and content fingerprints are
  rechecked before publication for the DEF and every assigned code candidate,
  including CNS, CMD, ST, INP, JNP, and explicitly classified text sources. A
  declaration, support-code, or DEF change refreshes all open ZSS callers, while
  older asynchronous work cannot overwrite newer results.
- Workspace Audit now delegates these three findings to the single live
  diagnostic owner, preventing duplicate Problems entries while preserving
  full-audit coverage and counts. Function-order and duplicate-declaration
  checks remain explicit audit findings.
- Source-level lifecycle, dependency, race, bound, and audit-deduplication tests
  are included. Installed-extension behavior and real-character validation stay
  physical-test pending before release sign-off.

## Coding safety checkpoint — StateDef transfer integrity slice 1

- Source now includes one bounded grammar-specific ZSS/CNS StateDef parser for
  literal declarations and exact-range ChangeState, TargetState, SelfState, and
  Helper `stateNo` roles. Balanced ZSS controller braces and CNS sections are
  parsed with comments and strings masked. Dynamic expressions remain metadata;
  they are never guessed, replaced, or reported as a missing literal state.
- Runtime semantics and provenance for this slice are pinned to IKEMEN GO
  `develop` commit `b464672651c87c42aeca10bb5c33003f26d42071`:
  ChangeState follows the current StateBytecode player owner; SelfState uses the
  recipient's own/readplayerid state ownership; TargetState uses the current
  state owner except that containing StateDef -2/-4 executes against the
  executor's own/own-player state catalog; redirected Helper execution
  uses the helper recipient's ownership; `stateChange1` logs negative transfers
  and clamps the destination to zero or above.
- The complete catalog proves the existing exact character owner and preserves
  engine compile order: assigned character `st*`, CMD, stcommon, then
  `save/config.ini` `[Common] States*`. Engine-root searches and legacy `.zss`
  fallback are recorded. First positive declaration remains the runtime winner,
  while navigation exposes every exact duplicate candidate for review.
- The state catalog reuses the function ownership cache and its canonical DEF
  watcher set. It does not scan the roster or install authority-root watchers a
  second time. A first watcher installation forces one catalog rebuild under
  active coverage; an unstable root set, dirty DEF/config, missing or unreadable
  dependency, stale version/hash, or exhausted file/byte/record bound fails
  closed. Unsaved assigned code text remains authoritative while unchanged.
- Live Problems now reports missing states only for proven, unredirected,
  nonnegative literal ChangeState/TargetState destinations; reports recognized
  negative transfer literals; and reports same-file duplicate StateDefs as a ZSS
  error or legacy CNS warning. SelfState, Helper, HitDef, dynamic, redirected,
  and unproven references do not receive speculative missing-state findings.
- Explicit Workspace Audit awaits the live state owner for coverage and counts;
  it does not republish those findings through the general diagnostic
  collection, so Problems retains one owner per state-integrity finding.
- Go to Definition and Find References cover proven ZSS and CNS destinations;
  ambiguity returns all exact candidates. Completion appears only in a
  recognized destination field and offers nonnegative catalog states with file,
  role, and compile-order provenance. It never replaces a dynamic expression.
- Unredirected Helper starting states now use the proven owning-character runtime
  catalog for completion, exact navigation/references, and missing-state
  diagnostics. SelfState, redirected destination catalogs, HitDef/ReversalDef
  custom-state roles, and exact navigation for those ambiguous ownership roles
  remain explicitly outside the proven slice. Installed behavior and real IKEMEN runtime validation remain physical-
  test pending. The feature is syntax/capability neutral and is not hidden from
  1.0 projects; future Nightly-only enrichments must remain separately gated.

## Code Viewer accessibility checkpoint — canonical destination navigation

- New Dev final verdict: **APPROVED**. Tabs and Cards use one bounded resolver
  over the same canonical visible destination identities. Left/Right clamp and
  never wrap; Home/End select the ends; PageUp/PageDown move a deterministic
  five visible destinations and clamp. Modifier, boundary, unknown and
  unrelated-key input is ignored without preventing normal host behavior.
- Keyboard movement captures the exact current source presentation before it
  dispatches one existing `activate-navigation` message with an opaque known
  destination ID. Clicks, the visible position slider and flank arrows retain
  their existing messages, but every successful route converges on the same
  host `selectDestination` owner and exact connected `TextDocument`.
- Every successful selection derives its reveal identity from the committed
  host navigation projection, scrolls that tab/card into the nearest visible
  area, and keeps the single `N of M · title` polite announcement. Keyboard
  activation alone returns focus and establishes one roving tab stop; pointer,
  slider and flank-arrow selection do not steal focus.
- Focus intent is call-scoped. Failed ownership checks, stale/unknown IDs,
  unsupported destinations and aborted draft/source preparation cannot retain a
  token that a later unrelated render could consume.
- Pure resolver tests and an executable client interaction harness cover no-wrap
  bounds, modifiers, ±5 paging, event ordering, one exact activation, Tabs/Cards
  parity, every navigation route, nearest scrolling, scroll-before-focus,
  roving tabindex and stale IDs. Host tests prove the same grouped panel and
  document owner are reused. No Save, Apply, Discard or second mutation route was
  added. Physical screen-reader timing and visual focus feel remain part of the
  installed UI signoff.

## Code Viewer accessibility checkpoint — compact and high-contrast shell

- New Dev final verdict: **APPROVED**. At a 400-pixel effective viewport and
  below, Split view stacks Visual above Source in document order. Tabs, named
  Card hands, shared toolbar groups, favorites, view controls, status text and
  conflict text wrap or shrink instead of creating a horizontal toolbar scroll.
- The two flank arrows retain the shared 27-pixel quick-action size. The
  position slider and full `N of M · title` readout remain available and wrap
  into a compact row without replacing or shortening the canonical announcement.
- The directly editable source area remains full width, vertically resizable
  and internally scrollable. Visual and Source panes use bounded grid tracks;
  the compact Split separator moves from the left edge to the top of Source.
- The Coding Viewer explicitly overrides the imported universal-toolbar
  horizontal clipping after that shared rule. Narrow layouts therefore depend
  on wrapping and minimum-width constraints rather than silently concealing a
  missed control; dropdown containers retain visible overflow.
- Forced-colors mode uses Windows system colors for the shell, editor, status,
  conflicts and quick icons. Higher-specificity local icon rules override the
  shared theme-color `!important` declarations and preserve focus plus active,
  selected, current and pressed states without color alone.
- Focused tests inspect the final combined stylesheet order as well as local
  structure, and the shell adds no animation, transition or smooth scrolling.
  Actual 320/360/400-pixel rendering, 200-percent zoom, font metrics, dropdown
  placement and subjective card-hand usability remain physical-test pending.

## Code Viewer navigation checkpoint — persistent Card hands

- New Dev final verdict: **APPROVED**. Cards are now a real optional grouping
  mechanism rather than a second decorative rendering of Tabs. `Organize tabs…`
  occupies the same invariant header position in Tabs and Cards and opens
  host-native choices for creating, renaming, deleting, assigning, unassigning,
  reordering, collapsing and expanding named hands without adding body clutter.
- Hand metadata is versioned, bounded and keyed only by the host-derived
  Authoring Context. It stores strict opaque hand IDs, validated labels, unique
  connected-file memberships, explicit hand and canonical file order,
  Card-only collapse state and the Tabs/Cards presentation choice. It never
  stores source text, the active TextDocument or webview-supplied filenames.
- Corrupt schemas, oversized records, duplicate membership, invalid IDs,
  control-only labels and stale file identities fail closed. Removed files are
  pruned, surviving order is retained, and newly connected files append once in
  their natural host order before falling back to the standard automatic or
  Ungrouped families. Deleting a hand deletes metadata only.
- Tabs, arrows, the position slider and keyboard navigation always use one
  complete canonical file order. Collapsing a Card hand never removes a file
  from that sequence. Each custom hand has a compact accessible heading toggle;
  a stored-collapsed hand containing the current file is effectively expanded
  so the exact current and focused destination remains exposed. Keyboard entry
  into an inactive collapsed hand selects the hidden canonical member first,
  then rerenders it as the current visible focus target.
- Grouped Character Essentials refresh is authoritative for its connected file
  set. It atomically adds and removes tabs, prunes Card metadata and owner maps,
  and selects the first canonical surviving file if the active file was
  removed. Retained edits for a removed active file are preserved through the
  existing recovery owner rather than overwritten or discarded.
- Persistence is globally serialized and uses a per-context compare-and-swap
  revision. Different characters cannot erase each other's records, and two
  valid panels sharing one normalized character context cannot overwrite a
  newer layout from a stale prompt. Stale organization refreshes and reports;
  authoritative file-set synchronization performs one bounded reconcile/retry.
  A context that becomes stale during a durable write restores the prior record;
  rollback failure is reported explicitly and reload validation fails closed.
- Tests cover a genuine dispose-and-cold-reopen, mode/order/collapse recovery,
  descriptor shrink and restore, active/inactive collapse, canonical keyboard
  traversal, forged toggles, nested cancellation, rejected writes, concurrent
  cross-context and same-context panels, stale mid-write rollback, compact and
  forced-color behavior, and preservation of every connected document object,
  text, version, dirty state, caret, scroll, focus, native edit owner, save count
  and delete-command count. Installed UI feel remains physical-test pending.

## Code Viewer safety checkpoint — destination status and activation guards

- New Dev final verdict: **APPROVED** after hostile accessibility and source-
  authority review, including normal native-editor deactivation, foreign-context
  takeover, and revoked browser-route races at awaited handoff boundaries.
- Connected Tabs and Card destinations now expose compact textual status cues
  for unsaved native documents, retained recovery text, source conflicts,
  closed files, unavailable files, native-editor-only files, and bounded Error
  and Warning diagnostics. Full filenames plus complete status are available to
  assistive technology and mouse hover; no meaning depends on color or symbols.
- Card-hand headings summarize every member, including members hidden by a
  collapsed hand, as `N files · M with problems`. Plain unsaved and closed
  states remain informational; unavailable, native-required, conflict,
  recovery, Error, and Warning states contribute to the problem count.
- Closed and unavailable are intentionally distinct. A closed connected file
  can be reopened through its exact admitted canonical path. Deleted, swapped,
  unreadable, non-regular, or canonically changed paths fail closed, display a
  warning and polite live announcement, and do not change the current tab,
  caret, navigation, source, or draft authority.
- Unsupported and over-4-MiB sources route only to the exact guarded native
  document while leaving the integrated current destination unchanged. A
  successfully reopened document replaces its stale closed reference only
  after the guarded route succeeds, so the Closed cue clears without creating
  a second integrated owner.
- Inactive connected-document edits, saves, closes, diagnostics, and recovery
  changes refresh through one coalesced, generation-checked panel queue.
  Diagnostic events are limited to exact connected URIs; record, destination,
  diagnostic, label, and count bounds fail closed or report an explicit unknown
  diagnostic state instead of accepting unbounded workspace traffic.
- Focused source tests cover immutable bounded projections, event coalescing,
  disposed callbacks, unrelated diagnostic rejection, inactive dirty/save and
  diagnostic refresh, compact wrapping, forced-colors output, connected source
  authority, and preservation of the existing native edit/save/delete owners.
  Installed visual and screen-reader behavior remains physical-test pending.

## Code Viewer preference checkpoint — Character Essentials first run

- New Dev final verdict: **APPROVED**. A new installation no longer silently
  selects the integrated Coding Viewer when Character Essentials opens coding
  files. The existing serialized presentation authority now offers Integrated,
  Native, or Ask on first use, matching the optional-viewer requirement.
- Remembered Integrated and Native choices bypass later prompts. Ask resolves
  once for a stable character task/session, and concurrent opens share the same
  serialized choice rather than displaying competing prompts or creating
  duplicate grouped panels.
- Dismissal or prompt failure uses the exact native-editor route and writes no
  preference. A persistence failure may honor the user's immediate choice, but
  leaves the setting unset so the next open can retry. The explicitly named
  Open Coding Viewer route may still force Integrated without changing the
  saved preference.
- Focused tests cover first-run persistence, remembered choices, Ask caching,
  dismissal, prompt failure, failed-write retry, concurrent opens, explicit
  force-Integrated behavior, grouped ownership, and the absence of automatic
  browser or asset-window creation. Installed first-run and editor-group
  placement remain physical-test pending.

## Active coding goal — native editor with two browser companions (2026-10-13)

- Replace the inferior webview text area in the default Integrated route with
  genuine VS Code editor tabs. Native highlighting, warnings, completions,
  hovers, Undo/Redo, dirty state, and Ctrl+S remain owned by VS Code.
- Keep one dedicated Code Navigation Browser for the invariant shared toolbar,
  connected-file arrows and slider, and switchable Tabs, grouped Cards, and
  List layouts. Changing layout or file must not move or rebuild the toolbar.
- Persist the chosen navigation presentation, while retaining native semantic
  selection and visible keyboard/forced-color focus in Tabs, Cards, and List.
- Cards is a real grouping mechanism rather than a cosmetic layout: named hands
  are workspace-persistent and support create/rename/delete, file assignment,
  unassignment, and bounded hand/file reordering. Automatic groups contain only
  files not already assigned to a named hand.
- Keep a second Coding Assistance Browser for Code Navigator, project-data
  maps, recipes, controllers, search, filters, visual structure, and later
  assistance screens. This browser may grow without cluttering navigation.
- Treat both browsers as one workspace: Code Navigation is the only universal
  toolbar owner, while Coding Assistance contains specialist screens and never
  adds a duplicate command strip.
- Character Essentials opens both companions only when Integrated is selected.
  The traditional Native preference continues to open ordinary editors only.
- Treat this layout as physical-test pending. Preserve the recoverable legacy
  integrated implementation behind its test-only compatibility route until the
  native workspace is signed off.
- Restore both browser companions from separate, bounded, exact-context
  envelopes. Reuse VS Code's supplied panels and reject malformed or stale
  state rather than creating duplicate/orphan tabs; restored assistance must
  remain owned by the same character-close lifecycle.
- Coding Assistance includes a bounded, read-only Problems provider using exact
  VS Code diagnostics and source fingerprints. Text and diagnostic changes are
  debounced so the browser does not rebuild all providers on every keystroke.
- Source integration coverage must continue proving exactly two browser
  companions, genuine native editor documents, no webview text area, stable
  toolbar ownership, conservative 1.0 capability gating, and exact diagnostic
  source routes before physical signoff.
- Recovery is part of that exact-source contract: the navigation toolbar passes
  its bound native document to the Recovery Center, which searches from that
  file before falling back to the currently active editor or a manual picker.
- Keep Coding Assistance refreshes provider-scoped. Diagnostic churn must touch
  Problems only; Save or explicit Refresh updates code-derived
  navigation/data/recipes as one shared bounded parse and must not rebuild the
  static controller catalog.
- Keep native typing outside the full-project parse path. Code-derived
  navigation/data/recipes update after Save or explicit Refresh; Problems may
  continue following native diagnostics. Render no more than 160 rows per
  assistance provider and use search/filters to reach the remaining results.
- Treat engine-profile changes as capability invalidation, not ordinary typing.
  A reviewed registry adoption or a manual `project-registry.json` save refreshes
  only Code Navigator, Project Data, and Recipes. Returning to 1.0 must remove
  Nightly-only strings from an already-open browser; the insertion host still
  rechecks the exact current target so a stale click cannot insert Nightly code.
- Engine-knowledge promotion is also a live capability invalidation source.
  Re-evaluate the open Code Navigator, Project Data and Recipes projections when
  exact-build evidence changes; do not require the user to close and reopen the
  browsers, and do not let observer failures interrupt catalog persistence.

## Coding assistance checkpoint — bounded Similar Code (2026-10-14)

- Coding Assistance now includes a read-only **Similar Code** provider. It uses
  the active connected native-editor cursor to select the smallest supported
  StateDef, Function, controller, condition, or loop, then ranks structurally
  related blocks from the admitted project source set.
- Results expose exact file/line routes, a source fingerprint, a coarse
  similarity band, and literal function, map, state, animation, and sound
  dependencies for expert review. A score is explicitly described as static
  structural similarity, never behavioral equivalence or runtime proof.
- The provider never inserts, copies, rewrites, or saves code. Missing or
  foreign active-editor authority fails closed with a short instruction to
  place the cursor in a connected block and choose Refresh.
- Work is bounded to 256 files, 4 MiB per source, 16 MiB total, 4,096 parsed
  candidates, 48 ranked results, and the existing 160-row browser renderer.
  It refreshes on Save or explicit Refresh rather than on cursor movement or
  each keystroke.
- Similar Code results now offer an explicit **Compare** action that keeps the
  bounded current block and chosen working reference visible side by side. The
  comparison is inspection-only, responsive at narrow widths, and disappears
  when its refreshed source result is no longer present.
- All 66 focused Coding Viewer acceptance files pass. Installed visual feel,
  ranking usefulness on real character code, and exact source navigation remain
  physical-test pending.

## Coding assistance checkpoint — native symbol flow and Focus Mode (2026-10-14)

- Implemented a presentation-only Visual Code Structure Focus Mode. The selected
  subtree and its ancestor path remain visible, the page states how many unrelated
  blocks are hidden, and Show All restores the full file. A native-editor route
  opens the caret block already focused in the reused structure panel.
- Expanded native Outline children to exact scoped declarations, authored calls,
  literal commands/transitions, controllers, project-data uses, redirects, and
  resource lifecycle IDs. This is navigation metadata over the live document,
  not a second code buffer.
- Literal Helper/Explod/Projectile IDs now participate in hover, owner-complete
  Definition/References, and current-symbol Project Knowledge routing. Their
  namespaces do not merge, and rename remains unavailable because static analysis
  cannot prove all dynamic runtime sites.
- Added owner-complete `map(...)` and `const(...)` name completion plus exact
  map/variable/constant hover. Incomplete ownership produces no speculative
  completion or project-wide claim.
- Added deterministic Off/Manual/Optional Suggestions configuration for
  contextual recommendations. Optional mode contributes only a native lightbulb
  when a reviewed catalog match exists; choosing the lightbulb still opens the
  existing review picker and does not itself mutate source.
- Project Knowledge now groups occurrences by current file, assigned character,
  and connected/shared sources and separates resource creation, mutation,
  cleanup, and reference sections. The full occurrence list remains available.
- Source acceptance currently passes all 66 explicitly enumerated Coding Viewer
  files. Installed placement, lightbulb discoverability, Outline density, hover
  usefulness, and Focus Mode feel remain physical-test items.

## Coding assistance checkpoint — deterministic source comments (2026-10-14)

- ZSS, CNS, and Lua editors now expose **Comment Assistance…** through the
  cohesive text Edit menu and Command Palette in Workspace mode.
- The bounded actions are Document Current Function/State, Update Comment for
  Function Signature, Improve This Comment, Explain Selected Code as Comment,
  and Add TODO/Reason Comment. Every wording operation uses
  the user's one-line authored meaning, previews the exact syntax-aware comment,
  and requires an explicit Insert Comment choice.
- Function drafts name parsed parameters but leave honest TODO descriptions;
  IKEMaker does not invent intent, guarantees, ownership, or completed testing.
  ZSS `#`, legacy CNS `;`, Lua `--`, indentation, and source line endings are
  preserved.
- Apply is one native WorkspaceEdit, remains unsaved, and retains VS Code Undo.
  A document version or hash change during review rejects the proposal without
  writing. Cancellation and unsupported/no-selection contexts write nothing.
- Workspace configuration can hide/disable the route with
  `ikemenZss.commentAssistance.mode = off`; Manual remains the default.
  Optional quiet suggestions, project documentation preferences, and consented
  AI wording remain deferred; the deterministic manual route creates no sidecars.

## Coding assistance checkpoint — project relationships and lifecycle data (2026-10-14)

- The reusable Project Symbols browser exposes direct in-place category access
  and focused commands for variables, constants, commands/input uses, functions/calls,
  states/transitions, Helpers, and Explod/Projectile resources.
- Literal `ChangeState`/`SelfState` flow is linked in both directions using the
  exact indexed transition site. Dynamic destinations remain explicitly
  unparsed rather than receiving a guessed edge.
- Helper, Explod, and Projectile records distinguish creation, reference,
  mutation, and cleanup. Exact sites retain their enclosing StateDef/function;
  lifecycle entries with no indexed creator say **creation unresolved** without
  treating reuse as an automatic error. Projectile creation uses `projID`.
- Project-defined `[Constants]` and exact `const(...)` uses now share one
  category. Observed value kind and owner are retained. A reference with no
  indexed declaration is labeled as possibly engine/common-owned, not promoted
  to a fabricated project definition.
- Assigned legacy CMD/CNS sources participate in the same catalog for exact
  `[Command]` names and literal `command = "name"` uses. Legacy semicolon
  comments are masked independently from ZSS `;` statement endings.
- Map and variable occurrences retain the authored runtime recipient (self,
  root, parent, Helper, Target, enemy/partner, or PlayerID expression). Equal
  names/slots are not presented as one runtime store. Function declarations
  retain authored signatures, and the compact Coding Assistance projection now
  exposes caller/callee and StateDef-flow relationships as exact child routes.
- With verified Nightly capability, string-bearing writes and calls display
  kind plus a length-only literal summary. Literal contents never enter browser
  HTML. Stable 1.0 continues to hide all string enrichment.
- Cards provide separate **Copy exact identifier** and **Copy stable identity**
  actions. The host validates the selected current-model entry before touching
  the clipboard. Existing opaque source IDs and revision checks remain in force.
- Similar Code comparison is still inspection-only. Escape closes it before
  search/child UI, and refresh removes a comparison whose result disappeared.
- Exact resource creation metadata is retained when authored: Helper start
  state, Explod removal/binding fields, native Projectile hit/removal fields,
  and literal projectile query triggers. These are observations, not lifetime
  simulation. A read-only **Compare Definition & Uses** report rechecks source
  revisions and never mutates the indexed files.
- Adjacent function comments now supply native completion/hover/signature help
  and Project Symbols search. Existing `@param` names that drift from the
  signature produce an informational diagnostic with a route to the reviewed
  deterministic updater; ordinary code edits do not rewrite comments.
- Adjacent StateDef comments now follow the same exact authored-documentation
  path into Project Symbols and runtime-authoritative state completion help.
  Read-only definition/use and rename-impact reports are bounded to 256 sites
  with an explicit omitted count for large projects.
- Exact StateDef hover now exposes runtime order, active/shadowed declarations,
  provenance and authored documentation. Constants and legacy command blocks
  retain their authored comments; command contracts expose sequence, timing,
  auto-greater and buffer fields in local discovery.
- Literal Helper start states link to their exact StateDef or remain explicitly
  unresolved. Classic CNS ChangeState and Helper/Explod/Projectile lifecycle
  controllers now feed the same project graph with section-bounded parsing.
- Read-only symbol reports cache each distinct source revision per action instead
  of reopening and hashing one file for every indexed occurrence.
- Native literal resource-ID completion now stays within exact Helper, Explod,
  or Projectile namespaces and appears only at proven reference/mutation sites
  from a complete owner catalog. Existing IDs are never suggested in creator
  fields. Multiple literal creators receive a runtime-exclusivity review label,
  not an automatic error.
- String-returning authored-function insertion/completion and the String Flow
  Project Knowledge filter now share the verified-Nightly capability gate.
  Stable 1.0 omits these controls entirely. Physical testing should verify the
  target switch removes and restores them without reopening the workspace.
- Cold-start activation is explicit for the new current-block, current-symbol,
  trigger/function picker, and contextual-recommendation commands. Installed
  testing should invoke each from a newly opened supported source before any
  IKEMaker browser has been opened.

## Coding assistance checkpoint — Explain Current Block (2026-10-15)

- Coding Assistance now includes a bounded, read-only **Explain Current Block**
  child view for the active connected native editor. It selects the smallest
  containing StateDef, function, controller, condition, or loop and summarizes
  parsed structure, conditions, actions, literal dependencies, and intersecting
  native diagnostics without creating a second code buffer.
- Exact source identity, version, SHA-256, caret, authoring context, and engine
  capability are captured and rechecked after asynchronous work. Every source
  route is opaque, host-issued, single-use, and revoked by source, context, or
  target changes. The view performs no edit, save, generation, or insertion.
- Stable 1.0 continues to hide Nightly-only authoring detail. Missing references
  are called unresolved only when the assigned symbol catalog is complete;
  catalog truncation above 4,096 retained names explicitly revokes completeness.
  Diagnostic intake truncation likewise reports an incomplete review and never
  claims the block is clean.
- Bounds are 4 MiB for the active source, 16 MiB aggregate assigned-source
  catalog input, 128 KiB for the final projection, 256 projected items, and 128
  nested braces. The nesting preflight respects ZSS `#`, CNS/ST `;`, and Lua
  `--` comments independently and ignores quoted braces; ZSS semicolon-separated
  statements cannot bypass it.
- New Dev approved the source slice after focused model, workspace, host,
  browser, command-contract, syntax, and package tests passed. Installed
  placement, wording, and usefulness on real character code remain physical QA.

## Coding assistance checkpoint — Intent-to-Examples discovery (2026-10-15)

- The existing **Similar Code** provider now joins built-in and project-defined
  intent phrases with admitted project blocks and exact-owner Personal Examples.
  It adds no provider, window, or mutation path. Ambiguous aliases report a
  collision and do not create a source route.
- Personal Examples are resolved only for the exact validated character DEF.
  Current and uniquely moved bookmarks retain exact-source navigation; changed,
  ambiguous, missing, and unlinked bookmarks remain visible but cannot expose
  stale source. That owner survives live browser binding and current restore
  envelopes. Legacy ownerless restore remains readable but cannot infer access.
- Discovery is deterministic and privacy-bounded: literal strings are masked in
  browser excerpts, compatibility is labeled unproven, and custom aliases,
  pins, parameters, occurrence ranges, per-record bytes, aggregate bytes, and
  source reads are capped. Personal and intent categories are bounded
  independently before the final eight-plus-eight reservation, so either cannot
  starve the other under structural or pin saturation.
- The final Similar Code projection remains capped at 48 rows and performs no
  edit, save, generation, or insertion. New Dev approved the slice after all 89
  focused Coding Viewer acceptance files plus syntax and command audits passed.
  Installed search wording and usefulness on real character projects remain
  physical QA.

## Coding assistance checkpoint — reviewed adaptation scratch draft (2026-10-15)

- A compared **Similar Code** result can now create a reviewed native scratch
  draft without gaining Apply authority. The host asks for exact admitted
  current-project alternatives or one bounded explicitly classified literal,
  then replaces only parser-proven dependency ranges for functions, maps,
  constants, commands, states, animations, sounds, Helpers, Explods, and
  Projectiles. Dynamic, missing, ambiguous, overlapping, truncated, excessively
  nested, or oversized cases stop before a draft is opened.
- Current and reference full-document hashes, same-language grammar, selected
  engine target, capability set, admitted-source catalog, context identity, and
  reviewed substitutions are rechecked after every prompt. The one-use route is
  minted from a random browser-workspace instance plus context epoch, rendered
  generation, exact result, and review identity. Immediate/concurrent replay is
  rejected; authoritative Refresh or close/reopen creates fresh authority.
- The exact reference and adapted block open as language-aware untitled native
  documents in VS Code's diff editor, retaining syntax color, Problems, native
  editing, and Undo. Literal block contents never travel through browser HTML,
  logs, or clipboard. The path never calls WorkspaceEdit, Save, insertion, or a
  project mutation owner.
- ZSS/CNS comment and string false matches are masked. Lua quoted and line-comment
  forms are masked; Lua long-bracket comments or strings—including arbitrary
  equals levels and unterminated forms—currently fail closed for manual review.
- New Dev approved this zero-write slice after all 89 focused Coding Viewer
  acceptance files, dedicated all-kind/byte-preservation/authority/host/replay
  tests, syntax checks, and diff checks passed. Installed prompt wording, native
  diff placement, and usefulness on real code remain physical QA.

## Coding assistance checkpoint — Resume in Context (2026-10-15)

- The existing Coding Assistance surface now owns one compact **Resume in
  Context** marker per exact character DEF. Mark, Resume, and Clear are explicit;
  no new window, parallel editor, project sidecar, or automatic next-step system
  was added.
- A marker retains a bounded exact parsed block, source/document fingerprints,
  owner DEF, authoring-context identity, location, kind, signature, label, and
  timestamp in workspace-local extension storage. Storage mutations reread the
  durable value, serialize competing updates, cap owners and bytes, and retain
  the last adopted state when a write fails.
- Resume navigates only when the exact block is unchanged at its marked range or
  the same bytes moved to one unique admitted location. Changed, duplicated,
  missing, unreadable, foreign, and unassigned results remain visibly stale and
  expose no navigation route. Cross-character markers cannot leak through a
  shared file or legacy ownerless restore state.
- Marking captures the active editor/document object, URI/path, version, complete
  SHA-256, caret line/character, owner, and context before its label prompt. All
  authority is rechecked afterward; source edits, editor switches, caret moves,
  closure, target/context drift, or growth beyond 4 MiB stop visibly without
  saving the pre-prompt block. The exact 4 MiB boundary is admitted and limit+1
  is rejected before parsing.
- The browser can request only Mark, Resume, or Clear with its current generation;
  it cannot mint marker or source identity. Successful Resume reuses the existing
  grouped native-document-backed Coding Viewer. None of the three actions edits,
  saves, inserts, copies, changes catalogs, or changes engine targets, and stable
  1.0 receives no Nightly-only detail.
- New Dev approved the corrected slice after prompt-race, bounds, owner isolation,
  persistence, stale-state, browser-authority, host, and zero-write tests passed.
  All 89 focused Coding Viewer acceptance files remain green. Installed placement,
  naming feel, and real-project usefulness remain physical QA.

## Coding assistance checkpoint — Project Reference Parity (2026-10-15)

- Project reference coverage is now represented by one bounded, immutable parity
  matrix across ZSS, CNS/ST, and Lua. Every discover, reveal, complete, and insert
  claim names its own proven implementation evidence or carries an explicit
  fail-closed reason; a read-only Project Data route is no longer mistaken for a
  native editor completion or insertion path.
- Existing ZSS asset completion remains honestly completion/insert-only where no
  project discovery or exact-source reveal exists. Existing function, StateDef,
  command, asset, and resource-ID routes retain their actual scopes rather than
  implying support outside their parser or language authority.
- One practical CNS/ST gap is closed: exact-owner `map(...)` and `const(...)`
  names can now complete from the assigned character catalog. Results appear only
  when one complete, clean owner DEF assigns the source; shared, dirty,
  ambiguously assigned, foreign-character, malformed, and dynamic cases remain
  silent. The accepted completion is one normal editor edit with native Undo and
  no WorkspaceEdit or autosave.
- Explicit Stable 1.0 selection overrides contradictory hints. Nightly string
  detail is exposed only when the exact target channel is Nightly and the
  `zss.runtime-strings` capability is present; ownerless targets stay
  conservative.
- New Dev approved the corrected evidence audit after real-filesystem Ryu/Ken
  owner-isolation tests, capability-gating tests, syntax checks, and all 100
  focused Coding Viewer acceptance files passed. Installed completion feel and
  usefulness on a physical project remain physical QA.

## Coding assistance checkpoint — Resource Lifecycle Inventory (2026-10-15)

- Helper, Explod, and Projectile lifecycle facts now flow through one bounded,
  deeply immutable projection over the existing project-symbol catalog. Project
  Data and Move Lab consume that same DTO; there is no second parser, new window,
  or separate per-resource implementation.
- ZSS and CNS/ST creation, mutation, cleanup, and reference sites preserve source
  order, exact enclosing StateDef/function, assigned owner, namespace, source
  fingerprint, and authored runtime recipient. `self`, `root`, `parent`, `p2`,
  `stateOwner`, and parameterized Helper/Target/Player expressions remain source
  context only; dynamic expressions are retained exactly and never treated as a
  proven runtime instance.
- A balanced call scanner preserves nested resource expressions such as
  `map(Owner)` instead of truncating them. Comments and strings are masked.
  Equal numeric IDs in different resource namespaces never merge. ID-less
  creation controllers remain visible as unresolved and make the inventory
  explicitly incomplete rather than disappearing.
- Catalog, request, and current context must name the same exact owner DEF. An
  opaque browser context cannot manufacture ownership, a caller cannot relabel
  another character's catalog, and a changed source fingerprint rejects reveal.
  Project Data receives only its admitted absolute owner DEF.
- The shared catalog refuses more than 256 files, more than 4 MiB per source, or
  more than 16 MiB aggregate before parsing. Move Lab performs the same disk/open
  document admission and discards the whole owner catalog after any failure.
  Stable and Nightly lifecycle DTOs are byte-identical and disclose no gated
  string detail.
- New Dev approved the corrected slice after real Project Data and Move Lab
  owner/bounds integrations, ZSS+CNS nested-expression tests, stale routing,
  namespace collision, omitted-ID, privacy, syntax, and all 101 focused Coding
  Viewer acceptance files passed. Installed usefulness and visual placement
  remain physical QA.

## Coding assistance checkpoint — CNS/ST Resource ID Completion (2026-10-15)

- The same exact reverse-resolved character-owner catalog now supplies native
  CNS/ST completion for literal Helper, Explod, and Projectile identities at
  parser-proven reference and mutation fields. It adds no parallel inventory,
  browser, or project-wide guess.
- Creator fields, comments, strings, malformed or dynamic values, id-less
  resources, shared/dirty/incomplete ownership, and foreign character sources
  remain silent. Equal IDs stay isolated by Helper/Explod/Projectile namespace;
  an authored redirect does not silently change which catalog owns the name.
- Accepting a result is one ordinary native editor insertion with normal Undo.
  Stable and Nightly receive the same numeric identity assistance and no gated
  string detail. New Dev approved the slice after focused owner, namespace,
  parser, completion, and integration tests passed.

## Move Lab checkpoint — Selected Component Lifecycle Connections (2026-10-15)

- An exact selected Helper, Explod, or Projectile creation controller now shows
  its shared Project Knowledge lifecycle grouped as Creation, References,
  Mutations, and Cleanup. Each route retains exact source revision, enclosing
  StateDef/function, runtime-recipient expression, namespace, and authored ID.
- Repeated same-ID creators are explicitly candidates rather than proof of one
  runtime instance. Dynamic and omitted IDs remain visible but unlinked;
  incomplete or cross-character ownership fails closed.
- Source buttons re-resolve the selected component, lifecycle site, owner DEF,
  and source fingerprint before navigation. This is read-only and creates no
  second parser, catalog, window, or edit path. New Dev approved the slice after
  component, host-route, stale-source, and full Coding Viewer acceptance tests.

## Move Lab checkpoint — Existing-map Helper initializer drafts (2026-10-15)

- An exact selected ZSS or CNS/ST Helper creation controller can now stage an
  initializer for a map already proven by the assigned character catalog. ZSS
  uses `map.Name: value`; CNS/ST uses `map.Name = value`. The receiver is
  explicitly the newly spawned Helper, never the creator's self or one inferred
  runtime instance from a shared Helper ID.
- The host owns the map choice, exact component identity, before/after preview,
  and one-use authority token. Apply rechecks the component, catalog entry,
  range bytes, source revision, planned replacement, native edit result, and
  exact post-edit document before clearing the recovery draft. The accepted
  change is one native editor edit with normal Undo and no save.
- The bounded numeric-expression grammar rejects strings, comments, statement
  separators, assignments, block delimiters, unbalanced parentheses, and bare
  names. Duplicate case-insensitive initializers, ambiguous controller parses,
  oversized input, incomplete ownership, replay, forged text, and stale source
  fail closed. Exact LF/CRLF bytes and unrelated comments/spacing are preserved.
- Authority is limited to the newest preview and revoked on discard, context or
  model refresh, and every Apply attempt. False, thrown, no-op, or wrong-result
  native edits retain the draft and release pending UI controls while requiring
  a fresh preview. Runtime map read/write generation remains deferred until its
  receiver, guard, and destination can be stated truthfully.
- Stable and Nightly share the same numeric path; string-bearing values remain a
  separately gated Nightly concern. New Dev approved the corrected slice after
  adversarial planner, host, client, EOL, recovery, and all 103 focused Coding
  Viewer acceptance files passed. Installed prompt feel and layout remain
  physical QA.

## Move Lab checkpoint — Exact Helper Lab handoff (2026-10-15)

- Opening an exact selected Helper creation site now resolves a fresh static
  Helper graph node on the host and passes its opaque node identity to Helper
  Lab. Repeated creators with the same Helper ID remain distinct; Helper ID or
  StateNo alone is never treated as identity.
- The handoff binds assigned owner DEF, source filename, complete source hash,
  parser node bounds, controller hash, and syntax. Helper Lab rebuilds and
  rechecks that evidence on entry, after every prompt, and again after awaited
  draft persistence before adopting the node. Dynamic, ambiguous, changed,
  oversized, unassigned, or foreign sources fail closed.
- Same-node work resumes. Unrelated recovered or input-only dirty work triggers
  an explicit Keep Current versus Discard/Open decision, with Keep/dismiss as
  the safe default. A bounded live dirty probe fails safe, and successful
  adoption resets transient client state without staging or writing source.
- Move Lab selection and drafts remain intact; the handoff is navigation only.
  New Dev approved the corrected race-safe slice after ZSS/CNS, repeated-ID,
  same-offset mutation, delayed-discard, transient-dirty, open/reuse, and all
  104 focused Coding Viewer acceptance files passed. Installed navigation feel
  remains physical QA.

## Coding safety checkpoint — StateDef transfer integrity slice 2

- `TargetState` inside an exact owning `StateDef -2` or `StateDef -4` now uses
  the executor-own/own-player character catalog already proven by the pinned
  engine semantics. It participates in guarded completion, hover/navigation,
  references, and missing-StateDef diagnostics instead of being suppressed.
- Unredirected `SelfState` receives that same support only inside exact
  `StateDef -2/-4` ownership. Ordinary-state `SelfState`, function-owned use,
  redirects, dynamic destinations, malformed blocks, and ambiguous duplicate
  fields remain silent because the recipient may own another character catalog.
- The shared `usesCharacterCatalog` authority keeps parser, completion,
  navigation, references, and diagnostics on one ownership rule. Four focused
  parser/catalog/diagnostic/provider suites pass. Installed and runtime behavior
  remain physical-test pending.

## Helper Lab checkpoint — exact-owner creation-map picker (2026-10-15)

- The Advanced/Create Helper form now offers one compact **Choose existing map…**
  action only while an exact static Helper creation controller is loaded.
- The host rebuilds a complete assigned-character map catalog, rejects shared,
  unassigned, dirty, stale, incomplete, or changed ownership, and never accepts a
  map identity from the webview client.
- Initializer values use the bounded numeric-expression grammar. String-bearing
  values remain unavailable until a separately verified Nightly authoring path
  exists.
- Add and replace preserve map order and metadata and stage only the recoverable
  Helper form draft. They perform no source edit, clipboard write, or automatic
  Apply.
- Every prompt return revalidates controller, catalog, form, and current panel
  session. Closing or replacing the Helper Lab during the picker leaves source,
  workspace state, and the model untouched.
- Immutable results deep-clone retained branches before freezing, so caller-owned
  nested plan data remains mutable after add, replace, and rejected validation.
- New Dev approved this slice after focused race/immutability coverage and the
  complete Coding Viewer suite passed all 105 acceptance files. Installed UI
  interaction remains part of the later physical-test pass.

## Spatial Composer checkpoint — exact existing-Explod handoff (2026-10-15)

- Move Lab now hands one exact Explod creation controller to Spatial Composer
  using its character DEF owner, in-character assigned source, complete source
  hash, exact line/range bytes and hash, syntax, parser result, and stable site.
- Equal literal Explod IDs remain separate authored ranges. Dynamic and omitted
  IDs remain visible but are labelled unresolved and never claimed to identify
  one runtime Explod.
- New and already-open Spatial Composer panels revalidate the evidence, select
  only the exact assigned source tab, and show compact read-only context for the
  authored source, ID status, receiver, and enclosing owner.
- The handoff does not translate the controller into the generated Explod plan.
  Current, recovered, and input-only Spatial work remains untouched; no conflict
  prompt, clipboard write, catalog mutation, source edit, or draft overwrite is
  introduced.
- **Open exact source** carries no client-supplied identity and revalidates before
  and after editor awaits. Forged, stale, replayed, foreign, shared, unassigned,
  oversized, parser-disagreed, and same-offset-mutated evidence fails closed.
- New Dev approved the slice after ZSS/CNS, duplicate-ID, dynamic/idless,
  comments/strings, new/existing-panel, draft-preservation, navigation-race, and
  zero-write coverage; all 106 focused Coding Viewer acceptance files passed.

## IKEMEN Nightly delta review — build 05a2abe to 97c77db (2026-10-14)

The installed engine binary was inspected without launching it. Its embedded Go
build metadata identifies revision `05a2abef47574c64b37109debc29672b8fae4a60`
from 2026-10-01. The current `nightly` tag and `develop` both resolve to
`97c77dbda2c526e85c45e41828510d497c3b7a27` as of this review. No engine files
were replaced or downloaded into the game directory.

High-priority IKEMaker catalog/authoring follow-up:

Implemented source-side in the Coding Viewer goal on 2026-10-14: the exact
`97c77db` target and grouped capability evidence are recorded; `RunState`,
`InRunState`, `DepthBound`, `ModifyStoryboard`, `RemoveStoryboard`,
`TransformClsn.index`, and `HitBy`/`NotHitBy` collision selectors now flow
through shared target-aware discovery and insertion guards. Stable 1.0 omits
these records across native language help and browser/picker surfaces. Runtime
and installed-build validation remain pending, and the items below that are not
named here remain backlog work.

The `*` command direction symbol is also implemented source-side in Command &
Movelist. The exact supporting Nightly adds broad cardinal inputs and a modifier
action to the existing step tools, while stable 1.0 hides insertion and reports
authored use as unsupported. The model retains exact source, explains the
cardinal-plus-adjacent-diagonals/non-retrigger behavior, and diagnoses duplicate
or mutually exclusive `$*` prefixes. Open workspaces refresh when engine
capability evidence changes. Installed interaction remains physical-test pending.

Automatic value-kind indexing now also covers exact function call inputs,
scoped-local declarations, named return-variable writes, and later local writes. Integer/float observations
remain ordinary source evidence; verified Nightly can expose content-free string
length summaries. Stable 1.0 suppresses those string-kind details, and literal
string contents are never serialized into browser output. Native scoped-local
hover uses the same gate and labels every displayed kind as source observation,
not a runtime type guarantee. Map/variable/constant hover now follows the same
policy: stable targets retain ordinary numeric observations, while string
kind/length evidence requires the verified Nightly capability. Authored-function
hover also aggregates exact call-site kinds by argument position; stable targets
omit Nightly-only string evidence while keeping authored parameter and return
variable names, and verified Nightly keeps the same content-free string-summary
rule. No displayed evidence is labeled as a declared function type.

The coding checkpoint now also propagates positively proven string kinds across
exact simple local/map/constant assignments, uniquely declared string-returning
calls, function arguments and named parameters. Nested chains use a bounded
eight-pass analysis; mixed, ambiguous, dynamic and multiply declared evidence
stays unresolved. Project Knowledge and Coding Assistance share a compact,
read-only Identifier Glossary filter over existing Project Data. Scoped names
remain separate, engine trigger/controller uses remain outside the glossary,
and conflicting authored descriptions receive only a review label. Editing team
vocabulary, approvals, portable metadata and enforced naming standards remain
deferred under the existing collaboration/sign-off scope.

Native CMD grammar now assigns dedicated semantic scopes to command modifiers,
directions, buttons, and sequence relations. This includes recognizing `*` as a
modifier for coloring without weakening the separate project-target diagnostic
and insertion gate in Command & Movelist. Native CMD diagnostics now use that
same target authority: stable 1.0 flags unsupported `*`, the verified Nightly
clears only that target error, and structurally invalid `$*` / duplicate `*`
forms remain errors. Open CMD diagnostics refresh after capability changes.

- Verified-Nightly string support now includes string expressions/returns,
  string locals and function inputs/outputs, typed int/float/string maps,
  typed character/stage constants, string animation/sound prefixes, string
  command expressions, and string Helper names. Keep all such authoring and
  String Flow UI absent for stable 1.0. Review existing numeric map expressions
  because integer-valued maps are explicitly described upstream as a breaking
  behavior change.
  Source-side completion now also includes capability-filtered parameter help
  and stable-target diagnostics for positively proven dynamic animation/sound
  prefix forms and map/local Helper names. Ordinary numeric forms, stable quoted
  Helper names, comments, uncertain expressions, target-less callers, and the
  exact supporting Nightly remain silent. Installed diagnostic refresh and
  native editor presentation remain physical-test pending.
- Extend capability-aware type help beyond the completed scoped-local,
  map/variable/constant, and authored-function hover surfaces.
  Current-source function-parameter hover now includes exact positional inbound
  call kinds. Numeric evidence is portable; string evidence is capability-gated
  and content-free. Connected-file parameter flow remains in Project Knowledge.
  Project Knowledge and Coding Assistance also expose bounded indirect function
  and StateDef impact paths inside their existing cards. These are literal,
  source-routed review aids—not runtime reachability or recursion claims.
  Coding Assistance keeps these rows out of ordinary mixed results and exposes
  them through one compact **Impact Paths** scope over Project Data; exact source
  children remain navigable and Escape restores the ordinary view.
  Project Knowledge now indexes exact observed map, constant, function-argument,
  parameter-default, and scoped-local kinds. `RunState` / `InRunState`, the `*` command
  direction symbol, `clsn.group` / `clsn.index`, `TransformClsn index`, and
  `BGMVar` / `SoundVar(sampleRate)` now have their initial target-gated source
  implementations; installed interaction and runtime claims remain pending.
- Extend Stage/Screenpack tools for Z camera parameters (`ztension`,
  `ztensionvel`, `zboundtop`, `zboundbot`, `zautocenter`), `DepthBound`,
  Storyboard creation parameters plus `ModifyStoryboard` / `RemoveStoryboard`,
  and expanded stage/text/shadow/reflection/afterimage shader controls. These
  remain Nightly-only wherever upstream marks them so.
  Coding-side discovery and compatibility diagnostics are now implemented for
  all five Z camera StageVar/ModifyStageVar fields. Stable 1.0 omits the
  parameter help and flags exact authored uses; the verified capability exposes
  them. Stage Workspace controls, preview semantics, and runtime behavior remain
  separate physical-test work.
  The same source-side pass now models the established Storyboard path plus all
  verified runtime placement/binding fields, and uses one catalog-driven native
  diagnostic for unavailable whole controllers or nested parameters. This
  closes source guarding for RunState, DepthBound, Modify/RemoveStoryboard, and
  indexed collision parameters; actual storyboard runtime behavior remains
  physical-test pending.
- Source-side implementation complete: `RetryLoadOnError` is an exact-target,
  optional development launch capability. The reviewed command never silently
  turns it on, preserves surrounding config text, refuses duplicate active
  settings, and leaves its edit unsaved. Physically verify the engine prompt and
  reload behavior; a retry never counts as successful compile/runtime evidence.
- Review affected preview assumptions and diagnostics for the upstream zoom /
  `ScreenPos`, `ModifyExplod` facing, animation Clsn index, 32-bit sprite alpha,
  helper preservation, afterimage, shader, and negative-StateDef behavior fixes.
  Physical comparison is required before changing IKEMaker preview claims.
- The latest two merges also expand shader support and adjust options/netplay
  UI behavior; the final `97c77db` commit changes release packaging only. Engine
  upgrade remains a separate explicit user action after backup and compatibility
  review.
  Source-side shader cataloging now covers the verified ModifyBGCtrl, Text,
  ModifyShadow/ModifyReflection, AfterImage, Explod/Projectile afterimage,
  ModifyStageVar shadow/reflection, StageVar, ExplodVar, and ProjVar additions,
  including bounded param0–param15 compatibility diagnostics. Stable 1.0 sees
  none of this authoring help. Visual shader previews and rendered behavior
  remain physical-test pending.

## Spatial Composer checkpoint — existing-Explod projection and exact AIR handoff (2026-10-15)

New Dev approved the source-testable read-only Explod inspection slice. Spatial
Composer now projects bounded authored Explod properties without translating
them into or replacing the user's separate new-Explod plan. Literal `anim`
references can open only one exact action in the currently assigned AIR. The
authority binds the clean saved owner DEF and its `anim` assignment, bounded AIR
bytes, full AIR hash, unique action number, line, and parsed-action hash. Dirty
DEF assignments, reassignment/removal races, oversized sources, duplicate action
numbers, changed source, forged action requests, and existing/new AIR-panel
races all fail closed before reveal or selection. Unknown, dynamic, duplicate,
and unsupported Explod fields remain visibly source-owned. Quoted expressions
are preserved, and the separately shown Explod ID is not misreported as an
unknown property. This slice performs zero source, draft, clipboard, or catalog
writes; all 108 focused Coding Viewer acceptance files pass.

Next approved source-only slice: a separate reviewed existing-Explod edit draft
limited initially to syntax-proven `anim`, `pos`, and placement mode
(`postype`/`space`). It must preserve every unrelated source byte, comment, EOL,
field order, unknown field, and authored expression; keep duplicate/dynamic
targets locked; show exact before/after; retain unrelated recovered work; and
apply one native-editor edit through single-use, immediately revalidated host
authority with exact post-state verification. Physical UI validation remains a
later checkpoint.

## Spatial Composer checkpoint — guarded existing-Explod editing (2026-10-15)

New Dev approved the complete source-side existing-Explod edit card. It now
supports exact replacement of unique conservative authored `anim`, `pos`,
`postype`/`space`, `vel`/`velocity`, `accel`, `bindtime`, `removetime`, `scale`,
`angle`, `layerno`, and `sprpriority` expressions. `layerno` is restricted to
the engine domain `-1`, `0`, or `1`; `sprpriority` remains an independent safe
integer. Omitted, duplicate, dynamic, invalid, and unsupported properties remain
locked. Preview shows the exact before/after controller and affected authored
names while preserving all other bytes, comments, EOLs, order, and unknown
fields. Apply uses one native `WorkspaceEdit`/Undo unit, never auto-saves, and
requires a single-use host token bound to the DEF assignment, exact source,
selection, preview, session, and generation with post-state verification.
Failed, stale, forged, replayed, inactive, and wrong-result paths perform no
partial edit and retain reviewed recovery where possible. Transparency, PalFX,
palette, and insertion/reordering remain deliberately outside this slice.

## Move Lab checkpoint — exact Projectile projection and AIR routes (2026-10-15)

Move Lab now gives a selected native Projectile a bounded read-only property
projection inside its existing component inspector. Identity, four distinct
animation roles, placement/motion, geometry/layers, and lifecycle/contact policy
are grouped without evaluating expressions or inventing defaults. Authored names
and raw expressions remain visible; omitted, duplicate, dynamic, unknown, and
embedded HitDef/contact semantics remain explicitly unresolved and source-owned.

Each unique literal `projanim`, `projhitanim`, `projremanim`, or
`projcancelanim` can receive its own opaque one-use AIR route. The origin binds
the clean DEF, its current `st`/`stN`/`stcommon` assignment (never CMD or the CNS
constants assignment), bounded full source and exact controller range, assigned
AIR, unique parsed action, active session, and generation. The AIR owner receives
generic related-source evidence and independently rechecks DEF assignment,
source bytes/range, AIR bytes/action, and every asynchronous opening checkpoint.
Saved source reassignment/removal, dirty DEF, source/AIR size excess, duplicate
actions, source/DEF/AIR drift, inactive origins, forged/replayed routes, and
Stable/Nightly interpretation leaks all fail closed. The slice performs zero
source, catalog, clipboard, or workspace writes. All 116 focused Coding Viewer
acceptance files pass; installed visual interaction remains physical-test
pending.

## Move Lab checkpoint — guarded authored-Projectile editing (2026-10-15)

New Dev approved a guarded edit card inside the existing Projectile component
inspector. It can replace only unique, already-authored conservative literals
for `projanim`, `postype`, `offset`, `velocity`, `accel`, and
`projremovetime`. Omitted, duplicate, dynamic, invalid, unknown, embedded
HitDef/contact, insertion, and reordering cases stay source-owned. CNS/ZSS
comments, EOLs, field order, and all unrelated bytes remain exact.

Preview is zero-write and revokes any older Apply authority before every new
review attempt, including invalid, no-op, and stale attempts. Apply uses one
native `WorkspaceEdit`/Undo unit, never saves, and consumes a 48-hex host token
bound to the clean owner DEF, current exact `st`/`stN`/`stcommon` assignment,
full source and controller hashes, exact preview/result hashes, component
generation, session, active surface, and selection revision. The host rechecks
after source opening, verifies the exact post-edit hash and document version,
and reports committed truth even if the panel becomes inactive or refreshed
identity cannot be recovered. Failed native edits retain a tokenless reviewed
preview; forged, replayed, stale, reassigned, inactive-before-commit, and
wrong-result paths fail closed. Model republishing replaces rather than appends
Projectile AIR routes, preventing hidden route growth. Stable and Nightly use
the same source-neutral behavior. All 119 focused Coding Viewer acceptance
files pass; installed visual interaction remains physical-test pending.

Next approved source-only slice: reuse this exact transaction for unique,
already-authored safe-integer `projhitanim`, `projremanim`, and
`projcancelanim` fields. Keep all four animation roles distinct, preserve their
existing exact assigned-AIR routes, and continue to prohibit insertion,
dynamic expression rewriting, or inferred animation ownership. Projectile
lifecycle counters and removal/contact semantics remain a separate later
slice.

New Dev subsequently approved that animation-role extension. All four authored
roles now remain independently editable only when each is one unique safe
integer literal; dynamic, duplicate, and omitted roles remain locked, and the
existing exact assigned-AIR routes are unchanged. The next approved bounded
slice is classic motion parity for unique already-authored `remvelocity` and
`velmul` two-number literals through the same guarded transaction. It must not
add lifecycle/contact fields, insertion, geometry interpretation, or AIR
changes.

New Dev approved the completed `remvelocity`/`velmul` motion extension. The
next approved source-only slice covers only unique already-authored integer
`projremove`, `projhits`, `projmisstime`, and `projpriority` values. It must
preserve authored nonzero `projremove` integers rather than normalizing them,
must infer no defaults or cross-field policy, and must continue deferring
Projectile bounds, geometry/layers, embedded HitDef, insertion, and dynamic
expressions.

New Dev approved the completed lifecycle/contact-policy integer extension. The
next approved source-only slice adds only unique already-authored two-number
`projscale` and integer `projsprpriority` values through the same transaction.
`projangle` and `projlayerno` must remain non-editable pending a separate schema
audit because local controller metadata describes `ProjAngle` and `ProjLayerNo`
as separate controllers rather than proven classic Projectile creation
parameters. Bounds, palette/afterimage, identity, insertion, and dynamic
expressions remain deferred.

The metadata audit corrected the earlier uncertainty: local `sctrl.json` and
the merged offline `Projectile parameters` documentation both identify
`ProjAngle` and `ProjLayerNo` as IKEMEN Projectile parameters, not standalone
controllers. New Dev approved a read-only provenance pass before editing them:
every projected field must say whether it is classic MUGEN or an IKEMEN
extension, with these two fields labeled as Stable IKEMEN extensions rather
than hidden or misrepresented as Nightly-only. Existing raw expressions,
statuses, groups, counts, and AIR routes must remain unchanged.

New Dev approved that provenance pass. A separate guarded edit slice may now
cover only unique already-authored one-number `projangle` values and
`projlayerno` values restricted to `-1`, `0`, or `1`. The edit card must retain
the visible `IKEMEN extension · Stable 1.0` provenance and reuse the exact
preview/single-use/one-Undo transaction. Omitted, duplicate, dynamic, invalid,
non-finite, and out-of-domain layer values stay locked; insertion, projection
mode, bounds, palette, identity, and Nightly inference remain out of scope.

New Dev approved the completed `projangle` / `projlayerno` edit slice after the
focused planner, host, and component-client tests and all 119 focused Coding
Viewer acceptance files passed. The next approved source-only slice covers only
unique already-authored signed-safe-integer `projedgebound` and
`projstagebound` fields plus exactly two signed-safe-integer values for
`projheightbound`. It reuses the guarded exact-source transaction, infers no
defaults or undocumented ordering/scale relationship, and keeps omitted,
duplicate, dynamic, noninteger, identity, palette, afterimage, shader, and
insertion cases locked or deferred.

New Dev approved the completed removal-bound edit slice after its focused
planner/host tests and all 119 focused Coding Viewer acceptance files passed.
The next approved source-only slice is read-only: extend the existing
Projectile projection with classic `projshadow`, `supermovetime`,
`pausemovetime`, `ownpal`, `remappal`, and `afterimage.time` metadata under one
compact Rendering/palette/pause group. Preserve raw expressions and authored
casing, bind every field to local Projectile metadata, infer no defaults or
semantics, and add no edit, AIR/palette handoff, shader/afterimage subfields,
projection-mode extension, identity rewrite, or embedded-HitDef behavior.

New Dev approved the completed read-only Rendering/palette/pause projection.
The next approved source-only slice may edit those same six values only when
uniquely and already authored: signed safe integers for `projshadow`,
`supermovetime`, `pausemovetime`, `ownpal`, and `afterimage.time`, and exactly
two signed safe integers for `remappal`. Preserve nonzero `ownpal`; infer no
coupling or defaults between palette/afterimage fields; reuse the guarded exact
transaction; and keep omitted, duplicate, dynamic, noninteger, shader,
afterimage-subfield, Palette Workshop handoff, identity, and insertion cases
locked or deferred.

New Dev approved the completed guarded Rendering/palette/pause edit slice. The
next approved source-only slice is a read-only embedded Projectile contact
projection in the existing inspector. It must reuse the exact Projectile
property parse and established HitDef group vocabulary, show only explicitly
authored metadata-proven fields, preserve raw casing/expressions and duplicate
occurrences, and keep Projectile-specific namespaces separate (for example,
`projpriority` versus HitDef `priority`). Capability-bound contact detail stays
visibly unresolved unless the exact project target proves the capability.
There is no editing, default/evaluation, standalone-HitDef conversion,
AIR/palette handoff, or mutation in this slice.

New Dev approved the completed read-only embedded contact projection after both
review blockers were closed. Stable targets now keep positively proven dynamic
attr/flag and string-prefixed spark/sound forms visibly capability-unresolved;
the exact supporting Nightly capabilities expose them. Numeric and legacy
forms remain visible, oversized recognized fields are bounded only once, and
all 120 focused Coding Viewer acceptance files pass. The next approved slice
reuses the existing guarded Projectile transaction for only unique,
already-authored `damage`, `pausetime`, and `guard.pausetime` values containing
exactly two signed safe integers. They stay grouped as embedded contact fields
in the same edit card. Omitted, duplicate, dynamic, capability-unresolved,
noninteger, insertion, and all other contact fields remain read-only.

New Dev approved the completed guarded contact-pair slice with the existing
single-use Projectile transaction, exact source preservation, and all 120
focused acceptance files passing. The next approved source-only slice covers
only unique, already-authored `ground.slidetime`, `ground.hittime`,
`guard.slidetime`, `guard.hittime`, and `air.hittime` signed-safe-integer
values. They remain a distinct Embedded contact timing group in the same card
and transaction. No timing relationship/default is inferred; omitted,
duplicate, dynamic, noninteger, insertion, and all other contact fields remain
read-only.

New Dev approved the completed guarded contact-timing slice after one legacy
Move Lab sentence was corrected: only the shared project profile lacks a
`guard.slidetime` override; authored Projectile and HitDef source may define it.
The regression forbids the former false engine-wide claim, and all 120 focused
acceptance files pass. The next approved source-only slice covers unique,
already-authored classic contact motion: `ground.velocity` with one or two
numeric literals while preserving its authored arity, `guard.velocity` with
one numeric literal, `air.velocity` with exactly two, and `yaccel` with one.
All use conservative finite decimal syntax in the existing transaction. No
axis/default relationship is inferred, and three-value IKEMEN 3D forms remain
deferred pending separate capability/provenance design.

New Dev approved the completed guarded classic contact-motion slice after the
shared decimal grammar was strengthened to reject regex-valid values that
overflow to non-finite JavaScript numbers. Boundary regressions cover scalar
and within-limit pair forms. The next approved source-only slice covers only
unique, already-authored signed-safe-integer `guard.ctrltime`,
`airguard.ctrltime`, `air.juggle`, and `numhits` values in a distinct Embedded
contact control group using the same transaction. `unhittabletime` remains
read-only pending classification of conflicting context-specific one-value and
pair documentation.

New Dev approved the completed guarded contact-control slice with
`unhittabletime` still excluded. The next approved source-only slice covers
unique, already-authored `airguard.velocity` with exactly two finite decimal
literals plus `ground.cornerpush.veloff`, `air.cornerpush.veloff`,
`down.cornerpush.veloff`, `guard.cornerpush.veloff`, and
`airguard.cornerpush.veloff` with exactly one finite decimal literal each.
These remain a distinct Embedded contact push group in the same transaction;
there is no insertion, default, axis inference, coupling, or cross-field
validation.

New Dev approved the completed guarded push-motion slice. The next approved
source-only slice covers only unique, already-authored, metadata-proven classic
`hitonce`, `kill`, `guard.kill`, `fall.kill`, `fall`, `air.fall`,
`forcenofall`, `fall.recover`, `down.bounce`, and `down.recover` values as signed
safe integers. The distinct Embedded contact outcome group preserves nonzero
authored integers rather than normalizing them to Boolean values and applies no
defaults, cross-field consistency rule, or runtime interpretation.

New Dev review corrected one provenance error before sign-off: `down.recover`
is a Stable IKEMEN extension rather than a classic MUGEN field. It is excluded
from this classic edit slice and remains read-only with the accurate
`IKEMEN extension · Stable 1.0` label. The other nine outcome fields retain the
approved classic guarded-edit boundary.

New Dev approved the corrected nine-field classic outcome slice. The next
approved source-only slice covers unique, already-authored `fall.xvelocity` and
`fall.yvelocity` one-number finite decimals, `down.velocity` exactly two finite
decimals, and signed-safe-integer `fall.recovertime`, `fall.damage`, and
`down.hittime` values. They remain a distinct Embedded fall/down response group
inside the same exact transaction. No insertion, defaults, axis/cross-field
inference, or coupling is permitted; `fall.zvelocity`, `down.recovertime`, and
`down.recover` remain read-only under their extension provenance.

New Dev approved the completed classic fall/down response slice. The next
approved source-only slice covers unique, already-authored `mindist`, `maxdist`,
and `snap` values as exactly two finite decimal literals plus signed-safe-
integer `p1sprpriority`, `p2sprpriority`, `p1stateno`, and `p2stateno` values.
They remain a distinct Embedded position/state group in the same transaction.
There is no insertion, axis/default inference, state-existence claim, or
relationship validation; facing and ownership-transfer flags remain deferred.

New Dev approved the completed position/state slice. The next approved
source-only slice covers unique, already-authored signed-safe-integer
`p1facing`, `p1getp2facing`, `p2facing`, `p2getp1state`, and `forcestand`
values in a distinct Embedded facing/state policy group inside the same exact
transaction. Authored nonzero and negative values remain exact; there is no
Boolean normalization, default/relationship inference, or state-ownership
claim. `forcecrouch` and `teamside` remain read-only pending explicit IKEMEN
provenance classification.

New Dev approved the completed five-field facing/state-policy slice. The next
approved source-only slice covers unique, already-authored classic `attr`,
`hitflag`, `guardflag`, and `affectteam` literals in a distinct Embedded attack
classification group. The guarded grammar accepts one state plus one attack
code for `attr`, documented hit/guard flags with a single optional trailing
hit-flag polarity, and one documented affected-team code. It preserves authored
casing and flag order and performs no insertion, normalization, reordering,
default inference, or dynamic/runtime-string evaluation.

New Dev approved the completed attack-classification slice. The next approved
source-only slice covers unique, already-authored classic `animtype`,
`air.animtype`, and `fall.animtype` values limited to the documented reaction
animation enum plus `ground.type` and `air.type` values limited to the
documented ground/air reaction enum. They remain a distinct Embedded hit
reaction types group in the same transaction, preserve authored casing, and
perform no quoting, normalization, insertion, default/inheritance inference,
or Trip/fall/velocity coupling.

New Dev approved the completed hit-reaction-type slice. The next approved
source-only slice covers unique, already-authored classic `priority`, `id`,
`chainID`, and `nochainID` values in a distinct Embedded priority/chaining
group. Priority accepts the documented 1–7 range with its optional hit/miss/
dodge class; IDs accept only their documented positive or `-1` forms. Authored
one/two-value arity and enum casing remain exact. There is no insertion,
defaulting, target/state-existence claim, or cross-field chain validation.

New Dev approved the completed priority/chaining slice and requested a
compactness checkpoint before further field expansion. Projectile guarded edit
groups now come from one frozen ordered definition table shared by host routing
and presentation DTOs. The viewer renders only groups containing authored
fields, keeps locked duplicate/dynamic fields visible, reports authored,
editable, and omitted counts in accessible summaries, collapses all but the
first authored group unless a group contains the active preview, and never
accepts presentation grouping as mutation authority. Planner vocabulary,
preview semantics, one-transaction apply, Undo, and no-autosave behavior are
unchanged.

New Dev approved the compact authored-group presentation. The next approved
source-only slice covers unique, already-authored classic `getpower` and
`givepower` values with exactly one or two signed safe integers. The distinct
Embedded power transfer group preserves authored arity and exact surrounding
bytes. There is no insertion, damage-derived default, guard-value inference,
power-cap clamping, or cross-field coupling.

New Dev approved the completed power-transfer slice. The next approved
source-only slice covers unique, already-authored classic `sparkno`,
`guard.sparkno`, `sparkxy`, `hitsound`, and `guardsound` literals in a distinct
Embedded hit presentation group. Optional authored `S` prefixes retain their
casing and exact placement. The editor makes no resource-existence claim,
common/character archive inference beyond that prefix, viewer handoff, SFF/SND
mutation, insertion, default, or runtime-string conversion.

New Dev approved the completed hit-presentation editor. Character-local `S`
spark and sound literals now also receive read-only exact handoffs from the
same compact field rows. `S` spark values open one unique action in the exact
AIR assigned by the current clean character DEF; `S` sound pairs open one
unique group/index in its standard assigned SND. Non-`S` values are labeled
engine-common and receive no route. The SND target independently rechecks the
clean DEF and sound assignment, assigned state source and exact controller,
bounded binary hash, and unique group/index before adopting a selection.
Opaque routes are single-use and generation-bound. Portable profiles, shared
FX, language voice archives, fallback files, playback ownership, writes,
clipboard changes, and SFF/SND mutation are never inferred or performed.

New Dev approved the source-complete standalone HitDef resource handoff.
Unique already-authored `S` values in `sparkno`, `guard.sparkno`, `hitsound`,
and `guardsound` now expose one compact inline route to the existing AIR or
SND viewer; non-`S` values are visibly engine-common, while omitted,
duplicate, dynamic, invalid, or new-controller values receive no route. The
route is opaque, one-use, generation- and active-selection-bound, and proves
the clean character DEF, assigned state source, exact parsed HitDef identity,
exact field/expression, and unique target action or sound on both the origin
and target sides. Visual Preview Character selection is deliberately separate
and cannot retarget authored resource ownership. Closed DEF/AIR/SND reads are
bounded before and after reading. No HitDef draft/apply behavior, asset data,
profile selection, playback, or external file is changed. All 128 focused
Coding Viewer acceptance files pass; physical UI/runtime QA remains pending.

New Dev approved the source-complete standalone HitDef state-destination
handoff. Unique already-authored nonnegative safe-integer `p1stateno` and
`p2stateno` values now expose a compact route to the one exact StateDef found
across the clean character DEF's bounded assigned state sources. The opaque
route is single-use and binds the DEF assignment inventory, exact HitDef
controller and field, target source/range, active selection, and viewer
generation; all authority is revalidated before and after opening the native
editor. Dynamic, duplicate, omitted, malformed, missing, multiply-defined,
dirty, reassigned, incomplete, and oversized cases fail closed. Preview
Character selection cannot retarget authored ownership. Live and retained
draft changes disable only their row-local state/AIR/SND exact links until the
authored checkbox and value snapshot is restored; the client never mints or
rewrites a route. No state is created, edited, renumbered, or inferred. All
131 focused Coding Viewer acceptance files pass; physical interaction QA
remains pending.

### Suggested HitDef rule — prefer `p2stateno` for hit-owned reactions when appropriate

Add an optional explanatory rule to the HitDef editor, Move Lab diagnostics,
and relevant coding assistance. When an authored hit always transfers the
victim into a custom reaction such as a wallbounce or custom knockdown, suggest
considering the HitDef's `p2stateno` instead of relying automatically on a
next-frame `TargetState`. The reason presented to the user should be behavioral,
not stylistic: `p2stateno` is processed as part of the hit/get-hit path and can
therefore preserve the intended victim-state transfer on a same-tick trade,
where a later state-loop `TargetState` may never execute.

This is guidance, never an automatic conversion or universal warning.
`TargetState` remains appropriate when the transition is intentionally delayed,
conditional, or owned by later attacker logic. Community reports also describe
MUGEN `p2stateno` interactions with `HitOverride` that can cause the move to
whiff, with projectile-controller behavior differing; an IKEMEN developer has
discussed changing that behavior, but the referenced change was not yet pushed.
Consequently the diagnostic must be engine/build-aware, identify the
trade-versus-HitOverride trade-off, and link to current pinned evidence before
offering a firm recommendation. Unknown or unverified targets receive only the
neutral explanation. Keep `p1stateno` trade behavior as a separate rule rather
than implying it shares `p2stateno` semantics. Do not rewrite HitDefs, create
states, or replace authored `TargetState` without an explicit reviewed edit.

New Dev approved the source-complete Projectile embedded-state destination
handoff. Existing authored, editable, nonnegative safe-integer `p1stateno` and
`p2stateno` rows in Move Lab now expose compact exact StateDef arrows without
adding another editor or mutation path. The shared state authority captures the
clean owner DEF, ordered assigned `st`/`stN`/`stcommon` sources, exact
Projectile controller and field, and exactly one static destination. Dynamic,
duplicate, missing, multiply-defined, foreign, dirty, stale, incomplete, and
oversized evidence fails closed. Routes reuse the existing bounded one-use
Projectile store and are revalidated before and after document opening and
immediately before native reveal. Changing a row disables both its state and
resource links until its authored value is restored; opaque routes are never
rewritten by the client. To prevent the prior multiplicative scan risk, Move
Lab takes one preflighted bounded state-inventory snapshot and builds one
declaration index per decoration generation, reusing it across every
Projectile; each state retains at most two declarations, enough to classify
ambiguity. Navigation validation still rebuilds fresh snapshots around awaits.
All 135 focused Coding Viewer acceptance files pass; installed interaction QA
remains pending.

New Dev approved the source-complete Helper starting-StateDef handoff. Existing
selected Helper creation controllers now expose one compact exact destination
arrow when their authored `stateno` is a nonnegative safe integer and exactly
one matching StateDef exists in the clean character DEF's complete bounded
ordered `st`/`stN`/`stcommon` inventory. Controller identity comes from the
exact selected source range; Helper IDs are never used to infer a state and may
remain dynamic for this read-only route, while Helper Lab's stricter static-ID
round-trip rule is unchanged. CNS carriage-return boundaries tolerate only
trailing line-ending whitespace between the two independent parsers. Opaque
routes are one-use, generation- and active-selection-bound, rebuild all
authority around document-opening awaits, and reveal the exact declaration in
the native editor without writes. Helpers and Projectiles share one bounded
declaration snapshot per decoration generation. All 138 focused Coding Viewer
acceptance files pass; installed interaction QA remains pending.

New Dev approved the source-complete selected-StateDef ChangeState handoff.
The existing StateDef card now shows a compact collapsible list of exact
authored `ChangeState` destinations. Every occurrence binds its own parsed
controller and value ranges even when multiple controllers use the same
target. Only unredirected nonnegative safe-integer values with one unique
destination in the clean, complete assigned state inventory receive an opaque
one-use route; unresolved authored cases remain visibly listed. The route also
binds the exact selected StateDef and active direct selection and is rebuilt
around each native-editor await. The full-block editor disables all transition
links whenever its draft differs, conflicts, or is pending, and exact authored
restoration re-enables the original routes without minting authority in the
client. Helpers, Projectiles, and StateDefs share one bounded declaration
snapshot per generation. All 140 focused Coding Viewer acceptance files pass;
installed interaction QA remains pending.

New Dev approved verified-Nightly RunState parity in the existing State
transitions card. RunState rows exist only for exact Nightly targets with a
verified `zss.run-state` capability and exact build identity. Stable 1.0,
contradictory stable-plus-capability, ownerless, non-exact, and missing-
capability targets omit RunState completely. On a supported Nightly, unsafe
dynamic, duplicate, malformed, redirected, or `playerno` forms remain visible
but receive no route. Safe routes bind their transition kind and exact target
capability fingerprint, so a target/capability change revokes them. CNS and all
other Nightly controllers remain outside this slice. All 141 focused Coding
Viewer acceptance files pass; installed interaction QA remains pending.

New Dev approved the source-complete incoming ChangeState-reference slice.
The selected StateDef card now shows a compact read-only list of exact classic
`ChangeState` controllers that enter it across the clean character DEF's
complete bounded CNS/ZSS assignment inventory. The reverse index is built in
the existing one-pass state-source parse, retains at most 256 routes per
destination and 4096 overall, and reports exact total/omitted counts when
truncated. Only unredirected, uniquely-valued nonnegative literal transfers
owned by an exact StateDef are indexed; dynamic, duplicate, malformed, and
ambiguous cases are not promoted as facts. Each opaque one-use route binds the
unique selected destination plus the exact origin source, owner, controller,
value, generation, and inventory, then rechecks active selection and source
authority around every native-editor await before revealing the origin
controller. Incoming rows remain available while the selected destination has
an unsaved viewer draft because they describe unchanged origin sources;
outgoing routes keep their stricter draft lock. Classic incoming behavior is
identical on Stable 1.0 and Nightly, and `RunState` incoming analysis remains
outside this slice. All 142 focused Coding Viewer acceptance files pass;
installed interaction QA remains pending.

New Dev approved the source-complete exact Function caller/callee slice. An
exact selected ZSS Function in Move Lab now has compact collapsed **Calls from
this function** and **Called by** sections. Literal calls are indexed once per
decoration generation over the already bounded ordered assigned-source
inventory; repeated, self, nested-condition/loop, Function-owned, and
StateDef-owned occurrences remain distinct, while comments and string contents
are excluded. Outgoing rows resolve only one unique assigned Function
declaration and incoming rows open the exact source call. The snapshot retains
at most 256 links per Function and 4096 routes overall; declaration and call
cardinality also have hard global ceilings, whose overflow invalidates the
whole relationship snapshot instead of exposing partial authority. Opaque
one-use routes bind direction, clean owner DEF, inventory, selected Function,
origin owner/call, unique target declaration, generation, and all exact source
ranges/hashes, with active-selection and native-open/show revalidation before
reveal. A changed, conflicted, or pending selected-Function draft disables
outgoing declaration links only; incoming authored-source facts stay usable
and independently revalidate. The projection is identical on Stable 1.0 and
Nightly and makes no runtime reachability, execution-order, recursion, or type
claim. There are no writes, insertions, renames, new viewers, or autosaves.
All 144 focused Coding Viewer acceptance files pass; installed interaction QA
remains pending.

New Dev approved the source-complete exact command-use handoff. Selected
StateDefs and Functions in Move Lab now expose a compact collapsed **Command
inputs** section for parser-proven literal `command = "Name"` uses. Repeated and
nested occurrences remain distinct; comments, ordinary strings, malformed or
dynamic expressions, foreign sources, and differently cased names are never
promoted. One immutable exact-case command-family index is built from the
assigned CMD/INP/JNP source per decoration generation and reused across every
selected behavior block. It admits at most 8,192 command definitions, 256
members per family, and 512 uses per selected block; overflow invalidates the
whole relevant snapshot rather than exposing partial authority. Same-name
definitions remain an ordered family and are never collapsed into a guessed
winner. Opaque one-use routes bind the clean owner DEF and assignment, selected
source block, exact occurrence, command source hash/open-document version,
family count/identity, active selection, and generation without duplicating
family arrays per route. The existing Command & Movelist workspace independently
revalidates the target before and after opening, then dispatches occurrence zero
through its normal `selectCommand` path so UI, host selection, Authoring Context,
toolbar, and exact-source ownership stay synchronized. Existing unapplied
command work vetoes the switch and remains byte-for-byte unchanged. The classic
literal path is identical on Stable 1.0 and Nightly. No command is created,
edited, reordered, applied, saved, or inferred, and no viewer or parser was
added. All 147 focused Coding Viewer acceptance files pass; installed
interaction QA remains pending.

New Dev approved the source-complete exact Project Symbols handoff. Selected
StateDefs and Functions in Move Lab now add compact **Inspect** controls beside
parser-proven map, variable, and constant rows inside the existing **Selected
code connections** section. One immutable bounded catalog snapshot is built per
decoration generation and reused across every block. Routes retain at most 128
items per block and bind the clean owner DEF, exact selected component/source,
catalog and item fingerprints, category, canonical identity, authored runtime
owner evidence, exact engine target/capabilities, generation, and one-use nonce.
Dirty drafts disable the controls and forged, replayed, stale, oversized,
partial, foreign, reassigned, or capability-drifted routes fail closed. The
existing Project Symbols panel independently rebuilds the assigned catalog and
focuses the exact item only after validation; stale targets leave prior browser
state and Move Lab drafts untouched. Stable 1.0 always suppresses
Nightly-gated string-only rows, even under contradictory capability input; only
an exact supporting Nightly exposes them. No source, catalog, clipboard,
workspace metadata, or save state is changed. All 150 focused Coding Viewer
acceptance files pass; installed interaction QA remains pending.

New Dev approved the source-complete exact Trigger documentation handoff.
Selected CNS/ST StateDefs and ZSS StateDefs or Functions now add one compact
**Inspect** control for each parser-proven bundled trigger used inside the
selected block. Repeated uses share one row while their exact selected source
sites remain bound in authority; comments, string contents, identifier
substrings, and structured `map`, `var`, `fvar`, `sysvar`, or `const` accessors
do not create duplicate trigger rows. The handoff reuses the same immutable
per-generation Project Knowledge snapshot, 128-route bound, one-use route
store, draft invalidation, target revalidation, and existing Project Symbols &
Contracts browser as maps, variables, and constants. Bundled top-level trigger
capability provenance survives the compact DTO and participates in catalog and
route identity. Classic trigger documentation remains visible on Stable 1.0;
capability-gated triggers are hidden for Stable, legacy-flag-only,
contradictory, ownerless, and Nightly-without-capability inputs, and appear only
for an exact Nightly target with the matching enabled capability. The feature
does not add a parser, window, recommendation, insertion, edit, clipboard
operation, save, or autosave. All 150 focused Coding Viewer acceptance files
pass; installed interaction QA remains pending.

New Dev approved the source-complete exact Controller documentation handoff.
Selected CNS/ST StateDefs and ZSS StateDefs or Functions now add one compact
**Inspect** control for each exact bundled state controller used inside the
selected block. Repeated controller uses share one row while every exact ZSS
header or CNS/ST `type` occurrence remains bound in route identity. Controller
matching and capability provenance come from the bundled catalog; the compact
snapshot retains a non-user-facing exact-match bit, so unknown or custom
controllers remain visible as unresolved Project Knowledge without receiving a
documentation authority or invented contract. Classic controllers remain
available on Stable 1.0. Top-level capability-gated controllers are absent for
Stable, legacy-flag-only, contradictory, ownerless, and
Nightly-without-capability inputs, and appear only for an exact Nightly target
with the matching enabled capability. The handoff reuses the same immutable
per-generation snapshot, 128-route bound, one-use tokens, active-selection and
draft checks, independently rebuilt target validation, and existing Project
Symbols & Contracts browser. It adds no controller-option workflow, insertion,
edit, parser, window, clipboard operation, save, or autosave. All 150 focused
Coding Viewer acceptance files pass; installed interaction QA remains pending.

New Dev approved the source-complete exact authored StateDef default-animation
handoff. An exact selected CNS/ST or ZSS StateDef in Move Lab now shows one
compact **Authored default animation** row when its own header contains exactly
one nonnegative safe-integer `anim` declaration and the character DEF's current
assigned AIR contains exactly one matching action. CNS/ST inspection stops at
the first child controller section; ZSS inspection reads only the exact
StateDef header. Omitted, dynamic, negative, unsafe, duplicate,
custom-state-marked, missing-action, and duplicate-action cases remain
unresolved without a route. The opaque one-use route binds the clean owner DEF,
assigned state source, exact selected StateDef identity/range/field, AIR action,
generation, and all source hashes. Full-block drafts disable the outgoing row.
The AIR target independently recomputes the exact StateDef identity and field,
requires the origin action to equal the requested AIR action, and revalidates
DEF assignment, source cleanliness, and the unique AIR action around opening.
The row makes no runtime reachability or custom-state ownership claim, behaves
identically on Stable 1.0 and Nightly, and performs no edit, save, clipboard,
metadata, or autosave operation. All 152 focused Coding Viewer acceptance files
pass; installed interaction QA remains pending.

New Dev approved the source-complete exact authored ChangeAnim-to-AIR handoff.
The existing Move Lab StateDef inspector now includes a compact collapsed
**Animation changes** list for exact classic CNS/ST and ZSS `ChangeAnim`
controllers. One immutable bounded index is built from the already-read
assigned state-source inventory per decoration generation and reused across
StateDefs. Repeated controllers remain occurrence-distinct. Only structurally
complete, unredirected controllers with exactly one authored nonnegative
safe-integer `value` and exactly one matching action in the current assigned AIR
receive an opaque one-use route. Omitted, dynamic, negative, unsafe, duplicate,
redirected, `ChangeAnim2`, missing-action, and duplicate-action cases remain
visible as unresolved without a route. Authority binds the clean owner DEF,
complete inventory, exact parser-proven StateDef, controller/value byte ranges,
AIR action, generation, and hashes; full-block drafts disable every outgoing
row. The AIR target independently reparses the current source, rejects Function
or arbitrary-range impersonation, reconciles LF-normalized component identity
with raw CRLF controller evidence, requires origin and requested actions to
match, and revalidates source assignment/cleanliness plus the unique AIR action.
No timing, reachability, target ownership, element selection, edit, insertion,
save, clipboard, metadata, or autosave claim is made. Stable 1.0 and Nightly
behave identically. All 154 focused Coding Viewer acceptance files pass;
installed interaction QA remains pending.

New Dev approved the source-complete exact character-local PlaySnd-to-SND
handoff. The existing Move Lab StateDef inspector now includes a compact
collapsed **Sounds played** list for exact classic CNS/ST and ZSS `PlaySnd`
controllers. One immutable bounded snapshot is built from the already-read
assigned source inventory and one assigned-SND read per decoration generation,
then reused across every StateDef. Repeated controllers remain occurrence-
distinct. Only structurally complete, unredirected controllers with exactly
one authored `Sgroup,index` literal and exactly one matching physical sound in
the current assigned SND receive an opaque one-use route. Prefixless/common,
dynamic, signed, unsafe, omitted, duplicated, redirected, missing-sound, and
duplicate-sound cases remain visible as unresolved without a route. Authority
binds the clean owner DEF, complete source inventory, exact parser-proven
StateDef, controller/value byte ranges, exact physical SND entry, generation,
and hashes; full-block drafts disable every outgoing row. The SND target
independently validates the same bounded origin envelope, reparses the exact
StateDef/PlaySnd, rechecks assignment and clean source bytes, and admits at most
65,536 declared SND entries before parsing or materializing them. Both snapshot
and target reject incomplete headers, over-limit declared cardinality, stale or
cross-bound identities, and oversized evidence before adoption. No playback,
timing, reachability, edit, insertion, save, clipboard, metadata, or autosave
claim is made. Stable 1.0 and Nightly behave identically. All 156 focused Coding
Viewer acceptance files pass; installed interaction QA remains pending.

New Dev approved the source-complete AIR Action-to-authored-code reverse
handoff. The existing AIR Source tab now shows a compact **Exact authored
uses** section above—and explicitly separate from—the heuristic **Detected
character code** findings. For the currently selected unique Action, it lists
only parser-proven StateDef default `anim` declarations and structurally
complete, unredirected literal `ChangeAnim value` controllers from the clean
character DEF's complete ordered assigned state-source inventory. CNS/ST and
ZSS occurrences retain their exact zero-based source lines; comments, strings,
Functions, arbitrary ranges, `ChangeAnim2`, redirected, dynamic, negative,
unsafe, duplicated, missing-action, and duplicate-action cases never receive
an exact route. One immutable per-refresh snapshot reads each of at most 256
assigned sources once, caps each source at 4 MiB and aggregate source bytes at
16 MiB, retains at most 4,096 uses globally and 256 per action, and fails
closed on global overflow. Opaque one-use routes bind the active session and
action, generation, clean DEF and assignment, ordered inventory, unique AIR
action, exact parser-proven StateDef and source occurrence, and all source/AIR
hashes. Native navigation consumes before validation, rechecks before and
after source-open/show awaits, shows the editor without a premature cursor
selection, verifies the returned editor and authority after expected webview
focus transfer, and only then applies the exact cursor selection. Mutation
during either await, replay, disposal, inactivity before navigation, selection
change, reassignment, source/AIR drift, dirty or incomplete inventory, and
forged identities fail closed. No code, AIR, metadata, clipboard, catalog, or
save state is changed. Stable 1.0 and Nightly behave identically. All 159
focused Coding Viewer acceptance files pass; installed layout/focus and native
reveal feel remain physical-test pending.

### Requested AIR/text animation-reference integration refinement — 2026-10-16 — design only

Keep this scope alongside, but separate from, the current P0 AIR/CLSN correctness
pass. Do not implement it as part of that pass. Reuse the source-complete exact
StateDef-default-`anim` and `ChangeAnim` forward/reverse handoffs above, the AIR
Actions Browser, and the existing immutable source index/navigation authority;
do not create a second parser, index, or route-token system.

- In supported character-code editors, a context-menu action on an exact
  animation-number expression should open the exact matching Action in the
  character's assigned AIR. The route is available only when parser authority,
  owner/assignment, literal value, and unique Action identity are exact.
- The main AIR viewer should add a compact **Used by** list synchronized with
  the selected Action. Each row should show the authored state number/name when
  available, source file, exact line/range, and caller kind, and should navigate
  back to that exact source location through the existing focus-safe route.
- The AIR Actions Browser should also expose a character-wide animation-reference
  view: every indexed animation call site across all Actions, searchable/filterable
  by Action and caller kind. Selecting an Action may filter/highlight its uses,
  but the browser must not be limited to one Action at a time.
- The main-viewer **Used by** list and the whole-character browser are two views
  over the same bounded, immutable reference snapshot. They must share owner,
  assignment, freshness, duplicate-Action, overflow, dirty-source, and route
  invalidation rules.
- Initial caller coverage must include the already-authoritative StateDef default
  `anim` and exact `ChangeAnim`. Add `ChangeAnim2` and other animation callers
  only after an authoritative controller/trigger inventory defines their runtime
  owner and target semantics; do not infer them from a name or numeric token.
- Pinned-engine research at IKEMEN GO
  `4a09f23d80bf919195a0be85a28f7356a150f20a` supplies that broader provisional
  inventory for New Dev review. Character/action caller fields include StateDef
  `anim`; `ChangeAnim.value`; `ChangeAnim2.value`; `ChangeState.anim`;
  `SelfState.anim`; Explod/ModifyExplod `anim`; projectile animation/hit/remove/
  cancel fields; spark and guard-spark fields; `SuperPause.anim`;
  `GameMakeAnim.value`; ModifyShadow/ModifyReflection `anim`; and
  `LifebarAction.anim`. Keep immediate references separate from event-dependent
  references. Shader animation-texture fields form a distinct category across
  ShaderSet, AfterImage, Explod/projectile/shadow/reflection/text families; their
  integer expressions and animation owner are independent of `shader.playerno`.
- Stage-domain action/shader references (`ModifyStageBG`, `ModifyBGCtrl`, and
  `ModifyStageVar`) remain separate from character AIR destinations.
  `ModifyBGCtrl.value` is an animation only when the targeted stage controller is
  `Anim`. Query-only references (`Anim`/`PrevAnim` comparisons, AnimExist,
  SelfAnimExist, ExplodVar/ProjVar/HitDefVar animation fields, StageBGVar
  `actionno`, and Const spark defaults) are indexed as queries, not callers or
  geometry mutations.
- Explicit exclusions: reaction `animtype` fields, `AnimElem` element numbers,
  state-number links, unregistered CreatePlatform parsing, removed
  `GameMakeAnim.anim`, and arbitrary numeric trigger arguments are not Action
  references. Implicit defaults such as MakeDust F120, SuperPause F100, and
  inherited Data sparks have provenance but no invented numeric source token.
- Owner/resource rules are consumer-specific. ChangeAnim uses the executing or
  redirected character; `animplayerno` and `spriteplayerno` are independent.
  ChangeAnim2 uses the state-owner AIR and executing-character sprites, with its
  runtime `readplayerid` exception; do not assume its shared-parser
  anim/sprite-player fields are consumed. Explod can split animation and sprite
  owners. Character, common AIR, fight FX, registered CommonFX, lifebar, and
  stage resources are distinct domains. Character AIR loads first and Common.Air
  fills missing Actions; first definition wins. Copy Action retains alias
  identity and indirect provenance rather than rewriting uses to its target.
- Prefix resolution must model empty/S, F plus `fightfx.prefix`, and registered
  CommonFX using longest match, including spaced/literal/dynamic prefix forms.
  `M` recognition is not universal resource authority; LifebarAction has its own
  unprefixed/S/CommonFX rules. Unknown or dynamic owners stay unresolved.
- Every occurrence records document/project/language/version/token span, state or
  Function, controller and field/query role, raw expression, source/animation/
  sprite owner, conditions, exact/finite/dynamic/missing/ambiguous/ignored status,
  and effective versus shadowed provenance. Use the actual DEF state-resource
  graph and configured common files, not folder search. Preserve Functions as
  Function entries; do not duplicate them into speculative states.
- Navigation offers a direct jump only for one exact target, a chooser for a
  finite proven candidate set, and expression details for dynamic references.
  Field-specific sentinels stay non-Actions. Nested expressions distinguish query
  operands from caller-result candidates. An unresolved dynamic caller prevents
  certainty that an Action is unused. Unsaved edits incrementally invalidate both
  directions, and versioned token spans disambiguate multiple references per line.
- Dynamic, redirected, common/shared, conditional, duplicate, negative, unsafe,
  and otherwise non-exact references remain visible with an explicit status and
  source location, but never receive a guessed Action route. `ChangeAnim2`, custom
  states, helper/player redirects, common AIR ownership, Functions, and shared
  support code must preserve their distinct authority instead of being flattened
  into character-local exact uses.
- This is read-only navigation first: no code/AIR edits, save, metadata, catalog,
  clipboard, or autosave side effect. Physical context-menu placement, list
  density/filter behavior, focus restoration, and installed Stable/Nightly QA
  remain acceptance requirements.

Related collision-code discovery belongs in the same integration design, without
mixing collision semantics into animation-call semantics. Preferred design for
review is one existing/reference browser with separate **Animations** and
**Collision code** views, both backed by the same source inventory and navigation
authority, plus compact selected-Action related entries in the main AIR viewer.
Collision rows should include state/file/line, controller/query category, redirect
and owner context, and click-through to source. Inventory candidates include
`OverrideClsn`, `TransformClsn`, per-box `HitBy`/`NotHitBy`, collision-related
`HitDef`/`ReversalDef` fields, size/push/helper/projectile context, and collision
queries, classified separately; queries must not be presented as geometry
mutations. Every relationship must be labeled as statically proven, same-state
co-occurrence, dynamic/conditional, global/shared, or unresolved. Never claim
that collision code affects the selected Action merely because it occurs in the
same StateDef. Preserve triggers, redirects, shared/negative states, Functions,
and owner/runtime-context uncertainty.

Keep the main AIR viewer uncluttered: one compact collapsible reference summary
for the selected Action, with detailed lists and filters in the References
browser. When the index identifies no connection, show **N/A** as “no identified
connection,” never as proof that no dynamic/runtime use exists. Offer **Connect
manually** for user-supplied associations. Manual links are visibly labeled,
remain separate from automatically proven references, use existing project/
workshop metadata conventions rather than modifying character source, and must
define stable identity, moved/deleted-anchor handling, reconnect/remove, stale
and cross-character rejection, and precedence if an automatic reference later
appears.

### Selected-box hit-region semantic connections - 2026-10-18 - New Dev review

Implementation status (0.79.139): the non-physical slices are complete. A
frozen bounded SF6 provider and selected-box evidence model now distinguish
source-proven, candidate, and unresolved meaning; index and ownership scope;
and the explicitly unresolved runtime boundary. The existing compact AIR
browser shows one selected-box badge, collapsed diagnostics, and deduplicated
one-use exact-source routes for configured High/Low, literal region/immunity
assignments, dynamic `ClsnVar`, group-wide `ClsnOverlap`, and bounded Function
call chains. The main AIR viewer's compact `Clsn ↗` control carries the exact
Action, frame, group, and effective slot into that same Code connections
browser. Nested collision selection continues to cycle every overlapping
individual box, including multiple boxes of the same family.

Automated coverage now includes current-template High/Low fixtures, unnamed
Clsn2 and Clsn1 candidates, invalid overlaps, stale and one-use routes,
duplicate/dynamic/conflicting assignments, unrelated-state isolation,
authored-label/effective-slot mismatch, inherited/default ownership,
OverrideClsn/TransformClsn context, compact route overflow, accessibility, and
exact main-viewer handoff. Only the physical scenarios listed at the end of this
section remain open; their outcome may refine wording or target-specific
provider rules but does not block source-backed inspection.

Extend the existing AIR **Code connections** view so a selected effective
collision slot can explain project-defined meanings such as High, Low, Default,
regional immunity, and the shared `ClsnVar` / `ClsnOverlap` consumers that may
use it. This is a compact evidence projection inside the existing AIR viewer and
its one companion browser, not a new window, runtime simulator, or universal
meaning assigned to every collision index.

Current-template evidence establishes the initial fixture and limitation:

- `sf6_game_options.zss` configures `Clsn2[2]` as High and `Clsn2[0]` as Low.
- `sf6_hit_regions.zss` iterates dynamic `$hurtIndex` and `$attackIndex` values
  through `ClsnVar`; its `StateDef -4` performs group-wide `ClsnOverlap` checks.
- No current literal `SetHitReactionRegion` or `SetRegionImmunity` call exists
  outside the function declarations. A selected `Clsn2[3]` therefore has no
  authored named-region assignment; it is only a candidate member of the
  dynamic hurt-box loop. `Clsn1` boxes are attack-loop candidates and must never
  inherit Clsn2 High/Low names.

Preserve three independent evidence axes on every connection:

1. **Source meaning:** `SOURCE-PROVEN`, `CANDIDATE`, or `UNRESOLVED`.
2. **Scope:** exact StateDef/Action candidate, character-wide configuration,
   shared Function, or global/negative StateDef.
3. **Runtime result:** unresolved unless a later explicit physical-session
   evidence system observes it. “Exact” means an exact source span or literal
   argument, never proof that the code executed or a hit occurred.

Implement in staged, separately reviewable portions:

1. Define a frozen, bounded evidence contract for selected AIR/action occurrence,
   element, collision family, effective slot, authored label, ownership, source
   hashes, omissions, `RegionMeaning`, and ordered `EvidenceStep` records.
2. Add a project/provider adapter for the `JNP_SF6_*` conventions. Recognize
   unique literal configuration-map writes, literal
   `SetHitReactionRegion(index, 1|2|3)`, literal
   `SetRegionImmunity(index, mask)`, managed `StateDef -4` markers, Function
   declarations/calls, and dynamic loop-index comparisons. Decode High/Low/
   Default and immunity bits while retaining the raw value and exact route.
   Project meanings and colors belong to the provider/profile, not the universal
   collision core.
3. Join only conservative evidence: literal effective slots to literal
   assignments; Actions to StateDefs only through the existing proven Action
   authority; shared Functions and negative states as candidate/global evidence;
   and bounded Function/map writer-reader chains. Downgrade on duplicate
   declarations, conditional or multiple writers, dynamic arguments, custom
   states, redirects, incomplete inventory, or stale/dirty snapshot mismatch.
4. Add one compact selected-box meaning/status badge and link-count icon to the
   AIR viewer. An optional canvas tag may show `[2] HIGH`, but must use text plus
   pattern/accent and must not recolor or replace the established Clsn1/Clsn2/
   Size colors. Detailed cards stay in **Code connections**, with a **Selected
   box** filter or collapsed **Meanings** section grouped by Proven, Candidate,
   and Unresolved. Each claim has **Open exact source** or an explicit reason no
   exact route exists.
5. Order the detail chain for comprehension: selected authored/effective slot
   and ownership; exact/candidate Action or StateDef links; literal region
   assignment or project-default map; Function call chain; map writers/readers;
   then the explicit unresolved-runtime boundary. For `Clsn2[3]`, show “No named
   assignment found,” candidate dynamic-loop consumers, the configured `[2]`
   High and `[0]` Low context, and runtime participation unresolved.
6. Add diagnostics without automatic repair: conflicting High/Low assignments,
   one index with multiple meanings, assignments beyond available effective
   slots, authored-label/effective-slot mismatch, and slot/ownership changes
   caused by Default inheritance, `OverrideClsn`, or `TransformClsn`.

Reuse `air_action_usage_authority`, bounded `function_call_authority`, Project
Symbol Catalog / Map Registry writer-reader evidence, the existing one-use source
routes, and `air_collision_inspection_model` effective-slot ownership. Add only a
small semantic-region projection layer that joins frozen source-hashed snapshots.

Acceptance fixtures:

- Current template: `Clsn2[2]` shows source-proven configured High plus candidate
  consumers and runtime unresolved; `Clsn2[0]` likewise shows Low; `Clsn2[3]`
  shows no named assignment and dynamic-loop candidates only; no Clsn1 slot gains
  a hurt-region name.
- A unique, literally linked `SetHitReactionRegion(3, 2)` in a proven State/Action
  path shows Forced Low with an exact route while execution remains unresolved.
- Dynamic assignments, duplicate Functions, multiple map writers, negative/
  shared callers, redirects, incomplete inventories, and stale routes never
  receive source-proven selected-box status.
- Default/inherited and runtime override/transform slot changes either preserve
  exact ownership or visibly downgrade with a reason. Every displayed claim has
  a route or a stated limitation, and stale routes fail closed.
- The main viewer remains one badge/icon; overlays are optional, accessible,
  non-color-only, and compact at dock widths.

Later physical testing must cover configured `[2]`/`[0]`, literal per-state
overrides, interrupted-state cleanup, negative-state evaluation during Pause and
SuperPause, facing/scale plus `TransformClsn`/`OverrideClsn`, helpers/redirects,
immunity masks, Simul gating, and inherited/default/Copy Action slots. Optional
debug instrumentation must be explicit, removable, and never presented as an
ordinary authoring requirement.

### Requested AIR Layers browser - 2026-10-16 - design addition

Add an optional Layers internal view in AIR's single companion browser for
previewing stacked AIR content without cluttering the main viewer. Never open a
second browser for Layers. Its bounded MVP should support multiple animation
instances, named layer groups, reorder/grouping, visibility/solo, independent
offset/transform and timing/synchronization controls, alpha/blend preview
controls, and transparent or solid backgrounds. Preserve each layer's AIR/SFF/
palette provenance and distinguish authored base blend from preview overrides.
Preview stack/group order is not engine `sprpriority`, `layerno`, Explod ownership,
or proof of runtime draw order. Do not serialize unsupported AIR fields or generate
Explod code. Persist compositions in existing project/workshop metadata. Reuse
existing rendering, palette, layer, and navigation infrastructure where present.
New Dev must define MVP bounds and tests for blend order, grouped transforms and
timing, duplicate instances, missing/stale sources, persistence, and stated pixel/
compositing parity limits; this is not authorization for a full runtime simulator.

#### AIR Alignment Layers and editable onion offsets — clarified 2026-10-24

New Dev reviewed the existing implementation twice and conditionally signed off
on a narrower, sequential alignment workflow. Keep three concepts visibly
separate:

- **Sprite-bank preview layers** are the existing `group + 10000 × bank` visual
  substitutions. They share the focused AIR element's X/Y and do not own an
  independently writable AIR offset.
- **Alignment layers** are exact authored `{AIR file, Action, element}` references.
  They may be checked together for visual alignment; one is the gold primary and
  additional selected targets are blue.
- **Onion layers** are exact adjacent authored AIR elements. Moving an onion
  explicitly edits that element's AIR X/Y; it is not a hidden viewer-only offset.

The first implementation is **element alignment**, not synchronized playback of
whole Actions. Do not describe it as animated alignment. A later animated-layer
stage must separately define each layer's starting element/tick, loop, hold, and
`-1`-duration behavior before it may be presented as synchronized Action playback.

Expose Alignment Layers as an internal view of AIR's one companion browser. Add
the layer commands to the existing collision-owned AIR canvas menu; do not create
a competing context menu. The commands remain available when no CLSN is beneath
the pointer. Mirror SFF access with Base and visible onion/alignment move-target
checkboxes, Select all visible, Base only, Add layer…, Remove layer…, and Show
Alignment Layers. Preview visibility and move-target selection are separate
states. Hiding or removing a preview never mutates AIR, and unchecking/removing
the primary chooses the next visible selected target deterministically, falling
back to Base. Add/remove opens or focuses the browser view, floats only when the
browser was closed, and preserves an existing docked/floating state. Removing a
layer removes only the preview reference and never deletes an AIR element.

The existing four sprite-bank slots in the AIR viewer remain visibly separate,
non-writable preview substitutions and synchronize with the browser without being
promoted to independent AIR layers. Selecting a bank for movement resolves only
to its owning base AIR element and the UI must say that every bank preview shares
that element's offset.

Dragging or arrow-nudging applies one common delta to the deduplicated exact AIR
elements in one WorkspaceEdit/Undo batch. The first stage is constrained to one
AIR file. Cross-file selection is refused with every involved filename shown.
Before cross-file editing is later enabled it must preview all filenames and use
one reviewed multi-document WorkspaceEdit/Undo batch; it must never imply that a
save occurred. The live open document, including unsaved text, is authoritative
for source fingerprints. A successful edit atomically rebinds selected references
to the resulting document/version; unrelated edits invalidate them.

Collision coordinates remain untouched and AIR-axis-relative. Playback freezes
before a layer edit. An active collision edit draft blocks layer movement, and
CLSN handles, current-sprite X-drag, and layer dragging have explicit non-
overlapping hit/gesture priority. Onion mode is read-only merely by being enabled;
an onion becomes writable only after explicit move-target selection. Freeze its
exact identity for the complete drag/nudge and never chase the adjacent playback
frame. Arrow keys act only while the canvas owns focus and no text/form control is
active: arrows move one AIR unit and Shift+arrow uses the shared larger-step
preference. Escape restores every target to the complete pre-gesture state.

Reject stale source fingerprints, duplicate Action definitions, Copy Action
aliases, blank or missing frames, excessive target counts, and any target whose
exact provenance can no longer be proven. The browser is the controller; the AIR
viewer owns interactive dragging and the authoritative reviewed edit. Persist only
bounded preview composition and selection metadata, keyed by canonical AIR path
plus source identity. Rename/delete/stale paths fail closed, and preview metadata
never enters AIR text.

Every right-click action must also be available in the browser through a keyboard-
accessible target list. Restore focus clearly after browser handoff, announce
successful edits and refusals through an ARIA live region, and show visible AIR
filename, Action, and element labels. Right-click is never the only route.

Required tests cover multi-select/deduplication; explicit onion edits while enable-
only remains read-only; one-batch Undo; unchanged collision bytes; stale/duplicate/
alias refusal; post-edit self-rebinding versus unrelated external-edit invalidation;
unsaved-document authority; single-file cross-file refusal; collision-menu
coexistence with and without a box beneath the pointer; playback freeze and gesture
arbitration; bank non-mutation; preview visibility versus move selection; primary
fallback; browser reuse and state restoration; stale metadata cleanup; keyboard,
focus, ARIA, and Escape behavior; and autosave safety. With autosave off, only the
exact edited AIR document becomes dirty. With autosave on, no other connected AIR
may be saved or overwritten.

Architect shared semantic/rendering services for reuse by the AIR viewer, Move
Lab, and Helper Lab: reference lookup/navigation, collision inspection/manual-link
metadata, and layered animation preview should have clear common interfaces while
each lab keeps its own UI/workflow. Inspect existing lab architecture first and
extend established components. Reuse planning does not activate deferred lab
features or authorize implementing every consumer now; shared changes require
regression coverage for existing consumers.

### Held AIR viewer connected-tools/QoL batch - 2026-10-17 - design review only

Keith authorized this consolidated batch for New Dev suggestions and quality-of-
life expansion. It extends the shared References/Layers architecture above; it
does not authorize implementation, installation, release, live-project edits,
SFF resumption, or activation of deferred labs. New Dev must identify what is
already implemented in the current checkout versus proposed work.

- Provide exact AIR-frame to SFF-sprite and Palette Workshop navigation with
  source/context authority. Consider optional compact sound-list and palette
  browsers within AIR for search/filter, audition, assignment, and preview
  without forcing full editor tabs.
- Design authored sound cues at exact frames/ticks using AnimElemTime-oriented
  timing. This is code generation/update, not preview-only. Animation number may
  seed the default SND group, while sound index and exceptions remain explicit.
  Reuse state/file/line connectors for one, selected, or all connected uses;
  preview affected locations and prevent duplicate cues.
- Support combined connected-source views (character AIR, common FX, and other
  assigned sources) while retaining per-source identity for duplicate Action IDs.
  Share sorting, filtering, and focus controls across viewers where practical.
- Add form-aware filtering from maps/vars plus manual form/code bindings, with
  inferred/dynamic conditions labeled. Include RemapPal-aware palette preview
  and RemapSprite/custom-bank filtering with manual overrides for unresolved
  conditions.
- Preserve the previously signed exact text/AIR, collision-code, compact Used-by,
  optional References-browser, N/A, and manual-association design. Keep source,
  owner, resource-table, dynamic, and ambiguous distinctions.
- Preserve the separately staged Layers design for named groups, stacked blends,
  costume Explods/FX, timing/order/visibility/solo/transforms, and reusable
  services for AIR/Move/Helper/other labs without activating those labs.
- Add Transform Code links for AngleDraw and verified angle/scale controllers.
  Model start/end X/Y scale and angle over actual ticks. Provide 2D rotation-pivot
  assistance: draggable visible pivot, exact numeric X/Y, direction, and guides;
  do not imply 3D rotation.
- Consider one optional tick-level timeline shared by transforms, fades, sounds,
  and layers: every tick/frame boundary, scrub/step, start frame, and intra-frame
  tick. Cover AIR-native scale/angle/interpolation and controller-based transforms;
  MUGEN 1.1 AIR support is not SFF-v2.1-only. Keep shared AIR edits separate from
  per-use generated code.
- Support transparency/blend fades with explicit start/end/duration, including a
  held sprite or an effect starting inside a frame. Across selected frames allow
  manual duration changes or redistribution to an exact requested total with
  remainder ticks visible. Define final hold/reset/repeat behavior. Prefer native
  AIR or Explod interpolation where semantically valid instead of mandatory
  per-tick duplication; respect blend-specific restrictions.
- Review reusable tracks for X/Y offsets and motion paths, PalFX hue/color/pulse,
  and AfterImage; partial-element entry/freeze/hitpause preview assumptions; an
  authored-versus-effective frame inspector (sprite, duration, offsets, flips,
  scale, angle, alpha, CLSN counts, total/current tick); Copy Action source/
  dependent navigation and affected-action warnings; and dark/light/checkerboard
  blend-comparison backgrounds.
- Collision editing/preview should select by type/index, numerically edit boxes,
  and distinguish default versus frame-specific ownership. Compare authored AIR
  boxes with effective OverrideClsn/TransformClsn results, including add/remove,
  scale, rotation, and pivots. Keep visual and collision transforms separate;
  keep AIR Clsn1/2 separate from runtime Size/Dummy boxes. Optional second-pose
  geometric overlap must not claim guaranteed hit eligibility.
- Include width, height, and pushbox editing/preview through existing overlays,
  with linked code/value provenance, defaults versus state override, independent
  visibility/selection, and tick-by-tick changes.

UI constraint: keep the main AIR viewer sparse. Put necessary controls in a
collapsible area beneath current options. Use compact color-coordinated icon
buttons, never full-text buttons there; every icon needs hover details, an
accessible name, keyboard-focus help equivalent, and non-color-only meaning.
Detailed controls belong in optional browsers/timeline panels.

New Dev review must consolidate overlap into reusable semantic, timeline,
rendering, navigation, and metadata services; suggest further AIR/CLSN QoL;
identify unsupported/runtime-dependent behavior; retain pinned-source cautions
(including the TransformClsn wiki-default mismatch); and propose staged scope and
acceptance evidence without starting implementation.

### AIR assistance and CLSN generation addendum - 2026-10-17 - active/source progress

#### Active AIR-goal scope amendment - 2026-10-17

Keith has moved the newly approved AIR collision backlog into the active AIR
update goal. Implement it only in small New-Dev-reviewed checkpoints after the
signed References boundary. Active source-testable scope now includes verified
per-index Nightly collision properties; remaining collision controller/query
references such as `ClsnOverlap`, `ProjClsnOverlap`, `ClsnVar`, Dummy,
`OverrideClsn`, `TransformClsn`, `HitBy`/`NotHitBy`, and
`HitDef`/`ReversalDef` families where pinned source supports them; compact
authored-versus-effective collision inspection; numeric/default-versus-frame
editing; and transformed/scaled/rotated collision previews with explicit pivots
and axis-aware calculations. Relevant verified Character Features must share the
same Stable/Nightly capability gate. Stable 1.0 projects must not see or receive
Nightly-only fields.

This amendment does not weaken the sparse-viewer rule, authorize guessed runtime
semantics, or turn offline model tests into physical engine certification. Use
compact accessible entry icons and the one reusable AIR companion browser for
detailed tools. Installed UI behavior and actual IKEMEN runtime results remain
clearly recorded physical-test gates. The optional Layers compositor and paid/AI
provider integration remain separately staged unless Keith activates them in a
later goal amendment.

The active goal must retain these concrete deliverables rather than collapsing
them into a generic "collision support" item:

1. Finish the ownership-safe single-box editor foundation first. Every edit must
   start from the host-rebuilt dirty AIR document, distinguish local, declared
   Default and inherited Default ownership, materialize inherited sets without
   losing sibling boxes, and keep reviewed `WorkspaceEdit` as the only writer.
2. Add direct selected-index property inspection and authoring for every
   source-verified Nightly collision-index feature. Selecting a Clsn1/Clsn2 box
   in the AIR canvas or browser must configure the matching native code target;
   it must not invent per-box meaning for group-wide controllers or queries.
3. Cover `Dummy` as a separately capability-gated logic collision family and
   cover `ClsnOverlap`, `ProjClsnOverlap`, `ClsnVar`, `OverrideClsn`,
   `TransformClsn`, `HitBy`/`NotHitBy`, `HitDef`/`ModifyHitDef`,
   `Projectile`/`ModifyProjectile`, `ReversalDef`/`ModifyReversalDef`, and other
   pinned-source-proven collision consumers. The editor must explain when a
   selected index is only context because the native syntax is group-wide.
4. Preview and visually edit source and transformed collision geometry,
   including OverrideClsn rectangle positioning and TransformClsn scaling and
   rotation. All calculations must use the
   correct AIR/sprite axis as the pivot and show that pivot; never rotate boxes
   around the canvas origin by accident. Original and transformed geometry must
   remain simultaneously distinguishable and source-linked.
5. Add a compact collision-properties/consumers screen inside the existing AIR
   companion browser for detailed fields, affected-code references, warnings and
   review. Keep only stable quick actions and selection/status in the main AIR
   viewer. Do not add another top-level window or an unbounded row of buttons.
6. Reconcile all applicable entries in the pinned IKEMEN Character Features
   evidence with the same target/capability policy. Stable 1.0 hides Nightly-only
   controls and generation rejects them; unknown or mismatched builds fail
   closed with source guidance.
7. Keep runtime truth honest. Static previews may show exact authored and
   known-input geometry, but redirects, triggers, player/projectile ownership,
   ordering, overlap results and hit eligibility remain unresolved unless the
   pinned evidence actually proves them. Physical IKEMEN validation remains an
   explicit later acceptance gate, not a prerequisite for source-testable UI,
   parsing, planning, navigation and reviewed-write work.

Each numbered portion requires its own New Dev pre-review and post-review. The
implementation may split a portion further when that produces a smaller safe
checkpoint; it may not silently defer one of these deliverables back to the
general backlog while this AIR goal remains active.

New Dev signed the amended goal boundary on 2026-10-17 with this checkpoint
order:

- **C13C:** complete exact host-rebuilt ownership/effective-geometry preparation
  for the existing one-box Clsn1/Clsn2 editor.
- **C14A:** build a pure exact replacement planner for an already-authored
  per-index ZSS collision property; no write or new destination guessing.
- **C14B:** expose that planner through one compact **Properties** view and reuse
  the existing C11 reviewed Apply authority.
- **C15A:** build the pure known-input geometry/plan layer for OverrideClsn
  rectangle positioning plus `TransformClsn`/Dummy scale and axis-pivoted
  rotation. Pinned TransformClsn source exposes no translation field.
- **C15B:** add one separately reviewed, capability-gated runtime-controller
  edit path without creating a second mutation owner.
- **C16:** finish read-only Dummy/overlap workflows first. Query insertion is a
  later sub-checkpoint and requires an explicit, exact destination-anchor design.
- **C17:** audit and connect the remaining collision consumers plus applicable
  Character Features parity. For the official Character Features page, AIR
  relevance is limited to Copy Action and verified collision constants,
  size/depth/push links; unrelated engine features do not enter this goal.
- **C18 (activated in the goal on 2026-10-18):** selective acceptance of
  generated multi-frame collision proposals. New Dev signed the staged boundary:
  C18A pure acceptance plan, C18B compact read-only selection/review, C18C
  one-use authority plus the shared sole-mutation-owner prerequisite, then C18D
  Apply integration. Each sub-checkpoint keeps its own pre/post review gate.
  Activation does not authorize a second writer, deletion/full replacement,
  inference/AI expansion, or claims of physical IKEMEN certification.

  **C18A completed and post-review approved on 2026-10-18.** The pure planner
  regenerates C13 evidence from the immutable AIR source, accepts only exact
  unlocked proposals, preserves unaccepted boxes, materializes inherited
  Defaults locally, requires a complete identical cohort before one shared
  Default write, and emits at most one bounded baseline-relative patch. It has
  no mutation authority or UI. Pre-C13 and post-normalization work caps prevent
  hostile source-by-target rebuild growth; partial proposal evidence and either
  over-cap patch side fail closed.

  **C18B completed and post-review approved on 2026-10-18.** The existing
  compact Collisions > Assistance surface now supports explicit frame/group/
  box selection, separate safe-integer rectangle drafts, target/group/box
  arrows and sliders, adjusted overlays, and an exact dirty-source host review.
  Whole-group intent stays distinct from selected-box intent. The bounded
  128-KiB public review shows exact before/replacement sides, omissions,
  ownership, inherited-local materialization, and declared-Default cohorts;
  drafts/reviews remain session-only. Exact Action/request/proposal binding and
  view/source/capability lifecycle revocation suppress stale work. This remains
  read-only and exposes no token, Apply, save, route, second writer, or mutation
  authority. C18C remains separately gated.

  **C18C1 completed and post-review approved on 2026-10-18.** A separate pure
  Assistance Apply authority now accepts only the exact deeply frozen C18A
  ready-plan schema, one exact source snapshot and one frozen document/session
  binding. It proves the full source fingerprint/length, exact narrow patch
  slice and reconstructed result; whole-document replacement, deletion and
  forged source evidence fail closed. Parsed AIR ownership must reproduce every
  declared-Default owner and inheritor in the reviewed cohort, so a rehashed
  plan cannot hide a collateral frame. Authorities use one cryptographically
  random consume-before-validation token, with explicit revoke and exact
  same-review checks. No token or Apply control is exposed to the browser yet.
  C18C2 is now the active prerequisite: consolidate the already reviewed AIR
  mutation paths behind one bounded editor-patch executor without changing
  their policies or UI.

  **C18C2 completed and post-review approved on 2026-10-18.** C12B3 AIR
  geometry edits and the C11/C14/C15 connected-code insertion/replacement/
  approved-removal paths now delegate their final operation to one host-only
  reviewed workspace-patch writer. The helper accepts one deeply frozen exact
  descriptor, rechecks normalized file identity, open/closed version and dirty
  state, full before/after hashes, the bounded narrow slice and editor offset
  round trips, then submits exactly one insert or replace with no intervening
  await. It never saves and reports rejected or mismatched postconditions
  without claiming rollback. Existing authority, modal, lifecycle, and public
  behavior remain caller-owned. C18D remains separately gated before any
  Assistance Apply button, token publication, or endpoint is introduced.

  **C18D completed and post-review approved on 2026-10-18.** Selective
  collision-assistance proposals now have a compact, session-only Apply control
  backed by separate review and host-issued Apply nonces. The host consumes the
  one-use authority before validating the exact Action, proposal, acceptance,
  document/session, source, and capability bindings. Open and closed AIR sources
  use bounded snapshots; a closed source is reopened only for the final shared
  writer step and receives an immediate post-open proof before submission. The
  operation applies one narrow editor patch, never saves explicitly, and retains
  one normal editor Undo step. All 79 AIR tests, the source syntax check, and the
  scoped diff check pass. Physical UI, Undo, Auto Save, and engine-result QA are
  deferred until Keith's test pass; any further AIR backlog slice requires its
  own New Dev design gate.

  **C19 completed and post-review approved on 2026-10-18.** The existing
  Collisions > Assistance screen now provides compact, exact individual-box
  Protection for filled original/effective slots. Locks use exact frame,
  Clsn1/Clsn2 and authoritative slot identity, preserve the effective target
  rectangle across Generate/Refresh, count against independent caps, and remain
  non-editable and ineligible for acceptance. They are session-only and
  source/capability/Action-bound: persisted browser/project state omits them,
  while control, target, source, capability, mode, panel and lifecycle changes
  fail closed or clear them. Unfilled/missing slots and locked-over-cap cases
  remain explicit conflicts without retargeting or silently changing caps.
  Toggle changes synchronously revoke proposal, review and one-use Apply
  authority. New Dev verified the exact hashes; all 74 current AIR test files,
  focused Assistance suites, syntax and scoped diff checks pass. Physical UI
  feel remains later QA; the next AIR part is separately gated.

  **C20A completed and post-review approved on 2026-10-18.** A new pure,
  non-writing ZSS condition inventory and planner can bind one exact ordinary
  `if`, `else if`, or `ignoreHitPause if` condition inside one exact assigned
  `StateDef`, then propose the narrow byte-preserving form
  `(<original>) && (<reviewed query>)` for a frozen C10 `ClsnOverlap` or
  `ProjClsnOverlap` recipe. It accepts exact dirty open-document evidence,
  preserves LF/CRLF and no-final-EOL sources, verifies the proposed query and
  anchor by reparsing, and keeps original-condition evaluation first. It rejects
  CNS, Functions, `@customstate`, duplicate StateDefs, multiline/comment-bearing
  or malformed conditions, stale hashes/versions/anchors, unavailable Stable
  `Dummy`, unknown/mismatched capability evidence, cap overflow, accessors,
  cycles, sparse arrays, symbols, non-finite numbers and proxies without
  executing getters or proxy traps. The public plan contains one bounded patch,
  context/omission counts and full before/after hashes, with every side-effect
  flag false and no Apply authority. New Dev approved the exact source/test
  hashes after hostile probes; the focused suite and all 75 AIR test files pass.
  C20B remains separately gated before any compact Properties destination UI or
  Apply integration.

  **C20B completed and post-review approved on 2026-10-18.** The existing
  Collisions > Properties > Queries surface now contains one collapsed,
  session-only Condition destination review with cohesive StateDef/condition
  selects, arrows and sliders. It inventories only exact assigned ZSS sources,
  binds a selected authored condition to the current C10 query recipe, and shows
  the bounded C20A `AND` preview through text-only rendering. CNS, dynamic,
  duplicate, custom-state, malformed, stale, oversized and capability-mismatched
  evidence fails closed. The exported inventory independently enforces the
  128-source and byte/state caps, exact source hashes/schema, and canonical
  capability fingerprint, including substituted service evidence. View,
  selection, property, source, capability, refresh, disposal and disclosure
  lifecycles invalidate late work; no selection, source authority or plan is
  persisted. There is no Apply, Copy, Open, Save, route, token, writer or
  mutation authority in this checkpoint. New Dev approved the exact hashes
  after proxy/cap/service-seam and generated-client VM probes; all 76 current
  AIR tests, source syntax and scoped diff checks pass. C20C remains separately
  gated before any query-condition Apply control or endpoint.

  **C20C1 completed and post-review approved on 2026-10-18.** The shared
  connected-code one-use authority now recognizes only an exact, deeply frozen
  C20A `query-condition-replace` plan. Before issuing a nonce it independently
  regenerates C20A from the exact C10 projection, assigned ZSS snapshot,
  destination and anchor and requires complete semantic equality. It verifies
  the narrow replacement, source/patch/output bounds, full-document exclusion,
  exact panel/selection/review/source binding, matching open/dirty policy and an
  exact `nightly-indexed` target. Stable, unknown, known-base, capability/source
  drift, consistently rehashed forgeries, mutable/accessor/proxy/cyclic data and
  an already-active authority fail closed. Public data is limited to the one-use
  token and `Apply reviewed AND condition…` label; no UI or writer was added in
  C20C1. New Dev approved the corrected exact hashes; all 77 current AIR tests,
  source syntax and scoped diff checks pass. C20C2 host/client regeneration,
  compact Apply control and sole shared-writer integration are now authorized
  under their separate signed contract and still require post-review.

  **C20C2 completed and post-review approved on 2026-10-18.** The existing
  compact Condition destination now exposes one hidden-by-default `Apply
  reviewed AND condition…` control only for an exact ready C20A plan plus a
  current one-use authority. A host-monotonic Apply request is sealed into the
  authority request/binding and returned with only that nonce, token and label; the
  generated client uses primitive, non-coercing correlations and cannot let an
  older modal completion clear a newer review. Apply consumes first, regenerates
  the complete C8/C10/C20A and assigned-source evidence before and after the
  modal, enforces dirty-open or clean-closed source identity, and calls the sole
  reviewed workspace-patch writer exactly once with one narrow replacement. It
  never explicitly saves and expects one ordinary VS Code Undo. Stable/unknown
  targets, malformed/replayed requests, selection/source/AIR/DEF/capability
  drift, closed/open races, newer-authority races, writer rejection and
  postcondition mismatch fail closed. No arbitrary expression editing, OR/NOT,
  removal, synthesis, CNS editing or batch Apply was introduced. New Dev
  approved the exact corrected hashes after the expanded host/client matrix;
  all 78 AIR test files, source syntax and scoped diff checks pass. C20 is source
  complete pending installed VS Code and pinned-Nightly engine physical QA.

  **Active AIR goal source closeout approved on 2026-10-18.** New Dev audited
  all seven activated deliverables and their C13C-C20 checkpoints and found no
  remaining source implementation gap. The only remaining acceptance work is
  installed VS Code interaction QA and pinned-Nightly physical engine testing;
  those deferred checks must not be represented as completed runtime
  certification.

### AIR backlog reconciliation and Alignment Layers source closeout — 2026-10-25

The AIR backlog was re-audited against the current source before adding another
surface. Collision selection/editing, pushbox routing, exact source navigation,
action browsing, thumbnails, onion skin, Undo/Redo, and the one reusable AIR
browser already have owners and focused coverage; they must not be rebuilt as
parallel tools. The broader connected-sound/cue, synchronized multi-Action
playback, cross-file edits, and shared future-lab work below remain explicitly
held design, not hidden release work.

The genuine missing first-stage alignment workflow is now source complete:

- **Alignment Layers** is an internal view of AIR's existing companion browser
  and is reachable from the AIR canvas menu/header. It uses exact AIR
  `{Action occurrence, element}` identities and source/default sprite palettes;
  no second browser or competing draft exists.
- Base, added exact elements, and bounded adjacent onion elements have separate
  **Show** and **Move** state. Bulk actions cover Select visible, Base only,
  remove added layers, and refresh. Zero selected targets stays zero—Base is
  never moved implicitly.
- X/Y controls, buttons, and focus-scoped arrow keys apply one common reviewed
  delta; Shift uses ten units. One host owner performs one whole-document
  WorkspaceEdit, so the result is one normal Undo step. Cancel, stale source,
  duplicate/alias/blank identity, missing sprite, zero delta/targets, concurrent
  edit/save, and superseded preview requests fail closed.
- Successful movement rebinds the complete working composition to fresh exact
  frame identities: added references, onion depth, visibility, selection, and
  primary choice survive the refresh. Old frame keys are never reused or chased
  after unrelated source drift, removing the need to reconstruct layers after
  each nudge.
- Preview image decoding and host publication are latest-request-wins. A late
  request cannot change the selected Action or replace a newer overlay. Missing
  sprites and source/default palette provenance remain visible in the browser.

Directly dragging overlay layers on the canvas and synchronized animated layers
remain separate later interaction stages; the reviewed numeric/keyboard move is
the complete first-stage mutation path. No cross-file writer, runtime simulation,
generated code, package/install, or live character-asset edit is implied.

Source verification: syntax checks and all 99 local `*air*.test.js` files pass,
including executable host coverage for cancellation, source drift, both
confirmation-time lock races, zero targets, exactly one successful edit,
post-edit semantic rebind, and stale preview suppression. Installed VS Code
interaction and pinned-engine physical QA remain unclaimed. New Dev independently
reviewed the final source and issued explicit source-code signoff with no
remaining blocker in this closeout scope.

The host-only reviewed workspace-patch writer remains the sole final editor
executor. C12B3, C11, C14, C15 and C18 retain their separate policy/authority
ownership. Stable hides Nightly-only fields, unknown targets fail closed, and
no checkpoint may claim live runtime truth from a static plan.

Keith requested New Dev expansion/QoL review for optional assistance that reduces
work rather than adding setup. This does not authorize implementation, paid AI,
installation, or deferred work.

- Consider optional AI assistance for rotation, transparency/blending, and
  animation creation. Explicitly separate authoring/timing/compositing assistance
  from generation of new artwork; “animation creation” does not imply new-image
  generation. Keith clarified that animation assistance draws existing sprites
  from a user-selected SFF group, proposing a sequence and timing that can be
  previewed and adjusted. New artwork generation is not requested. Keep an
  adapter seam for later Ikeminer input-reference support.
- Offer optional Clsn1 and Clsn2 proposal generation through deterministic local
  IKEMaker analysis and, separately, opt-in AI integration. VS Code alone does not
  understand attack poses. Each collision type has an independent maximum-box
  cap. Inputs may be selected frames/an attack range or low-effort suggestions
  from images and available context.
- Required minimal flow: select frames/range; choose collision types and caps;
  generate a directly editable preview; accept selectively or adjust boxes. If
  setup and cleanup are not faster than manual drawing, prune the feature.
- Body-part marking is explicitly excluded in every mode. Do not reintroduce it
  as advanced tagging, regions, semantic labels, or another renamed setup step.
- Default ownership semantics are mandatory. Editing a box on the frame that
  defines a default set edits that shared default and visibly identifies affected
  inheriting frames. On a later frame inheriting that type, the first add/edit
  materializes all effective boxes of that type as ordinary frame-specific boxes,
  then applies the edit. Never discard other visible inherited boxes merely
  because one same-type box was added. The shared default remains intact for
  other frames. Resolve Clsn1 and Clsn2 independently and respect each applicable
  default declaration's exact ownership.
- Review high-value low-friction QoL: lock accepted boxes/frames so regeneration
  preserves work; selective acceptance with one batch Undo; unmistakable Default
  versus Frame-specific scope and affected-frame highlighting; Return to defaults
  by removing the local override; and reference-frame copying or automatic
  temporal stability to reduce jitter only when it adds no setup burden. Preserve
  locked duration, poses, pivot, and blend endpoints during assistance.
- AI is explicitly opt-in. Before any request, show the data/context being sent,
  provider and cost information when available, and the exact destination of the
  result. Cache/reuse unchanged analysis instead of repeating calls. Clsn1 is a
  gameplay-intent suggestion, never guaranteed from silhouette/image evidence.

Reuse the existing collision editor, timeline, route/owner and Authored AIR /
Preview only / Connected code / Metadata destination model. Main-view entry stays
inside the collapsed options area with compact color-coordinated icon buttons,
hover/focus descriptions, accessible names, and no full-text buttons or
color-only meaning. Honor the latest one-browser-per-viewer rule: these icons
switch internal views in the same reusable companion browser and never spawn one
browser/window per assistance tool. Preserve internal-view selection, filters,
scroll and drafts across switches. New Dev should recommend only expansions that
reduce clicks and cleanup, identify edge cases, and define staged acceptance
checks.

### Cross-viewer entity/resource connectors addendum - 2026-10-17 - planning only

Keith approved sending this reuse-focused connector scope to New Dev. Consolidate
it with the existing connected-tools/References design; it does not authorize
implementation, installation, SF6 work, or deferred-lab activation.

- Extend AIR filtering/connections with Helper, Explod, and Projectile entities,
  analogous to map/var/form connections and backed by the same semantic reference
  inventory. Candidate facets include exact entity ID, calling state, source jump,
  Helper state-to-animation paths, and Projectile flight/hit/removal/cancel
  animation variants. Include modification controllers. Dynamic or unresolved
  ownership/paths remain visible and manual associations remain labeled. Entity
  filters may combine with form/map/var views without claiming runtime execution.
- Make the connector/navigation service reusable across IKEMaker viewers, starting
  with AIR but exposing bounded useful projections elsewhere: SFF sprite to using
  animation, SND entry to authored sound calls, and palette/remap relationships.
  Reuse route authority, filtering, resource identity, and provenance rather than
  building parallel scanners or navigation systems.
- SFF should expose organizational **layer group** filtering and RemapSprite
  group/bank relationships. Keith explicitly means group organization, **not
  actual visual layering**. Do not add sprite stacking, compositing, or a Layers
  renderer to SFF in this scope; AIR's separately planned Layers preview remains
  distinct. Layer-group and RemapSprite-bank filters may combine while preserving
  their independent selection and identities.
- Approved low-click QoL: Back/Forward navigation restores viewer/code selection,
  filters, and scroll; named reusable filter presets for forms/entities/banks;
  both **Uses** and **Used by** directions; automatic/manual/unresolved indicators
  with stale-link repair; and explicit identity labels distinguishing entity IDs,
  AIR Action numbers, SFF sprite groups, and layer groups even when numbers match.

Maintain the sparse UI contract: compact accessible icons in the collapsed
connected-tools area select internal views in the one companion browser; no
full-text buttons in the main icon row. Detailed tools stay in the browser.
Prioritize clear identity and low-click navigation, deduplicate prior batches,
avoid setup-heavy workflows, and document exact source/runtime limitations.

### SND viewer typed connections and lifecycle addendum - 2026-10-17 - design review

This extends, rather than duplicates, the implemented waveform/transport/QA,
exact character-local PlaySnd/HitDef SND routes, and earlier read-only PlaySnd/
CommonFX reference-inspector plan. It is design/backlog review only.

- Complete typed **Uses / Used by** edges for verified sample-bearing fields:
  PlaySnd; HitDef/ReversalDef/Projectile and their Modify variants' hit/guard
  sounds; SuperPause sound; LifebarAction sound; and embedded Dialogue sound
  tokens. Retain exact file/state/line plus Dialogue voice/wait timing context.
- Add a channel-lifecycle projection: PlaySnd to ModifySnd/SndPan/StopSnd and
  SoundVar. Channel owner, sound-resource owner, and positional source are
  independent. Preserve redirects and Helper `inheritchannels`; show priority,
  hit/state-change interruption and possible conflicts as evidence, not a claim
  that one channel always maps to one sample.
- Link waveform markers to loopstart/loopend/startposition and ModifySnd position.
  Samples are authoritative; milliseconds are convenience and AIR/state ticks
  are a separate domain. Audition configured volume/pan/freqmul/loop behavior
  versus the raw sample without implying destructive sample edits.
- Reuse the existing AIR cue/navigation design: optional Action-number-to-SND-
  group convention, explicit index/exceptions, one/selected/all exact call sites,
  reviewed code preview and duplicate prevention. Generate deterministic tick/
  AnimElemTime-oriented code, never audio-completion-driven gameplay.
- Combine map/var/form with helper/state/event/channel/resource/source filters;
  voice/effect labels are manual or suggestions. Preserve combined-source and
  single-file focus without merging identical numbers across resource containers.
- Model the full resource route: character DEF sound; motif/fight/storyboard SND;
  common.snd; named CommonFX; character FX assignment and fightfx prefix. Show
  prefix -> effective FX definition -> physical SND -> group/index. Unprefixed
  PlaySnd is character-owned; HitDef/SuperPause defaults are CommonFX;
  LifebarAction plain sound is lifebar-owned, subject to its own prefix rules.
- Provide bounded adapters for Dialogue, lifebar, screenpack, storyboard and
  verified Lua sound objects/calls, keeping object/source provenance. Do not
  classify every `snd` field as a sample (`snd.time` and
  `random.move.snd.cancel` are counterexamples). Character selection/palette
  preview may reference character SND rather than motif SND.
- Before replacement/renumbering, preview impact and scoped reference updates.
  Classify missing, unresolved and implicit use. Character SND `11,0` has an
  automatic KO use affected by `ko.echo`/`NoKOSnd`; dynamic references prevent a
  confident unused/deletion verdict.
- Keep BGM/file-audio routes as a separate companion domain (stage/menu/
  storyboard/PlayBgm/ModifyBgm/BGMVar), not SND group/index identity. Stage
  BGCtrl has no sound-playing controller at the pinned source; attached-character
  sound paths remain version-sensitive/unverified.

Important capability cautions at develop source pin
`4eba230508aa923b2b51384885baa08c69ed0342`: SoundVar and BGMVar are asynchronous
and not network-safe; use them for diagnostics, not autogenerated gameplay
decisions. The exact trigger is SoundVar. Negative-channel SoundVar may scan
shared player sounds. PlaySnd positive loopcount N is total passes, while SoundVar
loopcount reports remaining repeats. Current ModifySnd source accepts
`stopongethit`/`stoponchangestate` although the wiki omits them; legacy volume
descriptions are not hard IKEMEN validation. `inheritchannels` changes channel
ownership, not asset lookup. Gate every field by the selected engine capability.

UI/reuse: use the shared typed connector service and the viewer's one companion
browser. Keep a collapsed icon-only accessible entry below current options;
detailed references, lifecycle filters and waveform markers live inside the
browser. Reuse across labs only when later authorized. Initial priorities are
complete references, channel connections and waveform-to-code editing, with
workflows demonstrably faster than manual work.

New Dev design verdict: recommend this as held extensions of the shared connector
service and current SND viewer, not new panels. Stage S1 typed caller/resource
adapters and Uses/Used by; S2 authored channel-evidence projection; S3 waveform
markers, configured audition and reviewed single-call edits. Add caller/resource
families incrementally from a per-field registry with parser, prefix/default,
capability and source fixtures. "Complete" means the declared bounded graph and
registry, never every runtime use.

Channel lifecycle is a grouped/filterable candidate list with expandable
**why connected**, not a playback trace or graph canvas. Channel identity includes
executing/channel owner and scope; resource owner and positional source remain
separate. Dynamic/reused/negative channels, redirects and `inheritchannels` yield
candidate/shared scope. SoundVar does not prove a sample; overlapping writers are
possible contention only.

Waveform markers use verified integer sample-frame coordinates at the source
sample rate; confirm stereo interpretation and loop-end inclusivity per engine
pin. Milliseconds are derived display values and AIR/state ticks are a separate
lane. Dynamic markers stay expressions; dragging proposes a code edit. Replaced
sample rate/length invalidates marker authority without automatic rescaling.
Configured audition requires one selected call/scenario and shows known values
plus unknowns; browser playback does not certify the IKEMEN mixer, priority,
spatial falloff or runtime timing. Separate monitor volume from authored volume,
bound loops, stop on resource/owner/disposal changes, and never autoplay on
navigation.

Marker edits and AIR cues reuse host-owned code-draft/generation authority, exact
source spans, stale checks, semantic duplicate detection and one reviewed Undo.
Default to one call; selected/all must enumerate eligible sites and exclusions.
Replacement/renumbering remains a later separately reviewed mutation slice using
the existing sound-build transaction, because binary/manifest plus source edits
are not automatically atomic. Read-only impact comes first; dynamic coverage and
implicit KO use prevent safe-unused claims.

Retain low-click QoL: selecting a call highlights markers and supports configured
audition/source return while preserving zoom; raw/configured A/B with one Reset;
optional preview-only zero-crossing snap plus exact override; grouped repeated
uses with expandable sites and separate Unresolved/Implicit counts. Do not add
automatic channel allocation, loudness rewriting, waveform regeneration or a
new audio editor.

Design gate before implementation: New Dev must confirm the complete caller
inventory, `ChangeAnim2`/cross-player/common-AIR ownership rules, whether the
existing AIR Actions Browser is extended rather than adding a competing browser,
expression hit-testing/context-menu behavior, index invalidation, route authority,
boundedness, collision-code classification/link strength, and focused plus
physical acceptance tests. It must also review manual-association persistence,
authority, invalidation, and reconciliation with later automatic evidence.

### UI clarification: one browser per viewer — 2026-10-17

Keith explicitly requires at most **one companion browser per viewer**. This
supersedes earlier references to separate optional References, Layers, sound,
palette or timeline browser windows. Access buttons switch internal views in
that same browser; they never create a browser per tool. Repeated opening reuses
the existing instance, and floating/docking relocates it without duplication.
Preserve each view's selection, filters, scroll and drafts across switches, with
owner and freshness validation. Main-view compact icons select internal browser
views; detailed controls stay there. Apply this constraint to the held AIR batch,
References and Layers designs and future reuse by other viewers. No implementation
is activated by this clarification.

### Runtime Quick VS semantics and user-function signature help — 2026-10-22

Discord feedback clarified that Quick VS is an engine game mode, not a motif-load
workflow. The current launch paths must be consolidated behind one launch-spec
builder and stop injecting `-loadmotif` by default. For an installation whose
exact Lua sources prove the supported direct route, Quick VS uses the reviewed
`-p1`/`-p2`/stage/team arguments without `-loadmotif`; direct Training uses the
same route plus `-training 1`. The installed route must also prove
`pausemenu=false`, and Training additionally requires the installed training
hook that changes the game mode. If that evidence is missing, fail closed with
an explanation. Never silently fall back to `-loadmotif`; any legacy motif path
must be an explicitly labeled compatibility option with a crash warning.

Acceptance includes argument-preview/spawn parity, normal Run remaining
unchanged, capability states for Quick VS only / Quick VS plus Training hook /
unsupported, spaces in paths, team and tag options, exact-profile Restart, and a
bounded startup check that reports an early engine exit as failure rather than
claiming launch success. Do not add duplicate-process blocking.

User-defined ZSS function signature help is already partly implemented and must
be finished rather than duplicated. Keep native help visible at the call site
with exact authored parameter names, count, order, active position, and `@param`
documentation from live assigned files. The October 24 source audit corrected a
critical false model: current Nightly and current `develop` parse
`[Function Name(arg1, arg2) result1, result2]`; arguments and returns are untyped
variable names. There are no declared parameter types or default parameters, and
a trailing variable named `string` is not a return type. IKEMaker must diagnose
`arg = value`, `arg:type`, and `string arg` rather than normalize or teach them.

The corrected shared parser and native provider now cover balanced multiline
headers/calls, nested delimiters, comments, quoted commas, named return variables,
content-free inferred call kinds, same-file duplicate errors, cross-file
first-compiled ambiguity, bounded/versioned call-context caching, cancellation,
and immediate live-document catalog authority. Names, arity, navigation and
`@param` documentation remain available independently of runtime strings;
`INFERRED` string evidence is enabled only by the exact `zss.runtime-strings`
capability and is never a hard type contract. Keep remaining performance work
The October 24 hardening pass now suppresses stale asynchronous catalog results
across source, assignment/dependency, cancellation, later-request, and exact
engine-target changes. Its bounded validated cache distinguishes coalesced cold
requests from settled warm hits and measures those warm hits against a 25 ms
budget. The October 24 Lua slice now provides native completion, hover, and
signature help for authored local/global functions, table and colon methods,
assignment-form functions, and varargs. Direct `require` ownership is admitted
only when one exact same-project module resolves and explicitly returns the
table/function that owns the exported declaration; ambiguous, dynamic, private,
or unresolved module members are never guessed. Lua help remains source-only
and never executes code or invents parameter types/defaults. Connected/open Lua
documents also retain an explicit **Lua** identity in the Code Navigation tab
header, including a file whose extension is generic but whose native editor
language is Lua.

The exact October 22 Nightly (`ee4791bcd5e2`) now has separate catalog gates for
dynamic map keys, dynamic StateDef/StateTypeSet type strings, and `AnimPrefix` /
`ExplodVar(animPrefix)` / `ProjVar(animPrefix)`. Dynamic map identities stay
unresolved unless a finite value is proven. State-type completion preserves the
conventional static syntax while adding quoted values only for the supporting
build. String assistance explains case-insensitive equality, false/zero coercion,
mixed string-number comparison, and the absence of concatenation or lexical
ordering. Indexed map parameters and the newer MapSet/MapAdd and flag-comparison
fixes remain `develop` watchlist items and must not be enabled for this Nightly.

### Narrow companion-browser contract — 2026-10-22

Every viewer's single companion browser is intentionally a narrow dockable
window. At its normal minimum width, labels, summaries, forms, tabs, status
text, and action rows must reflow into readable blocks; words must not collapse
to one character per line and no horizontal scrollbar may be required to reach
controls. Long paths and identifiers may wrap anywhere inside their own bounded
value area, while ordinary prose wraps by word. Controls wrap or stack with
usable minimum widths, tables switch to cards/definition rows where necessary,
and the browser retains vertical scrolling. Apply and test this as a shared
browser-shell contract plus viewer-specific exceptions, including AIR Actions,
collision boxes, and code connections, rather than patching one screenshot.

### Reviewed SFF/SND desktop intake and logical organization — implemented 2026-10-25; installed drop smoke test pending

The SFF Lab comparison and follow-up review do not justify another monolithic
asset editor. Extend the existing authoritative SFF Creator, SFF Viewer and
SndMaker-manifest workflows instead. External desktop drops and internal
thumbnail movement are separate contracts. A browser is only a projection: a
drop there focuses the one authoritative draft owner and supplies a destination
hint; it never creates or writes a second draft.

- Desktop SFF intake accepts bounded supported image files or one folder, checks
  canonical local-path evidence, content hashes, real file headers, encoded-byte
  and decoded-pixel limits, preserves source order, and routes each format to the
  existing compact or Advanced Creator adapter. Drop targets may propose append,
  a logical group/next-free index, or a visible source boundary. Nothing writes
  an SFF before the existing review and build/adoption gates.
- Desktop SND intake begins with validated WAV batches and a dedicated reviewed
  SndMaker-manifest draft. It never patches a loaded SND or silently transcodes.
  Empty, group and existing-row targets may prefill append, group, or
  Replace/Insert, but collisions remain explicit Skip/Replace/Next-free/Manual
  decisions. Rebuild and adoption stay separate.
- Saved SFF view organization supports moving a marked thumbnail block with one
  insertion marker, stable relative order, auto-scroll, keyboard parity and one
  logical Undo. This remains metadata only. Creator group drops propose exact
  group/index overrides and must show duplicate, reserved-range, palette and AIR
  reference impact before acceptance.
- Add a preview-only logical-group animation/alignment audition by reusing the
  existing onion, axis and review infrastructure. The first slice includes
  readiness, effective palettes and previous-frame onion playback. Relative
  batch-axis nudge and before/after edit comparison remain a later explicit
  Creator enhancement; the audition does not claim runtime AIR truth.
- Thumbnail traffic is visible-page/request-ID based, bounded and cancellable.
  Resolve the current client request of up to 1,000 rows versus the host's
  500-row response cap so large archives cannot retain permanent blank cards or
  repeat the same missing request indefinitely.

Recorded implementation slices: `desktop_drop_intake_contract` now seals
immutable, ordered SFF/SND candidates with generation/nonce freshness,
format/magic/path/size/pixel validation, explicit rejected records and
cancellation with no candidate or mutation. Saved-view ordering has a pure
stable marked-block move operation; the Viewer uses marked-block pointer/
Alt+Arrow movement with visible before/after markers and edge auto-scroll. The
Creator Contact Sheet now moves a marked source set as one stable draft-only
block with before/after insertion markers, edge auto-scroll, and its existing
Move Up/Move Down keyboard controls. `sff_logical_group_assignment` provides a
stale-safe exact group/index override plan and receipt whose review exposes
occupied identities, reserved ranges, AIR references and mixed palettes before
draft application. `snd_intake_model` provides immutable reviewed group/append
planning, explicit Replace/Skip/Next Free/Manual collision decisions, manifest
fingerprints and manifest-only materialization.

Viewer and browser thumbnail transport is now near-visible and generation
bound: 48-card client batches, independent 64-card host caps, 512-entry bounded
palette-aware caches, latest-request wins, rerender cancellation and terminal
decode failures replace the previous fixed first-1,000/500 and first-300
truncation paths. Source tests cover discontiguous selection, stale rows,
no-op boundaries, immutable input, unsafe drop evidence, stale sessions,
cancellation, logical assignment review, manifest collision outcomes and large
thumbnail lifecycles. The Creator now exposes an accessible Explorer image/
folder drop target whose host canonicalizes, bounds, hashes, magic-checks and
pixel-bounds sources before routing PNG/folders, GIF, PSD and BMP/PCX through
their existing reviewed adapters; unavailable browser path evidence falls back
to the existing pickers. The SND Viewer exposes equivalent WAV drop/picker entry
into the authoritative `snd_intake_workspace`: it retains validated WAVs under
the project, applies a reviewed transactional manifest/copy write, and explicitly
does not build, adopt or modify the SND. Both large-drop evidence paths report
progress and cancel without producing a partial candidate. Oversized files are
rejected from filesystem metadata before a decoder, validator, hash, or whole-
file read, and inputs beyond the item-count sentinel receive no filesystem I/O.
Aggregate byte exhaustion also stops later hashing/decoding, and aggregate
decoded-pixel exhaustion stops later image decoders rather than merely rejecting
the batch after all work has run. Files that fail decoding after inspection has
started still consume their measured bytes, so repeated malformed inputs cannot
bypass the aggregate I/O budget.
WAV admission now requires a structurally readable, nonempty PCM 8/16-bit mono
or stereo stream supported by the SndMaker workflow, including consistent RIFF
length, block alignment, byte rate and whole-frame data, rather than only a
RIFF/WAVE magic prefix. Creator drafts remain
restart-recoverable and SND manifest/copy application retains the transactional
journal. A missing SND build manifest now offers **Create Build Workspace** or
**Choose Existing Manifest** and resumes the same pending WAV batch after that
choice. Both floating companion browsers forward their drops to the one
authoritative Creator/Viewer intake rather than creating another draft; a ready
handshake retains and flushes paths when that owner had to be opened first, so
the initial forwarded drop is not lost. Installed
Windows Explorer path exposure and drag interaction remain to be smoke-tested.
The
visible Creator logical-group action
now reviews exact destinations, reserved/occupied identities, effective palettes
and a bounded character-folder AIR reference heuristic before changing draft
overrides. That AIR evidence is always labeled folder-only/incomplete until it
can be bound to the character DEF's assigned AIR files. Group/index drops stage
destinations for the existing final collision review; occupied or reserved rows
are not silently approved by the drop dialog. A separate preview-only marked-source audition displays readiness,
reviewed destinations and palettes, axis-aligns every frame, offers previous-
frame onion skin and bounded six-tick playback, and never writes AIR or SFF.

### Advanced physical SFF sprite reordering — deferred 2026-10-23

Physical sprite order changes are a later Advanced feature and are not required
for the next release. Saved **view organization** comes first: users may keep a
custom visual order, grouping, and filters without rewriting the SFF. The default
view remains physical archive order, normal sprite/pixel/palette/axis edits never
change it, duplicate group/index identities remain distinct, and applying a view
order writes metadata only.

Do not present physical reorder as ordinary drag-and-drop. When implemented, it
must be a separate explicitly reviewed archive mutation with writer/link
certification, exact physical occurrence identity, sprite and palette link
analysis, source-reference impact review, an exact before/after order preview,
ambiguity blocking, backup/transaction/verification, Undo/recovery evidence, and
an unmistakable compatibility warning. It must prove that linked data, palette
ownership, group/index identity, and round-trip behavior remain valid. Dragging in
the viewer must never invoke it; the viewer uses a dedicated handle and persists
only a draft view arrangement until **Apply View Order** is confirmed.

### Ikemen Media Editor discussion follow-ups — audited 2026-10-23

The authoritative discussion audit is retained in `data/Media-Editor-Gap-Audit.md`.
Palette assignment/link ownership, explicit nearest-color adaptation, palette
image sync reachability, and scratch Save are release-priority IKEMaker work.
The remaining genuine candidates are later reviewable slices: selected-range AIR
timing; reviewed sprite-group duplication; minimal-format-preserving AIR edits;
connected SND switching and non-autoplay audition; selected-sound silence trim;
reference-proven unused-palette deletion; SFF v1-to-v2 per-sprite palette/link
preservation; advanced canvas resize; aligned sprite-sheet and transparent
animation export; resizable sprite columns and transparency visualization; and
exact reversible paint/replacement batches. Do not import features already added
to Media Editor merely to duplicate them. Each mutation must retain exact owner
identity, stale checks, preview/review, transactional output where applicable,
and focused regressions.

### Palette Workshop drag-and-drop intake (implemented 2026-10-26)

- Bank B swatches now expose separate drop geometry: the center replaces indexes, while the left/right edges insert before/after. The visual cue and cursor identify the pending action.
- Internal multi-index and external palette drops create one local Bank B history checkpoint, so one Undo/Redo restores the complete operation. No drop writes an SFF or palette file.
- ACT and exact indexed PNG files are decoded and bounded by the extension host before their colors reach Bank B. One external file is accepted per swatch drop; reviewed batch Add remains the multi-file route.
- True-color PNG and supported artwork formats are never treated as palette tables. PNG enters the Palette Workspace repair/indexing source flow; other Creator-supported artwork is handed to the Creator repair intake.
- The floating Palette Workshop browser forwards external file evidence to the authoritative Workshop instead of creating a second Bank B.
- Drag state is cleared on drop, drag end, blur, and rerender; an external file drop cannot accidentally replay an older internal color drag.
- New Dev audit note: direct Workshop palette inputs remain ACT and indexed PNG. ACO, GPL, CSV, generic JSON, GIF, BMP, PCX, PSD, and similar artwork are not advertised as direct palette-table imports.

### SFF Creator production lifecycle checkpoint (source-complete 2026-10-26; physical pending)

- The retained built-in v2.0/v2.1 operation now starts at an exact
  `ProjectionReview` checkpoint, preserves restart identity in extension global
  storage, and refuses active-target, manifest, route, specification, or head
  drift.
- Target review uses separately challenged confirmation, conversion, mandatory-
  acknowledgement, and risk rows. Cancel is write-free. Retention grants no
  candidate, execution, adoption, or history-write authority.
- A separate final approval can advance the exact retained plan to durable
  `ProjectionApproved`. The UI adapter never acknowledges rows on the user's
  behalf and repeats that neither review nor projection approval builds or
  replaces an SFF.
- `ProjectionApproved` advances to `RequestReady` only when the caller supplies
  complete pinned physical-certification evidence. A bounded picker loads the
  exact manifest, completed ledger, and rooted hashed evidence artifacts;
  traversal, symlinks, duplicate IDs, changing files, excess counts/bytes, and
  incomplete certification fail closed. No source test result is substituted
  for physical evidence.

#### SFF Creator production lifecycle checkpoint — retained AdoptionReview

The built-in v2.0/v2.1 runtime now advances an exact `CandidatePersisted`
continuation into a separately retained `AdoptionReview` route and explicit
adoption-impact review. Every returned challenge must be acknowledged directly;
cancel/restart creates no authority, and the retained review record explicitly
grants neither writes nor adoption. Restart verification replays the route,
compares the route and review plans exactly, verifies the review record and
artifact authorities, and requires the review child to be the immediate
successor of the routed AdoptionReview checkpoint. The active SFF and private
candidate remain byte-identical throughout this slice. No production adoption
button is exposed: approval, layout review, execution, history completion, and
the ordinary Creator workspace call sites remain required before that route is
production-reachable.

The next checkpoint now retains reviewed `AdoptionApproved` authority. Every
adoption-impact challenge is completed and retained before a separate final
approval prompt can bind the exact plan. Deferred approval survives restart;
the reviewed approval route carries the original production review plan and
record forward and independently replays their hashes, authorities, required
confirmations, risk acknowledgements, and exact payload inventory. This state
still cannot execute, replace the active SFF, alter the private candidate,
append history, or clear the Creator draft. Reviewed layout and all later
execution/history transitions remain required before production exposure.

Reviewed `LayoutReview` now follows the reviewed `AdoptionApproved` authority.
The route carries both adoption-impact review artifacts, the approval
decision/receipt, fixed integration evidence, the freshly probed replacement
capability, and the exact recoverable execution-layout plan. Each layout row is
challenged directly and restart issues fresh volatile challenges until the
review is retained. The retained state remains paused and explicitly grants no
execution, replacement, history, or draft-clear authority. Execution approval
and all later mutation/history stages remain required before production
exposure.

Reviewed `ExecutionApproved` now follows the retained human layout review. A
separate modal binds the exact execution-layout approval decision; deferral is
restart-safe. The route independently replays canonical review-plan bytes, the
full no-authority layout-review record, named authorities, and exact descriptors
for both the adoption-impact and execution-layout production reviews. This
checkpoint still creates no Executing intent, invokes no executor, modifies no
active/candidate bytes, appends no history, and clears no draft. Durable intent,
transactional execution, result classification, history reconciliation, and
ordinary Completed verification remain required before production exposure.

Reviewed `Executing` intent now follows a second, separate direct-human start
confirmation. Deferring remains write-free and restart-safe. Confirming retains
the exact execution approval, both challenged review pairs, and the executor
authority descriptor in the operation vault; append-failure recovery resolves
only an exact committed checkpoint. The retained intent reports
`executionStarted: false`: it does not invoke the executor, change active or
candidate bytes, append history, or clear the draft. The next bounded stage is
the nonce-bound, at-most-once transactional attempt and durable result/recovery
capture; an ambiguous attempt must require reinspection rather than auto-run.

`ResultCaptured` now follows the reviewed intent through the existing single
transactional executor and nonce-bound dispatch contract. The command invokes
the executor once, correlates the returned execution or recovery receipt, and
durably appends independently verifiable result evidence. Restart recognizes
the captured result without silently re-executing. Live pre-execution checks
remain strict; post-mutation review replay is vault-only and validates the exact
retained manifests, review records, approvals, descriptor, receipt, inventory,
and named authorities rather than requiring the old active archive to remain in
place. Focused v2.0/v2.1 runtime coverage passes. This stage appends no history,
does not mark Completed, and never clears the Creator draft.

Result classification and challenged history review now follow
`ResultCaptured`. The runtime explicitly appends and verifies the existing
classification checkpoint. Only `TerminalNeedsHistory` may continue, and only
when its exact reconciliation plan is unblocked. Manual/uncertain results remain
export-only, while real cleanup residue remains on the existing restart-recovery
route. The separate direct-human history modal challenges each reconciliation
row and durability caveat; cancel/defer is write-free and restart issues fresh
challenges. Retention preserves the earlier adoption/layout reviews and exact
execution outcome but grants no history-write authority, appends no history,
does not mark Completed, and does not clear the draft. Focused v2.0/v2.1 runtime
coverage passes.

Explicit history approval now follows the retained challenged review in a
second fresh human modal. The established `HistoryReview` lifecycle checkpoint
remains the registered durable state; “history approved” is the user-facing
milestone carried by its exact approval receipt, not a parallel lifecycle. The
plan/bridge verifies the retained challenge record, classified result, root
seals, named authorities, exact ResultCaptured predecessor, and all inherited
review/execution evidence. Deferral is write-free, and a lost response after a
successful checkpoint commit is recovered only when the predecessor and
decision hash match exactly. Focused v2.0/v2.1 coverage passes. This milestone
still invokes no history writer, appends no history, does not mark Completed,
and does not clear the draft.

The isolated production lifecycle now completes through the established
history writer and Completed bridge. `completeApprovedHistory` requires the
exact approved `HistoryReview`, writes one immutable history record, recovers
writer/capsule/checkpoint acknowledgement loss without duplication, verifies
saved `Completed`, and requires durable cleanup proof. Restart from either the
old review locator or returned Completed locator rediscovers the same terminal
authority. Only then may the runtime return `resetDraft: true`; the runtime does
not clear the workspace draft itself. Focused and full v2.0/v2.1 real-vault
coverage passes. The existing single production panel now reaches this chain
through explicit retained continuation, and host-owned draft discard occurs
only after runtime `resetDraft:true` plus an independent saved-Completed
verification.

Drifted-draft recovery also has an explicit detach policy. The user must name
the exact retained operation/revisions and enter the exact confirmation; the
continuation record is sealed into durable workspace recovery history before
only its active draft lock is released. Detach does not clear or modify the
Creator draft, invoke a writer, or touch project assets. Archived operations
cannot be silently reattached, and stale/replayed/tampered requests fail
closed. The workspace dialog explicitly says that it detaches only the lock and
keeps the recovery record; it does not abandon or delete the operation.
- The reviewed production route is source-reachable only for exact enabled
  existing v2.0/v2.1 targets and pauses at every review or mutation boundary.
  Existing test builds and SprMake2 routes remain unchanged. Installed VS Code,
  real certification evidence, Windows filesystem behavior and IKEMEN output
  validation remain physical pending; this source checkpoint does not claim
  release readiness or physical certification.

## 2026-10-26 — Debugger & Repair Center (planned/held)

**Status:** Backlog only. Wait until JNP is back at the PC to inspect the installed Swiss Army Knife (SAK) app, especially its departed-entity/history behavior. This entry does not activate implementation, engine changes, installation, or publication.

### Purpose and scope

Create an IKEMEN-aware live debugger connected to Move Lab and the existing code editor. Preserve evidence after short-lived helpers, explods, and projectiles disappear. Extend inspection beyond MUGEN-era variables to maps, strings, functions, AssertSpecial and, where supported, Lua. Investigate integration with the user-reported error-tolerant/no-crash mode; verify the exact engine version, behavior and exposed APIs before promising capture coverage. Continuing after an error must not be presented as a successful recovery.

### One workspace with focused views

- Compact toolbar switches Overview, Entities, Data, Execution, Lua, and Repairs inside one Debugger & Repair Center. One companion browser; no extra browser/window per category. Preserve existing header/icon conventions; nothing accessible only from IKEMEN Tools.
- Overview: errors, warnings, watches and recent events. Entities: players/helpers/explods/projectiles with owner/parent relationships and creation/destruction records. Data: vars/fvars, maps, strings and relevant constants. Execution: states, animations, function arguments/returns/callers and AssertSpecial lifetimes. Lua: available callbacks, watched values, stack traces, screen/menu transitions and gameplay interactions. Repairs: evidence, linked source, proposed edits and verification results.
- Entity browser at left, focused inspector in center, collapsible shared history below; pause/step/capture controls remain accessible. Switching views preserves selected frame, entity and filters. Link events, values and source locations rather than duplicating screens.
- Shared history should correlate runtime events on an explicit frame/time basis. Preserve departed entities with lifetime-aware identity so reused IDs do not combine unrelated objects. Mark unavailable telemetry and lost/truncated capture; distinguish observed facts from inferred causes.
- Selectable Move, Helper/Projectile, UI/Lua and Custom capture profiles; saved watches/layouts, bounded rolling history, preserve history at a chosen condition/error. Expensive tracing is opt-in. Verify overhead and pause/step support before committing to an implementation.
- Record values, bindings, targets, velocities, hit information and object lifecycles where exposed. Error entries retain relevant source/context and mark later history potentially affected. Conditional watches could stop or capture when a helper disappears or a map changes; actual engine support must be verified.
- Repair flow: inspect evidence -> navigate to responsible code -> review proposed edit -> explicit user approval -> apply -> repeat scenario and compare. No automatic file modification, silent runtime injection or promise of deterministic replay. Disclose/approve any needed instrumentation and temporary files under existing project rules.

### SAK references and next review

- Source/documentation: https://github.com/ZiddiaMUGEN/SwissArmyKnife
- Developer demonstration: https://ziddia.blog.fc2.com/blog-entry-46.html
- Inspected screenshot: https://blog-imgs-135-origin.fc2.com/z/i/d/ziddia/SAK-bp5.png
- Screenshot shows an entity table with player/helper/owner IDs, Player/Explod/Projectile/Triggers tabs, selected-player system/var/fvar/AssertSpecial inspection, pause/frame-step controls and a battle-history panel. The pictured history is match-event logging, not proof of departed-object snapshots. JNP reports richer historical lookup; inspect his installed app before defining equivalent behavior.
- First future step: review SAK UI/history with JNP, inventory existing IKEMaker debugging hooks and pinned IKEMEN capabilities, then propose a bounded read-only capture/history/source-navigation slice. Reuse existing infrastructure; implementation remains held until explicitly authorized.

## 2026-10-26 — Multi-character workspace organization (release-priority design)

**Status:** Researched and scoped for release planning; not implemented or physically verified. User identifies this as important for release. SF6 (2) remains implementation owner when activated; independent review required. No install/publication authorized by this research.

### Evidence and platform boundary

- Current authoring_context_registry.js tracks panels, connected files, ownerDef and shared models; viewer_sessions.js captures exact file/kind/selection references with bounded acknowledgement; workspace_presets.js uses workspaceState; resume_context.js already binds resume markers to owners. Reuse these services rather than building a competing registry.
- Important identity gap: authoring_context_model.contextIdentity collapses a character DEF to its parent folder; registerCharacterToolPanel also keys by folder. Distinct DEF variants within one directory can therefore share model identity even though matchingPanels checks ownerDef separately. New session authority must use project identity + canonical DEF URI, with a safe migration of legacy directory keys. This is a source finding, not a reproduced live symptom.
- viewer_sessions.find currently matches file+kind; shared archives may be used by several DEFs. Separate document/resource identity from owning character session and view selection; never infer owner from the most recently active character or basename.
- VS Code public TabGroups supports inspection/events/closure; TabGroup represents an editor pane. It does not expose named nested character-tab containers or per-session hiding of arbitrary native tabs. A native text editor cannot simply be embedded inside a webview. Do not promise FF-style native nested tabs or use unsupported workbench DOM/CSS hacks.
- Webview state/serialization supports restoring UI, but retaining every hidden webview has memory costs. Store lightweight session descriptors and load needed content on demand; dirty drafts must remain authoritative and protected, not silently serialized as project files.
- References: https://code.visualstudio.com/api/references/vscode-api#TabGroups ; https://code.visualstudio.com/api/extension-guides/webview#persistence ; https://code.visualstudio.com/api/references/commands

### User-facing contract

1. One compact character/context strip within the established IKEMaker header, e.g. Ryu / Morrigan / Demitri / + Open. Overflow search for many entries; keyboard switching, accessible labels, active state, dirty badge and project/DEF disambiguation. Keep current icon toolbar, screen colors and header placement. Context controls must be toolbar-accessible.
2. Within a character, preserve SFF/AIR/SND/Palette/Commands/Move Lab/Code navigation and one browser per viewer. Character switching changes/restores context; it must not open every viewer or every source file. Never create a browser per character category. Comparison is an explicit action with labeled source/target contexts, not an automatic split.
3. Scoped navigator groups Character files, Shared game/template files, External dependencies and Open/Modified items. Resolve references from DEF/dependency evidence, not folder membership alone. Shared files have one underlying native document and multiple memberships; show their wider impact. Unknown/ambiguous ownership is visible and user-resolvable.
4. Remember last active surface, file/cursor/selection/scroll, animation/frame, sprite/palette, browser subsection, filters and layout per context where adapters support it. Missing files, stale references and unsupported restoration must be reported without inventing a fallback owner. Extend identity to Stage/Screenpack without requiring every adapter in the initial slice.
5. Native editors stay native. Focused organization may park clean IKEMaker-owned tabs under an explicit user-selected policy and reopen them on demand. Dirty, pinned, diff, untitled and unrelated tabs must not be silently closed/saved/moved; where native tabs must remain, the scoped navigator still filters accurately. Explain this limit instead of claiming native tabs are hidden. Preserve existing user splits and provide an explicit comparison/native-layout option.
6. Separate Switch, Close Context, Close File and Remove from Recent actions. Switching must not imply saving/discarding. A shared file stays available to other contexts when one closes. Closing unsaved work requires the established explicit choice, with Cancel leaving the session intact.
7. Reopening VS Code restores lightweight context membership and chosen surface lazily. Use disclosed extension workspace storage for UI preferences, not new character folders or automatic asset writes. Respect current asset autosave settings; switching never turns autosave on. Exporting a portable session/layout is an explicit separate action.

### Implementation and release gate

- Begin with a small proof using two characters, one shared source and two DEFs in the same folder. Demonstrate switch/reopen/native text header stability before broad viewer integration.
- Centralize session ownership and deduplication using existing context/session services. Guard asynchronous loads with owner/session revision tokens; late callbacks for A cannot repoint B, steal focus or restore an obsolete layout. Bind Save/Build/Launch commands to explicit owner/target rather than a mutable global active context. Revalidate ownership when a shared file is focused.
- Use a transactional switch: capture current state, validate destination, prepare protected drafts, activate destination, restore only needed surface, acknowledge completion. Cancellation/failure retains usable previous context. Do not dispose drafts before a safe destination exists. Avoid fighting user-driven tab moves and the existing native text header reservation system.
- Acceptance: Ryu/Morrigan/Demitri with overlapping filenames; same-folder DEF variants; shared CNS/ZSS and SFF; dirty native and webview edits; pinned/untitled/unrelated tabs; rapid repeated switches and delayed loading; close/cancel; reload/restart; deleted/renamed assets; explicit compare and return; no empty panes or header jumping beside code; no extra browser instances; no duplicate document edits; no wrong-character Save/Build/Launch; no project-file writes from switching. Check memory/latency with several contexts and lazy loading. Test keyboard operation, narrow widths and screen-reader labels.
- Release priority is safe context isolation, scoped navigation and retained edits first. Exact FF-native nested-tab parity is not a supported promise. Do not call this complete based solely on a visual character strip; verify connected viewer/code flows and physical multi-character operation.

### 2026-10-26 clarification — explicit two-viewer Transfer mode

This supersedes any blanket ban on duplicate viewers for intentional asset transfer. Ordinary navigation still reuses one viewer of each type; entering Transfer mode deliberately opens/presents two instances of that type with independent, clearly labeled SOURCE and DESTINATION entities and exact asset files. Each viewer retains at most its one existing companion browser; no additional transfer browsers or separate workshop are needed.

- Preserve existing transfer functionality rather than replacing it during the session/header refactor. Use a compact transfer layout focused on asset groups, searchable lists and multi-selection; keep detailed editing tools collapsible. Support drag/drop and a visible Copy Selected button, with keyboard-accessible selection and copy.
- Transfer endpoints are explicitly pinned while this mode is active. The ordinary global entity switch must not silently retarget either endpoint or collapse both to one entity. Show their pinned status in headers; changing source/destination is an explicit local action and invalidates any pending transfer review. Define and show the active normal context when exiting Transfer mode, returning to ordinary synchronized viewing without losing drafts.
- Copy is the safe default and leaves source assets intact. Do not interpret drag/drop as destructive move or silently remove originals. Any future true Move operation needs separately reviewed source deletion after destination success.
- AIR animation copy must ask whether to include its referenced sprites: Copy animation only / Copy animation with referenced sprites / Cancel. Show missing sprite dependencies if animation-only is chosen, without blocking intentional user workflows. Include every referenced sprite once across selected animations; inspect the exact source/destination SFF and deduplicate shared references.
- Before writes, review selected counts, source/destination files, action IDs, sprite group/index IDs or sound IDs, and collisions. Offer explicit keep/use-existing, renumber/remap or replace choices where valid; do not silently overwrite. For animation-plus-sprites, carry any reviewed sprite-ID remapping into the copied AIR frames. Preserve frame timing, offsets, flags and collision data. Review palette compatibility/index mapping and linked-sprite dependencies; numeric IDs alone do not establish equivalent sprite content. Animation copying must not be described as copying the move's gameplay code or sounds automatically.
- Protect both endpoints' pending edits and revalidate target/source hashes or revisions immediately before applying. Destination file mutation requires explicit approval; explain temporary files if needed. Handle AIR+SFF as a coordinated reviewed operation with recoverable failure handling so a partial sprite failure is not reported as successful animation transfer. Source remains unchanged by Copy.
- Acceptance: transfer sprites, sounds and multiple animations between two entities; animation-only and animation-with-sprites choices; duplicate/shared references; differing palettes, linked sprites, occupied IDs and remaps; cancel; stale source/destination; unsaved drafts; global switch while endpoints pinned; exit back to normal one-instance synchronized mode. Verify both drag/drop and Copy Selected, with no extra browser proliferation or regression of existing transfer routes.

### 2026-10-26 — Transfer mode workflow expansion (approved backlog)

All items below extend the existing two-viewer Transfer mode requirement. Backlog approval does not start implementation, installation or publication.

- Entry/exit: expose Transfer in each applicable viewer header. Choose a second entity and show clearly labeled Source -> Destination with exact files. Provide Swap Sides; swapping or changing either endpoint invalidates the pending review. Both endpoints stay pinned independently of ordinary global entity switching. Exit restores normal synchronized viewing, previous selections and protected drafts.
- Compact selection: searchable groups/lists with sprite/animation thumbnails and sound playback; Ctrl/Shift multiselect, Select Group, Select Filtered, visible selected counts, and Copy Selected. Drag/drop invokes the identical reviewed-copy path. Keep a small optional preview and collapse full editing tools. Preserve selection after copying, including when the user explicitly chooses another destination.
- Transfer queue: show each asset's source ID, destination ID and planned Add/Skip/Use Existing/Renumber/Replace action. Resolve conflicts individually or apply a batch choice to compatible conflicts with per-item overrides. Existing numeric IDs do not prove content equivalence; distinguish exact matches from unrelated occupied IDs. No writes until explicit Apply Transfer. Invalid or changed review evidence requires a fresh review.
- AIR choice: Animation Only / Animation and Referenced Sprites / Cancel. Collect each referenced sprite once across selected actions. Show missing source sprites, already satisfied destination references, linked-image dependencies and palette decisions. Apply the reviewed sprite-ID remap to copied AIR frames; preserve timing, collision boxes, offsets, interpolation and other supported AIR properties, reporting unsupported/lossy properties rather than dropping them. AIR copy does not implicitly transfer gameplay code, helpers, FX controllers or sound triggers.
- Palette decisions: offer preserving source palettes or explicitly mapping to destination palettes where supported; review resulting palette IDs, dependencies and sprite mappings. Preview any recoloring or lost color distinctions before confirmation. Do not silently quantize, merge distinct colors or assume matching palette numbers mean compatibility.
- Results: show added/replaced/skipped/failed counts and asset details, plus Reveal Copied Assets on the destination side. Keep source assets unchanged for Copy. Coordinated AIR+SFF transfers must not report full success after partial failure; report exact completed/failed work and provide a reviewed recovery path under existing file-approval/temporary-file notification rules.
- Session transfer mappings: remember reviewed source-to-destination asset mappings within the current session, scoped to exact endpoint files/identities and content revisions. Later animations can offer to reuse a previously copied sprite after checking that its content, palette dependencies and destination identity still match. Stale mappings must be revalidated or rejected, never reused solely by ID. Explicit remapping, endpoint changes, edits and replacement invalidate affected mapping evidence. Persisting/exporting mappings beyond the session requires a separate explicit action, not new automatic project files.
- Extend acceptance to Swap Sides, preserved selections, Select Filtered boundaries, per-item/batch overrides, result reveal, palette preview, AIR property fidelity, partial failure/recovery, and repeated animation transfers reusing validated sprite mappings. Verify that drag/drop and Copy Selected have identical approval and conflict behavior.

## 2026-10-28 — Character scale-change review (activated)

User authorizes implementation following feedback that changing CNS [Size] xscale/yscale can misalign projectile/effect positions or sizes. SF6 (2) implements; New Dev reviews. This is a reviewed assistance feature, never silent automatic code rewriting.

- Easily enable/disable detection from existing relevant headers (Code/character constants and Move/Helper/Explod workflows) and settings; expose Run Scale Review manually even when monitoring is off. Start monitoring off unless the user explicitly enables it; remember per-project preference with clear current status. No new viewer/browser or global setting override. Disabling cancels pending detection but never silently reverts accepted edits.
- Track exact character DEF and resolved constants document, old/new numeric [Size] xscale/yscale and source versions. Initial observation establishes a baseline without claiming a change. Resolve includes/shared constants and ownership explicitly. Unknown old values require user input or report insufficient evidence; never guess. Respect unsaved documents, undo/redo, rapid edits, entity switching, external changes and repeated-review suppression.
- Analyze admitted CNS/ZSS controllers affecting Explod/ModifyExplod, native Projectile and Helper creation/binding where supported. Verify pinned engine coordinate/inheritance semantics before allowing mechanical fixes. Report unsupported/dynamic cases clearly. Distinguish localcoord changes, inherited scale, parent/root context, position space/postype, literal offsets, scale-aware expressions, intentional fixed-size/UI effects and actual Projectile controllers versus helper-based projectiles. Do not multiply every pos or scale, or double-apply existing compensation.
- Review grouped by source/line/controller with before/after, old/new axis scales, rationale/confidence and per-field inclusion. Numeric delta ratios new/old apply only where source semantics and user intent justify them, independently per axis; zero/invalid baselines block that proposal. Allow Keep As Is and manual adjustment. Unknown expressions remain suggestions/navigation, not speculative edits. Explain whether a proposal preserves visual attachment, proportional size or fixed world placement.
- Apply only explicitly selected reviewed edits through existing undoable WorkspaceEdit/reviewed patch mechanisms, with source/version and exact-owner revalidation immediately before applying. No automatic save, backups, new project files or live character edits during implementation/testing. Shared code changes show all known affected owners and need explicit review. Preserve authored formatting/comments and avoid unrelated substitutions.
- Focused tests: enable/disable/manual action, baseline creation/change detection, independent axes and non-1 baselines, no-op/undo/external edits, already compensated/dynamic expressions, inherited and screen-space cases, shared files, stale review and wrong-entity rejection, cancel/no writes, one undoable approved edit. Use synthetic fixtures. Record supported controller/field matrix, source evidence, unsupported cases, exact changed files and remaining physical tests. No package/install/push/release under this activation before New Dev review.

### 2026-10-29 — Approved scale-review expansion (activated)

Keith approved the expanded scope. SF6 (2) implements and New Dev independently reviews. Reconcile the existing scale-review checkpoint before editing; preserve completed work. Prioritize intent policies, before/after preview and coverage reporting, then the remaining approved items. Keep the easy monitoring toggle (default off), manual review, explicit mutation approval and existing no-install/publication boundary.

- Per-effect intent policies: Follow Character Size, Keep Fixed Size, Position Only, Size Only, and Manual. Define precisely which fields each policy affects; Keep Fixed Size must not silently freeze attachment position. An unset policy remains unknown, not assumed Follow. Persist only explicit choices in disclosed extension project/workspace state, keyed by exact owner and robust controller/source identity; ambiguous, moved or changed code requires revalidation instead of applying a choice to a different effect. Existing source expressions remain authoritative and a policy never overrides unsupported semantics.
- Before/after preview: reuse existing Move/Helper/Explod spatial preview infrastructure within the current review flow. Show character/effect, common axes and attachment points, consistent camera and old/new scale. Label assumed inputs and modeled/unsupported behavior; unresolved animation, expression or runtime state cannot become a fabricated exact preview. Fall back to an honest numeric/source comparison where visualization lacks authority. Preview causes no file writes.
- Attachment classification: distinguish body/hand attachment, floor/world placement, opponent-relative and screen-space UI; account for explicit binding, parent/root and position-space evidence. Offer user confirmation where intent cannot be inferred. Do not claim a hand attachment from a numeric offset alone or change world/screen-space effects by default.
- Already-handled explanations: show recognized existing scale compensation/inheritance and why each field was excluded. Distinguish proven covered from suspected/dynamic/unknown expressions; let users inspect and adjust manually without a speculative rewrite or double multiplication.
- Coverage report: explicit checked, proposed, already compensated, intentionally unchanged and unresolved/unsupported items, plus files or dependencies not scanned. Counts must be derived consistently from actual analysis; partial coverage cannot report the whole character fixed. Preserve clear scope, engine target, baseline provenance and per-item source navigation.
- Optional related-gameplay review: separately opt in to inspection of projectile velocity/acceleration, helper bindings and collision dimensions where evidence supports it. Keep these out of visual-only bulk selection by default, label their gameplay consequences, and require separate explicit selection/review before edits. No blanket proportional gameplay conversion; unsupported dynamic behavior stays unresolved.
- Reusable project conventions: allow explicit project/team defaults for newly authored effects using existing generation/configuration paths. Show provenance and allow per-effect overrides/disable; do not enforce JNP conventions on other users or retrofit existing code automatically. Sharing/exporting convention files requires an explicit user action and destination approval.
- Dynamic scaling during a move remains a separately deferred extension; this activation concerns base CNS character-scale changes and the related review above.
- Add focused behavioral/host tests for each policy, ambiguous identity invalidation, shared owners, excluded/unknown expressions, coverage completeness, preview no-write behavior, independent axis changes and gameplay opt-in separation. Verify repeated review does not compound already-applied scaling, stale evidence blocks Apply, cancellation writes nothing, and approved changes remain undoable without automatic save. Report exact support limits and a short physical QA list before independent sign-off.

## 2026-10-29 — AI Coding Assist using spatial and recorded gameplay evidence (planned/held)

User requests this as backlog scope, to expand during implementation. No implementation, paid AI usage, recording upload, engine modification or new-screen creation is activated by this entry. This is authoring assistance, including help authoring CPU behavior; distinguish model-powered analysis from engine AI conditions/triggers in UI wording.

- Assist coding timings and actions from a combination of AI-related engine triggers/conditions, user-positioned dummy CLSN boxes and spacing distances, and recorded videos of combos or counterplay. Let users supply intended behavior and refine suggested action/condition sequences against visible evidence and actual source.
- Spatial inputs: reuse Move Lab/P2 dummy, collision and coordinate/trajectory services to place characters and dummy boxes, measure distances and review spacing assumptions. Clearly distinguish author-placed reference boxes from actual engine collision data; a video alone does not establish exact hidden hitboxes or trigger values.
- Recorded evidence: support reviewed clips and selected frame/time ranges, event annotations and proposed combo/counter-response timing. Record frame-rate/timebase assumptions, uncertain timing, hitpause/slowdown and missing context. Distinguish visible events, user annotations, inferred actions and verified engine measurements. Proposals are drafts, not guaranteed engine timing or proof that a counter is valid.
- Suggested outputs: source-linked condition/trigger choices, timing/action drafts, required states/animations/helpers/resources, and proposed tests. User reviews and edits the proposed logic before any insertion or file mutation; no silent rewriting, saving or copying unreviewed actions into character code. Revalidate target engine, exact entity, source versions and dependencies before applying; preserve Undo and existing mutation approvals.
- Shared access is mandatory: connect Coding Assistance, Move Lab, Templates and Ingredients, Similar Code/example adaptation, condition/linter explanations and relevant Project Data views. Overlap is acceptable when each tool can access the shared capability; do not leave the intended consumer screens missing it or create independent competing parsers, catalogs or edit buffers. Template/ingredient dependency mapping and condition explanations remain integrated with their existing tools.
- A dedicated AI assistance screen may be justified for clip, spatial and code review together, but evaluate reusing the current shell first. If introduced, retain universal headers, exact entity context, toolbar access, one companion browser and routes back to the selected source. Keep optional detail collapsible and support experienced recognition-based coding rather than mandatory tutorial steps.
- Reconcile with the existing optional CPU Behavior Workshop, Phase 2/IkeMiner data collection and planned Debugger & Repair Center. Reuse their evidence formats and runtime observations where available; this proposal does not activate those deferred projects or replace the existing game-data capture scope.
- Future design must define supported capture/import formats, AI provider/local options and explicit cost/data-sharing controls before any paid request or external upload. Permit manual annotations and non-AI review where useful. Verification should compare proposed code with controlled engine scenarios; mark unsupported or uncertain behavior honestly.
- During build planning, expand concrete use cases with Keith (combo timing, spacing-dependent action selection, counterplay conditions), prioritize a bounded end-to-end example and define evidence/acceptance criteria before broadening scope. Current active release priorities remain unchanged.
## 2026-10-29 — Coding assistance gaps and full discoverability audit (activated goal)

Keith authorizes building all ten coding-gap proposals below, with SF6 (2) implementing and New Dev independently reviewing. The access/clarity audit covers ALL EXISTING coding assistance as well as new work. Reconcile current implementation first; do not rebuild delivered features or restrict the audit to these ten additions. Existing AI Coding Assist/video-analysis and full runtime Debugger remain separately planned; runtime-dependent automatic proof/replay is not implied by static assistance.

### Approved implementation scope

1. Condition Inspector integrated with existing linter/block explanation: visualize guards and alternatives (including CNS triggerall/numbered groups and ZSS nesting), source links and supplied-value evaluation for a declared supported grammar. Unknown expressions remain unknown; supplied values are not runtime observations.
2. Value Origin Inspector through hover/Project Data: definitions/defaults/overrides, possible writers/readers and receiver ownership. Static candidates never claim the last runtime writer.
3. Change Impact Review using shared references: affected code/resources/known owners, exact edit scope and incomplete/dynamic dependencies before approved edits.
4. Connected Event Timeline extending Move Lab: optional AIR/CLSN, movement/binding, HitDef, helpers/explods/projectiles, sound and transition tracks with source-selection linkage. Distinguish animation time, state time and runtime time; conditional events are branches/uncertainty, not invented exact frames.
5. Coordinate/Attachment Inspector: reuse spatial/trajectory and scale-review services for root/parent/target axes, local/world/screen positions, facing, bindings, scale/localcoord and before/after overlays. Preserve explicit assumptions and unsupported cases.
6. Local State/Function Map: selected block and nearby incoming/outgoing transitions/calls/creation/cleanup; expand on demand, not an unreadable full-character graph. Dynamic destinations remain unresolved.
7. Worked Example Adaptation belongs in Templates and Ingredients + Similar Code: dependency/replacement/compatibility review for destination animations/sounds/states/maps/functions/resources and coordinate assumptions. Keep code visible; preserve existing draft/review authority and user methods.
8. Semantic Change Summary beside ordinary diffs: describe parser-proven changes and relevant consequences without asserting unverified gameplay effects.
9. Saved Scenario Checks: explicit setup/launch/checklist intentions (facing, hit/block/whiff, wall, interruption, scale, relevant teams), reusable by project. Manual result recording initially; automatic pass/fail only from trustworthy actual observations. No implied deterministic replay or new runtime debugger activation.
10. Resource Lifetime View extends existing lifecycle inventory: creation/reference/mutation/cleanup relationships and evidence scope. Missing cleanup in inspected code is not proof of a runtime leak. Keep future observed-lifetime integration separate.

### All-assistance access, clarity and consistency acceptance

- Inventory every existing coding-assistance feature from source registrations, menus, providers, header/browser actions, templates/ingredients, Move Lab and Project Data—not just backlog names. Record implemented behavior, entry points, context/language/engine restrictions, and evidence of reachability. Separate backend-only, registered-but-unreachable, source-complete and physical-pending findings.
- USER CLARIFICATION: relevant right-click extras in native text editors ARE NOT considered hidden. Context-menu-only access is acceptable for context-specific editor assistance; do not add redundant toolbar buttons merely to satisfy a blanket toolbar rule. Verify applicable selections/locations expose the item, labels explain its action, and keyboard-accessible equivalents exist where practical. General viewer navigation retains existing header/toolbar rules; nothing should rely solely on IKEMEN Tools for its intended workflow.
- Audit existing Similar Code, intent/example search, Explain Current Block, adaptation drafts, Resume in Context, symbol/definition/reference routes, map/var/constant/resource completion, function assistance, controller/trigger insertion, Templates/Ingredients, lifecycle connections, code actions/lint explanations, trajectory/spatial/scale tools, and any other discovered assistants.
- Put assistance where users need it: connected Code Assistance/native editor, Move Lab, Project Data, Templates/Ingredients. Shared capability reuse is required; overlap is fine, missing consumer access is not. Preserve one companion browser, current icons/color conventions, entity context, draft/Undo ownership and native buffers; avoid new independent labs or competing parsers/catalogs.
- Use concise action names, one-line purpose/status, brief actionable disabled/unsupported explanations, and expandable evidence/help. Maintain expert workflows; no mandatory tutorial or generic walls of prose. Inspect narrow layouts, overflow, focus order, keyboard operation, meaningful accessible labels and selection retention. Right-click menus count as valid discoverable routes.
- Start read-only where appropriate; any edit retains explicit preview/approval, exact source/entity/version checks, native Undo and no autosave. Avoid paid AI calls, external uploads, live asset changes, package/install/push/publication during this goal without separate authorization.
- Required handoff: feature-to-surface matrix for ALL assistance; exact new vs reused vs incomplete functionality; changed files and focused behavioral/host/render/menu tests; source evidence; concise manual installed UI checks and honest limitations. Deliver completed bounded checkpoints for independent review, not repeated status requests. Existing active scale work should reach a coherent checkpoint before overlapping code edits. Do not mark this whole goal complete based only on adding labels/menu registrations or pure-model tests.
