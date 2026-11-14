'use strict';

// Pure planner shared by the desktop command and the standalone web bundle.
// The web entry copies this function verbatim because its host only shims vscode.
function planTriggerFillDown(controllers, selections) {
  const byLine = new Map();
  const selected = (selections || []).filter(selection => !selection.isEmpty);
  const includes = (selection, line) => line >= selection.start.line &&
    (line < selection.end.line || line === selection.end.line && selection.end.character > 0);
  for (const selection of selected) {
    for (const {rows} of controllers) {
      let group = 1;
      for (const row of rows) {
        if (!includes(selection, row.line)) continue;
        if (row.number !== 1) {
          group = row.number;
        } else if (group !== 1) {
          const change = {line:row.line,start:row.start+7,length:row.length-7,text:String(group)};
          const prior = byLine.get(row.line);
          if (prior && prior.text !== change.text) return {changes:[],conflict:true};
          byLine.set(row.line, change);
        }
      }
    }
  }
  return {changes:[...byLine.values()],conflict:false};
}

module.exports = {planTriggerFillDown};
