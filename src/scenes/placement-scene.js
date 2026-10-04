// PlacementScene: each player places the fleet (F-02, F-03) on the 10x10 grid.
// Hot seat: player 1 places, device is handed over, player 2 places.
(function (SB) {
  'use strict';
  const T = SB.theme;
  const { FLEET, ORIENTATION } = SB.rules;
  const { text, Button, background, modal } = SB.ui;
  const { shipCells } = SB.boardGeometry;

  const BOARD_X = 70;
  const BOARD_Y = 160;

  class PlacementScene extends SB.GameScene {
    constructor() {
      super('Placement');
    }

    create() {
      background(this, 0.3);
      this.input.mouse.disableContextMenu();
      this.title = text(this, T.width / 2, 40, 'FLEET PLACEMENT', 36);
      this.subtitle = text(this, T.width / 2, 82, '', 18, T.textMuted);

      this.selected = FLEET[0].type;
      this.orientation = ORIENTATION.HORIZONTAL;
      this.hover = null;
      this.activePlayer = null; // whose fleet is on screen
      this.handoff = null;
      this.pending = false;

      this.board = new SB.BoardView(this, BOARD_X, BOARD_Y, {
        onCellHover: (cell) => { this.hover = cell; this.redraw(); },
        onLeave: () => { this.hover = null; this.redraw(); },
        onCellClick: (cell) => this.onBoardClick(cell),
        onRightClick: () => this.rotate(),
      });

      // Ship palette
      const px = 690;
      text(this, px, 150, 'Your fleet', 22);
      this.shipButtons = FLEET.map((spec, i) =>
        new Button(this, px, 200 + i * 56, '', () => { this.selected = spec.type; this.redraw(); }, { width: 280, height: 46, size: 18 }));
      this.btnRotate = new Button(this, px - 72, 490, 'Rotate (R)', () => this.rotate(), { width: 136, height: 44, size: 17, color: T.button.secondary });
      this.btnClear = new Button(this, px + 72, 490, 'Clear', () => this.clearFleet(), { width: 136, height: 44, size: 17, color: T.button.muted });
      this.btnReady = new Button(this, px, 556, 'Ready', () => this.ready(), { width: 280, color: T.button.warn });
      this.message = text(this, T.width / 2, 610, '', 18, T.danger);
      text(this, BOARD_X + 200, BOARD_Y + 425, 'Click a ship, then a cell. Right-click or R to rotate. Click a placed ship to move it.', 15, T.textDim);

      this.input.keyboard.on('keydown-R', () => this.rotate());
      this.bindSession();
    }

    // ---- state ---------------------------------------------------------

    /** Hot seat: first player who hasn't readied. Online: always me. */
    pickActivePlayer() {
      const s = this.session;
      if (s.mode !== 'hotseat') return s.localPlayers[0];
      const v = s.view(0);
      return v.players[0].ready ? 1 : 0;
    }

    view() {
      return this.session.view(this.activePlayer);
    }

    refresh() {
      const next = this.pickActivePlayer();
      if (next !== this.activePlayer) {
        this.activePlayer = next;
        this.selected = FLEET[0].type;
        if (this.session.mode === 'hotseat') this.showHandoff();
      }
      this.redraw();
    }

    showHandoff() {
      if (this.handoff) this.handoff.destroy();
      const v = this.view();
      const me = v.players[this.activePlayer].name;
      const other = v.players[1 - this.activePlayer].name;
      this.handoff = modal(this, {
        title: `${me}: place your fleet`,
        body: `Pass the device to ${me}.\n${other}, no peeking!`,
        buttons: [{ label: `I'm ${me}`, onClick: () => { this.handoff.destroy(); this.handoff = null; } }],
      });
    }

    // ---- input -----------------------------------------------------------

    rotate() {
      this.orientation = this.orientation === ORIENTATION.HORIZONTAL ? ORIENTATION.VERTICAL : ORIENTATION.HORIZONTAL;
      this.redraw();
    }

    onBoardClick(cell) {
      const v = this.view();
      if (this.pending || v.players[this.activePlayer].ready) return;
      if (this.selected) {
        this.send({ type: 'place', ship: this.selected, x: cell.x, y: cell.y, orientation: this.orientation }, () => {
          const placed = new Set(this.view().ownBoard.ships.map((s) => s.type));
          const next = FLEET.find((s) => !placed.has(s.type));
          this.selected = next ? next.type : null;
        });
        return;
      }
      // Nothing selected: pick up the ship under the cursor.
      const ship = v.ownBoard.ships.find((s) => s.cells.some((c) => c.x === cell.x && c.y === cell.y));
      if (ship) {
        this.selected = ship.type;
        this.orientation = ship.orientation;
      }
      this.redraw();
    }

    clearFleet() {
      const ships = this.view().ownBoard.ships;
      ships.forEach((s) => this.send({ type: 'remove', ship: s.type }));
      this.selected = FLEET[0].type;
    }

    ready() {
      this.send({ type: 'ready' });
    }

    send(action, onOk) {
      this.pending = true;
      this.session.dispatch(this.activePlayer, action)
        .then(() => { this.message.setText(''); if (onOk) onOk(); })
        .catch((err) => this.message.setText(T.errorText(err.code)))
        .finally(() => { this.pending = false; this.redraw(); });
    }

    // ---- drawing ---------------------------------------------------------

    previewFor(v) {
      if (!this.selected || !this.hover || v.players[this.activePlayer].ready) return null;
      const spec = SB.rules.shipSpec(this.selected);
      const scratch = new SB.Board();
      v.ownBoard.ships.forEach((s) => scratch.placeShip(s.type, s.x, s.y, s.orientation));
      return {
        cells: shipCells(this.hover.x, this.hover.y, spec.length, this.orientation),
        valid: scratch.validatePlacement(this.selected, this.hover.x, this.hover.y, this.orientation) === null,
      };
    }

    redraw() {
      const v = this.view();
      if (!v) return;
      const me = v.players[this.activePlayer];
      const isReady = me.ready;
      const placed = new Set(v.ownBoard.ships.map((s) => s.type));

      this.subtitle.setText(isReady
        ? `${me.name} is ready. Waiting for ${v.players[1 - this.activePlayer].name}…`
        : `${me.name}, place your ships.`);
      this.board.setEnabled(!isReady);
      this.board.render({
        // Lift the selected ship off the board while it's being moved.
        ships: v.ownBoard.ships.filter((s) => !(this.selected === s.type && this.hover)),
        preview: this.previewFor(v),
      });

      FLEET.forEach((spec, i) => {
        const b = this.shipButtons[i];
        b.setLabel(`${placed.has(spec.type) ? '✓ ' : ''}${spec.name}  ${'■'.repeat(spec.length)}`);
        b.color = this.selected === spec.type ? T.button.warn : placed.has(spec.type) ? T.button.secondary : T.button.primary;
        b.setEnabled(!isReady);
      });
      this.btnRotate.setLabel(this.orientation === ORIENTATION.HORIZONTAL ? 'Rotate: ↔' : 'Rotate: ↕').setEnabled(!isReady);
      this.btnClear.setEnabled(!isReady && placed.size > 0);
      this.btnReady.setEnabled(!isReady && placed.size === FLEET.length);
      this.btnReady.setLabel(isReady ? 'Ready ✓' : 'Ready');
    }
  }

  SB.PlacementScene = PlacementScene;
})(window.PortPhaser);
