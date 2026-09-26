# Legacy Capcom and SNK Data Acquisition Research

Status: deferred until the current IKEMaker production test is complete.

Research date: 2026-09-08.

Darkstalkers-specific cheat inventories and the documented hidden character
test are recorded in
[`Darkstalkers-Cheat-and-Debug-Research.md`](Darkstalkers-Cheat-and-Debug-Research.md).

This note treats "ANK" as a typo for SNK. The first supported hardware families
should be Capcom CPS-1, CPS-2, and CPS-3, plus SNK Neo Geo MVS/AES. Earlier
Capcom and pre-Neo Geo SNK boards can be added later as separate source-game
profiles rather than being forced through these assumptions.

## Current state

- Emulation of the relevant 2D arcade families is mature in both MAME and
  FinalBurn Neo. The difficult part is no longer running the games; it is
  converting game- and revision-specific internal data into reviewed IKEMEN
  assets and code.
- MAME is the preferred research/reference platform. Its debugger, memory
  viewer, watchpoints, Lua memory API, input recording/playback, screenshots,
  video, audio capture, machine definitions, ROM hashes, and open driver source
  make it the best authority for discovering and recording data.
- FinalBurn Neo is the preferred secondary gameplay and Fightcade-compatible
  validation platform. Its Lua implementation is already used by the community
  training-mode project to read and write memory, advance frames, record input,
  show hitboxes, and support many CPS and Neo Geo games.
- Community FBNeo hitbox scripts already decode the live box structures for
  CPS-1/2/3 families and many Neo Geo games. These decoded rectangles should be
  exported directly. Detecting colored boxes from screenshots remains a useful
  fallback and independent visual check, not the primary path.
- Raw graphics extraction is available, but raw tiles are not finished
  character frames. Reconstructing an arcade frame can require sprite/object
  RAM, tile indices, palette selection, chaining, flips, zoom, priority, and
  offsets. CPS-3 adds decompression and different memory-layout concerns.
- Audio recording provides the final mixed output. Recovering isolated sound
  effects, semantic sound IDs, loop points, and priorities requires tracing the
  game sound command/latch and understanding the board-specific audio data.

## 2026-09-12 CPS hardware reference intake

Status: accepted as Phase 2 research; no emulator adapter or ripping feature is
implemented by this intake.

Local source material supplied by JustNoPoint:

- `Reference screenshot supplied during research (not distributed)`
- `The Book of CP System by Fabian Sanglard (reference only; not distributed)`

The collaborator recommendation is to treat FBNeo as the convenient practical
ripping environment and MAME as the stronger cheat, debugger, and hardware-
documentation environment. PalMod and existing Darkstalkers stage work may
provide useful palette-index references. The statement that CPS-A/CPS-B data
is mostly transferable from CPS-1 to CPS-2 is a promising lead, not yet a
verified implementation guarantee; every adapter remains board, game, region,
and revision identified.

The supplied CP System reference confirms several concrete data sources that
should shape the first CPS adapter:

- CPS-A exposes stable register roles for OBJ, SCROLL1/2/3, rowscroll, and
  palette GFXRAM bases; SCROLL1/2/3 X/Y offsets; STAR offsets; rowscroll offset;
  and video control.
- CPS-B owns layer enable/order, four per-pen priority masks, and palette-page
  upload control. Its register locations and bit layouts vary across CPS-B
  versions, so MAME's per-board implementation remains the decoding authority.
- OBJ entries contain X, Y, tile ID, palette selection, X/Y flip, and rectangular
  tile dimensions. They use an upper-left screen-space origin and terminate at
  the sentinel or the hardware tile budget.
- SCROLL entries contain tile ID, palette selection, X/Y flip, and priority-
  group information. SCROLL1, SCROLL2, and SCROLL3 use different tile sizes but
  share a 64-by-64 tilemap layout.
- SCROLL2 rowscroll is a per-line horizontal-offset table. Capturing only one
  global layer position cannot reproduce floor perspective or other line-
  scrolling effects.
- Palette upload is synchronized to vertical blanking and organized in layer
  pages. A palette dump must record which page/layer was requested and its
  source address rather than treating visible RGB colors as a flat list.
- Layer priority is not only a whole-plane draw order. Priority masks can place
  selected palette pens from the plane behind OBJ above OBJ pixels. Accurate
  stage and foreground reconstruction must retain this per-pen occlusion data.
- CPS graphics are assembled from indexed tiles. OBJ and SCROLL composition
  metadata is therefore higher-authority evidence than a raw tile sheet or a
  screenshot alone.

### Phase 2 adapter consequences

1. Define one normalized CPS capture record consumed by both MAME and FBNeo;
   emulator convenience must not create incompatible evidence formats.
2. Start with a read-only **CPS Register Inspector** showing raw value, decoded
   meaning, board profile, frame/tick, and source address for every supported
   CPS-A/CPS-B field.
3. Add a frozen-frame **OBJ List Inspector** that reconstructs selected objects
   from descriptors and records every tile, palette, flip, size, priority, and
   screen coordinate. Object ownership remains unresolved until supported by
   game-specific RAM or controlled suppression evidence.
4. Add a **SCROLL/Stage Inspector** with independent plane positions, tilemaps,
   rowscroll curves, layer order, priority groups/masks, and palette-page state.
5. Derive an IKEMEN sprite axis only after relating upper-left screen
   coordinates to a reviewed character/world origin. An OBJ coordinate alone
   is not a character axis.
6. Preserve raw register and descriptor snapshots beside decoded records so a
   corrected board profile can regenerate results without re-ripping.
7. Compare the same frozen frame through MAME and FBNeo where practical. Pixel,
   palette, descriptor, or layer-order disagreement becomes a visible review
   item rather than being silently normalized.
8. Keep PalMod material as a candidate palette/index cross-check. Do not import
   its ordering as authoritative until the exact game/revision and source bank
   are matched.

### Safe first proof

The smallest useful proof is one frozen CPS-2 frame from a supported SFA3 or
Darkstalkers revision:

- capture the raw OBJ descriptor list, active palette data, and layer controls;
- reconstruct one selected character object on transparency;
- show its component tiles, screen placement, flips, and palette provenance;
- compare the reconstruction with the emulator screenshot;
- retain unresolved attached effects separately;
- export only to an SFF staging area after human review.

This proof should precede automatic animation sweeps or batch character ripping.
It validates the data model that those higher-volume operations depend on.

## Recommended authority order

1. Direct, version-identified memory or emulator-script export.
2. A decoded value supported by emulator driver source or reviewed
   disassembly.
3. Fixed-camera, frame-stepped image measurement.
4. Video measurement with verified game ticks and duplicate-frame detection.
5. Gameplay inference, clearly marked provisional.

Never replace a higher-authority raw capture with a lower-authority conversion.

## Dreamcast, NAOMI, and CPS-3 target set

The planned IKEMaker emulator integration is not limited to CPS-2 SFA3 and the
arcade Darkstalkers games. A Flycast-based Dreamcast/NAOMI path is also required
for Vampire Chronicle for Matching Service, Street Fighter Zero 3 Upper,
Capcom vs. SNK 1 and 2, and Marvel vs. Capcom 2. Street Fighter III: New
Generation, 2nd Impact, and 3rd Strike are also required sources.

- **Flycast standalone** is the primary Dreamcast/NAOMI acquisition adapter.
- **Flycast Dojo** is an optional training and repeatable-input adapter.
- **MAME** remains the primary arcade authority for all three CPS-3 Street
  Fighter III games.
- **Redream** may be used for visual/playability comparison, not as the primary
  programmable acquisition interface.

Where both arcade and Dreamcast releases exist, IKEMaker must expose them as
separate source profiles. Street Fighter III: Double Impact can provide the
Dreamcast-port material for New Generation and 2nd Impact, but it does not
replace their separate CPS-3 arcade profiles. Cross-version sprite, palette,
timing, collision, or velocity matches are proposed associations requiring
review, never automatic equivalence.

## PlayStation 2 collection target set

PCSX2 nightly is the sole planned PlayStation 2 integration unless testing
finds a title-specific blocker. Its initial and currently complete target list
is Vampire: Darkstalkers Collection and Street Fighter Alpha Anthology (Street
Fighter Zero: Fighters' Generation in Japan).

For production capture, pin a verified PCSX2 build and create a separate source
profile for each disc serial, region, and CRC/hash. Default to software
rendering at native resolution with filtering and presentation smoothing
disabled. Preserve the exact renderer and graphics settings with every session.
Treat texture dumping as research evidence rather than proof that a dumped
texture is a complete, correctly layered character frame.

The PCSX2 adapter should expose the same IKEMaker controls and evidence model as
the other emulator adapters: launch, pause, frame advance, save/load rolling
research states, lossless capture, reviewed cheats/patches, memory discovery,
crash recovery, and separate Sprite Ripping, Timing Capture, and Collision
Capture states. Cheat Engine remains available for guided memory searches and
freezes that PCSX2's debugger cannot perform conveniently.

## Recommended acquisition workflow

### IKEMaker as the emulator front end

IKEMaker may launch a user-configured external Flycast, Flycast Dojo, MAME, or
FBNeo executable with a selected source-game profile, source image/ROM short
name, revision, capture folder, emulator-specific adapter, and optional approved
research cheats. The emulator remains a separate process and window. IKEMaker
owns the session controls and watches the adapter's structured trace,
screenshots, and status files.

Recommended controls are launch/stop, pause, single game-tick advance,
save/load research state, start/stop trace, capture current frame, run an
animation-frame sweep, and reopen the resulting capture session. IKEMaker must
show the exact emulator, version, ROM identity, game-speed setting, and active
profile throughout the session.

An embedded live emulator is not required. A reviewed near-live preview can be
made by having the adapter provide raw screen pixels/snapshots and structured
data to IKEMaker. This preserves a clean process and licensing boundary while
still making IKEMaker the working interface.

### 1. Lock the source revision

Every session records:

- platform and hardware family;
- emulator and exact version;
- MAME/FBNeo short name, parent set, region, and revision;
- relevant ROM CRC/SHA-1 values;
- game speed or turbo setting;
- refresh/update rate and whether the sample is a logic tick, rendered frame,
  or video frame;
- character, stage, side, facing, and test conditions.

Addresses and decoded structures must not silently carry between revisions.

### 2. Use an emulator capture companion

Create a small external Lua exporter for MAME first and FBNeo second. It should
write one JSON Lines or CSV record per emulated game tick. A useful common
record is:

```text
frame, inputs, p1/p2 world position, raw velocity, state/action,
animation/frame, facing, hitstop, health, meter, camera/scroll,
boxes[], active objects[], sound commands[]
```

The exporter should only read by default. Memory writes belong to explicitly
enabled testing helpers and must never contaminate an evidence capture.

### 3. Discover unknown values efficiently

- Use MAME's memory viewer and debugger searches to find health, meter,
  position, timers, state numbers, and flags.
- Set watchpoints or Lua write taps to find the code that changes a candidate
  address.
- Use controlled experiments: change one condition, advance one game tick,
  and compare.
- Cheat Engine values can be pasted into IKEMaker's manual memory converter.
  A separately enabled file-based Cheat Engine bridge may also guide scans and
  preserve reviewed discoveries while Cheat Engine remains responsible for all
  process access. See
  [`Cheat-Engine-Bridge-Specification.md`](Cheat-Engine-Bridge-Specification.md).

### 4. Convert only after capture

Keep three layers:

1. immutable raw source capture;
2. decoded source-game meaning;
3. derived IKEMEN values and proposed code/assets.

This lets a corrected scale, fixed-point interpretation, or localcoord setting
regenerate the IKEMEN result without repeating the rip.

## Data-specific suggestions

### Timing and inputs

- Record and replay emulator inputs so tests are repeatable.
- Store inputs per actual game tick, including held directions and simultaneous
  buttons.
- Derive command windows, charge time, reversal windows, recovery, hitstop,
  and cancel timing from state/timer transitions rather than video alone.
- Do not treat either CPS or Neo Geo as exactly 60 Hz. For example, current
  MAME source models CPS refresh near 59.6 Hz, while Neo Geo's 6 MHz pixel clock,
  384-pixel total, and 264-line total yield about 59.1856 Hz.

### Positions, velocities, and physics

- Capture position, raw velocity, acceleration/phase flags, facing, ground
  state, camera position, and hitstop together.
- Support signed integers, floats, and common fixed-point encodings. Keep the
  original raw word beside the decoded number.
- When the velocity address is unknown, fit velocity from axis displacement
  across verified game ticks, then validate the fitted IKEMEN trajectory against
  the source path.
- Split discontinuities such as teleports, throws, screen wrapping, and camera
  snaps instead of averaging through them.

### Pixel-edge coordinate convention

Felineki's latest 2026 project guidance identifies a recurring CPS conversion
error: hardware/game coordinates often describe grid-line intersections and
pixel boundaries, not the centers of labeled pixel cells. Think **graph paper**,
not a chessboard. Store this choice explicitly in every source profile.

Internally prefer edge-based half-open geometry `[left,right) x [top,bottom)`:

- width is `right-left` and height is `bottom-top`;
- mirroring an X interval about zero is `[-right,-left)`;
- an axis at `(0,0)` lies on intersecting boundaries;
- the viewport is bounded by edges around the visible raster, not by the
  centers of its first and last pixels.

When a source or target format uses inclusive raster coordinates, convert at a
named boundary. For example, an inclusive horizontal range `[left,right]`
mirrors around a zero edge to `[-right-1,-left-1]`. Never apply a half-open flip
formula to inclusive endpoints or vice versa.

This convention must be shared by collision import, AIR authoring, sprite-axis
reconstruction, camera conversion, stage fitting and visual overlays. Old Lua
hitbox scripts that center the origin on an individual pixel can make the top
and right edges one pixel too large and can shift boxes after flipping even
when the raw values are correct.

Add calibration fixtures for asymmetric boxes, odd/even sizes, axis-touching
boxes, both facings and every viewport edge. Show pixel centers and edge lines
independently. Store covered raster pixels alongside numeric edges so reviewers
can see whether a disagreement is a value error or merely a convention error.

### Collision boxes

- Adapt the existing FBNeo/MAME-derived hitbox readers to emit box coordinates,
  owner, type, facing, world/screen coordinate basis, object identity, and frame
  number.
- Import that structured data directly into an IKEMaker review overlay.
- Retain the planned colored-box PNG importer for games without a working
  decoder and for comparing exported coordinates with the rendered result.
- Never infer hidden collision boxes from an ordinary sprite silhouette and
  label them exact.
- Preserve raw offset/extent fields rather than prematurely calling them
  inclusive endpoints. Hyper Fighting evidence shows offsets/extents matching
  exact edge-to-edge pixel distances; the remaining record construction and
  signedness still require source-profile proof.

### Sprites and animation

- Use the emulator graphics viewer for tile/palette research and object RAM for
  reconstruction. A tile dump alone loses composition and axis information.
- Record every rendered object's tile code, palette, X/Y, flip, scale/zoom,
  priority, chain/link information, and owning gameplay object.
- Reconstruct to a lossless intermediate canvas, preserving the source origin;
  crop only in the later SFF build stage.
- Deduplicate identical images without collapsing distinct timing or object
  states. Aliases should remain explicit.
- For CPS-3, start with composed-frame capture plus memory metadata. Build a
  decompression-aware extractor only when it materially improves a target game.

Sprite ripping and timing capture are separate acquisition states. The SFA3 and
Darkstalkers ripping state assumes a reviewed locked axis by default and marks
all capture timing as non-authoritative. A deliberate imperfect-lock mode may
retain otherwise unavailable edge-case sprites, but it must mark every affected
frame for alignment/axis review. Full rules are defined in
[`Cheat-Engine-Bridge-Specification.md`](Cheat-Engine-Bridge-Specification.md).

Their outputs are also separate: reviewed sprite rips feed SFF classification
and building, while reviewed timing and collision data feed AIR action and box
authoring. A shared frame-identity registry links AIR elements to approved SFF
group/index records; capture order must never become implicit animation timing.

### Sprite ripping workspace and layer isolation

IKEMaker can become the sprite-ripping interface, but hardware layer toggles
must not be presented as object isolation. In many arcade games P1, P2,
projectiles, shadows, particles, and foreground objects share the same hardware
sprite plane. A global "hide sprite layer" switch cannot distinguish them.

Use the following isolation methods in authority order:

1. **Object-aware reconstruction.** Decode the active sprite/object list and
   reconstruct only objects associated with P1, retaining tile, palette,
   position, flip, zoom, priority, and link/chaining metadata.
2. **Profile-controlled object suppression.** Use a reviewed game/revision
   adapter or research cheat to suppress P1, P2, shadows, effects, HUD, and
   backgrounds independently, then take matched captures of the same frozen
   game tick.
3. **Differential capture.** Compare matched captures with one known object
   class enabled/disabled and construct a transparent mask from the changed
   pixels. This must flag palette cycling, raster effects, and animated
   backgrounds that make the comparison unstable.
4. **Flat-background capture.** Use a unique background color, move unrelated
   objects away, and extract connected pixel regions. This is convenient but
   less authoritative and always requires review.
5. **Manual reviewed component removal.** Let the user include/exclude detected
   connected components or captured object masks. This is selection and cleanup,
   not a general-purpose image editor.

The workspace should show a capture stack rather than four assumed layers:

- background/tile planes;
- foreground/tile planes;
- P1 base body objects;
- P1 attached parts or overlays;
- P1 shadow/reflection;
- P1 projectile/effect objects;
- P2 and partner objects;
- HUD/debug overlays;
- unresolved/shared sprite objects.

Each source game profile maps its actual hardware/object data onto this semantic
stack. Unknown ownership stays unresolved instead of being silently removed.

Useful reviewed operations include toggling stack entries, comparing normal and
suppressed captures, selecting connected components, keeping/removing a mask,
assigning base/part/shadow/effect meaning, setting the axis from captured memory
or manually, lossless cropping, duplicate detection, palette association, and
staging selected frames for the existing SFF naming/build workflow.

If a game supplies a debug or cheat routine that cycles through animation
frames, IKEMaker should treat it as a profile capability named **Animation Frame
Sweep**. The adapter freezes the game state, advances the cheat one pose/frame
at a time, captures pixels plus memory/object metadata, detects repeated frames,
and asks the user where the sequence ends. The sweep is an acquisition aid; it
does not by itself prove animation timing, move membership, axes, or object
ownership. Those must be captured or assigned separately.

Every successfully displayed sweep frame receives a lossless screenshot and
evidence record. Maintain rotating last-good emulator save states while
advancing. If an invalid value crashes or hangs the emulator, quarantine the
requested value, relaunch the exact emulator/ROM, restore and validate the last
good state, reconnect memory locators, and resume without automatically
repeating the failed transition. Full recovery rules are defined in the Cheat
Engine bridge specification.

Use accepted, duplicate, blank, wrapped, clamped, and failed selector values to
build a numeric range map. Suggest contiguous banks, strides, repeated blocks,
bit-field boundaries, terminators, aliases, and unsafe gaps with supporting
samples and confidence. Confirmed patterns may guide later captures and SFF
classification, but an inferred pattern never authorizes blind writes into an
untested or crash-prone range.

Every resulting sprite retains evidence metadata outside the SFF: source ROM
and revision, emulator/version, source frame, profile/cheat version, capture
method, included object IDs or masks, palette, axis source, reviewer, and any
unresolved components.

### Object behavior dispatch and code correlation

A live object list becomes substantially more useful when a reviewed
game/revision profile can correlate each object's behavior selector with the
source routine dispatched for that tick. Initial `dstlk` Euro 940705 evidence
suggests a one-byte behavior ID indexing a four-byte 68000 function-pointer
table. That observation is recorded in
[`Darkstalkers-Cheat-and-Debug-Research.md`](Darkstalkers-Cheat-and-Debug-Research.md)
and remains revision-specific until reproduced in a debugger.

The normalized capture format should therefore permit, without requiring,
these additional fields:

```text
object_slot, object_id, behavior_id_raw, behavior_table_base,
behavior_entry_address, behavior_pointer_raw, behavior_routine_address,
animation_id, sprite_pointer, tilemap_pointer, visibility
```

Addresses are provenance, not portable identities. Cross-revision association
must use ROM hashes plus reviewed signatures or structural evidence; equal
absolute addresses are not expected. IKEMaker should let the researcher label
a confirmed routine semantically, preserve aliases, and compare routine-entry
and return-time memory changes across controlled single-tick trials.

Recommended analysis views are:

- an object list grouped by current behavior routine;
- a per-object timeline showing behavior, animation, position and visibility;
- a transition matrix from behavior routine A to B with triggering game state;
- a call-site/table view retaining the raw disassembly and pointer arithmetic;
- a cross-object comparison showing shared routines and object-specific data;
- bookmarks and watchpoints for routine entry, exit and writes to the selected
  object's state block.

This evidence can propose IKEMEN implementation categories such as static BG
animation, BGCtrl sequence, Explod, helper, projectile, or unresolved. It may
not directly translate source instructions into shipped code or declare an
object's meaning from a pointer alone.

When a game also exposes its stage-object initialization list, preserve that
ROM table separately from live object RAM. Initial `dstlk` Euro 940705 research
suggests records with behavior identity and X/Y placement terminated by an
`0xFF` sentinel. A profile exporter should retain the list address, record
offset, complete raw bytes, decoded fields and terminator evidence, then join
each initialization record to its live object slot and behavior routine where
possible. Never infer the record width by scanning until the next visually
plausible value, and never continue past a missing or invalid terminator.

This creates a useful three-way stage proof:

1. ROM placement record describing what should be spawned and where;
2. live object state showing what the engine created and how it behaves;
3. rendered capture confirming pixels, palette, priority and camera transform.

Only after those three agree should IKEMaker propose stage placement or motion.

### CPS2 graphics-region decoding and tile provenance

Born2SPD's *CPS2 Graphics hacking guide* provides a useful complete-ROM graphics
path that complements live emulator capture. Its demonstrated sequence is:

1. Build an exact-set graphics split configuration from the MAME CPS2 driver.
2. Combine/interleave the graphics ROMs, then CPS2-unshuffle the flat region.
3. Interpret the same bytes as 8x8, 16x16 or 32x32 CPS graphics tiles.
4. Export tile identities through TMX/TSX and an indexed editing surface.
5. For a deliberate ROM edit, reverse the operation by reshuffling and splitting
   back to the exact source layout.

Most character and background graphics are described as 16x16 tiles, while
some background graphics require the 32x32 interpretation. All three views are
interpretations of the same source bytes, so IKEMaker must not treat them as
three independent asset banks.

Add a **Graphics Region Explorer** to the deferred emulator-data workspace. It
should provide:

- exact MAME set/clone selection with driver-derived ROM order, offsets,
  interleave rules, sizes and hashes;
- non-destructive CPS2 unshuffle into a cached flat region;
- synchronized 8x8, 16x16 and 32x32 tile views with tile number, byte range,
  ROM/chip provenance and indexed pen values;
- selection manifests that store tile IDs, flips, order and composition rather
  than copying pixels into an untraceable sheet;
- TMX/TSX export and import where useful, while rejecting duplicate tile IDs in
  a destructive round trip;
- links from a live sprite-header/tilemap pointer to the decoded tile view;
- indexed atlas and palette-bank export for reviewed SFF/stage acquisition;
- a source-versus-derived hash ledger and reproducible profile recipe.

This is the missing bridge between raw ROM graphics and Yoshin's runtime
research. ROM decoding answers *which indexed tiles exist*; object RAM and
animation-element records answer *which tiles are used now and for how long*;
the stage initialization stream answers *where and with which behavior the
object is created*. The resulting joined record can recover 32x32 stage art,
animation timing and object placement without relying solely on screenshots.

IKEMaker's default operation remains extraction into a research package. It
must not overwrite ROMs. A future opt-in round-trip writer, if retained at all,
requires backups, exact-set validation, an explicit preview of changed byte
ranges and a separately reviewed license/distribution decision for every
third-party component. Project classification as hobby or commercial does not
grant rights to redistribute source-game data.

The explorer must include a **bank/chunk calculator** rather than accepting a
research formula as opaque text. For the current `dstlk` evidence it evaluates
`bank * 0x800000 + chunk * 0x80`, compares the result with a selected flat-ROM
address and reports the delta. Store formulas in the exact ROM-revision profile
with test vectors. A formula becomes trusted only when it resolves a varied set
of banks and chunks and the decoded pixels match the live object.

Preserve complete sprite construction data rather than only the flattened
result: graphics bank, tile count, source orientation, sprite axes, tilemap
pointer, chunk dimensions, per-chunk X/Y, flip bits, palette selector, raw
bytes, and all pointer provenance. An uncropped 16x16 composition is the
authoritative reconstruction. Cropping is a derived export whose rectangle and
axis adjustment remain reversible.

Stage acquisition should also separate **simple loops** from **reactive
actors**. IKEMaker may suggest an AIR/stage animation for a deterministic loop
only after observing at least two complete cycles and a reset. Anything whose
animation or movement correlates with players, camera, round state, damage,
timer or another object remains a behavior capture requiring controlled trials.

### Palettes

- Export the complete ordered palette bank, including unused entries. Do not
  construct the authoritative palette by scanning only the colors visible in a
  captured PNG.
- Preserve every level of the lookup separately:
  - tile/sprite-local pen index;
  - sprite palette-bank selection;
  - calculated hardware palette index;
  - MAME remapped or indirect pen index where applicable;
  - raw palette RAM/ROM word and address;
  - unadjusted decoded RGB/ARGB value;
  - adjusted displayed color when shadow, highlight, contrast, or another
    display adjustment applies.
- Record object/tile assignment, transparency pen, shadow/highlight behavior,
  palette animation or writes, capture frame, and game revision. Transparency
  and bank width must come from the source-game profile rather than a universal
  CPS/Neo Geo assumption.
- When a composed character frame uses more than one source palette bank,
  preserve those banks and their per-tile assignments before proposing a
  merged IKEMEN 8-bit palette. Never silently reorder, collapse, or quantize
  them merely to fit an output format.
- Add an **Index Provenance** view to the ripping workspace. Selecting a pixel
  should show its local pen, bank, source palette index, raw color word, decoded
  color, owning tile/object, and proposed IKEMEN index. Duplicate RGB colors at
  different source indices remain separate unless the author deliberately
  merges them.
- Generate indexed PNG, ACT, Photoshop swatch, and Aseprite-compatible swatch
  outputs only from the preserved ordered source palette. The exported PNG must
  retain explicit indices and disable palette optimization/reordering.
- Before SFF staging, show a source-to-IKEMEN index map and validate the
  transparency index, master palette ordering, palette sharing, and every pixel
  whose index changed. Save that map beside the source capture so it can be
  regenerated later.
- Support address-range manifests patterned after PalMod's arbitrary-data
  **Extras** workflow without requiring PalMod at runtime. Preserve each
  palette's label, source hash/region, start and exclusive end, word format,
  byte order, raw values and semantic owner, and allow ACT export as a derived
  artifact.
- Keep source storage order separate from target palette order. Historical
  Darkstalkers/Saturn research reports a `BGR555 Big Endian` RAM dump whose
  colors matched an arcade palette while transparency appeared in the first
  slot instead of the last. Any rotation/reordering must emit a reversible
  index map and remap image indices together with palette entries.
- Validate arbitrary ranges structurally. The supplied DS1 portrait manifest
  uses 32-byte records, consistent with sixteen 2-byte colors, and contains
  contiguous named blocks plus an unexplained gap and a character present in
  only one portrait class. Report such omissions and gaps; never auto-fill
  them from roster assumptions.
- Address-aware clipboard/import data is valuable: copying colors should retain
  their original file/RAM offsets, decoder and source identity so a palette can
  be traced back after ACT, indexed PNG, SFF or swatch conversion.
- Third-party palette applications and emulators are optional research tools.
  Do not bundle, automate, or depend on them until their current license,
  command interface and redistribution terms have been reviewed.

### Sounds

- Log sound-command writes and their timing first. Map command IDs to the final
  audible result through controlled playback.
- Keep command ID, source board/chip, priority, loop behavior, pan, pitch, and
  stop/replace rules separate from the extracted WAV.
- Use emulator WAV capture for comparison and timing. It is a mixed reference,
  not proof that an isolated sample has been recovered correctly.

### Damage, meter, state, and rules

- Automate controlled matrices using recorded input and save states: normal
  hit, counter state, guard, air hit, corner, armor, and character-specific
  conditions.
- Capture health, recoverable health, stun, guard, meter, score, state/action,
  hitstop, and knockdown flags before and after each event.
- Preserve formula observations separately from final IKEMEN balance choices.
  A source-faithful measurement is evidence, not a command to copy it unchanged.

### Stages

- Log camera/scroll registers, layer positions, line scroll, zoom, and object
  activation flags where available.
- Use this for parallax and trigger research. The collision-image importer still
  requires a fixed camera; dynamic-camera correction remains outside its scope.
- Record deterministic layer position, animation element, palette state,
  visibility, and source camera on independent per-tick lanes for long enough to
  verify repeated cycles. Fit constant, accelerated, periodic, stepped,
  keyframed, ping-pong, delayed, and nested-loop patterns and retain residual
  error; do not force unmatched observations into a convenient formula.
- Label every source layer's interaction role. For reactive layers, run
  controlled round, proximity, hit, damage, destruction, timer, KO, transition,
  and reset trials and record the event-to-response timing. Keep presentation
  behavior suitable for DEF/BGCtrl separate from gameplay behavior requiring a
  deterministic attached-character/helper bridge.

#### Multi-pose camera and parallax reconstruction

Felineki's October 16, 2022
[Demitri-stage comparison thread](https://x.com/felineki/status/1581524241324785664)
provides a useful acceptance pattern: compare source and IKEMEN renders at the
stage center, left bound and right bound, both at ground level and after upward
camera travel. The accompanying notes show why this matters. The source uses a
camera reference point 16 pixels below the visible lower-left screen corner,
whereas MUGEN/IKEMEN horizontal stage coordinates are centered around zero.
Missing that basis conversion produced a one-pixel right-bound overrun even
after the parallax looked correct near center.

Make this six-pose matrix the minimum Phase 2 stage-fit fixture. Store explicit
source and target coordinate bases, camera bounds, ground reference, integer
and subpixel positions, and any speed caps. Fit and validate each scroll layer
and the perspective floor across all poses, not from one screenshot. Provide
overlay, difference and landmark-residual views, plus edge-symmetry and
off-by-one checks.

The source floor uses a per-row parallax table. The supplied `dstlk` research
describes four mirrored table copies, a selected row locked to the camera, a
stage-specific base value, and offsets derived from camera distance to stage
center and row distance to that locked row. Some end rows may be nonlinear.
The acquisition package must therefore retain the raw row table and observed
per-row positions; a fitted IKEMEN floor transform is a reviewed derivative,
not a replacement for the source evidence.

The public conversion author reports a remaining one- or two-pixel floor
difference that may arise from the target engine using a different transform.
Record maximum/RMS residual error and classify whether it comes from incorrect
parameters, rounding, coordinate origin, or a target-model limitation. Do not
overfit one camera pose to hide disagreement elsewhere.

The latest floor explanation supplies a useful candidate equation. Define a
center/ground row that follows camera X, then offset each row by successive
multiples of `cameraX * perspective`; subtract above the center and add below.
An optional layer delta scales the plane for foreground/background use. With
signed row distance increasing downward, test
`x(n) = delta * cameraX * (1 + n*perspective)` against the raw table. Keep it as
a fitted hypothesis until sign, fixed-point rounding, row origin and nonlinear
end rows match at center and both camera bounds.

Camera coordinates should be treated as visible-screen boundary intersections,
not the centers of corner pixels. This unifies the graph-paper collision model
with stage conversion and prevents a one-pixel bias when translating a
bottom-left Capcom camera origin to IKEMEN's centered coordinate system.

For stage sprites, record scroll attachment, camera activation range,
visibility, priority, animation/sprite pointers and any parallax-table index.
This permits IKEMaker to distinguish an object disappearing because its source
camera window ended from a missing animation or bad target placement.

Darkstalkers palette acquisition must also preserve independent 16-color bank
animation. A source scroll may use up to 512 colors and may animate separate
parts such as curtains and lanterns independently. Split target elements along
palette-bank/animation boundaries while retaining shared geometry and scroll
metadata; never reduce the authoritative source to one flattened 256-color
render.

#### Palette-separated stage acquisition

Darkstalkers-family stage acquisition must separate indexed graphics and layout
from palette content. When two source games or stage states reuse the same tile
graphics and arrangement with different colors, IKEMaker should rip the
graphics/layout once and attach additional named palette sets rather than
requiring another visual rip.

A provisional **Stage Source Package** contains:

- source ROM/revision and graphics-region hashes;
- lossless indexed tile atlases with local pen values preserved;
- tilemap entries, palette-bank references, flips, priority, animation, and
  layer assignment;
- object-sprite data for animated stage elements that are not tilemap entries;
- scroll, line-scroll, rowscroll, parallax, camera, and layer metadata;
- an ordered palette-bank registry;
- named palette variants by game, region, stage phase, round, timer, event, or
  transformation;
- palette-write timelines for fades, cycles, flashes, and other dynamic color
  changes;
- source-to-IKEMEN conversion maps and reviewer evidence.

Before applying a palette from another game/version to an existing package,
IKEMaker must compare the graphics-region hashes and decoded tile/layout
signatures. It may offer palette-only reuse when they match. A mismatch becomes
an unresolved structural variant and must not be hidden by a palette swap.

The stage workspace should provide:

- palette-set dropdown and side-by-side comparison;
- a timeline for dynamic palette writes and cycles;
- a difference view separating color-only changes from tile/layout changes;
- pixel inspection showing tile-local pen, source bank/index, raw palette word,
  and final color;
- import of another source game's palette banks into the same reviewed stage
  package;
- batch regeneration of preview images and target assets from the common
  indexed source;
- warnings for transparency, shared-bank, animated-bank, or index-order
  incompatibilities.

If IKEMEN cannot express a particular source palette change directly, the
package still prevents reripping: IKEMaker may derive alternate indexed assets,
palette files, or reviewed stage code from the same preserved source data. The
source package remains authoritative rather than any one flattened export.

#### Console-port stage palette acquisition

When a console port such as Sega Saturn uses substantially identical stage art
with different or exclusive stage colors, reuse the verified arcade indexed
graphics, tile layout, animation and placement. Add the console colors as named
palette variants in the same Stage Source Package rather than reripping the
stage artwork.

The preferred source is a direct console palette-RAM/CRAM dump. Historical
Darkstalkers research reports a Yabause-produced BIN loading correctly as
`BGR555 Big Endian` in PalMod and visually matching the relevant MAME palette,
apart from transparency-slot order. IKEMaker can support this without a
dedicated Saturn emulator adapter: import the user-created BIN, apply a reviewed
range/format manifest, preserve raw words and addresses, and attach the decoded
bank to the arcade-derived indexed assets.

Validate a direct dump against both an emulator palette viewer and a rendered
stage capture. Keep game/revision, emulator/build, state/scene, capture time,
RAM region, byte order and dump hash. A visually matching set still requires an
explicit reversible index map when transparency or another entry changes slot.

When no trustworthy dump is available, IKEMaker may derive a palette variant
from one or more lossless screenshots without reripping the underlying arcade
tiles. This is the lower-confidence, emulator-neutral fallback.

The authoritative indexed source render supplies the known pixel indices. A
pixel-aligned Saturn reference supplies the proposed RGB value for each
corresponding source index. IKEMaker gathers all samples for each index, shows
the color frequency and confidence, and proposes an index-to-color table. It
must not claim that a screenshot reveals the Saturn port's actual hidden CRAM
index numbers or ordering; it recovers a visual color assignment to the known
source indices.

Required conditions:

- lossless, unfiltered screenshots at native output when possible;
- no CRT shader, bilinear filtering, resampling, color correction, compression,
  scanlines, or display-capture contamination;
- the same stage state, animation phase, and palette phase;
- calibrated crop, scale, and alignment;
- characters, HUD, effects, foreground obstructions, and unrelated animated
  regions masked out;
- review of any tile, layout, lighting, transparency, dithering, or port-art
  differences.

Recommended workflow:

1. Render the known indexed source stage and open the Saturn screenshot beside
   it.
2. Align by stable stage landmarks or known tile coordinates.
3. Compare graphics structure and highlight non-palette differences.
4. For each known source index, collect Saturn RGB colors at corresponding
   pixels.
5. Mark an index high-confidence only when its samples overwhelmingly agree.
6. Show ambiguous mappings, duplicate colors, missing indices, animated pixels,
   and changed artwork for manual review.
7. Combine several screenshots to cover indices not visible in one stage view
   or palette phase.
8. Save the result as a named visually recovered Saturn palette variant, retain
   screenshots/calibration as evidence, and regenerate stage assets from the
   common Stage Source Package.

An exact console dump may reveal the port's stored color order, but it still
does not prove that its graphics use the same indices as the arcade assets.
Compare rendered ownership and produce a reviewed console-to-arcade index map.
Screenshot transfer remains useful when a dump is unavailable because it keeps
the arcade package's established index order and proposes replacement colors.

## IKEMaker design recommendation

Add a future **Source Game Lab** after production testing. It should use plug-in
source profiles, not Capcom/SNK assumptions embedded in the editor.

Each profile contains:

- the project's distribution-intent and content-basis classifications;
- ROM/revision identity and hashes;
- emulator adapter and supported version;
- CPU endianness and memory value encodings;
- refresh, logic-update, turbo, and frame-skip behavior;
- named addresses/structures with evidence and confidence;
- coordinate, aspect, localcoord, and sign conversion;
- palette decoding;
- supported capture channels;
- reviewer, date, known limitations, and dependent measurements.

The project classification should use two fields rather than a single
"hobby/commercial" switch: distribution intent (`Hobby / non-commercial`,
`Commercial`, or `Undecided`) and content basis (`Fully original`, `Licensed`,
`Fan project / reference recreation`, or `Mixed`). IKEMaker remains available
to all of them. Under the JNP policy, this acquisition lab is enabled only for
hobby/non-commercial fan-project profiles and is unavailable to any project
classified as `Commercial · Fully original`.

Suggested tools in priority order:

1. structured trace importer and timeline viewer;
2. hitbox-structure exporter/importer;
3. position/velocity/trajectory converter;
4. state, input, hitstop, damage, and meter analyzer;
5. object/sprite composition exporter;
6. palette RAM converter;
7. sound-command mapper;
8. fixed-camera screenshot/video fallback tools.

The lab should compare a source trace against an IKEMEN test trace and show
timing, position, box, damage, and state differences. It should propose AIR,
SFF metadata, constants, or ZSS/CNS snippets, but never silently write them.

The comparison is not the endpoint. JustNoPoint's explicit Phase 2 requirement is
that supported evidence be converted into target-ready development data:
velocities and trajectories, Clsn boxes, ordered palettes and variants,
animation timing, damage, meter/resource behavior, attacker/defender hit pause,
hit/guard stun, positions, axes, stage placement, sound mappings, constants,
and supported SFF/AIR/SND/CNS/ZSS output. These results must enter the existing
IKEMaker preview, validation, transactional apply, undo, and live-test paths.
Every scale, tick-rate, fixed-point, localcoord, aspect, facing,
coordinate-basis, palette-index, and semantic conversion remains explicit and
reproducible. Research display alone does not satisfy Phase 2; ambiguous or
unsupported cases remain proposals while supported conversions produce usable
project assets and values after review.

## Source-to-IKEMEN conversion roadmap

Capturing data is only the first half of this system. IKEMaker needs a formal
conversion layer so that MAME, FBNeo, Flycast, PCSX2, and Cheat Engine findings
do not each require an unrelated character-building workflow.

The required pipeline is:

```text
emulator / Cheat Engine
  -> immutable raw capture
  -> normalized fighting-game record
  -> reviewed source-to-IKEMEN mappings
  -> proposed SFF / AIR / SND / palette / ZSS output
  -> IKEMEN comparison and signoff
```

The raw capture is never replaced by a decoded or converted result. Correcting
a scale, address interpretation, palette map, or timing rule must regenerate
derived output without requiring the source material to be ripped again.

### Stable guest-memory identity

Cheat Engine may discover a value through a changing host-process address, but
a reviewed source profile should ultimately record the emulated or guest CPU
address whenever the emulator exposes it. Each memory record includes:

- guest address and memory region;
- host locator only when necessary;
- data type, byte width, endianness, and signedness;
- integer, floating-point, or fixed-point interpretation;
- pointer, lookup, module-relative, or AOB-plus-offset rule;
- validation signature and expected range;
- game/disc/ROM revision and emulator version;
- evidence, confidence, author, and review date.

Cheat Engine remains the discovery and experiment interface. Finalized adapters
should read stable guest addresses directly where possible. A restart must
re-resolve and validate every host locator before restoring freezes or writes.

### Universal per-tick combat record

Every emulator adapter should normalize its output into a shared record while
retaining the untouched source values. A useful record contains:

```text
source tick and rendered frame
inputs and held directions
character state and state timer
animation, element, and sprite identity
world position, screen position, velocity, and acceleration
facing, ground/air state, hitstop, superpause, and pause
health, recoverable health, meter, stun, and other game resources
collision boxes and their owners/types
active objects, parentage, render priority, and layers
camera/scroll/zoom
sound command, channel, pitch, priority, pan, and loop state
```

Unknown fields remain absent or unresolved. They must not be inferred merely to
make every adapter produce a complete-looking record.

### Source-profile calibration session

Before production capture, guide the user through a small calibration that:

1. identifies stage ground and the character origin;
2. locks or verifies P1, P2, and camera axes;
3. measures a known horizontal and vertical distance;
4. confirms facing and coordinate signs;
5. determines logic-tick and rendered-frame rates;
6. identifies fixed-point and internal-unit scales;
7. distinguishes world-relative from camera-relative coordinates;
8. tests hitstop, pause, frame skip, turbo, and sprite-origin behavior.

The resulting calibration is versioned with the source profile and supplies the
axis, collision, stage, and velocity conversion rules.

### Logic and visual timelines

Record logic ticks separately from displayed frames. A game can hold one image
for several ticks, change state without changing its sprite, reuse an image at
new offsets, skip a render, or pause only part of its logic during hitstop.
Screenshot frequency and capture order are therefore never AIR timing.

The review workspace should show synchronized logic, visual, collision, input,
movement, and audio lanes and identify where their boundaries disagree.

#### Animated GIF collection and multi-object timing

The existing GIF-to-AIR timing path becomes a convenient entry into Source Game
Lab rather than an isolated authoring converter. Keep direct authoring access as
a shortcut, but store the capture and mapping in the Lab so it can be reviewed
beside stronger source evidence.

JustNoPoint's required scope is broader than one P1 AIR strip. GIF collection must be
able to produce usable proposals for P1 animation timing, P2 reaction timing,
hit/contact timing, hitspark placement/timing, and individual FX
placement/timing. Accepted data routes to AIR, move/hit settings, and the
appropriate effect/helper code rather than stopping at annotations or CSV/log
output.

The current `gif_air_model.js` cumulative quantization and 60-Hz resampling are
reusable foundations. Preserve original GIF delays and the complete
source-frame-to-working-tick map. Resampling cannot recover missing frames or
prove source logic ticks, hitpause, hitstun, guardstun, or recovery.

Proposed review design is a synchronized set of P1, P2, hitspark, and per-FX
lanes. Each lane records onset/end/duration, contact markers, visibility and
per-frame placement with an explicit P1-axis, P2-axis, world, or screen anchor,
plus facing, scale, camera, crop and aspect calibration. P2 may mark visible
reaction transitions and freeze/recovery points while unproven semantics remain
unresolved. Manual correction and whole-move review/application should be
available; uncertain fields are highlighted rather than silently inferred.

Frame-linked event semantics are part of the approved scope. Artist or user
notes attach to the original GIF frame or frame range and remain linked through
quantization/resampling and generated target proposals. Each semantic event
records participants, event type, source-frame association, linked FX,
placement anchor, and the original note.

The event model must distinguish P1 attack contact from later P2 wall impact,
floor impact, landing, knockdown, wall/ground bounce, and secondary dust,
debris, sparks, or other FX. A later impact belongs to the same move sequence
without becoming another attack hit. Its impact pause is not merged with the
original attack's hitpause, and its FX are anchored to the annotated impact
rather than automatically to the P1 contact point.

Explicit user corrections persist across re-analysis. Ambiguous or
contradictory events remain review items. A note supplies intended semantics;
it does not manufacture a missing duration, logic tick, or engine state.
Acceptance fixture: `P1 hit -> P2 wall impact -> landing dust` remains three
separately linked events after 60-Hz conversion, with correct participants, FX
ownership/anchors, and original notes accessible from every generated proposal.

#### Participant choreography and movement-control tracks

Participant choreography is approved Phase 2 scope. The timeline must cover P1,
P2, every participating helper, and every independently positioned FX object.
Record axis placement for all participants and velocity only where velocity is
the applicable control model. Observed displacement remains separate from the
authored gameplay motion/control decision.

Each participant uses explicit frame/tick intervals classified as
velocity-driven, bound, scripted positioning, or stationary. Cinematic and
throw sequences may position or bind both characters for most of their
duration; do not generate spurious gameplay velocity from the displacement of
a bound or scripted participant.

For bound intervals preserve controller/target identity, relative offset,
start/end boundary, facing, mirroring, and side-switch rules. At release record
the exact transition ordering, X/Y velocity, acceleration/gravity, and whether
prior momentum is preserved or replaced. Binding and free movement must never
remain active accidentally on the same release step.

Optional body-contact anchors such as hand, foot, shoulder, or another authored
point are distinct from each participant's axis. Keep camera position/zoom on a
separate track so it cannot become participant motion. Link grab, damage,
release, impact, bounce, landing, and FX events to the correct participant and
axis/contact/world/screen anchor. Miss, interruption, invalid-target, exit, and
round/KO paths must release bindings and clean sequence-owned camera/effects.

JustNoPoint's frame-range choreography notes and later corrections survive 60-Hz
resampling. Store measured paths, authored control choices, and unresolved
estimates separately. Approved output must generate usable, reviewable binding,
positioning, release, acceleration/gravity, and movement code together with AIR
timing and event/FX proposals in the same whole-move preview/apply/compare
transaction.

Acceptance fixture: `grab -> bind -> choreograph P1/P2 -> velocity release ->
wall impact -> fall/landing`. Verify every axis and interval, facing/mirroring,
binding offsets, release order and velocity, separate camera motion, FX
ownership/anchors, and interruption cleanup. Bound phases produce no unintended
velocities.

### State and animation graph discovery

Controlled repeated inputs should gradually build a reviewed transition graph
covering neutral, movement, attacks, whiff/hit/guard branches, strength
variants, landing recovery, get-hit states, cancels, and character-specific
exceptions. The graph proposes IKEMEN state organization and transition tests;
it does not treat every observed transition as universally available.

### Palette-independent frame identity

Store several related identities rather than one PNG hash:

- exact rendered-image hash;
- indexed-pixel hash;
- palette/CLUT hash;
- alpha or silhouette hash;
- cropped-content hash;
- dimensions, axis, offsets, flip, and composition metadata.

This allows the same art under different palettes, transformations, releases,
or ports to be proposed as related without declaring it identical. Prefer
source indexed pixels and CLUT order. Screenshot quantization remains a
reviewed fallback.

### Multi-pass object isolation

When an emulator/profile supports it, capture the same frozen tick with
different semantic objects enabled: complete scene, P1 only, P1 without shadow,
base body, attached parts, projectiles/effects, and background. Differential
captures can propose an object stack, but unstable or ambiguous pixels remain
highlighted for review. Hardware sprite-plane toggles must never be mislabeled
as character ownership.

### Character-owned companion and attachment reconstruction

Deterministic pattern discovery also applies to character-owned assets that are
drawn or processed separately from the root character. Examples include pets,
followers, orbiting decorations, butterflies, weapons, detached clothing,
shadows, familiars, and persistent effect objects. These are not stage layers
even when their movement resembles background controllers.

For each observed object, retain:

- source object identity, slot, owning player, parent/child relationship, and
  spawn/despawn tick;
- sprite, animation, element, palette, facing, scale, priority, and layer;
- world and screen position plus position relative to the owning character;
- velocity, acceleration, target position, lag, phase, and ground/boundary
  behavior;
- root state, animation, element, movement, facing, hit status, and command at
  every companion transition;
- collision, damage, interaction, sound, and effect events;
- reset, round transition, KO, intro, win-pose, and transformation behavior.

The analyzer should transform object coordinates into root-relative space and
run controlled movement trials to distinguish direct binding from delayed
following, spring/easing motion, orbiting/periodic paths, independent wandering,
ground navigation, screen anchoring, teleport catch-up, and animation-authored
offsets. Camera coordinates remain separate.

Record idle, walking in both directions, turn, crouch, jump, landing, attacks,
get-hit, knockdown, KO, intro, and win-pose trials where relevant. Repeat trials
at several starting distances and screen positions. Align the companion's
animation/state changes with the root character's action and element boundaries
to discover exact reactions rather than describing them only as visual
similarities.

The review workspace should show the root and every owned object on synchronized
timeline lanes. It overlays measured and proposed paths, displays relative
distance and phase, identifies shared triggers, and reports residual error over
multiple repetitions. The user may label semantic roles such as `pet`,
`follower`, `orbiting decoration`, `weapon`, `attached part`, `shadow`,
`projectile`, `effect`, or `unresolved` without that label inventing behavior.

Output ownership is selected only after behavior is understood:

- an AIR/SFF part or layer for animation-authored art with no independent life;
- an Explod for deterministic presentation that does not require persistent
  gameplay state or collision;
- a project-owned helper for persistent movement, reactions, collision,
  damage, targeting, or independent animation state;
- unresolved/manual implementation when the source relationship cannot be
  reproduced confidently.

Generated companion logic must be deterministic and rollback-safe. Persistent
objects receive stable project-registry identities and cannot rely on helper
creation order alone. Proposed AIR timing, relative offsets, helper/Explod code,
collision, and sounds remain transactional reviewed output.

BB Hood is the first required character fixture for this feature. Her
butterflies test orbit/follow patterns and character-animation interaction; her
dog tests persistent following, distance correction, facing, ground behavior,
and reactions to specific character animations. Reproducing both should verify
that the system handles several differently behaving companions owned by one
character.

### Piecewise motion conversion

Treat motion as a curve rather than assuming one constant velocity. Detect and
separate constant motion, acceleration, deceleration, arcs, phase changes,
teleports, root/target binding, scripted throw positions, and camera movement.
Compare direct memory values with measured displacement and display source and
IKEMEN trajectories overlaid with residual error. Proposed code remains
reviewable before insertion.

### Collision conversion and verification

Memory-derived boxes retain type, owner, action/element, coordinate basis,
facing conversion, default/per-frame inheritance, activation conditions, and
source structure address. Overlay source boxes and proposed IKEMEN boxes
together. A colored-box screenshot import can independently verify a memory
decoder, but cannot silently overrule it.

### Repeatable move-capture recipes

A source profile may define reviewed recipes with setup state, position,
character, input sequence, stopping condition, and variations such as whiff,
normal hit, guard, counter hit, airborne hit, and corner. Recipes gather the
branches required to understand a move and preserve the exact test evidence.
They do not assume every source game supports the same hit classifications.

### Port and revision comparison

Provide a side-by-side comparison for arcade originals, Dreamcast ports, PS2
collections, and regional/revision differences. Compare sprite identity,
palette, timing, boxes, coordinates, added/missing frames, and behavior.
Associations are proposed for review; a matching title or similar image never
merges the profiles automatically.

### Audio-command tracing

Where possible, retain the source sound command in addition to recorded mixed
audio. Record sound/voice identity, trigger tick, channel, loop behavior, pitch,
priority, pan, and character/common ownership. Reviewed mappings can feed the
SND registry and propose relevant PlaySnd or frequency settings.

### Confidence and transactional generation

Every proposed mapping and generated result is labeled **Verified**, **Strong
match**, **Provisional**, **Ambiguous**, or **Unsupported**. Generated SFF
groups, AIR actions/boxes, SND mappings, constants, and CNS/ZSS snippets follow
preview -> validate -> apply -> verify -> undo. Ambiguous data remains visible
and cannot silently become final project code.

### Source-to-IKEMEN regression comparison

Run equivalent source and IKEMEN scenarios and compare animation sequences,
logic timing, position trajectories, hit-spark placement, collision geometry,
P2 reaction, camera response, resource changes, and sound timing. Store numeric
error, visual overlays, evidence links, known exceptions, and reviewer signoff.

### Implementation priority

The first three conversion milestones are:

1. define and validate the normalized per-tick intermediate format;
2. implement calibrated, versioned source profiles with stable guest-address
   records;
3. implement source-versus-IKEMEN animation, trajectory, and collision
   comparison.

Move recipes, state-graph discovery, advanced object isolation, companion-object
reconstruction, audio tracing, and broader code synthesis build on that
foundation after it is proven with one small character/move fixture. BB Hood's
butterflies and dog become the first full companion-system fixture after the
common capture and comparison foundation is stable.

### Minimum production-conversion slice

Phase 2 is a production converter, not only a research dashboard. The first
useful Darkstalkers slice should take one exact CPS2 set and one understood move
through `capture -> convert -> preview -> apply -> compare in IKEMEN`. It must
produce a coherent, target-ready move package from the fields the profile can
prove: logic and visual timing, animation/element identity, axis and trajectory,
collision, distinct attacker/defender pause and reaction timing, damage,
meter/resource behavior, and ordered palette/frame identity where available.

Each output is routed to its real owner: movement code/constants; AIR actions,
durations and Clsn; separate pushbox/width/depth data where the project uses it;
SFF/palette assignments; Move Constants or gameplay code; SND mappings; and
tests. Do not force distinct source or target semantics into one scalar field.

The review unit should be the complete converted move, with ambiguous,
unsupported, conflicting, dependency-incomplete, and manually diverged fields
highlighted. Known fields can be approved and applied together as one reversible
transaction instead of being manually re-entered or approved one by one. A
corrected calibration or mapping must regenerate the package from preserved raw
capture. Working application is not final gameplay signoff.

Source Game Lab and Authoring are two connected shells over the same selected
project, character, move, evidence, and transaction context. This shell choice
is separate from Player/Creator, Learning/Proficient, or compact/workspace
presentation modes. Exact shell UI is unresolved, but direct navigation from a
converted field to its existing authoring editor and back to evidence is a hard
integration requirement.

## Practical first experiment

Use one well-understood move rather than attempting a whole game:

1. Pick one exact Street Fighter Alpha/Vampire Savior CPS-2 set or one exact KOF
   Neo Geo set.
2. Record idle, walk, neutral jump, one normal, one projectile, hit, block, and
   knockdown.
3. Export positions, inputs, state/animation, hitstop, health/meter, and decoded
   boxes for every tick.
4. Import the trace beside the equivalent IKEMEN character action.
5. Confirm coordinate signs, scale, timing, and box conversion.
6. Only then expand the profile to the rest of that game.

This small experiment will prove the common capture format and expose which
parts are genuinely game-specific before a large tool is built.

## Redistribution and legal boundary

- IKEMaker itself is a general authoring tool and may be used to create either
  non-commercial or commercial original games.
- This **legacy source-game acquisition workflow**, not IKEMaker as a whole, is
  restricted to the non-commercial fan projects. Emulation-derived data is for
  those projects' research, recreation, testing, and conversion work; it is not
  a commercial asset-extraction service or a source of assets for sale.
- A commercial or fully original project must not import or
  depend on emulation-derived profiles, captures, measurements, converted
  assets, or proprietary source-game data. They may use IKEMaker's universal
  original-authoring, validation, workflow, and testing features.
- Do not package ROMs, extracted commercial art/audio, keys, or other
  proprietary game data with the public IKEMaker distribution. Project-local
  research captures and converted assets remain outside the tool package.
- User-owned local captures and derived research metadata stay separate from
  distributable extension fixtures.
- MAME and FBNeo code have their own license requirements. FBNeo's current
  license permits modification and redistribution but imposes non-commercial,
  source-publication, license-text, and ROM-distribution restrictions. Do not
  copy or bundle emulator code into IKEMaker without a separate license review.
- Prefer small external adapter scripts written for IKEMaker's documented
  capture protocol. Record the origin and license of any community addresses or
  hitbox decoder logic that is adapted.

Non-commercial fan-project intent does not itself transfer ownership of Capcom
or SNK material or eliminate every copyright/trademark restriction. This note
is a project organization boundary rather than legal advice. Public releases
should continue to distribute only what the applicable project has
independently authored or is otherwise permitted to distribute.

## Primary/current references

- Fabian Sanglard, *The Book of CP System* (local supplied copy). Particularly
  relevant: graphic-system concepts and layers (pp. 84-116), GFX production and
  sprite/shape organization (pp. 141-166), and CPS-A/CPS-B drawing registers and
  descriptors (pp. 198-204). Keep the supplied book as private reference
  material; do not bundle it with IKEMaker.
- Yoshin222 Discord guidance supplied by JustNoPoint on 2026-09-12. Treat FBNeo,
  MAME, PalMod, and CPS-1/CPS-2 transfer claims as leads requiring exact-version
  validation rather than packaged authority.

- MAME debugger: https://docs.mamedev.org/debugger/index.html
- MAME memory commands: https://docs.mamedev.org/debugger/memory.html
- MAME watchpoints: https://docs.mamedev.org/debugger/watchpoint.html
- MAME Lua memory API: https://docs.mamedev.org/luascript/ref-mem.html
- MAME Lua debugger API: https://docs.mamedev.org/luascript/ref-debugger.html
- MAME recording/capture options:
  https://docs.mamedev.org/commandline/commandline-all.html
- MAME CPS hardware source:
  https://github.com/mamedev/mame/blob/master/src/mame/capcom/cps1.h
- MAME Neo Geo hardware and sprite timing source:
  https://github.com/mamedev/mame/blob/master/src/mame/snk/neogeo.h
  and https://github.com/mamedev/mame/blob/master/src/mame/snk/neogeo_spr.h
- FinalBurn Neo repository and supported hardware:
  https://github.com/finalburnneo/FBNeo
- FinalBurn Neo license:
  https://github.com/finalburnneo/FBNeo/blob/master/src/license.txt
- Community FBNeo training mode and supported game profiles:
  https://github.com/peon2/fbneo-training-mode
