'use strict';

// Each example belongs to the named DEF section. A vertical bar separates its
// editable fields so authors can Tab through coordinates, colors and IDs.
const catalog = {
  'Screenpack Authoring': {
    'Motif coordinates · [Info]': ['Info', {
      localcoord: ['320|240', 'Width and height of the motif coordinate space.']
    }],
    'Asset bindings · [Files]': ['Files', {
      spr: ['system.sff', 'Motif sprite archive.'], snd: ['system.snd', 'Motif sound archive.'],
      select: ['select.def', 'Roster definition.'], fight: ['fight.def', 'Lifebar definition.'],
      'logo.storyboard': ['logo.def', 'Startup logo storyboard.'], 'intro.storyboard': ['intro.def', 'Intro storyboard.']
    }],
    'Menu layout · [Title Info]': ['Title Info', {
      'menu.item.font': ['1|0|0', 'Font, color bank and alignment for a menu item.'],
      'menu.pos': ['160|120', 'Menu origin in motif coordinates.'],
      'menu.item.spacing': ['0|12', 'Horizontal and vertical step between items.'],
      'menu.itemname.arcade': ['"ARCADE"', 'Caption for the Arcade item.']
    }],
    'Title background · [TitleBG …]': ['TitleBG …', {
      type: ['normal', 'Background element type.'], spriteno: ['0|0', 'Sprite group and index.'],
      start: ['0|0', 'Starting position of the element.']
    }],
    'Versus screen · [VS Screen]': ['VS Screen', {
      time: ['150', 'Duration of the versus screen in ticks.'],
      'match.text': ['Match %i', 'Match label with its number.'],
      'match.offset': ['160|20', 'Position offset for the match label.']
    }],
    'Lifebar artwork · fight.def [Lifebar]': ['Lifebar', {
      'p1.bg0.spr': ['10|0', 'Background sprite group and index for player 1.'],
      'p1.bg0.offset': ['0|0', 'Offset of the player 1 background sprite.']
    }],
    'Title music · [Music]': ['Music', {
      'title.bgm': ['sound/title.ogg', 'Title screen music path.'],
      'title.bgm.loop': ['1', 'Repeat the title track (1) or play once (0).']
    }]
  },
  'Select Screen Authoring': {
    'Grid and portraits · [Select Info]': ['Select Info', {
      rows: ['2', 'Number of roster rows.'], columns: ['5', 'Number of roster columns.'],
      pos: ['0|0', 'Grid origin.'], 'cell.size': ['25|25', 'Slot width and height.'],
      'cell.spacing': ['2', 'Gap between slots.'], 'cell.bg.spr': ['150|0', 'Cell background sprite group and index.'],
      'p1.cursor.startcell': ['0|0', 'Player 1 starting row and column, counted from zero.'],
      'p2.cursor.startcell': ['0|4', 'Player 2 starting row and column, counted from zero.'],
      'p1.face.offset': ['0|0', 'Player 1 large portrait offset.'], 'p2.face.offset': ['0|0', 'Player 2 large portrait offset.'],
      'p1.cursor.move.snd': ['100|0', 'Sound group and index for player 1 cursor movement.']
    }],
    'Character slots · [Characters]': ['Characters', {
      'Character entry': ['kfm, stages/stage0.def, order=1', 'Character, assigned stage and arcade order group.', true],
      randomselect: ['randomselect', 'Reserve a slot for random selection.', true]
    }],
    'Stage pool · [ExtraStages]': ['ExtraStages', {
      'Stage entry': ['stages/stage0.def', 'Add this stage to the selection pool.', true]
    }],
    'Arcade order · [Options]': ['Options', {
      'arcade.maxmatches': ['6|1|1|0|0|0|0|0|0|0', 'Number of arcade opponents from each successive order group.']
    }]
  },
  'Storyboard Authoring': {
    'Scene resources · [SceneDef]': ['SceneDef', {
      spr: ['intro.sff', 'Storyboard sprite archive.'], snd: ['intro.snd', 'Storyboard sound archive.'],
      startscene: ['0', 'First numbered scene to play.']
    }],
    'Scene timing and fades': ['Scene N', {
      'end.time': ['300', 'Duration in ticks.'], clearcolor: ['0|0|0', 'Background red, green and blue.'],
      'fadein.time': ['15', 'Entry fade duration in ticks.'], 'fadeout.time': ['15', 'Exit fade duration in ticks.'],
      'fadein.col': ['0|0|0', 'Entry fade color.'], 'fadeout.col': ['0|0|0', 'Exit fade color.']
    }],
    'Scene layers and sound cues': ['Scene N', {
      'layerall.pos': ['160|0', 'Common layer origin.'], 'layer0.offset': ['0|0', 'Layer 0 offset from the origin.'],
      'layer0.anim': ['0', 'Number of an embedded AIR action.'], 'layer0.starttime': ['0', 'Tick when layer 0 appears.'],
      'sound0.value': ['0|0', 'Sound group and index.'], 'sound0.starttime': ['0', 'Tick when sound 0 plays.'],
      bgm: ['sound/intro.ogg', 'Scene music path.'], 'bgm.loop': ['0', 'Play once (0) or repeat (1).']
    }],
    'Embedded AIR · [Begin Action N]': ['Begin Action N', {
      'Animation frame': ['0|0|0|0|6', 'Sprite group, index, X offset, Y offset, and duration in ticks.', true],
      LoopStart: ['LoopStart', 'Mark the next animation element as the loop start.', true]
    }]
  }
};

const command = 'ikemen.authoring.useVisualDefExample';

function example(domain, group, key) {
  const section = catalog[domain]?.[group];
  const row = section?.[1]?.[key];
  if (!Array.isArray(row)) return;
  const fields = row[0].split('|');
  const prefix = row[2] ? '' : key + ' = ';
  return { scope: section[0], fields, prefix, text: prefix + fields.join(', '), description: row[1] };
}

function items(element, vscode, Item, filter, matches) {
  const state = vscode.TreeItemCollapsibleState;
  const branch = filter ? state.Expanded : state.Collapsed;
  function item(label, nodeType, props, icon, collapsible = branch) {
    const result = new Item(label, collapsible, { nodeType, ...props });
    result.iconPath = new vscode.ThemeIcon(icon);
    return result;
  }
  const results = [];
  for (const [domain, groups] of Object.entries(catalog)) {
    if (element && element.domain !== domain) continue;
    let count = 0;
    for (const [group, [scope, rows]] of Object.entries(groups)) {
      if (element?.group && element.group !== group) continue;
      const keys = Object.keys(rows).filter(key => matches({scope: domain + ' ' + scope, name: group, key, signature: example(domain, group, key).text, description: rows[key][1]}));
      count += keys.length;
      if (element?.nodeType === 'visualDefRoot' && keys.length)
        results.push(item(group + ' (' + keys.length + ')', 'visualDefGroup', {domain, group}, 'symbol-namespace'));
      if (element?.nodeType !== 'visualDefGroup') continue;
      for (const key of keys) {
        const entry = example(domain, group, key);
        const leaf = item(entry.prefix ? entry.text : key, 'visualDefReference', {}, 'symbol-property', state.None);
        leaf.tooltip = '[' + scope + ']\n' + entry.text + '\n' + entry.description + '\nClick to insert on a blank line in this section. Otherwise you can copy the example.';
        leaf.command = { command, title: 'Use DEF code example', arguments: [domain, group, key] };
        results.push(leaf);
      }
    }
    if (!element && count) results.push(item(domain + ' (' + count + ')', 'visualDefRoot', {domain}, 'library'));
  }
  return results;
}

async function useExample(vscode, domain, group, key) {
  const entry = example(domain, group, key);
  if (!entry) return;
  const editor = vscode.window.activeTextEditor;
  const doc = editor?.document;
  const lifebar = entry.scope === 'Lifebar';
  const motif = !lifebar && (domain === 'Screenpack Authoring' || entry.scope === 'Select Info');
  const roster = domain === 'Select Screen Authoring' && !motif;
  const kind = lifebar ? 'lifebar' : motif ? 'screenpack' : roster ? 'roster' : 'storyboard';
  if (doc && /\.def$/i.test(doc.fileName) && editor.selection.isEmpty) {
    const text = doc.getText();
    const headers = [...text.matchAll(/^[ \t]*\[([^\]\r\n]+)\][ \t]*(?:;[^\r\n]*)?\r?$/gm)];
    const names = headers.map(h => h[1].trim().toLowerCase());
    const correctFile = lifebar ? names.includes('lifebar') : motif ? names.some(n => ['title info','select info','titlebgdef','vs screen'].includes(n))
      : roster ? names.includes('characters') : names.includes('scenedef');
    const pos = editor.selection.active;
    const offset = doc.offsetAt(pos);
    const scope = headers.filter(h => h.index < offset).at(-1)?.[1].trim().toLowerCase() || '';
    const correctSection = entry.scope === 'Scene N' ? /^scene\s+\d+$/.test(scope)
      : entry.scope === 'Begin Action N' ? /^begin action\s+\d+$/.test(scope)
      : entry.scope === 'TitleBG …' ? /^titlebg\s+.+/.test(scope) : scope === entry.scope.toLowerCase();
    if (correctFile && correctSection && !doc.lineAt(pos.line).text.trim()) {
      let target = pos;
      if (entry.prefix) {
        const current = headers.filter(h => h.index < offset).at(-1);
        const end = headers.find(h => h.index > current.index)?.index ?? text.length;
        const start = current.index + current[0].length;
        const assignments = Array.from(text.slice(start, end).matchAll(/^[ \t]*([^;=\r\n]+?)[ \t]*=[ \t]*([^;\r\n]*)/gm))
          .filter(match => match[1].trim().toLowerCase() === key.toLowerCase());
        if (assignments.length) {
          const version = doc.version;
          const found = assignments[0];
          const first = doc.positionAt(start + found.index);
          const valuesStart = found[0].indexOf('=') + 1;
          const valueFrom = valuesStart + (found[0].slice(valuesStart).match(/^[ \t]*/)[0].length);
          const valueTo = Math.max(valueFrom, found[0].trimEnd().length);
          const range = new vscode.Range(doc.positionAt(start + found.index + valueFrom), doc.positionAt(start + found.index + valueTo));
          const actions = assignments.length === 1 ? ['Go to existing', 'Replace value'] : ['Go to existing'];
          const choice = await vscode.window.showInformationMessage(key + ' already exists in [' + current[1].trim() + '].', ...actions);
          if (doc.version !== version || vscode.window.activeTextEditor !== editor) return false;
          if (choice === 'Go to existing') {
            editor.selection = new vscode.Selection(first, first);
            editor.revealRange(range);
          }
          if (choice !== 'Replace value') return false;
          target = range;
        }
      }
      const snippet = new vscode.SnippetString();
      if (target === pos) snippet.appendText(entry.prefix);
      entry.fields.forEach((field,i) => { if (i) snippet.appendText(', '); snippet.appendPlaceholder(field); });
      return editor.insertSnippet(snippet, target);
    }
  }
  const action = await vscode.window.showInformationMessage(entry.text + ' — ' + entry.description + ' Insert on a blank line in [' + entry.scope + '] in a ' + kind + ' DEF.', 'Copy example');
  if (action === 'Copy example') await vscode.env.clipboard.writeText(entry.text);
}
module.exports = { items, command, useExample };
