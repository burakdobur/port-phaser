// Visual constants. Ship colors go through shipColor() so skins (F-28) can plug in later.
(function (SB) {
  'use strict';

  const theme = {
    width: 900,
    height: 700,
    font: 'Arial, Helvetica, sans-serif',
    text: '#ffffff',
    textMuted: '#bfe3ef',
    textDim: '#8fb8c8',
    danger: '#ff8a7a',
    water: 0x123a5a,
    waterLine: 0x2f6a91,
    hit: 0xe2483a,
    miss: 0xe8f4f8,
    previewOk: 0x5ad17a,
    previewBad: 0xe2483a,
    sunkTint: 0x3a2020,
    panel: 0x0b2236,
    button: { primary: 0x2a6f97, secondary: 0x1f6f5c, warn: 0xc0703a, muted: 0x3d4f5f },

    shipColors: { battleship: 0x8fa3b3, submarine: 0x5f8f7f, destroyer: 0xa3b8c4, mine: 0xb05050, radar: 0xc0903a },

    /** Hook for F-28 skins: return a colour for a ship type under the active skin. */
    shipColor(type) {
      return this.shipColors[type] || 0x9aa9b5;
    },

    errorText(code) {
      return ({
        session_not_found: 'No game with that room code.',
        session_full: 'That game already has two players.',
        bad_token: 'You are not part of this game.',
        overlap: 'Ships cannot overlap.',
        out_of_bounds: 'Ships must stay on the board.',
        fleet_incomplete: 'Place your whole fleet first.',
        not_your_turn: 'Wait for your turn.',
        already_shot: 'You already fired at that cell.',
        network: 'Could not connect. Check your connection and try again.',
        broker_unreachable: 'Could not reach the matchmaking server. Try again in a moment.',
        p2p_failed: 'Found the game, but could not connect directly to it. A network or firewall may be blocking it.',
        bad_code: 'Room codes are 4 letters or digits.',
      })[code] || 'Something went wrong (' + code + ').';
    },
  };

  SB.theme = theme;
})(window.PortPhaser);
