import { host } from './net.js';
import { drawQR } from './controller/qr.js';
import { createGame } from './game/index.js';
import { extractFeatures, toProfile } from './motion/features.js';
import { toThrowParams } from './motion/mapping.js';
import { createSwingLab } from './ui/swinglab.js';
import { getCoaching, getHistory, recordThrow, bestThrow, trends } from './coach/index.js';

const game = createGame(document.getElementById('game'));
const lab = createSwingLab(document.getElementById('lab'));
const status = document.getElementById('status');
let throwNo = 0;

async function onSwing({ samples }) {
  if (game.busy) return;
  const mine = ++throwNo;
  const features = extractFeatures(samples);
  const profile = toProfile(samples);
  const params = toThrowParams(features);
  const bestProfile = bestThrow(getHistory())?.profile ?? null;

  lab.show({ features, profile, bestProfile, result: null });
  lab.setCoach(null);
  const result = await game.throwBall(params);
  recordThrow({ features, profile, params, result, at: Date.now() });
  lab.show({ features, profile, bestProfile, result });

  const reply = await getCoaching({ features, result, trends: trends(getHistory()) });
  if (mine === throwNo) lab.setCoach(reply); // a newer throw owns the panel now
}

// Same entry point the phone uses; lets fixtures drive the full loop without a phone.
window.__swing = onSwing;

host(onSwing, (text) => { status.textContent = text; })
  .then(({ url }) => {
    drawQR(document.getElementById('qr'), url);
    document.getElementById('url').textContent = url;
  })
  .catch((e) => { status.textContent = `Pairing unavailable: ${e.message ?? e}`; });
