'use strict';

function detectCapabilities(input = {}) {
  const uiKind = String(input.uiKind || 'desktop').toLowerCase();
  const platform = String(input.platform || 'unknown').toLowerCase();
  const environment = input.environment || {};
  const userAgent = String(input.userAgent || '').toLowerCase();
  const web = uiKind === 'web';
  const android = platform === 'android' || Boolean(environment.ANDROID_ROOT || environment.ANDROID_DATA || environment.TERMUX_VERSION) || /android/.test(userAgent);
  const ios = /iphone|ipad|ipod/.test(userAgent);
  const windows = platform === 'win32';
  const localFileSystem = !web;
  const processExecution = !web;
  return {
    host: web ? 'web' : 'desktop',
    platform,
    web,
    android,
    ios,
    mobile: android || ios,
    localFileSystem,
    virtualFileSystem: web,
    portableEditors: true,
    archiveParsing: !web,
    processExecution,
    windowsExecutables: processExecution && windows,
    nativeBuilders: processExecution && windows,
    externalEditors: processExecution && !android,
    ikemenLaunch: processExecution && windows && !android,
    androidBridge: false,
    javascriptArchiveWriters: false
  };
}

function capabilitySummary(value) {
  const platform = value.ios ? 'iPhone/iPad web host' : value.android ? 'Android host' : value.web ? 'browser host' : `${value.platform} desktop host`;
  const available = ['syntax and portable text-editor features'];
  if (value.archiveParsing) available.push('archive parsing and inspection');
  if (value.localFileSystem) available.push('local filesystem adapters');
  if (value.nativeBuilders) available.push('native SprMaker2/SndMaker adapters');
  if (value.externalEditors) available.push('external image/audio editors');
  if (value.ikemenLaunch) available.push('IKEMEN desktop launch');
  const unavailable = [];
  if (!value.archiveParsing) unavailable.push('SFF/SND archive parsing in this browser build');
  if (!value.nativeBuilders) unavailable.push('native SprMaker2/SndMaker execution');
  if (!value.externalEditors) unavailable.push('desktop image/audio editor launch');
  if (!value.ikemenLaunch) unavailable.push('IKEMEN launch from the extension');
  if (!value.javascriptArchiveWriters) unavailable.push('portable JavaScript SFF/SND rebuilding');
  return { platform, available, unavailable };
}

function missingCapabilityMessage(feature, capabilities) {
  const host = capabilities.ios ? 'iPhone/iPad browser host' : capabilities.android ? 'Android host' : capabilities.web ? 'browser extension host' : capabilities.platform;
  return `${feature} is unavailable on this ${host}. Portable viewing, authoring, audits, and manifest generation remain available where the workspace permits them.`;
}

module.exports = { detectCapabilities, capabilitySummary, missingCapabilityMessage };
