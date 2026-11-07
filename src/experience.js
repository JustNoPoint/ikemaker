'use strict';

const vscode = require('vscode');
const { DOMAINS, PRESETS, normalizeMode, summary } = require('./experience_model');

function setting(domain) { return `experience.${domain}`; }
function configuration(resource) { return vscode.workspace.getConfiguration('ikemenZss', resource); }
function mode(domain, resource) {
  const descriptor = DOMAINS.find((item) => item.id === domain);
  return normalizeMode(configuration(resource).get(setting(domain)), descriptor ? descriptor.defaultMode : 'learning');
}
function profile(resource) { return Object.fromEntries(DOMAINS.map((domain) => [domain.id, mode(domain.id, resource)])); }

async function applyProfile(values, resource) {
  const config = configuration(resource);
  for (const domain of DOMAINS) await config.update(setting(domain.id), values[domain.id], vscode.ConfigurationTarget.WorkspaceFolder);
}

async function configureExperience(resource) {
  const preset = await vscode.window.showQuickPick([
    { label: 'CNS Veteran / Expanded ZSS and Lua', description: 'Compact CNS and assets; expanded ZSS, Lua, stage, and UI explanations.', values: PRESETS.cnsVeteran },
    { label: 'Expanded explanations in all areas', description: 'Show teaching, explanations, and previews throughout.', values: PRESETS.learning },
    { label: 'Compact explanations in all areas', description: 'Use a denser presentation; explanations remain available.', values: PRESETS.advanced },
    { label: 'Customize Each Area…', description: 'Choose explanation density independently for every area.', custom: true }
  ], { title: 'Configure IKEMEN authoring experience', placeHolder: summary(profile(resource)) });
  if (!preset) return;
  let values = preset.values;
  if (preset.custom) {
    values = {};
    for (const domain of DOMAINS) {
      const current = mode(domain.id, resource);
      const picked = await vscode.window.showQuickPick([
        { label: 'Expanded explanations', description: 'More guidance, previews, and teaching.', value: 'learning', picked: current === 'learning' },
        { label: 'Compact explanations', description: 'Denser, keyboard-friendly presentation.', value: 'advanced', picked: current === 'advanced' }
      ], { title: `${domain.label} experience` });
      if (!picked) return;
      values[domain.id] = picked.value;
    }
  }
  await applyProfile(values, resource);
  vscode.window.showInformationMessage(`IKEMEN experience updated — ${summary(profile(resource))}`);
}

function registerExperience(context) {
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.experience.configure', (uri) => configureExperience(uri)));
}

module.exports = { setting, mode, profile, applyProfile, configureExperience, registerExperience };
