'use strict';

// Preview positions belong to this rendered Stage generation. A session starts
// at its restored draft, so undo never crosses into another stage or source edit.
function createPreviewHistory(positions) {
  let baseline = positions.map(pair => [...pair]);
  const undo = [], redo = [];
  function record(current) {
    const changes = [];
    current.forEach(([x,y], index) => {
      const before = baseline[index];
      if (before[0] !== x || before[1] !== y) {
        changes.push({index,before,after:[x,y]});
        baseline[index] = [x,y];
      }
    });
    if (!changes.length) return false;
    undo.push(changes);
    if (undo.length > 64) undo.shift();
    redo.length = 0;
    return true;
  }
  function step(current, forward) {
    const from = forward ? redo : undo, to = forward ? undo : redo;
    const changes = from.pop();
    if (!changes) return false;
    for (const change of changes) {
      const next = forward ? change.after : change.before;
      current[change.index] = [...next];
      baseline[change.index] = [...next];
    }
    to.push(changes);
    return true;
  }
  return {record,step,canUndo:()=>undo.length>0,canRedo:()=>redo.length>0};
}

module.exports = {createPreviewHistory};
