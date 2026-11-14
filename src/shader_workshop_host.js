'use strict';

const path = require('path');
const { adapt } = require('./universal_toolbar_adapter');
const {
  MESSAGE_TYPE, renderUniversalToolbar, universalToolbarStyle,
  universalToolbarClientScript, createUniversalToolbarDispatcher
} = require('./universal_toolbar_webview');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');
const { createShaderWorkshopSession, renderShaderWorkshopHtml } = require('./shader_workshop_workspace');
const { createShaderPreviewSourceBridge } = require('./shader_preview_source_bridge');
const { createPreviewFramePacket, createShaderRenderContract, withGeneration } = require('./shader_render_contract');
const { rendererClientScript } = require('./shader_webgl_renderer');

const COMMAND = 'ikemen.shader.openWorkshop';
const SURFACE = 'shader.workspace';
const VIEW_TYPE = 'ikemenShaderWorkshop';
let active = null;

function sameFile(left, right) {
  const normalize = value => path.resolve(String(value || '')).replaceAll('\\', '/').toLowerCase();
  return Boolean(left && right) && normalize(left) === normalize(right);
}

function liveDocument(vscode, filename) {
  return (vscode.workspace?.textDocuments || []).find(document => !document.isClosed && sameFile(document.fileName, filename)) || null;
}

function capability(enabled, dispatch, reason) {
  return enabled ? { enabled: true, dispatch } : { enabled: false, reason };
}

function toolbarModel() {
  return adapt(SURFACE, {
    'universal.open': capability(true,'open'),
    'universal.save': capability(true,'save'),
    'universal.save-as': capability(true,'save-as'),
    'universal.close': capability(true, 'close'),
    'universal.help': capability(true, 'help'),
    'universal.settings': capability(true, 'settings')
  });
}

function exactMessage(message, keys) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
  const actual = Object.keys(message).sort(), expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function sourceOptions(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.kind === 'sff') return {
    kind: 'sff', sffPath: String(value.sffPath || ''), selection: value.selection,
    paletteOverride: value.paletteOverride ?? null
  };
  if (value.kind === 'air') return {
    kind: 'air', sffPath: String(value.sffPath || ''), airPath: String(value.airPath || ''),
    actionNumber: value.actionNumber, frameIndex: value.frameIndex, paletteForGroup: value.paletteForGroup ?? null,
    spriteSelection: value.spriteSelection ?? null
  };
  return null;
}

function captureSource(owner, supplied) {
  const options = sourceOptions(supplied);
  if (!options) return false;
  const captured = options.kind === 'sff'
    ? owner.bridge.fromSff(options.sffPath, options.selection, options.paletteOverride)
    : owner.bridge.fromAir(options.sffPath, options.airPath, options.actionNumber, options.paletteForGroup, options.spriteSelection);
  owner.source = captured.source;
  owner.sourceOptions=options;
  owner.paletteOverride = options.kind === 'sff' ? options.paletteOverride : options.paletteForGroup;
  owner.session.setPreview(captured.preview);
  if (options.kind === 'air') owner.session.rememberPreviewFrame(options.frameIndex);
  owner.session.project = require('./shader_workshop_model').setTargetKind(owner.session.project, options.kind === 'air' ? 'animation' : 'sprite');
  owner.panel.title = `Shader Workshop · ${path.basename(options.kind === 'sff' ? options.sffPath : options.airPath)}`;
  return true;
}

function render(owner) {
  const snapshot = owner.session.snapshot(), model = toolbarModel();
  let rendererScript = '', rendererError = '';
  if(snapshot.preview.frames.length && snapshot.project.mode==='code'){
    owner.contract=null;rendererError='Source artwork · export to see the imported shader in IKEMEN.';
  } else if (snapshot.preview.frames.length) {
    try {
      const contract = withGeneration(createShaderRenderContract(snapshot.project, snapshot.preview, snapshot.previewFrame), snapshot.generation);
      rendererScript = rendererClientScript(contract);
      owner.contract = contract;
    } catch (error) { owner.contract = null; rendererError = String(error.message || error).slice(0, 512); }
  } else owner.contract = null;
  owner.panel.webview.html = renderShaderWorkshopHtml(snapshot, {
    resourceSource: owner.panel.webview.cspSource,
    documentKey: owner.projectUri?.fsPath || snapshot.project.name,
    toolbarHtml: require('./shared_workspace_header').html('shader', model),
    toolbarStyle: universalToolbarStyle(),
    toolbarClient: require('./shared_workspace_header').clientScript(),
    rendererScript, rendererError
  });
}

function previewPacket(owner, frame) {
  if (!owner.source) throw new Error('Choose an SFF sprite or AIR action before requesting preview frames.');
  const preview = owner.session.preview;
  const snapshot = owner.session.snapshot();
  return createPreviewFramePacket(preview, frame, snapshot.generation);
}

function createToolbarDispatcher(vscode, owner) {
  const execute = command => async () => vscode.commands.executeCommand(command);
  const projectAction = type => () => handleMessage(vscode, owner, {type,generation:owner.session.generation});
  return createUniversalToolbarDispatcher({
    handlersBySurface: { [SURFACE]: {
      open:projectAction('open-project'),
      save:projectAction('save-project'),
      'save-as':projectAction('save-project-as'),
      close: async () => owner.panel.dispose(),
      help: execute('ikemen.help.open'),
      settings: execute('ikemen.openExtensionSettings')
    } },
    getToolbar: async () => toolbarModel()
  });
}

async function handleMessage(vscode, owner, message) {
  if (message?.type === MESSAGE_TYPE) return owner.toolbar.dispatch(SURFACE, message);
  if (require('./shared_workspace_header').isSharedMessage(message) && await require('./shared_workspace_header').handle(message, { panel: owner.panel, filename: owner.source?.filename || '', disposed: owner.disposed }, 'shader')) return true;
  const fileActions = ['export-fullscreen','export-vulkan','import-source','save-project','save-project-as','open-project','reset-preset','copy-brief','reload-source','pick-sprite','pick-action'];
  if (fileActions.includes(message?.type)) {
    const snapshot = owner.session.snapshot(), project = snapshot.project;
    if (!exactMessage(message,['type','generation']) || message.generation !== snapshot.generation) return false;
    const current = () => !owner.disposed && owner.session.generation === snapshot.generation;
    const fs = require('fs/promises'), model=require('./shader_workshop_model'), io=require('./shader_workshop_files');
    const pick = async (title, extensions, many=false) => vscode.window.showOpenDialog({title,canSelectFiles:true,canSelectFolders:false,canSelectMany:many,filters:{Files:extensions}});
    if (message.type==='export-fullscreen' || message.type==='export-vulkan') {
      let nightly=project.engine==='nightly';
      if(!project.engine && project.target.kind!=='fullscreen'){
        const version=await vscode.window.showQuickPick(['IKEMEN 1.0','IKEMEN Nightly'],{title:'Select the game that will load this character shader'});
        if(!version||!current())return false;
        nightly=version==='IKEMEN Nightly';
      }
      const files=io.exportStages(project,nightly);
      await io.validateDesktopGL(files,nightly);
      const payload=await io.preparePayload(files,message.type==='export-vulkan');
      if(!current())return false;
      const label=project.mode==='preset'?project.presetId:project.name;
      let folder;
      const previous=owner.lastExport;
      if(previous && previous.kind===project.target.kind && previous.nightly===nightly && previous.format===message.type){
        const answer=await vscode.window.showQuickPick([
          {label:'Update previous export',description:previous.folder,update:true},
          {label:'Export to a new folder',update:false}
        ],{title:'Export shader'});
        if(!answer || !current())return false;
        if(answer.update)folder=await io.updateBundle(previous.folder,previous.hash,payload);
      }
      if(!folder){
        const folders=await vscode.window.showOpenDialog({canSelectFiles:false,canSelectFolders:true,canSelectMany:false,openLabel:'Export shader here'});
        if (!folders?.length || !current()) return false;
        folder=await io.writeBundle(folders[0].fsPath,label,payload);
      }
      const alias=folder===previous?.folder?previous.alias:label;
      owner.lastExport={folder,hash:io.fingerprint(payload),kind:project.target.kind,format:message.type,nightly,alias};
      const placement=io.placement(folder,project.target.kind,alias,nightly);
      const choice=await vscode.window.showInformationMessage('Exported to '+folder+'. '+(project.target.kind==='fullscreen'?'Add the path to save/config.ini [Video] ExternalShaders for all matches.':'Register the fragment in the character DEF and apply it in the owning state.'),'Copy setup','View setup');
      if(choice==='Copy setup')await vscode.env.clipboard.writeText(placement);
      if(choice==='View setup')await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({content:placement,language:'plaintext'}));
      return true;
    }
    if(message.type==='save-project'||message.type==='save-project-as'){
      const uri=(message.type==='save-project' && owner.projectUri) || await vscode.window.showSaveDialog({defaultUri:owner.projectUri,filters:{'Shader Workshop':['json']}});
      if(!uri || !current())return false;
      const bytes=Buffer.from(model.serializeShaderProject(project));
      if(bytes.length>4*1024*1024)throw new Error('Project exceeds 4 MiB.');
      await vscode.workspace.fs.writeFile(uri,bytes);
      owner.projectUri=uri;return true;
    }
    if(message.type==='reload-source'){
      if(!owner.sourceOptions)return false;
      const options={...owner.sourceOptions,frameIndex:snapshot.previewFrame};
      captureSource(owner,options);owner.session.project=project;render(owner);return true;
    }
    if(message.type==='copy-brief'){
      if(!snapshot.aiBrief)return false;
      await vscode.env.clipboard.writeText(JSON.stringify(snapshot.aiBrief,null,2));return true;
    }
    let next=project;
    if(message.type==='open-project'){
      const [uri]=await pick('Open Shader Workshop project',['json'])||[];
      if(!uri)return false;
      if((await fs.stat(uri.fsPath)).size>4*1024*1024)throw new Error('Project exceeds 4 MiB.');
      next=model.parseShaderProject(await fs.readFile(uri.fsPath,'utf8'));
      if(!current())return false;
      owner.projectUri=uri;
      owner.source=null;owner.sourceOptions=null;owner.paletteOverride=null;owner.session.preview=require('./shader_preview_model').normalizeShaderPreview({});owner.session.previewFrame=0;
      owner.panel.title='Shader Workshop · '+next.name;
      owner.session.aiBrief=null;owner.session.aiDescription='';owner.lastExport=null;
    } else if(message.type==='import-source'){
      const selected=await pick('Import fragment, vertex or shader pair',['frag','vert','fs','vs','glsl'],true);
      if(!selected?.length)return false;
      const code=await io.importStages(selected.map(uri=>uri.fsPath));
      next={...project,mode:'code',name:path.parse(selected[0].fsPath).name,target:{...project.target,kind:code.vertex?'fullscreen':'sprite'},code};
    } else if(message.type==='reset-preset'){
      next=model.selectPreset(project,'passthrough');
    } else {
      const air=message.type==='pick-action';
      const [asset]=await pick(air?'Choose AIR animation file':'Choose sprite archive',air?['air']:['sff'])||[];
      if(!asset)return false;
      const sff=air?(await pick('Choose the SFF used by this AIR',['sff'])||[])[0]:asset;
      if(!sff)return false;
      let options;
      if(air){
        const actions=require('./air_preview_model').parseAir(await fs.readFile(asset.fsPath,'utf8'));
        const choice=await vscode.window.showQuickPick(actions.map(a=>({label:'Action '+a.number,description:a.frames.length+' elements',number:a.number})),{title:'Preview animation'});
        if(!choice)return false;
        options={kind:'air',sffPath:sff.fsPath,airPath:asset.fsPath,actionNumber:choice.number};
      } else {
        const archive=require('./sff_reader').parseSffBuffer(await fs.readFile(sff.fsPath),sff.fsPath);
        const choice=await vscode.window.showQuickPick(archive.sprites.map(sprite=>({label:sprite.group+','+sprite.number,description:'Entry '+sprite.index,sprite})),{title:'Preview sprite'});
        if(!choice)return false;
        const {index,group,number}=choice.sprite;
        options={kind:'sff',sffPath:sff.fsPath,selection:{physicalIndex:index,group,number}};
      }
      if(!current())return false;
      captureSource(owner,options);render(owner);return true;
    }
    if(!current())return false;
    if(message.type==='import-source'){owner.projectUri=null;owner.lastExport=null;}
    owner.session.project=next;owner.session.generation++;owner.session.notice='';render(owner);return true;
  }
  if (message?.type === 'request-preview-frame') {
    if (!exactMessage(message, ['type', 'generation', 'frame']) || message.generation !== owner.session.snapshot().generation || !Number.isSafeInteger(message.frame)) return false;
    const packet = previewPacket(owner, message.frame);
    return owner.panel.webview.postMessage(packet);
  }
  if (message?.type === 'select-preview-frame') {
    if (!exactMessage(message, ['type', 'generation', 'frame']) || message.generation !== owner.session.snapshot().generation) return false;
    return Boolean(owner.session.rememberPreviewFrame(message.frame));
  }
  const changed = owner.session.handleMessage(message);
  if (!changed) return false;
  render(owner);
  return true;
}

function createOwner(vscode, context) {
  const panel = trackViewerPanel(vscode.window.createWebviewPanel(
    VIEW_TYPE, 'Shader Workshop', preferredViewerColumn(vscode.ViewColumn.Beside),
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
  ));
  require('./shared_workspace_header').attachObserver(panel, SURFACE);
  const owner = {
    panel, session: createShaderWorkshopSession({ id: 'shader-workshop', name: 'Shader Workshop' }),
    bridge: createShaderPreviewSourceBridge({ getLiveDocument: filename => liveDocument(vscode, filename) }),
    source: null, paletteOverride: null, contract: null, disposed: false, subscriptions: []
  };
  owner.toolbar = createToolbarDispatcher(vscode, owner);
  const received = panel.webview.onDidReceiveMessage(message => handleMessage(vscode, owner, message).catch(error => {
    if (!owner.disposed) vscode.window.showErrorMessage(`Shader Workshop: ${error.message}`);
  }));
  if (received) owner.subscriptions.push(received);
  panel.onDidDispose(() => {
    owner.disposed = true;
    for (const subscription of owner.subscriptions.splice(0)) try { subscription.dispose?.(); } catch (_) {}
    if (active === owner) active = null;
  });
  render(owner);
  return owner;
}

async function openShaderWorkshop(vscode, context, options = null) {
  let owner = active;
  if (!owner || owner.disposed) owner = active = createOwner(vscode, context);
  if (options) {
    captureSource(owner, options);
    render(owner);
  }
  revealInViewerGroup(owner.panel, false, vscode.ViewColumn.Beside);
  return owner.panel;
}

function registerShaderWorkshop(context, suppliedVscode = null) {
  const vscode = suppliedVscode || require('vscode');
  const registration = vscode.commands.registerCommand('ikemen.shader.openWorkshop', options => openShaderWorkshop(vscode, context, options));
  context.subscriptions.push(registration);
  return registration;
}

function resetShaderWorkshopForTests() {
  try { active?.panel?.dispose?.(); } catch (_) {}
  active = null;
}

module.exports = {
  COMMAND, SURFACE, VIEW_TYPE, toolbarModel, sourceOptions, exactMessage,
  openShaderWorkshop, registerShaderWorkshop, resetShaderWorkshopForTests, renderWorkshopOwner: render
};
