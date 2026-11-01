# DebugMode round-reset argument correction

Checked 2026-10-24 against the exact official IKEMEN GO source revisions cataloged by IKEMaker.

## Finding

The accepted `DebugMode` argument is `roundreset`, not `roundrestarted`. This is not a Stable-versus-Nightly difference.

`DebugMode` remains a trigger. Its values expose engine debug/display state and are development aids, not reliable gameplay conditions.

## Stable 1.0.0 evidence

- IKEMaker build ID: `ikemen-go-1.0.0-windows-x64`
- Commit: `81c6da71d689625e20db79586815b695da00dd6d`
- Compiler source: https://github.com/ikemen-engine/Ikemen-GO/blob/81c6da71d689625e20db79586815b695da00dd6d/src/compiler.go#L4403-L4423
  - The `debugmode` argument switch accepts `roundreset` and emits `OC_ex2_debugmode_roundreset`.
  - Any other spelling reaches `Invalid Debug trigger argument`.
- Bytecode source: https://github.com/ikemen-engine/Ikemen-GO/blob/81c6da71d689625e20db79586815b695da00dd6d/src/bytecode.go#L3728-L3739
  - `OC_ex2_debugmode_roundreset` evaluates `sys.roundResetFlg`.

## Reviewed Nightly evidence

- IKEMaker build ID: `ikemen-go-nightly-ee4791bcd5e2-windows-x64`
- Commit: `ee4791bcd5e2f4bcb16ef9d584e001fb4a7eedfc`
- Compiler source: https://github.com/ikemen-engine/Ikemen-GO/blob/ee4791bcd5e2f4bcb16ef9d584e001fb4a7eedfc/src/compiler.go#L4682-L4702
  - The `debugmode` argument switch accepts `roundreset` and emits `OC_ex2_debugmode_roundreset`.
  - Any other spelling reaches `Invalid Debug trigger argument`.
- Bytecode source: https://github.com/ikemen-engine/Ikemen-GO/blob/ee4791bcd5e2f4bcb16ef9d584e001fb4a7eedfc/src/bytecode.go#L4126-L4137
  - `OC_ex2_debugmode_roundreset` evaluates `sys.roundResetFlg`.

## Upstream documentation mismatch

At the time of verification, the official wiki and merged documentation listed `roundrestarted`. IKEMaker corrects its bundled copies locally from the engine source evidence above. No upstream website or repository was edited.

- https://github.com/ikemen-engine/Ikemen-GO/wiki/Triggers-(new)#debugmode
- https://potsmugen.github.io/ikemen-merged-docs/triggers.html#debugmode-new

## IKEMaker surfaces affected

- `data/triggers.json`: trigger metadata used by hover, authoring browser, and trigger insertion review.
- `data/offline-docs/reference/wiki-source/Triggers-(new).md`: bundled source snapshot.
- `data/offline-docs/reference/wiki/Triggers-(new).html`: bundled rendered wiki snapshot.
- `data/offline-docs/reference/merged/triggers.html`: bundled merged-document snapshot.

No dedicated DebugMode argument-value completion or validator existed, so none was invented for this correction.
