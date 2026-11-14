import { PROFILE_N } from '../shared/contract.js';

const axes = ['ax', 'ay', 'az', 'rx', 'ry', 'rz'];
export function validateSamples(samples) {
  if (!Array.isArray(samples) || samples.length < 3 || samples.length > 360) throw new Error('Capture a movement lasting at least a moment (3–360 readings).');
  let previous = -1;
  for (const sample of samples) {
    if (!sample || !Number.isFinite(sample.t) || sample.t < 0 || sample.t <= previous || sample.t > 6000 ||
        axes.some(axis => !Number.isFinite(sample[axis]) || Math.abs(sample[axis]) > 10000)) {
      throw new Error('The motion recording contains invalid readings. Please try again.');
    }
    previous = sample.t;
  }
  if (samples.at(-1).t - samples[0].t < 30) throw new Error('Hold the button a little longer to record a movement.');
  return samples;
}

export function extractFeatures(input) {
  const samples = validateSamples(input);
  const durationMs = samples.at(-1).t - samples[0].t;
  const acceleration = samples.map(s => Math.hypot(s.ax, s.ay, s.az));
  const peakAccel = Math.max(...acceleration);
  const peakRot = Math.max(...samples.map(s => Math.hypot(s.rx, s.rz))); // swing arc in either grip: flat in the palm (x) or edge-on like a remote (z)
  let twistDeg = 0, absoluteTwist = 0, variation = 0;
  const cumulative = [0];
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].t - samples[i - 1].t) / 1000;
    twistDeg += (samples[i - 1].ry + samples[i].ry) * dt / 2;
    absoluteTwist += (Math.abs(samples[i - 1].ry) + Math.abs(samples[i].ry)) * dt / 2;
    cumulative.push(absoluteTwist);
    variation += Math.abs(acceleration[i] - acceleration[i - 1]);
  }
  // A single smooth rise and fall has total variation close to twice its peak.
  // This is a signal heuristic, not a biomechanical quality assessment.
  const excess = Math.max(0, variation - 2 * peakAccel);
  const smoothness = peakAccel < 0.05 ? 1 : 1 / (1 + excess / Math.max(peakAccel * 2, 1));
  const halfIndex = cumulative.findIndex(value => value >= absoluteTwist / 2);
  const twistTiming = absoluteTwist < 0.25 ? 0.5 : (samples[halfIndex].t - samples[0].t) / durationMs;
  return { durationMs, peakAccel, peakRot, twistDeg, twistTiming, smoothness };
}

export function toProfile(input) {
  const samples = validateSamples(input);
  const profile = { swing: [], twist: [] };
  let cursor = 0;
  for (let i = 0; i < PROFILE_N; i++) {
    const t = samples[0].t + (samples.at(-1).t - samples[0].t) * i / (PROFILE_N - 1);
    while (cursor < samples.length - 2 && samples[cursor + 1].t < t) cursor++;
    const a = samples[cursor], b = samples[cursor + 1];
    const fraction = (t - a.t) / (b.t - a.t);
    profile.swing.push(Math.hypot(a.rx + (b.rx - a.rx) * fraction, a.rz + (b.rz - a.rz) * fraction));
    profile.twist.push(a.ry + (b.ry - a.ry) * fraction);
  }
  return profile;
}
