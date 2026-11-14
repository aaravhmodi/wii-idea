// Phone <-> laptop relay over plain HTTP long-polling: each side GETs to wait for messages
// and POSTs messages for the other side. Works through any NAT, proxy or tunnel, including
// ones that buffer streaming responses (Cloudflare quick tunnels), unlike WebRTC or SSE.
// shortcut: rooms live in this process's memory, so run one instance; move to Redis pub/sub to scale out.
const rooms = new Map();
const MAX_BODY = 128 * 1024; // a full 360-sample swing is about 40 KB
const WAIT = 20000; // a poll is answered empty after this, under common proxy idle timeouts
const GONE = 6000; // a side that has not polled again within this is treated as disconnected
const other = side => (side === 'host' ? 'phone' : 'host');

function flush(end) { // answer the waiting poll with everything queued
  if (!end?.waiter) return;
  clearTimeout(end.timeout);
  end.waiter.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(end.queue.splice(0)));
  end.waiter = null;
}
function send(end, message) {
  if (!end) return;
  end.queue.push(message);
  flush(end);
}

/** Connect-style middleware. Returns true when it handled the request. */
export function relay(req, res, next) {
  const [path, query = ''] = req.url.split('?');
  const match = /^\/relay\/([\w-]{8,64})\/(host|phone)$/.exec(path);
  if (!match) return next ? next() : false;
  const [, id, side] = match;
  const room = rooms.get(id) ?? {};

  if (req.method === 'GET') {
    const client = new URLSearchParams(query).get('client') ?? '';
    let me = room[side];
    if (side === 'phone' && me && me.client !== client) { res.writeHead(409).end(); return true; } // single player: one phone per lane
    if (!me || me.client !== client) {
      me = room[side] = { client, queue: [], waiter: null };
      rooms.set(id, room);
      if (room[other(side)]) { send(room[other(side)], { type: 'peer', online: true }); me.queue.push({ type: 'peer', online: true }); }
    }
    clearTimeout(me.gone);
    flush(me); // an older poll from the same client is superseded
    me.waiter = res;
    me.timeout = setTimeout(() => flush(me), WAIT);
    res.on('close', () => {
      if (me.waiter === res) { me.waiter = null; clearTimeout(me.timeout); }
      if (me.waiter || room[side] !== me) return;
      me.gone = setTimeout(() => {
        if (room[side] !== me) return;
        delete room[side];
        send(room[other(side)], { type: 'peer', online: false });
        if (!room.host && !room.phone) rooms.delete(id);
      }, GONE);
    });
    if (me.queue.length) flush(me);
    return true;
  }

  if (req.method !== 'POST') { res.writeHead(405).end(); return true; }
  const chunks = [];
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size <= MAX_BODY) chunks.push(chunk); // past the cap the rest is read and dropped, never buffered
  });
  req.on('end', () => {
    if (size > MAX_BODY) { res.writeHead(413).end(); return; }
    let message;
    try { message = JSON.parse(Buffer.concat(chunks).toString()); } catch { res.writeHead(400).end(); return; }
    if (!room[side] || !room[other(side)]) { res.writeHead(404).end(); return; } // only a connected side may send, and only to a listener
    send(room[other(side)], message);
    res.writeHead(204).end();
  });
  return true;
}
