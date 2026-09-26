# IKEMaker Cheat Engine Bridge Specification

Status: provisional; implementation follows the current IKEMaker production
test and begins with Street Fighter Alpha/Zero 3 CPS2.

Research date: 2026-09-08.

## Workflow provenance: JustNoPoint and Zweifuss

The Sprite Ripping state is a modern continuation of the ArtMoney-based method
documented by Joram "ZweiFuss" Nowak and pioneered with JustNoPoint:
<https://www.justnopoint.com/zweifuss/tutorial.htm>.

That workflow already established the essential process:

1. Attach a memory-search tool to the emulator.
2. Search and filter until useful scene/object values are identified.
3. Move or freeze screen and character X/Y positions.
4. suppress backgrounds, portraits, timers, palette cycling, or obstructing
   objects as required;
5. find the character sprite/frame selector;
6. increment it with a hotkey while a capture tool records the emulator;
7. save the resulting complete sprite set and clean filler/repeated frames.

The fundamental method remains valid. IKEMaker replaces the fragile and manual
parts rather than redefining the method: Cheat Engine replaces ArtMoney,
emulator-native lossless screenshots replace SnagIt/AnimGet screen capture,
reviewed emulated addresses/AOB locators replace unexplained host addresses,
and the session registry records source identity, range patterns, palette,
axis, duplicates, crashes, and SFF naming.

The original FAQ notes that Chankast placed values at different host addresses
on different computers while their offsets remained related. This directly
motivates the current rule: store stable emulated addresses when possible and
otherwise validate module-relative, pointer-chain, or AOB-plus-offset locators
per emulator version. Reference:
<https://www.justnopoint.com/zweifuss/faq.htm>.

Several original edge cases become explicit IKEMaker concepts:

- Capcom filler/head frames become **candidate filler**, never silently
  deleted.
- Repeated selector values producing the same image become recorded aliases.
  The image may be stored once, but every source value remains in the registry.
- Ibuki-style separately drawn hair becomes an attached/unresolved object or
  layer-isolation review, not an automatic part of the base body.
- Gill-style palette cycling may be frozen for a reproducible rip, with that
  intervention recorded in the evidence.
- Background-layer and object suppression become profile capabilities, with a
  flat color-key background retained as a fallback when object-aware isolation
  is unavailable.
- Portrait/countdown/object-coordinate discoveries remain distinct named data
  categories rather than being mixed with the character sprite range.
- The sequential capture remains Sprite Ripping evidence only; it does not
  establish animation timing.

## Purpose

IKEMaker should help an author discover, verify, name, reuse, and preserve
emulated-game memory values without becoming a general memory editor. Cheat
Engine remains the process attachment, scanning, debugging, freezing, and
writing application. IKEMaker owns the source-game profile, experiment guide,
evidence, conversion, and reviewed export workflow.

The primary source-game families are Street Fighter Alpha/Zero 3 and the five
Japanese arcade Darkstalkers games. The first practical use is to lock
character/world axes, identify animation and sprite/frame selectors, cycle
sprites under controlled conditions, and turn the verified discoveries into
reusable game/revision profiles and Cheat Engine tables.

### Dreamcast and NAOMI acquisition scope

IKEMaker also intends to add a dedicated **Flycast standalone** adapter for
Dreamcast and NAOMI research. Flycast replaces Chankast in the modern form of
the JustNoPoint/Zweifuss workflow. The initial target inventory is:

- Vampire Chronicle for Matching Service;
- Street Fighter Zero 3 Upper;
- Capcom vs. SNK: Millennium Fight 2000;
- Capcom vs. SNK 2;
- Marvel vs. Capcom 2;
- Street Fighter III: New Generation;
- Street Fighter III 2nd Impact;
- Street Fighter III 3rd Strike.

Use the source version appropriate to the required evidence. Dreamcast and
NAOMI material uses Flycast; the original CPS-3 Street Fighter III games use
MAME as the arcade-data authority, with their Dreamcast releases available for
port-specific comparison. New Generation and 2nd Impact are represented on
Dreamcast by Street Fighter III: Double Impact, but their identities and
evidence must remain separate in the registry.

Adapter priority is:

1. Flycast standalone for Dreamcast/NAOMI memory research, screenshots, save
   states, Lua/GDB-assisted inspection, crash recovery, and automation;
2. Flycast Dojo as an optional training, input-recording, and rapid experiment
   adapter;
3. MAME for authoritative CPS-3 arcade research and cross-platform reference;
4. Redream only as an optional gameplay and rendered-output comparison source.

Every capture must identify the exact platform, game revision, ROM/disc hash,
emulator, and emulator version. Data from an arcade release and a Dreamcast
port must never be merged merely because the game title or animation appears
equivalent.

### PlayStation 2 acquisition scope

IKEMaker intends to add one narrowly scoped PlayStation 2 adapter using the
latest tested **PCSX2 nightly** build. Only these source collections are
currently required:

- Vampire: Darkstalkers Collection;
- Street Fighter Alpha Anthology / Street Fighter Zero: Fighters' Generation.

Pin the exact PCSX2 build after validating a source profile and do not update
it during an active capture series. Each profile records disc region, serial,
CRC/hash, BIOS identity, renderer, internal resolution, filtering, emulator
settings, and active cheats/patches. Disc revisions and regional releases remain
separate profiles.

Use PCSX2's software renderer at native resolution as the default faithful 2D
capture configuration. Disable texture filtering and presentation smoothing
where supported. Hardware rendering and texture dumps are useful investigative
views but are not automatically authoritative composed sprite output.

PCSX2 supplies game launching, per-game settings, save states, frame control,
screenshots, patches/cheats, texture investigation, and its debugger. The
external Cheat Engine bridge remains the preferred guided memory search and
freeze interface where PCSX2's debugger is insufficient. A future dedicated
PCSX2 adapter should use the same transactional frame-sweep, rolling-state,
crash-recovery, immutable-evidence, and reviewed-export rules as the MAME,
FBNeo, and Flycast adapters.

Cheat Engine supports Lua-driven process attachment, memory scans, found lists,
AOB scans, address-list records, table loading, and table saving. Its `.CT`
tables are XML documents containing addresses, pointer-based records, scripts,
and related table data. References:

- <https://github.com/cheat-engine/cheat-engine/blob/master/Cheat%20Engine/bin/celua.txt>
- <https://wiki.cheatengine.org/index.php?title=Cheat_Engine:Cheat_Tables>
- <https://wiki.cheatengine.org/index.php?title=Lua:Class:MemScan>

## Boundary

- IKEMaker does not inject into or directly read/write another process.
- A user-configured Cheat Engine installation performs all process access.
- The bridge is disabled by default and available only to hobby/research game
  profiles.
- Connecting, freezing, or writing requires an explicit session action.
- Read-only discovery is the default. Every writable record is visibly marked.
- No Cheat Engine executable is bundled until a separate license and packaging
  review approves it.
- ROMs, game binaries, screenshots, and captured proprietary assets are never
  placed inside the extension package.

## Bridge architecture

Use a local folder protocol for the first implementation. It is transparent,
easy to inspect, works offline, and avoids firewall prompts or an unstable
private plugin API.

Each session contains:

```text
memory-research/<platform>/<game>/<rom-revision>/<session>/
  session.json
  commands/
  responses/
  samples.jsonl
  candidates.json
  evidence/
  exports/
```

IKEMaker creates a small companion Lua file and launches the configured Cheat
Engine executable with the working table. The Lua companion watches the session
folder, asks Cheat Engine to perform supported operations, and writes atomic
JSON responses. The companion never executes arbitrary source received from
the session folder; it accepts only a versioned allowlist of command types.

Initial commands:

- report Cheat Engine version and attached process identity;
- enumerate candidate emulator processes for user selection;
- attach to the explicitly selected process;
- read configured records;
- perform first/next scans with an explicit value type and range;
- capture a named snapshot of candidate values;
- perform a reviewed AOB scan;
- freeze/unfreeze or write one approved record;
- add/update an address-list record;
- save the current `.CT` table;
- disconnect without closing either application.

## Guided value-finding workspace

The workspace should offer repeatable experiments based on the value being
sought instead of presenting only a blank generic scanner.

## Separate acquisition states

IKEMaker must never blend sprite acquisition and timing measurement into one
ambiguous recording. The Research workspace exposes distinct states with a
persistent state label in the context bar and capture metadata.

### Authoritative output boundary

The acquisition states have different destinations:

```text
Sprite Ripping -> sprite review/naming/indexing/axis/palette -> SFF staging/build
Timing Capture -> sequence membership/ticks/offsets -> AIR action staging
Collision capture -> reviewed Clsn1/Clsn2/default boxes -> AIR action staging
```

Sprite Ripping must never author AIR durations from frame-capture order or
capture timestamps. Timing Capture must never silently add unreviewed images to
the SFF. Collision observations must never be written directly to AIR until box
type, coordinates, inheritance/default behavior, action, and element ownership
are reviewed.

A shared frame-identity registry connects the outputs. Each source frame can be
linked to its reviewed SFF group/index, palette and axis, then Timing Capture
can reference that identity while assembling AIR elements. Missing SFF frames,
ambiguous matches, repeated images, and one source image used by multiple AIR
elements remain explicit rather than being resolved by capture order.

### Sprite Ripping

This is the default state for SFA3 and Darkstalkers sprite acquisition.

- Assume that the character axis is intentionally locked.
- Default axis mode is **Reviewed Memory Lock**. The session must identify the
  confirmed X/Y records and show their live values and lock state.
- Freeze camera/scroll values too when the source profile requires them.
- Permit reviewed animation, element, sprite, palette, flip, and render-isolate
  controls needed to expose frames.
- Capture lossless images, object/layer metadata, palette data, source identity,
  and the locked axis value.
- Do not record or derive animation duration, move startup, active time,
  recovery, velocity, hitstop, or command timing.
- Emulator ticks and capture timestamps may be retained for audit/replay only;
  they are explicitly marked **not timing evidence**.
- Duplicate images remain separately addressable until sequence membership and
  aliases are reviewed.
- Approved frames feed the existing SFF classification, naming, group/index,
  layer/part, palette, axis, crop, duplicate, and SprMaker2 build workflow.
- After each requested sprite/element value renders successfully, capture a
  lossless screenshot plus its memory/object snapshot. The screenshot is the
  raw visual source for the reviewed SFF frame; it is not merely an occasional
  session preview.

The UI should show a strong **TIMING DISABLED — SPRITE RIP** indicator so a
frame sweep cannot accidentally become authored AIR timing.

### Transactional frame sweep and crash recovery

Sprite cycling can reach invalid or unsafe values that hang or crash an
emulator. Treat every advance as a small transaction:

1. Begin from the last accepted frame and confirmed recovery checkpoint.
2. Record the requested next value before writing it.
3. Apply only the reviewed sprite/action/element write while retaining the
   configured axis and camera locks.
4. Wait for the emulator adapter to report a completed render. Detect process
   exit, non-responsive timeout, unchanged frame, invalid screen, and adapter
   disconnect separately.
5. Capture a lossless screenshot, memory/object values, palette, flip, locked
   axis, and active isolation settings.
6. Hash the image, mark the frame accepted, and advance the recovery checkpoint.

After every accepted frame, create or replace a **rolling last-good save state**.
Retain at least three rotating recovery states so a damaged newest state does
not destroy the previous recovery point. Optional milestone states may be kept
at character, action, sprite-bank, or user-bookmark boundaries. An archival
save state for every frame is optional because large sweeps would otherwise
create excessive data; the screenshot and evidence record for every frame are
mandatory.

If the emulator crashes or hangs:

- record the failing requested value, previous accepted value, active locks,
  emulator/ROM identity, and failure type;
- mark that value or transition **quarantined** instead of accepted;
- relaunch the configured emulator and exact ROM automatically when the user
  has enabled crash relaunch for the session;
- restore the newest valid rolling state, falling back through the older two;
- reconnect the Cheat Engine companion and re-resolve all address locators;
- verify ROM identity, P1 character, axis values, and a known visual checksum
  before restoring freezes or writes;
- stop immediately if a locator or identity check differs;
- resume at the last accepted frame and skip or request review of the
  quarantined transition rather than automatically executing it again.

Crash relaunch should have a finite retry limit and a visible **Release All
Freezes / Stop Sweep** control. Repeated failure at the same boundary ends the
automatic sweep and leaves the last good capture intact.

Save-state support is an emulator-profile capability. When reliable save states
are unavailable, use a deterministic recovery recipe made from boot/test-menu
steps, recorded inputs, and reviewed memory setup. Such recovery is slower and
must not be described as an exact save-state restore.

Sprite Ripping provides three axis modes:

1. **Reviewed Memory Lock** — default and authoritative for positioning. Both
   axes use verified records and remain frozen during the sweep.
2. **Manual Fixed Axis** — the author assigns a fixed source origin when a
   writable memory lock is unavailable but the captured subject stays fixed.
3. **Unresolved / Imperfect Lock** — explicit edge-case mode for content that
   cannot be captured with a perfect lock. The rip is allowed, but every frame
   is marked for axis/alignment review and no automatic claim of original axis
   accuracy is made.

Entering Unresolved / Imperfect Lock requires a short reason such as dynamic
source behavior, shared coordinate write, unsafe freeze, off-screen part, or
debug routine limitation. IKEMaker should offer visual alignment, ghosting,
common-anchor suggestions, and manual/batch axis correction afterward. It must
not discard useful rare frames merely because their axes are provisional.

### Timing Capture

Timing Capture is a separate state and starts with all sprite-cycle, forced
element, and animation-timer writes disabled.

- Run the move naturally under recorded inputs.
- Record actual game ticks, action/animation changes, elements, positions,
  velocities, hitstop, collisions, and relevant state flags.
- Permit position/camera locking only when the measurement explicitly does not
  depend on natural movement, and record that intervention prominently.
- Reject or split measurements contaminated by frame cycling, arbitrary timer
  writes, pause artifacts, turbo mismatch, or unknown duplicate video frames.
- Link timing evidence to previously ripped sprites by reviewed identifiers;
  never infer timing from their rip order.
- Stage reviewed action numbers, element order, durations, offsets, flips,
  looping/interpolation flags, and sequence membership for the AIR editor.
- If a referenced sprite is not yet present in the SFF registry, create a
  visible missing-sprite dependency rather than inventing a group/index.

### Collision capture

Collision data may be captured during a natural Timing Capture session or a
dedicated fixed-frame Collision session. It feeds the AIR editor, not the SFF
builder.

- Preserve raw source boxes and their coordinate/axis evidence separately from
  converted IKEMEN boxes.
- Require reviewed mapping to `Clsn1`, `Clsn2`, `Clsn1Default`, or
  `Clsn2Default`; unresolved source box types remain unassigned.
- Associate every non-default box set with a reviewed AIR action and element.
- Preview inheritance and default-box effects across the complete action before
  applying changes.
- Permit manual editing, box selection, and conversion adjustments through the
  existing AIR collision workspace.
- Apply through the normal AIR preview, validation, backup, undo, and reference
  checks.

### Data Probe

Data Probe is the third state for discovering addresses and structures. It may
use experimental reads, freezes, or writes, but its output remains candidate
evidence until reviewed. Results from Data Probe can configure Sprite Ripping or
Timing Capture without changing the authority rules of either state.

### Axis finder

1. Freeze the game and record a baseline.
2. Move only horizontally; retain values that changed consistently with X.
3. Return to the same X while changing Y; eliminate false positives.
4. Repeat while facing both directions and while the camera is fixed.
5. Test whether the candidate is screen position, world position, camera
   position, sprite offset, or collision origin.
6. Confirm P1 and P2 structure spacing and value encoding.

The user can then approve **Freeze X**, **Freeze Y**, or **Freeze both** records.
Freezing is an experiment action, not evidence that the meaning is proven.

### Animation and sprite/frame finder

1. Hold the character and camera at a fixed location.
2. Change only the current action; compare values that change once per action.
3. Step frames within one action; compare values that advance or select images.
4. Return to an earlier action/frame and require the candidates to repeat.
5. Test idle loops, reversed animations, duplicated images, and held frames to
   distinguish action number, animation timer, element index, sprite index, and
   rendering-object fields.
6. Verify whether writing/cycling the candidate changes the intended field
   without corrupting timing or unrelated objects.

Approved records may expose **Previous/Next action**, **Previous/Next element**,
and **Reset element** controls in IKEMaker. They are available only when the
profile defines safe values, wrapping behavior, and known invalid ranges.

### Pattern and structure assistant

IKEMaker should compare candidates across P1, P2, character changes, rounds,
restarts, emulator restarts, and ROM revisions. It should suggest—not silently
declare:

- stable emulated-memory addresses;
- module-relative host addresses;
- pointer chains;
- repeated player/object structures and stride;
- nearby fields whose changes correlate with a known action;
- unique AOB signatures and required offsets;
- values that are actually mirrors, caches, render outputs, or transient host
  allocations.

The author must name and confirm a candidate before it becomes part of a game
profile.

### Numeric range-pattern assistant

Sprite, action, element, palette, and object selectors often occupy structured
numeric ranges. IKEMaker should learn from the values actually tested and help
the author describe those structures.

For every requested selector value, retain:

- decimal and hexadecimal representations;
- accepted, unchanged, duplicate-image, blank, corrupt, timeout, hang, crash,
  skipped, quarantined, or untested result;
- screenshot hash and perceptual similarity to nearby results;
- resolved action/element/sprite/palette values after the write;
- active character, side, bank, profile, and ROM revision;
- whether the game accepted, clamped, wrapped, redirected, or rejected it.

Analyze the resulting map for:

- contiguous valid runs and empty gaps;
- consistent strides such as every 2nd, 5th, 10th, `0x10`, or `0x100` value;
- repeated block sizes across characters or actions;
- likely high-byte bank / low-byte element relationships;
- modulo patterns and probable bit fields;
- headers, terminators, sentinels, wrap points, and mirrored ranges;
- sequences with the same image but different selector values;
- boundaries that repeatedly precede crashes or invalid rendering;
- P1/P2 or character structures separated by a stable numeric stride;
- similarities and differences across ROM revisions.

The UI should provide a zoomable **Range Map**:

- green: accepted unique capture;
- blue: accepted duplicate/possible alias;
- yellow: blank, unchanged, clamped, or unresolved;
- red: crash/hang/unsafe transition;
- gray: untested;
- outlined blocks: suggested bank or family boundaries.

Suggested interpretations should be written in plain language alongside their
numeric form. Examples include:

```text
Observed valid run: 0x1200-0x123F
Likely block size: 0x40 values
Likely structure: high byte selects action bank; low byte selects element
Repeated character stride: 0x800
Suspected terminator: 0x1240 (blank in three controlled attempts)
Unsafe boundary: transition 0x12FF -> 0x1300 crashed twice
```

Every suggestion has a confidence level, supporting samples, counterexamples,
and an editable author label. The author may confirm it as a named range,
reject it, split it, merge it, or leave it provisional. Confirmed patterns can
define safe Previous/Next controls, wrapping rules, batch capture plans, Cheat
Engine table comments, and SFF classification assistance.

Pattern discovery must not turn into blind probing. Default sweeps advance only
through the currently approved range, checkpointing every accepted value.
IKEMaker may recommend a nearby range or boundary test, but entering an untested
or quarantined range requires an explicit author action. Binary-searching an
unknown boundary or jumping by an inferred stride remains opt-in because one
bad value may crash the emulator.

### Batch character sprite ripping

Once a source-game profile contains enough reviewed controls, IKEMaker may
attempt a character sprite batch on the author's behalf. A first manually
reviewed character supplies the candidate layout; a second character matching
the predicted block and stride substantially increases confidence. One
character alone must not promote cross-character assumptions to reviewed
status.

Minimum information before a batch can begin:

- exact emulator, ROM short name, region, and revision;
- reviewed character selector and a safe way to confirm current character ID;
- reviewed X/Y axis and camera lock, or an explicitly selected imperfect-lock
  exception;
- reviewed animation/action, element, sprite, or debug-viewer controls;
- starting value, increment/stride, safe limits, and known crash boundaries;
- a stable render-complete signal or reviewed capture delay;
- default palette and flip/orientation state;
- background, P2, shadow, effect, and layer isolation capabilities;
- a recovery state and a verified return-to-known-state recipe.

The conservative batch loop is:

1. Restore the known safe state and select the requested character.
2. Confirm the live character ID and expected reference image/state.
3. Apply axis/camera locks and reviewed isolation settings.
4. Enter the approved starting bank/action/sprite value.
5. Advance one reviewed increment, wait for a completed render, and capture the
   screenshot plus evidence.
6. Hash or deduplicate the image, classify the result on the Range Map, and
   update the rolling recovery state.
7. Continue until a reviewed terminator/limit, explicit stop rule, repeated
   empty pattern, or quarantined transition is reached.
8. Reset safely before changing character or bank; never jump directly from an
   unknown terminal value into the next presumed block.

The output enters a **Raw Rip Inbox**. Automation may suggest character,
bank/range, aliases, and likely sequence clusters, but it must not invent move
names, SFF families, animation membership, layers/parts, or required status.
Reviewed frames then enter the existing SFF classification and build workflow;
unknowns remain visibly unclassified.

#### Labeled reference-character learning

The first two manually ripped characters may be named and classified using the
project's existing SFF naming and numbering standard. IKEMaker treats those
reviewed results as labeled reference data, not merely raw screenshots.

For each labeled reference frame, retain:

- source character, selector bank/range/value, and relative position in the
  observed block;
- reviewed semantic name and accepted aliases;
- reviewed SFF family, group/index, layer/part role, and archive/required state;
- image hash, palette, axis, flip, and neighboring source values;
- whether the label is universal, game-profile-specific,
  character-family-specific, or unique to that character;
- author confirmation and evidence/confidence.

IKEMaker compares the two characters and builds reusable mapping rules. An
automatic name is high-confidence only when both references agree on the
source-pattern relationship and the destination semantic role. A label from one
reference is tentative. A relationship inferred only from numeric similarity
is provisional.

During later batch ripping, the naming engine may automatically construct
zero-padded filenames and propose SFF group/index placement for matched roles.
It should be strongest for common movement, required sprites, get-hits, guards,
system actions, and shared normal patterns. Specials, hypers, throws, multipart
content, transformations, and character-specific exceptions must use the
existing family registry and may require author classification.

When the batch can prove only the broad move class and sequence boundary, use
temporary sequence labels with a minimum two-digit number:

```text
Character_Special00_000.png
Character_Special00_001.png
Character_Hyper00_000.png
Character_Hyper00_001.png
```

`Special00` and `Hyper00` mean **classified broad class, unresolved functional
family**. The sequence number follows the reviewed source range/block and must
remain stable across pause/resume or reripping; it is not reassigned from the
order in which screenshots happen to finish. Frame numbers retain the normal
three-digit sequence numbering. Two digits are minimum padding, not a semantic
limit if an unusual source requires more sequences.

Do not apply these labels when even the Special-versus-Hyper class is unknown;
use an unresolved action label instead. These temporary labels do not authorize
a permanent family group, AIR action, or gameplay reference. If approved for
temporary SFF intake, the whole sequence may use the existing unreferenced
`6500-6999` workflow until the author assigns its real family.

The classification editor must provide **Rename Sequence**, replacing the
temporary semantic token across every base frame, layer/part, form, manifest,
sidecar, and proposed SFF record in one previewed transaction. For example,
`Character_Special00_*` may become `Character_Fireball_*`. The stable internal
source-sequence ID survives the rename, allowing the image files and temporary
group to migrate without reripping.

The generated name must never erase its source identity. Every file retains a
sidecar/reference entry containing the original character, selector values,
range rule, and naming rule that produced it. If the two teaching characters
disagree, a later character breaks the expected image/count pattern, or more
than one semantic mapping is plausible, place the frame in the Raw Rip Inbox as
**Awaiting Classification** and show the competing suggestions.

Provide a **Teach Naming Pattern** view where the author can:

- name frames using the standard aliases and autocomplete;
- assign or correct SFF family and group/index;
- link equivalent semantic slots between the two reference characters;
- mark a mapping universal, game-specific, character-family-specific, or
  unique;
- preview the filenames and SFF placement a rule would generate for the next
  character;
- accept, reject, split, or narrow the rule without renaming already reviewed
  work silently.

Learned rules belong to the selected source-game/project profile and are
versioned. SFA3 rules must not silently classify Darkstalkers rips, and rules
from one Darkstalkers game or revision require explicit inheritance or review
before use in another.

Batch scopes include one reviewed range, one action/bank, one character, a
selected character list, or an entire reviewed roster. Provide pause, resume,
skip, retry, quarantine, and **Stop Sweep / Release All Freezes** at every
scope.

Character-specific exceptions are expected. A profile may override ranges,
increments, palette behavior, isolation, and recovery per character without
changing the shared game profile. Throws, composite parts, projectiles,
transformation objects, and shared effects default to separate reviewed passes
rather than being silently merged with the base body rip.

## Stored memory record

Every approved value should retain:

- stable semantic name, such as `p1.world_x` or `p1.anim_element`;
- category: identity, position, velocity, animation, palette, collision,
  camera, stage, sound, timer, or unknown;
- exact emulator executable/version/hash;
- ROM short name, parent, region, revision, and hashes when available;
- host process and module;
- locator: absolute, module-relative, pointer chain, AOB plus offset, or
  emulator-address-space mapping;
- byte order, width, signedness, float/fixed-point encoding, and scale;
- access: read-only, experimental write, or reviewed write;
- allowed range/wrap behavior and unsafe values;
- discovery experiments, samples, and counterexamples;
- confidence: candidate, provisional, reviewed, or rejected;
- author/reviewer and date;
- dependent IKEMaker tools and generated Cheat Engine records.

Profiles must never silently reuse a host pointer or AOB locator with another
emulator version or ROM revision. Stable emulated addresses should be preferred
over host pointers when the emulator exposes a reliable mapping.

## Cheat table export

IKEMaker stores authoritative meaning in its own versioned JSON profile and
generates a companion manifest for Cheat Engine. The CE Lua bridge creates or
updates grouped address-list records and calls Cheat Engine's `saveTable` to
produce the `.CT` file. This avoids making IKEMaker responsible for every
private detail of Cheat Engine's evolving XML.

Generated table groups should be:

1. Session identity and compatibility checks
2. Read-only observed values
3. Axis and camera controls
4. Animation/sprite cycling
5. Palette and render controls
6. Stage/background isolation
7. Audio commands
8. Experimental/unverified records

The table includes a visible incompatibility record when the emulator or ROM
identity does not match. Experimental writes stay disabled. Regeneration shows
a diff and preserves user-owned records in a separate **User Records** group.

## Initial SFA3 and Darkstalkers profiles

Begin with the Japanese CPS2 revision selected by JustNoPoint and record the
exact MAME/FBNeo short name before scanning. Initial target values are:

- P1 and P2 world X/Y;
- camera X/Y and screen/world conversion;
- character ID and side/facing;
- action/animation identifier;
- animation element and timer;
- sprite/object identifier and palette bank;
- stage/background controls already supplied by reviewed cheats;
- game tick/pause state;
- hitbox/object structure pointers when independently verified.

The profile should provide two capture recipes:

- **Locked-axis sprite sweep:** freezes the reviewed axis/camera fields and
  cycles only reviewed animation/sprite fields.
- **Natural-timing evidence:** removes all animation/frame writes and captures
  the move normally so timing is not contaminated by the sweep.

These are separate evidence types. A forced sprite sweep cannot establish
animation timing, movement, collision timing, or original sequence membership.

Apply the same session-state model to `vampj`, `vhuntj`, `vsavj`, `vhunt2`, and
`vsav2`, each as a separate revision-locked profile. The documented DS1 hidden
Character Test becomes an optional Sprite Ripping transport for a compatible
`vampj` revision; it does not become a presumed capability of the later games.

## Safety and recovery

- Create a CE table backup before any generated update.
- Log every write/freeze with old value, new value, time, and record identity.
- Provide one **Release All Freezes** action that is always visible while a
  session is attached.
- Automatically request release when the emulator exits, ROM identity changes,
  or the profile becomes incompatible.
- Never perform broad writes or execute arbitrary Auto Assembler code generated
  from candidate values.
- Mark captures taken with active writes so they cannot be mistaken for natural
  gameplay evidence.
- Make the complete session portable without including ROMs, emulator
  executables, or captured proprietary graphics by default.

## Implementation phases

1. Configure the Cheat Engine executable and research-data root; create/open a
   session and generate the companion Lua/manifest.
2. Import/export named addresses and generate a reviewed `.CT` through CE.
3. Add guided exact/changed/unchanged/increased/decreased scans and snapshots.
4. Add axis, animation, and sprite-cycle recipes with write logging and Release
   All Freezes.
5. Add structure/stride and AOB-signature suggestions with restart validation.
6. Connect approved values to the separate Sprite Ripping, Timing Capture, and
   Data Probe states, plus palette capture, box import, velocity conversion, and
   the source-game evidence viewer.
