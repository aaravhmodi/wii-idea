// One process for a personal server: built site (dist/), /api/coach and the phone relay.
// Run `npm run build` first. Put HTTPS in front of it: phones only expose motion sensors on HTTPS.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { relay } from './server/relay.js';
import { POST as coach } from './api/coach.js';
import { POST as adapt } from './api/adapt.js';
import { POST as liveToken } from './api/live-token.js';

const api = { '/api/coach': coach, '/api/adapt': adapt, '/api/live-token': liveToken };

const dist = resolve('dist');
const port = process.env.PORT || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  try {
    if (relay(req, res)) return;
    const path = req.url.split('?')[0];
    if (Object.hasOwn(api, path)) {
      if (req.method !== 'POST') return res.writeHead(405).end();
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
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
}).listen(port, () => console.log(`MotionPlay on http://localhost:${port}`));
