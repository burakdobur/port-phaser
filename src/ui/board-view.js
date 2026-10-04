// BoardView: draws one 10x10 grid (F-01) with ships, hit/miss markers (F-05) and a placement preview.
// Rendering only — it reports cell clicks/hover and never changes game state itself.
(function (SB) {
  'use strict';
  const T = SB.theme;
  const { BOARD_SIZE, CELL_SIZE } = SB.rules;
  const SIZE = BOARD_SIZE * CELL_SIZE; // 400
  const COLS = 'ABCDEFGHIJ';

  class BoardView {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x left edge
     * @param {number} y top edge
     * @param {{title?:string, onCellClick?:Function, onCellHover?:Function, onLeave?:Function, onRightClick?:Function}} opts
     */
    constructor(scene, x, y, opts = {}) {
      this.scene = scene;
      this.x = x;
      this.y = y;
      this.opts = opts;
      this.hoverCell = null;
      this.enabled = true;

      if (opts.title) this.title = SB.ui.text(scene, x + SIZE / 2, y - 42, opts.title, 20);
      for (let i = 0; i < BOARD_SIZE; i++) {
        SB.ui.text(scene, x + i * CELL_SIZE + CELL_SIZE / 2, y - 14, COLS[i], 13, T.textDim);
        SB.ui.text(scene, x - 14, y + i * CELL_SIZE + CELL_SIZE / 2, String(i + 1), 13, T.textDim);
      }
      this.gfx = scene.add.graphics();

      this.zone = scene.add.zone(x, y, SIZE, SIZE).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      this.zone.on('pointermove', (p) => this._hover(this.cellAt(p)));
      this.zone.on('pointerout', () => { this.hoverCell = null; opts.onLeave && opts.onLeave(); });
      this.zone.on('pointerdown', (p) => {
        if (!this.enabled) return;
        const cell = this.cellAt(p);
        if (!cell) return;
        if (p.rightButtonDown()) opts.onRightClick && opts.onRightClick(cell);
        else opts.onCellClick && opts.onCellClick(cell);
      });
    }

    setEnabled(value) {
      this.enabled = value;
      this.zone.input.cursor = value ? 'pointer' : 'default';
    }

    setTitle(value) {
      if (this.title) this.title.setText(value);
    }

    cellAt(pointer) {
      const cx = Math.floor((pointer.x - this.x) / CELL_SIZE);
      const cy = Math.floor((pointer.y - this.y) / CELL_SIZE);
      return cx >= 0 && cy >= 0 && cx < BOARD_SIZE && cy < BOARD_SIZE ? { x: cx, y: cy } : null;
    }

    _hover(cell) {
      if (!cell) return;
      if (this.hoverCell && this.hoverCell.x === cell.x && this.hoverCell.y === cell.y) return;
      this.hoverCell = cell;
      if (this.enabled && this.opts.onCellHover) this.opts.onCellHover(cell);
    }

    /**
     * @param {{ships?:Array, shots?:Array, preview?:{cells:Array, valid:boolean}, highlight?:{x,y}, crosshair?:boolean}} state
     */
    render(state) {
      const g = this.gfx;
      const C = CELL_SIZE;
      g.clear();

      // Water and grid lines
      g.fillStyle(T.water, 0.92).fillRect(this.x, this.y, SIZE, SIZE);
      g.lineStyle(1, T.waterLine, 0.9);
      for (let i = 0; i <= BOARD_SIZE; i++) {
        g.lineBetween(this.x + i * C, this.y, this.x + i * C, this.y + SIZE);
        g.lineBetween(this.x, this.y + i * C, this.x + SIZE, this.y + i * C);
      }

      // Ships
      for (const ship of state.ships || []) {
        const minX = Math.min(...ship.cells.map((c) => c.x));
        const minY = Math.min(...ship.cells.map((c) => c.y));
        const w = (Math.max(...ship.cells.map((c) => c.x)) - minX + 1) * C;
        const h = (Math.max(...ship.cells.map((c) => c.y)) - minY + 1) * C;
        g.fillStyle(ship.sunk ? T.sunkTint : T.shipColor(ship.type), ship.sunk ? 0.85 : 1);
        g.fillRoundedRect(this.x + minX * C + 4, this.y + minY * C + 4, w - 8, h - 8, 10);
        g.lineStyle(2, ship.sunk ? T.hit : 0xffffff, ship.sunk ? 0.9 : 0.5);
        g.strokeRoundedRect(this.x + minX * C + 4, this.y + minY * C + 4, w - 8, h - 8, 10);
      }

      // Placement preview
      if (state.preview) {
        g.fillStyle(state.preview.valid ? T.previewOk : T.previewBad, 0.55);
        for (const c of state.preview.cells) {
          if (c.x < 0 || c.y < 0 || c.x >= BOARD_SIZE || c.y >= BOARD_SIZE) continue;
          g.fillRect(this.x + c.x * C + 2, this.y + c.y * C + 2, C - 4, C - 4);
        }
      }

      // Shot markers (F-05): hit = red filled marker with a cross, miss = empty ring
      for (const s of state.shots || []) {
        const cx = this.x + s.x * C + C / 2;
        const cy = this.y + s.y * C + C / 2;
        if (s.result === 'miss') {
          g.lineStyle(2, T.miss, 0.85).strokeCircle(cx, cy, 7);
        } else {
          g.fillStyle(T.hit, 1).fillCircle(cx, cy, 12);
          g.lineStyle(3, 0xffffff, 1);
          g.lineBetween(cx - 6, cy - 6, cx + 6, cy + 6);
          g.lineBetween(cx + 6, cy - 6, cx - 6, cy + 6);
        }
      }

      // Last-shot highlight and aiming crosshair
      if (state.highlight) {
        g.lineStyle(3, 0xffe27a, 1).strokeRect(this.x + state.highlight.x * C + 1, this.y + state.highlight.y * C + 1, C - 2, C - 2);
      }
      if (state.crosshair && this.enabled && this.hoverCell) {
        g.lineStyle(2, 0xffffff, 0.9).strokeRect(this.x + this.hoverCell.x * C + 3, this.y + this.hoverCell.y * C + 3, C - 6, C - 6);
      }
    }
  }

  SB.BoardView = BoardView;
})(window.PortPhaser);
