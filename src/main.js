// Entry point: wires the scenes into a Phaser game. Load order is defined in index.html.
(function (SB) {
  'use strict';
  const T = SB.theme;

  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: T.width,
    height: T.height,
    backgroundColor: '#0a2a3a',
    dom: { createContainer: true }, // menu text inputs
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [SB.BootScene, SB.MenuScene, SB.LobbyScene, SB.PlacementScene, SB.CombatScene],
  };

  SB.game = new Phaser.Game(config);
})(window.PortPhaser);
