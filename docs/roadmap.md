# Roadmap

Implementation plan for [GAME.md](GAME.md). Code structure: [architecture.md](architecture.md).

Last updated: 2026-10-04

## Phase 1: Core combat — done

- [x] Grid board (10x10, 400x400px) — F-01
- [x] Fleet placement on the 10x10 grid, rotate, move, clear — F-02 (D-01)
- [x] Ship types: Battleship, Submarine, Destroyer, Mine, Radar — F-03 (D-02)
- [x] Missile attack, one per turn — F-04
- [x] Hit / miss / sink detection and markers — F-05, F-06
- [x] End of match, forfeit — F-07
- [x] Strictly alternating turns — F-08
- [x] Hot seat with handoff screens — F-09
- [x] Online sessions with room codes, server as source of truth, deletion at match end — F-10 (D-03)

- [x] Peer-to-peer online play (WebRTC/PeerJS) and Vercel deployment — D-06

Follow-ups:
- [ ] Reconnect a dropped peer-to-peer guest instead of forfeiting immediately (short grace period).
- [ ] Optional: commit-reveal fleet hashes so the host can't peek at the guest's fleet.
- [ ] In-game rename UI (the `rename` action already exists).
- [ ] Reconnect after a page reload in online play (keep the token in `sessionStorage`).
- [ ] Online placement: clicks made while the previous request is in flight are dropped; show a busy cursor instead.

## Phase 2: Advanced weapons — blocked on GAME.md questions Q-01 to Q-07

- [ ] Radar (limited uses) — F-12
- [ ] Air support (limited uses) — F-13
- [ ] Bomber (limited uses) — F-14
- [ ] Torpedo (limited uses) — F-15
- [ ] Fighter (limited uses) — F-17
- Nuclear (F-16) excluded from the starter.

Planned shape: a `weapons` inventory per player in `Match`, a `useWeapon {weapon, x, y}` action, and weapon rules in `shared/weapons.js`.

## Phase 3: Customization

- [ ] Ship skins — F-28 (`theme.shipColor` hook, art in `assets/skins/`)
- [ ] Avatar / flag — F-29

## Not in scope

AI opponent, port city building, progression, online features beyond room codes (F-30–F-33), shop, minimap, settings, audio. See GAME.md section 4.
