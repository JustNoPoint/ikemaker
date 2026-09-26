'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const FILE_TYPES = Object.freeze([
  { extension: '.zss', label: 'ZSS state or command code', recommended: true },
  { extension: '.air', label: 'IKEMEN / MUGEN animations', recommended: true },
  { extension: '.sff', label: 'IKEMEN / MUGEN sprites', recommended: true },
  { extension: '.cns', label: 'CNS state or command code', recommended: true },
  { extension: '.inp', label: 'IKEMEN character input definitions', recommended: true },
  { extension: '.jnp', label: 'IKEMaker data', recommended: true },
  { extension: '.def', label: 'DEF configuration', shared: true },
  { extension: '.snd', label: 'IKEMEN / MUGEN sounds', shared: true },
  { extension: '.act', label: 'Palette / shared ACT file', shared: true },
  { extension: '.st', label: 'State / shared ST file', shared: true },
  { extension: '.lua', label: 'Lua source', shared: true },
  { extension: '.cmd', label: 'Legacy character commands / Windows command script', dangerous: true }
]);

const APP_PROG_ID = 'IKEMaker.File';
const APP_CAPABILITIES = 'HKCU\\Software\\IKEMaker\\Capabilities';
const REGISTERED_APPS = 'HKCU\\Software\\RegisteredApplications';
const CLASSES = 'HKCU\\Software\\Classes';

function quoteCommand(executable) {
  return `"${String(executable).replace(/"/g, '\\"')}" --reuse-window "%1"`;
}

function locateCodeExecutable() {
  const candidates = [
    /(?:^|\\)(?:Code|Code - Insiders)\.exe$/i.test(process.execPath || '') ? process.execPath : '',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft VS Code', 'Code.exe')
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function normalizeCustomExtension(value) {
  const extension = `.${String(value || '').trim().replace(/^\.+/, '').toLowerCase()}`;
  return /^\.[a-z0-9][a-z0-9_-]{1,15}$/.test(extension) ? extension : '';
}

function registryPlan(executable, extensions, options = {}) {
  const command = quoteCommand(executable);
  const selected = [...new Set(extensions.map((value) => String(value).toLowerCase()))]
    .filter((value) => FILE_TYPES.some((type) => type.extension === value) || (options.allowCustom && normalizeCustomExtension(value) === value));
  const defaultCapable = selected.filter((extension) => extension !== '.cmd');
  const commands = [
    ['add', `${CLASSES}\\${APP_PROG_ID}`, '/ve', '/d', 'IKEMaker file', '/f'],
    ['add', `${CLASSES}\\${APP_PROG_ID}\\DefaultIcon`, '/ve', '/d', `"${executable}",0`, '/f'],
    ['add', `${CLASSES}\\${APP_PROG_ID}\\shell\\open\\command`, '/ve', '/d', command, '/f'],
    ['add', APP_CAPABILITIES, '/v', 'ApplicationName', '/d', 'IKEMaker', '/f'],
    ['add', APP_CAPABILITIES, '/v', 'ApplicationDescription', '/d', 'Visual IKEMEN GO authoring in VS Code', '/f'],
    ['add', REGISTERED_APPS, '/v', 'IKEMaker', '/d', 'Software\\IKEMaker\\Capabilities', '/f']
  ];
  for (const extension of defaultCapable) {
    commands.push(['add', `${CLASSES}\\${extension}\\OpenWithProgids`, '/v', APP_PROG_ID, '/d', '', '/f']);
    commands.push(['add', `${APP_CAPABILITIES}\\FileAssociations`, '/v', extension, '/d', APP_PROG_ID, '/f']);
  }
  for (const extension of selected) {
    const verb = `${CLASSES}\\SystemFileAssociations\\${extension}\\shell\\IKEMaker`;
    commands.push(['add', verb, '/ve', '/d', 'Open with IKEMaker', '/f']);
    commands.push(['add', verb, '/v', 'Icon', '/d', executable, '/f']);
    commands.push(['add', `${verb}\\command`, '/ve', '/d', command, '/f']);
  }
  return { commands, selected, defaultCapable };
}

function removePlan(customExtensions = []) {
  const types = [...FILE_TYPES.map(({ extension }) => extension), ...customExtensions.map(normalizeCustomExtension).filter(Boolean)];
  return [
    ['delete', `${CLASSES}\\${APP_PROG_ID}`, '/f'],
    ['delete', 'HKCU\\Software\\IKEMaker', '/f'],
    ['delete', REGISTERED_APPS, '/v', 'IKEMaker', '/f'],
    ...types.map((extension) => ['delete', `${CLASSES}\\SystemFileAssociations\\${extension}\\shell\\IKEMaker`, '/f']),
    ...types.filter((extension) => extension !== '.cmd').map((extension) => ['delete', `${CLASSES}\\${extension}\\OpenWithProgids`, '/v', APP_PROG_ID, '/f'])
  ];
}

function runRegistryCommands(commands, tolerateMissing = false) {
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  return commands.reduce((promise, args) => promise.then(() => new Promise((resolve, reject) => {
    execFile(executable, args, { windowsHide: true }, (error, _stdout, stderr) => {
      if (!error || tolerateMissing) return resolve();
      reject(new Error((stderr || error.message || 'Registry update failed').trim()));
    });
  })), Promise.resolve());
}

async function openDefaultApps() {
  await vscode.env.openExternal(vscode.Uri.parse('ms-settings:defaultapps'));
}

async function chooseTypes() {
  const items = FILE_TYPES.map((type) => ({
    label: type.extension,
    description: type.label,
    detail: type.dangerous
      ? 'Legacy only: rename character command files to .inp or a project extension. This adds a right-click action and does not replace Windows script execution.'
      : type.shared ? 'Shared extension: register IKEMaker, then choose its default in Windows only if desired.' : 'Recommended IKEMEN association.',
    picked: Boolean(type.recommended),
    extension: type.extension
  }));
  return vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: 'Choose file types to open with IKEMaker',
    placeHolder: 'IKEMaker becomes an Open with choice. You select double-click defaults afterward in Windows.'
  });
}

async function installAssociations() {
  if (process.platform !== 'win32') return vscode.window.showInformationMessage('Windows file-opening integration is available on Windows desktop only.');
  const executable = locateCodeExecutable();
  if (!executable) return vscode.window.showErrorMessage('IKEMaker could not locate Code.exe. Reinstall VS Code for the current user, then try again.');
  const choices = await chooseTypes();
  if (!choices || !choices.length) return;
  const plan = registryPlan(executable, choices.map((choice) => choice.extension));
  try {
    await runRegistryCommands(plan.commands);
    const action = await vscode.window.showInformationMessage(
      `IKEMaker is now an “Open with” choice for ${plan.selected.join(', ')}. Windows still controls each double-click default.${plan.selected.includes('.cmd') ? ' .cmd remains executable; migrate character command files to .inp or a project-specific extension.' : ''}`,
      'Choose Windows Defaults', 'Done'
    );
    if (action === 'Choose Windows Defaults') await openDefaultApps();
  } catch (error) {
    vscode.window.showErrorMessage(`IKEMaker could not register its file-opening entries: ${error.message}`);
  }
}

async function removeAssociations(context) {
  if (process.platform !== 'win32') return;
  const custom = context?.globalState?.get('ikemen.windowsFileAssociations.customExtensions', []) || [];
  await runRegistryCommands(removePlan(custom), true);
  if (context?.globalState) await context.globalState.update('ikemen.windowsFileAssociations.customExtensions', []);
  vscode.window.showInformationMessage('IKEMaker file-opening entries were removed. Existing Windows defaults may be changed from Default Apps.');
}

async function configureAssociations(context) {
  if (process.platform !== 'win32') return vscode.window.showInformationMessage('Windows file-opening integration is available on Windows desktop only.');
  const action = await vscode.window.showQuickPick([
    { label: 'Register file types…', description: 'Choose IKEMEN formats and add Open with IKEMaker' },
    { label: 'Register a project input extension…', description: 'For a named input format such as HDBZ .mfg' },
    { label: 'Open Windows Default Apps', description: 'Choose which registered formats open in IKEMaker on double-click' },
    { label: 'Remove IKEMaker entries', description: 'Undo IKEMaker’s Windows file-opening registration' }
  ], { title: 'IKEMaker Windows File Opening' });
  if (!action) return;
  if (action.label === 'Register file types…') return installAssociations();
  if (action.label === 'Register a project input extension…') {
    const entered = await vscode.window.showInputBox({ title: 'Project input extension', prompt: 'Enter the extension without a dot, such as mfg.' });
    const extension = normalizeCustomExtension(entered);
    if (!extension) return entered === undefined ? undefined : vscode.window.showErrorMessage('Use 2–16 letters, numbers, underscores, or hyphens.');
    const executable = locateCodeExecutable();
    if (!executable) return vscode.window.showErrorMessage('IKEMaker could not locate Code.exe.');
    await runRegistryCommands(registryPlan(executable, [extension], { allowCustom: true }).commands);
    if (context?.globalState) {
      const existing = context.globalState.get('ikemen.windowsFileAssociations.customExtensions', []);
      await context.globalState.update('ikemen.windowsFileAssociations.customExtensions', [...new Set([...existing, extension])]);
    }
    const associations = vscode.workspace.getConfiguration('files').get('associations', {});
    await vscode.workspace.getConfiguration('files').update('associations', { ...associations, [`*${extension}`]: 'ikemen-cns' }, vscode.ConfigurationTarget.Global);
    const next = await vscode.window.showInformationMessage(`${extension} is registered as an IKEMaker input-file extension.`, 'Choose Windows Defaults', 'Done');
    if (next === 'Choose Windows Defaults') await openDefaultApps();
    return;
  }
  if (action.label === 'Open Windows Default Apps') return openDefaultApps();
  return removeAssociations(context);
}

function offerFirstRunSetup(context, version) {
  if (process.platform !== 'win32' || !context.globalState) return;
  const disabled = context.globalState.get('ikemen.windowsFileAssociations.neverPrompt', false);
  const promptKey = 'ikemen.windowsFileAssociations.promptedVersion';
  if (disabled || context.globalState.get(promptKey) === version) return;
  context.globalState.update(promptKey, version);
  setTimeout(async () => {
    const action = await vscode.window.showInformationMessage(
      'Would you like Windows to offer IKEMaker when opening ZSS, SFF, AIR, DEF, SND, and related files?',
      'Set Up…', 'Not Now', 'Do Not Ask Again'
    );
    if (action === 'Set Up…') await configureAssociations(context);
    if (action === 'Do Not Ask Again') await context.globalState.update('ikemen.windowsFileAssociations.neverPrompt', true);
  }, 1200);
}

function registerWindowsFileAssociations(context, version) {
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.windowsFileAssociations.configure', () => configureAssociations(context)));
  offerFirstRunSetup(context, version);
}

module.exports = { FILE_TYPES, quoteCommand, normalizeCustomExtension, registryPlan, removePlan, locateCodeExecutable, registerWindowsFileAssociations };
