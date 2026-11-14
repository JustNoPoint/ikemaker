'use strict';

async function reviewReplacementRegistration(api, sprite, source) {
  if (sprite.width === source.width && sprite.height === source.height) return {axisX:sprite.axisX,axisY:sprite.axisY};
  const bottom = {axisX:sprite.axisX + Math.floor(source.width/2) - Math.floor(sprite.width/2),axisY:sprite.axisY + source.height - sprite.height};
  const inRange = Object.values(bottom).every(value=>Number.isSafeInteger(value)&&value>=-32768&&value<=32767);
  const picked = await api.window.showQuickPick([
    {label:'Keep existing axis numbers',description:`${source.width}×${source.height}, axis ${sprite.axisX}, ${sprite.axisY}; padding changes may move the artwork.`,value:{axisX:sprite.axisX,axisY:sprite.axisY}},
    ...(inRange?[{label:'Preserve bottom-center offset',description:`${source.width}×${source.height}, proposed axis ${bottom.axisX}, ${bottom.axisY}; preserves the axis offset from the image bottom center.`,value:bottom}]:[])
  ], {title:`Replacement size changed: ${sprite.width}×${sprite.height} → ${source.width}×${source.height}`,placeHolder:`Sprite ${sprite.group},${sprite.number}: current axis ${sprite.axisX}, ${sprite.axisY}. Review registration; Escape cancels the replacement.`});
  return picked?.value || null;
}
module.exports={reviewReplacementRegistration};
