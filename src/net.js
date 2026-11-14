import { validSwing } from './controller/capture.js';

// Both sides talk through the server relay (server/relay.js): long-poll GET to listen, POST to send.
const post = (room, side, client, message) => fetch(`/relay/${room}/${side}?client=${client}`, { method: 'POST', body: JSON.stringify(message) });
// crypto.randomUUID needs HTTPS; getRandomValues also works on plain-HTTP LAN addresses.
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('');

// Polls until stopped. onState gets 'open', 'retrying' or 'refused' (another phone holds the lane).
function listen(room, side, client, onMessage, onState) {
  let stopped = false, abort, state, first = '&first';
  const set = next => { if (state !== next) onState(state = next); };
  (async () => {
    while (!stopped) {
      try {
        abort = new AbortController();
        const response = await fetch(`/relay/${room}/${side}?client=${client}${first}`, { signal: abort.signal, cache: 'no-store' });
        if (response.status === 409) return set('refused');
        if (!response.ok) throw new Error('relay unavailable');
        const messages = await response.json();
        if (stopped) return;
        first = '';
        set('open');
        messages.forEach(onMessage);
      } catch {
        if (stopped) return;
        set('retrying');
        await new Promise(done => setTimeout(done, 1500));
      }
    }
  })();
  return { stop() { stopped = true; abort?.abort(); }, get open() { return state === 'open'; } };
}

export function host(onSwing, onStatus = () => {}) {
  return new Promise((resolve, reject) => {
    const room = randomId(), client = randomId();
    let processing = false, opened = false;
    const say = (state, text) => post(room, 'host', client, { type: 'status', state, text }).catch(() => {}); // phone may have just left
    const timeout = setTimeout(() => { if (!opened) { link.stop(); reject(new Error('Pairing server did not respond. Reload to retry.')); } }, 30000);
    const link = listen(room, 'host', client, async data => {
      if (data?.type === 'hello') return say(processing ? 'busy' : 'ready', processing ? 'Finishing the previous throw…' : 'Connected. Ready when you are.');
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
    }, state => {
      if (state !== 'open') { if (opened) onStatus('Pairing server disconnected · retrying'); return; }
      onStatus('Ready to pair');
      if (opened) return;
      opened = true; clearTimeout(timeout);
      const url = new URL('/controller.html', location.href);
      url.searchParams.set('room', room);
      resolve({ url: url.href, close: () => link.stop(), send: message => post(room, 'host', client, message).catch(() => {}) });
    });
  });
}

export function join(room, onStatus = () => {}, onEvent = () => {}) {
  if (typeof room !== 'string' || !/^[\w-]{8,64}$/.test(room)) throw new Error('Open the QR code from the laptop to pair.');
  const client = randomId(); // kept across reconnects so the relay knows it is the same phone
  let link, closed = false, ready = false;
  const update = (state, text) => { ready = state === 'ready'; onStatus({ state, text }); };
  const connect = () => {
    if (closed) return;
    update('connecting', 'Connecting to your lane…');
    const current = link = listen(room, 'phone', client, data => {
      if (closed || current !== link || !data) return;
      if (data.type === 'peer' && !data.online) update('connecting', 'The laptop page is closed. Open it to keep playing.');
      if (data.type === 'status' && typeof data.text === 'string') update(data.state, data.text.slice(0, 200));
      if (data.type === 'haptic') onEvent(data);
    }, state => {
      if (closed || current !== link) return;
      if (state === 'refused') update('disconnected', 'Another phone is on this lane. Close it there, then tap Reconnect.');
      else if (state === 'retrying') update('connecting', 'Connection dropped · retrying…');
      else if (!ready) {
        update('connecting', 'Connected · waiting for the laptop page');
        post(room, 'phone', client, { type: 'hello' }).catch(() => {}); // ask the laptop for its state; it answers ready or busy
      }
    });
  };
  connect();
  return {
    get ready() { return ready && !!link?.open; },
    send(message) {
      if (!this.ready || !validSwing(message)) return false;
      update('busy', 'Sending your throw…');
      post(room, 'phone', client, message).then(r => { if (!r.ok) throw 0; }).catch(() => update('disconnected', 'Throw did not reach the laptop. Tap Reconnect.'));
      return true;
    },
    reconnect() { if (closed) return; link?.stop(); connect(); },
    close() { closed = true; ready = false; link?.stop(); },
  };
}
