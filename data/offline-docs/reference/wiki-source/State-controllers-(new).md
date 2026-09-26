The state controller featured in this page are completely new to Ikemen GO.  

Use the sidebar for quick navigation.  


# <a name="changed_all">New state controller features</a>  

Both new and old state controllers can now take advantage of some global new features.


## <a name="changed_all_fightfx">fightfx actions</a>  

All the remaining CNS parameters used to assign character actions that didn't support the `F` prefix (*[Statedef]*, *ChangeState*, *SelfState*, *ChangeAnim*, *ChangeAnim2*, *Projectile*) have access to loading animations from `fightfx.air`. The implementation is the same as in the *Explod* anim parameter.  
  
**Example:**
```ini
[Statedef 1000]
anim = F 300
```


## <a name="changed_all_redirectid">RedirectID</a>  

This feature can be utilized with all state controllers, including legacy ones. It is an optional parameter that sends the execution of the state controller to the player with the designated PlayerID. Unlike custom states, this parameter allows interfering with a player's behavior without putting them in another player's states.

For state controllers that normally stop state execution (ChangeState and SelfState), redirecting to an ID different from the owner will not stop the execution of the current state code.

**Examples:**  
A poison effect that reduces life, applied without touching the opponent:

```ini
[State -2, Poison]
type = LifeAdd
trigger1 = <Is the enemy poisoned?> trigger  
value = -1
kill = 0
RedirectID = <Enemy id here>  
```

Increasing a team leader's map, regardless of who is running it, if leader's map is < 10.

```ini
[State Test]
type = MapAdd
trigger1 = Player(TeamLeader), Map(SomeLeaderMap) < 10
Map = "SomeLeaderMap"
value = 1
RedirectID = Player(TeamLeader), ID
```

Due to limitations in how some logic must be handled, certain state controllers may not work with RedirectID. Usually because of the order the players are processed in.  
TODO: list of sctrls that can't be redirected.


# <a name="new">New state controllers</a>  


## <a name="new_assertanalogvector">AssertAnalogVector</a>

This controller allows (de)activating the player's analog vectors without input from a joystick. Values will be clamped to `[-1,1]` with the exception of analog triggers which are normalized to `[0,1]`.

**Optional parameters:**  
  
**leftx = *vector* (float)**  
Sets the `LeftX` analog vector. Defaults to 0.
  
**lefty = *vector* (float)**  
Sets the `LeftY` analog vector. Defaults to 0.
  
**rightx = *vector* (float)**  
Sets the `RightX` analog vector. Defaults to 0.
  
**righty = *vector* (float)**  
Sets the `RightY` analog vector. Defaults to 0.
  
**lefttrigger = *vector* (float)**  
Sets the `LeftTrigger` analog vector. Defaults to 0.
  
**righttrigger = *vector* (float)**  
Sets the `RightTrigger` analog vector. Defaults to 0.
  
**Example:**
```ini
[State -1, AssertAnalogVector]
type = AssertAnalogVector
leftx = 0.125
lefty = -0.5
rightx = 0
righty = 0
lefttrigger = 0.75
righttrigger = 0
```


## <a name="new_assertcommand">AssertCommand</a>

This controller allows (de)activating the player's commands without any button presses. If the player has multiple commands with the same name, the controller will affect all of them.

**Required parameters:**  
  
>name = *command_name* (string)  
>String specifying the command to assert.  
  
**Optional parameters:**  
  
>buffer.time = *time* (int)  
>Number of ticks during which the command will be buffered. Defaults to 1.  
  
Examples:
```ini
[State Test]
type = AssertCommand
trigger1 = time = 10
name = "QCF_x"
buffer.time = 5
```
When the name parameter is set to "" (empty), a random command from all the commands the character has will be activated.
  
**Example:**
```ini
[State Test]
type = AssertCommand
trigger1 = time = 10
name = ""
```

## <a name="new_assertinput">AssertInput</a>  

This controller allows you to assert up to three input flags simultaneously via single sctrl. Similarly to AssertSpecial, there is no limit how many times this controller is called. Each flag will be automatically "de-asserted" at every game tick, so you must assert a flag for each tick that you want it to be active. Ikemen interprets input flags the same was as if corresponding input keys were pressed.

**Required parameters:**  
  
>flag = *flag_name* (string)  
>String specifying the flag to assert.  
  
**Optional parameters:**  
  
>flag2 = *flag_name* (string)  
>An optional flag to assert.  
  
>flag3 = *flag_name* (string)  
>Another optional flag to assert.  
  
>flag4 = *flag_name* (string)   
>Another optional flag to assert.  
 
>flag5 = *flag_name* (string)   
>Another optional flag to assert.  
 
>flag6 = *flag_name* (string)   
>Another optional flag to assert.  
 
>flag7 = *flag_name* (string)   
>Another optional flag to assert.  
 
>flag8 = *flag_name* (string)   
>Another optional flag to assert.  
 
**Details:**  
The flag name can be one of the following input keys (case sensitive):  
U, D, L, R, a, b, c, x, y, z, s, d, w, m  
B, F   


## <a name="new_camera">Camera</a> [EXPERIMENTAL]

**This SCTRL is still experimental and subject to possible changes, there is no guarantee this will be supported as is in future IKEMEN Go versions.**  
  
Changes the camera position and the way players interact with screen and stage edges.  

**Required parameters:**  
  
>view = "*view_type*" (string)  
>Specifies the type of view to implement.  
>Valid values are "Fighting", "Follow" or "Free". Fighting works like common MUGEN camera. Follow anchors the camera to a specific player/helper and follows it. Free is not bound to anything other than the own camera's limitations.  
  
**Optional parameters:**  
  
>Pos: X (float), Y (float). This should be used during Free view, as it lets a character directly control the camera position values.  
>FollowID: ID (int). When in Follow view and a player/helper ID is specified in this parameter, camera will start following that player/helper.  
  
**Details:**  
>When in Free view, Screenbound and Movecamera will not influence camera or char positions. Follow view will only be influenced by Screenbound/Movecamera from the player being followed (this might change in the future).

## <a name="new_changemovelist">ChangeMovelist</a>

Selects which movelist assigned in the character's DEF file should be displayed in the Pause menu command list.

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>value = *movelist_index* (int)  
>Specifies the index of the movelist to use. Defaults to 0.  

The movelist files are specified in the character's DEF file, under the `[Files]` group. `movelist` and `movelist0` both refer to index 0.
  
**Example:**
```ini
[State 5900, Evil Ryu movelist]
type = ChangeMovelist
trigger1 = PalNo > 6
value = 1
```

## <a name="new_depth">Depth</a>

Temporarily changes the depth size of the player's for 1 frame. Similar to Width in function. 

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>edge = *edgedepth_front, edgedepth_back* (int, int)  
>Sets the player's edge depth in front and behind. Edge depth determines how close the player can get to the topbound and botbound of the screen. These parameters default to 0,0 if omitted.  
  
>player = *playdepth_front, playdepth_back* (int, int)  
>Sets the player depth in front and behind. Player depth determines how close the player can get to other players depth and also determines the hitable depth area of a player. These parameters default to 0,0 if omitted  
  
>Alternate syntax:  
>value = *value = depth_front, depth_back* (int, int)  
>This is a shorthand syntax for setting both edge depth and player depth simultaneously. This may only be used if the edge and player parameters are not specified.
  
**Example:**
```ini
[State Test]
type = Depth
trigger1 = P2StateType = A
value = 0, 0
player = 40, 0
edge = 0, 0
```

## <a name="new_dialogue">Dialogue</a>  

Assigns dialogue data to be displayed either right before the lifebar calls the fight during first round (last frame of  RoundState = 1) or at the last active frame of the final round (RoundState = 4, right before screen starts fading out). If more than 1 player calls this sctrl, who will end up initiating dialogue is chosen randomly.

**Required parameters:**  
  
>textX = "*dialogue_info*" (string)  
>String containing information needed for displaying dialogue. There can be multiple *text* parameters assigned, each suffixed with numbers in ascending order. The parameter stores both text, as well as optional tokens (enclosed in <> brackets) for controlling other aspects of dialogue (listed below).
  
**Optional parameters:**  
  
>hidebars = *bars_flag* (int)  
>Set to nonzero to hide lifebars as soon as the sctrl is called (by default lifebar is hidden only when actual dialogue starts).  
  
>force = *force_flag* (int)  
>Set to nonzero to force dialogue start immediately, ignoring normal rules.  

How the rendered dialogue will look like (positioning, default face sprites, background definition, default time between text etc.) is controlled by `[Dialogue Info]` screenpack parameters (refer to system.def distributed with engine for a working example). By default player who called the state controller will use screenpack parameters prefixed with *p1* and his *enemy(0)* will be assigned to use *p2* parameters (this is adjustable via text tokens).

With appropriate screenpack parameters it's possible to skip to the next *text* parameter during dialogue via button press, without ending it all together. If this screenpack group is missing, dialogue won't be initiated at all (`enabled` parameter defaults to 0).

**Optional text tokens**

Tokens prefixed with *pX* (where X is 1 or 2) refers to screenpack `[Dialogue Info]` parameters prefixed the same way. Some tokens accepts *redirection* argument that points to which player assets (sprite, sound, anim, state) should be used.

Following redirection are supported:
- `self`: redirects to player that called the sctrl
- `playerno(X)`: redirects to [playerno](Triggers-(new)/#new_playerno) X
- `enemy(X)`: redirects to enemy X of the player that called the sctrl (defaults to 0, the first enemy, if bracket is ommiteed)
- `partner(X)`: redirects to partner X of the player that called the sctrl (defaults to 0, the first partner, if bracket is ommiteed)
- `enemyname(name)`: redirects to the enemy with matching name (the internal `name` parameter specified in .DEF file)
- `partnername(name)`: redirects to the partner with matching name (the internal `name` parameter specified in .DEF file)

Token list:
- `<pX>`: changes which dialogue box side (replace X with 1 or 2) should be used to render text. Defaults to p1 side.
- `<pXname=name>`: changes pX side name displayed during dialogue to the string within quotation marks
- `<pXname=redirection>`: changes pX side name displayed during dialogue to the redirected player displayname (as specified in displayname parameter within the .DEF file)
- `<pXface=redirection,group_or_anim,sprite_no>`: changes pX side sprite group and index used to render the face portrait. If only one value is assigned, it is treated as an animation to play while the portrait is active. Defaults to the sprite numbers defined by the screenpack (and falls back to those if the specified sprites are missing), unless *group_or_anim* is set to -1, in which case face rendering is completely disabled.
- `<sound=redirection,group_no,sound_no,volumescale>`: plays back a sound. *volumescale* argument is optional (defaults to 100).
- `<anim=redirection,anim_no>`: changes the action number of the player's animation
- `<state=redirection,state_no>`: changes the state number of the player
- `<map=redirection,map_name,value,map_type>`: modifies player's map. *map_type* controls what kind of operation on map should be performed (`set`: equivalent of [MapSet](State-controllers/#new_mapset), `add`: equivalent of [MapAdd](State-controllers/#new_mapadd)), 
- `<displayname=redirection>`: part of the dialogue text replaced automatically with redirected player displayname (as specified in displayname parameter within the .DEF file)
- `<wait=ticks>`: amount of ticks delay before sctrl resume further text parameter parsing

As an example, below code showcases Symphony of the Night (in)famous cutscene recreated with Dialogue sctrl, using various advanced tokens (keep in mind that in most cases, when you don't have to switch face sprites, play voiceovers or adjust timings, the only commonly used *text* token is `<pX>`)

Click on the image to watch the video corresponding to below code.

[![IMAGE ALT TEXT](http://img.youtube.com/vi/BbUnJT9KnnU/0.jpg)](http://www.youtube.com/watch?v=BbUnJT9KnnU "Ikemen GO SotN cutscene")
  
**Example:**
```ini
[State 191, Dialogue]
type = Dialogue
trigger1 = enemy,Name="Demitri Maximoff"
hidebars = 1
text1 = "<p1><p1face=self,9100,0><p2face=enemy,9100,4><sound=self,9100,0>Die monster.<wait=60> You don't belong in this world!"
text2 = "<p2><sound=enemy,9100,0>It was not by my hand that I am once again given flesh.<wait=120> I was called here by humans, who wish to pay me tribute.<wait=170>"
text3 = "<p1><p1face=self,9100,1><sound=self,9100,1>Tribute!?!<wait=30> You steal men's souls, and make them your slaves!<wait=90>"
text4 = "<p2><p2face=enemy,9100,2><sound=enemy,9100,1>Perhaps the same could be said of all religions...<wait=30>"
text5 = "<p1><p1face=self,9100,7><sound=self,9100,2>Your words are as empty as your soul!<wait=80><p1face=self,9100,4> Mankind ill needs a savior such as you!<wait=70>"
text6 = "<p2><p2face=enemy,9100,5><sound=enemy,9100,2>What is a man?<wait=75><p1face=self,9100,2> A miserable little pile of secrets!<wait=75> But enough talk...<wait=30> Have at you!"

[State 180, Dialogue]
type = Dialogue
trigger1 = Win && enemy,Name="Demitri Maximoff"
text1 = "<p2><p1face=self,9100,6><p2face=enemy,9100,3><sound=enemy,9200,0><anim=self,0><state=enemy,5500>How?<wait=120> How is that I have been so defeated?<wait=120>"
text2 = "<p1><p1face=self,9100,3><sound=self,9200,0><displayname=enemy>, you have been doomed ever since you lost the ability to love.<wait=20>"
text3 = "<p2><p2face=enemy,9100,0><sound=enemy,9200,1>Ah...<wait=90> sarcasm.<p1face=self,9100,5><wait=40><state=self,186>"
```


## <a name="new_dizzyset">DizzySet</a>  

Sets the player's Dizzy flag. For the duration that this flag is set, combo hit counter does not reset and the combo count lifebar text will stay on screen. 

**Required parameters:**  
  
>value = *dizzy_flag* (int)  
>Set to nonzero to add Dizzy flag, or 0 to remove it.  


## <a name="new_dizzypointsadd">DizzyPointsAdd</a>  

Adds the specified amount to the player's dizzy points.

**Required parameters:**  
  
>value = *add_amt* (int)  
>*add_amt* is the number to add to the player's dizzy points.  


## <a name="new_dizzypointsset">DizzyPointsSet</a>  

Sets the amount of dizzy points that the player has.

**Required parameters:**  
  
>value = *set_amt* (int)  
>*set_amt* is the new value to set the player's dizzy points to.  


## <a name="new_grthitvarset">GetHitVarSet</a>

Changes a player's `GetHitVar` directly, without requiring a hit.  
  
Supported parameters:  
airtype, animtype, attr, chainid, ctrltime, damage, dizzypoints, down.recovertime, fall, fall.damage, fall.envshake.ampl, fall.envshake.freq, fall.envshake.mul, fall.envshake.phase, fall.envshake.time, fall.kill, fall.recover, fall.recovertime, fall.xvel, fall.yvel, fallcount, groundtype, guardcount, guarded, guardpoints, hitcount, hitshaketime, hittime, ID, playerno, redlife, slidetime, xvel, yaccel, yvel
  
**Example:**
```ini
[State Test]
type = GetHitVarSet
trigger1 = time = 10
fall.recovertime= 0
```


## <a name="new_groundleveloffset">GroundLevelOffset</a>

Applies a temporary offset to the player's ground level, which is otherwise 0. This makes the player treat a different position as `pos y = 0`, and therefore allows coding features such as platforms.

**Required parameters:**  
  
>value = offset (float)  
  
**Example:**
```ini
[State Test]
type = GroundLevelOffset
trigger1 = Pos X + CameraPos X = [-160, 0]
trigger1 = Pos Y + GroundLevel <= -60
value = -60
```


## <a name="new_guardbreakset">GuardBreakSet</a>  

Sets the player's Guard Break flag.

**Required parameters:**  
  
>value = *break_flag* (int)  
>Set to nonzero to add Guard Break flag, or 0 to remove it.  


## <a name="new_guardpointsadd">GuardPointsAdd</a>  

Adds the specified amount to the player's guard points.

**Required parameters:**  
  
>value = *add_amt* (int)  
>*add_amt* is the number to add to the player's guard points.  


## <a name="new_guardpointsset">GuardPointsSet</a>  

Sets the amount of guard points that the player has.

**Required parameters:**  
  
>value = *set_amt* (int)  
>*set_amt* is the new value to set the player's guard points to.  


## <a name="new_height">Height</a>

Temporarily changes the vertical size of the player's "push box" for 1 frame. Similar to Width in function: the values are added to the height, as defined in the player's constants file—they do not override them. A positive value will make the box larger, and a negative one will make it smaller.

**Required parameters:**  
  
>value = *top_extra_size, bottom_extra_size* (int)
  
**Example:**
```ini
[State Test]
type = Height
trigger1 = P2StateType = L
value = 0, -30
```

## <a name="new_lifebaraction">LifebarAction</a>  

Displays text/sprites/anims synchronized with each other, using [lifebar data](Lifebar-features/#new_action). The intended use case is implementation of messages, often found in commercial fighting games.

**Required parameters:**  
  
> none  
  
**Optional parameters:**  
  
> top = *top_flag* (int)  
> Set to nonzero to move the message on top of the messages queue (by default new messages are appended to the end).  
  
> time = *time_set* (int)  
> Specifies how long in ticks the message should be displayed. Defaults to time assigned by lifebar DEF file.  
  
> timemul = *time_mul* (float)  
> Specifies the desired time multiplier. For instance, *time_mul* of 0.5 halves the time in which the message is displayed.  
  
> anim = *anim_no* (int)  
> Specifies the number of the animation that should be used as a message (declared in lifebar DEF file).  
  
> spr = *group_no*, *sprite_no* (int, int)  
> Values correspond to the identifying pair assigned to sprite in the lifebar sff file.  
  
> snd = *group_no*, *sound_no* (int, int)  
> Values correspond to the identifying pair assigned to sound in the lifebar snd file.  
  
> text = *"message"* (string)  
> Text to be rendered as a message.  
  
> font.no = *font_no* (int)  
> *font_no* specifies the number of the lifebar font to use for text rendering. Defaults to the font assigned by lifebar DEF file.  
  
> font.bank = *bank_no* (int)  
> Color bank of the font to use. Refer to the font for what color banks it has. Defaults to the bank assigned by lifebar DEF file.  
  
> font.align = *alignment* (int)  
> *alignment* is a number representing the text alignment. 1 is left, 0 means center, and -1 is for right-alignment. Defaults to the alignment assigned by lifebar DEF file.  
  
> font.color = *r, g, b, a* (int, int, int, int)  
> Color adjustment values for the font. Defaults to values assigned by lifebar DEF file. Alpha is optional.  
  
> palfx.key = LifebarAction can accept all the same key values from [PalFX state controller](http://www.elecbyte.com/mugendocs/sctrls.html#palfx) for message text rendering.  
  
> refreshtype = *type* (int)  
> Determines how to handle duplicate messages:  
> 0 lets duplicates stack  
> 1 refreshes timer of an identical message instead of adding a new one  
> 2 (default) is like 1, except the existing message also reappears from outside the screen  

Refer to *data/action.zss* file and default lifebar distributed with engine for a working example.


## <a name="new_loadfile">LoadFile</a>  

Loads the specified data and overrides the data of the execution character. Note that all the data before reading will disappear.

**Required parameters:**  
  
**savedata = *var_type* (string)**  
Specifies the data type that should be read. Valid values for var_type are "var", "fvar", and "map".  
  
**path = "*save_path*" (string)**  
Specifies the path of the file to be read (relative to the character folder). An error occurs if you make a mistake in the path.  

**Optional parameters:**  
  
**maps = *map_1*, *map_2*, *map_3*... (string)**  
A list of maps to load. Defaults to empty.  
  
**maps.include = *filter* (string)**  
All maps containing this string in their names will be loaded. Defaults to empty.  
  
**Example:**
```ini
[State Test]
type = LoadFile
trigger1 = time = 10
savedata = var
path = "kfm.gob"
```


## <a name="new_mapadd">MapAdd</a>  

Adds value to player's map.

**Required parameters:**  
  
>*map = "*map_name*" (string)*  
>Specifies a name of the map that we add value to.  
  
>**value = *expr* (int or float)**  
>*expr* is the value to add to the map.  


## <a name="new_mapreset">MapReset</a>

Clears all of the player's maps, except those containing the specified strings.  
Maps that are defined in the character's DEF file will be reset to the value specified there.  

**Required parameters:**  
  
none  
  
**Optional parameters:**  
  
>**exclude = "*exception_string*"** (string)  
>If a map's name contains this string, it won't be cleared.
  
>**exclude2 = "*exception_string*"** (string)  
>Extra filter parameters. Up to `exclude8`.

**Example:**
```
mapReset{exclude: "level_"; exclude2: "experience_"; exclude3: "score_"}
```


## <a name="new_mapset">MapSet</a>  

Sets value to player's map. This state controller can be used to change a number that has already been set via character's DEF file or to set a new map.

**Required parameters:**  
  
>map = "*map_name*" (string)  
>Specifies a name of the map that we assign value to.  
  
>value = *expr* (int or float)  
>*expr* is the value to assign to the map.  


## <a name="new_matchrestart">MatchRestart</a>  

Reset the round or match and resume. By default (when no optional parameters are set) has the same effect as F4 debug key (round restart). Optionally allows characters and stage reloading, which also changes the state controller functionality to work like shift+F4 debug key (match restart).

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>pXdef = "*char_path*" (string)  
>Path of the def file to read when reloading player 1-8 (replace X with player number). *char_path* can be relative to the folder of character that triggered MatchRestart or top ikemen directory.  
  
>stagedef = "*stage_path*" (string)  
>Path of the stage def file to read when reloading. *stage_path* can be relative to the folder of character that triggered MatchRestart or top ikemen directory.  
  
>reload = *p1, p2, p3, p4, p5, p6, p7, p8* (int)  
>This parameter specifies whether to reload particular character. Defaults to 0 (round is reset without characters reloading)   
>Note: Reloading files does not work during netplay due to synchronization limitations.
  
>resetmatch = "*flag*" (int)  
>If set to 1, the match will restart from Round 1 instead of the current round. Unlike standard reloading, this allows restarting the match without reloading assets (reload=0), making it compatible with netplay. Defaults to 0.  
>Note: This parameter will be ignored in Turns mode if the active characters have already switched and reload is not enabled, as the original characters are no longer in memory.
  
>preservevars = *p1, p2, p3, p4, p5, p6, p7, p8* (int)  
>This parameter specifies whether to preserve variables (var, fvar, map) for a particular character after the restart. Defaults to 0.  
>Note: In the first round, the default common state will have all var and fvar reset by the varRangeSet in StateDef 5900. If you want to carry over variables to the first round, you will need to overwrite the StateDef 5900.
  
>pXpalette = *pal_no* (int)  
>Specifies the palette number (1-12) to be used for player X (replace X with player number) upon restarting. If not specified, the character retains the currently selected palette.
  
**Example:**
```ini
[State Test]
type = MatchRestart
trigger1 = time = 10
p1def = "kfm.def"
p2def = "../suavedude/suavedude.def"
stagedef = "stages/stage0.def"
reload = 1, 1
```


## <a name="new_modifybgctrl">ModifyBGCtrl</a>  

Modifies the parameters of an existing stage [background controller](http://www.elecbyte.com/mugendocs/bgs.html#background-controllers).

**Required parameters:**  
  
>id = *sctrlid* (int)  
>Specifies which controllers should be modified (all BGCtrl marked with [sctrlid](Stage-features/#bgctrl_sctrlid) will be affected)  
  
**Optional parameters:**  
  
>time = *start_time*, *end_time*, *looptime* (int)  
>time values that should modify background controller time parameter.  
  
>value = *value_1*, *value_2*, *value_3* (int)  
>values that should modify background controller value parameter (used by following BGCtrl types: *Visible*, *Enabled*, *Anim*, *SinX*, *SinY*; only SinX and SinY use more than 1 value).  
  
>x = *value_x* (float)  
>x value that should modify background controller *x* parameter (used by following BGCtrl types: *VelSet*, *VelAdd*, *PosSet*, *PosAdd*).  
  
>y = *value_y* (float)  
>y value that should modify background controller *y* parameter (used by following BGCtrl types: *VelSet*, *VelAdd*, *PosSet*, *PosAdd*).  
  
>Notes:  
>This state controller affects background controllers marked with [sctrlid](Stage-features/#bgctrl_sctrlid), which is normally not known by individual characters. For this reason the best way to use this sctrl is through [AttachedChar](Stage-features#info_attachedchar) associated with particular stage.
  
**Example:**
```ini
[State Test]
trigger1 = 1
type = ModifyBGCtrl
sctrlID = 1
value = 0
```

## <a name="new_modifybgctrl">ModifyBGCtrl3D</a>

Modifies the parameters of an existing [3D stage background controller](../Stage-features-(3d)/).

**Required parameters:**  
  
>id = *sctrlid* (int)  
>Specifies which controllers should be modified (all BGCtrl marked with [sctrlid](Stage-features/#bgctrl_sctrlid) will be affected)  
  
**Optional parameters:**  
  
>time = *start_time*, *end_time*, *looptime* (int)  
>time values that should modify background controller time parameter.  
  
>value = *value_1*, *value_2*, *value_3* (int)  
>values that should modify background controller value parameter (used by following BGCtrl types: *Visible*, *Enabled*, *Anim*).  
  
>Notes:  
>This state controller affects background controllers marked with [sctrlid](Stage-features/#bgctrl_sctrlid), which is normally not known by individual characters. For this reason the best way to use this sctrl is through [AttachedChar](Stage-features#info_attachedchar) associated with particular stage.
  
**Example:**
```ini
[State -2, Test]
type = ModifyBGCtrl3d
trigger1 = MoveType = A && Time = 1
id = 17
time = 0
value = 1
```


## <a name="new_modifybgm">ModifyBgm</a>

Modifies currently playing music.

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>volume = *volume_scale* (int)  
>*volume_scale* alters volume for currently playing bgm.  
  
>loopstart = *start_sample* (int)  
>Loop start position sample number.  
  
>loopend = *end_sample* (int)  
>Loop end position sample number.  
  
>position = *sample_point* (int)  
>Sample point to where the music should seek.  
  
>freqmul = *freqmul* (float)  
>Frequency multiplier of the BGM (control pitch & tempo).  
  
>loopcount = *loop_count* (int)  
>Changes the number of times this BGM should loop.  

## <a name="new_modifyhitdef">ModifyHitDef</a>

Using this state controller will update the specified parameters of the player's currently active `HitDef`. Has no effect if no `HitDef` is active.

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>same as HitDef  
  
**Example:**
```ini
[State Test]
type = ModifyHitdef
trigger1 = AnimElem = 5
hitFlag = MA
damage = 100, 25
```


## <a name="new_modifyplayer">ModifyPlayer</a>

Allows changing some player parameters that are otherwise out of reach, or don't justify having their own dedicated state controllers. Some parameters should be used with care.  
  
Note: This state controller was briefly named `ModifyChar` during development. A previous nightly state controller named `MoveHitSet` was also integrated into it.  

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
  
>ailevel = *ailevel* (int)  
>Sets the character's ailevel.  
  
>alive = *flag* (bool)  
>Toggles the character's alive flag on or off.  
  
>attack = *attack_value* (int)  
>Changes the player's attack value.  
  
>defence = *defence_value* (int)  
>Changes the player's defence value.  
  
>displayname = *name*(string)  
>Changes the character's displayname.  
  
>lifebarname = *name* (string)  
>Changes the character's lifebarname.  
  
>lifemax = *points* (int)  
>Changes the character's maximum life points.  
  
>powermax = *points* (int)  
>Changes the character's maximum life points.  
  
>dizzypointsmax = *points* (int)  
>Changes the character's maximum dizzy points.  
  
>guardpointsmax = *points* (int)  
>Changes the character's maximum guardpoints.  
  
>teamside = *side* (int)  
>Changes the character's team side.  
  
>helpervar.ID = *id* (int)  
>Changes a helper's helper ID.  
  
>helpername = *name* (string)  
>Changes a helper's name.  
  
>movehit = *time* (int)  
>Sets the player's MoveHit timer to the specified value.  
  
>moveguarded = *time* (int)  
>Sets the player's MoveGuarded timer to the specified value.  
  
>movereversed = *time* (int)  
>Sets the player's MoveReversed timer to the specified value.  
  
>movecountered = *flag* (bool)  
>Toggles the player's MoveCountered flag on or off.  
  
>hitpausetime = *time* (int)  
>Sets the player's hitpausetime to the specified value.  
  
>pausemovetime = *time* (int)  
>Sets the player's pausemovetime to the specified value.  
  
>supermovetime = *time* (int)  
>Sets the player's supermovetime to the specified value.  
  
>unhittabletime = *time* (int)  
>Sets the player's "unhittable" timer to the specified value.  
  
**Example:**
```ini
[State Test]
type = ModifyPlayer
trigger1 = time = 0
displayname = "Suave Dude"
lifemax = 2000
teamside = 2
```


## <a name="new_modifyprojectile">ModifyProjectile</a>

Using this state controller will update the specified parameters for the projectiles with the specified `ID`. Syntax is essentially the same as for `Projectile`.

**Required parameters:**  
  
>none  
  
**Optional parameters:**   
>ID = projectile_ID (int)  
>The ID of the projectiles to modify. Defaults to -1 (all the player's projectiles)  
  
>index = projectile_index (int)  
>The index of the projectile to modify. Defaults to -1 (all the player's projectiles)  
  
**Example:**
```ini
[State Test]
type = ModifyProjectile
trigger1 = AnimElem = 4
ID = 1005     ; Modify the projectile with this ID
index = 0     ; Modify the first instance of this projectile
projID = 1010 ; Replace their ID with this one
accel = -0.1, -0.1
teamside = 2
```


## <a name="new_modifyReflection">ModifyReflection</a>

This state controller allows modifying parameters of a char's Reflection

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>anim = *anim_no* (int)  
>animelem = elem_no (int)  
>animplayerno = *anim_player_no* (int)  
>spriteplayerno = *sprite_player_no* (int)  
>color = *r*, *g*, *b* (int, int, int)  
>intensity = intensity (int)  
>offset = *x*, *y* (float, float)  
>window = *x1*, *y1*, *x2*, *y2* (float, float, float, float)  
>xshear = xshear (float)  
>xscale = xscale (float)  
>yscale = yscale (float)  
>projection = projection (string)   
>focallength = focallength (float)   


## <a name="new_modifyreversaldef">ModifyReversalDef</a>

Using this state controller will update the specified parameters of the player's currently active `ReversalDef`. Has no effect if no `ReversalDef` is active.

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>same as ReversalDef  
  
**Example:**
```ini
[State Test]
type = ModifyReversalDef
trigger1 = AnimElem = 4
reversal.attr = S, AA
fall = 0
```


## <a name="new_modifyShadow">ModifyShadow</a>

This state controller allows modifying parameters of a char's Shadow

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>anim = *anim_no* (int)  
>animelem = elem_no (int)  
>animplayerno = *anim_player_no* (int)  
>spriteplayerno = *sprite_player_no* (int)  
>color = *r*, *g*, *b* (int, int, int)  
>intensity = intensity (int)  
>offset = *x*, *y* (float, float)  
>window = *x1*, *y1*, *x2*, *y2* (float, float, float, float)  
>xshear = xshear (float)  
>xscale = xscale (float)  
>yscale = yscale (float)  
>projection = projection (string)   
>focallength = focallength (float)   


## <a name="new_modifysnd">ModifySnd</a>

Modifies the following sound parameters on-the-fly. This cannot modify the `lowpriority` parameter. If you need your sound to be low priority, call PlaySnd with the respective parameter set.

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
  
>channel = *channelNo* (int)  
>The sound channel to modify. Use -1 to modify all sound channels on the entity.  
  
>volume = *volume* (int)  
>Changes the volume of the specified sound channel.
  
>volumescale = *scale* (int)  
>Changes the volume scale of the specified sound channel.  
  
>freqmul = *freqmul* (float)  
>Changes the sound channel's frequency multiplier. 
  
>pan = *pan* (float)  
>Changes the sound channel's pan.  
  
>abspan = *abspan* (float)  
>Changes the sound channel's absolute pan.  
  
>priority = *priority* (int)  
>Changes the sound channel's priority.  
  
>loopstart = *loop_start_sample* (int)  
>Changes the sound's loop start point.  
  
>loopend = *loop_end_sample* (int)  
>Changes the sound's loop end point.  
  
>position = *new_position_sample* (int)  
>Changes the position of the currently playing sound. Behavior is undefined when the channel is unspecified (-1).  
  
>loop = *new_loop_value* (bool)  
>Changes whether or not this sound should loop forever (nonzero) or not at all (0). This parameter is ignored if `loopcount` is nonzero.  
  
>loopcount = *new_loop_count* (int)  
>Changes the number of times this sound should loop.  
  
**Example:**
```ini
[State Test]
type = ModifySnd
trigger1 = FightTime
channel = 5
volumescale = floor(50*(1 + cos(pi*fightTime/256)))
freqmul = 1 + cos(pi*fightTime/256)
```


## <a name="new_modifystagebg">ModifyStageBG</a>

This state controller allows modifying the stage's BG elements. Refer to stage documentation for more information.  

**Required parameters:**  
  
  
>At least one parameter modification  
  
**Optional parameters:**   
  
>ID = stagebg_ID (int)  
>The ID of the BG to modify. Defaults to -1 (all)  
  
>index = stagebg_index (int)  
>The index of the BG to modify. Defaults to -1 (all)  
  
>actionno = *anim* (int)  
>Changes the animation for anim type elements.  
  
>alpha = *source, destination* (int, int)  
>Changes the transparency's alpha parameters. Requires trans parameter.  
  
>angle = *angle* (int)   
>Changes the angle parameter.   
  
>Xangle = *Xangle* (int)   
>Changes the Xangle parameter.   
  
>Yangle = *Yangle* (int)   
>Changes the Yangle parameter.   
  
>delta.x = *delta* (float)  
>Changes the X delta.  
  
>delta.y = *delta* (float)  
>Changes the Y delta.  
  
>layerno = *layer* (int)  
>Changes the layer number.  
  
>pos.x = *position* (float)  
>Changes the X position in relation to the starting position.  
  
>pos.y = *position* (float)  
>Changes the Y position in relation to the starting position.  
  
>spriteno = *group, image* (int, int)  
>Changes the sprite number for normal type elements.  
  
>start.x = *position* (float)  
>Changes the X starting position.  
  
>start.y = *position* (float)  
>Changes the Y starting position.  
  
>scalestart = *scale x, scale y* (float, float)  
>Changes the scalestart parameter.  
  
>trans = *trans_type* (string)  
>Changes the transparency type.  
  
>velocity.x = *velocity* (float)  
>Changes the X velocity.  
  
>velocity.y = *velocity* (float)  
>Changes the Y velocity.  
  
>xshear = *xshear* (float)  
>Changes the xshear parameter.  
  
>focallength = *focallength* (float)  
>Changes the focallength parameter.  
  
>projection = *projection* (string)  
>Changes the projection parameter.  
  
**Example:**
```ini
[State Test]
type = ModifyStageBG
trigger1 = time = 0
ID = 3
index = -1
velocity.x = 4
```


## <a name="new_modifystagevar">ModifyStageVar</a>  

This SCTRL lets a character modify basic stage parameters or "stage vars", as declared in the stage .def file. Not all parameters are modifable for now, but the SCTRL could be expanded in the future to allow it.

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>camera.ytension.enable = *enable_flag* (bool)  
>camera.boundleft = *bound_left* (int)  
>camera.boundright = *bound_right* (int)  
>camera.boundhigh = *bound_high* (int)  
>camera.boundlow = *bound_low* (int)  
>camera.verticalfollow = *vertical_follow* (float)  
>camera.floortension = *floor_tension* (int)  
>camera.tensionhigh = *tension_high* (int)  
>camera.tensionlow = *tension_low* (int)  
>camera.tension = *tension* (int)  
>camera.startzoom = *start_zoom* (float)  
>camera.zoomout = *zoom_in* (float)  
>camera.zoomin = *zoom_out* (float)  
>camera.zoomindelay = *zoom_in_delay* (float)  
>camera.zoominspeed = *zoom_in_speed* (float)  
>camera.zoomoutspeed = *zoom_out_speed* (float)  
>camera.tensionvel = *tension_vel* (float)  
>camera.cuthigh = *cut_high* (float)  
>camera.cutlow = *cut_low* (float)  
>camera.yscrollspeed = *y_scroll_speed* (float)  
>camera.ytension.enable = *enable_flag* (bool)  
>camera.autocenter = *enable_flag* (bool)  
>playerinfo.leftbound = *left_bound* (float)  
>playerinfo.rightbound = *right_bound* (float)  
>playerinfo.topbound = *top_bound* (float)  
>playerinfo.botbound = *bot_bound* (float)  
>playerinfo.p1startx = *p1startx_pos* (int)  
>playerinfo.p2startx = *p2startx_pos* (int)  
>playerinfo.p1starty = *p1starty_pos* (int)  
>playerinfo.p2starty = *p2starty_pos* (int)  
>playerinfo.p1startz = *p1startz_pos* (int)  
>playerinfo.p2startz = *p2startz_pos* (int)  
>playerinfo.p1facing = *p1_facing* (int)  
>playerinfo.p2facing = *p2_facing* (int)  
>scaling.topscale = *top_scale* (float) (<mugen 1.0)  
>bound.screenleft = *screen_left* (int)  
>bound.screenright = *screen_right* (int)  
>stageinfo.autoturn = *autoturn* (bool)  
>stageinfo.resetbg = *resetbg* (bool)  
>stageinfo.xscale = *xscale* (float)  
>stageinfo.yscale = *yscale* (float)  
>stageinfo.zoffset = *zoffset* (int)  
>stageinfo.zoffsetlink = *zoffset_link* (int)  
>shadow.angle = *angle* (int)  
>shadow.color = *r*, *g*, *b* (int, int, int)
>shadow.fade.range = *end*, *begin* (int, int)  
>shadow.focallength = *focallength* (float)  
>shadow.intensity = *intensity* (int)  
>shadow.offset = *xoff*, *yoff* (float, float)  
>shadow.projection = *projection* (string)  
>shadow.window = *x1*, *y1*, *x2*, *y2* (float, float, float, float)  
>shadow.xangle = *xangle* (int)  
>shadow.xscale = *scale* (float)  
>shadow.xshear = *xshear* (float)  
>shadow.yangle = *yangle* (int)  
>shadow.ydelta = *delta* (float)  
>shadow.yscale = *scale* (float)  
>reflection.angle = *angle* (int)  
>reflection.fade.range = *end*, *begin* (int, int)  
>reflection.focallength = *focallength* (float)  
>reflection.intensity = *intensity* (int)  
>reflection.offset = *xoff*, *yoff* (float, float)  
>reflection.projection = *projection* (string)  
>reflection.window = *x1*, *y1*, *x2*, *y2* (float, float, float, float)  
>reflection.xangle = *xangle* (int)  
>reflection.xscale = *scale* (float)  
>reflection.yangle = *yangle* (int)  
>reflection.ydelta = *delta* (float)  
>reflection.yscale = *scale* (float)  
  
**Details:**  
>camera.ytension.enable is enabled by default when a stage uses tensionhigh and tensionlow  

## <a name="new_modifytext">ModifyText</a>

Using this state controller will update the specified parameters for the texts with the specified ID. Syntax is essentially the same as for Text sctrl.

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>ID = text_id (int)  
>The ID of the texts to modify. Defaults to -1 (all the player's texts)  
>index = text_index (int)  
>The index of the texts to modify. Defaults to -1 (all the player's texts)  
  
**Example:**
```ini
[State Test]
type = ModifyText
trigger = 1
ID = 50   ;Modify text with this ID
index = 0 ;Modify the first instance of this text
velocity = .3, 0
scale = 4, 4
params = animElemNo(0) ;Update params
```

## <a name="new_overrideclsn">OverrideClsn</a>

This state controller allows you to directly modify a player’s collision boxes without changing their animation.

**Required parameters**  
None.

**Optional parameters**  

- **group** = *group* (int)  
The type of collision box to override.  
Valid values: `Clsn1`, `Clsn2`, `Size`, `None`.  
Using `None` removes all active Clsn overrides.  
Defaults to `None`.  

- **index** = *index* (int)  
The index of the box to modify.  
Use `-1` to affect all boxes.  
Using an out-of-bounds index will append a new box.  
Defaults to `0`.  

- **rect** = *x1, y1, x2, y2* (float)  
The rectangle, or coordinates for the box.  
Using `0, 0, 0, 0` removes the box.

**Examples:**

```ini
[State Test]; Force player to have at least one Clsn1 box
type = OverrideClsn
trigger1 = 1
group = Clsn1
index = 0
rect = 0, -100, 50, -50
```

```
# Remove all Clsn2 boxes from the player
overrideClsn{group: Clsn2; index = -1; rect = 0, 0, 0, 0}
```


## <a name="new_parentmapadd">ParentMapAdd</a>  

If the player is a helper, adds value to parent's map. If the player is not a helper, this controller does nothing. Parent refers to the instance that spawned the helper.

**Required parameters:**  
  
>map = "*map_name*" (string)  
>Specifies a name of the map that we add value to.  
  
>value = *expr* (int or float)  
>*expr* is the value to add to the map.  


## <a name="new_parentmapset">ParentMapSet</a>  

If the player is a helper, sets value to parent's map. If the player is not a helper, this controller does nothing. Parent refers to the instance that spawned the helper.

**Required parameters:**  
  
>map = "*map_name*" (string)  
>Specifies a name of the map that we assign value to.  
  
>value = *expr* (int or float)  
>*expr* is the value to assign to the map.  


## <a name="new_playbgm">PlayBgm</a>  

Plays back a music. Supported file formats: *mp3*, *ogg*, *wav*. 

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>bgm = "*bgm_path*" (string)  
>Path of the music file to play. Leave it blank if you want to stop current music. *bgm_path* file lookup starts relative to character's directory, followed by checking path relative to top ikemen directory, finally the file existance is checked in *sound* directory.  
  
>loop = *loop_flag* (int)  
>Set *loop_flag* to a nonzero value to have the bgm loop over and over, or 0 to disable looping. Defaults to 1.
  
>volume = *volume_scale* (int)  
>Adjust the volume. 100 is for 100%. Defaults to 100. If *bgm_path* is not specified, *volume_scale* alters volume for currently playing bgm.  
  
>loopstart = *start_sample* (int)  
>Loop start position sample number.  
  
>loopend = *end_sample* (int)  
>Loop end position sample number.  
  
>startposition = *sample_point* (int)  
>Sample point where the music should start playing.  
  
>freqmul = *freqmul* (float)  
>Frequency multiplier of the BGM (control pitch & tempo).  
  
>loopcount = *loop_count* (int)  
>Changes the number of times this BGM should loop.  

## <a name="new_printtoconsole">PrintToConsole</a>  

This controller is only useful for debugging. PrintToConsole prints a specified message to debug mode console, as well as terminal / command line window, if it's opened.

The syntax is the same as DisplayToClipboard:

**Required parameters:**  
  
>text = "*format_string*" (string)  
>*format_string* must be encased in double-quotes. It is a printf format string, so if you know about printf, you can skip this description. The format string contains any text you wish to display. You can also use \n to generate a line break, and \t to generate a tab character (tab width is equivalent to 4 characters). To display the value of an arithmetic expression, you can put a %d (for ints) or a %f (for floats) in the format string, then specify the expression in the params list. To display a % character, you must put %% in the format string.  
  
>Following format specifiers are accepted: %v (any type), %d, %i, %f, %F, %e, %E, %g, or %G. Format specifier syntax such as %0.2f is also supported. Recognized escape sequences are \n, \t, \\, and \".  
  
**Optional parameters:**  
  
>params = *exp_1, exp_2, (...)*  
>Unlimited amount of numeric arguments can be specified in the format string. These should be listed under the params item, in order. The type of each parameter must match its format specifier. You cannot specify more or less parameters than are called for in the format string.  
  
>If there is a type mismatch between the format specifier and the parameter actually provided, then the actual value of the parameter will be shown in an appropriate form for that type, using default formatting options.  
  
**Example:**
```ini
[State Test]
type = PrintToConsole
text = "The value of var(17) is %d, which is %f%% of 23.\n\t--Kiwi."
params = var(17):=1,var(17)/.230

; prints the following to console:
;The value of var(17) is 1, which is 4.347826% of 23.
;	--Kiwi.
```


## <a name="new_redlifeadd">RedLifeAdd</a>  

Adds the specified amount to the player's red life, scaled by the player's defense multiplier if necessary.

**Required parameters:**  
  
>value = *add_amt* (int)  
>*add_amt* is the number to add to the player's red life.  
  
**Optional parameters:**  
  
>absolute = *abs_flag* (int)  
>If *abs_flag* is 1, then *add_amt* will not be scaled (i.e. attack and defense multipliers will be ignored). Defaults to 0.  


## <a name="new_redlifeset">RedLifeSet</a>  

Sets the amount of red life that the player has.

**Required parameters:**  
  
>value = *set_amt* (int)  
>*set_amt* is the new value to set the player's red life to.  


## <a name="new_remapsprite">RemapSprite</a>  

Remaps one sprite with another (or does this for multiple sprites at once, based on character's CNS [RemapPreset](Character-features/#cns_remappreset) data)

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>reset = *reset_flag* (int)  
>Set to 1 to reset all existing sprite remaps. Defaults to 0.  
  
>preset = "*preset_name*" (string)  
>Name of the character's CNS `RemapPreset` data.  
  
>source = *src_spr_grp, src_spr_item* (int, int)  
>See below.  
  
>dest = *dst_spr_grp, dst_spr_item* (int, int)  
>Any animation that references source sprite will be drawn using the dest sprite instead. Note that the dest sprite group number and item refers to an unmapped sprite numbers.  
  
**Example:**
```ini
[State Test]
type = RemapSprite
trigger1 = var(10)=1
preset = "MyTransformation"
reset = 1
```

## <a name="new_removetext">RemoveText</a>  

Removes all of a player's texts, or just the texts with a specified ID number.

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>ID = remove_id (int)  
>remove_id is the ID number of the texts to remove. If omitted, removes all texts owned by the player.
  
**Example:**
```ini
[State Test]
type = RemoveText
trigger1 = time = 30
ID = 10
```

## <a name="new_rootmapadd">RootMapAdd</a>  

If the player is a helper, adds value to root's map. If the player is not a helper, this controller does nothing. Root refers to the main player.

**Required parameters:**  
  
>map = "*map_name*" (string)  
>Specifies a name of the map that we add value to.  
  
>value = *expr* (int or float)  
>*expr* is the value to add to the map.  


## <a name="new_rootmapset">RootMapSet</a>  

If the player is a helper, sets value root's map. If the player is not a helper, this controller does nothing. Root refers to the main player.

**Required parameters:**  
  
>map = "*map_name*" (string)  
>Specifies a name of the map that we assign value to.  
  
>value = *expr* (int or float)  
>*expr* is the value to assign to the map.  


## <a name="new_rootvaradd">RootVarAdd</a>  

If the player is a helper, adds value to root's working variables. Either a float variable or an int variable can be added by this controller. If the player is not a helper, this controller does nothing. Root refers to the main player.

>Required parameters (int version):  
>v = *var_no* (int)  
>*var_no* should evaluate to an integer between 0 and 59.  
  
>value = *int_expr* (int)  
>*int_expr* is the value to add to the int variable indicated by var_no.  
  
>Required parameters (float version):  
>fv = *var_no* (int)  
>*var_no* should evaluate to an integer between 0 and 39.  
  
>value = *float_expr* (float)  
>*float_expr* is the value to add to the float variable indicated by var_no.  
  
>Alternate syntax:  
>var(var_no) = *int_expr* (int version)  
>fvar(var_no) = *float_expr* (float version)  


## <a name="new_rootvarset">RootVarSet</a>  

If the player is a helper, sets value root's working variables. Either a float variable or an int variable can be set by this controller. If the player is not a helper, this controller does nothing. Root refers to the main player.

>Required parameters (int version):  
>v = *var_no* (int)  
>*var_no* should evaluate to an integer between 0 and 59.  
  
>value = *int_expr* (int)  
>*int_expr* is the value to assign to the int variable indicated by var_no.  
  
>Required parameters (float version):  
>fv = *var_no* (int)  
>*var_no* should evaluate to an integer between 0 and 39.  
  
>value = *float_expr* (float)  
>*float_expr* is the value to assign to the float variable indicated by var_no.  
  
>Alternate syntax:  
>var(var_no) = *int_expr* (int version)  
>fvar(var_no) = *float_expr* (float version)  


## <a name="new_roundtimeadd">RoundTimeAdd</a>  

Add specified amount of ticks into round time.

**Required parameters:**  
  
>value = *add_ticks* (int)  
>add_ticks specifies the number of ticks that should be added to round time.  


## <a name="new_roundtimeset">RoundTimeSet</a>  

Set round time to specified amount of ticks.

**Required parameters:**  
  
>value = *set_ticks* (int)  
>set_ticks specifies the number of ticks that should be set as a current round time.  


## <a name="new_savefile">SaveFile</a>  

Put specified data together and save it as binary. It uses gob, which is a serialized format for Go language, as the storage format. All characters specified by the character or helper who executed the function are stored at that time.

**Required parameters:**  
  
>savedata = *var_type* (string)  
>Specifies the data type that should be saved. Valid values for var_type are "var", "fvar", and "map".  
  
>path = "*save_path*" (string)  
>Specifies the save destination file path (relative to the character folder). Can use any extension (.gob is recommended)  

**Optional parameters:**  
  
>maps = *map_1*, *map_2*, *map_3*... (string)  
>A list of maps to load. Defaults to empty.  
  
>maps.include = *filter* (string)  
>All maps containing this string in their names will be saved. Defaults to empty.  
  
**Example:**
```ini
[State Test]
type = SaveFile
trigger1 = time = 10
savedata = var
path = "kfm.gob"
```

## <a name="new_shaderset">ShaderSet</a>

Sets the specified custom shader to the character. 

**Required parameters:**  
  
>shader = *"shader_name"* (string)  
>Specify the name from the currently loaded custom shader.  
  
**Optional parameters:**  
  
>time = *time* (int)  
>The custom shader is displayed for the specified number of ticks before being removed. The default is 1.  
>Specifying -1 will prevent it from being removed until ShaderSet is applied again.  
  
>shaderparam.pX = *value* (float)  
>Specifies the value to send to the custom shader. The value specified here can be used as a variable within the custom shader.  
>X is limited to 0 to 15, and a maximum of 16 values ​​can be sent.  

The shaderparam variable is defined within the custom shader, for example  

**OpenGL:**
```
	uniform float p0, p1, p2, p3, p4, p5, p6, p7;
	uniform float p8, p9, p10, p11, p12, p13, p14, p15;
```
**Vulkan:**
```
	layout(push_constant, std430) uniform u {
		vec4 palUV;
		float p0, p1, p2, p3, p4, p5, p6, p7;
		float p8, p9, p10, p11, p12, p13, p14, p15;
	};
```
  
>shadertexX.spr = *group, image* (int, int)  
>shadertexX.anim = *anim_no* (int)  
>Specifies the texture to send to the custom shader. The sprites specified here can be used as textures within the custom shader.  
You can specify 1 or 2 for X, and send up to two sprites.  
>Each tex can be assigned either a sprite number (spr) or an anim number. It is not possible to assign both sprite and anim numbers to the same tex number simultaneously.  
>Note that since textures are loaded as raw data, images with palettes may not display correctly as is.  
  
Shadertex textures are defined within custom shaders, for example  

**OpenGL:**
```
	uniform sampler2D tex1;
	uniform sampler2D tex2;
```
**Vulkan:**
```
	layout(binding = 5) uniform sampler2D tex1;
	layout(binding = 6) uniform sampler2D tex2;
```

## <a name="new_shiftinput">ShiftInput</a>

Allows temporarily changing the function of the player's keys. Resets every frame.  

**Required parameters:**  
  
>input = *key* (string)  
>The key to be changed  
  
>output = *key* (string)  
>The new function for that key  
  
>Valid keys are:  
>U, D, L, R, a, b, c, x, y, z, s, d, w, m, none  

Setting `input` and `output` both to `none` resets all buttons to normal state immediately.  

**Example:**
```
# Invert all directions
shiftInput{input: U; output: D}
shiftInput{input: D; output: U}
shiftInput{input: L; output: R}
shiftInput{input: R; output: L}

# Disable a button
shiftInput{input: a; output: none}
```


## <a name="new_scoreadd">ScoreAdd</a>  

Adds the specified amount of points to P1 current score counter.

**Required parameters:**  
  
>value = *expr* (float)  
>*expr* is the the number of score points to add to the P1 current score counter.  
  
**Example:**
```ini
[State Test]
type = ScoreAdd
trigger1 = AnimElem = 21
value = 100
```

## <a name="new_storyboard">Storyboard</a>  

Plays the specified storyboard during a match.

**Required parameters:**  
  
>path = *storyboard_path* (string)  
>Specifies the path to the storyboard file, relative to the Ikemen top-level directory.  

**Example:**
```ini
[State 0, Storyboard]
type = Storyboard
trigger1 = Time = 0
path = "data/ikemen1/logo.def"
```


## <a name="new_tagin">TagIn</a>  

Makes the P1 and/or the specified partner exit `Standby` state. If no parameters are given it affects the player that called it. (Also affects helpers)

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
*All [TagOut](State-controllers/#new_tagout) parameters work with some extra ones specified bellow*  
>ctrl = "*ctrl_flag*" (int)  
>Sets the P1 control flag.  
  
>leader = *leader_playerno* (int)  
>Sets the player who is considered a [team leader](Triggers/#new_teamleader) to the specified [playerno](Triggers/#new_playerno).  
  
>partnerctrl = *partnerctrl_flag* (int)  
>Sets the *partner_no* control flag.  
  
>memberno = *player_memberno* (int)  
>Changes the player's position in the team.  

**Example:**
```ini
[State]
type = TagIn
trigger1 = Time = 0
leader = PlayerNo
stateno = 5600
```


## <a name="new_tagout">TagOut</a>  

Makes the the player and/or the specified partner enter `Standby` state. If no parameters are given it affects the player that called it.  
The main purpose of the `Standby` flag is to put a player away so it won't interfere in a Tag match. For that reason it carries several special properties:  
* The player becomes unhittable
* The player cannot hit or push other players
* The camera will not follow the player
* `Enemy` and `P2` families of triggers will not pick up the player

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>self = *self_flag* (int)  
>Set to 0 to not affect P1. Defaults to 1.  
  
>partner = *partner_no* (int)  
>Specifies what teammate is afected.  
  
>stateno = *state_no* (int)  
>The number of the state to change P1 to.  
  
>partnerstateno = *partnerstate_no* (int)  
>The number of the state to change *partner_no* to.  
  
>memberno = *player_memberno* (int)  
>Changes the player's position in the team.  

**Example:**
```ini
[State]
type = TagOut
trigger1 = Time = 0
memberNo = 3
```


## <a name="new_targetadd">TargetAdd</a>

Adds the player with the specified ID to the original player's target list.  
Do not confuse this player ID with a target ID. Target ID can be assigned with `chainID` parameter of [GetHitVarSet](State-controllers-(new)/#new_gethitvarset).  

**Required parameters:**  
  
>PlayerID = *ID* (int)  
>ID of player to be added.


## <a name="new_targetdizzypointsadd">TargetDizzyPointsAdd</a>  

Adds the specified amount to all targets' dizzy points.

**Required parameters:**  
  
>value = *add_amt* (int)  
>*add_amt* is added to each target's dizzy points.  
  
**Optional parameters:**  
  
>ID = *target_id* (int)  
>Specifies the desired target ID to affect. Only targets with this target ID will be affected. Defaults to -1 (affects all targets.)  


## <a name="new_targetguardpointsadd">TargetGuardPointsAdd</a>  

Adds the specified amount to all targets' guard points.

**Required parameters:**  
  
>value = *add_amt* (int)  
>*add_amt* is added to each target's guard points.  
  
**Optional parameters:**  
  
>ID = *target_id* (int)  
>Specifies the desired target ID to affect. Only targets with this target ID will be affected. Defaults to -1 (affects all targets.)  


## <a name="new_targetredlifeadd">TargetRedLifeAdd</a>  

Adds the specified amount to all targets' red life, scaled by the targets' defense multipliers if necessary.

**Required parameters:**  
  
>value = *add_amt* (int)  
>*add_amt* is added to each target's red life.  
  
**Optional parameters:**  
  
>ID = *target_id* (int)  
>Specifies the desired target ID to affect. Only targets with this target ID will be affected. Defaults to -1 (affects all targets.)  
  
>absolute = *abs_flag* (int)  
>If *abs_flag* is 1, then *add_amt* will not be scaled (i.e. attack and defense multipliers will be ignored). Defaults to 0.  


## <a name="new_targetscoreadd">TargetScoreAdd</a>  

Adds the specified amount of points to targets' current score counter.

**Required parameters:**  
  
>value = *expr* (float)  
>*expr* is the the number of score points to add to the target's current score counter.  
  
**Optional parameters:**  
  
>ID = *target_id* (int)  
>Specifies the desired target ID to affect. Only targets with this target ID will be affected. Defaults to -1 (affects all targets.)  


## <a name="new_teammapadd">TeamMapAdd</a>  

Adds value to all team members maps.

**Required parameters:**  
  
>map = "*map_name*" (string)  
>Specifies a name of the map that we add value to.  
  
>value = *expr* (int or float)  
>*expr* is the value to add to the map.  


## <a name="new_teammapset">TeamMapSet</a>  

Sets value to all team members maps.

**Required parameters:**  
  
>map = "*map_name*" (string)  
>Specifies a name of the map that we assign value to.  
  
>value = *expr* (int or float)  
>*expr* is the value to assign to the map.  


## <a name="new_textrender">Text</a>  

Text controller is used for displaying text on screen.

**Required parameters:**  
  
>none  
  
**Optional parameters:**  
  
>removetime = *rem_time* (int)  
>The text will be removed after having been displayed for *rem_time* number of game ticks. Defaults to 1.  
  
>layerno = *layer_no* (int)  
>Sets the layer to which the text will be drawn on. 0 is in front of the background, but behind the players. 1 is in front of the players, but behind the foreground. 2 is in front of the foreground. Defaults to 1.  
  
>localcoord = *coord_x, coord_y* (int, int)    
>Sets custom localcoord. If omitted, lifebar font defaults to the lifebar localcoord, character font and debug font defaults to the screen localcoord.  
  
>text = *"format_string"* (string)  
>Text to be rendered. Defaults to "%v" (rendering first *params* argument of any type). *format_string* must be encased in double-quotes. It is a *printf* format string. You can use \t to generate a tab character (tab width is equivalent to 4 characters) and \n to break lines. To display the value of an arithmetic expression, you can put a %d (for ints) or a %f (for floats) in the format string, then specify the expression in the params list. To display a % character, you must put %% in the format string. Accepted format specifiers: %v (any type), %d, %i, %f, %F, %e, %E, %g, or %G. Syntax such as %0.2f is also supported.  
  
>params = *exp_1, exp_2, (...)*  
>Unlimited amount of numeric arguments can be specified in the format string. These should be listed under the params item, in order. The type of each parameter must match its format specifier.
  
>font = *[F]font_no* (int)  
>*font_no* specifies the number of the font to use for text rendering. The 'F' prefix is optional: if included, then the text is rendred using lifebar (fight.def) fonts. Otherwise font [declared](Character-features#def_files_font) in character's DEF file is used. If specified font doesn't exist than the debug font is used. Defaults to debug font.  
  
>bank = *bank_no* (int)  
>Color bank of the font to use. Refer to the font for what color banks it has. Defaults to 0.  
  
>align = *alignment* (int)  
>*alignment* is a number representing the text alignment. 1 is left, 0 means center, and -1 is for right-alignment. Defaults to 1.  
  
>angle = *angle* (int)  
>Specify the rotation, rotation point is based on the text's alignment. Defaults to 0.  
  
>pos = *off_x, off_y* (int, int)  
>Specify the offset at which to create the text. Defaults to 0,0.  
  
>scale = *x_scale, y_scale* (float, float)  
>Specify the scaling factors to apply to the text in the horizontal and vertical directions. Defaults to 1,1.  
  
>color = *r, g, b, a* (int, int, int, int)  
>Color adjustment values for the font. Defaults to 256,256,256,256 (no color adjustment).  
  
>id = *id_no* (int)  
>Specifies an ID number for this text. Used to identify particular text in numText trigger and removeText sctrl.  
  
>textspacing = *x_spacing, y_spacing*` (float, float)  
>Specifies extra spacing between letters (*x_spacing*) and extra spacing between lines when `\n` is used to break lines (*y_spacing*). These values are added on top of the font’s DEF Spacing values.  
  
>textdelay = *time* (float)  
>Adjusts the text typing time, the longer the time the longer the delay between each letter typed.  
  
>velocity = *vel_x, vel_y* (float, float)  
>Applies speed to text on the defined axis.  
  
>accel = *accel_x, accel_y* (float, float)  
>Applies acceleration to text on the defined axis.  
  
>friction = *friction_x, friction_y* (float, float)  
>Applies friction to text on the defined axis (Friction value example: 0.95).   
  
>xshear = *xshear* (float)  
>Specifies the amount of horizontal shearing to apply to the text. Defaults to 0.  
  
>maxdist = *maxdist* (float)  
>Specifies the maximum velocity beyond which additional velocity will no longer be applied. Defaults to 0 (unlimited).  
  
>palfx.key = the text sctrl can accept all the same key values from [PalFX state controller](http://www.elecbyte.com/mugendocs/sctrls.html#palfx)
  
>hidewithbars = *bvalue* (bool)  
>Enabling this parameter hides the text automatically when the fight screen is hidden.  

## <a name="new_transformclsn">TransformClsn</a>

Changes the geometry or certain properties of the player's collision boxes.  

**Required parameters:**  
  
>At least one of the optional parameters  
  
**Optional parameters:**  
  
>scale = *x_scale, y_scale* (float, float)  
>Applies a scale multiplier to the boxes  
  
>angle = *angle* (float)  
>Changes the angle of the boxes. In degrees  


## <a name="new_transformsprite">TransformSprite</a>

Apply certain deformations to the char's sprite.  

**Required parameters:**  
  
>At least one of the optional parameters  
  
**Optional parameters:**  
  
>window = *x1, y1, x2, y2* (float, float, float, float)  
>The window parameter forms a rectangle (similar to clsn) relative to the char, outside of which pixels will not be drawn.  
  
>xshear = *xshear* (float)  
>Specifies the amount of horizontal shearing to apply to the char. Defaults to 0.  
>projection = *orthographic (default), perspective(distortion relative to the center of the screen), perspective2(distortion relative to the sprite)*   
>Affect how the char sprite is drawn when `xangle` or `yangle` is not zero  
>focallength = *focallength* (float)   
>Focal Length of the projection. Does nothing when projection is not perspective or perspective2   