# SFF Build and Numbering Standard for Coders

This reference is for the people reviewing manifests and building SFF files.
Use **SFF: Open Artist Handoff Guide** when preparing instructions for artists.

Use the Command Palette (`Ctrl+Shift+P`) and type `SFF:` to access the build,
layer, redundancy-review, and documentation commands.

## Project alias registry

Run **SFF: Open or Create Project Alias Registry** to create
`.ikemen-sff-aliases.json` at the project root. Add aliases under the canonical
name in any supported section: `contexts`, `strengths`, `attackTypes`,
`directions`, `categories`, `phases`, `sequences`, or `families`.

For example, `sequences: { "st LP": ["quick jab"] }` makes `quick jab` resolve
to `st LP`. Project aliases work for normals, command normals, categories,
phases, and character-specific animation names as well as Special/Hyper
families. They extend the bundled vocabulary without editing extension code.

The closest registry found by walking upward from the selected manifest is
used. This permits a character folder to override a game-level registry.

## Source naming

Use `Character_Animation_OptionalPhase_000.png`. Normal tokens are `st`, `cr`,
and `j`; strengths are `L`, `M`, and `H`; attack types are `P` and `K`.
Command normals use direction first (`fHK`, `bHP`, `dfHK`). Legacy `HKf` is an
accepted alias, but `f` always means forward, never far.

Keep coherent sequences under one stem. Use descriptive phases such as
`Startup`, `Launch`, `Rise`, `Travel`, `Active`, `Loop`, `Turn`, `Descent`,
`Landing`, `Recovery`, `Grab`, and `Retreat`. Preserve unused work under
`Unused`; do not delete it.

## Classification precedence

1. Approved character manifest or explicit decision
2. Explicit category folder
3. Canonical filename grammar
4. Alias and exception registry
5. Sequence stem, phases, and frame order
6. Manual review—never silently guess

## Special and Hyper families

### Temporary batch-rip sequence labels

When emulator-assisted ripping establishes that a sequence is a Special or
Hyper but cannot establish its reusable functional family, use
`Character_SpecialNN_FFF.png` or `Character_HyperNN_FFF.png`. `NN` is a stable,
minimum-two-digit source-sequence number and `FFF` is the normal three-digit
frame number. Examples are `Ryu_Special00_000.png` and
`Ryu_Hyper01_003.png`.

These are temporary classification labels, not family names. They must not
silently claim a permanent Special/Hyper group or become gameplay-referenced
AIR actions. Once reviewed, rename the complete sequence transactionally to its
functional family while retaining its source identity and frame order. If the
broad class is also unknown, leave the sequence unresolved rather than calling
it a Special or Hyper.

Aliases normalize to the canonical family and do not create new allocations.

| Canonical family | Common aliases |
|---|---|
| Fireball | Hadouken |
| DP | Shoryu, Shoryuken, ShinShoryu, ShinSho |
| AirborneAdvance | Tatsu, Tiger Knee, Blanka Ball, Psycho Crusher |
| GroundedAdvance | Donkey Kick, Joudan |
| StationaryBurst | Hashogeki, Hasho |
| ResourceInstall | Resource Charge, Denjin Charge, Stock Charge, Install |
| DiveAttack | Dive Kick, Dive Punch |
| CommandGrab | Special Throw, Command Throw, 360 |
| BodyShift | Physical Shift, Special Movement |
| Teleport | Warp, Vanish Teleport |
| FloatAerialControl | Float, Hover, Yoga Float |
| CommandDash | Special Dash, Rekka Dash |
| CounterAttack | Counter High, Mid, Low |
| SustainedAttack | Hundred Hand Slap, Lightning Legs, Electricity, Lariat |

Specials use their established `1000-2399` functional blocks. Equivalent air
versions use `ground +50`, and distinct sequences normally advance by ten.

Hyper sprite and animation families mirror Specials at `special +2000`:

| Groups | Hyper family |
|---:|---|
| 3000-3099 | Fireball |
| 3100-3199 | DP / Rising Attack |
| 3200-3299 | Airborne Advance |
| 3300-3399 | Grounded Advance |
| 3400-3499 | Stationary Burst |
| 3500-3599 | Resource / Install |
| 3600-3699 | Dive Attack |
| 3700-3799 | Command Grab |
| 3800-3899 | Body Shift |
| 3900-3999 | Teleport |
| 4000-4099 | Float / Aerial Control |
| 4100-4199 | Command Dash |
| 4200-4299 | Counter Attack |
| 4300-4399 | Sustained Attack |
| 4400-4999 | Unique/cinematic and permanent reviewed overflow |

Each 100-group Hyper block uses the same layout as its Special counterpart:
grounded sequence slots at `0,10,20,30,40` and airborne slots at `+50`.
Ryu's Shin Shoryuken aliases resolve to the grounded DP-family Hyper at `3100`;
for example, `ShinSho_013` maps to `3100,13`.

The `3000-4999` rule applies to SFF groups and AIR action families. Hyper
StateDefs remain restricted to the separate gameplay-state range `3000-3999`.

## Multipart example

Honda's rising butt slam/Sumo Smash needs unique phase names:

```text
Specials/DP/Honda_ButtSlam_Rise_000.png
Specials/DiveAttack/Honda_ButtSlam_Descent_000.png
```

The move-name aliases identify the overall move. `Rise` and `Descent` prevent
two functionally different animation sequences from being merged.

## Palette banks, child variants, and inheritance

The shared indexed-palette layout reserves five form groups per visual domain:

| Groups | Domain |
|---:|---|
| 1-5 | Main character: base plus four transformation forms |
| 11-15 | Layer 1 |
| 21-25 | Layer 2 |
| 31-35 | Layer 3 |
| 41-45 | Layer 4 |
| 51-55 | Character projectiles and FX |

Palette `1,1` is the P1 default and `1,2` is the P2 default. A base color may
have any number of named child variants. The extension records each child's
parent explicitly; folder depth and numbering do not impose a child limit.

Every palette coordinate requested by runtime `RemapPal` code must exist. The
artist-facing source library keeps the complete authored set in `Base`. Each
form folder contains only the numbered palettes whose colors actually change
in that form. If color `001` is unchanged in Form 2, Form 2 does not need a
duplicate indexed PNG; the extension records a reviewed linked alias instead.
Duplicate source images remain importable for legacy Fighter Factory workflows,
but they are not the recommended new organization.

The built SFF does not need to store those identical colors twice. When a
transformation does not change a color, the destination becomes a linked alias.
For example, `2,1 -> 1,1` keeps `2,1` valid while sharing the colors owned by
`1,1`. A changed form image owns independent color data. A missing form image is
unavailable or unresolved and must not be silently inferred as a duplicate.
The same palette number is retained across applicable character, layer, and
projectile/FX banks.

Missing-palette debug messages are not accepted by the new IKEMEN workflow.
Every coordinate that gameplay code can request must therefore be supplied by
independent colors or a valid link. Older HDBZ form folders that omit matching
numbers document a legacy workflow that tolerated those messages; they are not
the new completeness standard.

The SFF palette viewer stages source palettes, child variants, individual
aliases, or all four missing transformation aliases. Builds use duplicate
detection with `pal.discardduplicates = 0`, preserving every declared palette
coordinate while allowing SprMaker2 to link identical color data. A form that
truly cannot exist is recorded as unavailable in gameplay/profile metadata;
code must not request an unavailable destination.

## Transformation sprite banks and RemapSprite

The shared convention supports four full-character transformation slots,
matching palette form groups 2-5. Transformation sprites remain in the same
SFF as the base character. Form storage changes the sprite **item**, while
layer storage changes the sprite **group**:

| Slot | Sprite item rule |
|---:|---|
| Base | `0-9999` |
| Form 1 | base item `+10000` |
| Form 2 | base item `+20000` |
| Form 3 | base item `+30000` |
| Form 4 | base item `+40000` |

For example, base `200,3`, Form 2 body `200,20003`, and Form 2 Layer 1
`10200,20003` can coexist. Items `50000-65535` remain reserved pending an
explicit project decision.

Only sprites that visually change belong in a form bank. Unchanged sprites are
omitted from the `RemapPreset`; unlike `RemapPal`, they need no duplicate or
linked destination. Each form is explicitly assigned a slot, while its CNS
`RemapPreset` may use a readable semantic name such as `SSB` or `SSBE`.
Semantic names never imply a slot automatically. Applying a complete form uses
`reset = 1` before its preset so mappings from the previous form cannot remain.

`RemapSprite` changes rendered sprite identity only. A transformation requiring
different timing, frame count, or collision data needs separate AIR actions and
reviewed gameplay code rather than a sprite preset alone.

## Manifest and build workflow

1. Create or update a CSV manifest. Prefer explicit `FunctionalFamily`,
   `Category`, and phase fields alongside the source path, base group, index,
   approval status, axis, and source hash.
2. Run **SFF: Generate SprMaker2 Build Files** for a validated dry run.
3. Resolve every warning; do not approve guessed classifications.
4. Use **SFF: Import Folder as Layer** for exact `Layer1`-`Layer4` intake.
5. Review exact redundant layers with the dedicated review commands.
6. Run **SFF: Build Approved Manifest** only after all rows are approved.

Layer-bank storage and runtime draw order are separate. Each imported row may
record `LayerRole` (`Cosmetic`, `PartFront`, `PartBack`, or `Review`) and a
`SuggestedSyncLayer` (`1`, `-1`, or blank). The suggestion is not runtime code.
Throws and any part ordered relative to P2 require coder review before an
Explod is authored with `syncid`, `synclayer`, and `syncparams`.

The validator enforces group/index limits, layer-bank math, optional Form 1-4
item-offset math, unique identities,
approval status, recognized Hyper families, ten-group Hyper slots, `+50`
airborne organization, and the `3000-4999` Hyper animation boundary. Source sprites are
not cropped or destructively renamed by the build workflow.
