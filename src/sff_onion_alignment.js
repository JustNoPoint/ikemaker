'use strict';
const crypto = require('crypto');
const { spriteSilhouette } = require('./sff_silhouette');
const { registrationSuggestion, METHODS } = require('./sff_onion_registration');
const { resolvedSprite } = require('./sff_reader');
const { spriteAppearance } = require('./sff_sprite_matching');
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
function proposeOnionAxes(archive, referenceIndex, indices, png, options = {}) {
  const method = options.method || 'silhouette';
  if (!METHODS.includes(method)) throw new Error('Choose a supported onion registration method.');
  const reference = archive.sprites[referenceIndex];
  if (!reference) throw new Error('Pin an existing onion sprite first.');
  const physical = [...new Set([referenceIndex, ...indices])].map(index => archive.sprites[index]).filter(Boolean).map(sprite => resolvedSprite(archive, sprite));
  if (physical.some(sprite => sprite.width * sprite.height > 1000000) || physical.reduce((sum, sprite) => sum + (sprite.width * sprite.height || 0), 0) > 16000000) throw new Error('Onion review is limited to one million pixels per image and 16 million pixels total. Review a smaller selection.');
  const referencePng = png(archive, reference), mask = method === 'color-match' ? spriteAppearance(archive, reference, referencePng) : spriteSilhouette(archive, reference, referencePng);
  const rows = [...new Set(indices)].filter(index => index !== referenceIndex).map(index => {
    const sprite = archive.sprites[index];
    if (!sprite) throw new Error('The selected sprite is no longer available.');
    const bytes = png(archive, sprite), targetMask = method === 'color-match' ? spriteAppearance(archive, sprite, bytes) : spriteSilhouette(archive, sprite, bytes);
    const suggestion = { ...registrationSuggestion(targetMask, mask, reference, method, sprite) };
    const warning = [mask.reason, targetMask.reason, suggestion.evidence.searchBoundary ? 'Match reached the 16-pixel search boundary; correct and review it.' : ''].filter(Boolean).join(' ');
    if (!mask.hasAlpha || !targetMask.hasAlpha) { suggestion.confidence = Math.min(suggestion.confidence, .49); suggestion.confidenceLabel = 'low'; }
    suggestion.warning = warning;
    return { index, group: sprite.group, number: sprite.number, currentX: sprite.axisX, currentY: sprite.axisY, ...suggestion, dataUri: 'data:image/png;base64,' + bytes.toString('base64') };
  });
  if (!rows.length) throw new Error('Select a destination sprite different from the pinned onion.');
  return { method, reference: { index: reference.index, group: reference.group, number: reference.number, axisX: reference.axisX, axisY: reference.axisY, dataUri: 'data:image/png;base64,' + referencePng.toString('base64') }, rows };
}
function createReviewGuard(archive, review) {
  return { token: crypto.randomUUID(), archiveHash: digest(archive.buffer), reference: review.reference, rows: review.rows };
}
function validateReviewGuard(archive, guard, token, changes) {
  if (!guard || guard.token !== token || digest(archive.buffer) !== guard.archiveHash) throw new Error('The reviewed archive or its image pixels changed. Review onion alignment again.');
  const same = (row, x, y) => { const sprite = archive.sprites[row.index]; return sprite && sprite.index === row.index && sprite.group === row.group && sprite.number === row.number && sprite.axisX === x && sprite.axisY === y; };
  if (!same(guard.reference, guard.reference.axisX, guard.reference.axisY)) throw new Error('The pinned reference identity or axes changed. Review again.');
  if (!Array.isArray(changes) || !changes.length || new Set(changes.map(item => item.index)).size !== changes.length) throw new Error('Choose distinct reviewed destination sprites.');
  for (const change of changes) {
    const row = guard.rows.find(item => item.index === change.index);
    if (!row || !same(row, row.currentX, row.currentY)) throw new Error('A reviewed destination identity or axes changed. Review again.');
  }
  return true;
}
function installOnionAlignment() {
  const button = document.getElementById('alignWithOnionSkin');
  const registration = document.createElement('select');
  registration.id = 'onionRegistrationMethod';
  registration.setAttribute('aria-label', 'Onion registration method');
  for (const [value, label] of [['silhouette','Silhouette overlap'],['box-center','Box center'],['bottom-center','Bottom center'],['center-of-mass','Center of mass'],['color-match','Color match']]) {
    const option=document.createElement('option');option.value=value;option.textContent=label;registration.append(option);
  }
  registration.value='silhouette';button.before(registration);
  let request = 0, dialog = null;
  const validAxis = input => input.value !== '' && Number.isInteger(Number(input.value)) && Number(input.value) >= -32768 && Number(input.value) <= 32767;
  const sameSprite = (sprite, row, x = row.currentX, y = row.currentY) => sprite && sprite.index === row.index && sprite.group === row.group && sprite.number === row.number && sprite.axisX === x && sprite.axisY === y;
  const loadImage = uri => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The decoded sprite could not be displayed.'));
    image.src = uri;
  });
  function closeReview(target = dialog) {
    target?.remove();
    if (target === dialog) { request++; dialog = null; button.focus(); }
  }
  function createRow(row, reference, referenceImage, targetImage) {
    const wrap = document.createElement('div');
    const accept = document.createElement('input'), label = document.createElement('span');
    const x = document.createElement('input'), y = document.createElement('input');
    const preview = document.createElement('canvas'), delta = document.createElement('span');
    accept.type = 'checkbox';
    accept.setAttribute('aria-label', 'Accept ' + row.group + ',' + row.number);
    label.textContent = row.group + ',' + row.number + ' · ' + row.confidenceLabel + (row.warning ? ' · ' + row.warning : '') + ' · X/Y ';
    for (const [input, value, axis] of [[x, row.axisX, 'X'], [y, row.axisY, 'Y']]) {
      input.type = 'number'; input.min = -32768; input.max = 32767; input.value = value;
      input.setAttribute('aria-label', 'Axis ' + axis + ' for ' + row.group + ',' + row.number);
    }
    preview.width = 360; preview.height = 240;
    preview.style.cssText = 'display:block;image-rendering:pixelated;background:#555';
    // Keep the reference camera fixed while the destination axes are corrected.
    const left = Math.min(-reference.axisX, -row.axisX), top = Math.min(-reference.axisY, -row.axisY);
    const right = Math.max(referenceImage.width - reference.axisX, targetImage.width - row.axisX);
    const bottom = Math.max(referenceImage.height - reference.axisY, targetImage.height - row.axisY);
    const scale = Math.min(4, 340 / Math.max(1, right - left), 220 / Math.max(1, bottom - top));
    function draw() {
      const px = Number(x.value), py = Number(y.value), ctx = preview.getContext('2d');
      ctx.clearRect(0, 0, 360, 240); ctx.save();
      ctx.translate(10 - left * scale, 10 - top * scale); ctx.scale(scale, scale);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = .4; ctx.drawImage(referenceImage, -reference.axisX, -reference.axisY);
      ctx.globalAlpha = .8; ctx.drawImage(targetImage, -px, -py); ctx.restore();
      delta.textContent = ' Delta ' + (px - row.currentX) + ',' + (py - row.currentY);
    }
    x.oninput = y.oninput = draw;
    wrap.append(accept, label, x, y, delta, preview);
    draw();
    return { wrap, row, accept, x, y };
  }
  button.onclick = () => {
    if (!selected || document.getElementById('onionMode').value !== 'pinned') {
      error.textContent = 'Pin an onion reference before aligning selected sprites.'; return;
    }
    if (dirtyAxes.size) { error.textContent = 'Save pending axes before reviewing onion alignment.'; return; }
    vscode.postMessage({ type: 'onionAlignment', requestId: ++request, referenceIndex: onionIndex, method: registration.value, indices: selectedIndices.size ? [...selectedIndices] : [selected.index] });
  };
  addEventListener('message', async event => {
    const message = event.data;
    if (message.type !== 'onionAlignment' || message.requestId !== request) return;
    let reviewDialog;
    try {
      dialog?.remove();
      reviewDialog = dialog = document.createElement('dialog');
      reviewDialog.id = 'onionAlignmentReview';
      reviewDialog.style.cssText = 'max-width:95vw;max-height:90vh;overflow:auto;background:var(--vscode-editor-background);color:var(--vscode-foreground)';
      const heading = document.createElement('h2'), note = document.createElement('p');
      heading.textContent = 'Align With Onion Skin · ' + ({silhouette:'Silhouette overlap','box-center':'Box center','bottom-center':'Bottom center','center-of-mass':'Center of mass','color-match':'Color match'})[message.method || 'silhouette'];
      note.textContent = 'Fixed reference ' + message.reference.group + ',' + message.reference.number + '. Silhouette suggestions need review, especially different poses. Edit X/Y and check each accepted row. Only axes are saved. Color and silhouette searches are bounded to 16 pixels around their initial estimate; each image is limited to one million pixels.';
      reviewDialog.append(heading, note); document.body.append(reviewDialog);
      const referenceImage = await loadImage(message.reference.dataUri), entries = [];
      for (const row of message.rows) {
        const image = await loadImage(row.dataUri);
        if (message.requestId !== request) { reviewDialog.remove(); return; }
        const entry = createRow(row, message.reference, referenceImage, image);
        reviewDialog.append(entry.wrap); entries.push(entry);
      }
      const apply = document.createElement('button'), cancel = document.createElement('button');
      apply.textContent = 'Apply reviewed axes'; cancel.textContent = 'Cancel';
      cancel.onclick = () => closeReview(reviewDialog);
      apply.onclick = () => {
        const chosen = entries.filter(item => item.accept.checked), reference = message.reference;
        if (!chosen.length) { note.textContent = 'Check at least one reviewed destination.'; return; }
        if (dirtyAxes.size || !sameSprite(model.sprites[reference.index], reference, reference.axisX, reference.axisY) || chosen.some(({ row, x, y }) => !sameSprite(model.sprites[row.index], row) || !validAxis(x) || !validAxis(y))) {
          note.textContent = 'A sprite identity or axis changed, or an entry is invalid. Close and review again.'; return;
        }
        for (const { row, x, y } of chosen) {
          const sprite = model.sprites[row.index];
          sprite.axisX = Number(x.value); sprite.axisY = Number(y.value);
          dirtyAxes.set(sprite.index, { index: sprite.index, x: sprite.axisX, y: sprite.axisY });
        }
        globalThis.ikemenOnionAlignmentGuard = message.guard;
        globalThis.ikemenFlushAxisSave();
        closeReview(reviewDialog);
        if (selected) selectSprite(selected);
      };
      reviewDialog.append(apply, cancel);
      if (message.requestId !== request) { reviewDialog.remove(); return; }
      reviewDialog.addEventListener('cancel', () => closeReview(reviewDialog));
      reviewDialog.showModal(); cancel.focus();
    } catch (failure) {
      reviewDialog?.remove();
      if (message.requestId === request) { error.textContent = 'Could not preview onion alignment: ' + failure.message; button.focus(); }
    }
  });
}
function clientScript() { return '(' + installOnionAlignment.toString() + ')();'; }
module.exports = { proposeOnionAxes, clientScript, createReviewGuard, validateReviewGuard };
