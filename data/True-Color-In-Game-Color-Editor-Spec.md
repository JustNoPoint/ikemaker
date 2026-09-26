# True-Color In-Game Color and FX Editor Specification

## Status and scope

This is the implementation contract for the future player-facing SF6 Color Edit mode. It does not replace the indexed ACT editor used by DS, HDBZ, or other indexed-sprite projects.

The VS Code **True-Color FX Composer** is the authoring/reference implementation. The in-game editor should consume the same normalized profile fields and preserve the same limits unless testing proves that a revision is needed.

## Required separation

The system has two strictly separated halves:

1. **Lua menu and preview:** character/effect selection, sliders, animation preview, cloning visual layers, naming, saving, loading, and deleting user profiles.
2. **Native ZSS runtime:** character PalFX, Explod creation, ModifyExplod changes, IDs, animation selection, position, lifetime, and layer order during a match.

Lua must not run match behavior. The menu may prepare saved configuration before a match, but match execution must use native character/common ZSS. This follows the project rule that Lua cannot own any online gameplay aspect.

## Editor modes

The Character Options color screen exposes two clearly labeled modes:

- **Indexed Palette** — ACT/index editing for compatible characters.
- **True Color / PalFX** — body PalFX and effect-layer composition for 32-bit characters such as the SF6 cast.

Characters declare which modes they support. An unsupported editor must be hidden or disabled with an explanation rather than producing an unusable palette.

## Selection ownership and presentation

Character Options is authoritative for all choices presented by Character Select and Color Select. The color hierarchy is:

1. **Character Colors** — authored root colors.
2. **Color Variants** — child variants belonging to the selected root color.
3. **FX Colors** — compatible true-color/PalFX effect profiles.

The VS Code composer records an FX profile's selector category, parent color ID when applicable, default visibility, and stable order. These are authored defaults only. A player's manual-selector visibility, Favorites participation, and Weighted-selection value remain separate Character Options data.

Quick Character Select uses two independent actions rather than one flat appearance cycle:

- `D` cycles **Costume**.
- `W` cycles **Mode**, including Classic/Modern and alternate playstyles or character configurations when applicable.

Color, child variant, and FX color remain in the palette/Color Select path. Hiding a choice from direct Color Select does not delete it and does not automatically remove it from Favorites or Weighted selection.

True-color FX profiles and user-created colors never enter Classic Quick Select. Quick Select is restricted to authored base colors, the authored Variant 1 and Variant 2 hold slots, D-based Costume choices, and W-based Mode choices. FX colors, user-created colors, and deeper child variants require the full Visual Color Selector or automatic Favorite/Weighted resolution.

Every Quick-Select-eligible Costume or Mode value can be removed from the player's manual pool in Character Options. When a dimension has one enabled value, it becomes fixed and its prompt is hidden. This permits a player to keep Classic permanently selected, remove Modern from Quick Select, and see no Classic/Modern prompt. An authored value remains visible in Character Options so it can be restored later.

## True-color character color

The character section previews and records one root PalFX profile. Controls include:

- add RGB;
- multiply RGB;
- SinAdd and SinMul RGB plus period;
- color/saturation and SinColor;
- hue and SinHue;
- invert-all and invert-blend where supported;
- reset, clone profile, rename, save, load, and delete.

The preview uses IKEMEN `Anim` objects and `animSetPalFX`, making IKEMEN—not an external approximation—the preview authority.

## Effect composer

Each registered effect may contain:

- one base layer;
- zero through four overlay clones;
- the same AIR animation reused by every layer, or an explicitly different animation;
- one independent PalFX per layer;
- blend mode (`none`, `add`, `addalpha`, or reviewed `sub` usage);
- source and destination alpha;
- Explod ID offset;
- sprite priority/front-back order;
- visibility/enabled state.

The menu preview clones the IKEMEN animation object, then applies `animSetPalFX`, `animSetAlpha`, and layer ordering independently. Runtime layers reuse existing AIR/SFF assets through multiple native Explods. Cloning an effect must not duplicate SFF sprites.

The four-overlay limit matches the project’s broader layer discipline, limits accidental Explod growth, and keeps the player UI understandable. It may only be raised after performance and usability testing.

## Effect registry

Characters supporting this editor provide a registry that maps a stable effect ID to:

- player-facing name;
- base AIR animation;
- default Explod ID range;
- default position/binding/removal behavior;
- allowed blend modes;
- whether overlays are permitted;
- optional preview animation and scale;
- owning module/file.

Do not infer effects from arbitrary animation numbers at runtime. VS Code should validate missing animations, overlapping Explod IDs, and stale registry entries.

## Profile data

User profiles are mutable player data and remain separate from character source files. The planned location is:

```text
save/character-options/<character-id>/truecolor/<profile-id>/
  profile.json
```

Required metadata:

- format/schema version;
- character ID and character asset/version fingerprint;
- display name and stable profile ID;
- root/body PalFX;
- effect records and all enabled layers;
- creation and modification timestamps;
- compatibility and migration status.

The normalized profile produced by VS Code is the interchange format. Unknown fields should be retained during migrations when practical. A changed character/FX registry fingerprint triggers review instead of silently applying stale animation or Explod IDs.

## Runtime bridge

The game-side integration module should be generically named and packaged with the tool; it must not require a JNP prefix. Project profiles may configure their own prefixes and ID ranges.

At match load, native ZSS resolves the selected built-in profile or an approved generated custom profile. Runtime code creates only enabled layers and gives every layer a deterministic ID. Visual layers must not contain hitboxes, modify gameplay maps, or become gameplay authorities.

## Online boundary

- Packaged profiles with identical native data on both installations may be reviewed for online use.
- Freeform user-created true-color profiles are **offline-only initially**.
- Enabling custom profiles online requires a proven pre-match synchronization/handshake, matching schema and character fingerprints, deterministic native values, and rollback tests.
- A local cosmetic assumption is not sufficient evidence of netplay safety.
- The editor itself never becomes a pause-menu or mid-match Lua feature online.

## Validation and safety

Before saving or generating runtime code, validate:

- numeric PalFX and alpha ranges;
- animation existence;
- unique Explod IDs and offsets;
- maximum layer count;
- legal blend mode;
- required registry ownership;
- no hitboxes/gameplay behavior on visual clones;
- no Lua dependency in the generated match path;
- profile fingerprint compatibility.

Provide Reset Layer, Reset Effect, Reset Character, preview-before-apply, and confirmation before replacing or deleting a named profile.

## Rendering cautions

IKEMEN’s in-game preview is authoritative for alpha and blend interaction, especially with 32-bit sprites. The VS Code canvas is an authoring approximation and must label destination-alpha and subtractive differences. Shaders are outside this initial design because the planned IKEMEN 1.1 shader changes make early shader coupling expensive.
