// Static build for hosting (Vercel): copies the browser files into dist/. No bundling, no dependencies.
// Keep STATIC in step with STATIC_ALLOW in server/server.js.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STATIC = ['index.html', 'public/lib', 'src', 'shared', 'assets'];

fs.rmSync(DIST, { recursive: true, force: true });
for (const rel of STATIC) {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) continue;
  fs.cpSync(from, path.join(DIST, rel), { recursive: true, filter: (src) => !src.endsWith('.map') });
}
console.log(`Built ${STATIC.join(', ')} -> dist/`);
