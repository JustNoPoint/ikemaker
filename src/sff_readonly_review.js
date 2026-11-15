'use strict';

const crypto = require('crypto');
const providers = new WeakMap();
const SCHEME = 'ikemaker-sff-review';

function acquire(api) {
  const key = api.workspace.registerTextDocumentContentProvider;
  let state = providers.get(key);
  if (!state) {
    state = {contents:new Map(), references:0};
    state.registration = api.workspace.registerTextDocumentContentProvider(SCHEME, {
      provideTextDocumentContent: uri => state.contents.get(uri.toString()) ?? 'This SFF review has closed.'
    });
    providers.set(key, state);
  }
  state.references++;
  return {key,state};
}

async function review(api, {title,content,confirm}) {
  if (typeof title !== 'string' || typeof content !== 'string' || typeof confirm !== 'function') throw new Error('SFF review needs an exact title, content and decision.');
  const {key,state} = acquire(api);
  const uri = api.Uri.from({scheme:SCHEME,authority:crypto.randomUUID(),path:'/'+title.replace(/[^\w .-]/g,'_')+'.txt'});
  const resource = uri.toString();
  state.contents.set(resource, content);
  try {
    // Content-provider documents are readonly resources, not unsaved drafts.
    const document = await api.workspace.openTextDocument(uri);
    await api.window.showTextDocument(document,{preview:true,preserveFocus:false});
    return await confirm();
  } finally {
    try {
      const tabs = (api.window.tabGroups?.all || []).flatMap(group=>group.tabs || [])
        .filter(tab=>tab.input?.uri?.toString() === resource);
      if (tabs.length) await api.window.tabGroups.close(tabs,true);
    } finally {
      state.contents.delete(resource);
      if (--state.references === 0) {
        state.registration.dispose();
        providers.delete(key);
      }
    }
  }
}

module.exports = {review};
