# <a name="parameters">New parameters</a>

There are many new screenpack parameters, but they won’t be documented until the engine stabilizes feature-wise. Until then, everything related to these parameters may change without notice.

In the meantime, you can reference parameter names (with comments describing new features) for all parameters available in `data/system.base.def`, which is copied directly from `src/resources/defaultMotif.ini` (the default motif config loaded before `system.def`).

The default screenpack in `data/mugen1/system.def` can also be used as a showcase of many new features, and it is ready to be copied/adapted into other screenpacks.

Refer to [this article](Miscellaneous-Info#installing_mugen) for information on how to update MUGEN screenpacks to use Ikemen GO features.

# <a name="menus">Menus</a>

Menus are defined by `menu.itemname.*` lines in your screenpack DEF. This covers the main menu, options, and all other menu screens.

## Basic rules

### Show / rename an item

```ini
menu.itemname.arcade = "ARCADE"
```

### Disable (hide) an item

Write the key **with no value** (commenting it out is not enough to disable default entries):

```ini
menu.itemname.arcade =
```

### Change order

Items appear **in the order they are written** in the DEF.

### Ikemen-only modes

Many Ikemen GO extra modes have **no `itemname` by default**, so they won’t show up unless you add them:

```ini
menu.itemname.freebattle = "QUICK MATCH"
```

## Submenus (grouping)

### Syntax

```ini
menu.itemname.<optional_submenus>.<item> = "Displayed text"
```

* `<optional_submenus>` = **any strings you want**, separated by dots. They are only for grouping (like folders).
* `<item>` = an engine-reserved item id (list below).

### How to make a submenu

A submenu needs **two parts**:

1. A line that creates the submenu entry (the “button”):

```ini
menu.itemname.extras = "EXTRAS"
```

2. Lines that put items inside it (same prefix):

```ini
menu.itemname.extras.freebattle = "QUICK MATCH"
menu.itemname.extras.back       = "BACK"
```

### Disabling a submenu

If you disable only the submenu entry:

```ini
menu.itemname.menuvideo =
```

…the contents under `menuvideo.*` will be also **removed**.

When rebuilding from scratch, do one of these:

* **Use a new submenu name**, or
* **Disable the specific items inside** the submenu.

### Notes

* `back` goes to the previous menu.
* `spacer` adds an empty line. For multiple spacers use `spacer1`, `spacer2`, etc. (any non-empty value enables them).

---

## Supported `item` names (reserved by the engine)

`item` = strings used to start modes, change settings, and control menus.

### All menus

* `back`: back to previous menu
* `spacer`: empty spacer line (use `spacer1`, `spacer2`, ...; any value enables it)

### Main menu (MUGEN defaults)

These are default MUGEN items, loaded by default if the screenpack does not override them with custom menus:

* `arcade`: Arcade Mode
* `versus`: Versus Mode
* `teamarcade`: Team Arcade
* `teamversus`: Team Versus
* `teamcoop`: Team Cooperative
* `survival`: Survival
* `survivalcoop`: Survival Cooperative
* `training`: Training Mode
* `watch`: Watch Mode
* `options`: Options
* `exit`: Exit the game

### Main menu (Ikemen GO extras)

The items listed below can be added to implement Ikemen GO exclusive modes in the menu system:

* `versuscoop`: Versus Cooperative
* `freebattle`: Quick Match
* `storymode`: Story Mode
* `serverhost`: Host Game
* `serverjoin`: Join Game (reserved submenu)
* `server`: opened automatically by `serverhost`/`serverjoin` (reserved submenu)
* `joinadd`: New IP Address
* `netplayversus`: Online Versus
* `netplayteamcoop`: Online Cooperative
* `netplaysurvivalcoop`: Online Survival
* `timeattack`: Time Attack
* `bonusgames`: Bonus Games (reserved submenu)
* `randomtest`: Endless Watch
* `replay`: Replay
* `back`: back to the previous menu
* `bonus`: used internally (reserved)
* `connect`: used internally (reserved)

New game modes can be added via external modules. In [this repository](https://github.com/ikemen-engine/modules), we share the following extra modes as a reference:

* `bossrush`: Boss Rush
* `vs100kumite`: VS 100 Kumite
* `timechallenge`: Time Challenge
* `scorechallenge`: Score Challenge

### Options

* `language`: Language
* `difficulty`: Difficulty Level
* `roundtime`: Time Limit
* `lifemul`: Life
* `singlevsteamlife`: Single VS Team Life
* `gamespeed`: Game Speed
* `roundsnumsingle`: Rounds to Win (Single)
* `maxdrawgames`: Max Draw Games
* `credits`: Credits
* `aipalette`: Arcade Palette
* `aisurvivalpalette`: Survival Palette
* `airamping`: AI Ramping
* `quickcontinue`: Quick Continue
* `autoguard`: Auto-Guard
* `dizzy`: Dizzy
* `guardbreak`: Guard Break
* `redlife`: Red Life
* `teamduplicates`: Team Duplicates
* `teamlifeshare`: Team Life Share
* `teampowershare`: Team Power Share
* `roundsnumtag`: Rounds to Win (Tag)
* `losekotag`: Partner KOed Lose
* `mintag`: Min Tag Chars
* `maxtag`: Max Tag Chars
* `roundsnumsimul`: Rounds to Win (Simul)
* `losekosimul`: Player KOed Lose
* `minsimul`: Min Simul Chars
* `maxsimul`: Max Simul Chars
* `turnsrecoverybase`: Turns Recovery Base
* `turnsrecoverybonus`: Turns Recovery Bonus
* `minturns`: Min Turns Chars
* `maxturns`: Max Turns Chars
* `gl32`: OpenGL 3.2 Renderer
* `gl21`: OpenGL 2.1 Renderer
* `vk13`: Vulkan 1.3 Renderer
* `resolution`: Resolution (reserved submenu)
* `resolution.WxH`: Resolution from suffix (e.g. `320x240`)
* `resolution.customres`: Custom resolution input
* `fullscreen`: Fullscreen
* `vsync`: VSync
* `aspectratio`: Aspect Ratio (reserved submenu)
* `aspectratio.defaultaspect`: Default Aspect Ratio
* `aspectratio.stageaspect`: Stage Aspect Ratio
* `aspectratio.customaspect`: Custom Aspect Ratio
* `aspectratio.WxH`: Aspect Ratio from suffix (e.g. `3x4`)
* `keepaspect`: Keep Aspect Ratio
* `windowscalemode`: Window Scale Mode
* `msaa`: MSAA
* `shaders`: Shaders (reserved submenu; auto-populated from `external/shaders`)
* `noshader`: Disable selected shader
* `enablemodel`: 3D Model
* `enablemodelshadow`: 3D Model Shadow
* `mastervolume`: Master Volume
* `bgmvolume`: BGM Volume
* `sfxvolume`: SFX Volume
* `audioducking`: Audio Ducking
* `stereoeffects`: Stereo Effects
* `panningrange`: Panning Range
* `keyboard`: Key Config
* `gamepad`: Joystick Config
* `inputdefault`: Reset Key/Joystick settings
* `players`: Max Players
* `debugkeys`: Debug Keys
* `debugmode`: Debug Mode
* `portchange`: Port Change
* `netcode`: Netcode
* `framedelay`: Rollback Frame Delay
* `default`: Default Values
* `savereturn`: Save and Return
* `return`: Return Without Saving

### Key menu

* `configall`: Config All
* `up`: Up
* `down`: Down
* `left`: Left
* `righ`: Right
* `a`: A
* `b`: B
* `c`: C
* `x`: X
* `y`: Y
* `z`: Z
* `start`: Start
* `d`: D
* `w`: W
* `menu`: Menu
* `rumble`: Rumble
* `bac`: Back
* `page`: Page

### Pause menu

* `keyboard`: Key Config
* `gamepad`: Joystick Config
* `inputdefault`: Reset Key/Joystick settings
* `commandlist`: Movelists
* `characterchange`: Back to select screen
* `exit`: Back to main menu
* `reset`: Round Reset
* `reload`: Rematch

### Training menu

Same as the Pause menu, with a few additional training-specific items:

* `dummycontrol`: Dummy Control
* `ailevel`: AI Level
* `dummymode`: Dummy Mode
* `guardmode`: Guard Mode
* `fallrecovery`: Fall Recovery
* `distance`: Distance
* `buttonjam`: Button Jam

---

## Extra behavior and tips

* You can mix and move items into different submenus (including nested ones) without limitations.
* Submenus should be declared before items that use them.
* In the Main Menu, if a submenu contains only one valid option (`back` does not count), Ikemen may skip showing the submenu and trigger that option directly.
* Itemnames added via external modules also work with this system.
* See `data/system.base.def` for a complete example.

### Disabling default Options categories (start from scratch)

```ini
menu.itemname.menugame =
menu.itemname.menuvideo =
menu.itemname.menuaudio =
menu.itemname.menuinput =
menu.itemname.menuengine =
menu.itemname.spacer1 =
menu.itemname.portchange = Port Change
menu.itemname.default = Default Values
menu.itemname.spacer2 =
menu.itemname.savereturn = Save and Return
menu.itemname.return = Return Without Saving
```


# <a name="select">select.def parameters and options</a>

Refer to the default `select.def` file distributed with the engine for details and guides regarding new character and stage parameters, as well as new mode options that can be set via `select.def`.