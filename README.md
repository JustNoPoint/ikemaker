# IKEMaker

- **0.79.447** restores Project Data discovery when VS Code has no useful workspace folder. An empty workspace-wide ZSS search now falls back to the active file's character/game project root, reports that scope clearly, and keeps Refresh, partial-scan, and failure guidance intact.
- **0.79.446** completes the unified AIR/SFF/Palette Workshop authoring pass. Direct SFF Delete, Delete Group, Rename Group, and Duplicate actions now operate immediately in the current viewer, retain Undo/Redo recovery, and no longer divert into the advanced build workflow. Palette Workshop includes standalone and SFF-backed template creation, true-color intake, indexed palette organization, session/PSD continuation, and direct reviewed outputs. AIR collision boxes support selection, dragging, resizing, clipboard operations, persistent appearance controls, and push-box guidance.
- Adds native compact CNS/ST and AIR Outline/Go-to-Symbol support. Legacy StateDefs own their controller sections; AIR actions show authored frame counts and comment labels without resolving Copy Action aliases or indefinite durations into invented timing.
- Controller completion now offers a normal required-fields template and an explicit `(all parameters)` template for both ZSS and CNS. Optional fields stay commented until the author deliberately enables them.
- Adds bounded, read-only syntax-hygiene diagnostics for semicolons, duplicate controller parameters, unknown controllers, braces/strings/headers, loop/switch control, and an opt-in unknown-trigger check. Every rule has an independent resource setting and external names can be allowlisted.

## 0.79.447

- Project Data first searches the opened workspace as before.
- If that search returns no ZSS files, it performs a bounded fallback search rooted at the active project file.
- The tree identifies an active-project fallback instead of misleadingly reporting an empty workspace-wide inventory.
- Added regression coverage for failure, partial scans, and the active-project fallback.

## 0.79.446

The release also unifies compact sprite/sound intake, direct archive mutation, browser filtering, template-image cleanup, thumbnail paging and caching, true-color SFF v2.1 writing, layered PSD interchange, and palette application to sprites and animations. The bounded route inventory covers all 65 registered surfaces and all 3,614 currently discovered controls; automated coverage does not replace physical pointer, screen-reader, external-tool, or large private-archive testing.

## 0.79.244

The AIR collision preview now provides readable, persistent appearance controls without changing AIR source: exact percentage opacity, independent Clsn1, Clsn1Default, Clsn2, Clsn2Default, and Push/Size colors, and line width with an explicit fixed-screen or zoom-scaled mode. Existing family and fill visibility controls remain independent, the legend updates with the chosen colors, and Reset restores the established IKEMaker collision scheme.

## 0.79.243

Palette Workshop now keeps palette and color controls on the left and the complete live image editor on the right. Two 256-index banks support cloning, Ctrl/Shift multi-selection, protected-index-aware drag and drop, and an explicit reversible **Mirror A in preview** mode that remains separate from real reviewed SFF palette linking. Channel-colored RGB/alpha and HSV sliders, exact numeric and hexadecimal entry, a hue/saturation wheel, mouse-wheel fine adjustment, and live sprite recoloring share one draft flow. Command & Movelist can open the exact configured glyph archive in this same editor, while text-color tags preview locally and change source only when explicitly accepted.

## 0.79.242

New Dev’s follow-up review hardened the new list browsers before release. SND waveform thumbnails are now loaded only near the visible viewport, in bounded batches, with bounded sampling for large sounds. AIR, SFF, and SND now separate functional categories from real metadata-backed name/comment lists, and SFF search/filter choices persist immediately.

## 0.79.241

AIR, SFF, and SND editors now share a prominent **Lists / Thumbnails** shortcut. A newly created companion browser opens as a compact floating window; if that browser already exists, the shortcut changes it to the requested browsing screen without changing its docked or floating placement. AIR exposes List, Thumbnails, and Combined views with text search and named-category filtering. SFF adds the same three explicit views plus group, category, review-status, and name/identity search. SND gains a dedicated List, Waveform Thumbnail, and Combined browser with group/category filters and exact selection handoff to its editor. Each floating browser remembers a user-adjusted width after starting at its minimum usable width.

## 0.79.240

Lua Coding Assistance now recognizes authored local and global functions, table and colon methods, assignment-form functions, varargs, and exact direct `require` exports. It supplies completion, hover, and Signature Help from source names and documentation without executing Lua or inventing types/defaults; lexical order, bounded parsing, exact module ownership, and source/dependency revalidation keep uncertain or stale results out of the editor. Code Navigation tabs now visibly and accessibly identify Lua files as **Lua**, including generic filenames whose active editor language is Lua. New Dev reviewed and expanded the scope and authority rules; eleven focused coding tests pass without rerunning the unrelated SFF suite.

## 0.79.239

Coding Assistance now suppresses stale function completion, hover, and Signature Help after source edits, assigned DEF/code changes, cancellation, later requests, or exact engine-target changes. A bounded validated function-catalog cache coalesces cold work, measures settled warm queries against a 25 ms budget, and fails closed when authority changes during construction. Live capability projection is centralized so the current Nightly's dynamic map-key, state-type, and animation-prefix assistance reaches the installed editor. New Dev reviewed the race and cache boundaries; twelve focused coding tests pass without rerunning the SFF suite.

## 0.79.238

Coding Assistance now models the exact current Nightly function grammar: arguments and returns are named untyped variables, with no invented declared types or default values. Multiline Signature Help, hover, completion, function browsing, duplicate diagnostics, named-return inference, and project String Flow share that corrected model. The exact `ee4791bcd5e2` Nightly gains gated assistance for dynamic map keys, dynamic StateDef/StateTypeSet strings, `AnimPrefix`, and ExplodVar/ProjVar `animPrefix`; indexed maps and typed-preserving MapSet/MapAdd remain disabled because they are still develop-only. New diagnostics explain string coercion, case-insensitive equality, mixed string/number comparison, invalid state-type values, and unsupported target contexts without retaining private string contents.

## 0.79.193

SFF Sprite Controls now present Onion reference and Onion opacity as complete compact steppers with arrows attached directly to their sliders, a visible opacity percentage, and Pin Current as a separate action. The universal top arrows are now explicitly labeled as viewer history. A new Connected SFF selector provides direct and previous/next access to the character archive plus proven character, configured, game, and fight FX archives without accepting raw paths from the webview.

## 0.79.192

Sprite Controls now keep their position slider bounded inside the compact rail instead of inheriting the viewer-wide full-width input rule, and the generated SFF workspace has one authoritative quick-action toolbar. Character Workbench startup now treats the character DEF's `[Files] sprite` entry as authoritative: discovered common and FX archives can remain connected, but they cannot replace or steal focus from the assigned character SFF. Text-editor navigation likewise ignores stale archive-family context while intentional SFF/AIR/SND viewer-to-viewer routing remains available.

## 0.79.191

The attached text-editor header now measures its actual compact controls and tab navigator, then fits the upper row to that content instead of reserving a fixed percentage of the screen. The fit is bounded so short displays retain the complete text-specific header, preserves the protected header-above-editor layout, and runs only once per header so later manual resizing is respected.

## 0.79.190

Character Workbench close now remains active until the entire restored character session has stayed empty, so VS Code cannot reveal SFF, AIR, or SND viewers one at a time and force repeated close attempts. In-flight character opening is cancelled before it can republish tabs or a false success message. AIR and SND now persist the same exact multi-character ownership used by SFF; shared viewers remain for their other owner, while unrelated inactive restored viewers are never claimed. SFF restoration refuses a closing owner before touching its viewer cache. One close produces one final result after the complete owned session is drained.

## 0.79.189

Character Workbench sessions now record explicit ownership of SFF viewers, including shared-template archives that are not directly assigned in the character DEF. Closing a character closes its sole-owned shared viewer, releases rather than destroys a viewer still used by another character, and leaves intentionally standalone viewers open. A viewer restored from an older build without ownership metadata offers a one-time explicit choice to close it with the active character, which repairs the stuck restored-session case without guessing.

## 0.79.188

Character Workbench close now uses one exact character-owner identity for Code Navigation, Character Connections, Character Health, and CNS Converter workspaces, including URI-less webview tabs. It adopts their connected native source tabs before closing, starts the close guard before draft preflight, and waits for VS Code's editor topology to become stably empty instead of treating a short-lived visible editor as a failure. Shared `chars/template` sources resolve to the current or explicitly chosen saved character and never invent a Template character; exact owner-DEF matching prevents two characters that share files from closing each other's tools.

## 0.79.187

The SFF sprite slider now commits its latest physical archive position while it moves, keeping the selected sprite, Group/Index data, canvas request, compact `N / total` readout, and universal context strip synchronized after release—even with duplicate group/index entries. Character Workbench close refreshes the character’s current on-disk DEF dependency graph before collecting tabs and visual workspaces, so connected shared assets such as a character-assigned SFF in `chars/template` are included instead of being falsely omitted while success is reported.

## 0.79.186

The SFF viewer once again opens on compact Sprite Controls and the sprite preview instead of forcing the retired embedded palette screen. Palette work is reached explicitly through the canonical **Palette Workshop…** action. A malformed generated navigation listener that caused every SFF control to be rejected by the browser is repaired and syntax-tested. Cold-start restoration now activates and immediately disposes cached legacy SFF Browser pages, while a live comparison browser has its own **Close Browser** action and guarded Escape exit. New Dev reviewed the restore, close, accessibility, navigation, and generated-client paths and approved the release slice.

## 0.79.185

Sprite, sound, palette, command-file, code-file, HitDef-file, and move-state navigation sliders now preview their position while dragging and commit one exact selection when released. Duplicate SFF sprite and SND sound identities retain their physical archive occurrence through browser selection, marks, anchors, saved state, thumbnails, Palette Workshop handoffs, and navigation history; ambiguous legacy references fail visibly instead of silently choosing the first match. Character Workbench closure now includes reserved `template`-folder asset viewers in the same atomic close transaction, preventing retained SFF/AIR/SND workspaces from reopening or blocking character closure.

## 0.79.184

Closing a character from Character Workbenches now follows the real editor topology instead of mistaking a still-loaded VS Code document for an open editor. It waits for tab and visible-editor events to settle, closes the exact character-owned visual workspaces afterward, and keeps unrelated tabs and project screens untouched. A genuine refusal now names the exact file or visual workspace that remains open instead of showing an unactionable generic warning.

## 0.79.183

Project & Team Manager now uses a compact, purpose-built local header instead of the asset-viewer menu and icon toolbar. A generated-client quoting error that prevented every tab and control from running is fixed and compile-tested. The screen has a visible **Close Manager** action, plus Escape and Alt+Left exits, while ordinary tab/window closing remains closed. Its header wraps cleanly at narrow widths without horizontal scrolling.

## 0.79.182

- AIR source opened from the Actions Browser keeps its exact return route as soon as the source editor opens. If window topology or the compact return header degrades afterward, IKEMaker restores the AIR browser but does not discard the source escape authority.
- `Escape`, `Alt+Left`, the compact **Return to AIR Browser** strip, and the exact source close action provide redundant exits. Ordinary tab close, Close All, and window close are respected and never reopen or refocus the browser.
- Palette Workshop adds reviewed palette-number compaction under Standard **Batch Tools** and Advanced **Sync / Remap / Repair**. It previews an exact old-to-new map, preserves requested gaps as order barriers, builds and compares a candidate, applies only after verification, and retains one reviewed Undo.
- Compaction never rewrites source code. Affected, dynamic, unreadable, linked, oversized, or incomplete project-reference evidence blocks the operation; exact SFF, domain-registry, and source evidence is rechecked at Build, Compare, and Apply.
- New Dev rejected three recovery and bounded-audit gaps during review, then approved the corrected slice. The AIR suite and all 106 Palette Workshop tests pass.

## 0.79.180

- AIR source opening no longer trusts editor-group topology across physical VS Code windows. A browser floated by IKEMaker must be explicitly returned to the main window before source opens; a browser detached with native controls keeps its own window focused and opens source locally beside itself.
- Floating-state checks run before document admission and are repeated after awaited collision or hit-region evidence rebuilds. If the browser moves during navigation, no target source document or editor opens and the exact browser stays visible.
- Manually closing a routed source returns to its exact live AIR browser. Dirty-close cancellation retains the source and route; delayed close events cannot focus twice; native Close All bursts, IKEMaker context shutdown, disposed browsers, and wrong origins do not reopen or steal focus.
- New Dev reviewed the reported cross-window trap before implementation, found and rejected two remaining race paths during post-review, then approved the corrected release slice. Focused AIR, text companion, accessibility, and direct-write tests pass.

## 0.79.179

- Opening source from the AIR Actions Browser now verifies the live editor-tab topology at each handoff phase. A resolved window-focus command or a different numeric column is no longer accepted as proof that the source is safely separated from the browser.
- Before the source opens, the exact AIR browser must be the visible active tab. Afterward, the exact source must be active in a different group, and the exact Code Navigation companion must expose the visible active **Return to AIR Browser** strip. The normal two-group layout is supported: the retained AIR browser may sit behind that companion in the header group.
- Same-group takeovers, stale detached-window state, missing or hidden return strips, duplicate or missing exact tabs, and topology changes during the awaited handoff all fail closed. The provisional route is rolled back and the AIR browser is re-revealed without closing a source that may have become dirty.
- New Dev reviewed the live repro before implementation, caught the hidden-tab and canonical two-group cases during post-review, and approved the corrected release slice. Focused AIR escape, text companion, accessibility, and direct-write tests pass.

## 0.79.178

- AIR source handoffs now wait for the exact visible **Return to AIR Browser** control to render and become interactive. A sealed one-use render acknowledgement is rechecked against the source, originating AIR browser, companion panel, and current route; timeouts, replacement panels, late acknowledgements, and shared-source rebinding restore the AIR browser instead of leaving an editor with no escape. Returning also restores keyboard focus to the source-launch control, while `Alt+Left` remains the compact keyboard route.
- Palette Workshop Advanced → Sync / Remap / Repair now authors complete named multi-range RemapPal topology. Users can retain, add, remove, and reorder ranges; edit the name, description, enabled state, and linked master domains; see affected sprite bindings; and review expanded pairs, resolved/missing/ambiguous coordinates, conflicts, and delete cascades before Apply.
- RemapPal metadata uses single-use reviewed authority bound to the exact SFF bytes and inventory plus registry hash, revision, archive identity, ordered draft, links, and diagnostics. Ambiguous or conflicting mappings stop, missing coordinates remain explicit metadata-only warnings, registry compare-and-swap prevents stale writes, reciprocal domain links update atomically, existing bindings are preserved, and the active SFF bytes are never changed by this metadata flow.

## 0.79.177

- Palette Workshop now offers a compact **Find useful animation** action beside the live preview. It scores the current exact index or trusted named group against the uniquely assigned AIR/SFF pair and presents up to eight visual suggestions; users never need to know an Action number.
- Suggestions report visible matching pixels, distinct sprites, and authored frames. Repeated frames do not inflate the primary score, while linked palettes, truecolor sprites, missing or ambiguous references, and unknown runtime `RemapPal` behavior remain explicit.
- **Use Preview** switches the existing embedded-versus-draft A/B view to the selected Action; **Open in AIR Viewer** opens that exact Action. Without a unique AIR owner, a complete bounded scan offers clearly labelled static-sprite matches instead of guessing.
- Canonical paths, file hashes, exact DEF assignments, physical palette identity, working colors, and index/group membership are sealed and revalidated. Dirty, changed, oversized, incomplete, stale, replayed, or cross-scope evidence fails closed, and the workflow never writes project files.
- Results use one narrow, keyboard-accessible column with a visible scope label and accessible status. Failed searches return control immediately instead of leaving the button busy.

## 0.79.176

- AIR source handoffs now require the exact Code Navigation header to confirm a visible, full-label **Return to AIR Browser** banner for the exact routed source. If that acknowledgement is missing or points at another file, the source handoff fails closed and restores the originating AIR Actions Browser.
- The AIR return banner sits above the text-tab row, stacks vertically below 520 px, and does not depend on editor-title space, CodeLens, the status bar, or horizontal scrolling. **Close Source & Return** retains native dirty-close cancellation.
- Closing or invalidating the originating browser no longer makes the escape row vanish. The exact bounded source-to-AIR identity becomes a temporary tombstone and the header shows **AIR Actions Browser closed** with **Reopen AIR Actions Browser**. Reopen uses only that sealed AIR path and never searches for another AIR or opens a picker; closing the routed source clears the tombstone.
- Palette Workshop's existing quick-edit Scope selector now includes trusted named index groups without adding another pane or button stack. Group focus, copy, paste, restore/reset, randomize, and Undo operate only on freshly host-resolved exact membership; protected/transparent indices remain untouched and status reports applied versus skipped counts.
- Named-group payloads expose identity evidence and counts but never authoritative palette indices. Wrong-palette, stale-authority, changed-membership, malformed, duplicate, out-of-range, and same-size-different-group cases fail closed; lost authority falls back to Current index with an assertive notice. All work remains in the retained Palette Workshop draft with no SFF, template, metadata, clipboard, or autosave write.

## 0.79.175

- SFF Creator now connects Palette Workshop's saved exact-color replacement rules to intake through one compact, collapsed **Saved color rules** card in the existing final-review step. Nothing is applied automatically: exact matches can be accepted individually or together, ignored for this intake, or opened in the canonical Palette Workshop.
- Suggestions show source and destination swatches, the exact destination index, and affected image/pixel counts. Stale or conflicting rules stay visible with bounded reasons and truthful omitted counts instead of silently disappearing.
- Opening Palette Workshop and returning a reviewed resolution are both single-use, exact-evidence handoffs. Target identity and bytes, master palette, ordered source bytes and decoded pixels, scan, rule registry, conversion profile, Creator generation, and draft revision are rechecked before use.
- Accepted decisions change only the retained Creator draft. Source images, the active SFF, and the rule registry remain untouched; final manifest/package creation revalidates the sealed decision and records its rule provenance.
- File, pixel, rule, occurrence, registry, and nested evidence budgets fail closed before expensive hashing or parsing. Post-prompt mutation, panel disposal, forged/replayed routes, same-byte different targets, stale returns, and oversized aggregate payloads are covered by regression tests.
- New Dev approved the completed backend and UI slice with no remaining P0/P1 findings. All 147 selected Palette Workshop and SFF Creator suites pass, including the full recovery, replay, persistence, authority, narrow-layout, and accessibility set.

## 0.79.174

- Palette Workshop Advanced → Sync / Remap / Repair now provides a compact guided **Master domains & bindings** editor. Each domain requires an explicit unique master palette, palette membership, and at least one live sprite-group binding; optional RemapPal links remain visible and named.
- Domain changes use **Review changes → Apply reviewed metadata**. The host validates the exact SFF inventory, generates new IDs, shows exact delete-cascade references, and applies the domain, reciprocal RemapPal links, and sprite-group bindings atomically in one metadata revision. The active SFF is never written by this workflow.
- Review authority is single-use, expiring, bound to the exact SFF and metadata revision, and revoked by a newer review, refresh, publish, or panel disposal. Stale SFF/registry evidence, missing or ambiguous palettes, missing sprite groups, forged/replayed tokens, oversized registries, and unsafe paths fail closed.
- The SFF browser keeps domain filters and swatch previews read-only and routes editing to the canonical Palette Workshop section. It no longer silently chooses the first domain or owns duplicate domain/binding mutation controls.
- New Dev’s post-review caught and closed empty-binding, hidden-cascade, post-commit truthfulness, review-lifecycle, and registry-size edge cases. All 92 Palette-focused suites pass, along with SFF-browser, accessibility, command-contract, syntax, and direct-write audits.

## 0.79.173

- AIR Actions Browser source navigation now requires the standard Code Navigation text header instead of leaving a raw native editor as the primary source view. Routed AIR/ZSS/CNS sources keep visible **← AIR** and **×** controls in the compact header, including narrow auxiliary layouts.
- If the header cannot be attached, IKEMaker restores the exact AIR Actions Browser rather than leaving the source editor in front without a dependable escape route. Existing browser tab, selection, filters, and persisted view state remain owned by the retained browser.
- `Alt+Left` returns from an exact routed source to its originating AIR Actions Browser. CodeLens, editor-title, and status-bar actions remain redundant fallbacks; normal close and dirty-close cancellation retain native behavior.
- New Dev identified the raw-editor lifecycle gap before implementation, then caught the CodeLens, retained-tab, and shared-owner edge cases during post-review. Focused AIR source, collision-reference, hit-region, character-context, narrow-header, toolbar, and capability tests pass.

## 0.79.171

- Command & Movelist can now export selected saved presets and import selected presets through reusable `.inp2` files. The compact, collapsed **Share saved presets** area sits beside the preset shelf, announces status accessibly, and becomes one vertical button column in narrow docked windows without adding toolbar clutter.
- `.inp2` files use a strict data-only schema containing only preset names and exact native command text. Internal IDs, paths, glyph mappings, generated code, and project data are never exported. Strict UTF-8, duplicate-key, field, count, name, per-preset, aggregate, and native-command checks reject malformed or oversized files before review.
- Import explicitly selects presets and resolves every case-insensitive name conflict with **Keep existing**, **Replace existing**, **Keep both** with a reviewed unique name, or **Cancel entire import**. Replace retains the existing identity; new entries receive collision-checked cryptographic identities rather than clock-based IDs.
- Compatibility is recomputed against the exact active target. Nightly broad-direction presets can be retained on Stable for future use, but are visibly unavailable, not preselected, and cannot be applied until a verified supporting Nightly target is active.
- Import authority binds the exact file hash, workspace-preset snapshot, target capabilities, selection plan, session, and generation. The source, store, and target are rechecked immediately before the serialized write, and workspace storage is independently read back afterward. Export uses transactional replacement plus exact-byte/hash reopen verification.
- New Dev approved the slice with no release blocker. All 25 Commands/glyph test files pass, including a host lifecycle test proving that a changed `.inp2` source fails closed without editing presets or character files.

## 0.79.170

- AIR browser source navigation no longer opens a trapped native editor in a compact auxiliary window. IKEMaker-owned floated browsers return to the main workbench before source opens; manually detached browsers switch focus to main without merging unrelated auxiliary windows.
- Non-owned AIR browser windows never disable the user's always-on-top choice, never invoke VS Code's merge-all restore command, and never claim that the browser moved. If main-window focus or owned restoration fails, the source stays closed and the exact AIR browser remains available.
- Existing exact-line **← AIR** and **× Source** routes remain active for the opened source. Dirty close cancellation, normal tab/window close, source drift, and concurrent handoffs retain their previous fail-closed behavior.
- New Dev approved the correction with no remaining P0/P1 blocker. All 86 AIR-focused test files pass.

## 0.79.169

- Command & Movelist now exposes verified Nightly broad-direction/string analysis only when both the exact target is Nightly and the matching capability is present. Stable, ownerless, legacy-flag, and contradictory capability snapshots remain private and show the correct unsupported-target diagnostic.
- Glyph catalog intake now bounds configuration/mapping text, mapping rows and tokens, SFF bytes and declared entries, sprite dimensions/pixels, decoded sprites, and the complete serialized preview payload before expensive work. Repeated mappings can no longer multiply one decoded image beyond the browser budget.
- The compact Glyph source area adds **Open Mapping Source** and **Open Glyph SFF**. Both resolve from the current config→motif assignment, use content hashes rather than timestamps, permit the expected focus transfer, and reject reassignment, same-size mutation, disposal, or stale generations.
- Workspace command presets now use a strict data-only schema with per-name, per-preset, count, and aggregate limits. Save/delete operations serialize, compare-and-swap after prompts, and preserve the prior store on malformed data, races, or update failure.
- The glyph source actions wrap and become one vertical column in narrow docked browsers. New Dev approved the slice with no remaining P0/P1 findings after the focused Commands/glyphs checkpoint passed.

## 0.79.168

- AIR source routes now register their exact browser return/close handoff before the native editor renders. Detached and narrow source windows therefore show **← AIR** and **× Source** immediately instead of trapping the user in the source editor.
- Every main AIR source route uses the same exact-line escape handoff. A failed or invalid editor open rolls back only its own provisional route, so an older delayed failure cannot erase a newer successful browser route.
- **× Source** now verifies that the editor really closed. Canceling an unsaved-file prompt leaves the source and its escape controls intact; successful close returns to the originating AIR browser without reopening closed surfaces.
- Palette Library duplicate, rename, and delete operations now revalidate source bytes during commit and roll back moved files when either source or manifest authority changes. Active Palette Workshop candidates and the SFF remain unchanged on failure.
- Palette Library save makes ACT alpha loss explicit, distinguishes tray removal from destructive file deletion, and surfaces the exact recovery receipt in the compact narrow-window flow.
- New Dev approved both slices. All 91 AIR-focused tests and all 102 Palette-focused tests pass.

## 0.79.167

- AIR source handoffs can no longer strand a user in a narrow auxiliary editor. Routed sources display compact native **← AIR** and **× Source** controls at the exact revealed code line; directly opened AIR files show the valid Return action only.
- Restored floating AIR browsers retain their window state before source routing. If CodeLens is disabled for the target source, the route fails closed and keeps the AIR browser visible instead of opening a source without its window-local escape controls.
- Exact collision, collision-query, character-context, and hit-region routes share the same handoff. Normal source/window close removes the handoff without reopening either surface.
- New Dev approved the slice. All 92 AIR-focused tests and the text-editor companion test pass.

## 0.79.166

- AIR sources opened from the Actions Browser now retain an exact compact escape path even when the native editor activates before its browser handoff is registered. Routed AIR/ZSS/CNS sources show **← AIR** and **× Source**; a directly opened AIR file with a live browser shows only the valid Return action.
- Browser open, close, invalidation, source close, and bounded handoff eviction update an already-visible text header without requiring a focus change. The status-bar and editor-title routes remain available and exact-source scoped.
- Palette Workshop Advanced now previews exact visual-template topology migrations and retains a keyboard/pointer placement board for newly added swatches. The candidate writer verifies every migrated pixel, revalidates retained authority/topology, derives placement evidence server-side, and preserves topology-only migrations when new swatches are deferred.
- New Dev approved both slices. All 99 Palette test files and all 90 AIR test files plus the text-companion lifecycle suite pass.

## 0.79.165

- Palette Workshop Advanced now has one first-class **Palette Family & Image Sync** work area across image templates, named RemapPal ranges, Quick Browse, forward/reverse image sync, review, and finish steps. The familiar Standard palette workflows remain unchanged.
- Quick Browse can switch between the exact indexed SFF sprite and the exact verified indexed template image. Template previews preserve the retained index plane, dimensions, transparent index, and candidate palette without writing a source or project file.
- Active, paused, summary, and recovery work remains visible when moving through guided steps. Recovery appears as an additive compact card, so saving an indexed copy or continuing in Palette Workshop never replaces the retained Quick Browse state.
- The former Index Layout & Migration entry is retained only as a compatibility route into the new family work area; it can no longer open an empty panel. Apply/Enter restores focus to the color field, and the controls reflow for narrow docked browsers.
- New Dev approved the slice after all 86 Palette-focused test files passed, including exact-template authority, stale-source rejection, Standard/Advanced reachability, narrow layout, Quick Browse state, and recovery actions.

## 0.79.164

- Palette Workshop now keeps explicitly added ACT and indexed-PNG files in a reusable **Added** source tray instead of forgetting them after one preview. Folder discoveries remain visibly read-only.
- Added sources are available from Standard Add and Replace as well as Advanced Modify. Remove selected and Clear added change only the working tray; source files are never deleted and staged build rows remain intact.
- The tray preserves keyboard focus, marks missing, staged, and active-preview entries, wraps cleanly in narrow docked browsers, and scopes Delete/Backspace removal to the focused tray list or row.
- Explicit Added sources take priority over large folder scans. The exact active candidate is pinned by file identity—even at the 2,000-row display limit—so a shifted row can never inherit the preview state. Omitted Added and Folder counts are reported separately.
- New Dev approved the retained-source lifecycle after saturation, removal, focus, Standard/Advanced reachability, candidate, preview-set, selective-transfer, and full Palette regression checks.

## 0.79.163

- AIR source editors opened from the Actions Browser now show a persistent **← AIR Browser** status-bar control, so the return route remains visible in narrow and detached editor windows even when title actions are hidden.
- The control is bound to the exact live AIR browser that opened the source, carries an accessible label and tooltip, and disappears for unrelated editors.
- Deleting, renaming, or closing the originating AIR now clears the source handoff immediately, preventing a visible but dead return control.
- New Dev approved the source-return lifecycle after focused escape, first-use, reference-authority, narrow-window, and Palette Workspace smoke tests.

## 0.79.162

- Palette Workshop Standard Add now visibly guides **Choose & Stage → Build & Verify** and automatically advances to the exact reviewed plan after staging.
- The retained build card identifies the target and staged additions/deletions/shifts, asks for one explicit writer, and reports cancellation, failure, validation, adoption, interruption, and cleanup-recovery states without implying that the active SFF changed.
- Shared build authority now blocks empty plans, concurrent launches, cleanup-recovery replays, changed SFF targets, changed plan files, and plans reviewed against an older SFF before writer selection. Viewer, toolbar, roster, and command-palette routes share the same gate.
- A validated built-in candidate remains separate; SprMake2 adoption remains explicit. An adopted build with failed cleanup is visibly locked to recovery instead of being offered as a retry.
- New Dev approved the completed Palette build path after focused workflow, retained-session, command-route, authority, narrow-layout, and accessibility tests.

## 0.79.161

- Opening source from a floated AIR Actions Browser now restores the browser to the main window before opening the native editor. If restoration fails, no source editor is opened and the browser remains available.
- Every AIR source route uses the same fail-closed handoff, including direct AIR, animation references, collision sources, hit-region sources, and character-context sources.
- Source editors reached from the AIR browser expose an exact **Return to AIR Actions Browser** title action. The handoff also works for routed ZSS/CNS sources and is removed when its source or origin closes.
- New Dev approved the corrected source lifecycle after focused route, title-action, close, and accessibility regression tests.

## 0.79.160

- Opening an AIR source from the narrow Actions Browser now always opens it beside the browser instead of replacing it. Invalid or same-column placement fails safely and returns focus to the browser.
- The attached AIR text header shows a compact **AIR↩** control only while that exact AIR browser remains available; the browser also has explicit **Focus AIR Viewer**, **Open AIR Source Beside**, and **Close Browser** actions.
- AIR browser selection, filters, focused control, and scroll position survive source handoffs. Closing respects dirty forms and in-progress operations.
- Narrow AIR and Coding Assistance browsers now share a no-horizontal-overflow layout contract with wrapping navigation and readable collision summaries.
- Palette Workshop scratch Save is enabled by the real toolbar model and host lifecycle, guided destination intent is retained, and narrow task/step controls wrap without hiding options.
- New Dev approved both the AIR source-return and Palette accessibility slices after focused regression checks.

## 0.79.159

- Palette Workshop now opens on the Standard/Advanced task choices instead of an unexplained expert editing desk. Live sprite and embedded-palette tools appear only for the tasks that use them and remain available from **All tools…**.
- Sprite previews now open at normal full-palette brightness. **Dim other indexes** is an explicit retained inspection choice; legacy implicit dim state is cleared.
- Added a strict lossless scratch-palette document foundation (`.ikpalette.json`) with 256 exact RGBA entries, locked transparent index 0, semantic hashing, tamper rejection, and ACT alpha-loss checks for the guided create-palette flow.

## 0.79.158

- Rebuilds Palette Workshop around a compact Standard / Advanced split. Standard keeps familiar Add, Replace, View/Edit, Library, and batch palette work immediately available; Advanced reveals guided palette-layout, visual-template, synchronization, RemapPal, repair, and candidate-review paths without placing every option on one long screen.
- Adds the shared universal header and single-window asset lifecycle to Palette Workshop, keeps the sprite preview and exact 16×16 embedded palette grid visible as a reusable work desk, and defaults an existing SFF to the familiar Standard tools.
- Adds retained batch-plan evidence before writing, reviewed-durable migration output gates, reclaimable unused index controls, keyboard-accessible topology movement, honest standalone-source guidance, named RemapPal range authoring, and protection against silently discarding multi-range mappings.
- Palette-focused workspace, controller, migration, domain, toolbar, registry, and accessibility checks pass, and New Dev approved the corrected slice. The repository-wide runner still stops at the separate pre-existing AIR viewer reuse harness failure.

## 0.79.157

- Fixes the universal Commands / Movelist action from SFF, AIR, SND, CMD, and assigned code contexts so it opens or focuses the exact character's existing Commands browser instead of falling into a broad character/file search.
- Preserves exact CMD and code-reference selection during the handoff, reuses retained Commands drafts, and revalidates genuinely shared ownership after the bounded character choice.
- Refuses an unassigned seeded asset with a clear ownership message; only an intentionally context-free command invocation may open the explicit character picker.

## 0.79.156

- Gives the attached text-editor companion enough default height for its text-specific file navigation while preserving the same compact shared menu and icon dimensions. The complete tab band is visible by default, with vertical reachability retained for unusually short or scaled windows.
- Restores the compact Commands, Movelist, and Connections navigation below the universal toolbar, adds keyboard tab navigation and live status semantics, and wires the canonical Restart action without adding another toolbar.
- Validates the exact ordered 26-slot Commands toolbar contract so stale or reordered toolbar state cannot silently update the wrong controls.

## 0.79.155

- Corrects the live VS Code editor-group orientation so Code Navigation occupies the compact upper row and the native text editor occupies the large lower row.
- Removes the permanent header recreation watchdog. Closing Character Workbench, Close All, a window, or Code Navigation now stays closed; explicit open/resume, validated serialization, and one bounded startup recovery remain the only creation paths.
- Makes one-time startup recovery yield to an in-progress character/context close, preventing delayed reopen races.

## 0.79.154

- Fixes the protected Code Navigation/text-editor composite so its compact universal header is stacked above the native text editor. Startup, restoration, and self-repair now share one layout contract and explicitly reject the former left/right split.
- Keeps the header in editor group 1 and all native text/viewer tabs in group 2 while retaining the existing header protection and visual-viewer suspension behavior.

## 0.79.139

- Connects the exact selected AIR Clsn1/Clsn2 slot to project collision code without claiming a simulated runtime result. The compact browser distinguishes source-proven meanings, candidate consumers, unresolved evidence, scope, and runtime uncertainty.
- Recognizes the template's configured `Clsn2[2]` High and `Clsn2[0]` Low meanings, per-state hit-reaction and immunity assignments, dynamic `ClsnVar` reads, group-wide `ClsnOverlap` checks, and bounded Function call chains. Invalid, stale, duplicate, dynamic, or unrelated-state evidence fails closed.
- Adds a compact selected-box meaning badge and progressive Code connections details with one-use exact-source routes, bounded diagnostics, and collapsed overflow. The main AIR viewer's `Clsn ↗` action carries the selected Action, frame, group, and slot into this existing browser.
- Reports authored-label/effective-slot mismatches, configured or proven indexes outside the frame's effective slots, inherited/default ownership, and saved/recovery `OverrideClsn` or `TransformClsn` context while keeping runtime participation explicitly unresolved.

## 0.79.138

- Matches Fighter Factory overlap selection in the AIR canvas: a normal click starts with the first box under the pointer, while double-clicking advances through every individual overlapping Clsn1, Clsn2, and Size box—including multiple nested boxes of the same kind—and wraps through the cycle.

## 0.79.137

- Fixes overlapping AIR canvas selection so an ordinary click reaches Clsn1/Clsn2 boxes before an intersecting Size pushbox. Exact pushbox corners remain directly draggable, and repeated clicks still cycle overlapping candidates.

## 0.79.136

- Reworks the compact AIR Actions Browser around understandable tasks: Inspect boxes, Transform, Code recipes, Copy boxes, and Code connections.
- Explains Clsn1/Clsn2 and authored, effective, and state-code collision evidence in short dock-friendly context, while moving technical detail behind expandable sections.
- Replaces cryptic empty screens with one clear reason and next action; hides or disables controls that cannot operate until exact source, target, frame, or proposal evidence exists.
- Fixes the Copy boxes layout at narrow widths and adds accessible labels, roving keyboard tabs, visible focus, non-color selection state, responsive wrapping, and clear disabled styling across the browser.

## 0.79.135
- Routes Viewer Browser to the active AIR or SFF browser instead of Coding Assistance.
- Reserves the Code Navigation header group for the header only; auxiliary browsers and asset viewers now use a separate viewer group.
- Adds an enabled Show / Hide Native Editor Tabs & Scrollbars command to every viewer's More menu and enables safe global More-menu commands.

## 0.79.134
- Stacks X offset above Y offset beside the AIR directional pad so both numeric controls retain usable width in the compact rail.

## 0.79.133

- Adds an explicit `1⇄2` reviewed conversion for one or more selected local Clsn1/Clsn2 boxes. Ctrl-click the collision list or canvas to build the exact selection.
- Adds an explicit `L⇄D` reviewed ownership conversion between frame-local and Default collision blocks. Inherited defaults are safely materialized locally; changes that can affect later frames are disclosed in the review.
- Both conversions revalidate the open AIR document after confirmation, apply as one VS Code Undo operation, and remain unsaved until Save AIR. Ambiguous, read-only, stale, or unsafe shared-target conversions fail closed.

## 0.79.132

- Reflows the compact AIR editor so Group/Index lead into one horizontal offset row containing the Fighter Factory-style arrow pad and X/Y fields. Contact-box and connected-code actions now follow interpolation and precede the editing-status note.
- Adds color- and glyph-distinct access for Clsn1, Clsn1Default, Clsn2, Clsn2Default, effective Size/push, and capability-gated Nightly Dummy collision workflows.
- Shows effective Size geometry on every frame by default, remembers the toggle and preview pose, distinguishes overridden Size with a dashed baseline, and labels whether the current preview comes from a frame override or character sizebox.
- Adds compact Animation, Collision, and AIR-source connectors backed by the existing exact/unresolved reference system.

## 0.79.131

- Restores the missing Fighter Factory-style four-way offset pad in the compact AIR frame editor. Each arrow moves the current element one AIR pixel and uses the normal automatic, undoable AIR edit path.
- Adds a visible compact contact-box action row for Clsn1, Clsn2, reviewed deletion, frame/action scopes, type/default ownership, previous-frame copy, and reuse workflows. Complex or shared operations continue in the exact collision browser instead of guessing at source ownership.
- Adds pan- and zoom-aware pixel rulers along the top and left edges of both AIR animation and SFF sprite canvases.

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

Version 0.79.130 places the existing read-only AIR onion-skin preview directly in the compact selected-frame icon row. Its ◉ button cycles Off, one adjacent frame on each side, and two adjacent frames on each side; the icon shows the active depth, mirrors the authoritative toolbar control, persists with the AIR view, and refreshes the canvas immediately. The Animations menu retains the same action.

Version 0.79.129 adds the clarified Fighter Factory-style AIR workflows. Compact field buttons apply the selected frame's offset, time, flip, transparency, scale, or angle to all following elements through exact frame tokens, reviewed source authority, one native Undo edit, and a modal target summary. Angle receives the same forward-application affordance even though Fighter Factory omits it. The compact Alignment Tool offsets every element in explicitly selected authored animations while excluding read-only Copy Action aliases. A persistent ◆ button and the Animations menu open the selected element in IKEMEN collision tools, exposing indexed properties, Dummy collision when supported, overlap/contact queries, TransformClsn scale/rotation/pivot, and controller bridges without crowding the main rail.

Version 0.79.128 restores the labeled Fighter Factory-style AIR element controls to the main compact editor without duplicating source authority. Group/index, offsets, time, flip, transparency mode, source/destination alpha, scale, angle, LoopStart, and Blend/Offset/Scale/Angle interpolation edit the open AIR document with VS Code Undo. Numeric spinner arrows remain visible without hover. Directive edits preserve collision blocks and attached comments, and unsafe or ambiguous ownership stops instead of guessing. The unlabeled colored Fighter Factory action icons remain intentionally unmapped until their tooltips and exact behavior are confirmed.

Version 0.79.127 keeps cross-viewer SFF/AIR/SND toolbar navigation in the source visual viewer's current editor group. Opening AIR from SFF now creates or reveals an AIR tab alongside the visual viewers instead of allowing the active native text-editor group beneath Code Navigation to capture it.

Version 0.79.126 carries the Fighter Factory-style axis cross through the SFF viewer's post-load compact-sidebar reconstruction. The visible Sprite Controls rail now retains the cross container instead of flattening the relocated authoritative buttons back into an L-shaped flow.

Version 0.79.125 arranges the SFF sprite-axis nudge buttons as a compact Fighter Factory-style directional cross: up above, left and right across the middle, and down below. The controls retain immediate one-pixel preview updates and the existing debounced safe-save behavior.

Version 0.79.124 removes the misleading red **Closed** state from Code Navigation tabs: a file that remains reachable through the connected header is available, whether or not VS Code currently has its document buffer loaded. Tabs now have stable colors by file family, and their compact second line identifies meaningful ownership—**Character**, **Template**, **Shared**, **Stage**, **Screenpack**, or **Connected**—followed only by actionable state such as **Missing**, **Unsaved**, **Warning**, or **Error**.

Version 0.79.123 places the Header-Only Text Layout toggle where it belongs: one compact, pressed-state-aware Code Navigation icon directly beside the tab-scroll arrows and slider, with the same option under **More**. Code Navigation's shallow header menus now expand as compact multi-column menus without their own vertical scrollbar; full-height visual viewers retain their existing menu layout.

Version 0.79.122 adds the opt-in **Header-Only Text Layout**. It clearly warns that VS Code's native editor tabs and editor scrollbars are workspace-wide settings, preserves their exact prior workspace values before hiding them, and restores only values that were not independently changed while the mode was active. The IKEMaker Code Navigation toolbar and one-row scrollable tab header remain visible above genuine native editors. Lua files participate by filename rather than by ownership of the language service, so a separately installed Lua extension retains syntax coloring, diagnostics, completion, Undo, and saving. Character discovery now includes character-local `.lua` files in the same Code Navigation header even when they are not DEF-assigned.

Version 0.79.121 tests the Coding Workspace as three coordinated surfaces: genuine VS Code text-editor tabs retain native syntax coloring, diagnostics, completions, Undo, and saving; a persistent Code Navigation header owns the same dropdown and invariant icon toolbars used by the visual viewers, followed by duplicated left/right tab-strip scroll controls on both sides of a horizontal scroll-position slider and one non-wrapping synchronized text-tab row; and a separate toolbar-free Coding Assistance Browser owns Code Navigator, project-data maps, recipes, controllers, Problems, search, and other expandable assistance screens. The arrows and slider move only the visible tab-strip viewport, while clicking a header tab activates its native text document. Slider dragging uses immediate scrolling so the tab row follows the thumb continuously instead of waiting for release; discrete arrow clicks remain smoothly animated. Clicking a genuine native editor tab keeps the header selection synchronized. Character Essentials and the explicit **Open Coding Viewer** command use this native workspace; the retired webview editor remains only for safe restoration and source regression coverage. Native remains the traditional-editor-only option. This build also repairs legacy restored navigation state that pointed native text into the Code Navigation group, restores AIR startup by declaring onion-skin state before initial persistence and rendering, and suppresses browser scrollbars around the Code Navigation header.

Version 0.79.114 makes Text Editor Viewer mean an editable integrated coding surface. Explicit Open Coding Viewer actions always open or reuse the integrated Visual / Source / Split viewer instead of falling back to ordinary VS Code tabs because of the general presentation preference. The shared asset-viewer button now resolves a connected source into that integrated viewer, while Open Full Text remains the explicit escape hatch to the native editor. DEF and AIR retain their specialist visual launch cards but are now directly editable and saveable in Source/Split mode alongside ZSS, CNS, CMD and other supported authoring sources. Ordinary unconfigured TXT files remain native-only; opted-in code TXT files remain supported.

Version 0.79.113 makes Character Essentials choose its visual asset destination once, then explicitly anchors SFF, AIR and every connected SND viewer to that same editor group. After the first visual tab resolves VS Code's symbolic “beside” placement to a real group, later viewers reuse that concrete group instead of each interpreting “beside” as a request for another pane. Direct single-viewer openings remain independently movable.

Version 0.79.112 restores the hand-curated Quick Start section at the top of IKEMaker Tools after the canonical toolbar catalog had unintentionally replaced it. Open Character is again the first shortcut, followed by the common create, close, related-work, project, roster and launch actions. The complete Project/Edit/View/etc. catalog remains directly below Quick Start, so restoring the guided entry points does not remove toolbar parity or hide specialist tools.

Version 0.79.111 refreshes the packaged extension so Character Essentials and Open All Character Code include the integrated grouped Coding Viewer that was present in reviewed source but absent from the previously installed 0.79.110 package. The route honors the first-run presentation preference: Integrated opens one cohesive Visual / Source / Split character viewer, Native retains ordinary VS Code text tabs, and Ask resolves once for the character task. DEF, AIR and connected ZSS/CNS/CMD sources retain exact character ownership and reuse one viewer; unsupported notes continue to open normally. Assigned AIR, SFF and SND viewers remain separate connected asset workspaces. Authoring Browser providers are stored without mutating VS Code's extension context, including hosts that make that object non-extensible. Focused activation, presentation, Character Essentials, text-toolbar and asset-routing regressions pass.

Version 0.79.110 adds the guarded Ryu PSD reconstruction pass to SFF Creator. The author explicitly chooses separate indexing/master and display palettes, can protect the selected embedded master directly, and reconstructs bodies through the approved manifest with the current SFF as the exact axis/identity authority and fallback. Separate Layer 1 artwork uses base group +10000 with the same index and numeric axis. Missing Layer 1 pages are valid sparse entries rather than synthetic placeholders, so later identities never shift; palette-inexact layers are omitted and reported, while palette-inexact existing bodies are preserved for review. Full-canvas no-crop sources, immutable provenance, target backups, independent validation, the in-house test artifact, SprMake2 comparison, and final reviewed adoption remain part of the existing dual-writer safety path.

The 0.79.109 SFF certification gate additionally limits aggregate decoded pixels, requires complete reviewed compression/crop/table-order evidence, rejects duplicate palette identities and noncanonical byte gaps, and isolates SprMake2's zero-filled padding and bounded unused offsets behind a named compatibility profile instead of weakening canonical built-in validation. For pre-release author testing, SFF Creator now builds the in-house test candidate first, rebuilds the same immutable specification with SprMake2, independently validates both, and requires semantic equivalence plus a final explicit confirmation. SprMake2 remains authoritative and updates the normal target SFF; only the exact in-house result is retained under an IKEMaker/backend-and-hash-labelled filename for hands-on comparison. This guarded workflow does not replace the outstanding real-IKEMEN and platform release gate.

The reviewed 0.78.0 source was imported after its immutable prerelease as an honestly labeled baseline. The existing `v0.78.0` tag still identifies the original release commit and was not moved or rewritten. That baseline import removed personal path/name metadata and excluded the large prebuilt LuaLS VSIX from Git. Versions 0.78.1 through 0.78.4 are separate normal source commits; future release tags should identify their actual source commits.

Version 0.79.109 completes another reviewed Phase 1 SFF slice. The SFF viewer's Change Image action now enters the shared Creator as an exact replacement plan, preserving identity, axis, palette, physical order and provenance instead of maintaining a second mutation path. Removing the final explicitly owned placeholder can delete its temporary palette and lifecycle record in the same validated atomic adoption, while remaining sprite/link/code references or changed review evidence keep it. Link indexes are bounds-checked, actual target-SFF sprites can serve as sealed automatic-axis references, and the runtime certification corpus now covers a deterministic empty archive, both reviewed crop orders, multihop image/palette links, all PNG filters, split image data and partial alpha. Axis-before-Crop now seals the exact cropped PNG and crop-origin axis delta before either backend runs; the bundled SprMake2 and built-in outputs are semantically golden-compared. A lossless SprMake2 adapter canonicalizes supported nonstandard PNG8 containers before its private build while retaining the exact approved original snapshot; partial palette alpha remains exact and clearly disables SprMake2 Build/Compare because that backend cannot preserve it. A fixed-seed 32-archive property matrix adds broad deterministic strict-validation coverage and a sealed aggregate corpus hash without weakening the remaining runtime/platform gate. Temporary ACT/PNG palettes now require an explicit Index or Reversed Photoshop table-order interpretation, which is reviewed, provenance-bound, and normalized identically for both backends. Creator Sources now has a bounded List / Contact Sheet switch with 48 hash-checked host-generated thumbnails per page; both modes share filters, marks and ordering, while exact numeric overrides remain in List mode. Its PNG/BMP/PCX preparation flow now previews the ordered old-to-new map, preserves originals, validates every copied or converted PNG before an atomic write, retains source/output hashes and format provenance, and cleans temporary conversion files. Standard indexed/RLE8 BMP, indexed PCX, 24/32-bit BMP and three-plane PCX conversion is in-house; configurable ImageMagick is only a fallback for uncommon variants. PNG-folder intake now explicitly chooses top-level or recursive scope, deterministically natural-sorts contained paths, skips links, fails whole batches at safety limits, and retains validated immutable working copies for restart recovery; no Creator intake route silently slices an over-limit batch. Missing rows remain visible, and imported plans open only explicit contained project-relative hints; one exact-hash relink action repairs unresolved rows without losing identity or reviewed overrides. Exact duplicate groups can be reviewed together or overridden per source. Mixed independent/share choices remain exact in the backend-neutral specification, while the package deliberately emits no runnable SprMake2 files because its one global duplicate switch cannot represent that plan. Portable SprMake2 CSV manifests and DEF packages can enter that same Creator review while preserving physical row order, identities, signed axes, autocrop, duplicate policy and source provenance. DEF intake supports both indexed-PNG-owned palettes and arbitrary per-row stored ACT assignments: every used table must be a contained, full `0,255` row with explicit `pal.reverseact`, exact hashes and a declared `sprite.usepal`; unused palette rows remain ignored. Creator List mode exposes those per-row palette assignments, and both its contact sheet and full axis/crop preview render the effective stored table rather than misleadingly showing the PNG's embedded colors. The built-in writer now treats the explicit stored palette as authoritative even when the PNG PLTE differs, matching physical SprMake2 semantics; deterministic goldens and the runtime-certification corpus cover that case. Partial ranges, missing tables, changed bytes, duplicate IDs, collisions and unknown table order fail closed. Creator's pre-release default builds and canonically validates the in-house test archive first, then runs and validates SprMake2 against the identical reviewed specification, requires semantic equivalence, records both hashes and the comparison report, and asks once more before atomically applying the exact SprMake2 candidate to the normal target. Only the built-in test result receives a separate IKEMaker/backend-and-hash-labelled filename. A mismatch, backend failure, cancellation or target change updates nothing. The direct SprMake2 build and legacy editable-text route remain available. IKEMaker and the separately packaged IkeMiner now each expose their own dropdown/actions plus one compact, failure-safe switch to the other extension.

Version 0.79.108 deepens the Phase 1 SFF safety path. The runtime-certification fixture kit now emits a sealed, manifest-bound result ledger and runbook for Windows/Linux IKEMEN checks without enabling the built-in writer. SFF Creator also offers explicit, per-source automatic-axis review using silhouette anchors, a trusted reference, or reference consensus. Suggestions use the final crop coordinate space, low-confidence rows are opt-in, every accepted result requires visual preview approval, and a sealed evidence sidecar is bound to the immutable build specification and receipt.

Version 0.79.107 adds the companion switch between the separate IKEMaker and IkeMiner extensions. IKEMaker exposes IkeMiner in its Tools menu and compact quick-icon row, while safely keeping the authoring workspace open when the private companion is unavailable.

Version 0.79.106 completes the current viewer-cohesion pass. Shared dropdowns can extend beyond compact headers without being clipped, quick-button rows wrap instead of scrolling, and redundant visible zoom sliders are retired while Fit, 100%, and mouse-wheel zoom remain. Move Lab routes its former Advanced Tools actions through the shared Tools dropdown. Stage and Screenpack workspaces now use compact left-rail actions, previous/next navigation, selection sliders, readable selection status, and collapsed specialty controls without duplicating command ownership.

Version 0.79.105 brings the cohesive toolbar model to normal text editors. Supported ZSS, CNS/ST, CMD/INP/JNP/DAT, AIR, DEF, Lua, and explicitly opted-in code TXT editors receive no more than four context-aware title actions, one nested IKEMaker right-click menu, searchable Actions access, and an optional companion toolbar that follows the active supported editor only while open. DEF roles choose character, stage, roster, or screenpack tools rather than showing every unrelated command. Ordinary TXT files remain untouched, existing commands retain mutation ownership, and automatic AIR companion opening is now off by default.

Version 0.79.104 begins the all-viewer cohesion rollout. Every launch-control viewer now exposes the complete guarded SFF, AIR, and SND menus together with core Stage and Screenpack menus. Move Lab moves its persistent quick actions above Attack Library and adds a dedicated state/move slider with previous and next controls, separate from AIR playback and zoom.

Version 0.79.103 moves the SFF quick-control sizing into the viewer's security-approved shared stylesheet. The earlier dynamically inserted rule was blocked by the webview content-security policy, leaving emoji-bearing SFF buttons at their natural widths. Every SFF quick action now receives the same enforced 28-by-28-pixel box as AIR and SND.

Version 0.79.102 makes the AIR, SFF, and SND quick sidebars visually cohesive. Quick actions use fixed 28-pixel square icon buttons with detailed hover explanations; AIR frame actions now join the compact animation row instead of using oversized text controls, and SND file Open/Add actions have their own compact row. SFF axis arrows automatically batch nearby movements into a safe save, while typed axis values save on Enter or when leaving the field. The redundant visible Apply Axis button is removed.

Version 0.79.101 aligns the SND workspace hierarchy with AIR and SFF. The left Organize rail now owns archive selection, Fighter Factory-style primary actions, archive navigation, group navigation, sorting, and quality filters. The center remains focused on playback and waveform editing. The Native Sound Controller bridge owns the right rail, with the Sounds list directly beneath it instead of stranded below the group list. Current group and sound rows identify their owning SND filename. A Sound file filter can show the current archive, one configured profile archive, or a catalog of all connected archives; every connected catalog row includes its source filename and opens the owning SND before editing.

Version 0.79.100 consolidates the SND workspace under one page-level scrollbar: Organize, Sounds, Preview, and sound tools remain readable columns without independently trapping scroll input. Fighter Factory-style add/delete/change/export/play/loop/pause/stop controls remain both inside the viewer and in the persistent toolbar. The waveform adds working fit, horizontal zoom, pan, amplitude, and fit-to-selection controls above its playback slider. A new sound-file switcher groups configured archives as shared game sounds, character-specific FX, language voices, custom voice packs, or legacy combined archives. Guided setup can add any of those archive types with language metadata and reviewed CommonFX prefixes; single-SND projects continue to work without adopting the split workflow.

Version 0.79.99 clarifies AIR operation scope and completes the SND viewer control pass. Whole-animation actions and selected-frame actions now form two labeled, hover-explained rows above the animation and frame sliders, so similar-looking Duplicate and Delete controls cannot be confused. The SND viewer gains previous/next controls around its archive slider, Fighter Factory-style sound actions, a persisted auto-play-while-browsing toggle beside Play, and a larger interactive waveform. SND guidance moves into the shared Help menu, while portable profile, build, reference, and CommonFX actions move into Sounds with detailed hover explanations; duplicated right-pane action buttons are retired. All shared viewer menu categories retain cross-viewer parity.

Version 0.79.98 standardizes every SFF, AIR, and SND shortcut to the compact AIR-style icon size and applies semantic color families with per-action shades. Each asset viewer receives a subtle distinct surface tint; **IKEMaker › Viewer Color Coding** disables both the tint and semantic colors. The Actions search explains that Escape closes its window and restores viewer focus. SND gains persistent add/remove/replace and play/loop/pause/stop icons, preserves its volume and playback sliders, and automatically selects the first available sound so the waveform is populated immediately.

Version 0.79.97 adds a compact, persistent two-row viewer toolbar backed by the same guarded actions as the dropdown menus. It includes Game, Infinite VS, and Training launch shortcuts, Go to Line, Comment / Uncomment Selected Lines, and direct SFF/AIR browser switches. The SFF and AIR browsers now open only when requested, bind directly to the current character asset without a file picker, and close from the same switch. Legacy duplicated header buttons are visually retired while their handlers remain available as a compatibility fallback; viewer navigation stays beside the left-side selection controls and canvas zoom remains mouse-driven.

Version 0.79.96 moves the former standalone More dialog into a peer **More** dropdown beside the other viewer menus. Connected source code, asset auto-save, workspace mode, layout, reset-layout, and toolbar customization are now explicit menu entries. Every established shared toolbar shortcut is also represented in exactly one dropdown category, and an automated coverage check prevents later toolbar additions from becoming menu-only omissions. Existing direct buttons remain available during testing.

Version 0.79.95 gives the SFF, AIR, and SND viewers matching dropdown choices across Edit, View, Palettes, Sprites, Animations, Sounds, Review, Build, Tools, and Help. A viewer-owned action selected elsewhere opens the connected owning viewer, waits for it to be ready, rechecks the destination control, and invokes only its allowlisted stable action identity. Dirty or busy handoffs, unknown actions, and routing loops stop safely. Project remains deliberately asset-specific so New, Open, and Save cannot target the wrong archive; SND does not claim a direct archive Save. Existing viewer buttons remain available.

Version 0.79.94 packages the shared IKEMaker dropdown menu bar that was completed after the earlier 0.79.93 package was built. SFF, AIR, and SND retain their existing buttons while adding contextual Project, Edit, View, Palettes, Sprites, Animations, Sounds, Review, Build, Tools, and Help menus. The menu uses an explicit command allowlist, disables unavailable contextual actions, rejects duplicate action identities, supports keyboard navigation, and adds searchable actions, favorites, recent actions, and safe repeat where applicable. Opening or searching a menu does not modify project files.

Version 0.79.21 adds **ZSS Structure & Logic** directly below the State Controller groups. It provides searchable, tab-through starting structures for conditions, selection, loops, functions, values, StateDefs, and common safety patterns. Supported structures insert at the cursor or wrap selected complete lines while preserving their relative indentation. The editor context menu adds fast wrappers for `if`, `if / else`, `for`, and target checks. The accompanying recognition-first learning criteria treats daily controller or logic review as useful progress without requiring an exercise, while retaining the complete catalog for project-led learning.

Version 0.79.22 begins the **Authoring Catalog** foundation. The State Controllers sidebar now provides compact Favorites, Recent items, and shortcuts instead of attempting to display every reusable item. Dedicated Recipe Library, Project Symbols & Contracts, Example Templates, and Authoring Favorites pages share stable catalog identities and provenance. Initial recipes are universal, modular IKEMEN starting points; SF6, Darkstalkers, Darkstalkers 4, and Hyper Dragon Ball Z are present as honestly labeled offline reference-pack foundations while their full manifests and licensing are reviewed.

Version 0.79.23 adds the current SF6 template **Standing Light Punch (sLP)** as the first real project recipe. It identifies the configured move, move-local State 200, command route, constants, wrapper function, shared light-punch implementation, State -4 lifecycle, cancel routes, and required AIR/SND assets without copying shared infrastructure into every move. Safe move-local sections can be inserted individually; shared project systems remain clearly labeled reference dependencies.

Version 0.79.34 adds **Return to Main Window** directly to the floating workspace, using VS Code's native editor-restoration command. Version 0.79.33 added the reviewed AIR-style floating workspace prototype: one movable VS Code editor surface containing four IKEMaker-owned docking zones with draggable tabs, tab grouping, split resizing, collapse/restore controls, keyboard movement alternatives, narrow-window stacking, and workspace layout persistence. Both prototype routes remain non-writing.

Version 0.79.20 fixes palette-library folder selection when IKEMaker is opened without a VS Code workspace. Palette libraries now save to the current workspace folder when one owns the asset, to workspace settings when a workspace is open, and to user settings for standalone files with no workspace. The same safe fallback is shared by adjacent SFF naming/build-profile and external image/audio editor preferences so they do not reproduce the failure. Palette Workspace's **Load Palettes / Images** picker also remembers the last successfully used source folder globally and returns there after VS Code restarts; cancelling the picker or losing that folder does not change project files or trigger an import. **Choose Palette Files…** beside **Choose Folder…** adds any number of explicitly selected ACT/indexed-PNG sources to the same reorderable Append/Insert review without replacing the configured library folder. Outside paths are accepted only when selected through the native picker during that viewer session, and selection alone never changes the SFF or staged plan.

Version 0.79.19 begins the reviewed **Palette Workspace** consolidation in the existing SFF workspace. Player Setup, Home, and IKEMaker Tools now share one primary route for character, stage, screenpack, fight/lifebar, exact-SFF, and standalone ACT/indexed-PNG contexts; older command IDs remain hidden compatibility routes. Project-library palettes support reorderable multi-selection and arbitrary-count **Append** or **Insert Before** staging. Insert shifts only the selected group, preserves gaps and links, audits authored palette references without rewriting uncertain code, detects exact RGBA duplicates without merging them, and writes one source-bound atomic plan. The workspace distinguishes embedded/saved palettes from staged work and provides **Finish Reviewed Build…**; SprMaker2 output is accepted only when palette IDs, colors, aliases, and sprite palette assignments match the reviewed contract. The active SFF is never silently replaced. New Dev approved the destructive-data safety slice, and the complete source suite passes.

Version 0.79.18 extends the generated-code escape correction to the Screenpack/Fight UI viewer. Fight UI section classification, player-slot sample recognition, and P1-to-P2 mirroring now retain their whitespace and literal-dot patterns after HTML generation. AIR numeric editing and automatic persistence remain corrected. Saving does not imply that a running IKEMEN match has reloaded the character. The complete source suite passes.

Version 0.79.13 fixes AIR animation navigation being falsely blocked by untouched frame fields. The viewer now records actual user input instead of guessing that a draft exists by comparing rendered form values with parsed AIR values. Untouched frames permit action-list and Previous/Next Animation navigation; real partial input, pending automatic frame updates, active Runtime saves, and unapplied collision edits retain their protections.

Version 0.79.12 stopped recoverable Runtime-frame drafts from trapping the AIR viewer on one animation, but did not completely resolve the installed navigation failure. It is retained in source history and superseded by 0.79.13.

Version 0.79.11 makes Player Palette Workshop placement choices explicit. **Add New Palette Slot** is the first separate choice and promises that no existing palette will be replaced. Every occupied choice is labeled **Replace Existing**, replacement previews repeatedly identify the selected palette and remain non-writing, and the final button and warning both say that they perform a replacement. Previewing, canceling, or declining the replacement warning changes neither the SFF nor the remembered ACT order; that preference is saved only after **Replace Palette** is confirmed. The complete 331-file source suite passes.

Version 0.79.10 makes visual-editor persistence explicit. AIR, HitDef, Visual Code Structure, Menu & Modes, and Story & Dialogue now show exact source-save controls and current disk status instead of leaving an applied document edit easy to mistake for a saved file. Each control saves only its named open document, preserves viewer-only drafts, reports rejected or concurrent saves honestly, and never implies that IKEMEN has reloaded the file. AIR also adds separate previous/next-animation controls while preserving frame stepping, final `-1` holds, and zero-time loops. Failed WorkspaceEdit or editor insertion results are no longer acknowledged as successful. The complete 330-file source suite passes.

Version 0.79.9 is a critical AIR viewer hotfix for 0.79.8. Destination-color assembly had rewritten toolbar anchors before AIR-only controls were inserted, leaving required controls absent and stopping the viewer client before its animation model could render. AIR animations now display again, Open SFF retains its click binding and approved green SFF destination color, and regression checks require the AIR-only controls, shared toolbar, connected-viewer route, and Open SFF binding to survive final page generation. The complete 325-file source suite passes. The resizable-viewer-height and universal whole-editor vertical-scrolling requirements are recorded for later implementation; they are not claimed by this hotfix.

Version 0.79.8 adds exact assigned Helper, Explod, and native Projectile creation sites to the shared Move Lab component browser. Each entry is bound to the character DEF, source file/hash, exact controller range/hash, kind, index, and enclosing StateDef/function. Nested ZSS execution paths and literal Root/Parent/P2 receiver names are displayed as context rather than inferred ownership. Selecting a creation site is read-only and never creates, converts, or rewrites code; Helper and Explod routes open their established specialist tools separately, while native Projectile remains exact-source navigation until a dedicated guarded editor exists. Every exact component also has a compact read-only catalog of its current assigned AIR actions with frame/tick totals, explicit LoopStart, and effective Clsn1/Clsn2 coverage. The user chooses one real action, that choice is remembered for the exact component revision, and opening it revalidates both the component and current AIR before handing off to the established AIR/Clsn workspace; IKEMaker never substitutes a StateDef/controller number as an animation guess or creates a second AIR write path. Direct HitDefs now summarize authored classic damage, pause, stun, slide, velocity, acceleration, and spark fields plus every other authored/custom option, while all mutation remains delegated to the existing guarded HitDef editor. The approved destination colors now have one shared accessible registry and are applied to universal AIR, SFF, SND, code, Maps, and recognized specialist routes; set `IKEMaker: Destination Colors` to `off` for neutral navigation controls without changing labels, focus behavior, routing, or files. Remaining screen-specific adoption stays explicit rather than silently claiming complete recoloring. Stage and Screenpack workspaces can navigate a selected background/UI element to its exact SFF sprite or embedded Begin Action; destination editors retain all mutation ownership and changed source is refreshed instead of retargeted. CNS/ZSS, shared files, unsaved editor text, and unsaved AIR text use the same guarded discovery path. The full source suite passes; no package, installation, live-game edit, or engine-runtime claim is made.

The Command & Movelist input timeline uses top-level syntax boundaries rather
than blindly splitting every comma, `+`, or `|`. Quoted and nested custom-parser
expressions therefore remain one literal editable step, while ordinary native
MUGEN/IKEMEN sequences retain their existing behavior. The displayed timeline,
draft-overlap review, diagnostics, and narrow step edits share that rule; no
custom expression is normalized or rewritten merely because it is inspected.

Version 0.79.7 hardens **Command & Movelist** as a convention-preserving authoring surface. Timeline insertion, replacement, removal and reordering now patch only the selected step rather than normalizing every comma, tab and space. Reviewed Apply changes only fields the author actually changed, preserving comments, unknown/custom parser options, omitted defaults, neighboring definitions and mixed line endings. CMD, INP and JNP title entry follows the current dirty document and caret; a reused visual editor selects the exact matching occurrence only when doing so will not discard an unapplied visual draft. Shared command files list every owning character—including owners without a displayed movelist—instead of silently preferring the configured character. **Commands & Movelist** is also visible from Simple/Workspace Home, while Player remains code-free. Glyph warnings remain advisory and never rewrite or block authored movelist text. The full 325-file source suite passes; no installed-package or engine-interaction claim is made.

Version 0.79.6 expands the shared Move Lab beyond attacks. Its Moves / Overview drawer now discovers the exact assigned CNS/ZSS StateDefs and ZSS Functions, including ordinary movement, guard, get-hit, custom, and shared behaviors that have no HitDef or JNP constants profile. Each selection is bound to the character DEF, exact source file and full-file hash, block kind/signature/range and range hash; equal state numbers and duplicate names are never treated as ownership. State/function editing uses retained source-bound drafts with explicit Apply, discard and conflict/rebase handling, changes only the open document for normal Undo/Save, warns on shared sources, and offers the contextual Maps browser. No AIR action is guessed from a state number. The full 325-file automated suite passes; installed visual interaction remains a separate manual check. Specialized Helper, Explod, projectile, embedded AIR/Clsn and field-level HitDef component views remain next-week work and are not claimed by this release.

Version 0.79.5 corrects a silent parity failure in the structured Explod Composer's IKEMEN CNS output. CNS now retains the selected facing, palette ownership/remap, transparency, hit-pause and remove-on-hit options, and emits timeline Create events alongside Modify, Bind and Remove in stable authored order. Create events inherit the reviewed parent options while using their own position, velocity and acceleration. Unsupported per-event scale/angle values are disclosed, palette remaps without Own Palette warn without changing the user's choice, and unsafe transparency text blocks insertion. This is source-tested generator parity; installed engine rendering and hit-pause behavior remain pending runtime verification.

Version 0.79.4 gives the AIR text command and visual AIR collision tools one reviewed **Batch Apply Clsn2** workflow. Text selection and the visual frame's host-validated effective boxes now feed the same action-role classification, target proposal, untitled diff and final guarded Apply. Append includes inherited defaults; **Make effectively empty** is distinct from **Remove per-element override**, which may reveal a default. Standard suggestions treat Action 10 as crouching and Action 12 as standing from displayed element 1, and keep Action 40 grounded-start out of airborne name matching. Custom roles, exclusions and explicit owner-scoped remembered assignments remain editable. The exact dirty AIR document is rechecked immediately before one Undo edit; visual use no longer reveals line 1 or borrows the active text editor. Nearby/ancestor on-disk DEF discovery is bounded rather than a complete project dependency index, and unsaved DEF ownership changes are not discovered by this slice. Source review and automated tests are complete; installed UI/engine/Undo testing remains pending, and no package or release is claimed.

Version 0.79.3 makes exact direct CNS/ZSS HitDefs first-class components in the same Move Lab workspace. A character no longer needs the optional constants profile, AIR, or SFF to inspect a real HitDef. Selection is bound to the character DEF, source file and hash, exact controller range and hash, controller index, and contextual owning StateDef/function; duplicate states and multiple HitDefs remain distinct, and changed or deleted targets stop instead of silently retargeting. Direct inspection is read-only, while **Edit HitDef** delegates to the established guarded HitDef editor and **Open source** navigates to the exact block. Mixed characters can switch between constants profiles and direct HitDefs without losing move/shared/code drafts or the selected preview frame. Ordinary Move Lab entry now converges on this shared component workspace when attacks are discovered; legacy explicit/history routes remain compatible. Installed visual QA is still pending, and no package or release is claimed.

Version 0.79.2 begins the signed Move Lab consolidation inside the rich Constants workspace. Its optional in-place Moves / Overview drawer lists every discovered constants profile and every real HitDef controller without replacing the active canvas, drafts, or editor. Supported profiles stay in the same panel; direct-code entries are explicitly labeled and open the exact existing HitDef editor after file, controller index, line, and source-hash revalidation. Problems can now be filtered between the selected move and all assigned character files, with deduped source navigation. Drawer state, filters, open field groups, focus, camera, frame, shared-value drafts, and connected-code drafts survive refreshes. The drawer is navigation-only: established editors retain all Apply and Undo ownership.

Version 0.79.1 corrects the source-proven P2 zoom drift in the general Move Lab preview. P1 and P2 now retain stable world positions through zoom, pan, resize, reset, and per-character view restoration; pointer-centered zoom uses the same camera transform as the Constants integration. Camera changes also cancel an active Constants spark, opponent, or pan drag before its old scale can be reused. This does not clamp, recenter, or rewrite authored coordinates. The previously reported installed ordinary Constants zoom case still requires exact-build interaction verification before it is declared closed.

Version 0.79.0 begins the bounded one-Move-Lab consolidation. The primary workspace is now labeled **Move Lab**, while the richer constants-based editor is identified as its **Constants integration** rather than a competing product. Choosing an optional constants profile carries its exact character, profile, source filename, and source hash into the reused editor panel; stale or ambiguous handoffs stop instead of selecting another move. **Overview / Related Tools** provides a return-aware route without discarding drafts or forcing constants, HitDef, projectile, helper, map, or custom-code authors into one coding style. The P2 zoom-drift report remains open and is not claimed fixed by this routing change.

Version 0.78.9 adds visible **Move Earlier** and **Move Later** controls for a single AIR timeline element. Reordering carries the exact raw frame block—including explicit collision blocks, LoopStart, interpolation, inline comments, CSV tails, whitespace, and mixed line endings—through one reviewed narrow Undo edit, while standalone comment/blank trivia stays anchored between element positions. Persistent collision-default boundaries, unknown directives, saved element-indexed push/runtime plans, multiple marked frames, and unfinished form or visual drafts block the move rather than silently changing ownership.

Version 0.78.8 adds visible **New Action**, **Duplicate Action**, and counted **Delete Selected** controls to the AIR action list. New actions use reviewed starter-frame values even when the sprite will be assembled later. Duplication preserves the raw action body—including comments, directives, unknown lines, whitespace, and mixed line endings—and changes only the copied header number. All three paths respect unfinished visual drafts, recheck the exact open AIR after confirmation, use one narrow undoable edit, preserve neighboring standalone section comments, and never renumber references or clone runtime-plan metadata.

New Action now opens one reviewed form instead of a chain of prompts. It suggests
a free action number, prefills the current frame's sprite, offsets, timing and
flags when available, checks conflicts immediately, and can add an optional
one-line source comment and explicit `LoopStart`. The final confirmation states
that the AIR edit does not create or modify an SFF sprite; the same canonical
source-baseline, Undo and Auto Save contracts still apply.

Version 0.78.7 adds a nested **Source / Visual Editor** for displayed movelists. It resolves the active game motif and real glyph SFF, renders loaded compound motion/button artwork, and lets authors append, insert, replace, remove, or reorder glyphs without rewriting surrounding names, notes, color tags, separators, unknown syntax, or untouched line endings. Both views share one recoverable draft and retain explicit Apply/source-conflict protection. Missing or unmapped glyph references receive navigable, non-blocking warnings because reported engine behavior may stop loading later movelist content; project/preview failures are labeled separately. Ambiguous contexts remain unresolved until the author chooses a game folder.

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
authored-function lookup/order/signature problems, and critical literal command
equality or inequality references in ZSS or classic CNS that are missing from a completely resolved
character CMD/INP/JNP catalog.
These appear as error-level diagnostics beginning with **CRITICAL**, because an
unresolved command reference can prevent IKEMEN from loading or running the
character correctly.
Missing-command checks use unsaved assigned-command text when available and
remain silent when character ownership or any assigned command file is
unresolved; IKEMaker never invents or automatically renames a command.
While typing inside a literal `command = "..."` or `command != "..."` reference, ZSS and classic CNS
offer the exact names from that same completely resolved command catalog. The
list follows the authored fragment and inserts a name only when the author
chooses it; comments, unrelated strings, unresolved ownership, and dynamic
command expressions receive no guessed suggestions.
Go to Definition on an exact literal command reference opens its assigned native
definition. Intentional same-name press/release or other variants are all
returned rather than silently choosing one; incomplete catalogs return no
guessed destination. Hovering the reference summarizes every exact definition's
native sequence, whole-command time, step window, file, and line without
selecting a preferred variant.
Opening Command & Movelist while the caret is inside a valid ZSS or classic CNS
command reference selects the first exact same-case native definition and keeps
its full same-name family navigation available. Reusing an editor retains its
unapplied visual draft; it refuses to switch definitions if that would discard
the current form.
The missing-command lightbulb also offers **Open the character Command &
Movelist editor**. It carries the invoking ZSS/CNS document into the existing
owner-resolution route; it does not insert a placeholder or change either file.

Authored ZSS function assistance uses the owning character's assigned ZSS files,
including unsaved assigned documents. Typing after `call` offers authored names
and named parameter placeholders; native Signature Help tracks the active
top-level argument across balanced multiline calls, and hover shows every
matching declaration and source. Function headers follow the engine's actual
untyped grammar: arguments and named returns are variables, not declared types,
and current IKEMEN does not support default parameter values. IKEMaker diagnoses
type/default-looking header syntax instead of interpreting it as a contract.
Call-site value kinds are shown only as content-free inferred evidence, with
string evidence gated by the selected exact runtime-string capability.
Definition, References, and rename use that same owner catalog. A dirty owner
DEF, missing dependency, unreadable assigned file, or unassigned current ZSS
makes the catalog incomplete and disables these claims instead of mixing
same-named functions from unrelated characters. Explicitly classified custom-
extension ZSS files follow the same owner checks. Function-call audits report a
missing name only when it matches a configured project-owned prefix, and report
an argument-count mismatch only from a complete, uniquely resolved catalog;
duplicate declarations are exposed as ambiguity and are never silently chosen.
Same-source duplicates are errors; cross-file duplicates explain that IKEMEN
uses the first compiled declaration while refusing to guess that compile order.
StateDef, map, and variable Definition/References now use the same complete
owner-assigned catalog rather than a workspace-wide name match. Map rename also
stays inside that catalog and stops when ownership is incomplete, preventing a
same-named symbol in an unrelated character from being edited.

Literal asset fields in ZSS also use the owning character's assigned AIR, SFF,
and SND. Native completion offers verified AIR actions, character-owned sound
group/index pairs, and direct sprite pairs only in recognized fields. Literal
AIR and SND completion also follows uniquely resolved runtime CommonFX loaded by
the active game, fight screen, or character DEF. Unprefixed HitDef sparks and
sounds use the resolved F archive, explicit F preserves that alias, and a typed
custom prefix offers only its exact archive. Viewer-only shared definitions and
sound-profile records never become runtime code claims. Problems reports a
missing literal only when its exact character or shared catalog is complete.
Unsaved AIR text is authoritative; dirty assignment files or binary archives,
missing control files, duplicate prefixes, negative sentinels, dynamic,
commented, and string-looking references fail closed. No asset or code is
rewritten, and CommonFX direct sprite-pair inference remains unsupported.
Literal sound lifecycle diagnostics additionally identify proven endless
`PlaySnd` loops on an omitted/`-1` automatic channel, global `StopSnd` channel
`-1`, and `ModifySnd position` with an omitted/`-1` channel (documented as
undefined). Dynamic expressions and possible same-channel interruption remain
silent because their runtime intent cannot be proven statically.

Adding a documented option from Visual Code Structure remains owned by that
existing workspace, but now uses a byte-local insertion plan. It preserves all
existing comments, duplicate/custom fields, spacing, and mixed line endings,
shows the exact inserted bytes in a native preview, and revalidates the source
URI, version, and complete text after both the value prompt and preview before
one edit. Unknown/custom options remain untouched and are never synthesized.

Secondary ZSS editor actions are grouped under one **IKEMaker ZSS** right-click
submenu. Function and symbol collections reuse the searchable Project Symbols &
Contracts browser, while ordinary completion, Signature Help, hover, Definition,
Peek, References, and Problems remain native editor features. No function
controls are duplicated into AIR, SFF, SND, Palette, or other viewers.
Function cards in that browser also list literal **Called by** and **Calls from
this function** relationships with exact source links. These are read-only
observations; dynamic or unparsed calls are left unknown rather than guessed.
The browser's **Suggest literal resource ID…** action checks Helper, Explod, or
Projectile namespaces independently and reports the first unobserved whole
number at or above a user-chosen starting point. It never inserts code and marks
the result as only a candidate when ownership, source reads, or dynamic IDs keep
the scan from proving the literal inventory complete.
Rename-impact previews capture each indexed file revision. If any source changes
after indexing—even away from the displayed occurrence—the report marks its rows
**refresh required** instead of presenting the old locations as exact. Partial
ownership or read failures are disclosed, and the report remains non-writing.
**Contextual Recommendations…** is a manual-only action in the same IKEMaker ZSS
submenu. It recognizes a small set of literal code contexts, searches the
existing Authoring Catalog, and explains why each proposed structure or recipe
section was offered. Comments, strings, and uncertain contexts produce nothing;
project/reference material is promoted only through an explicit Favorite or
Recent choice. Insertion still uses the existing catalog owner and revalidates
the exact document version and selection after the picker closes. No automatic
popup, background rewrite, or viewer control is added.

Personal Example Shelf entries can now become guarded working examples without
making the unverified bundled reference packs executable. On a current or
uniquely relocated exact block, the user explicitly marks non-overlapping byte
ranges, assigns each a function/state/map/AIR/SND/SFF role, and chooses values
from the complete exact-owner catalogs. **Adapt & Insert** preserves every other
byte and custom syntax literally, previews the result, and revalidates the
example source, assignments, destination URI/version/text, grammar, and cursor
before one unsaved Undoable insertion. It never infers placeholders, imports
dependencies, or executes SF6/DS/DS4/HDBZ reference packs.

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

Playback inspection is non-destructive. Click the waveform or use the precise
seek slider; Space/K toggles playback, J/L moves one second, Left/Right moves
50 ms, and Home/End moves to the boundaries. A/B audition points show the exact
range duration and can loop without changing the WAV. Quality filters find and
mark clipping/near-clipping, leading/trailing silence, DC offset, PCM format
outliers, duplicate identities, and unusual durations. The selected sound shows
its bounded PCM analysis and peak; large entries use a bounded representative
scan so archive opening stays responsive. Visible results can be marked,
inverted, or copied as ordered `group,index` identities for code and review
notes. These checks never normalize, trim, fade,
resample, replace, or rebuild audio automatically. **Export A–B WAV** can write
the reviewed PCM range to a new user-chosen file; it never changes the source
WAV, loaded SND, or reviewed manifest.

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

- literal `command = "name"` checks whose exact name is absent from the resolved
  character command catalog (reported as an error because this can prevent the
  character from loading or running correctly)
- `enemy`, `partner`, `target`, `helper`, and `parent` redirects without a
  nearby existence guard
- opponent reads without `numEnemy`
- literal `player(1)` through `player(8)` slots that can break in team modes
- partner logic without visible `teamMode` and `numPartner` checks
- cross-entity position, velocity, facing, and state writes
- `targetState` without `numTarget` or a documented custom-state contract
- loops with no obvious condition update or `break`, and redirected loops
- `RunFirst` and `RunLast` ordering overrides
- missing functions inside a configured project-owned namespace, argument
  mismatches for resolved declarations, forward calls, and duplicate declarations;
  unknown engine/global/custom calls outside those namespaces remain silent
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

Select one complete `Clsn2` or `Clsn2Default` block in an `.air` text editor
and choose **AIR: Batch Apply Selected Clsn2…**, or select a frame in the
visual AIR editor and choose **Batch Apply Clsn2…**. Both routes use the same
review and exact mutation service. The text route uses the selected block; the
visual route resolves the selected frame's current effective Clsn2 from the
host, including inherited defaults. The editor supports:

- Action ranges: `0-19, 40-49, 100, 105`
- Range exclusions: `0-999 !200-299`
- One-based animation-element ranges: `all`, `1`, `1-3`, `1-10 !4`
- Reviewed standing, crouching, airborne, grounded-start, custom and unknown roles
- Editable standard suggestions for Actions 10, 12 and 40; names never override explicit assignments
- Replace, append-to-effective, make-effectively-empty, remove-override,
  action-wide clear, and `Clsn2Default` operations with their different
  inheritance effects stated before Apply
- Normalized finite coordinates and structural preservation of `Clsn1`,
  comments, `LoopStart`, frame timing, offsets, flags and untouched actions
- Exact target/skip review, custom assignment and exclusion controls
- Optional remembered assignments scoped to an explicitly resolved owner DEF
  or disclosed AIR-only scope; shared nearby owners require an explicit choice
- Untitled diff preview before a separate final Apply
- A single workspace edit, allowing one-step Undo

The service captures the current dirty AIR text before any prompts and rejects
the operation if its URI, version or contents change before Apply. Cancel and
no-op reviews write neither the AIR nor preferences. Owner discovery in this
slice checks nearby and ancestor on-disk DEF files; it is not an exhaustive
project-wide dependency index and does not observe unsaved DEF ownership edits.

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

- `OverrideClsn`: target group (`Clsn1`, `Clsn2`, `Size`, or Nightly-only
  `Dummy` when the project opts into Nightly), target index,
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

Projects explicitly assigned to a pinned Nightly target also receive `Dummy`
in the existing `OverrideClsn`, `ClsnVar`, `ClsnOverlap`, and
`ProjClsnOverlap` group pickers. `Dummy` is logic-only geometry with no inherent
attack or hurt behavior, making it the preferred authoring choice for custom
grab regions, proximity sensors, parry/armor zones, helper interactions, and
other mechanic-only regions. Stable 1.0 remains the default: those options are
hidden and generation rejects `Dummy` unless the project target is Nightly.
Nightly capability expansion must continue through this same target-aware rule;
it must never silently change the code emitted for a stable project.

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
The timeline header continuously reports the selected step, total step count,
its parsed input basis, and whether the internal step clipboard is ready.
Timing references have an explicit **Use Step Time** action that changes only
the current draft's `steptime` and participates in timeline Undo; they never
replace the sequence or write source by themselves.

The timeline also accepts a literal custom native step such as `~30$B+x` and
inserts it before or after only where requested. Timeline Undo/Redo is draft-local,
and the selected step supports keyboard duplication, removal and reordering. It
also has an internal exact-step clipboard, explicit selected-step conversion
between facing-relative B/F and absolute L/R notation, and reusable relative or
absolute quarter-circle, double-quarter-circle, dragon-punch, half-circle,
charge, full-circle, and dash motion paths. Facing-independent down/up charge is
listed separately rather than implying a direction policy.
The exact-step clipboard supports Copy, Cut, Paste Before/After, and Replace
with Copied Step. Cut and replacement are each one timeline Undo action and
retain the selected top-level step literally, including custom-parser syntax;
they do not use the operating-system clipboard or touch source before Apply.
Each conversion,
complete path insertion, or explicit selected-step motion replacement is one
reversible draft action; custom
parser expressions are never converted. **Combine +** and **Alternative |** add
the currently chosen native input to the selected step without making the author
type relation syntax, while refusing to create mixed `+`/`|` steps. Explicit
**Replace with Choice** changes only the selected step to the chosen native
input; **Motion Replace** expands the chosen recipe in that exact position.
Explicit **Whole Command → Relative** and **Whole Command → Absolute** actions
apply the same parser-aware conversion across every recognized native step as
one Undo action. They preserve modifiers, relations, separators, vertical and
neutral directions, and custom parser expressions instead of normalizing the
sequence.
The larger motion library is searchable and keeps persistent Favorites plus a
bounded Recent group. Those views clear independently and never select an input
policy or modify the command draft.
An author can also save the exact current sequence as a named, workspace-local
custom motion recipe. Custom recipes participate in the same search,
Favorites, Recents, insert-before/after, and selected-step replacement paths;
their internal custom parser syntax is retained. Updating or deleting a custom
recipe never edits a command draft or source file, and retained recipe count,
name, sequence length, and step count are bounded.
The native input picker has matching search, Favorites, Favorites-only, and
successful-use Recents across absolute, relative, hold/neutral, and button
groups. Merely browsing an input never changes recency or authored syntax.
The selected-step modifier editor can explicitly apply or remove native hold
(`/`), release (`~` with an optional frame count), exact/consecutive (`>`), and
legacy direction (`$`) markers. Its scope can be the selected step or the whole
command; either choice edits every recognized atom in scope, preserves unrelated
modifiers and operator spacing, leaves custom parser syntax untouched, and
remains one timeline Undo action. Input, motion, custom-syntax,
history, clipboard, modifier, and arrangement tools are visually separated so
the expanded workflow remains scannable instead of becoming one flat toolbar.
Explicit
**Mirror Step** and **Mirror Command** actions swap recognized left/right and
back/forward directions as one reversible draft action while leaving custom
parser steps untouched. An independent whole-sequence clipboard can restore the
exact authored command—including custom parser text and spacing—as one Undo
action without using the operating-system clipboard. Insertion,
replacement, duplication, movement, removal, new definitions, and saved preset
application preserve the surrounding separator and LF/CRLF/classic-CR
conventions instead of normalizing the file. **Duplicate Draft as New** carries
the complete current definition into a separate pending entry (including
intentional same-name alternates), while **Revert Command Draft** reloads source
values without touching the source file.
Only one unapplied new-definition draft is retained at a time. While it exists,
the normal add route becomes **Resume Pending Command** and other counterpart/
duplicate generators are disabled, preventing a second generated draft from
silently replacing the first. Apply or Revert restores the normal add route.
Duplicated, release, and mirrored pending definitions retain an immutable origin
snapshot in the recovered workspace draft. Their review panel shows each exact
origin-versus-draft field change while continuing to identify the operation as a
new definition that cannot overwrite its source command.
**Restore Duplicate Origin** returns every field in that pending definition to
the retained snapshot without discarding the pending entry or reopening,
rewriting, or changing the source command.
**Duplicate as Release Draft** goes one step further: it creates a reviewed,
pending same-name counterpart and adds plain release syntax only to unreleased
native button atoms in the final step. Directions, relations, custom parser
syntax, and the original definition remain untouched; the new definition still
requires explicit Apply.
**Duplicate as Mirrored Draft** creates another reviewed same-name counterpart
with only recognized native left/right and back/forward directions swapped.
Modifiers, relations, separators, timing fields, and custom parser expressions
are retained exactly; the original definition remains untouched and the mirrored
counterpart still requires explicit Apply.
The adjacent direction-basis choice can instead **Duplicate in Chosen Basis** as
a facing-relative B/F or absolute L/R pending counterpart. It uses the same
parser-aware conversion and origin comparison, disables no-op choices, and never
changes the source definition.

The command browser is organized for real authoring work: multi-step motions and
sequences are listed first, while one-step buttons, directions, holds, and button
combinations are grouped under a collapsed **Basic / raw inputs** section. Search,
family filters, diagnostics-only and same-name-family views, a shown/total count,
an exact-identity **Favorites** view/group, a bounded and clearable **Recently
opened** view/group, and persistent per-command hiding affect only the editor
view and never delete or rewrite native command definitions. Search covers
names, native sequences, and diagnostic explanations; `/` focuses it and Escape
clears it without changing a definition.
The current editor also shows its exact same-name definition family and provides
Previous/Next navigation among those source definitions. This makes intentional
press/release and other paired definitions directly reviewable without changing
the command-browser filter or conflating differently cased command names.

The movelist side edits the assigned native DAT text, previews IKEMEN glyph tokens,
lists `movelist`, `movelist1`, and later DEF assignments, and can copy a native
`ChangeMovelist` example. Every listed slot identifies the file currently being
edited, can switch that slot into the same visual editor, and can open its exact
assigned source; opening a secondary DAT resolves
its owner from every movelist slot rather than guessing from the base slot. The
exact secondary slot also survives editor restoration and back/forward history;
switching files never discards an unapplied displayed-movelist draft.
Writes require a reviewed confirmation and are applied
through VS Code documents so normal editor undo/history remains available.
Its nested visual editor supports exact selected-line text, loaded glyph
insertion/replacement/reordering, line insertion/duplication/reordering, and
draft-local Undo/Redo. An internal exact-line clipboard can move custom-tagged
or intentionally empty lines between positions without requiring operating-system
clipboard permission, using the destination's local line-ending convention.
The glyph picker can be filtered by token, friendly name, or sprite identity and
reports its shown/total count without filtering the movelist itself. Successfully
used configured glyphs move into a bounded recent group for quick reuse, while
deliberately pinned glyph favorites have their own group and Favorites-only
view. Recents and favorites clear independently and never alter the DAT.
The visual editor also announces the exact selected line, glyph position, and
configured token as navigation changes, without modifying the draft.
An exact glyph clipboard can copy a configured token and paste it before or
after a glyph on another line, with one reversible visual-draft edit.
Selected glyphs and exact movelist lines can also be cut into their respective
internal clipboards as one reversible draft edit. A copied glyph can replace
the selected configured glyph directly, preserving every surrounding tag,
separator, comment, and line ending.
Step, line, and glyph clipboards have explicit clear controls that never change
the current draft.
Focused glyphs and lines also support keyboard removal,
duplication and reordering. Plain arrows plus Home/End navigate glyph or line
selection without editing, while Page Up/Down makes bounded five-step timeline
or ten-line movelist jumps and Alt+arrows remain deliberate reorder actions.
Selected command steps and movelist lines can also move directly to the start or
end—with visible controls or Alt+Home/End—as one reversible draft action.
Selected glyphs have the same direct start/end movement; only glyph contents
rotate, so authored text, tags, and separators stay at their exact positions.
All paths retain unsupported tags, unknown tokens, mixed
line endings, and adjacent compound glyphs byte-for-byte until explicit Apply. A
draft-local finder navigates ordinary text or glyph tokens in Source and Visual
modes without filtering, normalizing, or changing the DAT. Next/Previous
controls wrap through results; Enter and Shift+Enter navigate forward/backward,
and an optional Match case setting controls literal matching. Replace Current,
Replace Selected Line, and Replace All operate only on the retained draft and
preserve mixed LF/CRLF/classic-CR boundaries plus custom markup outside the
exact matched spans. The selected-line route is available only when that exact
visual line contains a match, and each replacement operation is one visual Undo
action. **Preview Replace
All** reports the exact match count and affected one-based line numbers without
changing the draft, while replacement controls remain unavailable when the live
draft has no match. Nothing reaches the DAT until the existing reviewed Apply,
and Escape clears the query without touching the draft.
The Visual Editor also has **Preview Matching Glyphs** and **Replace All Matching
Glyphs** for parser-aware token migration. Those actions operate only on exact
configured glyph spans, protect quoted text, markup attributes, comments, and
ordinary word fragments, preserve mixed line endings, and make the complete
batch one visual Undo action. An explicit scope limits that operation to the
selected line or applies it across the entire displayed movelist.
**Previous Same Glyph** and **Next Same Glyph** wrap through those exact parsed
occurrences—including compound chains and later lines—without editing the draft
or requiring the author to copy a token into the general finder.
Advisory glyph warnings also have wrapping Previous/Next navigation; visiting a
warning never truncates, normalizes, or edits the displayed-movelist draft.

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

### Palette Workshop certification status

Palette-image registration is now a guided metadata workflow. Standard Batch Tools links directly to the compact Advanced Sync Images card, where indexed PNGs can be registered, relinked, enabled, disabled, or removed through an exact review. Ambiguous palette matches require an explicit choice, filename numbering is never treated as authority, and Save registrations does not rewrite the SFF or image files. A failed post-save verification remains visibly marked as committed or uncertain until the exact target is reloaded.

The live palette editor now includes **Find useful animation**. It scans the exact character-assigned AIR and SFF under bounded, read-only authority, then presents up to eight visual Action suggestions based on visible use of the current palette index or reviewed named group. Each result explains matching pixels, distinct sprites, and authored frames; linked palettes, truecolor sprites, missing or ambiguous references, and unknown runtime `RemapPal` behavior remain explicit. A chosen result becomes the synchronized A/B preview without changing the retained palette draft or its original return route. When no unique AIR assignment can be proven, the same control offers a clearly labelled static-sprite fallback instead of guessing an owner.

Palette Workshop source implementation now covers the ten reviewed slices: canonical workspace and source intake; collective exact-color inventory; named domains and RemapPal groups; copy-on-write index migration; manual color separation/reduction; palette library and gallery synchronization; temporary palette lifecycle metadata; exact cross-view SFF/AIR handoffs; and the append-only certification ledger. The SFF viewer/browser and AIR return routes carry exact file hashes plus physical sprite/palette coordinates. A changed, missing, or ambiguous target opens its origin without restoring a guessed selection. Immutable SFF build proposals remain separate from adoption and never authorize a direct SFF write.

This is **source-certified, physical-pending**, not release-ready. Automated tests cannot mark `physical-passed`. Physical signoff still requires a human-recorded IKEMaker version, engine version, environment, scenario, and evidence hash for the SFF 2.0/2.1 palette matrix, AIR/SFF return paths, temporary-placeholder removal/build adoption, gallery round trips, and recovery after interruption. Certification metadata is append-only under `.ikemen-tools/palette-workspace/certification`; it does not alter active character assets.
