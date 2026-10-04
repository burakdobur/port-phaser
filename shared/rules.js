// Game rules and constants — the single place where GAME.md numbers live.
// Shared by the browser (window.PortPhaser) and the Node server (require).
(function (global) {
  'use strict';
  const SB = (global.PortPhaser = global.PortPhaser || {});

  // F-01: 10x10 grid, 40px cells, 400x400 board. Placement happens on the same grid (F-02).
  const BOARD_SIZE = 10;
  const CELL_SIZE = 40;

  // F-03: ship types. Lengths are a design decision recorded in GAME.md.
  // Every unit counts toward "all ships sunk" (F-07).
  const FLEET = Object.freeze([
    Object.freeze({ type: 'battleship', name: 'Battleship', length: 4 }),
    Object.freeze({ type: 'submarine', name: 'Submarine', length: 3 }),
    Object.freeze({ type: 'destroyer', name: 'Destroyer', length: 2 }),
    Object.freeze({ type: 'mine', name: 'Mine', length: 1 }),
    Object.freeze({ type: 'radar', name: 'Radar', length: 1 }),
  ]);

  const ORIENTATION = Object.freeze({ HORIZONTAL: 'h', VERTICAL: 'v' });

  const PHASE = Object.freeze({
    WAITING: 'waiting', // session created, waiting for player 2 to join
    PLACEMENT: 'placement',
    COMBAT: 'combat',
    ENDED: 'ended',
  });

  const SHOT = Object.freeze({ MISS: 'miss', HIT: 'hit', SUNK: 'sunk' });

  const DEFAULT_PLAYER_NAMES = Object.freeze(['Player 1', 'Player 2']);
  const MAX_NAME_LENGTH = 16;

  function shipSpec(type) {
    return FLEET.find((s) => s.type === type) || null;
  }

  /** Raised for any rule violation. `code` is stable and safe to send to clients. */
  class RuleError extends Error {
    constructor(code, message) {
      super(message || code);
      this.name = 'RuleError';
      this.code = code;
    }
  }

  SB.rules = Object.freeze({
    BOARD_SIZE, CELL_SIZE, FLEET, ORIENTATION, PHASE, SHOT,
    DEFAULT_PLAYER_NAMES, MAX_NAME_LENGTH, shipSpec,
  });
  SB.RuleError = RuleError;

  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
