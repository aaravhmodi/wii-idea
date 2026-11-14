import { validSwing } from './controller/capture.js';

// Both sides talk through the server relay (server/relay.js): an EventSource to listen, POST to send.
const post = (room, side, message) => fetch(`/relay/${room}/${side}`, { method: 'POST', body: JSON.stringify(message) });
const parse = event => { try { return JSON.parse(event.data); } catch { return null; } };

export function host(onSwing, onStatus = () => {}) {
  return new Promise((resolve, reject) => {
    const room = crypto.randomUUID();
    const stream = new EventSource(`/relay/${room}/host`);
    let processing = false, opened = false;
    const say = (state, text) => post(room, 'host', { type: 'status', state, text }).catch(() => {}); // phone may have just left
    const timeout = setTimeout(() => { if (!opened) { stream.close(); reject(new Error('Pairing server did not respond. Reload to retry.')); } }, 15000);
    stream.onopen = () => {
      onStatus('Ready to pair');
      if (opened) return;
      opened = true; clearTimeout(timeout);
      const url = new URL('/controller.html', location.href);
      url.searchParams.set('room', room);
      resolve({ url: url.href, close: () => stream.close() });
    };
    stream.onerror = () => { if (opened) onStatus('Pairing server disconnected · retrying'); };
    stream.onmessage = async event => {
      const data = parse(event);
      if (data?.type === 'peer') {
        onStatus(data.online ? 'Phone connected' : 'Phone disconnected · reconnect on your phone');
        if (data.online) say(processing ? 'busy' : 'ready', processing ? 'Finishing the previous throw…' : 'Connected. Ready when you are.');
        return;
      }
      if (processing) return say('busy', 'Wait for this throw to finish.');
      if (!validSwing(data)) return say('ready', 'Recording was incomplete. Try a gentle movement again.');
      processing = true;
      say('busy', 'Ball rolling · watch the big screen');
      let text = 'Ready for your next throw.';
      try { await onSwing(data); } catch { text = 'Throw could not finish. Check the laptop and try again.'; }
      processing = false;
      say('ready', text);
    };
  });
}

export function join(room, onStatus = () => {}) {
  if (typeof room !== 'string' || !/^[\w-]{8,64}$/.test(room)) throw new Error('Open the QR code from the laptop to pair.');
  let stream, closed = false, ready = false;
  const update = (state, text) => { ready = state === 'ready'; onStatus({ state, text }); };
  const connect = () => {
    if (closed) return;
    update('connecting', 'Connecting to your lane…');
    const current = stream = new EventSource(`/relay/${room}/phone`);
    const active = () => !closed && current === stream;
    current.onopen = () => { if (active()) update('connecting', 'Connected · waiting for the laptop page'); };
    current.onmessage = event => {
      const data = parse(event);
      if (!active() || !data) return;
      if (data.type === 'peer' && !data.online) update('connecting', 'The laptop page is closed. Open it to keep playing.');
      if (data.type === 'status' && typeof data.text === 'string') update(data.state, data.text.slice(0, 200));
    };
    current.onerror = () => {
      if (!active()) return;
      // CLOSED means the server refused (another phone holds this lane); otherwise the browser retries by itself.
      if (current.readyState === EventSource.CLOSED) update('disconnected', 'Could not join this lane. Rescan the QR code, or tap Reconnect.');
      else update('connecting', 'Connection dropped · retrying…');
    };
  };
  connect();
  return {
    get ready() { return ready && stream?.readyState === EventSource.OPEN; },
    send(message) {
      if (!this.ready || !validSwing(message)) return false;
      update('busy', 'Sending your throw…');
      post(room, 'phone', message).then(r => { if (!r.ok) throw 0; }).catch(() => update('disconnected', 'Throw did not reach the laptop. Tap Reconnect.'));
      return true;
    },
    reconnect() { if (closed) return; stream?.close(); connect(); },
    close() { closed = true; ready = false; stream?.close(); },
  };
}
