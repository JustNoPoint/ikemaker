# Darkstalkers Cheat and Debug Research

Status: provisional source-game profiles for future IKEMaker capture tooling.

Research date: 2026-09-08.

## 2026-09-20 FBNeo object behavior dispatcher evidence

Status: collaborator discovery accepted as provisional Phase 2 evidence; no
runtime adapter or automatic conversion is implemented by this entry.

JustNoPoint supplied a screenshot and Yoshin's notes from **Fightcade FBNeo
v0.2.97.44-54** running **Darkstalkers: The Night Warriors (Euro 940705)**.
The debug overlay exposes multiple live objects with animation, position,
sprite/tilemap, visibility, behavior ID, and behavior-address information. The
far-right blue stage actor was identified with behavior byte `0x23`.

The reported 68000 dispatch sequence is:

```text
0D313C: movea.l ($1c,PC,D0.w), A0
0D3140: jsr     (A0)
```

For the observed object, `0x23 * 4 = 0x8C`; applying that index to the reported
table base reaches entry `0x000D31E6`, whose longword points to behavior routine
`0x000D535C`. This strongly suggests a four-byte behavior-function dispatch
table indexed by the object's behavior byte.

The arithmetic and instruction semantics must still be confirmed in the live
debugger. In particular, 68000 PC-relative indexed addressing uses the PC value
defined for the decoded extension word rather than a casual instruction-start
addition. The exact table base, D0 preparation, sign/width behavior, endianness,
and final routine address remain revision-specific evidence. Do not copy these
absolute addresses to another set, clone, region, emulator build, or later game.

### IKEMaker Phase 2 consequence

Add an **Object Behavior Inspector** beside the planned OBJ List Inspector. For
each emulated tick it should preserve:

- exact emulator build, ROM short name/revision and ROM hashes;
- object slot and stable observed identity;
- raw behavior byte/word, decoded behavior ID, dispatch-table base, calculated
  entry address, raw pointer value and resolved routine address;
- animation ID, animation/frame state, sprite or tilemap pointer, palette,
  X/Y, axis, facing, visibility and render priority;
- owning stage/character/object classification and confidence;
- changes from the preceding tick and the root/stage event that coincided with
  the behavior transition.

IKEMaker should be able to freeze one object, step one game tick, and produce a
timeline of behavior-ID/routine changes beside animation, movement and sprite
changes. Repeated routine addresses may propose behavior families, while one
routine used by several object IDs may propose shared engine logic. These are
review suggestions, never automatic semantic names.

For stage conversion this can distinguish passive looping actors from actors
that react to round state, combat proximity, damage, timer values, camera, or
other stage events. For character conversion it can help separate an AIR/SFF
part from an Explod or a persistent helper. Source routines are evidence for
observed behavior; IKEMaker must generate reviewed IKEMEN logic rather than
translating or copying ROM code.

### Background object placement stream

Yoshin subsequently reported locating how the game loads and positions
background sprites. The observed loader repeatedly reads records containing
values such as behavior ID and X/Y placement, and stops when it encounters an
`0xFF` byte. This is consistent with a sentinel-terminated stage-object
placement stream and should make a revision-specific structured exporter
practical.

The record layout is not yet proven. Before implementing an adapter, the
debugger/script must establish:

- the table pointer and which stage/round/region selects it;
- the exact field order, byte/word widths, signedness and alignment;
- whether `0xFF` terminates the entire list, one sub-list, or a particular
  field, and whether escaped/extended IDs exist;
- whether X/Y are world, screen, camera-relative, tile, or fixed-point values;
- defaults for facing, palette, priority, visibility, animation and parentage;
- whether repeated IDs create independent objects or reference shared state;
- how runtime object RAM relates each loaded record to the behavior dispatcher.

The first exporter should emit immutable raw bytes plus decoded JSON/CSV, not a
finished stage DEF. A useful record is:

```text
stage_id, list_address, record_offset, raw_bytes, object_id, behavior_id,
source_x, source_y, extra_fields, terminator_seen, confidence
```

IKEMaker can then overlay decoded placements on a frozen screenshot, allow the
user to correct the coordinate transform, associate each record with live
object and behavior evidence, and only afterward propose SFF groups, AIR
animations, stage BG elements, BGCtrl logic, or interactive helper work. Missing
terminators, out-of-range reads, and unknown record types must stop export
safely rather than scanning arbitrary ROM.

### Provisional sprite-RAM and animation-element layout

A second Yoshin screenshot records the following working notes for the same
`dstlk` investigation. These offsets are evidence to reproduce, not yet a
finished profile:

```text
Sprite object RAM
0x00  visibility
0x10  X position
0x14  Y position
0x30  animation-element pointer

Animation-element record
0x00  element time in ticks (byte/word width unresolved)
0x02  unknown
0x04  sprite-header pointer/value (longword)
```

For the far-left red-dress background actor, the notes identify live addresses
for visibility, X and Y, initial-position writes at program locations
`0x000D4D38` and `0x000D4D3E`, and a first animation-element pointer. Preserve
the screenshot transcription with the research session because address digits
and operand widths must be verified directly in the debugger before becoming a
machine-readable adapter.

This layout would let an IKEMaker capture session connect four things that were
previously separate: the stage placement record, the created sprite object,
the current animation element and the referenced graphics header. Single-step
capture should record raw object bytes and pointer targets before decoding so
that unknown offsets and later corrections are not lost.

#### 2026-09-20 attached research files and expanded layout

JustNoPoint supplied two additional Yoshin research files:

- `DARKSTALKERS_-_DEMITRI_STAGE_SPRITES.txt`, SHA-256
  `4C402F186048DABD59E425FC2B8D794C7DDE13C14D2933FA483EDF0960F573C3`;
- `Darkstalkers_-_Display_Data.txt`, SHA-256
  `F6566B45769CE7EBE5C1D7731C3B31DEB30B12C56F9FADDCB243BC8B986E1B3C`.

They expand the provisional sprite header to:

```text
+0x00  graphics bank (word provisional)
+0x02  unknown
+0x04  number of tile definitions
+0x06  unknown
+0x08  X axis (word; higher values move the composed sprite left)
+0x0A  Y axis (word; higher values move the composed sprite down)
+0x0C  tilemap pointer (longword provisional)
```

The proposed header length is `0x10 + 0x04 * tile_definition_count`. Each tile
definition appears to identify a rectangular chunk and attributes. In the
current interpretation, a size byte stores Y and X extents in its two nibbles,
with `0x32` representing `(3 + 1)` tiles vertically by `(2 + 1)` horizontally.
The attribute byte is provisionally `a b c ddddd`, where `b` is vertical flip,
`c` is horizontal flip and the low five bits select a palette. Bit `a` remains
unknown. Tilemap words appear to position each chunk relative to the composed
sprite.

This structure and its widths must be validated from raw bytes. The two files
also conflict on a critical stage-object offset: the written stage notes place
the animation-element pointer at `+0x30`, while the current FBNeo display script
reads both sprite/animation-element pointer at `+0x1C` and labels `+0x30` as X
velocity. IKEMaker must display contradictory observations side by side and
require a watchpoint/single-step proof before promoting either offset to a game
profile.

The display script is valuable as a prototype, not an authoritative adapter.
It already demonstrates Source, MUGEN and Address views; player position,
velocity, subpixel and acceleration conversion; stage-object browsing and
visibility toggling; animation/sprite/tile-definition file offsets; and
provisional hurtbox, pushbox, defense and pushback lookups. Before reuse, audit
duplicate table keys and offsets, signed-value conversion, address comments,
endianness, and every write operation. Read-only capture must be the default.

### Tile-bank address calculation

Yoshin proposes this CPS2 interleaved-graphics equation:

```text
gfx_rom_address = (gfx_bank * 0x800000) + (tile_chunk * 0x80)
```

The bank-zero test is internally consistent:

```text
(0x0000 * 0x800000) + (0x59BC * 0x80) = 0x002CDE00
```

However, bank `1` and chunk `0x59BC` calculate to `0x00ACDE00`, not the pictured
Tile Molester address `0x00ACE480`. The pictured address corresponds exactly to
chunk `0x59C9`:

```text
(0x0001 * 0x800000) + (0x59C9 * 0x80) = 0x00ACE480
```

This does not disprove the equation. The sprite is made from several chunk IDs,
and the pictured atlas position may begin at a different member of the
composition. Add an arithmetic validator that shows bank, chunk, calculated
flat address, observed address, delta and confidence for every chunk. Never
silently adjust a chunk number merely to make an address match.

The source graphics appear stored facing left. Preserve the source orientation
and independently record the header/chunk flip bits and live facing state.
IKEMaker should not bake a flip into the recovered pixels until the rendering
flags are understood.

### Axis and 16x16 composition evidence

Yoshin's current result is that accurate SFF placement comes from preserving
uncropped 16x16 tiles and using the first tilemap placement value as the
composition anchor. A cropped composite can produce a slightly different
reported axis; the supplied example shows an SFF axis near `56,78`, while the
working arithmetic notes reach `56,79` before accounting for cropping or an
off-by-one convention.

The importer should therefore retain both representations:

- an uncropped tile composition with the source anchor and tilemap offsets;
- an optional cropped sprite with the exact crop rectangle and a mechanically
  adjusted SFF axis.

Validation must recompose every chunk over a frozen emulator frame and compare
the uncropped and cropped forms pixel-for-pixel at the intended world position.
This provides the requested one-to-one sprite axes without relying on manual
visual placement.

### Stage palettes and behavior classes

The notes identify adjacent candidate palette ranges in ROM `09`:

```text
red-dress ladies   0xCDBA .. 0xCDDA
blue-dress ladies  0xCDDA .. 0xCDFA
```

Each span is `0x20` bytes, consistent with sixteen two-byte color entries, but
the file-relative base, word format, endianness and half-open/end-inclusive
interpretation still require verification. Preserve raw palette words and the
tile's low-five-bit palette selector before emitting decoded colors.

Stage objects should be classified from evidence rather than appearance:

- **static placement** - no animation or runtime movement;
- **simple loop** - deterministic element sequence, such as the far-left lady
  or candelabra when confirmed;
- **kinematic loop** - deterministic position/motion cycle, such as a swinging
  cage or hook;
- **reactive actor** - movement or animation changes in response to gameplay,
  such as the walking ladies;
- **unresolved** - insufficient observation.

Simple loops can become ordinary stage animations after timing and reset tests.
Reactive actors require a behavior timeline and controlled trials for camera,
round state, player proximity, collision, timer and other suspected inputs.
IKEMaker should never flatten a moving actor into a loop merely because a short
capture happens to repeat.

### Demitri-stage camera, scroll and parallax evidence

Reviewed source: felineki's public October 16, 2022
[Demitri-stage comparison thread](https://x.com/felineki/status/1581524241324785664)
and the supplied local research notes
`%USERPROFILE%\Downloads\notes.txt` (SHA-256
`F22A1D42B6DFA35028AB71FA12DB631CDC96E5A87B0C15089887F26CF822CD57`).
The notes identify themselves as *DARKSTALKERS 1 STAGE NOTES*, by felineki,
version/date 2022-10-16. Treat all absolute addresses as provisional for the
examined `dstlk` build until its exact ROM revision and live debugger values are
recorded beside them.

The public thread compares the source stage and its IKEMEN conversion at six
camera poses: center, left bound and right bound, each at ground level and with
the camera scrolled upward. The images are 384x224 and alternate source/debug
captures with IKEMEN captures. This is useful evidence that a stage conversion
cannot be accepted from a center screenshot alone. The right-bound correction
also records an important coordinate rule: MUGEN/IKEMEN stage X positions are
centered around `0`, so treating a source left edge as zero can permit one pixel
of excess rightward travel.

The author reports that the pseudo-3D floor remained within roughly one or two
pixels of the source but did not match perfectly, probably because IKEMEN's
floor transformation differs from the source engine. Phase 2 must therefore
retain measured residual error and distinguish:

- incorrect bounds, origin, anchor or parallax parameters;
- rounding or off-by-one errors;
- a target-engine transform that cannot exactly express the source model.

The supplied notes add the following provisional camera model:

- source camera/scroll coordinates use a point 16 pixels below the visible
  lower-left screen corner; this explains a usual ground value of `0x28` even
  though the visible ground is only 24 pixels above the image bottom;
- horizontal camera speed is capped at 6 pixels per frame and vertical camera
  speed at 2 pixels per frame;
- camera bounds and ground are reported at `FF9398..FF93A1`: left `0x100`,
  right `0x280`, bottom `0x00`, top `0x10`, ground `0x28` as common values;
- Scroll 2, the floor, is synchronized to the camera. Its X/Y integer and
  subpixel positions are reported at `FF9518..FF951F`;
- Scroll 1 positions are reported at `FF9458..FF945F`, and Scroll 3 positions
  at `FF95D8..FF95DF`, after their parallax offsets have been applied;
- stage center is reported at `FF96A0..FF96A1`, the base X-parallax value at
  `FF96A2..FF96A3`, and the floor-center pointer at `FF96A4..FF96A5`.

Scroll 1's Y-parallax selector at `FF947B` is reported as `00=0%`, `04=100%`,
`06=50%`, `08=125%`, `0A=75%`, with `02` unresolved. Scroll 3's selector at
`FF95FB` is reported as `00=0%`, `04=100%`, `06=75%`, `08=50%`, `0A=125%`,
again with `02` unresolved. These are selector-to-routine observations, not a
universal CPS2 enum; preserve the raw selector and resolved routine address.

Four apparently mirrored per-row floor-parallax tables are reported at
`920600`, `921600`, `922600` and `923600`. Each two-byte entry represents a
row's X offset relative to `0xC0`, while a floor-center pointer, commonly near
`92*7B0`, chooses the row locked to the camera. The working model multiplies
the stage's base-parallax value by camera distance from stage center and by row
distance from the locked row. The last entries may be nonlinear, so IKEMaker
must capture the table and test the formula across the full visible floor
rather than extrapolating from two rows.

The notes mention current X-parallax offsets for Scroll 1 and Scroll 3, with
Scroll 3 at `FF96AE..FF96B1`. They assign `FF96A6..FF96A9` to both Scroll 1 and
Scroll 2, which is internally contradictory and must remain unresolved until a
watchpoint proves the correct fields. Do not normalize this duplicate address
away in a profile.

#### Stage-object placement fields

The same notes propose these offsets inside a stage-sprite object:

- `+0x02..+0x05`: behavior/parallax selection or pointers; observed selector
  values `00..06` resolve to several routines, with `02/03` described as 25%
  Y-parallax reduction and `04/05` as 50% addition;
- `+0x10`, `+0x14`: X and Y positions;
- `+0x1C`: animation address;
- `+0x22`, `+0x28`: possible layer-priority fields;
- `+0x2A`: scroll attachment (`0`=Scroll 2, `4`=Scroll 1, `8`=Scroll 3);
- `+0x2C`: sprite address;
- `+0x30`, `+0x34`: minimum and maximum camera positions over which the
  object is active;
- `+0x50`: backwards index from the end of the Scroll 2 parallax table when
  attached to Scroll 2.

These offsets conflict in places with the separately supplied FBNeo display
script, especially the meaning of `+0x30`. Phase 2 must show both schemas,
their source and revision, then use read/write watchpoints and controlled
camera motion to resolve them. It must not merge them by majority vote.

#### Palette-RAM evidence for stages

The notes describe a two-byte color word as brightness nibble followed by red,
green and blue nibbles, with brightness `F` representing the undarkened color.
The last entry of each 16-color palette is described as the transparency mask.
Reported banks include stage sprites at colors `130..1FF`, Scroll 1 at
`200..3FF`, Scroll 2 at `400..5FF`, and Scroll 3 at `600..7FF`, together with
candidate RAM spans. The stage-sprite color range and its written address span
do not arithmetically agree, so the raw notes must remain attached and the
addresses must be confirmed before export.

A scroll layer may address as many as 512 colors, exceeding one IKEMEN 8-bit
palette. In addition, the source game can animate independent 16-color banks;
the notes cite Demitri's left curtain, right curtain and stairwell lantern as
separately shifting elements. A correct converter must split rendered elements
at palette-bank and palette-animation boundaries while preserving common
placement/parallax evidence. It must never flatten the entire stage into one
256-color image merely to satisfy the target format.

#### Phase 2 stage-fit and validation requirements

Add a **Camera and Parallax Fit** workspace that:

1. imports or records the six-pose validation matrix (center/left/right times
   ground/up), with extensible intermediate samples;
2. converts source coordinates through an explicit origin/anchor model,
   including the source's 16-pixel below-screen camera reference and
   IKEMEN's centered-zero X convention;
3. captures integer and subpixel scroll positions, camera bounds, speed caps,
   row-parallax tables, active-object ranges and scroll attachments per tick;
4. overlays source and target renders and displays per-landmark residual
   vectors or a difference image instead of relying on visual memory;
5. fits each layer and the pseudo-3D floor independently, reports maximum and
   RMS residuals for all sample poses, and flags a result that only matches the
   center;
6. preserves both the best-fit target parameters and the source observations,
   including unexplained nonlinear rows and unrepresentable residuals;
7. runs boundary symmetry and one-pixel overrun tests at both stage edges.

Approval remains human-reviewed. A one- or two-pixel floor residual may be an
acceptable documented target-engine limitation, but it may not be silently
discarded or used to excuse incorrect camera bounds.

### 2026 coordinate revision: graph paper, not chessboard cells

Status: latest project-research guidance supplied by felineki on 2026-09-12.
It refines the interpretation of earlier captures; the accompanying
`notes (1).txt` is byte-identical to the already logged 2022 stage notes
(SHA-256
`F22A1D42B6DFA35028AB71FA12DB631CDC96E5A87B0C15089887F26CF822CD57`),
so it does not create a second notes revision.

Five new explanatory images describe a crucial coordinate model. Source-game
positions and box extents should be interpreted like coordinates on graph
paper: integer values identify lines/intersections between pixels. They should
not be interpreted like labels attached to the centers of chessboard squares.
An axis at `(0,0)` is therefore a boundary intersection, not the center of an
imaginary pixel.

This explains why older Lua hitbox viewers could look correct on the bottom and
left while extending the top and right by one pixel, or appear to shift by one
pixel after a facing flip. The older overlay counted pixel centers inclusively;
the source measurements were distances from pixel edge to pixel edge.

For an edge-based interval, use a half-open representation such as `[left,
right)` and derive width as `right - left`. Mirroring that interval around a
boundary origin produces `[-right, -left)`. If an imported format instead uses
inclusive raster indices, convert it explicitly before/after the transform;
for example, inclusive `[left,right]` mirrors to
`[-right-1,-left-1]` around a zero boundary. Do not mix these two conventions
inside one overlay.

The supplied Hyper Fighting Ryu example reports source fields for one idle leg
hurtbox including X offset `0x06`, Y offset `0x0E`, X extent/radius `0x14`, and
Y extent/radius `0x10`. The annotated edge-to-edge measurements reproduce the
reported 6, 14, 20 and 16 pixel distances. Preserve the source field names
(`offset`, `radius`, or otherwise) and raw values; the image validates their
edge distances but does not by itself prove the full record's signedness,
opposite-side construction or target AIR ordering.

Capcom camera coordinates receive the same treatment. The new explanation
places the camera position at the bottom-left screen boundary: the intersection
between the first on-screen row/column and the first off-screen row/column.
In the World Warrior car-bonus example, setting the equivalent screen padding
to zero allows character axes to sit directly on those boundaries, visually
straddling the screen edge. Phase 2 must represent the visible viewport as an
edge-defined rectangle rather than shifting the origin inward to the center of
the first pixel.

#### Refined parallax-floor model

The new floor diagram defines one horizontal row as the floor's center row,
normally also the ground/standing-axis line. That row moves with the camera;
in centered MUGEN terms its base X position is `CameraPos X`. A subpixel
perspective value `p` changes each successive row by a multiple of
`CameraPos X * p`: rows above subtract successive multiples and rows below add
them. A layer delta can scale the whole result, allowing foreground/background
planes to reuse the model at a non-1 camera rate.

Represent the proposal in the fitter as a testable signed-row model, not hard
coded truth. With signed row distance `n` increasing downward, a candidate
form is `x(n) = delta * cameraX * (1 + n*p)`. Validate its sign, rounding,
fixed-point precision and center-row definition against the raw per-row table
and at center/left/right camera positions. Preserve exceptions, especially the
previously noted nonlinear end rows.

#### IKEMaker validation requirements

The collision, sprite-axis, camera and stage workspaces should share one
**Coordinate Convention Inspector** that shows:

- pixel centers and pixel-edge grid lines as separately toggleable overlays;
- source origin, target origin and the current integer/subpixel coordinate;
- interval convention (`edge/half-open`, `inclusive raster`, or unresolved);
- unfaced and faced bounds with the exact mirror equation;
- width/height as edge differences and the raster pixels covered;
- camera viewport edges, visible pixel centers and off-screen neighbors;
- a one-pixel discrepancy heatmap for source-versus-derived overlays.

Every source profile must pass asymmetric-box tests in both facings, boxes that
touch the axis, positive/negative odd and even extents, and camera objects on
all four viewport edges. Reject a profile that changes box size when flipped,
adds a pixel only to top/right, or moves an edge-bound axis wholly on-screen or
off-screen without source evidence.

### PalMod arbitrary-data and Saturn palette evidence

Reviewed source: the supplied September 21, 2022 felineki/Yoshin discussion,
two screenshots, and
`%USERPROFILE%\Downloads\Darkstalkers_-_V04_-_Extra_file_FINAL.txt`
(1,822 bytes; SHA-256
`FD1DC38C342D2F193F3074EB0C62A821393FF7F57B02CF9E04F65CDE22F99D31`).
Treat the chat and range file as historical research evidence, not instructions
to install, redistribute, or make IKEMaker depend on PalMod or Yabause.

The discussion records two useful workflows:

1. PalMod's developer/unknown-game **Extras** configuration can describe
   arbitrary binary palette ranges, preview them, retain source-location
   metadata when colors are copied, and export ACT files.
2. A Sega Saturn palette-RAM dump made with Yabause was opened in PalMod as
   **BGR555 Big Endian**. The author reports that it visually matched the first
   palette shown in MAME, except that transparency occupied the first slot in
   one representation and the last slot in the other.

This is especially valuable for **Saturn-exclusive Darkstalkers stage color
sets**. Once the arcade stage graphics, tile indices, layout and animation have
been reconstructed accurately, IKEMaker should be able to import the Saturn
palette-RAM BIN as an additional named palette source and apply it to the same
indexed Stage Source Package. The stage art should not be visually reripped
merely because the console port supplies another color set.

The preferred evidence order is therefore:

1. direct Saturn palette-RAM BIN with format, address and capture provenance;
2. emulator palette viewer and rendered stage capture used to verify decoding;
3. screenshot-derived palette matching only when a trustworthy RAM dump is not
   available.

This does not require IKEMaker to control or bundle a Saturn emulator. A safe
Phase 2 feature can import a user-created BIN and a reviewed range manifest,
decode it non-destructively, and attach approved variants to existing arcade
assets.

That slot difference is not cosmetic. Phase 2 must model palette storage order
and target transparency order separately. Reordering for ACT, indexed PNG or
SFF output needs an explicit, reversible index map so every pixel and palette
reference can be remapped together. A preview that merely looks correct is not
enough proof.

The supplied DS1 range list defines every entry as a half-open 32-byte span,
consistent with sixteen two-byte colors:

- 22 contiguous battle-portrait palettes from `0x47AE8` through `0x47DA8`:
  eleven labeled P1 palettes followed by eleven P2 palettes;
- 12 contiguous small-portrait palettes from `0x47E2A` through `0x47FAA`;
- an `0x82`-byte gap between those two blocks.

The battle-portrait list names Demitri, Jon, Victor, L. Raptor, Morrigan,
Anakaris, Felicia, Bishamon, Sasquatch, Huitzil and Pyron. The small-portrait
list includes those names plus Rikuo. Rikuo's absence from the battle-portrait
block and the gap between blocks may reflect a separate table, an incomplete
Extras definition, a version-specific roster/layout or unrelated data. Keep
both as unresolved structural evidence; do not synthesize a missing range.

IKEMaker's Phase 2 palette-range importer should accept a PalMod-style manifest
or equivalent CSV/JSON without making PalMod mandatory. Each entry needs:

- semantic label, source file/RAM region and exact revision/hash;
- start address, exclusive end address, entry size and color count;
- byte order and decoder (`BGR555 Big Endian` in the reported Saturn case);
- source transparency position and proposed target transparency position;
- raw words, decoded colors and a reversible source-to-target index map;
- optional portrait/character/player-side classification;
- ACT/indexed-image preview plus address-aware copy/export metadata.

Before trusting a decoder, compare raw words and decoded colors against a known
emulator palette viewer or rendered capture. A visual match between Saturn and
arcade palettes is useful reuse evidence, but it does not prove identical
hidden indices, addresses, brightness handling or transparency semantics.

### CPS2 ROM graphics path

Born2SPD's six-page *CPS2 Graphics hacking guide* documents a reversible ROM
graphics workflow: combine/interleave the graphics ROMs according to the MAME
driver declarations, CPS2-unshuffle the combined data with RomMangler, interpret
the flat data through a CPS1 graphics profile, and view/export it as 8x8, 16x16
or 32x32 tiles. The guide uses Porno-Graphic and Tiled to preserve tile identity
through a TMX selection and indexed-GIF round trip.

Reviewed local source: `%USERPROFILE%\Downloads\CPS2_gfx_hacking_guide.pdf`
(SHA-256 `6793F9A948B3EE48FC0E365288DC2C40789C7DAD99C51951BE223E57D11ABBBC`).

For IKEMaker, the important result is not ROM patching. It is that a reviewed
game profile can decode the complete graphics region at all three tile sizes,
including 32x32 background material that a screenshot stitcher may miss. The
ROM layout must come from the exact MAME set/driver and be stored with ROM
hashes; a split configuration from another clone or revision is not reusable
without verification.

The proposed Phase 2 acquisition flow is therefore:

1. Decode the user-supplied graphics region into immutable indexed tile atlases
   for 8x8, 16x16 and 32x32 interpretations.
2. Preserve tile number, byte range, local pen values and source-ROM mapping.
3. Use the stage/object RAM and animation-element pointers to identify which
   decoded tiles compose each live object and frame.
4. Join object placement, timing, palette bank, priority and behavior evidence.
5. Export reviewed stage or SFF source packages without modifying the source
   ROM by default.

Do not edit the generated atlas PNG directly or deduplicate repeated selected
tiles. Both break the stable tile-to-ROM mapping described by the guide. An
IKEMaker visual selection layer should instead store tile IDs and layout in a
sidecar manifest. Any optional round-trip writer must be isolated from the
default extraction path, require a backup and exact-set validation, and remain
out of packaged IKEMaker until every third-party dependency's redistribution
and modification license has been reviewed.

The five Japanese set files from the latest published Pugsy release are stored
under
[`emulator-cheats/darkstalkers-japan/pugsy-0279`](emulator-cheats/darkstalkers-japan/pugsy-0279/SOURCE.md).

## Key finding: the hidden Darkstalkers character test

The sprite-ripping debug feature currently documented by the community applies
to **Darkstalkers: The Night Warriors (Euro 940705)**. It is exposed through a
separate MAME cheat rather than the ordinary gameplay-cheat list.

Documented controls after opening MAME's test menu with F2 and enabling the
cheat are:

- P1 Coin enters or exits the hidden menus.
- Hold P1 Button 4 and press Up/Down to change the character sprite set.
- Hold P1 Button 4 and press Left/Right to change the sprite/animation set.
- P1 Button 5 changes horizontal/vertical flip.
- P1 directions reposition the displayed sprite.
- Hold P1 Button 1 to traverse frames rapidly until an animation is reached.
- P1 Button 2 advances one frame at a time.
- P1 Button 3 returns to the first frame.

This is an excellent source for IKEMaker's planned **Animation Frame Sweep**,
but it must initially be labeled as a `dstlk` Euro 940705 capability. It must
not be assumed to work for another region, revision, Night Warriors, or Vampire
Savior without direct verification. The visible community notes are at
<https://chronocrash.com/forum/resources/mame-cheats-for-sprite-ripping.342/>.

The ordinary current-style `dstlk` cheat XML examined during this research did
not contain the hidden character-test entry. It contains gameplay, stage,
region, and sound-test entries instead. Therefore the debug cheat needs to be
obtained and reviewed separately before its address expressions are ported into
an IKEMaker profile.

## Cheat inventory by arcade game

The following inventory was checked against the Pugsy MAME 0.279 package,
released 2025-07-27. The current public Pugsy collection and installation notes
are maintained at <https://www.mamecheat.co.uk/>.

### Darkstalkers: The Night Warriors (`dstlk`)

- Infinite time and finish round.
- Background selection and background hiding.
- P1/P2 energy, meter, and character selection.
- Disable background music.
- Region and title selection.
- Sound test.

### Night Warriors: Darkstalkers' Revenge (`nwarr`)

- Infinite credits/time, finish round, and forced game speed.
- Backdrop, starting-stage, and background selection.
- P1/P2 energy, meter disable/infinite, constant attack level, infinite auto
  guard, forced round win, action-speed increase, daze prevention, character,
  and character-color selection.
- Disable background music and hide the background.
- Region/title selection and sound test.

### Vampire Hunter (`vhuntj` family)

- Broadly the same gameplay controls as Night Warriors: time, game speed,
  stage/background, energy, meter, attack level, auto guard, action speed,
  daze, character, and color.
- Disable background music, select region/title, and sound test.
- The exact Japanese XML inspected did not list the background-hiding entry.

### Vampire Savior (`vsav`)

- Infinite time, finish round, and background selection.
- P1/P2 Soul Keeper toggle, maximum power, energy, Dark Force duration, and
  character selection.
- Disable background music and hide the background.
- Region/title selection and sound-test timer control.

### Vampire Hunter 2 (`vhunt2`)

- Infinite time, finish match, and background selection.
- P1/P2 energy, power, Shadow mode, Marionette mode, Dark Force change/power
  duration, control type, character, and color.
- Disable background music and hide the background.
- Region/title selection and sound-test timer control.

### Vampire Savior 2 (`vsav2`)

- Infinite time, finish round, and background selection.
- P1/P2 Soul Keeper, maximum power, energy, Dark Force change/power duration,
  Marionette versus-screen effect, character color, Gloomy Puppet Show helper,
  and character selection.
- Disable background music and hide the background.
- Region selection and sound-test timer control.

## Revision and clone handling

Cheats exist as per-set XML files for numerous clones, including `dstlka`,
`dstlkh`, `dstlku`, `nwarra`, `nwarrb`, `nwarrh`, `nwarru`, `vhuntjr1`,
`vhuntjr1s`, `vhuntjr2`, `vsava`, `vsavd`, `vsavh`, `vsavj`, `vsavu`,
`vhunt2d`, `vhunt2r1`, and `vsav2d`.

IKEMaker must detect the exact MAME short name, parent set, ROM revision, and
hash. It must never silently apply a parent's addresses to a clone merely
because their visible behavior looks similar.

## Related tools

The community FinalBurn Neo training-mode project supports Darkstalkers-family
games and already demonstrates memory reads/writes, frame stepping, input
recording, life/meter control, replay editing, and CPS2 hitbox overlays:
<https://github.com/peon2/fbneo-training-mode>.

An older Vampire Savior setup combined MAME-RR, a training Lua script, a cheat
file, a hitbox viewer, and a frame-data viewer. It remains useful as an address
and workflow reference, but its MAME-RR 0.139-era assumptions must not be made a
modern default: <https://github.com/hagure/retrogaming/blob/master/how_to_play_vsav.md>.

The Saturn version of Night Warriors also has a debug mode whose paused game
can be advanced one frame with L. That is a historical reference only; it does
not justify a Saturn adapter and is not equivalent to the arcade hidden
character test: <https://gamefaqs.gamespot.com/saturn/573987-night-warriors-darkstalkers-revenge/faqs/5186>.

## IKEMaker integration recommendation

Add a **Research Cheats** section to each source-game profile with five groups:

1. Capture / Debug
2. Character / Palette
3. Stage / Background
4. Audio
5. Training / Data

Each entry records its exact ROM support, source and license/provenance,
read-only versus memory-writing behavior, known side effects, emulator version
tested, and confidence. IKEMaker should only offer compatible combinations.

The first Darkstalkers-specific implementation should be:

- a `dstlk` Euro 940705 profile capability named **Hidden Character Test**;
- guided display of the documented controls;
- an Animation Frame Sweep capture action;
- optional background/BGM suppression;
- captured frame, palette, flip, position, and ROM/revision evidence;
- duplicate-frame detection and manual sequence boundaries;
- no claim that the debug test proves source timing, axes, collision boxes, or
  animation membership by itself.

For Night Warriors and the Savior games, begin with standard cheat import plus
the FBNeo/MAME Lua data exporter. Their own equivalent hidden character tests
remain **unverified** and must not be invented.
