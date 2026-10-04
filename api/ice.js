// Vercel Function: GET /api/ice -> { iceServers } for PeerSession. Configure via env vars (see server/ice-config.js).
'use strict';
const { iceServersFromEnv } = require('../server/ice-config');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ iceServers: iceServersFromEnv() }));
};
