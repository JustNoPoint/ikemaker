# Lua, screenpacks, and online safety

Lua is an IKEMEN front-end and presentation tool. It is appropriate for:

- screenpack and motif modules;
- menus, option screens, selection flow, and trials lists;
- loading profiles or files before a match;
- presentation, layout, and local editor/preview helpers;
- configuration that is resolved before rollback simulation begins.

Lua is not rollback-tracked gameplay state. Do not make Lua own match-time
inputs, movement, collisions, damage, meter, state changes, attack results, or
other behavior that must reproduce identically during online rollback.

Synchronized Lua may implement a pre-match online frontend and call IKEMEN's
native match-launch interfaces. It may propose profile values, collect choices
inside the synchronized netplay menu, and display a Match Ready manifest before
launch. Both peers must confirm the same complete loadouts, stage, shared rules,
content compatibility, and manifest hash.

That permission ends at launch. Lua may not write gameplay maps, carry local
profile state into one peer's simulation, run match-time gameplay logic, or
become rollback authority. A gameplay option without a proven native
launch/configuration route must remain unavailable online.

For online-capable features, prefer native IKEMEN fields, maps, triggers,
controllers, CMD definitions, and deterministic ZSS. A synchronized Lua menu
may choose an agreed option before the match; the selected result must then be
represented by a native launch field or synchronized native value. A
pause/options screen used during online play
must pause and apply agreed values for both players rather than changing one
client locally.

Keep project modules outside IKEMEN's default Lua files. Use motif `module`
hooks or project-owned modules so engine updates, Android packaging, Linux, and
macOS remain easier to maintain.
