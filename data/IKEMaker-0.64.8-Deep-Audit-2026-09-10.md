# IKEMaker 0.64.8 Deep Audit — 2026-09-10

## Outcome

The installed desktop package and current source passed the repeatable audit.
One discoverability defect was found and corrected: **Open Launcher Settings**
and **Open Extension Settings** were sidebar-only registrations rather than
formal contributed commands. They now appear as normal searchable VS Code
commands, work in desktop and browser hosts, and are protected by an
information-architecture regression test.

## Verified automatically

- Installed extension: `justnopoint.ikemen-zss-tools@0.64.8`.
- All 118 automated test files pass after the correction.
- All 130 JavaScript source files pass syntax checking.
- Package command audit: no duplicate command IDs and no contributed command
  absent from source.
- Sidebar audit: every visible leaf action resolves to a contributed command;
  high-use actions may intentionally appear in more than one logical section.
- All 20 major visual workspaces use the shared Related Work and F5/F6/F7
  launch-control bridge plus the common accessibility foundation.
- VSIX/source parity was confirmed for the manifest, IKEMEN Tools layout,
  project-context UI, and current feature log before the final correction.
- The VSIX and installed extension contain zero known private-project-name text
  matches. Local project metadata outside the extension package is not bundled.
- Recent VS Code extension-host logs show successful activation and no recorded
  extension-host errors.

## Real-project structural verification

### Ryu / current SF6 work

- Project context resolves as `SF6 > Ryu` for the DEF and AIR.
- Shared SF6 code resolves as game-owned; shared common code resolves as
  Universal-owned.
- Character connection graph: 24 files, 23 DEF assignments, 17 cross-file
  function links, zero missing files.

### Goku / HDBZ copy

- Project context resolves as `HDBZ > GokuZ2`.
- Character connection graph: 31 files, 30 DEF assignments, zero missing files.

### Combined HDBZ + SF6 disposable copy

- 63,501 files inspected read-only.
- Roster: 33 entries, 21 populated cells, 46 stages, motif resolved, 20 ready
  portraits plus one intentional special cell, zero portrait problems.
- SFF: 198/198 parsed, 107,171 sprites, 229 representative PNG renders, zero
  archive errors.
- AIR: 53/53 parsed, 19,778 actions, 154,163 elements, zero parser errors.
- SND: 51/51 parsed, 9,065 sounds, zero archive errors.
- Stages: 59/59 parsed, zero parser errors.
- Screenpacks: 3/3 parsed, zero parser errors.
- Characters: 34 DEF sets, zero missing assigned files.

The scan retained content findings rather than misreporting them as extension
failures: 43 duplicate legacy sound IDs, 25 informational stage findings, 40
screenpack missing-sprite references, duplicate/empty command findings, and
ZSS opponent-validity warnings. Their correctness and desired cleanup are
project-owner decisions.

The nested `SF6-Test-Project` is a partial character/template fixture rather
than a complete runnable game root: it has no `data/select.def` or
`data/system.def`. Its 71 SFFs, 21 AIRs, and 14 SNDs still parsed without
archive errors. Launch and roster acceptance must therefore use the combined
game root or another complete SF6 runtime layout.

## Remaining authority boundary

Static and model tests cannot judge pixels, sound, controller behavior, live
IKEMEN runtime results, netplay, external applications, display scaling, or the
human clarity of a workflow. Destructive operations also require an explicitly
disposable copy. Those items are isolated in
`IKEMaker-Phase-1-Manual-Test-Checklist-2026-09-10.txt`.
