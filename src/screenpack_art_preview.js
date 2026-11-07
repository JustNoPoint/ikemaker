'use strict';

// Kept independent of the workspace so the native motif compositor can be
// exercised against real archives without creating a VS Code panel.
function drawScreenBackgrounds(ctx, screen, images, spriteInfo, animations, width, height, layer, tick = 0) {
  for (const item of screen.backgrounds || []) {
    if (item.layer !== layer || item.type === 'dummy') continue;
    const action = item.action !== null && animations[item.action];
    let frame = action;
    if (action?.frames?.length) {
      let remaining = tick;
      const frames = action.frames, loop = Math.max(0, action.loopStart || 0);
      const duration = frames.reduce((sum, value) => sum + Math.max(1, value.time), 0);
      if (!frames.some(value => value.time < 0) && remaining >= duration) {
        const lead = frames.slice(0, loop).reduce((sum, value) => sum + Math.max(1, value.time), 0);
        remaining = lead + (remaining - lead) % Math.max(1, duration - lead);
      }
      frame = frames[frames.length - 1];
      for (const value of frames) { frame = value; if (value.time < 0 || remaining < Math.max(1, value.time)) break; remaining -= Math.max(1, value.time); }
    }
    const sprite = item.sprite || frame?.sprite, key = sprite?.join(','), image = images[key], info = spriteInfo[key];
    if (!image?.complete || !info || image.naturalWidth === 0) continue;
    const scale = item.scaleStart || [1, 1], sw = info.width * scale[0], sh = info.height * scale[1];
    if (sw <= 0 || sh <= 0) continue;
    const originX = width / 2 + item.start[0] + item.velocity[0] * tick + (frame?.offset?.[0] || 0) - info.axisX * scale[0];
    const originY = item.start[1] + item.velocity[1] * tick + (frame?.offset?.[1] || 0) - info.axisY * scale[1];
    const stepX = Math.max(1, sw + item.tileSpacing[0]), stepY = Math.max(1, sh + item.tileSpacing[1]);
    const tileX = item.tile[0] !== 0, tileY = item.tile[1] !== 0;
    const x0 = tileX ? originX - Math.ceil(originX / stepX) * stepX : originX;
    const y0 = tileY ? originY - Math.ceil(originY / stepY) * stepY : originY;
    ctx.save();
    if (item.window) { ctx.beginPath(); ctx.rect(item.window[0], item.window[1], item.window[2] - item.window[0] + 1, item.window[3] - item.window[1] + 1); ctx.clip(); }
    if (item.trans === 'add' || item.trans === 'add1') ctx.globalCompositeOperation = 'lighter';
    else if (item.trans === 'sub') ctx.globalCompositeOperation = 'difference';
    if (item.trans === 'add' || item.trans === 'alpha') ctx.globalAlpha = Math.max(0, Math.min(1, item.alpha[0] / 256));
    ctx.imageSmoothingEnabled = false;
    let drawn = 0;
    for (let y = y0; y < (tileY ? height : y0 + 1); y += stepY) {
      for (let x = x0; x < (tileX ? width : x0 + 1); x += stepX) { ctx.drawImage(image, x, y, sw, sh); if (++drawn >= 4096) break; }
      if (drawn >= 4096) break;
    }
    ctx.restore();
  }
}

function backgroundClientScript() { return drawScreenBackgrounds.toString(); }
module.exports = { drawScreenBackgrounds, backgroundClientScript };
