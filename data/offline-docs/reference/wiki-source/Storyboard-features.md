# <a name="scenedef">[Scenedef]</a>

## <a name="scenedef_keys">keys</a>

`key.skip`: button that skips the currently rendered text and displays it in full. If the text is already fully rendered, the button skips to the next scene. (default: s)

`key.cancel`: button that cancels storyboard playback. (default: a, b, c, x, y, z, m)

## <a name="scenedef_stopmusic">stopmusic</a>

`stopmusic`: controls if the storyboard should stop the music at the start and end of storyboard playback. (default: 1)

# <a name="scene">[Scene X]</a>

## <a name="scene_bgmvolume">bgm.volume</a>

`bgm.volume`: adjust the volume. 100 is for 100% (default: 100)

## <a name="scene_bgmloopstart">bgm.loopstart</a>

`bgm.loopstart`: adjust the loop start sample number

## <a name="scene_bgmloopend">bgm.loopend</a>

`bgm.loopstart`: adjust the loop end sample number

## <a name="scene_fontscale">layerX.font.scale</a>

`layerX.font.scale`: scale used by `layerX.font`

## <a name="scene_fontheight">layerX.font.height</a>

`layerX.font.height`: TTF font height overriding of `layerX.font`

## <a name="scene_palfx">layerX.palfx</a>

Similarly to [PalFX state controller](http://www.elecbyte.com/mugendocs/sctrls.html#palfx) storyboard `anim` and `spr` elements can have temporary or permanent effects applied to their palettes via `palfx` element types. Refer to [this section](Lifebar-features/#existing_all_palfx) for a list of PalFX suffixes and description what each optional parameter does.

## <a name="scene_textspacing">layerX.textspacing</a>

`layerX.textspacing`: x, y additional spacing between rendered letters (default: 0, 0)

## <a name="scene_textwindow">layerX.textwindow</a>

`layerX.textwindow`: x1, y1, x2, y2 dimensions of the text rendering area. If window is set, text will automatically wrap within it, just like in victory screen text field.

## <a name="scene_velocity">layerX.velocity</a>

`layerX.velocity`: x, y velocity of the text layer, for scrolltexts and similar effects (default: 0, 0).