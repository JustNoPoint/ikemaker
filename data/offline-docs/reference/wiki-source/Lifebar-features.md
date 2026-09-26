Note: This wiki may use "Lifebar" and "Fight Screen" interchangeably.

# <a name="existing">Changes to existing sections</a>

## <a name="existing_all">*(all sections)*</a>

`layerno` is an element that allows you to set the layer on which the display element will be drawn. Layer 0 is in front of the background, but behind the players. Layer 1 is in front of the players, but behind the foreground. Layer 2 is in front of the foreground. The default is usually layer 0.

Ikemen GO also supports an additional layer, -1, which works the same as layer 0, but is rendered before it. With the correct use of this layer, you can change the rendering order of various lifebar groups and elements (for example, rendering faces below the life gauge), without affecting how the lifebar is drawn in relation to the players.

### <a name="existing_all_palfx">PalFX</a>

Similarly to [PalFX state controller](http://www.elecbyte.com/mugendocs/sctrls.html#palfx) lifebar `anim` and `spr` elements can have temporary or permanent effects applied to their palettes via `palfx` element types:
* `palfx.time`: *duration*: specifies the number of ticks that the palette effects should last (default: -1 - infinite)
* `palfx.add`: *add_r*, *add_g*, *add_b*: see below
* `palfx.mul`: *mul_r*, *mul_g*, *mul_b*: each add component is added to the appropriate component of the palette, and the result is multiplied by the appropriate mul component divided by 256 (default: no change, i.e. add = 0,0,0 and mul = 256,256,256)
* `palfx.sinadd`: *ampl_r*, *ampl_g*, *ampl_b*, *period*: creates an additional sine-wave palette addition effect (period specifies the period of the sine wave in game ticks, and the amplitude parameters control the amplitude of the sine wave for the respective components)
* `palfx.sinmul`: *ampl_r*, *ampl_g*, *ampl_b*, *period*: Similliar to "sinadd" parameter but instead it creates effect related to "mul" parameter.
* `palfx.sincolor`: *ampl*, *period*: Similliar to "sinadd" parameter but instead it creates effect related to "color" parameter.
* `palfx.invertall`: if non-zero, then the colors in the palette will be inverted (applied before effects of add and mul), creating a "film negative" effect (default: 0)
* `palfx.color`: this affects the color level of the palette (applied before invertall, add and mul) - if value is 0, the palette will be greyscale; if value is 256, there is no change in palette; values in between will have an intermediate effect (default: 256, range 0 to 256)

Hint: When it comes to lifebars the main use case of palfx is adjusting palette without need to duplicate sprites to do so.

*Example:*

```ini
p1.front90.palfx.mul = 250,224,120
```

### <a name="existing_all_palfx">PalFX for texts </a>

Starting from 1.0 RC1, text elements that use sprite fonts (sff or fnt) also support PalFX

*Example:*

```ini
round.default.palfx.mul = 256, 64, 64
```


### <a name="existing_all_prefix_opperators">Prefix operators</a> 

Parameters starting with "pX" or "teamX" can now use `*` and `|` operators, allowing the same parameter to be used by multiple players.  
The `*` (any) operator will apply the parameter to all players/teams, while the `|` (or) operator will do it for the specified ones only. See examples.

*Example:*

```
;p1.bg0.anim = 10
;p3.bg0.anim = 10
;p5.bg0.anim = 10
;p7.bg0.anim = 10
p1|p3|p5|p7.bg0.anim = 10

;team1.text.layerno = 2
;team2.text.layerno = 2
team*.text.layerno = 2
```


### <a name="existing_all_text_angle">Text angle</a> 

Text elements now also support angle parameters.

*Example:*

```ini
p1.name.angle = 30
```


### <a name="existing_all_top">Top layer</a>

All sections that have access to background elements rendering (`bg`, `bg0` etc.) also support an additional layer, called `top`, which is rendered on top of the other elements from the same layer.

### <a name="existing_all_window">window setting</a>

Additional layout settings can be used with display element types such as spr, anim, and text. The `window` setting specifies a rectangular box with (x1, y1) and (x2, y2) at opposite corners, with the upper left corner of the screen as (0, 0). Only the part of the display element type that comes within this box (the "window") will be drawn. If you do not need the windowing effect, you can omit this line.

### <a name="xshear">xshear</a>

Specifies the amount of horizontal shearing to apply to the element, text elements that use sprite fonts (sff or fnt) also support xshear. Defaults to 0.

```ini
p1.front.xshear = -.4
```

## <a name="existing_combo">[Combo]</a>

### <a name="combo_autoalign">Autoalign</a> 
* `teamX.autoalign`: When set to 0, it disables automatic spacing adjustment. Defaults to 1

### <a name="existing_combo_value">Damage and percentage value</a>

`teamX.text.text` can display the following data:
* `%i`: combo count (already existing in MUGEN)
* `%d`: combo damage (integer value returning the total combo damage up to this point)
* `%p`: combo damage percentage in relation to the maximum life

The combo percentage value can be formatted using the following new parameters:
* `format.decimal.places`: how many decimal places should the percentage damage be rounded to (0 means no decimal point will be shown)
* `format.decimal.separator`: what symbol should be used to separate the decimal points of the value


### <a name="existing_combo_shake_counter">Counter.shake</a> 

The shaking effect of the combo counter number is now configurable. The parameters are similar to the `EnvShake` state controller.  

* `counter.shake.time`: total duration of the shake.
* `counter.shake.freq`: oscillation frequency (degrees per frame). (default: 60)
* `counter.shake.phase`: initial phase offset (degrees).
* `counter.shake.ampl`: amplitude of position offset shake.
* `counter.shake.scale`: amplitude of scale shake. The scale multiplier oscillates between `scale` and `1/scale`.
* `counter.shake.dir`: initial angle of the offset shake (degrees).
* `counter.shake.diradd`: amount added to `dir` each frame (degrees).
* `counter.shake.decay`: decay exponent: `1` = linear, `0` = constant, `>1` = faster falloff, `<1` = slower falloff.

Note: Older parameters `counter.shake`, `counter.time` and `counter.mult` are deprecated but still supported.  

Example:
```ini
[Combo]
team*.counter.shake.time = 10
team*.counter.shake.freq = 90
team*.counter.shake.ampl = 2
team*.counter.shake.scale = 1.5
team*.counter.shake.decay = 2
```


### <a name="existing_combo_shake_text">Text.shake</a>

The combo display text group also supports the same parameters as `counter.shake`.  

Example:
```ini
[Combo]
team*.text.shake.time = 8
team*.text.shake.freq = 120
team*.text.shake.ampl = 3
team*.text.shake.dir = 90
team*.text.shake.diradd = 15
team*.text.shake.decay = 1.5
```


### <a name="existing_combo_speed">Unhardcoded show/hide speed</a>

* `teamX.showspeed`: text showing up speed (1 = instant; default = 8)
* `teamX.hidespeed`: text hiding speed (the larger value, the faster speed; default = 4)

### <a name="existing_combo_fonts">Multiple fonts</a> 

*counter.font* and *text.font* elements can store additional value in its name, using following format:

`counter<hits_count>.font`   
`text<hits_count>.font`

font assigned like this replaces default *counter.font* or *text.font* element, if hit count is higher or equals the *\<hit_count\>*. For example *counter10.font* means that counter element will use this font if hit count is equal or greater than 10 hits, otherwise default *counter.font* element is used. There can be multiple font assignments with extra value (no hard limits).

## <a name="existing_face">[Face] *(all variants)*</a>

### <a name="existing_face_darkenshare">Darken share</a>

`pX.face.darkenshare`: set to 1 to make the portrait darken or not like the character during the effect of SuperPause `darken` parameter. If 0, the portrait will darken always. Defaults to 0 (Mugen 1.1 behavior).


### <a name="existing_face_ko">KO overlay</a>

`pX.ko`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)

Works just like turns mode pX.teammate.ko, with an overlay rendered on top of the defeated party member.


### <a name="existing_face_leaderontop">leaderOnTop</a> 

Enabling this parameter inverts the drawing order of the members of the team, thus drawing players 1 and 2 on top of their partners.


### <a name="existing_face_palshare">Palette share</a>

`pX.face.palshare`: set to 0 to disable face portrait palette sharing with character sprites (default: 1, WinMugen and MUGEN 1.0 behavior)


### <a name="existing_face_palfxshare">PalFX share</a>

`pX.face.palfxshare`: set to 1 to allow PalFX affecting character to also affect face portrait (default: 0, Mugen 1.1 behavior)


## <a name="existing_files">[Files]</a>

### <a name="existing_files_commonfx">CommonFx</a>

`fx1 / fx2 / fx3`: common fx file declaration. These parameters work like [CommonFX from config.json](Miscellaneous-Info/#CommonFX).


## <a name="existing_info">[Info]</a>


### <a name="existing_info_name">author</a> 

Lifebars now accept an author name parameter like characters and stages. It allows characters to identify them with the `FightScreenVar` trigger.


### <a name="existing_info_doubleres">doubleres</a>

Some "D4" (high-resolution) lifebars made for the 2002 version of MUGEN require the Doubleres = 4 parameter in mugen.cfg. Mugen 1.0 replaced the Doubleres functionality with coordinate spaces. Setting this option to 1 replicates the Doubleres = 4 lifebar behavior (all fonts are scaled down by 50%). The default setting is 0.


### <a name="existing_info_ikemenversion">ikemenversion</a>

An `ikemenversion` parameter can now be added to the section. It may affect the behavior of certain parameters.  
At the moment, defining any `ikemenversion` will disable the hardcoded delay on KO, Double KO and Time Over screens.  


### <a name="existing_info_localcoord">localcoord</a>

`localcoord` sets the width and height of the local coordinate space, which is the same as the screenpack's localcoord by default. In MUGEN, lifebars always use the same localcoord as the screenpack. This parameter allows you to set a coordinate space for the lifebar that is independent of the screenpack.


### <a name="existing_info_mugenversion">mugenversion</a> 

For completeness sake, a `mugenversion` entry will also be parsed.  


### <a name="existing_info_name">name</a> 

Lifebars now accept a name parameter like characters and stages. It allows characters to identify them with the `FightScreenVar` trigger.


## <a name="existing_lifebar">[Lifebar] *(all variants)*</a>

### <a name="existing_lifebar_shift">Front / mid element shifting</a>

Parameters are used to shift from one sprite/animation (front and mid elements) to another sprite/animation (shift element) depending on the amount of life. This is done by automatically adjusting the trans addalpha values of the shift element rendered on top of the front and mid elements.

* `pX.shift`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)
* `mid.shift`: set to 1 to make the shift element also affect mid element (default: 0)


### <a name="existing_lifebar_leaderontop">leaderOnTop</a> 

Enabling this parameter inverts the drawing order of the members of the team, thus drawing players 1 and 2 on top of their partners.


### <a name="existing_lifebar_warn">Lifebar warning range and element</a>

Specifying a warning percentage range and an element will draw a sprite or animation when life values are within range (*pX.warn.range* and *pX.warn*, respectively). Displays the 'warn' layer once the life, guard points or stun points are within `pX.warn.range`.  

* `pX.warn.range`: integer pair interpreted as percentages of the bar, for example `pX.warn.range = 20,1` will trigger the `pX.warn` element when lifebar percentage is between 20% and 1% (nearly depleted for lifebar).
* `pX.warn`: sprite or animation layer with all the standard elements such as *offset, layerno, facing, vfacing,* and *spr* or *anim*.

For example, for p1 to display animation 6 when the bar is between 20% and 1% (i.e. nearly depleted for lifebar):

```ini
p1.warn.range = 20,1
p1.warn.anim = 6
p1.warn.offset = 0,0
p1.warn.layerno = 0
p1.warn.facing = 1
p1.warn.vfacing = 1
```

### <a name="existing_lifebar_value">Life value</a>

* `pX.value`: followed by usual suffixes to control font, displayed string, and text layout settings (offset, facing, layerno, scale, window)
* `pX.value.text`: element that adjusts the displayed string, accepts following variables:
`%d` = life value, `%p` = percentage life value

### <a name="existing_lifebar_red_value">Red Life value</a>

* `pX.red.value`: followed by usual suffixes to control font, displayed string, and text layout settings (offset, facing, layerno, scale, window)
* `pX.red.value.text`: element that adjusts the displayed string, accepts following variables:
`%d` = red life value, `%p` = percentage life value

*red.value* element can store additional value in its name, using following format:

`red.value<redlife_value>`

fonts added like this replaces default *red.value* element, if red life value is higher or equals the *\<redlife_value\>*. For example *pX.red.value100.font* means that red life will use the font assigned by this element if player's red life reaches 100, otherwise default *pX.red.value* element is used. There can be multiple fonts/texts assignments with extra value (no hard limits).

### <a name="existing_lifebar_front">Multiple front elements</a>

*front* element can store additional value in its name, using following format:

`front<life_percentage>`

spr / anim added like this replaces default *front* element, if life percentage is higher or equals the *\<life_percentage\>*. For example *pX.front90.spr* means that lifebar will use sprite/animation assigned by this element if player's health ratio is between 90-100%, otherwise default *pX.front* element is used. There can be multiple spr/anim assignments with extra value (no hard limits).

### <a name="existing_lifebar_value">Multiple value elements</a>

*value* element can store additional value in its name, using following format:

`value<life_percentage>`

fonts added like this replaces default *value* element, if life percentage is higher or equals the *\<life_percentage\>*. For example *pX.value* means that lifebar will use font/text assigned by this element if player's health ratio is between 90-100%, otherwise default *pX.value* element is used. There can be multiple fonts assignments with extra value (no hard limits).

### <a name="existing_lifebar_redlife">Red Life</a>

`pX.red`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)

Controls Red Life bar visuals. If enabled, the bar is rendered at the bottom (below `mid` and `front` elements)

*red* element can store additional value in its name, using following format:

`red<redlife_value>`

spr / anim added like this replaces default *red* element, if red life value is higher or equals the *\<redlife_value\>*. For example *pX.red100.spr* means that red life will use sprite/animation assigned by this element if player's red life reaches 100, otherwise default *pX.red* element is used. There can be multiple spr/anim assignments with extra value (no hard limits).


### <a name="existing_lifebar_depleting">Unhardcoded Life depleting behavior</a>

* `mid.freeze`: 0 disables mid element wait during gethit/combo (default: 1)
* `mid.delay`: frames before mid element starts decreasing (default: 30)
* `mid.mult`: moving relation between mid value and life (default: 1.0)
* `mid.steps`: mid value decreasing steps (default: 8)
* `pX.scalefill`: allows bars to deplete by scaling the sprite itself instead of cropping it (default: 0) 
* `px.range.y`: defines a vertical range for the bar, allowing it to deplete vertically when used instead of range.x 


## <a name="existing_name">[Name] *(all variants)*</a>

### <a name="existing_name_leaderontop">leaderOnTop</a> 

Enabling this parameter inverts the drawing order of the members of the team, thus drawing players 1 and 2 on top of their partners.


## <a name="existing_powerbar">[Powerbar] *(all variants)*</a>


### <a name="existing_powerbar_counter">Counter text</a>

In mugen `counter` element is used for printing current powerbar level. Ikemen GO unhardcodes string used by this element.

`pX.counter.text`: element that adjusts the displayed string, accepts `%i` variable (replaced with power level)


### <a name="existing_powerbar_leaderontop">leaderOnTop</a> 

Enabling this parameter inverts the drawing order of the members of the team, thus drawing players 1 and 2 on top of their partners.


### <a name="existing_powerbar_shift">Front / mid element shifting</a>

Parameters used for shifting from one spr/anim (*front* and *mid* element) into another spr/anim (*shift* element), depending on amount of power (done by automatically adjusting trans addalpha values of *shift* element rendered on top of *front* and *mid* element)

* `pX.shift`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)
* `mid.shift`: set to 1 to make the shift element also affect mid element (default: 0)


### <a name="existing_powerbar_levelsnd">Level sound assignment for each player</a>

`levelX.snd` parameter from now supports `pX.` prefix in order to optionally differentiate sounds among players (or to disable them for particular player by assigning dummy sound entry).


### <a name="existing_powerbar_front">Multiple front elements</a>

*front* element can store additional value in its name, using following format:

`front<power_value>`

spr / anim added like this replaces default *front* element, if power value is higher or equals the *\<power_value\>*. For example *pX.front3000.spr* means that powerbar will use sprite/animation assigned by this element if player's power reaches level 3 (3000), otherwise default *pX.front* element is used. There can be multiple spr/anim assignments with extra value (no hard limits).

### <a name="existing_powerbar_value">Power value</a>

* `pX.value`: followed by usual suffixes to control font, displayed string, and text layout settings (offset, facing, layerno, scale, window)
* `pX.value.text`: element that adjusts the displayed string, accepts following variables:
`%d` = power value, `%p` = percentage power value

### Configurable lifebar power value rounding

* `p#.counter.format.rounding` `int` `defaults: 1000`  
Changes the rounding of `p#.counter.text`.

* `p#.value.format.power.rounding` `int` `defaults: 1`  
Changes the rounding of `p#.value.text`.

### <a name="existing_powerbar_levelbars">Separate bar for each power level</a>

* `pX.levelbars`: 1 changes single bar design into separate bars for each power level (default: 0)~

### <a name="existing_powerbar_count">Multiple fonts</a> 

*counter.font* element can store additional value in its name, using following format:

`counter.font<power_value>`

font assigned like this replaces default *counter.font* element, if power value is higher or equals the *\<power_value\>*. For example *pX.counter3000.font* means that powerbar will use this font if player's power reaches level 3 (3000), otherwise default *pX.counter.font* is used. There can be multiple font assignments with extra value (no hard limits).

### <a name="existing_powerbar_front">Max Params for elements </a>

`<elem>Max.`

Elements assigned like this replaces default element, if power value is at the *\<power_max\>*. For example
*pX.frontMax.anim* means that powerbar will use this front.anim if player's power reaches max level, otherwise default *pX.front.anim* is used.


## <a name="existing_round">[Round]</a>


### <a name="existing_round_defaultsound">Default sound for round start</a>

In Mugen `round.default.snd` assignment didn't work at all. In Ikemen GO it will trigger once there are no more valid 'roundX.snd' sound assignments that match the current round number.


### <a name="existing_round_dko_showdraw">DKO.showdraw</a>

Enabling this parameter will also display the draw game announcement for a double KO.  


### <a name="existing_round_defaultsound">Fadein/Fadeout anim and snd</a>

* `fadein.anim`: Animation that should play instead of the default fadein effect.
* `fadeout.anim`: Animation that should play instead of the default fadeout effect.
* `fadein.snd`: Sound that should play at the beginning of the fadein.
* `fadeout.snd`: Sound that should play at the beginning of the fadeout.

### <a name="existing_round_single">Single round elements</a>

If it exists, the `round.single.` group will be used when the match consists of only 1 round.

```ini
round.single.offset = 640, 480
round.single.font = 1, 0, 0
round.single.text = "Get ready!"
round.single.displaytime = 60
round.single.scale = 1, 1
round.single.snd = 0, 11
```


### <a name="existing_round_final">Final round elements</a>

If it exists, the `round.final.` assignment will trigger in the final round instead of 'roundX.' assignment.  
Note: A round is considered "final" when even a draw game will end the match. So it may vary with the maximum draw games setting.  


### <a name="existing_bg_top_layers_roundanims">Background and top layers for all round animations</a>

Optional background and top layer functionality was added to the `round_default, round_final, fight, ko, dko, to, draw, win, win2, win3` and `win4` elements:

* `.top`: top layer feature; allows sprite or animation displayed on top of all other layers. layerno is enabled for this layer but is always rendered last in its respective stack.
* `.bgX`: where X is a number 0-32. Allows a sprite or animation layer to be displayed under the parent layers (see list of supported parent layers below). Additionally, layerno is enabled for these layers, enabling rendering of animations/sprites in the background or foreground to achieve complex effects (i.e. wrapping around characters).

These layers do not support the `displaytime` argument: for example, the `round.default.bgX` layers are erased when `round.default` and `roundX` (as applicable) have reached their `displaytime`, or when `callfight` is triggered.

Background and top layer functionality is available for these parent elements:
```ini
round.default.bgX
round.default.top
round.final.bgX
round.final.top
fight.bgX
fight.top
ko.bgX
ko.top
dko.bgX
dko.top
to.bgX
to.top
draw.bgX
draw.top
win.bgX
win.top
win2.bgX
win2.top
win3.bgX
win3.top
win4.bgX
win4.top
```

The rendering order for `round.default` is now as follows:
```ini
round.default.bg0
...
round.default.bg32
round.default
roundX
round.default.top
```

The rendering order for parent elements other than `round.default` are as follows (example granted with `fight` element):

```ini
fight.bg0
...
fight.bg32
fight
fight.top
```

### <a name="existing_round_slowdown">Unhardcoded KO slowdown</a>

* `slow.fadetime`: KO slowdown fade length (default: 75% of `slow.time`)
* `slow.speed`: KO slowdown game speed adjustment (default: 0.25)

Example:

```ini
slow.time = 60
slow.speed = 0.25
slow.fadetime = 45
```
It works as follows: KO slowdown starts as soon as the opponent team is defeated. Total KO slowdown duation is equal *slow.time* amount of frames (60). The game speed is multiplied by *slow.speed* value (25%), which in this example lasts for 15 frames (with default speed affected by *slow.speed* it ends up being 1s), and than is linearly restored to 100% of the original speed in the duration of *slow.fadetime* (45 frames).


### <a name="existing_round_fade">Unhardcoded match fade</a>

* `fadein.time`: round start fade time (default: 30)
* `fadein.col`: round start fade color (default: 0,0,0)
* `fadeout.time`: round end fade time (default: 30, extends `over.time` if `fadeout.time` is longer)
* `fadeout.col`: round end fade color (default: 0,0,0)
* `shutter.time`: skip intro fade time (default: 15, whole anim is twice as long)
* `shutter.col`: skip intro fade color (default: 0,0,0)


### <a name="existing_round_callfight">Unhardcoded time before fight is called</a>

In mugen time between `round` element is triggered and the `fight` is called is hardcoded to 60 frames. In Ikemen GO this value can be adjusted via following parameter:
* `callfight.time`: time to wait before starting fight (default: 60)


### <a name="existing_round_forcewintime">Unhardcoded win pose safety timeout</a> 

When a round ends, Mugen has a hidden timer of 900 frames after which players will be forcibly sent to their win/lose states even if they are somehow frozen. In Ikemen this timer can be adjusted with the `over.forcewintime` parameter.


### <a name="existing_round_dko_time">Unique timing for Time Over and Double KO</a> 

These announcements no longer necessarily share `KO.time` and `KO.sndtime`. Unique timing can be specified with `DKO.time`, `DKO.sndtime`, `TO.time` and `TO.sndtime`.


### <a name="existing_round_winsound">Win and drawn elements sound support</a>

If parameter with `.snd` suffix is specified, `win` elements (`win`, `win2`, `win3`, `win4`) and/or `drawn` element also trigger sound.

### <a name="existing_round_winside">Win element team side variants</a>

`win` elements (`win`, `win2`, `win3`, `win4`) can be prefixed with `p1.` and/or `p2.`, allowing lifebar to render different win text/spr/anim for team 1 and team 2.

### <a name="existing_round_winsize">Win element team size variants</a>

Ikemen GO supports 2 more team size dependant `win` elements:
* `win3`: for matches with 3 players
* `win4`: for matches with 4 and more players

If not specified lifebar uses `win2` element.

### <a name="existing_round_wintype">Win type events</a>

Following win type events are supported:
* `n`: win by normal attack
* `s`: win by special attack
* `h`: win by hyper attack
* `c`: win by cheese (defeated when blocking)
* `t`: win by time over
* `throw`: win by normal throw
* `suicide`: win by suicide
* `teammate`: being defeated by your own teammate
* `perfect`: perfect round
* `clutch`: clutch round

`perfect` win type always happens upon round won without taking any damage. Remaining win types are mutually exclusive.  
`clutch` win type always happens upon round won with health below the ``clutch.threshold``. If the parameter isn't defined, the default is under 10% 


Use p1 or p2 prefix, depending on winning team, followed by win type event name, followed by usual parameters:
* `pos`
* `bg`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)
* `text`: followed by usual suffixes to control font, displayed string, and text layout settings (offset, facing, layerno, scale, window)
* `time`: how many ticks since KO until text/bg should be rendered
* `displaytime`: how long to render text/bg
* `snd`: sound to play
* `sndtime`: how many ticks since KO until snd should play

*Example assignments:*

```ini
p1.perfect.pos = 0, 0
p1.perfect.bg.offset = 60, 170
p1.perfect.bg.anim = 80
p1.perfect.text.offset = 60, 170
p1.perfect.text.font = 1,0
p1.perfect.text.text = Perfect!
p1.perfect.time = 100
p1.perfect.displaytime = 200
p1.perfect.snd = 1,0
p1.perfect.sndtime = 100
```

### <a name="new_clutch_threshold">Clutch Win Type Threshold</a> 

The threshold required to trigger the clutch win type can be changed using the ``clutch.threshold`` parameter. If the parameter isn't defined, the default is 10%.

*Example assignment:*

```ini
clutch.threshold = 5 ;Threshold at 5% health
```

### <a name="ai.win">AI win elements</a> 

If it exists, the `ai.single` group will be used when match is won by a AI controlled opponent.

*Example:*
```ini
ai.win.time = 60
ai.win.offset = 160, 70
ai.win.font = 4,0
ai.win.scale = 0.8, 0.8
ai.win.text = "You Lose!"
ai.win.palfx.time = 50
ai.win.displaytime = 540
ai.win.snd = 3, 1
```

### <a name="ai.lose">AI lose elements</a> 

If it exists, the `ai.lose` group will be used when match is won by a Player against a AI controlled opponent.

*Example:*
```ini
ai.lose.time = 60
ai.lose.offset = 160, 70
ai.lose.font = 4,0
ai.lose.scale = 0.8, 0.8
ai.lose.text = "You Win!"
ai.lose.displaytime = 540
ai.lose.snd = 3, 0
```

## <a name="existing_simulface">[Simul Face]</a>

### <a name="existing_simulface_8">Up to 8 faces for simul mode</a>

Support for `p5`, `p6`, `p7`, `p8` parameters assignment in existing [Simul Face] section.

## <a name="existing_simulname">[Simul Name]</a>

### <a name="existing_simulname_8">Up to 8 names for simul mode</a>

Support for `p5`, `p6`, `p7`, `p8` parameters assignment in existing [Simul Name] section.

## <a name="existing_time">[Time]</a>

### <a name="existing_time_fonts">Multiple fonts</a>

*counter.font* element can store additional value in its name, using following format:

`counter<time_value>.font`

font assigned like this replaces default *counter.font* element, if round time is higher or equals the *\<time_value\>*. For example *counter10.font* means that counter element will use this font if round time is equal or greater than 10s, otherwise default *counter.font* element is used. There can be multiple font assignments with extra value (no hard limits).

## <a name="existing_turnsface">[Turns Face]</a>

### <a name="existing_turnsface_teammates">Teammates faces</a>

* `pX.teammate.ko.hide`: if set to 1, hide the portrait of a defeated teammate. Defaults to 0.


### <a name="existing_turnsface_palshare">Teammates palette share</a> 

`pX.teammate.face.palshare`: Enables displaying the teammate portraits with their respective selected colors. Defaults to 1.


## <a name="existing_turnsname">[Turns Name]</a>

### <a name="existing_turnsname_teammates">Teammates names</a>

Additional parameters for displaying turns mode teammates names. Defeated teammates names are not rendered.

* `pX.teammate.pos`
* `pX.teammate.bg`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)
* `pX.teammate.ko.hide`: if set to 1, hide the name of a defeated teammate. Defaults to 0. 
* `pX.teammate.name`: followed by usual suffixes to control font and text layout settings (offset, facing, layerno, scale, window)
* `pX.teammate.spacing`: x, y spacing between teammate names

## <a name="existing_winicon">[WinIcon]</a>

### <a name="existing_winicon_counter">Counter text</a>

In mugen `counter` element is used for printing how many matches have been won (once internal counter exceeds `useiconupto` parameter value). Ikemen GO unhardcodes string used by this element.

`pX.counter.text`: element that adjusts the displayed string, accepts `%i` variable (replaced with win count)

### <a name="new_winicon_clutch">Clutch Win Icon</a> 

This group defines an overlay icon for the clutch win type

*Example*:
```ini
; Win by clutch (overlay icon)
p1.clutch.spr = 108,0
p1.clutch.scale = 0.5,0.5
p2.clutch.spr = 108,0
p2.clutch.scale = 0.5,0.5
```

# <a name="new">New lifebar DEF file sections</a>

## <a name="new_action">[Action]</a>

Definition parameters for displaying text/sprites/anims messages called by [LifebarAction](State-controllers/#new_lifebaraction) state controller.

Supported parameters: (in all cases *teamX* refers to team side - *team1* / *team2*)
* `teamX.pos`: coords to show
* `teamX.max`: maximum number of simultaneous messages 
* `teamX.spacing`: x, y spacing between messages
* `teamX.start.x`: starting x-coords
* `teamX.bg`: message background element spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)
* `teamX.front.offset`: offset used by spr/anim called via sctrl
* `teamX.front.scale`: scale used  by spr/anim called via sctrl
* `teamX.text`: followed by usual suffixes to control font and text layout settings (offset, facing, layerno, scale, window)
* `teamX.displaytime`: time to show text
* `teamX.showspeed`: message showing up speed (1 = instant)
* `teamX.hidespeed`: message hiding speed (the larger value, the faster speed)

Refer to *data/fight.def* (240p) and *data/mugen1/fight.def* (720p) files for a working example.


## <a name="new_ailevel">[AILevel]</a>

Displays the difficulty level when the player is controlled by the CPU. Supported parameters:  

* `pX.pos`
* `pX.bg`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)
* `pX.text`: followed by usual suffixes to control font, displayed string, and text layout settings (offset, facing, layerno, scale, window)
  `pX.text.text` element that adjusts the displayed string, accepts following variables:
  `%s` = AI level value (from 1 to 8), `%p`= AI level displayed as percentage of the max value
* `format.decimal.places`: to how many decimal places should the AI level be rounded to (0 means no decimal point will be shown at all)
* `format.decimal.separator`: what symbol should be used to separate decimal points of the value
* `pX.enabled.modeName`: set to 1 to enable rendering this element in particular game mode (default: 0)

Where `pX` is p1 and/or p2, depending on team side. `modeName` should be changed to one of the strings returned by [GameMode](Triggers/#new_gamemode) trigger.


## <a name="new_guardbar">[Guardbar]</a>

Controls guard bar rendering if `Guard Break` is enabled in the ingame options. The supported parameters are mostly the same as `[Lifebar]`. In addition it supports the following parameter:  

* `pX.invertfill`: a value of 1 will reverse how the bar works, making it empty when the player's points are full, and full when the points are 0. 

*Example:*

```ini
[Guardbar]
p1.pos = 266, 61
p1.range.x = -6, -120
p1.invertfill = 0
p1.bg0.anim = 90
p1.bg0.offset = -6, 5
p1.bg0.layerno = 0
p1.bg1.spr = 91, 0
p1.bg1.layerno = 0
p1.front.spr = 92, 0
p1.front.offset = -6, 5
p1.front.layerno = 0
p1.warn.range = 0, 0
p1.warn.spr = 95, 0
p1.warn.palfx.sinadd = 128, 128, 128, 10
p1.warn.palfx.mul = 256, 128, 128
p1.warn.palfx.sinmul = 0, 128, 128, 10
p1.warn.offset = -63, 2
p1.warn.layerno = 0
```


## <a name="new_match">[Match]</a>

Controls match number element rendering (used by default in modes like Survival, VS 100 Kumite, Boss Rush). Supported parameters:
* `pos`: x, y coordinates
* `bg`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)
* `text`: followed by usual suffixes to control font, displayed string, and text layout settings (offset, facing, layerno, scale, window)
`text.text` element that adjusts the displayed string, accepts following variables:
  `%s` = match number
* `enabled.modeName`: set to 1 to enable rendering this element in particular game mode (default: 0)

Where `modeName` should be changed to one of the strings returned by [GameMode](Triggers/#new_gamemode) trigger.

## <a name="new_mode">[Mode]</a>

Allows to render lifebar element that should be unique for particular game mode. Supported parameters:
* `modeName.pos`: x, y coordinates
* `modeName.bg`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)
* `modeName.text`: followed by usual suffixes to control font, displayed string, and text layout settings (offset, facing, layerno, scale, window)

Where `modeName` prefix should be changed to one of the strings returned by [GameMode](Triggers/#new_gamemode) trigger.

## <a name="new_score">[Score]</a>

Controls score counter element rendering (used by default in modes like Arcade, Score Challenge). Supported parameters:

* `pX.pos`: x, y coordinates
* `pX.bg`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)
* `pX.text`: followed by usual suffixes to control font, displayed string, and text layout settings (offset, facing, layerno, scale, window)
  `pX.text.text` element that adjusts the displayed string, accepts following variables:
  `%s` = score value
* `pX.enabled.modeName`: set to 1 to enable rendering this element in particular game mode (default: 0)

Where `pX` is p1 and/or p2, depending on team side. `modeName` should be changed to one of the strings returned by [GameMode](Triggers/#new_gamemode) trigger.

* `format.integer.pad`: integer left padding (leading zeros)
* `format.integer.separator`: what symbol should be used as thousands separator (none by default)
* `format.decimal.places`: to how many decimal places should the score be rounded to (0 means no decimal point will be shown at all, even if score is added with floating point)
* `format.decimal.separator`: what symbol should be used to separate decimal points of the value
## <a name="new_simul3pface">[Simul_3P Face]</a>

Face layout for simul team mode consisting of 3 players, replacing [Simul Face], if present.

## <a name="new_simul4pface">[Simul_4P Face]</a>

Face layout for simul team mode consisting of at least 4 players, replacing [Simul Face], if present.

## <a name="new_simul3plifebar">[Simul_3P Lifebar]</a>

Lifebar layout for simul team mode consisting of 3 players, replacing [Simul Lifebar], if present.

## <a name="new_simul4plifebar">[Simul_4P Lifebar]</a>

Lifebar layout for simul team mode consisting of at least 4 players, replacing [Simul Lifebar], if present.

## <a name="new_simul3pname">[Simul_3P Name]</a>

Name layout for simul team mode consisting of 3 players, replacing [Simul Name], if present.

## <a name="new_simul4pname">[Simul_4P Name]</a>

Name layout for simul team mode consisting of at least 4 players, replacing [Simul Name], if present.

## <a name="new_simulpowerbar">[Simul Powerbar]</a>

Powerbar layout for simul team mode, replacing [Powerbar], if present.

## <a name="new_simul3ppowerbar">[Simul_3P Powerbar]</a>

Powerbar layout for simul team mode consisting of 3 players, replacing [Simul Powerbar], if present.

## <a name="new_simul4ppowerbar">[Simul_4P Powerbar]</a>

Powerbar layout for simul team mode consisting of at least 4 players, replacing [Simul Powerbar], if present.

## <a name="new_simulguardbar">[Simul Guardbar]</a>

Guardbar layout for simul team mode, replacing [Guardbar], if present.

## <a name="new_simul3pguardbar">[Simul_3P Guardbar]</a>

Guardbar layout for simul team mode consisting of 3 players, replacing [Simul Guardbar], if present.

## <a name="new_simul4pguardbar">[Simul_4P Guardbar]</a>

Guardbar layout for simul team mode consisting of at least 4 players, replacing [Simul Guardbar], if present.

## <a name="new_simulstunbar">[Simul Stunbar]</a>

Stunbar layout for simul team mode, replacing [Stunbar], if present.

## <a name="new_simul3pstunbar">[Simul_3P Stunbar]</a>

Stunbar layout for simul team mode consisting of 3 players, replacing [Simul Stunbar], if present.

## <a name="new_simul4pstunbar">[Simul_4P Stunbar]</a>

Stunbar layout for simul team mode consisting of at least 4 players, replacing [Simul Stunbar], if present.

## <a name="new_stunbar">[Stunbar]</a>

Controls stun (dizzy) bar rendering if `Dizzy` is enabled in the ingame options. The supported parameters are mostly the same as `[Lifebar]`. In addition it supports the following parameters:  

* `pX.invertfill`: a value of 1 will reverse how the bar works, making it empty when the player's points are full, and full when the points are 0. 

Note: Up until Ikemen GO 0.99 the equivalent of `pX.invertfill = 1` was hardcoded.  

*Example:*

```ini
[Stunbar]
p1.pos = 390, 61
p1.range.x = -6, -120
p1.invertfill = 0
p1.bg0.anim = 90
p1.bg0.offset = -6, 5
p1.bg0.layerno = 0
p1.bg1.spr = 91, 0
p1.bg1.layerno = 0
p1.front.spr = 93, 0
p1.front.offset = -6, 5
p1.front.layerno = 0
p1.warn.range = 0, 0
p1.warn.spr = 96, 0
p1.warn.palfx.sinadd = 128, 128, 128, 10
p1.warn.palfx.mul = 256, 128, 128
p1.warn.palfx.sinmul = 0, 128, 128, 10
p1.warn.offset = -63, 2
p1.warn.layerno = 0
```


## <a name="new_tagface">[Tag Face]</a>

Face layout for tag team mode, replacing [Simul Face], if present.

## <a name="new_tag3pface">[Tag_3P Face]</a>

Face layout for tag team mode consisting of 3 players, replacing [Simul Face], if present.

## <a name="new_tag4pface">[Tag_4P Face]</a>

Face layout for tag team mode consisting of at least 4 players, replacing [Simul Face], if present.

## <a name="new_taglifebar">[Tag Lifebar]</a>

Lifebar layout for tag team mode, replacing [Simul Lifebar], if present.

## <a name="new_tag3plifebar">[Tag_3P Lifebar]</a>

Lifebar layout for tag team mode consisting of 3 players, replacing [Tag Lifebar], if present.

## <a name="new_tag4plifebar">[Tag_4P Lifebar]</a>

Lifebar layout for tag team mode consisting of at least 4 players, replacing [Tag Lifebar], if present.

## <a name="new_tagname">[Tag Name]</a>

Name layout for tag team mode, replacing [Simul Name], if present.

## <a name="new_tag3pname">[Tag_3P Name]</a>

Name layout for tag team mode consisting of 3 players, replacing [Tag Name], if present.

## <a name="new_tag4pname">[Tag_4P Name]</a>

Name layout for tag team mode consisting of at least 4 players, replacing [Tag Name], if present.

## <a name="new_tagpowerbar">[Tag Powerbar]</a>

Powerbar layout for tag team mode, replacing [Powerbar], if present.

## <a name="new_tag3ppowerbar">[Tag_3P Powerbar]</a>

Powerbar layout for tag team mode consisting of 3 players, replacing [Tag Powerbar], if present.

## <a name="new_tag4ppowerbar">[Tag_4P Powerbar]</a>

Powerbar layout for tag team mode consisting of at least 4 players, replacing [Tag Powerbar], if present.

## <a name="new_tagguardbar">[Tag Guardbar]</a>

Guardbar layout for tag team mode, replacing [Guardbar], if present.

## <a name="new_tag3pguardbar">[Tag_3P Guardbar]</a>

Guardbar layout for tag team mode consisting of 3 players, replacing [Tag Guardbar], if present.

## <a name="new_tag4pguardbar">[Tag_4P Guardbar]</a>

Guardbar layout for tag team mode consisting of at least 4 players, replacing [Tag Guardbar], if present.

## <a name="new_tagstunbar">[Tag Stunbar]</a>

Stunbar layout for tag team mode, replacing [Stunbar], if present.

## <a name="new_tag3pstunbar">[Tag_3P Stunbar]</a>

Stunbar layout for tag team mode consisting of 3 players, replacing [Tag Stunbar], if present.

## <a name="new_tag4pstunbar">[Tag_4P Stunbar]</a>

Stunbar layout for tag team mode consisting of at least 4 players, replacing [Tag Stunbar], if present.

## <a name="new_turnspowerbar">[Turns Powerbar]</a>

Powerbar layout for turns team mode, replacing [Powerbar], if present.

## <a name="new_turnsguardbar">[Turns Guardbar]</a>

Guardbar layout for turns team mode, replacing [Guardbar], if present.

## <a name="new_turnsstunbar">[Turns Stunbar]</a>

Stunbar layout for turns team mode, replacing [Stunbar], if present.

## <a name="new_timer">[Timer]</a>

Controls timer element rendering (used by default in modes like Time Attack and Time Challenge). Supported parameters:

* `pos`: x, y coordinates
* `bg`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)
* `text`: followed by usual suffixes to control font, displayed string, and text layout settings (offset, facing, layerno, scale, window)
  `text.text` element that adjusts the displayed string, accepts following variables:
   `%m` = minutes, `%s` = seconds, `%x` = milliseconds
* `enabled.modeName`: set to 1 to enable rendering this element in particular game mode (default: 0)

where `modeName` should be changed to one of the strings returned by [GameMode](Triggers/#new_gamemode) trigger.

## <a name="new_wincount">[WinCount]</a>

Controls win counter element rendering (used by default in Versus type modes). Supported parameters:

* `pX.pos`: x, y coordinates
* `pX.bg`: spr/anim assignment, layout settings (offset, facing, vfacing, layerno, scale, angle, window)
* `pX.text`: followed by usual suffixes to control font, displayed string, and text layout settings (offset, facing, layerno, scale, window)
  `pX.text.text` element that adjusts the displayed string, accepts following variables:
  `%s` = win value
* `pX.enabled.modeName`: set to 1 to enable rendering this element in particular game mode (default: 0)

Where `pX` is p1 and/or p2, depending on team side. `modeName` should be changed to one of the strings returned by [GameMode](Triggers/#new_gamemode) trigger.
