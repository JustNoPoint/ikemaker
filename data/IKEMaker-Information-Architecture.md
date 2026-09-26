# IKEMaker information architecture

IKEMaker uses the same responsibility boundaries in the sidebar and in **Related Work** navigation.

1. **Quick Start** contains only the most common entry points: open a character, open connected work, resume the production workflow, manage a roster, or launch IKEMEN.
2. **Player Setup** contains safe roster, menu, story, and select-screen tasks intended for people assembling or playing a game.
3. **Character Authoring** and the SFF, AIR, SND, code, stage, and screenpack sections contain creation actions grouped by the asset being changed.
4. **Debug and Testing** owns diagnostics, audits, test sessions, the Stage Rig, and transactional recovery. Debug actions should not be placed under an authoring asset merely because they inspect that asset.
5. **Universal Standards** contains documentation, registries, reference intake, and bridges that apply across games. Universal material must not be stored inside a game or personal profile. The Reference Library distinguishes shared tool documentation from game/project claims and evidence.
6. **Game and Project Profiles** contains requirements and conventions that differ between games and user-defined projects.
7. **Personal Workspace and Preferences** contains one user's editor experience, launch defaults, external-editor choices, controls, and extension settings. These preferences must not silently change project standards.
8. **Release and Public Copy** contains public-build defaults, auditing, versioning, and completion.

## Games, work projects, and teams

These are separate records and must not be collapsed into one ambiguous
"project" field:

- A **game** owns its rules, game profile, content basis, and changeable
  Hobby / Commercial / Undecided classification.
- A **work project** is a character, stage, screenpack, shared system, asset
  set, tooling task, or other deliverable. It may be unassigned or assigned to
  exactly one game and one responsible team. Either assignment can change
  later without moving files.
- A **team** has an editable name, job-class catalog, and member directory.
  Members may hold several job classes and may become inactive without being
  erased from history.

Project & Team Manager is the primary non-technical editor for these records.
The underlying JSON remains available as an advanced view, not the default
creation flow.

## Project classification

Every editable project profile should declare two independent classifications:

1. **Distribution intent**
   - Hobby / non-commercial
   - Commercial
   - Undecided / private prototype
2. **Content basis**
   - Fully original
   - Licensed
   - Fan project / reference recreation
   - Mixed

These are project metadata, not a judgment about what an author is allowed to
create. Keeping them separate prevents "hobby" from being mistaken for "uses
existing game material" and prevents "commercial" from disabling ordinary
IKEMaker authoring features.

The persistent context bar and project chooser should show compact badges such
as `Commercial · Original` or `Hobby · Fan Project`. Project creation should
explain the choices, allow them to be changed deliberately, and store the
change in profile history.

Feature availability should be capability-based:

- Universal authoring, validation, testing, workflow, and release tools work
  for every classification.
- Source-game/emulation acquisition profiles are visible only to projects that
  explicitly enable source-reference research. A commercial/original project
  can prohibit this capability without disabling ordinary IKEMaker authoring.
- Moving or importing data between projects must show both projects'
  classifications and the asset provenance. A commercial/original destination
  must reject emulation-derived profiles, captures, measurements, and converted
  assets rather than silently copying them.
- An `Undecided` or `Mixed` project receives a review warning before public
  completion; it is not silently treated as either safe or prohibited.

Current JNP classifications:

- SF6 fan project: `Hobby / non-commercial · Fan project`
- DSvsSF: `Hobby / non-commercial · Fan project`
- DS4: `Hobby / non-commercial · Fan project`
- HDBZ: `Hobby / non-commercial · Fan project`

## Reference Library placement

The **Reference Intake** entry lives under Universal Standards because its
reader, source registry, claim model, comparison tools, and offline library are
universal. Imported claims remain visibly scoped to their owning game, project,
character, asset, or source-game profile. Moving a claim into a project is a
reviewed mapping action, not a consequence of where the intake screen is opened.

External pages, pasted discussions, attachments, and imported documents are
untrusted evidence rather than executable instructions. Only a separately
approved project-rule record may influence validation, defaults, generation, or
completion requirements.

Every visual workspace uses the same header order: **Related Work**, **Game**, **Infinite VS**, and **Training**, followed by screen-specific actions. Wide layouts show the complete `Ctrl+Alt+F5`, `Ctrl+Alt+F6`, and `Ctrl+Alt+F7` shortcuts; compact layouts retain the controls and hide only the repeated shortcut text.

## First-run visibility setup

On first use, IKEMaker should present a short set of large selectable cards.
These choices control discovery, disclosure, suggested workspaces, and default
navigation only. They must never disable the underlying tools, change authored
game behavior, or prevent the user from changing the choices later.

1. **Are you a Player or Creator?**
   - Player opens the smallest surface: roster/select management, stages,
     story/dialogue, launch/update tasks, and safe palette installation or
     replacement. Phase 2 production authoring is hidden.
   - Creator exposes authoring areas selected by the remaining questions.
2. **Which character languages will you use?**
   - CNS
   - ZSS
   - Both
   This filters examples, controller lists, related-work suggestions, and code
   workspaces; it does not convert or delete files.
3. **Are you Learning or Proficient?**
   - Learning expands explanations, recipes, terminology, and safe next steps.
   - Proficient uses the same operations and safeguards with denser layouts.
4. **Will you work Alone or With a Team?**
   - Alone hides tickets, assignments, watchers, team roles, and handoff views.
   - Team enables those collaboration surfaces and then offers role selection.
5. **Will you pull reference data from emulation?**
   - No hides Source Game Lab, emulator adapters, capture sessions, memory-data
     bridges, and conversion tools.
   - Yes exposes them only when the project content classification permits it
     and shows the source/provenance boundary.

**Skip setup** loads the complete solo creator surface, including both CNS and
ZSS and all Learning/Proficient-capable tools, while leaving team features
hidden. It does not automatically enable source-emulation acquisition for a
commercial/original project.

After the five primary choices, an optional **Personalize further** page may
ask for the main creation area (characters, stages/UI, roster/game assembly, or
source conversion), preferred workspace preset, and accessibility or
performance preferences. It may offer **Create my project profile** or
**Continue with Default / Universal**, but must not ask ordinary users to
select one of JNP's project profiles. Toolchain and platform capabilities
should be detected automatically rather than asked as onboarding questions.

JNP game profiles are development/reference profiles, not the normal public
onboarding path. Public IKEMaker contains no private-game profile, identifier,
test catalog entry, workflow, preset, or documentation. Supporting a private
game later requires a separately packaged private extension layer over the
public IKEMaker core; the public package must remain usable without it.

The resulting summary must preview exactly which sidebar groups and Quick Start
actions will be shown. **Apply**, **Back**, and **Change later** are always
available. The same card-based setup is reopened from Personal Workspace and
Preferences, and every hidden section remains reachable through a temporary
**Show all tools** action.

## Authoring and Source Game Lab shells

The deferred source-game acquisition/conversion work uses two connected shells:
the current Authoring shell and a Source Game Lab shell. This is navigation and
task context, not another user-skill or complexity mode. Player/Creator,
Learning/Proficient, compact/workspace disclosure, and domain preferences apply
inside the active shell; they do not define which shell owns the work.

Both shells share the same selected registry, game/work project, character or
stage, move/action/asset, evidence identifiers, and transaction history.
Switching shells preserves that context. Converted output opens directly in the
existing authoring editor that owns the target structure, and that editor can
return to the exact supporting capture, mapping, and evidence. Source Game Lab
must reuse authoring preview, validation, backup, stale-file protection,
history, undo, launch, and test infrastructure rather than create a second save
path. The exact switch control, panel arrangement, and window policy remain a
product-design decision.
