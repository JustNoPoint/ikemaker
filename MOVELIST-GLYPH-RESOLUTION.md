# Displayed-movelist glyph resolution evidence

This implementation follows the supported IKEMEN GO motif path instead of guessing a screenpack from unrelated workspace files.

Verified against the official `develop` engine sources on 2026-09-26:

- [`src/motif.go`](https://github.com/ikemen-engine/Ikemen-GO/blob/develop/src/motif.go) embeds `resources/defaultMotif.ini`, loads those defaults first, and then lets the configured user motif override them (comments at lines 21–35).
- The same file declares `FilesProperties.Glyphs` with `lookup:"def,,data/"` (line 78). IKEMaker mirrors that order as motif directory, game root, then `data/`.
- `GlyphProperties` documents `[Glyphs] ^3K = 63,0` as a token-to-sprite pair (around lines 244–255).
- [`resources/defaultMotif.ini`](https://github.com/ikemen-engine/Ikemen-GO/blob/develop/src/resources/defaultMotif.ini) supplies `glyphs = glyphs.sff` under `[Files]` and the default `[Glyphs]` mappings.

The installed game’s `save/config.ini` is authoritative for `Config.Motif`. A present but broken explicit Motif path is unresolved; IKEMaker does not silently substitute another installed screenpack. When no game can be established from the owning character, the editor remains unresolved and offers an explicit game-folder choice.

The installed `data/system.base.def` is used only as the readable local reference for embedded default `[Files] glyphs` and `[Glyphs]` values. The UI labels that source. User motif entries override it. If the reference is absent, IKEMaker does not invent default mappings.

Preview decoding is read-only, deduplicated by sprite pair, cached by motif/default/archive file identity, and capped at 128 unique sprites per catalog load. Budgeted or unsupported previews remain labeled and Source-editable.
