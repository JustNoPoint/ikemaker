'use strict';

const imageTemplateLayout = require('./palette_image_template_layout');
const { encodeRgbaPng } = require('./palette_collective_model');

function canvasColor(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value || ''));
  if (!match) throw new Error('Template canvas background must be an exact six-digit RGB color.');
  const number = Number.parseInt(match[1], 16);
  return [(number >>> 16) & 255, (number >>> 8) & 255, number & 255, 255];
}

function paintLine(rgba,width,height,line) { const color=String(line.colorId||'0,0,0,255').split(',').map(Number),thickness=Math.max(1,Math.min(32,Math.trunc(Number(line.thickness)||1)));let x0=Math.round(Number(line.x1)||0),y0=Math.round(Number(line.y1)||0),x1=Math.round(Number(line.x2)||0),y1=Math.round(Number(line.y2)||0),dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,error=dx+dy;for(;;){const radius=Math.floor(thickness/2);for(let py=y0-radius;py<y0-radius+thickness;py++)for(let px=x0-radius;px<x0-radius+thickness;px++)if(px>=0&&py>=0&&px<width&&py<height){const at=(py*width+px)*4;rgba[at]=color[0]||0;rgba[at+1]=color[1]||0;rgba[at+2]=color[2]||0;rgba[at+3]=Number.isFinite(color[3])?color[3]:255}if(x0===x1&&y0===y1)break;const twice=2*error;if(twice>=dy){error+=dy;x0+=sx}if(twice<=dx){error+=dx;y0+=sy}} }

function compose(layout, prepared, background = '#222222', decorations = {}) {
  const width = Number(layout?.canvas?.width), height = Number(layout?.canvas?.height);
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1 || width * height > imageTemplateLayout.MAX_PIXELS) throw new Error('The reviewed template sheet dimensions are invalid or exceed the 256-million-pixel limit.');
  const color = canvasColor(background), rgba = Buffer.alloc(width * height * 4);
  for (let at = 0; at < rgba.length; at += 4) rgba.set(color, at);
  const byId = new Map((prepared || []).map(item => [String(item.image?.imageId || item.imageId || ''), item.sprite || item]));
  for (const item of layout.items || []) {
    const sprite = byId.get(String(item.imageId || ''));
    if (!sprite || sprite.width !== item.width || sprite.height !== item.height || !Buffer.isBuffer(sprite.rgba) || sprite.rgba.length !== item.width * item.height * 4) throw new Error('The arranged template no longer matches its exact prepared sprite images. Repack and review it again.');
    if (!Number.isSafeInteger(item.x) || !Number.isSafeInteger(item.y) || item.x < 0 || item.y < 0 || item.x + item.width > width || item.y + item.height > height) throw new Error('An arranged template image is outside the reviewed canvas.');
    for (let y = 0; y < item.height; y++) for (let x = 0; x < item.width; x++) {
      const sourceAt = (y * item.width + x) * 4, alpha = sprite.rgba[sourceAt + 3];
      if (!alpha) continue;
      const targetAt = ((item.y + y) * width + item.x + x) * 4, inverse = 255 - alpha;
      rgba[targetAt] = Math.round((sprite.rgba[sourceAt] * alpha + rgba[targetAt] * inverse) / 255);
      rgba[targetAt + 1] = Math.round((sprite.rgba[sourceAt + 1] * alpha + rgba[targetAt + 1] * inverse) / 255);
      rgba[targetAt + 2] = Math.round((sprite.rgba[sourceAt + 2] * alpha + rgba[targetAt + 2] * inverse) / 255);
      rgba[targetAt + 3] = 255;
    }
  }
  for(const line of decorations.lines||[])paintLine(rgba,width,height,line);
  return encodeRgbaPng(width, height, rgba);
}

module.exports = { canvasColor, paintLine, compose };
