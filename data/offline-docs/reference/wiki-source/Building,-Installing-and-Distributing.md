# <a name="building">Building</a>

Refer to the BUILDING.md file provided with the engine for detailed instructions.

# <a name="installing">Installing and distributing</a>

## <a name="installing_engine">Installing the engine</a>

The latest release version of Ikemen GO is available for download on the [releases page](https://github.com/ikemen-engine/Ikemen-GO/releases). For those who want to test experimental features (at the cost of possible unreported bugs), the nightly version can be found on the releases page [under the "nightly" tag](https://github.com/ikemen-engine/Ikemen-GO/releases/tag/nightly). Both versions of the engine comes with sample content, so it's ready to use right after extracting it.

## <a name="installing_chars">Installing characters and stages</a>

Extract downloaded characters into the `chars` directory and stages into the `stages` directory. Character and stages also have to be added into the `select.def` file (by default located in `data/select.def`, but the path can be changed by custom motifs, read below for more information).

Refer to the default `select.def` file distributed with the engine for more detailed information on how to add characters and stages.

***NOTE***: if using Android, ***DO NOT*** edit `data/select.def` directly! Place a copy of the `select.def` in the subfolder of your chosen motif e.g. if your motif folder with your `system.def` is the default `ikemen1` motif, then place a copy of `select.def` in `data/ikemen1/select.def` and edit that file. Android will overwrite `data/select.def` by default if any changes are detected due to the automatic update logic that is normally used by the application to extract assets for first-time installs and nightly upgrade logic.

## <a name="installing_motifs">Using motifs</a>

A motif is a custom configuration of the graphics and sounds used in the game's interface, as well as other things such as the character roster. The base motif is found in the *data/* directory. Custom motifs are placed as subdirectories under *data/*. For example, the "kfm" motif is placed in *data/kfm/* directory and can be assigned as `motif` in *save/config.json* or called via `-r` [command line argument](Miscellaneous-Info/#cmd).

Here's what a motif covers:
- character roster and stage list, character and stage parameters, basic modes settings (select.def)
- screenpack definition file with parameters that control graphics, sounds and music interface, customization options (system.def)
- storyboard files
- lifebar definition file with parameters that control fight screen graphics and sounds (fight.def)

To set the default motif, edit the `save/config.json` file (equivalent to Mugen's `data/mugen.cfg`) with a text editor, and change "motif" setting to your motif path, e.g. *data/kfm/system.def*.

To install a downloaded motif, first extract the file into a new directory. Open that directory to see if there are files in it; if so, move that directory into Ikemen's *data/* directory. If there is a single directory instead, move that bottom-level directory into the *data/* directory.

## <a name="installing_customizing">Customizing and distributing motifs</a>

First things first, let's quote Mugen's system.def file:

***DO NOT MODIFY OR OVERWRITE MOTIF FILES***

Information like this is also present in Mugen's read me file. While not enforced, following this advice is even more important in Ikemen Go than it used to be in Mugen, due to how often this engine is updated and how base files are meant to be used as a working example of new features. Keeping the content portable makes migration between versions much easier.

To make your own motif, create a subdirectory under *data/* with the name of your motif, and copy system.def into the new directory. If you'd like to edit any other files besides system.def, make copies of them in your motif directory and change them there. Any data file that doesn't exist in your motif directory will default to the one in the *data/* directory, so if you did not copy *select.def* over, *data/select.def* will be used when you run with your motif selected.

Fonts are search in directories in the following order:
- motif subdirectory
- *data/* directory (not recommended to keep custom fonts here)
- *font/* directory (not recommended to keep custom fonts here)

In other words the recommended place for custom fonts is inside your motif subdirectory, alongside all the other motif files (use relative paths to reference subdirectory, E.g. *font/myFont.def* referenced in *data/kfm/system.def* file will first check if the font is present in *data/kfm/font/myFont.def* path, before looking anywhere else)

Unless you're making a fullgame/compilation, do NOT distribute your motif with Ikemen GO executable or files that are not related to motif. The engine is available on different operating systems, so for many users convince of having an executable included in the package is meaningless. Files unrelated to motif makes migration between engine version harder for people that want to install your motif.

## <a name="installing_mugen">Updating Mugen content</a>

Ikemen GO aims for full compatibility with characters, stages, storyboards, lifebars and screenpacks released for Mugen 1.0 and Mugen 1.1 (official engine releases). When it comes to Winmugen content the compatibility is meant to be at the same level as Mugen 1.1 (we're not aiming for better backward compatibility than Mugen itself does). If something doesn't work it means that either the content itself is buggy (Ikemen Go engine and scripts are less tolerant for wrong syntax compared to Mugen) or it's a compatibility issue that should be [reported here](https://github.com/ikemen-engine/Ikemen-GO/issues). Be sure to search to make sure your issue hasn't already been reported.

Characters and stages can use any of the new Ikemen GO features, regardless of `mugenversion` parameter set in their DEF files.

To maintain backward compatibility with Mugen content, almost all Ikemen GO specific screenpack and lifebar features are disabled by default - after installing a Mugen motif you will get pretty much the same functionality as in vanilla Mugen, with almost none of the Ikemen GO additions, such as [submenus](Screenpack-features/#submenus), new [game modes](Miscellaneous-Info/#modes), [tag](Miscellaneous-Info/#tag) and [ratio](Miscellaneous-Info/#ratio) team modes, [score](Miscellaneous-Info/#score) system, and many other features unique to Ikemen GO.

In order to update Mugen motifs start by testing the engine, without replacing default screenpack and lifebar, to familiarize yourself with new functionalities. Ikemen GO comes with default motif files that can be used as a base for updating Mugen screenpack and lifebars:
- *data/select.def*: character roster and stage list with comments explaining all the new character and stage parameters, as well as basic modes settings
- *data/system.def*: Winmugen 240p screenpack definition file
- *data/mugen1/system.def*: Mugen 1.0 720p screenpack definition file
- *data/big/system.def*: a version of Mugen 1.0 720p screenpack with more slots
- *data/fight.def*: Winmugen 240p lifebar definition file
- *data/mugen1/system.def*: Mugen 1.0 720p lifebar definition file

Updating Mugen motif is a matter of copying new motif sections and parameters over from one of the default Ikemen GO motif DEF files to your screenpack and/or lifebar DEF files, and adjusting their values as needed. They are all marked with *Ikemen feature* comment, for easier recognizing which parameters are unique to Ikemen GO. You don't need special knowledge to do so - any Mugen screenpack or lifebar tutorial will teach you how to work with motifs.

As of today only new [lifebar features](Lifebar-features) have been fully documented. As mentioned in the [screenpack page](Screenpack-features), screenpack parameters won't be documented until the engine stabilize feature-wise. Until then everything related to these parameters may change without notice. Most of the new screenpack parameters have self-explanatory names though, so it should be fairly easy to use them despite lack of documentation.

`data/work` directory contains art and sound assets that can be easily imported to your custom screenpack and lifebar files using [Fighter Factory](http://fighterfactory.virtualltek.com/) program (*import.ffe* files can be used to automate assets importing).

## <a name="installing_updating">Updating to new engine version</a>

Updating to new version (if you use content that follows guidance present in this article) is a matter of moving over your motif subdirectory, *chars*, *sound*, *stage* folders and setting correct path in *save/config.json* `motif` setting. About a minute of work total.

## <a name="installing_android">Installing additional content (Android)</a>

Additional content can be installed to the Android version by either plugging it in File Transfer mode on supported devices, or by issuing ADB commands to the `/sdcard/Android/data/org.ikemen_engine.ikemen_go/files/` and its respective directories (all typical folders from the Nightly such as `data`, `chars`, `stages`, etc. will be located here). (Note: `/sdcard/` is a special folder on Android, the device does not need to have an SD card to have this folder)

For example, to push a new options.lua using adb:
```bash
adb push /path/to/external/script/options.lua /sdcard/Android/data/org.ikemen_engine.ikemen_go/files/external/script/options.lua
```

# <a name="linux_compatibility">Linux Distro Compatibility</a>

Linux distro compatibility as of 2024-03-26

- Ubuntu/Debian - Supported
- Arch/Artix - Requires GlibC/Mesa/OpenAL installed/updated
- SUSE - Supported
- Manjaro - Supported
- Fedora - Supported
- Tiny Core - Unsupported
- Puppy - Requires GlibC/Mesa/OpenAL installed/updated
- Batocera - [Supported](https://wiki.batocera.org/systems:ikemen)
- Solus - ?
- Kali - Requires GlibC/Mesa/OpenAL installed/updated  
- Alpine - Requires building against MUSL

Thanks to Cylia Margatroid and Gacel for testing.