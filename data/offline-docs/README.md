# IKEMEN offline reference library

This directory is the extension's readable baseline when no network is
available. Open **IKEMaker: Open Help & Learning Center** for a task-oriented
screen guide, MUGEN migration path, compatibility explanation, and direct
links into these files. **IKEMEN: Offline Documentation Library** remains the
compact document-only index.

The extension can check the official IKEMEN wiki and IKEMEN 1.0 documentation
for changes. Updating this library is always a separate, user-requested action;
an update check never overwrites an offline copy or project source code.

## Included guidance

- [Lua and rollback boundaries](lua-and-online-safety.md)
- [Visual ZSS and Lua structure workspace](visual-code-structure.md)
- [Reviewed CNS to ZSS conversion](cns-to-zss-converter.md)
- [Native command timing and HDBZ handoff](native-command-timing.md)

## MUGEN creators

IKEMaker supports existing DEF, CNS, CMD, AIR, SFF, and SND source. The intended
migration path is incremental: keep a working MUGEN character, convert or add
one reviewed system at a time, test it in IKEMEN GO 1.0, and retain the original
until the result is proven. Creating a new character explicitly offers either a
MUGEN-compatible CNS scaffold or a native IKEMEN ZSS scaffold.

The Help & Learning Center links each major concept to the visual workspace that
uses it. Learning and Advanced presentation alter explanation density, not file
meaning or generated behavior.

Downloaded snapshots are stored in VS Code's extension storage and take
precedence over these bundled baseline files. The library viewer labels bundled
and downloaded material separately.

## Complete bundled reference

Use **Open All Offline Documentation** in Help to open the local HTML library.
It includes every captured IKEMEN wiki page, the full MUGEN 1.1 reference and
tutorials, and merged state-controller, trigger and redirection pages.
Page links and included images work offline; outside downloads/videos remain
online. Each page retains source attribution. See reference/manifest.json for
the capture date and exact inventory.
