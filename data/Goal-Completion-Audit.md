# IKEMEN ZSS Tools Goal Completion Audit

Baseline: IKEMEN 1.0.

This audit maps the creation-environment goal to shipped evidence. “Complete”
means the extension provides a truthful, tested workflow within its declared
host capabilities. It does not mean every possible future IKEMEN authoring
convenience has been implemented.

| Requirement | Evidence | Result |
| --- | --- | --- |
| Comprehensive, low-friction creation environment | Character workbenches; retained SFF/SND custom editors; AIR, DEF, stage, screenpack, select.def roster, Character Select layout, command/movelist, code-structure, palette, PalFX, Recovery Center, project registry, and character Production Workflow surfaces | Complete |
| Personal and team production flow | Extensible project profiles; stable phase/step IDs; per-character status, notes, evidence, and assignments; My Next Tasks, Full Workflow, and Team Board; advisory native-file/SFF/AIR/code detection; direct Character Workbench access | Complete |
| Per-domain Learning and Advanced experiences | Independent ZSS, Lua, CNS, asset, and stage/UI settings; visible workspace badges; collapsible explanations; state-aware checklists; guided recipes; compact Advanced shortcuts | Complete |
| Same authored meaning in both experiences | `experience_equivalence.test.js` checks controller snippets, reviewed controller plans, language payloads, character scaffold choices, and shortcut targets | Complete |
| Correct ZSS documentation and parser behavior | Local IKEMEN 1.0 controller/trigger catalogs; required-field snippets; reviewed controller wizard; ZSS parser/analyzer tests; diagnostic explanation coverage gate | Complete |
| Integrated ZSS teaching and intelligence | Completion, hover, navigation, visual structure, controller documentation, option highlighting, insertion, diagnostics, and offline-first references | Complete |
| Integrated Lua teaching and intelligence | Completion, hover, visual structure, local API catalog, project-module path, and explicit deterministic-online boundary guidance | Complete |
| Integrated CNS teaching and intelligence | CNS grammar, completion, hover, native section parser, visual structure, controller option highlighting, and CNS-to-ZSS concept bridge | Complete |
| Asset workflows | SFF v2.x inspection and reviewed mutations, AIR collision/runtime/source work, palettes and protected masters, SND profiles/manifests, native controller bridges, creation of new SFF/AIR/SND files | Complete on desktop |
| Throw authoring | Dual P1/P2 tick timelines, timing proposals, bind keyframes, interaction markers, runtime-part lanes, validation, saved plans, reviewed AIR timing changes, and ZSS scaffold output | Complete as an offline authoring workflow; live gameplay remains IKEMEN-tested |
| Stage and screenpack workflows | Create without an existing DEF, localcoord/camera/layer visualization, parallax guidance, UI positioning, safe-area/sample previews, character/stage integration bridges, reviewed writes | Complete on desktop |
| Character selection workflows | Clearly separated safe select.def Roster Manager and confirmed advanced motif Layout Builder; active-motif SelectBG/grid preview; character SFF portrait resolution; reviewed drag-and-drop roster ordering; protected slot blocks; stage/order organization; custom-source preservation; reviewed motif-grid writes and normal screenpack element positioning | Complete on desktop |
| Command and movelist workflow | Owning-file discovery, generated-primitive filtering, editable step timeline, timing help, presets, diagnostics, native movelist discovery and preview | Complete |
| Project creation and workspace consistency | Explicit guided or clean character scaffold; dependency review; character workbench grouping; persistent visual editors and workspace layout state | Complete |
| Mutation safety | Preview/review/apply boundary, backups, stale-file hashes, transactional file sets, external-build protection, mutation history, and Recovery Center | Complete |
| Testing | 113 test files cover models, providers, generated output, semantic equivalence, mutation authority, desktop workspaces, production workflow persistence, roster preview/reordering, Throw Creator, accessibility foundations, and portable browser foundations | Complete |
| IKEMEN baseline wording | Current user-facing source, catalogs, documentation, and package metadata use only the IKEMEN 1.0 baseline | Complete |
| Browser/mobile honesty | Portable text intelligence and reports work without Node-only assumptions; archive parsing, native builders, external editors, and game launch are explicitly unavailable rather than simulated | Complete within reported capability boundary |

## Deliberate boundaries

- Learning and Advanced change presentation, not generated game behavior.
- Production Workflow tracks project completion; it is independent of Learning
  and Advanced presentation.
- JNP organization is an optional profile, never an engine requirement.
- CNS-to-ZSS conversion is reviewed rather than blind: originals remain intact,
  ambiguous compatibility behavior is reported, and unsupported constructs block
  application.
- The extension does not simulate IKEMEN runtime behavior as authoritative.
- Native SFF/SND builders, external applications, and IKEMEN launch require a
  trusted local desktop workspace.
- Browser/mobile archive editors remain disabled until real portable readers,
  writers, and device tests exist.
- New abstractions and bulk actions require a project use case and review before
  inclusion; the extension may streamline creation, but it must not silently
  invent game systems or classifications.
- The opt-in IKEMEN Tools Authoring Bridge provides starting pose and animation
  requests. Throw Creator produces reviewed native states and events; it does
  not claim arbitrary hot injection into a running IKEMEN process.

## Verification gates

1. All automated tests pass.
2. Current user-facing extension content contains no superseded baseline terms.
3. Every registered diagnostic has a nearby explanation and review action.
4. Learning and Advanced paths preserve authored semantics and mutation rules.
5. Capability reports never claim unavailable browser/mobile operations.
