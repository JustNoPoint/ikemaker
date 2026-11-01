'use strict';

const { deepFreeze } = require('./viewer_toolbar_contract');

const KINDS = Object.freeze(['command', 'shared-proxy', 'element', 'selector', 'special']);
const EXPOSURES = Object.freeze(['toolsTree', 'toolbarMenu', 'actionSearch', 'quickSlot', 'sidebar']);
const MENU_ORDER = Object.freeze(['Project','Edit','View','Palettes','Sprites','Animations','Sounds','Review','Build','Stage','Screenpack','Tools','Help','More']);
const ROUTE_KINDS = Object.freeze(['command','proxy','element','selector','workflow','special','cross-surface']);
const OBSOLETE_ALIASES = Object.freeze(new Set(['air.openDockingWorkspaceExperimental','ikemen.dockingPrototype.open','ikemen.dockingPrototype.openEditor']));
const INTERNAL_COMMANDS = Object.freeze(new Set([
  'air.deleteSelectedFromViewer','sff.deleteSelectedFromViewer','snd.deleteSelectedFromViewer',
  'ikemen.palette.openCompanion','ikemen.lua.insertApi','ikemen.lua.goToFunction','ikemen.lua.openApiDocs',
  'zssNavigator.refresh','zssNavigator.reveal','zssControllers.clearFilter','zssControllers.insert','zssControllers.openDocs',
  'zssStructures.insert','ikemen.maps.insert','ikemen.viewer.openReference','ikemen.viewer.back','ikemen.viewer.forward'
]));
const EDIT_COMMANDS = Object.freeze(new Set([
  'zss.toggleLineComment',
  'ikemen.comments.assist',
  'ikemen.triggers.browseInsert',
  'ikemen.triggers.editArguments',
  'ikemen.functions.browseInsert',
  'ikemen.textActions.open',
  'cns.scaleSelectedSizebox'
]));
const VIEW_COMMANDS = Object.freeze(new Set([
  'zss.goToLine',
  'ikemen.chooseOpeningSidebar',
  'ikemen.visualBrowser.open',
  'ikemen.textViewers.open',
  'ikemen.textToolbar.openPrimary',
  'ikemen.textToolbar.toggleCompanion',
  'ikemen.textToolbar.restoreNativeLayout',
  'ikemen.textToolbar.disableNativeLayout',
  'ikemen.textToolbar.toggleGroupedFiles',
  'ikemen.textToolbar.toggleHeaderOnlyLayout',
  'ikemen.entity.previous',
  'ikemen.authoringWorkspace.open',
  'ikemen.authoringBrowser.open',
  'ikemen.navigation.openDefinition',
  'ikemen.workbench.openAllCode',
  'ikemen.codeStructure.openWorkspace',
  'ikemen.codeStructure.focusCurrent',
  'ikemen.openTools'
]));

function commandExclusion(command) {
  const id=String(command||'');
  if(OBSOLETE_ALIASES.has(id))return 'Compatibility alias retained for existing keybindings and saved workflows; the canonical action is shown instead.';
  if(INTERNAL_COMMANDS.has(id)||/\.(?:refresh|reveal)$/.test(id))return 'Internal callback owned by its specialist viewer, not a user-facing toolbar action.';
  return '';
}
function commandGroup(command,title='') {
  const value=`${command} ${title}`.toLowerCase();
  if(EDIT_COMMANDS.has(command)||/^zss\.wrap\./.test(command))return'Edit';
  if(VIEW_COMMANDS.has(command))return'View';
  if(/palette|palfx/.test(value))return'Palettes';
  if(/\bsff\b|sprite|artistintake/.test(value))return'Sprites';
  if(/\bair\b|animation|collision/.test(value))return'Animations';
  if(/\bsnd\b|sound|audio/.test(value))return'Sounds';
  if(/stage/.test(value))return'Stage';
  if(/screenpack|selectdef|menu.?modes|story|storyboard|\.ui\./.test(value))return'Screenpack';
  if(/audit|review|health|dependenc|history|recovery|impact|testsession/.test(value))return'Review';
  if(/release|build|sprmaker|manifest/.test(value))return'Build';
  if(/help|docs|guide|learning/.test(value))return'Help';
  if(/create|open character|project|context|workspacepreset|registry/.test(value))return'Project';
  if(/settings|configure|mode|layout|version|capabilit/.test(value))return'More';
  return'Tools';
}
function publicCommandCatalog(manifest=require('../package.json')) {
  const commands=Array.isArray(manifest?.contributes?.commands)?manifest.contributes.commands:[],keys=new Map();
  for(const binding of manifest?.contributes?.keybindings||[])if(binding?.command&&!keys.has(binding.command))keys.set(binding.command,binding.key||'');
  const seen=new Set(),actions=[],exclusions=[];
  for(const record of commands){const command=String(record?.command||'').trim();if(!command||seen.has(command))throw new Error(`Duplicate or invalid contributed command: ${command||'<empty>'}`);seen.add(command);const exclusionReason=commandExclusion(command);if(exclusionReason){exclusions.push(deepFreeze({command,reason:exclusionReason}));continue;}const label=String(record.title||command).replace(/^(?:IKEMEN|AIR|SFF|SND|ZSS|CNS|CMD):\s*/,'').trim();actions.push(deepFreeze({actionId:`command.${command}`,label,tooltip:String(record.title||label),shortcut:String(keys.get(command)||''),routeKind:'command',command,group:commandGroup(command,record.title),enabled:false,reason:'This action requires a live host capability check for the current viewer.'}));}
  return deepFreeze({menuOrder:MENU_ORDER,actions,exclusions});
}

function normalizedAction(input) {
  const action = {
    id: String(input?.id || '').trim(),
    kind: String(input?.kind || 'command'),
    owner: String(input?.owner || '').trim(),
    dispatch: String(input?.dispatch || input?.id || '').trim(),
    exposures: [...new Set((input?.exposures || []).map(String))].sort(),
    availability: String(input?.availability || 'contextual'),
    exclusionReason: input?.exclusionReason ? String(input.exclusionReason) : ''
  };
  if (!action.id) throw new Error('Viewer action requires an id.');
  if (!KINDS.includes(action.kind)) throw new Error(`Unsupported viewer action kind: ${action.kind}`);
  if (!action.owner) throw new Error(`Viewer action ${action.id} requires an owner.`);
  if (!action.dispatch) throw new Error(`Viewer action ${action.id} requires dispatch.`);
  for (const exposure of action.exposures) if (!EXPOSURES.includes(exposure)) throw new Error(`Unsupported action exposure: ${exposure}`);
  return deepFreeze(action);
}

function buildActionCatalog(records) {
  const catalog = new Map();
  for (const input of records || []) {
    const action = normalizedAction(input), existing = catalog.get(action.id);
    if (!existing) { catalog.set(action.id, action); continue; }
    if (existing.kind !== action.kind || existing.owner !== action.owner || existing.dispatch !== action.dispatch) {
      throw new Error(`Conflicting viewer action registration: ${action.id}`);
    }
    catalog.set(action.id, normalizedAction({ ...existing, exposures: [...existing.exposures, ...action.exposures] }));
  }
  return deepFreeze([...catalog.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

module.exports = { KINDS, EXPOSURES, MENU_ORDER, ROUTE_KINDS, OBSOLETE_ALIASES, INTERNAL_COMMANDS, EDIT_COMMANDS, VIEW_COMMANDS, normalizedAction, buildActionCatalog, commandExclusion, commandGroup, publicCommandCatalog };
