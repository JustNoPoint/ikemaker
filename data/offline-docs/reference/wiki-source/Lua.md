# <a name="lua_general">General information</a>

Ikemen GO is written in [Go](https://golang.org/). On top of the engine code, it uses [Lua](https://www.lua.org/) as an embedded scripting language. Lua scripts make it possible to adjust parts of the application after the engine has been [built](https://en.wikipedia.org/wiki/Software_build), without recompiling it.

Lua is used for, among other things:

* logic for screens outside the fight, including screenpack/menu flow;
* game mode flow, such as deciding who enters a match and what happens after the match result;
* features around match flow, such as continue screens, pause menus and post-match screens;
* game configuration and helper logic exposed to screenpacks, modules and custom mode scripts.

Default Lua scripts are available in `external/script`. These files are updated and expanded between engine versions. Editing them directly is usually not recommended for normal engine users, because local changes may conflict with future updates. Direct edits are mainly useful for full-game authors who intentionally maintain their own script branch.

For most extensions, prefer one of the supported external Lua entry points documented on this page:

* [Arcade Paths / Story Mode arcs](#arcs), for custom arcade and story progression;
* [Content unlocking](#lua_unlock), for Lua conditions in `select.def` and screenpack menus;
* [External modules](#modules), for loading standalone Lua files without editing default scripts;
* [Hooks](#modules_hook), for attaching module code to selected points in the default scripts.

This page does not teach the Lua language itself. For Lua syntax and general programming concepts, refer to the [Lua 5.1 reference manual](http://www.lua.org/manual/5.1/) or beginner tutorials such as [Lua tutorial basics](https://somedudesays.com/2019/07/lua-tutorial-basics/) and [Tutorialspoint Lua](https://www.tutorialspoint.com/lua/).

# <a name="arcs">Arcade Paths / Story Mode arcs</a>

By default, Mugen and Ikemen GO provide a classic arcade mode with relatively simple progression. This is enough for traditional arcade paths, such as fighting a number of random opponents and then a boss, but it gives limited control over special cases. Standard arcade setup is mostly restricted to select.def character parameters, opponent order, maxmatches-style settings and fixed team-mode behavior.

Arcade Paths / Story Mode arcs let authors write progression logic in Lua. This makes it possible to create:

* character-specific arcade routes;
* rival battles;
* hidden bosses;
* branching paths;
* forced single, simul, tag or turns battles in the same run;
* custom storyboards before, between or after matches;
* selectable Story Mode arcs where the author decides exactly who the player controls and who they fight.

Functionality-wise, this makes external front ends such as [Mugen Story Mode](https://mugen.fandom.com/wiki/Mugen_Story_Mode) unnecessary for this use case.

## <a name="arcs_arcade_vs_story">Arcade paths vs. Story Mode arcs</a>

Arcade paths and Story Mode arcs use the same Lua helper functions. The practical difference is how the mode starts.

In an arcade path, the player normally chooses a character, team mode and team size on the select screen. Because of that, `launchFight{}` can often use default values for the player side.

In Story Mode, there is no normal select screen. There is no default player character, team mode, team size, or character switching after continue. For that reason, Story Mode scripts should usually define the player side explicitly with `launchFight` arguments such as `p1char`, `p1teammode` and `p1numchars`, just like they define the opponent side.

## <a name="arcs_basics">Assigning a path</a>

Custom arcade paths can be assigned in either of these ways:

* in a character DEF file, under the `[Arcade]` section, with a path relative to the character folder;
* in `select.def`, as a character parameter, with a path relative to the game folder.

Format:

```ini
arcadepath = path_to_lua_file
```

Story Mode arcs are assigned in `select.def`, under the `[StoryMode]` section. Refer to the `select.def` distributed with the engine for a working example and the available parameters.

## <a name="arcs_simple_example">Simple arcade path</a>

The following example recreates a simple Mugen-style arcade order: an intro storyboard, six random order-1 fights, one order-2 fight, one order-3 fight, then an ending storyboard.

```lua
launchStoryboard('chars/kfm/intro.def')

for i = 1, 6 do
	if not launchFight{} then return end
end

if not launchFight{order = 2} then return end
if not launchFight{order = 3, winscreen = true} then return end

launchStoryboard('chars/kfm/ending.def')
setMatchNo(-1)
```

`launchStoryboard` starts a storyboard. `launchFight` starts a match and returns `false` when the script should stop, for example after losing without continuing or when the mode flow is interrupted.

`winscreen = true` enables the post-match Win Screen / Results Screen for that fight. In custom arcade paths, use it on the final fight if the route should show that screen before the ending.

`setMatchNo(-1)` marks the run as cleared. Use it before ending a completed route so that clear-related behavior, such as credits and hiscore appending, can run.

## <a name="arcs_conditions">Conditional fights and branching</a>

Lua can decide what happens next based on match results or other available data. For example, this code sends the player to a secret boss only if they reached seven consecutive wins. Otherwise, it uses a normal order-3 opponent.

```lua
if getConsecutiveWins(1) == 7 then
	if not launchFight{p2char = {"SuaveDude"}} then return end
else
	if not launchFight{order = 3} then return end
end
```

For simple post-match checks, helper functions and Lua trigger functions are usually enough. For more complicated conditions, such as counting perfect rounds or custom story flags, store the needed data during the fight. This can be done with character variables, fvars, maps, or Lua code executed during the match through the `lua` argument of `launchFight`.

Lua trigger functions such as `var`, `fvar` and `map` are listed in the [Lua triggers](#functions_triggers) section.

## <a name="arcs_reliable_paths">Writing reliable paths</a>

A basic path can work with only a few `launchFight` calls, but real arcade paths should account for common edge cases.

First, exclude special opponents from random pools when needed. For example, if a rival or boss has the same order as regular characters, they can appear randomly unless excluded:

```lua
launchFight{exclude = {"Blanka", "Sakura", "Final Bison"}}
```

Second, use `matchNo()` when the script must resume from the correct point. This matters when continuing a run, or when the selected character can change after continue and the new character has a different arcade path. Since the Lua file is read from the beginning, each section should check whether it still applies to the current match number.

Third, always stop the script when `launchFight` returns `false`:

```lua
if not launchFight{} then return end
```

Fourth, call `setMatchNo(-1)` when the route is fully cleared. Without this, the engine will not treat the route as completed.

Fifth, use `winscreen = true` on the final `launchFight` if the route should show the post-match Win Screen / Results Screen. Custom arcade paths are controlled by the Lua script, not by `arcade.maxmatches`.

## <a name="arcs_example">Example</a>

The following example recreates a Street Fighter Alpha 3-style route for Karin. It includes random opponents, rival fights, a forced simul fight and a final boss. It also supports resuming correctly from the current match number.

```lua
if matchNo() == 1 and not continued() then
	launchStoryboard('chars/Karin/intro.def')
end

for i = matchNo(), 4 do
	if not launchFight{exclude = {"Blanka", "Sakura", "Juni", "Juli", "Final Bison"}} then return end
end

if matchNo() == 5 then
	if not launchFight{p2char = {"Blanka"}} then return end
end

for i = matchNo(), 8 do
	if not launchFight{exclude = {"Sakura", "Juni", "Juli", "Final Bison"}} then return end
end

if matchNo() == 9 then
	local ok = launchFight{
		p2char = {"Sakura"},
		exclude = {"Juni", "Juli", "Final Bison"}, -- since single mode is not forced
	}
	if not ok then return end
end

if matchNo() == 10 then
	local ok = launchFight{
		p2char = {"Juni", "Juli"},
		p2numchars = 2, -- prevents extra characters being appended by default team size
		p2teammode = "simul",
	}
	if not ok then return end
end

local ok = launchFight{
	p2char = {"Final Bison"},
	p2teammode = "single",
	winscreen = true,
}
if not ok then return end

launchStoryboard('chars/Karin/ending.def')
setMatchNo(-1)
```

Although this may look complex at first, most path scripts can be reused between characters with only small changes, such as replacing rival names or mid-bosses.

## <a name="arcs_tips">Tips</a>

* Start with a simple linear route, then add branching once the basics work.
* Keep rival and boss names in local tables if several characters share the same route structure.
* Use `matchNo()` around storyboards and fixed fights so a continued run does not replay cleared events.
* Use `exclude` to keep bosses, rivals or unlockable characters out of normal random pools.
* Use `winscreen = true` on the final fight if the route should show the Win Screen / Results Screen.
* For Story Mode arcs, explicitly assign `p1char` and related p1 options instead of relying on select-screen defaults.
* Use [Troubleshooting scripts](#lua_troubleshooting) when testing conditions or match data.

# <a name="lua_unlock">Content unlocking</a>

Lua can be used to unlock characters, stages and game modes through optional `select.def` and screenpack parameters.

## <a name="lua_unlock_characters">Character unlocking</a>

Characters hidden with the `hidden` select.def parameter can be unlocked with an `unlock` parameter on the same line.

Everything after `unlock =` is treated as Lua code. Because of that, `unlock` must be the last parameter in the line. The code is executed each time the mode is initiated and when returning to the main menu. It should return a boolean value.

If the code returns `true`, the hidden character becomes selectable. If the character was previously unlocked but the condition later returns `false`, the character becomes locked again.

### Example: unlock after clearing arcade once

When the game starts, data from `saves/stats.json` is loaded into a Lua table named `stats`. The following condition unlocks a character after arcade mode has been cleared at least once:

```lua
stats.modes ~= nil and stats.modes.arcade ~= nil and stats.modes.arcade.clear >= 1
```

The table checks are needed because reading a missing subtable would produce a Lua error.

### Example: hide from one mode

This condition makes a character available in all modes except `bossrush`:

```lua
gameMode() ~= "bossrush"
```

### Example: allow unlocks during netplay

Online play sends only inputs, so both players should generally have the same select screen. For that reason, it is recommended to make hidden characters and stages available during netplay:

```lua
(--[[ normal unlock condition here ]]) or netPlay()
```

### Example: move complex logic to a function

Since character parameters are written on one line in `select.def`, complicated conditions are easier to maintain in an external module:

```lua
-- function declared in an external module
function myUnlockCondition(myArgument)
	-- Any Lua code goes here.
	-- Return true to unlock or false to keep locked.
end
```

Then call the function from the `unlock` parameter.

## <a name="lua_unlock_stages">Stage unlocking</a>

Stage unlocking works the same way as character unlocking. Assign an `unlock` parameter as a stage parameter in `select.def`. The condition should return `true` when the stage should be available.

## <a name="lua_unlock_modes">Game mode unlocking</a>

Game modes can be locked in the screenpack DEF file under `[Title Info]` by using:

```ini
menu.unlock.<itemname> = lua_condition_here
```

Replace `<itemname>` with the menu item name associated with the mode.

The value is read as Lua code. If the parameter is missing or returns `true`, the mode is visible. If it returns `false`, the mode is hidden.

Unlike character and stage unlocking, game mode unlocking is runtime-permanent. Once the mode is unlocked, the condition is not checked again until the game is restarted.

# <a name="modules">External modules</a>

External Lua scripts, referred to here as modules, are used to add Lua-coded features without directly modifying scripts distributed with the engine.

There are three ways to load external modules. Modules are loaded after default scripts, in the following order:

1. Any `.lua` file placed in `external/mods` is loaded automatically, in alphabetical order.
2. Lua file paths can be added through `Common.Modules` in the config.
3. A screenpack can load its own Lua file from `[Files]` using `module = path_to_lua_file`.

Lua files with the `-` prefix are skipped during the automatic loading process. For example, `-module.lua` will not be loaded at engine boot. This can be used to keep a Lua file in `external/mods` without loading it automatically when the file is intended to be loaded through another method.

A module directory can also contain a `+system.def` file. If present, it is appended to the main `system.def`, making it possible to add screenpack definitions from the module itself.

Use `+system.def` only for official motif parameters recognized by the engine. For new custom parameters, prefer a dedicated `.def` or `.json` file and load it with embedded Lua helper functions. This helps modules stay self-contained and reusable.

Since external modules are loaded after default scripts, they can access data initialized by the engine scripts while avoiding direct edits to those scripts. This makes modules easier to share and less likely to be overwritten by engine updates.

Modules are not guaranteed to stay forward compatible between stable releases. Functions, tables and script flow may change over time. The more intrusive a module is, the more likely it is to break after an update. Complex modules should usually target stable releases instead of nightly builds.

Whenever possible, prefer [hooks](#modules_hook) over direct overwrites. Hook-based extensions are usually easier to maintain than replacing large parts of default logic.

Reference modules are available here:

[https://github.com/ikemen-engine/modules](https://github.com/ikemen-engine/modules)

This repository contains example modules, including modules that add new game modes and team mode features.

# <a name="modules_hook">Hook system</a>

The hook system lets external modules attach code to selected points in the default Lua scripts without editing those scripts directly.

Hooks are the preferred way to extend built-in scripts. They do not guarantee forward compatibility, but they are usually safer and easier to maintain than direct function or table overwrites.

Hook lists are identified by string names. Some lists are provided by default by the engine. Modules can also define and run their own custom hook lists.

## <a name="hook_notes">General notes</a>

Hook execution order should be treated as undefined.

Hooks are stored in a Lua table and iterated with `pairs()`, so modules should not rely on one hook running before another unless they handle that explicitly.

`hook.runFirst()` should be used only with hooks designed to act as overrides. Returning `nil` means "not handled". Any non-`nil` value stops further processing and is returned to the caller.

More hook entry points may be added in the future. If a module needs access to a place that is not currently hookable, it is usually better to request a new hook than to patch default scripts directly.

## <a name="hook_functions">Hook functions</a>

### `hook.add`

> Format: `hook.add(list, name, func)`  
> Required arguments:  
> `list` = string hook list name.  
> `name` = string unique entry name within this list.  
> `func` = function to register.  
> Return: none  

Adds a function to a hook list.

If another function with the same name already exists in the same list, it is replaced.

```lua
hook.add("main.f_default", "mymodule_defaults", function()
	main.myflag = true
end)
```

### `hook.run`

> Format: `hook.run(list, ...)`  
> Required arguments:  
> `list` = string hook list name.  
> `...` = extra arguments forwarded to every function in the list.  
> Return: none  

Runs all functions registered in a hook list.

If the list does not exist or is empty, nothing happens.

```lua
hook.add("main.f_default", "mod_a", function()
	print("A")
end)

hook.add("main.f_default", "mod_b", function()
	print("B")
end)
```

When the `main.f_default` hook is executed, both functions are called.

### `hook.runFirst`

> Format: `hook.runFirst(list, ...)`  
> Required arguments:  
> `list` = string hook list name.  
> `...` = extra arguments forwarded to functions in the list.  
> Return: first non-`nil` value, or `nil` if nothing handled the call.  

Runs functions from a hook list until one returns a non-`nil` value.

This is meant for override-style entry points.

```lua
hook.add("start.f_selectMode.luaPath", "my_path", function(path)
	if gameMode() == "arcade" then
		return "external/mods/my_module/arcade.lua"
	end
end)
```

If this function returns a path, later hooks in the same list are not called.

### `hook.stop`

> Format: `hook.stop(list, name)`  
> Required arguments:  
> `list` = string hook list name.  
> `name` = registered hook name.  
> Return: none  

Removes a hook from a list.

```lua
hook.stop("main.f_default", "mymodule_defaults")
```

Below is the list of hook entry points currently exposed by default scripts.

## <a name="hook_list_general">General hooks</a>

### `launchFight`

> Format: `hook.add("launchFight", name, func)`  
> Callback arguments:  
> `common` = table temporary Common lists for this match.  
> `t` = table resolved `launchFight()` data.  
> `data` = table original argument table passed to `launchFight()`.  

Called right before `start.f_selectLoading()` / `loadStart()`.

This hook can modify `common` in place. It is the correct place to append per-match `Common.*` entries from Lua.

```lua
hook.add("launchFight", "my_common_lua", function(common)
	common.lua = common.lua or {}
	table.insert(common.lua, "external/mods/my_module/common.lua")
end)
```

### `loop`

> Format: `hook.add("loop", name, func)`  
> Callback arguments: none  

Called at the start of `global.lua` `loop()`.

### `loop#[gamemode]`

> Format: `hook.add("loop#[gamemode]", name, func)`  
> Callback arguments: none  

Called at the start of `global.lua` `loop()`, but limited to the current game mode.

Replace `[gamemode]` with the actual mode name.

```lua
hook.add("loop#arcade", "my_arcade_logic", function()
	-- code executed only in arcade mode
end)
```

## <a name="hook_list_main">Main script hooks</a>

### `main.f_commandLine`

> Format: `hook.add("main.f_commandLine", name, func)`  
> Callback arguments:  
> `t` = table parsed quick-vs player entries.  
> `flags` = table raw command line flags.  
> `t_teamMode` = table team mode values for both sides.  
> `t_numChars` = table team sizes for both sides.  
> `t_matchWins` = table match win settings.  
> `t_params` = table extra `loadStart()` params that will be appended later.  

Called during command line quick-vs setup, before loading starts.

### `main.f_commandLine.player`

> Format: `hook.add("main.f_commandLine.player", name, func)`  
> Callback arguments:  
> `entry` = table current parsed player entry.  
> `flags` = table raw command line flags.  
> `num` = int player number from `-pN`.  
> `player` = int team side, `1` or `2`.  

Called once for every parsed `-pN` quick-vs entry.

Useful for custom command line parameters.

### `main.f_default`

> Format: `hook.add("main.f_default", name, func)`  
> Callback arguments: none  

Called after base mode defaults are initialized.

### `main.t_itemname`

> Format: `hook.add("main.t_itemname", name, func)`  
> Callback arguments:  
> `t` = table current menu table.  
> `item` = int selected item index.  

Called from mode handlers after default mode setup.

Useful for enabling or disabling extra mode-specific behavior from an external module.

### `main.menu.loop`

> Format: `hook.add("main.menu.loop", name, func)`  
> Callback arguments: none  

Called at the start of the shared main menu loop.

### `menu.menu.loop`

> Format: `hook.add("menu.menu.loop", name, func)`  
> Callback arguments: none  

Called at the start of submenu loops in `menu.lua`.

### `options.menu.loop`

> Format: `hook.add("options.menu.loop", name, func)`  
> Callback arguments: none  

Called at the start of submenu loops in `options.lua`.

### `options.default`

> Format: `hook.add("options.default", name, func)`  
> Callback arguments: none  

Called after restoring default option values.

Useful for resetting module-owned config values.

### `options.save`

> Format: `hook.add("options.save", name, func)`  
> Callback arguments:  
> `reload` = bool whether saving this options change will reload the engine.  

Called from `options.f_saveCfg()` after the main config file is saved and before any reload is triggered.

Useful for modules that keep their own config files and should save them only when the user chooses to save settings from the Options menu.

## <a name="hook_list_select_def">Character / select.def hooks</a>

### `main.f_addChar.files`

> Format: `hook.add("main.f_addChar.files", name, func)`  
> Callback arguments:  
> `char` = table character data table being appended to `main.t_selChars`.  

Called after default file path resolution for a newly added playable character.

Useful for resolving custom file fields.

### `main.selectDef.options`

> Format: `hook.add("main.selectDef.options", name, func)`  
> Callback arguments:  
> `t_selOptions` = table parsed select.def options table.  
> `lineCase` = string lowercased version of the parsed line.  

Called for each `[Options]` line in `select.def`.

Useful for parsing custom module parameters.

### `main.selectDef.defaults`

> Format: `hook.add("main.selectDef.defaults", name, func)`  
> Callback arguments:  
> `t_selOptions` = table parsed select.def options table.  

Called after default select.def option values are assigned.

Useful for injecting fallback values when custom options are missing.

## <a name="hook_list_select_screen">Select screen / team menu hooks</a>

### `start.f_selectScreen`

> Format: `hook.add("start.f_selectScreen", name, func)`  
> Callback arguments: none  

Called during the select screen loop.

### `start.f_selectVersus`

> Format: `hook.add("start.f_selectVersus", name, func)`  
> Callback arguments: none  

Called during the versus screen loop.

### `start.f_selectReset`

> Format: `hook.add("start.f_selectReset", name, func)`  
> Callback arguments: none  

Called near the end of `start.f_selectReset()`.

### `start.f_selectReset.side`

> Format: `hook.add("start.f_selectReset.side", name, func)`  
> Callback arguments:  
> `side` = int team side, `1` or `2`.  
> `hardReset` = bool whether this is a full reset.  
> `preserveProgress` = bool whether mode progress is preserved.  
> `state` = table `start.p[side]` table for this side.  

Called once for each side during `start.f_selectReset()`.

Use this to reset module-owned side state.

### `start.f_selectChallenger.resume`

> Format: `hook.add("start.f_selectChallenger.resume", name, func)`  
> Callback arguments:  
> `resume` = table resume snapshot that will be restored.  
> `winnerSide` = int winning side from challenger match.  
> `challengerState` = table challenger select state snapshot.  

Lets modules preserve additional winner-side state when a challenger interrupts arcade flow and control returns to the resumed run.

### `start.f_selectMode.luaPath`

> Format: `hook.add("start.f_selectMode.luaPath", name, func)`  
> Callback arguments:  
> `path` = string current Lua path.  
> Return: string or `nil`  

Called through `hook.runFirst()`.

Return a non-`nil` string to override the mode Lua path.

### `start.selectScreen.teamMenu`

> Format: `hook.add("start.selectScreen.teamMenu", name, func)`  
> Callback arguments:  
> `side` = int team side, `1` or `2`.  
> `list` = table team menu items for this side.  
> `params` = table resolved team menu item names.  
> `itemname_order` = table resolved item render order.  

Called while building the team menu.

Use this to append custom team mode entries.

### `start.f_teamMenu.input`

> Format: `hook.add("start.f_teamMenu.input", name, func)`  
> Callback arguments:  
> `side` = int team side, `1` or `2`.  
> `t` = table team menu items.  
> `t_cmd` = table command owners for this menu.  
> Return: any non-`nil` value if input was handled.  

Called through `hook.runFirst()`.

Use it for custom left/right value handling on new team menu items.

### `start.f_teamMenu.drawItemValue`

> Format: `hook.add("start.f_teamMenu.drawItemValue", name, func)`  
> Callback arguments:  
> `side` = int team side, `1` or `2`.  
> `t` = table team menu items.  
> `i` = int current item index.  
> `x` = number item draw X offset.  
> `y` = number item draw Y offset.  
> `valueCfg` = table team menu value config.  
> Return: any non-`nil` value if drawing was handled.  

Called through `hook.runFirst()`.

Use it to draw icons or custom values for module-defined team menu entries.

### `start.f_teamMenu.confirm`

> Format: `hook.add("start.f_teamMenu.confirm", name, func)`  
> Callback arguments:  
> `side` = int team side, `1` or `2`.  
> `t` = table team menu items.  
> `t_cmd` = table command owners for this menu.  
> Return: table or `nil`.  

Called through `hook.runFirst()`.

Return a table to override default confirmation logic.

Recognized fields are copied into `start.p[side]`. In practice this is usually used for values such as `teamMode`, `numChars`, or module-specific flags.

```lua
hook.add("start.f_teamMenu.confirm", "my_mode", function(side, t, t_cmd)
	local cur = t[start.p[side].teamMenu]
	if cur == nil or cur.itemname ~= "mymode" then
		return nil
	end
	return {
		teamMode = cur.mode,
		numChars = 2,
		mymode = true,
	}
end)
```

## <a name="hook_list_loading">Selection / loading hooks</a>

### `start.f_selectMenu.selected`

> Format: `hook.add("start.f_selectMenu.selected", name, func)`  
> Callback arguments:  
> `side` = int team side, `1` or `2`.  
> `member` = int team member slot.  
> `entry` = table newly selected member entry.  
> `state` = table `start.p[side]`.  
> `player` = int controlling player number.  

Called after a character is confirmed on the select screen.

### `start.launchFight.selected`

> Format: `hook.add("start.launchFight.selected", name, func)`  
> Callback arguments:  
> `side` = int team side, `1` or `2`.  
> `member` = int team member slot.  
> `entry` = table newly inserted member entry.  
> `state` = table `start.p[side]`.  
> `t` = table resolved `launchFight()` data.  

Called after a character is inserted directly through `launchFight()`.

### `start.f_selectLoading.member`

> Format: `hook.add("start.f_selectLoading.member", name, func)`  
> Callback arguments:  
> `v` = table per-member loading table.  

Called for every selected fighter before `loadStart()` params are built.

This is the main hook for pre-match member setup. It can be used to assign maps, life overrides, attack data, module flags and other startup values.

```lua
hook.add("start.f_selectLoading.member", "my_maps", function(v)
	v.maps = v.maps or {}
	v.maps.myflag = 1
	v.maps.bonuslife = 250
end)
```

This produces `loadStart()` params like `p1.1.map.myflag=1`.

### `start.f_lifeRecovery`

> Format: `hook.add("start.f_lifeRecovery", name, func)`  
> Callback arguments:  
> `lifeMax` = number fighter max life.  
> `fighter` = table fighter stats/state table from match results.  
> Return: number or `nil`.  

Called through `hook.runFirst()`.

Return a value to override the default between-match life recovery formula. Return `nil` to keep default behavior.

## <a name="hook_list_post_match">Post-match screen hooks</a>

### `game.result_init`

> Format: `hook.add("game.result_init", name, func)`  
> Callback arguments: none  

Called on the first frame of the win / results screen.

### `game.result`

> Format: `hook.add("game.result", name, func)`  
> Callback arguments: none  

Called from the second frame onward on the win / results screen.

### `game.victory_init`

> Format: `hook.add("game.victory_init", name, func)`  
> Callback arguments: none  

Called on the first frame of the victory screen.

### `game.victory`

> Format: `hook.add("game.victory", name, func)`  
> Callback arguments: none  

Called from the second frame onward on the victory screen.

### `game.continue_init`

> Format: `hook.add("game.continue_init", name, func)`  
> Callback arguments: none  

Called on the first frame of the continue screen.

### `game.continue`

> Format: `hook.add("game.continue", name, func)`  
> Callback arguments: none  

Called from the second frame onward on the continue screen.

### `game.hiscore_init`

> Format: `hook.add("game.hiscore_init", name, func)`  
> Callback arguments: none  

Called on the first frame of the hiscore screen.

### `game.hiscore`

> Format: `hook.add("game.hiscore", name, func)`  
> Callback arguments: none  

Called from the second frame onward on the hiscore screen.

### `game.challenger_init`

> Format: `hook.add("game.challenger_init", name, func)`  
> Callback arguments: none  

Called on the first frame of the challenger screen.

### `game.challenger`

> Format: `hook.add("game.challenger", name, func)`  
> Callback arguments: none  

Called from the second frame onward on the challenger screen.

# <a name="functions">Functions</a>

This section documents Lua helper functions available to scripts, modules and custom mode files.

## <a name="arcs_functions">Arcade / Story helper functions</a>

These pre-made helpers are intended for Arcade Paths and Story Mode arcs.

### <a name="functions_launchfight"></a><a name="arcs_functions_launchfight">`launchFight`</a>

> Format: `launchFight{args}`  
> Required arguments: none  
> Return: bool. Returns `false` if further Lua script execution should stop, based on the function parameters and match result. Otherwise returns `true`.  

Optional arguments:

**continue** = bool
Decides whether the character can continue and rematch after a lost or drawn fight. If `false`, the continue screen is skipped and Lua script execution continues. This can be useful for branching storylines on defeat.

* default arcade path: `true`
* default story mode: `true`

**quickcontinue** = bool
Decides whether the player can select a new character after the continue screen. If `false`, the rematch uses the same character.

* default arcade path: inherited from options
* default story mode: `true`, regardless of options, because the select screen is disabled in Story Mode

**order** = int
Limits random opponent selection to characters with this order.

* default arcade path: `1`
* default story mode: `1`

**p1char** = table
List of characters to assign to p1 team side. Character names or paths should be strings.

* default arcade path: characters chosen on the select screen
* default story mode: previously assigned characters

**p1pal** = int or table  
* If it's an int, it forces a particular palette for the whole teamside 1. 
* If it's a table, it forces a palette for each member in order, i.e. {1, 4, 5, 2}.

**p1numchars** = int
Forces p1 team size.

* default arcade path: team size chosen on the select screen, but not less than `p1char` count
* default story mode: at least `1`, but not less than `p1char` count

**p1numratio** = table
List of ratio settings, from 1 to 4, to assign to p1 team side characters when turns team mode is selected.

Example for three players:

```lua
p1numratio = {1, 1, 2}
```

* default arcade path: same as the ratio chosen on the select screen, not assigned otherwise
* default story mode: not assigned

**p1teammode** = string
Assigns p1 team mode: `single`, `simul`, `tag` or `turns`.

* default arcade path: team mode chosen on the select screen
* default story mode: `single`

**p1rounds** = int
Number of rounds p1 has to lose to be considered defeated.

* default arcade path: inherited from options
* default story mode: inherited from options

**p1orderselect** = bool
Decides whether p1 can switch [team order](Miscellaneous-Info#orderselect).

* default arcade path: `true`
* default story mode: `false`

**p2char** = table
List of characters to assign to p2 team side. Character names or paths should be strings.

* default arcade path: random characters with the selected `order`, up to the team size chosen on the select screen
* default story mode: one random character with the selected `order`

**p2pal** = int or table  
* If it's an int, it forces a particular palette for the whole teamside 2. 
* If it's a table, it forces a palette for each member in order, i.e. {1, 4, 5, 2}.

**p2numchars** = int
Forces p2 team size.

* default arcade path: team size chosen on the select screen, but not less than `p2char` count
* default story mode: at least `1`, but not less than `p2char` count

**p2numratio** = table
List of ratio settings, from 1 to 4, to assign to p2 team side characters when turns team mode is selected.

* default arcade path: follows `arcade.ratiomatches` select.def settings in arcade, if selected; not assigned otherwise
* default story mode: not assigned

**p2teammode** = string
Assigns p2 team mode: `single`, `simul`, `tag` or `turns`.

* default arcade path: team mode chosen on the select screen
* default story mode: `single`

**p2rounds** = int
Number of rounds p2 has to lose to be considered defeated.

* default arcade path: rounds assigned as select.def parameter, or inherited from options
* default story mode: inherited from options

**p2orderselect** = bool
Decides whether p2 can switch [team order](Miscellaneous-Info#orderselect).

* default arcade path: `true`
* default story mode: `false`

**exclude** = table
List of characters to exclude from random selection for this match. Characters are still available in the next `launchFight` call. Characters already fought in the current arcade run with this character are automatically excluded.

* default arcade path: empty list
* default story mode: empty list

**music** = table
Music used at the start of the round. The path string can optionally be followed by volume, loopstart and loopend values.

```lua
music = {"sound/theme.mp3", 100, 0, 0}
```

* default arcade path: music assigned as select.def parameter, or default stage music
* default story mode: default stage music

**round<roundno>.music** = table
Music used at the start of a specific round. The `<roundno>` part of the key decides the round.

```lua
["round2.music"] = {"sound/round2.mp3", 100, 0, 0}
```

* default arcade path: music assigned as select.def parameter, or default stage music
* default story mode: default stage music

**final.music** = table
Music used at the start of the final round.

* default arcade path: music assigned as select.def parameter, or default stage music
* default story mode: default stage music

**life.music** = table
Music used when the player's controlled character has low life during a deciding round. Further adjustments are available through the stage DEF file.

* default arcade path: music assigned as select.def parameter, or default stage music
* default story mode: default stage music

**victory.music** = table
Music that starts after the character scores the final round K.O. and continues through the victory screen.

* default arcade path: music assigned as select.def parameter, or default stage music
* default story mode: default stage music

**stage** = string
Path to the stage used in this match.

* default arcade path: stage assigned as select.def parameter, or randomized
* default story mode: randomized

**ai** = float
Forces AI level from 1 to 8, regardless of difficulty and AI ramping settings.

* default arcade path: AI assigned as select.def parameter, or value following AI ramping settings
* default story mode: inherited from options

**time** = int
Overrides round time, in seconds, for this match.

* default arcade path: inherited from options, adjusted by tag team size
* default story mode: inherited from options, adjusted by tag team size

**vsscreen** = bool
Decides whether the versus screen is shown before the fight.

* default arcade path: `true`
* default story mode: `false`

**victoryscreen** = bool
Decides whether the victory screen is shown after the fight.

* default arcade path: `true`
* default story mode: `false`

**lua** = string
Lua code executed each frame during the match. For example, this can call a custom function that stores match data gathered through Lua trigger functions.

Example:

```lua
launchFight{
	p2char = {"Juni", "Juli"},
	p2numchars = 2,
	p2teammode = "simul",
	p2rounds = 1,
	time = 60,
	stage = "stages/dolls.def",
	["victory.music"] = {"sound/kfm.mp3", 100, 0, 0}
}
```

### <a name="arcs_functions_launchstoryboard">`launchStoryboard`</a>

> Format: `launchStoryboard(path)`  
> Required arguments: path of the storyboard to execute.  
> Return: bool. Returns `false` if the storyboard does not exist, otherwise `true`.  

Example:

```lua
launchStoryboard('chars/kfm/intro.def')
```

## <a name="functions_embedded">Embedded functions</a>

<!-- AUTOGEN:START embedded-functions -->
Below are the documented embedded Lua functions exposed by the engine.

`*` marks an optional parameter.

### `addChar`

```lua
addChar(defpath, params)
```

Add a character definition to the select screen.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `defpath` | `string` | Path to the character `.def` file (relative to `chars/` or absolute). |
| 2 | `params`* | `string` | Optional. Optional comma-separated parameter string (from select.def) |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `success` | `boolean` | `true` if the character was added successfully, `false` otherwise. |

### `addHotkey`

```lua
addHotkey(key, ctrl, alt, shift, allowDuringPause, debugOnly, script)
```

Register a global keyboard shortcut that runs Lua code.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `key` | `string` | Key name as used by the engine (for example `"F1"`, `"C"`, etc.). |
| 2 | `ctrl`* | `boolean` | Optional. Default: `false`. If `true`, the Ctrl key must be held. |
| 3 | `alt`* | `boolean` | Optional. Default: `false`. If `true`, the Alt key must be held. |
| 4 | `shift`* | `boolean` | Optional. Default: `false`. If `true`, the Shift key must be held. |
| 5 | `allowDuringPause`* | `boolean` | Optional. Default: `false`. If `true`, the hotkey also works while the game is paused. |
| 6 | `debugOnly`* | `boolean` | Optional. Default: `false`. If `true`, the hotkey is treated as a debug key and only works when debug input is allowed. |
| 7 | `script` | `string` | Lua code to execute when the shortcut is pressed. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `success` | `boolean` | `true` if the shortcut was registered, `false` if the key name is invalid. |

### `addStage`

```lua
addStage(defpath, params)
```

Add a stage definition to the select screen.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `defpath` | `string` | Path to the stage `.def` file (relative to `stages/` or absolute). |
| 2 | `params`* | `string` | Optional. Optional comma-separated parameter string (from select.def) |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `success` | `boolean` | `true` if the stage was added successfully, `false` otherwise. |

### `animAddPos`

```lua
animAddPos(anim, dx, dy)
```

Add an offset to an animation's current position.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `dx` | `float32` | Offset to add on the X axis. |
| 3 | `dy` | `float32` | Offset to add on the Y axis. |

### `animApplyVel`

```lua
animApplyVel(target, source)
```

Copy velocity parameters from one animation to another.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `target` | `Anim` | Target animation userdata to modify. |
| 2 | `source` | `Anim` | Source animation userdata whose velocity/accel settings are copied. |

### `animCopy`

```lua
animCopy(anim)
```

Create a copy of an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `copy` | `Anim\|nil` | New `Anim` userdata containing a copy of `anim`, or `nil` if `anim` is `nil`. |

### `animDebug`

```lua
animDebug(anim, prefix)
```

Print debug information about an animation to the console.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `prefix`* | `string` | Optional. Optional text prefix printed before the debug info. |

### `animDraw`

```lua
animDraw(anim, layer)
```

Queue drawing of an animation on a render layer.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `layer`* | `int16` | Optional. Render layer index; if omitted, the animation's own `layerno` is used. |

### `animGetLength`

```lua
animGetLength(anim)
```

Get timing information for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `length` | `int32` | Effective animation length in ticks (as returned by `Anim.GetLength()`). |
| `totaltime` | `int32` | Raw `totaltime` field from the underlying `Animation`. |

### `animGetPreloadedCharData`

```lua
animGetPreloadedCharData(charRef, group, number, keepLoop)
```

Get a preloaded character animation by sprite group/number.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `charRef` | `int` | 0-based character index in the select list. |
| 2 | `group` | `int32` | Sprite group number. |
| 3 | `number` | `int32` | Sprite number. |
| 4 | `keepLoop`* | `boolean` | Optional. Default: `true`. If `true`, keep the original loop timing. If `false` and the animation's `totaltime` equals `looptime`, convert it to an infinite loop (`totaltime = -1`, `looptime = 0`). |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `anim` | `Anim\|nil` | A new `Anim` userdata wrapping the preloaded animation, or `nil` if no matching animation exists. |

### `animGetPreloadedStageData`

```lua
animGetPreloadedStageData(stageRef, group, number, keepLoop)
```

Get a preloaded stage animation by sprite group/number.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `stageRef` | `int` | Stage reference used by the select system. Positive values are 1-based stage slots. `0` is the random-stage sentinel. |
| 2 | `group` | `int32` | Sprite group number. |
| 3 | `number` | `int32` | Sprite number. |
| 4 | `keepLoop`* | `boolean` | Optional. Default: `true`. If `true`, keep the original loop timing. If `false` and the animation's `totaltime` equals `looptime`, convert it to an infinite loop (`totaltime = -1`, `looptime = 0`). |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `anim` | `Anim\|nil` | A new `Anim` userdata wrapping the preloaded animation, or `nil` if no matching animation exists. |

### `animGetSpriteInfo`

```lua
animGetSpriteInfo(anim, group, number)
```

Get information about a sprite used by an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `group`* | `uint16` | Optional. Explicit sprite group number. |
| 3 | `number`* | `uint16` | Optional. Explicit sprite number. These are only used when both `group` and `number` are provided; otherwise the animation's current sprite is used. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `info` | `table\|nil` | Table with:<br>- `Group` (uint16) sprite group number<br>- `Number` (uint16) sprite number<br>- `Size` (uint16[2]) `{width, height}`<br>- `Offset` (int16[2]) `{x, y}`<br>- `palidx` (int) palette index used for this sprite,<br>or `nil` if no sprite is available. |

### `animLoadPalettes`

```lua
animLoadPalettes(anim, param)
```

Load palettes for an animation's underlying sprite file, if palette usage is enabled.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `param` | `int` | Palette parameter passed to `loadActPalettes` (engine-specific semantics). |

### `animNew`

```lua
animNew(sff, actOrAnim)
```

Create a new animation from a sprite file and action definition.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `sff`* | `Sff` | Optional. Sprite file userdata to use. If omitted or invalid, a new empty SFF is created internally. |
| 2 | `actOrAnim` | `string\|Animation` | Either:<br>- a string definition of the animation to load, or<br>- an `Animation` userdata (for example from `motif.AnimTable[...]`). |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `anim` | `Anim` | Newly created animation userdata. |

### `animPaletteGet`

```lua
animPaletteGet(anim, paletteId)
```

Get a palette from an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `paletteId` | `int` | 1-based palette index. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `palette` | `table` | Array-like table where each entry is `{r, g, b, a}`. |

### `animPaletteSet`

```lua
animPaletteSet(anim, paletteId, palette)
```

Set colors in an animation palette.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `paletteId` | `int` | 1-based palette index. |
| 3 | `palette` | `table` | Array-like table where each entry is `{r, g, b, a}`. |

### `animPrepare`

```lua
animPrepare(anim, charRef)
```

Prepare an animation so that each character can apply its own palette.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Source animation userdata. |
| 2 | `charRef` | `int32` | 0-based character index in the select list. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `preparedAnim` | `Anim` | Either a copy with adjusted palette data (when palette usage is enabled) or the original `anim` when palette handling is disabled. |

### `animReset`

```lua
animReset(anim, parts)
```

Reset an animation to its initial state, fully or partially.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `parts`* | `table` | Optional.<br>If omitted or `nil`, resets everything. If provided, must be an array-like table of strings, each one of:<br>- `"anim"`: reset the underlying `Animation`<br>- `"pos"`: reset position to the initial offset<br>- `"scale"`: reset scale to the initial values<br>- `"window"`: reset the clipping window to the initial value<br>- `"velocity"`: reset velocity to the initial value<br>- `"palfx"`: clear PalFX |

### `animSetAccel`

```lua
animSetAccel(anim, ax, ay)
```

Set gravity/acceleration applied to an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `ax` | `float32` | Horizontal acceleration. |
| 3 | `ay` | `float32` | Vertical acceleration. |

### `animSetAlpha`

```lua
animSetAlpha(anim, src, dst)
```

Set alpha blending for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `src` | `int16` | Source alpha factor (0–256, engine-specific). |
| 3 | `dst` | `int16` | Destination alpha factor (0–256, engine-specific). |

### `animSetAngle`

```lua
animSetAngle(anim, angle)
```

Set rotation angle for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `angle` | `float32` | Rotation angle. |

### `animSetAnimation`

```lua
animSetAnimation(anim, actOrAnim)
```

Replace an animation's underlying `Animation` data.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata to modify. |
| 2 | `actOrAnim` | `string\|Animation` | Either:<br>- a string definition of the animation to load, or<br>- an `Animation` userdata (for example from `motif.AnimTable[...]`). |

### `animSetColorKey`

```lua
animSetColorKey(anim, index)
```

Set the color key (transparent index) used by an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `index` | `int16` | Palette index used as the transparency key. |

### `animSetColorPalette`

```lua
animSetColorPalette(anim, paletteId)
```

Change the active palette mapping for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `paletteId` | `int` | 1-based palette identifier to map to. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `anim` | `Anim` | The same animation userdata (for chaining). |

### `animSetFacing`

```lua
animSetFacing(anim, facing)
```

Set the facing (horizontal flip) of an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `facing` | `float32` | Facing multiplier, usually `1` or `-1`. |

### `animSetFocalLength`

```lua
animSetFocalLength(anim, fLength)
```

Set focal length used for perspective projection on an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `fLength` | `float32` | Focal length value. |

### `animSetFriction`

```lua
animSetFriction(anim, fx, fy)
```

Set friction applied to an animation's velocity.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `fx` | `float32` | Horizontal friction. |
| 3 | `fy` | `float32` | Vertical friction. |

### `animSetLayerno`

```lua
animSetLayerno(anim, layer)
```

Set the render layer used by an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `layer` | `int16` | Layer index to draw this animation on. |

### `animSetLocalcoord`

```lua
animSetLocalcoord(anim, width, height)
```

Set the local coordinate system for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `width` | `float32` | Local coordinate width. |
| 3 | `height` | `float32` | Local coordinate height. |

### `animSetMaxDist`

```lua
animSetMaxDist(anim, maxX, maxY)
```

Set maximum drawing distance (clipping bounds) for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `maxX` | `float32` | Maximum horizontal distance. |
| 3 | `maxY` | `float32` | Maximum vertical distance. |

### `animSetPalFX`

```lua
animSetPalFX(anim, palfx)
```

Configure palette effects for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `palfx` | `table` | Table of palette effect fields:<br>- `time` (int32): duration in ticks<br>- `add` (table int32[3]): additive RGB components<br>- `mul` (table int32[3]): multiplicative RGB components<br>- `sinadd` (table int32[4]): sinusoidal add `{r, g, b, period}`; negative period flips sign<br>- `sinmul` (table int32[4]): sinusoidal mul `{r, g, b, period}`; negative period flips sign<br>- `sincolor` (table int32[2]): sinusoidal color shift `{amount, period}`<br>- `sinhue` (table int32[2]): sinusoidal hue shift `{amount, period}`<br>- `invertall` (int32): set to `1` to invert all colors<br>- `invertblend` (int32): invert blend mode index<br>- `color` (float32): color saturation factor (`0–256` scaled to `0.0–1.0`)<br>- `hue` (float32): hue adjustment factor (`0–256` scaled to `0.0–0.5`) |

### `animSetPos`

```lua
animSetPos(anim, x, y)
```

Set animation position, optionally overriding only one axis.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `x`* | `float32` | Optional. New X position; if omitted, initial X offset is used. |
| 3 | `y`* | `float32` | Optional. New Y position; if omitted, initial Y offset is used. |

### `animSetProjection`

```lua
animSetProjection(anim, projection)
```

Set projection mode for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `projection` | `int32\|string` | Projection mode. Can be a numeric engine constant, or one of:<br>- `"orthographic"`<br>- `"perspective"`<br>- `"perspective2"` |

### `animSetScale`

```lua
animSetScale(anim, sx, sy)
```

Set the scale of an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `sx` | `float32` | Horizontal scale factor. |
| 3 | `sy` | `float32` | Vertical scale factor. |

### `animSetTile`

```lua
animSetTile(anim, tileX, tileY, spacingX, spacingY)
```

Configure tiling for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `tileX` | `boolean` | If `true`, tile horizontally. |
| 3 | `tileY` | `boolean` | If `true`, tile vertically. |
| 4 | `spacingX`* | `int32` | Optional. Horizontal tile spacing in pixels. |
| 5 | `spacingY`* | `int32` | Optional. Vertical tile spacing in pixels (defaults to `spacingX` if omitted). |

### `animSetVelocity`

```lua
animSetVelocity(anim, vx, vy)
```

Set the base velocity of an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `vx` | `float32` | Horizontal velocity. |
| 3 | `vy` | `float32` | Vertical velocity. |

### `animSetWindow`

```lua
animSetWindow(anim, x1, y1, x2, y2)
```

Set the clipping window for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `x1` | `float32` | Left coordinate of the clipping window. |
| 3 | `y1` | `float32` | Top coordinate of the clipping window. |
| 4 | `x2` | `float32` | Right coordinate of the clipping window. |
| 5 | `y2` | `float32` | Bottom coordinate of the clipping window. |

### `animSetXAngle`

```lua
animSetXAngle(anim, xangle)
```

Set rotation angle around the X axis for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `xangle` | `float32` | X-axis rotation angle (engine-specific units, usually degrees). |

### `animSetXShear`

```lua
animSetXShear(anim, shear)
```

Set the X shear factor applied when drawing an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `shear` | `float32` | X shear factor. |

### `animSetYAngle`

```lua
animSetYAngle(anim, yangle)
```

Set rotation angle around the Y axis for an animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `yangle` | `float32` | Y-axis rotation angle. |

### `animUpdate`

```lua
animUpdate(anim, force)
```

Advance an animation by one tick. By default, only the first call per frame advances the animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `anim` | `Anim` | Animation userdata. |
| 2 | `force`* | `boolean` | Optional. Default: `false`. If `true`, advance the animation even if it was already updated this frame. |

### `batchDraw`

```lua
batchDraw(batch)
```

Queue drawing of many animations in one call.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `batch` | `table` | Array-like table of draw items. Each item is a table:<br>- `anim` (Anim) animation userdata<br>- `x` (float32) X position<br>- `y` (float32) Y position<br>- `facing` (float32) facing multiplier (usually `1` or `-1`)<br>- `scale` (table float32[2], optional) `{sx, sy}` scale override<br>- `xshear` (float32, optional) X shear override<br>- `angle` (float32, optional) rotation angle override<br>- `xangle` (float32, optional) X-axis rotation override<br>- `yangle` (float32, optional) Y-axis rotation override<br>- `projection` (int32\|string, optional) projection override; accepts a numeric<br>engine constant or `"orthographic"`, `"perspective"`, `"perspective2"`<br>- `focallength` (float32, optional) focal length override<br>- `layerno` (int16, optional) layer override; defaults to `anim.layerno` |

### `bgDebug`

```lua
bgDebug(bg, prefix)
```

Print debug information about a background definition.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `bg` | `BGDef` | Background definition userdata. |
| 2 | `prefix`* | `string` | Optional. Optional text prefix printed before the debug info. |

### `bgDraw`

```lua
bgDraw(bg, layer, x, y, scale)
```

Queue drawing of a background definition.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `bg` | `BGDef` | Background definition userdata. |
| 2 | `layer`* | `int32` | Optional. Default: `0`. `0` for back layer, `1` for front layer. |
| 3 | `x`* | `float32` | Optional. Default: `0`. Global X offset applied when drawing. |
| 4 | `y`* | `float32` | Optional. Default: `0`. Global Y offset applied when drawing. |
| 5 | `scale`* | `float32` | Optional. Default: `1.0`. Uniform global scale multiplier. |

### `bgNew`

```lua
bgNew(sff, defPath, section, model, defaultLayer)
```

Load a background definition from a sprite file and configuration.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `sff` | `Sff` | Sprite file userdata used by the background. |
| 2 | `defPath` | `string` | Path used for resolving background resources. |
| 3 | `section` | `string` | Name or identifier of the background definition to load. |
| 4 | `model`* | `Model` | Optional. Stage/model userdata associated with this background. |
| 5 | `defaultLayer`* | `int32` | Optional. Default: `0`. Default layer index assigned to the background elements. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `bg` | `BGDef` | Loaded background definition userdata. |

### `bgReset`

```lua
bgReset(bg)
```

Reset a background definition to its initial state.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `bg` | `BGDef` | Background definition userdata. |

### `changeAnim`

```lua
changeAnim(animNo, elem, ffx)
```

[redirectable] Change the character's current animation.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `animNo` | `int32` | Animation number to switch to. |
| 2 | `elem`* | `int32` | Optional. Optional animation element index to start from. |
| 3 | `ffx`* | `boolean` | Optional. Default: `false`. If `true`, use the `"f"` animation prefix (FFX animation). |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `success` | `boolean` | `true` if the animation exists and was changed, `false` otherwise. |

### `changeState`

```lua
changeState(stateNo)
```

[redirectable] Change the character's current state or disable it.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `stateNo` | `int32` | State number to switch to, or `-1` to disable the character. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `success` | `boolean` | `true` if an existing state was entered, `false` otherwise. Passing `-1` disables the character and returns `false`. |

### `clear`

```lua
clear()
```

Clear all characters' clipboard text buffers.

### `clearAllSound`

```lua
clearAllSound()
```

Stop all currently playing sounds.

### `clearColor`

```lua
clearColor(r, g, b, alpha)
```

Fill the screen with a solid color (with optional alpha).

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `r` | `int32` | Red component (0–255). |
| 2 | `g` | `int32` | Green component (0–255). |
| 3 | `b` | `int32` | Blue component (0–255). |
| 4 | `alpha`* | `int32` | Optional. Default: `255`. Alpha value (0–255); `255` is fully opaque. |

### `clearConsole`

```lua
clearConsole()
```

Clear text printed to the in-engine console.

### `clearSelected`

```lua
clearSelected()
```

Clear all current select-screen choices (characters, stages, music, game params).

### `commandAdd`

```lua
commandAdd(name, command, time, bufferTime, bufferHitpause, bufferPauseend, stepTime)
```

Register a UI command definition.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `name` | `string` | Command name (used in triggers). |
| 2 | `command` | `string` | Command string in engine input notation. |
| 3 | `time`* | `int32` | Optional. Command input time window in ticks. |
| 4 | `bufferTime`* | `int32` | Optional. Buffer time in ticks. |
| 5 | `bufferHitpause`* | `boolean` | Optional. Whether inputs are buffered during hitpause. |
| 6 | `bufferPauseend`* | `boolean` | Optional. Whether inputs are buffered during pause end. |
| 7 | `stepTime`* | `int32` | Optional. Step granularity in ticks. |

### `commandBufReset`

```lua
commandBufReset(playerNo)
```

Reset command input buffers.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `playerNo`* | `int` | Optional. 1-based player/controller index. If omitted, all command buffers are reset. |

### `commandDebug`

```lua
commandDebug(playerNo, prefix)
```

Print debug information about a command list.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `playerNo` | `int` | 1-based player/controller index. |
| 2 | `prefix`* | `string` | Optional. Optional text prefix printed before the debug info. |

### `commandGetState`

```lua
commandGetState(playerNo, name)
```

Query the current state of a named command.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `playerNo` | `int` | 1-based player/controller index. |
| 2 | `name` | `string` | Command name to query. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `active` | `boolean` | `true` if the command is currently active, `false` otherwise. |

### `computeRanking`

```lua
computeRanking(mode)
```

Compute and store ranking data for a mode, returning whether it was cleared.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `mode` | `string` | Ranking mode identifier. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `cleared` | `boolean` | `true` if the run cleared the mode's requirements. |
| `place` | `int32` | Ranking position (1-based), or `0` if unranked / skipped / not visible. |

### `connected`

```lua
connected()
```

Check if the main menu network connection is established.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `connected` | `boolean` | `true` if connected to a netplay peer, `false` otherwise. |

### `continued`

```lua
continued()
```

Check whether the current run used a continue.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `continued` | `boolean` | `true` if the continue flag is set. |

### `endMatch`

```lua
endMatch()
```

Signal that the current match should end (using fight screen fade-out settings).

### `enterNetPlay`

```lua
enterNetPlay(host)
```

Enter netplay as client or host.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `host` | `string` | Host address (IP or hostname). If an empty string, listen for an incoming connection; otherwise connect to the given host. |

### `enterReplay`

```lua
enterReplay(path)
```

Enter replay playback mode from a replay file.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `path` | `string` | Path to the replay file. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `success` | `boolean` | `true` if the replay file was opened and playback started, `false` otherwise. |

### `esc`

```lua
esc(value)
```

Get or set the global escape flag.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `value`* | `boolean` | Optional. If provided, sets the escape flag. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `esc` | `boolean` | Current value of the escape flag. |

### `exitNetPlay`

```lua
exitNetPlay()
```

Exit netplay mode and close any active netplay connection.

### `exitReplay`

```lua
exitReplay()
```

Exit replay mode and restore normal video settings.

### `fadeNew`

```lua
fadeNew(params)
```

Instantiates a Fade userdata for use with fadeInInit and fadeOutInit.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `params`* | `table` | Optional.<br>Parameter table (keys are case-insenstive) :<br>- `time` (int, opt) Duration in ticks<br>- `color` (int[3], opt) RGB values (0–255)<br>- `anim` (*Anim, opt) Animation to play in the fade. If nil or invalid, will play no animation<br>- `sound` (int[2], opt) Sound to play in the fade. Uses motif SND. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `fade` | `Fade` | Fade userdata. |

### `fadeActive`

```lua
fadeActive()
```

Check whether any global motif fade is active.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `active` | `boolean` | `true` if fade-in or fade-out is currently running. |

### `fadeInInit`

```lua
fadeInInit(fade)
```

Initialize a `Fade` object using motif fade-in settings.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `fade` | `Fade` | Fade userdata to initialize. |

### `fadeOutInit`

```lua
fadeOutInit(fade)
```

Initialize a `Fade` object using motif fade-out settings.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `fade` | `Fade` | Fade userdata to initialize. |

### `fadeSkip`

```lua
fadeSkip()
```

Immediately stop any running global motif fade.

### `fileExists`

```lua
fileExists(path)
```

Test whether a file exists, after engine path resolution.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `path` | `string` | File path to test (relative or absolute). |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `exists` | `boolean` | `true` if the file exists, `false` otherwise. |

### `findEntityByName`

```lua
findEntityByName(text)
```

Find the next entity whose name contains the given text.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `text` | `string` | Case-insensitive substring to search in entity names. |

### `findEntityByPlayerId`

```lua
findEntityByPlayerId(playerId)
```

Find the next entity with the given player ID.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `playerId` | `int32` | Target entity `id` to search for. |

### `findHelperById`

```lua
findHelperById(helperId)
```

Find the next helper with the given helper ID.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `helperId` | `int32` | Target helper `helperId` to search for. |

### `fontGetDef`

```lua
fontGetDef(font)
```

Get basic font definition information.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `font` | `Fnt` | Font userdata. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `def` | `table` | A table:<br>- `Type` (string) font type identifier<br>- `Size` (uint16[2]) `{width, height}` in pixels<br>- `Spacing` (int32[2]) `{x, y}` spacing in pixels<br>- `offset` (int32[2]) `{x, y}` base drawing offset |

### `fontNew`

```lua
fontNew(filename, height)
```

Load a font from file.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `filename` | `string` | Font filename (searched in `font/`, motif folder, current dir, `data/`). |
| 2 | `height`* | `int32` | Optional. Default: `-1`. Override font height; `-1` uses the height defined in the font file. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `font` | `Fnt` | Loaded font userdata. If loading fails, a fallback font is returned. |

### `frameStep`

```lua
frameStep()
```

Enable single-frame stepping mode.

### `game`

```lua
game()
```

Execute a full match using the current configuration.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `winSide` | `int32` | Winning side index (`1` or `2`), `0` for draw, `-1` if the game was ended externally. |
| `controllerNo` | `int` | 1-based controller index of the challenger player interrupting `arcade` mode. |

### `gameRunning`

```lua
gameRunning()
```

Check whether a match is currently running.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `running` | `boolean` | `true` if gameplay is currently active. |

### `getAnimElemCount`

```lua
getAnimElemCount()
```

[redirectable] Get the character's number of elements in the animation.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `count` | `int` | Number of animation elements. |

### `getAnimTimeSum`

```lua
getAnimTimeSum()
```

[redirectable] Get the character's current accumulated time of the animation.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `timeSum` | `int32` | Current animation time value. |

### `getCharAttachedInfo`

```lua
getCharAttachedInfo(def)
```

Resolve and read basic information from a character definition file.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `def` | `string` | Character identifier or `.def` path. If no extension is given, `"chars/<def>/<def>.def"` is assumed. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `info` | `table\|nil` | A table:<br>- `name` (string) character display name (or internal name as fallback)<br>- `def` (string) resolved `.def` path<br>- `sound` (string) sound file path from the `[Files]` section,<br>or `nil` if the `.def` file cannot be resolved. |

### `getCharFileName`

```lua
getCharFileName(charRef)
```

Get the definition file path for a character slot.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `charRef` | `int` | 0-based character index in the select list. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `defPath` | `string` | Resolved `.def` path for this slot. |

### `getCharInfo`

```lua
getCharInfo(charRef)
```

Get detailed information about a character slot.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `charRef` | `int` | 0-based character index in the select list. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `info` | `table` | A table:<br>- `name` (string) character display name<br>- `author` (string) author string<br>- `def` (string) definition file path<br>- `sound` (string) sound file path<br>- `intro` (string) intro def path<br>- `ending` (string) ending def path<br>- `arcadepath` (string) arcade path override<br>- `localcoord` (float32) base localcoord width<br>- `portraitscale` (float32) scale applied to portraits<br>- `cns_scale` (float32[]) scale values from the CNS configuration<br>- `pal` (int32[]) available palette numbers (at least `{1}`)<br>- `pal_defaults` (int32[]) default palette numbers (at least `{1}`)<br>- `pal_keymap` (table) palette key remaps, indexed by original palette slot |

### `getCharName`

```lua
getCharName(charRef)
```

Get the display name of a character slot.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `charRef` | `int` | 0-based character index in the select list. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `name` | `string` | Character display name. |

### `getCharPreloadStatus`

```lua
getCharPreloadStatus(charRef)
```

Query the background preload state of a character slot.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `charRef` | `int` | 0-based character index in the select list. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `state` | `string` | Preload state: `"idle"`, `"queued"`, `"loading"`, or `"ready"`. |

### `getCharRandomPalette`

```lua
getCharRandomPalette(charRef)
```

Get a random valid palette number for a character slot.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `charRef` | `int` | 0-based character index in the select list. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `palNo` | `int32` | Palette number; defaults to `1` if the character has no palette list. |

### `getCharSelectParams`

```lua
getCharSelectParams(charRef)
```

Get parsed select parameters for a character entry.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `charRef` | `int` | 0-based character index in the select list. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `params` | `table` | Lua table created from the comma-separated `params` string passed to `addChar()`. |

### `getClipboardString`

```lua
getClipboardString()
```

Get the current system clipboard string.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `text` | `string` | Clipboard contents, or an empty string if unavailable. |

### `getCommandLineFlags`

```lua
getCommandLineFlags()
```

Get all command-line flags passed to the engine.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `flags` | `table` | A table mapping raw flag keys to their values (string). |

### `getCommandLineValue`

```lua
getCommandLineValue(flagName)
```

Get the value of a specific command-line flag.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `flagName` | `string` | Exact flag key as stored in `sys.cmdFlags` |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `value` | `string\|nil` | Value associated with the flag, or `nil` if the flag is not present. |

### `getConsecutiveWins`

```lua
getConsecutiveWins(teamSide)
```

Get the number of consecutive wins for a team.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `teamSide` | `int` | Team side (`1` or `2`). |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `wins` | `int32` | Number of consecutive wins for the given side. |

### `getCredits`

```lua
getCredits()
```

Get the current credit count.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `credits` | `int32` | Current number of credits. |

### `getDirectoryFiles`

```lua
getDirectoryFiles(rootPath)
```

Recursively list all paths under a directory.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `rootPath` | `string` | Starting directory path. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `paths` | `table` | Array-like table of visited paths (files and directories). |

### `getFrameCount`

```lua
getFrameCount()
```

Get the global frame counter value.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `frameCount` | `int32` | Number of frames elapsed since engine start. |

### `getGameFPS`

```lua
getGameFPS()
```

Get the current measured gameplay FPS.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `fps` | `float32` | Current gameplay frames per second. |

### `getGameParams`

```lua
getGameParams()
```

Get the current game parameter table.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `params` | `table` | Current game parameters as a Lua table. |

### `getGameSpeed`

```lua
getGameSpeed()
```

Get the current game logic speed as a percentage.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `speedPercent` | `int32` | Integer game logic speed relative to `60 FPS` (`100` = normal speed). |

### `getGameStats`

```lua
getGameStats()
```

Read accumulated game statistics.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `stats` | `table` | Statistics log object as a Lua table. |

### `getGameStatsJson`

```lua
getGameStatsJson()
```

Get a JSON snapshot of accumulated game statistics.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `json` | `string` | JSON-encoded snapshot containing stats and related flags. |

### `getInput`

```lua
getInput(players, ...)
```

Check raw UI input for one or more players.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `players` | `number\|table` | 1-based player/controller index, or an array-like table of indexes. Passing `-1` checks all players. |
| 2 | `...` | `string\|table` | One or more key/button tokens, or array-like tables of tokens. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `pressed` | `boolean` | `true` if any provided token set is active for any selected player. |

### `getInputTime`

```lua
getInputTime(players, ...)
```

Get the hold time of a raw input token for one or more players.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `players` | `number\|table` | 1-based player/controller index, or an array-like table of indexes. Passing `-1` checks all players. |
| 2 | `...` | `string\|table` | One or more key/button tokens, or array-like tables of tokens. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `time` | `int32` | Hold time in ticks for the first active token found, or `0` if none are active. |

### `getJoystickGUID`

```lua
getJoystickGUID(index)
```

Get a joystick's GUID string.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `index` | `int` | Joystick index (0-based). |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `guid` | `string` | GUID string for the joystick, or an empty string if invalid. |

### `getJoystickKey`

```lua
getJoystickKey(controllerIdx)
```

Poll joystick input and return the corresponding key string.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `controllerIdx`* | `int` | Optional. Joystick index (0-based). If omitted, listens on any joystick. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `keyName` | `string` | Engine key string for the pressed control (empty string if none). |
| `joystickIndex` | `int` | 1-based joystick index that generated the input; `-1` if no input. |

### `getJoystickName`

```lua
getJoystickName(index)
```

Get a joystick's display name.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `index` | `int` | Joystick index (0-based). |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `name` | `string` | Human-readable joystick name, or an empty string if invalid. |

### `getJoystickPresent`

```lua
getJoystickPresent(index)
```

Check whether a joystick is present.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `index` | `int` | Joystick index (0-based). |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `present` | `boolean` | `true` if the joystick is connected, `false` otherwise. |

### `getKey`

```lua
getKey(key)
```

Query or compare the last pressed key.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `key`* | `string` | Optional. If omitted, the last key name is returned. If a non-empty string is given, returns whether it matches the last key. If an empty string is given, always returns `false`. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `result` | `string\|boolean` | Last key name when called without arguments, or a boolean match result when `key` is provided. |

### `getKeyText`

```lua
getKeyText()
```

Get the last input text associated with the current key event.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `text` | `string` | If the last key was Insert, returns the clipboard contents, otherwise returns the textual representation of the last key press. Empty string if none. |

### `getLastInputController`

```lua
getLastInputController()
```

Get the last controller that produced UI input.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `playerNo` | `int` | 1-based player/controller index, or `-1` if unavailable. |

### `getMatchTime`

```lua
getMatchTime()
```

Get the accumulated match time from completed rounds.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `time` | `int32` | Total round time accumulated in ticks. |

### `getMovelist`

```lua
getMovelist()
```

[redirectable] Get the character's movelist text.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `movelist` | `string` | Movelist text. |

### `getRandom`

```lua
getRandom()
```

Return a 32-bit random number, updating the global seed.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `value` | `int32` | Random value (1 to 2147483646 inclusive). |

### `getRemapInput`

```lua
getRemapInput(playerNo)
```

Get the input remap target for a player.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `playerNo` | `int` | 1-based player/controller index. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `mappedPlayerNo` | `int` | 1-based remapped player/controller index. |

### `getRoundTime`

```lua
getRoundTime()
```

Get the configured round time limit.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `time` | `int32` | Round time limit in ticks (or special values as configured). |

### `getRuntimeOS`

```lua
getRuntimeOS()
```

Get the current runtime operating system identifier.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `os` | `string` | Runtime OS name as reported by Go (for example `"windows"`, `"linux"`). |

### `getSelectNo`

```lua
getSelectNo()
```

[redirectable] Get the character's select slot index.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `selectNo` | `int` | Current select slot index. |

### `getSessionWarning`

```lua
getSessionWarning()
```

Pop the current session warning message.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `warning` | `string` | Current session warning message, or an empty string if none. |

### `getStageInfo`

```lua
getStageInfo(stageRef)
```

Get information about a stage slot.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `stageRef` | `int` | Stage reference used by the select system. Positive values are 1-based stage slots. `0` is the random-stage sentinel. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `info` | `table\|nil` | A table:<br>- `name` (string) stage display name<br>- `def` (string) definition file path<br>- `localcoord` (float32) base localcoord width<br>- `portraitscale` (float32) scale applied to stage portraits<br>- `attachedchardef` (string[]) list of attached character `.def` paths |

### `getStageNo`

```lua
getStageNo()
```

Get the currently selected stage slot index.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `stageRef` | `int` | Currently selected stage reference as stored by the select system: `0` means random stage, `-1` means no stage selected, positive values are 1-based stage slots. |

### `getStagePreloadStatus`

```lua
getStagePreloadStatus(stageRef)
```

Query the background preload state of a stage slot.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `stageRef` | `int` | Stage index as used by the select system. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `state` | `string` | Preload state: `"idle"`, `"queued"`, `"loading"`, or `"ready"`. |

### `getStageSelectParams`

```lua
getStageSelectParams(stageRef)
```

Get parsed select parameters for a stage entry.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `stageRef` | `int` | Stage index as used by the select system. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `params` | `table` | Lua table created from the comma-separated `params` string passed to `addStage()`. |

### `getStateOwnerId`

```lua
getStateOwnerId()
```

[redirectable] Get the character's player ID.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `playerId` | `int32` | Player ID of the current state owner. |

### `getStateOwnerName`

```lua
getStateOwnerName()
```

[redirectable] Get the character's name of the current state owner.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `name` | `string` | Name of the current state owner. |

### `getStateOwnerPlayerNo`

```lua
getStateOwnerPlayerNo()
```

[redirectable] Get the character's player number of the current state owner.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `playerNo` | `int` | 1-based player number of the current state owner. |

### `getStoryboardScene`

```lua
getStoryboardScene()
```

Get the current storyboard scene index.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `sceneIndex` | `int\|nil` | Current storyboard scene index, or `nil` if no storyboard is active. |

### `getTimestamp`

```lua
getTimestamp(format)
```

Get a formatted timestamp string.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `format`* | `string` | Optional. Default: `"2006-01-02 15:04:05.000"`. Go-style time format layout. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `timestamp` | `string` | Current time formatted according to `format`. |

### `getWinnerTeam`

```lua
getWinnerTeam()
```

Get the winning team side of the current or last match.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `teamSide` | `int32` | Winning team side (`1` or `2`), `0` for draw/undecided, or `-1` when unavailable. |

### `isUIKeyAction`

```lua
isUIKeyAction(action)
```

Check whether a UI action name is currently active.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `action` | `string` | UI action name. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `active` | `boolean` | `true` if the action is currently active. |

### `jsonDecode`

```lua
jsonDecode(path)
```

Decode a JSON file into Lua values.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `path` | `string` | Path to the JSON file. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `value` | `any` | Decoded JSON root value (Lua `string`, `number`, `boolean`, `table` or `nil`). |

### `jsonEncode`

```lua
jsonEncode(value, path)
```

Encode a Lua value to JSON and save it to a file.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `value` | `any` | Lua value to encode (tables, numbers, strings, booleans, or `nil`). |
| 2 | `path` | `string` | Output JSON file path (parent directories are created as needed). |

### `loadAnimTable`

```lua
loadAnimTable(path, sff)
```

Load an AIR/animation definition file and return an animation table.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `path` | `string` | Animation file path (typically a .air file). |
| 2 | `sff`* | `Sff` | Optional. Sprite file userdata used to resolve sprites while parsing. If omitted, an empty SFF is created internally. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `animTable` | `table` | Table mapping action numbers (int32) to `Animation` userdata. Each value is a parsed `*Animation` (usable with `animNew` and `animSetAnimation`). |

### `loadDebugFont`

```lua
loadDebugFont(filename, scale)
```

Load and set the font used by the debug overlay.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `filename` | `string` | Font filename. |
| 2 | `scale`* | `float32` | Optional. Default: `1.0`. Uniform scale applied to debug text (both X and Y). |

### `loadDebugInfo`

```lua
loadDebugInfo(funcs)
```

Register Lua functions to be called for debug info display.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `funcs` | `table` | Array-like table of global function names (string). |

### `loadDebugStatus`

```lua
loadDebugStatus(funcName)
```

Register the Lua function used to draw debug status.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `funcName` | `string` | Global Lua function name used for debug status. |

### `loadFile`

```lua
loadFile(filename)
```

Load and compile a Lua file through the engine file system.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `filename` | `string` | Lua file path. Supports regular files and files inside `.zip` archives. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `chunk` | `function\|nil` | Compiled Lua chunk on success, or `nil` if loading failed. |
| `error` | `string` | Error message when loading failed. |

### `loadGameOption`

```lua
loadGameOption(filename)
```

Load game options from a config file and return the current config as a table.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `filename`* | `string` | Optional. Config file path. If omitted, current config is kept. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `cfg` | `table` | Table representation of the current game configuration. |

### `loading`

```lua
loading()
```

Check whether resources are currently being loaded.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `loading` | `boolean` | `true` if the loader is in `LS_Loading` state. |

### `loadIni`

```lua
loadIni(filename, normalizeSections, keepMeta)
```

Load an INI file and convert it to a nested Lua table.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `filename` | `string` | INI file path. |
| 2 | `normalizeSections`* | `boolean` | Optional. Default: `true`. If `true`, section names are normalized: leading/trailing whitespace removed, letters lowercased, internal whitespace collapsed to `_`. |
| 3 | `keepMeta`* | `boolean` | Optional. Default: `false`. If `true`, each nested table receives an `__order` array preserving INI key order, and scalar values promoted to parent tables are preserved as `__value`. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `ini` | `table` | Table of sections; each section is a table of keys to strings. Dotted keys are converted to nested subtables. |

### `loadFightScreen`

```lua
loadFightScreen(defPath)
```

Load the fight screen definition.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `defPath`* | `string` | Optional. FightScreen def file path. If empty or omitted, uses default. |

### `loadMotif`

```lua
loadMotif(defPath)
```

Load a motif and return its configuration as a table.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `defPath`* | `string` | Optional. Motif def file path. If empty or omitted, uses default. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `motif` | `table` | Motif configuration table (includes menus, fonts, sounds, etc.). |

### `loadStart`

```lua
loadStart(params)
```

Validate selection and start asynchronous loading of characters and stage.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `params`* | `string` | Optional. Optional comma-separated parameter string (from launchFight and quickvs options) |

### `loadCancel`

```lua
loadCancel()
```

Cancel an in-progress background load, clean up partially loaded assets, and reset the netplay loading handshake.

### `loadState`

```lua
loadState()
```

Request loading of a previously saved state on the next frame.

### `loadStoryboard`

```lua
loadStoryboard(defPath)
```

Load a storyboard and set it as the current storyboard.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `defPath` | `string` | Storyboard def file path. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `storyboard` | `table\|nil` | Storyboard configuration table on success, or `nil` if no path is given or loading fails (a warning is printed). |

### `loadText`

```lua
loadText(path)
```

Load a text file and return its contents.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `path` | `string` | Text file path. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `content` | `string\|nil` | File contents on success, or `nil` if the file cannot be read. |

### `mapSet`

```lua
mapSet(name, value, mapType)
```

[redirectable] Set the character's map value.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `name` | `string` | Map name to modify. |
| 2 | `value` | `float32` | Map value to set. |
| 3 | `mapType`* | `string` | Optional. Map operation type. `"add"` adds to the existing value, anything else replaces it. |

### `motifIsInherited`

```lua
motifIsInherited(key)
```

Returns whether a motif value was inherited from another motif parameter.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `key` | `string` | Motif key path. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
|  | `boolean` |  |

### `storyboardCanceled`

```lua
storyboardCanceled()
```

Check whether the most recent storyboard was canceled by the player.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `canceled` | `boolean` | `true` if the storyboard was canceled via Esc or cancel key. |

### `modelNew`

```lua
modelNew(filename)
```

Load a 3D model (glTF) as a Model object.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `filename` | `string` | glTF model file path. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `model` | `Model` | Model userdata. |

### `modifyGameOption`

```lua
modifyGameOption(query, value)
```

Modify a game option using a query string path.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `query` | `string` | Option path in config (for example `"GameSpeed.Value"`). |
| 2 | `value` | `any` | New value:<br>- `boolean`: stored as boolean<br>- `nil`: remove/clear value depending on context<br>- `table`: treated as array of strings<br>- other: converted to string |

### `modifyMotif`

```lua
modifyMotif(query, value)
```

Modify a motif using a query string path.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `query` | `string` | Parameter path in motif (for example `"attract_mode.credits.snd"`). |
| 2 | `value` | `any` | New value:<br>- `boolean`: stored as boolean<br>- `nil`: remove/clear value depending on context<br>- `table`: treated as array of strings<br>- other: converted to string |

### `modifyStoryboard`

```lua
modifyStoryboard(query, value)
```

Modify a currently loaded storyboard using a query string path.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `query` | `string` | Parameter path in storyboard (for example `"scenedef.stopmusic"`). |
| 2 | `value` | `any` | New value:<br>- `boolean`: stored as boolean<br>- `nil`: remove/clear value depending on context<br>- `table`: treated as array of strings<br>- other: converted to string |

### `netPlay`

```lua
netPlay()
```

Check whether the current session is running in netplay mode.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `active` | `boolean` | `true` if netplay is currently active. |

### `netLoadingReady`

```lua
netLoadingReady()
```

Poll the non-blocking netplay loading handshake. Returns `true` when both peers have finished loading, or immediately if not in netplay.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `ready` | `boolean` | `true` if both sides are ready (or no net connection exists). |

### `panicError`

```lua
panicError(message)
```

Raise an immediate Lua error with a custom message.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `message` | `string` | Error message. |

### `paused`

```lua
paused()
```

Check whether gameplay is currently paused.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `paused` | `boolean` | `true` if the game is paused and not currently frame-stepping. |

### `playBgm`

```lua
playBgm(params)
```

[redirectable] Control background music playback.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `params` | `table` | Parameter table (keys are case-insensitive):<br>- `source` (string, opt) preset to use, formatted as `"<origin>.<key>"`<br>- `origin` = `"stagedef"`, `"stageparams"`, `"launchparams"`, `"motif"`, `"match"`, `"charparams"`<br>- `key` is origin-specific (for example `"bgm"`, `"win"` etc.)<br>- `bgm` (string, opt) BGM filename; searched relative to the current motif, current directory, and `sound/`<br>- `loop` (int, opt) Loop flag/mode (see engine BGM semantics)<br>- `volume` (int, opt) BGM volume (0–100, clamped to config MaxBGMVolume)<br>- `loopstart` (int, opt) Loop start position (samples/frames, engine-specific)<br>- `loopend` (int, opt) Loop end position<br>- `startposition` (int, opt) Initial playback position<br>- `freqmul` (float32, opt) Frequency multiplier (pitch)<br>- `loopcount` (int, opt) Loop count (`-1` for infinite)<br>- `interrupt` (boolean, opt) If `true`, always restart playback; if `false`, only update volume;<br>if omitted, interruption is decided automatically based on whether the file changed. |

### `playerBufReset`

```lua
playerBufReset(playerNo)
```

Reset player input buffers and disable hardcoded keys.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `playerNo`* | `int` | Optional. Player index (1-based). If omitted, resets all players. |

### `playSnd`

```lua
playSnd
```

[redirectable] Play the character's sound.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `group`* | `int32` | Optional. Default: `-1`. Sound group number. Negative values mean no sound is played. |
| 2 | `sound`* | `int32` | Optional. Default: `0`. Sound number within the group. |
| 3 | `volumescale`* | `int32` | Optional. Default: `100`. Volume scale (percent). |
| 4 | `commonSnd`* | `boolean` | Optional. Default: `false`. If `true`, use the `"f"` fight/common FX sound prefix. |
| 5 | `channel`* | `int32` | Optional. Default: `-1`. Sound channel (`-1` = auto). |
| 6 | `lowpriority`* | `boolean` | Optional. Default: `false`. If `true`, sound can be overridden by higher-priority sounds. |
| 7 | `freqmul`* | `float32` | Optional. Default: `1.0`. Frequency multiplier (pitch). |
| 8 | `loop`* | `boolean` | Optional. Default: `false`. If `true`, sound loops (ignored if `loopcount` is non-zero). |
| 9 | `pan`* | `float32` | Optional. Default: `0.0`. Stereo panning (engine-specific range, usually -1.0 to 1.0). |
| 10 | `priority`* | `int32` | Optional. Default: `0`. Priority level (higher plays over lower). |
| 11 | `loopstart`* | `int` | Optional. Default: `0`. Loop start position. |
| 12 | `loopend`* | `int` | Optional. Default: `0`. Loop end position. |
| 13 | `startposition`* | `int` | Optional. Default: `0`. Initial playback position. |
| 14 | `loopcount`* | `int32` | Optional. Default: `0`. Loop count: `0` uses `loop` flag, positive = exact loops, negative = infinite. |
| 15 | `stopOnGetHit`* | `boolean` | Optional. Default: `false`. If `true`, stop this sound when the character is hit. |
| 16 | `stopOnChangeState`* | `boolean` | Optional. Default: `false`. If `true`, stop this sound when the character changes state. function playSnd(group, sound, volumescale, commonSnd, channel, lowpriority, freqmul, loop, pan, priority, loopstart, loopend, startposition, loopcount, stopOnGetHit, stopOnChangeState) end |

### `postMatch`

```lua
postMatch()
```

Check whether post-match processing is active.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `active` | `boolean` | `true` if the engine is in post-match state. |

### `preloading`

```lua
preloading()
```

Check whether resources are currently being preloaded.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
|  | `boolean` | `true` if assets are still being preloaded. |

### `preloadListChar`

```lua
preloadListChar(id, number)
```

Mark a character sprite or animation for preloading.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `id` | `int32\|uint16` | Action number, or sprite group number when `number` is provided. |
| 2 | `number`* | `uint16` | Optional. If provided, `id` and `number` are used as sprite group/number keys; otherwise `id` is treated as an animation/action number (`int32`). |

### `preloadListStage`

```lua
preloadListStage(id, number)
```

Mark a stage sprite or animation for preloading.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `id` | `int32\|uint16` | Action number, or sprite group number when `number` is provided. |
| 2 | `number`* | `uint16` | Optional. If provided, `id` and `number` are used as sprite group/number keys; otherwise `id` is treated as an animation/action number (`int32`). |

### `printConsole`

```lua
printConsole(text, appendLast)
```

Print text to the in-game console and standard output.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `text` | `string` | Text to print. |
| 2 | `appendLast`* | `boolean` | Optional. Default: `false`. If `true`, appends to the last console line; otherwise starts a new line. |

### `puts`

```lua
puts(text)
```

Print text to standard output (stdout) only.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `text` | `string` | Text to print. |

### `queueCharPreload`

```lua
queueCharPreload(charRef, priority)
```

Queue a character for background preloading of portraits and palettes.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `charRef` | `int` | 0-based character index in the select list. |
| 2 | `priority`* | `int` | Optional. Default: `1`. Priority level (`1` = low, `2` = high). |

### `queueStagePreload`

```lua
queueStagePreload(stageRef, priority)
```

Queue a stage for background preloading of portraits.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `stageRef` | `int` | Stage index as used by the select system. |
| 2 | `priority`* | `int` | Optional. Default: `1`. Priority level (`1` = low, `2` = high). |

### `rectDebug`

```lua
rectDebug(rect, prefix)
```

Print a rectangle's debug information.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `rect` | `Rect` | Rectangle userdata. |
| 2 | `prefix`* | `string` | Optional. Optional text printed before the rectangle. |

### `rectDraw`

```lua
rectDraw(rect, layer)
```

Queue drawing of a rectangle.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `rect` | `Rect` | Rectangle userdata. |
| 2 | `layer`* | `int16` | Optional. Layer number to draw on (defaults to `rect.layerno`). |

### `rectNew`

```lua
rectNew()
```

Create a new rectangle object.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `rect` | `Rect` | Newly created rectangle userdata. |

### `rectReset`

```lua
rectReset(rect)
```

Reset rectangle parameters to defaults.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `rect` | `Rect` | Rectangle userdata. |

### `rectSetAlpha`

```lua
rectSetAlpha(rect, src, dst)
```

Set rectangle alpha blending values.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `rect` | `Rect` | Rectangle userdata. |
| 2 | `src` | `int32` | Source alpha. |
| 3 | `dst` | `int32` | Destination alpha. |

### `rectSetAlphaPulse`

```lua
rectSetAlphaPulse(rect, min, max, time)
```

Enable pulsing alpha effect for a rectangle.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `rect` | `Rect` | Rectangle userdata. |
| 2 | `min` | `int32` | Minimum alpha. |
| 3 | `max` | `int32` | Maximum alpha. |
| 4 | `time` | `int32` | Pulse period (frames). |

### `rectSetColor`

```lua
rectSetColor(rect, r, g, b)
```

Set rectangle RGB color.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `rect` | `Rect` | Rectangle userdata. |
| 2 | `r` | `int32` | Red component (0–255). |
| 3 | `g` | `int32` | Green component (0–255). |
| 4 | `b` | `int32` | Blue component (0–255). |

### `rectSetLayerno`

```lua
rectSetLayerno(rect, layer)
```

Set the rectangle's drawing layer.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `rect` | `Rect` | Rectangle userdata. |
| 2 | `layer` | `int16` | Layer number. |

### `rectSetLocalcoord`

```lua
rectSetLocalcoord(rect, x, y)
```

Set the rectangle's local coordinate system.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `rect` | `Rect` | Rectangle userdata. |
| 2 | `x` | `float32` | Local coordinate width. |
| 3 | `y` | `float32` | Local coordinate height. |

### `rectSetWindow`

```lua
rectSetWindow(rect, x1, y1, x2, y2)
```

Set the rectangle's clipping window.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `rect` | `Rect` | Rectangle userdata. |
| 2 | `x1` | `float32` | Left coordinate. |
| 3 | `y1` | `float32` | Top coordinate. |
| 4 | `x2` | `float32` | Right coordinate. |
| 5 | `y2` | `float32` | Bottom coordinate. |

### `rectUpdate`

```lua
rectUpdate(rect)
```

Update rectangle animation (alpha pulse, etc.).

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `rect` | `Rect` | Rectangle userdata. |

### `refresh`

```lua
refresh()
```

Advance one frame: process logic, drawing and fades.

### `reload`

```lua
reload()
```

Schedule reloading of characters, stage and fight screen.

### `remapInput`

```lua
remapInput(srcPlayer, dstPlayer)
```

Remap logical player input to another player slot.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `srcPlayer` | `int32` | Source player number (1-based). |
| 2 | `dstPlayer` | `int32` | Destination player number (1-based). |

### `removeDizzy`

```lua
removeDizzy()
```

[redirectable] Clear the character's dizzy state.

### `replayRecord`

```lua
replayRecord(path)
```

Start recording rollback/netplay input to a file.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `path` | `string` | Output file path. |

### `replayStop`

```lua
replayStop()
```

Stop input replay recording.

### `resetAILevel`

```lua
resetAILevel()
```

Reset AI level for all players to 0 (human control).

### `resetGameStats`

```lua
resetGameStats()
```

Clear all accumulated game statistics.

### `resetGameParams`

```lua
resetGameParams()
```

Reset per-match game parameters to motif defaults. Called before `loadStart` when background loading feeds params incrementally via `selectChar`.

### `resetKey`

```lua
resetKey()
```

Clear the last captured key and text input.

### `resetMatchData`

```lua
resetMatchData(fullReset)
```

Reset match-related runtime data.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `fullReset` | `boolean` | If `true`, perform a full match data reset. |

### `resetRemapInput`

```lua
resetRemapInput()
```

Reset all input remapping to defaults.

### `resetRound`

```lua
resetRound()
```

Request a round reset.

### `resetScore`

```lua
resetScore(teamSide)
```

Reset a team's score to zero.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `teamSide` | `int` | Team side (`1` or `2`). |

### `resetTokenGuard`

```lua
resetTokenGuard()
```

Reset the UI input token guard.

### `roundOver`

```lua
roundOver()
```

Check whether the current round is over.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `over` | `boolean` | `true` if the current round is over. |

### `roundStart`

```lua
roundStart()
```

Check whether the current frame is the start of the round.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `start` | `boolean` | `true` on the first tick of the round. |

### `runHiscore`

```lua
runHiscore(mode, place, endtime, nofade, nobgs, nooverlay)
```

Run the high-score screen for one frame.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `mode`* | `string` | Optional. Optional hiscore mode identifier. |
| 2 | `place`* | `int32` | Optional. Optional ranking position to highlight. |
| 3 | `endtime`* | `int32` | Optional. Optional override for the hiscore screen duration. |
| 4 | `nofade`* | `boolean` | Optional. Default: `false`. If `true`, disable fade-in and fade-out effects. |
| 5 | `nobgs`* | `boolean` | Optional. Default: `false`. If `true`, disable background rendering. |
| 6 | `nooverlay`* | `boolean` | Optional. Default: `false`. If `true`, disable overlay rendering. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `active` | `boolean` | `true` while the hiscore screen is active. |

### `runStoryboard`

```lua
runStoryboard()
```

Run the currently loaded storyboard for one frame.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `active` | `boolean` | `true` while the storyboard is active. |

### `saveGameOption`

```lua
saveGameOption(path)
```

Save current game options to file.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `path`* | `string` | Optional. Config file path. Defaults to the current config's `Def` path. |

### `saveIni`

```lua
saveIni(iniTable, filename)
```

Save a Lua table to an INI file.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `iniTable` | `table` | Table of sections to save. Each top-level key is the section name and each value must be a table. Nested tables inside a section are flattened using dotted keys. Array-like tables are saved as comma-separated lists. |
| 2 | `filename` | `string` | Output INI file path. |

### `saveState`

```lua
saveState()
```

Request saving of the current state on the next frame.

### `screenshot`

```lua
screenshot()
```

Take a screenshot on the next frame.

### `searchFile`

```lua
searchFile(filename, dirs)
```

Search for a file in a list of directories.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `filename` | `string` | Filename to search for. |
| 2 | `dirs` | `table` | Array-like table of directory paths (string). |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `path` | `string` | Resolved file path, or empty string if not found. |

### `selectChar`

```lua
selectChar(teamSide, charRef, palette, overrideParams)
```

Add a character to a team's selection.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `teamSide` | `int` | Team side (`1` or `2`). |
| 2 | `charRef` | `int` | 0-based character index in the select list. |
| 3 | `palette` | `int` | Palette number. |
| 4 | `overrideParams`* | `string` | Optional. Optional comma-separated override parameters. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `status` | `int` | Selection status:<br>- `0` – character not added<br>- `1` – added, team is not yet full<br>- `2` – added, team is now full |

### `selectStage`

```lua
selectStage(stageRef)
```

Select a stage by index.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `stageRef` | `int` | Stage reference used by the select system. `0` selects the random stage sentinel; positive values are 1-based stage slots. |

### `selectStart`

```lua
selectStart()
```

Clear current selection and start loading the match.

### `selfState`

```lua
selfState(stateNo)
```

[redirectable] Force the character into a specified state.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `stateNo` | `int32` | Target state number. |

### `setAccel`

```lua
setAccel(accel)
```

Set debug time acceleration.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `accel` | `float32` | Time acceleration multiplier. |

### `setAILevel`

```lua
setAILevel(level)
```

[redirectable] Set the character's AI level.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `level` | `float32` | AI level (`0` = human control, >0 = AI). |

### `setCom`

```lua
setCom(playerNo, level)
```

Set AI level for a specific player.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `playerNo` | `int` | Player number (1-based). |
| 2 | `level` | `float32` | AI level (`0` = off, >0 = AI). |

### `setConsecutiveWins`

```lua
setConsecutiveWins(teamSide, wins)
```

Set the number of consecutive wins for a team.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `teamSide` | `int` | Team side (`1` or `2`). |
| 2 | `wins` | `int32` | Number of consecutive wins. |

### `setCredits`

```lua
setCredits(credits)
```

Set the number of credits.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `credits` | `int32` | Credit count. |

### `setDefaultConfig`

```lua
setDefaultConfig(configType, playerNo, enabled)
```

Apply default key or joystick bindings for a player.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `configType` | `string` | Configuration type: `"Keys"` or `"Joystick"`. |
| 2 | `playerNo` | `int` | Player number (1-based). |
| 3 | `enabled`* | `table` | Optional.<br>Optional table limiting which bindings are set. Can be either:<br>- an array-like table of binding names, or<br>- a map-like table `{bindingName = true, ...}`. |

### `setDizzyPoints`

```lua
setDizzyPoints(value)
```

[redirectable] Set the character's dizzy points.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `value` | `int32` | Dizzy points value. |

### `setGameMode`

```lua
setGameMode(mode)
```

Set current game mode identifier.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `mode` | `string` | Game mode name (for example `"arcade"`, `"versus"`, `"training"`). |

### `setGameSpeed`

```lua
setGameSpeed(speed)
```

Set global game speed option.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `speed` | `int` | Game speed value (engine-specific range). |

### `setGameStatsJson`

```lua
setGameStatsJson(json)
```

Restore accumulated game statistics from a JSON snapshot.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `json` | `string` | JSON string previously produced by `getGameStatsJson()`. |

### `setGuardPoints`

```lua
setGuardPoints(value)
```

[redirectable] Set the character's guard points.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `value` | `int32` | Guard points value. |

### `setHomeTeam`

```lua
setHomeTeam(teamSide)
```

Set which team is the home team.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `teamSide` | `int` | Team side (`1` or `2`). |

### `setKeyConfig`

```lua
setKeyConfig(playerNo, controllerId, mapping)
```

Configure keyboard or joystick bindings for a player.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `playerNo` | `int` | Player number (1-based). |
| 2 | `controllerId` | `int` | Input config target selector: `-1` updates keyboard bindings, any value `>= 0` updates joystick bindings. |
| 3 | `mapping` | `table` | Table mapping button indices (`1`–`14`) to key/button names (string). |

### `setLastInputController`

```lua
setLastInputController(playerNo)
```

Set the last UI input controller.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `playerNo` | `int` | 1-based player/controller index. Values less than `1` clear it. |

### `setLife`

```lua
setLife(life)
```

[redirectable] Set the character's life.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `life` | `int32` | New life value (only applied if the character is alive). |

### `setFightScreenElements`

```lua
setFightScreenElements(elements)
```

Force enable/disable of fight screen elements.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `elements` | `table` | Table of boolean flags (keys are case-insensitive):<br>- `active` (boolean) enable lifebar drawing<br>- `bars` (boolean) main life bars<br>- `guardbar` (boolean) guard bar<br>- `hidebars` (boolean) hide bars during dialogue<br>- `match` (boolean) match info<br>- `mode` (boolean) mode display<br>- `p1ailevel`, `p2ailevel` (boolean) AI level displays<br>- `p1score`, `p2score` (boolean) score displays<br>- `p1wincount`, `p2wincount` (boolean) win count displays<br>- `redlifebar` (boolean) red life bar<br>- `stunbar` (boolean) stun bar<br>- `timer` (boolean) round timer |

### `setFightScreenScore`

```lua
setFightScreenScore(p1Score, p2Score)
```

Set initial fight screen scores for both teams.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `p1Score` | `float32` | Starting score for team 1. |
| 2 | `p2Score`* | `float32` | Optional. Starting score for team 2 (defaults to 0 if omitted). |

### `setFightScreenTimer`

```lua
setFightScreenTimer(time)
```

Set initial round timer value displayed on the fight screen.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `time` | `int32` | Initial timer value. |

### `setMatchMaxDrawGames`

```lua
setMatchMaxDrawGames(teamSide, count)
```

Set maximum number of draw games allowed for a team.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `teamSide` | `int` | Team side (`1` or `2`). |
| 2 | `count` | `int32` | Maximum draw games. |

### `setMatchNo`

```lua
setMatchNo(matchNo)
```

Set the current match number.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `matchNo` | `int32` | Match index/number. |

### `setMatchWins`

```lua
setMatchWins(teamSide, wins)
```

Set number of round wins required to win the match for a team.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `teamSide` | `int` | Team side (`1` or `2`). |
| 2 | `wins` | `int32` | Required wins. |

### `setMotifElements`

```lua
setMotifElements(elements)
```

Enable/disable major motif elements.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `elements` | `table` | Table of boolean flags (keys are case-insensitive):<br>- `challenger` (boolean) challenger screen<br>- `continuescreen` (boolean) continue screen<br>- `demo` (boolean) demo/attract mode<br>- `dialogue` (boolean) dialogue system<br>- `hiscore` (boolean) hiscore screen<br>- `losescreen` (boolean) lose screen<br>- `vsscreen` (boolean) versus screen<br>- `vsmatchno` (boolean) versus screen match number<br>- `victoryscreen` (boolean) victory screen<br>- `winscreen` (boolean) win screen<br>- `menu` (boolean) main menu |

### `setPlayers`

```lua
setPlayers()
```

Resize player input configuration data to match `config.Players`.

### `setPower`

```lua
setPower(power)
```

[redirectable] Set the character's power.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `power` | `int32` | Power value. |

### `setRedLife`

```lua
setRedLife(value)
```

[redirectable] Set the character's red life.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `value` | `int32` | Red life value. |

### `setRoundTime`

```lua
setRoundTime(time)
```

Set maximum round time (in ticks/counts).

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `time` | `int32` | Maximum round time. |

### `setTeamMode`

```lua
setTeamMode(teamSide, mode, teamSize)
```

Configure a team's mode and team size.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `teamSide` | `int` | Team side (`1` or `2`). |
| 2 | `mode` | `int32` | Team mode (for example `TM_Single`, `TM_Simul`, `TM_Turns`, `TM_Tag`). |
| 3 | `teamSize` | `int32` | Number of members (for non-turns: `1..MaxSimul`, for turns: `>=1`). |

### `setTime`

```lua
setTime(time)
```

Set the current round time value.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `time` | `int32` | Current timer value. |

### `setTimeFramesPerCount`

```lua
setTimeFramesPerCount(frames)
```

Set how many frames correspond to one timer count.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `frames` | `int32` | Frames per timer count. |

### `setWinCount`

```lua
setWinCount(teamSide, wins)
```

Set win count for a team.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `teamSide` | `int` | Team side (`1` or `2`). |
| 2 | `wins` | `int32` | Win count. |

### `sffNew`

```lua
sffNew(filename, isActPal)
```

Load an SFF file or create an empty SFF.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `filename`* | `string` | Optional. SFF file path. If omitted, an empty SFF is created. |
| 2 | `isActPal`* | `boolean` | Optional. Default: `false`. If `true`, prepare SFFv1 to receive ACT palettes. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `sff` | `Sff` | SFF userdata. |

### `shutdown`

```lua
shutdown()
```

Check whether shutdown has been requested.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `shutdown` | `boolean` | `true` if the global shutdown flag is set. |

### `sleep`

```lua
sleep(seconds)
```

Block the current script for a number of seconds.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `seconds` | `number` | Time to sleep, in seconds. |

### `sndNew`

```lua
sndNew(filename)
```

Load a SND file.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `filename` | `string` | SND file path. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `snd` | `Snd` | SND userdata. |

### `sndPlay`

```lua
sndPlay(snd, group, number, volumescale, pan, loopstart, loopend, startposition)
```

Play a sound from a SND object.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `snd` | `Snd` | SND userdata. |
| 2 | `group` | `int32` | Sound group number. |
| 3 | `number` | `int32` | Sound number within the group. |
| 4 | `volumescale`* | `int32` | Optional. Default: `100`. Volume scale (percent). |
| 5 | `pan`* | `float32` | Optional. Default: `0.0`. Stereo panning (engine-specific range). |
| 6 | `loopstart`* | `int` | Optional. Default: `0`. Loop start position. |
| 7 | `loopend`* | `int` | Optional. Default: `0`. Loop end position. |
| 8 | `startposition`* | `int` | Optional. Default: `0`. Start position. |

### `sndPlaying`

```lua
sndPlaying(snd, group, number)
```

Check if a given sound is currently playing.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `snd` | `Snd` | SND userdata. |
| 2 | `group` | `int32` | Sound group number. |
| 3 | `number` | `int32` | Sound number within the group. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `playing` | `boolean` | `true` if the sound is playing. |

### `sndStop`

```lua
sndStop(snd, group, number)
```

Stop a sound from a SND object.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `snd` | `Snd` | SND userdata. |
| 2 | `group` | `int32` | Sound group number. |
| 3 | `number` | `int32` | Sound number within the group. |

### `stopAllCharSounds`

```lua
stopAllCharSounds()
```

Stop all character sounds.

### `stopBgm`

```lua
stopBgm()
```

Stop background music playback.

### `stopSnd`

```lua
stopSnd()
```

[redirectable] Stop all character's sounds.

### `synchronize`

```lua
synchronize()
```

Synchronize with external systems (e.g. netplay).

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `success` | `boolean` | `true` if synchronization succeeded, `false` if a non-fatal session warning occurred. |

### `textImgAddPos`

```lua
textImgAddPos(ts, dx, dy)
```

Offset a text sprite's position by the given amounts.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `dx` | `float32` | X offset to add. |
| 3 | `dy` | `float32` | Y offset to add. |

### `textImgAddText`

```lua
textImgAddText(ts, text)
```

Append text to an existing text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `text` | `string` | Text to append (no automatic newline). |

### `textImgApplyVel`

```lua
textImgApplyVel(ts, source)
```

Copy velocity settings from another text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata to modify. |
| 2 | `source` | `TextSprite` | Source text sprite whose velocity is copied. |

### `textImgDebug`

```lua
textImgDebug(ts, prefix)
```

Print debug information about a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `prefix`* | `string` | Optional. Optional text printed before the debug info. |

### `textImgDraw`

```lua
textImgDraw(ts, layer)
```

Queue drawing of a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `layer`* | `int16` | Optional. Layer to draw on (defaults to `ts.layerno`). |

### `textImgGetTextWidth`

```lua
textImgGetTextWidth(ts, text)
```

Measure the width of a text string for a font.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `text` | `string` | Text to measure. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `width` | `int32` | Width of the rendered text in pixels. |

### `textImgNew`

```lua
textImgNew()
```

Create a new empty text sprite.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `ts` | `TextSprite` | Newly created text sprite userdata. |

### `textImgReset`

```lua
textImgReset(ts, parts)
```

Reset a text sprite to its initial values.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `parts`* | `table` | Optional.<br>If omitted or `nil`, resets everything. If provided, must be an array-like table of strings, each one of:<br>- `"pos"` – reset position to initial<br>- `"scale"` – reset scale to initial<br>- `"window"` – reset window to initial<br>- `"velocity"` – reset velocity to initial<br>- `"text"` – reset text to initial<br>- `"palfx"` – clear PalFX<br>- `"delay"` – reset text delay timer |

### `textImgSetAccel`

```lua
textImgSetAccel(ts, ax, ay)
```

Set per-frame acceleration for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `ax` | `float32` | X acceleration. |
| 3 | `ay` | `float32` | Y acceleration. |

### `textImgSetAlign`

```lua
textImgSetAlign(ts, align)
```

Set text alignment for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `align` | `int32` | Alignment value (engine-specific constants, e.g. left/center/right). |

### `textImgSetAngle`

```lua
textImgSetAngle(ts, angle)
```

Set rotation angle for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `angle` | `float32` | Rotation angle in degrees. |

### `textImgSetBank`

```lua
textImgSetBank(ts, bank)
```

Set the font bank index for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `bank` | `int32` | Font bank index. |

### `textImgSetColor`

```lua
textImgSetColor(ts, r, g, b, a)
```

Set the RGBA color for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `r` | `int32` | Red component (0–255). |
| 3 | `g` | `int32` | Green component (0–255). |
| 4 | `b` | `int32` | Blue component (0–255). |
| 5 | `a`* | `int32` | Optional. Default: `255`. Alpha component (0–255). |

### `textImgSetFocalLength`

```lua
textImgSetFocalLength(ts, fLength)
```

Set focal length used for perspective projection on a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `fLength` | `float32` | Focal length value. |

### `textImgSetFont`

```lua
textImgSetFont(ts, fnt)
```

Assign a font object to a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `fnt` | `Fnt` | Font userdata to use. |

### `textImgSetFriction`

```lua
textImgSetFriction(ts, fx, fy)
```

Set friction applied to a text sprite's velocity each update.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `fx` | `float32` | X friction factor. |
| 3 | `fy` | `float32` | Y friction factor. |

### `textImgSetLayerno`

```lua
textImgSetLayerno(ts, layer)
```

Set the drawing layer for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `layer` | `int16` | Layer number. |

### `textImgSetLocalcoord`

```lua
textImgSetLocalcoord(ts, width, height)
```

Set the local coordinate space for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `width` | `float32` | Local coordinate width. |
| 3 | `height` | `float32` | Local coordinate height. |

### `textImgSetMaxDist`

```lua
textImgSetMaxDist(ts, xDist, yDist)
```

Set the maximum visible distance for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `xDist` | `float32` | Maximum X distance. |
| 3 | `yDist` | `float32` | Maximum Y distance. |

### `textImgSetPos`

```lua
textImgSetPos(ts, x, y)
```

Set the position of a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `x`* | `float32` | Optional. X position; if omitted, uses the initial X offset. |
| 3 | `y`* | `float32` | Optional. Y position; if omitted, uses the initial Y offset. |

### `textImgSetProjection`

```lua
textImgSetProjection(ts, projection)
```

Set projection mode for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `projection` | `int32\|string` | Projection mode. Can be a numeric engine constant, or one of:<br>- `"orthographic"`<br>- `"perspective"`<br>- `"perspective2"` |

### `textImgSetScale`

```lua
textImgSetScale(ts, sx, sy)
```

Set the scale of a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `sx` | `float32` | X scale. |
| 3 | `sy` | `float32` | Y scale. |

### `textImgSetText`

```lua
textImgSetText(ts, text)
```

Set the text content of a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `text` | `string` | Text to display. |

### `textImgSetTextDelay`

```lua
textImgSetTextDelay(ts, delay)
```

Set per-character text delay for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `delay` | `float32` | Delay between characters (frames, engine-specific). |

### `textImgSetTextSpacing`

```lua
textImgSetTextSpacing(ts, xSpacing, ySpacing)
```

Set text spacing for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `xSpacing` | `float32` | Horizontal text spacing. |
| 3 | `ySpacing` | `float32` | Vertical text spacing. |

### `textImgSetTextWrap`

```lua
textImgSetTextWrap(ts, wrap)
```

Enable or disable word wrapping for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `wrap` | `boolean` | If `true`, enables text wrapping. |

### `textImgSetVelocity`

```lua
textImgSetVelocity(ts, vx, vy)
```

Set velocity for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `vx` | `float32` | X velocity. |
| 3 | `vy` | `float32` | Y velocity. |

### `textImgSetWindow`

```lua
textImgSetWindow(ts, x1, y1, x2, y2)
```

Set the clipping window for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `x1` | `float32` | Left coordinate. |
| 3 | `y1` | `float32` | Top coordinate. |
| 4 | `x2` | `float32` | Right coordinate. |
| 5 | `y2` | `float32` | Bottom coordinate. |

### `textImgSetXAngle`

```lua
textImgSetXAngle(ts, xangle)
```

Set rotation angle around the X axis for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `xangle` | `float32` | X-axis rotation angle. |

### `textImgSetXShear`

```lua
textImgSetXShear(ts, xshear)
```

Set X shear (italic-style slant) for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `xshear` | `float32` | Shear value along X. |

### `textImgSetYAngle`

```lua
textImgSetYAngle(ts, yangle)
```

Set rotation angle around the Y axis for a text sprite.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |
| 2 | `yangle` | `float32` | Y-axis rotation angle. |

### `textImgUpdate`

```lua
textImgUpdate(ts)
```

Update a text sprite's internal state (position, delays, etc.).

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `ts` | `TextSprite` | Text sprite userdata. |

### `toggleClsnDisplay`

```lua
toggleClsnDisplay(state)
```

Toggle display of collision boxes.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `state`* | `boolean` | Optional. If provided, sets collision box display on/off; otherwise toggles it. |

### `toggleDebugDisplay`

```lua
toggleDebugDisplay(dummy)
```

Toggle or cycle debug display.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `mode`* | `any` | Optional. If provided, simply toggles the debug display. If omitted, cycles the debug display through characters and eventually disables it. |

### `toggleFullscreen`

```lua
toggleFullscreen(state)
```

Toggle fullscreen mode.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `state`* | `boolean` | Optional. If provided, sets fullscreen on/off; otherwise toggles it. |

### `toggleLifebarDisplay`

```lua
toggleLifebarDisplay(hide)
```

Toggle lifebar visibility.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `hide`* | `boolean` | Optional. If provided, hides (`true`) or shows (`false`) the lifebar; otherwise toggles. |

### `toggleMaxPowerMode`

```lua
toggleMaxPowerMode(state)
```

Toggle "max power" cheat mode.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `state`* | `boolean` | Optional. If provided, sets max power mode on/off; otherwise toggles it. When enabled, all root players' power is set to their maximum. |

### `toggleNoSound`

```lua
toggleNoSound(state)
```

Toggle global sound output.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `state`* | `boolean` | Optional. If provided, sets mute on/off; otherwise toggles it. |

### `togglePause`

```lua
togglePause(state)
```

Toggle game pause.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `state`* | `boolean` | Optional. If provided, sets pause on/off; otherwise toggles it. |

### `togglePlayer`

```lua
togglePlayer(playerNo)
```

Enable or disable all instances of a given player.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `playerNo` | `int32` | Player number (1-based). |

### `toggleVSync`

```lua
toggleVSync(mode)
```

Toggle vertical sync (VSync).

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `mode`* | `int` | Optional. If provided, sets the swap interval directly; otherwise toggles between `0` and `1`. |

### `toggleWireframeDisplay`

```lua
toggleWireframeDisplay(state)
```

Toggle wireframe rendering mode (debug only).

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `state`* | `boolean` | Optional. If provided, sets wireframe display on/off; otherwise toggles it. |

### `updateVolume`

```lua
updateVolume()
```

Update background music volume to match current settings.

### `validatePal`

```lua
validatePal(palReq, charRef)
```

Validate a requested palette index for a character.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `palReq` | `int` | Requested palette number (1-based). |
| 2 | `charRef` | `int` | 0-based character index in the select list. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `validPal` | `int` | Engine-validated palette number (may differ from `palReq` depending on character configuration). |

### `version`

```lua
version()
```

Get the engine version string.

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `ver` | `string` | Engine version and build time. |

### `waveNew`

```lua
waveNew(path, group, sound, maxLoops)
```

Load a sound from an SND file using a group/sound pair.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `path` | `string` | Path to the SND container. |
| 2 | `group` | `int32` | Group number in the SND. |
| 3 | `sound` | `int32` | Sound number in the SND. |
| 4 | `max`* | `uint32` | Optional. Default: `0`. Maximum scan limit passed to SND loading. If non-zero, loading stops after the first matching entry and also gives up after scanning that many entries without a match. |

**Returns**

| Name | Type | Description |
| --- | --- | --- |
| `sound` | `Sound` | Sound userdata containing the loaded sound data. |

### `wavePlay`

```lua
wavePlay(s, group, number)
```

Play a sound from a `Sound` object on the shared sound channel pool.

**Parameters**

| # | Name | Type | Description |
| --- | --- | --- | --- |
| 1 | `s` | `Sound` | Sound userdata. |
| 2 | `group`* | `int32` | Optional. Default: `0`. Optional group number. |
| 3 | `number`* | `int32` | Optional. Default: `0`. Optional sound number within the group. |
<!-- AUTOGEN:END embedded-functions -->

## <a name="functions_triggers">Lua "triggers"</a>

Trigger functions externalized by the engine into Lua are not documented in detail at this point. Below is a generated list of them in alphabetical order.

They either work similarly to CNS/ZSS trigger equivalents or are mostly self-explanatory. Triggers that return a boolean int in CNS return `true` or `false` in Lua instead of `1` or `0`. All functions are case-sensitive. They work from Lua both in-match and after match.

### Trigger redirection

Redirection returns `true` if it successfully finds the requested player/helper, or `false` otherwise. Lua trigger function code used after redirection is executed through the matched player/helper until another redirection is used.

<!-- AUTOGEN:START trigger-redirection -->
- `enemy`
- `enemyNear`
- `helper`
- `helperIndex`
- `p2`
- `parent`
- `partner`
- `player`
- `playerId`
- `playerIndex`
- `root`
- `stateOwner`
- `target`
<!-- AUTOGEN:END trigger-redirection -->

### Trigger functions

<!-- AUTOGEN:START trigger-functions -->
- `aiLevel`
- `airJumpCount`
- `alive`
- `alpha`
- `angle`
- `anim`
- `animElemNo`
- `animElemTime`
- `animElemVar`
- `animExist`
- `animLength`
- `animPlayerNo`
- `animTime`
- `attack`
- `attackMul`
- `authorName`
- `backEdge`
- `backEdgeBodyDist`
- `backEdgeDist`
- `bgmVar`
- `botBoundBodyDist`
- `botBoundDist`
- `bottomEdge`
- `cameraPosX`
- `cameraPosY`
- `cameraZoom`
- `canRecover`
- `clamp`
- `clsnOverlap`
- `clsnVar`
- `comboCount`
- `command`
- `consecutiveWins`
- `const`
- `const1080p`
- `const240p`
- `const480p`
- `const720p`
- `ctrl`
- `debugMode`
- `decisiveRound`
- `defence`
- `defenceMul`
- `displayName`
- `dizzy`
- `dizzyPoints`
- `dizzyPointsMax`
- `drawGame`
- `drawPal`
- `envShakeVar`
- `explodVar`
- `facing`
- `fightScreenState`
- `fightScreenVar`
- `fightTime`
- `firstAttack`
- `frontEdge`
- `frontEdgeBodyDist`
- `frontEdgeDist`
- `fvar`
- `gameHeight`
- `gameMode`
- `gameOption`
- `gameTime`
- `gameVar`
- `gameWidth`
- `getHitVar`
- `groundLevel`
- `guardBreak`
- `guardCount`
- `guardPoints`
- `guardPointsMax`
- `helperIndexExist`
- `helperVar`
- `hitByAttr`
- `hitCount`
- `hitDefAttr`
- `hitDefVar`
- `hitFall`
- `hitOver`
- `hitOverridden`
- `hitPauseTime`
- `hitShakeOver`
- `hitVelX`
- `hitVelY`
- `hitVelZ`
- `id`
- `ikemenVersion`
- `inCustomAnim`
- `inCustomState`
- `index`
- `inGuardDist`
- `inputTime`
- `introState`
- `isAsserted`
- `isHelper`
- `isHomeTeam`
- `isHost`
- `jugglePoints`
- `lastPlayerId`
- `layerNo`
- `leftEdge`
- `lerp`
- `life`
- `lifeMax`
- `localCoordX`
- `localCoordY`
- `lose`
- `loseKO`
- `loseTime`
- `map`
- `matchNo`
- `matchOver`
- `memberNo`
- `motifState`
- `motifVar`
- `moveContact`
- `moveCountered`
- `moveGuarded`
- `moveHit`
- `moveHitVar`
- `moveReversed`
- `moveType`
- `mugenVersion`
- `name`
- `numEnemy`
- `numExplod`
- `numHelper`
- `numPartner`
- `numPlayer`
- `numProj`
- `numProjId`
- `numStageBg`
- `numTarget`
- `numText`
- `offsetX`
- `offsetY`
- `outroState`
- `p2BodyDistX`
- `p2BodyDistY`
- `p2BodyDistZ`
- `p2DistX`
- `p2DistY`
- `p2DistZ`
- `p2Life`
- `p2MoveType`
- `p2StateNo`
- `p2StateType`
- `palFxVar`
- `palNo`
- `parentDistX`
- `parentDistY`
- `parentDistZ`
- `parentExist`
- `pauseTime`
- `physics`
- `playerIdExist`
- `playerIndexExist`
- `playerNo`
- `playerNoExist`
- `posX`
- `posY`
- `posZ`
- `power`
- `powerMax`
- `prevAnim`
- `prevMoveType`
- `prevStateNo`
- `prevStateType`
- `projCancelTime`
- `projClsnOverlap`
- `projContactTime`
- `projGuardedTime`
- `projHitTime`
- `projVar`
- `receivedDamage`
- `receivedHits`
- `redLife`
- `reversalDefAttr`
- `rightEdge`
- `rootDistX`
- `rootDistY`
- `rootDistZ`
- `roundNo`
- `roundsExisted`
- `roundState`
- `roundsWon`
- `roundTime`
- `runOrder`
- `scaleX`
- `scaleY`
- `scaleZ`
- `score`
- `scoreTotal`
- `screenHeight`
- `screenPosX`
- `screenPosY`
- `screenWidth`
- `selfAnimExist`
- `selfStateNoExist`
- `shader`
- `sign`
- `soundVar`
- `spriteVar`
- `sprPriority`
- `stageBackEdgeDist`
- `stageBgVar`
- `stageConst`
- `stageFrontEdgeDist`
- `stageTime`
- `stageVar`
- `standby`
- `stateNo`
- `stateType`
- `sysFvar`
- `sysVar`
- `teamLeader`
- `teamMode`
- `teamSide`
- `teamSize`
- `ticksPerSecond`
- `time`
- `timeElapsed`
- `timeMod`
- `timeRemaining`
- `timeTotal`
- `topBoundBodyDist`
- `topBoundDist`
- `topEdge`
- `uniqHitCount`
- `var`
- `velX`
- `velY`
- `velZ`
- `win`
- `winClutch`
- `winHyper`
- `winKO`
- `winPerfect`
- `winSpecial`
- `winTime`
- `xAngle`
- `xShear`
- `yAngle`
- `zoomVar`
<!-- AUTOGEN:END trigger-functions -->

# <a name="lua_troubleshooting">Troubleshooting scripts</a>

When working with Lua code, it is useful to print values while testing.

Start Ikemen GO from a command-line interpreter, such as Command Prompt on Windows or a terminal on Unix-like systems. On Windows, the easiest way is often to create a [batch file](https://en.wikipedia.org/wiki/Batch_file) that launches the engine.

Use Lua `print()` to output values or calculations to the command-line window:

```lua
print(matchNo())
print(gameMode())
print(getConsecutiveWins(1))
```

If a script fails, check for common issues:

* missing commas inside Lua tables;
* using `=` instead of `==` in conditions;
* reading a missing table field without checking whether the parent table exists;
* using the wrong function name casing;
* forgetting `return` after `launchFight` returns `false`;
* forgetting `setMatchNo(-1)` at the end of a cleared Arcade Path or Story Mode arc.

For general Lua syntax, see the Lua learning resources linked in [General information](#lua_general).