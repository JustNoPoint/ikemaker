'use strict';

const assert = require('assert');
const { AUDIT_GLOBS, collectWorkspaceAuditUris, visitWorkspaceAuditDocuments } = require('../src/workspace_audit_sources');

const uri = value => ({ fsPath: value, toString: () => `file:${value}` });
const rows = {
  '**/*.zss': [uri('/p/a.zss'), uri('/p/b.zss'), uri('/p/shared.cns')],
  '**/*.cns': [uri('/p/a.cns'), uri('/p/shared.cns')],
  '**/*.cmd': [uri('/p/a.cmd'), uri('/p/b.cmd')],
  '**/*.st': [uri('/p/a.st'), uri('/p/b.st')]
};
const calls = [];
const opened = [], vscode = { workspace: {
  findFiles: async (glob, exclude, limit) => { calls.push({ glob, exclude, limit }); return rows[glob].slice(0, limit); },
  openTextDocument: async target => { opened.push(target.toString()); return { uri: target, fileName: target.fsPath }; }
} };

(async () => {
  const found = await collectWorkspaceAuditUris(vscode, 6);
  assert.deepStrictEqual(calls.map(item => item.glob), AUDIT_GLOBS, 'closed ZSS/CNS/CMD/ST sources are each queried through their exact audit route');
  assert(calls.every(item => item.limit === 6), 'each extension query is bounded by the total cap so unused quotas can backfill');
  assert.deepStrictEqual(found.map(item => item.fsPath), ['/p/a.zss', '/p/a.cns', '/p/a.cmd', '/p/a.st', '/p/b.zss', '/p/shared.cns']);
  assert.strictEqual(new Set(found.map(item => item.toString())).size, found.length, 'a source returned by overlapping providers is routed exactly once');
  const routed = [];
  const visit = await visitWorkspaceAuditDocuments(vscode, 6, async document => routed.push(document.fileName));
  assert.strictEqual(visit.visited, 6); assert.deepStrictEqual(opened, found.map(item => item.toString())); assert.deepStrictEqual(routed, found.map(item => item.fsPath), 'closed sources are opened and routed exactly once');

  const oneKindApi = { workspace: { findFiles: async (glob, _exclude, limit) => glob === '**/*.zss' ? Array.from({ length: 8 }, (_, index) => uri(`/only/${index}.zss`)).slice(0, limit) : [], openTextDocument: async target => ({ uri: target, fileName: target.fsPath }) } };
  assert.strictEqual((await collectWorkspaceAuditUris(oneKindApi, 5)).length, 5, 'an all-one-kind workspace backfills the entire cap');
  const skewedApi = { workspace: { findFiles: async (glob, _exclude, limit) => (glob === '**/*.zss' ? Array.from({ length: 8 }, (_, index) => uri(`/skew/${index}.zss`)) : glob === '**/*.cmd' ? [uri('/skew/only.cmd')] : []).slice(0, limit), openTextDocument: async target => ({ uri: target, fileName: target.fsPath }) } };
  const skewed = await collectWorkspaceAuditUris(skewedApi, 5); assert.strictEqual(skewed.length, 5); assert(skewed.some(item => item.fsPath.endsWith('.cmd')), 'a skewed workspace retains minority kinds and backfills the rest');
  let cancellationChecks = 0, cancellationOpens = 0;
  const cancelledApi = { workspace: { ...oneKindApi.workspace, openTextDocument: async target => { cancellationOpens += 1; return { uri: target, fileName: target.fsPath }; } } };
  const cancelled = await visitWorkspaceAuditDocuments(cancelledApi, 5, async () => {}, { cancelled: () => ++cancellationChecks > 2 });
  assert.strictEqual(cancelled.visited, 2); assert.strictEqual(cancellationOpens, 2, 'cancellation stops opening and routing closed files immediately');
  console.log('Workspace audit source routing is fair, bounded, closed-file capable, and deduplicated');
})().catch(error => { console.error(error); process.exitCode = 1; });
