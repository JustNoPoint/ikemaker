'use strict';

// IKEMEN places the first cell at [Select Info] pos. Its artwork can extend
// outside cell.size, particularly on grids with irregular offsets and spacing.
function selectCellPosition(column, row, origin, size, spacing, rules) {
  let step = spacing, offset = [0, 0];
  for (const rule of rules || []) {
    if (rule.column !== '*' && rule.column !== column || rule.row !== '*' && rule.row !== row) continue;
    const pair = rule.value.split(',').map(Number);
    if (rule.property === 'spacing') step = [pair[0], pair[1] ?? pair[0]];
    if (rule.property === 'offset') offset = [pair[0] || 0, pair[1] || 0];
  }
  return [origin[0] + column * (size[0] + step[0]) + offset[0],
          origin[1] + row * (size[1] + step[1]) + offset[1]];
}

function gridElement(base) {
  return /^(?:cell\.(?:bg|random)|portrait(?:\.loading)?|p[1-8]\.cursor\.(?:active|done))$/.test(base);
}

// The character-pick screen shows its normal phase until an author selects a
// phase-specific element in the browser.
function selectPhaseVisible(item, chosen) {
  if (chosen) return true;
  return !/^(?:title\.|stage(?:\.|$)|record(?:\.|$)|cell\.|p[1-8]\.(?:teammenu|palmenu|face2)(?:\.|$)|p[1-8]\.face\.)/.test(item.base);
}

function selectSampleText(item, screen, fighters) {
  if (item.base === 'title') return screen.elements.find(entry=>entry.base==='title.arcade')?.text || 'Arcade';
  const slot=/^p([1-8])\.name$/.exec(item.base);
  if(slot) return fighters?.[Number(slot[1])-1] || 'Player '+slot[1];
  if(item.base.startsWith('stage')&&item.font) return 'Stage 1';
  if(item.base==='record') return '0';
  if(item.base.includes('.teammenu.item')) return 'Single';
  if(item.base.endsWith('.palmenu.number')) return '1';
  return null;
}

function selectLayoutClientScript() {
  return `${selectCellPosition.toString()}
  ${gridElement.toString()}
  ${selectPhaseVisible.toString()}
  ${selectSampleText.toString()}
  drawSelectGrid = function() {
    const g = model.selectGrid, screen = current(), entries = screen.elements;
    const rows = Math.max(1, gridValue('gridRows', g.rows)), columns = Math.max(1, gridValue('gridColumns', g.columns));
    const origin = [gridValue('gridX', g.position[0]), gridValue('gridY', g.position[1])];
    const size = [gridValue('cellW', g.cellSize[0]), gridValue('cellH', g.cellSize[1])];
    const spacing = [gridValue('spaceX', g.spacing[0]), gridValue('spaceY', g.spacing[1])];
    const cells = roster?.cells || [], skipped = new Set((g.skippedCells || []).map(pair => pair.join(',')));
    function component(base) {
      const index = entries.findIndex(item => item.base === base);
      if (index < 0 || previewHidden.has(elementStateKey(screenIndex,index)) || visible[entries[index].layer] === false) return null;
      return {item:entries[index], offset: overrides[screenIndex + ':' + index] || entries[index].position};
    }
    function drawArt(part,x,y) {
      if (!part) return;
      const {item,offset} = part;
      const action = item.animation !== null && (globalThis.ikemenScreenpackActionFrame?.(item.animation,screenIndex) || motifFrameAt(data.animations[item.animation],motifClock.tick()) || data.animations[item.animation]);
      const sprite = action?.sprite || item.sprite, key = sprite?.join(','), image = key && images[key], info = key && data.spriteInfo[key];
      if (!image?.naturalWidth || !info) return;
      ctx.save();ctx.translate(x + offset[0],y + offset[1]);ctx.scale(item.scale[0]*item.facing,item.scale[1]*item.verticalFacing);
      ctx.drawImage(image,(action?.offset?.[0] || 0)-info.axisX,(action?.offset?.[1] || 0)-info.axisY);ctx.restore();
    }
    const bg = component('cell.bg'), random = component('cell.random'), portrait = component('portrait');
    const pendingCursors = [];
    let at = 0;
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const [x,y]=selectCellPosition(col,row,origin,size,spacing,g.cellOverrides);
      if(skipped.has(col+','+row))continue;
      const index=at++,cell=cells[index],image=rosterImages[index],hidden=Number(cell?.hidden)||0;
      if(g.showEmptyBoxes || cell && (hidden===0||hidden===3))drawArt(bg,x,y);
      if(cell && (hidden===3 || /^(randomselect|random)$/i.test(cell.name)))drawArt(random,x,y);
      else if(cell && !hidden && image?.naturalWidth && (!entries.some(item=>item.base==='portrait')||portrait)){
        const p=cell.portrait,o=portrait?.offset||roster.portraitSpec.offset;
        ctx.drawImage(image,x+o[0]-p.axisX,y+o[1]-p.axisY,p.width,p.height);
      }
      if(guides){ctx.save();ctx.strokeStyle='rgba(69,212,212,.5)';ctx.strokeRect(x,y,size[0],size[1]);ctx.restore()}
      for(const [slot,pair] of (roster?.cursorCells||[]).entries())if(pair[0]===col&&pair[1]===row)pendingCursors.push([component('p'+(slot+1)+'.cursor.active'),x,y]);
    }
    for(const cursor of pendingCursors)drawArt(...cursor);
  };
  `;
}
module.exports={selectCellPosition,gridElement,selectPhaseVisible,selectSampleText,selectLayoutClientScript};
