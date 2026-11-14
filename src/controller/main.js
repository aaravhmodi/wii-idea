import { join } from '../net.js';
import { MAX_DURATION, MAX_SAMPLES, sampleFromEvent, validSwing } from './capture.js';

const status = document.getElementById('status');
const enable = document.getElementById('enable');
const hold = document.getElementById('hold');
const reconnect = document.getElementById('reconnect');
const meter = document.getElementById('meter');
let link, permitted = false, recording = false, samples = [], start = 0, timer, sensorTimer, holder;

const armed = () => permitted && !!link?.ready;
// Scrolling is only locked while armed, so the note and Reconnect stay reachable on small screens.
function sync() { hold.disabled = !armed(); document.documentElement.classList.toggle('armed', armed()); }
// The lock is dropped whenever the page is hidden, so this is re-run on return.
function wake() { if (permitted) navigator.wakeLock?.request('screen').catch(() => {}); }
function cancel(message) {
  recording = false;
  clearTimeout(timer);
  samples = [];
  hold.classList.remove('recording');
  hold.innerHTML = 'Hold anywhere<small>Release to bowl</small>';
  meter.style.width = '0';
  if (message) status.textContent = message;
}
try {
  link = join(new URLSearchParams(location.search).get('room'), ({ state, text }) => {
    if (state !== 'ready' && recording) cancel();
    status.textContent = text;
    reconnect.hidden = !['disconnected', 'rejected'].includes(state);
    sync();
  });
} catch (error) { status.textContent = error.message; enable.disabled = true; }

if (!window.isSecureContext || !window.DeviceMotionEvent) {
  status.textContent = !window.isSecureContext ? 'Motion needs HTTPS. Open the deployed laptop page and scan its QR code.' : 'This browser does not support phone motion. Try Safari on iPhone or Chrome on Android.';
  enable.disabled = true;
}

enable.addEventListener('click', async () => {
  try {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const result = await DeviceMotionEvent.requestPermission();
      if (result !== 'granted') throw new Error('Motion permission was denied. Allow Motion & Orientation in your browser, then try again.');
    }
    permitted = true;
    enable.hidden = true;
    status.textContent = link?.ready ? 'Sensors enabled. Hold anywhere on the screen, move gently, then release.' : 'Sensors enabled. Waiting for the laptop.';
    sync();
    wake();
    sensorTimer = setTimeout(() => { status.textContent = 'No usable motion readings yet. Check sensor permissions or try another supported phone browser.'; }, 5000);
  } catch (error) { status.textContent = error.message || 'Could not enable motion sensors.'; }
});

window.addEventListener('devicemotion', event => {
  if (!permitted) return;
  const t = Math.round(performance.now() - start);
  const sample = sampleFromEvent(event, t);
  if (!sample) return;
  clearTimeout(sensorTimer);
  if (!recording || t > MAX_DURATION || samples.length >= MAX_SAMPLES || (samples.length && t <= samples.at(-1).t)) return;
  samples.push(sample);
  meter.style.width = `${Math.min(100, t / MAX_DURATION * 100)}%`;
});

// Shared by touch and keys. `id` is the pointerId or key that started the hold; only it can release.
function begin(id, event) {
  if (recording || !permitted || !link?.ready) return false;
  event.preventDefault();
  holder = id;
  samples = [];
  start = performance.now();
  recording = true;
  hold.classList.add('recording');
  hold.innerHTML = 'Recording…<small>Release to bowl</small>';
  status.textContent = 'Move gently. Keep holding your phone.';
  timer = setTimeout(() => cancel('Recording stopped after 6 seconds. Hold again for a shorter movement.'), MAX_DURATION);
  return true;
}
function release(id, event) {
  if (!recording || id !== holder) return;
  event.preventDefault();
  const message = { type: 'swing', samples };
  cancel();
  if (!validSwing(message)) { status.textContent = 'Not enough motion readings. Hold a little longer and check your sensor permissions.'; return; }
  if (link.send(message)) navigator.vibrate?.(35);
  else status.textContent = 'The laptop is not ready. Reconnect and try again.';
  sync();
}

// The whole page is the button; Enable/Reconnect (.action) keep their own taps.
document.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest?.('.action')) return;
  if (begin(event.pointerId, event)) document.body.setPointerCapture(event.pointerId);
});
document.addEventListener('pointerup', event => release(event.pointerId, event));
document.addEventListener('pointercancel', event => { if (recording && event.pointerId === holder) cancel('Movement canceled. Hold to try again.'); });
document.addEventListener('lostpointercapture', event => { if (recording && event.pointerId === holder) cancel('Movement canceled. Hold to try again.'); });
// Best effort: most mobile browsers never deliver volume keys to a page. Space/Enter work when the button has focus.
const holdKey = event => ['AudioVolumeUp', 'AudioVolumeDown'].includes(event.key) || (event.target === hold && [' ', 'Enter'].includes(event.key));
document.addEventListener('keydown', event => { if (!event.repeat && holdKey(event)) begin(event.key, event); });
document.addEventListener('keyup', event => { if (holdKey(event)) release(event.key, event); });
document.addEventListener('contextmenu', event => { if (armed()) event.preventDefault(); });
window.addEventListener('blur', () => { if (recording) cancel('Movement canceled when the page lost focus.'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (recording) cancel(); } else wake(); });
reconnect.addEventListener('click', () => link?.reconnect());
window.addEventListener('pagehide', () => { cancel(); link?.close(); });
// Back/forward cache restores JS state, including the permanently closed PeerJS link.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
