# Connected viewers and workspace controls

## Move between related screens

A dashed violet border marks a toolbar icon with extra actions. Right-click the icon, or focus it and press Shift+F10 to open its options.

Use Open AIR, Open SFF, Open SND, or Text Editors in a viewer's toolbar. In AIR, Open SFF follows the selected frame's sprite. Animation AIR Text shows the selected action inside the viewer; Open AIR Text Editor opens the editable source explicitly.

From source code, right-click a recognized animation, effect, sound, or AIR sprite reference and choose **Open Referenced Animation / FX / Sound / Sprite**. When several archives could own a shared prefix, choose the intended archive. Check the displayed archive identity before editing.

**Back to Source** returns to the source location that opened the viewer. **Back** and **Forward** follow recorded source/viewer handoffs. In a text editor, use **IKEMaker: Viewer History Back** or **IKEMaker: Viewer History Forward** in the command palette. History lasts for the current session.

Stage and Storyboard **Open source** buttons also record a history step and reuse an existing source tab. Storyboard history can reopen a closed viewer at its recorded scene. Returning to the same open scene keeps unapplied form values; switching scenes through history requires applying those edits or using **Refresh** to discard them. Closing a Storyboard viewer does not save unapplied form edits. Missing or ambiguous scene numbers stop the history jump.

In **Command & Movelist**, **Open source** follows the visible tab: the selected command section in Command definitions, or the assigned movelist file in Displayed movelist. **Open character DEF** opens the character definition. These visits record history and reuse existing source tabs.

Selecting a block in **Visual Code Structure** opens its source line using the existing source tab and records the visit in viewer history. History can reopen Code Structure at the recorded block. It matches the block kind, name, signature, and preview excerpt; unique matches can survive line-number changes. Changed or ambiguous matches stop the jump. Restoring a block clears the search/filter and expands its parent so the selection is visible.

Stage history can reopen a recorded background when its name and type identify it uniquely. Returning to an open Stage viewer keeps its preview coordinates. Renamed, removed, or ambiguous backgrounds stop the jump. Closing the viewer does not save unapplied preview positions.

## Add sprites to the current SFF

Open **Add Sprites** for PNG, GIF or PSD sources. Preparation uses notified temporary storage and keeps originals unchanged. Review the source pages, group/index, axes and palette choice, then choose **Output** and **Write SFF**. A valid batch writes in one action without opening Advanced or asking again. **Continue in Advanced…** is optional for per-page assignments. Staging or cancelling does not write the SFF or AIR.

**Use image palette** preserves indexed PNG indexes and pads a short table without remapping. Eligible RGBA/GIF artwork is indexed exactly when its visible colors fit 255 entries plus transparent index 0; no nearest colors are chosen. Overflow needs an explicit **Needs Palette** or **True Color** choice. **Use matching embedded… (exact indexes)** requires the image indexes to match that palette. **Map exact source colors to master…** reviews used colors that match multiple master indexes; unused duplicate colors do not block intake. Unmatched colors are not silently approximated. Choose **Needs Palette** for a reviewed reduction/tiling workflow. For partial alpha or True Color, the current certified choice is **IKEMaker SFF 2.1**; external True Color/alpha is not claimed supported.

Under **Layers and optional animation**, **Put PSD body and cosmetic pages in separate groups** uses an explicit cosmetic group and matching document indexes. Missing cosmetic pages stay as gaps. Review the first authored page as body and the other selected pages as cosmetics; use Advanced for different assignments. Separate groups do not set runtime draw order. Avoid group 65535: the target engine reserves it.

To retain GIF timing, enable **Review GIF timing in AIR after a successful SFF build** for one complete batch. After a verified write, use **Create/Review AIR from GIF…** to review exact sprite references, timing, loop and final hold in the existing AIR workflow. AIR review never opens automatically; Write SFF, staging and cancellation do not write AIR.

Changing inline **Output** updates the shared writer and revalidates the same retained batch. If another viewer changes it, use **Review shared writer**; reopening is unnecessary. IKEMaker checks its bundled Windows SFF 2.1 evidence automatically; Linux runtime remains unverified. Unsupported choices stay inline with no silent fallback. **Both** compares writers before the SprMake2 write; SprMake2/Both True Color remains unsupported. Creator's PNG8 size optimization is optional, off by default, and adopts only smaller equivalent output.

## Choose a palette and its sprites

AIR uses each sprite's stored palette by default, including animations with different palettes per frame. **Sprite palettes (default)** restores that preview. Explicit screen or group preview overrides remain available; they recolor the preview without changing the SFF's stored palette assignments.

**Palette Browser** exposes embedded palettes in the existing browser. In **Palette Workshop…**, selecting a palette shows **Associated sprites** and chooses an actual user if the previous sprite is unrelated. Direct users and **shared linked colors** have separate labels: linked storage does not merge authored palette identities, and matching RGB values alone prove no association. True Color sprites are not counted as indexed palette users.

Choose **Preview on current sprite** to try another palette on the current indexed artwork without changing its authored assignment. A palette with no users has an empty associated preview; switch modes to recover the previous preview. **Return to SFF** restores the exact originating archive, tab and selection. When there is no recorded origin, the action is **Open SFF**. Finish or discard dirty palette edits before returning.

## Keep the interface comfortable

**Customize** shows, hides, and reorders shared toolbar commands. Save applies those choices; Cancel or Escape leaves them unchanged. **More** keeps every shared command available, including hidden commands.

**Layout** controls the viewer's panels and widths. AIR, JNP, SFF, and SND offer named layouts and built-in choices. Save a layout for a task you repeat, then recall it when needed. The picker starts at **Current arrangement**. Choose a preset to fill in its panel settings, then choose **Apply**. Enter a name in **Save as** before applying to keep a custom arrangement. **Cancel** closes the dialog without applying its changes. **Reset Layout** restores the panel defaults and keeps your named saves. Toolbar customization and panel layout are separate controls: hiding a command does not hide a panel.

Panel preferences are shared by viewers of the same type and remembered between sessions. They control panels inside the viewer; arrange VS Code editor groups separately. Widths apply when there is room for columns. At narrow sizes, panels may stack or require scrolling. Hiding a panel preserves the current selection and unapplied inputs.

SFF restores the selected sprite and chosen zoom after a window reload. Choosing a different sprite fits it automatically; **100%** returns to its actual pixel size. AIR remembers the selected action.

In SFF **Sprite Controls**, the **View organization** icon opens the group and sprite lists in a compact accordion. Choose **Saved view organization** to name and review an order. Drag a sprite row, or focus it and use **Alt+Up/Down**, then choose **Apply View Order…**. This saves viewer metadata; it does not change the SFF's physical sprite order.

In SND, medium-width windows put profile tools below the sound browser and preview. Narrow windows put the preview first, with the sound browser and tools below it. Scroll inside the panels to reach additional controls, or hide panels through **Layout** when you want more preview space.

JNP Move Constants reopens after a window reload with its character, selected move, preview position/zoom, and unapplied numeric field values. Playback starts paused. Restored values remain previews until you use the field's Apply button. **Refresh** reloads source values and clears unapplied inputs. If a move was removed from the source, its draft is not applied to another move.

## Find references and keep source nearby

Select an animation, sprite, or sound and choose **Used By**. Search the results and use a line button to open its source. Refresh reads current unsaved text. Dynamic expressions and ambiguous references may need manual inspection; a result list is not proof that every possible runtime use was found.

**Pinned Sources** keeps chosen source files in a separate reading panel. Pin constants, common code, and functions that help explain the move you are working on. Line buttons open the editable source. The source previews are read-only. The panel remembers its chosen files and reading positions. **Source locations** reveals full character and file paths when needed and remembers whether it is expanded. File tabs scroll sideways in narrow panels; the header scrolls separately so source text retains room below. **Follow selected move** updates matching lines as you choose a JNP attack; turn it off to keep reading in place. Matches are text references, so check the source context. Search highlights text, and **Next Match** moves through the matches. Unsaved source edits and external file updates appear in the preview. If a file becomes unavailable, its old text and editor link are cleared until it can be read again.

## Compare animations, sprites, and sounds

1. Select an item in AIR, SFF, or SND.
2. Choose **More → Compare → Pin selected item as reference**.
3. Select a second item, including one from another file of the same type.
4. Choose **Compare selected item with reference**.

The comparison labels the **Primary** and **Reference** sides and displays their source files. Swap exchanges the roles. Pinning another reference updates an open comparison; Clear pinned reference closes it.

These are frozen snapshots. Editing a source afterward does not refresh an existing comparison. Pin or compare again to capture the new state.

- **AIR:** captures the current AIR text, including unsaved edits, with sprites from the saved assigned SFF. Both sides share the same scale and origin. Use individual Play buttons, Play / Pause Both, Reset Both, or Go to Tick. Playback uses 60 ticks per second. Sprite scale, rotation, offset interpolation, and AIR blend strengths are previewed. This is not an in-game simulation of every controller, PalFX operation, or shader. Collision boxes use character coordinates: frame sprite offsets and H/V flags change the artwork without moving the boxes. Explicit preview scale and angle still affect the overlay.
- **SFF:** captures the visible rendered preview, including its current palette, axes, overlays, and visible unsaved changes. Wait for the selected image to load before capturing it.
- **SND:** captures saved archive audio. Playing one side pauses the other.

Comparison references and open comparison panels are saved locally for this workspace and restored after a reload. Their captured media stays frozen even if the original asset changes or moves. Playback starts paused from the beginning after restoration. Use Clear pinned reference to remove the saved comparison for that viewer type. Named viewer layouts and pinned source files are managed separately.

Comparison does not save edits to AIR, SFF, or SND files. Review the source labels before using a visual difference to decide on a change.

Stage background previews retain their positions when you select another background and return. Use Discard to reset the selected background to its saved position; other background previews remain intact. Closing the workspace still discards unapplied previews.

Command & Movelist source buttons record the current command or displayed-movelist tab for Viewer History Back/Forward. History can reopen a closed workspace. Command targets must uniquely match the recorded definition; changed or ambiguous definitions stop the jump. Switching to a different command through history also stops if the current form has unapplied edits. Returning to the same command or switching tabs preserves the live form. Closing the workspace does not save unapplied edits.

## Saving and backups

Shared viewer toolbars now include **Make Backup…** and **Auto Save: On/Off**. Find them in **More…** if hidden, or use **Customize…** to move or hide them. Both commands are also in the Command Palette.

Make Backup copies the viewer’s saved source file to a filename you choose. It does not include unsaved edits or back up the whole character. Save first if you want your latest edits included. Existing backups are never overwritten. Automatic permanent backup creation has been removed; older backups remain untouched. Reviewed native IKEMaker updates use notified private temporary recovery. Failure or interruption retains it; verified completion removes the old-archive copy and records that rollback is no longer available. Keep Backup is an explicit choice.

Asset Auto Save defaults to off. It controls automatic SFF axis and Production Workflow saving and updates open viewers immediately. Text editor autosave is independent: configure `files.autoSave` in VS Code Settings. The button tooltip reports that separate text setting. Toggling Asset Auto Save does not change text editor preferences or unrelated files. Explicit Save and Apply actions still work.

Production Workflow now follows the same Auto Save toggle. With it off, changes remain drafts until **Save Workflow**. **Discard Unsaved Changes** discards the current character and project-board drafts after confirmation. Drafts survive a restart in local VS Code workspace storage; they are not written into the project folder. Turning autosave on applies to subsequent edits; use Save Workflow to commit an existing draft immediately. **Save to project** on the issue form is an explicit save of that project board only.

## Normal and Advanced asset presentation

New users choose mode, collaboration, and focus areas on one setup page. **Normal** starts selected, with **Single user** and **Character** focus. Normal provides everyday creation and editing for Sprites, Animations, Sounds, Palettes, characters, and code. Advanced sections start collapsed; SFF’s extra Tools pane and SND’s build/profile pane start hidden. Groups remain accessible. Saved personal toolbar and layout customizations take precedence.

In Normal mode, opening another asset replaces the previous clean asset viewer in its editor group. Selection, search and scrolling are remembered during the current VS Code session. Unapplied SFF axes/review fields, AIR collision edits, and AIR frame-plan edits block switching; Save/Apply or Revert first. Failure to load or communicate with a viewer keeps the existing viewer available. Native source documents and other IKEMaker tools are not automatically closed. Opening AIR code does not automatically launch a viewer in Normal mode; use Animations when you want the visual editor.

Use **Tools → Mode & Focus**, **IKEMaker Home → Mode & Focus**, or **IKEMaker: Change Mode** in the Command Palette to choose Advanced when you want multiple asset viewers and deeper controls. Existing edits stay open; single-viewer behavior takes effect on the next asset opening. The Interface Mode setting replaces the two older asset-presentation switches.

This version simplifies the asset viewers; it does not lock down all VS Code tabs or consolidate every IKEMaker tool into one application window.

## First-time mode and focus choice

On first desktop use, one page offers **Player**, **Normal**, or **Advanced**. Player shows roster, stories, play, and the full Palette Workshop. Normal adds everyday creation and editing. Advanced adds deeper authoring and multiple viewers. The initial choices are Normal, Single user, and Character focus.

Choose again with **Tools → Mode & Focus**, **IKEMaker Home → Mode & Focus**, or **IKEMaker: Change Mode** in the Command Palette. Normal and Advanced let you choose Single user or Team and any combination of Full Game, Character, Stage, Screenpack, and Storyboard focuses. Full Game is an independent game-level focus. Player hides these choices while retaining them for later. Cancel postpones first-time setup without saving a mode. Existing mode and project preferences remain in place.

Mode changes open a matching Home screen and preserve existing tabs and unfinished work. Open viewers update their presentation when dialogs close. Player Home exposes Characters & Stages, Stories, Play, and Palette Workshop. Focus and collaboration affect what tools are shown, not the contents of project files. Existing projects without a saved focus continue showing all tools until you choose one; new-project defaults do not overwrite their settings.


### Asset logs

**Open SFF Group Log** and **Open AIR Action Log** open an existing log without rewriting it. If no log exists, IKEMaker asks before creating one. To regenerate convention names and entries, use **Refresh SFF Group Log…** or **Refresh AIR Action Log…** in the Tools sidebar or Command Palette in Advanced mode. Review the destination and entry counts before applying. Custom names, notes and comments remain; removed archive entries stay in a separate retained section. Save or revert an open dirty log before refreshing. Concurrent log or archive changes stop the refresh rather than overwriting newer work.

### Recovery messages

A failed file replacement attempts to restore the original. If restoration cannot finish, the error lists the affected target and recovery path; keep the listed recovery files. A separate cleanup message means the new contents were already saved successfully but a temporary original could not be removed. Repeating the edit does not fix cleanup. Normal successful edits leave no automatic backup files.


### Project identity and connected navigation

Related Work uses the same owner and shared-archive context as direct sprite, animation and sound navigation. If more than one character owns an asset, choose its owner once; cancelling leaves the current screen alone.

Production Workflow uses a shared game board. New tickets and reports retain the assigned work-project and game-project IDs, so names can change without changing identity. Use **Board filter** in Project Tickets or Report Intake to view one work project or legacy/unassigned items. Child tickets inherit their parent's project. The issue form still shows the destination project for new submissions; changing the board filter does not change that destination.


### Keyboard navigation

In the roster, Tab reaches character rows and selectable portraits. Enter or Space selects the character; Ctrl and Shift support multiple selection. Alt+Up and Alt+Down move the selected characters through the preview order. Review and apply the order to save it. A source conflict blocks reordering and applying until reviewed or discarded. Focus follows the moved portrait, including when it moves to another roster page.

Workspace section tabs support arrow keys, Home and End. Hidden or disabled sections are skipped. Tab leaves the tab bar for the selected section's controls.
