The state controllers listed in this page already existed in Mugen, but were adjusted or expanded in Ikemen GO.  

Use the sidebar for quick navigation.  


## <a name="changed_afterimage">AfterImage parameters</a>

### <a name="changed_afterimage_invertblend">palinvertblend </a>

>palinvertblend = *blend_mode* (int)  

Inverts current blend mode if enabled so Sub becomes Add and Add becomes Sub.

For PalFx it accepts 4 values:
* 0 = Disabled (Mugen 1.0 blending behavior)
* 1 = Enabled (Mugen 1.0 blending behavior)
* -1 = Disabled (Mugen 1.1 blending behavior)
* 2 = Enabled (Mugen 1.1 blending behavior)

If character MugenVersion is 1.1 and invertall = 1 and if invertblend param is omitted, it inverts blend by default. For all other MugenVersion invertblend is 0 if omitted.

## <a name="changed_allpalfx">AllPalFx parameters</a>

### <a name="changed_allpalfx_invertblend">invertblend</a>

>invertblend = *blend_mode* (int)  

Inverts current blend mode if enabled so Sub becomes Add and Add becomes Sub.

For AllPalFx it accepts 2 values:
* 0 = Disabled (Mugen 1.0 blending behavior)
* 1 = Enabled (Mugen 1.1 blending behavior)

Defaults to 0 if omitted. If 1 it inverts blending on chars "layer".


## <a name="changed_angledraw">AngleDraw, AngleSet, AngleMul parameters</a>

### <a name="changed_angledraw_xangle">xangle</a>

>xangle = *xangle* (int)  

### <a name="changed_angledraw_yangle">yangle</a>

>xangle = *yangle* (int)  


## <a name="changed_clipboard">AppendToClipboard, DisplayToClipboard</a>

Unlike Mugen, Ikemen GO can use unlimited amount of numeric arguments. Also it supports format specifiers, e.g. %0.2f (prints float value truncated to 2 digits), %v (prints the value in a default format and optimal formatting, regardless if it's int, float or string).


## <a name="changed_assertspecial">AssertSpecial parameters</a>


### <a name="changed_assertspecial_enabled">Enabled</a>

Setting this parameter to 0 will disable the specified flags instead. Defaults to 1.


### <a name="changed_assertspecial_flag">Flag</a>

AssertSpecial now allows setting up to 8 flags at a time.
  
Example:  
```ini
[State Test]
type = AssertSpecial
trigger1 = 1
flag = ...
flag2 = ...
flag3 = ...
flag4 = ...
flag5 = ...
flag6 = ...
flag7 = ...
flag8 = ...
```
  
In addition, the following flags were added or changed.  


#### <a name="changed_assertspecial_flag_animatehitpause">AnimateHitpause</a>

While asserted, this flag makes the player's animation advance normally even during a hitpause.


#### <a name="changed_assertspecial_flag_animfreeze">AnimFreeze</a>

While asserted, the player's animation will be frozen on the current frame.


#### <a name="changed_assertspecial_flag_autoguard">AutoGuard</a>

While asserted, makes the player guard automatically, without need to press back direction. The player will also switch automatically between standing and crouching guard.


#### <a name="changed_assertspecial_flag_camerafreeze">CameraFreeze</a>

While asserted, prevents the camera from updating, effectively freezing it in place.


#### <a name="changed_assertspecial_flag_drawunder">DrawUnder </a>

While asserted, makes the player sprites be drawn with the same properties of Explod `under` parameter. That is, if the player is on layer 0, it will always be drawn behind lifebars and character shadows.


#### <a name="changed_assertspecial_flag_globalnoko">GlobalNoKo</a>

While asserted all players won't die from taking damage.

#### <a name="changed_assertspecial_flag_noaibuttonjam">NoAIButtonJam</a>

While asserted, disables the random direction and button jamming of Ikemen's default AI.


#### <a name="changed_assertspecial_flag_noaicheat">NoAICheat</a>

While asserted, makes the player's AI unable to cheat commands, i.e. complete them without performing the respective inputs.


#### <a name="changed_assertspecial_flag_noailevel">NoAiLevel</a>

While asserted, makes the player AILevel and AILevelF triggers return 0.


#### <a name="changed_assertspecial_flag_noairjump">NoAirJump</a>

Disables the hard-coded state transitions to State 45 when `Ctrl=1 && StateType=A && Command="holdup"` and `AirJump.Num` allows


#### <a name="changed_assertspecial_flag_nobrake">NoBrake</a>

Disables the hard-coded state transitions to State 0 when `StateNo=20 && Command!="holdfwd" && Command!="holdback"`


#### <a name="changed_assertspecial_flag_nocombodisplay">NoComboDisplay</a>

While asserted, disables displaying combo counter by this playerno (the flag has to be asserted on team leader to disable combo counter rendering for the teamside).


#### <a name="changed_assertspecial_flag_nocornerpush">NoCornerPush</a>

While asserted, the player won't be affected by HitDef `cornerpush.veloff`.


#### <a name="changed_assertspecial_flag_nocrouch">NoCrouch</a>

Disables the hard-coded state transitions to State 10 when `Ctrl=1 && StateType=S && Command="holddown"`.

#### <a name="changed_assertspecial_flag_nodestroyself">NoDestroySelf</a>

While asserted, disables `destroyself` sctrl.

#### <a name="changed_assertspecial_flag_nodizzypointsdamage">NoDizzyPointsDamage</a>

While asserted, player won't be affected by a HitDef's dizzypoints parameter.


#### <a name="changed_assertspecial_flag_nofacedisplay">NoFaceDisplay</a>

While asserted, disables displaying the face icon for this player.


#### <a name="changed_assertspecial_flag_nofacep2">NoFaceP2</a>

While asserted, StateDef `facep2` parameter will have no effect.


#### <a name="changed_assertspecial_flag_nofastrecoverfromliedown">NoFastRecoverFromLieDown</a>

Disables the hard-coded faster recover from lie down on key input mashing when `StateType=L && GetHitVar(RecoverTime)>0`.


#### <a name="changed_assertspecial_flag_nofallcount">NoFallCount</a>

Disables the hard-coded FallCount increment when `StateNo=5070 || StateNo=5100`.


#### <a name="changed_assertspecial_flag_nofalldefenceup">NoFallDefenceUp</a>

Disables the hard-coded defence increase when `StateNo=5070 || StateNo=5100`.


#### <a name="changed_assertspecial_flag_nofallhitflag">NoFallHitflag</a>

While asserted, every `HitDef` will act as if its `HitFlag` has no `F` parameter. In other words, the player becomes unable to hit falling enemies.


#### <a name="changed_assertspecial_flag_nogetupfromliedown">NoGetUpFromLieDown</a>

Disables the hard-coded state transitions to State 5120 when `StateNo=5110 && GetHitVar(RecoverTime)=0`.


#### <a name="changed_assertspecial_flag_noguardko">NoGuardKo</a>

While asserted player won't die from taking chip damage.


#### <a name="changed_assertspecial_flag_noguardbardisplay">NoGuardBarDisplay</a>

While asserted, disables displaying guardbars by this playerno.


#### <a name="changed_assertspecial_flag_noguarddamage">NoGuardDamage</a>

While asserted, player won't be affected by HitDef damage *guard_damage*.


#### <a name="changed_assertspecial_flag_noguardpointsdamage">NoGuardPointsDamage</a>

While asserted, player won't be affected by HitDef guardpoints.


#### <a name="changed_assertspecial_flag_nohardcodedkeys">NoHardcodedKeys</a>

Disables the hard-coded state transitions when pressing directional keys (combination of `NoJump`, `NoAirJump`, `NoCrouch`, `NoStand`, `NoWalk`, `NoBrake`, `NoStandGuard`, `NoCrouchGuard`, `NoAirGuard`).


#### <a name="changed_assertspecial_flag_nohitdamage">NoHitDamage</a>

While asserted, player won't be affected by HitDef damage *hit_damage*.


#### <a name="changed_assertspecial_flag_noinput">NoInput</a>

While asserted, makes the player ignore any player/CPU inputs.


#### <a name="changed_assertspecial_flag_nointroreset">NoIntroReset</a>

While asserted, prevents a player from being forced to their starting position after the round number announcement.


#### <a name="changed_assertspecial_flag_nojump">NoJump</a>

Disables the hard-coded state transitions to State 40 when `Ctrl=1 && StateType=S && Command="holdup"`


#### <a name="changed_assertspecial_flag_noko">NoKo</a>

While asserted, the player won't die from taking damage.  

If `ikemenversion` is not 0, the `NoKO` flag affects only the player that called it. Otherwise, the MUGEN behavior is replicated, and all players are affected. The new `GlobalNoKo` flag can be used to replicate the old MUGEN behavior.  


#### <a name="changed_assertspecial_flag_nokofall">NoKoFall</a>

While asserted, the player won't be forced to fall when receiving a hit that depletes their remaining life. In Mugen this was hardcoded into Training mode.  


#### <a name="changed_assertspecial_flag_nokovelocity">NoKoVelocity</a>

While asserted, player won't be affected by HitDef velocity adjustments upon KO.


#### <a name="changed_assertspecial_flag_nolifebaraction">NoLifeBarAction</a>

While asserted, disables displaying lifebar actions by this playerno (the flag has to be asserted on team leader to disable lifebar actions rendering for the teamside).

#### <a name="changed_assertspecial_flag_nolifebardisplay">NoLifeBarDisplay</a>

While asserted, disables displaying lifebars by this playerno.


#### <a name="changed_assertspecial_flag_nomakedust">NoMakeDust</a>

While asserted, the player does not generate hardcoded dust effects. The `MakeDust` state controller will also have no effect.


#### <a name="changed_assertspecial_flag_nonamedisplay">NoNameDisplay</a>

While asserted, disables displaying the Name by this playerno.


#### <a name="changed_assertspecial_flag_nopowerbardisplay">NoPowerBarDisplay</a>

While asserted, disables displaying powerbars by this playerno (with team power share option enabled and/or lifebar design with only 1 powerbar per side, the flag has to be asserted on team leader to disable powerbar rendering for whole team).


#### <a name="changed_assertspecial_flag_noredlifedamage">NoRedLifeDamage</a>

While asserted, player won't be affected by HitDef *redlife*.


#### <a name="changed_assertspecial_flag_noscore">NoScore</a>

While asserted, player won't be affected by HitDef *score* or the `ScoreAdd` / `TargetScoreAdd` state controllers.


#### <a name="changed_assertspecial_flag_nostand">NoStand</a>

Disables the hard-coded state transitions to State 12 when `StateType=C && Command!="holddown"`.


#### <a name="changed_assertspecial_flag_nostunbardisplay">NoStunBarDisplay</a>

While asserted, disables displaying stunbars by this playerno.


#### <a name="changed_assertspecial_flag_notimedisplay">NoTimeDisplay</a>

While asserted, disables displaying the fight screens `[Time]` elements.  


#### <a name="changed_assertspecial_flag_noturntarget">NoTurnTarget</a>

While asserted, keeps the opponent from automatically turning to face the player. This includes the `facep2` parameter.


#### <a name="changed_assertspecial_flag_nowinicondisplay">NoWinIconDisplay</a>

While asserted, disables displaying winicons by this playerno (the flag has to be asserted on team leader to disable winicon rendering for the teamside).


#### <a name="changed_assertspecial_flag_postroundinput">PostRoundInput</a>

While asserted, player's inputs are not disabled post-match (`RoundState>2 || RoundState=-1`).


#### <a name="changed_assertspecial_flag_projtypecollision">ProjTypeCollision</a>

While asserted, the player will clash with projectiles (and other players with the same flag) if their `Clsn2` boxes overlap. This allows helpers to easily replicate this kind of projectile clashing.


#### <a name="changed_assertspecial_flag_roundfreeze">RoundFreeze</a>

While asserted, round related lifebar actions and internal timers are frozen (allows maintaining current roundstate).


#### <a name="changed_assertspecial_flag_roundnotskip">RoundNotSkip</a>

Disables intro and victory pose skipping via button press.


#### <a name="changed_assertspecial_flag_runfirst">RunFirst</a>

While asserted, makes the player code be processed before that of any other players.


#### <a name="changed_assertspecial_flag_runlast">RunLast</a>

While asserted, makes the player code be processed after all other players.


#### <a name="changed_assertspecial_flag_sizepushonly">SizePushOnly</a>

In Ikemen, like Mugen, characters will push each other when both their size boxes (width * height) and their Clsn2 boxes overlap. Asserting this flag makes it so that only the size boxes are checked, as in most fighting games.


#### <a name="changed_assertspecial_flag_skipfightdisplay">SkipFightDisplay</a>

While asserted, the "fight" announcement on round start will be skipped.


#### <a name="changed_assertspecial_flag_skipkodisplay">SkipKoDisplay</a>

While asserted, the KO announcement on round end will be skipped.


#### <a name="changed_assertspecial_flag_skiprounddisplay">SkipRoundDisplay</a>

While asserted, the round number announcement on round start will be skipped.


#### <a name="changed_assertspecial_flag_skipwindisplay">SkipWinDisplay</a>

While asserted, the winner announcement on round end will be skipped.


## <a name="changed_attackdist">AttackDist Parameters</a>

### <a name="changed_attackdist_value">Value</a>

The `value` parameter now takes a second number. This number sets the distance that a player can attack behind the enemy and still allow them to enter proximity guard.

Example:
```ini
[State Test]
type = AttackDist
trigger1 = 1
value = 100, 50
```

### <a name="changed_attackdist_width">Width</a>

Works the same as Value.

### <a name="changed_attackdist_height">Height</a>

Changes the value of the attack.dist.height parameter for the player's current HitDef.

Example:
```ini
[State Test]
type = AttackDist
trigger1 = 1
height = 160, 0
```

### <a name="changed_attackdist_depth">Depth</a>

Changes the value of the attack.dist.depth parameter for the player's current HitDef.

Example:
```ini
[State Test]
type = AttackDist
trigger1 = 1
depth = 10, 10
```

## <a name="changed_attackmulset">AttackMulSet Parameters</a>

### <a name="changed_attackmulset_damage">Damage</a>

Sets an attack multiplier for regular damage only.


### <a name="changed_attackmulset_dizzypoints">DizzyPoints</a>

Sets an attack multiplier for dizzy points only.


### <a name="changed_attackmulset_guardpoints">GuardPoints</a>

Sets an attack multiplier for guard points only.


### <a name="changed_attackmulset_redlife">RedLife</a>

Sets an attack multiplier for red life only.


### <a name="changed_attackmulset_value">Value</a>

Sets the attack multiplier for all types of damage.

Example:
```ini
[State Test]
type = AttackMulSet
trigger1 = 1
Damage = 0.50
RedLife = 2.00
DizzyPoints = 0.75
GuardPoints = 0.00
```


## <a name="changed_bgpalfx">BGPalFX</a>

BGPalFX now also accepts `ID` and `index` parameters. This allows it to apply PalFX to specific BG elements of the stage.  


### <a name="changed_bgpalfx_id">ID</a>

The ID of the stage BG element to affect. Defaults to -1 (any).  


### <a name="changed_bgpalfx_index">Index</a>

The index of the stage BG element to affect. Defaults to -1 (any).  


Example:  
```ini
[State Test]; Invert colors for the sixth BG element with any ID
type = BGPalFX
trigger1 = 1
ID = -1
index = 5
time = 10
invertall = 1
```


## <a name="changed_BindToTarget">BindToTarget Parameters</a>

### <a name="changed_bindtotarget_posz">PosZ</a>

>posz = *pos_z* (float)

Specify the offset (in the z-axis) to bind to. Can be skipped, so it's backward compatible with lines having only x,y declared.

### <a name="changed_bindtotarget_index">Index</a>

The index of the target to bind to. Defaults to 0 (first one). 


## <a name="changed_changeanim">ChangeAnim Parameters</a>


### <a name="changed_changeanim_elemtime">ElemTime</a>

Specifies the exact time of an animation element to change to. Defaults to 0.

Example:
```ini
[State 1000, Anim]; Change to animation 1003, element 4, second frame
type = ChangeAnim
trigger1 = Time = 30
value = 1003
elem = 4
elemtime = 1
```

### <a name="changed_changeanim_animplayerno">AnimPlayerNo</a>

This parameter lets a character use the specified animation from another character. Defaults to own playerno.


### <a name="changed_changeanim_spriteplayerno">SpritePlayerNo</a>

This parameter lets a character use the specified sprites from another character. Defaults to own playerno.


### <a name="changed_changeanim_readplayerid">ReadPlayerID</a>

This parameter lets a character use the specified animation from another character, including their sprites.


## <a name="changed_changeanim2">ChangeAnim2 Parameters</a>


### <a name="changed_changeanim2_elemtime">ElemTime</a>

See ChangeAnim.


### <a name="changed_changeanim2_readplayerid">ReadPlayerID</a>

This parameter lets a character use the specified animation from another character, but maintaining their own sprites.


## <a name="changed_changestate">ChangeState parameters</a>

### <a name="changed_changestate_continue">Continue</a>

Due to the way State -1 is normally used to read inputs and change states, Mugen had it so that using a `ChangeState` in a negative state would stop the execution of the rest of the code in that state. Setting `Continue` to 1 will disable this behavior.  
When a `ChangeState` is redirected, `Continue` will default to 1.


## <a name="changed_defencemulset">DefenceMulSet Parameters</a>

In Mugen, `DefenceMulSet` changes the player's final defense multiplier. That means it will override any defense buffs such as those gained through the `fall.defence_up` constant or the `SuperPause` `p2defmul` parameter. In Ikemen GO, it is only another multiplier, meaning the other defense buffs will still work correctly.  


### <a name="changed_defencemulset_ikemenversion">IkemenVersion</a>

Characters with `ikemenversion` will have `DefenceMulSet` work correctly and more intuitively by default. See `MulType` and `OnHit`.  


### <a name="changed_defencemulset_multype">MulType</a>

>multype = *bvalue* (boolean int)  

Defines how damage taken should be multiplied.  

If 0, damage taken is multiplied by `value`.  
If 1, defense is multiplied by `value` (therefore the damage is divided).  

Defaults to 1 for characters with `ikemenversion`, and to 0 otherwise.  


### <a name="changed_defencemulset_onhit">OnHit</a>

>onHit = *bvalue* (boolean int)  

Defines if the defense value should also apply outside of `moveType = H`.

If 0, the defense value works without delay.  
If 1, the defense value is only active if the char is already in `moveType = H`.  

Defaults to 0 for characters with `ikemenversion`, and 1 otherwise.


Example:
```ini
[State -2, Evil Ryu Defense]
type = defencemulset
trigger1 = map(evilryu) != 0
value = 0.80
onhit = 0
multype = 1
ignorehitpause = 1
```


## <a name="changed_envshake">EnvShake parameters</a>

### <a name="changed_envshake_decay">Decay</a>

>decay = *exponent* (float)  

Applies an exponential decay to the shake amplitude over time, making it fade out automatically.   

- `decay = 0`: no fading
- `0 < decay < 1`: fades slow, then fast
- `decay = 1`: fades linearly
- `decay > 1`: fades fast, then slow

Example:  
```ini
[State Shake]
type = envshake
trigger1 = !time
time = 30
ampl = 10
freq = 90
decay = 1.5
```


### <a name="changed_envshake_dir">Dir</a>

>dir = *angle* (int)  

Changes the direction in degrees in which the shake is applied. Defaults to 0. For a negative amplitude, 90 will make the screen shake from left to right.


### <a name="changed_envshake_diradd">DirAdd</a>

>diradd = *angle* (int)  

Increases the shaking angle by the specified value each frame. Allows the effect to appear more exaggerated and erratic.  


### <a name="changed_envshake_mul">Mul</a>

>mul = *factor* (float)  

For every EnvShake cycle, the amplitude is multiplied by this value. Defaults to 1. Cycle duration is determined by frequency, with a frequency of 180 needing two frames to complete one cycle.

Example:
```ini
[State 3051, Shake]
type = envshake
trigger1 = !time
time = 30
ampl = 5
freq = 180
mul = 0.9
```
In this case, the screen shakes 5 pixels in the first cycle, then 4.50 pixels, then 4.05 and so on.  
  
Note: This parameter has been superseded by the `decay` parameter.  


## <a name="changed_explod">Explod parameters</a>

### <a name="changed_explod_aferimage">AfterImage</a>
Explods now support AfterImage parameters (e.g. afterimage.time, afterimage.length, afterimage.trans). Usage is identical to Projectile's AfterImage.

### <a name="changed_explod_animelem">AnimElem</a>

>animelem = *elem_no* (int)  

Sets the element where the explod's animation should start. Defaults to 1.


### <a name="changed_explod_animplayerno">AnimPlayerNo</a>

>animplayerno = *playerno* (int)  

This parameter lets a explod use the specified animation from another character. Defaults to own playerno.


### <a name="changed_explod_hidewithbars">HideWithBars</a>

>hidewithbars = *bvalue* (boolean int)  

This parameter hides the explod automatically when the fight screen is hidden. Defaults to 0.


### <a name="changed_explod_spriteplayerno">SpritePlayerNo</a>

>spriteplayerno = *playerno* (int)  

This parameter lets a explod use the specified sprites from another character. Defaults to own playerno.


### <a name="changed_explod_animelem">AnimElemTime</a>

>animelemtime = *time* (int)  

Sets the time at which the explod's animation element should start. Defaults to 0.


### <a name="changed_explod_animfreeze">AnimFreeze</a>

>animfreeze = *bvalue* (boolean int)  

Freezes the explod's animation. Defaults to 0.

Example:
```ini
[State 0, Custom Afterimage]
type = Explod
trigger1 = time%5=0
anim = anim
animelem = animelemno(0)
animfreeze = 1
ID = 1000
postype = none
pos = pos x+camerapos x,pos y
facing = 1
vfacing = 1
bindtime = 1
supermovetime = 0
pausemovetime = 0
scale = 1,1
sprpriority = 10
ontop = 0
shadow = 0,0,0
ownpal = 1
trans = add
removetime = 40
palfx.time = 40
palfx.sinmul = -255,-255,-255,160
removeongethit = 0
ignorehitpause = 1
```


### <a name="changed_explod_focallength">FocalLength</a>

Focal Length of the projection. Does nothing when `projection` is not perspective or perspective2. 
This value is fixed in Mugen 1.1, the explods will look differently under different different resolution/loaclcoord/camera zoom.
In Ikemen, this value scales internally like xy scales so that the explods will always look the same.
Default value is 2048.

### <a name="changed_explod_fricction">Friction</a>

Applies friction to explod on the defined axis (Friction value example: 0.95).

>Friction = friction_x, friction_y, friction_z (float, float, float)   

### <a name="changed_explod_interpolation">Interpolation</a>

Interpolation works just as the .air counterpart, interpolating linearly between 2 values.

The syntax is as follows:
**Interpolation.**
Where is one of: **time, animElem, scale, alpha, angle, offset, xshear, focallength**


**Interpolation.Time** is required for any of the parameters to work.

>Time = duration (int) 

Specifies the time period of the animation (if omitted, defaults to 0).

>AnimElem = elem_no (int) 

Interpolation between **AnimElem** and **Interpolation.AnimElem.** if **AnimElem** is omitted, defaults to 1. **AnimFreeze** will stop the animation from going further than **Interpolation.AnimElem**.  

>Alpha = alpha_source, alpha_dest (int, int) 

Interpolation between **Alpha** values and **Interpolation.Alpha.** **Sub** and **Add1** are not supported.

>Angle = angle, xangle, yangle (float, float, float) 

Interpolation between **Angle** / **XAngle** / **YAngle** and **Interpolation.Angle.**


>Offset = offset_x, offset_y (float, float) 

Interpolation between **Pos** and **Interpolation.Offset.**

>Scale= scale_x, scale_y (float, float) 

Interpolation between **Scale** and **Interpolation.Scale.**

>Xshear= xshear  (float) 

Interpolation between **Xshear** and **Interpolation.Xshear.**


>FocalLength = value(float) 

Interpolation between **FocalLength** and **Interpolation.FocalLength.**


Palfx is also compatible with the syntax:

**Interpolation.PalFx.(type)**

where (type) is one of: mul, add, hue, color

**PalFx.Time** and **OwnPal = 1** is required for any of the parameters to work.

>Mul = mul_r, mul_g, mul_b (int, int, int) 

Interpolation between **PalFx.Mul** values and **Interpolation.PalFx.Mul**. If **PalFx.Mul** is omitted, defaults to 256, 256, 256.

>Add = add_r, add_g, add_b (int, int, int) 

Interpolation between **PalFx.Add** values and **Interpolation.PalFx.Add**. If **PalFx.Add** is omitted, defaults to 0, 0, 0.

>Hue = value (int) 

Interpolation between **PalFx.Hue** value and **Interpolation.PalFx.Hue**. If **PalFx.Hue** is omitted, defaults to 0.

>Color = value (int) 

Interpolation. between **PalFx.Color** value and **Interpolation.PalFx.Color**. If **PalFx.Color** is omitted, defaults to 256.
	

These parameters can be used interchangeably.

Examples:

* Spinning object doing a full circle in a period of 60 ticks:
```ini
Angle = 0;
XAngle = 0;
YAngle = 0;
Interpolation.Time = 60;
Interpolation.Angle = 360, 0, 0;
```

* Moving object from 0, 0 to 50, 0 in a period of 100 ticks:
```ini
Pos = 0, 0;
Interpolation.Time = 100;
Interpolation.OffSet = 50, 0;
```


* Object fading out in 30 ticks:
```ini
Trans = AddAlpha;
Alpha = 256, 0;
Interpolation.Time = 30;
Interpolation.Alpha = 0, 256;
```

* Object Changing from Blue to Red in 50 ticks:
```ini
PalFx.Time = 50;
PalFx.Mul = 0, 0, 256;
Interpolation.Time = 50;
Interpolation.PalFx.Mul = 256, 0, 0;
```


### <a name="changed_explod_layerno">LayerNo</a>

Specify on which layer the explod should be drawn. Valid values are -1, 0 and 1. Defaults to the same layer as the player.  
Layer number 1 is effectively the same as the legacy `ontop` parameter.  


### <a name="changed_explod_palfx">PalFx</a>

Apply palette effects on explods. The parameters are the same as in the HitDef controller. Requires `ownpal` to be a nonzero value.

### <a name="changed_explod_projection">Projection</a>

Affect how the explod is drawn when `xangle` or `yangle` is not zero. 
- orthographic: The default value when Mugen version is not 1.1 or Ikemen version is not 0. The explod is drawn using orthographic projection.
- perspective: The default value when Mugen version is 1.1 and Ikemen version is 0. The explod is drawn using perspective projection. Distortion is affected by the position of the sprite relative to the center of the screen.
- perspective2: The explod is drawn using perspective projection. Distortion is affected by the position of the sprite relative to the center of the animation.

### <a name="changed_explod_reflection">Reflection</a>

If 0, disables reflection on the explod regardless of its shadow color. If 1, enables reflection on the explod regardless of its shadow color. Defaults to showing a reflection if the explod's shadow is not 0, 0, 0.


### <a name="changed_explod_removeonchangestate">RemoveOnChangeState</a>

If set to 1, the Explod will be removed if the character changes state. Defaults to 0.


### <a name="changed_explod_shader">Shader</a>

>shader = *"shader_name"* (string)  

Specifying the name of the currently loaded custom shader will apply that shader to Explod.

### <a name="changed_explod_shadertime">ShaderTime</a>

>shadertime = *time* (int)  

Specifying this parameter will remove the custom shader after it has been displayed for the specified number of ticks. The default value is -1.

### <a name="changed_explod_shadersaram.px">ShaderParam.pX</a>

>shaderparam.pX = *value* (float)  

Specifies the value to send to the custom shader. The value specified here can be used as a variable within the custom shader.
X is limited to 0 to 15, and a maximum of 16 values ​​can be sent.

### <a name="changed_explod_shadertexx.spr">ShaderTexX.spr</a>

>shadertexX.spr = *group, image* (int, int)  

### <a name="changed_explod_shadertexx.anim">ShaderTexX.anim</a>


>shadertexX.anim = *anim_no* (int)  

Specifies the texture to send to the custom shader. The sprites specified here can be used as textures within the custom shader.
You can specify 1 or 2 for X, and send up to two sprites.
Each tex can be assigned either a sprite number (spr) or an anim number. It is not possible to assign both sprite and anim numbers to the same tex number simultaneously.
Note that since textures are loaded as raw data, images with palettes may not display correctly as is.

### <a name="changed_explod_spriteplayerno">SpritePlayerNo</a>

>spriteplayerno = *playerno* (int)  

This parameter lets a explod use the specified sprites from another character. Defaults to own playerno.


### <a name="changed_explod_syncid">syncid</a>

>syncid = *id* (int)

Specifies the ID of a character to synchronize with. The Explod will group with the target in the draw order. If syncparams is 1, it also copies the target's drawing properties (Position, Scale, Angle, Trans, etc.).

### <a name="changed_explod_synclayer">synclayer</a>

>synclayer = *layer* (int)

Adjusts the drawing order relative to the character specified in syncid.
* 0: Same layer as the character (default).
* \> 0: Drawn in front of the character.
* < 0: Drawn behind the character.

### <a name="changed_explod_syncparams">syncparams</a>

>syncparams = *value* (bool)

If set to 1, visual parameters (Scale, Angle, Trans, etc.) are continuously copied from the character specified in syncid. If set to 0, only the draw order is synchronized. Defaults to 1.

### <a name="changed_explod_under">under</a>

If set to 1 and the explod is on layer 0, it will always be drawn behind lifebars and character shadows.


### <a name="changed_explod_window">window</a>

>window = *x1*, *y1*, *x2*, *y2* (float)  

This parameter takes four numbers (similar to the format of a Clsn box) which forms a rectangle outside of which the pixels will not be rendered.

### <a name="changed_explod_xshear">xshear</a>

>xshear = *xshear* (float)

Specifies the amount of horizontal shearing to apply to the explod. Defaults to 0.


## <a name="changed_forcefeedback">Forcefeedback parameters</a>
Note: The below parameters are considered "new API" and override all `freq` and `ampl` parameters of ForceFeedback. `ampl` is ignored regardless of API used.


### <a name="changed_forcefeedback_lo">lo</a>

>lo = *lo_value* (int)  

Sets the frequency for the low frequency (left) rumble motor. Defaults to 0.

### <a name="changed_forcefeedback_hi">hi</a>

>hi = *hi_value* (int)  

Sets the frequency for the high frequency (right) rumble motor. Defaults to 0.


## <a name="changed_helper">Helper parameters</a>

### <a name="changed_helper_clsnproxy">ClsnProxy</a>

If set to 1, any overlap with the helper's clsn boxes will instead affect its parent as if the helper's clsn boxes were part of the parent's anim. Defaults to 0.

### <a name="changed_helper_extendsmap">ExtendsMap</a>

If set to 1, the parent map is inherited by helper. Defaults to 0.

### <a name="changed_helper_immortal">Immortal</a>

If set to 1, the helper's life can't be reduced to 0. Defaults to 0.

### <a name="changed_helper_inheritchannels">InheritChannels</a>

If set to 1, helper shares parent's sound channels. Setting it to 2 does the same thing but for root instead of parent. Defaults to 0.

### <a name="changed_helper_inheritjuggle">InheritJuggle</a>

If set to 1, helper's attacks also update parent's target list and add to the parent's juggle points. Also, the helper will inherit its parent's juggle points against attacked enemy. Setting it to 2 does the same thing but for root instead of parent. Defaults to 0.

### <a name="changed_helper_keyctrl">keyctrl</a>

In Mugen this parameter accepts a single boolean int value that makes the helper being able to read command input and inherit its root's State -1. In Ikemen GO, on top of this functionality, the parameter optionally accepts more values that enable additional root's negative state inheritance (2 means that helper inherit its root's State -2 and so forth). 

```ini
keyctrl = 1, 3
```

### <a name="changed_helper_kovelocity">KOVelocity</a>

If set to 1, the helper will be affected by increased KO Velocity (defeated character flying across the screen), just like normal player. Defaults to 0.


### <a name="changed_helper_map">Map</a>

A helper's maps can be set immediately upon its creation via `map.<mapname>` syntax.

```
helper{...; map.speed: 8; map.angle: 45}
```


### <a name="changed_helper_ownclsnscale">OwnClsnScale</a>

A helper with this parameter will have its collision box scale be based on its own `size.xscale` and `size.yscale` constants rather than its root's.


### <a name="changed_helper_ownprojectile">OwnProjectile</a>

A helper with this parameter can own its own projectiles instead of the root player.  
Note: If a helper is destroyed while a projectile is still active, the orphaned projectile loses its ability to interact with other players.


### <a name="changed_helper_preserve">Preserve</a>

If set to 1, the helper won't be destroyed after skipping round 1 intro and will move over to the next round, just like normal player. Defaults to 0.


### <a name="changed_helper_size">Size</a>

New size constants like `depth` and `weight` can also be attributed to helpers upon their creation, with the `size` prefix.

Example:
```ini
type = Helper
size.weight = 200
size.depth = 10, 10
```


### <a name="changed_helper_standby">Standby</a>

Helpers inherit standby flag from root characters. By using this parameter, a character can force a specific standby for its helper, regardless of the standby value of the character itself.


## <a name="changed_hitby">HitBy parameters</a>

### <a name="changed_hitby_ikemenversion">IkemenVersion</a>

In Mugen, the behavior of `HitBy` (and `NotHitBy`) is not as documented. The player's invincibility is compared to the enemy's actual statetype instead of their Hitdef's `SCA` flags. If a character has `ikemenversion`, it will work as documented.  


### <a name="changed_hitby_stack">New syntax</a>

`HitBy` (and `NotHitBy`) now also accepts a syntax similar to `HitOverride`, using `attr` and `slot` instead of `value`. Every player has access to 8 individual slots (numbered 0 to 7).  
This new syntax is required to use the new features.  

Example of equivalent code in old and new syntax:
```ini
[State -3, Old Syntax]
type = hitby
trigger1 = 1
value = SC, AP
time = 1

[State -3, New Syntax]
type = hitby
trigger1 = 1
attr = SC, AP
slot = 0
time = 1
```


### <a name="changed_hitby_stack">Stack</a>

>stack = *value* (bool)  

Using this parameter makes a vulnerability slot stack with other slots. This allows setting vulnerability combinations not previously possible in Mugen.  

Example, make a player vulnerable to Standing Attacks and Air Projectiles:
```ini
[State -2, Test]
type = hitby
trigger1 = 1
attr = S, AA
time = 1
slot = 0
stack = 1

[State -2, Test]
type = hitby
trigger1 = 1
attr = A, AP
time = 1
slot = 1
stack = 1
```


### <a name="changed_hitby_playerno">PlayerNo</a>

>playerno = *player_number* (int)  

Using this parameter limits vulnerability to a specific player number.


### <a name="changed_hitby_playerid">PlayerID</a>

>playerid = *player_id* (int)  

Using this parameter limits vulnerability to a specific player ID.


## <a name="changed_hitdef">HitDef parameters</a>


### <a name="changed_hitdef_airjuggle">air.juggle (changed)</a>

In Mugen, the `air.juggle` parameter is only used by the `Projectile` state controller. Characters with `ikemenversion` can now use this parameter in a `Hitdef` to update their juggle points. This allows a move with multiple hits to have different juggle properties in every hit, for instance.  


### <a name="changed_hitdef_air_velocity">air.velocity (changed)</a>

This parameter now takes a third value, It specifies the z velocity.

>air.velocity = *x_vel, y_vel, z_vel* (float, float, float)


### <a name="changed_hitdef_airguard_velocity">airguard.velocity (changed)</a>

This parameter now takes a third value, It specifies the z velocity.

>airguard.velocity = *x_vel, y_vel, z_vel* (float, float, float)


### <a name="changed_hitdef_attackdepth">attack.depth</a>

>attack.depth = *z_dist_front, z_dist_back* (int, int)

Specifies the range of the attack in the Z plane. An attack with more depth reaches further into or out of the Z plane. Defaults to the character's `attack.depth` size constant.  


### <a name="changed_hitdef_dizzypoints">dizzypoints</a>

>dizzypoints = *hit_value* (int)  

Specifies the amount of dizzy points to give P2 if this HitDef connects successfully. If omitted, it defaults to hit_damage (from "damage" parameter) multiplied by the value of `Default.LifeToDizzyPointsMul` / `Super.LifeToDizzyPointsMul` specified in data/common.const, scaled by the targets' defense multipliers if necessary.


### <a name="changed_hitdef_downrecover">down.recover</a>

>down.recover = *recover_flag* (bool)  

This parameter controls the enemy's ability to use "fast recovery from lie down" after being hit.  


### <a name="changed_hitdef_downrecovertime">down.recovertime</a>

>down.recovertime = *recover_time* (int)  

This parameter determines how long the enemy will stay down (in state 5110) after being knocked down. Defaults to the enemy's `data.liedown.time` constant. Together with `down.recover`, this allows one to effectively apply "hard knockdown" states on the enemy.


### <a name="changed_hitdef_down_velocity">down.velocity (changed)</a>

>down.velocity = *x_vel, y_vel, z_vel* (float, float, float)  

This parameter now takes a third value, It specifies the z velocity. 


### <a name="changed_hitdef_envshakemul">envshake.mul</a>

>envshake.mul = *envshake_mul* (float) 

For every envshake cycle, the envshake.ampl is multiplied by this value. Defaults to 1.


### <a name="changed_hitdef_envshakedir">envshake.dir</a>

>envshake.dir = *angle* (int)  

Changes the direction in degrees in which the shake is applied. Defaults to 0. For a negative amplitude, 90 will make the screen shake from left to right.


### <a name="changed_hitdef_fallenvshakemul">fall.envshake.mul</a>

>fall.envshake.mul = *fall_envshake_mul* (float) 

For every fall.envshake cycle, the fall.envshake.ampl is multiplied by this value. Defaults to 1.


### <a name="changed_hitdef_fallenvshakedir">fall.envshake.dir</a>

>fall.envshake.dir = *angle* (int)  

Changes the direction in degrees in which the shake is applied. Defaults to 0. For a negative amplitude, 90 will make the screen shake from left to right.


### <a name="changed_hitdef_zvelocity">fall.zvelocity</a>

>fall.zvelocity = *fall_zvelocity* (float) 

This is the z-velocity that P2 gets when bouncing off the ground in the "fall" state. Defaults to no change if omitted.


### <a name="changed_hitdef_forcecrouch">forcecrouch</a>

>forcecrouch = *bvalue* (boolean int)

Forces a standing opponent to crouch upon hit. Similar to ForceStand. Defaults to 0.


### <a name="changed_hitdef_guard_hittime">guard.hittime</a>

If the character has `ikemenversion`, this value now defaults to `ground.hittime` as documented, as opposed to `ground.slidetime`.


### <a name="changed_hitdef_guardpoints">guardpoints</a>

>guardpoints = *hit_value* (float)  

Specifies the amount of guard points to give P2 if this HitDef is guarded. If omitted, it defaults to hit_damage (from "damage" parameter) multiplied by the value of `Default.LifeToGuardPointsMul` / `Super.LifeToGuardPointsMul` specified in data/common.const, scaled by the targets' defense multipliers if necessary.


### <a name="changed_hitdef_ground_velocity">ground.velocity (changed)</a>

This parameter now takes a third value, It specifies the z velocity.

>ground.velocity = *x_vel, y_vel, z_vel* (float, float, float)


### <a name="changed_hitdef_guard_dist">guard.dist (changed)</a>

>guard.dist = *x_dist_front, x_dist_back* (int, int)

This parameter now takes a second value. It specifies the distance that a player can attack behind the enemy and still allow them to enter proximity guard. This second value defaults to 0.


### <a name="changed_hitdef_guard_width">guard.dist.width</a>

>guard.dist.width = *x_dist_front, x_dist_back* (int, int)

Alternative syntax for guard.dist, for consistency with `guard.dist.height` and `guard.dist.depth`.


### <a name="changed_hitdef_guard_height">guard.dist.height</a>

>guard.dist.height = *y_dist_top, y_dist_bottom* (int, int)

Specifies the vertical distance (height) within which a player's attack can trigger the enemy's proximity guard. The default value is 1000, 1000.


>guard.dist.depth = *z_dist_top, z_dist_bottom* (int, int)

Specifies the depth range (along the Z-axis) within which a player's attack can trigger the enemy's proximity guard. The default value is 4, 4.


### <a name="changed_hitdef_guard_velocity">guard.velocity (changed)</a>

>guard.velocity = *x_vel, y_vel, z_vel* (float, float, float)

This parameter now takes a second and a third value. It specifies the Y and the Z guard velocities. They default to 0.


### <a name="changed_hitdef_guardsparkangle">guard.sparkangle</a>

>guard.sparkangle = *angle_value* (float)  

Specifies the guard spark rotation directly from a Hitdef. Defaults to 0.


### <a name="changed_hitdef_guardsparksclae">guard.sparkscale</a>

>guard.sparkscale = *x_scale, y_scale* (float, float)  

Specifies the guard spark's scale directly from a Hitdef. Defaults to 1, 1 (no change).

### <a name="changed_hitdef_stand.friction">stand.friction</a>

>stand.friction = *friction_value* (float)

Overrides the opponent's Movement.Stand.Friction constants while they are in the gethit state caused by this HitDef.

### <a name="changed_hitdef_crouch.friction">crouch.friction</a>

>crouch.friction = *friction_value* (float)

Overrides the opponent's Movement.Crouch.Friction constants while they are in the gethit state caused by this HitDef.

### <a name="changed_hitdef_guardsoundchannel">guardsound.channel</a>

>guardsound.channel = *channel_no* (int)

Specifies which of the player's sound channels the guardsound should play on. If omitted, channel_no defaults to -1, meaning the sound will play on any free channel.


### <a name="changed_hitdef_hitsoundchannel">hitsound.channel</a>

>hitsound.channel = *channel_no* (int)

Specifies which of the player's sound channels the hitsound should play on. If omitted, channel_no defaults to -1, meaning the sound will play on any free channel.


### <a name="changed_hitdef_ignorereversaldef">ignorereversaldef</a>

>ignorereversaldef = *value* (bool)

If set to 1, this HitDef will ignore any active ReversalDef on the opponent, hitting them normally. Defaults to 0.


### <a name="changed_hitdef_keepstate">keepstate</a>

>keepstate = *value* (bool)

If set to 1, the hit will apply effects (damage, hitpause, etc.) but the opponent will not change to a gethit state. Defaults to 0.


### <a name="changed_hitdef_mindist">maxdist (changed)</a>

This parameter now takes a third value. It specifies the Z maxdist.


### <a name="changed_hitdef_mindist">mindist (changed)</a>

This parameter now takes a third value. It specifies the Z mindist.

### <a name="changed_hitdef_missonoverride">missonoverride </a>

>missonoverride = *bvalue* (boolean int)

This parameter allows you to choose whether or not a HitDef will miss if it would be overridden(HitOverride), by default, it missing only if P1StateNo, P2StateNo, or P2GetP1State is specified.
P1StateNo and P2StateNo both do not apply if the hit is overridden.


### <a name="changed_hitdef_nochainid">nochainID (changed)</a>

This parameter now accepts up to 8 values, up from 2. 


### <a name="changed_hitdef_p1sprpriority">p1sprpriority</a>

In Mugen, the default value for this parameter was not intuitive and often became a problem. In Ikemen, it defaults to no change.


### <a name="changed_hitdef_p2clsncheck">p2clsncheck</a>

>p2clsncheck= *clsn_type* (string)  

This parameter makes a hit be checked against a specific type of collision box. Valid parameters are `Clsn1`, `Clsn2`, `Size` and `None`.  
Traditionally, fighting games check throws with the `Size` box.  


### <a name="changed_hitdef_p2clsnrequire">p2clsnrequire</a>

>p2clsnrequire= *clsn_type* (string)  

This parameter prevents a hit from happening if the enemy lacks a particular type of collision box, regardless of them overlapping or not with the player.  
  
Note: All Mugen characters were created on the assumption that lacking `Clsn2` makes them invulnerable. Therefore, if a character is designed for compatibility with other Mugen characters, this parameter should be used when checking hits against other types of collision boxes.  


### <a name="changed_hitdef_redlife">redlife</a>

>redlife = *hit_value*, *guard_value* (int)  

Specifies the amount of red life to give P2 if this HitDef connects successfully. If omitted, it defaults to hit_damage (from "damage" parameter) multiplied by the value of `Default.LifeToRedLifeMul` / `Super.LifeToRedLifeMul` specified in data/common.const, scaled by the targets' defense multipliers if necessary. Additional second value is optional and assigns an amount of guard red life to P2.


### <a name="changed_hitdef_score">score</a>

>score = *p1_value*, *p2_value* (float)  

Specifies the score value added to P1 and P2 score count.


### <a name="changed_hitdef_snap">snap</a>

This parameter now actually uses the third value. It specifies the P2 Pos Z.
`snap` takes 4 arguments the 4th one being snaptime.


### <a name="changed_hitdef_sparkangle">sparkangle</a>

>sparkangle = *angle_value* (float)  

Specifies the hitspark rotation directly from a Hitdef. Defaults to 0.


### <a name="changed_hitdef_sparksclae">sparkscale</a>

>sparkscale = *x_scale, y_scale* (float, float)  

Specifies the hit spark's scale directly from a Hitdef. Defaults to 1, 1 (no change).


### <a name="changed_hitdef_teamside">teamside</a>

Makes the HitDef be treated as an attack from the TeamSide you specify (similar to the trigger of TeamSide).  

When used with `Projectile`, setting a teamside different from the player's will allow the projectile to hit its owner and interact with other projectiles from the same player.  


### <a name="changed_hitdef_unhittabletime">unhittabletime</a>

>unhittabletime = *p1_time*, *p2_time* (int)  

Makes the player or the enemy invincible for the specified number of the frames after the hit. Use -1 for no change.  
Defaults to `p1_pausetime + 1, p1_pausetime + 1` for throw attribute attacks, `0, p1_pausetime + 1` for ReversalDef, or `-1, -1` otherwise.


### <a name="changed_hitdef_xaccel">xaccel</a>

>xaccel = *accel* (float) 

Specifies the x acceleration to impart to P2 if the hit connects. Defaults to 0.  
For backwards compatibility reasons, this acceleration is not used by default, as it is not called by `common1.cns`.  

### <a name="changed_hitdef_zaccel">zaccel</a>

>zaccel = *accel* (float) 

Specifies the z acceleration to impart to P2 if the hit connects. Defaults to 0.  
For backwards compatibility reasons, this acceleration is not used by default, as it is not called by `common1.cns`.  


## <a name="changed_hitoverride">HitOverride parameters</a>

### <a name="changed_hitoverride_forceguard">forceguard</a>

>forceguard = *value* (bool)

If set to 1, a successful override will be considered a guarded attack.


### <a name="changed_hitoverride_guardflag">guardflag</a>

>guardflag = *hit_flags* (string)  

Only hits containing the specified flags in their `guardflag` will be overridden.


### <a name="changed_hitoverride_guardflagnot">guardflag.not</a>

>guardflag.not = *hit_flags* (string)  

Hits containing the specified flags in their `guardflag` will not be overridden.

Example:  
```ini
[State Test]; Override attacks that can be blocked standing but not crouching (overheads)
type = HitOverride
trigger1 = 1
attr = SCA, AA
guardflag = H
guardflag.not = L
```


### <a name="changed_hitoverride_keepstate">keepstate</a>

>keepstate = *value* (bool)

If set to 1, the character will override a hit without changing states at all.


## <a name="changed_hitvelset">HitVelSet parameters</a>

### <a name="changed_hitvelset_z">Z</a>

>z = z_flag (int)

A nonzero flag means to change that z-component of the player's velocity to the gethit velocity.


## <a name="changed_modifyexplod">ModifyExplod parameters</a>


### <a name="changed_modifyexplod_ikemenversion">IkemenVersion</a>

In general, characters with `ikemenversion` are able to to modify their explods more freely.  

Additionally, if a character has `ikemenversion`, modifying an explod timer such as `bindtime` or `removetime` will use the current frame as the reference time. For example, if `removetime` is modified to 10, the explod will be removed 10 frames later, regardless of what the original time was.


### <a name="changed_modifyexplod_anim">anim</a>

Modifies the `anim` parameter of an existing Explod. Requires `ikemenversion`.


### <a name="changed_modifyexplod_animelem">animelem</a>

Modifies the `animelem` parameter of an existing Explod.


### <a name="changed_modifyexplod_animelemtime">animelemtime</a>

Modifies the `animelemtime` parameter of an existing Explod.


### <a name="changed_modifyexplod_ignorehitpause">ignorehitpause</a>

Modifies the `ignorehitpause` parameter of an existing Explod. Requires `ikemenversion`.

### <a name="changed_modifyexplod_index">index</a>

The index of the explod to be affected. Defaults to -1 (all).  


### <a name="changed_modifyexplod_space">space</a>

Modifies the `space` parameter of an existing Explod. Requires `ikemenversion`.


### <a name="changed_modifyexplod_under">under</a>

Modifies the `under` parameter of an existing Explod.


## <a name="changed_nothitby">NotHitBy parameters</a>

See HitBy.


## <a name="changed_palfx">PalFx parameters</a>

### <a name="changed_palfx_invertblend">invertblend</a>

>invertblend = *blend_mode* (int)  

Inverts current blend mode if enabled so Sub becomes Add and Add becomes Sub.

For PalFx it accepts 4 values:
* 0 = Disabled (Mugen 1.0 blending behavior)
* 1 = Enabled (Mugen 1.0 blending behavior)
* -1 = Disabled (Mugen 1.1 blending behavior)
* 2 = Enabled (Mugen 1.1 blending behavior)

If character MugenVersion is 1.1 and invertall = 1 and if invertblend param is omitted, it inverts blend by default. For all other MugenVersion invertblend is 0 if omitted.

### <a name="changed_palfx_hue">hue</a>

>hue = *value* (int)

This affects the hue level of the palette. Avaiable range is -256 to 256.

### <a name="changed_palfx_sinmul">sinmul</a>

>sinmul = *ampl_r*, *ampl_g*, *ampl_b*, *period* (int)  

Similliar to "sinadd" parameter but instead it creates effect related to "mul" parameter.

### <a name="changed_palfx_sincolor">sincolor</a>

>sincolor= *ampl*, *period* (int)  

Similliar to "sinadd" parameter but instead it creates effect related to "color" parameter.

### <a name="changed_palfx_sinhue">sinhue</a>

>sinhue= *ampl*, *period* (int)  

Similliar to "sinadd" parameter but instead it creates effect related to "hue" parameter.



## <a name="changed_playerpush">PlayerPush parameters</a>

### <a name="changed_playerpush_priority">Priority</a>

`PlayerPush` now accepts a `priority` parameter. A player with a higher priority can't be pushed by a player with a lower priority and will also push them out of a stage corner. Priority is reset to 0 every frame.  

### <a name="changed_playerpush_affectteam">AffectTeam</a>
>affectteam = *team_type* (string)  

specifies which team's players can be push.

 - F : Allows only allies to be pushed out (enemies will pass through)
 - B : Pushes both allies and enemies
 - E : Pushes only enemies (default)

## <a name="changed_playsnd">PlaySnd parameters</a>

### <a name="changed_playsnd_priority">Priority</a>

>priority = *snd_priority* (int)  

Sets the priority of the sound. Does nothing when channel is not specified. A sound with higher priority will not be interrupted by sounds with lower priority. Defaults to 0.

### <a name="changed_playsnd_loopstart">LoopStart</a>

>loopstart = *loop_start_sample* (int)  

Sets the sample to begin looping from.

### <a name="changed_playsnd_loopend">LoopEnd</a>

>loopend = *loop_end_sample* (int)  

Sets the sample to end looping at.

### <a name="changed_playsnd_startposition">StartPosition</a>

>startposition = *start_sample* (int)  

Sets the sample to begin playing from.

### <a name="changed_playsnd_loopcount">LoopCount</a>

>loopcount = *loop_count*  

If set, will play the sound *loop_count* number of times before stopping. Nonzero values take precedence over the `loop` parameter.

### <a name="changed_playsnd_stopongethit">StopOnGetHit</a>

>stopongethit = *stop*  (bool)

This parameter makes the sound be interrupted if the player gets hit. Defaults to 1 if channel is set to 0.

### <a name="changed_playsnd_stoponchangestate">StopOnChangeState</a>

>stoponchangestate = *stop*  (bool)

This parameter makes the sound be interrupted if the player changes states.


## <a name="changed_projectile">Projectile parameters</a>


### <a name="changed_projectile_ikemenversion">IkemenVersion</a>

In MUGEN, contrary to its documentation, projectiles do not support the ChainID and NochainID parameters. This behavior has been replicated by default in Ikemen GO. However, when a character's `ikemenversion` is not 0, projectiles do take these parameters into account.  


### <a name="changed_projectile_projangle">ProjAngle</a>

Specifies the angle to rotate the Projectile animation.


### <a name="changed_projectile_projxangle">ProjXAngle</a>

Specifies the Xangle of the Projectile animation.


### <a name="changed_projectile_projyangle">ProjYAngle</a>

Specifies the Yangle of the Projectile animation.


### <a name="changed_projectile_projclsnangle">ProjClsnAngle</a>

Defines the angle for the projectile's collision boxes. In degrees.


### <a name="changed_projectile_projclsnscale">ProjClsnScale</a>

Defines the collision box scale for the projectile.


### <a name="changed_projectile_projdepthbound">ProjDepthBound</a>

Like `projedgebound` but for the Z space. Determines how far out of the Z boundaries the projectile can travel before being removed.  


### <a name="changed_projectile_projlayerno">ProjLayerNo</a>

Specify on which layer the projectile should be drawn. Valid values are -1, 0 and 1. Defaults to the same layer as the player.


### <a name="changed_projectile_projfocallenth">ProjFocalLength</a>

Focal Length of the projection. Does nothing when projection is not perspective or perspective2.


### <a name="changed_projectile_projprojection">ProjProjection</a>

Affect how the projectile is drawn when xangle or yangle is not zero.

 - orthographic: The default value, the projectile is drawn using orthographic projection.
 - perspective: The projectile is drawn using perspective projection. Distortion is affected by the position of the sprite relative to the center of the screen.
 - perspective2: The projectile is drawn using perspective projection. Distortion is affected by the position of the sprite relative to the center of the animation.


### <a name="changed_projectile_projreflection">ProjReflection</a>

If 0, disables reflection on the projectile regardless of its shadow color. If 1, enables reflection on the projectile regardless of its shadow color. Defaults to showing a reflection if the projectile's shadow is not 0, 0, 0.

### <a name="changed_projectile_projwindow">ProjWindow</a>

This parameter takes four numbers (similar to the format of a Clsn box) which forms a rectangle outside of which the pixels will not be rendered.


### <a name="changed_projectile_projxshear">ProjXshear</a>

Specifies the amount of horizontal shearing to apply to the projectile. Defaults to 0.

### <a name="changed_projectile_shader">Shader</a>

>shader = *"shader_name"* (string)  

Specifying the name of the currently loaded custom shader will apply that shader to Projectile.

### <a name="changed_projectile_shadertime">ShaderTime</a>

>shadertime = *time* (int)  

Specifying this parameter will remove the custom shader after it has been displayed for the specified number of ticks. The default value is -1.

### <a name="changed_projectile_shadersaram.px">ShaderParam.pX</a>

>shaderparam.pX = *value* (float)  

Specifies the value to send to the custom shader. The value specified here can be used as a variable within the custom shader.
X is limited to 0 to 15, and a maximum of 16 values ​​can be sent.

### <a name="changed_projectile_shadertexx.spr">ShaderTexX.spr</a>

>shadertexX.spr = *group, image* (int, int)  

### <a name="changed_projectile_shadertexx.anim">ShaderTexX.anim</a>

>shadertexX.anim = *anim_no* (int)  

Specifies the texture to send to the custom shader. The sprites specified here can be used as textures within the custom shader.
You can specify 1 or 2 for X, and send up to two sprites.
Each tex can be assigned either a sprite number (spr) or an anim number. It is not possible to assign both sprite and anim numbers to the same tex number simultaneously.
Note that since textures are loaded as raw data, images with palettes may not display correctly as is.

## <a name="changed_removeexplod">RemoveExplod parameters</a>

### <a name="changed_removeexplod_index">index</a>

The index of the explod to be affected. Defaults to -1 (all).  

## <a name="changed_screenbound">ReversalDef parameters</a>

ReversalDef can also use the new HitDef parameters. In addition it has the following exclusive parameters.

### <a name="changed_reversaldef_reversalguardflag">reversal.guardflag</a>

>reversal.guardflag = *hit_flags* (string)  

Only hits containing the specified flags in their `guardflag` will be countered.


### <a name="changed_reversaldef_reversalguardflagnot">reversal.guardflag.not</a>

>reversal.guardflag.not = *hit_flags* (string)  

Hits containing the specified flags in their `guardflag` will not be countered.

Example:  
```ini
[State Test]; Counter attacks that can be blocked crouching but not standing (lows)
type = ReversalDef
trigger1 = 1
reversal.attr = SCA, AA
reversal.guardflag = L
reversal.guardflag.not = H
```

## <a name="changed_screenbound">ScreenBound parameters</a>

### <a name="changed_screenbound_stagebound">StageBound</a>

Lets a character bypass leftbound and rightbound from stage.


## <a name="changed_selfstate">SelfState parameters</a>

### <a name="changed_selfstate_readplayerid">ReadPlayerID</a>

Change to the state of the character with the specified Player ID. If successful, it would take the character with the specified PlayerID to the selected state.  
  
See also [ChangeState](State-controllers-(changed)/#changed_changestate).


## <a name="changed_sprpriority">SprPriority Parameters</a>

### <a name="changed_sprpriority_layerno">LayerNo</a>

>layerno = *layer_number* (int)

Change the layer number on which the player is drawn on. Valid values are -1, 0 and 1. Defaults to 0.  
[TODO - Link to explanation on layer drawing order]

Example:
```ini
[State Test]
type = SprPriority
trigger1 = Time = 0
value = 5
layerno = -1
```


## <a name="changed_stopsnd">StopSnd parameters</a>

### <a name="changed_stopsnd_channel">Channel</a>

Mugen allowed stopping all sounds for all players with `channel = -1`, but had no way to stop only the player's own sound channels. Using `channel = -2` will now do just that.  


## <a name="changed_superpause">SuperPause</a>

### <a name="changed_superpause_brightness">Brightness</a>

Determines how much the screen should darken during the pause. Valid values are between 0 (pitch black) and 255 (no change). Defaults to 128 (same as old `darken` parameter).


## <a name="changed_targetbind">TargetBind parameters</a>


### <a name="changed_targetbind_index">Index</a>

The index of the target to be affected. Defaults to -1 (all).  


### <a name="changed_targebind_pos">Pos (changed)</a>

>pos = *x_pos, y_pos, pos_z* (float, float, float)

This parameter now takes a third value, Specifies the offset from the player's z-axis to bind the target to.


## <a name="changed_targetfacing">TargetFacing parameters</a>

### <a name="changed_targetfacing_index">Index</a>

The index of the target to be affected. Defaults to -1 (all). 


## <a name="changed_targetlifeadd">TargetLifeAdd parameters</a>

### <a name="changed_targetlifeadd_dizzy">Dizzy</a>

If set to 1, enables life to dizzy points conversion support using `Default.LifeToDizzyPointsMul` / `Super.LifeToDizzyPointsMul` const. Defaults to 1.


### <a name="changed_targetlifeadd_index">Index</a>

The index of the target to be affected. Defaults to -1 (all). 


## <a name="changed_targetpoweradd">TargetPowerAdd parameters</a>

### <a name="changed_targetpoweradd_index">Index</a>

The index of the target to be affected. Defaults to -1 (all). 


## <a name="changed_targetstate">TargetState parameters</a>

### <a name="changed_targetstate_index">Index</a>

The index of the target to be affected. Defaults to -1 (all). 


## <a name="changed_targetveladd">TargetVelAdd parameters</a>

### <a name="changed_targetveladd_index">Index</a>

The index of the target to be affected. Defaults to -1 (all). 


### <a name="changed_targetveladd_z">Z</a>

>z = *z_value* (float)

Specifies the value to add to the target's z-velocity.


## <a name="changed_targetvelset">TargetVelSet parameters</a>


### <a name="changed_targetvelset_index">Index</a>

The index of the target to be affected. Defaults to -1 (all). 


### <a name="changed_targetvelset_z">Z</a>

>z = *z_value* (float)

Specifies the value to set the target's z-velocity to.


## <a name="changed_trans">Trans parameters</a>

Ikemen GO has some expanded transparency options.  
Note: Applies to all `trans` definitions (e.g. explods, backgrounds, etc).


### <a name="changed_trans_sub">Sub</a>

The `sub` transparency now also supports alpha values.

```
trans{trans: sub; alpha: 192, 64}
```


### <a name="changed_trans_subadd">SubAdd</a>

The `subadd` transparency mode was added. It draws the sprite in grayscale subtractive transparency, then draws it again in full color additive transparency. The result is a transparent effect that looks more solid and is easier to see against bright backgrounds.  
The `alpha` source parameter controls the intensity of the additive layer, while destination controls the subtractive layer.  
Native implementation of a classic Mugen trick.  

```
trans{trans: subAlpha; alpha: 256, 256}
```


## <a name="changed_zoom">Zoom parameters</a>

Zoom was a beta feature in Mugen 1.1. It is a fully functional state controller in Ikemen GO.  


### <a name="changed_zoom_camerabound">CameraBound</a>

If set to 1, the zoom position is restricted to the current camera position. Defaults to 1.


### <a name="changed_zoom_endlag">EndLag</a>

Like the `lag` parameter, but it applies after the Zoom effect ends.


### <a name="changed_zoom_lag">Lag</a>

Controls the smoothing effect for camera position and scale transitions during zoom, with smaller values leading to quicker adjustments and larger values causing more gradual changes.  
Valid values are between 0 and 1, where 0 snaps the camera instantly and 1 delays the zoom effect indefinitely.  
Defaults to 0.


### <a name="changed_zoom_pos">Pos</a>

The position on screen to bind the zoom, relative to the center of the screen. A value of Pos X, Pos Y will zoom in on P1.


### <a name="changed_zoom_scale">Scale</a>

The camera zoom factor as a float. Values greater than 1 zoom in, while values between 0 and 1 zoom out. For example, a value of 2 doubles the size of the sprites.


### <a name="changed_zoom_stagebound">StageBound</a>

If set to 1, the zoom position is restricted to the stage boundaries. Defaults to 1.


### <a name="changed_zoom_time">Time</a>

Countdown timer that controls how long zoom effects are applied, decreasing by 1 every frame. Once it reaches 0, the zoom stops, and the camera resets to its default behavior without any smoothing or zoom effects. Defaults to 1.
