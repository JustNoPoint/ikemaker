'use strict';

const FREQUENCIES = Object.freeze([
  Object.freeze({ id: 'off', label: 'Off', detail: 'Do not check automatically. The header icon still checks manually.', enabled: false }),
  Object.freeze({ id: 'daily', label: 'Daily', detail: 'Check when IKEMaker opens after at least 1 day.', enabled: true, days: 1, hours: 24 }),
  Object.freeze({ id: 'weekly', label: 'Weekly', detail: 'Check when IKEMaker opens after at least 7 days.', enabled: true, days: 7, hours: 168 }),
  Object.freeze({ id: 'monthly', label: 'Monthly', detail: 'Check when IKEMaker opens after at least 30 days.', enabled: true, days: 30, hours: 720 })
]);

function configuredFrequency(vscode) {
  const upstream = vscode.workspace.getConfiguration('ikemenZss.updates');
  const ikemaker = vscode.workspace.getConfiguration('ikemenZss.extensionUpdates');
  const upstreamEnabled = upstream.get('enabled', true), ikemakerEnabled = ikemaker.get('enabled', true);
  if (!upstreamEnabled && !ikemakerEnabled) return 'off';
  if (!upstreamEnabled || !ikemakerEnabled) return 'custom';
  const days = Math.max(1, Number(upstream.get('intervalDays', 7)) || 7);
  const hours = Math.max(1, Number(ikemaker.get('intervalHours', 24)) || 24);
  return FREQUENCIES.find((item) => item.enabled && item.days === days && item.hours === hours)?.id || 'custom';
}

async function applyFrequency(vscode, frequency) {
  if (!frequency || !FREQUENCIES.includes(frequency)) throw new TypeError('A supported update frequency is required.');
  const target = vscode.ConfigurationTarget.Global;
  const upstream = vscode.workspace.getConfiguration('ikemenZss.updates');
  const ikemaker = vscode.workspace.getConfiguration('ikemenZss.extensionUpdates');
  await upstream.update('enabled', frequency.enabled, target);
  await ikemaker.update('enabled', frequency.enabled, target);
  if (frequency.enabled) {
    await upstream.update('intervalDays', frequency.days, target);
    await ikemaker.update('intervalHours', frequency.hours, target);
  }
  return frequency;
}

async function configureFrequency(vscode) {
  const current = configuredFrequency(vscode);
  const choices = FREQUENCIES.map((frequency) => ({
    label: `${frequency.id === current ? '$(check) ' : ''}${frequency.label}`,
    description: frequency.id === current ? 'Current' : '',
    detail: frequency.detail,
    frequency
  }));
  const chosen = await vscode.window.showQuickPick(choices, {
    title: 'Automatic Update Checks',
    placeHolder: current === 'custom' ? 'The two update checkers currently use different schedules.' : 'Choose how often both update sources are checked.'
  });
  if (!chosen) return;
  await applyFrequency(vscode, chosen.frequency);
  await vscode.window.showInformationMessage(chosen.frequency.enabled
    ? `Automatic Elecbyte / IKEMEN and IKEMaker update checks: ${chosen.frequency.label}.`
    : 'Automatic update checks are off. The header icon still performs a manual check.');
}

const INSTALL_MODES = Object.freeze([
  Object.freeze({ id: 'backup-and-update', label: 'Make a backup, then update', detail: 'Copy the installed IKEMaker build to protected update storage before installing the verified update.' }),
  Object.freeze({ id: 'update-without-backup', label: 'Update without a backup', detail: 'Install the verified update over the active IKEMaker build.' }),
  Object.freeze({ id: 'keep-as-new-build', label: 'Keep as a new build', detail: 'Download and verify a versioned VSIX beside other saved builds. The active build is not replaced.' })
]);

function installSettings(vscode) {
  const config = vscode.workspace.getConfiguration('ikemenZss.extensionUpdates');
  const mode = String(config.get('installMode', 'backup-and-update') || 'backup-and-update');
  return {
    allowed: config.get('downloadInstallEnabled', true) === true,
    automatic: config.get('autoUpdateEnabled', false) === true,
    mode: INSTALL_MODES.some((item) => item.id === mode) ? mode : 'backup-and-update'
  };
}

async function configureInstallPermission(vscode) {
  const current = installSettings(vscode);
  const choice = await vscode.window.showQuickPick([
    { label: `${current.allowed ? '$(check) ' : ''}Allow reviewed downloads and installs`, value: true, detail: 'IKEMaker still asks for final approval and verifies identity, size, and SHA-256 before doing anything.' },
    { label: `${current.allowed ? '' : '$(check) '}Turn off downloading and installation`, value: false, detail: 'Checks remain available, but IKEMaker can only report that an update exists.' }
  ], { title: 'IKEMaker Update Permission', placeHolder: 'Choose whether IKEMaker may download or install its own updates.' });
  if (!choice) return;
  await vscode.workspace.getConfiguration('ikemenZss.extensionUpdates').update('downloadInstallEnabled', choice.value, vscode.ConfigurationTarget.Global);
  if (!choice.value) await vscode.workspace.getConfiguration('ikemenZss.extensionUpdates').update('autoUpdateEnabled', false, vscode.ConfigurationTarget.Global);
  await vscode.window.showInformationMessage(choice.value ? 'Reviewed IKEMaker update downloads and installs are allowed.' : 'IKEMaker update downloading and installation are off.');
}

async function configureAutoUpdate(vscode) {
  const current = installSettings(vscode);
  const choice = await vscode.window.showQuickPick([
    { label: `${current.automatic ? '$(check) ' : ''}Update IKEMaker automatically`, value: true, detail: `Use the selected update method after an automatic check. ${current.allowed ? '' : 'This also turns reviewed download/install permission on.'}` },
    { label: `${current.automatic ? '' : '$(check) '}Notify me only`, value: false, detail: 'Report available updates and wait for me to review them.' }
  ], { title: 'Automatic IKEMaker Updates', placeHolder: 'Automatic updating never reloads the app for you.' });
  if (!choice) return;
  const config = vscode.workspace.getConfiguration('ikemenZss.extensionUpdates');
  if (choice.value && !current.allowed) await config.update('downloadInstallEnabled', true, vscode.ConfigurationTarget.Global);
  await config.update('autoUpdateEnabled', choice.value, vscode.ConfigurationTarget.Global);
  await vscode.window.showInformationMessage(choice.value ? 'Automatic IKEMaker updates are on. The selected update method will be used; app reload remains manual.' : 'Automatic IKEMaker updates are off. Available updates will only be reported.');
}

async function configureInstallMode(vscode) {
  const current = installSettings(vscode);
  const choice = await vscode.window.showQuickPick(INSTALL_MODES.map((mode) => ({
    label: `${mode.id === current.mode ? '$(check) ' : ''}${mode.label}`,
    detail: mode.detail,
    mode
  })), { title: 'IKEMaker Update Method', placeHolder: 'Manual updates ask again; automatic updating uses this selected method.' });
  if (!choice) return;
  await vscode.workspace.getConfiguration('ikemenZss.extensionUpdates').update('installMode', choice.mode.id, vscode.ConfigurationTarget.Global);
  await vscode.window.showInformationMessage(`IKEMaker update method: ${choice.mode.label}.`);
}

async function configureUpdates(vscode) {
  const automatic = configuredFrequency(vscode), install = installSettings(vscode);
  const automaticLabel = automatic === 'custom' ? 'Custom' : FREQUENCIES.find((item) => item.id === automatic)?.label || 'Custom';
  const modeLabel = INSTALL_MODES.find((item) => item.id === install.mode)?.label || INSTALL_MODES[0].label;
  const choice = await vscode.window.showQuickPick([
    { label: 'Automatic checks', description: automaticLabel, detail: 'Change the shared Elecbyte / IKEMEN and IKEMaker check frequency, or turn automatic checks off.', action: 'frequency' },
    { label: 'Download and install permission', description: install.allowed ? 'Allowed after review' : 'Off', detail: 'Turn IKEMaker update downloading and installation on or off.', action: 'permission' },
    { label: 'Automatic IKEMaker updating', description: install.automatic ? 'On' : 'Off', detail: 'Choose whether automatic checks may apply the selected update method without another install prompt.', action: 'automatic' },
    { label: 'Update method', description: modeLabel, detail: 'Choose backup-and-update, update without backup, or keep a separate new build package.', action: 'mode' },
    { label: 'Restore a previous IKEMaker build', detail: 'Choose from exact verified rollback packages retained by backup-and-update.', action: 'restore' },
    { label: 'Advanced update settings', detail: 'Open all update source, channel, storage, and interval settings.', action: 'advanced' }
  ], { title: 'Update Settings', placeHolder: 'Choose what to configure.' });
  if (choice?.action === 'frequency') return configureFrequency(vscode);
  if (choice?.action === 'permission') return configureInstallPermission(vscode);
  if (choice?.action === 'automatic') return configureAutoUpdate(vscode);
  if (choice?.action === 'mode') return configureInstallMode(vscode);
  if (choice?.action === 'restore') return vscode.commands.executeCommand('ikemen.extensionUpdates.restoreBackup');
  if (choice?.action === 'advanced') return vscode.commands.executeCommand('workbench.action.openSettings', '@ext:justnopoint.ikemen-zss-tools update');
}

async function checkAll(vscode) {
  const results = [];
  for (const command of ['zss.updates.checkNow', 'ikemen.extensionUpdates.check']) {
    try { results.push({ command, status: 'fulfilled', value: await vscode.commands.executeCommand(command) }); }
    catch (reason) { results.push({ command, status: 'rejected', reason }); }
  }
  const failed = results.filter((item) => item.status === 'rejected');
  if (failed.length) {
    const names = failed.map((item) => item.command === 'zss.updates.checkNow' ? 'Elecbyte / IKEMEN references' : 'IKEMaker').join(' and ');
    await vscode.window.showWarningMessage(`${names} update check could not start. The other update check was still attempted.`);
  }
  return Object.freeze(results);
}

function registerUpdateCenter(vscode, context) {
  const subscriptions = [
    vscode.commands.registerCommand('ikemen.updates.checkAll', () => checkAll(vscode)),
    vscode.commands.registerCommand('ikemen.updates.configureFrequency', () => configureUpdates(vscode))
  ];
  context.subscriptions.push(...subscriptions);
  return Object.freeze({ checkAll: () => checkAll(vscode), configure: () => configureUpdates(vscode) });
}

module.exports = { FREQUENCIES, INSTALL_MODES, configuredFrequency, installSettings, applyFrequency, configureFrequency, configureInstallPermission, configureAutoUpdate, configureInstallMode, configureUpdates, checkAll, registerUpdateCenter };
