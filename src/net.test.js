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

const poll = (side, client) => fetch(`${base}/${side}?client=${client}`).then(async r => (r.ok ? r.json() : r.status));
const send = (side, body) => fetch(`${base}/${side}`, { method: 'POST', body }).then(r => r.status);

it('relays between one laptop and one phone', async () => {
  expect(await poll('host', 'laptop')).toEqual([]); // first poll answers at once
  const waiting = poll('host', 'laptop'); // held open until something arrives
  expect(await send('phone', '{}')).toBe(404); // phone is not connected yet

  const phoneFirst = await poll('phone', 'phone-a'); // joining answers at once with the laptop's presence
  expect(phoneFirst).toEqual([{ type: 'peer', online: true }]);
  expect(await waiting).toEqual([{ type: 'peer', online: true }]);
  expect(await poll('phone', 'phone-b')).toBe(409); // single player

  const hostWaiting = poll('host', 'laptop');
  expect(await send('phone', JSON.stringify({ type: 'swing', samples: [] }))).toBe(204);
  expect(await hostWaiting).toEqual([{ type: 'swing', samples: [] }]);

  // Messages sent while the phone is between polls are queued, in order.
  expect(await send('host', JSON.stringify({ type: 'status', text: 'one' }))).toBe(204);
  expect(await send('host', JSON.stringify({ type: 'status', text: 'two' }))).toBe(204);
  expect(await poll('phone', 'phone-a')).toEqual([{ type: 'status', text: 'one' }, { type: 'status', text: 'two' }]);

  expect(await send('phone', 'not json')).toBe(400);
  expect(await send('phone', JSON.stringify('x'.repeat(200000)))).toBe(413);
});
