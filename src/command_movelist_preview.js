'use strict';
const fs = require('fs');
const {parseDef, sections, value, unquote} = require('./def_model');
const {loadFontPreview} = require('./ui_font_preview');

// Mirrors menu.f_commandlistRender: the tab count selects an anchor, not a tab stop.
function movelistColumns(line) {
  return Array.from(String(line).replace(/\s+$/, '').matchAll(/(\t*)([^\t]+)/g), match => ({
    align: match[1].length === 0 ? 1 : match[1].length === 1 ? 0 : -1, text: match[2]
  }));
}
function readMovelistPreview(catalog) {
  if (!catalog?.motif) return {state:'unresolved', reason:'Choose a game folder to resolve the displayed movelist font.'};
  try {
    const doc = parseDef(fs.readFileSync(catalog.motif,'utf8'));
    const base = catalog.baseFile && fs.existsSync(catalog.baseFile) ? parseDef(fs.readFileSync(catalog.baseFile,'utf8')) : null;
    const findSection = document => sections(document,'Pause Menu')[0] || sections(document,'Menu Info')[0] || sections(document,'menu_info')[0];
    const section = findSection(doc), fallback = base && findSection(base);
    const get = (key, defaultValue) => value(section,key,value(fallback,key,defaultValue));
    const numbers = (key, defaults) => {const inherited=value(fallback,key,defaults.join(',')).split(','),parts=get(key,defaults.join(',')).split(',');return defaults.map((n,index)=>{const raw=parts[index]?.trim()||inherited[index]?.trim();return raw!==undefined&&Number.isFinite(Number(raw))?Number(raw):n})};
    const defaultFont=['Open_Sans.def','0','1','255','255','255','255','-1'], inheritedFont=value(fallback,'movelist.text.font',defaultFont.join(',')).split(','), declaredFont=get('movelist.text.font',defaultFont.join(',')).split(',');
    const font=defaultFont.map((part,index)=>unquote(declaredFont[index]?.trim()||inheritedFont[index]?.trim()||part));
    const files = sections(doc,'files')[0], baseFiles = base && sections(base,'files')[0];
    const reference = /^\d+$/.test(font[0]) ? unquote(value(files,'font'+font[0],value(baseFiles,'font'+font[0],''))) : font[0];
    const height=Number(font[7])||-1;
    const asset = loadFontPreview(reference,catalog.motif,catalog.root,{bank:Number(font[1]),height});
    return {state:'resolved', motif:catalog.motif, root:catalog.root, reference, fontFile:asset.filename||'', font:asset, bank:Number(font[1])||0, slot:font[0], height,
      color:font.slice(3,6).map(v=>Math.max(0,Math.min(255,Number(v)||0))), scale:numbers('movelist.text.scale',[.4,.4]), spacing:numbers('movelist.text.spacing',[1,1]),
      glyphScale:numbers('movelist.glyphs.scale',[1,1]), glyphOffset:numbers('movelist.glyphs.offset',[0,2]), glyphSpacing:numbers('movelist.glyphs.spacing',[2,0]),
      width:Math.max(1,Number(get('movelist.window.width','300'))||300), visibleItems:Math.max(1,Number(get('movelist.window.visibleitems','18'))||18), margins:numbers('movelist.window.margins.y',[20,1])};
  } catch(error) {return {state:'unresolved',reason:error.message};}
}
function previewClientScript() {
 return `(${movelistPreviewClient.toString()})(${movelistColumns.toString()},${engineMovelistSegments.toString()});`;
}
// Display parsing intentionally differs from the conservative editing tokenizer.
function engineMovelistSegments(source,tokens) {
 const sorted=[...tokens].filter(Boolean).sort((a,b)=>b.length-a.length), parts=[];let text='';
 const flush=()=>{if(text){parts.push({kind:'text',raw:text});text=''}};
 for(let i=0;i<source.length;){
  const tag=source.slice(i).match(/^<([^<>\s]+)>/);
  if(tag){flush();const body=tag[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');if(/^#[A-Za-z0-9]+$/.test(body)){const values=[0,1,2].map(n=>{const pair=body.slice(1+n*2,3+n*2);return /^[0-9a-f]{1,2}$/i.test(pair)?parseInt(pair,16):255});parts.push({kind:'color-open',color:'rgb('+values.join(',')+')'})}else if(body==='/')parts.push({kind:'color-close'});else if(body!=='#')parts.push({kind:'glyph',token:body,raw:body});i+=tag[0].length;continue}
  const token=source[i-1]!=='<'&&sorted.find(t=>source.startsWith(t,i));
  if(token){flush();parts.push({kind:'glyph',token,raw:token});i+=token.length}else{text+=source[i++]} 
 }
 flush();return parts;
}
function movelistPreviewClient(columns,engineSegments) {
 const model=data.movelistRender||{}, root=byId('movelistPreview');
 if(!root||!data.movelistRender)return;
 const original=previewMovelist; let first=0;
 const images=new Map();
 const imageFor=src=>{if(!images.has(src)){const image=new Image(); image.onload=()=>draw();image.src=src;images.set(src,image)}return images.get(src)};
 root.setAttribute('role','region'); root.setAttribute('aria-label','Displayed movelist game preview');
 function draw(){
  const font=model.font||{}, size=[...(font.size||[8,27])], fs=font.spacing||[0,0], offset=font.offset||[0,0], scale=model.scale||[.4,.4];if(font.state==='truetype'&&model.height>0)size[1]=model.height;
  const width=model.width||300, step=Math.max(1,Math.round((size[1]+fs[1])*scale[1]+(model.spacing||[1,1])[1])), visible=model.visibleItems||18;
  const lines=lineRecords(movelistDraft);first=Math.min(first,Math.max(0,lines.length-visible));
  const top=Math.max(size[1]*scale[1],(model.margins||[20,1])[0]), height=top+step*(visible-1)+(model.margins||[20,1])[1]+Math.max(0,(model.glyphOffset||[0,2])[1]);
  const fit=Math.min(2,Math.max(.1,((root.clientWidth||width)-16)/width));
  if(!root.querySelector('canvas'))root.innerHTML='<div class="movelist-render-tools"><button type="button" data-preview-up aria-label="Scroll movelist preview up">▲</button><span>Lines '+(first+1)+'–'+Math.min(lines.length,first+visible)+' of '+lines.length+'</span><button type="button" data-preview-down aria-label="Scroll movelist preview down">▼</button><button type="button" data-preview-font>Font Lab</button></div><canvas aria-label="Current displayed movelist draft" role="img"></canvas><p class="muted movelist-render-note"></p>';
  root.querySelector('.movelist-render-tools span').textContent='Lines '+(first+1)+'–'+Math.min(lines.length,first+visible)+' of '+lines.length;
  const canvas=root.querySelector('canvas');if(!canvas||typeof canvas.getContext!=='function')return;const context=canvas.getContext('2d');if(!context)return;const pixels=fit*(globalThis.devicePixelRatio||1);canvas.width=Math.ceil(width*pixels);canvas.height=Math.ceil(height*pixels);context.setTransform(pixels,0,0,pixels,0,0);canvas.style.width=width*fit+'px';canvas.style.height=height*fit+'px';canvas.style.imageRendering='pixelated';context.imageSmoothingEnabled=false;
  context.fillStyle='#10131b';context.fillRect(0,0,width,height);context.save();context.beginPath();context.rect(0,0,width,height);context.clip();
  const fontName='ikemenMovelistDraft';context.font=(size[1]*scale[1])+'px '+(font.state==='truetype'?fontName:'monospace');context.textBaseline='alphabetic';
  function textWidth(text){if(font.state!=='bitmap')return context.measureText(text).width*scale[0]/scale[1];const chars=Array.from(text);return chars.reduce((sum,char,index)=>{const w=(font.glyphs||{})[char.codePointAt(0)]?.width||size[0];return sum+(w+fs[0]>0?w+(index<chars.length-1?fs[0]:0):0)},0)*scale[0]}
  function paintText(text,x,y,color){context.fillStyle=color;if(font.state!=='bitmap'){context.save();context.translate(x+offset[0]*scale[0],y+offset[1]*scale[1]);context.scale(scale[0]/scale[1],1);context.fillText(text,0,0);context.restore();return}for(const char of text){const glyph=(font.glyphs||{})[char.codePointAt(0)];if(glyph){const image=imageFor(glyph.src);if(image.complete&&image.naturalWidth){const tint=document.createElement('canvas');tint.width=glyph.width;tint.height=glyph.height;const tc=tint.getContext('2d');tc.drawImage(image,0,0);tc.globalCompositeOperation='multiply';tc.fillStyle=color;tc.fillRect(0,0,glyph.width,glyph.height);tc.globalCompositeOperation='destination-in';tc.drawImage(image,0,0);context.drawImage(tint,x+(offset[0]-(glyph.axisX||0))*scale[0],y+(offset[1]-size[1]+1-(glyph.axisY||0))*scale[1],glyph.width*scale[0],glyph.height*scale[1])}}const advance=(glyph?.width||size[0])+fs[0];if(advance>0)x+=advance*scale[0]}}
  let currentColor='rgb('+(model.color||[255,255,255]).join(',')+')';
  // Color state survives line boundaries, as it does in the Lua parser.
  for(let n=0;n<Math.min(lines.length,first+visible+2);n++){
   let lastAlign=1,length=0,previousWidth=0;
   for(const column of columns(lines[n].body)){
    if(column.align!==lastAlign){length=0;lastAlign=column.align}
    const parts=[];for(const part of engineSegments(column.text,glyphTokens)){if(part.kind==='color-open'){currentColor=part.color||currentColor;continue}if(part.kind==='color-close'){currentColor='rgb('+(model.color||[255,255,255]).join(',')+')';continue}parts.push({...part,renderColor:part.color||currentColor})}if(column.align===-1)parts.reverse();
    for(const part of parts){
     const glyph=part.kind==='glyph'?glyphByToken.get(part.token):null;
     if(glyph&&!glyph.src){length+=column.align===0?previousWidth*.5:column.align===-1?-previousWidth:previousWidth;continue}
     const gs=model.glyphScale||[1,1],go=model.glyphOffset||[0,2], ratio=glyph?size[1]*scale[1]/Math.max(1,glyph.height):1;
     const w=glyph?glyph.width*ratio*gs[0]:textWidth(part.raw), anchor=column.align===0?width*.5:column.align===-1?width:0;
     const centered=column.align===0&&!glyph;
     const x=Math.floor(anchor+length-(centered?w*.5:column.align===-1?w:0))+(column.align===-1&&!glyph?1:0),y=top+(n-first)*step;
     if(n>=first){if(glyph?.src){const image=imageFor(glyph.src);if(image.complete&&image.naturalWidth)context.drawImage(image,x+go[0]-(glyph.axisX||0)*ratio*gs[0],y+go[1]-(glyph.axisY||0)*ratio*gs[1],w,glyph.height*ratio*gs[1])}else paintText(part.raw,x,y,part.renderColor)}
     const advance=w+(glyph?(model.glyphSpacing||[2,0])[0]:(model.spacing||[1,1])[0]);previousWidth=advance;length+=column.align===0?advance*.5:column.align===-1?-advance:advance;
    }
   }
  }
  context.restore();
  root.querySelector('[data-preview-up]').disabled=first===0;root.querySelector('[data-preview-down]').disabled=first>=lines.length-visible;
  root.querySelector('[data-preview-up]').onclick=()=>{first=Math.max(0,first-1);draw()};root.querySelector('[data-preview-down]').onclick=()=>{first=Math.min(Math.max(0,lines.length-visible),first+1);draw()};
  const fontButton=root.querySelector('[data-preview-font]');fontButton.disabled=!model.motif;fontButton.onclick=()=>vscode.postMessage({type:'openMovelistFontLab',sampleText:movelistDraft});
  root.querySelector('.movelist-render-note').textContent=font.state==='approximate'||!font.state?'Font approximation: '+(font.reason||model.reason||'font unavailable'):width+' game units · '+font.state+' font · bank '+(model.bank||0)+(font.state==='truetype'?' · browser rasterization approximation':'')+' · glyph sampling and color rounding may vary from the engine';
  if(font.state==='truetype'&&font.data&&!globalThis.ikemenMovelistFontLoaded&&!globalThis.ikemenMovelistFontLoading){globalThis.ikemenMovelistFontLoading=true;const bytes=Uint8Array.from(atob(font.data),char=>char.charCodeAt(0));new FontFace(fontName,bytes.buffer).load().then(face=>{document.fonts.add(face);globalThis.ikemenMovelistFontLoaded=true;globalThis.ikemenMovelistFontLoading=false;draw()}).catch(()=>{globalThis.ikemenMovelistFontLoading=false})}
 }
 previewMovelist=function(focus){original(focus);draw()};
 if(typeof ResizeObserver==='function')new ResizeObserver(()=>draw()).observe(root);
 root.addEventListener('wheel',event=>{const limit=lineRecords(movelistDraft).length-(model.visibleItems||18);if((event.deltaY>0&&first<limit)||(event.deltaY<0&&first>0)){event.preventDefault();first+=Math.sign(event.deltaY);draw()}},{passive:false});
 draw();
}
module.exports={movelistColumns,engineMovelistSegments,readMovelistPreview,previewClientScript};
