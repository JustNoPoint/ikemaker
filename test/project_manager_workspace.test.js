'use strict';

const assert = require('assert');
const Module = require('module');
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: {}, commands: {}, Uri: {}, ViewColumn: { Active: 1, Beside: 2 } };
  return original.call(this, request, parent, main);
};
const { snapshot, managerHtml } = require('../src/project_manager_workspace');
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
assert(source.includes('title="Choose another folder or registry"'));
for (const title of ['Change this team name', 'Add a custom job class to this team', 'Add a member and assign one or more job classes']) assert(source.includes(`title="${title}"`));
assert(source.includes("vscode.setState({view,root:data.root})"), 'restored panels must retain their registry root');
assert(source.includes("globalThis.ikemenNavigationSelection=()=>({view})"), 'workspace presets must capture the selected manager section');
assert(source.includes("['games','engines','work','teams','validation'].includes(reference.view)"), 'workspace presets must reject unknown manager sections');
assert(source.includes('globalThis.ikemenRestoreNavigation=reference=>setView(reference.view)'), 'workspace presets must restore through the normal section switch');
assert(!/<button[^>]*(?:display\s*:\s*none|aria-hidden=["']true["'])/i.test(source), 'manager must not hide controls as dead test UI');

console.log('Project and Team Manager workspace tests passed');
