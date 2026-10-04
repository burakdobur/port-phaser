// LocalSession: hot seat (F-09). Both players share one device; the Match runs in the browser.
// Implements the same interface as RemoteSession so scenes don't care which one they get:
//   mode, code, localPlayers, deleted, view(player), dispatch(player, action), subscribe(fn), leave()
(function (SB) {
  'use strict';

  class LocalSession {
    constructor(names = []) {
      this.mode = 'hotseat';
      this.code = null; // no room code needed when both players are on this device
      this.localPlayers = [0, 1];
      this.deleted = null;
      this.listeners = new Set();
      this.match = new SB.Match();
      this.match.addPlayer(names[0]);
      this.match.addPlayer(names[1]);
    }

    view(player) {
      return this.match.viewFor(player);
    }

    dispatch(player, action) {
      try {
        this.match.apply(player, action);
      } catch (err) {
        return Promise.reject(err.name === 'RuleError' ? err : new SB.RuleError('internal', err.message));
      }
      this._emit();
      if (this.match.phase === SB.rules.PHASE.ENDED) this._delete('match_ended');
      return Promise.resolve();
    }

    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    leave() {
      if (!this.deleted) this._delete('left');
    }

    _delete(reason) {
      this.deleted = reason; // session.md step 7 — nothing persists after the match
      this._emit();
    }

    _emit() {
      for (const fn of this.listeners) fn(this);
    }
  }

  SB.LocalSession = LocalSession;
})(window.PortPhaser);
