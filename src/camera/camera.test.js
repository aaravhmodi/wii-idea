import { describe, it, expect } from 'vitest';
import { poseStats, throwingSide, armAngleDeg, handPath, pendulumPath, comparePaths, pathTip } from './pose.js';

// A person standing square to a 4:3 camera, arms hanging. Angles are drawn in true (aspect-corrected) space.
function body({ rightArmDeg = 0, kneeDrop = 0, visibility = 0.9 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }));
  const set = (i, x, y) => { lm[i] = { x: x / (4 / 3), y, visibility }; };
  set(11, 0.75, 0.30); set(12, 0.55, 0.30);            // shoulders (left, right)
  set(23, 0.72, 0.55); set(24, 0.58, 0.55);            // hips
  set(25, 0.72 + kneeDrop, 0.72); set(26, 0.58, 0.72); // knees (left knee pushed sideways = bent)
  set(27, 0.72, 0.90); set(28, 0.58, 0.90);            // ankles
  set(15, 0.75, 0.58);                                 // left wrist hangs
  const a = rightArmDeg * Math.PI / 180;               // 0 = down, 90 = level, 180 = up
  set(16, 0.55 - 0.28 * Math.sin(a), 0.30 + 0.28 * Math.cos(a));
  return lm;
}

const inRange = (p) => {
  const ranges = { samples: [1, 200], armSwingDeg: [0, 360], releaseWristHeight: [-3, 3], shoulderTiltDeg: [-90, 90], visibility: [0, 1] };
  expect(Object.keys(p).sort()).toEqual(Object.keys(ranges).sort());
  for (const [k, [lo, hi]] of Object.entries(ranges)) {
    expect(Number.isFinite(p[k]), k).toBe(true);
    expect(p[k], k).toBeGreaterThanOrEqual(lo);
    expect(p[k], k).toBeLessThanOrEqual(hi);
  }
};

describe('poseStats', () => {
  it('reads a straight standing pose as still, straight and level', () => {
    const p = poseStats(Array.from({ length: 10 }, () => body()));
    inRange(p);
    expect(p.samples).toBe(10);
    expect(p.armSwingDeg).toBeCloseTo(0, 5);
    expect(p.shoulderTiltDeg).toBeCloseTo(0, 5);
    expect(p.releaseWristHeight).toBeLessThan(0); // hanging hand is below the shoulder line
    expect(p.visibility).toBeCloseTo(0.9, 5);
  });

  it('measures a clear arm swing, a raised release and a bent knee', () => {
    // Backswing to -60°, then through the bottom and up to 150°: 210° covered, crossing the atan2 seam.
    const degs = [0, -30, -60, -30, 0, 40, 80, 120, 150];
    const samples = degs.map((d, i) => body({ rightArmDeg: d, kneeDrop: i === 4 ? 0.08 : 0 }));
    const p = poseStats(samples);
    inRange(p);
    expect(throwingSide(samples)).toBe(1);
    expect(p.armSwingDeg).toBeCloseTo(210, 3);
    expect(p.releaseWristHeight).toBeGreaterThan(1); // finished above the shoulder
    expect(armAngleDeg(samples.at(-1), 1)).toBeCloseTo(150, 3);
  });

  it('needs only the upper body: hips and legs out of frame still give a pose', () => {
    const cropped = Array.from({ length: 5 }, () => { const lm = body(); for (let i = 23; i < 33; i++) lm[i] = { x: 0.5, y: 1.2, visibility: 0 }; return lm; });
    const p = poseStats(cropped);
    inRange(p);
    expect(p.visibility).toBeCloseTo(0.9, 5);
  });

  it('returns null with too few visible samples', () => {
    expect(poseStats([])).toBeNull();
    expect(poseStats(undefined)).toBeNull();
    expect(poseStats([body(), body()])).toBeNull();
    // Plenty of samples, but the body is not confidently seen in most of them.
    expect(poseStats([body(), body(), ...Array.from({ length: 20 }, () => body({ visibility: 0.2 })), [], null])).toBeNull();
  });

  it('keeps every value finite and in range with noisy input', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let run = 0; run < 50; run++) {
      const samples = Array.from({ length: 250 }, () =>
        Array.from({ length: 33 }, () => ({ x: rnd() * 6 - 3, y: rnd() * 6 - 3, visibility: 0.5 + rnd() })));
      inRange(poseStats(samples));
    }
    // Degenerate: every joint on one spot (zero-length torso, arm and legs).
    inRange(poseStats(Array.from({ length: 5 }, () => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 })))));
  });
});

it('imports in node without touching the DOM', async () => {
  expect(typeof (await import('./index.js')).createCamera).toBe('function');
});

describe('hand path beams', () => {
  const swing = [0, -30, -60, -30, 0, 40, 80, 120, 150].map(d => body({ rightArmDeg: d }));

  it('tracks the throwing wrist relative to the shoulder, in shoulder widths', () => {
    const { path, anchor } = handPath(swing);
    expect(path).toHaveLength(9);
    expect(path[0][0]).toBeCloseTo(0, 5);       // arm hanging: straight below the shoulder
    expect(path[0][1]).toBeCloseTo(1.4, 5);     // 0.28 arm / 0.20 shoulder width
    expect(anchor.width).toBeCloseTo(0.2, 5);
    expect(handPath(swing.slice(0, 2))).toBeNull();
  });

  it('a perfect pendulum matches its own target and gets a keep-going tip', () => {
    const { path } = handPath(swing);
    const gap = comparePaths(path, pendulumPath(path));
    expect(gap.worstGap).toBeLessThan(0.05);
    expect(pathTip(gap, false)).toContain('stayed on the path');
  });

  it('names where and how far the hand left the target', () => {
    const { path } = handPath(swing);
    const off = path.map(([u, v], i) => (i === path.length - 1 ? [u + 0.8, v] : [u, v]));
    const gap = comparePaths(off, path);
    expect(gap.releaseAcross).toBeCloseTo(0.8, 5);
    expect(pathTip(gap, true)).toMatch(/your best throw at the release.*0\.8 shoulder widths to the right/);
  });
});
