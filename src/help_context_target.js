'use strict';
const screens=require('../data/help/screens.json');
function helpContextTarget(request){return request&&typeof request==='object'&&Object.keys(request).join('|')==='screen'&&typeof request.screen==='string'&&screens.some(s=>s.id===request.screen)?{screen:request.screen}:null;}
function mountHelpContext(env){
 function focus(target){if(!target||typeof target.screen!=='string')return false;const card=[...env.document.querySelectorAll('[data-help-screen]')].find(node=>node.dataset.helpScreen===target.screen);if(!card)return false;const tab=env.document.getElementById('helpTab-screens');tab?.click();const search=env.document.getElementById('screenSearch');if(search){search.value='';search.oninput?.();}card.scrollIntoView?.({block:'start'});card.focus?.({preventScroll:true});return true;}
 env.window.addEventListener('message',event=>{const message=event.data;if(message?.type==='helpContextTarget')focus(message);});
 focus(env.initialTarget);env.post({type:'helpContextReady'});return {focus};
}
module.exports={helpContextTarget,mountHelpContext};
