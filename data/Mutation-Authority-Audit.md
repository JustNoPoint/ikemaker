# Mutation Authority Audit

IKEMEN ZSS Tools separates file output into four kinds. This is an internal
maintenance contract, not a requirement imposed on game projects.

## Authoritative project mutation

These writes must use `mutation_safety.js`: character and asset creation,
visual stage/screenpack application, SFF archive headers and embedded palettes,
SprMaker2 source manifests, SND profiles and manifests, CommonFX definitions,
palette metadata, AIR push-box/runtime-geometry plans, and project review data.

They receive staged replacement, optional hidden backups, mutation history,
rollback where multiple files are involved, and stale-file checks where a UI
or review interaction can leave a loaded version open.

## External builder output

SprMaker2 and SndMaker own the binary they generate. The extension does not
pretend it can atomically control another executable. Before SndMaker runs, an
external-mutation guard protects the previous output. Failed builds restore the
previous archive; successful builds are recorded in the Recovery Center.
SprMaker2 build packages and logs are generated workspace output and never
silently replace source manifests.

## Export output

User-requested PNG, ACT, WAV, aligned-image, channel-split, audit-report, and
project-export files are ordinary exports. They do not alter the loaded
authoritative archive. Save dialogs or explicitly selected output directories
define overwrite intent.

## Temporary editor output

PNG/WAV copies opened in Photoshop, Audacity, or another external editor live
in temporary folders. They are disposable and never claim source authority.

## Direct-write allowlist

Raw Node file writes are confined to:

- `mutation_safety.js` — the shared transaction implementation itself.
- `sff_commands.js` — SprMaker2 packages, reports, logs, and reversible source
  moves paired with a transactional manifest save.
- `sff_viewer.js` — explicit exports and temporary editor/FFmpeg inputs.
- `snd_viewer.js` — explicit WAV exports and temporary editor inputs.

Adding raw writes to another source module must fail the direct-write audit and
requires an authority review before the allowlist can change.
