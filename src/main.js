import { host } from './net.js';
import { drawQR } from './controller/qr.js';
import { createGame } from './game/index.js';
import { extractFeatures, toProfile } from './motion/features.js';
import { DEFAULT_MAPPING, toThrowParams, validateMapping } from './motion/mapping.js';
import { createAdapt } from './ui/adapt.js';
import { createSwingLab } from './ui/swinglab.js';
import { getAdaptation, getCoaching, getPlan, getHistory, recordThrow, bestThrow, trends } from './coach/index.js';
import { validSwing } from './controller/capture.js';
import { createCamera } from './camera/index.js';
import { createReplay } from './camera/replay.js';
import { createVoiceCoach } from './coach/live.js';
import { createTwin } from './ui/twin.js';
import { createPlan } from './ui/plan.js';

const game = createGame(document.getElementById('game'));
const lab = createSwingLab(document.getElementById('lab'));
const camera = createCamera(document.getElementById('camera'));
const replay = createReplay(document.getElementById('replay'));
const twin = createTwin(document.getElementById('twin'));
const status = document.getElementById('status');
let throwNo = 0, lastReview = null, mixedGame = false, adaptRun = 0, sendToPhone = null, buzzed = false;
game.onImpact = strength => {
  if (buzzed) return; // one rattle per throw; pins collide dozens of times
  buzzed = true;
  const hit = Math.round(Math.min(160, 40 + strength * 12));
  sendToPhone?.({ type: 'haptic', pattern: [hit, 30, hit * 0.6, 40, hit * 0.4, 50, 25] });
};

// Control mapping chosen by Gemini for this player; kept across reloads.
const MAPPING_KEY = 'motionplay.mapping.v1';
let mapping = DEFAULT_MAPPING;
try { mapping = validateMapping(JSON.parse(localStorage.getItem(MAPPING_KEY))); } catch { /* none saved, or an old format */ }
function setMapping(next) {
  if (game.busy) throw new Error('Wait for the ball to stop, then try again.');
  mapping = next === null ? DEFAULT_MAPPING : validateMapping(next);
  try { next === null ? localStorage.removeItem(MAPPING_KEY) : localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping)); } catch { /* still applies for this session */ }
}
const voice = createVoiceCoach(document.getElementById('voice'), {
  set_controls(args) { setMapping(args); return { applied: mapping }; },
  set_drill(args) { if (game.busy) throw new Error('The ball is rolling; try again in a moment.'); game.setDrill(args); return 'ok'; },
  clear_drill() { if (game.busy) throw new Error('The ball is rolling; try again in a moment.'); game.setDrill(null); return 'ok'; },
  new_game() { if (game.busy) throw new Error('The ball is rolling; try again in a moment.'); ++throwNo; mixedGame = false; game.reset(); lab.reset(); return 'ok'; },
  get_stats() { return { controls: mapping, score: game.score.total, frame: game.score.frame, last20: trends(getHistory()), trainingPlan: plan.current }; },
  async review_last_throw() {
    if (!lastReview) throw new Error('No throw yet.');
    const { insight, tip, vision } = await lastReview;
    return { insight, tip, cameraFramesSeen: vision === true };
  },
});
const plan = createPlan(document.getElementById('plan'), async ({ games, previous }) => {
  const history = getHistory();
  if (history.length < 3) throw new Error('Make at least three throws first.');
  return getPlan({ games, previous, trends: trends(history), throws: history.map(r => ({ pins: r.result.pinsDown, ballSpeed: r.params.speed,
    twistDeg: r.features.twistDeg, twistTiming: r.features.twistTiming, smoothness: r.features.smoothness })) });
});
createAdapt(document.getElementById('adapt'), {
  async adapt(request) {
    const history = getHistory();
    if (!history.length) throw new Error('Make at least one throw first. Any comfortable movement counts.');
    if (game.busy) throw new Error('Wait for the ball to stop, then try again.');
    const recent = history.slice(-5), run = ++adaptRun;
    const adaptation = await getAdaptation({ samples: recent.map(r => r.features), pins: recent.map(r => r.result.pinsDown), trends: trends(history), request });
    if (run !== adaptRun) throw new Error('Controls were reset while Gemini was answering; nothing was changed.');
    setMapping(adaptation.mapping);
    game.setDrill(adaptation.drill);
    return adaptation;
  },
  reset() {
    setMapping(null);
    ++adaptRun; // a pending adaptation must not undo this
    game.setDrill(null);
  },
});

async function onSwing({ samples, simulated = false }) {
  if (!validSwing({ type: 'swing', samples })) throw new Error('Invalid motion recording.');
  if (game.busy) throw new Error('A ball is already rolling.'); // the phone is told the throw did not count
  if (game.score.complete) { game.reset(); mixedGame = false; } // a swing after frame ten starts the next game
  if (simulated) mixedGame = true;
  const mine = ++throwNo;
  buzzed = false;
  const features = extractFeatures(samples);
  const profile = toProfile(samples);
  const params = toThrowParams(features, mapping);
  // The message arrives right after release, so the last durationMs (+ relay delay margin) of camera buffer is the swing.
  const seen = camera.active ? camera.capture(features.durationMs + 300) : { frames: [], pose: null };
  // The camera clip is cut half a second later so it includes the follow-through.
  if (camera.active) setTimeout(() => replay.show(camera.capture(features.durationMs + 800).clip), 500);
  twin.show(samples);
  const bestProfile = bestThrow(getHistory())?.profile ?? null;

  lab.show({ features, profile, bestProfile, result: null });
  lab.setCoach(null);
  const newGame = document.getElementById('newgame');
  newGame.disabled = true;
  let result;
  try { result = await game.throwBall(params); }
  finally { newGame.disabled = false; }
  const recent = getHistory().slice(-5).map(r => ({ source: 'sensor', features: r.features, result: r.result, params: r.params }));
  if (!simulated) recordThrow({ features, profile, params, result, at: Date.now() }); // simulated throws stay out of the player's statistics
  lab.show({ features, profile, bestProfile, result });
  if (result.strike || result.spare) sendToPhone?.({ type: 'haptic', pattern: result.strike ? [220, 70, 220, 70, 320] : [150, 60, 150] });
  voice.notify({ type: 'throw', simulated, result, features, ballSpeed: params.speed, ...(seen.pose && { pose: seen.pose }) });

  // Release the phone as soon as the lane is ready; coaching can finish independently.
  lastReview = getCoaching({ features, result, trends: trends(getHistory()), source: simulated ? 'simulation' : 'sensor', mapping, ...(recent.length && { recent }),
    ...(seen.pose && { pose: seen.pose }), ...(seen.frames.length && { frames: seen.frames }) });
  void lastReview.then(reply => { if (mine === throwNo) lab.setCoach(reply); });
  if (game.score.complete && !mixedGame) void plan.gameFinished(game.score.total); // games with simulated throws are not the player's score
  return result;
}

document.getElementById('newgame').addEventListener('click', () => {
  if (game.busy) return;
  ++throwNo;
  mixedGame = false;
  game.reset();
  lab.reset();
});

// Backup for when no phone can pair: a synthetic swing, labelled as simulated everywhere it goes.
document.getElementById('simulate').addEventListener('click', () => {
  if (game.busy) return;
  const power = 0.6 + Math.random() * 0.5, twist = (Math.random() - 0.5) * 120;
  const samples = Array.from({ length: 60 }, (_, i) => {
    const p = Math.sin(Math.PI * i / 59);
    return { t: i * 16, ax: 0, ay: 34 * power * p, az: 5 * p, rx: 520 * power * p, ry: twist * p, rz: 0 };
  });
  const before = status.textContent;
  status.textContent = 'Simulated throw (not a real swing)';
  onSwing({ samples, simulated: true }).catch(() => {}).finally(() => { if (status.textContent.startsWith('Simulated')) status.textContent = before; });
});

// Tabs: one group of side panels at a time.
const tabs = [...document.querySelectorAll('#tabs [role=tab]')];
for (const tab of tabs) tab.addEventListener('click', () => {
  for (const other of tabs) {
    other.setAttribute('aria-selected', String(other === tab));
    document.getElementById(other.getAttribute('aria-controls')).hidden = other !== tab;
  }
});

// Same entry point the phone uses; lets fixtures drive the full loop without a phone.
window.__swing = onSwing;

host(onSwing, (text) => { status.textContent = text; })
  .then(({ url, send }) => {
    sendToPhone = send;
    drawQR(document.getElementById('qr'), url).catch(() => { status.textContent = 'QR unavailable. Open the pairing link on your phone.'; });
    document.getElementById('url').textContent = url;
  })
  .catch((e) => { status.textContent = `Pairing unavailable: ${e.message ?? e}`; });
