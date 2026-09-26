# Workflow stabilization architecture

This extension treats faster creation as an explicit product goal. It may provide a visual game-authoring layer over VS Code; the IKEMEN runtime itself remains protected from editor-only feature creep.

## Persistent context

The status bar identifies `Project → Character/Shared → Asset type` and its ownership layer. The authoritative project registry is `.ikemen/project-registry.json`. It is versioned, migrated transactionally, and may hold projects, characters, aliases, asset requirements, appearances, palettes, sounds, attacks, workflow selection, and validation policy. **IKEMEN: Index Existing Metadata Sources** can make established metadata files registry-owned references without copying or moving them.

Ownership layers are:

- **Universal** — reusable mechanism with no game policy.
- **Game-specific** — policy for SF6, DS vs. SF, DS4, HDBZ, or another declared game.
- **Character-specific** — data and behavior owned by one fighter.
- **Tooling/generated** — editor implementation, manifests, reports, caches, or generated output.

Universal material must not acquire a live dependency on game or character material. Games must not create circular live dependencies. A backport is a reviewed destination-owned adaptation, not synchronization.

Use **IKEMEN: Audit DEF Ownership Dependencies** to review the active character/template definition and every file it loads. Explicit path ownership and project overrides belong in `assets.ownership` and `assets.projects` in the registry.

## Activity workspaces

Use **IKEMEN: Save Workspace Preset** for Character Coding, Sprite / AIR Authoring, Sound / Palette Authoring, QA and Testing, Stage / Screenpack, or Roster Management. A preset remembers file-backed tabs, editor groups, and active tabs. Individual viewers retain their own selected sprite, animation, palette, zoom, and similar state where supported. VS Code does not expose reliable control of exact pane pixel widths, so users retain control of those dimensions.

## Validation language

- **Error** — engine, project, or ownership contract would break.
- **Warning** — likely defect requiring review.
- **Project convention** — a configurable organization rule such as a naming prefix.
- **Suggestion** — optional improvement.

Project conventions must remain disableable so the extension never forces JNP organization on another creator.

## Safe change sequence

Destructive or broad edits follow: **preview → validate → apply → verify → undo/recover**.

Use **IKEMEN: Preview Cross-File Change Impact** before renumbering a sprite, animation, sound, palette, map, state, or symbol. Binary SFF/SND contents remain under their dedicated manifest/viewer tools. Writes use expected hashes, temporary files, optional backups, a mutation journal, and the Recovery Center.

## Performance contract

Large archives and project scans are lazy and budgeted. File-signature caches invalidate when size or modification time changes. Change-impact preview has configurable file-count and per-file byte budgets and reports truncation instead of silently pretending its result is complete.

## Foundation learning packet

Every frozen reference foundation records:

1. Proven rule
2. Game-specific exception
3. Test procedure
4. Evidence
5. Known limitation
6. Owner sign-off

Production Workflow provides a structured lesson form and a dedicated Lessons view. Evidence and dependencies are enforced before a gated step can pass; named sign-off cannot be inferred from detection.

Ryu Baseline v1 is a workflow and foundation milestone, not a claim that the full character roster or moveset is finished. Its final pass is manually gated by evidence and JustNoPoint/JNP sign-off.

## Current progression

`SF6 / Ryu → DS vs. SF / Demitri → DS vs. SF / Morrigan → DS4 / Demitri conversion validation → HDBZ / Goku`

DS vs. SF freezes Vampire Savior Foundation v1 after Demitri, Morrigan, and one or two additional characters chosen by coverage gaps. DS4 has separate foundation-complete and design-complete gates. HDBZ stays close to the finished vanilla MUGEN game except for documented widescreen, system, rollback, QoL, or balance adaptations.
