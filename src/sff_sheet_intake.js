'use strict';

const crypto = require('crypto');
const { readIndexedPng8 } = require('./sff_png8_source');
const { indexedSourcePng } = require('./sff_reader');

const MAX_FRAMES = 10000;
const ORDERS = new Set(['row-major', 'column-major', 'snake', 'custom']);
const PROBLEM_CODES = new Set([
  'incorrect-cut', 'split-silhouette', 'combined-neighbors', 'missing-floating-portion',
  'unexpected-component', 'clipped-pixels', 'overlap', 'unassigned-foreground',
  'suspected-label', 'empty-frame', 'background-uncertain', 'palette-blocker', 'ordering-uncertain'
]);

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function integer(value, label, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  return parsed;
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function unionRectangle(rectangles) {
  if (!rectangles.length) throw new Error('At least one rectangle is required.');
  const x = Math.min(...rectangles.map(rectangle => rectangle.x)), y = Math.min(...rectangles.map(rectangle => rectangle.y));
  const right = Math.max(...rectangles.map(rectangle => rectangle.x + rectangle.width)), bottom = Math.max(...rectangles.map(rectangle => rectangle.y + rectangle.height));
  return Object.freeze({ x, y, width: right - x, height: bottom - y });
}
function rectanglesOverlap(a, b) { return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height; }
function rectangleGap(a, b) {
  const horizontal = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const vertical = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return horizontal + vertical;
}

function lineRuns(values, occupied) {
  const runs = [];
  let start = -1;
  for (let index = 0; index <= values.length; index += 1) {
    const matches = index < values.length && occupied(values[index]);
    if (matches && start < 0) start = index;
    if (!matches && start >= 0) { runs.push(Object.freeze({ start, end: index - 1, size: index - start })); start = -1; }
  }
  return Object.freeze(runs);
}

function indexedForegroundRule(decoded, options = {}) {
  const mode = String(options.mode || 'alpha');
  if (mode === 'alpha') {
    const alphaAtMost = integer(options.alphaAtMost || 0, 'Background alpha threshold');
    if (alphaAtMost > 254) throw new Error('Background alpha threshold must be between 0 and 254.');
    return Object.freeze({ foreground: index => decoded.colors[index][3] > alphaAtMost, rule: Object.freeze({ mode, alphaAtMost }) });
  }
  if (mode === 'palette-index') {
    const backgroundIndex = integer(options.backgroundIndex, 'Background palette index');
    if (backgroundIndex > 255) throw new Error('Background palette index must be between 0 and 255.');
    return Object.freeze({ foreground: index => index !== backgroundIndex, rule: Object.freeze({ mode, backgroundIndex, rgba: Object.freeze([...decoded.colors[backgroundIndex]]) }) });
  }
  throw new Error(`Unknown sprite-sheet background rule ${mode}.`);
}

function analyzeIndexedGutters(buffer, options = {}) {
  const decoded = readIndexedPng8(buffer), noise = integer(options.maxNoisePerLine || 0, 'Maximum ignored pixels per line');
  const { foreground, rule } = indexedForegroundRule(decoded, options);
  const rowCounts = Array(decoded.height).fill(0), columnCounts = Array(decoded.width).fill(0);
  let foregroundPixelCount = 0;
  for (let y = 0; y < decoded.height; y += 1) for (let x = 0; x < decoded.width; x += 1) if (foreground(decoded.indices[y * decoded.width + x])) { rowCounts[y] += 1; columnCounts[x] += 1; foregroundPixelCount += 1; }
  const emptyRows = lineRuns(rowCounts, count => count <= noise), emptyColumns = lineRuns(columnCounts, count => count <= noise);
  const occupiedRows = lineRuns(rowCounts, count => count > noise), occupiedColumns = lineRuns(columnCounts, count => count > noise);
  const regular = runs => runs.length && new Set(runs.map(run => run.size)).size === 1 && (runs.length < 2 || new Set(runs.slice(1).map((run, index) => run.start - runs[index].end - 1)).size === 1);
  let suggestedGrid = null;
  if (regular(occupiedColumns) && regular(occupiedRows)) {
    const xGap = occupiedColumns.length > 1 ? occupiedColumns[1].start - occupiedColumns[0].end - 1 : 0;
    const yGap = occupiedRows.length > 1 ? occupiedRows[1].start - occupiedRows[0].end - 1 : 0;
    suggestedGrid = Object.freeze({ cellWidth: occupiedColumns[0].size, cellHeight: occupiedRows[0].size, offsetX: occupiedColumns[0].start, offsetY: occupiedRows[0].start, gapX: xGap, gapY: yGap, columns: occupiedColumns.length, rows: occupiedRows.length, confidence: noise ? 'review' : 'high', interpretation: 'tight occupied runs; transparent padding outside each run is not included' });
  }
  let ignoredForegroundPixels = 0;
  if (noise) for (let y = 0; y < decoded.height; y += 1) for (let x = 0; x < decoded.width; x += 1) {
    const index = y * decoded.width + x;
    if (foreground(decoded.indices[index]) && ((rowCounts[y] > 0 && rowCounts[y] <= noise) || (columnCounts[x] > 0 && columnCounts[x] <= noise))) ignoredForegroundPixels += 1;
  }
  return Object.freeze({ schemaVersion: 1, sourceHash: sha256(buffer), width: decoded.width, height: decoded.height, rule, maxNoisePerLine: noise, foregroundPixelCount, backgroundPixelCount: decoded.indices.length - foregroundPixelCount, rowCounts: Object.freeze(rowCounts), columnCounts: Object.freeze(columnCounts), emptyRows, emptyColumns, occupiedRows, occupiedColumns, ignoredForegroundPixels, suggestedGrid });
}

function analyzeIndexedComponents(buffer, options = {}) {
  const decoded = readIndexedPng8(buffer, { maxPixels: Number(options.maxPixels || 16000000) }), sourceHash = sha256(buffer);
  const { foreground, rule } = indexedForegroundRule(decoded, options), connectivity = integer(options.connectivity || 8, 'Connectivity'), minimumArea = integer(options.minimumArea || 1, 'Minimum component area', 1), maximumComponents = integer(options.maximumComponents || 10000, 'Maximum component count', 1);
  if (![4, 8].includes(connectivity)) throw new Error('Connected-component analysis supports only 4-way or 8-way connectivity.');
  const proposal = options.proposal || null;
  if (proposal && (proposal.sourceHash !== sourceHash || proposal.width !== decoded.width || proposal.height !== decoded.height)) throw new Error('The reviewed grid and component audit do not belong to the same sprite-sheet bytes.');
  const frameByCell = new Map((proposal?.frames || []).map(frame => [`${frame.row},${frame.column}`, frame.frameId]));
  const membership = (x, y) => {
    if (!proposal) return null;
    const settings = proposal.settings, relativeX = x - settings.offsetX, relativeY = y - settings.offsetY;
    if (relativeX < 0 || relativeY < 0) return null;
    const pitchX = settings.cellWidth + settings.gapX, pitchY = settings.cellHeight + settings.gapY, column = Math.floor(relativeX / pitchX), row = Math.floor(relativeY / pitchY);
    if (column >= settings.columns || row >= settings.rows || relativeX % pitchX >= settings.cellWidth || relativeY % pitchY >= settings.cellHeight) return null;
    return frameByCell.get(`${row},${column}`) || null;
  };
  const total = decoded.indices.length, visited = new Uint8Array(total), queue = new Int32Array(total), components = [];
  const directions = connectivity === 4 ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  let foregroundPixelCount = 0, unassignedForegroundPixels = 0;
  for (let origin = 0; origin < total; origin += 1) {
    if (visited[origin] || !foreground(decoded.indices[origin])) continue;
    if (components.length >= maximumComponents) throw new Error(`Sprite-sheet analysis exceeded ${maximumComponents.toLocaleString()} connected components. Review the background rule or divide the sheet before analysis.`);
    let head = 0, tail = 0, area = 0, minX = decoded.width, minY = decoded.height, maxX = -1, maxY = -1, unassignedPixels = 0;
    const frameIds = new Set(), maskHash = crypto.createHash('sha256'), coordinate = Buffer.allocUnsafe(8);
    queue[tail++] = origin; visited[origin] = 1;
    while (head < tail) {
      const at = queue[head++], x = at % decoded.width, y = Math.floor(at / decoded.width);
      coordinate.writeUInt32LE(x, 0); coordinate.writeUInt32LE(y, 4); maskHash.update(coordinate);
      area += 1; foregroundPixelCount += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      const frameId = membership(x, y); if (frameId) frameIds.add(frameId); else { unassignedPixels += 1; unassignedForegroundPixels += 1; }
      for (const [dx, dy] of directions) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= decoded.width || ny >= decoded.height) continue;
        const next = ny * decoded.width + nx; if (!visited[next] && foreground(decoded.indices[next])) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    const pixelMaskHash = maskHash.digest('hex'), componentId = `component-${sha256(`${sourceHash}:${pixelMaskHash}`).slice(0, 20)}`;
    components.push(Object.freeze({ componentId, area, bounds: Object.freeze({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }), pixelMaskHash, frameIds: Object.freeze([...frameIds]), crossesCuts: frameIds.size > 1, unassignedPixels, belowMinimumArea: area < minimumArea }));
  }
  return Object.freeze({ schemaVersion: 1, sourceHash, width: decoded.width, height: decoded.height, rule, connectivity, minimumArea, foregroundPixelCount, backgroundPixelCount: total - foregroundPixelCount, unassignedForegroundPixels, crossingComponentCount: components.filter(component => component.crossesCuts).length, smallComponentCount: components.filter(component => component.belowMinimumArea).length, components: Object.freeze(components), evidenceHash: sha256(stable(components.map(component => ({ componentId: component.componentId, area: component.area, bounds: component.bounds, pixelMaskHash: component.pixelMaskHash, frameIds: component.frameIds, unassignedPixels: component.unassignedPixels })))) });
}

function gridProposal(image, settings = {}) {
  const width = integer(image?.width, 'Sheet width', 1), height = integer(image?.height, 'Sheet height', 1);
  const cellWidth = integer(settings.cellWidth, 'Cell width', 1), cellHeight = integer(settings.cellHeight, 'Cell height', 1);
  const offsetX = integer(settings.offsetX || 0, 'Horizontal offset'), offsetY = integer(settings.offsetY || 0, 'Vertical offset');
  const gapX = integer(settings.gapX || 0, 'Horizontal spacing'), gapY = integer(settings.gapY || 0, 'Vertical spacing');
  const availableColumns = Math.floor((width - offsetX + gapX) / (cellWidth + gapX));
  const availableRows = Math.floor((height - offsetY + gapY) / (cellHeight + gapY));
  const columns = settings.columns === undefined ? availableColumns : integer(settings.columns, 'Columns', 1);
  const rows = settings.rows === undefined ? availableRows : integer(settings.rows, 'Rows', 1);
  const order = String(settings.order || 'row-major');
  if (!ORDERS.has(order)) throw new Error(`Unknown sheet ordering ${order}.`);
  if (offsetX >= width || offsetY >= height || availableColumns < 1 || availableRows < 1) throw new Error('The first grid cell is outside the sprite sheet.');
  if (columns > availableColumns || rows > availableRows) throw new Error(`The requested ${columns}×${rows} grid does not fit inside the ${width}×${height} sheet.`);
  if (columns * rows > MAX_FRAMES) throw new Error(`A sprite-sheet session is limited to ${MAX_FRAMES.toLocaleString()} proposed frames.`);
  const cells = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const x = offsetX + column * (cellWidth + gapX), y = offsetY + row * (cellHeight + gapY);
    cells.push({ row, column, x, y, width: cellWidth, height: cellHeight });
  }
  let customOrder = null;
  if (order === 'column-major') cells.sort((a, b) => a.column - b.column || a.row - b.row);
  if (order === 'snake') cells.sort((a, b) => a.row - b.row || (a.row % 2 ? b.column - a.column : a.column - b.column));
  if (order === 'custom') {
    customOrder = Array.isArray(settings.customOrder) ? settings.customOrder.map((value, index) => integer(value, `Custom order item ${index + 1}`, 1)) : [];
    const expected = columns * rows;
    if (customOrder.length !== expected || new Set(customOrder).size !== expected || customOrder.some(value => value > expected)) throw new Error(`Custom frame order must list every row-major cell from 1 through ${expected} exactly once.`);
    const natural = [...cells]; cells.splice(0, cells.length, ...customOrder.map(value => natural[value - 1]));
  }
  const sourceHash = String(image.sourceHash || 'unbound-source');
  const frames = cells.map((cell, ordinal) => Object.freeze({
    frameId: `frame-${sha256(`${sourceHash}:${cell.x}:${cell.y}:${cell.width}:${cell.height}`).slice(0, 20)}`,
    ordinal, method: 'explicit-grid', reviewed: false, ...cell
  }));
  const usedRight = offsetX + columns * cellWidth + Math.max(0, columns - 1) * gapX;
  const usedBottom = offsetY + rows * cellHeight + Math.max(0, rows - 1) * gapY;
  const warnings = [];
  if (offsetX) warnings.push(`${offsetX} pixel(s) precede the first column.`);
  if (offsetY) warnings.push(`${offsetY} pixel(s) precede the first row.`);
  if (usedRight < width) warnings.push(`${width - usedRight} pixel(s) remain after the final column.`);
  if (usedBottom < height) warnings.push(`${height - usedBottom} pixel(s) remain after the final row.`);
  return Object.freeze({ schemaVersion: 1, mode: 'explicit-grid', sourceHash, width, height, settings: Object.freeze({ cellWidth, cellHeight, offsetX, offsetY, gapX, gapY, columns, rows, order, customOrder: customOrder ? Object.freeze(customOrder) : null }), frames: Object.freeze(frames), warnings: Object.freeze(warnings) });
}

function extractedIndexedFrame(decoded, sourceHash, frame) {
  const rectangle = frame.sourceRectangle || frame, x = integer(rectangle.x, 'Frame X'), y = integer(rectangle.y, 'Frame Y'), width = integer(rectangle.width, 'Frame width', 1), height = integer(rectangle.height, 'Frame height', 1);
  if (x + width > decoded.width || y + height > decoded.height) throw new Error('The reviewed frame rectangle extends outside the sprite sheet.');
  const indices = Buffer.alloc(width * height);
  for (let row = 0; row < height; row += 1) decoded.indices.copy(indices, row * width, (y + row) * decoded.width + x, (y + row) * decoded.width + x + width);
  const png = indexedSourcePng(width, height, indices, decoded.colors);
  return Object.freeze({ ...frame, x, y, width, height, sourceRectangle: Object.freeze({ x, y, width, height }), buffer: png, byteHash: sha256(png), decodedHash: sha256(indices), sourceHash, paletteHash: sha256(Buffer.from(decoded.colors.flat())) });
}

function extractIndexedRectangle(buffer, frame, expectedSourceHash = '') {
  const sourceHash = sha256(buffer);
  if (expectedSourceHash && expectedSourceHash !== sourceHash) throw new Error('The sprite sheet changed after its cut was reviewed. Create a new sheet revision.');
  return extractedIndexedFrame(readIndexedPng8(buffer), sourceHash, frame);
}

function extractIndexedGrid(buffer, proposal) {
  const decoded = readIndexedPng8(buffer), sourceHash = sha256(buffer);
  if (proposal.sourceHash !== 'unbound-source' && proposal.sourceHash !== sourceHash) throw new Error('The sprite sheet changed after its cuts were reviewed. Create a new sheet revision.');
  if (decoded.width !== proposal.width || decoded.height !== proposal.height) throw new Error('The sprite-sheet dimensions changed after review.');
  return proposal.frames.map(frame => extractedIndexedFrame(decoded, sourceHash, frame));
}

function baseSession(options = {}) {
  const sourceHash = String(options.sourceHash || '');
  if (!/^[a-f0-9]{64}$/i.test(sourceHash)) throw new Error('A sprite-sheet session requires the exact source SHA-256.');
  const frames = Array.isArray(options.frames) ? options.frames.map((frame, ordinal) => ({ frameId: String(frame.frameId || ''), ordinal, sourceRectangle: { x: integer(frame.x, 'Frame X'), y: integer(frame.y, 'Frame Y'), width: integer(frame.width, 'Frame width', 1), height: integer(frame.height, 'Frame height', 1) }, method: String(frame.method || 'explicit-grid') })) : [];
  if (!frames.length || frames.length > MAX_FRAMES || new Set(frames.map(frame => frame.frameId)).size !== frames.length || frames.some(frame => !frame.frameId)) throw new Error('A sprite-sheet session requires unique reviewed frame IDs.');
  const intakeEvidence = options.intakeEvidence ? clone(options.intakeEvidence) : null;
  if (intakeEvidence?.sourceHash && intakeEvidence.sourceHash !== sourceHash) throw new Error('Sprite-sheet intake evidence belongs to different source bytes.');
  return Object.freeze({ schemaVersion: 1, sessionId: String(options.sessionId || `sheet-${sourceHash.slice(0, 16)}`), revision: integer(options.revision || 1, 'Revision', 1), source: Object.freeze({ name: String(options.sourceName || 'sprite-sheet.png'), sha256: sourceHash, width: integer(options.width, 'Sheet width', 1), height: integer(options.height, 'Sheet height', 1) }), firstNumericGroup: integer(options.firstNumericGroup || 0, 'First group'), intakeEvidence: intakeEvidence ? Object.freeze(intakeEvidence) : null, frames: Object.freeze(frames), journal: Object.freeze([]) });
}

function validateJournal(session) {
  let previousHash = '0'.repeat(64);
  for (let index = 0; index < session.journal.length; index += 1) {
    const event = session.journal[index];
    if (event.sequence !== index + 1 || event.previousHash !== previousHash) throw new Error(`Sprite-sheet journal chain is broken at event ${index + 1}.`);
    const expected = sha256(stable({ sequence: event.sequence, previousHash: event.previousHash, type: event.type, payload: event.payload }));
    if (event.eventHash !== expected) throw new Error(`Sprite-sheet journal event ${index + 1} failed its hash check.`);
    previousHash = event.eventHash;
  }
  return previousHash;
}

function replaySession(session) {
  validateJournal(session);
  const active = [], undone = new Set(), problems = new Map(), axisReviews = new Map(), baseRectangles = new Map(session.frames.map(frame => [frame.frameId, frame.sourceRectangle])), adjustedFrameIds = new Set(), attachments = new Map();
  let closed = false, checkpointResolution = new Map();
  const invalidateAxisDependencies = (changedFrameId, event, kind) => {
    for (const [logicalGroup, review] of axisReviews) {
      const referenceFrameIds = new Set(review.referenceFrameIds || [review.referenceFrameId]), referenceChanged = referenceFrameIds.has(changedFrameId);
      let invalidated = false;
      const decisions = review.decisions.map(decision => {
        const dependsOnChangedPixels = decision.frameId === changedFrameId || (referenceChanged && !referenceFrameIds.has(decision.frameId));
        if (!dependsOnChangedPixels || decision.status === 'rejected') return decision;
        invalidated = true;
        return { ...decision, reviewRequired: true, invalidation: { kind, changedFrameId, sourceEventHash: event.eventHash } };
      });
      if (invalidated) axisReviews.set(logicalGroup, { ...review, decisions, invalidatedByFrameIds: [...new Set([...(review.invalidatedByFrameIds || []), changedFrameId])] });
    }
  };
  for (const event of session.journal) {
    if (event.type === 'classify') active.push(event);
    else if (event.type === 'undo') undone.add(String(event.payload.eventHash));
    else if (event.type === 'problem') problems.set(String(event.payload.problemId), { ...event.payload, resolved: false });
    else if (event.type === 'resolve-problem' && problems.has(String(event.payload.problemId))) problems.get(String(event.payload.problemId)).resolved = true;
    else if (event.type === 'checkpoint') checkpointResolution.set(String(event.payload.boundaryHash), String(event.payload.choice));
    else if (event.type === 'axis-review') axisReviews.set(Number(event.payload.logicalGroup), event.payload);
    else if (event.type === 'adjust-rectangle') {
      const changedFrameId = String(event.payload.frameId);
      baseRectangles.set(changedFrameId, event.payload.rectangle); adjustedFrameIds.add(changedFrameId);
      invalidateAxisDependencies(changedFrameId, event, 'frame-cut-changed');
    }
    else if (event.type === 'attach-components') {
      const changedFrameId = String(event.payload.frameId);
      for (const component of event.payload.components || []) attachments.set(`${changedFrameId}:${component.componentId}`, { frameId: changedFrameId, ownership: event.payload.ownership, note: event.payload.note, ...component, sourceEventHash: event.eventHash });
      invalidateAxisDependencies(changedFrameId, event, 'component-attachment-changed');
    }
    else if (event.type === 'detach-components') {
      const changedFrameId = String(event.payload.frameId);
      for (const componentId of event.payload.componentIds || []) attachments.delete(`${changedFrameId}:${componentId}`);
      invalidateAxisDependencies(changedFrameId, event, 'component-attachment-changed');
    }
    else if (event.type === 'close') closed = true;
    else if (event.type === 'resume') closed = false;
  }
  const classifications = active.filter(event => !undone.has(event.eventHash));
  const cursor = classifications.length;
  let logicalGroup = 0;
  for (const event of classifications) if (event.payload.boundaryAfter && event !== classifications.at(-1)) logicalGroup += 1;
  const last = classifications.at(-1), unresolvedProblems = [...problems.values()].filter(problem => !problem.resolved);
  let phase = cursor >= session.frames.length ? 'complete' : 'review';
  if (last?.payload.boundaryAfter) {
    const resolution = checkpointResolution.get(last.eventHash);
    if (!resolution) phase = 'group-complete';
    else if (resolution === 'axis-review') phase = 'axis-review';
    else logicalGroup += 1;
  }
  if (closed) phase = 'closed';
  const rectangles = new Map(baseRectangles);
  for (const frame of session.frames) {
    const owned = [...attachments.values()].filter(attachment => attachment.frameId === frame.frameId);
    if (owned.length) rectangles.set(frame.frameId, unionRectangle([baseRectangles.get(frame.frameId), ...owned.map(attachment => attachment.bounds)]));
  }
  const frameRectangles = Object.freeze(Object.fromEntries(rectangles)), baseFrameRectangles = Object.freeze(Object.fromEntries(baseRectangles));
  const currentBase = session.frames[cursor] || null, currentFrame = currentBase ? Object.freeze({ ...currentBase, sourceRectangle: frameRectangles[currentBase.frameId] }) : null;
  return Object.freeze({ phase, cursor, currentFrame, logicalGroup, classifications: Object.freeze(classifications.map(event => ({ ...event.payload, eventHash: event.eventHash }))), problems: Object.freeze([...problems.values()]), unresolvedProblems: Object.freeze(unresolvedProblems), axisReviews: Object.freeze([...axisReviews.values()]), frameRectangles, baseFrameRectangles, adjustedFrameIds: Object.freeze([...adjustedFrameIds]), componentAttachments: Object.freeze([...attachments.values()].map(attachment => Object.freeze(attachment))), attachmentFrameIds: Object.freeze([...new Set([...attachments.values()].map(attachment => attachment.frameId))]), journalHead: session.journal.at(-1)?.eventHash || '0'.repeat(64) });
}

function appendEvent(session, type, payload = {}) {
  validateJournal(session);
  const sequence = session.journal.length + 1, previousHash = session.journal.at(-1)?.eventHash || '0'.repeat(64), cleanPayload = clone(payload);
  const eventHash = sha256(stable({ sequence, previousHash, type, payload: cleanPayload }));
  return Object.freeze({ ...session, journal: Object.freeze([...session.journal, Object.freeze({ sequence, previousHash, type, payload: Object.freeze(cleanPayload), eventHash })]) });
}

function componentAttachmentProposal(session, frameId, componentIds, ownership = 'exclusive', note = '') {
  const state = replaySession(session), componentAudit = session.intakeEvidence?.componentAudit;
  frameId = String(frameId || state.currentFrame?.frameId || '');
  if (!componentAudit?.components?.length || componentAudit.sourceHash !== session.source.sha256) throw new Error('This session has no matching connected-component audit to review.');
  if (!session.frames.some(frame => frame.frameId === frameId)) throw new Error('Choose a valid frame for the floating component attachment.');
  const ids = [...new Set((componentIds || []).map(String))];
  if (!ids.length) throw new Error('Choose at least one audited component to attach.');
  if (!['exclusive', 'duplicate'].includes(ownership)) throw new Error('Component ownership must be exclusive or explicitly duplicated.');
  const byId = new Map(componentAudit.components.map(component => [component.componentId, component])), components = ids.map(id => byId.get(id));
  if (components.some(component => !component)) throw new Error('One or more selected components are not part of the saved component audit.');
  const elsewhere = new Map();
  for (const component of components) {
    const frameIds = new Set((component.frameIds || []).filter(id => id !== frameId));
    for (const attachment of state.componentAttachments.filter(item => item.componentId === component.componentId && item.frameId !== frameId)) frameIds.add(attachment.frameId);
    if (frameIds.size) elsewhere.set(component.componentId, [...frameIds]);
  }
  if (ownership === 'exclusive' && elsewhere.size) throw new Error(`Exclusive attachment would reuse component pixels already owned by another frame (${[...elsewhere.keys()].join(', ')}). Choose duplicated ownership to proceed deliberately.`);
  const baseRectangle = state.baseFrameRectangles[frameId], existing = state.componentAttachments.filter(attachment => attachment.frameId === frameId && !ids.includes(attachment.componentId));
  const union = unionRectangle([baseRectangle, ...existing.map(attachment => attachment.bounds), ...components.map(component => component.bounds)]);
  const crossedFrameIds = session.frames.filter(frame => frame.frameId !== frameId && rectanglesOverlap(union, state.frameRectangles[frame.frameId])).map(frame => frame.frameId);
  const warnings = [];
  if (elsewhere.size) warnings.push(`${elsewhere.size} component(s) already intersect or belong to another frame; their pixels will be deliberately duplicated.`);
  if (crossedFrameIds.length) warnings.push(`The union rectangle overlaps ${crossedFrameIds.length} other reviewed frame rectangle(s).`);
  if (components.some(component => component.crossesCuts)) warnings.push('At least one component crosses a reviewed grid cut.');
  return Object.freeze({ frameId, ownership, note: String(note || '').slice(0, 1000), componentAuditEvidenceHash: componentAudit.evidenceHash, components: Object.freeze(components.map(component => Object.freeze({ componentId: component.componentId, pixelMaskHash: component.pixelMaskHash, area: component.area, bounds: component.bounds, originalFrameIds: component.frameIds }))), baseRectangle, unionRectangle: union, crossedFrameIds: Object.freeze(crossedFrameIds), warnings: Object.freeze(warnings) });
}

function componentAttachmentSuggestions(session, frameId, options = {}) {
  const state = replaySession(session), audit = session.intakeEvidence?.componentAudit;
  if (!audit?.components?.length || audit.sourceHash !== session.source.sha256) throw new Error('This session has no matching connected-component audit to suggest from.');
  const current = state.frameRectangles[frameId];
  if (!current) throw new Error('Choose a valid frame for floating-component suggestions.');
  const maxGap = integer(options.maxGap ?? Math.max(4, Math.floor(Math.max(current.width, current.height) / 4)), 'Maximum component gap');
  const attached = new Set(state.componentAttachments.map(item => item.componentId));
  const frames = session.frames.map(frame => ({ frameId: frame.frameId, rectangle: state.frameRectangles[frame.frameId] }));
  const suggestions = [], ambiguousNearby = [];
  for (const component of audit.components) {
    if (component.frameIds.length || attached.has(component.componentId) || component.belowMinimumArea) continue;
    const ranked = frames.map(frame => ({ frameId: frame.frameId, gap: rectangleGap(frame.rectangle, component.bounds) })).sort((a, b) => a.gap - b.gap || a.frameId.localeCompare(b.frameId));
    if (!ranked.length || ranked[0].gap > maxGap) continue;
    const tied = ranked.filter(item => item.gap === ranked[0].gap);
    if (tied.length > 1) { if (tied.some(item => item.frameId === frameId)) ambiguousNearby.push(Object.freeze({ componentId: component.componentId, gap: ranked[0].gap, tiedFrameIds: Object.freeze(tied.map(item => item.frameId)) })); continue; }
    if (ranked[0].frameId !== frameId) continue;
    const proposal = componentAttachmentProposal(session, frameId, [component.componentId], 'exclusive', 'suggested-nearby-component');
    suggestions.push(Object.freeze({ componentId: component.componentId, gap: ranked[0].gap, area: component.area, bounds: component.bounds, confidence: ranked[0].gap <= 2 && !proposal.crossedFrameIds.length ? 'high' : 'review', crossedFrameIds: proposal.crossedFrameIds, warnings: proposal.warnings }));
  }
  const evidence = { componentAuditEvidenceHash: audit.evidenceHash, frameId, frameRectangle: current, maxGap, suggestions: suggestions.map(item => ({ componentId: item.componentId, gap: item.gap, confidence: item.confidence, crossedFrameIds: item.crossedFrameIds })), ambiguousNearby };
  return Object.freeze({ ...evidence, suggestions: Object.freeze(suggestions), ambiguousNearby: Object.freeze(ambiguousNearby), evidenceHash: sha256(stable(evidence)) });
}

function reviewAction(session, action, payload = {}) {
  const state = replaySession(session), current = state.currentFrame;
  if (action === 'resume') return appendEvent(session, 'resume');
  if (action === 'save-close') return appendEvent(session, 'close');
  if (state.phase === 'closed') throw new Error('Resume the saved sprite-sheet session before reviewing more frames.');
  if (state.phase === 'group-complete') {
    const boundaryHash = state.classifications.at(-1)?.eventHash;
    if (action === 'continue') return appendEvent(session, 'checkpoint', { boundaryHash, choice: 'continue' });
    if (action === 'stop-axis-review') return appendEvent(session, 'checkpoint', { boundaryHash, choice: 'axis-review' });
    if (action === 'back') return appendEvent(session, 'undo', { eventHash: boundaryHash });
    throw new Error('At Group complete, choose Continue, Stop for Axis Review, Reopen Last Frame, or Save and Close.');
  }
  if (state.phase === 'axis-review') {
    if (action === 'save-axis-review') {
      const logicalGroup = state.classifications.at(-1)?.logicalGroup, groupFrames = state.classifications.filter(item => item.logicalGroup === logicalGroup && item.included !== false).map(item => item.frameId);
      const decisions = Array.isArray(payload.decisions) ? payload.decisions : [];
      if (!groupFrames.length || decisions.length !== groupFrames.length || decisions.some((decision, index) => decision.frameId !== groupFrames[index] || !Number.isSafeInteger(Number(decision.axisX)) || !Number.isSafeInteger(Number(decision.axisY)))) throw new Error('Axis review must contain one ordered whole-number decision for every frame in the completed logical group.');
      const referenceFrameIds = [...new Set(Array.isArray(payload.referenceFrameIds) && payload.referenceFrameIds.length ? payload.referenceFrameIds.map(String) : [String(payload.referenceFrameId || '')])];
      if (!referenceFrameIds.length || referenceFrameIds.some(frameId => !groupFrames.includes(frameId))) throw new Error('Every trusted axis reference must belong to the completed logical group.');
      const statuses = new Set(['accepted', 'corrected', 'rejected', 'unresolved']);
      return appendEvent(session, 'axis-review', { logicalGroup, referenceFrameId: referenceFrameIds[0], referenceFrameIds, algorithm: String(payload.algorithm || 'reference-silhouette-v1'), decisions: decisions.map(decision => { const status = String(decision.status || 'unresolved'); if (!statuses.has(status)) throw new Error(`Unknown axis-review status ${status}.`); return { frameId: decision.frameId, axisX: Number(decision.axisX), axisY: Number(decision.axisY), status, confidence: Math.max(0, Math.min(1, Number(decision.confidence) || 0)), confidenceLabel: String(decision.confidenceLabel || 'review'), method: String(decision.method || 'reviewed'), evidence: clone(decision.evidence || {}) }; }) });
    }
    if (action === 'continue') {
      const logicalGroup = state.classifications.at(-1)?.logicalGroup, review = state.axisReviews.find(item => item.logicalGroup === logicalGroup);
      if (review?.decisions.some(decision => decision.status === 'unresolved' || decision.reviewRequired)) throw new Error('Accept, correct, reject, or re-review every unresolved axis suggestion or invalidated axis decision before continuing.');
      const boundaryHash = state.classifications.at(-1)?.eventHash;
      return appendEvent(session, 'checkpoint', { boundaryHash, choice: 'continue' });
    }
    throw new Error('Finish or leave the axis checkpoint before returning to frame review.');
  }
  if (action === 'back') {
    const target = state.classifications.at(-1);
    if (!target) throw new Error('There is no earlier classification to reopen.');
    return appendEvent(session, 'undo', { eventHash: target.eventHash });
  }
  if (action === 'adjust-rectangle') {
    if (!current) throw new Error('There is no current frame to adjust.');
    const rectangle = { x: integer(payload.x, 'Frame X'), y: integer(payload.y, 'Frame Y'), width: integer(payload.width, 'Frame width', 1), height: integer(payload.height, 'Frame height', 1) };
    if (rectangle.x + rectangle.width > session.source.width || rectangle.y + rectangle.height > session.source.height) throw new Error('The corrected frame rectangle must remain inside the immutable sprite sheet.');
    return appendEvent(session, 'adjust-rectangle', { frameId: current.frameId, rectangle, reason: String(payload.reason || '').slice(0, 1000), invalidatesComponentMembership: true });
  }
  if (action === 'attach-components') {
    if (!current) throw new Error('There is no current frame to receive floating components.');
    return appendEvent(session, 'attach-components', componentAttachmentProposal(session, current.frameId, payload.componentIds, String(payload.ownership || 'exclusive'), payload.note));
  }
  if (action === 'detach-components') {
    if (!current) throw new Error('There is no current frame to detach components from.');
    const componentIds = [...new Set((payload.componentIds || []).map(String))], attached = new Set(state.componentAttachments.filter(item => item.frameId === current.frameId).map(item => item.componentId));
    if (!componentIds.length || componentIds.some(componentId => !attached.has(componentId))) throw new Error('Choose one or more components currently attached to this frame.');
    return appendEvent(session, 'detach-components', { frameId: current.frameId, componentIds, note: String(payload.note || '').slice(0, 1000) });
  }
  if (action === 'incorrect-cut') {
    if (!current) throw new Error('There is no current frame to flag.');
    const code = String(payload.code || 'incorrect-cut');
    if (!PROBLEM_CODES.has(code)) throw new Error(`Unknown sprite-sheet problem ${code}.`);
    return appendEvent(session, 'problem', { problemId: `problem-${session.journal.length + 1}-${current.frameId}`, frameId: current.frameId, code, note: String(payload.note || '').slice(0, 1000) });
  }
  if (action === 'resolve-problem') {
    if (!state.problems.some(problem => problem.problemId === payload.problemId)) throw new Error('The selected sprite-sheet problem does not exist.');
    return appendEvent(session, 'resolve-problem', { problemId: String(payload.problemId), note: String(payload.note || '').slice(0, 1000) });
  }
  if (!current || !['keep', 'new-group', 'exclude'].includes(action)) throw new Error(`Action ${action} is unavailable in ${state.phase}.`);
  return appendEvent(session, 'classify', { frameId: current.frameId, logicalGroup: state.logicalGroup, included: action !== 'exclude', boundaryAfter: action === 'new-group', note: String(payload.note || '').slice(0, 1000) });
}

function creatorHandoff(session, extractedFrames) {
  const state = replaySession(session);
  if (state.phase !== 'complete') throw new Error('Review every sprite-sheet frame before handing it to SFF Creator.');
  if (state.unresolvedProblems.length) throw new Error(`Resolve ${state.unresolvedProblems.length} sprite-sheet problem(s) before handoff.`);
  const invalidAxes = state.axisReviews.flatMap(review => review.decisions.filter(decision => decision.status === 'unresolved' || decision.reviewRequired));
  if (invalidAxes.length) throw new Error(`Re-review ${invalidAxes.length} unresolved or cut-invalidated axis decision(s) before handing off to SFF Creator.`);
  const extracted = new Map(extractedFrames.map(frame => [frame.frameId, frame]));
  const axisByFrame = new Map(state.axisReviews.flatMap(review => review.decisions.filter(decision => decision.status !== 'rejected').map(decision => [decision.frameId, { ...decision, logicalGroup: review.logicalGroup, referenceFrameId: review.referenceFrameId, referenceFrameIds: review.referenceFrameIds || [review.referenceFrameId], algorithm: review.algorithm }])));
  const componentAudit = session.intakeEvidence?.componentAudit || null;
  const included = state.classifications.filter(classification => classification.included !== false);
  if (!included.length) throw new Error('At least one reviewed sprite-sheet frame must be included before handoff.');
  return included.map((classification, outputOrder) => {
    const frame = session.frames.find(item => item.frameId === classification.frameId), output = extracted.get(classification.frameId), adjusted = state.adjustedFrameIds.includes(frame.frameId), attachments = state.componentAttachments.filter(attachment => attachment.frameId === frame.frameId);
    if (!output?.byteHash || !output?.decodedHash) throw new Error(`Reviewed frame ${classification.frameId} has no verified extracted snapshot.`);
    const components = componentAudit && !adjusted ? componentAudit.components.filter(component => component.frameIds.includes(frame.frameId)).map(component => component.componentId) : [];
    return Object.freeze({ frameId: frame.frameId, outputOrder, logicalGroup: classification.logicalGroup, numericGroupSuggestion: session.firstNumericGroup + classification.logicalGroup, sourceRectangle: state.frameRectangles[frame.frameId], extractionMethod: attachments.length ? 'reviewed-component-union' : adjusted ? 'reviewed-rectangle-correction' : frame.method, sourceSheet: session.source, extractedByteHash: output.byteHash, decodedPixelHash: output.decodedHash, componentAuditEvidenceHash: componentAudit?.evidenceHash || null, componentMembershipNeedsReview: adjusted && Boolean(componentAudit), componentIds: Object.freeze([...new Set([...components, ...attachments.map(attachment => attachment.componentId)])]), componentAttachments: Object.freeze(attachments.map(attachment => Object.freeze({ componentId: attachment.componentId, pixelMaskHash: attachment.pixelMaskHash, ownership: attachment.ownership, note: attachment.note, bounds: attachment.bounds, originalFrameIds: attachment.originalFrameIds, sourceEventHash: attachment.sourceEventHash }))), axisSuggestion: axisByFrame.get(frame.frameId) || null, journalHead: state.journalHead });
  });
}

module.exports = { MAX_FRAMES, ORDERS, PROBLEM_CODES, sha256, analyzeIndexedGutters, analyzeIndexedComponents, gridProposal, extractIndexedRectangle, extractIndexedGrid, baseSession, validateJournal, replaySession, reviewAction, componentAttachmentProposal, componentAttachmentSuggestions, creatorHandoff };
