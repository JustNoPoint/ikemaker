'use strict';
function findBackground(backgrounds,ref){
  if(!ref||typeof ref.backgroundName!=='string'||typeof ref.backgroundType!=='string')return null;
  const matches=backgrounds.filter(item=>item.name===ref.backgroundName&&item.type===ref.backgroundType);
  return matches.length===1?matches[0]:null;
}
function clientScript(){return `const historyBackground=${findBackground.toString()};
 globalThis.ikemenNavigationSelection=()=>{const item=model.backgrounds[selected];return item?{backgroundName:item.name,backgroundType:item.type}:undefined;};
 globalThis.ikemenCanRestoreNavigation=ref=>!!historyBackground(model.backgrounds,ref);
 globalThis.ikemenRestoreNavigation=ref=>{const item=historyBackground(model.backgrounds,ref);if(!item)throw new Error('Background missing or ambiguous');const index=model.backgrounds.indexOf(item);if(index===selected)return;selected=index;list();inspect();render();};
`;}
module.exports={findBackground,clientScript};
