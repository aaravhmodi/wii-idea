import { it, expect } from 'vitest';
import { createPhysics } from './physics.js';
it('pins remain standing without a throw', () => {
  const p = createPhysics(); for (let i = 0; i < 360; i++) p.step(1 / 120);
  expect(p.collect()).toBe(0);
});
it('a straight throw physically reaches and knocks the rack', () => {
  const p = createPhysics(); p.launch({ speed: .65, angle: 0, spin: 0 });
  for (let i = 0; i < 720; i++) p.step(1 / 120);
  const down = p.collect(); expect(down).toBeGreaterThan(0); expect(down).toBeLessThanOrEqual(10);
  expect(p.collect()).toBe(0);
  p.rack(); expect(p.pins.filter(pin => pin.active)).toHaveLength(10);
});
it('applies the same hook at 60 and 120 display frames per second', () => {
  const positions = [60, 120].map(hz => {
    const p = createPhysics(); p.launch({ speed: .65, angle: 0, spin: 1 });
    for (let i = 0; i < hz; i++) p.step(1 / hz, 1);
    return p.ball.position;
  });
  expect(positions[0].x).toBeCloseTo(positions[1].x, 5);
  expect(positions[0].z).toBeCloseTo(positions[1].z, 5);
});
