# IKEMaker Visual Authoring QoL Goal

Status: completed for the release-safe, format-supported scope  
Started: 2026-10-27  
Usage reserve: stop before account remaining usage reaches 35%.

## Outcome

Bring the proven Coding, SFF, and AIR interaction patterns into Stage, Screenpack/UI, and Storyboard authoring without hiding or replacing their authoritative DEF/source files.

## Shared rules

- Browsers expose the active editor state; they never own a second unsynchronized draft.
- Preview, retained draft, reviewed apply, and committed source remain visibly distinct.
- Every mutation uses the owning workspace's authority, backup, dirty-document, recovery, and undo path.
- Webviews send bounded intents and stable identities, never arbitrary source replacements.
- Equivalent controls use the same labels, ordering, selection modifiers, shortcuts, and narrow-layout behavior.

## Ordered implementation slices

1. Shared browser and context foundation
   - Search, category/layer filters, comments/names, list/cards, stable selection, source and connected-asset routes.
   - Float/dock follows the existing authoring-browser lifecycle and never changes placement merely to navigate.
   - One contextual action contract for duplicate, cut/copy/paste, layer controls, exact source, connected assets, components, and shortcut help.
2. Direct canvas manipulation
   - Ctrl/Command toggle, Shift ranges, locked items, snapped group movement, alignment, distribution, keyboard nudging, and appropriate edge/corner handles.
   - Apply several reviewed coordinates in one undoable transaction.
3. Layer and drag/drop parity
   - Visibility, locks, ordering, multi-selection, insertion/replacement rules, and undoable drag/drop.
4. Reuse and batch work
   - Favorites and recipes for BG/controller arrangements, UI groups, scene timing/fades, camera layouts, and common layer combinations.
   - Extend reviewed inheritance/batch operations where the format can prove exact targets.
5. Comparison and preview
   - Animated thumbnails with bounded playback.
   - Stage camera A/B, Screenpack profile/aspect comparison, and Storyboard adjacent-scene onion skin where each preview is truthful.
6. Universal history and release checks
   - Universal undo/redo affordances on every header, with all new mutation routes represented.
   - Focused model, receiver, authority, lifecycle, narrow-layout, and accessibility tests; no huge SFF suite in this goal.

## Completed implementation

- The shared bounded Authoring Browser is integrated into Stage, Screenpack/UI, and Storyboard with search, kind filters, list/card or thumbnail views, keyboard-accessible contextual actions, opaque host bindings, exact source/asset navigation, and stale-source rejection.
- Stage supports direct canvas and browser multi-selection, grouped dragging, keyboard nudging, snapping, alignment, distribution, multi-discard, and one reviewed multi-position transaction.
- Screenpack/UI supports browser and direct-canvas Ctrl/Command/Shift multi-selection, grouped drag, keyboard nudging, shared outlines, retained preview recovery, and one reviewed exact multi-position transaction.
- Storyboard supports browser and direct-canvas layer multi-selection, grouped drag, keyboard nudging, optional snapping, and one reviewed exact `layerN.offset` transaction. Its browser uses truthful metadata cards because Storyboard does not yet expose decoded image pixels.
- A shared visual-canvas selection model covers stable multi-selection, snapping, locked-item movement, alignment, and distribution.
- Stage, Screenpack/UI, and Storyboard now expose the same visible committed Undo/Redo controls. Their bounded in-session histories survive same-source refreshes, reject stale or externally changed source, clear Redo after a new committed edit, and replay through the workspace's existing mutation authority without recursively recording the replay.
- The shared visual-browser companion is in production across Stage, Screenpack/UI, and Storyboard: one host-owned model and selection, readiness-gated first float, focus-only reopening, truthful Float/Return/Close controls, minimum-width handling, and lifecycle-only persistence. Scope, selection, contextual actions, refresh, retarget, suspension, and disposal all synchronize through the owning workspace; the browser never owns a second draft.
- A bounded comparison-preview model now defines Screenpack A/B capture compatibility and Storyboard adjacent-scene onion plans. Screenpack captures intentionally compare profile/aspect/guide changes only within the same exact screen and source; Storyboard adjacency follows displayed scene order, not numeric scene arithmetic.
- Screenpack/UI now exposes clean, session-only A/B captures with profile, aspect, guides, visible layers, and preview-draft state stated in each caption. Storyboard now exposes bounded Previous/Next/Both structural onion layers that are noninteractive and never join current-scene selection or source mutations.
- Stage contextual browsers now provide bounded in-session Copy, Cut, Paste Before/After, and Duplicate for complete BG sections. Comments and line endings are preserved, pasted names are collision-safe, Cut updates the clipboard only after a successful write, and each mutation is one reviewed Undo step.
- Storyboard now provides complete-scene Copy, Cut, Paste, and Duplicate from buttons, scene context menus, and Ctrl/Command shortcuts. Exact raw sections preserve comments, spacing, and property order; new scenes receive a collision-safe number; Cut/Paste/Duplicate each use one reviewed mutation.
- Screenpack/UI provides explicit capability-gated “Set layer number” for exact single or multi-selection. It changes only existing authored `.layerno` properties in one reviewed mutation and never presents source-group order, preview visibility, or opacity as equivalent authored operations.
- Stage now has truthful preview-only per-BG visibility and source-hash-bound editor movement locks. `H`/`L`, row controls, and right-click actions operate on the active selection; locked BGs cannot drag, nudge, batch-move, or join stack reordering. These preferences never write Stage source.
- Stage supports embedded, internal-only drag/drop reordering of one or more unlocked BG rows before or after a target. It moves complete raw BG sections and attached comments in stable selected order, preserves `layerno`, re-resolves opaque identities after modal review, rejects stale source, writes once, and restores through universal Undo.
- Screenpack/UI now has preview-only per-element visibility and source-hash-bound editor movement locks with row controls, `H`/`L`, and right-click actions. Locks cover X/Y fields, grouped canvas movement, keyboard nudging, reviewed position apply, and native layer-number apply without becoming source data.
- Storyboard now has preview-only per-layer visibility and source-hash-bound position locks with row controls, `H`/`L`, right-click actions, Show All, and Unlock All. Hidden layers remain recoverable in the browser; locked layers cannot drag, nudge, or enter reviewed position mutations. Floating-browser controls route to the same owning editor state.
- Reuse wording is now cohesive across all three workspaces. Stage reusable BGs, Screenpack reusable prefixed element groups, and Storyboard reusable complete scenes are explicitly identified as the recipe/favorites workflow backed by the one shared `ikemaker.visualComponents.v1` library. No second persistence schema or synchronized draft was introduced.
- Stage and Screenpack shared companion browsers now offer opt-in animated thumbnails backed by real resolved SFF pixels. The toggle defaults off, loads only referenced frames under action/frame/total-image caps, skips nonpositive and infinite hold times, clamps playable timing, uses one bounded scheduler, and restores each static thumbnail when disabled. Storyboard is intentionally excluded until its payload has an authoritative resolved-pixel path.
- Storyboard now supports embedded multi-layer drag/drop reorder before or after a target. One collision-safe permutation renames complete `layerN.*` families without moving raw lines, preserving comments, unknown and duplicate properties, casing, zero-padding, whitespace, BOM, and mixed line endings. Locked layers form protected segments. Host review revalidates exact scene, rows, binding, dirty state, and source before one authoritative mutation and one Undo step.

## Focused release gate completed

- Shared browser model, companion lifecycle, production registration, startup readiness, minimum width, selection, contextual actions, and stale-owner rejection.
- Shared canvas selection, native-layer capability boundaries, reusable visual components, committed history, and comparison/onion models.
- Stage, Screenpack/UI, and Storyboard model, host authority, navigation, retained drafts, actual-panel lifecycle, and browser synchronization.
- Universal toolbar routing, viewer action parity, command registration audit, and webview accessibility.
- The intentionally large SFF suite was not run for this goal.

## Deferred prerequisites outside this completed release-safe slice

- OS-file drops and cross-asset insertion/replacement remain pending format-specific repair/intake. A safe Stage image drop spans image repair, SFF mutation, and DEF insertion across separate authoritative files and must be a coordinated transaction rather than a webview shortcut. Stage internal BG reordering is complete. Screenpack continues using safe Duplicate and Save/Insert Component flows because interleaved properties and floated-companion active-owner authority make generic row reorder unsafe.
- Screenpack cannot map arbitrary list order onto interleaved authored property families without changing semantics; its explicit native `.layerno` batch is the truthful ordering control. Storyboard's atomic family renamer and embedded drag/drop are complete.
- Embedded Stage/Screenpack list parity for the new companion-browser animation toggle, if that duplication proves useful. Storyboard animated thumbnails remain blocked until its workspace has a bounded authoritative SFF pixel-resolution path; metadata cards remain truthful in the meantime.
- Further arrangement recipe/favorites surfaces where a real target schema and one transactional mutation can be proven. Existing Stage components/inheritance, Screenpack UI element groups, and Storyboard complete-scene Save/Insert/Manage already cover safe reusable content and should not be duplicated under cosmetic labels.

## External-file intake boundary

- Direct image drops currently terminate safely in SFF Creator, which owns admission, repair, staged identities, and archive build. Stage, Screenpack/UI, and Storyboard then select the completed exact `(group,index)` through their host-owned sprite picker.
- Layered PSD remains the safe ordered-layer route: export temporary layers, send exact PNG layers through SFF intake, verify the built SFF identities/fingerprint, then review and guard owner-source adoption. An owner adoption failure may leave unreferenced sprites, but never a DEF that points at missing sprites.
- WAV/SND intake remains owned by SndMaker; these visual formats do not expose a deterministic sound-property insertion target. ACT/palette intake likewise has no deterministic visual-element insertion identity.
- A future direct-drop implementation needs a shared continuation coordinator covering admitted candidate, sealed target archive, reserved identities, completed build fingerprint, exact owner/source reference, reviewed owner mutation, and compensation/recovery if the second file write fails.

## Verified source-authority boundaries

- Browser state is local view state only; every source route is resolved again by the active host.
- Stage grouped position apply accepts coordinates plus exact current identities, then re-resolves all targets and writes one mutation.
- Screenpack/UI grouped position apply re-resolves each element and its native `pos` or `offset` key inside one exact current screen before one mutation.
- Storyboard grouped movement preserves shared `layerall.pos` and writes independent `layerN.offset` values, including safely adding a missing offset entry.
- Screenpack/UI and Storyboard browser bindings are rebuilt when their exact screen/scene or source changes.
- Real Storyboard thumbnails remain blocked on a shared resolved-image service; no placeholder pixels are presented as authored output.

## Native layer capability rules

- A shared native-layer adapter now exposes exact identity, absolute authored position, encounter order, native layer metadata, preview visibility, and editor-local locks without treating native coordinates as PSD deltas.
- Stage visibility and movement locks are editor-only. Authored show/hide would require BGCtrl behavior and is not synthesized; exact complete-section stack reorder is supported only by the embedded Stage browser.
- Screenpack/UI may explicitly set a native `.layerno`; preview visibility and movement locks remain editor-only, while generic opacity and source-group reorder are unsupported.
- Storyboard visibility and position locks are editor-only. Arbitrary layer reorder requires an atomic, comment-preserving `layerN.*` family renamer and remains disabled until that transformation is proven.
- Unsupported visibility, opacity, reorder, drag insertion, stale bindings, and duplicate identities fail closed rather than generating plausible but unsafe source.
