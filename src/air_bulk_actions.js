'use strict';
const { actionSourceRanges, parseAir } = require('./air_preview_model');
const MAX_BYTES = 8 * 1024 * 1024;
function exactRanges(text, numbers) {
  if (!Array.isArray(numbers) || !numbers.length || numbers.length > 4096 || numbers.some(number => !Number.isSafeInteger(number))) {
    throw Error('Choose between 1 and 4096 exact AIR Actions.');
  }
  const wanted = new Set(numbers);
  const ranges = actionSourceRanges(text).filter(range => wanted.has(range.number));
  const actions = new Map(parseAir(text).map(action => [action.number, action]));
  const found = new Set();
  for (const range of ranges) {
    if (found.has(range.number)) throw Error('Action ' + range.number + ' is duplicated. Resolve its ID in AIR Source first.');
    found.add(range.number);
    const action = actions.get(range.number);
    if (!action || action.readOnly || Number.isInteger(action.copyAction) || action.fallthroughAction !== undefined || !action.frames.length) {
      throw Error('Action ' + range.number + ' is inherited or has no authored elements. Materialize the Action in AIR Source before importing or exporting it.');
    }
  }
  for (const number of wanted) {
    if (!found.has(number)) throw Error('Action ' + number + ' is missing. Refresh the selection.');
  }
  return ranges;
}
function joinActions(ranges, eol) {
  return ranges.map(item => item.text.replace(/[\r\n]+$/, '').replace(/\r\n|\n/g, eol)).join(eol + eol) + eol;
}
function exportActions(text, numbers) {
  return joinActions(exactRanges(text, numbers), text.includes('\r\n') ? '\r\n' : '\n');
}
function importActionsPatch(text, incoming, numbers) {
  if (Buffer.byteLength(incoming, 'utf8') > MAX_BYTES) throw Error('The AIR import exceeds 8 MB.');
  const existing = new Set(actionSourceRanges(text).map(item => item.number));
  const ranges = exactRanges(incoming, numbers);
  const conflicts = ranges.filter(item => existing.has(item.number));
  if (conflicts.length) throw Error('Action IDs already exist: ' + conflicts.map(item => item.number).join(', ') + '. Remove those IDs from the selection.');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const gap = text.length ? (text.endsWith('\n') ? eol : eol + eol) : '';
  return { start: text.length, end: text.length, text: gap + joinActions(ranges, eol) };
}
async function handle(env) {
  const { session, message, vscode, fs } = env, document = await vscode.workspace.openTextDocument(session.airPath), baseline = env.actionMutationBaseline(document);
  if (message.type === 'bulkExportActions') {
    const contents = exportActions(baseline.text, message.actions || []), target = await vscode.window.showSaveDialog({ title: 'Export selected AIR Actions', filters: { AIR: ['air'] } });
    if (!target) return;
    env.requireActionMutationBaseline(await vscode.workspace.openTextDocument(session.airPath), baseline);
    if (require('path').resolve(target.fsPath).toLowerCase() === require('path').resolve(session.airPath).toLowerCase()) throw Error('Choose a separate AIR export file.');
    const samePath = value => require('path').resolve(value).toLowerCase() === require('path').resolve(target.fsPath).toLowerCase();
    if ((vscode.workspace.textDocuments || []).some(doc => doc.isDirty && samePath(doc.fileName))) throw Error('The export destination has unsaved edits. Save or revert that document, or choose a new destination.');
    const exists = fs.existsSync(target.fsPath), safety = require('./mutation_safety');
    if (exists && fs.statSync(target.fsPath).size > MAX_BYTES) throw Error('The export destination exceeds 8 MB. Choose a new destination.');
    const expectedHash = safety.hash(exists ? fs.readFileSync(target.fsPath) : Buffer.alloc(0));
    if (exists) {
      const answer = await vscode.window.showWarningMessage('Replace the existing AIR export?', { modal: true, detail: target.fsPath + '\nOnly the selected Actions will be written to this separate file.' }, 'Replace Export');
      if (answer !== 'Replace Export') return;
      env.requireActionMutationBaseline(await vscode.workspace.openTextDocument(session.airPath), baseline);
      if ((vscode.workspace.textDocuments || []).some(doc => doc.isDirty && samePath(doc.fileName))) throw Error('The export destination now has unsaved edits. Nothing was written.');
    }
    (env.transactionalWrite || safety.transactionalWrite)(fs, target.fsPath, contents, { label: 'export-air-actions', allowExisting: exists, expectedHash });
    await vscode.window.showInformationMessage('Exported ' + message.actions.length + ' AIR Actions.'); return;
  }
  const cancel = () => session.panel.webview.postMessage({
    type: 'actionMutationCancelled', actionRequestId: message.actionRequestId
  });
  const picked = await vscode.window.showOpenDialog({
    title: 'Import AIR Actions', canSelectFiles: true, canSelectMany: false, filters: { AIR: ['air'] }
  });
  if (!picked?.length) return cancel();
  if (fs.statSync(picked[0].fsPath).size > MAX_BYTES) throw Error('The AIR import exceeds 8 MB.');
  const incoming = fs.readFileSync(picked[0].fsPath, 'utf8').replace(/^\uFEFF/, '');
  const existing = new Set(actionSourceRanges(baseline.text).map(item => item.number));
  const choices = actionSourceRanges(incoming).map(({ number }) => ({
    label: 'Action ' + number, number, picked: !existing.has(number),
    description: existing.has(number) ? 'ID already in use' : undefined
  }));
  const chosen = await vscode.window.showQuickPick(choices, {
    title: 'Choose AIR Actions to import', canPickMany: true,
    placeHolder: 'Unused IDs are selected. Existing actions are kept.'
  });
  if (!chosen?.length) return cancel();
  const conflicts = chosen.filter(item => existing.has(item.number));
  const numbers = chosen.filter(item => !existing.has(item.number)).map(item => item.number);
  if (!numbers.length) {
    await vscode.window.showInformationMessage('All selected IDs already exist in this AIR.');
    return cancel();
  }
  if (conflicts.length) {
    const skipped = await vscode.window.showWarningMessage('Skip existing Action IDs?', {
      modal: true, detail: 'Keep existing Actions ' + conflicts.map(item => item.number).join(', ') +
        ' and continue with ' + numbers.length + ' unused IDs.'
    }, 'Skip Existing IDs');
    if (skipped !== 'Skip Existing IDs') return cancel();
  }
  const patch = importActionsPatch(baseline.text, incoming, numbers);
  const actionSet = new Set(numbers);
  const missing = new Set();
  for (const action of parseAir(incoming)) {
    if (!actionSet.has(action.number) || !session.byKey) continue;
    for (const frame of action.frames) {
      const key = frame.group + ',' + frame.index;
      if (frame.group >= 0 && frame.index >= 0 && !session.byKey.has(key)) missing.add(key);
    }
  }
  const spriteReview = !session.sffPath || !session.byKey ? 'No attached SFF is available to check sprite IDs.'
    : missing.size ? 'Missing in ' + session.sffPath + ': ' + [...missing].slice(0,32).join(' · ') +
      (missing.size > 32 ? ' (+' + (missing.size - 32) + ' more)' : '') + '. Those frames will need sprites.'
    : 'All referenced sprites were found in ' + session.sffPath + '.';
  const answer = await vscode.window.showWarningMessage('Import ' + numbers.length + ' AIR Actions?', {
    modal: true, detail: 'Action IDs: ' + numbers.join(', ') + '\n' + spriteReview +
      '\n\nImport copies AIR text only. Use AIR Quick Transfer to include sprites. One Undo removes the import.'
  }, 'Import Actions');
  if (answer !== 'Import Actions') return cancel();
  const current = await vscode.workspace.openTextDocument(session.airPath);
  env.requireActionMutationBaseline(current, baseline);
  await env.applyActionMutation(session, current, [patch], {
    actionRequestId: message.actionRequestId, action: numbers[0], status: 'Imported ' + numbers.length + ' AIR Actions.'
  });
  await env.autoSaveAirDocument(session, current);
}
function install(page) {
  return page.replace('</script></body>', `(()=>{
    const tools=document.getElementById('newAction')?.parentElement,standalone=model.sourceKind!=='stage';
    for(const [id,label] of [['bulkImportActions','Import AIR Actions…'],['bulkExportActions','Export Selected Actions…']]){const button=document.createElement('button');button.id=id;button.textContent=label;tools?.append(button);button.onclick=()=>{if(id==='bulkImportActions'){if(!standalone){document.getElementById('frameEditStatus').textContent='Import Actions is available in a standalone AIR file.';return}beginActionMutation({type:id})}else{const actions=selectedActions.size?[...selectedActions]:action?[action.number]:[];if(!actions.length)return;vscode.postMessage({type:id,actions})}}}
    const split=document.createElement('button'),ticks=document.createElement('input'),label=document.createElement('label');split.id='timelineSplit';split.textContent='Split Element…';split.title='Repeat the element and its collision boxes while preserving total duration';ticks.id='timelineSplitTicks';ticks.type='number';ticks.min='1';ticks.step='1';ticks.value='1';ticks.style.width='5em';ticks.setAttribute('aria-label','Ticks before AIR element split');label.textContent='Split at tick ';label.append(ticks);document.getElementById('timelineDuplicate')?.after(label,split);
    split.onclick=()=>{if(!navigationAllowed())return;const frame=current();if(!frame||frame.rawTime<2||!Number.isInteger(Number(ticks.value))||Number(ticks.value)<1||Number(ticks.value)>=frame.rawTime){document.getElementById('timelineStatus').textContent='Choose a split tick from 1 to '+Math.max(0,(frame?.rawTime||0)-1)+' within an element lasting at least two finite ticks.';return}beginActionMutation({type:'splitElement',action:action.number,frameIndex,firstTicks:Number(ticks.value)})};
    function syncBulkControls(){const readOnly=model.transfer?.role==='source',busy=actionMutationBusy;document.getElementById('bulkImportActions').disabled=!standalone||readOnly||busy;document.getElementById('bulkExportActions').disabled=!standalone||busy||!model.actions.length;split.disabled=!standalone||readOnly||busy||!current()||current().rawTime<2||action?.readOnly;ticks.disabled=split.disabled;for(const control of [split,ticks,document.getElementById('bulkImportActions'),document.getElementById('bulkExportActions')])if(!standalone)control.title='Available in a standalone AIR file.'}
    const originalUpdateSelection=updateActionSelection;updateActionSelection=()=>{const result=originalUpdateSelection();syncBulkControls();return result};const originalStrip=renderStrip;renderStrip=()=>{const result=originalStrip();syncBulkControls();return result};syncBulkControls();
  })();</script></body>`);
}
module.exports = { exactRanges, exportActions, importActionsPatch, handle, install };
