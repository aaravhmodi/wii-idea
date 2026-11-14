import { createServer } from 'node:http';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { relay } from '../server/relay.js';

let server, base;
beforeAll(async () => {
  server = createServer((req, res) => { if (!relay(req, res)) res.writeHead(404).end(); });
  await new Promise(done => server.listen(0, done));
  base = `http://localhost:${server.address().port}/relay/room-1234`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

// Reads SSE `data:` messages from a stream one at a time.
async function listen(side) {
  const response = await fetch(`${base}/${side}`);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  return { status: response.status, close: () => reader.cancel(), async next() {
    for (;;) {
      const match = /data: (.*)\n\n/.exec(buffer);
      if (match) { buffer = buffer.slice(match.index + match[0].length); return JSON.parse(match[1]); }
      buffer += (await reader.read()).value ?? '';
    }
  } };
}
const send = (side, body) => fetch(`${base}/${side}`, { method: 'POST', body });

it('relays between one laptop and one phone', async () => {
  const laptop = await listen('host');
  expect((await send('phone', '{}')).status).toBe(404); // phone is not connected yet
  const phone = await listen('phone');
  expect(await laptop.next()).toEqual({ type: 'peer', online: true });
  expect(await phone.next()).toEqual({ type: 'peer', online: true });

  expect((await listen('phone')).status).toBe(409); // single player
  expect((await send('phone', JSON.stringify({ type: 'swing', samples: [] }))).status).toBe(204);
  expect(await laptop.next()).toEqual({ type: 'swing', samples: [] });
  expect((await send('host', JSON.stringify({ type: 'status', state: 'ready', text: 'go' }))).status).toBe(204);
  expect(await phone.next()).toEqual({ type: 'status', state: 'ready', text: 'go' });

  expect((await send('phone', 'not json')).status).toBe(400);
  expect((await send('phone', JSON.stringify('x'.repeat(200000)))).status).toBe(413);
  await phone.close();
  expect(await laptop.next()).toEqual({ type: 'peer', online: false });
  await laptop.close();
});
