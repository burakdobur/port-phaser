// Port Phaser server: serves the game files and hosts room-code sessions.
// Zero dependencies (Node >= 18). Protocol: JSON over HTTP + Server-Sent Events.
//
//   POST /api/sessions                    {name}           -> {code, player, token}
//   POST /api/sessions/:code/join         {name}           -> {code, player, token}
//   POST /api/sessions/:code/actions      {token, action}  -> {version}
//   GET  /api/sessions/:code/state?token=                  -> {view}
//   GET  /api/sessions/:code/events?token=                 -> SSE: `state` / `session_deleted`
//   GET  /api/ice                                          -> {iceServers} for WebRTC play (PeerSession)
//
// Run: npm start   (PORT / HOST env vars override 8080 / 0.0.0.0)
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { SessionStore } = require('./session-store');
const { iceServersFromEnv } = require('./ice-config');

const ROOT = path.resolve(__dirname, '..');
const STATIC_ALLOW = ['index.html', 'public/lib/', 'src/', 'shared/', 'assets/'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};
const STATUS_FOR = { session_not_found: 404, bad_token: 403, session_full: 409 };
const MAX_BODY = 16 * 1024;

function createServer(store = new SessionStore()) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(store, req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' });
      return serveStatic(url.pathname, res);
    } catch (err) {
      if (err && err.name === 'RuleError') return send(res, STATUS_FOR[err.code] || 400, { error: err.code });
      if (err && err.code === 'bad_json') return send(res, 400, { error: 'bad_json' });
      console.error(err);
      return send(res, 500, { error: 'internal' });
    }
  });
}

async function handleApi(store, req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/ice') return send(res, 200, { iceServers: iceServersFromEnv() });
  const parts = url.pathname.split('/').filter(Boolean); // ['api','sessions',code?,verb?]
  if (parts[1] !== 'sessions') return send(res, 404, { error: 'not_found' });
  const [, , code, verb] = parts;

  if (req.method === 'POST' && !code) {
    const body = await readJson(req);
    return send(res, 201, store.create(body.name));
  }
  if (req.method === 'POST' && verb === 'join') {
    const body = await readJson(req);
    return send(res, 200, store.join(code, body.name));
  }
  if (req.method === 'POST' && verb === 'actions') {
    const body = await readJson(req);
    return send(res, 200, store.act(code, body.token, body.action));
  }
  if (req.method === 'GET' && verb === 'state') {
    return send(res, 200, { view: store.view(code, url.searchParams.get('token')) });
  }
  if (req.method === 'GET' && verb === 'events') {
    return openEventStream(store, code, url.searchParams.get('token'), req, res);
  }
  return send(res, 404, { error: 'not_found' });
}

function openEventStream(store, code, token, req, res) {
  store.authenticate(code, token); // throw before switching to a stream
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.write('retry: 2000\n\n');
  const unsubscribe = store.subscribe(code, token, (event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'session_deleted') res.end();
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
}

function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  const file = path.resolve(ROOT, rel);
  const relNorm = path.relative(ROOT, file).split(path.sep).join('/');
  const allowed = !relNorm.startsWith('..') && STATIC_ALLOW.some((p) => relNorm === p || (p.endsWith('/') && relNorm.startsWith(p)));
  if (!allowed) return send(res, 404, { error: 'not_found' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'not_found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { code: 'bad_json' })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('bad json'), { code: 'bad_json' })); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  const host = process.env.HOST || '0.0.0.0';
  const store = new SessionStore();
  setInterval(() => store.sweep(), 60 * 1000).unref();
  createServer(store).listen(port, host, () => {
    console.log(`Port Phaser running at http://localhost:${port}`);
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const n of nets || []) if (n.family === 'IPv4' && !n.internal) console.log(`  on your network: http://${n.address}:${port}`);
    }
  });
}

module.exports = { createServer };
