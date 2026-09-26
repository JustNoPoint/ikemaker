# Native command timing and advanced input recognition

IKEMEN 1.0 exposes separate values:

- `time`: total command window;
- `steptime`: maximum lifetime between completed steps (`-1` inherits `time`);
- `buffer.time`: lifetime after the completed command.

When QCF begins after holding down, or DP begins after walking forward, use two
same-named native definitions: a normal press-start route and a shorter
release-start route (`~D` or `~F`). No maps are required.

Maps are justified when optional ordered directions must refresh the current
step timer without becoming required. HCF/HCB optional diagonals and flexible
360/720 rotations are the current shared examples. These advanced recognizers
must remain deterministic ZSS and are presented separately from recommended
native presets.

Project defaults remain separate: loading an extension preset never changes a
game's input policy.
