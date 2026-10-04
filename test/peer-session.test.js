// PeerSession over an in-memory fake of PeerJS: covers the host/guest protocol without a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const SB = require('../shared');
require('../src/net/peer-session');
const { PeerSession, rules } = SB;
const { PHASE, FLEET } = rules;

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(ev, fn) { (this.handlers.get(ev) || this.handlers.set(ev, new Set()).get(ev)).add(fn); return this; }
  once(ev, fn) { const w = (...a) => { this.off(ev, w); fn(...a); }; w.inner = fn; return this.on(ev, w); }
  off(ev, fn) { const set = this.handlers.get(ev); if (set) for (const h of set) if (h === fn || h.inner === fn) set.delete(h); return this; }
  emit(ev, ...a) { for (const h of [...(this.handlers.get(ev) || [])]) h(...a); }
}

class FakeConn extends Emitter {
  constructor() { super(); this.open = false; }
  send(msg) {
    if (!this.open) throw new Error('not open');
    const copy = JSON.parse(JSON.stringify(msg)); // real channel serialises to JSON
    setImmediate(() => this.other.emit('data', copy));
  }
  close() {
    if (!this.open) return;
    this.open = this.other.open = false;
    setImmediate(() => { this.emit('close'); this.other.emit('close'); });
  }
}

/** A tiny PeerJS broker: ids are unique, connect() reaches the peer with that id. */
function fakePeerJs() {
  const peers = new Map();
  let n = 0;
  return class FakePeer extends Emitter {
    constructor(id, options) {
      super();
      if (typeof id === 'object') { options = id; id = null; }
      this.id = id || `guest-${++n}`;
      this.options = options;
      this.conns = [];
      this.destroyed = false;
      setImmediate(() => {
        if (peers.has(this.id)) return this.emit('error', { type: 'unavailable-id' });
        peers.set(this.id, this);
        this.emit('open', this.id);
      });
    }
    connect(id) {
      const mine = new FakeConn();
      const theirs = new FakeConn();
      mine.other = theirs; theirs.other = mine;
      this.conns.push(mine);
      setImmediate(() => {
        const host = peers.get(id);
        if (!host || host.destroyed) return this.emit('error', { type: 'peer-unavailable' });
        host.conns.push(theirs);
        mine.open = theirs.open = true;
        host.emit('connection', theirs);
        theirs.emit('open');
        mine.emit('open');
      });
      return mine;
    }
    reconnect() {}
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      if (peers.get(this.id) === this) peers.delete(this.id);
      this.conns.forEach((c) => c.close());
    }
  };
}

const deps = (Peer) => ({ Peer, iceServers: [{ urls: 'stun:example' }], shutdownDelayMs: 5 });
const tick = () => new Promise((r) => setTimeout(r, 15));
async function until(predicate, label) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  assert.fail('timed out waiting for ' + label);
}
async function placeAndReady(session) {
  for (const [row, s] of FLEET.entries()) await session.dispatch(session.player, { type: 'place', ship: s.type, x: 0, y: row, orientation: 'h' });
  await session.dispatch(session.player, { type: 'ready' });
}

test('peer session: create, join, place, full match, both sides see the end', async () => {
  const d = deps(fakePeerJs());
  const host = await PeerSession.create('Ada', d);
  assert.match(host.code, /^[A-Z2-9]{4}$/);
  assert.equal(host.view(0).phase, PHASE.WAITING);
  assert.deepEqual(host.localPlayers, [0]);

  const guest = await PeerSession.join(host.code.toLowerCase(), 'Grace', d);
  assert.equal(guest.player, 1);
  assert.equal(guest.view(1).players[0].name, 'Ada');
  await until(() => host.view(0).phase === PHASE.PLACEMENT, 'placement on host');
  assert.equal(host.view(0).players[1].name, 'Grace');

  await placeAndReady(host);
  await placeAndReady(guest);
  await until(() => guest.view(1).phase === PHASE.COMBAT, 'combat on guest');

  // Guest's view never contains host ships before they sink (fog of war over the wire).
  assert.ok(!guest.view(1).enemyBoard.ships || guest.view(1).enemyBoard.ships.length === 0);
  await assert.rejects(guest.dispatch(1, { type: 'fire', x: 0, y: 0 }), { code: 'not_your_turn' });

  // Host sinks the guest's fleet (rows 0..4) while the guest fires into empty water.
  const targets = [];
  FLEET.forEach((s, row) => { for (let x = 0; x < s.length; x++) targets.push([x, row]); });
  let miss = 0;
  for (const [x, y] of targets) {
    await host.dispatch(0, { type: 'fire', x, y });
    if (host.view(0).phase === PHASE.ENDED) break;
    await until(() => guest.view(1).isYourTurn, 'guest turn');
    await guest.dispatch(1, { type: 'fire', x: miss % 10, y: 9 - Math.floor(miss / 10) });
    miss++;
    await until(() => host.view(0).isYourTurn, 'host turn');
  }
  assert.equal(host.view(0).winner, 0);
  assert.equal(host.deleted, 'match_ended');
  await until(() => guest.deleted === 'match_ended', 'guest notified');
  assert.equal(guest.view(1).phase, PHASE.ENDED);
  assert.equal(guest.view(1).winner, 0);
});

test('peer session: unknown code, full room, bad code', async () => {
  const d = deps(fakePeerJs());
  await assert.rejects(PeerSession.join('ZZZZ', 'x', d), { code: 'session_not_found' });
  await assert.rejects(PeerSession.join('ab', 'x', d), { code: 'bad_code' });

  const host = await PeerSession.create('Ada', d);
  await PeerSession.join(host.code, 'Grace', d);
  await assert.rejects(PeerSession.join(host.code, 'Eve', d), { code: 'session_full' });
});

test('peer session: room code collision picks another code', async () => {
  const codes = ['AAAA', 'AAAA', 'BBBB'];
  const d = { ...deps(fakePeerJs()), generateCode: () => codes.shift() };
  const first = await PeerSession.create('A', d);
  const second = await PeerSession.create('B', d); // AAAA is taken on the broker, so BBBB
  assert.equal(first.code, 'AAAA');
  assert.equal(second.code, 'BBBB');
});

test('peer session: guest leaving forfeits; host leaving notifies guest', async () => {
  const d = deps(fakePeerJs());
  let host = await PeerSession.create('Ada', d);
  let guest = await PeerSession.join(host.code, 'Grace', d);
  await until(() => host.view(0).phase === PHASE.PLACEMENT, 'placement');
  guest.leave();
  await until(() => host.deleted === 'match_ended', 'host sees forfeit');
  assert.equal(host.view(0).endReason, 'forfeit');
  assert.equal(host.view(0).winner, 0);

  host = await PeerSession.create('Ada', d);
  guest = await PeerSession.join(host.code, 'Grace', d);
  await until(() => host.view(0).phase === PHASE.PLACEMENT, 'placement');
  host.leave();
  await until(() => guest.deleted, 'guest notified');
  assert.equal(guest.view(1).endReason, 'forfeit');
  assert.equal(guest.view(1).winner, 1);
});

test('peer session: a dropped guest connection counts as leaving', async () => {
  const d = deps(fakePeerJs());
  const host = await PeerSession.create('Ada', d);
  const guest = await PeerSession.join(host.code, 'Grace', d);
  await until(() => host.view(0).phase === PHASE.PLACEMENT, 'placement');
  guest.peer.destroy(); // tab closed, network gone
  await until(() => host.deleted, 'host notices');
  assert.equal(host.view(0).endReason, 'forfeit');
});
