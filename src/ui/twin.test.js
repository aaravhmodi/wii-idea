import { expect, it } from 'vitest';
import { swingAngles } from './twin.js';

const sample = (t, rx, ry) => ({ t, ax: 0, ay: 0, az: 0, rx, ry, rz: 0 });

it('integrates gyro rates into swing and twist angles', () => {
  const still = swingAngles([sample(0, 0, 0), sample(500, 0, 0), sample(1000, 0, 0)]);
  expect(still.at(-1)).toEqual({ t: 1000, swing: 0, twist: 0 });

  // 90 deg/s of swing and -30 deg/s of twist for one second, at uneven sample times starting late
  const steady = swingAngles([200, 210, 400, 950, 1200].map(t => sample(t, 90, -30)));
  expect(steady[0]).toEqual({ t: 0, swing: 0, twist: 0 });
  expect(steady.at(-1).t).toBe(1000);
  expect(steady.at(-1).swing).toBeCloseTo(90, 6);
  expect(steady.at(-1).twist).toBeCloseTo(-30, 6);
});
