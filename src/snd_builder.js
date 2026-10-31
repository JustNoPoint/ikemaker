'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vscode = require('vscode');
const soundBuild = require('./sound_build');
const { detectCapabilities, missingCapabilityMessage } = require('./platform_capabilities');
const { beginExternalMutation, optionsFromConfig } = require('./mutation_safety');
const { resolveProjectTool } = require('./bundled_tools');

function hostCapabilities(api = vscode) {
  return detectCapabilities({
    uiKind: api.env?.uiKind === api.UIKind?.Web ? 'web' : 'desktop',
    platform: process.platform,
    environment: process.env
  });
}

async function buildSndManifest(manifestPath, options = {}) {
  const api = options.api || vscode;
  const io = options.fs || fs;
  const capabilities = (options.hostCapabilities || hostCapabilities)(api);
  if (!capabilities.nativeBuilders) {
    await api.window.showInformationMessage(missingCapabilityMessage('SndMaker build execution', capabilities));
    return { built: false, reason: 'native-builder-unavailable' };
  }
  const absoluteManifest = path.resolve(manifestPath || '');
  const manifestText = io.readFileSync(absoluteManifest, 'utf8');
  const manifest = soundBuild.parse(manifestText);
  const check = soundBuild.validate(manifest, absoluteManifest);
  if (check.errors.length) throw new Error(check.errors.join('\n'));
  const output = path.resolve(path.dirname(absoluteManifest), manifest.output);
  const executable = (options.resolveProjectTool || resolveProjectTool)(
    api.workspace.getConfiguration('ikemenZss', api.Uri.file(output)).get('sndMakerPath', 'sndmaker.exe'),
    output,
    'sndmaker.exe'
  );
  if (options.confirm !== false) {
    const answer = await api.window.showWarningMessage(
      `Build ${path.basename(output)} with ${manifest.entries.length} sound(s)?`,
      { modal: true, detail: `${check.warnings.join('\n')}${check.warnings.length ? '\n' : ''}SndMaker input: ${absoluteManifest}` },
      'Build SND'
    );
    if (answer !== 'Build SND') return { built: false, reason: 'cancelled' };
  }
  const mutationOptions = options.mutationOptions || ((filename, label) => optionsFromConfig(api, filename, label, {
    journalRoot: path.dirname(absoluteManifest),
    backup: false
  }));
  const guard = (options.beginExternalMutation || beginExternalMutation)(io, output, mutationOptions(output, 'sndmaker-build'));
  const result = (options.spawnSync || spawnSync)(executable, [], {
    cwd: path.dirname(absoluteManifest),
    input: manifestText,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    guard.rollback();
    if (result.error) throw result.error;
    throw new Error(result.stderr || result.stdout || `SndMaker exited with ${result.status}.`);
  }
  guard.complete();
  if (typeof options.refresh === 'function') await options.refresh(output);
  await api.window.showInformationMessage(`Built ${output}.`);
  return { built: true, output, manifest };
}

module.exports = { hostCapabilities, buildSndManifest };
