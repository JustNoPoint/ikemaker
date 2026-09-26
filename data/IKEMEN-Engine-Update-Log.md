# IKEMEN Engine Update Log

## 2026-09-25 — Nightly `0a4911898baa` held after review

- Exact commit: `0a4911898baa998bc3087cefbfa431925a6050cd`
- Release / Windows asset: `396501913` / `588087027`
- Verified archive SHA-256:
  `91d7c7d55fc0dbfc5754fa1606423ef94f584bbb465309ca8dc9685d61a0ac2b`
- Verified executable SHA-256:
  `aea78a494665279f7eac029799f80220803d58475a0e3190d45846fdc4623f59`
- Adoption status: rejected; production remains on stable 1.0

This Nightly is twelve commits ahead of the earlier reviewed `76dd472f1c38`
candidate. Its source-only delta adds `StageBGVar` animation-element queries and
`ExplodVar(animloopcount)`, corrects debug-FPS reporting, and includes rendering,
sound, afterimage/rollback-state, camera, and trigger refactoring work.

Artifact and archive validation passed, and a dry three-way classification found
22 engine updates, 118 no-ops, four unchanged-upstream local data overrides, and
one both-changed `external/script/menu.lua` override that would be preserved. No
active configuration or obsolete file would be replaced.

Adoption is held because the `ExplodVar` refactor retains compiler support and
the opcode for `spriteplayerno` but omits that opcode from runtime dispatch. The
prior build handled it. Current project content does not use this query, but the
regression can break supported or later third-party content. The refactor also
removed the earlier explicit undefined-ID guard. Wait for an exact Nightly that
restores these semantics, then repeat artifact and delta review. No migration,
backup, registry, or live-engine write occurred.

## 2026-09-12 — IKEMEN GO 1.0 stable released

- Official stable tag: `v1.0.0`
- Official release commit: `81c6da7`
- Release channel: stable; IKEMEN GO 1.0 is no longer in its release-candidate phase
- Official release: `https://github.com/ikemen-engine/Ikemen-GO/releases/tag/v1.0.0`

IKEMaker now treats 1.0 as the current stable documentation and compatibility
target. The production runtime was migrated using the verified official
Windows archive (SHA-256
`9338eaeb68599ceb13b0867819a091ea3f92eba58077e800b4540b7a1f9c3731`).
The installed executable SHA-256 is
`c869a7fb0112257a6a581fa2d66ca76a9860b5b6ec500be38f8e480f6bf79cf7`.

Fifteen clean upstream files were replaced and four customized files were
three-way merged: `data/fight.def`, `data/training.zss`,
`data/ikemen1/system.def`, and `external/script/menu.lua`. The merge preserved
the SF6 common-effects route, expanded training systems, pause/menu additions,
netplay safety, and motif adjustments. Customized `data/select.def` and
`stages/stage0.def` remained untouched. The nineteen overwritten originals are
backed up under
`_development/workspace/tmp/stable-20260912/pre-update-overwritten-files`.

A Ryu mirror-match startup smoke test remained active for ten seconds without
an immediate engine or match-load failure. Older entries below remain
historical records. Production stays on 1.0 stable while 1.1 nightly is
monitored and tested only in isolated copies.

## 2026-09-08 — IKEMEN GO 1.0 Update 5

- Official 1.0 update: 5
- Official release commit: `ba51619`
- Previous installed package: Windows Update 4
- Upgrade method: verified three-way package comparison
- Update 4 archive SHA-256:
  `770adec8786a75103749ec4c0403f93a69917e1a9579fd89295e5d8e79aad055`
- Update 5 archive SHA-256:
  `1f02dd94f91b08b2d673581427b25fd43f9b771e39e8f3761ca41dbefbe844ce`
- Installed `Ikemen_GO.exe` SHA-256:
  `0a742cf5bdd2b64556dda44cf3bff02aa23093b44cd6bce000c0f3ba413f0225`

The 13 files changed by the official Update 5 Windows package all matched their
clean Update 4 versions before replacement. No locally customized file overlapped
the release changes. Only those 13 files were updated. All installed copies
were hash-verified against the official Update 5 archive after installation.

The replaced Update 4 files are preserved in the project's dated development
backup from 2026-09-08.

Relevant Update 5 fixes include rollback victory-screen hangs, collision-overlap
Z-axis checks, transparent RGBA normalization, common-FX reload caching, stage
video pause behavior, select-screen record names, BG window signs, replay file
handling, and synchronized AI test inputs.
## 2026-09-25 — Exact retained Nightly 76dd472 adopted

- Exact commit: `76dd472f1c3876d64f52232e514bfaef9ada6aad`
- Verified retained archive SHA-256:
  `5ec5a9d1923bf84e7b7e0e44e949af2cbc1a78a345b4bc912106becae428fa75`
- Installed executable SHA-256:
  `acdc0254f6977f80a2a1e510985b9f02a66062166cbda504347261f9b1307409`
- Stable 1.0 backup executable SHA-256:
  `c869a7fb0112257a6a581fa2d66ca76a9860b5b6ec500be38f8e480f6bf79cf7`
- Migration journal:
  `<configured backup root>\.migration-state\76dd472f1c38-1790339149758.json`

IKEMaker 0.77.1 installed the recovered, previously reviewed exact artifact
through its retained-build workflow. The completed journal records 21 writes,
zero removals, 85 protected archive entries skipped, and five preserved local
overrides: `data/fight.def`, `data/ikemen1/system.def`, `data/select.def`,
`data/training.zss`, and `external/script/menu.lua`. SF6, DS vs. SF, DS4, and
HDBZ now pin the resulting exact custom variant; the universal metadata remains
on stable 1.0. Future automatic upgrades are not authorized.

Backup and installed hashes were independently rechecked. A bounded menu/demo/
KFM stage smoke test passed after restoring seven pre-existing runtime shadow
dependencies to `chars/template/shadows`: `config.zss`, `shadows.air`,
`shadows.def`, `shadows.sff`, `shadows.zss`, `stage0_shadow.def`, and
`stage0_shadow.zss`. These seven files are runtime content and must remain in
playable builds; notes and image references may remain under the development
asset tree. Full character mechanics, online play, and live rollback remain to
be tested and are not inferred from this smoke test.
