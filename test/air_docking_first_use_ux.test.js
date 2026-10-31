'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const realParseAir = require('../src/air_preview_model').parseAir;
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return {
    parseAir: realParseAir, inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => []
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { html, buildModel, authoredActionLabels } = require('../src/air_docking_workspace');
Module._load = originalLoad;

const output = html({
  airPath: path.resolve('/char/main.air'), sourceFingerprint: 'A'.repeat(64), actions: [],
  references: { available: false, reason: 'Open through a character DEF.', items: [], occurrences: [], collisions: { available: false, reason: 'Save assigned state code.', items: [] } },
  initialView: 'collisions', initialCollisionMode: 'inspect', initialTransform: {}, initialProperty: {},
  initialAssistance: { referenceElementIndex: 0, targetElementIndices: [], groups: { clsn1: { enabled: true, cap: 4 }, clsn2: { enabled: true, cap: 4 } }, locks: { frames: [], boxes: [] }, targetPosition: 0 }
});

assert(output.includes('Collision boxes') && output.includes('Clsn1</strong> is an attack/reversal box') && output.includes('Clsn2</strong> is a hurt/contact box'), 'first use explains collision families before technical controls');
assert(output.includes('Inspect boxes') && output.includes('Code recipes') && output.includes('Copy boxes') && output.includes('collisionModeHelp.textContent'), 'collision tasks have plain-language names and a changing one-line purpose');
assert(output.includes('AIR text') && output.includes('Effective AIR boxes') && output.includes('State-code changes'), 'Inspect distinguishes authored, effective, and runtime/controller evidence');
assert(output.includes('Code connections') && output.includes('“Unresolved” means the link depends on runtime logic—not that it is broken.'), 'References explains unresolved evidence without presenting failure');
assert(output.includes('showReferenceEmpty') && output.includes('resolve this reason, then reopen Code connections'), 'unavailable reference screens explain one concrete next step');
assert(output.includes('property-controls assistance-setup') && output.includes('1 · Reference frame') && output.includes('2 · Target frame range') && output.includes('3 · Generate / Refresh'), 'Assistance is a compact ordered workflow');
assert(output.includes('Collision code task') && output.includes('aria-describedby="propertyPurpose"') && output.includes('Hit attributes') && output.includes('Check against') && output.includes('Also require'), 'Code recipes use compact plain-language labels with accessible descriptions');
assert(output.includes("control.disabled=!collisionInspection") && output.includes('No exact frame evidence is loaded. Next: select an Action frame in Inspect boxes.'), 'Code recipe controls cannot operate without exact frame evidence and explain the next action');
assert(output.includes('generateDisabled=!hasFrames') && output.includes("No Action frames are available. Next: choose an Action with at least one frame."), 'Copy-box generation is disabled in an empty AIR and explains the next action');
assert(output.includes("getElementById('assistProtection').classList.toggle('hidden',!assistanceProjection)") && output.includes("getElementById('assistSelectionReview').classList.toggle('hidden',!assistanceProjection)"), 'proposal-only Copy boxes controls stay hidden until a proposal exists');
assert(output.includes('.property-controls.assistance-setup>label{display:grid!important;grid-template-columns:1fr!important') && output.includes('@media(max-width:520px)'), 'Assistance controls cannot retain the overlapping two-column label layout at narrow widths');
assert(output.includes('aria-live="polite"') && output.includes('role="tablist"') && output.includes("button.setAttribute('aria-selected',String(active))"), 'task changes and status updates retain keyboard and screen-reader state');
assert(output.includes('aria-controls="actionsPanel"') && output.includes('id="actionsPanel" role="tabpanel"') && output.includes('aria-controls="collisionProperties"') && output.includes('role="tabpanel" aria-labelledby="airBrowserReferencesTab"') && output.includes('id="referenceList" role="tabpanel"'), 'tab controls identify complete named browser panels');
assert(output.includes('function wireTabKeys') && output.includes("['ArrowLeft','ArrowRight','Home','End']") && output.includes("wireTabKeys(collisionModeTabs,'[data-collision-mode]')"), 'all browser tab groups support predictable arrow, Home, and End navigation');
assert(output.includes("const active=button.dataset.collisionMode==='inspect'") && output.includes("button.tabIndex=active?0:-1"), 'collision tasks retain one keyboard-focusable selected tab while evidence is loading or unavailable');
assert(output.includes('class="filter-field"><span>Find</span>') && output.includes('aria-label="Filter Actions"') && output.includes('aria-label="Filter code connections"'), 'Actions and Code connections expose compact visible search labels instead of placeholder-only fields');
assert(output.includes('All functional categories') && output.includes('All action names / comments') && output.includes('actionNamed'), 'Actions separate functional categories from metadata-backed comment/name lists');
assert(output.includes("strong.textContent=a.number+' · '+label(a)"), 'AIR list, thumbnail, and combined cards always show the numeric Action ID beside the comment/name');
assert(output.includes("'Action '+a.number+' · '+label(a)"), 'AIR cards expose the numeric Action ID to assistive technology as well as visually');
assert(output.includes('id="animateThumbnails"') && output.includes('Animate thumbnails'), 'AIR thumbnail animation is an explicit, discoverable option');
assert(output.includes('new IntersectionObserver(requestVisibleAnimatedThumbs') && output.includes("vscode.postMessage({type:'animatedThumbs',actions})"), 'animated AIR thumbnails request frames only when their cards enter the visible browser area');
assert(output.includes('function previewTicks(value)') && output.includes(':6}function requestVisibleAnimatedThumbs'), 'infinite and non-positive AIR times receive a finite preview duration instead of freezing a thumbnail');
assert(output.includes("let cursor=((now-animationStarted)*60/1000)%Math.max(1,total)"), 'thumbnail playback continuously cycles the complete preview sequence rather than stopping at an AIR loop or hold');
assert(output.includes('animateThumbnails:animateThumbnails.checked'), 'the optional animated-thumbnail setting persists for the AIR browser');
assert(output.includes("actionNamed:document.getElementById('actionNamed')?.value||'all'"), 'the selected AIR comment/name list persists with browser state');
const authoredSource='; Standing idle custom list\n[Begin Action 0]\n0,0,0,0,4\n\n[Begin Action 5] ; Turn authored inline\n0,1,0,0,4';
const labels=authoredActionLabels(authoredSource),authoredModel=buildModel('/char/main.air',authoredSource);
assert.strictEqual(labels.get(2),'Standing idle custom list');
assert.strictEqual(labels.get(5),'Turn authored inline');
assert(authoredModel.actions[0].namedBuckets.includes('Standing idle custom list'),'preceding authored AIR comments reach the exact action model');
assert(authoredModel.actions[1].namedBuckets.includes('Turn authored inline'),'inline authored AIR comments reach the exact action model');
assert.strictEqual(authoredModel.actions[0].frames[0].time,4,'AIR frame timing reaches animated thumbnail playback');
const heldModel=buildModel('/char/hold.air','[Begin Action 0]\n0,0,0,0,-1');
assert.strictEqual(heldModel.actions[0].frames[0].time,-1,'infinite AIR timing remains identifiable so the thumbnail can normalize it without changing source semantics');
const dockingSource=fs.readFileSync(path.join(__dirname,'../src/air_docking_workspace.js'),'utf8');
assert(dockingSource.includes("if (messageType === 'animatedThumbs')")&&dockingSource.includes('.slice(0, 12)')&&dockingSource.includes('action.frames.slice(0, 128)'), 'the extension bounds lazy animated-thumbnail requests and returned frame sequences');
const authoredOutput=html({...authoredModel,references:{available:false,reason:'test',items:[],occurrences:[],collisions:{available:false,reason:'test',items:[]}}});
assert(authoredOutput.includes('Standing idle custom list')&&authoredOutput.includes('Turn authored inline'),'authored comment lists reach the AIR browser payload');
assert(output.includes('aria-label="Sort Actions"') && output.includes('aria-label="Code connection scope"') && output.includes('aria-label="Collision box group"'), 'compact selects retain explicit accessible names and tooltips');
assert(output.includes('aria-label="Action view"') && output.includes("button.setAttribute('aria-pressed',String(active))") && output.includes("button.setAttribute('aria-pressed',String(marked.has(a.number)))"), 'Actions view and marked cards expose their pressed state without relying on color');
assert(output.includes("classList.toggle('hidden',!assignments.length)") && output.includes("classList.toggle('hidden',!slotCount)"), 'irrelevant record and slot navigators disappear in empty states');
assert(output.includes("getElementById('collisionEditImpact').classList.toggle('hidden',!slotCount)"), 'parsed edit ownership is hidden when there is no effective record to inspect');
assert(output.includes('button:focus-visible') && output.includes('summary:focus-visible'), 'all compact interactive surfaces expose visible keyboard focus');
assert(output.includes('.tabs{flex-wrap:wrap}') && output.includes('overflow-wrap:anywhere') && output.includes('.panel{height:auto;flex:1 1 0;min-height:0;overflow:hidden}'), 'compact docks wrap controls and long evidence without clipping the remaining browser height');
assert(output.includes("const windowMode=document.getElementById('windowMode')") && output.includes("referenceFilter=document.getElementById('referenceFilter')"), 'browser startup binds its permanent controls explicitly instead of relying on fragile named-window globals');
assert(output.includes('.panel{height:auto;flex:1 1 0;min-height:0;overflow:hidden}') && output.includes('#actionsPanel,.panel>.references,.panel>.collisions,.panel>.sprite-explorer,.panel>.alignment-layers{flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden}'), 'each named AIR browser tabpanel owns the remaining vertical space and scrolls instead of collapsing beneath wrapped controls');
assert(output.includes('var(--vscode-disabledForeground)') && output.includes('cursor:not-allowed'), 'disabled controls are visibly distinct without relying on disappearance alone');
assert(output.includes('ikemenPrepareClose') && !output.includes('ikemenHasUnappliedForms=()=>false'), 'Close Browser retains shared dirty-form inspection instead of declaring proposal and review controls clean');
const browserScript = output.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
assert(browserScript, 'the protected browser contains one client script');
new (require('vm').Script)(browserScript);

console.log('AIR docking browser first-use UX stays compact, responsive, accessible, and task-oriented');
