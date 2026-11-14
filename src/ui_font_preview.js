'use strict';
const {inspectFont,resolveFont}=require('./font_assets');
function loadFontPreview(reference,motif,root,options={}){try{const filename=resolveFont(reference,motif,root);if(!filename)return {state:'approximate',reason:'Font file unavailable'};return inspectFont(filename,{root,...options});}catch(error){return {state:'approximate',reason:error.message||'Font could not be decoded'};}}
module.exports={loadFontPreview};
