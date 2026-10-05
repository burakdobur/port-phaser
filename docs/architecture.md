# Architecture

How the code is organised. Rules come from [GAME.md](GAME.md) and [session.md](session.md);
the plan is in [roadmap.md](roadmap.md).

Last updated: 2026-10-04 (peer-to-peer transport, Vercel deploy)

## Layers

```
            ┌────────────────────────── browser ───────────────────────────┐
            │  Scenes (Phaser)  Boot → Menu → Lobby → Placement → Combat   │
            │        │ render views, send actions                          │
            │  Session client   LocalSession | PeerSession | RemoteSession │
            └────────┼─────────────────────────────────────┼───────────────┘
                     │ in-process (hot seat, P2P host)     │ HTTP + SSE (?net=server)
                     ▼                                     ▼
            ┌──────────────────┐                ┌──────────────────────────┐
            │  shared/ domain  │◄───────────────│ server/ SessionStore     │
            │  Match, Board,   │   same files   │ (one Match per room code)│
            │  rules, roomCode │                └──────────────────────────┘
            └──────────────────┘
```

1. **Domain (`shared/`)** — plain JavaScript, no Phaser, no network. Loaded by `<script>` tags in the
   browser (`window.PortPhaser`) and by `require('./shared')` in Node.
   - `rules.js` — constants from GAME.md (board size, fleet, phases) and `RuleError`.
   - `board.js` — `Board`: one player's fleet and the shots received. Placement validation, hit/miss/sink, owner and fog-of-war views.
   - `match.js` — `Match`: aggregate root. Players, phase state machine, turn order. Every change goes through `apply(player, action)`; `viewFor(player)` returns what that player may see.
   - `room-code.js` — secure room-code generation and normalisation.
2. **Session clients (`src/net/`)** — one interface, two implementations:
   `mode`, `code`, `localPlayers`, `deleted`, `view(player)`, `dispatch(player, action) → Promise`, `subscribe(fn)`, `leave()`.
   - `LocalSession` runs a Match in the browser for hot seat.
   - `PeerSession` (default online) — WebRTC via PeerJS. The host runs the Match like `LocalSession` and pushes
     the guest its own view over a DataChannel; the guest behaves like `RemoteSession`. PeerJS and ICE servers are injectable,
     so `test/peer-session.test.js` runs it against an in-memory fake.
   - `RemoteSession` talks to the Node server (`?net=server`); it only ever has its own player's view.
3. **Server (`server/`)** — `session-store.js` holds sessions by code, authenticates players by token,
   applies actions to the Match, broadcasts views, deletes sessions at match end or after 30 idle minutes.
   `server.js` is the HTTP adapter (static files + API + SSE + `/api/ice`). No npm dependencies.
   `ice-config.js` builds the STUN/TURN list from env vars; `api/ice.js` exposes it as a Vercel Function.
4. **Presentation (`src/ui`, `src/scenes`)** — Phaser 3.86.
   - `GameScene` (base) subscribes to the session and switches scene when the phase changes:
     `waiting → Lobby`, `placement → Placement`, `combat/ended → Combat`. It also shows "session closed".
   - `BoardView` draws a grid, ships, markers and placement preview; it reports clicks and never changes state.
   - `widgets.js` — background, text, `Button`, `modal` (used for hot-seat handoff and end of match).
   - `theme.js` — colours and error texts; `shipColor(type)` is the skin hook (F-28).
   - `src/audio/sfx.js` — sound effects by game event (`SB.sfx.play(scene, 'hit')`). Scenes name the event; the
     `CUES` table maps it to a file and volume in `assets/audio/`, so sounds change without touching scenes. Mute is
     global and remembered (`ui.muteToggle`, M key). Combat sounds are regenerated with `node scripts/make-sfx.js`.

## Rules of the road

- Game rules live only in `shared/`. Scenes ask the session, never decide outcomes.
- Scenes render from views only, so hot seat and online behave the same.
- New actions: add to `Match.apply`, test in `test/domain.test.js`, then call `session.dispatch` from a scene.
- New transport (e.g. WebSockets): implement the session-client interface on the browser side and reuse `SessionStore` on the server.

## Running and testing

- `npm start` — server on http://localhost:8080 (`PORT`, `HOST` env vars override).
- `npm test` — domain unit tests, a full peer-to-peer match against a fake PeerJS, and a full match against the server.
- `npm run build` — copies the browser files into `dist/` (what Vercel serves). Keep its list in step with `STATIC_ALLOW`.
- Hot seat also works by opening `index.html` from disk; online play needs the server.
