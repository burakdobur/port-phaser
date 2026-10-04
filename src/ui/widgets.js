// Small Phaser UI helpers: background, text, buttons, modal overlay.
(function (SB) {
  'use strict';
  const T = SB.theme;

  function background(scene, dim = 0.3) {
    scene.add.image(0, 0, 'sky').setOrigin(0, 0);
    if (dim > 0) scene.add.rectangle(0, 0, T.width, T.height, 0x000000, dim).setOrigin(0, 0);
  }

  function text(scene, x, y, value, size = 18, color = T.text, originX = 0.5) {
    return scene.add.text(x, y, value, { fontFamily: T.font, fontSize: size + 'px', color, align: 'center' })
      .setOrigin(originX, 0.5);
  }

  /** A rectangle button with a label. Phaser has no built-in button, so this is ours. */
  class Button extends Phaser.GameObjects.Container {
    constructor(scene, x, y, label, onClick, { width = 220, height = 48, color = T.button.primary, size = 20 } = {}) {
      super(scene, x, y);
      this.color = color;
      this.enabled = true;
      this.bg = scene.add.rectangle(0, 0, width, height, color).setStrokeStyle(2, 0xffffff, 0.8);
      this.label = scene.add.text(0, 0, label, { fontFamily: T.font, fontSize: size + 'px', color: T.text }).setOrigin(0.5);
      this.add([this.bg, this.label]);
      this.setSize(width, height);
      this.setInteractive({ useHandCursor: true });
      this.on('pointerover', () => this.enabled && this.bg.setFillStyle(Phaser.Display.Color.ValueToColor(color).brighten(15).color));
      this.on('pointerout', () => this.bg.setFillStyle(this.enabled ? color : T.button.muted));
      this.on('pointerdown', (pointer) => { if (this.enabled && !pointer.rightButtonDown()) onClick(); });
      scene.add.existing(this);
    }

    setEnabled(value) {
      this.enabled = value;
      this.bg.setFillStyle(value ? this.color : T.button.muted);
      this.label.setAlpha(value ? 1 : 0.6);
      return this;
    }

    setLabel(value) {
      this.label.setText(value);
      return this;
    }
  }

  /** Full-screen blocking panel with a title, body and buttons. Used for hot-seat handoff and end of match. */
  function modal(scene, { title, body = '', buttons = [] }) {
    const c = scene.add.container(0, 0).setDepth(100);
    const shade = scene.add.rectangle(0, 0, T.width, T.height, 0x02101c, 0.92).setOrigin(0, 0).setInteractive();
    const panel = scene.add.rectangle(T.width / 2, T.height / 2, 560, 300, T.panel).setStrokeStyle(2, 0xffffff, 0.6);
    const t = text(scene, T.width / 2, T.height / 2 - 90, title, 34);
    const b = text(scene, T.width / 2, T.height / 2 - 25, body, 18, T.textMuted);
    b.setWordWrapWidth(500);
    c.add([shade, panel, t, b]);
    const gap = 240;
    const startX = T.width / 2 - ((buttons.length - 1) * gap) / 2;
    buttons.forEach((def, i) => {
      c.add(new Button(scene, startX + i * gap, T.height / 2 + 80, def.label, def.onClick, { color: def.color || T.button.primary }));
    });
    return c;
  }

  SB.ui = { background, text, Button, modal };
})(window.PortPhaser);
