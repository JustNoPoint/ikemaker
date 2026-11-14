'use strict';

// Keep the canvas and its rulers fixed while native scrollbars move the view origin.
function createCanvasScrollbars(canvas, moveView) {
  const stage = canvas.parentElement;
  function makeBar(horizontal) {
    const bar = document.createElement('div');
    const spacer = document.createElement('div');
    bar.tabIndex = 0;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', horizontal ? 'Scroll preview horizontally' : 'Scroll preview vertically');
    bar.style.cssText = horizontal
      ? 'position:absolute;z-index:2;left:0;right:16px;bottom:0;height:16px;overflow-x:scroll;overflow-y:hidden'
      : 'position:absolute;z-index:2;top:0;bottom:16px;right:0;width:16px;overflow-y:scroll;overflow-x:hidden';
    bar.append(spacer);
    bar.hidden = true;
    stage.append(bar);
    let maximumPan = 0;
    let synced = 0;
    let lastPan;
    bar.addEventListener('keydown', event => {
      if (event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const end = event.key === 'End';
      if (horizontal) bar.scrollLeft = end ? bar.scrollWidth : 0;
      else bar.scrollTop = end ? bar.scrollHeight : 0;
    });
    bar.addEventListener('scroll', () => {
      const position = horizontal ? bar.scrollLeft : bar.scrollTop;
      if (bar.hidden || position === synced) return;
      synced = position;
      moveView(horizontal, Math.round(maximumPan - position));
    });
    return function update(low, high, size, pan, leadingInset) {
      const position = horizontal ? bar.scrollLeft : bar.scrollTop;
      if (!bar.hidden && position !== synced && lastPan === pan) return;
      lastPan = pan;
      // Include the axis and current camera so selecting a different sprite never recenters it.
      const lowPan = Math.floor(Math.min(0, pan, size / 2 - 20 - high));
      maximumPan = Math.ceil(Math.max(0, pan, leadingInset - size / 2 - low));
      const range = maximumPan - lowPan;
      bar.hidden = range <= 0;
      if (bar.hidden) return;
      const length = (horizontal ? bar.clientWidth : bar.clientHeight) + range;
      if (horizontal) {
        spacer.style.height = '1px';
        spacer.style.width = length + 'px';
        bar.scrollLeft = maximumPan - pan;
        synced = bar.scrollLeft;
      } else {
        spacer.style.width = '1px';
        spacer.style.height = length + 'px';
        bar.scrollTop = maximumPan - pan;
        synced = bar.scrollTop;
      }
    };
  }
  const updateHorizontal = makeBar(true), updateVertical = makeBar(false);
  let left, right, top, bottom;
  return {
    reset() { left = right = top = bottom = 0; },
    point(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    },
    update(x, y) {
      updateHorizontal(left, right, canvas.width, x, 42);
      updateVertical(top, bottom, canvas.height, y, 26);
    }
  };
}
module.exports = { createCanvasScrollbars };
