'use strict';

const assert = require('assert');
const registryModel = require('../src/project_registry');
const manager = require('../src/project_management_model');

let registry = registryModel.normalize({ schemaVersion: 2, projects: [] });
assert.strictEqual(registry.schemaVersion, 4, 'schema 2 registries should migrate through project/team assignments and engine targets');
assert.deepStrictEqual(registry.workProjects, []);
assert.deepStrictEqual(registry.teams, []);

registry = manager.addGame(registry, { name: 'My Hobby Game', distributionIntent: 'hobby', contentBasis: 'original' });
registry = manager.addGame(registry, { name: 'Commercial Game', distributionIntent: 'commercial', contentBasis: 'original' });
assert.strictEqual(registry.projects[0].distributionIntent, 'hobby');
registry = manager.updateGame(registry, registry.projects[0].id, { distributionIntent: 'commercial' });
assert.strictEqual(registry.projects[0].distributionIntent, 'commercial', 'game classification must remain editable');

registry = manager.addTeam(registry, { name: 'Main Team' });
const teamId = registry.teams[0].id;
assert(registry.teams[0].jobClasses.includes('Animator'));
assert(registry.teams[0].jobClasses.includes('CS'));
assert(registry.teams[0].jobClasses.includes('Voice'));
registry = manager.addJobClass(registry, teamId, 'Writer');
registry = manager.addMember(registry, teamId, { name: 'Artist', handle: 'Artist', jobClasses: ['Animator', 'CS', 'Writer'] });
registry = manager.updateMember(registry, teamId, registry.teams[0].members[0].id, { name: 'Lead Artist', jobClasses: ['Animator'], active: false });
assert.strictEqual(registry.teams[0].members[0].name, 'Lead Artist');
assert.strictEqual(registry.teams[0].members[0].active, false);
assert.throws(() => manager.addMember(registry, teamId, { name: 'Duplicate', handle: 'Artist' }), /already exists/);

registry = manager.addWorkProject(registry, { name: 'Hero Character', type: 'character', root: 'chars/Hero', gameId: registry.projects[0].id, teamId });
const workId = registry.workProjects[0].id;
assert.strictEqual(registry.workProjects[0].gameId, registry.projects[0].id);
registry = manager.updateWorkProject(registry, workId, { gameId: registry.projects[1].id });
assert.strictEqual(registry.workProjects[0].gameId, registry.projects[1].id, 'a work project should be reassignable to another game');
registry = manager.updateWorkProject(registry, workId, { gameId: '', teamId: '' });
assert.strictEqual(registry.workProjects[0].gameId, '');
assert.strictEqual(registry.workProjects[0].teamId, '');
assert.throws(() => manager.updateWorkProject(registry, workId, { gameIds: ['a', 'b'] }), /only one game/);
assert(registryModel.validate(registry).issues.every((issue) => issue.level !== 'error'));

console.log('Project and team management model tests passed');
