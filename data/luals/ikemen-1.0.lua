---@meta IKEMEN_GO_1_0

-- Generated from the locally archived official IKEMEN GO 1.0 Lua API.
-- This file exists for Lua Language Server analysis and is never executed by IKEMEN.

hook = hook or {}

---Add a character definition to the select screen.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#addchar
---@param defpath any
---@param params any
---@return any result Name: Type: Description; success: boolean: true if the character was added successfully, false otherwise.
function addChar(defpath, params) end

---Register a global keyboard shortcut that runs Lua code.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#addhotkey
---@param key any
---@param ctrl any
---@param alt any
---@param shift any
---@param allowDuringPause any
---@param debugOnly any
---@param script any
---@return any result Name: Type: Description; success: boolean: true if the shortcut was registered, false if the key name is invalid.
function addHotkey(key, ctrl, alt, shift, allowDuringPause, debugOnly, script) end

---Add a stage definition to the select screen.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#addstage
---@param defpath any
---@param params any
---@return any result Name: Type: Description; success: boolean: true if the stage was added successfully, false otherwise.
function addStage(defpath, params) end

---Add an offset to an animation's current position.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animaddpos
---@param anim any
---@param dx any
---@param dy any
function animAddPos(anim, dx, dy) end

---Copy velocity parameters from one animation to another.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animapplyvel
---@param target any
---@param source any
function animApplyVel(target, source) end

---Create a copy of an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animcopy
---@param anim any
---@return any result Name: Type: Description; copy: Anim\: nil: New Anim userdata containing a copy of anim, or nil if anim is nil.
function animCopy(anim) end

---Print debug information about an animation to the console.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animdebug
---@param anim any
---@param prefix any
function animDebug(anim, prefix) end

---Queue drawing of an animation on a render layer.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animdraw
---@param anim any
---@param layer any
function animDraw(anim, layer) end

---Get timing information for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animgetlength
---@param anim any
---@return any result Name: Type: Description; length: int32: Effective animation length in ticks (as returned by Anim.GetLength()).; totaltime: int32: Raw totaltime field from the underlying Animation.
function animGetLength(anim) end

---Get a preloaded character animation by sprite group/number.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animgetpreloadedchardata
---@param charRef any
---@param group any
---@param number any
---@param keepLoop any
---@return any result Name: Type: Description; anim: Anim\: nil: A new Anim userdata wrapping the preloaded animation, or nil if no matching animation exists.
function animGetPreloadedCharData(charRef, group, number, keepLoop) end

---Get a preloaded stage animation by sprite group/number.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animgetpreloadedstagedata
---@param stageRef any
---@param group any
---@param number any
---@param keepLoop any
---@return any result Name: Type: Description; anim: Anim\: nil: A new Anim userdata wrapping the preloaded animation, or nil if no matching animation exists.
function animGetPreloadedStageData(stageRef, group, number, keepLoop) end

---Get information about a sprite used by an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animgetspriteinfo
---@param anim any
---@param group any
---@param number any
---@return any result Name: Type: Description; info: table\: nil: Table with:- Group (uint16) sprite group number- Number (uint16) sprite number- Size (uint16[2]) {width, height}- Offset (int16[2]) {x, y}- palidx (int) palette index used for this sprite,or nil if no sprite is available.
function animGetSpriteInfo(anim, group, number) end

---Load palettes for an animation's underlying sprite file, if palette usage is enabled.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animloadpalettes
---@param anim any
---@param param any
function animLoadPalettes(anim, param) end

---Create a new animation from a sprite file and action definition.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animnew
---@param sff any
---@param actOrAnim any
---@return any result Name: Type: Description; anim: Anim: Newly created animation userdata.
function animNew(sff, actOrAnim) end

---Get a palette from an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animpaletteget
---@param anim any
---@param paletteId any
---@return any result Name: Type: Description; palette: table: Array-like table where each entry is {r, g, b, a}.
function animPaletteGet(anim, paletteId) end

---Set colors in an animation palette.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animpaletteset
---@param anim any
---@param paletteId any
---@param palette any
function animPaletteSet(anim, paletteId, palette) end

---Prepare an animation so that each character can apply its own palette.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animprepare
---@param anim any
---@param charRef any
---@return any result Name: Type: Description; preparedAnim: Anim: Either a copy with adjusted palette data (when palette usage is enabled) or the original anim when palette handling is disabled.
function animPrepare(anim, charRef) end

---Reset an animation to its initial state, fully or partially.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animreset
---@param anim any
---@param parts any
function animReset(anim, parts) end

---Set gravity/acceleration applied to an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetaccel
---@param anim any
---@param ax any
---@param ay any
function animSetAccel(anim, ax, ay) end

---Set alpha blending for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetalpha
---@param anim any
---@param src any
---@param dst any
function animSetAlpha(anim, src, dst) end

---Set rotation angle for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetangle
---@param anim any
---@param angle any
function animSetAngle(anim, angle) end

---Replace an animation's underlying Animation data.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetanimation
---@param anim any
---@param actOrAnim any
function animSetAnimation(anim, actOrAnim) end

---Set the color key (transparent index) used by an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetcolorkey
---@param anim any
---@param index any
function animSetColorKey(anim, index) end

---Change the active palette mapping for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetcolorpalette
---@param anim any
---@param paletteId any
---@return any result Name: Type: Description; anim: Anim: The same animation userdata (for chaining).
function animSetColorPalette(anim, paletteId) end

---Set the facing (horizontal flip) of an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetfacing
---@param anim any
---@param facing any
function animSetFacing(anim, facing) end

---Set focal length used for perspective projection on an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetfocallength
---@param anim any
---@param fLength any
function animSetFocalLength(anim, fLength) end

---Set friction applied to an animation's velocity.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetfriction
---@param anim any
---@param fx any
---@param fy any
function animSetFriction(anim, fx, fy) end

---Set the render layer used by an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetlayerno
---@param anim any
---@param layer any
function animSetLayerno(anim, layer) end

---Set the local coordinate system for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetlocalcoord
---@param anim any
---@param width any
---@param height any
function animSetLocalcoord(anim, width, height) end

---Set maximum drawing distance (clipping bounds) for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetmaxdist
---@param anim any
---@param maxX any
---@param maxY any
function animSetMaxDist(anim, maxX, maxY) end

---Configure palette effects for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetpalfx
---@param anim any
---@param palfx any
function animSetPalFX(anim, palfx) end

---Set animation position, optionally overriding only one axis.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetpos
---@param anim any
---@param x any
---@param y any
function animSetPos(anim, x, y) end

---Set projection mode for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetprojection
---@param anim any
---@param projection any
function animSetProjection(anim, projection) end

---Set the scale of an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetscale
---@param anim any
---@param sx any
---@param sy any
function animSetScale(anim, sx, sy) end

---Configure tiling for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsettile
---@param anim any
---@param tileX any
---@param tileY any
---@param spacingX any
---@param spacingY any
function animSetTile(anim, tileX, tileY, spacingX, spacingY) end

---Set the base velocity of an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetvelocity
---@param anim any
---@param vx any
---@param vy any
function animSetVelocity(anim, vx, vy) end

---Set the clipping window for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetwindow
---@param anim any
---@param x1 any
---@param y1 any
---@param x2 any
---@param y2 any
function animSetWindow(anim, x1, y1, x2, y2) end

---Set rotation angle around the X axis for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetxangle
---@param anim any
---@param xangle any
function animSetXAngle(anim, xangle) end

---Set the X shear factor applied when drawing an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetxshear
---@param anim any
---@param shear any
function animSetXShear(anim, shear) end

---Set rotation angle around the Y axis for an animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animsetyangle
---@param anim any
---@param yangle any
function animSetYAngle(anim, yangle) end

---Advance an animation by one tick. By default, only the first call per frame advances the animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#animupdate
---@param anim any
---@param force any
function animUpdate(anim, force) end

---Queue drawing of many animations in one call.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#batchdraw
---@param batch any
function batchDraw(batch) end

---Print debug information about a background definition.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#bgdebug
---@param bg any
---@param prefix any
function bgDebug(bg, prefix) end

---Queue drawing of a background definition.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#bgdraw
---@param bg any
---@param layer any
---@param x any
---@param y any
---@param scale any
function bgDraw(bg, layer, x, y, scale) end

---Load a background definition from a sprite file and configuration.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#bgnew
---@param sff any
---@param defPath any
---@param section any
---@param model any
---@param defaultLayer any
---@return any result Name: Type: Description; bg: BGDef: Loaded background definition userdata.
function bgNew(sff, defPath, section, model, defaultLayer) end

---Reset a background definition to its initial state.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#bgreset
---@param bg any
function bgReset(bg) end

---[redirectable] Change the character's current animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#changeanim
---@param animNo any
---@param elem any
---@param ffx any
---@return any result Name: Type: Description; success: boolean: true if the animation exists and was changed, false otherwise.
function changeAnim(animNo, elem, ffx) end

---[redirectable] Change the character's current state or disable it.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#changestate
---@param stateNo any
---@return any result Name: Type: Description; success: boolean: true if an existing state was entered, false otherwise. Passing -1 disables the character and returns false.
function changeState(stateNo) end

---Clear all characters' clipboard text buffers.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#clear
function clear() end

---Stop all currently playing sounds.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#clearallsound
function clearAllSound() end

---Fill the screen with a solid color (with optional alpha).
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#clearcolor
---@param r any
---@param g any
---@param b any
---@param alpha any
function clearColor(r, g, b, alpha) end

---Clear text printed to the in-engine console.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#clearconsole
function clearConsole() end

---Clear all current select-screen choices (characters, stages, music, game params).
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#clearselected
function clearSelected() end

---Register a UI command definition.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#commandadd
---@param name any
---@param command any
---@param time any
---@param bufferTime any
---@param bufferHitpause any
---@param bufferPauseend any
---@param stepTime any
function commandAdd(name, command, time, bufferTime, bufferHitpause, bufferPauseend, stepTime) end

---Reset command input buffers.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#commandbufreset
---@param playerNo any
function commandBufReset(playerNo) end

---Print debug information about a command list.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#commanddebug
---@param playerNo any
---@param prefix any
function commandDebug(playerNo, prefix) end

---Query the current state of a named command.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#commandgetstate
---@param playerNo any
---@param name any
---@return any result Name: Type: Description; active: boolean: true if the command is currently active, false otherwise.
function commandGetState(playerNo, name) end

---Compute and store ranking data for a mode, returning whether it was cleared.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#computeranking
---@param mode any
---@return any result Name: Type: Description; cleared: boolean: true if the run cleared the mode's requirements.; place: int32: Ranking position (1-based), or 0 if unranked / skipped / not visible.
function computeRanking(mode) end

---Check if the main menu network connection is established.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#connected
---@return any result Name: Type: Description; connected: boolean: true if connected to a netplay peer, false otherwise.
function connected() end

---Check whether the current run used a continue.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#continued
---@return any result Name: Type: Description; continued: boolean: true if the continue flag is set.
function continued() end

---Signal that the current match should end (using fight screen fade-out settings).
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#endmatch
function endMatch() end

---Enter netplay as client or host.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#enternetplay
---@param host any
function enterNetPlay(host) end

---Enter replay playback mode from a replay file.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#enterreplay
---@param path any
---@return any result Name: Type: Description; success: boolean: true if the replay file was opened and playback started, false otherwise.
function enterReplay(path) end

---Get or set the global escape flag.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#esc
---@param value any
---@return any result Name: Type: Description; esc: boolean: Current value of the escape flag.
function esc(value) end

---Exit netplay mode and close any active netplay connection.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#exitnetplay
function exitNetPlay() end

---Exit replay mode and restore normal video settings.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#exitreplay
function exitReplay() end

---Check whether any global motif fade is active.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#fadeactive
---@return any result Name: Type: Description; active: boolean: true if fade-in or fade-out is currently running.
function fadeActive() end

---Initialize a Fade object using motif fade-in settings.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#fadeininit
---@param fade any
function fadeInInit(fade) end

---Instantiates a Fade userdata for use with fadeInInit and fadeOutInit.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#fadenew
---@param params any
---@return any result Name: Type: Description; fade: Fade: Fade userdata.
function fadeNew(params) end

---Initialize a Fade object using motif fade-out settings.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#fadeoutinit
---@param fade any
function fadeOutInit(fade) end

---Immediately stop any running global motif fade.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#fadeskip
function fadeSkip() end

---Test whether a file exists, after engine path resolution.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#fileexists
---@param path any
---@return any result Name: Type: Description; exists: boolean: true if the file exists, false otherwise.
function fileExists(path) end

---Find the next entity whose name contains the given text.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#findentitybyname
---@param text any
function findEntityByName(text) end

---Find the next entity with the given player ID.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#findentitybyplayerid
---@param playerId any
function findEntityByPlayerId(playerId) end

---Find the next helper with the given helper ID.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#findhelperbyid
---@param helperId any
function findHelperById(helperId) end

---Get basic font definition information.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#fontgetdef
---@param font any
---@return any result Name: Type: Description; def: table: A table:- Type (string) font type identifier- Size (uint16[2]) {width, height} in pixels- Spacing (int32[2]) {x, y} spacing in pixels- offset (int32[2]) {x, y} base drawing offset
function fontGetDef(font) end

---Load a font from file.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#fontnew
---@param filename any
---@param height any
---@return any result Name: Type: Description; font: Fnt: Loaded font userdata. If loading fails, a fallback font is returned.
function fontNew(filename, height) end

---Enable single-frame stepping mode.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#framestep
function frameStep() end

---Execute a full match using the current configuration.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#game
---@return any result Name: Type: Description; winSide: int32: Winning side index (1 or 2), 0 for draw, -1 if the game was ended externally.; controllerNo: int: 1-based controller index of the challenger player interrupting arcade mode.
function game() end

---Check whether a match is currently running.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#gamerunning
---@return any result Name: Type: Description; running: boolean: true if gameplay is currently active.
function gameRunning() end

---[redirectable] Get the character's number of elements in the animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getanimelemcount
---@return any result Name: Type: Description; count: int: Number of animation elements.
function getAnimElemCount() end

---[redirectable] Get the character's current accumulated time of the animation.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getanimtimesum
---@return any result Name: Type: Description; timeSum: int32: Current animation time value.
function getAnimTimeSum() end

---Resolve and read basic information from a character definition file.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getcharattachedinfo
---@param def any
---@return any result Name: Type: Description; info: table\: nil: A table:- name (string) character display name (or internal name as fallback)- def (string) resolved .def path- sound (string) sound file path from the [Files] section,or nil if the .def file cannot be resolved.
function getCharAttachedInfo(def) end

---Get the definition file path for a character slot.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getcharfilename
---@param charRef any
---@return any result Name: Type: Description; defPath: string: Resolved .def path for this slot.
function getCharFileName(charRef) end

---Get detailed information about a character slot.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getcharinfo
---@param charRef any
---@return any result Name: Type: Description; info: table: A table:- name (string) character display name- author (string) author string- def (string) definition file path- sound (string) sound file path- intro (string) intro def path- ending (string) ending def path- arcadepath (string) arcade path override- localcoord (float32) base localcoord width- portraitscale (float32) scale applied to portraits- cnsscale (float32[]) scale values from the CNS configuration- pal (int32[]) available palette numbers (at least {1})- paldefaults (int32[]) default palette numbers (at least {1})- palkeymap (table) palette key remaps, indexed by original palette slot
function getCharInfo(charRef) end

---Get the display name of a character slot.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getcharname
---@param charRef any
---@return any result Name: Type: Description; name: string: Character display name.
function getCharName(charRef) end

---Query the background preload state of a character slot.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getcharpreloadstatus
---@param charRef any
---@return any result Name: Type: Description; state: string: Preload state: "idle", "queued", "loading", or "ready".
function getCharPreloadStatus(charRef) end

---Get a random valid palette number for a character slot.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getcharrandompalette
---@param charRef any
---@return any result Name: Type: Description; palNo: int32: Palette number; defaults to 1 if the character has no palette list.
function getCharRandomPalette(charRef) end

---Get parsed select parameters for a character entry.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getcharselectparams
---@param charRef any
---@return any result Name: Type: Description; params: table: Lua table created from the comma-separated params string passed to addChar().
function getCharSelectParams(charRef) end

---Get the current system clipboard string.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getclipboardstring
---@return any result Name: Type: Description; text: string: Clipboard contents, or an empty string if unavailable.
function getClipboardString() end

---Get all command-line flags passed to the engine.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getcommandlineflags
---@return any result Name: Type: Description; flags: table: A table mapping raw flag keys to their values (string).
function getCommandLineFlags() end

---Get the value of a specific command-line flag.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getcommandlinevalue
---@param flagName any
---@return any result Name: Type: Description; value: string\: nil: Value associated with the flag, or nil if the flag is not present.
function getCommandLineValue(flagName) end

---Get the number of consecutive wins for a team.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getconsecutivewins
---@param teamSide any
---@return any result Name: Type: Description; wins: int32: Number of consecutive wins for the given side.
function getConsecutiveWins(teamSide) end

---Get the current credit count.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getcredits
---@return any result Name: Type: Description; credits: int32: Current number of credits.
function getCredits() end

---Recursively list all paths under a directory.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getdirectoryfiles
---@param rootPath any
---@return any result Name: Type: Description; paths: table: Array-like table of visited paths (files and directories).
function getDirectoryFiles(rootPath) end

---Get the global frame counter value.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getframecount
---@return any result Name: Type: Description; frameCount: int32: Number of frames elapsed since engine start.
function getFrameCount() end

---Get the current measured gameplay FPS.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getgamefps
---@return any result Name: Type: Description; fps: float32: Current gameplay frames per second.
function getGameFPS() end

---Get the current game parameter table.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getgameparams
---@return any result Name: Type: Description; params: table: Current game parameters as a Lua table.
function getGameParams() end

---Get the current game logic speed as a percentage.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getgamespeed
---@return any result Name: Type: Description; speedPercent: int32: Integer game logic speed relative to 60 FPS (100 = normal speed).
function getGameSpeed() end

---Read accumulated game statistics.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getgamestats
---@return any result Name: Type: Description; stats: table: Statistics log object as a Lua table.
function getGameStats() end

---Get a JSON snapshot of accumulated game statistics.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getgamestatsjson
---@return any result Name: Type: Description; json: string: JSON-encoded snapshot containing stats and related flags.
function getGameStatsJson() end

---Check raw UI input for one or more players.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getinput
---@param players any
---@vararg any
---@return any result Name: Type: Description; pressed: boolean: true if any provided token set is active for any selected player.
function getInput(players, ...) end

---Get the hold time of a raw input token for one or more players.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getinputtime
---@param players any
---@vararg any
---@return any result Name: Type: Description; time: int32: Hold time in ticks for the first active token found, or 0 if none are active.
function getInputTime(players, ...) end

---Get a joystick's GUID string.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getjoystickguid
---@param index any
---@return any result Name: Type: Description; guid: string: GUID string for the joystick, or an empty string if invalid.
function getJoystickGUID(index) end

---Poll joystick input and return the corresponding key string.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getjoystickkey
---@param controllerIdx any
---@return any result Name: Type: Description; keyName: string: Engine key string for the pressed control (empty string if none).; joystickIndex: int: 1-based joystick index that generated the input; -1 if no input.
function getJoystickKey(controllerIdx) end

---Get a joystick's display name.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getjoystickname
---@param index any
---@return any result Name: Type: Description; name: string: Human-readable joystick name, or an empty string if invalid.
function getJoystickName(index) end

---Check whether a joystick is present.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getjoystickpresent
---@param index any
---@return any result Name: Type: Description; present: boolean: true if the joystick is connected, false otherwise.
function getJoystickPresent(index) end

---Query or compare the last pressed key.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getkey
---@param key any
---@return any result Name: Type: Description; result: string\: boolean: Last key name when called without arguments, or a boolean match result when key is provided.
function getKey(key) end

---Get the last input text associated with the current key event.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getkeytext
---@return any result Name: Type: Description; text: string: If the last key was Insert, returns the clipboard contents, otherwise returns the textual representation of the last key press. Empty string if none.
function getKeyText() end

---Get the last controller that produced UI input.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getlastinputcontroller
---@return any result Name: Type: Description; playerNo: int: 1-based player/controller index, or -1 if unavailable.
function getLastInputController() end

---Get the accumulated match time from completed rounds.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getmatchtime
---@return any result Name: Type: Description; time: int32: Total round time accumulated in ticks.
function getMatchTime() end

---[redirectable] Get the character's movelist text.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getmovelist
---@return any result Name: Type: Description; movelist: string: Movelist text.
function getMovelist() end

---Return a 32-bit random number, updating the global seed.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getrandom
---@return any result Name: Type: Description; value: int32: Random value (1 to 2147483646 inclusive).
function getRandom() end

---Get the input remap target for a player.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getremapinput
---@param playerNo any
---@return any result Name: Type: Description; mappedPlayerNo: int: 1-based remapped player/controller index.
function getRemapInput(playerNo) end

---Get the configured round time limit.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getroundtime
---@return any result Name: Type: Description; time: int32: Round time limit in ticks (or special values as configured).
function getRoundTime() end

---Get the current runtime operating system identifier.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getruntimeos
---@return any result Name: Type: Description; os: string: Runtime OS name as reported by Go (for example "windows", "linux").
function getRuntimeOS() end

---[redirectable] Get the character's select slot index.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getselectno
---@return any result Name: Type: Description; selectNo: int: Current select slot index.
function getSelectNo() end

---Pop the current session warning message.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getsessionwarning
---@return any result Name: Type: Description; warning: string: Current session warning message, or an empty string if none.
function getSessionWarning() end

---Get information about a stage slot.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getstageinfo
---@param stageRef any
---@return any result Name: Type: Description; info: table\: nil: A table:- name (string) stage display name- def (string) definition file path- localcoord (float32) base localcoord width- portraitscale (float32) scale applied to stage portraits- attachedchardef (string[]) list of attached character .def paths
function getStageInfo(stageRef) end

---Get the currently selected stage slot index.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getstageno
---@return any result Name: Type: Description; stageRef: int: Currently selected stage reference as stored by the select system: 0 means random stage, -1 means no stage selected, positive values are 1-based stage slots.
function getStageNo() end

---Query the background preload state of a stage slot.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getstagepreloadstatus
---@param stageRef any
---@return any result Name: Type: Description; state: string: Preload state: "idle", "queued", "loading", or "ready".
function getStagePreloadStatus(stageRef) end

---Get parsed select parameters for a stage entry.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getstageselectparams
---@param stageRef any
---@return any result Name: Type: Description; params: table: Lua table created from the comma-separated params string passed to addStage().
function getStageSelectParams(stageRef) end

---[redirectable] Get the character's player ID.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getstateownerid
---@return any result Name: Type: Description; playerId: int32: Player ID of the current state owner.
function getStateOwnerId() end

---[redirectable] Get the character's name of the current state owner.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getstateownername
---@return any result Name: Type: Description; name: string: Name of the current state owner.
function getStateOwnerName() end

---[redirectable] Get the character's player number of the current state owner.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getstateownerplayerno
---@return any result Name: Type: Description; playerNo: int: 1-based player number of the current state owner.
function getStateOwnerPlayerNo() end

---Get the current storyboard scene index.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getstoryboardscene
---@return any result Name: Type: Description; sceneIndex: int\: nil: Current storyboard scene index, or nil if no storyboard is active.
function getStoryboardScene() end

---Get a formatted timestamp string.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#gettimestamp
---@param format any
---@return any result Name: Type: Description; timestamp: string: Current time formatted according to format.
function getTimestamp(format) end

---Get the winning team side of the current or last match.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#getwinnerteam
---@return any result Name: Type: Description; teamSide: int32: Winning team side (1 or 2), 0 for draw/undecided, or -1 when unavailable.
function getWinnerTeam() end

---Adds a function to a hook list.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#hookadd
---@param list any
---@param name any
---@param func any
function hook.add(list, name, func) end

---Runs all functions registered in a hook list.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#hookrun
---@param list any
---@vararg any
function hook.run(list, ...) end

---Runs functions from a hook list until one returns a non-nil value.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#hookrunfirst
---@param list any
---@vararg any
---@return any result first non-nil value, or nil if nothing handled the call.
function hook.runFirst(list, ...) end

---Removes a hook from a list.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#hookstop
---@param list any
---@param name any
function hook.stop(list, name) end

---Check whether a UI action name is currently active.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#isuikeyaction
---@param action any
---@return any result Name: Type: Description; active: boolean: true if the action is currently active.
function isUIKeyAction(action) end

---Decode a JSON file into Lua values.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#jsondecode
---@param path any
---@return any result Name: Type: Description; value: any: Decoded JSON root value (Lua string, number, boolean, table or nil).
function jsonDecode(path) end

---Encode a Lua value to JSON and save it to a file.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#jsonencode
---@param value any
---@param path any
function jsonEncode(value, path) end

---Load an AIR/animation definition file and return an animation table.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loadanimtable
---@param path any
---@param sff any
---@return any result Name: Type: Description; animTable: table: Table mapping action numbers (int32) to Animation userdata. Each value is a parsed Animation (usable with animNew and animSetAnimation).
function loadAnimTable(path, sff) end

---Cancel an in-progress background load, clean up partially loaded assets, and reset the netplay loading handshake.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loadcancel
function loadCancel() end

---Load and set the font used by the debug overlay.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loaddebugfont
---@param filename any
---@param scale any
function loadDebugFont(filename, scale) end

---Register Lua functions to be called for debug info display.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loaddebuginfo
---@param funcs any
function loadDebugInfo(funcs) end

---Register the Lua function used to draw debug status.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loaddebugstatus
---@param funcName any
function loadDebugStatus(funcName) end

---Load the fight screen definition.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loadfightscreen
---@param defPath any
function loadFightScreen(defPath) end

---Load and compile a Lua file through the engine file system.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loadfile
---@param filename any
---@return any result Name: Type: Description; chunk: function\: nil: Compiled Lua chunk on success, or nil if loading failed.; error: string: Error message when loading failed.
function loadFile(filename) end

---Load game options from a config file and return the current config as a table.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loadgameoption
---@param filename any
---@return any result Name: Type: Description; cfg: table: Table representation of the current game configuration.
function loadGameOption(filename) end

---Check whether resources are currently being loaded.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loading
---@return any result Name: Type: Description; loading: boolean: true if the loader is in LSLoading state.
function loading() end

---Load an INI file and convert it to a nested Lua table.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loadini
---@param filename any
---@param normalizeSections any
---@param keepMeta any
---@return any result Name: Type: Description; ini: table: Table of sections; each section is a table of keys to strings. Dotted keys are converted to nested subtables.
function loadIni(filename, normalizeSections, keepMeta) end

---Load a motif and return its configuration as a table.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loadmotif
---@param defPath any
---@return any result Name: Type: Description; motif: table: Motif configuration table (includes menus, fonts, sounds, etc.).
function loadMotif(defPath) end

---Validate selection and start asynchronous loading of characters and stage.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loadstart
---@param params any
function loadStart(params) end

---Request loading of a previously saved state on the next frame.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loadstate
function loadState() end

---Load a storyboard and set it as the current storyboard.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loadstoryboard
---@param defPath any
---@return any result Name: Type: Description; storyboard: table\: nil: Storyboard configuration table on success, or nil if no path is given or loading fails (a warning is printed).
function loadStoryboard(defPath) end

---Load a text file and return its contents.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#loadtext
---@param path any
---@return any result Name: Type: Description; content: string\: nil: File contents on success, or nil if the file cannot be read.
function loadText(path) end

---[redirectable] Set the character's map value.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#mapset
---@param name any
---@param value any
---@param mapType any
function mapSet(name, value, mapType) end

---Load a 3D model (glTF) as a Model object.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#modelnew
---@param filename any
---@return any result Name: Type: Description; model: Model: Model userdata.
function modelNew(filename) end

---Modify a game option using a query string path.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#modifygameoption
---@param query any
---@param value any
function modifyGameOption(query, value) end

---Modify a motif using a query string path.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#modifymotif
---@param query any
---@param value any
function modifyMotif(query, value) end

---Modify a currently loaded storyboard using a query string path.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#modifystoryboard
---@param query any
---@param value any
function modifyStoryboard(query, value) end

---Returns whether a motif value was inherited from another motif parameter.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#motifisinherited
---@param key any
---@return any result Name: Type: Description; boolean
function motifIsInherited(key) end

---Poll the non-blocking netplay loading handshake. Returns true when both peers have finished loading, or immediately if not in netplay.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#netloadingready
---@return any result Name: Type: Description; ready: boolean: true if both sides are ready (or no net connection exists).
function netLoadingReady() end

---Check whether the current session is running in netplay mode.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#netplay
---@return any result Name: Type: Description; active: boolean: true if netplay is currently active.
function netPlay() end

---Raise an immediate Lua error with a custom message.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#panicerror
---@param message any
function panicError(message) end

---Check whether gameplay is currently paused.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#paused
---@return any result Name: Type: Description; paused: boolean: true if the game is paused and not currently frame-stepping.
function paused() end

---[redirectable] Control background music playback.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#playbgm
---@param params any
function playBgm(params) end

---Reset player input buffers and disable hardcoded keys.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#playerbufreset
---@param playerNo any
function playerBufReset(playerNo) end

---[redirectable] Play the character's sound.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#playsnd
function playSnd() end

---Check whether post-match processing is active.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#postmatch
---@return any result Name: Type: Description; active: boolean: true if the engine is in post-match state.
function postMatch() end

---Check whether resources are currently being preloaded.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#preloading
---@return any result Name: Type: Description; boolean: true if assets are still being preloaded.
function preloading() end

---Mark a character sprite or animation for preloading.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#preloadlistchar
---@param id any
---@param number any
function preloadListChar(id, number) end

---Mark a stage sprite or animation for preloading.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#preloadliststage
---@param id any
---@param number any
function preloadListStage(id, number) end

---Print text to the in-game console and standard output.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#printconsole
---@param text any
---@param appendLast any
function printConsole(text, appendLast) end

---Print text to standard output (stdout) only.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#puts
---@param text any
function puts(text) end

---Queue a character for background preloading of portraits and palettes.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#queuecharpreload
---@param charRef any
---@param priority any
function queueCharPreload(charRef, priority) end

---Queue a stage for background preloading of portraits.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#queuestagepreload
---@param stageRef any
---@param priority any
function queueStagePreload(stageRef, priority) end

---Print a rectangle's debug information.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#rectdebug
---@param rect any
---@param prefix any
function rectDebug(rect, prefix) end

---Queue drawing of a rectangle.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#rectdraw
---@param rect any
---@param layer any
function rectDraw(rect, layer) end

---Create a new rectangle object.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#rectnew
---@return any result Name: Type: Description; rect: Rect: Newly created rectangle userdata.
function rectNew() end

---Reset rectangle parameters to defaults.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#rectreset
---@param rect any
function rectReset(rect) end

---Set rectangle alpha blending values.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#rectsetalpha
---@param rect any
---@param src any
---@param dst any
function rectSetAlpha(rect, src, dst) end

---Enable pulsing alpha effect for a rectangle.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#rectsetalphapulse
---@param rect any
---@param min any
---@param max any
---@param time any
function rectSetAlphaPulse(rect, min, max, time) end

---Set rectangle RGB color.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#rectsetcolor
---@param rect any
---@param r any
---@param g any
---@param b any
function rectSetColor(rect, r, g, b) end

---Set the rectangle's drawing layer.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#rectsetlayerno
---@param rect any
---@param layer any
function rectSetLayerno(rect, layer) end

---Set the rectangle's local coordinate system.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#rectsetlocalcoord
---@param rect any
---@param x any
---@param y any
function rectSetLocalcoord(rect, x, y) end

---Set the rectangle's clipping window.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#rectsetwindow
---@param rect any
---@param x1 any
---@param y1 any
---@param x2 any
---@param y2 any
function rectSetWindow(rect, x1, y1, x2, y2) end

---Update rectangle animation (alpha pulse, etc.).
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#rectupdate
---@param rect any
function rectUpdate(rect) end

---Advance one frame: process logic, drawing and fades.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#refresh
function refresh() end

---Schedule reloading of characters, stage and fight screen.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#reload
function reload() end

---Remap logical player input to another player slot.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#remapinput
---@param srcPlayer any
---@param dstPlayer any
function remapInput(srcPlayer, dstPlayer) end

---[redirectable] Clear the character's dizzy state.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#removedizzy
function removeDizzy() end

---Start recording rollback/netplay input to a file.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#replayrecord
---@param path any
function replayRecord(path) end

---Stop input replay recording.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#replaystop
function replayStop() end

---Reset AI level for all players to 0 (human control).
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#resetailevel
function resetAILevel() end

---Reset per-match game parameters to motif defaults. Called before loadStart when background loading feeds params incrementally via selectChar.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#resetgameparams
function resetGameParams() end

---Clear all accumulated game statistics.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#resetgamestats
function resetGameStats() end

---Clear the last captured key and text input.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#resetkey
function resetKey() end

---Reset match-related runtime data.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#resetmatchdata
---@param fullReset any
function resetMatchData(fullReset) end

---Reset all input remapping to defaults.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#resetremapinput
function resetRemapInput() end

---Request a round reset.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#resetround
function resetRound() end

---Reset a team's score to zero.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#resetscore
---@param teamSide any
function resetScore(teamSide) end

---Reset the UI input token guard.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#resettokenguard
function resetTokenGuard() end

---Check whether the current round is over.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#roundover
---@return any result Name: Type: Description; over: boolean: true if the current round is over.
function roundOver() end

---Check whether the current frame is the start of the round.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#roundstart
---@return any result Name: Type: Description; start: boolean: true on the first tick of the round.
function roundStart() end

---Run the high-score screen for one frame.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#runhiscore
---@param mode any
---@param place any
---@param endtime any
---@param nofade any
---@param nobgs any
---@param nooverlay any
---@return any result Name: Type: Description; active: boolean: true while the hiscore screen is active.
function runHiscore(mode, place, endtime, nofade, nobgs, nooverlay) end

---Run the currently loaded storyboard for one frame.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#runstoryboard
---@return any result Name: Type: Description; active: boolean: true while the storyboard is active.
function runStoryboard() end

---Save current game options to file.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#savegameoption
---@param path any
function saveGameOption(path) end

---Save a Lua table to an INI file.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#saveini
---@param iniTable any
---@param filename any
function saveIni(iniTable, filename) end

---Request saving of the current state on the next frame.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#savestate
function saveState() end

---Take a screenshot on the next frame.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#screenshot
function screenshot() end

---Search for a file in a list of directories.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#searchfile
---@param filename any
---@param dirs any
---@return any result Name: Type: Description; path: string: Resolved file path, or empty string if not found.
function searchFile(filename, dirs) end

---Add a character to a team's selection.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#selectchar
---@param teamSide any
---@param charRef any
---@param palette any
---@param overrideParams any
---@return any result Name: Type: Description; status: int: Selection status:- 0 – character not added- 1 – added, team is not yet full- 2 – added, team is now full
function selectChar(teamSide, charRef, palette, overrideParams) end

---Select a stage by index.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#selectstage
---@param stageRef any
function selectStage(stageRef) end

---Clear current selection and start loading the match.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#selectstart
function selectStart() end

---[redirectable] Force the character into a specified state.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#selfstate
---@param stateNo any
function selfState(stateNo) end

---Set debug time acceleration.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setaccel
---@param accel any
function setAccel(accel) end

---[redirectable] Set the character's AI level.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setailevel
---@param level any
function setAILevel(level) end

---Set AI level for a specific player.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setcom
---@param playerNo any
---@param level any
function setCom(playerNo, level) end

---Set the number of consecutive wins for a team.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setconsecutivewins
---@param teamSide any
---@param wins any
function setConsecutiveWins(teamSide, wins) end

---Set the number of credits.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setcredits
---@param credits any
function setCredits(credits) end

---Apply default key or joystick bindings for a player.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setdefaultconfig
---@param configType any
---@param playerNo any
---@param enabled any
function setDefaultConfig(configType, playerNo, enabled) end

---[redirectable] Set the character's dizzy points.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setdizzypoints
---@param value any
function setDizzyPoints(value) end

---Force enable/disable of fight screen elements.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setfightscreenelements
---@param elements any
function setFightScreenElements(elements) end

---Set initial fight screen scores for both teams.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setfightscreenscore
---@param p1Score any
---@param p2Score any
function setFightScreenScore(p1Score, p2Score) end

---Set initial round timer value displayed on the fight screen.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setfightscreentimer
---@param time any
function setFightScreenTimer(time) end

---Set current game mode identifier.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setgamemode
---@param mode any
function setGameMode(mode) end

---Set global game speed option.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setgamespeed
---@param speed any
function setGameSpeed(speed) end

---Restore accumulated game statistics from a JSON snapshot.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setgamestatsjson
---@param json any
function setGameStatsJson(json) end

---[redirectable] Set the character's guard points.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setguardpoints
---@param value any
function setGuardPoints(value) end

---Set which team is the home team.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#sethometeam
---@param teamSide any
function setHomeTeam(teamSide) end

---Configure keyboard or joystick bindings for a player.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setkeyconfig
---@param playerNo any
---@param controllerId any
---@param mapping any
function setKeyConfig(playerNo, controllerId, mapping) end

---Set the last UI input controller.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setlastinputcontroller
---@param playerNo any
function setLastInputController(playerNo) end

---[redirectable] Set the character's life.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setlife
---@param life any
function setLife(life) end

---Set maximum number of draw games allowed for a team.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setmatchmaxdrawgames
---@param teamSide any
---@param count any
function setMatchMaxDrawGames(teamSide, count) end

---Set the current match number.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setmatchno
---@param matchNo any
function setMatchNo(matchNo) end

---Set number of round wins required to win the match for a team.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setmatchwins
---@param teamSide any
---@param wins any
function setMatchWins(teamSide, wins) end

---Enable/disable major motif elements.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setmotifelements
---@param elements any
function setMotifElements(elements) end

---Resize player input configuration data to match config.Players.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setplayers
function setPlayers() end

---[redirectable] Set the character's power.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setpower
---@param power any
function setPower(power) end

---[redirectable] Set the character's red life.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setredlife
---@param value any
function setRedLife(value) end

---Set maximum round time (in ticks/counts).
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setroundtime
---@param time any
function setRoundTime(time) end

---Configure a team's mode and team size.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setteammode
---@param teamSide any
---@param mode any
---@param teamSize any
function setTeamMode(teamSide, mode, teamSize) end

---Set the current round time value.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#settime
---@param time any
function setTime(time) end

---Set how many frames correspond to one timer count.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#settimeframespercount
---@param frames any
function setTimeFramesPerCount(frames) end

---Set win count for a team.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#setwincount
---@param teamSide any
---@param wins any
function setWinCount(teamSide, wins) end

---Load an SFF file or create an empty SFF.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#sffnew
---@param filename any
---@param isActPal any
---@return any result Name: Type: Description; sff: Sff: SFF userdata.
function sffNew(filename, isActPal) end

---Check whether shutdown has been requested.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#shutdown
---@return any result Name: Type: Description; shutdown: boolean: true if the global shutdown flag is set.
function shutdown() end

---Block the current script for a number of seconds.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#sleep
---@param seconds any
function sleep(seconds) end

---Load a SND file.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#sndnew
---@param filename any
---@return any result Name: Type: Description; snd: Snd: SND userdata.
function sndNew(filename) end

---Play a sound from a SND object.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#sndplay
---@param snd any
---@param group any
---@param number any
---@param volumescale any
---@param pan any
---@param loopstart any
---@param loopend any
---@param startposition any
function sndPlay(snd, group, number, volumescale, pan, loopstart, loopend, startposition) end

---Check if a given sound is currently playing.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#sndplaying
---@param snd any
---@param group any
---@param number any
---@return any result Name: Type: Description; playing: boolean: true if the sound is playing.
function sndPlaying(snd, group, number) end

---Stop a sound from a SND object.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#sndstop
---@param snd any
---@param group any
---@param number any
function sndStop(snd, group, number) end

---Stop all character sounds.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#stopallcharsounds
function stopAllCharSounds() end

---Stop background music playback.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#stopbgm
function stopBgm() end

---[redirectable] Stop all character's sounds.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#stopsnd
function stopSnd() end

---Check whether the most recent storyboard was canceled by the player.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#storyboardcanceled
---@return any result Name: Type: Description; canceled: boolean: true if the storyboard was canceled via Esc or cancel key.
function storyboardCanceled() end

---Synchronize with external systems (e.g. netplay).
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#synchronize
---@return any result Name: Type: Description; success: boolean: true if synchronization succeeded, false if a non-fatal session warning occurred.
function synchronize() end

---Offset a text sprite's position by the given amounts.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgaddpos
---@param ts any
---@param dx any
---@param dy any
function textImgAddPos(ts, dx, dy) end

---Append text to an existing text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgaddtext
---@param ts any
---@param text any
function textImgAddText(ts, text) end

---Copy velocity settings from another text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgapplyvel
---@param ts any
---@param source any
function textImgApplyVel(ts, source) end

---Print debug information about a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgdebug
---@param ts any
---@param prefix any
function textImgDebug(ts, prefix) end

---Queue drawing of a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgdraw
---@param ts any
---@param layer any
function textImgDraw(ts, layer) end

---Measure the width of a text string for a font.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimggettextwidth
---@param ts any
---@param text any
---@return any result Name: Type: Description; width: int32: Width of the rendered text in pixels.
function textImgGetTextWidth(ts, text) end

---Create a new empty text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgnew
---@return any result Name: Type: Description; ts: TextSprite: Newly created text sprite userdata.
function textImgNew() end

---Reset a text sprite to its initial values.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgreset
---@param ts any
---@param parts any
function textImgReset(ts, parts) end

---Set per-frame acceleration for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetaccel
---@param ts any
---@param ax any
---@param ay any
function textImgSetAccel(ts, ax, ay) end

---Set text alignment for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetalign
---@param ts any
---@param align any
function textImgSetAlign(ts, align) end

---Set rotation angle for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetangle
---@param ts any
---@param angle any
function textImgSetAngle(ts, angle) end

---Set the font bank index for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetbank
---@param ts any
---@param bank any
function textImgSetBank(ts, bank) end

---Set the RGBA color for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetcolor
---@param ts any
---@param r any
---@param g any
---@param b any
---@param a any
function textImgSetColor(ts, r, g, b, a) end

---Set focal length used for perspective projection on a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetfocallength
---@param ts any
---@param fLength any
function textImgSetFocalLength(ts, fLength) end

---Assign a font object to a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetfont
---@param ts any
---@param fnt any
function textImgSetFont(ts, fnt) end

---Set friction applied to a text sprite's velocity each update.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetfriction
---@param ts any
---@param fx any
---@param fy any
function textImgSetFriction(ts, fx, fy) end

---Set the drawing layer for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetlayerno
---@param ts any
---@param layer any
function textImgSetLayerno(ts, layer) end

---Set the local coordinate space for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetlocalcoord
---@param ts any
---@param width any
---@param height any
function textImgSetLocalcoord(ts, width, height) end

---Set the maximum visible distance for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetmaxdist
---@param ts any
---@param xDist any
---@param yDist any
function textImgSetMaxDist(ts, xDist, yDist) end

---Set the position of a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetpos
---@param ts any
---@param x any
---@param y any
function textImgSetPos(ts, x, y) end

---Set projection mode for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetprojection
---@param ts any
---@param projection any
function textImgSetProjection(ts, projection) end

---Set the scale of a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetscale
---@param ts any
---@param sx any
---@param sy any
function textImgSetScale(ts, sx, sy) end

---Set the text content of a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsettext
---@param ts any
---@param text any
function textImgSetText(ts, text) end

---Set per-character text delay for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsettextdelay
---@param ts any
---@param delay any
function textImgSetTextDelay(ts, delay) end

---Set text spacing for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsettextspacing
---@param ts any
---@param xSpacing any
---@param ySpacing any
function textImgSetTextSpacing(ts, xSpacing, ySpacing) end

---Enable or disable word wrapping for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsettextwrap
---@param ts any
---@param wrap any
function textImgSetTextWrap(ts, wrap) end

---Set velocity for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetvelocity
---@param ts any
---@param vx any
---@param vy any
function textImgSetVelocity(ts, vx, vy) end

---Set the clipping window for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetwindow
---@param ts any
---@param x1 any
---@param y1 any
---@param x2 any
---@param y2 any
function textImgSetWindow(ts, x1, y1, x2, y2) end

---Set rotation angle around the X axis for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetxangle
---@param ts any
---@param xangle any
function textImgSetXAngle(ts, xangle) end

---Set X shear (italic-style slant) for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetxshear
---@param ts any
---@param xshear any
function textImgSetXShear(ts, xshear) end

---Set rotation angle around the Y axis for a text sprite.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgsetyangle
---@param ts any
---@param yangle any
function textImgSetYAngle(ts, yangle) end

---Update a text sprite's internal state (position, delays, etc.).
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#textimgupdate
---@param ts any
function textImgUpdate(ts) end

---Toggle display of collision boxes.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#toggleclsndisplay
---@param state any
function toggleClsnDisplay(state) end

---Toggle or cycle debug display.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#toggledebugdisplay
---@param dummy any
function toggleDebugDisplay(dummy) end

---Toggle fullscreen mode.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#togglefullscreen
---@param state any
function toggleFullscreen(state) end

---Toggle lifebar visibility.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#togglelifebardisplay
---@param hide any
function toggleLifebarDisplay(hide) end

---Toggle "max power" cheat mode.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#togglemaxpowermode
---@param state any
function toggleMaxPowerMode(state) end

---Toggle global sound output.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#togglenosound
---@param state any
function toggleNoSound(state) end

---Toggle game pause.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#togglepause
---@param state any
function togglePause(state) end

---Enable or disable all instances of a given player.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#toggleplayer
---@param playerNo any
function togglePlayer(playerNo) end

---Toggle vertical sync (VSync).
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#togglevsync
---@param mode any
function toggleVSync(mode) end

---Toggle wireframe rendering mode (debug only).
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#togglewireframedisplay
---@param state any
function toggleWireframeDisplay(state) end

---Update background music volume to match current settings.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#updatevolume
function updateVolume() end

---Validate a requested palette index for a character.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#validatepal
---@param palReq any
---@param charRef any
---@return any result Name: Type: Description; validPal: int: Engine-validated palette number (may differ from palReq depending on character configuration).
function validatePal(palReq, charRef) end

---Get the engine version string.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#version
---@return any result Name: Type: Description; ver: string: Engine version and build time.
function version() end

---Load a sound from an SND file using a group/sound pair.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#wavenew
---@param path any
---@param group any
---@param sound any
---@param maxLoops any
---@return any result Name: Type: Description; sound: Sound: Sound userdata containing the loaded sound data.
function waveNew(path, group, sound, maxLoops) end

---Play a sound from a Sound object on the shared sound channel pool.
---Source: https://github.com/ikemen-engine/Ikemen-GO/wiki/Lua#waveplay
---@param s any
---@param group any
---@param number any
function wavePlay(s, group, number) end

