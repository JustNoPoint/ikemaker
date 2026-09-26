'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const presets = require('./workspace_preset_model');
const contextModel = require('./project_context_model');
const registryModel = require('./project_registry');
const metadataRegistry = require('./metadata_registry');

const KEY = 'ikemenZss.workspacePresets.v1';
const RECOMMENDED = ['Character Coding', 'Sprite / AIR Authoring', 'Sound / Palette Authoring', 'QA and Testing', 'Stage / Screenpack', 'Roster Management'];
function root() { return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ''; }
function uriFromTab(tab) { const input = tab && tab.input; return input && (input.uri || input.modified || input.notebookUri) || null; }
function store(context) { return presets.normalizeStore(context.workspaceState.get(KEY, {})); }
async function saveStore(context, value) { await context.workspaceState.update(KEY, presets.normalizeStore(value)); }
function safeId(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, ''); }

async function capture(name) {
  const groups = vscode.window.tabGroups?.all || [], files = [];
  groups.forEach((group, index) => group.tabs.forEach((tab) => { const uri = uriFromTab(tab); if (uri?.scheme === 'file') files.push({ file: uri.fsPath, kind:tab.input?.viewType==='ikemen.sffWorkspace'?'sff':tab.input?.viewType==='ikemen.sndWorkspace'?'snd':'text',group: group.viewColumn||index + 1, active: group.isActive === true && group.activeTab === tab, preview: Boolean(tab.isPreview) }); }));
  // Only native custom editors have a second representation in tracked sessions.
  // Consume each native slot once; ordinary webviews may share a file and group.
  const nativeSlots = new Set(files.map((file,index)=>['sff','snd'].includes(file.kind)?index:-1).filter(index=>index>=0));
  const fileKey = filename=>path.resolve(filename).toLowerCase();
  for(const item of await require('./viewer_sessions').capture()){
    const duplicate=[...nativeSlots].find(index=>fileKey(files[index].file)===fileKey(item.file)&&files[index].kind===item.kind&&files[index].group===item.group);
    if(duplicate!==undefined){files[duplicate]=item;nativeSlots.delete(duplicate);}else files.push(item);
  }
  const active = files.find((item) => item.active) || files[0], workspaceRoot = root(); let capturedContext = {};
  if (active && workspaceRoot) {
    let registry = registryModel.createDefault(); const filename = metadataRegistry.find(workspaceRoot);
    try { if (filename) registry = metadataRegistry.read(filename).registry; } catch (_) {}
    const resolved = contextModel.contextFor(active.file, workspaceRoot, registry); capturedContext = { projectId: resolved.project?.id || '', characterId: resolved.character?.id || '', ownership: resolved.ownership, assetType: resolved.assetType, activeFile: path.relative(workspaceRoot, active.file).replace(/\\/g, '/') };
  }
  return presets.relativeFiles({ id: safeId(name), name, files, context: capturedContext, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, workspaceRoot);
}
async function openFile(file, group, kind='auto', reference, archiveContext, onRestored) {
  if (!fs.existsSync(file)) return false;
  const uri = vscode.Uri.file(file), ext = path.extname(file).toLowerCase(), column = Math.max(1, Math.min(9, group || 1));
  if(kind!=='auto'&&kind!=='text'){
    const historyKind=require('./viewer_sessions').HISTORY_KINDS[kind];
    if(!historyKind)return false;
    return require('./viewer_navigation').openPresetPoint({filename:file,kind:historyKind,reference,archiveContext},column,onRestored);
  }
  if (kind==='text'){await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri),{viewColumn:column,preview:false,preserveFocus:true});return true;}
  if (ext === '.sff') await vscode.commands.executeCommand('sff.openViewer', uri, column);
  else if (ext === '.snd') await vscode.commands.executeCommand('snd.openViewer', uri, column);
  else if (ext === '.act') await vscode.commands.executeCommand('revealFileInOS', uri);
  else await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { viewColumn: column, preview: false, preserveFocus: true });
  return true;
}

function registerWorkspacePresets(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.workspacePreset.save', async () => {
      const kind = await vscode.window.showQuickPick([...RECOMMENDED.map((name) => ({ label: name, name })), { label: 'Custom name…', name: '' }], { title: 'Save IKEMEN Workspace Preset', placeHolder: 'Choose an activity layout or create a custom one.' }); if (!kind) return;
      const name = kind.name || await vscode.window.showInputBox({ title: 'Custom Workspace Preset', prompt: 'Example: Ryu Coding Review' }); if (!name) return;
      const unsupported=require('./viewer_group').trackedPanels().filter(panel=>!require('./viewer_sessions').has(panel));
      if(unsupported.length){const choice=await vscode.window.showWarningMessage('These screens cannot yet be restored by presets: '+unsupported.map(panel=>panel.title||'Visual workspace').join(', ')+'. Save the supported tabs only?',{modal:true},'Save Supported Tabs');if(choice!=='Save Supported Tabs')return;}
      let preset;try{preset=await capture(name);}catch(error){return vscode.window.showWarningMessage(error.message);} if (!preset.files.length) return vscode.window.showWarningMessage('No supported editor or viewer tabs are open to save.');
      const next = presets.upsert(store(context), preset); await saveStore(context, next); vscode.window.showInformationMessage(`Saved workspace preset “${name}” with ${preset.files.length} tab(s).`);
    }),
    vscode.commands.registerCommand('ikemen.workspacePreset.restore', async () => {
      const current = store(context), picked = await vscode.window.showQuickPick(current.presets.map((item) => ({ label: item.name, description: `${item.files.length} tab(s)`, preset: item })), { title: 'Restore IKEMEN Workspace Preset' }); if (!picked) return;
      const mode = await vscode.window.showQuickPick([{ label: 'Open alongside current tabs', mode: 'add' }, { label: 'Replace current editor tabs', mode: 'replace', description: 'Unsaved editors will still receive the normal VS Code prompt.' }], { title: `Restore ${picked.label}` }); if (!mode) return;
      if(picked.preset.files.filter(item=>['sff','air','snd'].includes(item.kind)).length>1&&require('./interface_mode').current()!=='workspace'){const choice=await vscode.window.showInformationMessage('This preset contains multiple asset viewers. Switch to Workspace mode to restore the complete arrangement?',{modal:true},'Use Workspace');if(choice!=='Use Workspace')return;await require('./interface_mode').apply('workspace');}
      if (mode.mode === 'replace') {
        const panels=require('./viewer_group').trackedPanels();
        if(!await require('./viewer_close').prepare(panels,vscode))return;
        const finish=require('./authoring_context_registry').openContexts().map(entry=>require('./authoring_context_registry').beginContextClose(entry));
        try{const native=(vscode.window.tabGroups?.all||[]).flatMap(group=>group.tabs||[]).filter(tab=>uriFromTab(tab));if(native.length&&!await vscode.window.tabGroups.close(native,true))return;for(const panel of panels)panel.dispose();}finally{for(const end of finish)end();}
      }
      const resolved = presets.resolveFiles(picked.preset, root()), missing = [], opened = [];
      for (const item of resolved.files) {try{let panel;const ok=await openFile(item.file,item.group,item.kind,item.reference,item.archiveContext,value=>{panel=value;});if(ok)opened.push({item,panel});else missing.push(item.file);}catch(error){missing.push(item.file);}}
      const activeEntry = opened.find(entry => entry.item.active); if (activeEntry) {const {item:active,panel}=activeEntry;if(panel)panel.reveal(active.group,false);else if(active.kind==='text')await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(active.file)),{viewColumn:active.group,preview:false,preserveFocus:false});}
      vscode.window.showInformationMessage(`Restored “${picked.label}”: ${opened.length} tab(s) opened${missing.length ? `, ${missing.length} unavailable or not restored.` : '.'}`);
    }),
    vscode.commands.registerCommand('ikemen.workspacePreset.delete', async () => {
      const current = store(context), picked = await vscode.window.showQuickPick(current.presets.map((item) => ({ label: item.name, preset: item })), { title: 'Delete IKEMEN Workspace Preset' }); if (!picked) return;
      await saveStore(context, presets.remove(current, picked.preset.id)); vscode.window.showInformationMessage(`Deleted workspace preset “${picked.label}”. No files were removed.`);
    })
  );
}

module.exports = { RECOMMENDED, registerWorkspacePresets, capture, openFile };
