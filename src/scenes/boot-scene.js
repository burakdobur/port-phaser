// BootScene: loads the sound effects and builds shared textures once, then opens the menu.
// The night-sky backdrop is procedural because assets/ has no art yet.
(function (SB) {
  'use strict';
  const T = SB.theme;

  class BootScene extends Phaser.Scene {
    constructor() {
      super('Boot');
    }

    preload() {
      SB.sfx.preload(this);
    }

    create() {
      SB.sfx.init(this.game);
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      const bands = [0x0b1e33, 0x10294a, 0x16354f, 0x1f4a6a, 0x2a5f84];
      const bandH = 470 / bands.length;
      bands.forEach((color, i) => g.fillStyle(color, 1).fillRect(0, i * bandH, T.width, bandH + 1));

      const rnd = new Phaser.Math.RandomDataGenerator(['sea-battle']); // same sky every time
      for (let i = 0; i < 90; i++) {
        g.fillStyle(0xffffff, rnd.realInRange(0.3, 1)).fillCircle(rnd.between(0, T.width), rnd.between(0, 440), rnd.realInRange(0.5, 2));
      }
      g.fillStyle(0xfff6d8, 1).fillCircle(790, 90, 40);
      g.fillStyle(0xe6dcb8, 1).fillCircle(778, 80, 9).fillCircle(800, 102, 12);

      g.fillStyle(0x0d2f4a, 1).fillRect(0, 470, T.width, T.height - 470);
      g.fillStyle(0x2f6a91, 0.5);
      for (let i = 0; i < 60; i++) g.fillRect(rnd.between(0, T.width), rnd.between(480, T.height), rnd.between(10, 40), 2);

      g.generateTexture('sky', T.width, T.height);
      g.destroy();
      this.scene.start('Menu');
    }
  }

  SB.BootScene = BootScene;
})(window.PortPhaser);
