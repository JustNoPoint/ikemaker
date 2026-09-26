Some features may change during development of Ikemen GO, making content created for older versions of the engine sometimes become incompatible with newer versions. This page explains how to update the deprecated code.  


# <a name="char">Character Changes</a>


## <a name="char_sctrl">State Controllers</a>


### <a name="char_sctrl_hitscaleset">HitScaleSet</a>

This state controller was dropped altogether in Ikemen GO 1.0. Numerous other methods are available to build your own scaling systems.


## <a name="char_triggers">Triggers</a>


### <a name="char_triggers_animelemlength">AnimElemLength</a>

As a property of the current animation frame, `AnimElemLength` is now included in the `AnimElemVar` trigger, as `AnimElemVar(time)`.


### <a name="char_triggers_bgmlength">BgmLength</a>

As a property of the current bgm, `BgmLength` is now included in the `BgmVar` trigger, as `BgmVar(length)`.


### <a name="char_triggers_bgmposition">BgmPosition</a>

As a property of the current bgm, `BgmPosition` is now included in the `BgmVar` trigger, as `BgmVar(position)`.


### <a name="char_triggers_framespercount">FramesPerCount</a>

As a fight screen parameter, `FramesPerCount` is now included in the `FightScreenVar` trigger, as `FightScreenVar(time.framespercount)`.


### <a name="char_triggers_gethitvar_attr">GetHitVar(attr)</a>

The attribute parameter is now of type string instead of int, aligning it with the HitDef `attr` assignment as well as the `HitDefAttr` trigger.  

```ini
;trigger1 = GetHitVar(attr) = const(AttrAerialSpecialProjectile); old syntax
trigger1 = GetHitVar(attr) = A, SP; new syntax
```


### <a name="char_triggers_gethitvar_id">GetHitVar(ID)</a>

The `ID` syntax for this trigger has been deprecated in favor of `playerID`, for the sake of clarity.  

```ini
;trigger1 = GetHitVar(ID) = 100; old syntax
trigger1 = GetHitVar(playerID) = 100; new syntax
```


### <a name="char_triggers_getplayerid">GetPlayerID</a>

`GetPlayerID` was removed in Ikemen GO 1.0. It can be replaced with a cleaner `Player` redirection.

```ini
;trigger1 = GetPlayerID(5); old syntax
trigger1 = Player(5), ID; new syntax
;trigger2 = PlayerID(GetPlayerID(5)), Life; old syntax
trigger2 = Player(5), Life; new syntax
```


### <a name="char_triggers_indialogue">InDialogue</a>

As a motif related parameter, `InDialogue` is now included in the `MotifState` trigger, as `MotifState(dialogue)`.


### <a name="char_triggers_localscale">LocalScale</a>

While not direct replacements, `LocalCoord` or `Const240p` (or another appropriate scale) can be used instead in your calculations.


### <a name="char_triggers_majorversion">MajorVersion</a>

`MajorVersion` was removed in Ikemen GO 1.0. It is equivalent to `MugenVersion >= 1.0`. You may also be interested in the `IkemenVersion` trigger.


### <a name="char_triggers_rand">Rand</a>

The `Rand` trigger name, which was previously deprecated in version 0.98, has been completely removed in favor of the existing `RandomRange` trigger name.

### <a name="char_triggers_roundstate">RoundState = -1</a>

For better compatibility with Mugen content, the vanilla Mugen `RoundState` now returns 0 instead of -1 during the post-round sequence, just like Mugen. Dedicated triggers, `ContinueScreen`, `VictoryScreen`, and `WinScreen`, have been added to reliably detect the post-round sequence of a match.

### <a name="char_triggers_roundtype">RoundType</a>

`RoundType` was removed in Ikemen GO 1.0 in favor of the new `DecisiveRound` trigger. Values returned by `RoundType` are equivalent to:
>DecisiveRound: match ends if player win  
>p2,DecisiveRound: match ends if the player's opponent wins  
>DecisiveRound || p2,DecisiveRound: match ends if either of players wins (final round)  

### <a name="char_triggers_timeleft">TimeLeft</a>

The `TimeLeft` trigger name, which was previously deprecated in version 0.98, has been completely removed in favor of the existing `TimeRemaining` trigger name.


# <a name="lifebar">Lifebar Changes</a>

## <a name="lifebar_action">[Action]</a>

### <a name="lifebar_action_spacing">Spacing</a>

The spacing parameter was changed to be absolute instead of being measured from the end of the message sprite (which caused miscalculations). For this reason, a lifebar made for an older Ikemen version will need an increase in `team1.spacing` and `team2.spacing`.


## <a name="lifebar_action">[Stunbar]</a>

By default the stun bar will now work as the other bars, starting from full and emptying as the player loses points. To maintain the previous behavior, the `pX.invertfill = 1` parameter can be added.


# <a name="char">Stage Changes</a>

[TODO]
- Notes about stage camera changing entirely
- Others

# <a name="other">Other Changes</a>

## <a name="other_scripts">Deprecated functions</a>
Deprecated script.go functions have been removed. Direct equivalents are available, and they don't require providing playerno. Like other trigger functions that operate on players during a match, they can be redirected, making them more powerful than the old deprecated functions.

- `charChangeAnim` → `changeAnim`
- `charChangeState` → `changeState`
- `charMapSet` → `mapSet`
- `charSndPlay` → `sndPlay`
- `charSndStop` → `sndStop`

## <a name="other_scripts">Lua scripts</a>
Many Lua functions now take fewer/different parameters; some have been removed entirely (e.g., text wrapping is handled natively in font.go). We will not maintain unused Lua utilities. If your module relied on legacy helpers, vendor them inside your module. All embedded Lua functions are documented here: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua

Here, we'll cover only a practical example of creating a font and text, since the previous helper functions are missing.
```lua
-- Font userdata creation (can be skipped if you're using one of the already loaded fonts, e.g., motif.Fnt[1])
local fnt = fontNew(path)

-- TextSprite userdata creation (can be skipped if you're using one of the existing TextSpriteData entries in the motif table.)
local ts = textImgNew()

-- Assign font userdata to ts
textImgSetFont(ts, fnt)

-- This should be done before calling scaling and positioning functions (defaults to 240p).
textImgSetLocalcoord(ts, width, height)

-- Without assigning text, there is nothing to render.
textImgSetText(ts, text)

-- Other functions are optional - use them only if you want to change the default values.
textImgAddPos(ts, dx, dy)
textImgAddText(ts, text)
textImgApplyFontTuple(ts, fontTuple)
textImgApplyVel(ts, source)
textImgSetAccel(ts, ax, ay)
textImgSetAlign(ts, align)
textImgSetBank(ts, bank)
textImgSetColor(ts, r, g, b, a)
textImgSetPos(ts, x, y)
textImgSetFriction(ts, fx, fy)
textImgSetLayerno(ts, layer)
textImgSetMaxDist(ts, xDist, yDist)
textImgSetScale(ts, sx, sy)
textImgSetTextDelay(ts, delay)
textImgSetTextSpacing(ts, spacing)
textImgSetTextWrap(ts, wrap)
textImgSetVelocity(ts, vx, vy)
textImgSetWindow(ts, x1, y1, x2, y2)
textImgSetXShear(ts, xshear)
textImgSetAngle(ts, angle)
textImgSetXAngle(ts, xangle)
textImgSetYAngle(ts, yangle)
textImgSetProjection(ts, projection)
textImgSetFocalLength(ts, fLength)

-- Update advances the ts timers responsible for things like applying velocity.
-- It can be skipped if you are only rendering normal text.
textImgUpdate(ts)

-- Actual drawing call; should be called each frame.
-- The layer argument can be omitted (it will use whatever layer value is currently assigned).
textImgDraw(ts, layer)

-- Dumps the struct data for debugging purposes.
textImgDebug(ts, prefix)

-- In default scripts, we often reset only position or text so that changes made by
-- textImgAddPos and textImgAddText in the current frame are not cumulative.
textImgReset(ts, parts)
```

## <a name="other_hooks">Lua Hooks</a>
Modules that edited these screens may break or need updates. Old Lua hooks are still available but renamed:
* `start.f_result` → `game.result`
* `start.f_victory` → `game.victory`
* `start.f_continue` → `game.continue`
* `start.f_hiscore` → `game.hiscore`
* `start.f_challenger` → `game.challenger`

## <a name="other_modules">Modules</a>
Some modules are now obsolete. New native features (e.g., random music selection, layerno draw-order support) supersede prior module-based workarounds. Remove or update such modules accordingly.

## <a name="other_screenpack">Screenpack</a>
The new parser aligns closer with mugen conventions and shares structs across sections. As a result of this some Ikemen-only params were renamed. A conversion tool is provided for screenpacks released before 1.0:
https://github.com/ikemen-engine/screenpack-updater/releases
Vanilla mugen screenpacks without ikemen only features do not require any changes.
The screenpack parser now warns on any unrecognized field. If your module needs DEF-style config, it's recommended to keep it outside system.def and use:
* loadIni - read DEF/INI into Lua tables
* jsonDecode - load JSON

## <a name="other_music">Music</a>
Unified music parsing: naming convention changes.
In select.def: music, round.music, final.music, life.music, victory.music. volume, loopstart, loopend are optional and can be defined right after the parameter (separated by spacebar). Multiple entries of the same key are allowed; one is chosen at random.
In stage .def files: suffixes become prefixes. Examples:
* bgmusic.final -> final.bgmusic
* bgmloopstart.victory -> victory.bgmloopstart

When defining multiple BGMs in stages, per-parameter values accept comma-separated lists, one value per track (e.g., bgmloopstart = 12345, 45678).
