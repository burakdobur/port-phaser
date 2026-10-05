// Sound effects. Scenes play game events by name (SB.sfx.play(scene, 'hit')); this module alone knows
// which file and volume each event uses, so sounds can be swapped (or skinned, F-28) without touching scenes.
// Files live in assets/audio/; sources and licences are in assets/audio/CREDITS.md.
(function (SB) {
  'use strict';

  const DIR = 'assets/audio/';
  const MUTE_KEY = 'knights-of-the-sea:muted';

  /** event -> { file, volume }. Combat cues are synthesised by scripts/make-sfx.js; UI cues are uisfx (CC0). */
  const CUES = {
    click: { file: 'click', volume: 0.4 },
    place: { file: 'place', volume: 0.6 },
    rotate: { file: 'rotate', volume: 0.4 },
    invalid: { file: 'invalid', volume: 0.5 },
    ready: { file: 'ready', volume: 0.6 },
    opponentJoined: { file: 'join', volume: 0.6 },
    cannon: { file: 'cannon', volume: 0.55 },
    splash: { file: 'splash', volume: 0.6 },
    hit: { file: 'hit', volume: 0.7 },
    sink: { file: 'sink', volume: 0.8 },
    victory: { file: 'victory', volume: 0.7 },
    defeat: { file: 'defeat', volume: 0.7 },
  };

  const keyFor = (cue) => 'sfx-' + cue;

  function readMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }

  function writeMuted(muted) {
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* private mode: not remembered */ }
  }

  // Our own copy of the mute state: Phaser's WebAudio `mute` is a gain change scheduled on the audio clock, which
  // browsers keep suspended until the first click, so reading it back before then is unreliable.
  let muted = false;

  const sfx = {
    CUES,

    /** Call from a scene's preload(). A missing file only silences its cue; it never blocks the game. */
    preload(scene) {
      for (const [cue, def] of Object.entries(CUES)) scene.load.audio(keyFor(cue), DIR + def.file + '.mp3');
    },

    /** Applies the remembered mute setting. Call once, after the sound manager exists. */
    init(game) {
      muted = readMuted();
      game.sound.mute = muted;
      if (game.sound.locked) game.sound.once('unlocked', () => { game.sound.mute = muted; });
    },

    play(scene, cue, { delay = 0 } = {}) {
      const def = CUES[cue];
      const key = keyFor(cue);
      if (!def || muted || !scene.cache.audio.exists(key)) return;
      const go = () => scene.sound.play(key, { volume: def.volume });
      if (delay > 0) scene.time.delayedCall(delay, go); else go();
    },

    isMuted() {
      return muted;
    },

    /** Mutes or unmutes everything (also sounds already playing) and remembers the choice. */
    toggleMute(scene) {
      muted = !muted;
      scene.sound.mute = muted;
      writeMuted(muted);
      return muted;
    },
  };

  SB.sfx = sfx;
})(window.PortPhaser);
