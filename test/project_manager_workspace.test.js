'use strict';

const assert = require('assert');
const Module = require('module');
const vm = require('vm');
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: {}, commands: {}, Uri: {}, ViewColumn: { Active: 1, Beside: 2 } };
  return original.call(this, request, parent, main);
};
const { MANAGER_TAB_IDS, snapshot, managerHtml } = require('../src/project_manager_workspace');
Module._load = original;

const registry = require('../src/project_registry').normalize({
  projects: [{ id: 'game', name: 'Game', distributionIntent: 'commercial', contentBasis: 'original' }],
  workProjects: [{ id: 'hero', name: 'Hero', type: 'character', root: 'chars/Hero', gameId: 'game', teamId: 'team' }],
  teams: [{ id: 'team', name: 'Team', members: [{ id: 'artist', name: 'Artist', handle: 'Artist', jobClasses: ['Animator', 'CS'] }] }]
});
const state = snapshot('C:\\game\\.ikemen\\project-registry.json', registry, []);
const source = managerHtml(state);
for (const text of ['Project & Team Manager', 'Games', 'Engine Targets', 'Work Projects', 'Teams', 'Hobby / non-commercial', 'Commercial', 'Assign or remove the single authoritative game', 'Add job class', 'Edit member', 'Update Engine Knowledge', 'Register Existing Build', 'Review & Safely Install Exact Nightly']) assert(source.includes(text), `missing manager UI text: ${text}`);
assert(source.includes('aria-label="Manager sections"'));
assert(source.includes('role="tablist"') && source.includes('role="tab"') && source.includes('role="tabpanel"'), 'manager sections expose a complete tab relationship');
assert(source.includes("event.key==='ArrowRight'") && source.includes("event.key==='Home'"), 'manager tabs support roving arrow and boundary-key navigation');
assert(source.includes('id="managerStatus"') && source.includes('aria-live="polite"'), 'manager actions expose a live pending/readiness explanation');
assert.match(source,/projectManagerBusy.*event\.data\.generation===data\.generation/,'only the current manager generation can clear its pending state');
assert(source.includes('data.restoreFocus') && source.includes('queueMicrotask(restoreFocus)'), 'a full manager refresh restores focus to the initiating control or active tab');
assert.match(source,/const focus=focusToken\(\);setBusy\(true/,'the initiating focus identity is captured before disabling can blur the control');
assert(source.includes('title="Choose another folder or registry"'));
assert(source.includes('id="closeManager"'), 'manager must provide a visible local escape path');
assert(source.includes("send('projectManagerClose')"), 'local Close and Escape must use the manager-owned close route');
assert(!source.includes('data-universal-slot'), 'project manager must not embed asset-viewer universal chrome');
assert(!source.includes('ikemaker-universal-toolbar'), 'project manager must keep its compact local header');
assert(!source.includes("work project's folder"), 'generated JavaScript strings must not contain the unsafe apostrophe regression');
const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(script, 'manager must emit its client script');
assert.doesNotThrow(() => new vm.Script(script), 'the exact generated manager client must compile');
assert.deepStrictEqual(MANAGER_TAB_IDS, ['managerTabGames','managerTabEngines','managerTabWork','managerTabTeams','managerTabValidation']);
function functionSource(name) {
  const start = script.indexOf('function ' + name + '('), brace = script.indexOf('{', start);
  assert(start >= 0 && brace >= 0, 'missing generated function ' + name);
  let depth = 0;
  for (let index = brace; index < script.length; index += 1) {
    if (script[index] === '{') depth += 1;
    else if (script[index] === '}' && --depth === 0) return script.slice(start, index + 1);
  }
  throw new Error('unterminated generated function ' + name);
}
const selectedViews = [], tabNodes = ['games','engines','work','teams','validation'].map(view => ({
  dataset: { view }, focused: 0,
  focus() { this.focused += 1; }
}));
const bindingContext = vm.createContext({ tabs: tabNodes, setView(view) { selectedViews.push(view); } });
vm.runInContext(functionSource('bindManagerTabs') + ';bindManagerTabs()', bindingContext);
for (const tab of tabNodes) assert.strictEqual(typeof tab.onclick, 'function', tab.dataset.view + ' receives the generated exact-tab binding');
tabNodes[0].onclick();
assert.strictEqual(selectedViews.at(-1), 'games');
let prevented = 0;
tabNodes[0].onkeydown({ key: 'End', preventDefault() { prevented += 1; } });
assert.strictEqual(tabNodes.at(-1).focused, 1);
assert.strictEqual(selectedViews.at(-1), 'validation');
tabNodes.at(-1).onkeydown({ key: 'Home', preventDefault() { prevented += 1; } });
assert.strictEqual(tabNodes[0].focused, 1);
assert.strictEqual(selectedViews.at(-1), 'games');
assert.strictEqual(prevented, 2);
for (const title of ['Change this team name', 'Add a custom job class to this team', 'Add a member and assign one or more job classes']) assert(source.includes(`title="${title}"`));
assert(source.includes("vscode.setState({view,root:data.root})"), 'restored panels must retain their registry root');
assert(source.includes("globalThis.ikemenNavigationSelection=()=>({view})"), 'workspace presets must capture the selected manager section');
assert(source.includes("['games','engines','work','teams','validation'].includes(reference.view)"), 'workspace presets must reject unknown manager sections');
assert(source.includes('globalThis.ikemenRestoreNavigation=reference=>setView(reference.view)'), 'workspace presets must restore through the normal section switch');
assert(!/<button[^>]*(?:display\s*:\s*none|aria-hidden=["']true["'])/i.test(source), 'manager must not hide controls as dead test UI');

console.log('Project and Team Manager workspace tests passed');
