Character files have the following new features.


# <a name="air">Animations</a>

The character's animations file (referenced to as `anim` in the character's DEF file) has the following new features.  


## <a name="air_copyaction">Copy Action</a>

Animations can be duplicated by using `Copy Action`. This prevents having to manually copy the contents of one `[Begin Action]` into another.

Example
```ini
; Use Walk Forward animation for running
[Begin Action 100]
Copy Action 20
```

## <a name="air_transparency">Transparency</a>

### <a name="air_transparency_sub">Sub</a>

The `S` (subtractive) transparency is now also compatible with the alpha parameters, including interpolation.  

Example
```ini
[Begin Action 140]
140,0, 0,0, 59, , SS0D256
Interpolate Blend
140,0, 0,0, 1, , SS256D0
```


### <a name="air_transparency_sub">SubAdd</a>

The `subAdd` transparency mode can also be used in animations.  

Example
```ini
[Begin Action 150]
150,0, 0,0, 60, , SA
150,0, 0,0, 59, , SAS256D256
Interpolate Blend
150,0, 0,0, 1, , SAS0D0
```


# <a name="cmd">Commands</a>

Ikemen's input parser fixes several longstanding issues Mugen's had, such as proper direction charging and steady input delay.  
The command syntax also supports things that looked like they should've worked in Mugen but didn't, such as `~x+~y` triggering when both buttons are released at the same time.  
In addition, the Command file (referenced to as `cmd` in the character's DEF file) has the following new features.  

## <a name="cmd_defaultparameters">Default Parameters</a>

New command parameters also have their own default values that can be set in the `[Defaults]` group, similarly to `command.time` and `command.buffer.time`.  The following are now supported:

* `command.autogreater`: Default value for `autogreater`. Defaults to 1.
* `command.steptime`: Default value for `steptime`. Defaults to -1 if omitted.
* `command.buffer.hitpause`: Default value for `buffer.hitpause`. Defaults to 1 if omitted.
* `command.buffer.pauseend`: Default value for `buffer.pauseend`. Defaults to 1 if omitted.
* `command.buffer.shared`: Default value for `buffer.shared`. Defaults to 1 if omitted.


## <a name="cmd_parameters">Parameters</a>


### <a name="cmd_parameters_autogreater">autogreater (bool)</a>

Like Mugen, Ikemen expands consecutive identical directions into `>` inputs. For instance, `F, F` is automatically expanded into `F, >~F, >F`.  
Setting `autogreater` to 0 disables this behavior. Defaults to `command.autogreater`.


### <a name="cmd_parameters_buffer_hitpause">buffer.hitpause (bool)</a>

A command with `buffer.hitpause` set to 0 will not stay buffered during a hitpause.  
Defaults to `command.buffer.hitpause`.  
  
Note: This parameter deprecates the `Input.PauseOnHitPause` character constant.  


### <a name="cmd_parameters_buffer_pauseend">buffer.pauseend (bool)</a>

A command with `buffer.pauseend` set to 0 will not stay buffered during the `endcmdbuftime` window of `Pause` and `SuperPause`.  
Defaults to `command.buffer.pauseend`.  


### <a name="cmd_parameters_buffer_shared">buffer.shared (bool)</a>

A command with `buffer.shared` set to 0 will not be reset upon completion of another command with the same name.  
Defaults to `command.buffer.shared`.  


### <a name="cmd_parameters_steptime">steptime (int)</a>

Defines how many frames a command step stays active after being completed. In other words, how many frames are allowed for the player to enter the next input in a command.  
A value of -1 makes `steptime` use the same value as the command's `time`.  
Defaults to `command.steptime`.  
  
Example:  
```ini
[Command]
name = "Super Attack"
command = ~D, DF, F, D, DF, F, y
time = 60     ; 60 frames to complete entire motion no matter what
steptime = 10 ; 10 frames to enter next input in the sequence
```


## <a name="cmd_symbols">Symbols</a>


Command definition syntax is more flexible in Ikemen GO. Each command step can now accept multiple symbols correctly, as well as individual symbols for each key in the same step.  
  
Some examples:  
`/a + /b`: Hold `a` and hold `b`  
`~/c`: Not hold `c`  
`/60x + ~30y`: Charge `x` for 60 frames without releasing and release `y` after charging for 30 frames  


### <a name="cmd_symbols_or">|</a>

The `|` symbol makes a command step use OR logic. Similar to how `+` uses AND logic.  
  
Example: `x | y | z` means "press x or y or z".  
  
Note: `|` and `+` cannot be used in the same command step.  


### <a name="cmd_symbols_dollar">$</a>

Dollar sign was adjusted so that the buffer timer is shared between all variations of a "dollar" direction. For instance, inputting `DB, D, DF` only satisfies `$D` once rather than three times.
  
UPDATE: This change is currently disabled.  


### <a name="cmd_symbols_slash">/</a>

The `/` symbol now also allows defining a charge time.  
  
Example:  
If you charge `B` for 30 frames, `~30B` is true when you release it, while `/30B` is true for as long as you keep holding it.


### <a name="cmd_symbols_lr">L and R directions</a>

In addition to B and F, characters can now use L (left) and R (right) absolute directions when defining commands. These inputs are the same no matter which way the player is facing.  
  
Example:  
```ini
[Command]
name = "QCR_x"
command = ~D, DR, R, x
```


### <a name="cmd_symbols_n">N direction</a>

Characters can now also use N (neutral) direction when defining commands.  
  
Example:  
```ini
[Command]
name = "Test"
command = ~60N, F+a; press forward plus A after not pressing any direction for 60 frames
```

Note: For backward compatibility purposes and because it would otherwise lack any meaning, `$N` stands for "any press or release of any key".


# <a name="cns">Constants</a>

The character's Constants file (referenced to as `cns` in the character's DEF file) has the following new features.  

## <a name="cns_constants">[Constants]</a>

Defining a `[Constants]` group in the character's `cns` file allows you to set an unlimited amount of your own custom float type constants. These can be returned by the [Const](Triggers/#changed_const) trigger like any other constant.  
A character's constants will overwrite the default constants assigned via the `data/common.const` file.  
Constant names should not contain spaces or brackets.  

```ini
[Constants]
Default.Attack.LifeToPowerMul = 0.7
Default.GetHit.LifeToPowerMul = 0.6
Super.TargetDefenceMul = 1.5
Default.LifeToGuardPointsMul = -1.5
Default.LifeToDizzyPointsMul = 0
Default.LifeToRedLifeMul = 0.25
Default.IgnoreDefeatedEnemies = 1
Input.PauseOnHitPause = 1
```


## <a name="cns_data">[Data]</a>

The [Data] constants group accepts the following new constants.  

### <a name="cns_data_dizzypoints">dizzypoints</a>

Amount of [Dizzy](Miscellaneous-Info/#dizzy) Points to start with (defaults to same as `life`)

### <a name="cns_data_guardpoints">guardpoints</a>

Amount of [Guard](Miscellaneous-Info/#guardbreak) Points to start with (defaults to same as `life`)

### <a name="cns_data_guardsoundchannel">guardsound.channel</a>

The default channel for guardsounds. Defaults to `-1`, meaning the sound will play on any free channel.

### <a name="cns_data_hitsoundchannel">hitsound.channel</a>

The default channel for hitsounds. Defaults to `-1`, meaning the sound will play on any free channel.


## <a name="cns_size">[Size]</a>

The [Size] constants group accepts the following new constants.  


### <a name="cns_size_air_sizebox">air.sizebox</a>

Defines the character's width and height while jumping. See `stand.sizebox`.


### <a name="cns_size_attack_dist_width">attack.dist.width</a>

Sets the default attack distance that can trigger an enemy's proximity guard in the x-axis. Takes two parameters: `front` and `back`.  
The back distance allow a player to attack from behind the enemy and still trigger proximity guard.  

### <a name="cns_size_attack_dist_height">attack.dist.height</a>

Sets the default attack distance that can trigger an enemy's proximity guard in the y-axis. Takes two parameters: `top` and `bottom`.  

### <a name="cns_size_attack_dist_depth">attack.dist.depth</a>

Sets the default attack distance that can trigger an enemy's proximity guard in the z-axis. Takes two parameters: `top` and `bottom`.  


### <a name="cns_size_crouch_sizebox">crouch.sizebox</a>

Defines the character's width and height while crouching. See `stand.sizebox`.


### <a name="cns_size_down_sizebox">down.sizebox</a>

Defines the character's width and height while lying down. See `stand.sizebox`.


### <a name="cns_size_proj_attack_dist_width">proj.attack.dist.width</a>

Sets the default projectile distance that can trigger an enemy's proximity guard in the x-axis. Takes two parameters: `front` and `back`.  
The back distance allow a player's projectile to be behind the enemy and still allow them to enter proximity guard.


### <a name="cns_size_proj_attack_dist_height">proj.attack.dist.height</a>

Sets the default projectile distance that can trigger an enemy's proximity guard in the y-axis. Takes two parameters: `top`and `bottom`.  

### <a name="cns_size_proj_attack_dist_depth">proj.attack.dist.depth</a>

Sets the default projectile distance that can trigger an enemy's proximity guard in the z-axis. Takes two parameters: `top`and `bottom`.  


### <a name="cns_size_pushfactor">pushfactor</a>

The push factor constant determines how smoothly a player size box overlap is resolved. Lower values will make players push "out of" each other more gradually. Defaults to `1.0`.


### <a name="cns_size_stand_sizebox">stand.sizebox</a>

Defines the character's width and height while standing. Uses the same rectangle format as Clsn boxes. Overrides legacy size constants like `ground.front` or `height`.

Format:  
> stand.sizebox = *back_width*, *top_height*, *front_width*, *bottom_height*

Example
```ini
stand.sizebox = -15, -60, 16, 0
```


### <a name="cns_size_weight">weight</a>

The weight constant is factored into how much characters can push each other. If two players push each other with the same velocity, the player with the higher weight constant will win the struggle proportionally. Defaults to `100`.


### <a name="cns_size_depth">depth</a>

Defines the player width in the Z axis. Accepts two values, for `top`and `bottom` size respectively.  
This constant was named `z.width` in early Mugen beta versions. Ikemen GO reintroduces Z axis functionality, so this constant is brought back.  
Similar to `ground.front` and `ground.back` in the X axis.  


### <a name="cns_size_attackdepth">attack.depth</a>

The default Z width for every attack. In other words, the default `attack.depth` when a character uses a `Hitdef`. Accepts two values: `top`and `bottom`.  
This constant was named `attack.width` in early Mugen beta versions. Ikemen GO reintroduces Z axis functionality, so this constant is brought back.  


## <a name="cns_velocity">[Velocity]</a>

The [Velocity] constants group accepts the following new constants.  

### <a name="cns_velocity_airgethitkoadd">air.gethit.ko.add</a>

Extra velocity for a KO'd character in the air (x, y, z). Defaults to `-2, -2, 0` for 240p chars (auto scaled based on localcoord, if omitted).

### <a name="cns_velocity_airgethitkoymin">air.gethit.ko.ymin</a>

Minimum y-velocity for a non-falling KO'd character in the air. Defaults to `3` for 240p chars (auto scaled based on localcoord, if omitted).

### <a name="cns_velocity_groundgethitkoxmul">ground.gethit.ko.xmul</a>

Multiplier for the x-velocity of a KO'd character on the ground. Defaults to `0.66` for 240p chars.

### <a name="cns_velocity_groundgethitkoadd">ground.gethit.ko.add</a>

Extra velocity for a KO'd character on the ground (x, y, z). Defaults to `-2.5, -2, 0` for 240p chars (auto scaled based on localcoord, if omitted).

### <a name="cns_velocity_groundgethitkoymin">ground.gethit.ko.ymin</a>

Minimum y-velocity for a non-falling KO'd character on the ground. Defaults to `-6` for 240p chars (auto scaled based on localcoord, if omitted).


# <a name="def">Character Definition</a>

The character's Definition file (the `DEF` file itself) supports the following new features.  


## <a name="def_files">[Files]</a>

All parameters in the [Files] section of the character definition file are now optional. This update is particularly beneficial for AttachedChars that do not intend to utilize sprites, sounds or commands, but solely character state code. In such cases, they can simply declare st files and proceed accordingly without the need for additional parameters.

### <a name="def_files_font">Font</a>

Up to 10 fonts can be specified in the same way as in motif definition files (*fight.def* and *system.def*). These fonts can be used with the [Text](State-controllers/#new_textrender) controller. Fonts are searched in the following order: the character's DEF file directory, the motif directory, the mugen program directory, *data/*, and *font/*. Currently, font loading for [AttachedChar](Stage-features#info_attachedchar) is not supported.

```ini
font0 = font/jg.fnt
font1 = font/num1.fnt
font2 = mssansserif-tt36.def
font2.height = 36
```
### <a name="def_files_fx">FX</a>

Can load [CommonFX](Miscellaneous-info#common-files-air-cmd-const-fx-states) files directly from a character's .def file. This is useful for character-specific FightFX that you don't want to load globally.
In character's .def file, under the [Files] section, add the fx key. You can specify one or more .def files, separated by commas.

```ini
[Files]
fx = kfm_effects.def, data/fx/kfm_gofx.def
```
The engine will load kfm_effects.def and kfm_gofx.def when this character is loaded for a match. The associated assets will be automatically unloaded from memory when they are no longer in use.

### <a name="def_files_movelist">Movelist</a>

The Pause menu command list can display data assigned in the character's DEF file, under the `[Files]` section.

```ini
[Files]
movelist = movelist.dat
```

Additional movelists can be assigned with numbered parameters. `movelist` and `movelist0` both refer to index 0. If both are specified, `movelist` takes priority.

```ini
[Files]
movelist = normal.dat
movelist1 = evil.dat
movelist2 = poweredup.dat
```

The active movelist can be changed during a match with [ChangeMovelist](State-controllers-(new)/#new_changemovelist). The selected movelist index persists between rounds and resets when the character is loaded or reused for a new match.

## <a name="def_info">[Info]</a>

The information section accepts the following new parameters.

### <a name="def_info_ikemenversion">IkemenVersion</a>

Similarly to `mugenversion`, `ikemenversion` identifies the version of Ikemen GO that the content was developed for. One of its purposes is to maintain backward compatibility with legacy content, so, in general, content without this parameter will work as it did in Mugen. To take full advantage of Ikemen GO's features one should use it, however. Defaults to `0.0`.  

The behavior of some triggers and state controllers will change when this parameter is defined. Refer to this wiki's respective sections to see what changes when `ikemenversion` is used.  


### <a name="def_info_lifebarname">LifebarName</a>

The name of the character to be displayed on the lifebar can be specified. If no name is specified, the default name "DisplayName" will be used.


### <a name="def_info_portraitscale">PortraitScale</a>

Sets the portrait draw scale (same idea as lifebar `[FightFx]` scale), overriding the automatic scaling derived from the character's `localcoord`. If not set, a higher-resolution (`localcoord`) character needs a proportionally larger portrait, or you can just set `portraitscale` to compensate.

To match the scaling factor, use: **`portraitscale = localcoordX / 320`**

Example: a 720p character (`localcoord = 1280,720`) using a 120×240 portrait needs the following scale to display at the same apparent size as on a 240p character:
```ini
portraitscale = 4
```


### <a name="def_info_Fightfx.Prefix">Fightfx.Prefix</a>
Can override the default fightfx (the one typically used with the F prefix in SCTRLs like Explod or PlaySnd) for a specific character.
In character's .def file, under the [Info] section, add the fightfx.prefix key. The value should be the prefix of a [CommonFX](Miscellaneous-info#common-files-air-cmd-const-fx-states) that has been loaded either globally (in config.ini) or through the character's own fx definition.

```ini
[Info]
fightfx.prefix = KFMGO ; This character will now use 'KFMGO' as its default fightfx.

[Files]
; Make sure the corresponding CommonFX is loaded.
fx = data/fx/kfm_gofx.def
```
Sample CommonFx .def file:
```ini
[Info]
prefix = KFMGO 
fx.scale = 1
localcoord = 320, 240

[Files]
sff = kfm_gofx.sff 
air = kfm_gofx.air
snd = kfm_gofx.snd
```
When you use anim = F10 in this character's states, the engine will look for the animation from the CommonFX with the prefix KFMGO instead of the default one from fight.def.
This allows to give their characters unique hit sparks, guard effects, and other common visuals without modifying global files.

## <a name="def_map">[Map]</a>

This variant of associative array allows to link a string and a float value for each character. This can be used as a variable, as a tag, or as a flag for a specific technique. For example, a map can be set by adding the following description to the character def file:

```ini
[Map]
Ryu = 1
Streetfighter = 1
man = 1
birthyear = 1964
Japan = 1
Ansatsuken = 1
```

This map can be recognized by a [Map](Triggers-(new)/#new_map) trigger and its value can be modified or set by [MapSet](State-controllers-(new)/#new_mapset) and [MapAdd](State-controllers-(new)/#new_mapadd) state controllers. Note that spaces cannot be used in map names.

## <a name="def_shaders">[Shaders]</a>

Custom shaders can be loaded through the character.  
Define the shader name and specify the file path of the shader to load.

```ini
[Shaders]
kfm_zss_distortion = distortion.frag
kfm_zss_wobble = wobble.frag
kfm_zss_disintegrate = disintegrate.frag
```

Currently, the loaded custom shaders are available for use by the entire character, so need to choose a name that won't conflict with another character's.  
For Vulkan, an spv file with the same name and the extension .spv added is required.  
  
Custom shaders can be set or modified using [ShaderSet](State-controllers-(new)/#new_shaderset), Explod, and Projectile state controllers.  
Custom shaders on a character can be recognized by [Shader](Triggers-(new)/#new_shader) triggers.

## <a name="cns_remappreset">[RemapPreset X]</a>

Ikemen GO allows you to remap your character's sprites using the [RemapSprite](State-controllers/#new_remapsprite) state controller. You can use the *[RemapPreset X]* sections, declared in your character's CNS (referenced as `cns` in the character's DEF file), alongside other constant groups, to prepare multiple sprite remaps in advance and use them all at once. There can be multiple *[RemapPreset X]* sections in the cns file; `X` is the name of the preset.

```ini
[RemapPreset Claw]
5000,0 = 5000,100
5071,10 = 5071,110
5071,20 = 5071,120

[RemapPreset ClawAndMask]
5000,0 = 5000,200
5071,10 = 5071,210
5071,20 = 5071,220
```


# <a name="st">Character States</a>

The character's States files (referenced to as `st` in the character's DEF file) have the following new features.  

## <a name="st_negative">Negative States</a>

In MUGEN, declaring a negative StateDef in one file prevents doing so in other files. For characters with `ikemenversion`, this limitation is lifted, allowing one to define the same negative state in multiple files. State controllers defined in the current `StateDef` will be appended to the previously defined `StateDef`.  

Note: ZSS files and files defined under [CommonStates](Miscellaneous-Info/#CommonStates) don't require an IkemenVersion declared to work like this.  


## <a name="st_statedef_constant">Statedef Constant</a>

`Statedef` headers can now also parse constants using the `Const` trigger. This allows to easily change character state numbers to avoid conflicts between characters and gameplay systems.  
New constant variables can be used to make your code easier to read by replacing confusing numbers (like helper ID, states etc.) with Const trigger.  

```ini
[Constants]
TagInState = 5600

[StateDef const(TagInState)]
type = S
```


## <a name="st_variables">Variables</a>

The Mugen limit of 60 `var`, 40 `fvar`, 5 `sysvar` and 5 `sysfvar` has been lifted. The index will now accept any positive `int32` number.  
For performance reasons, `VarRangeSet` has been capped at setting 2500 variables per use.  

```ini
trigger1 = var(12345) > 0
```
