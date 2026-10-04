# Port Phaser - Feature Catalog

Source of truth for the port. Every feature below either has an implementation, or is
planned in [roadmap.md](roadmap.md). Session rules live in [session.md](session.md),
code structure in [architecture.md](architecture.md).

Last updated: 2026-10-04
Status: v1 starter scope — Phase 1 implemented

## 1. Core combat (MUST HAVE) — Phase 1

| ID | Feature | Rule | Code |
|----|---------|------|------|
| F-01 | Grid board | 10x10 cells, cell size 40px, board 400x400. Both players have a board of the same size. | `shared/rules.js`, `src/ui/board-view.js` |
| F-02 | Fleet placement | Ships are placed on the player's own 10x10 board (see D-01). Horizontal or vertical, fully on the board, no overlap. Touching is allowed. | `shared/board.js`, `src/scenes/placement-scene.js` |
| F-03 | Ship types | Battleship, Submarine, Destroyer, Mine, Radar — lengths in section 1.1. | `shared/rules.js` |
| F-04 | Missile attack | Point and tap a cell on the enemy board to fire. One missile per turn. A cell can't be targeted twice. | `shared/match.js`, `src/scenes/combat-scene.js` |
| F-05 | Hit / miss | Hit shows a filled marker on the board. Miss shows an empty marker. | `src/ui/board-view.js` |
| F-06 | Sink | A ship is destroyed when all its cells are hit. Sunk enemy ships become visible. | `shared/board.js` |
| F-07 | End of match | The match ends when all enemy units (including Mine and Radar) are sunk, or a player leaves (forfeit). | `shared/match.js` |
| F-08 | Turn order | Strictly alternating. Player 1 fires first, then player 2. A hit does **not** grant an extra turn. | `shared/match.js` |
| F-09 | Hot seat | Local two-player on one device, with a "pass the device" screen between turns so boards stay hidden. | `src/net/local-session.js` |
| F-10 | Room-code sessions | Online two-player match: a session is created on the server, shared by room code, and deleted after the match. See session.md. | `server/`, `src/net/remote-session.js` |

### 1.1 Fleet (decision D-02)

| Unit | Length | Phase 1 behaviour | Planned special behaviour |
|------|--------|-------------------|---------------------------|
| Battleship | 4 | Normal ship | — |
| Submarine | 3 | Normal ship | — |
| Destroyer | 2 | Normal ship | — |
| Mine | 1 | Counts as a unit that must be sunk | Open question Q-05 |
| Radar | 1 | Counts as a unit that must be sunk | Enables the Radar weapon (Q-01) |

## 2. Advanced-mode weapons (MUST HAVE) — Phase 2, not started

The rules below are not complete enough to implement. Open questions are listed in section 6.

F-12 Radar - Reveals a portion of the enemy board. Limited use count per match.
F-13 Air support - Strikes a random enemy ship. Limited use count per match.
F-14 Bomber - Drops a bomb on a chosen cell. Limited use count per match.
F-15 Torpedo - Fires a torpedo at a chosen cell. Limited use count per match.
F-17 Fighter - Strikes a random enemy ship. Limited use count per match.

Nuclear (F-16) is explicitly excluded from the starter scope.

## 3. Customization (MUST HAVE) — Phase 3, not started

F-28 Skins - Ship skins, from World War I classics to modern designs. Hook: `theme.shipColor(type)` in `src/ui/theme.js`; art goes in `assets/skins/`.
F-29 Avatar / flag - Player profile customization. Player names already exist (session.md).

## 4. Not in scope for the starter

- F-11 AI opponent.
- F-16 Nuclear.
- F-18 to F-23 Port city building.
- F-24 to F-27 Progression system.
- F-30 to F-33 Online multiplayer features **beyond** F-10 room-code matches (matchmaking, accounts, friends, rankings). F-10 itself is in scope (D-03).
- F-35 Minimap, F-36 Settings, F-37 Shop, F-38 to F-40 Audio.

## 5. Decisions log

| ID | Date | Decision | Why |
|----|------|----------|-----|
| D-01 | 2026-10-04 | Fleet is placed on the 10x10 battle grid, not a 5x5 board. | A 5x5 board can't hold a length-4 Battleship next to the rest of the fleet, and nothing described how 5x5 maps onto 10x10. |
| D-02 | 2026-10-04 | Fleet lengths 4/3/2/1/1 (section 1.1). Every unit counts toward "all ships sunk". | F-03 named the units but not their sizes. |
| D-03 | 2026-10-04 | F-10 is real online play via a Node server; the server is the source of truth. Hot seat (F-09) stays. | F-10/session.md describe networked rooms; the old "online multiplayer out of scope" line now refers only to F-30–F-33. |
| D-04 | 2026-10-04 | Hot seat sessions have no room code. | Both players are on the same device; nothing needs to be shared. |
| D-05 | 2026-10-04 | Leaving a match forfeits it; the opponent wins and the session is deleted. | session.md requires the other player to be notified when a session ends. |
| D-06 | 2026-10-04 | Default online transport is peer-to-peer WebRTC (PeerJS); the room creator's browser hosts the Match. The Node server stays as an option (`?net=server`). Partly supersedes D-03. | Hosting on Vercel (static + tiny functions) can't keep in-memory sessions or long-lived SSE. It's a hobby game, so a host who could peek at the opponent's fleet in DevTools is accepted. |

## 6. Open questions (block Phase 2)

| ID | Question |
|----|----------|
| Q-01 | Radar (F-12): what area is revealed (e.g. 3x3)? Does it require the player's Radar unit to be afloat? How many uses? |
| Q-02 | Air support (F-13) and Fighter (F-17) have identical descriptions. How do they differ (damage, area, unlock)? |
| Q-03 | Bomber (F-14): does the bomb hit a pattern (cross, 3x3) or a single cell? Otherwise it equals a missile. |
| Q-04 | Torpedo (F-15): does it travel along a row/column until it hits, or hit a single cell? Otherwise it equals a missile. |
| Q-05 | Mine: what happens when it is hit (damage to the attacker's board, lost turn)? |
| Q-06 | Does using a special weapon replace the missile for that turn? |
| Q-07 | Use counts per weapon per match. |
