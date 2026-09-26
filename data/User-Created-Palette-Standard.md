# User-Created Palette Save Standard

## Purpose

User-created palettes are mutable player save data. They are separate from:

- developer-authored base, form, layer, and projectile/FX palettes;
- community palettes accepted into a release;
- child palette variants packaged by the project;
- the protected full color-separation master.

The separation prevents an update or character reinstall from overwriting a player's colors and prevents personal palettes from becoming authoritative SFF build inputs by accident.

## Reference behavior: Capcom vs. Square 2.0

CVSQ declares one mutable ACT file in each character DEF. Ryu uses `pal7 = colors/custom.act`. Its color editor saves directly over that ACT and restores it by copying `pal1`. This is a useful runtime bridge, but it has three limitations: one save only, no user/profile separation, and placement inside the shipped character folder.

The extension recognizes a DEF palette path containing `custom` or `user` as a compatible runtime slot. Palette number 7 is **not** a universal rule.

## Authoritative save location

Named palettes are stored beneath the game root:

```text
save/
  palettes/
    <character-id>/
      <palette-id>/
        palette.act
        palette.json
```

`palette.act` is the portable 256-color root palette. `palette.json` records the display name, character ID, parent palette, content fingerprint, timestamps, component mapping, and optional runtime bridge.

Names are converted to stable filesystem IDs without forcing a naming prefix. Saving an existing ID requires explicit replacement confirmation and follows the extension's backup/history policy.

## Runtime bridge

IKEMEN and compatible MUGEN characters still consume a palette declared by the character DEF. The creator explicitly chooses an unused `palN` and a relative path such as:

```ini
[Files]
pal13 = colors/user.act
```

Deploying a named save copies its ACT into that runtime path. It does not rewrite the SFF, add the user palette to the project source library, or make Lua part of the match. Selection and deployment happen before play, keeping online gameplay free of a mid-match Lua palette dependency.

The extension never silently reserves `pal7`, replaces an occupied palette slot, or guesses which existing palette is expendable.

## Parent and variant relationship

A user palette records the embedded palette from which it was created, for example `1,1`. This is lineage metadata, not a fixed numbering allocation and not an alternate character definition. A player may create any number of named descendants from the same parent.

## Multi-component characters

Version 1 saves the root palette as `palette.act`. The manifest is intentionally component-based so a later compatible version can atomically include:

```text
palette.act
forms/<form-id>.act
layers/<layer-id>.act
root-fx/palette.act
palette.json
```

Unchanged form/layer/FX components should inherit or link to the root according to the project's palette-bank rules. A missing component must not be silently treated as compatible. Deployment of a future bundle must validate every required component before changing any runtime ACT.

## Compatibility and migration

- **CVSQ-style character:** use **Import Runtime Slot** to preserve `custom.act` as a named save, then continue deploying named saves to that same slot.
- **New character:** use **Configure Runtime Slot** and explicitly choose an unused DEF palette number and relative ACT path.
- **No matching character DEF:** saving remains possible under an SFF-derived character ID, but runtime deployment/configuration is unavailable until the SFF can be matched to its character DEF.
- **Master layout changed:** compare the saved fingerprint and palette schema before deployment. The save should be migrated or reviewed rather than silently reindexed.

## Player and creator views

Player-facing actions are: create named save, preview, deploy, import an existing custom slot, and open the save folder. Creator-facing configuration chooses the runtime slot and later defines required component bundles. Project source palette staging remains a separate tool.

