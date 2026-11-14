'use strict';

const path = require('path');
const def = require('./def_model');
const { storyboardGameRoot, resolveStoryboardResource } = require('./storyboard_resource_path');

function binding(source, sectionName, key) {
  const document = def.parseDef(source);
  const sections = def.sections(document, sectionName);
  if (sections.length !== 1) throw Error('Choose a file with one [' + sectionName + '] section.');
  const section = sections[0];
  return { document, section, value: def.entry(section, key)?.value };
}

async function openFontForText(vscode, { ownerFile, section, font, text, label, height }) {
  const owner = await vscode.workspace.openTextDocument(vscode.Uri.file(ownerFile));
  const original = owner.getText();
  const tuple = String(font ?? '').split(',').map(part => part.trim());
  const direct = def.unquote(tuple[0]);
  if (/\.(?:def|fnt|ttf|otf)$/i.test(direct)) {
    const filename = resolveStoryboardResource(ownerFile, direct, 'font').filename;
    if (!filename) return vscode.window.showWarningMessage('The font referenced by this text could not be located: ' + direct);
    const size = Number(height) > 0 ? Number(height) : Number(tuple[7]);
    return vscode.commands.executeCommand('ikemen.fontLab.open', {
      ownerFile, root: storyboardGameRoot(ownerFile), fontFile: filename,
      sampleText: text || undefined, bank: Number(tuple[1]) || 0, align: Number(tuple[2] ?? 1),
      height: size > 0 ? size : undefined, contextLabel: [label, direct].filter(Boolean).join(' · ')
    });
  }
  let slot = /^\d+$/.test(tuple[0]) ? Number(tuple[0]) : undefined;
  if (!Number.isSafeInteger(slot)) {
    const { section: declared } = binding(original, section, '');
    const entries = declared.entries.filter(entry => /^font\d+$/.test(entry.normalized));
    const options = entries.map(entry => ({ label: entry.key, description: entry.value, slot: Number(entry.normalized.slice(4)) }));
    let next = section.toLowerCase() === 'scenedef' ? 0 : 1;
    while (options.some(item => item.slot === next)) next++;
    options.push({ label: 'Add font' + next, slot: next });
    const choice = await vscode.window.showQuickPick(options, { title: 'Open a font slot in ' + path.basename(ownerFile) });
    if (!choice) return;
    slot = choice.slot;
  }
  const key = 'font' + slot;
  const initial = binding(original, section, key);
  const name = def.unquote(initial.value);
  const fontFile = name && resolveStoryboardResource(ownerFile, name, 'font').filename;
  const tupleHeight = Number(tuple[7]);
  const size = Number(height > 0 ? height : tupleHeight > 0 ? tupleHeight : def.value(initial.section, key + '.height', ''));
  const options = {
    ownerFile, slot, fontFile, root: storyboardGameRoot(ownerFile), bank: Number(tuple[1]) || 0,
    align: ['-1','0','1'].includes(tuple[2]) ? Number(tuple[2]) : 1,
    sampleText: text || undefined, contextLabel: [label, path.basename(ownerFile), key].filter(Boolean).join(' · '),
    onApply: async target => {
      const current = await vscode.workspace.openTextDocument(owner.uri);
      const source = current.getText();
      const latest = binding(source, section, key);
      if (latest.value !== initial.value) throw Error(key + ' changed since Font Lab opened. Reopen it from the source to apply.');
      const relative = path.relative(path.dirname(ownerFile), target).replace(/\\/g, '/');
      if (!relative || path.isAbsolute(relative) || /[";\r\n]/.test(relative)) throw Error('Choose a font path that this DEF can reference.');
      const next = def.setSectionEntry(latest.document, latest.section.line, key, relative);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(current.uri, new vscode.Range(current.positionAt(0), current.positionAt(source.length)), (source.startsWith('\uFEFF') ? '\uFEFF' : '') + next);
      if (!(await vscode.workspace.applyEdit(edit))) throw Error('The editor could not update ' + key + '.');
      initial.value = relative;
    }
  };
  if (size > 0) options.height = size;
  return vscode.commands.executeCommand('ikemen.fontLab.open', options);
}

module.exports = { openFontForText };
