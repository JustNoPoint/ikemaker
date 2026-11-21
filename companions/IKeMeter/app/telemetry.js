'use strict';

const endpoint = '/api/telemetry';
const maxDownloadBytes = 64 * 1024 * 1024;
const fields = {
  posX: 'Position X (units)', posY: 'Position Y (units)', posZ: 'Position Z (units)',
  velX: 'Velocity X (units/tick)', velY: 'Velocity Y (units/tick)', velZ: 'Velocity Z (units/tick)',
  configuredYAccel: 'Configured Y acceleration (units/tick²)', effectiveGravity: 'Effective gravity (units/tick²)',
  stateNo: 'State', prevStateNo: 'Previous state', anim: 'Animation', ctrl: 'Control',
  moveType: 'Move type', stateType: 'State type', physics: 'Physics',
  stateTime: 'State time (ticks)', hitPauseTime: 'Hit pause (ticks)', pauseTime: 'Pause time (ticks)',
  facing: 'Facing', cameraPosX: 'Camera X (units)', localCoordX: 'Local coordinate X', localCoordY: 'Local coordinate Y',
  stateOwnerSlot: 'State owner slot', animOwnerSlot: 'Animation owner slot', spriteOwnerSlot: 'Sprite owner slot',
  runOrder: 'Run order', spriteGroup: 'Sprite group', spriteImage: 'Sprite image',
  drawPalGroup: 'Draw palette group', drawPalIndex: 'Draw palette index', palNo: 'Selected palette',
};

// Visible escapes leave local paths copyable without carrying control or bidi characters.
function inertText(value) {
  return String(value).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, char =>
    '\\u{' + char.codePointAt(0).toString(16).toUpperCase() + '}');
}

function readInteger(value) {
  return /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

function sessionKey(session) {
  return session ? JSON.stringify([session.id, session.epoch, session.engineSha256, session.phase,
    session.rootSlots, Object.keys(fields).map(key => session.capabilities[key]), session.diagnostics]) : null;
}

async function readClip(response) {
  const length = readInteger(response.headers.get('Content-Length') || '');
  if (!length || length > maxDownloadBytes || !response.body ||
      !/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type') || '')) {
    await response.body?.cancel();
    throw Error('Unexpected clip response. Try a smaller range.');
  }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(length);
  let received = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      if (value.byteLength > length - received) throw Error('Clip exceeded the reported download size.');
      bytes.set(value, received);
      received += value.byteLength;
    }
    if (received !== length) throw Error('Clip download ended early. Try a smaller range.');
    return new Blob([bytes], { type: 'application/json' });
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function mountTelemetry(document, browser) {
  const byId = id => document.getElementById(id);
  const show = (id, text) => { if (byId(id).textContent !== text) byId(id).textContent = text; };
  const element = (name, text) => {
    const node = document.createElement(name);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const display = value => value == null ? 'unknown' : inertText(value);
  const withSession = (session, values = {}) => new URLSearchParams({session: session.id, epoch: session.epoch, ...values});
  const local = {cache: 'no-store', mode: 'same-origin', redirect: 'error'};
  const action = {...local, method: 'POST', headers: {'x-ikemeter-action': '1'}};
  const eventRows = new Map();
  const noEvents = element('li', 'No retained diagnostics reported.');
  let view, selection, poll, revision = 0, sessionRevision = 0;
  let retentionBusy = false, draftRetention = false, download;

  function renderTimeline() {
    const session = view?.session;
    const frame = view?.selected;
    const hasFrames = Number.isSafeInteger(view?.firstSeq);
    const rewound = view?.gaps?.some(gap => gap.kind === 'discontinuity' && gap.reason === 'game-clock-rewind');
    const captureStatus = view?.live ? 'Collecting' :
      `Session ended${rewound ? ' after GameTime rewound' : ''}. Start a new session from Overview to resume collecting.`;
    byId('status').classList.toggle('connected', Boolean(view?.live));
    show('status', !view ? 'Telemetry is unavailable.' : !session ? 'No player telemetry session.' :
      `${captureStatus} · ${session.rootSlots.length} root slots · epoch ${session.epoch} · ${display(session.phase)} · engine SHA-256 ${display(session.engineSha256)}`);

    const scrub = byId('scrub');
    scrub.disabled = !hasFrames;
    scrub.min = view?.firstSeq ?? 1;
    scrub.max = view?.lastSeq ?? 1;
    scrub.value = frame?.seq ?? selection?.seq ?? scrub.value;
    scrub.setAttribute('aria-valuetext', frame ? `Sequence ${frame.seq}, GameTime ${frame.gameTime}` : 'No observation selected');
    byId('previous').disabled = !frame || frame.seq <= view.firstSeq;
    byId('next').disabled = !frame || frame.seq >= view.lastSeq;
    byId('follow').disabled = !session;
    byId('follow').setAttribute('aria-pressed', String(!selection));
    byId('exact').disabled = byId('seek').disabled = !session;
    show('selection', frame ?
      `GameTime ${frame.gameTime} · sequence ${frame.seq} · received +${frame.receivedMs} ms · pause ${display(frame.paused)}` :
      selection?.tick !== undefined ? `No retained observation at exact GameTime ${selection.tick}.` :
      selection?.seq !== undefined ? `Sequence ${selection.seq} ${view?.selectionStatus === 'evicted' ? 'was evicted' : 'is unavailable'}.` :
      'No retained observation.');

    const seconds = byId('seconds');
    const retention = view?.retention;
    seconds.disabled = byId('apply').disabled = !view || retentionBusy;
    if (!draftRetention && view) seconds.value = retention?.seconds ?? view.seconds;
    show('retention', retention ?
      `${retention.seconds} s · ${view.frameCount} retained observations · ${view.eventCount} retained diagnostics · ${retention.retainedBytes}/${retention.byteLimit} bytes (${retention.indexBytes} index bytes) · frame sequences ${hasFrames ? `${view.firstSeq}–${view.lastSeq}` : 'none'} · receipt clock +${retention.exportedAtMs} ms\n` +
      `Evicted ${retention.evictedFrames} observations and ${retention.evictedEvents} diagnostics · through sequence ${display(retention.evictedThroughSeq)} · records evicted by age ${retention.evictedBy.age}, bytes ${retention.evictedBy.bytes}, index ${retention.evictedBy.index}, event quota ${retention.evictedBy.eventQuota}\n` +
      `Dropped ${retention.droppedEvents} diagnostics · ${retention.truncatedEvents} truncated diagnostics · upstream loss ${retention.upstreamLossUnknown ? 'unknown' : 'known'} · ${retention.duplicateCallbacks} duplicate callbacks`
      : view ? `${view.seconds} s retention` : '');
    for (const id of ['first', 'last', 'include-diagnostics', 'download']) byId(id).disabled = !session || Boolean(download);
    byId('first').placeholder = view?.firstSeq ?? '';
    byId('last').placeholder = view?.lastSeq ?? '';
  }

  function renderRoots() {
    const frame = view?.selected;
    const session = view?.session;
    const cards = (session?.rootSlots ?? []).map(slot => {
      const root = frame?.roots.find(row => row.slot === slot);
      const card = element('div');
      card.className = 'root-card';
      card.append(element('h3', `Slot ${slot}`));
      if (root) {
        card.append(element('p', `Team side ${display(root.teamSide)} · ID ${root.id} · generation ${root.generation} · validity mask 0x${root.validMask.toString(16)}`));
      } else {
        const missing = frame?.missingSlots.find(row => row.slot === slot);
        card.append(element('p', missing ? `Missing root · ${display(missing.reason)}` : 'No observation selected.'));
      }
      const table = element('table');
      table.setAttribute('aria-label', `Slot ${slot} fields and capabilities`);
      for (const [key, label] of Object.entries(fields)) {
        const row = table.insertRow();
        const heading = element('th', label);
        heading.scope = 'row';
        const value = root?.values[key];
        const capability = display(session.capabilities[key]);
        row.append(heading, element('td', root && value == null ? `— · ${display(root.reasons[key])} · ${capability}` :
          root ? `${display(value)} · ${capability}` : capability));
      }
      card.append(table);
      return card;
    });
    byId('roots').replaceChildren(...cards);
  }

  function renderGaps() {
    const gaps = (view?.gaps ?? []).map(gap => element('li',
      `+${gap.receivedMs} ms · ${display(gap.kind)} · ${display(gap.reason)} · GameTime ${gap.fromTick == null ? 'unknown' : `${gap.fromTick}–${gap.toTick}`} · count ${display(gap.count)}`));
    byId('gaps').replaceChildren(...(gaps.length ? gaps : [element('li', 'No recent gaps reported.')]));
  }

  function renderDiagnostics(reset) {
    const session = view?.session;
    show('streams', session ?
      `stdout ${display(session.diagnostics.stdout)} · stderr ${display(session.diagnostics.stderr)} · internal console ${display(session.diagnostics.internalConsole)}` : 'No diagnostic source.');

    const list = byId('events');
    const events = view?.events ?? [];
    if (reset || !events.length) {
      eventRows.clear();
      list.replaceChildren(...(events.length ? [] : [noEvents]));
    }
    if (!events.length) return;

    noEvents.remove();
    const retained = new Set(events.map(event => event.seq));
    for (const [seq, row] of eventRows) {
      if (!retained.has(seq)) {
        row.remove();
        eventRows.delete(seq);
      }
    }
    for (const event of events) {
      if (eventRows.has(event.seq)) continue;
      const row = element('li');
      const detail = element('div',
        `#${event.seq} · +${event.receivedMs} ms · source ${display(event.source)} · origin ${display(event.origin)} · severity ${display(event.severity)} · provenance ${display(event.provenance)} · ` +
        `clock ${display(event.tickDomain)} · tick ${display(event.tick)} · entity ${display(event.entityId)} · state ${display(event.stateNo)} · original bytes ${display(event.originalBytes)} · truncated ${display(event.truncated)}`);
      const message = element('pre', inertText(event.text));
      message.className = 'diagnostic-text';
      row.append(detail, message);
      eventRows.set(event.seq, row);
      list.append(row);
    }
  }

  function update(next) {
    const prior = view;
    const changedSession = sessionKey(prior?.session) !== sessionKey(next?.session);
    view = next;
    if (changedSession) {
      revision++;
      sessionRevision++;
      selection = null;
      draftRetention = false;
      for (const id of ['first', 'last', 'exact']) byId(id).value = '';
      byId('include-diagnostics').checked = false;
      if (download) {
        download.abort();
        show('export-result', 'Session changed during download. Choose a range in the current session.');
      } else show('export-result', '');
      show('retention-result', '');
    }
    renderTimeline();
    if (changedSession || prior?.selected?.seq !== next?.selected?.seq) renderRoots();
    if (changedSession || JSON.stringify(prior?.gaps) !== JSON.stringify(next?.gaps)) renderGaps();
    const eventsChanged = prior?.events?.length !== next?.events?.length || prior?.events?.at(-1)?.seq !== next?.events?.at(-1)?.seq;
    if (changedSession || eventsChanged) renderDiagnostics(changedSession);
  }

  async function refresh() {
    if (poll) return;
    const request = new AbortController();
    poll = request;
    const current = view?.session;
    const expected = revision;
    try {
      const options = {...local, signal: AbortSignal.any([request.signal, AbortSignal.timeout(4000)])};
      let response = await browser.fetch(selection && current ? `${endpoint}?${withSession(current, selection)}` : endpoint, options);
      if (response.status === 409 && selection && current) {
        if (revision !== expected || request.signal.aborted) return;
        response = await browser.fetch(endpoint, options);
      }
      if (!response.ok) throw Error('Telemetry is unavailable.');
      const next = await response.json();
      if (revision === expected && !request.signal.aborted) update(next);
    } catch {
      if (revision === expected && !request.signal.aborted) update(undefined);
    } finally {
      if (poll === request) poll = null;
    }
  }

  function refreshNow() {
    revision++;
    poll?.abort();
    poll = null;
    return refresh();
  }

  function select(next) {
    if (!view?.session) return;
    selection = next;
    byId('follow').setAttribute('aria-pressed', String(!selection));
    refreshNow();
  }

  byId('scrub').addEventListener('input', event => select({seq: Number(event.target.value)}));
  byId('previous').addEventListener('click', () => select({seq: view.selected.seq - 1}));
  byId('next').addEventListener('click', () => select({seq: view.selected.seq + 1}));
  byId('follow').addEventListener('click', () => select(null));
  byId('exact-form').addEventListener('submit', event => {
    event.preventDefault();
    const tick = readInteger(byId('exact').value);
    if (tick !== null && tick <= 2147483647) select({tick});
  });
  byId('seconds').addEventListener('change', () => { draftRetention = true; });
  byId('retention-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!view || retentionBusy) return;
    const params = view.session ? withSession(view.session) : new URLSearchParams();
    const expectedSession = sessionRevision;
    params.set('seconds', byId('seconds').value);
    retentionBusy = true;
    renderTimeline();
    try {
      const response = await browser.fetch(`${endpoint}/retention?${params}`, {...action, signal: AbortSignal.timeout(4000)});
      const result = await response.json();
      if (expectedSession !== sessionRevision) return;
      if (!response.ok || result.seconds !== Number(params.get('seconds'))) throw Error('Could not set retention.');
      draftRetention = false;
      if (view.retention) view.retention = {...view.retention, seconds: result.seconds};
      else view.seconds = result.seconds;
      show('retention-result', `Retention set to ${result.seconds} seconds.`);
    } catch (error) {
      if (expectedSession === sessionRevision) show('retention-result', inertText(error.message));
    } finally {
      retentionBusy = false;
      renderTimeline();
      refreshNow();
    }
  });

  byId('export-form').addEventListener('submit', async event => {
    event.preventDefault();
    const session = view?.session;
    if (!session || download) return;
    const expectedSession = sessionRevision;
    const params = withSession(session);
    const firstValue = byId('first').value, lastValue = byId('last').value;
    if (firstValue || lastValue) {
      const first = readInteger(firstValue), last = readInteger(lastValue);
      if (first == null || last == null || first > last || !view.firstSeq || first < view.firstSeq || last > view.lastSeq) {
        show('export-result', 'Enter both endpoints of a retained receipt sequence range.');
        return;
      }
      params.set('first', first);
      params.set('last', last);
    }
    const includeDiagnostics = byId('include-diagnostics').checked;
    params.set('diagnostics', includeDiagnostics ? '1' : '0');
    byId('include-diagnostics').checked = false;
    download = new AbortController();
    renderTimeline();
    show('export-result', 'Preparing the local download…');
    try {
      const response = await browser.fetch(`${endpoint}/export?${params}`,
        {...action, signal: AbortSignal.any([download.signal, AbortSignal.timeout(30000)])});
      if (!response.ok) {
        // The local route emits bounded errors. Never turn their text into DOM.
        const result = await response.json();
        throw Error(result.error || 'The clip could not be exported.');
      }
      const clip = await readClip(response);
      if (download.signal.aborted || expectedSession !== sessionRevision) return;
      const url = browser.URL.createObjectURL(clip);
      const link = element('a');
      link.download = 'ikemeter-player-telemetry.json';
      link.href = url;
      try { link.click(); }
      finally { browser.setTimeout(() => browser.URL.revokeObjectURL(url), 1000); }
      show('export-result', `Local download started. Diagnostic text ${includeDiagnostics ? 'included' : 'excluded'}.`);
    } catch (error) {
      if (!download.signal.aborted && expectedSession === sessionRevision) show('export-result', inertText(error.message));
    } finally {
      download = null;
      renderTimeline();
      refreshNow();
    }
  });

  renderGaps();
  renderDiagnostics(true);
  refresh();
  browser.setInterval(refresh, 500);
}

if (typeof document !== 'undefined') mountTelemetry(document, window);
if (typeof module !== 'undefined') module.exports = {fields, inertText, readClip, mountTelemetry};
