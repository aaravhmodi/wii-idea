// One process for a personal server: built site (dist/), /api/coach and the phone relay.
// Run `npm run build` first. Put HTTPS in front of it: phones only expose motion sensors on HTTPS.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { relay } from './server/relay.js';
import { POST as coach } from './api/coach.js';
import { POST as adapt } from './api/adapt.js';
import { POST as liveToken } from './api/live-token.js';
import { POST as plan } from './api/plan.js';

// These endpoints spend the Gemini key, so calls are capped per minute per connecting address.
// shortcut: behind the tunnel or Funnel every visitor shares the proxy's address, so this is in effect one
// site-wide cap; key by a proxy-verified client IP if the site ever needs per-visitor limits.
const calls = new Map();
setInterval(() => calls.clear(), 60000).unref();
function limited(req) {
  const ip = req.socket.remoteAddress || '';
  const count = (calls.get(ip) ?? 0) + 1;
  calls.set(ip, count);
  return count > 120;
}

const api = { '/api/coach': coach, '/api/adapt': adapt, '/api/live-token': liveToken, '/api/plan': plan };

const dist = resolve('dist');
const port = process.env.PORT || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  try {
    if (relay(req, res)) return;
    const path = req.url.split('?')[0];
    if (Object.hasOwn(api, path)) {
      if (req.method !== 'POST') return res.writeHead(405).end();
      if (limited(req)) return res.writeHead(429, { 'Retry-After': '60' }).end('Too many requests. Try again in a minute.');
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 256 * 1024) return res.writeHead(400).end();
        chunks.push(chunk);
      }
      const reply = await api[path](new Request(`http://localhost${path}`, { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) }));
      res.writeHead(reply.status, Object.fromEntries(reply.headers));
      return res.end(await reply.text());
    }
    const file = join(dist, normalize(decodeURIComponent(path === '/' ? '/index.html' : path)));
    if (!file.startsWith(dist + sep) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end('Not found');
    // Pages are always re-checked so a phone or laptop never runs an old build against a new one; hashed assets can be kept.
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': file.endsWith('.html') ? 'no-store' : 'public, max-age=31536000, immutable' });
    createReadStream(file).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
}).listen(port, () => console.log(`MotionPlay on http://localhost:${port}`));
