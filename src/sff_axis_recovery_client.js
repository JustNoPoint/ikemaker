'use strict';
function bindAxisRecovery() {
    let timer, restoring = false;
    function capture() {
        if (restoring) return;
        clearTimeout(timer);
        timer = setTimeout(() => vscode.postMessage({
            type: 'axisRecoverySnapshot',
            changes: [...dirtyAxes.values()].map(change => ({...change}))
        }), 120);
    }
    for (const method of ['set', 'delete', 'clear']) {
        const original = dirtyAxes[method].bind(dirtyAxes);
        dirtyAxes[method] = (...args) => {
            const result = original(...args);
            capture();
            return result;
        };
    }
    addEventListener('message', event => {
        if (event.data.type !== 'restoreAxisRecovery') return;
        clearTimeout(timer);
        restoring = true;
        clearTimeout(autoSaveTimer);
        for (const change of event.data.changes || []) {
            const sprite = model.sprites[change.index];
            if (!sprite) continue;
            sprite.axisX = change.x;
            sprite.axisY = change.y;
            dirtyAxes.set(change.index, {...change});
        }
        restoring = false;
        if (selected) {
            document.getElementById('axisXInput').value = selected.axisX;
            document.getElementById('axisYInput').value = selected.axisY;
        }
        document.getElementById('axisSaveStatus').textContent = 'Recovered pending axes. Review them, then Save or Reload and Discard.';
        redraw();
    });
}
module.exports = {clientScript: () => '(' + bindAxisRecovery.toString() + ')();'};
