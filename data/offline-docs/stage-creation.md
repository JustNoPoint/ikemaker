# Stage creation

Open or create a Stage, then work in its existing viewer. Select a background for artwork and reaction tools; use **Stage Code** for its DEF, controllers, embedded AIR and linked entity sources.

The **IKEMEN State Controllers → Stage Authoring** sidebar groups BGCtrl types and options, Stage DEF parameters by section, and Stage-related character controllers, triggers and Lua references. Reference entries are read-only and work without a loaded Stage. **Open active Stage Code** opens sources for the intended active Stage; attached-character code remains separate from Stage DEF/BGCtrl code.

**Stage controls** opens the Stage’s single browser beside the preview. Use **Backgrounds** and **Stage options** to reach the background list and grouped editing controls; the browser also shows selected-element details, validation and operation status. Camera and preview controls stay beside the canvas. Closing the browser restores the inline controls; reopen it with **Stage controls** when needed. A deliberately closed browser stays closed on subsequent opens until you request it again.

The shared **Palettes** button opens the assigned Stage SFF in Palette Workshop. **Animations** opens the visual editor for embedded AIR Actions in the Stage DEF, using the Stage's BGDef SFF; **Stage Code** remains the exact source route. **States / Controllers** and **Code Structure** open Stage Code and its linked sources. **Save** saves eligible unsaved Stage DEF text only; review or discard canvas proposals separately. Character command and match-launch buttons still require a suitable character context.

In **Stage AIR**, select an Action and frame to edit timing, offsets, sprite references and AIR properties. **New Action** also works when the Stage has no animations. Changes update the open Stage DEF and support native Undo; **Save Stage DEF** saves the document. **Open Stage DEF** remains available for empty or duplicate definitions, and the **Stage** toolbar button returns to the Stage preview. Collision-box edits review embedded AIR data; character pushboxes and runtime collision tools remain character-specific.

The Stage variant currently supports direct Action/frame editing and indexed palette preview. GIF import, asset transfer, Save As and the character Action log are unavailable here. After an external SFF change, reactivate or reopen Stage AIR to refresh its sprites and palettes.

Stage DEF syntax colors distinguish sections, keys, controller values and embedded AIR using your existing editor theme. **Stage Code → Embedded AIR → Native editor + coding tools** opens the exact source with the same grammar and colors; following Stage sections return to DEF coloring. The compact header may stay in place when other viewers or unrelated text tabs share the window.

## Choose the next task

| Task | Where to start | Output after reviewed Apply |
| --- | --- | --- |
| Assign music or edit a loop | **Sounds → Music & Sounds** | Music fields in the Stage DEF; Save before testing in game. |
| Bring in music from outside the project | Choose a file, then choose the copy assignment | Original audio copied to your chosen destination, plus the Stage reference. Existing files are not replaced. |
| Add a controller, scenery character or fighter | **Create / link entity…** | A reviewed attached-character reference. Creation also lists each new file; linking preserves the existing character. |
| Edit that entity | **Edit linked entity…** | Opens its exact source in Stage Code or Move Lab. Use Return to Stage afterward. |
| React to a match event | Select a background, then **When → React → Return…** | Reviewed attached-entity code, plus any needed Stage identity or visibility gate. Review and save every listed document. |
| Use a different Stage on a later round | **Areas & Transitions… → Assign existing Stage to a round…** | A reference in the main Stage DEF. The target Stage is unchanged. |
| Extend an arena during a fight | **Same-stage edges, relocation and fall → Transition kind → Extend edges** | Reviewed Stage identity and attached-owner code; save both documents. |
| Move fighters or set up a combat fall | The same toolbar button, then choose **Move to section** or **Continuous combat fall / physical segments** | Reviewed Stage/owner code and exact participant adapters; save every affected source. |
| Reuse layout with different art | **Create calibrated art variant…** | A separately reviewed variant and any explicitly chosen round binding. |

## Music and sounds

Choose the music slot first; **Other round…** opens any round from 1 to 999. Preview the file, adjust volume, then set loop start/end frames. These are decoded **source sample frames**, not animation ticks. End 0 means the file end. Click the waveform to set the start; Shift-click sets the end. Numeric fields also work without the mouse.

**Suggested loop boundaries** offers signal matches when available. Choose a suggestion, audition it, and adjust it before **Review Stage assignment…**. Suggestions do not identify musical beats automatically. Browser audition is approximate; verify the saved result in IKEMEN. Some engine-supported formats cannot play in the browser.

**Reference** uses an existing project file. **Copy** asks for its destination before review and preserves the original format. Cancel leaves the current assignment unchanged. Native Undo handles a compound copy and reference edit.

**Remove track assignment…** comments out only the selected slot's track after review. It preserves audio files, volume, loop settings and other slots. Removing an override does not force silence: engine fallback or character music may still play. Save the DEF to use the change in game; Undo restores it.

Sound effects belong to an attached entity's **PlaySnd** controller. **Attached entity sounds…** opens its assigned SND; reaction authoring can choose an exact sound and channel from that owner. Use **Return to Stage** in that SND viewer to return to the originating Stage. Music and sound-effect assignments are separate.

To bring in sound effects, use **Add sounds** in the linked SND viewer, or **Add / Drop WAVs** in its browser. These open the existing reviewed SndMaker intake; they do not rewrite the loaded SND in place. Create or open its build manifest when needed, then review the WAV additions and any rebuild/output destination. After rebuilding, check that the attached DEF points to the intended SND output, return to Stage, and select the exact sound group, index and channel in a fresh reaction review.

For a match-triggered music change, enable **Match music on reaction** in the selected background's reaction form and choose **Choose / edit music…**. Preview the track in Music & Sounds, then use it in the reaction proposal. Review the resulting owner code before applying. **Music Return** can keep the event track, stop it, or restart the authored Stage default; restarting the default does not resume the previous track position. Conflicting music writers require source review. An external restart of exactly the same track/settings cannot always be distinguished, so test custom music logic together.

## Attached entities and reactions

An attached character can be a controller, scenery, NPC or fighter. Choose an invisible controller for a minimal starting point, a full character baseline for normal character authoring, or link your own DEF. The attached entity stays neutral; linking it does not add it to either playable team. Linking alone does not generate platform or hazard behavior.

One attached controller can manage many objects; you do not need a separate attached character for each one. Use **Edit linked entity… → Move Lab**, then **Helpers** or **Explods & Position** for the existing specialist tools. Use **Code & Controllers** for projectile and custom object logic. The linked owner and its assigned sources remain authoritative.

A reaction's condition runs in its selected attached entity's context. Supply your own condition for events such as a super move or heavy impact; no particular game's map or state convention is assumed. Select the reaction, Return behavior, duration, cooldown and round phase, then inspect the source review. Moving background artwork does not create physical collision.

Use `map("signal")` for a signal owned by the attached entity, or an explicit redirect such as `(player(1),map("signal"))` for a fighter-owned map. For example, select **Round outcome** and use `playerNoExist(1) && (player(1),lose)` for the losing team associated with slot 1. This is a team outcome flag, not an individual knockout test. Choose the exact slots and outcome rules for your team mode.

A new event needs a false-to-true condition edge; cooldown does not queue missed edges. **Once per round** rearms on a new round or intro reentry in the same Stage. Active hold/Return timers continue outside the chosen trigger phase. A movement commit counter needs explicit event handling; testing it only for a positive value does not retrigger on every increment.

For reactions controlling the same property, higher priority wins. **Allow higher** permits interruption; **Finish** holds until its duration ends; **Return on false** ends when its condition stops and also permits a higher-priority interruption. An interrupted rule does not later run its Return over the winner. Equal priorities retain the active rule; simultaneous idle ties use stable name order. Rules share one attached owner/source so a losing simultaneous rule does not play its sound first.

Choose **New reaction** to add a rule, or select an existing managed reaction to adjust it with **Review update…**. **Remove reaction…** removes only that rule after review. Custom source phases remain unchanged unless you deliberately choose another phase. If you edit a managed code block by hand, use the source-review route rather than having the form overwrite those changes.

For per-element visibility, **Create dedicated gate (review)** needs a unique explicit BG ID. The tool does not renumber IDs automatically. Shared or default IDs require reviewed reference migration, or an explicitly authored group controller through **Stage Code**; they cannot silently become a per-element gate. Existing visibility writers also require ownership review.

The first managed reaction can add Stage identity constants as well as entity code. Review and save both documents. This keeps a main-stage controller from changing a different round variant. Keep generated identity constants out of manually copied variants; IKEMaker's variant workflow handles its own copies.

## Round changes

Use the Stage **Undo / Redo** buttons for standalone variant creation. Native editor shortcuts depend on the active file and focus.

Ordinary round selection starts on the main Stage. Without cycling, a missing later assignment keeps the current Stage. Cycling includes the main Stage and the sorted assigned keys. Attached entities remain owned by the main Stage; the active variant can supply music, subject to character music and persistence settings.

Round assignment is different from changing areas during a fight. Use only the transition/surface operations exposed by your build; a visual floor or a background animation alone does not provide platform collision or make fighters fall.

**Same-stage edge expansion** changes camera and physical horizontal bounds together when your attached-owner condition becomes true. Existing fighters, binds, helpers and projectiles keep their motion and states. It does not teleport fighters or create a floor. At the next round, generated code restores only bounds it still owns; another writer's changed bounds are preserved. Test the saved result with your game's teams and camera rules.

## Move fighters to another section

Open **Same-stage edges, relocation and fall**, then set **Transition kind** to **Move to section (deliberate relocation)**. Choose the attached owner and request condition. Select every active fighter and review its exact source, ready states and body margin. The operation moves those fighters by one common horizontal offset while preserving their state, velocity and control. It does not load a different Stage file mid-match.

**Preserve camera / within current view** keeps the existing camera behavior and bounds. It waits until the destination bodies fit the actual view and physical bounds; changing camera or zoom can change whether a move fits. Use **Exclusive fighting-camera snap (zoom1)** for a larger move only after reviewing exclusive camera ownership and the generated adapters. Conflicting authored camera or post-state code requires source review.

The **Common hooks** selector offers **Strict reviewed custom sources** or **Reviewed official 6e564af hooks (non-Tag / wait-clear)** and **Reviewed official fb269c9 hooks (non-Tag / wait-clear)**. Each stock profile requires its exact supported engine/defaults, one attached coordinator and the same runtime/config authority for every participant. Choose **Wait until selected fighters own none** explicitly: the coordinator must also own no helpers/projectiles. Tag-active/Tag-state and Demo play are outside this automatic contract. **Inspect retained Common inputs…** opens read-only provenance; those inputs are preserved. Constant-based headers need proven literal integer values, including character CNS overrides. Unresolved or conflicting custom hooks point to source review.

Stock-hook readiness is evaluated once at the late owner decision in each selected fighter's context. Use unitless read-only expressions such as `map("ready")`, `life`, `ctrl` and `time`; assignments, random calls, redirects and spatial predicates need explicit source composition. Test the exact characters and modes before relying on the recipe.

Choose whether existing helpers/projectiles remain where they are or the request waits for them to clear. Throws and bound fighters must reach the reviewed unbound state; the tool does not migrate a throw or helper relationship. Set a timeout and optional cancellation condition. The successful commit counter can drive the existing background, sound or music reactions.

Review all affected Stage, owner and fighter sources before Apply, then save them before testing. These workflows require compatible character code; native authoring and broader compatibility acceptance are still in progress.

## Physical platforms and slopes

Open **Physical one-way segments** from the Stage toolbar. Choose the attached owner and its condition, then enter segment endpoints or pick them on the canvas. These coordinates describe gameplay ground; parallax floor alignment only describes artwork.

Choose each participating character and its exact source, active slots, grounded states and own fall state. Review compatibility before applying: this creates character adapters as well as Stage/owner code. The defaults are starting values, not a guarantee that an arbitrary character supports the recipe. Review every affected file and save all of them before testing.

If a character has only CNS or lacks a suitable ZSS hook, use **Create / link adapter source…** on its participant card. This preserves existing code and reviews the new source and DEF assignment before applying. Additive-hook creation currently requires the exact supported engine binding; **Inspect Engine Binding** explains an unsupported target without installing anything. If source proof is missing, choose the matched engine defaults as read-only input when offered. Recheck compatibility after creating the hook.

**Break arrival Y** defines the lower landing plane when the condition turns off during combat. Leaving it unset uses the original Stage floor. Reopen the managed recipe to update or remove it; native Undo reverts the compound edit. **Reload saved / discard proposal** clears the form proposal, not your authored source. Edited generated blocks require source review before the tool can replace them.

During hit freeze, pause, a target binding or a state borrowed from another character, the adapter holds its existing floor height and defers the break. It resumes when the reviewed state and control permit it. Ordinary unbound hit targets do not block walking along a slope. At round end, the last owned floor stays in place until the next round resets ownership.

Only the selected fighter slots participate. Fixtures cover mixed-coordinate Simul teams and an unselected teammate using the same character; this does not guarantee arbitrary teams or tag behavior. These are one-way segments: test your exact characters, throws and custom states. Other code that changes the floor needs separate compatibility review.

## Preview, review, save, test

Preview and file browsing do not approve a write. Review lists the affected source and any created files. Reaction, edge-expansion, surface and section-transition reviews open read-only before/after diffs; use **Continue review** or **Cancel review** in the status bar. The final Apply or Remove confirmation approves the compound edit. Save the edited documents before using them in game. Use the Stage Rig or the disposable live preview for runtime checks; editor animation is not proof of match-trigger behavior. If a source changes during review, reopen the operation against the latest source.

Reopen an intact managed edge, relocation or surface recipe to use **Review update…** or its reviewed Remove action. Remove affects only that recipe's owned source; native Undo/Redo restores the compound edit. If ownership validation refuses, use **Open Stage receipt source** in the error area and expand **Recipe source diagnostics** when needed. Open the linked or compatibility source through its existing action or Stage Code, restore the intended files/DEF links with native Undo or version control, then refresh. Legacy basename-only external receipts cannot prove their original Stage location; their recorded references stay unverified. Diagnostics store hashes, not original code, and never repair code or remove ownership markers automatically.

If a tool needs source proof, choose **Prove engine sources...** to resolve its effective character and `Common.States` inputs. Loading the tool never prompts. The check reads existing sources; changing the engine binding remains a separate action. While proof is unresolved, browsing, linked source access and removal of intact managed recipes remain available.

