// Small Phaser UI helpers: background, text, buttons, mute toggle, modal overlay.
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

  /** A rectangle button with a label. Phaser has no built-in button, so this is ours. Clicks play `sound` (null for none). */
  class Button extends Phaser.GameObjects.Container {
    constructor(scene, x, y, label, onClick, { width = 220, height = 48, color = T.button.primary, size = 20, sound = 'click' } = {}) {
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
      this.on('pointerdown', (pointer) => {
        if (!this.enabled || pointer.rightButtonDown()) return;
        if (sound) SB.sfx.play(scene, sound);
        onClick();
      });
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

  /** Speaker icon in the top-left corner that mutes all sound; M does the same. The setting is remembered. */
  function muteToggle(scene) {
    const icon = () => (SB.sfx.isMuted() ? '🔇' : '🔊');
    const t = scene.add.text(22, 22, icon(), { fontFamily: T.font, fontSize: '24px' })
      .setOrigin(0.5).setDepth(200).setAlpha(0.8).setInteractive({ useHandCursor: true });
    const toggle = () => { SB.sfx.toggleMute(scene); t.setText(icon()); };
    t.on('pointerdown', toggle);
    t.on('pointerover', () => t.setAlpha(1));
    t.on('pointerout', () => t.setAlpha(0.8));
    // Not while typing a name or room code into a menu field.
    scene.input.keyboard.on('keydown-M', (e) => { if (!(e.target instanceof HTMLInputElement)) toggle(); });
    return t;
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

  SB.ui = { background, text, Button, muteToggle, modal };
})(window.PortPhaser);
