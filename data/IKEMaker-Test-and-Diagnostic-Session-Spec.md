# IKEMaker Test and Diagnostic Sessions

## Ownership boundary

IKEMaker provides two related but distinct launch types.

### Diagnostic Session

Portable, motif-independent access to IKEMEN's native debugging operations:

- collision, player-debug, wireframe, lifebar, and VSync displays;
- speed, pause, and frame stepping;
- player/helper selection and AI/player toggles;
- force standing, life/power operations, reset/reload, timer, console,
  save/load state, and full restore.

The JNP screenpack retains its own local Developer Options mirror. IKEMaker
does not delete or replace it. The Diagnostic Session exists for creators who
do not use JNP motifs.

### Test Session

Loads an authored checklist, prepares the requested training setup, displays
steps and criteria in game, records detected evidence, and returns the session
to IKEMaker for human review and signoff.

## Player-facing exclusion

Ordinary Training options are not moved into either IKEMaker session. Forced
hit classification is the explicit boundary example: Authored, Normal Hit,
Counter Hit, and Punish Counter belong only to the player-facing Hit & Counter
Settings menu. A test may instruct the player to choose a value, but IKEMaker
does not own, duplicate, or override it.

## Test applicability

Every test declares one or more explicit scopes:

- universal IKEMEN;
- shared JNP template;
- game profile (a bundled public profile or user-defined project profile);
- character family;
- character;
- move or system;
- bug regression;
- platform or build.

Production order is not inheritance. Tests do not flow automatically between
game profiles. A test becomes shared only through reviewed, explicit promotion
or import; isolated projects never receive a live cross-project dependency.

## Runtime packaging

The runtime bridge is extension-owned, injected only for the selected launch,
and removed or excluded by Finish Product. It must never enter `select.def`,
become a character dependency, or ship in a public release. Player-facing
online Training remains governed by synchronized native ZSS/menu-map rules;
the development diagnostic suite is offline-only.

## Implemented workflow

Open **Project Files → Open Test & Diagnostic Suite** in the IKEMEN sidebar.
Choose the explicit game profile, review applicable suites, and launch either a
Test Session or Diagnostic Session. The current character and configured
training stage are used. The test registry is available offline and may be
extended through `.ikemen/tests/*.json`.

The in-game overlay uses:

- F8: show or hide the overlay;
- F9: advance to the next test or diagnostic action;
- F10: pass the selected test, or execute the selected diagnostic action;
- F11: fail the selected test;
- F12: save the result record.

Known character logger masks are displayed as supporting evidence. They do not
replace human review. Results are written under `save/logs` and shown on the
workspace's Results & Evidence tab.

## Cleanup guarantees

The one-use bootstrap is `external/mods/IKEMaker_test_session.lua`. It removes
itself after IKEMEN loads the selected session. Finish Project also excludes
that exact path, `.ikemen/tests/**`, and `.ikemen/test-sessions/**`, so neither
development tests nor their registries can enter a public copy accidentally.
