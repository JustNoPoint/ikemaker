# IKEMaker 0.75.7 beta-readiness audit

## Automated sign-off

- 154 automated test files pass.
- 161 desktop JavaScript files pass syntax validation.
- Every contributed command is registered; every menu and IKEMaker sidebar
  entry points to a contributed command.
- Major visual workspaces share the viewer group and common Related Work / game
  launch conventions where appropriate.
- Help & Learning links only to declared commands and bundled offline files.
- Public extension content contains no private-project identifier.
- Direct SFF/SND routing preserves the visual custom editor and closes only the
  matching redundant text tab. AIR remains text plus visual.

## Real-content coverage

The disposable combined HDBZ + SF6 copy was scanned read-only:

- 16,484 files inspected
- roster: 21 cells, 20 ready portraits, 1 special cell, 0 portrait problems
- SFF: 198/198 parsed, 107,171 sprites, 0 parser errors
- AIR: 53/53 parsed, 19,778 actions, 154,163 elements, 0 parser errors
- SND: 51/51 parsed, 9,065 sounds, 0 parser errors
- stages: 59/59 parsed, 0 parser errors
- screenpacks: 3/3 parsed, 0 parser errors
- character DEF sets: 34, with 0 missing assigned files

Content warnings such as duplicate legacy SND group/index entries remain visible
as game findings; they are not classified as IKEMaker failures.

Ryu's current DEF resolves every assigned asset. Its SFF contains 612 sprites,
three palettes, and no duplicate sprite IDs. Its AIR contains 490 nonempty actions.

## Human verification still required

See `IKEMaker-0.75.7-Manual-Verification-Remaining.txt`. These items need visual
judgment, external applications, audio hardware, destructive test-copy writes,
or a live IKEMEN process and cannot be honestly certified by static automation.
