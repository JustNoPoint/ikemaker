# IKEMEN 1.1 Watchlist

IKEMEN GO `v1.0.0` stable remains the retained recovery baseline. The current
project has approved a reviewed move to one exact, hash-pinned Nightly while
the 1.0 copy remains restorable. Later Nightlies remain separate candidates:
IKEMaker reports their changes and evidence gaps weekly, and the user chooses
Stay, Remind, or Review. No future upgrade is automatic. This document is not
a specification; findings remain monitor-only until their exact candidate is
explicitly approved and regression-tested.

## Evidence policy

- **Developer-stated** means an IKEMEN developer directly described the behavior or implementation work.
- **Community proposal** means someone suggested a possible API or use. It is not promised syntax.
- **Observed report** means a behavior was demonstrated or described but has not yet been resolved or documented as final.
- Before implementation, confirm final syntax and behavior against the IKEMEN 1.1 source, release notes, and official documentation.

## Runtime string support

Source context: developer/community discussion supplied by JustNoPoint on 2026-09-04.

### Developer-stated work

- Basic string support is being introduced.
- PotS gave examples including reading/comparing names and printing strings.
- Trigger evaluation now pushes actual string values internally instead of relying on the older MUGEN-style comparison mechanism. This is an important internal foundation even where the visible syntax remains modest.

### Explicitly not established yet

- String concatenation and formatting.
- Persistent string variables or maps such as proposed `strvar` or `strmap` forms.
- String arrays or iteration through map names.
- Redirecting to helpers by string name.
- Final bytecode representation, string-pool lifetime, limits, encoding, or serialization behavior.

Those items were community ideas or implementation discussion, not confirmed IKEMEN 1.1 interfaces. Do not add them to the extension's accepted grammar or teach them as available syntax until upstream settles them.

### Tooling preparation

- Keep the default parser, controller inserter, visual code editor, and offline documentation aligned with IKEMEN 1.0.
- Introduce future syntax behind an explicit engine-version grammar/profile rather than weakening 1.0 validation.
- Preserve string tokens and source text losslessly so the visual editor cannot damage quotes, escapes, or Unicode.
- When official behavior lands, test comparisons, printing, empty strings, escaping, case sensitivity, name triggers, error messages, rollback determinism, and any persistence or save-state behavior.
- Do not migrate existing numeric maps, registries, helper IDs, or online-safe protocols to strings merely because basic strings exist.

## Shader and 32-bit sprite alpha behavior

### Observed report

- A shader returning a low-alpha color for a 32-bit sprite reportedly rendered as though additive blending were involved.
- The same approach reportedly behaved as intended with an indexed sprite.
- No final cause or fix was present in the supplied discussion.

### Project policy

- Keep shader use light while the confirmed IKEMEN 1.1 shader rework is pending.
- Do not build a permanent project workaround around this report yet.
- Continue treating indexed sprites as the conservative path for palette-driven character assets.
- Once the 1.1 shader API stabilizes, test indexed and 32-bit sprites separately across normal alpha, additive/subtractive modes, character sprites, Explods, helpers, stages, palettes, and post-processing.

## Adoption gate

An item may move from this watchlist into production only after all of the following are available:

1. Final upstream syntax or API behavior.
2. Official documentation or source-level confirmation.
3. Parser and offline-documentation updates.
4. Small fixture tests in the extension.
5. Runtime verification, including rollback/online behavior when relevant.
6. A migration decision that leaves IKEMEN 1.0 projects understandable and maintainable.
