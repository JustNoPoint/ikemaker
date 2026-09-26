# Helper Lab — Creation Safety Wave

Version 0.68.0 makes basic projectile-helper creation useful without hiding the complete helper system.

## Basic creation

- Fireball and Super Fireball recipes expose AIR action, spawn position, velocity, damage, chip, hit pause, hit count, and lifetime.
- Basic mode is the default. Advanced mode retains maps, palette ownership, collision ownership, inherited channels, pause behavior, and cleanup controls.
- Recipe numbers are editable starting values. They are not project conventions or balancing authority.
- Optional project or character projectile defaults can be stored under the metadata registry's `attacks.projectileDefaults` selection.

## Preflight

- The selected AIR action must exist.
- Action length and duration are reported.
- Clsn1 is required for a hittable projectile; missing Clsn2 is a warning because an unhittable projectile can be intentional.
- Every AIR sprite reference is checked against the assigned SFF.
- AIR and SFF failures link directly to their authoring workspaces.

## IDs and insertion

- The unused-ID suggestion avoids detected Helper IDs, starting StateDefs, and declared StateDefs. It does not replace a project's numbering policy.
- Computed IDs remain explicitly uncertain instead of being guessed.
- Spawn code and the owned StateDef can be inserted into separate connected files as one undoable workspace edit (your Auto Save setting still applies).
- Existing insert-at-cursor behavior remains available.
- Exact PlayerID capture no longer continually overwrites a valid prior capture. The helper confirms its own runtime ID to its parent on its first tick.

## Layout

- The generated-code rail moves below the main workspace on narrower displays rather than disappearing.
- Selecting a helper-tree node displays its StateDef status, lifetime/cleanup status, review messages, and an exact source link.
- Map & Data Flow reports detected reads separately from writes.
