'use strict';
const fs=require('fs'),path=require('path');
const model=require('./font_lab_model');
const {trackViewerPanel}=require('./viewer_group');
function createFontLabPanel(vscode,extensionUri,options={}){
 const panel=trackViewerPanel(vscode.window.createWebviewPanel('ikemenFontLab','Font Lab',vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true}));
 let source=options.fontFile||'',sheet=false,preview=null,draft=model.normalizeDraft(options),saved='',busy=false,disposed=false;
 panel.onDidDispose(()=>{disposed=true;});
 let toolbar;
 if(options.header!==false){const shared=require('./shared_workspace_header'),universal=require('./universal_toolbar_webview');const toolbarModel=()=>require('./universal_toolbar_adapter').adapt('font.lab',{'universal.open':{enabled:true,dispatch:'open'},'universal.save':{enabled:true,dispatch:'save'},'universal.save-as':{enabled:true,dispatch:'save'},'universal.close':{enabled:true,dispatch:'close'},'universal.help':{enabled:true,dispatch:'help'},'universal.settings':{enabled:true,dispatch:'settings'}});toolbar=universal.createUniversalToolbarDispatcher({handlersBySurface:{'font.lab':{open:()=>receive({type:'fontLab',action:'open',kind:'existing'}),save:()=>receive({type:'fontLab',action:'save',draft}),close:()=>panel.dispose(),help:()=>vscode.commands.executeCommand('ikemen.help.open'),settings:()=>vscode.commands.executeCommand('ikemen.openExtensionSettings')}},getToolbar:async()=>toolbarModel()});panel.webview.html=require('./font_lab_view').renderFontLabHtml(panel.webview.cspSource,{html:shared.html('font',toolbarModel()),style:universal.universalToolbarStyle(),client:shared.clientScript()});shared.attachObserver(panel,'font.lab');}else panel.webview.html=require('./font_lab_view').renderFontLabHtml(panel.webview.cspSource);
 const status=text=>panel.webview.postMessage({type:'fontLabStatus',text});
 function definition(){return preview?.state==='truetype'?model.trueTypeDefinition(path.basename(preview.file||preview.assetPath||preview.sourcePath||source),draft):'';}
 function publish(){if(!preview||disposed)return;const {glyphBanks,indexedGlyphs,palettes,...visiblePreview}=preview;panel.webview.postMessage({type:'fontLabState',source:(options.contextLabel?options.contextLabel+' · ':'')+source,sheet,preview:visiblePreview,draft,definition:definition(),canApply:typeof options.onApply==='function'});}
 async function load(reset=true){const assets=require('./font_assets');preview=await (sheet?assets.importFontSheet(source,draft):assets.inspectFont(source,{root:options.root,bank:draft.bank,characters:draft.characters}));if(!['truetype','bitmap'].includes(preview.state))throw Error(preview.reason||'This font cannot be edited.');if(reset){draft=model.draftFromPreview(preview,draft);for(const key of ['height','sampleText','bank','align'])if(options[key]!==undefined && (key!=='height'||Number(options.height)>0))draft[key]=model.normalizeDraft({...draft,[key]:options[key]})[key];}publish();}
 async function save(){
  if(!preview)throw Error('Choose a font first.');
  const target=await vscode.window.showSaveDialog({title:'Save font definition',defaultUri:vscode.Uri.file(saved||path.join(path.dirname(source),path.basename(source,path.extname(source))+'.def')),filters:{'Font definition':['def']}});if(!target)return null;
  const defPath=target.fsPath,sffPath=defPath.replace(/\.def$/i,'')+'.sff';if(!/\.def$/i.test(defPath))throw Error('Choose a .def filename.');
  let output;if(preview.state==='bitmap')output=require('./font_assets').createBitmapFontOutput(preview,{...draft,size:[draft.width,draft.height],name:path.basename(defPath,'.def'),sffFile:path.basename(sffPath)});else{
   const asset=preview.file||preview.assetPath||preview.sourcePath||source;const realAsset=/\.def$/i.test(asset)?preview.resolvedFile:asset;if(!realAsset)throw Error('TrueType asset path is unavailable.');
   output={defText:model.trueTypeDefinition(path.relative(path.dirname(defPath),realAsset),draft)};
  }
  const warning=preview.state==='bitmap'?require('./font_lab_files').conversionWarning(preview):'';
  if(warning&&[source,preview.assetPath].filter(Boolean).some(p=>[defPath,sffPath].some(f=>path.resolve(f).toLowerCase()===path.resolve(p).toLowerCase())))throw Error(warning);
  const files=[defPath,...(output.sffBytes?[sffPath]:[])];const choice=await vscode.window.showInformationMessage('Save font: '+files.join(', ')+'.'+(files.some(f=>fs.existsSync(f))?' Existing destination files will be replaced.':''),{modal:true,detail:(warning?warning+'\n\n':'')+output.defText},'Save font');if(choice!=='Save font')return null;
  require('./font_lab_files').writeFontFiles([...(output.sffBytes?[{filename:sffPath,data:output.sffBytes}]:[]),{filename:defPath,data:output.defText}]);saved=defPath;status('Saved '+defPath);return defPath;
 }
 async function receive(m){if(disposed)return;if(toolbar&&m?.type===require('./universal_toolbar_webview').MESSAGE_TYPE)return toolbar.dispatch('font.lab',m);if(options.header!==false&&require('./shared_workspace_header').isSharedMessage(m))return require('./shared_workspace_header').handle(m,{panel,filename:saved||source,disposed},'font');if(m?.type!=='fontLab'||busy)return;busy=true;try{
  if(m.action==='ready'){if(source&&!preview)await load();else publish();}
  else if(m.action==='open'){
   const filters=m.kind==='truetype'?{'TrueType font':['ttf','otf']}:m.kind==='sheet'?{'PNG sprite sheet':['png']}:{'Font files':['def','fnt','ttf','otf']};
   const uris=await vscode.window.showOpenDialog({canSelectMany:false,filters});if(uris?.length){const before={source,sheet,saved,preview,draft};try{source=uris[0].fsPath;sheet=m.kind==='sheet';saved='';if(sheet){preview={state:'bitmap',glyphs:{},banks:[0],size:[draft.cellWidth,draft.cellHeight],spacing:draft.spacing,offset:draft.offset,reason:'Set the sheet cells and character order, then rebuild glyphs.'};publish();}else await load();}catch(error){({source,sheet,saved,preview,draft}=before);throw error;}}
  }else if(m.action==='draft'){draft=model.normalizeDraft(m.draft);
  }else if(['bank','remap','save','apply'].includes(m.action)){
   draft=model.normalizeDraft(m.draft);if(m.action==='bank'||m.action==='remap')await load(false);else if(m.action==='save')await save();else if(typeof options.onApply==='function'){const fontPath=await save();if(fontPath){await options.onApply(fontPath);status('Applied '+fontPath+(options.contextLabel?' to '+options.contextLabel:''));}}
  }
 }catch(error){status('Font Lab: '+error.message);vscode.window.showErrorMessage('Font Lab: '+error.message);}finally{busy=false;}}
 panel.webview.onDidReceiveMessage(receive);
 return panel;
}
module.exports={createFontLabPanel,...require('./font_lab_view'),...model};
