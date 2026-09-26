# Production Workflow Profiles

Production Workflow is a project and team checklist layered over the extension's existing character tools. It does not create a new game system, classify ambiguous work automatically, or replace play testing.

## Project tickets and hierarchy

The **Project Tickets** view is the shared Jira-style planning layer. It is separate from the reusable character-production profile.

- An **Epic** can hold child tickets, such as `Build All Characters` containing `Build Ryu`, `Build Nash`, and `Build Jamie`.
- An Epic holds child tickets. Each normal child ticket holds its concrete task checklist; this keeps the hierarchy understandable for animators, color separators (`CS`), coders, voice actors (`Voice`), sound workers, testers, and reviewers.
- A ticket cannot move to Done while one of its tasks is unchecked or an active direct child ticket is not Done. This makes completion travel safely up the hierarchy.
- Tickets move through Backlog, Discussion, Ready, Doing, Testing, Review, and Done.
- Assignment belongs on tickets and may also be recorded on individual tasks.
- Comments retain decisions, blockers, test results, and handoff context.
- **Paste report into intake** preserves the pasted report for review. A reviewer chooses whether to accept it as a ticket.

Use **Log a project issue or feedback** in Project Tickets or Report Intake. Start with **Title**, **What happened?**, and **What I would have liked to happen**. You can add a new use-case scenario and optional screenshot, mockup, log, or file references. Title and what happened are required. The current IKEMaker version is recorded automatically.

Expand **Context and reproduction details** to check the item type, item name, item/content version, game/project profile, and screen or viewer. The current character and workflow are prefilled. Change the item type for a Stage, Screenpack/Motif, Opening, Ending, Storyboard, Game Project, Team Project, universal tool/viewer, or another item. Changing type clears unrelated name/version defaults. **Read name/version from definition…** reads declared metadata from a selected DEF; it does not change that file. Engine compatibility versions are not content versions. Undeclared values remain **Unknown**, and manual entry is available. Add concise reproduction steps, severity, or other build details when useful.

Check the named project and choose **Create Bug ticket in Backlog** for a direct issue or **Submit feedback to Report Intake** for review first. A Character item links the report to the named character; other item types remain project-level records.

**Save to project** writes to the current project's board. Evidence paths and links are references, not uploaded or copied files; include those files when sharing the project. Issue details, context, and use-case notes remain attached when a report is accepted as a ticket, and can be expanded on the card. **Submit report…** opens the same form. Clearing or leaving a form before saving does not create an issue.

The project board is stored in `.ikemen/workflows/team-board.json`. It is intentionally readable and source-control friendly so a later GitHub synchronization layer can be reviewed rather than replacing local project history.

## Team directory, reports, and notifications

- **Team Directory** records a public display name, an `@handle`, active/inactive status, and one or more lightweight roles. The default roles are Director, Coder, Animator, CS, Palette, Sound, Voice, QA, Stage, and Screenpack. Animator replaces the overlapping Spriter label; CS and Voice remain independent specialties.
- Mark departing members inactive instead of deleting them. Historical assignments and comments remain understandable.
- **Report Intake** accepts a title, reproduction details, and optional screenshots or logs. A reviewer explicitly accepts the report as a typed ticket or rejects it with a recorded reason.
- Ticket creators automatically watch their tickets. Assigned members are also added as watchers. Anyone may watch or unwatch manually.
- Comments notify current watchers. `@Handle` notifies one active member, while a role mention such as `@QA`, `@CS`, or `@Voice` notifies every active member with that role.
- **My Inbox** displays unread notifications for the configured workflow identity. These are project-local notifications; collaborators receive them after the shared project data reaches their checkout.

## Views

- **My Next Tasks** shows unfinished steps that are unassigned or assigned to the configured actor.
- **Full Workflow** shows every phase and step for the active character.
- **Responsibilities** groups unfinished character-profile work by discipline and shows assignees, notes, evidence, and status.

Set `ikemenZss.productionWorkflow.actor` in the workspace when the operating-system user name is not the name your team uses.

## Status and evidence

Detection is a convenience signal only. `DETECTED` never means `PASSED`; a person must review the result and choose a status. Notes can record blockers, exceptions, or handoffs. Evidence can reference a project file, report, test result, or short review note.

## Coding curriculum inside Production Workflow

Production Workflow can host a coding lesson, but completing its checklist is
not a coding certification. A curriculum-enabled pass records two independent
outcomes:

- **IKEMaker workflow result:** whether the navigation, viewer/editor bridge,
  diagnostics, launch, evidence, and recovery path worked clearly and
  correctly.
- **Learner result:** whether the learner can explain ownership and execution,
  predict behavior before running, author or review the change, diagnose a
  mismatch, test non-regressions, and defend the conclusion.

The intended model is reciprocal pair programming: the learner and assistant
may each author code, and the other reviews it. Mark every lesson Learn,
Practice, or Assessment. Assistance is expected in Learn mode and allowed as
hints in Practice mode. Assessment cannot be passed by generated code,
automated detection, checklist completion, or the assistant supplying the
solution. Record workflow problems as product findings even when the coding
lesson succeeds, and record learning gaps even when IKEMaker works perfectly.

The bundled **First Grounded Light Normal** block supplies the first integrated
lesson. Its Ryu standing-light-punch path is both an IKEMaker usability test and
the learner's first ownership, prediction, bounded-edit, diagnosis, reversal,
review, and teach-back exercise. These remain separate sign-offs.

Progress is stored per character under:

`.ikemen/workflows/characters/`

Removed step IDs are retained as orphaned progress. If an ID returns later, its progress is restored.

## Foundation, game profiles, and reusable blocks

The JNP Character Production Foundation owns the repeatable production process: assets, code, QA, evidence, and owner signoff. It does not own a game's mechanics. Bundled game profiles layer game policy over that foundation:

- SF6 Character Production
- DS vs SF Character Production
- DS4 / Vampire Soldier Character Production
- HDBZ Character Production

HDBZ shares the production foundation but is not part of the three-game Capcom shell. A completed Ryu test may refine the reusable process, but Ryu's SF behavior must not silently become a universal requirement.

The **SF6 Character Production** profile is the dedicated assisted-creation path
for the SF6 project. It keeps source evidence, normalized IKEMEN equivalents,
intentional project deviations, implemented behavior, and signed-off behavior
as separate records. Its six game phases cover source definition, connected
SFF/AIR/palette/sound presentation, movement and command foundations, attack
and SF6-system integration, auto-applied reversible drafts with QA evidence,
and the Ryu Baseline v1 freeze. Ryu is the first proving character, not a set
of character-specific rules that every later implementation must copy.

The full authoring policy and phase guidance is stored in
`Notes/StreetFighter/SF6_CHARACTER_CREATION_WORKFLOW.md`.

Reusable workflow blocks hold a versioned slice of work that can be imported into more than one game profile. The bundled **First Grounded Light Normal** block records the learning, implementation, testing, evidence, failure review, and signoff path established by the first completed light normal. Each game still supplies its own constants, reactions, system hooks, and acceptance values.

The **DS vs SF Character Production** profile has an asymmetric source-authority
gate. Returning Darkstalkers begin from researched Vampire Savior behavior.
Street Fighter characters instead require a complete Vampire Savior-era
"what if" design pass while preserving their established identity. Their
workflow must separately review source evidence, authored interpretation,
expanded gameplay purpose, presentation and interactions, anti-homogenization,
test evidence, and explicit JustNoPoint signoff. Passing generic asset and move
checks alone cannot complete an SF-side DS character.

The DS profile measures parity of authored depth against the surrounding
Darkstalkers cast. It does not impose equal move counts, animation totals,
gimmicks, or system-access quotas. Each SF-side completion requires a written
review of coherent gameplan and weaknesses, appropriate system participation,
character-specific exceptions, expressive presentation, retained identity,
era-plausible new material, matchup coverage, and production readiness before
JustNoPoint signoff.

The **DS4 / Vampire Soldier Character Production** profile is not the DS
crossover profile. It excludes the Street Fighter roster and SF-side
reimagining rubric. Its first completion stage,
**Foundation-complete / conversion-valid**, verifies the applicable Vampire
Savior-derived behavior and current reusable technical foundation without
claiming that the final sequel design exists. Its second stage,
**DS4 design-complete**, requires approved sequel direction, implemented
deviations, purpose-and-fit review for Avatar-influenced ideas, complete-ruleset
testing, and explicit JustNoPoint signoff. New approved DS4 rules reopen every
affected foundation-complete character automatically.

The favored handoff into DS4 is the project milestone **Vampire Savior
Foundation v1**. DS must first complete Demitri and Morrigan, then create a
post-Morrigan coverage-gap task and obtain JustNoPoint's selection of one or
possibly two contrasting returning Darkstalkers. Candidate names remain open
until that review. After the cohort passes implementation, evidence, QA, and
signoff, audit reusable mechanisms separately from DS crossover policy and
freeze the supported foundation snapshot. Reaching v1 marks branch readiness,
not project completion or exhaustive edge-case coverage.

Individual character origin may run in the opposite direction without changing
the foundation pipeline. Anita and Rever are provisional DS4-first/backport
candidates whose actual origin remains a scheduling decision. Such characters
need a source-neutral identity/content record where practical, a separate
game-policy implementation, a port-difference/provenance record, full
destination workflow and tests, and explicit JustNoPoint signoff. Later fixes
must be classified before reviewed propagation; never synchronize versions or
create circular runtime dependencies automatically.

Use **Profile tools…** to:

- duplicate a complete profile as an independent branch;
- create a child profile that inherits a selected parent;
- import a reusable workflow block;
- export an existing phase as a new project-owned block.

## Editing and extending a profile

Bundled profiles and blocks are read-only. Choose **Create editable project profile** to create a small project-owned profile under:

`.ikemen/workflow-profiles/`

The project profile inherits the bundled profile with:

```json
{
  "schemaVersion": 1,
  "id": "sf-character-production-project",
  "version": 1,
  "name": "SF Character Production — Project",
  "extends": "bundled:sf-character-production",
  "blocks": [],
  "phases": []
}
```

Add a new phase by giving it a stable phase ID and steps with stable, globally unique IDs. To refine an existing phase or step, repeat its ID and include only the fields being changed. Increase the project profile version when the intended workflow changes.

```json
{
  "id": "first-light-normal",
  "steps": [
    {
      "id": "light-normal.team-signoff",
      "label": "Team reviews the completed light normal",
      "discipline": "Art",
      "action": "open-air"
    }
  ]
}
```

Existing step properties remain in place when an override omits them. Never reuse an old step ID for a different meaning; that would attach old progress to unrelated work.

Project-owned blocks live under `.ikemen/workflow-blocks/`. Profile and block versions communicate intentional process changes; saved progress continues to follow stable step IDs.

## Private-project boundary

A private project must use its own workspace and repository and must not depend on paths, modules, assets, notes, ticket stores, or automatic synchronization from a shared fan-game workspace. Exchange only a deliberately sanitized, owner-reviewed packet containing generic process knowledge. Never include private names, characters, assets, mechanics, paths, screenshots, logs, or roadmap details in shared notes or project tasks.

## Scope rules

- JNP conventions are an optional project profile, not an IKEMEN requirement.
- Classify every change as universal mechanism, game adapter/policy, character content, or tooling/workflow before placing it.
- Universal layers must not import game-specific layers. Game profiles may depend on the universal foundation.
- Add a reusable step only after a real repeated project need is established.
- Leave ambiguous classification to human review.
- Keep Learning/Advanced presentation settings separate from production completion.
- Use Lua only where its runtime boundary is appropriate; online gameplay state must remain deterministic and engine-owned.

## Saving Workflow changes

**Auto Save** is off by default and uses the shared toolbar toggle. When off, status, notes, assignments, evidence, lessons, ticket moves, comments, and team changes stay as drafts. **Save Workflow** saves the current character progress and project board together. The header shows whether changes remain unsaved. **Discard Unsaved Changes** asks for confirmation, then reloads those records from disk. Other characters’ progress drafts remain separate; the project board is shared by characters in that project.

Drafts survive closing the tab or restarting VS Code in the same workspace. They are stored in VS Code’s local workspace storage, not character folders, Git, or shared project files. Other testers cannot see them until you save. They are not backup archives.

With Auto Save on, subsequent edits save immediately. Turning it on does not by itself commit an existing draft; press Save Workflow to do that immediately. The issue form’s **Save to project** button always explicitly saves the board, even with autosave off, without saving unrelated character progress drafts. Profile create/import/select/export actions are also explicit actions.

Opening **Progress file** or **Project board JSON** no longer creates missing files. Missing or unsaved records open as JSON previews. Edit in the Workflow screen and use Save Workflow; a preview is a snapshot, not a live second editor of the draft.

If a file changes externally while you have a draft, Save stops and retains the draft rather than overwriting the external changes. Use the JSON preview to inspect or copy your draft, inspect the actual file, then discard/reapply as needed. No automatic .bak copies or mutation logs are created by Workflow saves.
