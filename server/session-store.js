// SessionStore: ephemeral multiplayer sessions keyed by room code (session.md).
// The server-side Match inside each session is the source of truth for turn order and state.
// Transport-agnostic: listeners are plain functions, so HTTP/SSE (or WebSockets later) plug in.
'use strict';
const crypto = require('node:crypto');
const { Match, RuleError, roomCode, rules } = require('../shared');

const IDLE_TTL_MS = 30 * 60 * 1000;

class SessionStore {
  constructor({ now = () => Date.now(), idleTtlMs = IDLE_TTL_MS } = {}) {
    this.sessions = new Map(); // code -> session
    this.now = now;
    this.idleTtlMs = idleTtlMs;
  }

  // ---- lifecycle (session.md steps 1, 2, 7) -------------------------------

  create(name) {
    const code = this._uniqueCode();
    const session = {
      code,
      match: new Match(),
      tokens: [],
      listeners: [new Set(), new Set()],
      lastActivity: this.now(),
    };
    this.sessions.set(code, session);
    const player = this._seat(session, name);
    return { code, player, token: session.tokens[player] };
  }

  join(rawCode, name) {
    const session = this._find(rawCode);
    if (session.match.players.length >= 2) throw new RuleError('session_full');
    const player = this._seat(session, name);
    this._broadcast(session);
    return { code: session.code, player, token: session.tokens[player] };
  }

  delete(code, reason) {
    const session = this.sessions.get(code);
    if (!session) return;
    this.sessions.delete(code);
    session.listeners.forEach((set, player) => {
      for (const listener of set) listener({ type: 'session_deleted', reason, view: session.match.viewFor(player) });
      set.clear();
    });
  }

  /** Deletes sessions that nobody has touched for a while. Returns the number removed. */
  sweep() {
    let removed = 0;
    for (const session of [...this.sessions.values()]) {
      if (this.now() - session.lastActivity > this.idleTtlMs) {
        this.delete(session.code, 'expired');
        removed++;
      }
    }
    return removed;
  }

  // ---- player commands ------------------------------------------------------

  act(rawCode, token, action) {
    const { session, player } = this.authenticate(rawCode, token);
    session.match.apply(player, action);
    session.lastActivity = this.now();
    this._broadcast(session);
    if (session.match.phase === rules.PHASE.ENDED) {
      // session.md step 7: the session is deleted when the match ends; players are notified.
      this.delete(session.code, 'match_ended');
    }
    return { version: session.match.version };
  }

  view(rawCode, token) {
    const { session, player } = this.authenticate(rawCode, token);
    return session.match.viewFor(player);
  }

  /** Registers a listener for one player's events. Sends the current state immediately. */
  subscribe(rawCode, token, listener) {
    const { session, player } = this.authenticate(rawCode, token);
    session.listeners[player].add(listener);
    listener({ type: 'state', view: session.match.viewFor(player) });
    return () => session.listeners[player].delete(listener);
  }

  authenticate(rawCode, token) {
    const session = this._find(rawCode);
    const player = session.tokens.findIndex((t) => typeof token === 'string' && safeEqual(t, token));
    if (player < 0) throw new RuleError('bad_token');
    return { session, player };
  }

  // ---- internals --------------------------------------------------------------

  _seat(session, name) {
    const player = session.match.addPlayer(name);
    session.tokens[player] = crypto.randomBytes(16).toString('hex');
    session.lastActivity = this.now();
    return player;
  }

  _find(rawCode) {
    const code = roomCode.normalize(rawCode);
    const session = code && this.sessions.get(code);
    if (!session) throw new RuleError('session_not_found');
    return session;
  }

  _broadcast(session) {
    session.listeners.forEach((set, player) => {
      if (!session.match.players[player]) return;
      const view = session.match.viewFor(player);
      for (const listener of set) listener({ type: 'state', view });
    });
  }

  _uniqueCode() {
    for (let i = 0; i < 1000; i++) {
      const code = roomCode.generate();
      if (!this.sessions.has(code)) return code;
    }
    throw new Error('Could not allocate a room code');
  }
}

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

module.exports = { SessionStore };
