'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { SessionController } = require('./session_controller');

const appRoot = path.resolve(__dirname, '..', 'app');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function sendJson(response, statusCode, value) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

function actionAuthority(headers){
 const names=['x-ikemeter-session','x-ikemeter-epoch','x-ikemeter-continuity'];if(names.every(name=>headers[name]===undefined))return null;
 const [sessionId,epoch,revision]=names.map(name=>headers[name]);if(typeof sessionId!=='string'||!sessionId||sessionId.length>160||!/^[1-9]\d*$/.test(epoch||'')||!/^(?:0|[1-9]\d*)$/.test(revision||''))return false;
 const value={sessionId,epoch:Number(epoch),continuityRevision:Number(revision)};return Number.isSafeInteger(value.epoch)&&Number.isSafeInteger(value.continuityRevision)?value:false;
}

function createAppServer(options = {}) {
  const controller = options.controller || new SessionController({
    async connect() { throw new Error('No attached-nightly driver configured'); },
  });
  let server;
  server = http.createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const address = server.address();
    const expectedHost = options.expectedHost || (address && typeof address === 'object' ? `127.0.0.1:${address.port}` : '');
    const host = request.headers?.host || '';
    if (request.url?.startsWith('/api/') && (!expectedHost || host !== expectedHost)) {
      sendJson(response, 403, { error: 'Local API request rejected' }); return;
    }
    if (request.url === '/api/status') {
      sendJson(response, 200, controller.status());
      return;
    }
    if (request.url === '/api/history' && request.method === 'GET') {
      sendJson(response, 200, controller.historySnapshot());
      return;
    }
    const action = request.url?.match(/^\/api\/(connect|restart|pause|step|resume|disconnect)$/)?.[1];
    if (action) {
      if (request.method !== 'POST') { sendJson(response, 405, { error: 'POST required' }); return; }
      const origin = request.headers?.origin || '';
      const contentType = request.headers?.['content-type'] || '';
      if (!expectedHost || host !== expectedHost || origin !== `http://${expectedHost}` || request.headers?.['x-ikemeter-action'] !== '1' || !/^application\/json(?:;|$)/i.test(contentType)) {
        sendJson(response, 403, { error: 'Local action request rejected' }); return;
      }
      try {
        const authority=actionAuthority(request.headers);if(authority===false||controller.acceptsActionAuthority?.(authority,action)===false){sendJson(response,409,{error:'Session or continuity changed; refresh Meter status before a new action',status:controller.status()});return;}
        const result = action === 'connect' ? await controller.connect()
          : action === 'restart' ? await controller.restart()
          : action === 'disconnect' ? await controller.disconnect()
            : await controller.command(action);
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 409, { error: error.message, status: controller.status() });
      }
      return;
    }
    const relative = request.url === '/' ? 'index.html' : request.url.slice(1);
    const file = path.resolve(appRoot, relative);
    if (!file.startsWith(`${appRoot}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.statusCode = 404; response.end('Not found'); return;
    }
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  return server;
}

if (require.main === module) {
  const { acquireRuntimeLease } = require('./recover_sessions');
  let lease;
  let options = {};
  try {
    if (process.env.IKEMETER_RUNTIME) {
      lease = acquireRuntimeLease(process.env.IKEMETER_RUNTIME);
      const { AttachedNightlyDriver } = require('./attached_nightly_driver');
      const players = process.env.IKEMETER_P1 ? [process.env.IKEMETER_P1, process.env.IKEMETER_P2 || 'kfm'] : undefined;
      options = { controller: new SessionController(new AttachedNightlyDriver({ runtime: lease.runtime, players })) };
    }
    const server=createAppServer(options).listen(0, '127.0.0.1', function () {
      process.stdout.write(`IKeMeter local: http://127.0.0.1:${this.address().port}\n`);
    });
    let stopping=false;
    const stop=async()=>{if(stopping)return;stopping=true;try{await options.controller?.shutdown?.();}catch(error){process.stderr.write(`${error.message}\n`);}finally{
      try { lease?.release(); } catch(error) { process.stderr.write(`${error.message}\n`); }
      server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();
    }};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
    server.once('error',(error)=>{process.stderr.write(`${error.message}\n`);stop();});
  } catch(error) {
    try { lease?.release(); } catch(releaseError) { process.stderr.write(`${releaseError.message}\n`); }
    process.stderr.write(`${error.message}\n`);process.exitCode=1;
  }
}

module.exports = { createAppServer, actionAuthority };
