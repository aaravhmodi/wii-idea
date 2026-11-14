// Phone <-> laptop relay over plain HTTP: each side listens on a Server-Sent Events stream
// and POSTs messages for the other side. Works through any NAT or proxy, unlike WebRTC.
// shortcut: rooms live in this process's memory, so run one instance; move to Redis pub/sub to scale out.
const rooms = new Map();
const MAX_BODY = 128 * 1024; // a full 360-sample swing is about 40 KB
const other = side => (side === 'host' ? 'phone' : 'host');
const push = (stream, message) => stream?.write(`data: ${JSON.stringify(message)}\n\n`);

/** Connect-style middleware. Returns true when it handled the request. */
export function relay(req, res, next) {
  const match = /^\/relay\/([\w-]{8,64})\/(host|phone)$/.exec(req.url.split('?')[0]);
  if (!match) return next ? next() : false;
  const [, id, side] = match;
  const room = rooms.get(id) ?? {};

  if (req.method === 'GET') {
    if (side === 'phone' && room.phone) { res.writeHead(409).end(); return true; } // single player: one phone per lane
    room[side]?.end(); // a reloaded laptop page takes over its lane
    rooms.set(id, room);
    room[side] = res;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.write(': connected\n\n');
    if (room[other(side)]) {
      push(room[other(side)], { type: 'peer', online: true });
      push(res, { type: 'peer', online: true });
    }
    const ping = setInterval(() => res.write(': ping\n\n'), 20000); // keeps idle proxies from closing the stream
    res.on('close', () => {
      clearInterval(ping);
      if (room[side] !== res) return;
      delete room[side];
      push(room[other(side)], { type: 'peer', online: false });
      if (!room.host && !room.phone) rooms.delete(id);
    });
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
    const target = room[other(side)];
    if (!room[side] || !target) { res.writeHead(404).end(); return; } // only a connected side may send, and only to a listener
    push(target, message);
    res.writeHead(204).end();
  });
  return true;
}
