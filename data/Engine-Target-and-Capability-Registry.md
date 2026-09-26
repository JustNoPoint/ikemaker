# Engine Target and Capability Registry

IKEMaker separates four operations that must never imply one another:

1. **Update Engine Knowledge** reads configured declarative upstream sources,
   preserves their revisions and evidence, and updates the last-good catalog.
   It does not install an executable or modify a project.
2. **Register Installed Build** hashes an existing local executable and records
   it beside other builds. A hash matching trusted catalog evidence is marked
   authenticated; otherwise it is plainly marked user-asserted. Registration
   does not select that build for a game.
3. **Adopt Build for Project** reviews an exact installed/catalog build against
   one selected game and records the old target, new target and migration/test
   summary. It does not rewrite authored files automatically.
4. **Review & Safely Install Exact Nightly** is an explicit, two-approval
   migration. It re-resolves the moving Nightly label, pins the release, asset,
   commit and downloaded SHA-256, validates every archive destination, compares
   the live engine with an authenticated stable baseline, and shows conflicts
   before changing the game. It then makes a restorable engine/config/registry
   snapshot outside the game, uses an external write-ahead journal and lock,
   replaces only allowlisted engine-owned files, removes only obsolete files
   that still match stable, preserves modified overrides, and updates all
   affected profiles sharing that runtime. It can restore the old files and
   registry after failure and refuses to erase files changed after migration.

Weekly discovery never grants installation approval. Stay and Remind decisions
are tied to one exact candidate, so a newly published Nightly is reviewed as a
new candidate. Risk labels are guidance with visible evidence gaps; source and
artifact identity are reported separately from parser, runtime, rollback,
project, gameplay and matched-peer online confidence.

## Stable compatibility

Project registries older than schema 4 resolve to the pinned IKEMEN GO 1.0.0
target in memory. Reading an older registry does not write it. A later explicit
metadata migration or ordinary registry edit records the normalized target.
Implicit stable projects retain their established configured/root executable
path even when another stable executable is registered globally. An explicit
adoption pins its installed-artifact ID and executable hash. Pinned stable and
all non-stable targets never fall back to another global executable.

## Knowledge and evidence

The bundled catalog is the offline fallback. Automatic refresh checks official
release and develop data plus the configured documentation sources. Optional
custom-fork catalogs must use HTTPS and pass the same declarative schema.
Remote content is never executed. Remote claims enter as observed source
evidence and cannot import parser, runtime, rollback or project verification.

A failed or partial refresh retains the last successful data for unavailable
sources. Invalid catalog output is not promoted. Every exact nightly target
requires a commit, and each observed commit receives an immutable build ID. A
reused ID with a different commit or hash is retained as a visible conflict
instead of overwriting the old identity. A moving nightly label is monitoring
information only.

Capability results distinguish unknown, unsupported, unverified, conflicting,
removed, fallback, changed, deprecated and supported states. Verified evidence
must explicitly name the exact build (and project where scoped); evidence for
one build cannot enable another. Fallbacks likewise require exact, verified
fallback evidence. Showing features from other targets is an optional discovery
view and never enables unsupported output.

User-asserted artifacts are available only through a separate explicit warning
and remain labeled and hash-pinned in project history. Hashing a file proves
its local identity, not that it is an official upstream binary.

## Current consumer coverage

See `engine-consumer-coverage.json`. The Project Manager, update monitor, normal
game launch, Stage Rig launch and test-session launch are wired to the engine
target contract. Editor, completion, snippet, generator and screenpack entries
remain explicitly undeclared until each consumer states and enforces its actual
capability requirements.

## Required hands-on checks

- Refresh against live GitHub/wiki/documentation endpoints and inspect source
  outage/conflict presentation.
- Use the reviewed migration command on a restorable stable copy, then confirm
  the backup manifest, external journal, exact target/hash registration and
  rollback recovery evidence.
- Confirm every launch route uses the selected project when multiple games are
  open, then test missing and modified executables.
- Review narrow-window and keyboard accessibility in the new Engine Targets
  Project Manager section.
- Exercise matched-peer online play separately; an online-related upstream
  change is not evidence of cross-build or cross-configuration compatibility.

These require UI or engine interaction and were intentionally not run during
the inexpensive implementation pass.
