# Ryu Baseline v1 — reusable lesson packet

Status: Draft awaiting asset cleanup and explicit JNP sign-off  
Reference character: Ryu  
Reference move: standing light punch (`normal.slp`, State/AIR 200)

## Proven rule

A foundational attack is complete only when its assets, AIR timing and collision, character-owned constants, state lifetime, HitDef metadata, shared-system integration, sounds, player-facing data, contact-result matrix, logger behavior, and failure review agree. A successful normal hit alone is not sufficient evidence.

Native IKEMEN contact results remain authoritative where they exist. Character-specific timing and move values remain character-owned. Shared code owns reusable mechanisms, not Ryu or SF6 policy.

## SF6-specific interpretation and exceptions

- SF6 research is the source authority, with intentional project deviations recorded instead of silently becoming universal rules.
- The sLP logger-completion matrix covers normal hit, guard, Counter Hit, Punish Counter, air hit, corner interaction, armor absorption, and Armor Break.
- Forced-low-region testing is not a logger-completion requirement. Region validation belongs to its own developer controls because forcing a specific victim region is not a natural sLP scenario.
- Player-facing attack, damage, combo/scaling, life/red-life, Super meter, Drive meter, and score displays are presentation features and do not depend on debug text.
- Engine-specific corner-push limitations and any selected workaround must remain documented separately from push-box behavior and character `pushfactor`.

## Repeatable test procedure

1. Confirm the character enters training with the intended default palette and can move, guard, and receive hits.
2. Review every sLP sprite and AIR element for visibility, axes, duration, Clsn1, and Clsn2. Verify that the authored active elements match the state timing.
3. Review the move constants and their ownership: damage, timing, velocities, pause, sparks, sounds, meter, score, region, and SF6 metadata.
4. Trace command entry, StateDef lifetime, active publication, HitDef creation, recovery, exit, interruption, and metadata cleanup.
5. Verify swing, hit, guard, character-FX, and voice-profile routing exactly once per intended event.
6. Perform the eight-result contact matrix: normal, guard, Counter Hit, Punish Counter, air, corner, armor absorption, and Armor Break.
7. Verify P1 and P2 player-facing damage, combo/scaling, life/red-life, Super, Drive, and score information.
8. Export or retain readable logger evidence and turn every unexplained failure into a repair, a ticketed deferral, or a confirmed engine limitation.
9. Obtain explicit project-owner sign-off before another character inherits the frozen baseline.

## Evidence recorded

- `Ryu.def` resolves `Ryu_Development.sff`, `Anim.air`, `Sound.snd`, `Constants.cns`, and all assigned shared/SF6 state files.
- Automated audit: SFF v2.1, 613 sprites, 3 palettes, no duplicate sprite IDs; AIR contains 499 actions and no empty actions.
- VS Code AIR preview derives palette 1,1 from the DEF.
- VS Code sLP preview shows its contact marker on active element 3 and hides it on startup element 1 and recovery element 5.
- JustNoPoint confirmed the live default palette, the complete eight-result sLP matrix, and both-player presentation data on 2026-09-04.
- All 83 extension regression-test files pass with extension 0.56.2.

## Known limitations and pending work

- Some rebuilt SFF/AIR sequences still contain disappearing frames and require visual cleanup before freeze.
- Feet, middle, and head axis-reference coverage must be confirmed or any missing reference must be repaired/ticketed.
- cLP, sLK, and cLK may remain incomplete development scope; they do not become silently complete through this sLP sign-off and must remain visible as later work.
- Visual/game-feel judgment and project-owner approval cannot be replaced by automated detection.

## Owner sign-off

Pending. Sign-off should name `Ryu Baseline v1`, acknowledge the recorded limitations or deferred tickets, and authorize the hardened workflow—not Ryu-specific gameplay values—to pass to Demitri.
