// LobbyScene: shows the room code large and readable while waiting for player 2 (session.md steps 1-2).
(function (SB) {
  'use strict';
  const T = SB.theme;
  const { text, Button, background } = SB.ui;

  class LobbyScene extends SB.GameScene {
    constructor() {
      super('Lobby');
    }

    create() {
      background(this, 0.4);
      text(this, T.width / 2, 120, 'ROOM CODE', 26, T.textMuted);
      // Letter-spaced and big, so it can be read out loud.
      this.codeText = text(this, T.width / 2, 230, (this.session.code || '----').split('').join(' '), 110);
      text(this, T.width / 2, 330, 'Share this code with your opponent.', 20, T.textMuted);
      this.waiting = text(this, T.width / 2, 400, 'Waiting for opponent to join…', 22);
      this.tweens.add({ targets: this.waiting, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });

      const link = `${location.origin}${location.pathname}?room=${this.session.code}`;
      text(this, T.width / 2, 450, link, 15, T.textDim);
      new Button(this, T.width / 2 - 130, 530, 'Copy invite link', () => {
        navigator.clipboard && navigator.clipboard.writeText(link).then(() => this.waiting.setText('Invite link copied.'), () => {});
      }, { color: T.button.secondary });
      new Button(this, T.width / 2 + 130, 530, 'Cancel', () => this.toMenu(), { color: T.button.muted });
      this.bindSession();
    }
  }

  SB.LobbyScene = LobbyScene;
})(window.PortPhaser);
