The triggers in this page already existed in Mugen, but were adjusted or received new features in Ikemen GO.  

Refer to the sidebar for quicker navigation.


# <a name="redirection">Changed trigger redirections</a>


## <a name="redirection_helper">Helper</a>

The `Helper` redirection now also accepts an optional index argument, through the new format `Helper(ID, index)`. Defaults to 0 (first one).  
The old formats still work exactly the same.  

Example:
```ini
trigger1 = NumHelper(1005) >= 2
trigger1 = Helper(1005, 1), MoveType = A; The second helper with ID 1005
```


## <a name="redirection_target">Target</a>

The `Target` redirection now also accepts an optional index argument, through the new format `Target(ID, index)`. Defaults to 0 (first one).  
The old format still works exactly the same.  

Example:
```ini
trigger1 = NumTarget >= 2
trigger1 = Target(-1, 1), Alive; The second target with any ID
```


# <a name="changed_trigger">Changed triggers</a>


## <a name="changed_command">Command</a>

If a character has `ikemenversion`, when the `Command` trigger is redirected to another player, the engine will first check if the other player is performing its own command with the same name. If not, it'll check if it's performing the command from our own command list. Otherwise it will work like Mugen.  


## <a name="changed_const">Const</a>

The Const trigger can now also read Ikemen GO's [new constants](../Character-features/#cns_constants).

### <a name="changed_const_constants">Const(constants)</a>

Returns the value of one of the player's constants from the [[Constants]](Character-features/#cns_constants) section.

```ini
[Constants]
FireballState = 1000

[State -1, Fireball]
triggerall = NumHelper(Const(FireballState)) = 0
```


### <a name="changed_const_datadizzypoints">data.dizzypoints</a>

Returns the value of the player's [Data] [dizzypoints](Character-features/#cns_data_dizzypoints) constant.

### <a name="changed_const_datafalldefenceup">data.fall.defence_up</a>

Returns the value of the player's [Data] fall.defence_up constant.

### <a name="changed_const_dataguardpoints">data.guardpoints</a>

Returns the value of the player's [Data] [guardpoints](Character-features/#cns_data_guardpoints) constant.

### <a name="changed_const_dataguardsoundchannel">data.guardsound.channel</a>

Returns the value of the player's [Data] [guardsound.channel](Character-features/#cns_data_guardsoundchannel) constant.

### <a name="changed_const_datahitsoundchannel">data.hitsound.channel</a>

Returns the value of the player's [Data] [hitsound.channel](Character-features/#cns_data_hitsoundchannel) constant.

### <a name="changed_const_size_height_crouch">size.height.crouch</a>

Returns the value of the player's [Size] [height.crouch](Character-features/#cns_size_height_crouch) constant.

### <a name="changed_const_size_height_air_top">size.height.air.top</a>

Returns the first value of the player's [Size] [height.air](Character-features/#cns_size_height_air) constant.

### <a name="changed_const_size_height_air_bottom">size.height.air.bottom</a>

Returns the second value of the player's [Size] [height.air](Character-features/#cns_size_height_air) constant.

### <a name="changed_const_size_height_down">size.height.down</a>

Returns the value of the player's [Size] [height.down](Character-features/#cns_size_height_down) constant.

### <a name="changed_const_velocityairgethitkoadd">velocity.air.gethit.ko.add</a>

Returns the value of the player's [Velocity] [air.gethit.ko.add](Character-features/#cns_velocity_airgethitkoadd) constant.
* `velocity.air.gethit.ko.add.x`
* `velocity.air.gethit.ko.add.y`
* `velocity.air.gethit.ko.add.z`

### <a name="changed_const_velocityairgethitkoymin">velocity.air.gethit.ko.ymin</a>

Returns the value of the player's [Velocity] [air.gethit.ko.ymin](Character-features/#cns_velocity_airgethitkoymin) constant.

### <a name="changed_const_velocitygroundgethitkoxmul">velocity.ground.gethit.ko.xmul</a>

Returns the value of the player's [Velocity] [ground.gethit.ko.xmul](Character-features/#cns_velocity_groundgethitkoxmul) constant.

### <a name="changed_const_velocitygroundgethitkoadd">velocity.ground.gethit.ko.add</a>

Returns the value of the player's [Velocity] [ground.gethit.ko.add](Character-features/#cns_velocity_groundgethitkoadd) constant.
* `velocity.ground.gethit.ko.add.x`
* `velocity.ground.gethit.ko.add.y`
* `velocity.ground.gethit.ko.add.z`

### <a name="changed_const_velocitygroundgethitkoymin">velocity.ground.gethit.ko.ymin</a>

Returns the value of the player's [Velocity] [ground.gethit.ko.ymin](Character-features/#cns_velocity_groundgethitkoymin) constant.


## <a name="changed_gameheight">GameHeight</a>

If mugenVersion is specified as 1.0 in character's [[Info]](Character-features/#def_info) section, GameHeight returns the same value as ScreenHeight.


## <a name="changed_gamewidth">GameWidth</a>

If mugenVersion is specified as 1.0 in character's [[Info]](Character-features/#def_info) section, GameWidth returns the same value as ScreenWidth.


## <a name="changed_gethitvar">GetHitVar</a>


### <a name="changed_gethitvar_air_velocity_x">air.velocity.x (y, z)</a>

Returns the X, Y or Z component of the last HitDef's `air.velocity` parameter, even if the player was not hit in the air. (float)


### <a name="changed_gethitvar_airguard_velocity_x">airguard.velocity.x (y, z)</a>

Returns the X, Y or Z component of the last HitDef's `airguard.velocity` parameter, even if the player did not guard in the air. (float)


### <a name="changed_gethitvar_animtype">air.animtype, fall.animtype, ground.animtype</a>

Returns the literal value specified in the HitDef.


### <a name="changed_gethitvar_attr">attr</a>

Returns the last HitDef `attr` assignment. Requires a comparison to known flags. (string)  

```ini
trigger1 = getHitVar(attr) = SCA, HA
```


### <a name="changed_gethitvar_dizzypoints">dizzypoints</a>

Returns last HitDef `dizzypoints` value. (int)


### <a name="changed_gethitvar_down_velocity_x">down.velocity.x (y, z)</a>

Returns the X, Y or Z component of the last HitDef's `down.velocity` parameter, even if the player was not hit while down. (float)


### <a name="changed_gethitvar_facing">facing</a>

Returns last HitDef `p2facing` value. (int)


### <a name="changed_gethitvar_fallenvshakemul">fall.envshake.mul</a>

Returns last HitDef `fall.envshake.mul` value. (float)


### <a name="changed_gethitvar_fall_zvel">fall.zvel</a>

Returns z velocity after bouncing off ground (float)


### <a name="changed_gethitvar_frame">frame</a>

Returns true only during the same frame where the player got hit by an attack. (bool)


### <a name="changed_gethitvar_ground_velocity_x">ground.velocity.x (y, z)</a>

Returns the X, Y or Z component of the last HitDef's `ground.velocity` parameter, even if the player was not hit on the ground. (float)


### <a name="changed_gethitvar_guard_velocity_x">guard.velocity.x (y, z)</a>

Returns the X, Y or Z component of the last HitDef's `guard.velocity` parameter, even if the player did not guard on the ground. (float)  


### <a name="changed_gethitvar_guardpoints">guardpoints</a>

Returns last HitDef `guardpoints` value. (int)


### <a name="changed_gethitvar_guardcount">guardcount</a>

Returns how many hits the player has guarded without a chance to fight back. (int)


### <a name="changed_gethitvar_guarddamage">guarddamage</a>

Returns the second value of the last HitDef's `damage` parameter. (int)


### <a name="changed_gethitvar_guardflag">guardflag</a>

Returns the `guardflag` parameter of the last HitDef that hit the player. Requires a comparison to known flags. (string)  

```ini
trigger1 = getHitVar(guardflag) = L
```


### <a name="changed_gethitvar_guardko">guardko</a>

Returns 1 if the player was KO'd by guard damage. (bool)


### <a name="changed_gethitvar_guardpower">guardpower</a>

Returns the second value of the last HitDef's `givepower` parameter. In other words, the power received when guarding. (int)


### <a name="changed_gethitvar_hitflag">hitflag</a>

Returns the `hitflag` parameter of the last HitDef that hit the player. Requires a comparison to known flags. (string)  

```ini
trigger1 = getHitVar(hitflag) = MA
```


### <a name="changed_gethitvar_hitpower">hitpower</a>

Returns the first value of the last HitDef's `givepower` parameter. In other words, the power received when getting hit. (int)


### <a name="changed_gethitvar_hitdamage">hitdamage</a>

Returns the first value of the last HitDef's `damage` parameter. (int)


### <a name="changed_gethitvar_kill">kill</a>

Returns the kill flag of the last hit or LifeAdd the character suffered. (int)


### <a name="changed_gethitvar_playerid">playerid</a>

Returns the ID of the last character that hit the player. (int)  
Note: Up until Ikemen GO version 0.99, this trigger used `ID` syntax instead of `playerID`. That syntax is still valid, but it's deprecated.  


### <a name="changed_gethitvar_playerno">playerno</a>

Returns the [PlayerNo](Triggers-(new)/#new_playerno) of the last character that hit the player. (int)


### <a name="changed_gethitvar_power">power</a>

Returns how much power the player received from the last hit, regardless of getting hit or guarding. (int)


### <a name="changed_gethitvar_priority">priority</a>

Returns the numerical value of the attack priority of the last HitDef. (int)


### <a name="changed_gethitvar_projid">projid</a>

Returns the `projID` of the last projectile that hit the player. Returns -1 if not hit by a projectile. (int)


### <a name="changed_gethitvar_redlife">redlife</a>

Returns last HitDef `redlife` value. (int)


### <a name="changed_gethitvar_score">score</a>

Returns last HitDef `score` value. (float)


### <a name="changed_gethitvar_teamside">teamside</a>

Returns the `teamside` of the last HitDef that hit the player. (int)


### <a name="changed_gethitvar_type">type</a>

Returns the value of either groundtype or airtype, depending on the character's StateType upon being hit. Such a trigger was documented in Mugen but did not work.


### <a name="changed_gethitvar_xaccel">xaccel</a>

Returns the X acceleration set by the hit. (float)  
NOTE: Currently, this parameter will only work if the character does not override the `common1.cns.zss` states that use it.  


### <a name="changed_gethitvar_xveladd">xveladd</a>

This trigger was dummied out in Mugen, always returning 0. In Ikemen, it works as documented.


### <a name="changed_gethitvar_yveladd">yveladd</a>

This trigger was dummied out in Mugen, always returning 0. In Ikemen, it works as documented.


### <a name="changed_gethitvar_zaccel">zaccel</a>

Returns the Z acceleration set by the hit. (float)  
NOTE: Currently, this parameter will only work if the character does not override the `common1.cns.zss` states that use it.  


### <a name="changed_gethitvar_zvel">zvel</a>

Returns the fixed z-velocity imparted by hit. (float)


### <a name="changed_gethitvar_zoff">zoff</a>

"Snap" z offset when hit.


## <a name="changed_ishelper">IsHelper</a>

The `IsHelper` trigger now also accepts an optional index argument, through the new format `IsHelper(ID, index)`. Defaults to -1 (any index).  
The old formats still work exactly the same.  

Example:
```ini
trigger1 = IsHelper(123, 2); Is the third helper with ID 123
```


## <a name="changed_p2bodydist">P2BodyDist</a>

### <a name="changed_p2bodydist_y">Y</a>

In Mugen, this trigger merely does the same as `P2Dist Y`. If a character has `ikemenversion`, it will instead return the distance between the size boxes of the two players.

### <a name="changed_p2bodydist_y">Z</a>

P2BodyDist now also accepts a Z argument. When there is overlap between the players' Z width, it returns 0, otherwise returns the distance between their theoretical width boxes.  


## <a name="changed_p2dist_z">P2Dist Z</a>

The `P2Dist` trigger now also accepts a `Z` argument. Returns the distance between the players in the Z axis.


## <a name="changed_parentdist_z">ParentDist Z</a>

The `ParentDist` trigger now also accepts a `Z` argument. Returns the distance between the helper and its parent in the Z axis.


## <a name="changed_rootdist_z">RootDist Z</a>

The `RootDist` trigger now also accepts a `Z` argument. Returns the distance between the helper and its root in the Z axis.


## <a name="changed_roundstate">RoundState</a>

The `RoundState` trigger no longer returns 2 during the "Fight!" screen, before players have control, returning 1 instead.  
`RoundState = 2` is generally understood and documented as the main part of the fight, so this oddity only caused trouble in Mugen.  


## <a name="changed_stagevar">StageVar</a>

StageVar now accepts all stage parameters that [ModifyStageVar](State-controllers-(new)/#new_modifystagevar) state controller can change. In addition it accepts the following parameters:

>info.ikemenversion.major = *major version component* (int)  
>info.ikemenversion.minor = *minor version component* (int)  
>info.ikemenversion.patch = *patch version component* (int)  
>info.mugenversion.major = *major version component* (int)  
>info.mugenversion.minor = *minor version component* (int)  
>stageinfo.localcoord.x = *width* (int)  
>stageinfo.localcoord.y = *height* (int)  


## <a name="changed_teammode">TeamMode</a>

TeamMode can now also return `Tag` when that mode is selected.

```ini
trigger1 = TeamMode = Tag
```