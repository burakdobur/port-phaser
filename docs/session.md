# Session and Room Code

Source of truth for the session layer. A session is a single multiplayer match:
created by one player, shared by a room code, and deleted when the match ends.
Feature context: F-09 and F-10 in [GAME.md](GAME.md).

Last updated: 2026-10-04

## Session lifecycle

1. Player starts a session. A room code is generated and shown to that player.
2. Another player enters the room code to join.
3. Both players place their fleets.
4. Placement ends when both players have pressed Ready.
5. Turn-based combat begins.
6. Combat ends when all enemy ships are sunk, or a player leaves (forfeit).
7. The session is deleted. The room code is no longer valid.

Match phases (`shared/rules.js` `PHASE`): `waiting` -> `placement` -> `combat` -> `ended`.

Hot seat (F-09) uses the same Match and phases in the browser, starting at `placement`, with no room code.

## Room code

- Format: 4 characters, alphanumeric, case insensitive.
- Alphabet: `A-Z` without `I` and `O`, plus `2-9` (32 characters, no look-alikes).
- Generated with a cryptographically secure random number generator (`crypto.getRandomValues`).
- Unique among live sessions.
- Displayed large and letter-spaced (`A B 3 K`) so it can be read out loud. An invite link `?room=CODE` pre-fills the join field.

## Turn order

- Player 1 fires first, then Player 2.
- Strictly alternates until the match ends (a hit does not grant another turn).
- Turn state is stored in the session's Match, not in the player.

## Sync model

Two transports implement this model (D-06). **Peer-to-peer is the default**; the Node server is used with `?net=server`.
Below, "the server" means whichever side owns the Match: the room creator's browser (peer-to-peer) or the Node server.

- The server holds the Match and is the source of truth for turn order and match state.
- Clients send commands; the server validates them and rejects illegal ones (wrong turn, repeated cell, overlap...).
- After every change the server pushes each player **their own view**: own board in full, enemy board as shots only. Enemy ships appear when sunk, and all are revealed when the match ends.
- Each view carries a `version` number so clients can drop stale updates.
- Players are identified by a secret token issued on create/join.

### Peer-to-peer (WebRTC via PeerJS) — default

- The host (room creator) registers with the PeerJS broker using the id `portphaser-<code>`, so the room code
  is all the guest needs. An id already taken on the broker means the code is in use; the host picks another.
- After the handshake the players talk directly over one reliable DataChannel; the broker is no longer involved.
- The host's browser runs the Match and validates every guest action through `Match.apply`.
- Trust: the host's browser holds both fleets, so the host could read the guest's fleet in DevTools. Accepted for a hobby game.
- If the guest's connection drops, the guest forfeits. If the host's drops, the guest sees "opponent left".
- ICE: STUN by default. TURN (for players behind strict NATs) is configured with env vars and served by `GET /api/ice`.
- Join failures are reported by step: `broker_unreachable` (no answer from the PeerJS broker within 10 s), `session_not_found` (broker has no host with that code), `p2p_failed` (host found, but the direct channel did not open within 20 s or closed first; usually NAT/firewall, fixed by TURN).

| Direction | Message |
|-----------|---------|
| guest → host | `{t:'hello', name}` |
| host → guest | `{t:'welcome', player, view}` or `{t:'reject', error}` (`session_full`) |
| guest → host | `{t:'action', id, action}` |
| host → guest | `{t:'result', id, error}` — `error` is `null` on success |
| host → guest | `{t:'state', view}` after every change |
| host → guest | `{t:'deleted', reason, view}` when the session ends |

### Node server (HTTP + Server-Sent Events) — `?net=server`

| Method | Path | Body | Result |
|--------|------|------|--------|
| POST | `/api/sessions` | `{name}` | `{code, player, token}` |
| POST | `/api/sessions/:code/join` | `{name}` | `{code, player, token}` — 404 unknown code, 409 full |
| POST | `/api/sessions/:code/actions` | `{token, action}` | `{version}` — 400 `{error}` on rule violation, 403 bad token |
| GET | `/api/sessions/:code/state?token=` | | `{view}` |
| GET | `/api/sessions/:code/events?token=` | | SSE stream of `state` and `session_deleted` events |

Actions: `place {ship, x, y, orientation:'h'|'v'}`, `remove {ship}`, `ready`, `fire {x, y}`, `rename {name}`, `forfeit`.

## Session deletion

- The session is deleted when the match ends (fleet destroyed or forfeit).
- Sessions with no activity for 30 minutes are deleted (`expired`).
- The room code is no longer valid after deletion.
- Every player in the session is notified with a `session_deleted` event carrying the reason and their final view.

## Player names

- Each player has a name, defaulting to "Player 1" and "Player 2" (max 16 characters).
- Names are entered on the menu. Either player can rename themselves at any time with the `rename` action (no in-game UI yet — see roadmap).
