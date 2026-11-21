"use strict";
const fs = require('node:fs');
const {hash} = require('./mutation_safety');
const {planManualLink,eligibleTarget} = require('./sff_manual_image_link');
const reader = require('./sff_reader');
const presentation = require('./viewer_presentation');
const help = require('./viewer_context_help');
const escape = value => String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
function identity(sprite) { return sprite.group+','+sprite.number+' [physical '+sprite.index+']'; }
function image(label, bytes) {
    return '<figure><figcaption>'+escape(label)+'</figcaption><img alt="'+escape(label)+'" src="data:image/png;base64,'+bytes.toString('base64')+'"></figure>';
}
async function run(vscode,filename,archive,message,hooks) {
    const current = () => hooks.isCurrent() && hash(fs.readFileSync(filename)) === hash(archive.buffer);
    if (!current()) throw Error('The SFF changed. Refresh before linking.');
    const destinationIndex = message.selectedIndex, destination = archive.sprites[destinationIndex];
    if (!destination) throw Error('Select a destination sprite first.');
    if(archive.header.legacy)throw Error('Convert SFF v1 to v2 before linking images.');
    if(archive.sprites.length>4096||archive.sprites.reduce((total,sprite)=>{const source=reader.resolvedSprite(archive,sprite);if(source.width*source.height>1000000)throw Error('Manual image linking exceeds the decoded image budget.');return total+source.width*source.height;},0)>16000000)throw Error('Manual image linking exceeds the decoded image budget.');
    const choices = archive.sprites.filter(sprite=>eligibleTarget(archive,destinationIndex,sprite.index)).map(sprite=>({
        label:identity(sprite), description:reader.resolvedSprite(archive,sprite).width+' × '+reader.resolvedSprite(archive,sprite).height,index:sprite.index
    }));
    if (!choices.length) throw Error('No eligible independent image targets are available.');
    const target = await vscode.window.showQuickPick(choices,{
        title:'Choose artwork source for '+identity(destination),
        placeHolder:'This intentionally replaces the selected destination artwork. Axes and assigned palette stay.'
    });
    if (!target) return;
    if (!current()) throw Error('The SFF changed while choosing a target.');
    const plan = planManualLink(archive,destinationIndex,target.index);
    const panel = vscode.window.createWebviewPanel('sffManualImageLinkReview','Manual image-link review',vscode.ViewColumn.Active,{enableScripts:true,localResourceRoots:[]});
    require('./viewer_group').trackViewerPanel(panel);
    let closed = false;
    let finishReview;
    const decision = new Promise(resolve => { finishReview = resolve; });
    panel.onDidDispose(()=>{ closed = true; finishReview(false); });
    panel.webview.onDidReceiveMessage(message => {
        if (presentation.isMessage(message)) return presentation.handle(message, panel);
        if (message?.type === 'confirmLinkReview' && Object.keys(message).length === 1) finishReview(true);
        if (message?.type === 'cancelLinkReview' && Object.keys(message).length === 1) finishReview(false);
    });
    const affected = plan.affectedUsers.map(user=>identity(user)+' · assigned palette '+user.paletteIndex+' · retain previous artwork independently');
    const rehomed = plan.rehomedOwner ? 'The chosen image occurs later in this archive. Store its unchanged image at destination physical '+plan.rehomedOwner.to+'; original source physical '+plan.rehomedOwner.from+' links back to it. These source-image users retain pixels and assigned palettes: '+plan.rehomedOwner.users.map(identity).join('; ')+'.' : 'The destination links to the existing earlier source image owner.';
    const detail = ['SFF: '+filename,'Destination '+identity(destination)+' ← '+target.label,
        'This intentionally replaces destination artwork. Its axes and assigned palette stay unchanged.',
        rehomed,affected.length+' downstream linked users retain their previous artwork independently.',...affected].join('\n');
    const html = '<!doctype html><html><head><meta charset="utf-8"><style>body{background:var(--vscode-editor-background,#333);color:var(--vscode-foreground,white);font-family:var(--vscode-font-family,sans-serif);padding:16px}.images{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;max-width:340px}figcaption{margin:8px 0}img{width:320px;height:240px;object-fit:contain;image-rendering:pixelated;background:repeating-conic-gradient(#555 0% 25%,#777 0% 50%) 0/16px 16px}pre{white-space:pre-wrap}'+presentation.style()+help.style()+'</style></head><body><h1>Manual image-link review</h1>'+presentation.chooserHtml()+'<p data-ikm-help="Compare sprite previews">Compare the destination before and after linking against the chosen source.</p><div class="images">'+
        image('Destination '+identity(destination)+' before',reader.spritePng(archive,destination))+
        image('Chosen source '+target.label,reader.spritePng(archive,archive.sprites[target.index]))+
        image('Destination after · assigned palette retained',reader.spritePng(plan.archive,plan.archive.sprites[destinationIndex]))+
        '</div><h2>Affected storage and linked users</h2><pre>'+escape(detail)+'</pre><button type="button" id="confirm">Review and confirm image link…</button> <button type="button" id="cancel" data-ikm-action-icon="×" aria-label="Cancel" title="Cancel"><span data-ikm-action-label>Cancel</span></button>'+
        '<script>const vscode=acquireVsCodeApi();document.getElementById("confirm").onclick=()=>vscode.postMessage({type:"confirmLinkReview"});document.getElementById("cancel").onclick=()=>vscode.postMessage({type:"cancelLinkReview"});'+
        presentation.clientScript({vscodeVariable:'vscode'})+help.clientScript()+'</script></body></html>';
    panel.webview.html = require('./webview_policy').protect(html,panel.webview.cspSource);
    try {
        if (!await decision || closed) return;
        if (await vscode.window.showWarningMessage('Save this manual image link?',{modal:true,detail},'Apply Image Link') !== 'Apply Image Link') return;
        if (closed || !current()) throw Error('The SFF changed or the originating viewer/review closed. Nothing was written.');
        await hooks.apply(plan);
        return plan;
    } finally { if (!closed) panel.dispose(); }
}
module.exports = {run};
