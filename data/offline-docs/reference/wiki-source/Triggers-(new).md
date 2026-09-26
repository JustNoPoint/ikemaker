The triggers listed in this page are completely new to Ikemen GO.  

Refer to the sidebar for quicker navigation.


# <a name="redirection">New trigger redirections</a>  


## <a name="redirection_helperindex">HelperIndex(n)</a>  

Redirects the trigger to the helper entity by index.

Each helper is assigned an index according to their position among the total number of helpers a player has. These indexes begin at 1, with index 0 being a special case that represents the `root` player. A player with 5 helpers, for instance, will have helpers with indexes 1 through 5.  

It takes redirections into account, allowing the return of a helper's helpers.  
  
**Example:**  
```ini
trigger1 = NumHelper >= 2
trigger1 = HelperIndex(2), MoveType = A
```


## <a name="redirection_p2">P2</a>  

Redirects the trigger to the same player as the "P2" family of triggers (P2StateNo, etc). So, for instance, `P2, StateNo` is equivalent to `P2StateNo`.  

The "P2" enemy has some notable properties:  
- If it is in state 5150 (KO), it will be ignored  
- Is the one the character will always be facing automatically (`facep2`, etc)  
- Only changes when another enemy is at least 30 pixels closer to the player, making it less erratic during team modes  

All of these properties make `P2` the optimal enemy redirection in most cases.  

Note: This redirection should not be mistaken for "Player(2)", which is always player number 2.  
  
**Example:**  
```ini
trigger1 = P2, DizzyPoints <= 100
```


## <a name="redirection_player">Player(n)</a>  

Redirects a trigger to the character with the specified PlayerNo.
  
**Example:**  
```ini
trigger1 = Player(1), AILevel
trigger2 = Player(TeamLeader), MoveType = A
```


## <a name="redirection_playerindex">PlayerIndex(n)</a>

Each player is assigned a specific index in the internal player list. `PlayerIndex` will redirect a trigger to the player (helpers included) with the specified index. The first index is 0. If there are 20 players on screen, valid indexes will be 0 through 19.  
  
Like all "index" triggers, this is especially useful in `for` and `while` loops.  
  
**Example:**  
```go
trigger1 = PlayerIndexExist(1)
trigger1 = PlayerIndex(1), id = 56

# Count all explods on screen
let totalExplod = 0;
for i = 0; NumPlayer - 1; 1 {
	if PlayerIndexExist($i) {
		let totalExplod = $totalExplod + PlayerIndex($i), NumExplod;
	}
}
```

## <a name="redirection_stateowner">StateOwner</a>  

Redirects a trigger to the owner of the current state the character is in. Useful when a custom stated target needs to redirect a trigger to the player.  
Note: states are owned by the root.  
  
**Example:**  
```ini
trigger1 = StateOwner,AILevel
```

# <a name="new">New triggers</a>  

## <a name="new_ailevelf">AiLevelF</a>  

Returns the difficulty level of the player's AI as float value (unlike *AILevel* trigger, which is still floored for compatibility reasons). If AI is enabled on the player, the value ranges from 1 (easiest) to 8 (most difficult). If AI is not enabled on the player, the return value is 0. AI difficulty level with floating point is a result of AI Ramping system (refer to select.def distributed with engine for more information)

**Format:**  
>AILevelF  
  
**Arguments:**  
>none  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = Random < (500 * (AILevelF ** 2 / 64.0))
```

## <a name="new_airjumpcount">AirJumpCount</a>  

Returns the number of (conventional) air jumps the P1 has performed.

**Format:**  
>AirJumpCount  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  

## <a name="new_alpha">Alpha</a>

Returns the value of the player's source/dest alpha applied with Trans sctrl.

**Format:**  
>Alpha argument
  
**Arguments:**  
>source, dest
  
**Return type:**
>int
  
**Example:**  
```ini
trigger1 = Alpha source >= 128 && Alpha dest >= 128
```

## <a name="new_analog">Analog</a>

Returns the value of the player's respective analog axis. Values are normalized from [-1,1] with the exception of analog triggers (`RightTrigger` and `LeftTrigger`) which are normalized to [0.0,1.0].

Note: internally, 256 distinct analog steps exist per axis with the exception of the analog triggers which are halved (128 distinct steps).

**Format:**  
>Axis argument
  
**Arguments:**  
>LeftX, LeftY, RightX, RightY, LeftTrigger, RightTrigger
  
**Return type:**
>float
  
**Example:**  
```ini
trigger1 = Analog(LeftX) >= 0.5 && Analog(RightTrigger) > 0.75
```


## <a name="new_angle">Angle</a>

Returns the value of the player's angle applied with AngleDraw/AngleSet/AngleAdd/AngleMul sctrl.

**Format:**  
>Angle
  
**Arguments:**  
>none  
  
**Return type:**
>float
  
**Example:**  
```ini
trigger1 = Angle >= 90
```

## <a name="new_xangle">XAngle</a>

Returns the value of the player's Xangle applied with AngleDraw/AngleSet/AngleAdd/AngleMul sctrl.

**Format:**  
>XAngle
  
**Arguments:**  
>none  
  
**Return type:**
>float
  
**Example:**  
```ini
trigger1 = XAngle >= 90
```

## <a name="new_yangle">YAngle</a>

Returns the value of the player's yangle applied with AngleDraw/AngleSet/AngleAdd/AngleMul sctrl.

**Format:**  
>YAngle
  
**Arguments:**  
>none  
  
**Return type:**
>float
  
**Example:**  
```ini
trigger1 = YAngle >= 90
```


## <a name="new_animelemvar">AnimElemVar</a>

Returns information about the player's current animation frame as defined in the AIR file. Refer to the AIR file documentation for what each parameter means.  
Note: This trigger was also called `AnimFrame` at one point during development.  

**Format:**  
>AnimElemVar(param_name)  
  
**Arguments:**  
>param_name  
>The name of the parameter to check. Valid values are:  
>AlphaDest, AlphaSource, Angle, Group, HFlip, Image, NumClsn1, NumClsn2, Time, VFlip, XOffset, XScale, YOffset, YScale  
  
**Example:**  
```ini
trigger1 = AnimElemVar(Group) = 200
trigger1 = AnimElemVar(NumClsn1) > 0
```


## <a name="new_animplayerno">AnimPlayerNo</a>

Returns the player number of the owner of the player's current animation.  
Normally returns the same number as the player's player number, but when for instance `ChangeAnim2` is used in a custom state, it will return the number of who owns that animation.  

**Format:**  
>AnimPlayerNo  
  
**Arguments:**  
>none  
  
**Return type:**  
>int
  
**Example:**  
```ini
trigger1 = Player(AnimPlayerNo), SelfAnimExist(1234)
```


## <a name="new_animlength">AnimLength</a>  

Returns total length of the P1 current animation.

**Format:**  
>AnimLength  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = Time = AnimTime - AnimLength
trigger1 = Time = GetHitVar(hittime) - AnimLength
```

## <a name="new_attack">Attack</a>  

Returns P1 current attack value.

**Format:**  
>Attack  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = Attack = 100
```

## <a name="new_attackmul">AttackMul</a>  

Returns the player's current attackmul value.

**Format:**  
>AttackMul  
  
**Arguments:**  
>none  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = AttackMul > 1.0
```

## <a name="new_atan2">Atan2 (Math)</a>

Takes two arguments, and returns the arc tangent of the two specified arguments.

**Format:**  
>Atan2(exp1,exp2)  
  
**Arguments:**  
>exp1  
>Expression 1  
  
>exp2  
>Expression 2  
  
**Return type:**  
>float  
  
**Example:**  
```ini
fvar(10) = Atan2(enemy,pos y-pos y, enemy,pos x-pos x)
```

## <a name="new_bgmvar">BgmVar</a>

Allows checking the filename, freqmul, length, loop, loopcount, loopend, loopstart, position, startposition, and volume of the currently playing BGM.

**Warning: The results of this trigger are NOT network-safe due to user settings such as `Sound.BGMRAMSwap` causing variability in the asynchronicity of BGM operations. Usage of this trigger in production environments is discouraged.**

**Format:**  
>BGMVar  
  
**Arguments:**  
>param_name  
>The name of the variable to check. Valid values are:  
>filename, freqmul, length, loop, loopcount, loopend, loopstart, position, startposition, volume.  
  
**Return type:**  
>variable
  
**Example:**  
```ini
trigger1 = BGMVar(position) = 32768
trigger2 = BGMVar(startPosition) = 0
trigger3 = BGMVar(loopstart) = 1741
trigger4 = BGMVar(loopend) = 65536
trigger5 = BGMVar(volume) = 98
trigger6 = BGMVar(filename) = "sound/test.mp3"
trigger7 = BGMVar(length) = 65536
```


## <a name="new_botboundbodydist">BotBoundBodyDist</a>

Like `BotBoundDist`, except this trigger accounts for the player's bottom `edge` parameter, as defined by the `Depth` state controller.


## <a name="new_botbounddist">BotBoundDist</a>

BotBoundDist gives the distance between the player's z-axis and the `botbound` limit of the stage.

**Format:**  
>BotBoundDist 
  
**Arguments:**  
>none  
  
**Return type:**  
>float
  
**Example:**  
```ini
trigger1 = BotBoundDist < 40
```


## <a name="new_clamp">Clamp (Math)</a>

Takes three arguments, returns a value clamped to an inclusive range of two specified arguments.
**Format:**  
>Clamp(value,min,max)  
  
**Arguments:**  
>value  
>Expression 1  
  
>min  
>Expression 2  
  
>max  
>Expression 3  
  
**Return type:**  
>float  
  
**Example:**  
```ini
fvar(10) = Clamp(fvar(10),10 100)
```

## <a name="new_clsnoverlap">ClsnOverlap</a>

Returns true if the player's specified collision box type is overlapping another player's collision boxes.  
This trigger uses Ikemen's internal collision detection, so it will work even with angled and rescaled boxes.  

**Format:**  
>ClsnOverlap(box_type_1, playerID, box_type_2)  
  
**Arguments:**  
>box_type_1  
>The player's collision box type. Valid values are clsn1, clsn2, and size  
  
>playerID  
>The ID of the player against which to check the overlap  
  
>box_type_2  
>The target's collision box type. Valid values are clsn1, clsn2, and size  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = ClsnOverlap(clsn1, p2,ID, clsn2)
```


## <a name="new_clsnvar">ClsnVar</a>

Returns the specified CLSN coordinate from the specified CLSN index. Back always returns the back coordinate, and front always returns the front coordinate, even if they are reversed in the .AIR file. All coordinates are in the same coordinate space as .AIR.
**Format:**  
>ClsnVar(value_type,index,elem)  
  
**Arguments:**  
>value_type  
>Valid Values are clsn1, clsn2, and size  
  
>index  
>Expression  
  
>elem  
>Valid values are back, front, top, and bottom  
  
**Return type:**  
>float  
  
**Example:**  
```ini
fvar(0) = ClsnVar(Clsn2, 0, Back)
```

## <a name="new_combocount">ComboCount</a>  

Returns the total number of hits done by the player's side in the currently ongoing combo. This value is valid as long as the opposite team combo count stays above 0, otherwise it returns 0 too. Returned value always matches current combo counter tracked by lifebar.

**Format:**  
>ComboCount  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = ComboCount > 8
```

## <a name="new_consecutivewins">ConsecutiveWins</a>  

Returns number of matches won consecutively by this team side. The counter increases for the winning team at the same time MatchOver trigger starts returning 1. Losing a round resets the counter to 0 and prevents increment for this match.

**Format:**  
>ConsecutiveWins  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = ConsecutiveWins > 0
```

## <a name="new_const1080p">Const1080p</a>

Converts a value from the 1080p coordinate space to the player's coordinate space. The conversion ratio between coordinate spaces is the ratio of their widths.

**Format:**  
>Const1080p(exprn)  
  
**Arguments:**  
>exprn  
>Expression containing the value to convert. (float)  
  
**Return type:**  
>float  
  
**Example:**  
```ini
value = Const1080p(12)
; Sets value 2 if the player has a coordinate space of 320x240 (240p).
; Sets value 4 if the player has a coordinate space of 640x480 (480p).
; Sets value 8 if the player has a coordinate space of 1280x720 (720p).
; Sets value 12 if the player has a coordinate space of 1920x1080 (1080p).
```


## <a name="new_debugmode">DebugMode</a>

Returns information related to the debug mode.

**Format:**  
>DebugMode(param_name)  
  
**Arguments:**  
>param_name  
>The name of the parameter to check. Valid values are:  
>accel, clsndisplay, debugdisplay, lifebarhide, wireframedisplay, roundrestarted
  
**Example:**  
```ini
trigger1 = DebugMode(accel) != 0
trigger1 = DebugMode(clsndisplay)
```


## <a name="new_decisiveround">DecisiveRound</a>

Returns 1 if the match will conclude if the player's team wins.

**Format:**  
>DecisiveRound  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = DecisiveRound
```

## <a name="new_deg">Deg (Math)</a>

Converts an argument value from radians to degrees.

**Format:**  
>Deg(exp)  
  
**Arguments:**  
>exp  
>Expression  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = Deg(pi/2) = 90
```

## <a name="new_defence">Defence</a>  

Returns the player's current defence value. This value accounts for all defence multipliers.

**Format:**  
>Defence  
  
**Arguments:**  
>none  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = Defence = 100
```

## <a name="new_defencemul">DefenceMul</a>  

Returns the player's current defencemul value.

**Format:**  
>DefenceMul
  
**Arguments:**  
>none  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = DefenceMul > 1.0
```

## <a name="new_displayname">DisplayName</a>

Returns the player's displayed name. Note that the lifebar name is not necessarily the same.

**Format:**  
>DisplayName [oper] "name"  
  
**Arguments:**  
>[oper]  
>=, != (other operators not valid)  
  
>"name" (string)  
>Name to compare against. Must be in double quotes.  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = EnemyNear, DisplayName = "Gopher"
```

## <a name="new_dizzy">Dizzy</a>  

Returns 1 if character is under [dizzy effect](Miscellaneous-Info/#dizzy) (assigned by [DizzySet](State-controllers-(new)/#new_dizzyset) sctrl).

**Format:**  
>Dizzy  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = !Dizzy
```

## <a name="new_dizzypoints">DizzyPoints</a>  

Returns the amount of [dizzy points](Character-features/#dizzypoints) the player has.

**Format:**  
>DizzyPoints  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = DizzyPoints = 0
```

## <a name="new_dizzypointsmax">DizzyPointsMax</a>  

Returns the maximum amount of [dizzy points](Character-features/#dizzypoints) the player can have. This is normally the same value as LifeMax (adjustable in character's CNS `[Data]` section).

**Format:**  
>DizzyPointsMax  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = DizzyPoints < DizzyPointsMax / 2
```


## <a name="new_drawpal">DrawPal</a>

returns the value of the group and index of the palette being used to draw the sprites at the moment, unlike PalNo, which returns the palette selected in the character select screen. 

**Format:**  
>DrawPal 
> 
**Arguments:**  
>group, index  
  
**Return type:**  
>int  
  
**Example:**  
```ini
[State -2, PowerAdd]
type = PowerAdd
trigger1 = DrawPal(group) = 1 && DrawPal(index) = 12
value = 30
```

## <a name="new_envshakevar">EnvShakeVar</a>  

Allows checking the (remaining) time, frequency and amplitude of the current EnvShake.

**Format:**  
>EnvShakeVar  
  
**Arguments:**  
>param_name  
>The name of the constant to check. Valid values are: time, freq, ampl  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = EnvShakeVar(time) = 1
trigger2 = EnvShakeVar(freq) = 60
trigger3 = EnvShakeVar(ampl) = -4
```


## <a name="new_explodvar">ExplodVar</a>

Returns the specified explod parameter. Use -1 for ID to iterate over all explods.

**Format:**  
>ExplodVar(id, index, param)  
  
**Arguments:**  
>id  
>Expression 1  
  
>index  
>Expression 2  
  
>param  
>Valid values are accel x, accel y, anim, animelem, animelemtime, angle, angle x, angle y, bindid, bindtime, facing, drawpal.group, drawpal.index, ID, layerno, pausemovetime, pos x, pos y, removetime, scale x, scale y, sprpriority, time, vel x, vel y  
  
**Return type:**  
>int or float  


## <a name="new_fightscreenstate">FightScreenState</a>

Allows checking if the fight screen is displaying specific screens.  

**Format:**  
>FightScreenState(param)
  
**Arguments:**  
>param  
>The parameter to check. See details   

Details:
* `fightdisplay`: Returns true if the fight call is being displayed. (bool)
* `kodisplay`: Returns true if the KO screen is being displayed. (bool)
* `rounddisplay`: Returns true if the round number screen is being displayed. (bool)
* `windisplay`: Returns true if the winner announcement screen is being displayed. (bool)
  
**Example:**  
```ini
trigger1 = FightScreenState(rounddisplay) = 1
trigger2 = FightScreenState(fightdisplay) = 1
```


## <a name="new_fightscreenvar">FightScreenVar</a>

Returns information about the fight screen (commonly referred to as "lifebars").

**Format:**  
>FightScreenVar(param_name)  
  
**Arguments:**  
>param_name  
>The name of the parameter to check. Valid values are:  
>info.author, info.localcoord.x, info.localcoord.y, info.name, round.ctrl.time, round.over.hittime, round.over.time, round.over.waittime, round.over.wintime, round.slow.time, round.start.waittime, round.callfight.time, time.framespercount  

Refer to lifebar documentation and examples for the function of each argument.
  
**Example:**  
```ini
trigger1 = FightScreenVar(Info.Name) = "Some lifebar"
trigger1 = FightScreenVar(Info.LocalCoord.X) = 1280
trigger1 = Time > FightScreenVar(Round.Ctrl.Time)
```


## <a name="new_fighttime">FightTime</a>  

Returns the amount of ticks since the start of the actual fight.

**Format:**  
>FightTime  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = FightTime > 600
```

## <a name="new_firstattack">FirstAttack</a>  

Returns 1 if this character has landed the first attack (before any of the opponents or team partners) in the current round. Otherwise returns 0.

**Format:**  
>FirstAttack  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = FirstAttack
```

## <a name="new_float">Float (math)</a>  

Converts argument evaluating to int type into float type.

**Format:**  
>Float(exp)  
  
**Arguments:**  
>exp  
>Expression  
  
**Return type:**  
>float  
  
**Example:**  
```ini
fvar(10) = Float(Life) / LifeMax
```


## <a name="new_gamemode">GameMode</a>  

Returns the current game mode.

**Format:**  
>GameMode [oper] "name"  
  
**Arguments:**  
>[oper]  
>=, != (other operators not valid)  
  
>"name" (string)  
>Name to compare against. Must be in double quotes.  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = GameMode = "arcade"
```

The following game modes are detectable by default:
- arcade
- bonus
- bossrush
- challenger
- demo
- freebattle
- netplaysurvivalcoop
- netplayteamcoop
- netplayversus
- randomtest
- survival
- survivalcoop
- teamcoop
- timeattack
- training
- versus
- versuscoop
- watch

The trigger can be also used to detect [story mode arcs](Miscellaneous-Info/#arcs) and modes added via [external modules](Miscellaneous-Info/#lua_modules).


## <a name="new_gameoption">GameOption</a>

Allows checking the various game options as defined in config.ini (TBD)
Keep in mind that until string support is added to the engine, only numeric values are useful to return.

**Format:**  
>GameOption  
  
**Arguments:**  
>param_name  
>The name of the variable to check.
  
**Return type:**  
>variable
  
**Example:**  
```ini
trigger1 = GameOption(sound.wavchannels) = 32
```


## <a name="new_gamevar">GameVar</a>

Allows checking some system variables that generally don't justify having their own dedicated triggers.  

**Format:**  
>GameVar(param)
  
**Arguments:**  
>param  
>The parameter to check. See details   

Details:
* `introtime`: Returns the internal timer that controls pre-fight screens. (int)
* `outrotime`: Returns the internal timer that controls post-fight screens. (int)
* `pausetime`: Returns the time that the game is under the effect of `Pause`. (int)
* `slowtime`: Returns the time that the game is under the effect of KO slowdown. (int)
* `superpausetime`: Returns the time that the game is under the effect of `SuperPause`. (int)
* `persistrounds`: Returns `1` if the round persist flag is active. (int)
* `persistlife`: Returns `1` if the life persist flag is active. (int)
* `persistmusic`: Returns `1` if the music persist flag is active. (int)
* `hidebars`: Returns `1` if the hidebars flag is active. (int)
  
**Example:**  
```ini
trigger1 = GameVar(superpausetime) = 0
trigger2 = GameVar(introtime) = FightScreenVar(round.ctrl.time)
```


## <a name="new_groundangle">GroundAngle</a>  

TODO: ? Related to undocumented [PlatformAngle](State-controllers-(changed)/#changed_projectile_platformangle) projectile parameter.

**Format:**  
>GroundAngle  
  
**Arguments:**  
>none  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = GroundAngle != 0
```


## <a name="new_groundlevel">GroundLevel</a>

Returns the character's ground level, which is normally 0 but can be changed via [GroundLevelOffset](State-controllers-(new)/#new_groundleveloffset).  
  
**Format:**  
>GroundLevel
  
**Arguments:**  
>none  
  
**Return type:**  
>float  


## <a name="new_guardbreak">GuardBreak</a>  

Returns 1 if character is under [guard break](Miscellaneous-Info/#guardbreak) (assigned by [GuardBreakSet](State-controllers-(new)/#new_guardbreakset) sctrl).

**Format:**  
>GuardBreak  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = !GuardBreak
```

## <a name="new_guardcount">GuardCount</a>  

Returns how many hits of the current attack were guarded. Similar to Hitcount.

**Format:**  
>GuardCount  
  
**Arguments:**  
>none  
  
**Return type:**  
>int
  
**Example:**  
```ini
trigger1 = GuardCount >= 2
```

## <a name="new_guardpoints">GuardPoints</a>  

Returns the amount of [guard points](Character-features/#guardpoints) the player has.

**Format:**  
>GuardPoints  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = GuardPoints = 0
```

## <a name="new_guardpointsmax">GuardPointsMax</a>  

Returns the maximum amount of [guard points](Character-features/#guardpoints) the player can have. This is normally the same value as LifeMax (adjustable in character's CNS `[Data]` section).

**Format:**  
>GuardPointsMax  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = GuardPoints < GuardPointsMax / 2
```


## <a name="new_helperindexexist">HelperIndexExist(n)</a>

Returns 1 if a player's helper with the specified index number exists, or 0 otherwise.
  
**Example:**  
```ini
trigger1 = HelperIndexExist(5)
trigger1 = HelperIndex(5),time > 0
```


## <a name="new_helpername">HelperName</a>  

Returns the helper's name (assigned via helper's name parameter, which defaults to "\<parent\>'s helper" if a unique name is not assigned).

**Format:**  
>HelperName [oper] "name"  
  
**Arguments:**  
>[oper]  
>=, != (other operators not valid)  
  
>"name" (string)  
>Name to compare against. Must be in double quotes.  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = HelperName = "Fireball"
```


## <a name="new_helpervar">HelperVar</a>

Returns a helper's unique properties. If called from a root player, the return is always invalid.  

**Format:**  
>helpervar(param)
  
**Arguments:**  
>param  
>The parameter to check. See details  
  
**Return type:**  
>Varies. See details  

Details:
* `clsnproxy`: Returns clsnproxy `ID` parameter (bool)
* `helpertype`: Returns the `helpertype` parameter as an int. Returns 1 for `normal`, 2 for `player` and 3 for `projectile` (int)
* `ID`: Returns the `ID` parameter (int)
* `keyctrl`: Returns the `keyctrl` parameter (bool)
* `ownclsnscale`: Returns the `ownclsnscale` parameter (bool)
* `ownpal`: Returns the `ownpal` parameter (bool)
* `preserve`: Returns the `preserve` parameter (bool)
  
**Example:**   
```ini
trigger1 = Helper(1000), HelperVar(keyctrl)
```


## <a name="new_hitbyattr">HitByAttr</a>

Checks if the player can be hit by an attack with the specified attribute.  
See also documentation for the `attr` parameter in `HitDef` as well as `HitDefAttr`.  

**Format:**  
>HitByAttr(flag1, flag2)  
  
**Arguments:**  
>flag1  
>The state type flag.  
  
>flag2  
>The attack type flag.  
  
**Return type:**  
>boolean int (1 or 0)  

Note: Because `HitBy` and `NotHitBy` often last only one frame, player processing order can have a great influence in the return of this trigger.  
  
**Example:**  
```ini
trigger1 = HitByAttr(S, NT); Returns true if the player can be hit by standing throws
```


## <a name="new_hitdefvar">HitDefVar</a>

Returns information about the player's currently active HitDef or ReversalDef. The parameter format is the same as in the `HitDef` state controller.  
Note: When the player has no active HitDef or ReversalDef, this trigger will return the default values of each parameter. It is generally advised to check if a HitDef or ReversalDef is active first with `HitDefAttr` or `ReversalDefAttr`.  

**Format:**  
>HitDefVar(param)
  
**Arguments:**  
>param  
  
>The parameter to check. Valid values:  
>See details  
  
**Return type:**  
>Varies. See details  

Details:
* `guard.dist.depth.bottom`: Returns the guard distance in the z-axis, under the char
* `guard.dist.depth.top`: Returns the guard distance in the z-axis, above the char
* `guard.dist.height.bottom`: Returns the guard distance in the y-axis, under the char
* `guard.dist.height.top`: Returns the guard distance in the y-axis, above the char
* `guard.dist.width.back`: Returns the guard distance in the x-axis, behind the char
* `guard.dist.width.front`: Returns the guard distance in the x-axis, in front of the char
* `guard.pausetime`: Returns the first value of the Hitdef's `guard.pausetime` parameter (int)
* `guard.sparkno`: The guard spark animation number (int)
* `guard.shaketime`: Returns the second value of the Hitdef's `guard.pausetime` parameter (int)
* `guarddamage`: Returns the second value of the Hitdef's `damage` parameter (int)
* `guardflag`: Checks if the specified flags exist in the Hitdef's `guardflag`. Valid flags `HLMAFDP+-` (bool)
* `guardsound.group`: Returns the guard sound's group (first value) (int)
* `guardsound.number`: Returns the guard sound's number (second value) (int)
* `hitdamage`: Returns the first value of the Hitdef's `damage` parameter (int)
* `hitflag`: Checks if the specified flags exist in the Hitdef's `hitflag`. Valid flags `HLMAFDP+-` (bool)
* `hitsound.group`: Returns the hit sound's group (first value) (int)
* `hitsound.number`: Returns the hit sound's number (second value) (int)
* `id`: Returns the Hitdef's `id` parameter (int)
* `p1stateno`: Returns the Hitdef's `p1stateno` parameter (int)
* `p2stateno`: Returns the Hitdef's `p2stateno` parameter (int)
* `pausetime`: Returns the first value of the Hitdef's `pausetime` parameter (int)
* `priority`: Returns the first value of the Hitdef's `priority` parameter (int)
* `shaketime`: Returns the second value of the Hitdef's `pausetime` parameter (int)
* `sparkno`: Returns the hit spark animation number (int)
* `sparkx`: Returns the X component of the Hitdef's `sparkxy` parameter (float)
* `sparky`: Returns the Y component of the Hitdef's `sparkxy` parameter (float)
* `xaccel`: Returns the Hitdef's `xaccel` parameter (float)
* `yaccel`: Returns the Hitdef's `yaccel` parameter (float)
* `zaccel`: Returns the Hitdef's `zaccel` parameter (float)
* `ground.velocity.x`: Returns the X component of the Hitdef's `ground.velocity` parameter (float)
* `ground.velocity.y`: Returns the Y component of the Hitdef's `ground.velocity` parameter (float)
* `ground.velocity.z`: Returns the Z component of the Hitdef's `ground.velocity` parameter (float)
* `air.velocity.x`: Returns the X component of the Hitdef's `air.velocity` parameter (float)
* `air.velocity.y`: Returns the Y component of the Hitdef's `air.velocity` parameter (float)
* `air.velocity.z`: Returns the Z component of the Hitdef's `air.velocity` parameter (float)
* `down.velocity.x`: Returns the X component of the Hitdef's `down.velocity` parameter (float)
* `down.velocity.y`: Returns the Y component of the Hitdef's `down.velocity` parameter (float)
* `down.velocity.z`: Returns the Z component of the Hitdef's `down.velocity` parameter (float)
* `guard.velocity.x`: Returns the X component of the Hitdef's `guard.velocity` parameter (float)
* `guard.velocity.y`: Returns the Y component of the Hitdef's `guard.velocity` parameter (float)
* `guard.velocity.z`: Returns the Z component of the Hitdef's `guard.velocity` parameter (float)
* `airguard.velocity.x`: Returns the X component of the Hitdef's `airguard.velocity` parameter (float)
* `airguard.velocity.y`: Returns the Y component of the Hitdef's `airguard.velocity` parameter (float)
* `airguard.velocity.z`: Returns the Z component of the Hitdef's `airguard.velocity` parameter (float)
* `ground.cornerpush.veloff`: Returns the Hitdef's `ground.cornerpush.veloff` parameter (float)
* `air.cornerpush.veloff`: Returns the Hitdef's `air.cornerpush.veloff` parameter (float)
* `down.cornerpush.veloff`: Returns the Hitdef's `down.cornerpush.veloff` parameter (float)
* `guard.cornerpush.veloff`: Returns the Hitdef's `guard.cornerpush.veloff` parameter (float)
* `airguard.cornerpush.veloff`: Returns the Hitdef's `airguard.cornerpush.veloff` parameter (float)
* `fall.velocity.x`: Returns the X component of the Hitdef's `fall.velocity` parameter (float)
* `fall.velocity.y`: Returns the Y component of the Hitdef's `fall.velocity` parameter (float)
* `fall.velocity.z`: Returns the Z component of the Hitdef's `fall.velocity` parameter (float)

Notes:
* `guardflag` and `hitflag` are not simply a direct reading of the Hitdef's parameter. That is to say `HitDefVar(guardflag) = L` returns true whether the Hitdef's guardflag is `L`, `M` or `MA` for example.  
  
**Example:**  
```ini
trigger1 = HitDefVar(hitdamage) >= 100
trigger2 = P2, HitDefVar(guardflag) = L; attack can be blocked crouching
trigger3 = P2, HitDefVar(guardflag) != H; attack cannot be blocked standing
```


## <a name="new_hitoverridden">HitOverridden</a>  

Returns 1 during frame in which player has overridden default gethit behavior via HitOverride state controller. Otherwise returns 0.

**Format:**  
>HitOverridden  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = HitOverridden
```


## <a name="new_ikemenversion">IkemenVersion</a>

Returns one component of the character's Ikemen version as an integer.

**Format:**
>IkemenVersion(param_name)  

**Arguments:**
>param_name  
>The version component to return. Valid values are:  
>Major, Minor, Patch  

**Return type:**
>int  

**Example:**
```ini
trigger1 = IkemenVersion(major) = 0 && IkemenVersion(minor) = 98 && IkemenVersion(patch) = 2
````


## <a name="new_incustomanim">InCustomAnim</a>

Returns 1 if the character is in a custom animation, such as when `ChangeAnim2` is used in a custom state.  

**Format:**  
>InCustomAnim  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = InCustomAnim
```


## <a name="new_incustomstate">InCustomState</a>  

Returns 1 if the character is in a custom state (sent into another player's state).

**Format:**  
>InCustomState  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = InCustomState
```


## <a name="new_index">Index</a>

Returns the player's index as an integer. See [PlayerIndex](Triggers-(new)/#redirection_playerindex).


## <a name="new_indialogue">InDialogue</a>  

Returns 1 during ongoing dialogue initiated by [Dialogue](State-controllers-(new)/#new_dialogue) state controller.

**Format:**  
>InDialogue  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = InDialogue
```


## <a name="new_inputtime">InputTime</a>

Returns number of frames since a given button was pressed or released. A positive number means the button is being held, while a negative number means it has been released. For players without `keyctrl`, it returns 0.  

This time advances regardless of the player being paused.  

**Format:**  
>InputTime(button)  
  
**Arguments:**  
>button  
>The button to check. Valid values are:  
>B, F, D, U, a, b, c, x, y, z, s, d, w, m, L, R  
>These are the four cardinal directional inputs (B, F, D, U); the six attack buttons (a, b, c, x, y, z); start (s); the two new attack/tag buttons (d, w); the select/back/menu button (m); and absolute left/right directional inputs (L, R).  
  
**Example:**  
```ini
trigger1 = InputTime(F) > 0; forward is being held
trigger2 = InputTime(U) < 0; up is not being held
trigger3 = InputTime(a) = 1; a was just pressed
trigger4 = InputTime(b) = 30; b has been held for 30 frames
trigger5 = InputTime(c) = -40; c was released 40 frames ago
```


## <a name="new_IntroState">IntroState</a>

Returns the current intro state number:  
0: Not applicable, or players have gained ctrl after "fight!"  
1: Pre-intro (RoundState = 0)  
2: Player intros (RoundState = 1)  
3: Round announcement  
4: Fight called  

**Format:**  
>IntroState  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = IntroState = 3
```

## <a name="new_isasserted">IsAsserted</a>  

Returns 1 if the character has specified AssertSpecial state controller flag asserted. Flags that affect all characters at once don't have to be asserted directly by character to be detectable.

**Format:**  
>IsAsserted(flag_name)  
  
**Arguments:**  
>flag_name  
>The name of the AssertSpecial state controller flag to check (string).  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = IsAsserted(noBG)
```

## <a name="new_isclsnproxy">IsClsnProxy</a>

Returns if the helper is a [Clsn Proxy](./State-controllers-(changed)#clsnproxy).

**Format:**  
>IsClsnProxy
  
**Arguments:**
>none
  
**Return type:**
>boolean int (1 or 0)
  
**Example:**  
```ini
trigger1 = IsClsnProxy
```

## <a name="new_ishost">IsHost</a>  

Returns if the player is host in online match.

**Format:**  
>IsHost  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = IsHost
```


## <a name="new_jugglepoints">JugglePoints</a>

Returns the remaining juggle points between the player and another player with the specified ID. If the specified ID is not yet a target of the first player, the trigger will simply return the maximum juggle points.

**Format:**  
>JugglePoints(exprn)
  
**Arguments:**  
>exprn
>An expression evaluating to a player ID number (int).
  
**Return type:**  
>int
  
**Example:**  
```ini
trigger1 = JugglePoints(EnemyNear, ID) < 10
```


## <a name="new_lastplayerid">LastPlayerID</a>

Returns the ID number of the last spawned player or helper.

**Format:**  
>LastPlayerID
  
**Arguments:**  
>none  
  
**Return type:**  
>int
  
**Example:**  
```ini
trigger1 = PlayerID(LastPlayerID), HitDefAttr = SCA, AP
```


## <a name="new_layerno">LayerNo</a>

Returns the layer number on which the character is currently being drawn on.

**Format:**  
>LayerNo
  
**Arguments:**  
>none  
  
**Return type:**  
>int
  
**Example:**  
```ini
trigger1 = LayerNo = -1
```


## <a name="new_lerp">Lerp (Math)</a>

Linear interpolation. Takes three arguments, and returns a number between two specified arguments at a specific increment. 

**Format:**  
>Lerp(a,b,amount)  
  
**Arguments:**  
>a  
>Expression 1  
  
>b  
>Expression 2  
  
>amount(Avaiable range 0-1)  
>Expression 3  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = Lerp(0, 100, 0.5) = 50
```


## <a name="new_localcoord">LocalCoord</a>

Returns the character's `localcoord` as a float. This trigger returns a constant value even when the player is in a custom state.

**Format:**  
>LocalCoord [component]  
  
**Arguments:**  
>[component]  
>X, Y  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = LocalCoord X < Enemy, LocalCoord Y
```

## <a name="new_map">Map</a>  

Use the name of the map you want to recognize in parentheses. For example, a character with the below map will return Map(age) as a value set in character DEF file or via various state controllers that can modify character's map. If nothing is set, 0 is returned.

**Format:**  
>Map  
  
**Arguments:**  
>name  
>Name of the map  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = Map(age) >= 18
```

## <a name="new_max">Max (math)</a>  

Takes two arguments, and returns the highest-valued number.

**Format:**  
>Max(exp1,exp2)  
  
**Arguments:**  
>exp1  
>Expression 1  
  
>exp2  
>Expression 2  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = Max(var(3), 10)
```

## <a name="new_memberno">MemberNo</a>  

Returns character's team member position. Team leader is 1, while partners receive successive numbers. In Tag mode this value is dynamic.  

**Format:**  
>MemberNo  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = MemberNo = 1
```

## <a name="new_min">Min (math)</a>  

Takes two arguments, and returns the lowest-valued number.

**Format:**  
>Min(exp1,exp2)  
  
**Arguments:**  
>exp1  
>Expression 1  
  
>exp2  
>Expression 2  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = Min(var(3), 10)
```

## <a name="new_motifstate">MotifState</a>

Allows retrieval of whether the specified post-round sequence is active.  

**Format:**  
>MotifState(parameter)
  
**Arguments:**  
>parameter  
>The name of the motif state to check. Valid values are:  
>challenger, continuescreen, continueyes, continueno, demo, dialogue, menu, victoryscreen, winscreen, hiscore   
  
**Return type:**  
>boolean int (1 or 0)  


## <a name="new_motifvar">MotifVar</a>

Allows checking the various screenpack options as defined in system.def (TBD)
Keep in mind that until string support is added to the engine, only numeric values are useful to return.

**Format:**  
>MotifVar  
  
**Arguments:**  
>param_name  
>The name of the variable to check.
  
**Return type:**  
>variable
  
**Example:**  
```ini
trigger1 = MotifVar(info.mugenversion) >= 1
```




## <a name="new_movecountered">MoveCountered</a>  

This trigger is valid only when the player is in an attack state. MoveCountered returns 1 on attack contact, at the exact frame that p1 interrupts p2 attack (true for 1 frame, even if both P1 and P2 countered each other's moves). After contact, MoveCountered's return value will increase by 1 for each game tick that P1 is not paused. It gives 0 otherwise. See Details section of Mugen's `MoveContact` trigger for more information.

**Format:**  
>MoveCountered  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = MoveCountered = 1
```


## <a name="new_movehitvar">MoveHitVar</a>

Similarly to `GetHitVar`, this trigger allows retrieving information about the last hit the player inflicted.  
This trigger works even if that hit acquired no `target`.  

**Format:**  
>MoveHitVar(parameter)
  
**Arguments:**  
>parameter  
>The name of the hit parameter to check. Valid values are:  
>cornerpush.veloff, frame, overridden, playerid, playerno, sparkx, sparky, uniqhit  
  
**Return type:**  
>Varies. See details

Details:
* `cornerpush.veloff`: Returns the stored velocity offset used for cornerpush. (float)  
* `frame`: Returns true only during the same frame where the player connected an attack. (bool)  
* `overridden`: Returns true if the last hit encountered a HitOverride. (bool)  
* `playerid`: Returns ID of the last player hit by the HitDef. (int)  
* `playerno`: Returns the player number of the last player hit by the HitDef. (int)  
* `sparkx`: Returns the horizontal offset of the hitsparks created by the Hitdef. (float)  
* `sparky`: Returns the vertical offset of the hitsparks created by the Hitdef. (float)  
* `uniqhit`: Returns the number of players the last HitDef connected against. (int)  

**Notes:**  
* Unlike `MoveHit`, `MoveHitVar(frame)` updates during a hitpause.
* `MoveHitVar(sparkx)` and `MoveHitVar(sparky)` offsets are relative to the attacking player's position.
  
**Example:**  
```ini
[State FX]
type = explod
trigger1 = MoveHit = 1
trigger1 = MoveHitVar(Frame) = 1
postype = p1
pos = MoveHitVar(SparkX), MoveHitVar(SparkY)
```


## <a name="new_mugenversion">MugenVersion</a>

Returns one component of the character's Mugen version as an integer.

Characters with an Ikemen version are treated as Mugen 1.1, regardless of the value specified in the DEF file. WinMugen characters are treated as 0.5.

**Format:**
>MugenVersion(param_name)  

**Arguments:**
>param_name  
>The version component to return. Valid values are:  
>Major, Minor  

**Return type:**
>int  

**Example:**
```ini
trigger1 = MugenVersion(major) = 1 && MugenVersion(minor) = 1
````


## <a name="new_numplayer">NumPlayer</a>

Returns total number of players (including helpers, attached chars, etc) existing ingame.
  
**Example:**  
```ini
trigger1 = NumPlayer > 5
```


## <a name="new_numstagebg">NumStageBG</a>

Returns the number of BG elements in the stage that have the specified ID. If the ID argument is not used, or if ID is -1, it returns the total.  

**Format:**  
>1. NumStageBG  
>2. NumStageBG(ID)  
  
**Arguments:**  
>ID  
>Expression evaluating to an ID number (int)  
  
**Return type:**  
>int  
  
**Example:**  
```go
if numStageBG > 0 {
	for i = 0; numStageBG(-1) - 1; 1 {
		modifyStageBG{
			ID: -1;
			index: $i;
			pos.x: randomRange(-10, 10);
			pos.y: randomRange(-10, 10);
		}
	}
}
```


## <a name="new_numtext">NumText</a>

This trigger takes an ID number as an optional argument. If the ID number is omitted, NumText returns the number of texts owned by the player. If the ID number is included, then NumText returns the number of texts with that ID number that are owned by the player. The ID number must be greater than -1. An ID number of -1 or less will give the same behavior as if the ID number is omitted.

**Format:**  
>1.NumText  
>2.NumText(exprn)  
  
**Arguments:**  
>exprn  
>Expression evaluating to an ID number (int)  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = NumText >= 2
trigger1 = NumText(1234) >= 2
```


## <a name="new_offset">Offset</a>


Returns the value of the player's x,y offset applied with OffSet sctrl.

**Format:**  
>OffSet argument
  
**Arguments:**  
>x, y
  
**Return type:**
>float
  
**Example:**  
```ini
trigger1 = OffSet x > 100 && OffSet y > 50
```

## <a name="new_OutroState">OutroState</a>

Returns the current outro state number:  
0: Not applicable  
1: Payers can still act, allowing a possible double KO  
2: Players still have control, but the match outcome can no longer be changed  
3: Players lose control, but the round has not yet entered win states  
4: Player win states  
5: Round over (starting from the last frame of the RoundState sequence and continuing through the entire post-round sequence, individually detactable with [MotifState](https://github.com/ikemen-engine/Ikemen-GO/wiki/Triggers-(new)#motifstate) trigger)  

**Format:**  
>OutroState  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = OutroState = 3
```

## <a name="new_pxname">P5Name, P6Name, P7Name, P8Name</a>  

Same as P1Name-P4Name, except that these return the name of other team members, if present. If there is no such opponent, then it returns 0 no matter what name is specified. Similarly, P5Name != "name" will return 1 no matter what name is specified.

**Format:**  
>PXName [oper] "name"  
  
**Arguments:**  
>[oper]  
>=, != (other operators not valid)  
  
>"name" (string)  
>Name to compare against. Must be in double quotes.  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = P5Name = "Kumquat"
```


## <a name="new_palfxvar">PalFXVar</a>

[TODO] Returns information about the player, background or global ("all") PalFX. Accepted parameters:

time  
add.r, add.g, add.b  
mul.r, mul.g, mul.b  
color, hue, invertall, invertblend  
bg.time  
bg.add.r, bg.add.g, bg.add.b  
bg.mul.r, bg.mul.g, bg.mul.b  
bg.color, bg.hue, bg.invertall  
all.time  
all.add.r, all.add.g, all.add.b  
all.mul.r, all.mul.g, all.mul.b  
all.color, all.hue, all.invertall, all.invertblend  
  
**Example:**  
```ini
trigger1 = PalFXVar(add.r) != 0
  ;triggers when red has been added to the player via PalFX
```


## <a name="new_parentexist">ParentExist</a>

Returns true if the helper's parent is still present in the game.
  
**Example:**  
```
if parentExist {
    bindToParent{}
}
```


## <a name="new_pausetime">PauseTime</a>  

Returns the time until the active Pause and/or SuperPause effect expires (whichever lasts longer). The non 0 value is returned only after movetime parameter of these sctrls expires (player can no longer move).

Normally states are not running during Pause and SuperPause, so this trigger will only work when used in a special statedef -4, which ignores these state controllers.

**Format:**  
>PauseTime  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = PauseTime = 0
  ;triggers when the player's movement is not paused by Pause/SuperPause sctrls.
```

## <a name="new_physics">Physics</a>  

Returns the player's physics-type. Refer to the section on StateDef in the CNS documentation for more details on physics.

**Format:**  
>Physics [oper] physics_type  
  
**Arguments:**  
>[oper]  
>=, != (other operators not valid)  
  
>physics_type (string)  
>S, C, A, N *(stand, crouch, air, none)*  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = Physics != A
```


## <a name="new_playerindexexist">PlayerIndexExist(n)</a>

Returns 1 if a player with the specified index number exists, 0 otherwise. See [PlayerIndex](Triggers-(new)/#redirection_playerindex).
  
**Example:**  
```ini
trigger1 = PlayerIndexExist(2)
```


## <a name="new_playerno">PlayerNo</a>  

Returns character's player number. Player 1 side uses odd numbers (1, 3, 5, 7), player 2 side even numbers (2, 4, 6, 8). Stage [AttachedChar](Stage-features/#info_attachedchar) uses number outside maximum player range (9).

**Format:**  
>PlayerNo  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = PlayerNo < 3
```


## <a name="new_playernoexist">PlayerNoExist</a>

Evaluates if the specified player number is currently in use.  

**Format:**  
>PlayerNoExist(player_number)  
  
**Arguments:**  
>player_number  
>An expression that evaluates to the player number to check for (int)  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = PlayerNoExist(3); Returns true if there's a player number 3
trigger1 = Player(3), Alive
```


## <a name="new_prevanim">PrevAnim</a>  

Returns the number of the anim that the player was last in.

Example:

**Format:**  
>PrevAnim  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = PrevAnim = 200
```

## <a name="new_prevmovetype">PrevMoveType</a>  

Returns the MoveType that the player was last in.

Example:

**Format:**  
>PrevMoveType  
  
**Arguments:**  
>[oper]  
>=, != (other operators not valid)  
  
>move_type (char)  
>move_type to compare against: A, I, H (Attack, Idle and GetHit move-types respectively) 
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = PrevMoveType = H
```

## <a name="new_prevstatetype">PrevStateType</a>

Returns the StateType that the player was last in.

Example:

**Format:**  
>PrevStateType  
  
**Arguments:**  
>[oper]  
>=, != (other operators not valid)  
  
>state_type (char)  
>state_type to compare against: S, C, A, L (Stand, Crouch, Air and Liedown respectively)
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = PrevStateType = C
```

## <a name="new_projclsnoverlap">ProjClsnOverlap</a>

Returns true if the projectile's collision box (either clsn1 or clsn2) overlaps with another player's collision boxes.  
This trigger uses Ikemen's internal collision detection, so it will work even with angled and rescaled boxes.  
If you want to specify a projectile with a specific projID, create a loop process that combines the projID with ProjVar.  

**Format:**  
>ProjClsnOverlap(index, playerID, box_type)
  
**Arguments:**  
>index  
>An index number based on all projectiles owned by the player.  
>The index is equivalent to the index when -1 is specified for the ID in ProjVar.  
  
>playerID  
>The ID of the player against which to check the overlap  
  
>box_type  
>The target's collision box type. Valid values are clsn1, clsn2, and size  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = ProjClsnOverlap(var(3), p2,ID, clsn2)
```

## <a name="new_projvar">ProjVar</a>

Returns the specified projectile parameter. Use -1 for ID to iterate over all projectiles.

**Format:**  
>ProjVar(id, index, param)  
  
**Arguments:**  
>id  
>Expression 1  
  
>index  
>Expression 2  
  
>param  
>Valid values are accel x, accel y, anim, animelem, angle, angle x, angle y, attr, drawpal.group, drawpal.index, guardflag, highbound, hitflag, layerno, lowbound, pausemovetime, pos x, pos y, projcancelanim, projedgebound, projhitanim, projhits, projID, projmisstime, projpriority, projremove, projremovetime, projremanim, projstagebound, remvelocity x, remvelocity y, scale x, scale y, shadow r, shadow g, shadow b, sprpriority, teamside, vel x, vel y, velmul x, velmul y  
  
**Return type:**  
>int or float  

Note:  
`attr`, `guardflag` and `hitflag` require a comparison against known flags.  
  
**Example:**  
```ini
trigger1 = ProjVar(1000, 0, vel Y) > 0
trigger2 = ProjVar(2000, 0, attr) = SCA, HP
trigger3 = ProjVar(3000, 0, guardflag) = L
```

## <a name="new_rad">Rad (Math)</a>

Converts an argument value from degree to radians.

**Format:**  
>Rad(exp)  
  
**Arguments:**  
>exp  
>Expression  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = Rad(Angle) > pi*0.5
```

## <a name="new_rand">RandomRange(math)</a>  

Generates pseudo-random integer numbers uniformly distributed between the given range (both bounds inclusive).  

**Format:**  
>RandomRange(lower,upper)  
  
**Arguments:**  
>lower  
>Lower range (inclusive)  
  
>upper  
>Upper range (inclusive)  
  
**Return type:**  
>int  
  
**Example:**  
```ini
type = Explod
trigger1 = RandomRange(var(3), 666) > 100
pos = RandomRange(-300, 600), 0
```


## <a name="new_receiveddamage">ReceivedDamage</a>  

Returns the total damage dealt by the opposite team to this character, in the currently ongoing combo. This value is valid as long as the opposite team combo count stays above 0, otherwise it returns 0 too.

**Format:**  
>ReceivedDamage  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = ReceivedDamage > (LifeMax / 10)
```

## <a name="new_receivedhits">ReceivedHits</a>  

Returns the total number of hits done by the opposite team to this character, in the currently ongoing combo. Unlike GetHitVar(hitcount), it takes into account all hits, including those applied by HitAdd. This value is valid as long as the opposite team combo count stays above 0, otherwise it returns 0 too.

**Format:**  
>ReceivedHits  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = ReceivedHits > 10
```

## <a name="new_redlife">RedLife</a>  

Returns the amount of [red life](Miscellaneous-Info/#redlife) the player has.

**Format:**  
>RedLife  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = RedLife = 0
```

## <a name="new_reversaldefattr">ReversalDefAttr</a>  

Checks the attribute parameter of the player's currently-active ReversalDef. If the player does not currently have an active ReversalDef, then no parameters will match. Can be used for AI to detect a counter or to code something to happen if it exists.

Note: ReversalDefAttr != value1, value2 is logically equivalent to !(ReversalDefAttr = value1, value2).

**Format:**  
>	ReversalDefAttr [oper] value1, value2  
  
**Arguments:**  
>	[oper]  
>=, !=  
  
>	value1  
>A string that has at least one of the letters "S", "C" and "A" for standing, crouching and aerial attacks respectively. For example, "SA" is for standing and aerial attacks.  
  
>	value2  
>A set of 2-character strings, separated by commas. Each 2-character string must be of the form described: The first character is either "N" for "normal", "S" for "special", or "H" for "hyper". The second character must be either "A" for "attack" (a normal hit attack) or "T" for "throw". For example, "NA, ST" is for normal attacks and special throws.  
  
>Assuming the attribute of the player's ReversalDefAttr is in the form:  
  
>arg1, arg2  
  
>then the trigger condition is determined to be true only if arg1 is a subset of value1, AND arg2 is a subset of value2.  
  
**Return type:**  
> boolean int (1 or 0)  
  
>Error conditions:  
> none  
  
**Example:**  
```ini
trigger1 = ReversalDefAttr = A, HA
  Triggers when the player activates a ReversalDef with the following attributes:  
    1. player will reverse an aerial attack
    2. player will reverse a hyper (super) attack

trigger1 = ReversalDefAttr = SC, NA, SA
  Triggers when the player activates a ReversalDef with the following attributes:
    1. player will reverse both standing and crouching attacks
    2. player will reverse both normal and special attacks
```


## <a name="new_round">Round (math)</a>  

Returns the rounded value of `val` to specified `precision` (number of digits after the decimal point). `precision` can also be negative or zero.

**Format:**  
>Round(val,precision)  
  
**Arguments:**  
>val  
>Expression evaluating to the value to round.  
  
>precision  
>Expression evaluating to the number of decimal digits to round to. If the precision is positive, the rounding will occur after the decimal point. If the precision is negative, the rounding will occur before the decimal point. If the absolute value of the precision is greater than or equal to the number of digits, the result of the rounding is equal to 0.  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = Round(var(3), -2) > 100
```
```ini
trigger1 = Round(1.0055, 3) ; returns 1.006
```


## <a name="new_round">RoundsWon</a>

Returns how many total rounds the teamside has won during the current match. Resets between matches.

[TODO]


## <a name="new_roundtime">RoundTime</a>

Returns the tick count since the start of the round.

**Format:**  
>RoundTime  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = RoundTime > 600
```

## <a name="new_runorder">RunOrder</a>

At the start of each frame, players are sorted into a list for code processing based on their current actions (see [character processing order](Miscellaneous-info#character-processing-order)). `RunOrder` returns their position in this list as an integer.


## <a name="new_scale">Scale</a>

Returns the value of the player's drawing scale. `Scale X` and `Scale Y` refer to the scale applied by `AngleDraw`. `Scale Z` refers to the rescaling that affects the player when moving in the Z space.  

**Format:**  
>Scale argument
  
**Arguments:**  
>x, y, z
  
**Return type:**
>float
  
**Example:**  
```ini
trigger1 = Scale x > 2 && Scale y > 1
```

## <a name="new_score">Score</a>  

Returns the score points gained in this round by all team members.

**Format:**  
>Score  
  
**Arguments:**  
>none  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = Score > 10000
```


## <a name="new_scoretotal">ScoreTotal</a>  

Returns the total score points value. Takes into account all team members, previous rounds and previous matches since the start of this game mode.

**Format:**  
>ScoreTotal  
  
**Arguments:**  
>none  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = ScoreTotal > 1000000
```


## <a name="new_selfcommand">SelfCommand</a>

[TODO]

## <a name="new_selfstatenoexist">SelfStatenoExist</a>  

Checks for the existence of a state only within P1's state numbers, even when P1 is custom stated by a hit. Returns 1 if there is a statedef with the specified number. Otherwise it returns 0. Use the statedef number you want to recognize in parentheses.

**Format:**  
>SelfStatenoExist(exprn)  
  
**Arguments:**  
>exprn  
>An expression evaluating to a state number (int).  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = !SelfStatenoExist(200)
  ;Triggers if the player is missing state 200.
```


## <a name="new_shader">Shader</a>

Returns the name of the custom shader applied to the player. If no custom shader is applied, "" is returned.

**Example:**  
```ini
trigger1 = shader != ""
  ;Triggers if any shader is applied to the player.
```


## <a name="new_sign">Sign (Math)</a>

Returns the sign of a real number. If value < 0 return -1. If value 0 return 0. if value > 0 return 1.

**Format:**  
>Sign(exp)
  
**Arguments:**  
>exp  
>Expression  
  
**Return type:**  
>int
  
**Example:**  
```ini
var(0) = var(0)*Sign(vel x)
```


## <a name="new_soundvar">SoundVar</a>

Returns the specified sound channel parameter. Use -1 for channelNo to find the first sound available.

**Warning: The results of this trigger are NOT network-safe due to the asynchronous nature of sound playback. Usage of this trigger in production environments is discouraged.**

**Format:**  
>SoundVar(channelNo, param)  
  
**Arguments:**  
>channelNo  
>Expression  
  
>param  
>Valid values are group, number, freqmul, isplaying, length, loopcount, loopstart, loopend, pan, position, priority, startposition, volumescale  
  
**Return type:**  
>int or float  
  
**Example:**  
```ini
var(0) = SoundVar(0, IsPlaying)
fvar(1) = SoundVar(1, VolumeScale)
```


## <a name="new_spriteplayerno">SpritePlayerNo</a>

Returns the player number of the owner of the player's current sprite.  
Normally returns the same number as the player's player number, but when for instance `ChangeAnim2` is used in a custom state, it will return the number of who owns that sprite.  

**Format:**  
>SpritePlayerNo  
  
**Arguments:**  
>none  
  
**Return type:**  
>int
  
**Example:**  
```ini
trigger1 = Player(SpritePlayerNo), SelfAnimExist(1234)
```


## <a name="new_spritevar">SpriteVar</a>

Returns information about the player's current sprite.  

**Format:**  
>SpriteVar(param_name)  
  
**Arguments:**  
>param_name  
>The name of the parameter to check. Valid values are:  
>Group, Height, Image, Width, XOffset, YOffset
  
**Example:**  
```ini
; top left corner of sprite
pos = -SpriteVar(xoffset), -SpriteVar(yoffset)
; lower right corner of sprite
pos = -SpriteVar(xoffset) + SpriteVar(width), -SpriteVar(yoffset) + SpriteVar(height)
```


## <a name="new_sprpriority">SprPriority</a>  

Returns the player's/helper's current SprPriority value.

**Format:**  
>SprPriority  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = SprPriority > 0
```

## <a name="new_stagebackedgedist">StageBackEdgeDist</a>  

Returns the distance to the stage edge (corner) behind the player.

**Format:**  
>StageBackEdgeDist  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = StageBackEdgeDist < 100
```


## <a name="new_stagebgvar">StageBGVar</a>

Returns information about the stage's BG elements.  

**Format:**  
>stagebgvar(ID, index, param)
  
**Arguments:**  
>ID  
>The ID of the element to be checked  
  
>index  
>The index of the element to be checked  
  
>param  
>The parameter to check. See details  
  
**Return type:**  
>Varies. See details  

Details:
* `actionno`: Returns the animation number for `type = anim` elements (int)
* `delta.x`: Returns the X delta (float)
* `delta.y`: Returns the Y delta (float)
* `id`: Returns the ID (int)
* `layerno`: Returns the layer number (int)
* `pos.x`: Returns the X position in relation to the starting position (float)
* `pos.y`: Returns the Y position in relation to the starting position (float)
* `start.x`: Returns the X starting position (float)
* `start.y`: Returns the Y starting position (float)
* `tile.x`: Returns the X tiling flag (bool)
* `tile.y`: Returns the Y tiling flag (bool)
* `velocity.x`: Returns the X velocity (float)
* `velocity.y`: Returns the Y velocity (float)
  
**Example:**  
```ini
trigger1 = StageBGVar(4, 1, actionno) = 40
```


## <a name="new_stageconst">StageConst</a>  

Returns the value of one of the stage's constants. Stage constant variables can be set under stage's DEF [[Constants]](Stage-features/#constants) section.

**Format:**  
>StageConst(param_name)  
  
**Arguments:**  
>param_name  
>The name of the constant to check (string).  
  
**Return type:**  
>float  
  
**Example:**  
```ini
trigger1 = StageConst(WaterGround) = 1
```


## <a name="new_stagefrontedgedist">StageFrontEdgeDist</a>  

Returns the distance to the stage edge (corner) in front of the player.

**Format:**  
>StageFrontEdgeDist  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = StageFrontEdgeDist < 100
```


## <a name="new_stagetime">StageTime</a>  

Returns the stage's internal time, or the amount of ticks since the last stage reset. The value returned by this trigger corresponds directly to the amount of times stage backgrounds have been updated (taking into account `pausebg`, `resetbg`, etc), allowing one to for instance reliably synchronize [attachedchar](Stage-features/#info_attachedchar) actions to what's currently displayed by the stage.

**Format:**  
>StageTime  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = StageTime > 600
```


## <a name="new_standby">Standby</a>  

Returns 1 if character is under standby effect (assigned by [TagOut](State-controllers-(new)/#new_tagout) sctrl).

**Format:**  
>Standby  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = !Standby
```


## <a name="new_teamleader">TeamLeader</a>  

Returns [playerno](Triggers-(new)/#playerno) of the character that is considered a team leader. In modes where only one player is controlled in particular round (*single*, *turns* and *ratio*) it will be either 1 or 2, depending on team side. In *simul* and *tag* modes, team leader is the first party member (again 1 or 2) by default, but who is considered a leader can be also dynamically adjusted via optional [TagIn](State-controllers-(new)/#new_tagin) sctrl *leader* parameter.

Manually swapping leader changes lifebar elements assignment - leader always uses P1 (or P2, depending on team side) lifebar elements, remaining players positions are moved accordingly, in ascending players order.

**Format:**  
>TeamLeader  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = TeamLeader = PlayerNo
```

## <a name="new_teamsize">TeamSize</a>  

Returns character's team size (for *turns* mode it returns information that was previously not obtainable, for other team modes the returned value is equivalent to using `NumPartner + 1`)

**Format:**  
>TeamSize  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = TeamSize = 4
```

## <a name="new_timeelapsed">TimeElapsed</a>  

Returns the amount of clock ticks since the battle began (0 if time is disabled). Value returned by this trigger corresponds to lifebar timer (only ticks during RoundState = 2)

**Format:**  
>TimeElapsed  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = TimeElapsed > 600
```

## <a name="new_timeremaining">TimeRemaining</a>  

Returns the amount of clock ticks until time over (-1 if time is disabled). Value returned by this trigger corresponds to lifebar timer (only ticks during RoundState = 2)

**Format:**  
>TimeRemaining  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = TimeRemaining > 600
```

## <a name="new_timetotal">TimeTotal</a>  

Returns the total number of clock ticks that have elapsed so far. Takes into account previous rounds and matches since the start of this game mode.

**Format:**  
>TimeTotal  
  
**Arguments:**  
>none  
  
**Return type:**  
>int  
  
**Example:**  
```ini
trigger1 = TimeTotal > 5940
```


## <a name="new_topboundbodydist">TopBoundBodyDist</a>

Like `TopBoundDist`, except this trigger accounts for the player's top `edge` parameter, as defined by the `Depth` state controller.


## <a name="new_topbounddist">TopBoundDist</a>

TopBoundDist gives the distance between the player's z-axis and the `topbound` limit of the stage.

**Format:**  
>TopBoundDist 
  
**Arguments:**  
>none  
  
**Return type:**  
>float
  
**Example:**  
```ini
trigger1 = TopBoundDist < 40
```

## <a name="new_winclutch">WinClutch</a>  

Returns true if the player (or the player's team, in team mode) has won the round with health below the limit set by ``clutch.threshold`` in fight.def. If the parameter isn't defined, the default is under 10%.

**Format:**  
>WinClutch  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  

## <a name="new_winhyper">WinHyper</a>  

Returns true if the player (or the player's team, in team mode) has won the round with the finishing blow being a hyper attack.

**Format:**  
>WinHyper  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = !WinHyper
```

## <a name="new_winhyper">WinSpecial</a>  

Returns true if the player (or the player's team, in team mode) has won the round with the finishing blow being a special attack.

**Format:**  
>WinSpecial  
  
**Arguments:**  
>none  
  
**Return type:**  
>boolean int (1 or 0)  
  
**Example:**  
```ini
trigger1 = !WinSpecial
```

## <a name="new_xshear">Xshear</a>

Returns the value of the player's xshear applied with TransformSprite sctrl.

**Format:**  
>xshear 
  
**Arguments:**  
>none  
  
**Return type:**  
>float
  
**Example:**  
```ini
trigger1 = xshear > 40
```

## <a name="new_zoomvar">ZoomVar</a>

Allows checking the scale, pos x, pos y, lag, and remaining time of the currently Zoom sctrl.

**Format:**  
>ZoomVar(param_name)
  
**Arguments:**  
>param_name  
>The name of the variable to check. Valid values are:  
>scale, pos.x, pos.y, lag, time  
  
**Return type:**  
>int or float
  
**Example:**  
```ini
trigger1 = ZoomVar(scale) < 0.9
trigger2 = ZoomVar(pos.x) >= 100

```
