'use strict';

// Standalone review windows own the same navigation as full editors. Local
// preview/apply controls remain in the document and retain their own guards.
const { CONTRACT_ID, DIMENSIONS, SLOTS } = require('./viewer_toolbar_contract');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const GLOBAL = new Set(['close','recovery','run','restart','project','stage','actions-search','suite-switch','updates','help','settings']);
function model(surfaceId) {
  return {contractId:CONTRACT_ID,surfaceId,dimensions:DIMENSIONS,slots:SLOTS.map(slot=>({...slot,enabled:GLOBAL.has(slot.id),reason:GLOBAL.has(slot.id)?'':'Use the reviewed controls in this window for this action.',dispatch:GLOBAL.has(slot.id)?'legacy.'+slot.id:''}))};
}
function enhance(html,surfaceId='sff.sheet-review') {
  if(html.includes('data-standalone-review-header'))return html;
  const nonce=html.match(/<(?:script|style)\s+nonce="([^"]+)"/)?.[1];
  const result=html.replace('</head>','<meta name="viewport" content="width=device-width,initial-scale=1"><style>[data-standalone-review-header]{display:block;max-width:100%;min-width:0}body{padding:0!important}.compare>*{min-width:0}@media(max-width:720px){.compare{grid-template-columns:minmax(0,1fr)!important}}</style></head>')
    .replace('<body>','<body><div data-standalone-review-header>'+launchControlsHtml('standalone_review',{universalModel:model(surfaceId),includeLayout:false})+'</div>')
    .replace('</script></body>',launchControlsClientScript()+'</script></body>');
  return nonce?result.replace(/<(style|script)(?![^>]*\bnonce=)(?=[\s>])/gi,(_,tag)=>'<'+tag+' nonce="'+nonce+'"'):result;
}
function isMessage(message){return typeof message?.type==='string'&&/^(?:ikemen|ikemaker\.|viewer|playerNavigate|entityHeader|modeVisibility)/.test(message.type);}
async function handle(message,seed,panel) {
  if(message?.type===require('./universal_toolbar_webview').MESSAGE_TYPE&&!GLOBAL.has(message.slotId))return true;
  return handleLaunchMessage(message,seed,'standalone_review',panel);
}
module.exports={model,enhance,handle,isMessage};
