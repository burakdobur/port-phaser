// RemoteSession: online play via room code (F-10). The server owns the Match; this client
// sends commands over HTTP and receives its own fog-of-war view over Server-Sent Events.
(function (SB) {
  'use strict';

  async function request(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new SB.RuleError('network');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new SB.RuleError(data.error || 'network');
    return data;
  }

  class RemoteSession {
    static isAvailable() {
      return location.protocol === 'http:' || location.protocol === 'https:';
    }

    static async create(name) {
      return new RemoteSession(await request('POST', '/api/sessions', { name }));
    }

    static async join(rawCode, name) {
      const code = SB.roomCode.normalize(rawCode);
      if (!code) throw new SB.RuleError('bad_code');
      return new RemoteSession(await request('POST', `/api/sessions/${code}/join`, { name }));
    }

    constructor({ code, player, token }) {
      this.mode = 'online';
      this.code = code;
      this.player = player;
      this.token = token;
      this.localPlayers = [player];
      this.deleted = null;
      this.connected = false;
      this.latest = null;
      this.listeners = new Set();
      this._connect();
    }

    _connect() {
      const url = `/api/sessions/${this.code}/events?token=${encodeURIComponent(this.token)}`;
      this.events = new EventSource(url);
      this.events.addEventListener('open', () => { this.connected = true; this._emit(); });
      this.events.addEventListener('error', () => {
        this.connected = false; // EventSource retries on its own
        this._emit();
      });
      this.events.addEventListener('state', (e) => this._accept(JSON.parse(e.data).view));
      this.events.addEventListener('session_deleted', (e) => {
        const data = JSON.parse(e.data);
        this.events.close();
        this._accept(data.view, true);
        this.deleted = data.reason;
        this._emit();
      });
    }

    _accept(view, force) {
      if (!view) return;
      if (!force && this.latest && view.version < this.latest.version) return; // stale
      this.latest = view;
      this._emit();
    }

    view(player) {
      return player === this.player ? this.latest : null;
    }

    dispatch(player, action) {
      if (player !== this.player) return Promise.reject(new SB.RuleError('bad_token'));
      return request('POST', `/api/sessions/${this.code}/actions`, { token: this.token, action });
    }

    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    leave() {
      if (!this.deleted) {
        // Forfeit ends the match on the server, which deletes the session and notifies the opponent.
        this.dispatch(this.player, { type: 'forfeit' }).catch(() => {});
        this.deleted = 'left';
      }
      if (this.events) this.events.close();
    }

    _emit() {
      for (const fn of this.listeners) fn(this);
    }
  }

  SB.RemoteSession = RemoteSession;
})(window.PortPhaser);
