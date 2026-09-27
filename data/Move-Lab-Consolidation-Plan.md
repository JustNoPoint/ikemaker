# Unified Move Lab consolidation plan

Plan revision: 1  
Source reviewed: IKEMaker 0.79.1  
Phase: 1  
Status: routing/context foundation implemented and source-reviewed in 0.79.0; shared camera correction source-reviewed in 0.79.1; embedding and generalized-shell stages planned. The ordinary installed Constants zoom report remains open pending exact-build user interaction verification.

## Outcome and boundaries

IKEMaker will present one user-facing **Move Lab**. Its default authoring surface will retain the rich animation, collision, timing, reaction, value, diagnostic, and connected-code workflow. Universal character/source discovery remains available as an optional **Moves / Overview** area instead of a competing move editor.

Constants and maps are optional value sources. HitDefs, functions, helpers, projectiles, Explods, and throw plans are components that can coexist in one move. The tool must not require JNP naming, force conversion, infer that numeric equality proves ownership, or rewrite unknown/custom structures.

Specialist tools remain available when they provide a distinct focused workflow. An embedded or summarized capability must reuse one existing mutation owner rather than create a second implementation. Context transfer identifies a target; it never grants write permission. Apply remains explicit, stale-checked, and undoable through the existing document edit. Consolidation must not independently save or enable Auto Save; subsequent saving follows the user's existing Auto Save setting or normal Save action.

This is local Phase 1 work. Preserve Player, Simple, and Workspace availability without exposing irrelevant authoring controls, and retain user visibility preferences. Stage A is the next bounded implementation and returns for review before Stage B or any broader merge. Check account usage at meaningful boundaries and stop at a coherent tested checkpoint at or before 35% remaining. Phase 2, packaging, installation, publication, and game/character edits remain outside this plan.

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
| Helpers, projectiles, Explods, and throws | Helper Lab, Spatial Composer, Throw Creator, source discovery | Component summary with exact specialist route first | DEF plus source block/hash and helper/controller, spatial mode/action, or throw-plan identity | Specialist owns insertion/Apply/plan save. A projectile may be a native controller or Helper; do not invent one universal adapter. |
| Sounds, sprites, and palettes | SND/SFF/AIR navigation and palette preview | Small audition/thumbnail only after exact resolution; retain full specialist | Actual archive URI/namespace, group/index, palette, source occurrence, return reference | Preview/audition is read-only; specialist owns edits. Never assume the current character archive for common or expression-based references. |
| History, drafts, selection, and visibility | move context, viewer navigation, form drafts, per-tool serializers | Shared shell context with independent retained draft owners | Canonical DEF, component identity, source snapshot; view selection remains separate from edit target | Camera/tab changes never write project files. Do not collapse distinct stores into one global mutable selection. |

## Default layout

The default shell contains the move picker, current move and source attribution, primary preview/timeline, selected problems, relevant value fields, and connected code. Shared-value impact stays visible beside shared edits.

Whole-character totals, file inventory, broad source outline, health/recovery tools, unused components, and broad launchers belong under optional **Moves / Overview** or **Related Tools**. Full AIR, SFF, SND, Helper, Spatial, Throw, Project Data, and whole-project code browsers remain focused tools. Visibility choices must persist without forcing hidden problem panels open; errors still expose an accessible count and navigation route.

## Staged migration

### Stage A — compact discovery and problems in the rich surface

Add an optional in-place **Moves / Overview** drawer and a selected/all-character Problems filter to the rich Constants surface using existing discovery and diagnostic models. Selecting another supported constants profile uses the existing same-panel selection and keyed drafts. Direct-code entries use an exact, clearly labeled route to the current HitDef/Move Lab workflow until Stage B. Preserve preview frame/camera, focus, open sections, and pending drafts while toggling or refreshing the drawer. Do not copy the general screen's nine mode tabs or every tool launcher.

### Stage B — direct-code moves become first-class

Allow the common shell to select an explicit state/controller without requiring a constants file or preview assets. Reuse connected-code draft/apply sections and generic preview. Missing or unknown AIR remains unavailable rather than guessing an action from the state number. Embed HitDef fields only after its guarded mutation logic is shared. Do not declare the general overview replaced until direct-code characters have parity.

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
- Stage A and later: planned, not shipped.
- This plan does not authorize installation, packaging, publication, engine/game edits, or Phase 2 work.
