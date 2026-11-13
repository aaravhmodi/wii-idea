import { describe, it, expect } from 'vitest';
import fixtures from '../../fixtures/swings.json';
import { extractFeatures, toProfile } from './features.js';
import { toThrowParams, validateMapping } from './mapping.js';

describe('measured motion', () => {
  it('distinguishes early rotation, late rotation, speed and noise', () => {
    const f = Object.fromEntries(Object.entries(fixtures).map(([name, msg]) => [name, extractFeatures(msg.samples)]));
    expect(f.earlyTwist.twistTiming).toBeLessThan(0.4);
    expect(f.lateHook.twistTiming).toBeGreaterThan(0.7);
    expect(f.straight.twistDeg).toBe(0);
    expect(f.earlyTwist.twistDeg).toBeCloseTo(60, -1);
    expect(f.fast.peakAccel).toBeGreaterThan(f.slow.peakAccel);
    expect(f.jerky.smoothness).toBeLessThan(f.straight.smoothness);
  });
  it('rejects missing, nonfinite, unordered and oversized input', () => {
    for (const bad of [[], [null, null, null], Array(361).fill(fixtures.straight.samples[0]),
      fixtures.straight.samples.map(s => ({ ...s, t: 0 })), fixtures.straight.samples.map(s => ({ ...s, rx: NaN }))]) {
      expect(() => extractFeatures(bad)).toThrow();
    }
  });
  it('resamples in time while preserving motion amplitude', () => {
    const p = toProfile(fixtures.straight.samples);
    expect(p.swing).toHaveLength(50);
    expect(p.twist.every(n => n === 0)).toBe(true);
    expect(Math.max(...p.swing)).toBeGreaterThan(390);
  });
  it('makes small movement playable without unbounded model settings', () => {
    const f = extractFeatures(fixtures.slow.samples);
    expect(toThrowParams(f, { gain: 2, twistGain: 0.5, mode: 'gentle' }).speed).toBeGreaterThan(toThrowParams(f).speed);
    expect(() => validateMapping({ gain: 100, twistGain: 1, mode: 'gentle' })).toThrow();
    expect(toThrowParams(extractFeatures(fixtures.fast.samples)).speed).toBeLessThanOrEqual(1);
  });
});
