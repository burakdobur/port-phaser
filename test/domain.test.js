const test = require('node:test');
const assert = require('node:assert/strict');
const SB = require('../shared');
const { Match, Board, rules, roomCode } = SB;
const { PHASE, SHOT, FLEET } = rules;

/** Places the standard fleet in rows 0..4, left-aligned, horizontal. */
function placeFleet(match, player) {
  FLEET.forEach((s, row) => match.apply(player, { type: 'place', ship: s.type, x: 0, y: row, orientation: 'h' }));
}

function readyMatch() {
  const m = new Match();
  m.addPlayer('Ada');
  m.addPlayer('');
  placeFleet(m, 0);
  placeFleet(m, 1);
  m.apply(0, { type: 'ready' });
  m.apply(1, { type: 'ready' });
  return m;
}

test('room codes: 4 chars from the alphabet, normalised case-insensitively', () => {
  for (let i = 0; i < 200; i++) {
    const c = roomCode.generate();
    assert.match(c, /^[A-Z2-9]{4}$/);
    assert.ok([...c].every((ch) => roomCode.ALPHABET.includes(ch)));
  }
  assert.equal(roomCode.ALPHABET.length, 32);
  assert.equal(roomCode.normalize(' ab 3k '), 'AB3K');
  assert.equal(roomCode.normalize('abc'), null);
  assert.equal(roomCode.normalize('ab-3k'), null);
});

test('board: placement validates bounds, overlap, and allows re-placing a ship', () => {
  const b = new Board();
  assert.throws(() => b.placeShip('battleship', 7, 0, 'h'), { code: 'out_of_bounds' }); // F-01 edges
  assert.throws(() => b.placeShip('battleship', 0, 7, 'v'), { code: 'out_of_bounds' });
  b.placeShip('battleship', 6, 0, 'h');
  assert.throws(() => b.placeShip('submarine', 6, 0, 'v'), { code: 'overlap' });
  b.placeShip('battleship', 0, 0, 'v'); // move it
  b.placeShip('submarine', 6, 0, 'v');
  assert.throws(() => b.placeShip('cruiser', 0, 9, 'h'), { code: 'unknown_ship' });
  assert.equal(b.isFleetComplete(), false);
});

test('match: default names, phases waiting -> placement -> combat', () => {
  const m = new Match();
  assert.equal(m.phase, PHASE.WAITING);
  m.addPlayer('Ada');
  m.addPlayer('   ');
  assert.equal(m.phase, PHASE.PLACEMENT);
  assert.deepEqual(m.players.map((p) => p.name), ['Ada', 'Player 2']);
  assert.throws(() => m.addPlayer('X'), { code: 'session_full' });
  assert.throws(() => m.apply(0, { type: 'ready' }), { code: 'fleet_incomplete' });
  placeFleet(m, 0);
  m.apply(0, { type: 'ready' });
  assert.throws(() => m.apply(0, { type: 'remove', ship: 'mine' }), { code: 'already_ready' });
  assert.equal(m.phase, PHASE.PLACEMENT);
  placeFleet(m, 1);
  m.apply(1, { type: 'ready' });
  assert.equal(m.phase, PHASE.COMBAT);
  assert.equal(m.currentTurn, 0); // player 1 first
});

test('match: strict alternating turns, hit/miss/sink, no repeat shots', () => {
  const m = readyMatch();
  assert.throws(() => m.apply(1, { type: 'fire', x: 0, y: 0 }), { code: 'not_your_turn' });
  assert.equal(m.apply(0, { type: 'fire', x: 9, y: 9 }).result, SHOT.MISS);
  assert.equal(m.currentTurn, 1);
  assert.equal(m.apply(1, { type: 'fire', x: 0, y: 3 }).result, SHOT.SUNK); // the 1-cell mine
  assert.equal(m.currentTurn, 0); // hits do not grant extra turns (F-08)
  assert.throws(() => m.apply(0, { type: 'fire', x: 9, y: 9 }), { code: 'already_shot' });
  assert.equal(m.apply(0, { type: 'fire', x: 0, y: 0 }).result, SHOT.HIT);
});

test('match: ends when every enemy unit is sunk (F-07)', () => {
  const m = readyMatch();
  const targets = [];
  FLEET.forEach((s, row) => { for (let x = 0; x < s.length; x++) targets.push([x, row]); });
  let miss = 0;
  for (const [x, y] of targets) {
    m.apply(0, { type: 'fire', x, y });
    if (m.phase === PHASE.ENDED) break;
    m.apply(1, { type: 'fire', x: miss % 10, y: 9 - Math.floor(miss / 10) });
    miss++;
  }
  assert.equal(m.phase, PHASE.ENDED);
  assert.equal(m.winner, 0);
  assert.equal(m.endReason, 'fleet_destroyed');
  assert.throws(() => m.apply(1, { type: 'fire', x: 5, y: 5 }), { code: 'not_in_combat' });
});

test('views hide unsunk enemy ships until match end', () => {
  const m = readyMatch();
  m.apply(0, { type: 'fire', x: 0, y: 0 }); // battleship hit, not sunk
  m.apply(1, { type: 'fire', x: 9, y: 9 });
  m.apply(0, { type: 'fire', x: 0, y: 4 }); // radar sunk
  const v = m.viewFor(0);
  assert.equal(v.ownBoard.ships.length, FLEET.length);
  assert.deepEqual(v.enemyBoard.ships.map((s) => s.type), ['radar']);
  assert.equal(v.enemyBoard.shots.length, 2);
  m.apply(1, { type: 'forfeit' });
  assert.equal(m.winner, 0);
  assert.equal(m.viewFor(0).enemyBoard.ships.length, FLEET.length);
});
