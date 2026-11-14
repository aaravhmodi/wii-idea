import { host } from './net.js';
import { drawQR } from './controller/qr.js';
import { createGame } from './game/index.js';
import { extractFeatures, toProfile } from './motion/features.js';
import { toThrowParams } from './motion/mapping.js';
import { createSwingLab } from './ui/swinglab.js';
import { getCoaching, getHistory, recordThrow, bestThrow, trends } from './coach/index.js';
import { validSwing } from './controller/capture.js';
import { createCamera } from './camera/index.js';
import { createReplay } from './camera/replay.js';

const game = createGame(document.getElementById('game'));
const lab = createSwingLab(document.getElementById('lab'));
const camera = createCamera(document.getElementById('camera'));
const replay = createReplay(document.getElementById('replay'));
const status = document.getElementById('status');
let throwNo = 0;

async function onSwing({ samples }) {
  if (!validSwing({ type: 'swing', samples })) throw new Error('Invalid motion recording.');
  if (game.busy) return;
  if (game.score.complete) game.reset(); // a swing after frame ten starts the next game
  const mine = ++throwNo;
  const features = extractFeatures(samples);
  const profile = toProfile(samples);
  const params = toThrowParams(features);
  // The message arrives right after release, so the last durationMs (+ relay delay margin) of camera buffer is the swing.
  const seen = camera.active ? camera.capture(features.durationMs + 300) : { frames: [], pose: null };
  replay.show(seen.clip);
  const bestProfile = bestThrow(getHistory())?.profile ?? null;

  lab.show({ features, profile, bestProfile, result: null });
  lab.setCoach(null);
  const newGame = document.getElementById('newgame');
  newGame.disabled = true;
  let result;
  try { result = await game.throwBall(params); }
  finally { newGame.disabled = false; }
  recordThrow({ features, profile, params, result, at: Date.now() });
  lab.show({ features, profile, bestProfile, result });

  // Release the phone as soon as the lane is ready; coaching can finish independently.
  void getCoaching({ features, result, trends: trends(getHistory()), ...(seen.pose && { pose: seen.pose }), ...(seen.frames.length && { frames: seen.frames }) }).then(reply => {
    if (mine === throwNo) lab.setCoach(reply);
  });
  return result;
}

document.getElementById('newgame').addEventListener('click', () => {
  if (game.busy) return;
  ++throwNo;
  game.reset();
  lab.reset();
});

// Same entry point the phone uses; lets fixtures drive the full loop without a phone.
window.__swing = onSwing;

host(onSwing, (text) => { status.textContent = text; })
  .then(({ url }) => {
    drawQR(document.getElementById('qr'), url).catch(() => { status.textContent = 'QR unavailable. Open the pairing link on your phone.'; });
    document.getElementById('url').textContent = url;
  })
  .catch((e) => { status.textContent = `Pairing unavailable: ${e.message ?? e}`; });
