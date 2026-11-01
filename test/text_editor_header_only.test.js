'use strict';

const assert=require('assert');
const toolbar=require('../src/text_editor_toolbar');

function harness(initial={}){
  const values=new Map(Object.entries(initial)),updates=[],state=new Map();
  const vscode={
    ConfigurationTarget:{Workspace:2},
    workspace:{workspaceFolders:[{uri:{fsPath:'C:/chars'}}],getConfiguration(section){return{
      get(key,fallback){const id=`${section}.${key}`;return values.has(id)?values.get(id):fallback;},
      inspect(key){const id=`${section}.${key}`;return values.has(id)?{workspaceValue:values.get(id)}:{};},
      async update(key,value,target){const id=`${section}.${key}`;updates.push({id,value,target});if(value===undefined)values.delete(id);else values.set(id,value);}
    };}}
  };
  const context={workspaceState:{get(key,fallback){return state.has(key)?state.get(key):fallback;},async update(key,value){if(value===undefined)state.delete(key);else state.set(key,value);}}};
  return{vscode,context,values,updates,state};
}

(async()=>{
  const app=harness({'workbench.editor.showTabs':'multiple','editor.scrollbar.horizontal':'visible'});
  let result=await toolbar.applyHeaderOnlyLayout(app.vscode,app.context,true);
  assert.strictEqual(result.enabled,true);
  assert.strictEqual(app.values.get('workbench.editor.showTabs'),'none');
  assert.strictEqual(app.values.get('editor.scrollbar.horizontal'),'hidden');
  assert.strictEqual(app.values.get('editor.scrollbar.vertical'),'hidden');
  assert(app.state.has(toolbar.HEADER_ONLY_BACKUP_KEY),'prior workspace values are retained before the layout changes');

  result=await toolbar.applyHeaderOnlyLayout(app.vscode,app.context,false);
  assert.strictEqual(app.values.get('workbench.editor.showTabs'),'multiple');
  assert.strictEqual(app.values.get('editor.scrollbar.horizontal'),'visible');
  assert.strictEqual(app.values.has('editor.scrollbar.vertical'),false,'an originally inherited setting is restored by removing the workspace override');
  assert.strictEqual(app.state.has(toolbar.HEADER_ONLY_BACKUP_KEY),false);

  const preserved=harness({'workbench.editor.showTabs':'single'});
  await toolbar.applyHeaderOnlyLayout(preserved.vscode,preserved.context,true);
  preserved.values.set('workbench.editor.showTabs','multiple');
  result=await toolbar.applyHeaderOnlyLayout(preserved.vscode,preserved.context,false);
  assert(result.preserved.includes('native editor tabs'),'a user change made while header-only mode is active is never overwritten during restore');
  assert.strictEqual(preserved.values.get('workbench.editor.showTabs'),'multiple');

  const loose=harness();
  loose.vscode.workspace.workspaceFolders=[];
  result=await toolbar.applyHeaderOnlyLayout(loose.vscode,loose.context,false);
  assert.strictEqual(result.unavailable,true,'loose-file startup reports that workspace-only chrome is unavailable');
  assert.strictEqual(loose.updates.length,0,'loose-file startup never writes workspace settings');

  const grouped=harness({'workbench.editor.showTabs':'multiple','editor.scrollbar.horizontal':'visible','editor.scrollbar.vertical':'auto'});
  result=await toolbar.applyTextTabLayout(grouped.vscode,grouped.context,{grouped:true,headerOnly:false});
  assert.strictEqual(result.mode,'grouped');assert.strictEqual(grouped.values.get('workbench.editor.showTabs'),'single','Grouped files reduces native tabs without hiding them');
  assert.strictEqual(grouped.values.get('editor.scrollbar.horizontal'),'visible','Grouped files does not alter editor scrollbars');
  result=await toolbar.applyTextTabLayout(grouped.vscode,grouped.context,{grouped:false,headerOnly:true});
  assert.strictEqual(grouped.values.get('workbench.editor.showTabs'),'none');assert.strictEqual(grouped.values.get('editor.scrollbar.horizontal'),'hidden','Header-Only takes sole precedence when both modes would otherwise compete');
  result=await toolbar.applyTextTabLayout(grouped.vscode,grouped.context,{grouped:true,headerOnly:false});
  assert.strictEqual(grouped.values.get('workbench.editor.showTabs'),'single');assert.strictEqual(grouped.values.get('editor.scrollbar.horizontal'),'visible','switching back to Grouped files restores the original scrollbar value without dropping the shared backup');
  result=await toolbar.applyTextTabLayout(grouped.vscode,grouped.context,{grouped:false,headerOnly:false});
  assert.strictEqual(grouped.values.get('workbench.editor.showTabs'),'multiple');assert.strictEqual(grouped.state.has(toolbar.HEADER_ONLY_BACKUP_KEY),false,'turning both modes off restores and clears the shared workspace backup');

  const groupedPreserved=harness({'workbench.editor.showTabs':'multiple'});await toolbar.applyTextTabLayout(groupedPreserved.vscode,groupedPreserved.context,{grouped:true});groupedPreserved.values.set('workbench.editor.showTabs','multiple');result=await toolbar.applyTextTabLayout(groupedPreserved.vscode,groupedPreserved.context,{});assert(result.preserved.includes('native editor tabs'));assert.strictEqual(groupedPreserved.values.get('workbench.editor.showTabs'),'multiple','an independent workspace tab change is not overwritten when Grouped files turns off');
  const escape=harness({'workbench.editor.showTabs':'none','editor.scrollbar.horizontal':'hidden','editor.scrollbar.vertical':'hidden','ikemenZss.textToolbar.headerOnlyLayout':true,'ikemenZss.textToolbar.groupedFiles':true});result=await toolbar.restoreNativeTextLayout(escape.vscode,escape.context);assert.strictEqual(result.forcedNative,true);assert.strictEqual(escape.values.get('workbench.editor.showTabs'),'multiple','the permanent escape restores native tabs even if no prior IKEMaker backup survives');assert.strictEqual(escape.values.get('editor.scrollbar.horizontal'),'auto');assert.strictEqual(escape.values.get('editor.scrollbar.vertical'),'auto');assert.strictEqual(escape.values.get('ikemenZss.textToolbar.headerOnlyLayout'),false);assert.strictEqual(escape.values.get('ikemenZss.textToolbar.groupedFiles'),false);
  const disable=harness({'workbench.editor.showTabs':'multiple','editor.scrollbar.horizontal':'visible','editor.scrollbar.vertical':'auto'});result=await toolbar.disableNativeTextLayout(disable.vscode,disable.context);assert.strictEqual(result.mode,'header-only');assert.strictEqual(disable.values.get('workbench.editor.showTabs'),'none');assert.strictEqual(disable.values.get('editor.scrollbar.horizontal'),'hidden');assert.strictEqual(disable.values.get('editor.scrollbar.vertical'),'hidden');assert.strictEqual(disable.values.get('ikemenZss.textToolbar.headerOnlyLayout'),true);assert.strictEqual(disable.values.get('ikemenZss.textToolbar.groupedFiles'),false);
  console.log('Header-only and Grouped files preserve workspace values, remain mutually ordered, and never overwrite independent changes');
})().catch(error=>{console.error(error);process.exitCode=1;});
