'use strict';

const assert = require('assert');
const updateCenter = require('../src/update_center');

function harness(values = {}) {
  const store = {
    updates: { enabled: true, intervalDays: 7, ...(values.updates || {}) },
    extensionUpdates: { enabled: true, intervalHours: 168, downloadInstallEnabled: true, autoUpdateEnabled: false, installMode: 'backup-and-update', ...(values.extensionUpdates || {}) }
  };
  const writes = [], commands = [], messages = [], picks = [];
  const vscode = {
    ConfigurationTarget: { Global: 1 },
    workspace: { getConfiguration(section) { const key = section.endsWith('extensionUpdates') ? 'extensionUpdates' : 'updates'; return { get: (name, fallback) => store[key][name] ?? fallback, update: async (name, value, target) => { store[key][name] = value; writes.push([key, name, value, target]); } }; } },
    window: { showQuickPick: async (choices) => { if (!picks.length) return undefined; const selected = picks.shift(); return choices.find((item) => item.action === selected || item.frequency?.id === selected || item.value === selected); }, showInformationMessage: async (message) => { messages.push(message); } , showWarningMessage: async (message) => { messages.push(message); } },
    commands: { executeCommand: async (command) => { commands.push(command); if (command === 'zss.updates.checkNow' && values.failUpstream) throw new Error('offline'); return command; } }
  };
  return { vscode, store, writes, commands, messages, picks };
}

(async () => {
  const h = harness();
  assert.strictEqual(updateCenter.configuredFrequency(h.vscode), 'weekly');
  await updateCenter.applyFrequency(h.vscode, updateCenter.FREQUENCIES.find((item) => item.id === 'off'));
  assert.strictEqual(h.store.updates.enabled, false); assert.strictEqual(h.store.extensionUpdates.enabled, false);
  assert(h.writes.every((item) => item[3] === 1), 'shared update policy is application-scoped');

  h.store.extensionUpdates.autoUpdateEnabled = true;
  h.picks.push(false);
  await updateCenter.configureInstallPermission(h.vscode);
  assert.strictEqual(h.store.extensionUpdates.downloadInstallEnabled, false);
  assert.strictEqual(h.store.extensionUpdates.autoUpdateEnabled, false, 'turning installation permission off also turns automatic updating off');

  const checks = harness({ failUpstream: true });
  await updateCenter.checkAll(checks.vscode);
  assert.deepStrictEqual(checks.commands, ['zss.updates.checkNow', 'ikemen.extensionUpdates.check'], 'both checks run even when the first one fails');
  assert(checks.messages.some((message) => /other update check was still attempted/.test(message)));
  console.log('Shared update center frequency, permission, automatic-update, and independent-check tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
