# Coding Viewer completion audit — 0.79.116

Status: the prioritized Coding Viewer implementation/source acceptance and
isolated Extension Host layout acceptance are complete; clean reload/restore
rerun and hands-on interaction signoff remain pending. Deliberately deferred
future backlog is not reclassified as part of this completed batch.

The 2026-10-13 desktop-automation capability check returned no targetable
native applications (browser surfaces only), so hands-on interaction could not
be driven through the desktop connection. An isolated real VS Code Extension
Host acceptance runner now covers extension activation, installed-version
identity, tab-group placement, multi-file Character Essentials admission,
native language-service behavior, complete character shutdown, and the absence
of the retired webview editor. The reload runner's expected VS Code
CancellationError handling is now fixed, but the desktop app updated during
the clean-profile rerun and stopped producing isolated extension hosts. A clean
restore report must therefore be regenerated after VS Code restarts. Pointer, keyboard,
and editing feel still require the user sequence below.

This audit preserves the full coding-viewer goal. A green source test is not a
substitute for the physical checks at the end of this document.

## Requirement evidence

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Direct editing uses the real VS Code editor | Character Essentials opens admitted files through `showTextDocument`; the two webviews contain no textarea, Apply-to-document, Save-draft, or Discard-draft clone. Native highlighting, diagnostics, completions, Undo, dirty state, and Ctrl+S remain editor-owned. | Source-proven; physical appearance pending |
| One cohesive window, not four independent columns | Native editors retain their group. Code Navigation opens beside them. Coding Assistance reuses the tracked companion group as another tab. Restoration reuses VS Code-supplied panels. The isolated Extension Host confirms exactly two groups. | Runtime-proven; hands-on sizing pending |
| Invariant toolbar and quick actions | Code Navigation alone renders all 25 canonical universal slots. Coding Assistance deliberately renders no duplicate toolbar. Dispatch is host-validated against the currently bound exact document. | Source-proven |
| Connected tabs, arrows, slider, Cards, and List | Code Navigation projects the exact admitted file set in all three layouts, synchronizes native tab changes, and activates targets in the native editor group. The live Ryu run admitted and opened all 23 resolved source files. | Runtime admission proven; interaction feel pending |
| Cards are grouped hands | Workspace-persistent named hands support create, rename, delete, assign, unassign, hand ordering, and file ordering. Automatic groups contain only unassigned files. | Source-proven; physical workflow pending |
| Exact native-document/source authority | Toolbar, recovery, Problems, and assistance source routes bind URI/version/fingerprint/context revision and fail closed after selection or source changes. | Source-proven |
| Traditional editor remains optional | First explicit use offers Integrated, Native, or Ask-per-task. Native opens admitted text editors and creates no coding browsers. | Source-proven; first-run dialog pending |
| Separate overflow/assistance browser | Coding Assistance owns Code Navigator, Project Data, recipes, Similar Code, controllers, Problems, search, filters, and tree/card result views without duplicating navigation chrome. Similar Code compares the active connected native-editor block against bounded project sources and provides exact read-only routes; it never copies or edits source. | Source-proven; physical usability pending |
| IKEMEN 1.0 hides Nightly string tools | Conservative/default or verified 1.0 capability projections omit Nightly string recipes, string map value kinds, and aliases that could reveal them. Only an exact source-verified supporting Nightly enables them. Project Manager already owns reviewed target selection; authoritative registry writes, manual registry saves, and promoted engine-knowledge evidence refresh the open capability-derived browser projection immediately. A compact status names the active target and enabled/hidden state, with a host-owned route to Engine Targets. | Source-proven; physical profile-switch check pending |
| Critical nonexistent-command warning | Literal `command = "name"` and `command != "name"` references become `missing-command` errors only when the assigned command catalog is completely resolved. Case-only mismatches are explained. Incomplete ownership suppresses guesses. | Source-proven |
| Safety diagnostics and recovery | Native diagnostics feed the bounded Problems provider; Recovery receives the exact document bound to Code Navigation. Diagnostic churn refreshes Problems only. | Source-proven; physical navigation pending |
| Responsive typing | Typing never launches the full-project assistance parse. Structure/data/recipes refresh on Save or explicit Refresh; Problems follows diagnostics. Each provider renders at most 160 rows. | Source-proven; physical responsiveness pending |
| Accessibility | Tabs/List/Card selection semantics, labeled arrows/slider, keyboard arrows/Home/End, polite status, visible focus, forced-colors selection, and non-color status text are covered. | Source-proven; keyboard/screen-reader spot check pending |
| Restart/close lifecycle | Navigation and Assistance persist separate bounded restore envelopes. Invalid state is disposed. A real Close Character run closes all 23 tabs and both companions. Connected shared/template tabs retain the Character Essentials owner instead of silently rebinding Navigation to a private project context. The restore runner now treats reload cancellation as expected shutdown instead of deleting its phase marker, but its clean post-update run is still pending. | Close runtime-proven; clean restore rerun and hands-on confirmation pending |

## Current measured evidence

- All 89 focused coding-goal acceptance files pass together through the
  explicit `npm run test:coding-viewer` acceptance manifest.
- Current Ryu/template assistance benchmark: 35 code files, approximately
  2,028,596 bytes of structural projection, approximately 48,417 bytes of
  bounded rendered HTML, and approximately 8 ms host render time in the sampled
  run. The approximately 200 ms full parse is no longer on the typing path.
- Current Ryu command-safety scan: the assigned `template.jnp` catalog resolves
  completely with 58 commands; 27 Ryu/template code files were checked and no
  critical missing-command references were found.
- The isolated installed-extension run passes with IKEMaker 0.79.116 active:
  23 of 23 resolved Ryu/template source files open as native tabs in column 1;
  Code Navigation and Coding Assistance share column 2; no retired
  `IKEMaker Code · …` editor exists; and no third/fourth editor group is created.
  The live Navigation HTML contains exactly 25 universal toolbar slots, both
  arrows, the connected-file slider, Tabs/Cards/List, and all 23 admitted file
  labels. Live Assistance contains all six provider sections and no duplicate
  toolbar. Its conservative Ryu projection reports Nightly string tools hidden;
  the installed renderer independently proves explicit 1.0 remains hidden and
  a verified Nightly projection becomes enabled.
  The machine-readable evidence is
  `test/integration/coding-viewer-live-report.json`.
- A real installed-extension language-service run confirms ZSS syntax service
  ownership, a critical `missing-command` diagnostic for a disposable unknown
  literal command, genuine native dirty state, native Undo, and return to a
  clean document.
- Native-only presentation passes in a real Extension Host with all 23 admitted
  sources in one editor group and no Navigation, Assistance, or retired editor.
- The reload/restore runner now uses explicit installed-module paths, reuses
  the activated Windows module instance, and preserves its verification marker
  across VS Code's expected reload cancellation. The saved
  `test/integration/coding-viewer-restore-live-report.json` is from a
  contaminated pre-fix loop and is intentionally **not** accepted as green
  evidence. Regenerate it from a clean profile after the desktop update has
  settled.
- A real Close Character run now closes all 23 connected source tabs, Code
  Navigation, and Coding Assistance. The evidence is
  `test/integration/coding-viewer-close-live-report.json`.
- The interface-capability audit, UI command contract audit, and native coding
  workspace integration test pass after adding Workspace-only command-palette
  visibility for Organize Cards.
- Seventeen nearby authoring, browser, recovery, project-manager, capability,
  interface, and command-contract regressions pass together after adding live
  engine-profile invalidation. The integration test proves verified Nightly
  reveals the string recipe and returning to 1.0 removes it without reopening
  Coding Assistance or rebuilding Controllers.
- The installed 0.79.116 test build contains byte-identical copies of
  `authoring_browser_workspace.js`, `authoring_workspace.js`, and
  `text_editor_toolbar.js` from this audited source checkpoint. The later
  capability-refresh checkpoint additionally verifies byte-identical installed
  `project_context_ui.js`, `project_registry_events.js`,
  `engine_capability_events.js`, and `updater.js`. Installed
  `package.json` also contains the Workspace-only Organize Cards contribution.

## Required physical signoff

1. Reload VS Code, open Ryu through Character Essentials, choose **Native
   editor + coding tools**, and visually confirm the runtime-proven two-group
   placement is comfortably sized.
2. Type continuously in a large ZSS file. Confirm native coloring, warnings,
   completion, Undo, dirty indication, and caret response remain normal.
3. Use arrows, slider, native tabs, Tabs layout, Cards layout, and named hands.
   Confirm all routes activate the expected native document without moving the
   shared toolbar.
4. Introduce a temporary literal reference to a nonexistent command. Confirm a
   critical native diagnostic and Problems entry appear, then remove it and
   confirm both clear.
5. Save a code file and confirm Code Navigator/Project Data/recipes update.
   Confirm ordinary typing does not visibly rebuild or flash those panels.
6. With a 1.0 project selection, confirm Nightly string recipes/options are
   absent. With an explicitly verified supporting Nightly selection, confirm
   they appear.
7. Reload the VS Code window with both companion tabs open. Confirm both restore
   in the same companion group without duplicates. Close the character
   workspace and confirm both companions close.
8. Repeat Character Essentials with Native selected and confirm only normal
   text-editor tabs open.

## Early-game coding priority checkpoint — 2026-10-13

- Move Lab now projects exact, read-only relationships for the selected
  StateDef, Function, HitDef, Helper, Explod, or Projectile. The compact panel
  includes literal map/variable access, function calls, state transitions, and
  resource creation sites with declaration destinations when proven. Dynamic
  expressions remain explicitly unguessed.
- Unsaved assigned documents are authoritative. Missing/unreadable assigned
  sources mark the projection incomplete instead of producing unsupported
  missing-symbol claims. Inline results are capped at 64 relationships and
  eight exact sites per relationship; the full Project Symbols & Contracts
  browser owns overflow.
- The project catalog is built once per Move Lab model and serialized with a
  shared file table rather than copied into every component. The current Ryu
  assignment measured about 81 ms for complete direct-component discovery and
  project indexing, with 746 compact catalog entries in the source-test run.
- Every exact Move Lab component can open Visual Code Structure at the smallest
  current block containing its proven source line. The route revalidates the
  component revision before opening and never guesses an AIR action or StateDef
  from a similarly numbered asset.
- ZSS components expose one manual **Context Suggestions…** route inside the
  collapsed relationship section. It first revalidates and opens the exact
  native source, then invokes the existing catalog-backed suggestions. Nothing
  appears automatically and nothing is inserted without another explicit user
  choice.
- The critical safety audit remains green: complete owner-scoped catalogs flag
  missing commands, owned functions, and literal runtime StateDefs; incomplete
  ownership fails silent rather than guessing. Conservative/1.0 projections
  continue hiding Nightly string tools.
- All 66 focused Coding Viewer acceptance files pass after these additions.
  Visual placement, button feel, perceived Move Lab opening speed, source
  focus, and suggestion usefulness remain physical-test pending.

## Project-data relationship checkpoint — 2026-10-14

- Project Symbols now indexes project constants/uses, bidirectional literal
  StateDef transitions, and lifecycle-aware Helper/Explod/Projectile sites.
  Resource sites retain exact enclosing code ownership; unresolved creators and
  dynamic IDs remain visible limitations rather than guessed failures.
- Direct category commands reuse the one existing browser. Exact identifier
  copying is separate from stable identity copying and is authorized from the
  current host-side catalog.
- The same index now includes assigned legacy command declarations/uses,
  function signatures, and authored runtime recipients for maps/variables.
  Compact Coding Assistance exposes exact relationship rows. Nightly string
  summaries are content-free and capability-gated; stable 1.0 remains clean.
- Similar Code comparison cleanup and Comment Assistance off/manual behavior
  have focused regression coverage. The complete 66-file acceptance boundary
  remains the release-facing source gate; installed interaction remains pending.
- Authored function documentation now reaches native hover/signature help and
  the project index. Resource lifecycle metadata and read-only definition/use
  comparison remain exact-source, revision-aware inspection features.
- Authored StateDef documentation now reaches project discovery and the
  runtime-ordered StateDef completion list. Large definition/use and rename
  reports stop after 256 exact sites and disclose the remaining count.

## Native authoring intelligence checkpoint — 2026-10-14

- Visual Code Structure has a presentation-only Focus Mode with an explicit
  hidden-block count and Show All. A native-editor command now opens the exact
  block under the caret already focused; it does not delete, disable, or alter
  source and reuses the existing structure panel.
- The native Outline nests parameters, scoped locals, authored calls, literal
  command uses, state transitions, controllers, maps, variables, constants,
  redirects, and Helper/Explod/Projectile lifecycle sites beneath their exact
  Function or StateDef owner. Equal scoped names remain separate.
- Go to Definition and Find References now understand literal resource IDs in
  the complete owning character catalog. Helper, Explod, and Projectile
  namespaces remain independent. Resource rename stays disabled because
  dynamic/runtime sites cannot be proven complete.
- Resource IDs have exact current-document lifecycle hover and route into the
  one Project Knowledge browser for project-wide creation, mutation, cleanup,
  and reference review. Current-symbol routing reaches these same cards.
- Authored maps, variables, and constants show exact definition/write/read
  summaries in native hover. `map(...)` and `const(...)` completion uses only
  exact names from a complete owner catalog and remains silent when ownership
  is incomplete; it never invents values.
- Authored-function and trigger/expression pickers support favorites-first
  ordering with Recent, Most Used, or Alphabetical preference. Insertions
  revalidate source/catalog identity, use editable authored parameter
  placeholders, produce one native unsaved edit, and update usage only after a
  successful insertion.
- Contextual Recommendations now supports Off, Manual, and Optional Suggestions.
  Optional Suggestions is a quiet native lightbulb only when deterministic
  catalog matching finds a result. It never pops up, calls AI, edits, saves, or
  inserts without an explicit second choice.
- Project Knowledge groups exact occurrences into Current File, Current
  Character/Assigned, and Connected/Shared scopes and presents resource
  Creation, Mutation, Cleanup, and References separately while retaining All
  Occurrences. Trigger/controller cards retain bundled signatures,
  documentation, status, and honest catalog-completeness limits.
- Literal Helper, Explod, and Projectile ID completion is available only at
  exact reference or mutation sites and only from a complete owner catalog.
  Creation fields deliberately receive no reused-ID suggestions. Multiple
  literal creation sites are labeled for runtime-exclusivity review rather
  than declared invalid, because mutually exclusive states may legitimately
  reuse an ID.
- String-returning authored-function completion and insertion are omitted for
  stable 1.0 and unverified targets and appear only with verified Nightly
  string capability. The Project Knowledge String Flow filter follows the same
  rule and is absent—not merely disabled—under 1.0.
- New authoring commands have explicit cold-start activation coverage, so
  Focus Current Block, Open Current Symbol, trigger/function insertion, and
  manual contextual recommendations do not depend on an already-open viewer.
- State-transfer ownership now recognizes `TargetState` and unredirected
  `SelfState` inside exact `StateDef -2/-4` as executor-own references to the
  current character catalog. Ordinary recipient-dependent SelfState and
  function/dynamic/redirected cases remain deliberately unclaimed. The four
  focused state parser/catalog/diagnostic/provider suites pass.

## Exact engine-catalog and String Flow checkpoint — 2026-10-14

- The bundled trigger catalog now includes the portable core language surface,
  not only recently added expressions. It contains 277 unique entries after an
  exact parser-token audit against both the IKEMEN GO 1.0 tag and the selected
  current source revision. `InDialogue` and `IsClsnProxy` were removed because
  current source does not register them as author-facing triggers.
- `AnimLoopCount` and `HitDefVar` are capability-gated because the exact 1.0
  compiler does not expose them. `ShaderSet` is restored to controller help;
  its stable fields remain portable while newer player/shadow/reflection/
  afterimage fields and dynamic shader-name input require their exact
  capabilities. Dormant but unregistered `CreatePlatform` source is deliberately
  not advertised as an available controller.
- Dynamic redirected `Command`/`SelfCommand` expressions receive a targeted
  compatibility warning on affected supporting builds and clear only when the
  selected target includes the verified redirected-expression fix. Stable 1.0
  remains outside that Nightly-only diagnostic path.
- Coding Assistance now has a bounded **String Flow** view over the existing
  Project Data provider. It distinguishes observed producers, function-argument
  consumers, named function-parameter inputs, verified runtime consumers, and
  dynamic command-name consumers, retaining exact source rows without retaining
  string literal contents. Positional call evidence is correlated only when a
  function declaration resolves uniquely; ambiguous declarations do not invent
  a parameter contract. Coding Assistance and Project Knowledge share the same
  role authority and compact role filter. The view, role controls, searchable
  role vocabulary, and string-only evidence are absent for 1.0/conservative
  targets and are removed immediately if capability authority changes back to
  1.0.
- The full source acceptance boundary now passes all 89 focused Coding Viewer
  files after these catalog and browser additions. Installed interaction and
  visual signoff remain governed by the physical checklist above.
- Exact simple string references now flow through scoped locals, maps,
  constants, uniquely declared string-returning functions, function arguments,
  and named parameters. A bounded eight-pass analysis follows nested function
  and assignment chains while mixed, ambiguous, dynamic, or multiply declared
  evidence stops propagation. Only producer identity and value kind are kept;
  literal string contents remain absent. Stable 1.0 hides the resulting
  summaries, roles, and filters.
- Project Knowledge and Coding Assistance now share a compact read-only
  **Identifier Glossary** scope over the existing Project Data catalog. It
  includes authored persistent identifiers and lexically scoped locals/
  parameters, inherits membership onto exact source rows, and keeps engine
  trigger/controller uses out of the glossary. Differing authored descriptions
  for the same category/name receive a vocabulary-review label without merging
  scopes, enforcing a naming rule, or changing source.

## Cached project evidence and logger-flow checkpoint — 2026-10-14

- Project-symbol parsing now reuses records only for an exact canonical path and
  SHA-256 source revision. The cache retains only the newest revision per path,
  is capped at 256 files and 16 MiB total, and never retains an individual
  source larger than 4 MiB. Changed unsaved text invalidates immediately;
  ownership, assigned/connected scope, target capability, and UI projections
  are still rebuilt for the current character rather than cached across it.
- A 26-file Ryu/shared source benchmark containing 1,495 catalog entries measured
  about 129 ms cold and a 54 ms median over seven unchanged warm builds. This is
  source-test evidence, not an installed responsiveness signoff.
- Verified-Nightly String Flow now distinguishes a **logger consumer** from a
  controller runtime-string input. A `PrintToConsole`, `DisplayToClipboard`, or
  `AppendToClipboard` parameter enters that role only with positive string-kind
  evidence; a generic `%v` operand is not presumed to be a string. Literal
  contents remain absent, and stable 1.0 exposes neither the role nor evidence.
- Native scoped-parameter hover now summarizes exact positional call kinds from
  calls in the current source. Numeric evidence remains available to stable
  projects; string evidence and length-only summaries require the verified
  runtime-string capability. The hover explicitly defers connected-file flow to
  Project Knowledge and never claims a runtime type.
- Function and StateDef cards now include bounded indirect impact paths inside
  the existing Project Knowledge and Coding Assistance surfaces. Function paths
  show indirect callers and dependencies; StateDef paths show indirect literal
  transition sources and destinations. Both stop at 64 records or eight edges,
  disclose cycles/truncation, stop at ambiguous declarations/definitions, and
  never claim dynamic calls, dynamic destinations, runtime recursion, or runtime
  reachability. Every displayed path retains an exact source route.
- Coding Assistance keeps those indirect rows out of its ordinary mixed result
  list. One compact **Impact Paths** switch isolates the existing Project Data
  provider, inherits membership onto exact source-site children, and is mutually
  exclusive with Identifier Glossary and String Flow. Escape leaves the scope;
  the webview cannot supply its own enabled state or relationship data.
