'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'data', 'offline-docs', 'reference');

// Use the bundled pages' actual headings. Catalog URLs can use different anchors.
const books = [
  ['MUGEN Stage / Background', 'mugen/bgs.html'],
  ['Stage DEF', 'wiki/Stage-features.html'],
  ['Background DEF', 'wiki/Background-features.html'],
  ['Trigger', 'merged/triggers.html', /^(?:stage|numstage|camera|bgm|groundlevel|zoomvar|(?:top|bot)bound)/i],
  ['State controller', 'merged/sctrl.html', /^(?:modifystage|modifybg|camera|bgpalfx|groundleveloffset|screenbound|zoom)(?:[a-z0-9]*-(?:old|changed|new|experimental-new))$/i],
  ['Lua', 'wiki/Lua.html', /stage|^bg(?:new|reset|draw|debug)$/i],
];

let referencePanel,referenceReturn,referenceGeneration=0;

function stageReferences() {
  const entries = [];
  for (const [category, relative, accepts] of books) {
    const filename = path.join(root, relative);
    const html = fs.readFileSync(filename, 'utf8');
    for (const match of html.matchAll(/<h[1-6]\b([^>]*)>([\s\S]*?)<\/h[1-6]>/gi)) {
      const fragment = /\bid="([^"]+)"/i.exec(match[1])?.[1]
        || /\bhref="#([^"]+)"/i.exec(match[2])?.[1];
      if (!fragment) continue;
      if (accepts && !accepts.test(fragment)) continue;
      const label = match[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
      entries.push({ label, description: category, filename, fragment, offset: match.index });
    }
  }
  return entries;
}

async function openStageReference(api, current, binding={}, selection) {
  binding=binding||{};
  let entries;
  try { entries = stageReferences(); }
  catch {const notices=require('./stage_terminal_notices').createStageNotices({info:text=>api.window.showInformationMessage(text)});notices.info('The bundled Stage reference could not be read.');notices.flush();return false;}
  const catalogRows = ['entries','types'].includes(selection?.catalog) ? require('../data/stage-def-catalog.json')[selection.catalog] : null;
  const catalog = catalogRows && Number.isInteger(selection.index) && selection.index >= 0 && selection.index < catalogRows.length
    ? catalogRows[selection.index] : null;
  if (selection && ((selection.catalog && (!catalog || !catalog.completable || !catalog.source?.file)) || (selection.category && !['Trigger','State controller','Lua'].includes(selection.category)))) return false;
  const filtered = selection?.category ? entries.filter(entry => entry.description === selection.category) : entries;
  if (!filtered.length) return false;
  const choice = catalog ? { label: catalog.signature || `type = ${catalog.name}`, description: 'Stage DEF / BGCtrl', catalog }
    : await api.window.showQuickPick(filtered, {
      title: 'Stage Code - Offline reference', matchOnDescription: true,
      placeHolder: 'Search Stage parameters, triggers, state controllers or Lua functions'
    });
  if ((!entries.includes(choice) && !catalog) || !current()) return false;
  let section;
  if (catalog) {
    const escape=value=>String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    section=`<h2>${escape(choice.label)}</h2><p>${escape(catalog.scope)}${catalog.controller?' · '+escape(catalog.controller):''}</p><pre>${escape(catalog.description)}</pre><p>Bundled reference: ${escape(catalog.source.file)}${catalog.source.anchor?'#'+escape(catalog.source.anchor):''}. Review authored values against the active Stage.</p>`;
  } else {
    const html = fs.readFileSync(choice.filename, 'utf8').slice(choice.offset);
    const heading = /^<h([1-6])\b/i.exec(html);
    if (!heading) return false;
    const bodyStart = html.indexOf('>') + 1;
    const next = html.slice(bodyStart).search(new RegExp('<h[1-' + heading[1] + ']\\b|</(?:main|article|body)>', 'i'));
    section = next < 0 ? html : html.slice(0, bodyStart + next);
  }
  if (!referencePanel) {
    referencePanel = require('./viewer_group').trackViewerPanel(api.window.createWebviewPanel('ikemenStageReference', 'Stage Code Reference', api.ViewColumn.Active, {enableScripts:true,retainContextWhenHidden:true,localResourceRoots: []}));
    const owned=referencePanel;
    const help=require('./help_workspace'),shared=require('./shared_workspace_header'),universal=require('./universal_toolbar_webview');
    const handlers={close:()=>owned.dispose(),help:()=>owned.reveal(api.ViewColumn.Active)};
    for(const [slot,command] of Object.entries(help.HELP_TOOLBAR_COMMANDS))handlers[slot]=()=>{
      if(referencePanel!==owned||!require('./interface_capabilities').allows(command))return false;
      return api.commands.executeCommand(command);
    };
    const dispatcher=universal.createUniversalToolbarDispatcher({handlersBySurface:{'reference.stage':handlers},getToolbar:()=>({...help.helpToolbarModel(),surfaceId:'reference.stage'})});
    shared.attachObserver(owned,'reference.stage');
    owned.webview.onDidReceiveMessage?.(async message=>{
      if(referencePanel!==owned)return false;
      if(message?.type===universal.MESSAGE_TYPE){try{return await dispatcher.dispatch('reference.stage',message);}catch{return false;}}
      if(shared.isSharedMessage(message))return shared.handle(message,{panel:owned,filename:'',disposed:referencePanel!==owned},'help');
      if(message&&Object.keys(message).sort().join()==='generation,type'&&message.type==='stageReferenceReturn'){let valid=false;try{valid=message.generation===referenceReturn?.generation&&Boolean(referenceReturn?.panel)&&referenceReturn.current();}catch{}if(valid){referenceReturn.panel.reveal(undefined,false);return true;}const notices=require('./stage_terminal_notices').createStageNotices({info:text=>api.window.showInformationMessage?.(text)});notices.info('The owning Stage changed or is no longer available. Reopen Stage Code from the intended Stage.');notices.flush();return false;}
      await require('./launch_controls').handleLaunchMessage(message,undefined,'help',owned);
    });
    referencePanel.onDidDispose(() => { if(referencePanel===owned){referencePanel = undefined;referenceReturn=undefined;} });
  } else referencePanel.reveal(api.ViewColumn.Active);
  referencePanel.title = 'Stage Reference - ' + choice.label;
  referenceReturn={generation:++referenceGeneration,panel:binding.originPanel,current:binding.isReturnOwnerCurrent||binding.isRetainedCurrent||current};
  const header=require('./shared_workspace_header'),model=require('./help_workspace').helpToolbarModel();
  // Reuse the canonical themed Help toolbar; the excerpt remains packaged/read-only.
  const content=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:8px}main{max-width:1000px;margin:12px auto;line-height:1.5}pre,code{font-family:var(--vscode-editor-font-family);white-space:pre-wrap}table{border-collapse:collapse}td,th{padding:5px;border:1px solid var(--vscode-panel-border)}button{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:5px 9px}</style></head><body>${header.html('help',model)}<button id="returnStage" ${binding.originPanel?'':'disabled'}>Return to Stage</button><main>${section.replace(/<a\b[^>]*>|<\/a>/gi, '')}</main><script>const vscode=acquireVsCodeApi();document.getElementById('returnStage').onclick=()=>vscode.postMessage({type:'stageReferenceReturn',generation:${referenceReturn.generation}});${header.clientScript()}</script></body></html>`;
  referencePanel.webview.html=require('./webview_policy').protect(content,referencePanel.webview.cspSource);
  return true;
}

module.exports = { stageReferences, openStageReference };
