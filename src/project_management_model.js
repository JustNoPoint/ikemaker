'use strict';

const registryModel = require('./project_registry');

function clean(value) { return String(value == null ? '' : value).trim(); }
function safeId(value) { return clean(value).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, ''); }
function changed(raw) {
  const registry = registryModel.normalize(raw);
  registry.registryVersion = Math.max(1, Number(registry.registryVersion) || 1) + 1;
  return registry;
}
function uniqueId(items, requested, fallback) {
  const base = safeId(requested) || fallback;
  let id = base, suffix = 2;
  while (items.some((item) => item.id === id)) id = `${base}-${suffix++}`;
  return id;
}
function addGame(raw, input = {}) {
  const registry = registryModel.normalize(raw), name = clean(input.name);
  if (!name) throw new Error('A game name is required.');
  const id = uniqueId(registry.projects, input.id || name, 'game');
  registry.projects.push(registryModel.normalizeProject({ ...input, id, name, roots: input.roots || [] }));
  return changed(registry);
}
function updateGame(raw, id, changes = {}) {
  const registry = registryModel.normalize(raw), game = registry.projects.find((item) => item.id === clean(id).toLowerCase());
  if (!game) throw new Error(`Game not found: ${id}`);
  const next = registryModel.normalizeProject({ ...game, ...changes, id: game.id });
  if (!next.name) throw new Error('A game name is required.');
  Object.assign(game, next);
  return changed(registry);
}
function addWorkProject(raw, input = {}) {
  const registry = registryModel.normalize(raw), name = clean(input.name);
  if (!name) throw new Error('A work-project name is required.');
  const gameId = clean(input.gameId).toLowerCase(), teamId = clean(input.teamId).toLowerCase();
  if (gameId && !registry.projects.some((item) => item.id === gameId)) throw new Error(`Game not found: ${gameId}`);
  if (teamId && !registry.teams.some((item) => item.id === teamId)) throw new Error(`Team not found: ${teamId}`);
  const id = uniqueId(registry.workProjects, input.id || name, 'work');
  registry.workProjects.push(registryModel.normalizeWorkProject({ ...input, id, name, gameId, teamId }));
  return changed(registry);
}
function updateWorkProject(raw, id, changes = {}) {
  const registry = registryModel.normalize(raw), item = registry.workProjects.find((entry) => entry.id === clean(id).toLowerCase());
  if (!item) throw new Error(`Work project not found: ${id}`);
  if (Array.isArray(changes.gameIds) && changes.gameIds.filter(Boolean).length > 1) throw new Error('A work project can belong to only one game.');
  const next = registryModel.normalizeWorkProject({ ...item, ...changes, id: item.id });
  if (next.gameId && !registry.projects.some((game) => game.id === next.gameId)) throw new Error(`Game not found: ${next.gameId}`);
  if (next.teamId && !registry.teams.some((team) => team.id === next.teamId)) throw new Error(`Team not found: ${next.teamId}`);
  Object.assign(item, next);
  return changed(registry);
}
function addTeam(raw, input = {}) {
  const registry = registryModel.normalize(raw), name = clean(input.name);
  if (!name) throw new Error('A team name is required.');
  const id = uniqueId(registry.teams, input.id || name, 'team');
  registry.teams.push(registryModel.normalizeTeam({ ...input, id, name, jobClasses: input.jobClasses || registryModel.DEFAULT_JOB_CLASSES }));
  return changed(registry);
}
function updateTeam(raw, id, changes = {}) {
  const registry = registryModel.normalize(raw), team = registry.teams.find((item) => item.id === clean(id).toLowerCase());
  if (!team) throw new Error(`Team not found: ${id}`);
  const next = registryModel.normalizeTeam({ ...team, ...changes, id: team.id });
  if (!next.name) throw new Error('A team name is required.');
  Object.assign(team, next);
  return changed(registry);
}
function addMember(raw, teamId, input = {}) {
  const registry = registryModel.normalize(raw), team = registry.teams.find((item) => item.id === clean(teamId).toLowerCase());
  if (!team) throw new Error(`Team not found: ${teamId}`);
  const member = registryModel.normalizeMember(input, team.members.length);
  if (!clean(input.name)) throw new Error('A member name is required.');
  if (team.members.some((item) => item.handle.toLowerCase() === member.handle.toLowerCase())) throw new Error(`Team handle already exists: @${member.handle}`);
  member.id = uniqueId(team.members, input.id || member.handle || member.name, 'member');
  member.jobClasses = member.jobClasses.filter((item) => team.jobClasses.includes(item));
  team.members.push(member);
  return changed(registry);
}
function updateMember(raw, teamId, memberId, changes = {}) {
  const registry = registryModel.normalize(raw), team = registry.teams.find((item) => item.id === clean(teamId).toLowerCase());
  if (!team) throw new Error(`Team not found: ${teamId}`);
  const member = team.members.find((item) => item.id === clean(memberId).toLowerCase());
  if (!member) throw new Error(`Member not found: ${memberId}`);
  const next = registryModel.normalizeMember({ ...member, ...changes, id: member.id });
  if (!next.name) throw new Error('A member name is required.');
  if (team.members.some((item) => item.id !== member.id && item.handle.toLowerCase() === next.handle.toLowerCase())) throw new Error(`Team handle already exists: @${next.handle}`);
  next.jobClasses = next.jobClasses.filter((item) => team.jobClasses.includes(item));
  Object.assign(member, next);
  return changed(registry);
}
function addJobClass(raw, teamId, value) {
  const registry = registryModel.normalize(raw), team = registry.teams.find((item) => item.id === clean(teamId).toLowerCase()), name = clean(value);
  if (!team) throw new Error(`Team not found: ${teamId}`);
  if (!name) throw new Error('A job-class name is required.');
  if (!team.jobClasses.some((item) => item.toLowerCase() === name.toLowerCase())) team.jobClasses.push(name);
  return changed(registry);
}

module.exports = { safeId, addGame, updateGame, addWorkProject, updateWorkProject, addTeam, updateTeam, addMember, updateMember, addJobClass };
