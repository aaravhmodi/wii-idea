import { describe, it, expect } from 'vitest';
import { validSwing, sampleFromEvent } from './capture.js';
import fixtures from '../../fixtures/swings.json';

describe('phone capture contract', () => {
  it('accepts real-shaped motion fixtures', () => {
    for (const message of Object.values(fixtures)) expect(validSwing(message)).toBe(true);
  });
  it('rejects oversized, missing, nonfinite and unordered samples', () => {
    expect(validSwing(null)).toBe(false);
    expect(validSwing({ type: 'swing', samples: Array(361).fill(fixtures.straight.samples[0]) })).toBe(false);
    expect(validSwing({ ...fixtures.straight, samples: fixtures.straight.samples.map(s => ({ ...s, ry: Infinity })) })).toBe(false);
    expect(validSwing({ ...fixtures.straight, samples: [...fixtures.straight.samples].reverse() })).toBe(false);
    expect(validSwing({ ...fixtures.straight, samples: fixtures.straight.samples.map(s => ({ ...s, t: s.t + 6000 })) })).toBe(false);
  });
  it('does not interpret missing sensors or gravity as zero-valued useful readings', () => {
    expect(sampleFromEvent({ acceleration: { x: null, y: 0, z: 0 }, rotationRate: { beta: 0, gamma: 0, alpha: 0 } }, 20)).toBeNull();
    expect(sampleFromEvent({ accelerationIncludingGravity: { x: 0, y: 9.8, z: 0 } }, 20)).toBeNull();
    expect(sampleFromEvent({ acceleration: { x: 1, y: 2, z: 3 }, rotationRate: { beta: 4, gamma: 5, alpha: 6 } }, 20)).toEqual({ t: 20, ax: 1, ay: 2, az: 3, rx: 4, ry: 5, rz: 6 });
  });
});
