'use strict';

const STATUS = Object.freeze({ complete: 'Done', current: 'Next', review: 'Review', pending: 'Later' });

const ADVANCED_ACTIONS = Object.freeze({
  sff: [
    { label: 'Next unresolved', action: 'control:nextUnresolved' },
    { label: 'Batch axis offset', action: 'control:axisOffset' },
    { label: 'Palette inspector', action: 'panel:palettePanel' },
    { label: 'Save SFF', action: 'control:saveSff' }
  ],
  air: [
    { label: 'Batch Clsn2', action: 'control:batchClsn2' },
    { label: 'Collision editor', action: 'panel:collisionPanel' },
    { label: 'Runtime geometry', action: 'panel:runtimePanel' },
    { label: 'Source associations', action: 'panel:sourcePanel' }
  ],
  snd: [
    { label: 'Export marked', action: 'control:exportMarked' },
    { label: 'Audit split contract', action: 'control:auditContract' },
    { label: 'Build manifest', action: 'control:openManifest' },
    { label: 'Rebuild SND', action: 'control:rebuild' }
  ],
  stage: [
    { label: 'Background stack', action: 'anchor:backgrounds' },
    { label: 'Diagnostics', action: 'anchor:issues' },
    { label: 'Fit view', action: 'control:fit' },
    { label: 'Apply position', action: 'control:apply' }
  ],
  screenpack: [
    { label: 'Elements', action: 'anchor:elements' },
    { label: 'Diagnostics', action: 'anchor:issues' },
    { label: 'Mirror P1 to P2', action: 'control:mirror' },
    { label: 'Apply position', action: 'control:apply' }
  ],
  commands: [
    { label: 'Add command', action: 'control:addCommand' },
    { label: 'Search/filter', action: 'anchor:commandSearch' },
    { label: 'Apply command', action: 'control:applyCommand' },
    { label: 'Movelist', action: 'control:movelistTab' }
  ]
});

const TASK_RECIPES = Object.freeze({
  sff: [
    {
      title: '1. Import without losing the source truth',
      summary: 'Keep uncropped indexed source images and their naming manifest outside the archive. Import or rebuild only from reviewed sources so an SFF never becomes the sole copy of artwork or palette indices.',
      checks: ['Confirm the intended group, index, axis, and layer bank before import.', 'Keep optional JNP naming checks separate from native SFF integrity checks.', 'Use the build manifest for structural changes; use direct save only for supported header and palette edits.']
    },
    {
      title: '2. Classify sprites and layers',
      summary: 'A sprite identity describes its gameplay or presentation role. Cosmetic layers and multipart animation pieces keep distinct ownership even when their filenames match the base sprite.',
      checks: ['Resolve unassigned and temporary sprites instead of guessing.', 'Review front/back part order manually for throws and character overlap.', 'Archive unused animation families rather than deleting their source artwork.']
    },
    {
      title: '3. Protect and assign palettes',
      summary: 'The color-separation master preserves every intended index. Player palettes are assignments derived from that master, not replacements for it.',
      checks: ['Protect the full master before replacement, reversal, or batch assignment.', 'Preview the character default, screen override, and group override separately.', 'Compare ACT data before committing a stored palette change.']
    },
    {
      title: '4. Validate, then choose one save authority',
      summary: 'Required-sprite, animation, duplicate-axis, palette, and layer reviews should pass before the archive becomes a character dependency.',
      checks: ['Review every warning that depends on project conventions.', 'Do not mix pending direct edits with an older SprMaker2 manifest.', 'Keep backups and Recovery Center history enabled during development.']
    }
  ],
  air: [
    {
      title: '1. Establish action and frame ownership',
      summary: 'AIR owns sprite sequence, offsets, timing, flips, transparency, and authored Clsn boxes. Character code owns runtime state, push, guard-distance, depth, and collision transforms.',
      checks: ['Confirm the selected action and frame before editing.', 'Keep animation stopped until motion review is intentional.', 'Use source associations as evidence, not as invented ownership.']
    },
    {
      title: '2. Author effective collision',
      summary: 'Clsn1 is attack collision and Clsn2 is hurt collision. Default blocks persist until replaced; frame blocks affect only their element.',
      checks: ['Click overlapping boxes repeatedly to reach the intended box.', 'Use Shift for multi-selection and review nested boxes.', 'Inspect effective defaults and frame overrides together before applying.']
    },
    {
      title: '3. Bridge runtime geometry deliberately',
      summary: 'Push boxes, Width, Size, AttackDist, Depth, OverrideClsn, and TransformClsn are visualized beside AIR because they affect the same frame, but generated code remains explicitly reviewable.',
      checks: ['Choose the native controller or constant that owns the behavior.', 'Treat dotted runtime geometry as code-owned, not AIR-owned.', 'Copy or apply generated code only after reviewing scope and persistence.']
    },
    {
      title: '4. Verify the animation in context',
      summary: 'Missing sprites, unintended blank frames, palette mismatches, and timing errors can all make a character appear to blink or vanish.',
      checks: ['Scrub every frame with the assigned default palette.', 'Review axis, layer parts, collisions, and source state together.', 'Confirm intentional blank frames instead of silently accepting them.']
    }
  ],
  snd: [
    {
      title: '1. Identify sounds by role',
      summary: 'A sound profile keeps character effects, shared effects, and selectable voices in independent native archives. Event names document intent without changing group/index playback.',
      checks: ['Preview and name the selected event.', 'Assign an archive role and unique prefix.', 'Keep paths relative so the character remains portable.']
    },
    {
      title: '2. Validate the split-archive contract',
      summary: 'Character DEF fx entries load each archive natively. Prefixed PlaySnd calls must resolve to the profile that owns the requested sound.',
      checks: ['Audit duplicate prefixes and missing files.', 'Scan ordinary, shared, and prefixed sound references.', 'Do not create a combined fallback archive.']
    },
    {
      title: '3. Edit through source WAVs and a manifest',
      summary: 'Structural sound changes belong in the reviewed SndMaker workspace. The loaded archive stays unchanged until rebuild succeeds.',
      checks: ['Export or replace the intended source WAV.', 'Review group/index ordering in the manifest.', 'Keep event-name metadata synchronized with moved entries.']
    },
    {
      title: '4. Rebuild and listen again',
      summary: 'A successful archive build is only structural proof. Playback, channels, panning, volume, and frequency behavior still require an IKEMEN test.',
      checks: ['Reopen the rebuilt archive and inspect diagnostics.', 'Preview representative events and frequency examples.', 'Verify the character DEF and code still reference the intended prefixes.']
    }
  ],
  stage: [
    {
      title: '1. Establish the coordinate space',
      summary: 'localcoord is the stage authoring canvas. Confirm it before measuring artwork, player starts, camera limits, or floor position.',
      checks: ['Review localcoord and zoffset together.', 'Confirm P1/P2 starts against the visible floor.', 'Treat later coordinate changes as a migration, not a cosmetic zoom.']
    },
    {
      title: '2. Prove the camera before decorating',
      summary: 'Camera bounds determine which parts of the stage can become visible. Test center, both horizontal edges, vertical movement, and zoom before final layer placement.',
      checks: ['Use the camera presets and guides.', 'Check that stage bounds and artwork coverage agree.', 'Resolve exposed edges before adding visual polish.']
    },
    {
      title: '3. Place backgrounds by ownership',
      summary: 'Each BG section owns its Start, Delta, layer, tiling, window, and animation reference. The visual drag tool previews only the selected BG Start.',
      checks: ['Verify the selected section and sprite/action reference.', 'Preview the movement ratio through the camera range.', 'Apply only after the generated patch matches the intended owner.']
    },
    {
      title: '4. Validate parallax through motion',
      summary: 'A convincing still image can still shear or drift incorrectly. Review top/bottom width behavior, floor alignment, and camera sweep together.',
      checks: ['Use the parallax analysis as guidance, not hidden authority.', 'Inspect both camera edges and zoom extremes.', 'Keep source values reviewable in the stage DEF.']
    }
  ],
  screenpack: [
    {
      title: '1. Identify the owning file and section',
      summary: 'system.def and fight.def serve different screens. Edit the section that actually owns the visible element instead of duplicating a value elsewhere.',
      checks: ['Confirm the active DEF, screen, and section.', 'Resolve referenced SFF, font, and animation files.', 'Open the source line when ownership is uncertain.']
    },
    {
      title: '2. Lock the UI coordinate space',
      summary: 'localcoord defines the screenpack design canvas. Safe areas, preview data, positions, and offsets are interpreted within that space.',
      checks: ['Confirm localcoord before layout work.', 'Preview common aspect ratios and edge-safe placement.', 'Use representative names, portraits, counters, and values.']
    },
    {
      title: '3. Distinguish pos from offset',
      summary: 'Some UI elements own an absolute position while others offset an engine-defined anchor. The inspector identifies the field being patched.',
      checks: ['Select the exact visual element.', 'Review the proposed key and value.', 'Mirror P1/P2 only when the two sections are structurally equivalent.']
    },
    {
      title: '4. Keep Lua presentation-side',
      summary: 'Screenpack Lua may organize menus, previews, and other frontend presentation. It must not become the authority for deterministic online gameplay state.',
      checks: ['Prefer native DEF/ZSS ownership where available.', 'Keep optional Lua modules portable and removable.', 'Test missing-module behavior as well as the enabled path.']
    }
  ],
  commands: [
    {
      title: '1. Separate primitives from authored commands',
      summary: 'Directions, buttons, and engine-generated combinations support recognizers but should not bury the gameplay commands a creator needs to maintain.',
      checks: ['Use category filters or search instead of deleting primitives.', 'Keep the owning command file visible.', 'Confirm aliases before renaming a command used by states.']
    },
    {
      title: '2. Build the sequence step by step',
      summary: 'Each timeline box represents an ordered input step. Enter the native token for that step and review its allowed life instead of compressing the entire motion into an unexplained string.',
      checks: ['Use native direction, release, hold, and simultaneous-input syntax.', 'Treat command time as the whole recognizer window.', 'Remember that step time -1 uses the native default behavior; it does not mean unlimited time.']
    },
    {
      title: '3. Review parser options in context',
      summary: 'Buffering and leniency options change when a recognizer may succeed. Hover help and offline documentation explain each field close to the command being edited.',
      checks: ['Review buffer life and autogreater deliberately.', 'Use project presets only when their semantics match the move.', 'Keep online gameplay input deterministic and native.']
    },
    {
      title: '4. Validate code and player-facing output',
      summary: 'The command definition and displayed movelist serve different readers. Both should identify the same move without forcing internal parser details onto the player.',
      checks: ['Resolve syntax and timing diagnostics.', 'Verify every state reference still resolves.', 'Preview the native movelist assignment and displayed labels.']
    }
  ]
});

function step(id, label, status, detail, action = '') {
  return { id, label, status, marker: STATUS[status] || STATUS.pending, detail, action };
}

function countErrors(issues = []) { return issues.filter((item) => String(item.severity || '').toLowerCase() === 'error').length; }

function workflowFor(workspace, context = {}) {
  if (workspace === 'sff') {
    const sprites = Number(context.sprites) || 0, palettes = Number(context.palettes) || 0;
    const unresolved = Number(context.unresolved) || 0;
    return [
      step('archive', 'Load and identify the sprite archive', sprites ? 'complete' : 'current', sprites ? `${sprites} sprites are available.` : 'Add sprites or open a populated SFF.', 'anchor:groups'),
      step('classify', 'Review group, index, axis, and layer ownership', unresolved ? 'current' : 'review', unresolved ? `${unresolved} sprites carry unresolved review flags.` : 'Use review filters and optional naming-profile warnings.', 'panel:reviewPanel'),
      step('palette', 'Protect and verify palette data', palettes ? 'review' : 'current', palettes ? `${palettes} embedded palettes are available; protect the full master before destructive edits.` : 'Add or assign a palette before indexed-sprite production.', 'panel:palettePanel'),
      step('validate', 'Run required-sprite, animation, and palette audits', 'review', 'Audits report missing or inconsistent data without silently inventing classifications.', 'anchor:right2'),
      step('commit', 'Save direct edits or rebuild from the reviewed manifest', 'pending', 'Direct SFF edits and SprMaker2 rebuilds remain separate save authorities.', 'control:saveSff')
    ];
  }
  if (workspace === 'air') {
    const actions = Number(context.actions) || 0, collisions = Number(context.collisions) || 0;
    return [
      step('attach', 'Connect the AIR to its character SFF', context.hasSff ? 'complete' : 'current', context.hasSff ? 'Sprite previews are available.' : 'A nearby character DEF should point to both files.', 'control:openSff'),
      step('actions', 'Review actions, frames, timing, and offsets', actions ? 'complete' : 'current', actions ? `${actions} actions were parsed.` : 'Add a Begin Action before collision or layer work.', 'anchor:actions'),
      step('collision', 'Author and inspect Clsn1 and Clsn2', collisions ? 'review' : 'current', collisions ? `${collisions} frame collision sets were detected.` : 'Select a frame, then draw or apply the needed collision boxes.', 'panel:collisionPanel'),
      step('runtime', 'Review push boxes and runtime geometry in native code', context.hasRuntime ? 'review' : 'pending', 'AIR owns animation collision; Size, AttackDist, Width, Depth, OverrideClsn, and TransformClsn remain code-owned.', 'panel:runtimePanel'),
      step('source', 'Cross-check states and controller bridges', context.hasSources ? 'review' : 'pending', context.hasSources ? 'Character sources were found for confidence-based associations.' : 'Attach character state files through the DEF for source associations.', 'panel:sourcePanel')
    ];
  }
  if (workspace === 'snd') {
    const profile = context.profile || {}, validation = profile.validation || {}, definition = profile.definition;
    const errors = (validation.errors || []).length, warnings = (validation.warnings || []).length;
    return [
      step('archive', 'Load and preview the SND archive', context.entries ? 'complete' : 'current', context.entries ? `${context.entries} sounds are available.` : 'Add WAV sources or open a populated SND.', 'anchor:entries'),
      step('profile', 'Create or locate the portable sound profile', profile.filename ? 'complete' : 'current', profile.filename ? 'The archive has a project-side profile.' : 'Create a profile before split-archive authoring.', 'control:openProfile'),
      step('assign', 'Assign this SND a role and native prefix', definition ? 'complete' : profile.filename ? 'current' : 'pending', definition ? `${definition.role || 'archive'} uses prefix ${definition.prefix || 'not set'}.` : 'Assign voice, character FX, or another declared role.', 'control:assignArchive'),
      step('validate', 'Name events and validate the split-archive contract', errors ? 'current' : warnings ? 'review' : definition ? 'review' : 'pending', errors ? `${errors} profile errors require correction.` : warnings ? `${warnings} profile warnings require review.` : 'Audit references and replace unstable numeric intent with named events where useful.', 'control:auditContract'),
      step('build', 'Review the manifest and rebuild with SndMaker', definition && definition.buildManifestPath ? 'review' : 'pending', definition && definition.buildManifestPath ? 'A build manifest is assigned.' : 'Create or assign a build manifest before rebuilding.', 'control:openManifest')
    ];
  }
  if (workspace === 'stage') {
    const errors = countErrors(context.issues), backgrounds = Number(context.backgrounds) || 0;
    return [
      step('coordinates', 'Confirm local coordinates and camera bounds', context.localCoord ? 'review' : 'current', context.localCoord ? `Stage coordinates are ${context.localCoord.join(' × ')}.` : 'Define localcoord before positioning visual layers.', 'control:reset'),
      step('assets', 'Attach and validate the stage SFF', context.hasSff && !context.sffError ? 'complete' : 'current', context.sffError || (context.hasSff ? 'The stage SFF is connected.' : 'Assign the BGDef spr file.'), 'anchor:issues'),
      step('backgrounds', 'Place and order background layers', backgrounds ? 'review' : 'current', backgrounds ? `${backgrounds} background definitions were parsed.` : 'Add at least one background definition.', 'anchor:backgrounds'),
      step('parallax', 'Review parallax, camera edges, and floor alignment', backgrounds ? 'review' : 'pending', 'Use visual guides and the parallax assistant before applying positions.', 'anchor:inspector'),
      step('validate', 'Resolve stage and interaction diagnostics', errors ? 'current' : 'review', errors ? `${errors} errors require correction.` : 'No model-level errors were detected; review warnings and attached-character services.', 'anchor:issues')
    ];
  }
  if (workspace === 'screenpack') {
    const errors = countErrors(context.issues), screens = Number(context.screens) || 0;
    return [
      step('coordinates', 'Confirm screenpack local coordinates', context.localCoord ? 'review' : 'current', context.localCoord ? `UI coordinates are ${context.localCoord.join(' × ')}.` : 'Define localcoord before element placement.', 'anchor:coord'),
      step('assets', 'Attach SFF, fonts, animations, and fight UI files', context.hasSff && !context.sffError ? 'review' : 'current', context.sffError || 'Review every referenced visual asset.', 'anchor:issues'),
      step('screens', 'Choose a screen and inspect element ownership', screens ? 'complete' : 'current', screens ? `${screens} visual sections were grouped into screens.` : 'Add screen sections before positioning elements.', 'control:screen'),
      step('preview', 'Preview layers, safe areas, and representative data', screens ? 'review' : 'pending', 'Use sample profiles and confirm pos versus offset ownership before applying.', 'anchor:viewport'),
      step('validate', 'Resolve UI diagnostics and review Lua boundaries', errors ? 'current' : 'review', errors ? `${errors} errors require correction.` : 'Keep gameplay state out of presentation-side Lua and review remaining warnings.', 'anchor:issues')
    ];
  }
  if (workspace === 'commands') {
    const commands = Number(context.commands) || 0, errors = Number(context.errors) || 0;
    return [
      step('owner', 'Locate the character command and movelist files', context.commandFile ? 'complete' : 'current', context.commandFile || 'Assign the character DEF cmd entry.', 'control:openDef'),
      step('filter', 'Separate gameplay sequences from raw inputs', commands ? 'complete' : 'current', commands ? `${commands} commands are available in organized views.` : 'Add or import native command definitions.', 'anchor:commandSearch'),
      step('timing', 'Review sequence, command time, step time, and buffer', commands ? 'review' : 'pending', 'Use field help and the editable timeline; do not treat steptime -1 as unlimited.', 'anchor:timeline'),
      step('diagnostics', 'Resolve command diagnostics', errors ? 'current' : 'review', errors ? `${errors} command errors require correction.` : 'No command errors were counted; review warnings and intentional exceptions.', 'anchor:issues'),
      step('movelist', 'Preview and validate the displayed movelist', context.movelistFile ? 'review' : 'pending', context.movelistFile || 'Assign a native movelist slot when the character is ready.', 'control:movelistTab')
    ];
  }
  throw new Error(`Unknown guided workflow: ${workspace}`);
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }

function workflowHtml(steps = []) {
  return `<ol class="guided-workflow">${steps.map((item) => `<li class="workflow-${escapeHtml(item.status)}"><b>[${escapeHtml(item.marker)}] ${escapeHtml(item.label)}</b>${item.action ? ` <button type="button" data-workflow-action="${escapeHtml(item.action)}">Go</button>` : ''}<br><span class="muted">${escapeHtml(item.detail)}</span></li>`).join('')}</ol>`;
}

function advancedActionBarHtml(workspace, experience = {}) {
  if (experience.mode !== 'advanced') return '';
  const actions = ADVANCED_ACTIONS[workspace];
  if (!actions) throw new Error(`Unknown Advanced action workspace: ${workspace}`);
  return `<div class="advanced-actions"><b>Advanced shortcuts</b><div>${actions.map((item) => `<button type="button" data-workflow-action="${escapeHtml(item.action)}">${escapeHtml(item.label)}</button>`).join('')}</div></div>`;
}

function taskRecipesHtml(workspace, experience = {}) {
  const recipes = TASK_RECIPES[workspace];
  if (!recipes) return '';
  const open = experience.mode === 'learning' ? ' open' : '';
  return `<details class="task-recipes"${open}><summary><b>Guided authoring recipes</b></summary>${recipes.map((recipe) => `<section><h3>${escapeHtml(recipe.title)}</h3><p class="muted">${escapeHtml(recipe.summary)}</p><ul>${recipe.checks.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`).join('')}</details>`;
}

function workflowClientScript() {
  return `document.addEventListener('click',function(event){const trigger=event.target.closest&&event.target.closest('[data-workflow-action]');if(!trigger)return;const value=String(trigger.dataset.workflowAction||''),split=value.indexOf(':'),kind=split<0?'':value.slice(0,split),target=split<0?'':value.slice(split+1);let element=null;if(kind==='panel'){element=document.querySelector('[data-panel="'+CSS.escape(target)+'"]');if(element)element.click();element=document.getElementById(target)}else{element=document.getElementById(target);if(kind==='control'&&element)element.click()}if(element){element.scrollIntoView({behavior:'smooth',block:'center'});if(element.focus)element.focus()}event.preventDefault()});`;
}

module.exports = { STATUS, ADVANCED_ACTIONS, TASK_RECIPES, workflowFor, workflowHtml, advancedActionBarHtml, taskRecipesHtml, workflowClientScript };
