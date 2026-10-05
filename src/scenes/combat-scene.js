// CombatScene: alternating missile turns (F-04, F-08), hit/miss/sink (F-05, F-06), end of match (F-07).
// Hot seat: after each shot the result is shown, then the device is handed to the other player.
(function (SB) {
  'use strict';
  const T = SB.theme;
  const { PHASE, SHOT } = SB.rules;
  const { text, Button, background, modal } = SB.ui;

  const LEFT_X = 40;
  const RIGHT_X = 470;
  const BOARD_Y = 170;
  const RESULT_DELAY_MS = 1300;
  const IMPACT_DELAY_MS = 400; // cannon fires, then the shot lands
  const IMPACT_CUE = { [SHOT.MISS]: 'splash', [SHOT.HIT]: 'hit', [SHOT.SUNK]: 'sink' };
  const COLS = 'ABCDEFGHIJ';
  const cellName = (x, y) => COLS[x] + (y + 1);

  class CombatScene extends SB.GameScene {
    constructor() {
      super('Combat');
      this.handlesEnd = true;
    }

    create() {
      background(this, 0.25);
      this.title = text(this, T.width / 2, 36, 'COMBAT', 34);
      this.turnText = text(this, T.width / 2, 82, '', 22);
      this.resultText = text(this, T.width / 2, 600, '', 22);

      this.own = new SB.BoardView(this, LEFT_X, BOARD_Y, { title: 'Your fleet' });
      this.own.setEnabled(false);
      this.enemy = new SB.BoardView(this, RIGHT_X, BOARD_Y, {
        title: 'Enemy waters',
        onCellHover: () => this.redraw(),
        onLeave: () => this.redraw(),
        onCellClick: (cell) => this.fire(cell),
      });
      new Button(this, T.width - 90, 36, 'Leave', () => this.toMenu(), { width: 130, height: 38, size: 16, color: T.button.muted });

      this.viewer = null; // whose boards are on screen (changes only after a handoff in hot seat)
      this.lastSeenShot = null;
      this.holding = false; // showing a result before handoff
      this.pending = false;
      this.overlay = null;
      this.endShown = false;
      this.bindSession();
    }

    // ---- state -----------------------------------------------------------

    refresh(v) {
      if (!v) return;
      if (this.viewer === null) {
        this.viewer = this.session.mode === 'hotseat' ? v.currentTurn : this.session.localPlayers[0];
        if (this.session.mode === 'hotseat' && v.phase === PHASE.COMBAT) this.showHandoff(this.viewer, 'fires first');
      }
      const view = this.session.view(this.viewer);
      // A player never fires at the same cell twice, so shooter + cell identifies a shot; the view version
      // alone would replay the last shot (and its sound) on any later change, such as a forfeit.
      const shotKey = view.lastShot && `${view.lastShot.by}:${view.lastShot.x},${view.lastShot.y}`;
      if (view.lastShot && shotKey !== this.lastSeenShot) {
        this.lastSeenShot = shotKey;
        this.announce(view);
      }
      if (view.phase === PHASE.ENDED) return this.showEnd(view);
      this.redraw();
    }

    announce(view, allowHandoff = true) {
      const s = view.lastShot;
      const mine = s.by === view.you;
      const shipName = s.shipType ? SB.rules.shipSpec(s.shipType).name : '';
      const shooter = view.players[s.by].name;
      let msg;
      if (s.result === SHOT.MISS) msg = mine ? `Miss at ${cellName(s.x, s.y)}.` : `${shooter} missed at ${cellName(s.x, s.y)}.`;
      else if (s.result === SHOT.HIT) msg = mine ? `Hit at ${cellName(s.x, s.y)}!` : `${shooter} hit your ship at ${cellName(s.x, s.y)}!`;
      else msg = mine ? `You sank the enemy ${shipName}!` : `${shooter} sank your ${shipName}!`;
      this.resultText.setText(msg).setColor(s.result === SHOT.MISS ? T.textMuted : T.danger);
      if (allowHandoff) { // the replay for the next hot-seat viewer is silent: they heard it already
        SB.sfx.play(this, 'cannon');
        SB.sfx.play(this, IMPACT_CUE[s.result] || 'hit', { delay: IMPACT_DELAY_MS });
      }

      // Hot seat: let the shooter see the result, then hand the device over.
      if (allowHandoff && this.session.mode === 'hotseat' && mine && view.phase === PHASE.COMBAT) {
        this.holding = true;
        this.time.delayedCall(RESULT_DELAY_MS, () => {
          this.holding = false;
          this.viewer = 1 - this.viewer;
          this.showHandoff(this.viewer, 'your turn');
          this.announce(this.session.view(this.viewer), false); // tell the new viewer what just hit them
          this.redraw();
        });
      }
    }

    showHandoff(player, why) {
      if (this.overlay) this.overlay.destroy();
      const v = this.session.view(player);
      const name = v.players[player].name;
      const other = v.players[1 - player].name;
      this.overlay = modal(this, {
        title: `${name}, ${why}`,
        body: `Pass the device to ${name}.\n${other}, look away!`,
        buttons: [{ label: `I'm ${name}`, onClick: () => { this.overlay.destroy(); this.overlay = null; this.redraw(); } }],
      });
    }

    showEnd(view) {
      this.redraw();
      if (this.endShown) return;
      this.endShown = true;
      if (this.overlay) { this.overlay.destroy(); this.overlay = null; }
      const winnerName = view.winner === null ? 'Nobody' : view.players[view.winner].name;
      const iWon = this.session.mode === 'online' && view.winner === view.you;
      const title = this.session.mode === 'online' ? (iWon ? 'Victory!' : 'Defeat') : `${winnerName} wins!`;
      const lost = this.session.mode === 'online' && !iWon;
      const reason = view.endReason === 'forfeit'
        ? `${view.players[1 - view.winner].name} left the game.`
        : `${winnerName} sank the entire enemy fleet.`;
      const footer = this.session.code ? `\nRoom code ${this.session.code} is no longer valid.` : '';
      // After a final shot, wait for the sink sound to play out before the result.
      this.time.delayedCall(view.endReason === 'forfeit' ? 0 : 1800, () => {
        SB.sfx.play(this, lost ? 'defeat' : 'victory');
        modal(this, { title, body: reason + footer, buttons: [{ label: 'Back to menu', onClick: () => this.toMenu() }] });
      });
    }

    // ---- input -----------------------------------------------------------

    fire(cell) {
      const v = this.session.view(this.viewer);
      if (!v.isYourTurn || this.pending || this.holding || this.overlay) return;
      if (v.enemyBoard.shots.some((s) => s.x === cell.x && s.y === cell.y)) {
        this.resultText.setText(T.errorText('already_shot')).setColor(T.textDim);
        return;
      }
      this.pending = true;
      this.session.dispatch(this.viewer, { type: 'fire', x: cell.x, y: cell.y })
        .catch((err) => this.resultText.setText(T.errorText(err.code)).setColor(T.danger))
        .finally(() => { this.pending = false; this.redraw(); });
    }

    // ---- drawing ---------------------------------------------------------

    redraw() {
      if (this.viewer === null) return;
      const v = this.session.view(this.viewer);
      if (!v) return;
      const me = v.players[this.viewer];
      const opp = v.players[1 - this.viewer];
      const ended = v.phase === PHASE.ENDED;
      const canFire = v.isYourTurn && !this.holding && !this.pending && !this.overlay;

      this.own.setTitle(`${me.name}'s fleet`);
      this.enemy.setTitle(`${opp.name}'s waters`);
      if (ended) this.turnText.setText('Match over');
      else if (this.holding) this.turnText.setText(' ');
      else this.turnText.setText(v.isYourTurn ? `${me.name}, your turn — fire at ${opp.name}'s waters` : `Waiting for ${opp.name} to fire…`);

      const last = v.lastShot;
      this.own.render({ ships: v.ownBoard.ships, shots: v.ownBoard.shots, highlight: last && last.by !== this.viewer ? last : null });
      this.enemy.setEnabled(canFire && !ended);
      this.enemy.render({
        ships: v.enemyBoard.ships, shots: v.enemyBoard.shots,
        highlight: last && last.by === this.viewer ? last : null,
        crosshair: canFire,
      });
    }
  }

  SB.CombatScene = CombatScene;
})(window.PortPhaser);
