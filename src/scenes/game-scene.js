// GameScene: base class for scenes that show a running session.
// Subscribes to the session, routes to the scene matching the match phase, and handles
// "session closed" (opponent left / expired) uniformly.
(function (SB) {
  'use strict';
  const { PHASE } = SB.rules;
  const T = SB.theme;

  const SCENE_FOR_PHASE = {
    [PHASE.WAITING]: 'Lobby',
    [PHASE.PLACEMENT]: 'Placement',
    [PHASE.COMBAT]: 'Combat',
  };

  /** The view the scene should route on: any local player's view works (phase is shared). */
  function anyView(session) {
    for (const p of session.localPlayers) {
      const v = session.view(p);
      if (v) return v;
    }
    return null;
  }

  function startSessionScene(scene, session) {
    const v = anyView(session);
    scene.scene.start((v && SCENE_FOR_PHASE[v.phase]) || 'Lobby', { session });
  }

  class GameScene extends Phaser.Scene {
    init(data) {
      this.session = data.session;
      this.closedShown = false;
    }

    /** Call at the end of create(). */
    bindSession() {
      this.statusLine = SB.ui.text(this, T.width / 2, T.height - 18, '', 15, T.textDim);
      const unsubscribe = this.session.subscribe(() => this._onSessionChange());
      this.events.once('shutdown', unsubscribe);
      this._onSessionChange();
    }

    _onSessionChange() {
      const s = this.session;
      const v = anyView(s);
      this.statusLine.setText(s.mode === 'online' && !s.connected && !s.deleted ? 'Connection lost — reconnecting…' : '');
      if (!v) return this.refresh(null);

      if (v.phase === PHASE.ENDED && this.handlesEnd) return this.refresh(v);
      if (v.phase === PHASE.ENDED || (s.deleted && s.deleted !== 'match_ended' && s.deleted !== 'left')) {
        return this.showClosed(v);
      }
      const target = SCENE_FOR_PHASE[v.phase];
      if (target && target !== this.scene.key) {
        this.scene.start(target, { session: s });
        return;
      }
      this.refresh(v);
    }

    showClosed(view) {
      if (this.closedShown) return;
      this.closedShown = true;
      const reason = this.session.deleted;
      const body = reason === 'expired'
        ? 'The session expired after a long period of inactivity.'
        : reason === 'host_left' || (view && view.endReason === 'forfeit') ? 'Your opponent left the game.' : 'The session was closed.';
      SB.ui.modal(this, {
        title: 'Session closed',
        body: body + (this.session.code ? '\nRoom code ' + this.session.code + ' is no longer valid.' : ''),
        buttons: [{ label: 'Back to menu', onClick: () => this.toMenu() }],
      });
    }

    toMenu() {
      this.session.leave();
      this.scene.start('Menu');
    }

    /** Override: redraw from the latest view. */
    refresh() {}
  }

  SB.GameScene = GameScene;
  SB.startSessionScene = startSessionScene;
})(window.PortPhaser);
