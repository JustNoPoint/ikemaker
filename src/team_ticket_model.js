'use strict';

const COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'discussion', label: 'Discussion' },
  { id: 'ready', label: 'Ready' },
  { id: 'doing', label: 'Doing' },
  { id: 'testing', label: 'Testing' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' }
];
const TYPES = ['Epic', 'Character', 'Feature', 'Bug', 'Discussion', 'Art', 'Sound', 'Stage', 'Screenpack', 'Other'];
const DEFAULT_ROLES = ['Director', 'Coder', 'Animator', 'CS', 'Palette', 'Sound', 'Voice', 'QA', 'Stage', 'Screenpack'];

function clean(value) { return String(value || '').trim(); }
function now() { return new Date().toISOString(); }
function issueFields(input = {}) {
  return { workProjectId: clean(input.workProjectId), gameProjectId: clean(input.gameProjectId), project: clean(input.project), character: clean(input.character), severity: ['Untriaged', 'Low', 'Medium', 'High', 'Critical'].includes(input.severity) ? input.severity : 'Untriaged', build: clean(input.build), steps: clean(input.steps), expected: clean(input.expected), actual: clean(input.actual), toolVersion: clean(input.toolVersion), itemType: clean(input.itemType), itemName: clean(input.itemName), contentVersion: clean(input.contentVersion), profile: clean(input.profile), screen: clean(input.screen), useCase: clean(input.useCase) };
}
function keyFor(project) { const words = clean(project).match(/[A-Za-z0-9]+/g) || []; return ((words.length > 1 ? words.map((word) => word[0]).join('') : words[0] || 'TEAM').slice(0, 6).toUpperCase()) || 'TEAM'; }
function normalizeSubtask(task, index = 0) {
  if (typeof task === 'string') return { id: `task-${index + 1}`, title: clean(task), done: false, assignedTo: '' };
  return { id: clean(task?.id) || `task-${index + 1}`, title: clean(task?.title) || `Task ${index + 1}`, done: Boolean(task?.done), assignedTo: clean(task?.assignedTo) };
}
function normalizeTicket(ticket, index = 0) {
  const column = COLUMNS.some((item) => item.id === ticket?.column) ? ticket.column : 'backlog';
  return {
    ...issueFields(ticket), id: clean(ticket?.id) || `ticket-${index + 1}`, parentId: clean(ticket?.parentId), title: clean(ticket?.title) || `Ticket ${index + 1}`,
    type: TYPES.includes(ticket?.type) ? ticket.type : 'Other', column, character: clean(ticket?.character),
    assignedTo: clean(ticket?.assignedTo), createdBy: clean(ticket?.createdBy), watchers: Array.isArray(ticket?.watchers) ? [...new Set(ticket.watchers.map(clean).filter(Boolean))] : [], description: clean(ticket?.description), source: clean(ticket?.source),
    attachments: Array.isArray(ticket?.attachments) ? ticket.attachments.map(clean).filter(Boolean) : [],
    labels: Array.isArray(ticket?.labels) ? ticket.labels.map(clean).filter(Boolean) : [],
    subtasks: Array.isArray(ticket?.subtasks) ? ticket.subtasks.map(normalizeSubtask) : [],
    comments: Array.isArray(ticket?.comments) ? ticket.comments.map((comment) => ({ author: clean(comment?.author), text: clean(comment?.text), time: clean(comment?.time) })) : [],
    createdAt: clean(ticket?.createdAt), updatedAt: clean(ticket?.updatedAt), archived: Boolean(ticket?.archived)
  };
}
function normalizeMember(member, index = 0) { const name = clean(member?.name) || `Member ${index + 1}`, handle = (clean(member?.handle) || name.replace(/\s+/g, '')).replace(/^@/, ''); return { id: clean(member?.id) || handle.toLowerCase(), name, handle, roles: Array.isArray(member?.roles) ? member.roles.map(clean).filter(Boolean) : [], active: member?.active !== false, joinedAt: clean(member?.joinedAt), leftAt: clean(member?.leftAt) }; }
function normalizeReport(report, index = 0) { return { ...issueFields(report), id: clean(report?.id) || `REPORT-${index + 1}`, title: clean(report?.title) || `Report ${index + 1}`, body: clean(report?.body), reporter: clean(report?.reporter), attachments: Array.isArray(report?.attachments) ? report.attachments.map(clean).filter(Boolean) : [], status: ['pending', 'accepted', 'rejected'].includes(report?.status) ? report.status : 'pending', decision: clean(report?.decision), ticketId: clean(report?.ticketId), createdAt: clean(report?.createdAt), reviewedAt: clean(report?.reviewedAt), reviewedBy: clean(report?.reviewedBy) }; }
function normalizeNotification(item, index = 0) { return { id: clean(item?.id) || `NOTICE-${index + 1}`, to: clean(item?.to), ticketId: clean(item?.ticketId), text: clean(item?.text), time: clean(item?.time), read: Boolean(item?.read) }; }
function normalizeBoard(raw = {}) {
  const project = clean(raw.project), ticketList = Array.isArray(raw.tickets) ? raw.tickets.map(normalizeTicket) : [], used = ticketList.map((ticket) => Number(/-(\d+)$/.exec(ticket.id)?.[1]) || 0);
  return { schemaVersion: 2, project, projectKey: clean(raw.projectKey).toUpperCase() || keyFor(project), nextNumber: Math.max(Number(raw.nextNumber) || 1, ...used.map((value) => value + 1)), nextReportNumber: Number(raw.nextReportNumber) || 1, nextNotificationNumber: Number(raw.nextNotificationNumber) || 1, roles: Array.isArray(raw.roles) && raw.roles.length ? raw.roles.map(clean).filter(Boolean) : [...DEFAULT_ROLES], team: Array.isArray(raw.team) ? raw.team.map(normalizeMember) : [], reports: Array.isArray(raw.reports) ? raw.reports.map(normalizeReport) : [], notifications: Array.isArray(raw.notifications) ? raw.notifications.map(normalizeNotification) : [], updatedAt: clean(raw.updatedAt), tickets: ticketList };
}
function createTicket(boardRaw, input = {}, actor = '') {
  const board = normalizeBoard(boardRaw), title = clean(input.title);
  if (!title) throw new Error('A ticket title is required.');
  if (input.parentId) { const parent = board.tickets.find((ticket) => ticket.id === input.parentId); if (!parent) throw new Error(`Parent ticket not found: ${input.parentId}`); if (parent.type !== 'Epic') throw new Error('Only an Epic can contain child tickets. Use the task checklist inside a normal ticket.'); }
  let id = `${board.projectKey}-${board.nextNumber++}`; while (board.tickets.some((ticket) => ticket.id === id)) id = `${board.projectKey}-${board.nextNumber++}`;
  const timestamp = now(), ticket = normalizeTicket({ ...input, project: clean(input.project) || board.project, id, createdBy: actor, watchers: input.watchers || (actor ? [actor] : []), createdAt: timestamp, updatedAt: timestamp, comments: input.comments || (actor ? [{ author: actor, text: 'Ticket created.', time: timestamp }] : []) }, board.tickets.length);
  board.tickets.push(ticket); if (ticket.parentId) reopenIncomplete(board, board.tickets.find((item) => item.id === ticket.parentId)); board.updatedAt = timestamp; return board;
}
function updateTicket(boardRaw, id, changes = {}) {
  const board = normalizeBoard(boardRaw), ticket = board.tickets.find((item) => item.id === id);
  if (!ticket) throw new Error(`Ticket not found: ${id}`);
  if (changes.parentId === id) throw new Error('A ticket cannot be its own parent.');
  if (changes.parentId) { const parent = board.tickets.find((item) => item.id === changes.parentId); if (!parent || parent.type !== 'Epic') throw new Error('A parent must be an Epic.'); if (descendants(board, id).some((child) => child.id === changes.parentId)) throw new Error('A ticket cannot be placed below one of its own descendants.'); }
  if (changes.column === 'done') { const blocked = completion(board, ticket); if (!blocked.canClose) throw new Error(`Complete this ticket first: ${blocked.remainingTasks} task(s) and ${blocked.remainingChildren} child ticket(s) remain.`); }
  const watchers = [...ticket.watchers]; if (changes.assignedTo && !watchers.some((name) => name.toLowerCase() === clean(changes.assignedTo).toLowerCase())) watchers.push(clean(changes.assignedTo));
  const next = normalizeTicket({ ...ticket, ...changes, watchers, id: ticket.id, createdAt: ticket.createdAt, updatedAt: now() });
  Object.assign(ticket, next); reopenIncomplete(board, ticket); board.updatedAt = ticket.updatedAt; return board;
}
function addSubtask(boardRaw, id, title, assignedTo = '') {
  const board = normalizeBoard(boardRaw), ticket = board.tickets.find((item) => item.id === id), text = clean(title);
  if (!ticket) throw new Error(`Ticket not found: ${id}`); if (!text) throw new Error('A subtask title is required.');
  if (ticket.type === 'Epic') throw new Error('Add child tickets to an Epic. Task checklists belong inside its child tickets.');
  let suffix = ticket.subtasks.length + 1, taskId = `task-${suffix}`; while (ticket.subtasks.some((item) => item.id === taskId)) taskId = `task-${++suffix}`;
  ticket.subtasks.push({ id: taskId, title: text, done: false, assignedTo: clean(assignedTo) }); ticket.updatedAt = now(); reopenIncomplete(board, ticket); board.updatedAt = ticket.updatedAt; return board;
}
function updateSubtask(boardRaw, ticketId, taskId, changes = {}) {
  const board = normalizeBoard(boardRaw), ticket = board.tickets.find((item) => item.id === ticketId), task = ticket?.subtasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Subtask not found: ${taskId}`); Object.assign(task, normalizeSubtask({ ...task, ...changes, id: task.id })); ticket.updatedAt = now(); reopenIncomplete(board, ticket); board.updatedAt = ticket.updatedAt; return board;
}
function addComment(boardRaw, id, text, actor = '') {
  const board = normalizeBoard(boardRaw), ticket = board.tickets.find((item) => item.id === id), body = clean(text);
  if (!ticket) throw new Error(`Ticket not found: ${id}`); if (!body) throw new Error('A comment is required.');
  const author = clean(actor) || 'Team', timestamp = now(); ticket.comments.push({ author, text: body, time: timestamp }); ticket.updatedAt = timestamp;
  const recipients = new Set(ticket.watchers.filter((name) => name.toLowerCase() !== author.toLowerCase()));
  for (const token of body.match(/@[A-Za-z0-9_.-]+/g) || []) { const key = token.slice(1).toLowerCase(); for (const member of board.team.filter((item) => item.active && (item.handle.toLowerCase() === key || item.roles.some((role) => role.toLowerCase() === key)))) if (member.name.toLowerCase() !== author.toLowerCase()) recipients.add(member.name); }
  for (const recipient of recipients) board.notifications.push({ id: `NOTICE-${board.nextNotificationNumber++}`, to: recipient, ticketId: ticket.id, text: `${author} commented: ${body}`, time: timestamp, read: false });
  board.updatedAt = timestamp; return board;
}
function toggleWatch(boardRaw, id, actor) { const board = normalizeBoard(boardRaw), ticket = board.tickets.find((item) => item.id === id), name = clean(actor); if (!ticket || !name) throw new Error('A ticket and team identity are required.'); const index = ticket.watchers.findIndex((item) => item.toLowerCase() === name.toLowerCase()); if (index >= 0) ticket.watchers.splice(index, 1); else ticket.watchers.push(name); ticket.updatedAt = now(); board.updatedAt = ticket.updatedAt; return board; }
function addMember(boardRaw, input = {}) { const board = normalizeBoard(boardRaw), member = normalizeMember({ ...input, joinedAt: now(), active: true }, board.team.length); if (board.team.some((item) => item.handle.toLowerCase() === member.handle.toLowerCase())) throw new Error(`Team handle already exists: @${member.handle}`); board.team.push(member); board.updatedAt = now(); return board; }
function updateMember(boardRaw, id, changes = {}) { const board = normalizeBoard(boardRaw), member = board.team.find((item) => item.id === id); if (!member) throw new Error(`Team member not found: ${id}`); Object.assign(member, normalizeMember({ ...member, ...changes, id: member.id })); if (!member.active && !member.leftAt) member.leftAt = now(); if (member.active) member.leftAt = ''; board.updatedAt = now(); return board; }
function syncDirectory(boardRaw, assignedTeam = {}) {
  const board = normalizeBoard(boardRaw), jobClasses = Array.isArray(assignedTeam.jobClasses) ? assignedTeam.jobClasses.map(clean).filter(Boolean) : [];
  board.roles = [...new Set([...board.roles, ...jobClasses])];
  for (const source of assignedTeam.members || []) {
    const incoming = normalizeMember({ ...source, roles: source.jobClasses || source.roles }, board.team.length);
    const existing = board.team.find((item) => item.handle.toLowerCase() === incoming.handle.toLowerCase());
    if (existing) Object.assign(existing, { name: incoming.name, handle: incoming.handle, roles: incoming.roles, active: incoming.active, leftAt: incoming.active ? '' : (existing.leftAt || now()) });
    else board.team.push({ ...incoming, joinedAt: incoming.joinedAt || now(), leftAt: incoming.active ? '' : (incoming.leftAt || now()) });
  }
  board.updatedAt = now();
  return board;
}
function submitReport(boardRaw, input = {}) { const board = normalizeBoard(boardRaw), title = clean(input.title), body = clean(input.body); if (!title || !body) throw new Error('A report needs both a title and description.'); const report = normalizeReport({ ...input, project: clean(input.project) || board.project, id: `REPORT-${board.nextReportNumber++}`, status: 'pending', createdAt: now() }, board.reports.length); board.reports.push(report); board.updatedAt = report.createdAt; return board; }
function reviewReport(boardRaw, reportId, decision, options = {}, actor = '') { let board = normalizeBoard(boardRaw); const report = board.reports.find((item) => item.id === reportId); if (!report || report.status !== 'pending') throw new Error('Only a pending report can be reviewed.'); if (decision === 'accepted') { board = createTicket(board, { ...issueFields(report), title: report.title, type: options.type || 'Bug', column: 'backlog', description: report.body, source: report.id, attachments: report.attachments, watchers: [report.reporter, actor].filter(Boolean) }, actor); const current = board.reports.find((item) => item.id === reportId); current.status = 'accepted'; current.ticketId = board.tickets[board.tickets.length - 1].id; current.decision = clean(options.reason); current.reviewedAt = now(); current.reviewedBy = clean(actor); } else if (decision === 'rejected') { report.status = 'rejected'; report.decision = clean(options.reason); report.reviewedAt = now(); report.reviewedBy = clean(actor); } else throw new Error('Report decision must be accepted or rejected.'); board.updatedAt = now(); return board; }
function inbox(boardRaw, actor) { const name = clean(actor).toLowerCase(); return normalizeBoard(boardRaw).notifications.filter((item) => !item.read && item.to.toLowerCase() === name); }
function markNotificationsRead(boardRaw, actor) { const board = normalizeBoard(boardRaw), name = clean(actor).toLowerCase(); for (const item of board.notifications) if (item.to.toLowerCase() === name) item.read = true; board.updatedAt = now(); return board; }
function ticketFromFeedback(text) {
  const source = clean(text); if (!source) throw new Error('Clipboard feedback is empty.');
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), first = lines[0].replace(/^[-*#>\d.\s]+/, '').trim();
  const title = (first.length > 90 ? `${first.slice(0, 87)}...` : first) || 'Review pasted feedback';
  return { title, type: 'Discussion', column: 'discussion', description: source, source: 'Pasted team feedback', subtasks: [{ title: 'Review feedback and define the actionable subtasks', done: false, assignedTo: '' }] };
}
function descendants(boardRaw, id) { const board = normalizeBoard(boardRaw), output = [], visit = (parentId) => { for (const child of board.tickets.filter((ticket) => !ticket.archived && ticket.parentId === parentId)) { output.push(child); visit(child.id); } }; visit(id); return output; }
function completion(boardOrTicket, maybeTicket) {
  const board = maybeTicket ? normalizeBoard(boardOrTicket) : null, ticket = maybeTicket || boardOrTicket, children = board ? board.tickets.filter((item) => !item.archived && item.parentId === ticket.id) : [];
  const total = ticket.subtasks.length, done = ticket.subtasks.filter((task) => task.done).length, remainingChildren = children.filter((child) => child.column !== 'done').length;
  return { total, done, percent: total ? Math.round(done / total * 100) : children.length ? Math.round((children.length - remainingChildren) / children.length * 100) : 0, children: children.length, remainingTasks: total - done, remainingChildren, canClose: total === done && remainingChildren === 0 };
}
function reopenIncomplete(board, start) { let ticket = start; while (ticket) { if (ticket.column === 'done' && !completion(board, ticket).canClose) ticket.column = 'review'; ticket = ticket.parentId ? board.tickets.find((item) => item.id === ticket.parentId) : null; } }

module.exports = { COLUMNS, TYPES, DEFAULT_ROLES, normalizeBoard, normalizeTicket, createTicket, updateTicket, addSubtask, updateSubtask, addComment, toggleWatch, addMember, updateMember, syncDirectory, submitReport, reviewReport, inbox, markNotificationsRead, ticketFromFeedback, descendants, completion };
