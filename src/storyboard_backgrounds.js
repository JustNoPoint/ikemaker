'use strict';
const fs = require('fs');
const path = require('path');
const def = require('./def_model');
const { resolveStoryboardResource, storyboardGameRoot } = require('./storyboard_resource_path');

function isStoryboard(text) {
  return /^\s*\[SceneDef\]/im.test(text) || /^\s*\[Scene\s+\d+\]/im.test(text);
}
function backgrounds(document, name) {
  if (!name) return [];
  const family = name.toLowerCase();
  return document.sections.filter(section => section.normalized.split(/\s+/)[0] === family).map(section => {
    const fields = {};
    for (const entry of section.entries) if (!(entry.normalized in fields)) fields[entry.normalized] = entry.value;
    return {
      name:section.name, line:section.line, type:def.unquote(fields.type || 'normal').toLowerCase(),
      path:def.unquote(fields.path), sprite:fields.spriteno ? def.integerTuple(fields.spriteno) : null,
      animation:fields.actionno === undefined ? null : def.number(fields.actionno, -1),
      position:def.tuple(fields.start || '0,0'), velocity:def.tuple(fields.velocity || '0,0'),
      scale:def.tuple(fields.scalestart || '1,1'), layerNo:def.number(fields.layerno,0),
      scaleMode:def.unquote(fields.scalemode || 'none').toLowerCase()
    };
  });
}

// Derive resource roots from video assets resolved within the storyboard/game.
function bindMedia(panel, data, vscode) {
  const roots = [], allowed = [path.dirname(data.filename),storyboardGameRoot(data.filename)].filter(Boolean).map(p => fs.realpathSync(p));
  for (const scene of data.model.scenes) for (const bg of scene.backgrounds || []) {
    if (bg.type !== 'video' || !bg.path) continue;
    const resource = resolveStoryboardResource(data.filename, bg.path, 'video');
    if (!resource.available) continue;
    const file = fs.realpathSync(resource.filename);
    if (!/\.(webm|mp4|ogg|ogv)$/i.test(file) || !allowed.some(root => {
      const rel = path.relative(root, file);
      return rel && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel);
    })) continue;
    const uri = vscode.Uri.file(file);
    if (!panel.webview.asWebviewUri) continue;
    const parent=vscode.Uri.file(path.dirname(file));
    if (!roots.some(root=>root.fsPath===parent.fsPath)) roots.push(parent);
    bg.url = panel.webview.asWebviewUri(uri).toString();
  }
  panel.webview.options = {enableScripts:true, localResourceRoots:roots};
}
module.exports = {isStoryboard, backgrounds, bindMedia};
