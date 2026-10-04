const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server/server');
const { SessionStore } = require('../server/session-store');
const { rules } = require('../shared');

async function withServer(fn) {
  const server = createServer(new SessionStore());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.closeAllConnections(); server.close(); }
}

const post = (base, path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

/** Reads SSE events until `predicate(event)` is true. */
async function readEvents(url, predicate) {
  const res = await fetch(url);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const events = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) return events;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const data = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!data) continue;
      const ev = JSON.parse(data.slice(6));
      events.push(ev);
      if (predicate(ev)) { reader.cancel(); return events; }
    }
  }
}

test('serves the game and blocks files outside the allow-list', () => withServer(async (base) => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/shared/match.js')).status, 200);
  assert.equal((await fetch(base + '/server/server.js')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/etc/passwd')).status, 404);
}));

test('full online match: create, join by lower-case code, place, fire, session deleted at end', () => withServer(async (base) => {
  const host = await post(base, '/api/sessions', { name: 'Ada' });
  assert.equal(host.status, 201);
  assert.match(host.body.code, /^[A-Z2-9]{4}$/);

  const guest = await post(base, `/api/sessions/${host.body.code.toLowerCase()}/join`, {});
  assert.equal(guest.status, 200);
  assert.equal(guest.body.player, 1);
  assert.equal((await post(base, `/api/sessions/${host.body.code}/join`, {})).status, 409);

  const act = (who, action) => post(base, `/api/sessions/${host.body.code}/actions`, { token: who.body.token, action });
  for (const who of [host, guest]) {
    for (const [row, s] of rules.FLEET.entries()) {
      assert.equal((await act(who, { type: 'place', ship: s.type, x: 0, y: row, orientation: 'h' })).status, 200);
    }
    await act(who, { type: 'ready' });
  }
  const notTurn = await act(guest, { type: 'fire', x: 0, y: 0 });
  assert.deepEqual([notTurn.status, notTurn.body.error], [400, 'not_your_turn']);
  assert.equal((await post(base, `/api/sessions/${host.body.code}/actions`, { token: 'nope', action: { type: 'ready' } })).status, 403);

  const guestEvents = readEvents(`${base}/api/sessions/${host.body.code}/events?token=${guest.body.token}`,
    (e) => e.type === 'session_deleted');

  let miss = 0;
  for (const [row, s] of rules.FLEET.entries()) {
    for (let x = 0; x < s.length; x++) {
      await act(host, { type: 'fire', x, y: row });
      const st = await fetch(`${base}/api/sessions/${host.body.code}/state?token=${host.body.token}`);
      if (st.status === 404) break; // session already deleted after the final shot
      await act(guest, { type: 'fire', x: miss++, y: 9 });
    }
  }
  const events = await guestEvents;
  const last = events.at(-1);
  assert.equal(last.type, 'session_deleted');
  assert.equal(last.reason, 'match_ended');
  assert.equal(last.view.winner, 0);
  assert.equal(last.view.enemyBoard.ships.length, rules.FLEET.length); // revealed at end
  assert.equal((await post(base, `/api/sessions/${host.body.code}/join`, {})).status, 404); // code invalid now
}));

test('idle sessions are swept and players notified', () => {
  let t = 0;
  const store = new SessionStore({ now: () => t, idleTtlMs: 1000 });
  const { code, token } = store.create('A');
  const seen = [];
  store.subscribe(code, token, (e) => seen.push(e.type));
  t = 5000;
  assert.equal(store.sweep(), 1);
  assert.deepEqual(seen, ['state', 'session_deleted']);
});
