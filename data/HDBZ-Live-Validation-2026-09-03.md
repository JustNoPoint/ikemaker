# IKEMEN ZSS Tools 0.47.0 — HDBZ Live Validation

## Safety boundary

- Authorized test copy: `<disposable HDBZ test copy>`
- No other HDBZ installation was modified.
- `data/select.def` finished with SHA-256 `4824AB6BE245E42B124AA8A59A3122CB266E81CE6D2659F0CACACE7CC6B913C7`.
- `data/system.def` finished with SHA-256 `4DC1DCD30ECC2A355418CDE9BF8029F9A4E8D497D8E080376FACB40DC7E73858`.

## Automated compatibility coverage

- 7,139 files inspected.
- Roster: 31 cells, 30 rendered character portraits, and one special/random cell.
- SFF: 127/127 parsed, 91,209 sprites, including 47 legacy SFF v1.0.1 archives and representative PCX renders.
- AIR: 32/32 parsed, 17,614 actions and 137,741 elements.
- SND: 37/37 parsed and 8,951 sounds. Existing duplicate authored IDs are reported without being rewritten.
- Stages and screenpacks: all detected DEF files parsed without parser errors.
- Final structural result: PASS.

The complete machine-readable findings are in `HDBZ-Full-Game-Compatibility-2026-09-03.json`; the concise scan is in the matching Markdown file.

## Hands-on workflows verified

- Roster Manager resolved the renamed `HDBZWin.exe` game root, loaded the real 3×9 motif grid, and rendered HDBZ portraits.
- A roster reorder was performed in the copy and restored through VS Code undo; `select.def` returned exactly to its baseline hash.
- Modern Krillin SFF v2 and legacy Hercule SFF v1.0.1 both rendered.
- A legacy SFF axis edit was written, journaled, backed up, and restored through the Recovery Center. The restored archive parsed with the original axis.
- Krillin AIR located its parent character DEF from the nested `files` directory, rendered its SFF sprite and collision boxes, and opened beside source code.
- Krillin SND opened with 355 entries, groups, diagnostics, bridge guidance, and rebuild tools.
- Command & Movelist located Krillin's `command.mfg` and root `movelist.dat`; motions were organized ahead of 55 collapsed raw inputs and the editable timing model loaded.
- The 10th Anniversary stage loaded 66 backgrounds and rendered its SFF after correcting generated-client syntax.
- The HDBZ screenpack loaded its elements and reported genuinely missing sprite references in the existing motif instead of silently hiding them.
- Production Workflow located 14 assigned Krillin files and detected SFF/AIR milestones without falsely marking human review as passed.
- `HDBZWin.exe` launched from the copy and remained responsive. Launch touched only the copy's runtime configuration; authored `select.def` and `system.def` remained unchanged.

## Extension defects corrected

- Nearest complete game layout now wins over a parent developer installation when the executable has a custom name.
- Legacy SFF v1.0.1 PCX sprites, palettes, shared images, and linked data are supported by the preview path.
- Legacy SFF axis/group writes use the correct header offsets; unsupported palette-assignment writes are rejected safely.
- AIR character-file inference now walks from nested asset folders to the owning DEF and validates the DEF's `anim` reference.
- Negative screenpack/stage sprite sentinels no longer become false missing-sprite errors.
- Stage and screenpack generated JavaScript now compiles; regressions are covered by tests.
- Production Workflow now reports the actual SFF header version instead of `v?`.

## Deliberate limitations and authored findings

- Standalone `.act` files still use VS Code's binary-file view. Full palette inspection and editing is hosted in the SFF Palettes panel, where archive identity and safe write rules are available.
- HDBZ contains existing duplicate SND IDs, missing screenpack sprite references, and legacy command/ZSS warnings. These are content findings, not parser failures, and this validation did not rewrite them.
- Recovery Center covers the extension's direct archive writes. Roster movement uses VS Code's workspace edit/undo path and therefore does not create a Recovery Center entry.

## Regression result

- All 66 automated test files pass after the live fixes.
