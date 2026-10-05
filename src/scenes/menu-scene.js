// MenuScene: choose hot seat (F-09) or an online room-code session (F-10).
(function (SB) {
  'use strict';
  const T = SB.theme;
  const { text, Button, background } = SB.ui;

  function input(scene, x, y, placeholder, { value = '', maxLength = SB.rules.MAX_NAME_LENGTH, width = 220, upper = false } = {}) {
    const el = document.createElement('input');
    el.type = 'text';
    el.placeholder = placeholder;
    el.value = value;
    el.maxLength = maxLength;
    el.spellcheck = false;
    el.autocomplete = 'off';
    Object.assign(el.style, {
      width: width + 'px', height: '38px', boxSizing: 'border-box', padding: '0 10px',
      fontSize: upper ? '22px' : '18px', fontFamily: T.font, textAlign: 'center',
      letterSpacing: upper ? '6px' : 'normal', textTransform: upper ? 'uppercase' : 'none',
      color: '#0b2236', background: '#e8f4f8', border: '2px solid #ffffff', borderRadius: '6px', outline: 'none',
    });
    scene.add.dom(x, y, el);
    return el;
  }

  class MenuScene extends Phaser.Scene {
    constructor() {
      super('Menu');
    }

    create() {
      background(this, 0.35);
      SB.ui.muteToggle(this);
      text(this, T.width / 2, 70, 'KNIGHTS OF THE SEA', 52);
      text(this, T.width / 2, 125, 'A two-player naval strategy game', 22, T.textMuted);

      const leftX = 230;
      const rightX = 670;
      this.add.rectangle(leftX, 380, 380, 390, T.panel, 0.75).setStrokeStyle(1, 0xffffff, 0.3);
      this.add.rectangle(rightX, 380, 380, 390, T.panel, 0.75).setStrokeStyle(1, 0xffffff, 0.3);

      // ---- Hot seat (F-09) ----
      text(this, leftX, 215, 'Hot seat', 26);
      text(this, leftX, 248, 'Two players, one device', 16, T.textDim);
      text(this, leftX, 295, 'Player 1', 16, T.textMuted);
      this.p1Name = input(this, leftX, 325, 'Player 1');
      text(this, leftX, 375, 'Player 2', 16, T.textMuted);
      this.p2Name = input(this, leftX, 405, 'Player 2');
      new Button(this, leftX, 490, 'Start hot seat', () => this.startHotSeat(), { color: T.button.warn });

      // ---- Online (F-10) ----
      const params = new URLSearchParams(location.search);
      // Peer-to-peer by default (works on static hosting); ?net=server uses the Node server instead.
      this.Online = params.get('net') === 'server' ? SB.RemoteSession : SB.PeerSession;
      const online = this.Online.isAvailable();
      text(this, rightX, 215, 'Online', 26);
      text(this, rightX, 248, 'Play with a room code', 16, T.textDim);
      text(this, rightX, 295, 'Your name', 16, T.textMuted);
      this.myName = input(this, rightX, 325, 'Your name');
      this.btnCreate = new Button(this, rightX, 390, 'Create game', () => this.createOnline(), { color: T.button.primary });
      this.code = input(this, rightX - 70, 470, 'CODE', { maxLength: 4, width: 140, upper: true, value: params.get('room') || '' });
      this.btnJoin = new Button(this, rightX + 85, 470, 'Join', () => this.joinOnline(), { width: 120, color: T.button.secondary });
      this.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinOnline(); });

      this.status = text(this, T.width / 2, 610, '', 18, T.danger);
      if (!online) {
        this.btnCreate.setEnabled(false);
        this.btnJoin.setEnabled(false);
        this.status.setColor(T.textDim).setText(this.Online === SB.PeerSession
          ? 'Online play needs a browser with WebRTC support.'
          : 'Online play needs the game server — run "npm start" and open http://localhost:8080');
      }
      this.busy = false;
    }

    startHotSeat() {
      SB.startSessionScene(this, new SB.LocalSession([this.p1Name.value, this.p2Name.value]));
    }

    async createOnline() {
      await this._connect(() => this.Online.create(this.myName.value));
    }

    async joinOnline() {
      await this._connect(() => this.Online.join(this.code.value, this.myName.value));
    }

    async _connect(open) {
      if (this.busy || !this.Online.isAvailable()) return;
      this.busy = true;
      this.status.setColor(T.textMuted).setText('Connecting…');
      try {
        const session = await open();
        SB.startSessionScene(this, session);
      } catch (err) {
        this.status.setColor(T.danger).setText(T.errorText(err.code || 'network'));
        this.busy = false;
      }
    }
  }

  SB.MenuScene = MenuScene;
})(window.PortPhaser);
