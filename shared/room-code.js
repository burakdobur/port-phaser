// Room codes (session.md): 4 characters, alphanumeric, case-insensitive,
// generated with a cryptographically secure RNG.
(function (global) {
  'use strict';
  const SB = (global.PortPhaser = global.PortPhaser || {});

  // 32 characters: A-Z without I/O, digits 2-9 (no 0/O or 1/I look-alikes).
  // 256 % 32 === 0, so mapping a random byte onto it has no modulo bias.
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const LENGTH = 4;

  function generate() {
    const c = global.crypto;
    if (!c || typeof c.getRandomValues !== 'function') {
      throw new Error('Secure random source (crypto.getRandomValues) is not available');
    }
    const bytes = new Uint8Array(LENGTH);
    c.getRandomValues(bytes);
    let code = '';
    for (let i = 0; i < LENGTH; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
    return code;
  }

  /** Normalises user input ("ab 3k" -> "AB3K"). Returns null when it can't be a code. */
  function normalize(input) {
    if (typeof input !== 'string') return null;
    const code = input.replace(/\s+/g, '').toUpperCase();
    return /^[A-Z0-9]{4}$/.test(code) ? code : null;
  }

  SB.roomCode = Object.freeze({ generate, normalize, LENGTH, ALPHABET });
  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
