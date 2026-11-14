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

import * as THREE from 'three';
import { orientationPath } from './twin.js';

const armAt = step => new THREE.Vector3(0, -1, 0).applyQuaternion(step.q).toArray();
const close = (got, want) => got.forEach((value, i) => expect(value).toBeCloseTo(want[i], 2));

it('replays the swing in 3D whichever way the phone is gripped', () => {
  const still = orientationPath([sample(0, 0, 0), sample(500, 0, 0), sample(1000, 0, 0)]);
  close(armAt(still.at(-1)), [0, -1, 0]); // no rotation: the arm hangs straight down

  // 90 degrees of backswing, flat-in-the-palm grip (rotation about the phone's x axis)
  const flat = orientationPath([0, 250, 500, 750, 1000].map(t => sample(t, 90, 0)));
  close(armAt(flat.at(-1)), [0, 0, 1]); // the first excursion carries the arm straight back
  expect(flat.at(-1).q.length()).toBeCloseTo(1, 6);

  // The same swing held edge-on like a remote (rotation about z) and in the other direction looks identical.
  const remote = orientationPath([0, 250, 500, 750, 1000].map(t => ({ t, ax: 0, ay: 0, az: 0, rx: 0, ry: 0, rz: -90 })));
  close(armAt(remote.at(-1)), [0, 0, 1]);

  // Back 60 degrees, then forward 90: the arm passes the bottom and ends 30 degrees in front (-z), below the shoulder.
  const through = orientationPath([...[0, 250, 500].map(t => sample(t, 120, 0)), ...[750, 1000, 1250, 1500].map(t => sample(t, -120, 0))]);
  const end = armAt(through.at(-1));
  expect(end[2]).toBeCloseTo(-0.5, 2);
  expect(end[1]).toBeLessThan(0);
  expect(Math.abs(end[0])).toBeLessThan(0.05); // a pure swing stays in its plane
});
