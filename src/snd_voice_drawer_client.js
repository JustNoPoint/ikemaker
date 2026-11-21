'use strict';

function installDrawer({post, client, cutLibrary, model, presentationCss = '', installHelp}) {
  let current = null, soundHome = null;
  const nonce = document.querySelector('script[nonce]')?.nonce || '';
  const style = document.createElement('style');
  style.nonce = nonce;
  style.textContent = 'body.voiceDrawerOpen{padding-right:min(48vw,600px)}body.voiceDrawerOpen .workspace{display:block!important}body.voiceDrawerOpen #previewPane,body.voiceDrawerOpen #toolsPane{display:none!important}body.voiceDrawerOpen #organizePane{display:block!important}body.voiceDrawerOpen #organizePane>:not(#soundsPane):not(#sndDropZone){display:none!important}#sndVoiceDrawer{position:fixed;right:0;top:0;bottom:0;width:min(48vw,600px);z-index:150;container-type:inline-size;background:var(--vscode-editor-background);border-left:2px solid var(--vscode-focusBorder);overflow:auto}' +
    // Keep long Named shortcuts scrollable in the adjacent viewer column. Menus retain their own overflow.
    'body.voiceDrawerOpen .launch-controls>.viewer-icon-toolbar{overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}';
  document.head.append(style);

  function close() {
    if (soundHome && soundHome.node.isConnected) {
      soundHome.parent.insertBefore(soundHome.node, soundHome.next?.parentNode === soundHome.parent ? soundHome.next : null);
    }
    soundHome = null;
    current?.disposePresentation();
    current?.remove();
    current = null;
    document.body.classList.remove('voiceDrawerOpen');
  }

  addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'voiceDrawerClose') {
      if (current?.drawerId === message.id) close();
      return;
    }
    if (message?.type === 'voiceDrawerMessage') {
      if (current?.drawerId === message.id) current.events.dispatchEvent(new MessageEvent('message', {data:message.payload}));
      return;
    }
    if (message?.type !== 'voiceDrawerOpen' || current?.drawerId === message.id) return;
    close();

    const parsed = new DOMParser().parseFromString(message.html, 'text/html');
    const drawer = document.createElement('aside');
    drawer.id = 'sndVoiceDrawer';
    drawer.drawerId = message.id;
    drawer.events = new EventTarget();
    const root = drawer.attachShadow({mode:'open'}), css = document.createElement('style');
    css.nonce = nonce;
    css.textContent = [...parsed.querySelectorAll('style')].map(node => node.textContent.replace(/\bbody\b/g, ':host')
      .replace('@media(max-width:720px)', '@container(max-width:720px)')).join('\n') + presentationCss + ' :host{display:block;padding:12px} [hidden]{display:none!important}';
    root.append(css);
    for (const script of parsed.querySelectorAll('script')) script.remove();
    // The parent toolbar owns the display settings for the inline drawer.
    parsed.querySelector('.sound-presentation')?.remove();
    const body = document.createElement('section');
    body.innerHTML = parsed.body.innerHTML;
    root.append(body);
    document.body.append(drawer);
    current = drawer;
    document.body.classList.add('voiceDrawerOpen');

    const reflectPresentation = () => {
      const parent = document.documentElement.dataset;
      drawer.dataset.ikmPresentation = parent.ikmPresentation || 'guided';
      drawer.dataset.ikmActionLabels = parent.ikmActionLabels || 'named';
    };
    reflectPresentation();
    document.addEventListener('ikmPresentationChanged', reflectPresentation);
    const help = installHelp?.(root);
    const unbindFocus = globalThis.ikmPresentationInstalled?.bindActionFocus?.(root);
    drawer.disposePresentation = () => {
      document.removeEventListener('ikmPresentationChanged', reflectPresentation);
      unbindFocus?.();
      help?.dispose();
    };

    const sounds = document.getElementById('soundsPane'), organize = document.getElementById('organizePane');
    if (sounds && organize) {
      soundHome = {node:sounds, parent:sounds.parentNode, next:sounds.nextSibling};
      organize.append(sounds);
    }
    const send = payload => post({type:'voiceDrawerMessage', id:message.id, payload});
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close voice drawer';
    closeButton.onclick = () => send({type:'cancel'});
    body.prepend(closeButton);
    root.querySelector('#voiceImport').hidden = true;
    const title = root.querySelector('h1');
    if (title) title.textContent = 'Voice Cuts';
    root.addEventListener('focusin', () => drawer.events.dispatchEvent(new Event('focus')));
    client({document:root, cutLibrary, canImport:true, canImportPackage:false, post:send,
      listen:(type, fn) => drawer.events.addEventListener(type, fn),
      pointerDrop:(payload, x, y) => {
        const hit = document.elementFromPoint(x, y), row = hit?.closest('[data-sound-archive-index]'), zone = hit?.closest('#sndDropZone');
        if (!row && !zone) {
          root.getElementById('voiceStatus').textContent = 'Drop on the adjacent SND list or its drop area, or use Add selected.';
          return;
        }
        post({type:'dropVoiceCuts', payload:JSON.stringify(payload), index:row ? Number(row.dataset.soundArchiveIndex) : undefined,
          generation:model.generation, sourceFingerprint:model.sourceFingerprint});
      }});
  });
  post({type:'voiceDrawerReady'});
}

function clientScript() {
  const {client} = require('./snd_voice_split_workspace');
  const {cutLibrary} = require('./snd_cut_library_view');
  const presentation = require('./viewer_presentation');
  const help = require('./viewer_context_help');
  const css = presentation.style({shadow:true}) + help.style({shadow:true});
  return '(' + installDrawer.toString() + ')({model,post:message=>vscode.postMessage(message),client:(' + client.toString() +
    '),cutLibrary:(' + cutLibrary.toString() + '),presentationCss:' + JSON.stringify(css) +
    ',installHelp:root=>{return ' + help.clientScript({shadowVariable:'root'}) + '}});';
}

module.exports = {installDrawer, clientScript};
