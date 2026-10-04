// Match: the aggregate root for one game of Port Phaser.
// Owns both players, the phase state machine and turn order (F-07, F-08, session.md).
// The server (online) and LocalSession (hot seat) both drive it through `apply()`.
(function (global) {
  'use strict';
  const SB = (global.PortPhaser = global.PortPhaser || {});
  const { PHASE, FLEET, DEFAULT_PLAYER_NAMES, MAX_NAME_LENGTH } = SB.rules;
  const { Board, RuleError } = SB;

  function cleanName(name, fallback) {
    if (typeof name !== 'string') return fallback;
    const trimmed = name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_NAME_LENGTH);
    return trimmed || fallback;
  }

  class Match {
    constructor() {
      this.phase = PHASE.WAITING;
      this.players = []; // { name, board, ready }
      this.currentTurn = 0; // F-08: player 1 (index 0) fires first
      this.winner = null;
      this.endReason = null; // 'fleet_destroyed' | 'forfeit'
      this.lastShot = null; // { by, x, y, result, shipType }
      this.version = 0; // bumps on every state change; lets clients ignore stale updates
    }

    // ---- lifecycle -------------------------------------------------------

    addPlayer(name) {
      if (this.phase !== PHASE.WAITING || this.players.length >= 2) throw new RuleError('session_full');
      const index = this.players.length;
      this.players.push({ name: cleanName(name, DEFAULT_PLAYER_NAMES[index]), board: new Board(), ready: false });
      if (this.players.length === 2) this.phase = PHASE.PLACEMENT;
      this._touch();
      return index;
    }

    /** Single command entry point. Throws RuleError on any illegal action. */
    apply(player, action) {
      this._assertPlayer(player);
      if (!action || typeof action.type !== 'string') throw new RuleError('bad_action');
      switch (action.type) {
        case 'rename': return this.rename(player, action.name);
        case 'place': return this.placeShip(player, action.ship, action.x, action.y, action.orientation);
        case 'remove': return this.removeShip(player, action.ship);
        case 'ready': return this.setReady(player);
        case 'fire': return this.fire(player, action.x, action.y);
        case 'forfeit': return this.forfeit(player);
        default: throw new RuleError('bad_action');
      }
    }

    rename(player, name) {
      this._assertPlayer(player);
      this.players[player].name = cleanName(name, this.players[player].name);
      this._touch();
    }

    // ---- placement (F-02, F-03) ------------------------------------------

    placeShip(player, ship, x, y, orientation) {
      this._assertPlacementOpen(player);
      this.players[player].board.placeShip(ship, x, y, orientation);
      this._touch();
    }

    removeShip(player, ship) {
      this._assertPlacementOpen(player);
      this.players[player].board.removeShip(ship);
      this._touch();
    }

    setReady(player) {
      this._assertPlacementOpen(player);
      if (!this.players[player].board.isFleetComplete()) throw new RuleError('fleet_incomplete');
      this.players[player].ready = true;
      if (this.players.every((p) => p.ready)) {
        this.phase = PHASE.COMBAT; // session.md step 4 -> 5
        this.currentTurn = 0;
      }
      this._touch();
    }

    // ---- combat (F-04..F-08) ---------------------------------------------

    fire(player, x, y) {
      if (this.phase !== PHASE.COMBAT) throw new RuleError('not_in_combat');
      if (player !== this.currentTurn) throw new RuleError('not_your_turn');
      const target = 1 - player;
      const outcome = this.players[target].board.receiveShot(x, y); // throws on bad / repeated cell
      this.lastShot = { by: player, x, y, result: outcome.result, shipType: outcome.shipType || null };

      if (this.players[target].board.allSunk()) {
        this._end(player, 'fleet_destroyed'); // F-07
      } else {
        this.currentTurn = target; // F-08: strict alternation, one missile per turn
      }
      this._touch();
      return this.lastShot;
    }

    forfeit(player) {
      this._assertPlayer(player);
      if (this.phase === PHASE.ENDED) return;
      this._end(this.players.length === 2 ? 1 - player : null, 'forfeit');
      this._touch();
    }

    // ---- read model ------------------------------------------------------

    /** Everything `player` is allowed to see. Enemy ships stay hidden until sunk (or match end). */
    viewFor(player) {
      this._assertPlayer(player);
      const me = this.players[player];
      const opponent = this.players[1 - player] || null;
      const ended = this.phase === PHASE.ENDED;
      return {
        version: this.version,
        phase: this.phase,
        you: player,
        currentTurn: this.currentTurn,
        isYourTurn: this.phase === PHASE.COMBAT && this.currentTurn === player,
        winner: this.winner,
        endReason: this.endReason,
        lastShot: this.lastShot,
        fleet: FLEET,
        players: this.players.map((p) => ({ name: p.name, ready: p.ready })),
        ownBoard: me.board.ownerView(),
        enemyBoard: opponent ? opponent.board.opponentView(ended) : null,
      };
    }

    // ---- internals -------------------------------------------------------

    _end(winner, reason) {
      this.phase = PHASE.ENDED;
      this.winner = winner;
      this.endReason = reason;
    }

    _touch() {
      this.version++;
    }

    _assertPlayer(player) {
      if (!Number.isInteger(player) || !this.players[player]) throw new RuleError('unknown_player');
    }

    _assertPlacementOpen(player) {
      this._assertPlayer(player);
      if (this.phase !== PHASE.PLACEMENT) throw new RuleError('not_in_placement');
      if (this.players[player].ready) throw new RuleError('already_ready');
    }
  }

  SB.Match = Match;
  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
