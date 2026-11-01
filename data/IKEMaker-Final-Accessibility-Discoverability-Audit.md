# IKEMaker Final Accessibility and Discoverability Audit

Status: **bounded software audit complete; segmented regression ledger complete; physical QA explicitly unperformed**.

This checkpoint does not claim installation, packaging, publication, desktop takeover, live-game mutation, automatic asset writes, or physical release approval.

## Authoritative evidence

- [All-screen control-to-route audit](IKEMaker-All-Screen-Control-Route-Audit.md): 65 registered surfaces, 3,614 explicitly classified controls, 0 pending candidates inside the bounded static/generated inventory. The document distinguishes per-control evidence from shared implementation and retains dynamic/native and physical caveats.
- [Structured control inventory](IKEMaker-Control-Route-Inventory.json): machine-readable owners, destinations, availability transitions, reasons, evidence, source locations, and shared-implementation aliases.
- [End-to-end workflow audit](IKEMaker-End-to-End-Workflow-Audit.md): 16 currently advertised software workflow families audited, 0 partial, 0 queued. Row-level physical/backend limitations remain recorded.
- [Structured workflow inventory](IKEMaker-End-to-End-Workflow-Inventory.json): guidance, destination, output, return, cancellation, evidence, and unresolved physical/backend boundaries for each advertised family.
- `NEW_DEV_CHAT_COMMUNICATION.txt` in the shared Notes folder: independent New Dev findings, corrections, re-runs, and final bounded acceptances.

The totals above are inventory and executable software-evidence totals. They are not substitutes for the manual checks below.

## Cross-surface invariants verified in software

- Shared headers expose the established universal history, help, update, mode, source, and return/focus conventions without silently inventing specialist ownership. Fixed icon sizing, semantic color/tint conventions, forced-color states, and icon names are covered by `viewer_toolbar.test.js`, `authoring_shell_compact_css.test.js`, and `icon_control_accessibility.test.js`.
- Workspace, Simple, and Player visibility rules retain a reachable path to specialist tools while hiding controls intentionally excluded by mode policy.
- Character, stage, screenpack, storyboard, and project routes retain exact source/owner identity; stale, dirty, closed, ambiguous, or changed owners fail closed with owned guidance.
- AIR, SFF, and SND connected-file/entity changes preserve exact source binding, selection authority, history ownership, and current-viewer state on rejection.
- Each ordinary viewer owns at most one companion browser attachment, with focus/float/close/restore converging on that attachment; `viewer_browser_manual_lifecycle.test.js`, `companion_browser_lifecycle.test.js`, `visual_authoring_browser_companion.test.js`, and `air_browser_entity_retarget_lifecycle.test.js` cover the implemented lifecycle. Transfer is the deliberate exception: it owns exactly two pinned endpoints with explicit source/destination roles, exact physical occurrence selection, actionable Copy/transfer availability, and normal-context restoration (`sff_transfer_mode.test.js`, `air_transfer_model.test.js`, `snd_transfer_model.test.js`).
- Disabled controls in the bounded inventory expose a concise visible, keyboard-reachable recovery path through their owning status/help surface; titles and `aria-description` supplement that path rather than replacing it. Intentionally hidden or presentational elements are classified instead of being counted as dead affordances. Every currently known product-owned dynamic factory and native contribution has an explicit route row or registered surface; no known current IKEMaker control remains deferred as “runtime only.” Future, third-party, operating-system, or otherwise undiscovered runtime controls remain a discovery limitation rather than a known product backlog.
- Keyboard contracts include the implemented list/tab/menu navigation, local Escape behavior, focus restoration, and non-pointer alternatives represented in the matrices.
- Viewer and code surfaces preserve native or equivalent context-action access without pointer-only ownership: AIR and SFF canvas menus expose their keyboard/focus routes, while code actions retain the registered native context menu (`air_viewer_html.test.js`, `sff_viewer_experience.test.js`, `sff_viewer_accessibility_client.test.js`, `zss_context_menu.test.js`, and `universal_toolbar_webview.test.js`).
- Native dialogs, file/folder discovery, external tools, and backend rendering remain bounded by explicit cancellation and authority checks; software tests do not claim their physical rendering or operating-system focus behavior.

## Concrete final-audit corrections

- Connected AIR switching now carries and revalidates the exact primary/shared AIR-to-SFF binding, persists it through restore, rejects deleted/changed/missing/ambiguous ownership with one owned warning, and leaves source bytes/current viewers unchanged on failure.
- SND desktop drop now composes the real browser/client/viewer/intake/manifest route, applies selected `group,index + 1` or `0,0` defaults, preserves the active SND, and writes no manifest on cancellation.
- SND live availability guidance now separates ready playback/WAV export from unavailable manifest editing and names the actual enabled Profile → Assignment → Build Workspace recovery path. Empty archives no longer direct users to a disabled Add action.
- Custom SFF and SND editor summaries now cite their separate per-control body rows rather than implying that body coverage came from shared chrome. Pointer/waveform/drag-drop/rendered-focus/screen-reader/narrow-layout checks remain explicit.
- SFF v1 displays a point-of-use compatibility notice: preview/export/transfer are available, direct modification is limited to sprite axes, and expanded editing is planned for a future update.
- SFF history review no longer performs a full vault rebuild for every artifact in a schema search. One fresh whole-snapshot verification returns defensive copies; canonical names, both allowed terminal schemas, ambiguity rejection, changed bytes, changed head, and late mutation-lock rejection remain tested. Under concurrent regression load, production-sized plan derivation measured 2.6–2.7 seconds, checkpoint commit/replay 1.6–1.9 seconds, and the separately approved completion transition 2.6–2.8 seconds. The exhaustive two-route fault-injection suite remains intentionally longer because it repeats rejection, interruption, replay, capsule, cleanup, and tamper scenarios.
- Direct SFF/AIR/SND toolbar commands now retain their owning-surface boundary even when the command itself needs no seed. Foreign viewers use the explicit reviewed cross-surface handoff; restored legacy webviews receive the same owner check instead of bypassing it.
- Comparison swaps now begin an uncontended persistence operation in the initiating event turn, serialize repeated Swap, make Close wait for the exact pending write, and distinguish “saved state unchanged” from “saved state restored” failures.
- The retired SFF manual-save compatibility owner is no longer emitted as a hidden test button. The complete duplicate legacy row remains retired as one unit while universal Save and axis autosave retain their owned routes.
- The shared Stage/Screenpack/Storyboard Visual Browser factory and serializer now use the explicit shared viewer-placement tracker name, so source discovery and executable placement tests prove the same owner. Storyboard reusable-scene capture now explains that it saves the complete selected scene to the shared visual component library.

## Unsupported or deferred boundaries

- SFF v1 editing beyond sprite-axis changes is future work and is disclosed in the viewer.
- Physical canvas pixels, waveform rendering, pointer capture, native drag/drop, real PSD decoder output, real backend SFF/SND generation, and live game behavior are not proven by DOM/host tests.
- Installation, packaging, update installation, publication, paid calls, and live asset/game mutation were outside this audit and were not performed.
- Every currently known product-owned runtime factory and native contribution is explicitly represented in the generated inventory. Future providers, third-party extensions, operating-system-owned dialog controls, and otherwise undiscovered runtime surfaces require registration/tracing and inventory regeneration when introduced or discovered.

## Segmented regression ledger

The terminal evidence is intentionally reported as a segmented sequential run, not misrepresented as one uninterrupted all-green process:

1. The earliest alphabetical attempt stopped at `drag_handle_safety.test.js` because its Throw control assertion accepted only one valid HTML quote style. The assertion was narrowed to the same exact control while accepting either valid quote form; the focused suite and independent New Dev review passed without removing pointer-safety coverage.
2. The next attempt stopped at the new `icon_control_accessibility.test.js`. Concise accessible names and matching pointer tooltips were added for the audited icon-only navigation/zoom/pane controls across AIR, Helper, HitDef, Menu & Modes, Move Lab, Spatial Composer, Roster, SFF Browser, and Throw Creator. That focused suite passed independently, and the alphabetical run resumed after the icon boundary.
3. The resumed run passed its prefix through the SFF Creator result pipeline, then stopped on a stale saved-result classification evidence-role expectation. The registry/test contract was corrected to distinguish semantics established at CandidateBuilt/Persisted from exact unchanged retention through later checkpoints; both focused registry/classification tests passed and New Dev accepted the interpretation.
4. The resumed suffix passed through the stabilization boundary, then stopped on stale release-version metadata. The historical audit and web activation version were aligned to the package version; web command parity exposed 22 package commands missing from the browser fallback registrar, all were registered as explicit unavailable browser routes, and focused stabilization/web tests passed.
5. The next suffix stopped on a real direct-command owner-gating defect. The current catalog and restored-webview compatibility path were both repaired; dispatch, catalog, parity, availability, client-availability, command-contract, and final-cohesion tests passed with independent New Dev review.
6. The final resumed suffix found and repaired the comparison Close/Swap timing and failure-wording defects, the hidden SFF compatibility button, the Visual Browser placement-discovery alias, the missing Storyboard reusable-scene description, and a stale Production Workflow concurrency harness. Each focused repair passed its neighboring behavior tests. The suffix then completed through the final ZSS test with exit code 0.
7. Current-code SFF reruns passed recovery/history bridge planning, SFF 2.0/2.1 deterministic history review and checkpoint replay, built-in lifecycle runtime, execution-result capture, saved-result verification, classification bridge, and append preparation. These are focused current-code confirmations in addition to the segmented alphabetical ledger.

This ledger records every interruption and repair; it does not claim that the pre-repair failing processes later became green without restart.

## Required physical QA before release sign-off

Record each check with build identifier, mode/context, input asset, result, and a screenshot or short capture for failures. A failure should identify the exact surface/control and expected recovery text.

1. **P0 — keyboard-only representative sweep.** In Workspace, Simple, and Player modes, open one character, stage, screenpack, storyboard, and project context. Traverse headers, tabs, menus, context actions, dialogs, browsers, and primary workflows using Tab/Shift+Tab/arrows/Enter/Space/Escape only. Expected: visible focus, no traps, local Escape behavior, exact focus return, and every disabled action exposes its recovery.
2. **P0 — native picker and cancellation sweep.** Exercise representative Open, Save As, file-or-folder, external-editor, profile/assignment, and destination pickers. Cancel each once and complete each once. Expected: cancellation writes nothing and restores the owning surface; completion opens/focuses the exact destination without duplicate windows.
3. **P0 — AIR/SFF/SND physical interaction sweep.** Exercise collision selection/resize/move/context menu, sprite/image axis movement, zoom/pan, waveform seek/range, connected-file switching, browser focus/float/close, and desktop drag/drop. Expected: pointer capture releases safely, undo/redo owns every mutation, exact source remains visible, and unavailable routes explain recovery.
4. **P1 — screen-reader sweep.** With NVDA, sample universal headers, one complex editor per asset family, live availability/error/status regions, listbox/tab/menu selection, and modal return. Expected: concise names, state/position announcements, no duplicate live chatter, and disabled reasons announced at the control.
5. **P1 — narrow-layout and zoom sweep.** At the narrowest supported editor width and 200% UI zoom, sample every registered surface family, especially SFF/SND/AIR custom editors and browsers. Expected: no overlapping controls, clipped primary actions, hidden focus targets, or horizontal-only recovery text.
6. **P1 — contrast and non-color state sweep.** Check selected, marked, dirty, warning, disabled, collision, palette, and transfer-role states in light/high-contrast themes. Expected: state is not communicated by color alone and remains legible.
7. **P2 — real backend fixtures.** With copies only, run representative real AIR/SFF/SND/PSD assets through preview, intake, comparison, and reviewed output routes. Expected: physical output matches the reviewed plan; originals remain byte-identical unless the user explicitly approves the guarded write.

Physical QA remains open until these results are recorded. The software matrices should be regenerated after any resulting repair.

## Final gates

- Global viewer contract generation/test: passed.
- Final surface-cohesion/accessibility gate: passed.
- UI command/button/open-create contract gate: passed.
- All-screen matrix gate: passed at 65 surfaces / 3,614 controls / 0 bounded pending candidates.
- End-to-end matrix gate: passed at 16 / 16 advertised software families.
- Direct-write authority audit: passed.
- Connected AIR and SND composition suites: passed with independent New Dev review.
- Canonical retained-artifact and fresh bulk-snapshot safety suites: passed with independent New Dev review.
- Segmented alphabetical regression suite: passed through the final test after each discovered defect was repaired and the suffix resumed; exact interruption/repair evidence is recorded above.

### Replay commands

Run from the IKEMaker extension worktree:

```powershell
node tools/audit_viewer_contracts.js
node tools/generate_all_screen_control_route_matrix.js
node tools/generate_end_to_end_workflow_matrix.js
node test/viewer_contract_audit.test.js
node test/viewer_final_cohesion_f3.test.js
node test/ui_command_contract_audit.test.js
node test/all_screen_control_route_matrix.test.js
node test/end_to_end_workflow_matrix.test.js
node test/direct_write_audit.test.js
node test/air_connected_switch_composition.test.js
node test/air_connected_switch_host.test.js
node test/connected_asset_inventory.test.js
node test/air_viewer_html.test.js
node test/snd_browser_drop_intake_composition.test.js
node test/snd_custom_editor_accessibility_client.test.js
node test/snd_viewer_accessibility_client.test.js
node test/snd_viewer_html.test.js
node test/sff_creator_retained_artifact.test.js
node test/sff_creator_operation_vault.test.js
node test/sff_creator_history_review_plan.test.js
```
