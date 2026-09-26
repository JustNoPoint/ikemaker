'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const load = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return { window: {}, workspace: {}, commands: {}, Uri: { file: (fsPath) => ({ fsPath }) } }; return load.call(this, request, parent, main); };
const workspace = require('../src/production_workflow_workspace');
const picker = require('../src/character_picker');
const projectContext = require('../src/project_context_ui');
Module._load = load;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-production-workflow-'));
try {
  fs.mkdirSync(path.join(directory, 'external', 'script'), { recursive: true }); fs.writeFileSync(path.join(directory, 'external', 'script', 'main.lua'), '');
  const folder = path.join(directory, 'chars', 'Ryu'); fs.mkdirSync(folder, { recursive: true });
  const def = path.join(folder, 'Ryu.def'); fs.writeFileSync(def, '[Info]\nname="Ryu"\ndisplayname="Ryu"\n[Files]\nsprite=Ryu.sff\nanim=Ryu.air\ncmd=Ryu.cmd\ncns=Constants.cns\nst=normals.zss\nsound=Ryu.snd\n');
  fs.writeFileSync(path.join(folder, 'Ryu.air'), '[Begin Action 0]\n0,0,0,0,1\n[Begin Action 5000]\n5000,0,0,0,1\n'); fs.writeFileSync(path.join(folder, 'Ryu.cmd'), ''); fs.writeFileSync(path.join(folder, 'Constants.cns'), ''); fs.writeFileSync(path.join(folder, 'normals.zss'), '[StateDef 200]\nhitDef{damage: 30, 0}\n');
  const context = { extensionPath: path.resolve(__dirname, '..') }, character = workspace.characterContext(def), state = workspace.loadState(context, character);
  const originalRegistry = projectContext.readRegistry;
  projectContext.readRegistry = () => ({filename:path.join(directory,'.ikemen','projects.json'),registry:{workProjects:[{id:'ryu-project',name:'Ryu Project',root:'chars/Ryu',teamId:'art'}],teams:[{id:'art',name:'Artists'}]}});
  try { const assigned=workspace.loadState(context,character); assert.strictEqual(assigned.assignedWorkProject.id,'ryu-project'); assert.strictEqual(assigned.assignedTeam.id,'art'); } finally { projectContext.readRegistry=originalRegistry; }
  const choices = workspace.workflowCharacterChoices({ fsPath: path.join(directory, 'chars', 'template', 'anything.zss') }); assert(choices.some((item) => item.filename === def));
  const candidates = picker.characterCandidates({ fsPath: path.join(folder, 'normals.zss') }); assert(candidates.current.includes(def)); assert(candidates.detected.includes(def) === false);
  const templateDef = path.join(directory, 'chars', 'template', 'template.def'), otherDef = path.join(directory, 'chars', 'Ken', 'Ken.def');
  assert.deepStrictEqual(picker.rankCurrentCandidates([templateDef, def, otherDef]), [def, otherDef, templateDef]);
  assert.strictEqual(character.name, 'Ryu'); assert.strictEqual(state.profile.id, 'sf-character-production'); assert.strictEqual(state.phases.length, 11); assert.ok(state.phases.some((phase) => phase.id === 'sf6-source-authority')); assert.ok(state.phases.some((phase) => phase.id === 'sf6-assets-presentation')); assert.ok(state.phases.some((phase) => phase.id === 'sf6-movement-controls')); assert.ok(state.phases.some((phase) => phase.id === 'sf6-attacks-systems')); assert.ok(state.phases.some((phase) => phase.id === 'sf6-drafts-qa')); assert.strictEqual(state.profile.appliedBlocks[0].id, 'first-grounded-light-normal'); assert.strictEqual(state.detections['character-files'].state, 'missing'); assert.match(state.detections['basic-actions'].detail, /1\/17/); assert.match(state.detections['slp-code'].detail, /3\/4|2\/4/);
  const page = workspace.html(state); assert.match(page, /My Next Tasks/); assert.match(page, /Project Tickets/); assert.match(page, /Child ticket/); assert.match(page, /Responsibilities/); assert.match(page, /Reusable Lessons/); assert.match(page, /Capture structured lesson/); assert.match(page, /Automated findings say DETECTED, never PASSED/); assert.match(page, /Create editable project profile/);
  assert.match(page, /Report Intake/); assert.match(page, /Team Directory/); assert.match(page, /My Inbox/); assert.doesNotThrow(() => new Function(page.match(/<script>([\s\S]*)<\/script>/)[1]));
  const profileDirectory = path.join(directory, '.ikemen', 'workflow-profiles'); fs.mkdirSync(profileDirectory, { recursive: true });
  fs.writeFileSync(path.join(profileDirectory, 'custom.json'), JSON.stringify({ schemaVersion: 1, id: 'custom', version: 2, name: 'Custom Production', extends: 'bundled:sf-character-production', phases: [{ id: 'first-light-normal', steps: [{ id: 'light-normal.assets', label: 'Project-specific light-normal asset review' }, { id: 'light-normal.team-signoff', label: 'Team signs off', discipline: 'Review' }] }] }));
  fs.writeFileSync(path.join(directory, '.ikemen', 'workflow-settings.json'), JSON.stringify({ schemaVersion: 1, defaultProfile: 'workflow-profiles/custom.json' }));
  const inherited = workspace.loadState(context, character); assert.strictEqual(inherited.profile.id, 'custom'); assert.strictEqual(inherited.profile.version, 2); assert.strictEqual(inherited.profile.phases.length, 11); assert.ok(inherited.profile.phases.some((phase) => phase.id === 'sf6-attacks-systems')); assert.strictEqual(inherited.profile.phases.find((phase) => phase.id === 'first-light-normal').steps.find((step) => step.id === 'light-normal.assets').discipline, 'SFF / AIR'); assert.ok(inherited.profile.phases.find((phase) => phase.id === 'first-light-normal').steps.some((step) => step.id === 'light-normal.team-signoff'));
  fs.writeFileSync(path.join(directory, '.ikemen', 'workflow-settings.json'), JSON.stringify({ schemaVersion: 1, defaultProfile: 'bundled:hdbz-character-production' }));
  const selectedBundled = workspace.loadState(context, character); assert.strictEqual(selectedBundled.profile.id, 'hdbz-character-production'); assert.strictEqual(selectedBundled.profile.appliedBlocks[0].id, 'first-grounded-light-normal');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
console.log('Production Workflow workspace tests passed');
