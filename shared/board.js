// Board: one player's 10x10 grid — their fleet plus the shots received on it.
// Pure domain object: no rendering, no networking.
(function (global) {
  'use strict';
  const SB = (global.PortPhaser = global.PortPhaser || {});
  const { BOARD_SIZE, FLEET, ORIENTATION, SHOT, shipSpec } = SB.rules;
  const RuleError = SB.RuleError;

  const key = (x, y) => x + ',' + y;
  const inBounds = (x, y) =>
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE;

  /** Cells a ship of `length` occupies when anchored at (x, y). */
  function shipCells(x, y, length, orientation) {
    const cells = [];
    for (let i = 0; i < length; i++) {
      cells.push(orientation === ORIENTATION.VERTICAL ? { x, y: y + i } : { x: x + i, y });
    }
    return cells;
  }

  class Board {
    constructor() {
      this.ships = new Map(); // type -> { type, x, y, orientation, cells, hits:Set<key> }
      this.shots = new Map(); // key -> SHOT.MISS | SHOT.HIT
    }

    // ---- placement (F-02) ------------------------------------------------

    /** Returns null when placement is legal, otherwise a RuleError code. */
    validatePlacement(type, x, y, orientation) {
      const spec = shipSpec(type);
      if (!spec) return 'unknown_ship';
      if (orientation !== ORIENTATION.HORIZONTAL && orientation !== ORIENTATION.VERTICAL) return 'bad_orientation';
      const cells = shipCells(x, y, spec.length, orientation);
      if (!cells.every((c) => inBounds(c.x, c.y))) return 'out_of_bounds';
      for (const [otherType, ship] of this.ships) {
        if (otherType === type) continue; // re-placing the same ship is allowed
        if (ship.cells.some((oc) => cells.some((c) => c.x === oc.x && c.y === oc.y))) return 'overlap';
      }
      return null;
    }

    placeShip(type, x, y, orientation) {
      const error = this.validatePlacement(type, x, y, orientation);
      if (error) throw new RuleError(error);
      const spec = shipSpec(type);
      this.ships.set(type, {
        type, x, y, orientation,
        cells: shipCells(x, y, spec.length, orientation),
        hits: new Set(),
      });
    }

    removeShip(type) {
      this.ships.delete(type);
    }

    isFleetComplete() {
      return FLEET.every((s) => this.ships.has(s.type));
    }

    // ---- combat (F-04..F-07) ---------------------------------------------

    hasShotAt(x, y) {
      return this.shots.has(key(x, y));
    }

    shipAt(x, y) {
      for (const ship of this.ships.values()) {
        if (ship.cells.some((c) => c.x === x && c.y === y)) return ship;
      }
      return null;
    }

    isSunk(ship) {
      return ship.hits.size === ship.cells.length;
    }

    /** Applies an incoming missile. Returns { result, shipType? }. */
    receiveShot(x, y) {
      if (!inBounds(x, y)) throw new RuleError('out_of_bounds');
      if (this.hasShotAt(x, y)) throw new RuleError('already_shot');
      const ship = this.shipAt(x, y);
      if (!ship) {
        this.shots.set(key(x, y), SHOT.MISS);
        return { result: SHOT.MISS };
      }
      ship.hits.add(key(x, y));
      this.shots.set(key(x, y), SHOT.HIT);
      return { result: this.isSunk(ship) ? SHOT.SUNK : SHOT.HIT, shipType: ship.type };
    }

    allSunk() {
      return this.ships.size > 0 && [...this.ships.values()].every((s) => this.isSunk(s));
    }

    // ---- views (what a client may see) -----------------------------------

    _shotList() {
      return [...this.shots].map(([k, result]) => {
        const [x, y] = k.split(',').map(Number);
        return { x, y, result };
      });
    }

    _shipView(ship) {
      return {
        type: ship.type, x: ship.x, y: ship.y, orientation: ship.orientation,
        cells: ship.cells.map((c) => ({ x: c.x, y: c.y })),
        sunk: this.isSunk(ship),
      };
    }

    /** Full view for the board's owner. */
    ownerView() {
      return { ships: [...this.ships.values()].map((s) => this._shipView(s)), shots: this._shotList() };
    }

    /** Fog-of-war view for the opponent: shots, plus ships only once sunk. */
    opponentView(revealAll) {
      const ships = [...this.ships.values()].filter((s) => revealAll || this.isSunk(s));
      return { ships: ships.map((s) => this._shipView(s)), shots: this._shotList() };
    }
  }

  SB.Board = Board;
  SB.boardGeometry = Object.freeze({ shipCells, inBounds });
  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
