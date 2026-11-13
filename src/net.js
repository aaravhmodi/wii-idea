import Peer from 'peerjs';
import { validSwing } from './controller/capture.js';

const messageText = error => error?.message || 'Connection interrupted. Please reconnect.';

export function host(onSwing, onStatus = () => {}) {
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    let connection = null, processing = false, opened = false;
    const timeout = setTimeout(() => { if (!opened) { peer.destroy(); reject(new Error('Pairing service did not respond. Reload to retry.')); } }, 15000);
    peer.on('open', id => {
      clearTimeout(timeout);
      opened = true;
      const url = new URL('/controller.html', location.href);
      url.searchParams.set('room', id);
      onStatus('Ready to pair');
      resolve({ url: url.href, close: () => peer.destroy(), peer });
    });
    peer.on('connection', incoming => {
      incoming.on('open', () => {
        if (connection?.open) { incoming.send({ type: 'status', state: 'rejected', text: 'Another phone is already connected.' }); setTimeout(() => incoming.close(), 300); return; }
        connection = incoming;
        onStatus('Phone connected');
        incoming.send({ type: 'status', state: processing ? 'busy' : 'ready', text: processing ? 'Finishing the previous throw…' : 'Connected. Ready when you are.' });
      });
      incoming.on('data', async data => {
        if (incoming !== connection || !incoming.open) return;
        if (processing) { incoming.send({ type: 'status', state: 'busy', text: 'Wait for this throw to finish.' }); return; }
        if (!validSwing(data)) { incoming.send({ type: 'status', state: 'ready', text: 'Recording was incomplete. Try a gentle movement again.' }); return; }
        processing = true;
        incoming.send({ type: 'status', state: 'busy', text: 'Ball rolling · watch the big screen' });
        try {
          await onSwing(data);
          if (incoming.open) incoming.send({ type: 'status', state: 'ready', text: 'Ready for your next throw.' });
        } catch {
          if (incoming.open) incoming.send({ type: 'status', state: 'ready', text: 'Throw could not finish. Check the laptop and try again.' });
        } finally { processing = false; }
      });
      incoming.on('close', () => { if (connection === incoming) { connection = null; onStatus('Phone disconnected · reconnect on your phone'); } });
      incoming.on('error', () => { if (connection === incoming) onStatus('Phone connection interrupted'); });
    });
    peer.on('disconnected', () => { onStatus('Pairing service disconnected · retrying'); if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', error => { if (!opened) { clearTimeout(timeout); peer.destroy(); reject(error); } else onStatus(messageText(error)); });
  });
}

export function join(room, onStatus = () => {}) {
  if (typeof room !== 'string' || !/^[\w-]{1,100}$/.test(room)) throw new Error('Open the QR code from the laptop to pair.');
  const peer = new Peer();
  let connection, closed = false, ready = false;
  const update = (state, text) => { ready = state === 'ready'; onStatus({ state, text }); };
  const connect = () => {
    if (closed || !peer.open || connection?.open) return;
    update('connecting', 'Connecting to your lane…');
    connection = peer.connect(room, { reliable: true, serialization: 'json' });
    connection.on('open', () => update('connecting', 'Connected · waiting for the lane'));
    connection.on('data', data => { if (data?.type === 'status' && typeof data.text === 'string') update(data.state, data.text.slice(0, 200)); });
    connection.on('close', () => update('disconnected', 'Connection lost. Tap Reconnect.'));
    connection.on('error', () => update('disconnected', 'Could not reach the laptop. Tap Reconnect.'));
  };
  peer.on('open', connect);
  peer.on('disconnected', () => { update('disconnected', 'Pairing service disconnected. Tap Reconnect.'); });
  peer.on('error', error => update('disconnected', messageText(error)));
  return {
    get ready() { return ready && !!connection?.open; },
    send(message) { if (!ready || !connection?.open || !validSwing(message)) return false; update('busy', 'Sending your throw…'); connection.send(message); return true; },
    reconnect() { if (closed) return; connection?.close(); connection = null; if (peer.disconnected) peer.reconnect(); else connect(); },
    close() { closed = true; ready = false; peer.destroy(); },
  };
}
