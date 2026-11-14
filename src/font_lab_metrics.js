'use strict';
function layoutFontSample(preview,draft,measureText=()=>0,canvasWidth=900){
 const spacing=Number(draft.spacing[0])||0,lines=String(draft.sampleText).replace(/\\n/g,'\n').replace(/\t/g,'    ').split(/\r?\n/);let baseline=30+draft.height+draft.offset[1];
 return lines.map(line=>{const glyphs=Array.from(line).map(ch=>{const glyph=ch===' '?undefined:preview.glyphs?.[ch.codePointAt(0)];const width=preview.state==='truetype'?measureText(ch):glyph?glyph.width:draft.width;return{ch,glyph,width};}).filter(g=>g.width+spacing>0);const width=glyphs.reduce((sum,g)=>sum+g.width,0)+Math.max(0,glyphs.length-1)*spacing;let x=(draft.align===0?(canvasWidth-width)/2:draft.align===-1?canvasWidth-20-width+1:20)+draft.offset[0];const row={width,baseline,glyphs:glyphs.map(g=>{const placement={...g,x:x-(g.glyph?.axisX||0),y:preview.state==='bitmap'?baseline-draft.height+1-(g.glyph?.axisY||0):baseline};x+=g.width+spacing;return placement;})};baseline+=draft.height+draft.spacing[1];return row;});
}
module.exports={layoutFontSample};
