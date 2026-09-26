# IKEMEN Tools Authoring Bridge

This is a neutral, reusable, opt-in ZSS module. It does not depend on a JNP prefix, Lua, or modified IKEMEN default files.

The installer copies the module into the selected character and adds it to that character's `[Files]` list. Normal play is unchanged because every feature defaults off and runtime behavior is restricted to training mode.

## Preview maps

- `IkTools_Preview_Enabled`: set to `1` to allow preview placement.
- `IkTools_Preview_PosX`, `IkTools_Preview_PosY`: requested local position.
- `IkTools_Preview_Facing`: `-1`, `0` unchanged, or `1`.
- `IkTools_Preview_UseAnim`: set to `1` to request an animation.
- `IkTools_Preview_Anim`: requested AIR action.
- `IkTools_Preview_Serial`: increment to apply the request once.

## Animation audit maps

- `IkTools_Audit_Enabled`: set to `1` to enable audit requests.
- `IkTools_Audit_Serial`: increment to run the audit once.
- `IkTools_Audit_Show`: set to `1` to display the missing-action list.
- `IkTools_Audit_MissingCount`: result count.
- `IkTools_Audit_Complete`: `1` when the baseline is complete.

The canonical standard list is `data/animation-standards.json`. VS Code uses that list for AIR warnings. The bridge mirrors its conservative IKEMEN 1.0 baseline so the same character can be checked in game.

The JNP feet, middle, and head get-hit reference sprites are project requirements, not universal engine requirements. Their exact sprite mappings belong in `.ikemen-character-requirements.json` as `axisCopies` entries with `role` set to `feet`, `middle`, or `head`. The extension deliberately refuses to invent their group/index assignments.
