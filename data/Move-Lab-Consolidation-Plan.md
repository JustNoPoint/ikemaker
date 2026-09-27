# Unified Move Lab consolidation plan

Plan revision: 5
Source reviewed: IKEMaker 0.79.2 Stage A; IKEMaker 0.79.3 Stage B1; IKEMaker 0.79.6 Stage B2; IKEMaker 0.79.8 specialized component, exact AIR route, and stage/screenpack asset navigation
Phase: 1  
Status: routing/context foundation was source-reviewed in 0.79.0; shared camera correction in 0.79.1; Stage A's in-place Moves / Overview drawer and selected/all-character Problems filter in 0.79.2. Stage B1 was source-reviewed in 0.79.3. Stage B2 is implemented in 0.79.6: exact assigned CNS/ZSS StateDefs and ZSS Functions can occupy the shared workspace without a HitDef, constants profile, AIR, or SFF, and use the retained connected-code draft/Apply owner. Version 0.79.8 adds exact Helper, Explod, and native Projectile creation-site inspection, an explicit assigned-AIR action chooser that hands off to the existing AIR/Clsn owner without inferring an action number, and read-only exact HitDef field presentation that delegates Apply to the guarded HitDef owner. Deeper compact AIR/Clsn/HitDef reuse and installed interaction QA remain planned. The ordinary installed Constants zoom report remains open pending exact-build user interaction verification.

## Outcome and boundaries

IKEMaker will present one user-facing **Move Lab**. Its default authoring surface will retain the rich animation, collision, timing, reaction, value, diagnostic, and connected-code workflow. Universal character/source discovery remains available as an optional **Moves / Overview** area instead of a competing move editor. Within that workspace, authors select a move and then an exact component such as its main state, Helper, Explod, projectile controller, or function. The shell reuses shared scene, timeline, maps, code, diagnostics, and P2 context while displaying only inspectors relevant to the selected component.

Constants and maps are optional value sources. HitDefs, functions, helpers, projectiles, Explods, and throw plans are components that can coexist in one move. The tool must not require JNP naming, force conversion, infer that numeric equality proves ownership, or rewrite unknown/custom structures.

Specialist tools remain available when they provide a distinct focused workflow. Their existing commands become compatible entry points to the same exact component only after capability and draft parity is proven; optional separate windows remain available. Selecting a component is read-only and distinct from **Add Component**, which requires an explicit reviewed creation action. An embedded or summarized capability must reuse one existing mutation owner rather than create a second implementation. Context transfer identifies a target; it never grants write permission. Apply remains explicit, stale-checked, and undoable through the existing document edit. Consolidation must not independently save or enable Auto Save; subsequent saving follows the user's existing Auto Save setting or normal Save action.

This is local Phase 1 work. Preserve Player, Simple, and Workspace availability without exposing irrelevant authoring controls, and retain user visibility preferences. Stage A is source-reviewed locally; subsequent stages proceed in bounded reviewed slices. Finish approved workflows and concrete user-reported needs; older deferred expansions are not automatically activated by this plan. Check account usage at meaningful boundaries and stop at a coherent tested checkpoint at or before 35% remaining. Phase 2, packaging, installation, publication, and game/character edits remain outside this plan.

## Capability and ownership matrix

| Capability | Current owner | Move Lab disposition | Exact selection identity | Apply authority and current gap |
|---|---|---|---|---|
| Character, move, and source discovery | `move_lab_model`, `move_lab_context` | Embed a compact picker; retain full Overview | Canonical DEF plus source URI/hash and either constants profile ID/prefix or controller block identity | Read-only. A matching StateDef and `moveID` is only a candidate association; AIR action is never inferred from StateDef number. |
| Constants, timing, and contact values | `move_constants_model`, `move_constants_workspace`, shared-profile service | Retain as reusable sections when supported | DEF, constants URI/hash, profile ID/prefix, field; shared assignment adds its exact source key and location | Existing guarded Apply remains owner. The present rich surface cannot represent arbitrary direct-code moves. |
| Direct HitDef | HitDef model/workspace/draft service | Exact route first; embed fields only after its mutation service is reusable | DEF, source URI/hash, displayed controller range/signature and index | HitDef service owns Apply. Index alone is insufficient; shared HitDefs may affect several callers. |
| Connected state/function code | attack-workspace analysis, move-code drafts, Constants code-section Apply | Reuse inline collapsible sections for direct-code selections | DEF, source URI, block kind/signature/range, base hash, draft revision | Existing guarded document edit owns Apply. Duplicate names and dynamic calls stay ambiguous and source-accessible. |
| Animation, collision, reaction, and spark preview | Constants timeline, shared camera transform, AIR workspace | Keep compact preview/timeline; exact AIR/CLSN route first | Assigned AIR URI/hash, action, frame, SFF/palette context, P2 action | AIR owns AIR edits; Constants owns value/timing edits. Do not create a second AIR mutation path or claim full runtime simulation. |
| Problems and diagnostics | language diagnostics, attack-workspace timing/diagnostic analysis | Deduplicated selected-move view plus optional all-character view | Source URI/version/range, diagnostic source/code, component/frame reference | Navigation is read-only; any fix keeps its original explicit provider. Static associations remain partial and never enforce style. |
| Maps and Project Data | map registry model/service/browser | Contextual picker and usage drawer; retain full browser | Project root, Author/Game namespace, exact key, definition/use location; insertion includes target version/range | Existing registry insertion owns the explicit action. Occurrence is not proof of move ownership; expressions and ambiguous definitions stay intact. |
| Helpers, projectiles, Explods, and throws | Helper, Spatial, Throw, and source-discovery services | Select exact nested components in the common shell; retain compatible specialist entry routes and optional separate windows | DEF plus creation controller and owning source block/hash; nested root/parent identity; helper/controller, spatial mode/action, or throw-plan identity | Existing service owns insertion/Apply/plan save. Component selection never creates or converts code. A projectile may be a native controller or Helper; do not invent one universal adapter. |
| Sounds, sprites, and palettes | SND/SFF/AIR navigation and palette preview | Small audition/thumbnail only after exact resolution; retain full specialist | Actual archive URI/namespace, group/index, palette, source occurrence, return reference | Preview/audition is read-only; specialist owns edits. Never assume the current character archive for common or expression-based references. |
| History, drafts, selection, and visibility | move context, viewer navigation, form drafts, per-tool serializers | Shared shell context with independent retained draft owners | Canonical DEF, component identity, source snapshot; view selection remains separate from edit target | Camera/tab changes never write project files. Do not collapse distinct stores into one global mutable selection. |

## Default layout

The default shell contains the move picker, current move and source attribution, primary preview/timeline, selected problems, relevant value fields, and connected code. Shared-value impact stays visible beside shared edits.

Whole-character totals, file inventory, broad source outline, health/recovery tools, unused components, and broad launchers belong under optional **Moves / Overview** or **Related Tools**. Full AIR, SFF, SND, Helper, Spatial, Throw, Project Data, and whole-project code browsers remain focused tools. Visibility choices must persist without forcing hidden problem panels open; errors still expose an accessible count and navigation route.

## Staged migration

### Stage A — compact discovery and problems in the rich surface

Add an optional in-place **Moves / Overview** drawer and a selected/all-character Problems filter to the rich Constants surface using existing discovery and diagnostic models. Selecting another supported constants profile uses the existing same-panel selection and keyed drafts. Direct-code entries use an exact, clearly labeled route to the current HitDef/Move Lab workflow until Stage B. Preserve preview frame/camera, focus, open sections, and pending drafts while toggling or refreshing the drawer. Do not copy the general screen's nine mode tabs or every tool launcher.

### Stage B — direct-code moves become first-class

Allow the common shell to select an explicit state/controller without requiring a constants file or preview assets, then introduce the exact component selector for main state, Helper, Explod, projectile controller, and function targets. Reuse connected-code draft/apply sections and generic preview; show only component-relevant inspectors while retaining shared scene/maps/diagnostics/P2 context. Keep **Add Component** separate from selection. Missing or unknown AIR remains unavailable rather than guessing an action from the state number. Embed HitDef fields only after its guarded mutation logic is shared. Do not redirect existing lab commands into the shell or declare the general overview replaced until direct-code and component draft parity is proven.

### Stage C — mixed components and value-source attribution

Show supported static relationships among constants, maps, literals, expressions, functions, helpers, projectiles, Explods, and throw plans. Preserve ambiguity and custom implementations. Begin with the selected move and direct dependencies rather than a recursive whole-project graph. Explicit changes may refresh dependent previews without clearing unrelated drafts.

### Stage D — lightweight specialist reuse

Add compact AIR/CLSN editing, sound audition, and resource controls only where each demonstrably reduces context switching. Every embedded editor retains one existing Apply owner and an exact return context. Expand one capability per reviewed slice; the full specialist remains optional.

### Stage E — presentation consolidation

After parity and recovery tests pass, make the common shell the sole default Move Lab presentation. Keep legacy commands, serializers, deep links, and optional separate specialist windows as compatible routes. Do not remove old routing until draft recovery and migration are proven.

## Required acceptance evidence

- Cover direct CNS/ZSS without constants, constants-only, maps/custom expressions, mixed profiles/direct controllers, multiple HitDefs, shared functions, helper projectiles, and native projectile components. Missing assets must not block source editing.
- Reject source insertion/change between display and selection/Apply. Duplicate state/function names, equal IDs in different files, and dynamic targets never silently resolve to one candidate.
- Preserve independent drafts, revisions, conflicts, explicit discard/rebase, selection, nonzero frame, camera, focus, open sections, and hidden-panel preferences across toggle, refresh, return, and character switch. A stale acknowledgment cannot clear newer typing.
- Keep every Apply with its current guarded mutation owner and normal Undo/Save flow. Consolidation must not independently save, enable Auto Save, create an unsolicited backup/sidecar, or treat shared context as write approval; the user's existing Auto Save preference remains authoritative.
- Opening, discovery, and preview must not silently create project files. A genuinely necessary temporary-file workflow must notify the user; any project/source change still requires an explicit action.
- Exercise legacy launch, generic resume, deleted target, optional separate windows, narrow layout, and keyboard focus through model-to-message-to-handler tests rather than HTML text checks alone.
- Preserve frozen-frame world-coordinate, AIR-offset, flip, and zoom invariants. Discovery, pan, zoom, and selection do not write code. Installed visual QA remains separately identified until performed.

## Evidence status

- 0.79.0: shared Move Lab naming, exact profile/HitDef routing, return context, and per-character remembered integration context are source-reviewed.
- 0.79.1: shared camera/world transform and stale-drag cancellation are source-reviewed. The ordinary installed Constants report is still open.
- 0.79.2: Stage A adds a navigation-only in-place Moves / Overview drawer, exact direct-HitDef routes, same-panel constants-profile selection, and selected/all-character Problems scope while preserving the established mutation owners and retained drafts. Corrected implementation source sign-off is complete; the build is not released.
- 0.79.3: Stage B1 adds an exact, read-only direct-HitDef component view to the same workspace; direct CNS/ZSS source remains inspectable without constants, AIR, or SFF, stale identities are rejected, and editing delegates to the existing HitDef owner. Corrected implementation SOURCE SIGN OFF is complete and all 321 test files pass; installed visual QA remains pending.
- 0.79.6: Stage B2 adds exact assigned CNS/ZSS StateDef and ZSS Function selection/editing with source-bound retained drafts, explicit Apply/discard/rebase, shared-source warning, contextual Maps entry, and no state-number-to-AIR inference. All 325 automated test files pass; installed interaction QA remains pending.
- 0.79.8 adds exact read-only Helper, Explod, and native Projectile creation sites with enclosing source and nested receiver context. It also adds an explicit action chooser from the current assigned AIR and routes that action to the established AIR/Clsn workspace. No component number is inferred as an AIR action. Direct HitDefs present exact authored classic and custom fields read-only while the guarded HitDef editor retains Apply authority. Stage and Screenpack workspaces add navigation-only exact SFF-sprite and embedded-action handoffs with stale-source refresh. All 325 automated test files pass; installed interaction QA remains pending.
- Stage A, Stage B1, bounded Stage B2, specialized creation-site inspection, exact AIR/Clsn handoff, read-only HitDef field presentation, and the first stage/screenpack asset handoffs are source-reviewed checkpoints. Deeper compact specialist reuse and Stages C-E remain planned and are not claimed. Revision 5 records this boundary.
- Packaging and publication of this tested checkpoint were separately authorized by JNP on September 26, 2026. Installation, engine/game edits, Phase 2, and any unlisted feature expansion remain outside this plan.
