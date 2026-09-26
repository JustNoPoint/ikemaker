# Engine Target and Capability Registry — scope clarification

Approved direction clarified by JustNoPoint on 2026-09-24. This is design scope, not
an implementation or verification claim.

## IKEMaker owns upstream discovery and knowledge updates

IKEMaker itself searches and checks its configured wiki, documentation and
GitHub sources for engine updates. The finished system must discover builds,
collect changes, update its versioned engine knowledge catalog and explain
compatibility without depending on SF6 or another chat to supply catalog edits
for every new release or nightly. SF6 implements and maintains this mechanism;
it is not a required operator of the ongoing update workflow.

Reuse and extend IKEMaker's existing upstream checking/documentation facilities.
Provide an explicit Update Engine Knowledge action and configurable background
checking. Record last checked, sources reached, failed checks and what changed.
An upstream outage must retain the last valid offline knowledge snapshot.

The refresh pipeline must:

- Discover stable releases, exact nightly commits and configured custom-fork
  sources; retain branch, tag, commit, publication/build time when available,
  platform, artifact identity and source provenance. A moving channel is for
  monitoring; it is not a reproducible project target.
- Collect relevant wiki/documentation revisions, release notes, source changes
  and available upstream test evidence. Associate each claim with its exact
  source/revision rather than assuming today's wiki describes every build.
- Produce structured capability additions, changes, fixes, deprecations,
  removals and backports, including affected authoring surfaces and migration
  guidance where evidence supports them.
- Validate and version derived metadata, retain conflicting claims and unknown
  fields, and show an intelligible change summary. Wiki prose alone does not
  prove runtime or rollback behavior. New observations must not be promoted
  automatically to local parser/runtime/project verification.
- Preserve original source references and separate previously verified facts
  from newly observed claims. GitHub release and develop histories may diverge;
  do not infer feature support from a simple commit count or version ordering.
- Refresh supported declarative knowledge and capability rules through validated
  schemas. Upstream content is data, never executable instructions. A feature
  requiring new editor/generator code is still discovered and documented, but
  marked as needing IKEMaker support rather than claimed to work already.

## Keep acquisition, installation and adoption independent

1. Engine Knowledge Catalog: IKEMaker updates what it knows from upstream
   sources. This does not change project files, targets or executable builds.
2. Installed Engine Registry: explicit installation adds a verified build beside
   existing builds. Installation does not adopt it for a project.
3. Project Target Contract: explicit reviewed adoption changes the project's
   pinned engine target, with migration results and reversal information.

Existing 1.0 projects keep their stable target. Refreshed knowledge may report
new findings, compatibility issues or available features; it must never silently
retarget a project, rewrite authored output or install a moving nightly.

## Suggested acceptance checks for implementation

- Fixture-based refresh discovers an unseen build and a documented capability
  without manual catalog edits or any chat involvement.
- Wiki/GitHub disagreement remains visible and does not become false verified
  support; source revisions stay associated with their claims.
- Offline, partial and invalid refreshes retain the last valid catalog and
  accurately report which sources were checked.
- Knowledge refresh leaves project contracts, authored files and executables
  unchanged; installation likewise leaves project targets unchanged.
- New metadata can inform existing compatible consumers; unsupported new editor
  behavior is reported honestly as requiring an IKEMaker software update.

These checks should use small local fixtures. No live engine launch, broad
regression suite or packaging wave is needed for this scope clarification.
