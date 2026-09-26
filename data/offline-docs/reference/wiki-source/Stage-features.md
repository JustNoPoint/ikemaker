# <a name="changed">Changes to Stage Parameters</a>

Some stage parameters are carried over from MUGEN, but with their functionality altered.  

## <a name="changed_camera">[Camera]</a>

### <a name="changed_camera_boundhigh">Skipped zoomout processing of boundhigh</a>

:warning: **Removed in nigthly.** Nigthly build matches MUGEN 1.1 behavior and the _<q>Skipped zoomout processing of boundhigh</q>_ described in this section below no longer applies. Use the new [`BoundHighZoomDelta`](https://github.com/ikemen-engine/Ikemen-GO/wiki/Stage-features#new_camera_boundhighzoomdelta) camera parameter to bring back this behaviour in a parametrized manner.

Ikemen `v0.99.0` and below: the lack of boundhigh zoomout correction is the intended behavior. Reasoning:
in MUGEN 1.1, boundhigh changes with zoomout, but the value to be corrected varies per stage, so it can't be done automatically due to the varying zoomdelta of the background layer that determines the boundhigh of the stage. For boundright and boundleft, there is almost always a background layer with a reference zoomdelta of 1, so the value that is shifted due to zoomout is constant. For boundhigh, the zoomdelta of the layer is set to 0.2 or 1. Furthermore, it cannot be determined just by reading the def which layer determines the boundhigh. In MUGEN 1.1, there is a bug that the stage does not reach the display limit unless it is in the maximum zoomout state, and in some cases, boundhigh is set according to this. Also, some creators set boundhigh ignoring the zoomout bug of 1.1. 


## <a name="changed_reflection">[Reflection]</a>

### <a name="changed_reflection_matching_params">Same parameters as `[Shadow]` group</a>

In addition to new parameters, reflections now support all of the same parameters as the original `[Shadow]` group (`color`, `yscale`, and `fade.range`).

### <a name="changed_reflection_layerno">layerno</a>

>layerno = *layer_number* (int)  
>Specifies the stage layer on which the reflection will be drawn  

Stage reflections can now use `layerno = -1` in order to draw the reflections behind layer 0. This allows reflection effects such as water puddles.  


### <a name="changed_reflection_offset">Offset</a>

>offset = *offset_x*, *offset_y* (float, float)  
>Specifies the offset at which reflections will be drawn.  

The `offset` parameter will offset the player's reflection by `offset_x`,`offset_y` amount.  


### <a name="changed_reflection_window">Window</a>

>window = *x1*, *y1*, *x2*, *y2* (float, float, float, float)  
>Specifies the size of a rectangle relative to the stage

The `window` parameter forms a rectangle relative to the stage, outside of which reflections will not be drawn.


### <a name="changed_reflection_xscale">XScale</a>

>xscale= *scale* (float)  

Determines the horizontal scale of the reflection.  
Defaults to 1.  


### <a name="changed_reflection_ydelta">YDelta</a>

>ydelta = *delta* (float)  

Determines how closely the reflection will follow the player's movement in the y-axis. A `ydelta` value of 1 will make no change, a value of 0 will make the reflection not move in the y-axis, and other values scale linearly.  
Defaults to 1.  


## <a name="changed_shadow">[Shadow]</a>

### <a name="changed_shadow_color">Color</a>

The `color` parameter will be disabled if the stage's `mugenversion` is 1.1 and its `ikemenversion` is 0.  


### <a name="changed_shadow_offset">Offset</a>

>offset = *offset_x*, *offset_y* (float, float)  
>Specifies the offset at which shadows will be drawn.  

The `offset` parameter will offset the player's shadow by `offset_x`,`offset_y` amount.  


### <a name="changed_shadow_window">Window</a>

>window = *x1*, *y1*, *x2*, *y2* (float, float, float, float)  
>Specifies the size of a rectangle relative to the stage

The `window` parameter forms a rectangle relative to the stage, outside of which shadows will not be drawn.


### <a name="changed_shadow_xscale">XScale</a>

>xscale= *scale* (float)  

Determines the horizontal scale of the shadow.  
Defaults to 1.  


### <a name="changed_shadow_ydelta">YDelta</a>

>ydelta = *delta* (float)  

Determines how closely the shadow will follow the player's movement in the y-axis. A `ydelta` value of 1 will make no change, a value of 0 will make the shadow not move in the y-axis, and other values scale linearly.  
Defaults to 1.  

### Changed Y Tilespacing from WinMugen</a>

>tilespacing = *tilespacing_x*, *tilespacing_y* (float, float)  
>Specifies the spacing between tiles in every axis.  

Tilespacing in WinMugen can be declared as a single parameter instead of two. If your WinMugen stage looks bad, it's probably this. Just repeat the tilespacing for both axis to fix it.

# <a name="new">New Stage Parameters</a>

Below are new parameters exclusive to Ikemen GO.  

## <a name="new_camera">[Camera]</a>

### <a name="new_camera_autozoom">AutoZoom</a>

An automatic zoomout is applied and the behavior of the stage changes.

* A default zoomout value is automatically calculated based on the stage bounds. While a zoomout value can be specified, it will be limited to prevent showing empty space.
* Values equivalent to zoomdelta are automatically applied based on delta values.
* The default values ​​for zoomindelay, zoomoutspeed, zoominspeed are changed.
* The default boundhighzoomdelta is 1.
* The default zoomanchor is bottom.
* autoresizeparallax is enabled by default.
* The boundleft, boundright and boundhigh values ​​are not affected by the zoomout value.

This function is a replicate the zoom behavior of the legacy IKEMEN engine.

### <a name="new_camera_autocenter">AutoCenter</a>

Always try to keep the camera centered between the characters. When this parameter is enabled, the `Tension` value is only used to calculate the camera zoom.  

### <a name="new_camera_boundhighzoomdelta">BoundHighZoomDelta</a>

>BoundHighZoomDelta = _bg_y_delta_ (float)<br/>
>Set to a value `>0` to extend the `BoundHigh` when the camera zooms in. Defaults to 0.

Related to how camera worked in Ikemen GO `v0.99.0` and older.

Automatically increases `BoundHigh` when the current camera zoom is not at minimum (`ZoomOut`), allowing more of the stage to be seen. Default value is 0 (constant `BoundHigh`). For values above 0, a value closer to 0 means a greater difference, as this value can be interpreted as the horizontal (y) delta of a stage background (`BG`) that determines the appropriate `BoundHigh` for the stage, if the `ZoomDelta` of this  is equal to 1.

For example, if a background that determines the `BoundHigh` uses **only**  vertical (y) delta and does not specify `ZoomDelta`, then you only need to set `BoundHighZoomDelta` to the exact value of the vertical (y) delta of the background. If the background has:

```ini
[BG Sky]
Type = normal
SpriteNo = 0, 0
Start = 0, 0
Delta = 0.5, 0.7
```

Then you need to set:

```ini
[Camera]
BoundHighZoomDelta = 0.7
```

For backgrounds using either only `ZoomDelta` or both `ZoomDelta` and vertical (y) delta the appropriate value needs to be adjusted manually. Some example follow, but you may still need different for different stages:

  - `ZoomDelta = 0.7` => `BoundHighZoomDelta = 1.95`,
  - `ZoomDelta = 0.4` => `BoundHighZoomDelta = 4.7`,
  - `ZoomDelta = 0.7`, `Delta=?, 0.7` => `BoundHighZoomDelta = 1.375`.


### <a name="new_camera_verticalfollowzoomdelta">VerticalFollowZoomDelta</a>

>VerticalFollowZoomDelta = _vf_zoom_delta_ (float)<br/>
>Set to a value above 0 to increase the `VerticalFollow` when the camera zooms in. Defaults to 0.

Automatically increases `VerticalFollow` when the current camera zoom is not at minimum (`ZoomOut`). Default value is 0 (constant `VerticalFollow`). For values above 0, the value of `VerticalFollow` is increased by the amount of _`current_zoom_in`_ multiplied by _`vf_zoom_delta`_, where _`current_zoom_in`_ is the difference between the _current_ camera zoom value and the _minimum_ camera zoom (as set by `ZoomOut`).


### <a name="new_camera_far">Far</a>

Define the far plane of the view frustum when the 3D model is rendered


### <a name="new_camera_fov">fov</a>

>fov= *fov* (float)  

Field of view of the camera when the 3d model is rendered.


### <a name="new_camera_lowestcap">LowestCap</a>

Enabling this parameter allows the camera to also zoom out when players are close to each other but reach the vertical end of the stage.  
Defaults to 0. Before Ikemen GO 1.0, the camera was hardcoded to act as if `lowestcap = 1`.  


### <a name="new_camera_near">Near</a>

Define the near plane of the view frustum when the 3D model is rendered


### <a name="new_camera_tensionvel">TensionVel</a>

Sets default `tension` correction speed, or how fast the camera will track the players horizontally. Differences can be noticed when a character teleports from one side of the screen to another in the x-axis. Defaults to 1.  
  
This parameter also affects how fast the stage camera will zoom.


### <a name="new_camera_yshift">YShift</a>

Define the y shift value of the camera when 3D model is rendered


### <a name="new_camera_yscrollspeed">YScrollSpeed</a>

>YScrollSpeed = _speed_factor_ (float)<br/>
>Set to a value between 0 and 1 to slow down the speed at which the camera scrolls vertically. Defaults to 1.

This parameter can be used to unconditionally slow down the speed at which the camera scrolls vertically. The rate of change of the camera's y position is simply multiplied by the set _`speed_factor`_ at each frame. The default value is 1, which is the fastest speed, matching MUGEN 1.1.

This can be applied e.g. to slow down vertical scrolling when the camera is in the _<q>Y Tension</q>_ mode (when `TensionLow` and `TensionHigh` are set), as the value of `VerticalFollow` is not applied in this case, especially if a zoom slowdown was also applied using parameters such as [`TensionVel`](https://github.com/ikemen-engine/Ikemen-GO/wiki/Stage-features#new_camera_tensionvel) or [`ZoomOutSpeed`](https://github.com/ikemen-engine/Ikemen-GO/wiki/Stage-features#new_camera_zoomoutspeed).


### <a name="new_camera_zoomanchor">ZoomAnchor</a>

This parameter brings back previous zoom out behavior from Ikemen GO 0.98.2. When the `ZoomAnchor` paramater is set to `bottom`, an "anchor" is placed in the bottom side of the screen, preventing the zoom to go beyond that. Any other parameter will default to `center` (Mugen 1.1 behavior).


### <a name="new_camera_zoomindelay">ZoomInDelay</a>

Makes the camera wait the specified number of frames before zooming in.  


### <a name="new_camera_zoominspeed">ZoomInSpeed</a>

>ZoomInSpeed = _speed_factor_ (float)<br/>
>Set to a value between 0 and 1 to slow down the speed at which the camera zooms in. Defaults to 1.

This parameter can be used to unconditionally slow down the speed at which the camera zooms in. The rate of change of zoom is simply multiplied by the set _`speed_factor`_ at each frame. The default value is 1, which is the fastest zoom speed, matching MUGEN 1.1.


### <a name="new_camera_zoomoutspeed">ZoomOutSpeed</a>

>ZoomOutSpeed = _speed_factor_ (float)<br/>
>Set to a value between 0 and 1 to slow down the speed at which the camera zooms out. Defaults to 1.

This parameter can be used to unconditionally slow down the speed at which the camera zooms out. The rate of change of zoom is simply multiplied by the set _`speed_factor`_ at each frame. The default value is 1, which is the fastest zoom speed, matching MUGEN 1.1.

As opposed to [`TensionVel`](https://github.com/ikemen-engine/Ikemen-GO/wiki/Stage-features#new_camera_tensionvel), this will forcibly keep the zoom out slow, so setting it too low can cause fast moving characters to be blocked by the screen edge before the camera fully zooms out.


## <a name="new_constants">[Constants]</a>

Stages in Ikemen GO can have float type constant variables set under stage's DEF *[Constants]* section. In-game these constant variables are detectable by all characters via [StageConst](Triggers/#new_stageconst) trigger. Constant variable names should not have spaces and brackets.

```ini
[Constants]
WaterGround = 1
```


## <a name="new_info">[Info]</a>


### <a name="new_info_attachedchar">AttachedChar</a>

The character with the specified path appears as the character on the stage side. The main use is to allow stages to realize functions that cannot be implemented with stage DEF file alone, such as stage interactivity.

This extra character is not taken into account for anything match related (not rendering lifebar, doesn't have to be beaten to finish the round, is not killable, is not part of P1 or P2 team). `TeamSide` trigger returns 0 for this character. AttachedChar initially begins in standby mode ("Tagged Out"). They must be tagged in prior to being able to interfere with characters via RedirectID.

Hint: Use `AssertSpecial` sctrl in order to turn the attached character invisible and/or make it not affecting the camera/pushboxes. [RedirectID](State-controllers/#changed_all_redirectid) may be useful for creating stage interactions.

*Example:*

```ini
AttachedChar = stages/myStage/stageInteraction.def
```

### <a name="new_info_multiple_attachedchar">Multiple AttachedChars</a>

Up to 4 AttachedChars can be assigned to a stage.

*Example:*

```ini
AttachedChar1 = stages/myStage/stageInteraction1.def
AttachedChar2 = stages/myStage/stageInteraction2.def
AttachedChar3 = stages/myStage/stageInteraction3.def
AttachedChar4 = stages/myStage/stageInteraction4.def
```

### <a name="new_info_ikemenversion">IkemenVersion</a>

Identifies which engine version the stage was made for. May alter behavior of certain features.  


### <a name="new_info_roundxdef">RoundXDef</a>

`RoundXDef` parameters can be used to preload more than 1 stage before match and swap to it at particular round. *X* in parameter name refers to round number and the parameter points to stage DEF file. The last loaded stage remains if the next round doesn't have `RoundXDef` parameter assigned. The specified path can be relative to the main stage DEF file, *data* directory, or top ikemen directory.
  
Note: Values read from the `RoundXDef`, `AttachedChar` and `Music` sections will be read from the main stage instead of each individual preloaded stage. This means that, for instance, you should define the music that plays in each round in the main stage DEF file rather than in each individual stage.
  
Hint: The main stage itself can be either a normal stage (in such case assigning `round1def` parameter doesn't make much sense) or a "shell" for example with only *[Info]* and *[Music]* sections, if it's meant to be used just to load particular `RoundXDef` parameters combination.

*Example:*

```ini
round1def = stages/kfm.def
round2def = stages/kfm_evening.def
round3def = stages/kfm_night.def
```

### <a name="new_info_roundloop">RoundLoop</a>

If set to 1, main stage, as well as stages loaded via [RoundXDef](Stage-features/#info_roundxdef) parameters, will show up in ascending order (regardless of round numbers assigned in `RoundXDef` parameters), looped over if needed.


## <a name="model">[Model]</a>

### <a name="model_environment">Environment</a>

>Environment= *hdr_file* (string)  

Filename of a hdr file. Controls the image based lighting of the 3d model.

### <a name="model_environmentintensity">EnvironmentIntensity</a>

>EnvironmentIntensity= *environmentintensity* (float)  

Controls the contribution of image based lighting to the render result of the 3d model

### <a name="model_offset">Offset</a>

>Offset= *offset_x*, *offset_y*, *offset_z* (float, float, float)  

X, Y, and Z coordinates of the 3d model

### <a name="model_scale">Scale</a>

>Offset= *offset_x*, *offset_y*, *offset_z* (float, float, float)  

X, Y, and Z scale of the 3d model

## <a name="music">[Music]</a>

### <a name="music_random">Multiple tracks (random selection)</a>

`*.bgmusic` parameters can point to **more than one** music file. To do this, provide a **comma-separated list** of tracks:

```ini
round2.bgmusic = sound/bgm/a.ogg, sound/bgm/b.ogg, sound/bgm/c.ogg
```

When the engine needs to play that music slot, it will **randomly pick one** of the listed tracks.

If you use multiple tracks, any related per-track settings (loop points / volume) can also be written as **comma-separated lists**, where each value applies to the track in the same position:

```ini
round2.bgmloopstart = 12345, 45678, 11111
round2.bgmloopend   = 23456, 56789, 22222
round2.bgmvolume    = 100,   90,   100
```

### <a name="music_bgmusicfinal">final.bgmusic</a>

Behaves like bgmusic, but refers to a track that should play on the final round.  
Note: A round is considered "final" when even a draw game will end the match. So it may vary with the maximum draw games setting.  

Optional adjustments:
* `final.bgmloopstart`
* `final.bgmloopend`
* `final.bgmvolume`

### <a name="new_music_bgmusicroundX">roundX.bgmusic</a>

Behaves like bgmusic, but refers to a track that should play on the round specified in the parameter's name (e.g. round2.bgmusic would play on the second round).

Optional adjustments:
* `roundX.bgmloopstart`
* `roundX.bgmloopend`
* `roundX.bgmvolume`

### <a name="new_music_bgmusiclife">life.bgmusic</a>

Like bgmusic but refers to track that should trigger when the character's life reaches certain percentage value.

Optional adjustments:
* `bgmratio`: percentage of life that should trigger bgmusic.life track (30% by default)
* `bgmtrigger`: 0 = music triggers only when character is at risk of being eliminated (there won't be next round when he/she lose), 1 = music triggers in all rounds
* `life.bgmloopstart`
* `life.bgmloopend`
* `life.bgmvolume`

### <a name="new_music_bgmusicvictory">victory.bgmusic</a>

Like bgmusic but refers to track that should trigger right after the final round K.O. and continue throughout the victory screen.

Optional adjustments:
* `victory.bgmloopstart`
* `victory.bgmloopend`
* `victory.bgmvolume`


## <a name="new_playerinfo">[PlayerInfo]</a>

### <a name="new_playerinfo_partnerspacing">PartnerSpacing</a>

* Specifies amount of pixels between team members at the round start (the value automatically takes stage localcoord into account) (default: 25)

```ini
partnerspacing = 15
```
### <a name="new_playerinfo_startx">Startx (P5-P8) </a>

* Sets the starting x-position, now supporting values for up to 8 players.

```ini
p6startx = 100
```
### <a name="new_playerinfo_starty">Starty (P5-P8) </a>

* Sets the starting y-position, now supporting values for up to 8 players.

```ini
p7starty = 20
```
### <a name="new_playerinfo_startz">Startz</a>

* Sets the starting z-position (used with z-axis), now supporting values for up to 8 players.

```ini
p1startz = -20
```
### <a name="new_playerinfo_facing">Facing (P5-P8) </a>

* Controls which way Players faces at the start, now supporting values for up to 8 players. Set to 1 to face right, or -1 to face left.

```ini
p8facing = -1
```


## <a name="new_scaling">[Scaling]</a>

### <a name="new_scaling_depthtoscreen">DepthToScreen</a>

Determines how a player's Z position affects their Y offset on screen, enabling finer control of perspective. Defaults to 1, which means 1 pixel in Z space equates to 1 pixel in vertical screen space.  
  
Example:
```ini
depthtoscreen = 0.5; For every 2 pixels in Z space, player is offset 1 pixel in vertical screen space
```


## <a name="new_stageinfo">[StageInfo]</a>

### <a name="new_stageinfo_portraitscale">PortraitScale</a>

Sets the portrait draw scale (same idea as lifebar `[FightFx]` scale), overriding the automatic scaling derived from the stage's `localcoord`. If not set, a higher-resolution (`localcoord`) stage needs a proportionally larger portrait, or you can just set `portraitscale` to compensate.

To match the scaling factor, use: **`portraitscale = localcoordX / 320`**

Example: a 720p stage (`localcoord = 1280,720`) using a 240×100 portrait needs the following scale to display at the same apparent size as on a 240p stage:
```ini
portraitscale = 4
```

## <a name="new_stageportrait">Stage Portraits</a>

Similarly to how characters can have a portrait, stages can have a portrait displayed on the select screen. Stage portraits are stored in the SFF file of the stage in question, using the index `9000, 1` and a default resolution of 240x100. The index used can be changed in `system.def` if desired.  


## <a name="new_zaxis">Z Axis</a>

Returning all the way back from the beta versions of DOS Mugen, characters can move in the Z axis if a stage allows it. That means the following stage parameters are once again operational:

```ini
[PlayerInfo]
topbound  =  -50    ;Top bound (z-movement)
botbound  =  50     ;Bottom bound

[Scaling]
topz     = 0       ;Top z-coordinate for scaling
botz     = 50      ;Bottom z-coordinate for scaling
topscale = 1       ;Scale to use at top
botscale = 1.2     ;Scale to use at bottom
```
# <a name="zip">Loading Stages from ZIP Archives</a>
Similar to how Ikemen GO can load characters from ZIP archives, this functionality has been extended to stages.
To load a stage from a ZIP archive, simply add the path to the .zip file under the [ExtraStages] section in your select.def file.

```ini
[ExtraStages]
; The engine will look for my_stage.def inside the zip
stages/my_stage.zip
```
the name of the stage's main definition file (.def) inside the archive must match the name of the ZIP file itself.
For example, for an archive named heaven.zip, the engine will search for heaven.def inside it. The .def file can be at the root of the archive or inside a subdirectory that shares the same name, just like with characters.
