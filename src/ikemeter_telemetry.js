'use strict';

const path = require('node:path');
const presentation = require('./viewer_presentation');
const { randomBytes } = require('node:crypto');
const { FIELDS, PINNED_ENGINE_SHA256 } = require('./ikemeter_telemetry_model');

const COMMAND = 'ikemen.importIKeMeterTelemetry';
const VIEW = 'ikemenIKeMeterTelemetry';
const PAGE = 8;
const SIDES = 5;
const MAX_LINKS = 8;
const LINKED_SAMPLE_PAGE = 20;

function indexOfSample(frames, field, value) {
  let low = 0, high = frames.length - 1;
  while (low <= high) {
    const index = Math.floor((low + high) / 2), location = frames[index][field];
    if (location === value) return index;
    if (location < value) low = index + 1;
    else high = index - 1;
  }
  return -1;
}

function visibleEvent(event) {
  if (event.provenance === 'meter-diagnostic') return event;
  return {
    ...event, origin: 'unknown', severity: 'unknown', tickDomain: null, tick: null, entityId: null,
    stateNo: null, provenance: event.provenance === 'owned-stream' ? 'owned-stream' : 'unverified-source-parser'
  };
}

function indexLinkedSamples(clip) {
  const byFrame = new Map();
  for (const link of clip.links) {
    if (!byFrame.has(link.frameSeq)) byFrame.set(link.frameSeq, []);
    byFrame.get(link.frameSeq).push(link);
  }
  const samples = [];
  for (const frame of clip.frames) {
    const links = byFrame.get(frame.seq);
    if (links) samples.push({ seq: frame.seq, tick: frame.gameTime, count: links.length });
  }
  return { byFrame, samples };
}

function project(state) {
  const { clip, sha256, name, generation, index, eventPage, gapPage, linkPage = 0, linkSamplesPage = 0 } = state;
  const { byFrame, samples } = state.linkIndex || indexLinkedSamples(clip);
  const { session, retention, frames, events, gaps } = clip;
  const frame = frames[index] || null, start = Math.max(0, index - SIDES);
  const nearby = frames.slice(start, index + SIDES + 1).map((row, i) => {
    const prev = frames[start + i - 1];
    return { index: start + i, seq: row.seq, tick: row.gameTime, missing: row.missingSlots.length,
      gapBefore: !!prev && (prev.seq + 1 !== row.seq || prev.gameTime + 1 !== row.gameTime) };
  });
  const currentLinks = byFrame.get(frame?.seq) || [];
  return {
    generation, name, sha256, session, retention, index, frame, nearby,
    knownEngine: session.engineSha256 === PINNED_ENGINE_SHA256, frameCount: frames.length,
    clipSpanMs: frames.length ? frames.at(-1).receivedMs - frames[0].receivedMs : null,
    includeDiagnostics: clip.includeDiagnostics,
    events: events.slice(eventPage * PAGE, (eventPage + 1) * PAGE).map(visibleEvent),
    eventPage, eventPages: Math.ceil(events.length / PAGE), eventCount: events.length,
    gaps: gaps.slice(gapPage * PAGE, (gapPage + 1) * PAGE),
    gapPage, gapPages: Math.ceil(gaps.length / PAGE), gapCount: gaps.length,
    linkedSamples: samples.slice(linkSamplesPage * LINKED_SAMPLE_PAGE, (linkSamplesPage + 1) * LINKED_SAMPLE_PAGE),
    linkSamplesPage, linkSamplesPages: Math.ceil(samples.length / LINKED_SAMPLE_PAGE), linkedSampleCount: samples.length,
    previousLinkedSeq: samples.findLast(sample => sample.seq < frame?.seq)?.seq ?? null,
    nextLinkedSeq: samples.find(sample => sample.seq > frame?.seq)?.seq ?? null,
    linkCount: currentLinks.length,
    linkPage, linkPages: Math.ceil(currentLinks.length / MAX_LINKS),
    links: currentLinks.slice(linkPage * MAX_LINKS, (linkPage + 1) * MAX_LINKS).map(({ slot, findingId }) => ({ slot, findingId })),
    notice: state.notice || ''
  };
}

function client(fields) {
  const vscode = acquireVsCodeApi(), byId = id => document.getElementById(id);
  let model;
  const inertText = value => String(value).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, character =>
    '\\u{' + character.codePointAt(0).toString(16).toUpperCase() + '}');
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = inertText(text);
    return node;
  };
  const send = (type, value) => {
    if (model) vscode.postMessage({ type, generation: model.generation, value,
      ...(type === 'reviewLink' ? { frameSeq: model.frame.seq, linkPage: model.linkPage } : {}) });
  };
  const text = (id, value) => { byId(id).textContent = inertText(value); };
  const clear = id => { const node = byId(id); node.replaceChildren(); return node; };
  const nullable = value => value === null ? 'Unavailable' : String(value);
  function button(label, onClick) {
    const result = element('button', label);
    result.type = 'button';
    result.addEventListener('click', onClick);
    return result;
  }
  function tableRow(area, label, values) {
    const row = element('tr'), head = element('th', label);
    head.scope = 'row';
    row.append(head, ...values.map(value => element('td', value)));
    area.append(row);
  }
  function renderValues(frame, slots) {
    const head = clear('fieldsHead'), body = clear('fieldsBody'), row = element('tr');
    for (const label of ['Field', ...slots.map(slot => 'Player slot ' + slot)]) {
      const cell = element('th', label);
      cell.scope = 'col';
      row.append(cell);
    }
    head.append(row);
    const roots = slots.map(slot => frame?.roots.find(root => root.slot === slot));
    const missing = slots.map(slot => frame?.missingSlots.find(item => item.slot === slot)?.reason || 'no retained sample');
    tableRow(body, 'Identity', roots.map((root, index) => root ?
      'ID ' + root.id + ', lifetime ' + root.generation + ', team ' + nullable(root.teamSide) :
      'Unavailable (' + missing[index] + ')'));
    tableRow(body, 'GameTime (simulation ticks)', slots.map(() => frame ? frame.gameTime : 'Unavailable'));
    for (const [key, name, units] of fields) {
      const available = roots.map((root, index) => !root ? 'Unavailable (' + missing[index] + ')' :
        root.values[key] === null ? 'Unavailable (' + root.reasons[key] + ')' : root.values[key]);
      tableRow(body, units ? name + ' · ' + units : name, available);
    }
  }
  function pager(id, current, pages, action) {
    const target = clear(id);
    if (pages < 2) return;
    const previous = button('Previous', () => send(action, current - 1));
    previous.disabled = current === 0;
    const next = button('Next', () => send(action, current + 1));
    next.disabled = current + 1 >= pages;
    target.append(previous, element('span', ' Page ' + (current + 1) + ' of ' + pages + ' '), next);
  }
  function render(data) {
    model = data;
    byId('loading').hidden = true;
    byId('historyContent').hidden = false;
    const { frame, retention, session } = data;
    text('title', data.name);
    text('engine', 'Engine SHA-256 ' + session.engineSha256 + ' · ' +
      (data.knownEngine ? 'Known engine digest; capabilities reported by the clip' : 'Unverified engine and capability claims'));
    text('identity', 'Session ' + session.id + ' · epoch ' + session.epoch + ' · ' + session.phase);
    text('digest', 'Clip SHA-256 ' + data.sha256);
    text('retention', retention.seconds + ' s export policy · ' + data.frameCount + ' retained samples · ' +
      (data.clipSpanMs === null ? 'no sample span' : data.clipSpanMs / 1000 + ' s sample span') +
      ' · ' + retention.retainedBytes + ' / ' + retention.byteLimit + ' bytes; indexes ' + retention.indexBytes +
      ' · evicted frames ' + retention.evictedFrames + ', diagnostics ' + retention.evictedEvents);
    text('counters', 'Evictions by age ' + retention.evictedBy.age + ', bytes ' + retention.evictedBy.bytes +
      ', index ' + retention.evictedBy.index + ', event quota ' + retention.evictedBy.eventQuota +
      ' · duplicate callbacks ' + retention.duplicateCallbacks + ' · evicted through sequence ' + nullable(retention.evictedThroughSeq));
    text('selection', frame ? 'Sequence ' + frame.seq + ' · GameTime ' + frame.gameTime + ' · receipt ' +
      frame.receivedMs + ' ms · pause state ' + nullable(frame.paused) : 'No root samples in this clip.');
    for (const [id, value] of [['sampleSeq', frame?.seq], ['sampleTick', frame?.gameTime]]) {
      const control = byId(id);
      control.value = value === undefined ? '' : String(value);
      control.disabled = !frame;
    }
    const scrub = byId('scrub');
    scrub.max = String(Math.max(0, data.frameCount - 1));
    scrub.value = String(Math.max(0, data.index));
    scrub.disabled = data.frameCount < 2;
    for (const [id, disable] of [['prev', data.index <= 0], ['next', data.index + 1 >= data.frameCount],
      ['goSeq', !frame], ['goTick', !frame]]) byId(id).disabled = disable;
    const timeline = clear('nearby');
    for (const row of data.nearby) {
      const item = element('li');
      if (row.gapBefore) item.append(element('span', 'Gap before sample · '));
      const pick = button('Sequence ' + row.seq + ' · tick ' + row.tick + (row.missing ? ' · partial' : ''), () => send('index', row.index));
      if (row.index === data.index) pick.setAttribute('aria-current', 'true');
      item.append(pick);
      timeline.append(item);
    }
    renderValues(frame, session.rootSlots);

    const gapRows = clear('gaps');
    for (const gap of data.gaps) {
      const span = gap.fromTick === null ? 'Tick range unavailable' : 'Ticks ' + gap.fromTick + '–' + gap.toTick;
      gapRows.append(element('li', gap.kind + ' · ' + span + ' · receipt ' + gap.receivedMs +
        ' ms · count ' + nullable(gap.count) + ' · ' + gap.reason));
    }
    if (!data.gapCount) gapRows.append(element('li', 'No retained gap records.'));
    pager('gapPager', data.gapPage, data.gapPages, 'gapPage');

    text('diagnosticCoverage', 'Internal engine console: unavailable · stdout: ' + session.diagnostics.stdout +
      ' · stderr: ' + session.diagnostics.stderr + ' · upstream loss ' +
      (retention.upstreamLossUnknown ? 'unknown' : 'not marked unknown') +
      ' · dropped ' + retention.droppedEvents + ' · truncated ' + retention.truncatedEvents);
    text('warningNotice', data.includeDiagnostics ? 'Export includes diagnostic text, which may contain local paths.' :
      'Diagnostic text was excluded from this export.');
    const eventRows = clear('events');
    for (const event of data.events) {
      const row = element('li');
      const scope = event.tickDomain ? ' · ' + event.tickDomain + ' ' + event.tick : '';
      row.append(element('span', '#' + event.seq + ' · ' + event.source + ' · ' + event.origin +
        ' · ' + event.severity + ' · ' + event.provenance + ' · receipt ' + event.receivedMs + ' ms' + scope +
        (event.truncated ? ' · truncated' : '')));
      row.append(element('pre', event.text));
      eventRows.append(row);
    }
    if (!data.eventCount) eventRows.append(element('li', 'No diagnostic events in this clip.'));
    pager('eventPager', data.eventPage, data.eventPages, 'eventPage');

    const linkedSamples = clear('linkedSamples');
    for (const sample of data.linkedSamples) {
      const item = element('li');
      const jump = button('Sequence ' + sample.seq + ' · tick ' + sample.tick + ' · findings ' + sample.count,
        () => send('seq', sample.seq));
      if (frame?.seq === sample.seq) jump.setAttribute('aria-current', 'true');
      item.append(jump);
      linkedSamples.append(item);
    }
    if (!data.linkedSampleCount) linkedSamples.append(element('li', 'No samples with linked findings in this clip.'));
    pager('linkedSamplePager', data.linkSamplesPage, data.linkSamplesPages, 'linkSamplesPage');
    byId('previousLinkedSample').disabled = data.previousLinkedSeq === null;
    byId('nextLinkedSample').disabled = data.nextLinkedSeq === null;

    const links = clear('links');
    for (const [index, link] of data.links.entries()) {
      const item = element('li');
      item.append(button('Review linked finding · player slot ' + link.slot + ' · ' + link.findingId,
        () => send('reviewLink', index)));
      links.append(item);
    }
    if (!data.linkCount) links.append(element('li', 'No finding is linked to this sample.'));
    pager('linkPager', data.linkPage, data.linkPages, 'linkPage');
    text('notice', data.notice);
  }

  addEventListener('message', event => {
    if (event.data?.type === 'telemetryLoading') {
      model = undefined;
      byId('historyContent').hidden = true;
      byId('loading').hidden = false;
      for (const id of ['title', 'identity', 'engine', 'digest']) text(id, '');
      return;
    }
    if (event.data?.type === 'telemetryProjection') render(event.data.model);
  });
  byId('prev').addEventListener('click', () => send('index', model.index - 1));
  byId('next').addEventListener('click', () => send('index', model.index + 1));
  byId('previousLinkedSample').addEventListener('click', () => send('seq', model?.previousLinkedSeq));
  byId('nextLinkedSample').addEventListener('click', () => send('seq', model?.nextLinkedSeq));
  let scrubPending = false, scrubTarget;
  byId('scrub').addEventListener('input', event => {
    scrubTarget = { value: Number(event.target.value), generation: model?.generation };
    if (scrubPending) return;
    scrubPending = true;
    requestAnimationFrame(() => {
      scrubPending = false;
      if (scrubTarget.generation === model?.generation) send('index', scrubTarget.value);
    });
  });
  for (const [form, input, action] of [['seqForm', 'sampleSeq', 'seq'], ['tickForm', 'sampleTick', 'gameTime']]) {
    byId(form).addEventListener('submit', event => {
      event.preventDefault();
      if (byId(input).value !== '') send(action, Number(byId(input).value));
    });
  }
  vscode.postMessage({ type: 'ready' });
}

function html() {
  const nonce = randomBytes(18).toString('base64');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-' + nonce +
    '\'; style-src \'nonce-' + nonce + '\'">' +
    '<title>IKeMeter Telemetry</title><style nonce="' + nonce + '">' +
    'body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:1rem;max-width:80rem;margin:auto;overflow-wrap:anywhere}' +
    'h1{margin:.3rem 0}h2{margin:1rem 0 .4rem}p{margin:.3rem 0}.muted{color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}' +
    '.controls{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;padding:.6rem 0}button,input{font:inherit}' +
    'button{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-contrastBorder,transparent);padding:.25rem .5rem;cursor:pointer}' +
    'button:disabled{opacity:.55;cursor:default}input{background:var(--vscode-input-background);color:var(--vscode-input-foreground);width:7rem}' +
    '#scrub{width:min(28rem,70vw)}[aria-current=true]{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}' +
    '.table-scroll{max-width:100%;overflow-x:auto}.table-scroll:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}' +
    'table{border-collapse:separate;border-spacing:0;width:100%;text-align:left;table-layout:auto}th,td{padding:.3rem .45rem;border-bottom:1px solid var(--vscode-panel-border)}' +
    'td,thead th:not(:first-child){min-width:6.5rem}tr>th:first-child{position:sticky;left:0;z-index:1;min-width:6rem;width:clamp(6rem,28vw,11rem);max-width:11rem;background:var(--vscode-editor-background);overflow-wrap:anywhere;border-inline-end:1px solid var(--vscode-panel-border)}' +
    'li{margin:.2rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:.25rem 0}summary{cursor:pointer}section{margin-bottom:1rem}' +
    presentation.style()+'</style></head><body><header><h1>IKeMeter Telemetry</h1>'+presentation.chooserHtml()+'<p>Exported history · <span id="title"></span></p>' +
    '<p class="muted" id="identity"></p><p class="muted" id="engine"></p><p class="muted" id="digest"></p></header>' +
    '<p id="loading" role="status">Loading exported telemetry…</p><main id="historyContent" hidden><section aria-labelledby="history"><h2 id="history">History</h2><p id="retention"></p><p class="muted" id="counters"></p>' +
    '<p id="selection" aria-live="polite"></p><div class="controls"><button id="prev" type="button" disabled data-ikm-action-icon="◀" aria-label="Previous sample" title="Previous sample"><span data-ikm-action-label>Previous sample</span></button>' +
    '<label for="scrub">Sample</label><input id="scrub" type="range" min="0" max="0" disabled>' +
    '<button id="next" type="button" disabled data-ikm-action-icon="▶" aria-label="Next sample" title="Next sample"><span data-ikm-action-label>Next sample</span></button></div><div class="controls">' +
    '<form id="seqForm"><label for="sampleSeq">Sequence </label><input id="sampleSeq" type="number" min="1" step="1" disabled>' +
    ' <button id="goSeq" disabled>Go to sequence</button></form>' +
    '<form id="tickForm"><label for="sampleTick">GameTime </label><input id="sampleTick" type="number" min="0" step="1" disabled>' +
    ' <button id="goTick" disabled>Go to tick</button></form></div><p id="notice" role="status"></p>' +
    '<details><summary>Nearby samples</summary><ol id="nearby"></ol></details></section>' +
    '<section aria-labelledby="values"><h2 id="values">Player values at selected sample</h2>' +
    '<p class="muted">Values and owner slots are observations. Owner slots alone do not locate source files.</p>' +
    '<div class="table-scroll" role="region" aria-label="Player values table" tabindex="0"><table><thead id="fieldsHead"></thead><tbody id="fieldsBody"></tbody></table></div></section>' +
    '<section><h2>Findings</h2><div class="controls">' +
    '<button id="previousLinkedSample" type="button" disabled data-ikm-action-icon="◀" aria-label="Previous linked sample" title="Previous linked sample"><span data-ikm-action-label>Previous linked sample</span></button>' +
    '<button id="nextLinkedSample" type="button" disabled data-ikm-action-icon="▶" aria-label="Next linked sample" title="Next linked sample"><span data-ikm-action-label>Next linked sample</span></button></div>' +
    '<details><summary>Samples with linked findings</summary><ol id="linkedSamples"></ol><div id="linkedSamplePager"></div></details>' +
    '<ul id="links"></ul><div id="linkPager"></div></section>' +
    '<section><h2>Coverage gaps</h2><ul id="gaps"></ul><div id="gapPager"></div></section>' +
    '<section><h2>Diagnostics</h2><p id="diagnosticCoverage"></p><p id="warningNotice"></p><ul id="events"></ul><div id="eventPager"></div></section>' +
    '</main><script nonce="' + nonce + '">(' + client.toString().replace("const vscode = acquireVsCodeApi(), byId = id => document.getElementById(id);", "const vscode = acquireVsCodeApi(), byId = id => document.getElementById(id);"+presentation.clientScript({vscodeVariable:'vscode'})) + ')(' + JSON.stringify(FIELDS) + ')</script></body></html>';
}

function createHistory(receipt, name) {
  const { clip, sha256 } = receipt;
  const linkIndex = indexLinkedSamples(clip);
  const state = { clip, sha256, name, linkIndex, index: clip.frames.length - 1,
    eventPage: 0, gapPage: 0, linkPage: 0, linkSamplesPage: 0 };
  return {
    snapshot: () => project(state),
    request(type, value) {
      const { frames, session } = clip;
      state.notice = '';
      if (type === 'index' || type === 'seq' || type === 'gameTime') {
        const index = type === 'index' ? value : indexOfSample(frames, type, value);
        if (index < 0 || index >= frames.length) state.notice = 'No retained sample at that location.';
        else if (index !== state.index) {
          state.index = index;
          state.linkPage = 0;
        }
      } else if (type === 'eventPage' || type === 'gapPage') {
        const rows = type === 'eventPage' ? clip.events : clip.gaps;
        if (value >= Math.ceil(rows.length / PAGE)) return null;
        state[type] = value;
      } else if (type === 'linkPage') {
        const count = linkIndex.byFrame.get(frames[state.index]?.seq)?.length || 0;
        if (value >= Math.ceil(count / MAX_LINKS)) return null;
        state.linkPage = value;
      } else if (type === 'linkSamplesPage') {
        if (value >= Math.ceil(linkIndex.samples.length / LINKED_SAMPLE_PAGE)) return null;
        state.linkSamplesPage = value;
      } else if (type === 'reviewLink') {
        const frame = frames[state.index];
        if (!frame || frame.seq !== value.frameSeq || state.linkPage !== value.linkPage || value.index >= MAX_LINKS) return null;
        const link = linkIndex.byFrame.get(frame.seq)?.[value.linkPage * MAX_LINKS + value.index];
        if (!link) return null;
        const { values } = frame.roots.find(root => root.slot === link.slot);
        return { clipSha256: sha256, sessionId: session.id, epoch: session.epoch, tick: frame.gameTime, ...link,
          engineSha256: session.engineSha256,
          ownerSlots: { source: values.stateOwnerSlot, air: values.animOwnerSlot, sprite: values.spriteOwnerSlot } };
      } else return null;
      return project(state);
    }
  };
}

function createManager(vscode, services = {}) {
  let panel, state, pendingHistory, delivery, generation = 0, busy = false, disposed = false;
  let retiring = Promise.resolve(true);
  const trusted = () => vscode.workspace.isTrusted === true && !vscode.env?.remoteName;
  const warn = message => void Promise.resolve(vscode.window.showWarningMessage(message)).catch(() => {});

  function forget() {
    const history = pendingHistory || state?.history;
    pendingHistory = undefined;
    state = undefined;
    if (history) {
      const close = Promise.resolve().then(() => history.close()).catch(() => false);
      retiring = Promise.all([retiring, close]).then(results => results.every(result => result !== false));
    }
    return retiring;
  }

  function deliver(owner, message) {
    if (owner !== panel || !trusted()) return;
    const target = delivery;
    target.latest = message;
    if (target.sending) return;
    target.sending = true;
    void (async () => {
      try {
        while (owner === panel && trusted() && target.latest) {
          const next = target.latest;
          target.latest = undefined;
          try { await owner.webview.postMessage(next); }
          catch { /* A closing webview cannot receive its projection. */ }
        }
      } finally {
        target.sending = false;
      }
    })();
  }

  function publish(owner) {
    if (owner === panel && state && trusted()) {
      deliver(owner, { type: 'telemetryProjection', model: { ...state.model, generation: state.generation } });
    }
  }

  async function handle(owner, message) {
    if (owner !== panel || !state || !trusted()) return;
    if (!message || typeof message !== 'object' || Array.isArray(message)) return;
    if (presentation.isMessage(message)) return presentation.handle(message, owner);
    const { type, value, frameSeq, linkPage } = message, keys = Object.keys(message).sort().join(',');
    if (type === 'ready' && keys === 'type') return publish(owner);
    if (keys !== (type === 'reviewLink' ? 'frameSeq,generation,linkPage,type,value' : 'generation,type,value') ||
        message.generation !== state.generation || !Number.isSafeInteger(value) || value < 0) return;

    const active = state;
    const current = () => state === active && owner === panel && trusted();
    if (type === 'reviewLink') {
      if (active.reviewing || !Number.isSafeInteger(frameSeq) || frameSeq !== active.model.frame?.seq || linkPage !== active.model.linkPage ||
          value >= MAX_LINKS || active.queue.has('sample') || active.inFlight === 'sample' ||
          active.queue.has('linkPage') || active.inFlight === 'linkPage') return;
      const revision = active.selectionRevision;
      const isCurrent = () => current() && active.selectionRevision === revision && active.model.frame?.seq === frameSeq &&
        active.model.linkPage === linkPage;
      active.reviewing = true;
      try {
        const evidence = await active.history.request(type, { index: value, frameSeq, linkPage });
        if (!evidence || !isCurrent()) return;
        const result = services.reviewFinding && await services.reviewFinding(evidence, isCurrent);
        if (!isCurrent()) return;
        if (result?.status === 'unmatched') {
          active.model.notice = 'No matching findings receipt is open. Import the separate Findings file and try again.';
        } else if (result?.status === 'closed') {
          active.model.notice = 'The linked finding matched and the review closed.';
        } else if (result?.status === 'reviewed') {
          active.model.notice = '';
        } else {
          active.model.notice = 'The linked review is unavailable. Try again when the findings review is ready.';
        }
      } finally {
        active.reviewing = false;
      }
    } else {
      if (!['index', 'seq', 'gameTime', 'eventPage', 'gapPage', 'linkPage', 'linkSamplesPage'].includes(type)) return;
      const key = ['index', 'seq', 'gameTime'].includes(type) ? 'sample' : type;
      if (key === 'sample' || key === 'linkPage') active.selectionRevision++;
      active.queue.set(key, { type, value });
      if (active.inFlight) return;
      try {
        while (current() && active.queue.size) {
          const [pendingKey, request] = active.queue.entries().next().value;
          active.queue.delete(pendingKey);
          active.inFlight = pendingKey;
          const model = await active.history.request(request.type, request.value);
          if (!model || !current() || active.queue.has('sample') || active.queue.has(pendingKey)) continue;
          active.model = model;
          publish(owner);
        }
      } finally {
        active.inFlight = '';
      }
      return;
    }
    publish(owner);
  }

  async function open() {
    if (disposed || busy) return false;
    if (!trusted()) {
      warn('IKeMeter Telemetry requires a trusted local workspace.');
      return false;
    }
    busy = true;
    let previous, canceled = false;
    try {
      const files = await vscode.window.showOpenDialog({
        title: 'Import IKeMeter Telemetry', canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
        filters: { 'Telemetry clips': ['json'] }
      });
      const file = files?.[0];
      if (!file || disposed || !trusted()) return false;
      if (file.scheme !== 'file' || !path.isAbsolute(file.fsPath)) throw new Error('Choose a local telemetry file.');
      // A new import replaces the in-memory history. Release it before starting another worker.
      previous = panel;
      if (previous) deliver(previous, { type: 'telemetryLoading' });
      const retired = await forget();
      if (disposed || !trusted() || (previous && previous !== panel)) return false;
      if (!retired) throw new Error('The previous history could not close. Reopen the IKEMaker window before importing again.');
      const start = services.startHistory || require('./ikemeter_telemetry_session').startHistory;
      const loaded = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification, title: 'Importing IKeMeter Telemetry', cancellable: true
      }, async (_progress, token) => {
        if (token.isCancellationRequested) {
          canceled = true;
          return null;
        }
        const history = start(file.fsPath, path.basename(file.fsPath));
        pendingHistory = history;
        const subscription = token.onCancellationRequested(() => {
          canceled = true;
          if (pendingHistory === history) void forget();
        });
        try {
          const model = await history.ready;
          if (canceled || disposed || !trusted() || pendingHistory !== history) {
            await forget();
            return null;
          }
          return { history, model };
        } finally {
          subscription.dispose();
        }
      });
      if (!loaded || disposed || !trusted() || pendingHistory !== loaded.history) {
        await forget();
        if (previous && panel === previous) panel.dispose();
        return false;
      }
      pendingHistory = undefined;
      state = { history: loaded.history, model: loaded.model, generation: ++generation, selectionRevision: 0,
        queue: new Map(), inFlight: '', reviewing: false };
      if (!panel) {
        panel = vscode.window.createWebviewPanel(VIEW, 'IKeMeter Telemetry', vscode.ViewColumn.Active,
          { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
        const owner = panel;
        delivery = { latest: undefined, sending: false };
        owner.onDidDispose(() => {
          if (panel !== owner) return;
          panel = undefined;
          delivery = undefined;
          void forget();
        });
        owner.webview.onDidReceiveMessage(message => {
          void handle(owner, message).catch(() => {
            if (owner === panel && !busy) warn('The selected telemetry action could not finish.');
          });
        });
        owner.webview.html = html();
      } else {
        panel.reveal();
        publish(panel);
      }
      return true;
    } catch (error) {
      const closedByUser = canceled || (previous && previous !== panel);
      await forget();
      if (panel) panel.dispose();
      if (!closedByUser && !disposed && trusted()) warn('IKeMeter Telemetry · ' + error.message);
      return false;
    } finally {
      busy = false;
    }
  }

  return { open, dispose() { disposed = true; panel?.dispose(); panel = undefined; void forget(); } };
}

function register(vscode, context, services) {
  const manager = createManager(vscode, services);
  context.subscriptions.push(manager, vscode.commands.registerCommand(COMMAND, () => manager.open()));
}

module.exports = { COMMAND, VIEW, createManager, register, indexOfSample, project, createHistory, html };

