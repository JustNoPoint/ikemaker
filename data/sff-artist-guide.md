# SFF Sprite Handoff Guide for Artists

Artists name and organize sprites so their purpose is clear. Artists do not
choose SFF groups, edit manifests, run SprMaker2, or use build commands.

## Folders

Use `Movement`, `Normals`, `Command Normals`, `Throws`, `System`, `Specials`,
`Supers`, `GetHits`, `Unused`, or `Layer1` through `Layer4`.

## Filenames

Use `Character_Animation_OptionalPhase_000.png`.

- `st`, `cr`, `j`: standing, crouching, jumping
- `L`, `M`, `H`: light, medium, heavy
- `P`, `K`: punch, kick
- Put command directions first: `fHK`, `bHP`, `dfHK`

The `f` means forward, not far. Start each sequence at `000` and keep its name
consistent.

## Specials and Supers

Use a clear move name or function such as `Fireball`, `DP`,
`AirborneAdvance`, `GroundedAdvance`, `StationaryBurst`, `ResourceInstall`,
`DiveAttack`, `CommandGrab`, `BodyShift`, `Teleport`, `FloatAerialControl`,
`CommandDash`, `CounterAttack`, or `SustainedAttack`.

Separate multipart phases. For example:

```text
Honda_ButtSlam_Rise_000.png
Honda_ButtSlam_Descent_000.png
```

Useful phase names include `Startup`, `Launch`, `Rise`, `Travel`, `Turn`,
`Descent`, `Landing`, `Recovery`, and `Grab`.

## Layers and uncertainty

Use **part** for animation pieces that must draw separately during interaction,
such as a throw arm in front of the opponent or cloth behind the character.
Use **cosmetic** for optional character overlays such as Ryu's beard, masks,
or costume additions. This wording prevents throw parts from being confused
with selectable cosmetic layers.

PSD is the preferred handoff when a frame has more than one piece. Keep every
piece aligned in one PSD and use these layer names:

- `BASE` — the complete normal character frame;
- `COSMETIC 1` through `COSMETIC 4` — beard, mask, or costume overlays;
- `PART BACK` — an interaction part intended behind its synchronization owner;
- `PART FRONT` — an interaction part intended in front of its synchronization owner;
- optional `P1` or `P2` suffix — which participant the intended order is
  relative to, such as `PART FRONT P2`;
- `REFERENCE` — guides that must not be exported.

Put `PART` in the PSD filename whenever the PSD contains interaction parts.
Throws containing parts are always reviewed manually because `front` and
`back` are relative to the synchronized participant; they do not automatically
mean in front of or behind both fighters.

If exporting PNG folders instead, use `Base`, `Cosmetic 1`-`Cosmetic 4`,
`Part Back`, and `Part Front`. Every part uses the exact same filename and frame
number as its base sprite. Parts may be sparse; a missing part means that frame
does not draw that part. Preserve unused work in `Unused`.

The four SFF layer banks are storage reserves, not artistic draw-order names:
`base group + 10000`, `+20000`, `+30000`, and `+40000`. The build manifest
records whether each bank is cosmetic, front, back, or still awaiting review.
Runtime code controls draw order separately.

Transformation art uses separate `Form1` through `Form4` folders. A semantic
label may follow the slot, such as `Form1 SSB`, but do not use `SSB` alone
because the tool must never guess its numeric slot. Put only frames that look
different from Base in a form folder, using the exact same filename and source
frame number. The build stores them at the base sprite item plus `10000`,
`20000`, `30000`, or `40000`. Unchanged frames are omitted.

Layers inside a form retain the layer group bank and use the form item offset.
For example, base `200,3` becomes Form 1 `200,10003`; its Layer 1 counterpart
is `10200,10003`. Four forms and four layers are the shared maximum.

IKEMEN's `Explod` `syncid` groups a part with a character in draw order,
`synclayer` places it behind (`< 0`), with (`0`), or in front (`> 0`) of that
owner, and `syncparams = 1` follows the owner's position, scale, angle, and
transparency. These safeguards prevent a beard from drifting into an unrelated
fighter's draw group. Multipart throws still need an explicit P1/P2 ordering
review.

When uncertain, keep the sequence together, label it `PART REVIEW`, and include
a note rather than guessing.
