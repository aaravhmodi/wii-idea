import { defineConfig, loadEnv } from 'vite';
import { relay } from './server/relay.js';

// Runs api/*.js (Vercel web-standard handlers: `export async function POST(request)`) under `vite dev`.
const devApi = {
  name: 'dev-api',
  configureServer(server) {
    Object.assign(process.env, loadEnv('development', process.cwd(), ''));
    server.middlewares.use(relay);
    server.middlewares.use('/api', async (req, res) => {
      try {
        const name = req.url.split('?')[0].slice(1);
        if (!['coach', 'adapt', 'live-token'].includes(name)) { res.statusCode = 404; return res.end(); }
        const mod = await server.ssrLoadModule(`/api/${name}.js`);
        const chunks = [];
        let size = 0;
        for await (const c of req) {
          size += c.length;
          if (size > 256 * 1024) { res.statusCode = 400; return res.end('Body too large.'); }
          chunks.push(c);
        }
        const handler = mod[req.method];
        if (!handler) { res.statusCode = 405; return res.end(); }
        const r = await handler(new Request(`http://localhost${req.originalUrl}`, {
          method: req.method,
          headers: req.headers,
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        }));
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await r.text());
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e));
      }
    });
  },
};

export default defineConfig({
  plugins: [devApi],
  build: { rollupOptions: { input: ['index.html', 'controller.html'] } },
  test: { environment: 'node' },
});
