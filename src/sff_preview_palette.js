'use strict';
function normalizePreviewPalette(value){
 if(value==='sprite')return value;
 if(typeof value!=='number'&&typeof value!=='string'||typeof value==='string'&&!/^\d+$/.test(value))return null;
 const index=Number(value);return Number.isSafeInteger(index)&&index>=0?index:null;
}
// Each indexed sprite owns its palette unless the user explicitly previews
// another one. Truecolor pixels never participate in indexed palette previews.
function effectivePreviewPalette(sprite,preview,preferences={},follow=false){
 if(sprite&&![5,8].includes(Number(sprite.colorDepth)))return null;
 if(preview==='sprite')return Number.isInteger(sprite?.paletteIndex)?sprite.paletteIndex:null;
 if(Number.isInteger(preview)&&preview>=0)return preview;
 if(follow)return Number.isInteger(sprite?.paletteIndex)?sprite.paletteIndex:null;
 const group=sprite&&preferences.explicitGroupPaletteIndices?.[String(sprite.group)];
 if(Number.isInteger(group))return group;
 if(preferences.screenPaletteExplicit===true&&Number.isInteger(preferences.screenPaletteIndex))return preferences.screenPaletteIndex;
 return Number.isInteger(sprite?.paletteIndex)?sprite.paletteIndex:null;
}
function exposeSffPaletteReset(document){
 const quick=document.getElementById('left1'),button=document.getElementById('useSpritePalette');
 // The dedicated Palette Workshop retains its own layout and reset controls.
 if(!quick||quick.hidden||!quick.querySelector('#quickFields')||!button)return false;
 button.textContent='Cancel Palette Preview';
 button.title='Cancel the temporary palette preview. Stored colors and saved preview preferences are unchanged.';
 button.hidden=false;
 const heading=quick.querySelector('h3');if(heading)heading.after(button);else quick.prepend(button);
 return true;
}
function exposeSffPaletteFollow(document,follow,onChange){
 const reset=document.getElementById('useSpritePalette');
 if(reset?.parentElement?.id!=='left1')return false;
 const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
 label.id='followSpritePaletteControl';label.className='sff-follow-palette';input.id='followSpritePalette';input.type='checkbox';input.checked=follow!==false;text.textContent='Follow Sprite Palette';
 input.title='On: new sprite selections use their attached palettes. Off: keep the currently displayed palette preview while browsing.';
 input.onchange=()=>onChange(input.checked);label.append(input,text);reset.before(label);return true;
}
function paletteReplyMatches(message,pending,sprite){
 return Boolean(pending&&message.paletteRequestId===pending.id&&message.paletteIndex===pending.paletteIndex&&pending.spriteIndex===(sprite?.index??null));
}
module.exports={normalizePreviewPalette,effectivePreviewPalette,exposeSffPaletteReset,exposeSffPaletteFollow,paletteReplyMatches};
