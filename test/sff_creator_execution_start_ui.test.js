'use strict';
const assert = require('assert');
const { confirmStartApprovedExecution } = require('../src/sff_creator_execution_start_ui');
async function main() {
  const calls = [], locator = { head: 'approved' }, runtime = { readApprovedExecution() { calls.push('read'); return { status: 'approved-execution-awaiting-start-confirmation', operationId: 'op', approvalReceiptHash: 'a'.repeat(64), startDecisionTemplate: { intent: 'start-approved-execution' }, writesAllowed: false }; }, startApprovedExecution(input) { calls.push(`start:${input.intent}`); return { status: 'execution-intent-retained-executor-not-started', executionStarted: false, resetDraft: false, writesAllowed: false }; } };
  const deferred = await confirmStartApprovedExecution({ runtime, continuationLocator: locator, ui: { async confirmStart() { return false; } } }); assert.strictEqual(deferred.status, 'approved-execution-start-deferred'); assert.strictEqual(deferred.executionStarted, false); assert.deepStrictEqual(calls.splice(0), ['read']);
  const retained = await confirmStartApprovedExecution({ runtime, continuationLocator: locator, ui: { async confirmStart() { return true; } } }); assert.strictEqual(retained.status, 'execution-intent-retained-executor-not-started'); assert.strictEqual(retained.executionStarted, false); assert.deepStrictEqual(calls, ['read', 'start:start-approved-execution']);
  console.log('SFF Creator execution-start UI defers write-free and separately retains intent without invoking execution');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
