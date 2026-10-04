// PeerSession: online play over WebRTC (F-10, D-06). No game server: the room creator's browser
// hosts the Match and the guest's browser connects to it directly through PeerJS.
// The room code doubles as the host's PeerJS id, so the PeerJS broker is only used to find each other.
//
// Same interface as LocalSession / RemoteSession, so scenes don't care which one they get:
//   mode, code, player, localPlayers, connected, deleted, view(player), dispatch(player, action), subscribe(fn), leave()
//
// Wire protocol (JSON over one reliable DataChannel). The host validates everything through Match.apply.
//   guest -> host  {t:'hello', name}
//   host  -> guest {t:'welcome', player, view}  |  {t:'reject', error}
//   guest -> host  {t:'action', id, action}
//   host  -> guest {t:'result', id, error}      (error is null on success)
//   host  -> guest {t:'state', view}            (after every change, the guest's own fog-of-war view)
//   host  -> guest {t:'deleted', reason, view}  (session.md step 7)
//
// Trust model: the host's browser holds both fleets, so a curious host could peek in DevTools.
// Accepted for a hobby game; see docs/session.md.
(function (global) {
  'use strict';
  const SB = (global.PortPhaser = global.PortPhaser || {});
  const { RuleError, rules, roomCode } = SB;

  const ID_PREFIX = 'portphaser-';
  const BROKER_TIMEOUT_MS = 10000; // registering with the PeerJS broker
  const CONNECT_TIMEOUT_MS = 20000; // finding the host and opening the direct channel
  const ICE_TIMEOUT_MS = 3000;
  const SHUTDOWN_DELAY_MS = 1000; // lets the last messages flush before the peer is destroyed
  const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  const hostPeerId = (code) => ID_PREFIX + code.toLowerCase();
  const asRuleError = (err) => (err && err.name === 'RuleError' ? err : new RuleError('internal', err && err.message));

  /** STUN/TURN list from /api/ice (TURN credentials live in env vars), falling back to public STUN. */
  async function loadIceServers() {
    const loc = global.location;
    if (!loc || !/^https?:$/.test(loc.protocol) || typeof global.fetch !== 'function') return DEFAULT_ICE_SERVERS;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), ICE_TIMEOUT_MS);
    try {
      const res = await global.fetch('/api/ice', { signal: ctrl && ctrl.signal });
      const data = await res.json();
      return Array.isArray(data.iceServers) && data.iceServers.length ? data.iceServers : DEFAULT_ICE_SERVERS;
    } catch (e) {
      return DEFAULT_ICE_SERVERS;
    } finally {
      clearTimeout(timer);
    }
  }

  /** deps: { Peer, iceServers, peerOptions, shutdownDelayMs, generateCode, brokerTimeoutMs, connectTimeoutMs } — injectable for tests. */
  async function resolveDeps(deps = {}) {
    const Peer = deps.Peer || global.Peer;
    if (typeof Peer !== 'function') throw new RuleError('network');
    const iceServers = deps.iceServers || (await loadIceServers());
    return { ...deps, Peer, iceServers };
  }

  /** Registers with the broker. Rejects with the PeerJS error, or RuleError('broker_unreachable') on timeout. */
  function openPeer(deps, id) {
    return new Promise((resolve, reject) => {
      const options = { ...(deps.peerOptions || {}), config: { iceServers: deps.iceServers } };
      const peer = id ? new deps.Peer(id, options) : new deps.Peer(options);
      const settle = (err) => {
        clearTimeout(timer);
        peer.off('open', onOpen);
        peer.off('error', onError);
        if (err) { peer.destroy(); reject(err); } else resolve(peer);
      };
      const onError = (err) => settle(err || new RuleError('broker_unreachable'));
      const onOpen = () => settle(null);
      const timer = setTimeout(() => settle(new RuleError('broker_unreachable')), deps.brokerTimeoutMs || BROKER_TIMEOUT_MS);
      peer.once('open', onOpen);
      peer.once('error', onError);
    });
  }

  /** PeerJS errors while talking to the broker -> RuleError codes the menu can explain. */
  function brokerError(err) {
    if (err && err.name === 'RuleError') return err;
    const type = err && err.type;
    return new RuleError(type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed'
      ? 'broker_unreachable' : 'network');
  }

  /**
   * Guest handshake: connect, say hello, wait for welcome or reject.
   * The broker reports an unknown host id as 'peer-unavailable' (session_not_found). If the host exists but the
   * direct channel never opens, or closes before opening, the networks can't reach each other: p2p_failed (needs TURN).
   */
  function connectToHost(peer, code, name, timeoutMs) {
    return new Promise((resolve, reject) => {
      const conn = peer.connect(hostPeerId(code), { reliable: true, serialization: 'json' });
      let done = false;
      const finish = (err, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        peer.off('error', onPeerError);
        conn.off('data', onData);
        conn.off('close', onClose);
        if (err) reject(err); else resolve(value);
      };
      let opened = false;
      const timer = setTimeout(() => finish(new RuleError(opened ? 'network' : 'p2p_failed')), timeoutMs || CONNECT_TIMEOUT_MS);
      const onPeerError = (err) => {
        const type = err && err.type;
        if (type === 'peer-unavailable') return finish(new RuleError('session_not_found'));
        finish(opened ? new RuleError('network') : type === 'webrtc' ? new RuleError('p2p_failed') : brokerError(err));
      };
      const onClose = () => finish(new RuleError(opened ? 'network' : 'p2p_failed'));
      const onData = (msg) => {
        if (msg && msg.t === 'welcome') finish(null, { conn, player: msg.player, view: msg.view });
        else if (msg && msg.t === 'reject') finish(new RuleError(msg.error || 'session_full'));
      };
      peer.on('error', onPeerError);
      conn.on('data', onData);
      conn.on('close', onClose);
      conn.on('open', () => { opened = true; conn.send({ t: 'hello', name }); });
    });
  }

  class PeerSession {
    static isAvailable() {
      return typeof global.Peer === 'function' && typeof global.RTCPeerConnection === 'function';
    }

    /** Host: claim a free room code as our PeerJS id and wait for a guest. */
    static async create(name, deps) {
      deps = await resolveDeps(deps);
      const generate = deps.generateCode || roomCode.generate;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generate();
        try {
          const peer = await openPeer(deps, hostPeerId(code));
          return new PeerSession({ role: 'host', peer, code, name, deps });
        } catch (err) {
          if (err && err.type === 'unavailable-id') continue; // code in use by another game; pick another
          throw brokerError(err);
        }
      }
      throw new RuleError('network');
    }

    /** Guest: connect to the host whose id matches the room code. */
    static async join(rawCode, name, deps) {
      const code = roomCode.normalize(rawCode);
      if (!code) throw new RuleError('bad_code');
      deps = await resolveDeps(deps);
      let peer;
      try {
        peer = await openPeer(deps, null);
      } catch (err) {
        throw brokerError(err);
      }
      try {
        const welcome = await connectToHost(peer, code, name, deps.connectTimeoutMs);
        return new PeerSession({ role: 'guest', peer, code, deps, ...welcome });
      } catch (err) {
        peer.destroy();
        throw err;
      }
    }

    constructor({ role, peer, code, deps, name, conn, player, view }) {
      this.mode = 'online';
      this.role = role;
      this.peer = peer;
      this.code = code;
      this.deleted = null;
      this.connected = true;
      this.listeners = new Set();
      this.shutdownDelayMs = deps && deps.shutdownDelayMs != null ? deps.shutdownDelayMs : SHUTDOWN_DELAY_MS;

      if (role === 'host') {
        this.match = new SB.Match();
        this.player = this.match.addPlayer(name);
        this.guest = null;
        this.guestPlayer = null;
        peer.on('connection', (c) => this._onGuestConnection(c));
        // Losing the broker only matters while waiting for a guest; established channels are direct.
        peer.on('disconnected', () => { if (!this.deleted && !peer.destroyed) peer.reconnect(); });
        peer.on('error', () => {}); // errors after open are reported through the guest connection
      } else {
        this.player = player;
        this.latest = view;
        this.pending = new Map(); // action id -> {resolve, reject}
        this.nextId = 1;
        this._bindHost(conn);
      }
      this.localPlayers = [this.player];
    }

    // ---- session-client interface ----------------------------------------

    view(player) {
      if (player !== this.player) return null;
      return this.role === 'host' ? this.match.viewFor(player) : this.latest;
    }

    dispatch(player, action) {
      if (player !== this.player) return Promise.reject(new RuleError('bad_token'));
      if (this.deleted) return Promise.reject(new RuleError('session_not_found'));
      if (this.role === 'host') {
        try {
          this.match.apply(player, action);
        } catch (err) {
          return Promise.reject(asRuleError(err));
        }
        this._commit();
        return Promise.resolve({ version: this.match.version });
      }
      return new Promise((resolve, reject) => {
        const id = this.nextId++;
        this.pending.set(id, { resolve, reject });
        try {
          this.conn.send({ t: 'action', id, action });
        } catch (err) {
          this.pending.delete(id);
          reject(new RuleError('network'));
        }
      });
    }

    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    /** Leaving forfeits (session.md step 6); the other side is notified and the session ends. */
    leave() {
      this.listeners.clear(); // the leaving scene is already on its way out
      if (!this.deleted) {
        if (this.role === 'host') {
          if (this.match.phase !== rules.PHASE.ENDED) this.match.forfeit(this.player);
          this._sendGuest({ t: 'deleted', reason: 'match_ended', view: this._guestView() });
        } else {
          this._sendHost({ t: 'action', id: 0, action: { type: 'forfeit' } });
        }
        this.deleted = 'left';
      }
      this._shutdown();
    }

    // ---- host side ----------------------------------------------------------

    _onGuestConnection(conn) {
      conn.on('data', (msg) => this._onGuestMessage(conn, msg));
      conn.on('close', () => { if (conn === this.guest) this._guestLeft(); });
      conn.on('error', () => {});
    }

    _onGuestMessage(conn, msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        if (this.guest || this.deleted) return this._reject(conn, 'session_full');
        let player;
        try {
          player = this.match.addPlayer(msg.name);
        } catch (err) {
          return this._reject(conn, asRuleError(err).code);
        }
        this.guest = conn;
        this.guestPlayer = player;
        conn.send({ t: 'welcome', player, view: this.match.viewFor(player) });
        this._commit();
        return;
      }
      if (conn !== this.guest || msg.t !== 'action' || this.deleted) return;
      let error = null;
      try {
        this.match.apply(this.guestPlayer, msg.action);
      } catch (err) {
        error = asRuleError(err).code;
      }
      if (msg.id) conn.send({ t: 'result', id: msg.id, error });
      if (!error) this._commit();
    }

    _reject(conn, error) {
      conn.send({ t: 'reject', error });
      setTimeout(() => conn.close(), this.shutdownDelayMs);
    }

    /** After every change: tell local listeners, push the guest's view, end the session if the match ended. */
    _commit() {
      this._emit();
      this._sendGuest({ t: 'state', view: this._guestView() });
      if (this.match.phase === rules.PHASE.ENDED) this._delete('match_ended');
    }

    _guestLeft() {
      if (this.deleted) return;
      this.match.forfeit(this.guestPlayer); // a dropped guest counts as leaving
      this._commit();
    }

    _delete(reason) {
      if (this.deleted) return;
      this.deleted = reason;
      this._sendGuest({ t: 'deleted', reason, view: this._guestView() });
      this._emit();
      this._shutdown();
    }

    _guestView() {
      return this.guestPlayer == null ? null : this.match.viewFor(this.guestPlayer);
    }

    _sendGuest(msg) {
      if (this.guest && this.guest.open) this.guest.send(msg);
    }

    // ---- guest side ---------------------------------------------------------

    _bindHost(conn) {
      this.conn = conn;
      conn.on('data', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'state') return this._accept(msg.view);
        if (msg.t === 'result') {
          const p = this.pending.get(msg.id);
          if (!p) return;
          this.pending.delete(msg.id);
          return msg.error ? p.reject(new RuleError(msg.error)) : p.resolve({});
        }
        if (msg.t === 'deleted') {
          this._accept(msg.view, true);
          this.deleted = msg.reason;
          this._emit();
          this._shutdown();
        }
      });
      conn.on('close', () => this._hostLost());
      conn.on('error', () => {});
      this.peer.on('error', () => {});
    }

    _hostLost() {
      if (this.deleted) return;
      this.connected = false;
      for (const p of this.pending.values()) p.reject(new RuleError('network'));
      this.pending.clear();
      this.deleted = 'host_left';
      this._emit();
      this._shutdown();
    }

    _accept(view, force) {
      if (!view) return;
      if (!force && this.latest && view.version < this.latest.version) return; // stale
      this.latest = view;
      this._emit();
    }

    _sendHost(msg) {
      try {
        if (this.conn && this.conn.open) this.conn.send(msg);
      } catch (e) { /* closing anyway */ }
    }

    // ---- shared -------------------------------------------------------------

    _shutdown() {
      if (this._shutdownTimer) return;
      this._shutdownTimer = setTimeout(() => this.peer.destroy(), this.shutdownDelayMs);
    }

    _emit() {
      for (const fn of this.listeners) fn(this);
    }
  }

  SB.PeerSession = PeerSession;
  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
