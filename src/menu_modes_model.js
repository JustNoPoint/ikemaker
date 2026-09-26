'use strict';

const NATIVE_ACTIONS = [
  ['arcade', 'Arcade', 'Progress through an order-based roster.'],
  ['versus', 'Versus', 'Local player-versus-player match.'],
  ['teamarcade', 'Team Arcade', 'Arcade flow with team selection.'],
  ['teamversus', 'Team Versus', 'Local versus with team selection.'],
  ['teamcoop', 'Team Co-op', 'Cooperative team arcade.'],
  ['versuscoop', 'Versus Co-op', 'Cooperative versus flow for four configured players.'],
  ['freebattle', 'Quick Match', 'Direct match setup using native free-battle behavior.'],
  ['survival', 'Survival', 'Continue fighting until the player is defeated.'],
  ['survivalcoop', 'Survival Co-op', 'Cooperative survival flow.'],
  ['timeattack', 'Time Attack', 'Arcade-style roster ranked by completion time.'],
  ['bonusgames', 'Bonus Games', 'Lists characters marked bonus=1.'],
  ['storymode', 'Story Mode', 'Lists story arcs declared in select.def.'],
  ['training', 'Training', 'Native training mode.'],
  ['watch', 'Watch', 'CPU-versus-CPU viewing mode.'],
  ['randomtest', 'Random Test', 'Continuous automated random matches.'],
  ['replay', 'Replay', 'Replay browser.'],
  ['options', 'Options', 'Native options screen.'],
  ['serverhost', 'Host Game', 'Host a netplay session.'],
  ['serverjoin', 'Join Game', 'Join a netplay session.'],
  ['joinadd', 'New Address', 'Add a server address to the native join menu.'],
  ['netplayversus', 'Netplay Versus', 'Synchronized online versus match.'],
  ['netplayteamcoop', 'Netplay Team Co-op', 'Synchronized online cooperative arcade.'],
  ['netplaysurvivalcoop', 'Netplay Survival Co-op', 'Synchronized online cooperative survival.'],
  ['exit', 'Exit', 'Exit IKEMEN.'],
  ['back', 'Back', 'Return to the parent menu.']
].map(([id, label, description]) => ({ id, label, description, capability: 'native' }));

const ACTIONS = new Map(NATIVE_ACTIONS.map((item) => [item.id, item]));

const RECIPES = [
  { id: 'standard', label: 'Standard Modes', status: 'native', summary: 'Expose Arcade, Versus, Training, Watch, Options, and Exit using only screenpack definitions.' },
  { id: 'fightall', label: 'Fight Everyone', status: 'native-config', summary: 'Reuse a built-in arcade-style action and generate a finite maxmatches list from the current roster orders.' },
  { id: 'bossrush', label: 'Boss Rush', status: 'module', summary: 'Use the official external Boss Rush module, then give that mode its own orderbossrush and bossrush.maxmatches rules.' },
  { id: 'custom', label: 'New Gameplay Mode', status: 'module', summary: 'The screenpack can display it natively, but behavior outside the built-in action table requires a registered external module.' }
];

function titleSection(document) {
  return document.sections.find((section) => section.normalized === 'title info') || null;
}

function menuEntries(document) {
  const section = titleSection(document);
  if (!section) return [];
  const records = section.entries.filter((entry) => entry.normalized.startsWith('menu.itemname.')).map((entry) => {
    const path = entry.key.slice(entry.key.toLowerCase().indexOf('menu.itemname.') + 14).split('.');
    const action = path[path.length - 1].toLowerCase();
    const native = ACTIONS.get(action);
    return {
      key: entry.key,
      path,
      action,
      label: entry.value,
      line: entry.line,
      enabled: entry.value.trim() !== '',
      capability: native ? 'native' : 'module',
      description: native ? native.description : 'Custom submenu name or an action supplied by an external module.'
    };
  });
  for (const record of records) {
    if (record.capability === 'module' && records.some((candidate) => candidate.path.length > record.path.length && record.path.every((part, index) => candidate.path[index] === part))) {
      record.capability = 'submenu';
      record.description = 'Native flexible screenpack submenu container.';
    }
  }
  return records;
}

function orderCounts(selectModel) {
  const modes = new Map();
  for (const character of selectModel.characters || []) {
    if (String(character.exclude || '0') === '1') continue;
    const params = new Map((character.params || []).map((item) => [item.name.toLowerCase(), item.value]));
    const generic = params.get('order') || '1';
    const assignments = [['default', generic]];
    for (const [name, value] of params) if (/^order[a-z0-9_]+$/.test(name) && name !== 'order') assignments.push([name.slice(5), value]);
    for (const [mode, value] of assignments) {
      if (!modes.has(mode)) modes.set(mode, new Map());
      const order = Number(value);
      if (Number.isInteger(order) && order > 0) modes.get(mode).set(order, (modes.get(mode).get(order) || 0) + 1);
    }
  }
  return [...modes].map(([mode, counts]) => ({ mode, counts: [...counts].sort((a, b) => a[0] - b[0]).map(([order, count]) => ({ order, count })) }));
}

function finiteMaxMatches(counts, maxOrder = 30) {
  const values = Array.from({ length: maxOrder }, () => 0);
  for (const item of counts || []) if (item.order >= 1 && item.order <= maxOrder) values[item.order - 1] = item.count;
  while (values.length > 1 && values[values.length - 1] === 0) values.pop();
  return values.join(',');
}

function optionSettings(selectModel) {
  return (selectModel.options || []).filter((entry) => /(?:\.maxmatches|^.*maxmatches$)/i.test(entry.name)).map((entry) => ({ name: entry.name, value: entry.params[0]?.value || '', line: entry.line }));
}

function installedActionIds(luaText) {
  const text = String(luaText || ''), start = text.indexOf('main.t_itemname = {');
  if (start < 0) return [];
  const end = text.indexOf("if gameOption('Debug.DumpLuaTables')", start);
  const block = text.slice(start, end < 0 ? text.length : end), found = new Set();
  for (const match of block.matchAll(/\[['"]([a-z0-9_]+)['"]\]\s*=\s*function/gi)) found.add(match[1].toLowerCase());
  for (const match of block.matchAll(/main\.t_itemname\.([a-z0-9_]+)\s*=/gi)) found.add(match[1].toLowerCase());
  return [...found].sort();
}

function buildMenuModesModel(systemDocument, selectModel, files = {}, installedActions = []) {
  const orders = orderCounts(selectModel);
  const defaults = orders.find((item) => item.mode === 'default') || { mode: 'default', counts: [] };
  const timeAttack = orders.find((item) => item.mode === 'timeattack');
  const eligibleCount = (selectModel.characters || []).filter((item) => String(item.exclude || '0') !== '1').length;
  const timeAttackCount = timeAttack ? timeAttack.counts.reduce((sum, item) => sum + item.count, 0) : 0;
  const fightAllOrders = timeAttack || defaults;
  const fightAllBlocked = timeAttack && timeAttackCount !== eligibleCount
    ? `Only ${timeAttackCount} of ${eligibleCount} eligible characters have ordertimeattack. Complete or remove those overrides before using this recipe.`
    : '';
  const installed = new Set(installedActions.map((item) => String(item).toLowerCase()));
  const nativeActions = [...NATIVE_ACTIONS];
  for (const id of installed) if (!nativeActions.some((item) => item.id === id)) nativeActions.push({ id, label: id.replace(/_/g, ' '), description: 'Action verified in this installation\'s external/script/main.lua.', capability: 'native-installed' });
  const menu = menuEntries(systemDocument);
  for (const item of menu) if (item.capability === 'module' && installed.has(item.action)) { item.capability = 'native'; item.description = 'Built-in action verified against this installation\'s external/script/main.lua.'; }
  return {
    files,
    menu,
    nativeActions,
    installedActions: [...installed],
    recipes: RECIPES,
    orders,
    options: optionSettings(selectModel),
    fightAll: { action: 'timeattack', menuKey: 'menu.itemname.timeattack', label: 'FIGHT EVERYONE', optionKey: 'timeattack.maxmatches', optionValue: finiteMaxMatches(fightAllOrders.counts), counts: fightAllOrders.counts, orderSource: timeAttack ? 'ordertimeattack' : 'order', blockedReason: fightAllBlocked },
    evidence: {
      screenpack: 'Native: menu.itemname.* entries and flexible submenus in [Title Info].',
      roster: 'Native: order<gamemode> character parameters and <gamemode>.maxmatches in select.def.',
      behavior: 'External module only when the selected leaf is not one of IKEMEN 1.0\'s built-in menu actions.'
    }
  };
}

module.exports = { NATIVE_ACTIONS, RECIPES, titleSection, menuEntries, orderCounts, finiteMaxMatches, optionSettings, installedActionIds, buildMenuModesModel };
