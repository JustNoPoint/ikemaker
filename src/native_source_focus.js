'use strict';
// Revealing a native tab can leave DOM focus in the webview that initiated the
// handoff. Focus its exact returned group after the native editor has opened.
const GROUPS=['First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth'];
async function showNativeSource(api,document,options){
 const editor=await api.window.showTextDocument(document,{...options,preserveFocus:false});
 if(editor?.document!==document)return editor;
 const ordinal=GROUPS[Number(editor.viewColumn)-1];
 if(api.commands?.executeCommand)await api.commands.executeCommand(ordinal?'workbench.action.focus'+ordinal+'EditorGroup':'workbench.action.focusActiveEditorGroup');
 return editor;
}
module.exports={showNativeSource};
