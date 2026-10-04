// ICE servers for WebRTC (PeerSession). Read from env so TURN credentials stay out of git.
// Shared by the Vercel function (api/ice.js) and the local server (GET /api/ice).
//
//   STUN_URLS        comma-separated, default stun:stun.l.google.com:19302
//   TURN_URLS        comma-separated, e.g. turn:global.relay.metered.ca:80,turns:global.relay.metered.ca:443?transport=tcp
//   TURN_USERNAME    \ both required for TURN to be included
//   TURN_CREDENTIAL  /
'use strict';

const list = (value) => String(value || '').split(',').map((s) => s.trim()).filter(Boolean);

function iceServersFromEnv(env = process.env) {
  const stun = list(env.STUN_URLS);
  const servers = [{ urls: stun.length ? stun : ['stun:stun.l.google.com:19302'] }];
  const turn = list(env.TURN_URLS);
  if (turn.length && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    servers.push({ urls: turn, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  }
  return servers;
}

module.exports = { iceServersFromEnv };
