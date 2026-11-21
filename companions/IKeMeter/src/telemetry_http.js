'use strict';

const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

function numberParam(params, key) {
  if (!params.has(key)) return undefined;
  const text = params.get(key);
  if (!/^(0|[1-9]\d*)$/.test(text) || !Number.isSafeInteger(Number(text))) throw Error('Invalid ' + key);
  return Number(text);
}

function matchSession(collector, params) {
  if (collector.session?.id !== params.get('session') || collector.session.epoch !== numberParam(params, 'epoch')) {
    throw Error('The telemetry session changed');
  }
}

function createTelemetryRoute(sendJson) {
  let exporting = false;
  return async function handle(request, response, expectedHost, collector) {
    const url = new URL(request.url, 'http://localhost');
    const params = url.searchParams;
    response.setHeader('Cache-Control','no-store');
    try {
      if (request.method === 'GET' && url.pathname === '/api/telemetry') {
        const seq = numberParam(params, 'seq'), tick = numberParam(params, 'tick');
        if (seq !== undefined || tick !== undefined) matchSession(collector, params);
        if (seq !== undefined && tick !== undefined) throw Error('Choose one observation selector');
        sendJson(response, 200, collector.view({seq,tick}));
        return;
      }
      if (request.method !== 'POST' || request.headers.origin !== 'http://' + expectedHost ||
          request.headers['x-ikemeter-action'] !== '1') {
        sendJson(response, 403, {error:'Local telemetry action required'});
        return;
      }
      if (url.pathname === '/api/telemetry/retention') {
        if (params.has('session') || params.has('epoch')) matchSession(collector, params);
        collector.setSeconds(numberParam(params, 'seconds'));
        sendJson(response, 200, {seconds:collector.seconds});
        return;
      }
      if (url.pathname !== '/api/telemetry/export') {
        sendJson(response, 404, {error:'Unknown telemetry action'});
        return;
      }
      matchSession(collector, params);
      if (exporting) throw Error('A clip export is already in progress');
      const clip = collector.exportClip({firstSeq:numberParam(params,'first'),lastSeq:numberParam(params,'last'),
        includeDiagnostics:params.get('diagnostics') === '1'});
      exporting = true;
      try {
        response.setHeader('Content-Type','application/json');
        response.setHeader('Content-Disposition','attachment; filename="ikemeter-player-telemetry.json"');
        response.setHeader('Content-Length',clip.length);
        response.setTimeout(15000, () => response.destroy());
        await pipeline(Readable.from(clip.chunks, {objectMode:false}),response);
      } finally { exporting = false; }
    } catch (error) {
      if (!response.headersSent && !response.destroyed) sendJson(response,409,{error:error.message});
      else response.destroy();
    }
  };
}

module.exports = {createTelemetryRoute};

