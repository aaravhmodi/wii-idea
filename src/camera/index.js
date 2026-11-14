import { poseStats, throwingSide, armAngleDeg, visibleBody, handPath } from './pose.js';

// Pinned to the installed @mediapipe/tasks-vision version; bump both together.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const KEEP_MS = 6000;      // rolling buffer length
const FRAME_EVERY_MS = 100; // 10 fps: smooth enough for the replay panel
const POSE_EVERY_MS = 30;  // caps the buffer at 200 pose samples
const MAX_B64 = 36000;     // base64 chars for about 27 KB of JPEG, so six frames fit the coach's 256 KB body cap
const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [11, 13], [13, 15], [12, 14], [14, 16]];

const CSS = `
.cam { border: 2px solid #1b2238; background: #fffaf0; padding: 10px; display: flex; flex-direction: column; gap: 8px; color: #1b2238; }
.cam h2 { font: 400 22px/1 Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif; text-transform: uppercase; margin: 0; }
.cam button { align-self: start; border: 2px solid #1b2238; background: #e0a526; color: #1b2238; padding: 6px 14px; cursor: pointer;
  font: 400 16px Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif; text-transform: uppercase; box-shadow: 4px 4px 0 #1b2238; }
.cam button:active { transform: translate(3px, 3px); box-shadow: 1px 1px 0 #1b2238; }
.cam button:focus-visible { outline: 3px solid #d23b2a; outline-offset: 3px; }
.cam canvas { display: block; width: 100%; height: auto; border: 2px solid #1b2238; background: #1b2238; }
.cam [hidden] { display: none; }
.cam-live { font: 700 22px "Courier New", ui-monospace, monospace; }
.cam-status { font: 700 13px "Courier New", ui-monospace, monospace; }
.cam-note { font: 13px/1.4 Georgia, serif; margin: 0; }
`;

let landmarkerPromise = null; // model is loaded once and reused across start/stop

async function loadLandmarker() {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: 'VIDEO', numPoses: 1,
  });
  return make('GPU').catch(() => make('CPU'));
}

// Laptops with face unlock expose an infrared camera too, and the browser's default pick can be one that
// will not start. Try the preferred settings, then every camera in turn, ordinary ones before infrared.
async function openCamera() {
  const media = navigator.mediaDevices;
  let error;
  try { return await media.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }); }
  catch (e) { if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') throw e; error = e; }
  const infrared = camera => /IR|infrared/i.test(camera.label);
  const cameras = (await media.enumerateDevices()).filter(device => device.kind === 'videoinput').sort((a, b) => infrared(a) - infrared(b));
  for (const camera of cameras) {
    try { return await media.getUserMedia({ audio: false, video: { deviceId: { exact: camera.deviceId } } }); } catch (e) { error = e; }
  }
  throw error;
}

function cameraError(e) {
  const name = e?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission was denied. Allow the camera for this page and try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this laptop.';
  if (name === 'NotReadableError' || name === 'AbortError') return `The camera would not start (${e.message || name}). Check that its privacy shutter or camera-off key is not on, close other apps and tabs that use the camera, then try again.`;
  return `Could not open the camera: ${e?.message ?? e}`;
}

export function createCamera(container) {
  if (!document.getElementById('cam-style')) {
    const style = document.createElement('style');
    style.id = 'cam-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  container.classList.add('cam');
  container.innerHTML = `
    <h2>Camera coach</h2>
    <button type="button">Enable camera coach</button>
    <canvas role="img" aria-label="Live camera view with your body outline drawn over it" hidden></canvas>
    <div class="cam-live" hidden></div>
    <div class="cam-status" aria-live="polite">Camera is off.</div>
    <p class="cam-note">Only your upper body needs to be in view: both shoulders and your throwing arm. Body tracking runs on this laptop. While the camera is on, up to six still frames of each swing are sent to Google Gemini for coaching; nothing is sent when it is off.</p>`;
  const button = container.querySelector('button');
  const canvas = container.querySelector('canvas');
  const live = container.querySelector('.cam-live');
  const status = container.querySelector('.cam-status');
  const ctx = canvas.getContext('2d');
  const small = document.createElement('canvas'); // 320px-wide, unmirrored, for the frames sent to the coach
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;

  let stream = null, landmarker = null, raf = 0, active = false, starting = false, run = 0;
  let frames = [], poses = [], lastFrameAt = 0, lastPoseAt = 0, lastVideoTime = -1;

  function release() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
    frames = [];
    poses = [];
    active = false;
  }

  function stop(message = 'Camera is off.') {
    run++; // abandons a start() that is still loading
    release();
    starting = false;
    canvas.hidden = live.hidden = true;
    button.textContent = 'Enable camera coach';
    status.textContent = message;
  }

  async function start() {
    if (active || starting) return;
    const mine = ++run;
    starting = true;
    button.textContent = 'Starting…';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use a camera here (it needs https or localhost).');
      status.textContent = 'Asking for the camera…';
      const s = await openCamera().catch(e => { throw new Error(cameraError(e)); });
      if (mine !== run) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      status.textContent = 'Loading body tracking…';
      landmarkerPromise ??= loadLandmarker();
      landmarker = await landmarkerPromise.catch(e => {
        landmarkerPromise = null; // let the next click retry
        throw new Error(`Body tracking could not be loaded (${e?.message ?? e}). Check the internet connection and try again.`);
      });
      if (mine !== run) return; // stop() already released the camera
      video.srcObject = stream;
      await video.play();
      if (mine !== run) return;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      small.width = 320;
      small.height = Math.round(320 * canvas.height / canvas.width);
      stream.getVideoTracks()[0].addEventListener('ended', () => { if (mine === run) stop('The camera was disconnected.'); });
      active = true;
      starting = false;
      lastVideoTime = -1;
      canvas.hidden = live.hidden = false;
      live.textContent = 'ARM --°';
      button.textContent = 'Turn camera off';
      status.textContent = 'Tracking. Stand so the camera sees you from head to knees.';
      raf = requestAnimationFrame(tick);
    } catch (e) {
      if (mine === run) stop(e.message);
      throw e;
    }
  }

  function tick() {
    if (!active) return;
    raf = requestAnimationFrame(tick);
    if (video.currentTime === lastVideoTime) return; // no new camera frame yet
    lastVideoTime = video.currentTime;
    const now = performance.now(), w = canvas.width, h = canvas.height;

    ctx.save();
    ctx.scale(-1, 1); // mirror, so moving right moves right on screen
    ctx.drawImage(video, -w, 0, w, h);
    ctx.restore();

    let lm;
    try { lm = landmarker.detectForVideo(video, now).landmarks[0]; }
    catch (e) { stop(`Body tracking stopped: ${e?.message ?? e}`); return; }

    if (now - lastFrameAt >= FRAME_EVERY_MS) {
      lastFrameAt = now;
      small.getContext('2d').drawImage(video, 0, 0, small.width, small.height);
      for (let q = 0.6; q > 0.1; q -= 0.15) {
        const jpeg = small.toDataURL('image/jpeg', q).split(',')[1];
        if (jpeg.length <= MAX_B64) { frames.push({ t: now, jpeg }); break; }
      }
      while (frames.length && frames[0].t < now - KEEP_MS) frames.shift();
    }

    if (!visibleBody(lm)) { setLive('SHOULDERS NOT IN VIEW'); return; }
    if (now - lastPoseAt >= POSE_EVERY_MS) {
      lastPoseAt = now;
      poses.push({ t: now, lm });
      while (poses.length && poses[0].t < now - KEEP_MS) poses.shift();
    }
    const aspect = w / h;
    const side = throwingSide(poses.filter(p => p.t >= now - 1500).map(p => p.lm), aspect);
    const at = (i) => [(1 - lm[i].x) * w, lm[i].y * h];
    const line = (a, b, colour, width) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(...at(a));
      ctx.lineTo(...at(b));
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    for (const [a, b] of BONES) line(a, b, '#1b2238', 7); // ink underlay keeps the lines readable on any background
    for (const [a, b] of BONES) line(a, b, '#f2e8d5', 3);
    for (const [a, b] of [[11 + side, 13 + side], [13 + side, 15 + side]]) line(a, b, '#d23b2a', 7); // throwing arm
    ctx.fillStyle = '#e0a526';
    ctx.strokeStyle = '#1b2238';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(...at(15 + side), 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    setLive(`ARM ${String(Math.round(armAngleDeg(lm, side, aspect))).padStart(3, ' ')}°`);
  }

  function setLive(text) {
    if (live.textContent !== text) live.textContent = text;
  }

  function capture(durationMs) {
    const from = performance.now() - Math.min(6000, Math.max(300, Number(durationMs) || 0));
    const f = frames.filter(x => x.t >= from);
    if (!f.length) return { frames: [], clip: [], pose: null }; // just switched on, or the tab was in the background
    const picks = [...new Set(Array.from({ length: 6 }, (_, i) => Math.round(i * (f.length - 1) / 5)))].filter(i => i >= 0); // six evenly spaced
    const window = poses.filter(p => p.t >= from).map(p => p.lm), aspect = canvas.width / canvas.height;
    return {
      frames: picks.map(i => f[i].jpeg),
      clip: f.map(x => x.jpeg), // every buffered frame of the window, for the replay panel
      pose: poseStats(window, aspect),
      ...handPath(window, aspect), // path + anchor of the hand holding the phone, when the upper body was in view
    };
  }

  button.addEventListener('click', () => {
    if (active || starting) stop();
    else start().catch(() => {}); // the message is already in the status line
  });

  return { start, stop: () => stop(), get active() { return active; }, capture };
}
