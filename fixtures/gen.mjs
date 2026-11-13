// Synthetic swings for building without a phone. Run: node fixtures/gen.mjs
import { writeFileSync } from 'node:fs';
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
function swing({ ms, accel, rot, twist, twistAt, noise = 0 }) {
  const n = Math.round(ms / 16.67), samples = [];
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * noise;
  // twist bump is normalised so its integral is `twist` degrees
  const w = 0.12, area = w * Math.sqrt(Math.PI) * (ms / 1000);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    samples.push({
      t: Math.round(i * 16.67),
      ax: +(rnd() * 2).toFixed(2),
      ay: +(accel * bell(x, 0.75, 0.2) + rnd() * 3).toFixed(2),
      az: +(accel * 0.3 * bell(x, 0.6, 0.25) + rnd() * 2).toFixed(2),
      rx: +(rot * bell(x, 0.7, 0.25) + rnd() * 20).toFixed(1),
      ry: +((twist / area) * bell(x, twistAt, w) + rnd() * 10).toFixed(1),
      rz: +(rnd() * 10).toFixed(1),
    });
  }
  return { type: 'swing', samples };
}
writeFileSync(new URL('./swings.json', import.meta.url), JSON.stringify({
  straight:   swing({ ms: 900,  accel: 25, rot: 400, twist: 0,  twistAt: 0.5 }),
  earlyTwist: swing({ ms: 900,  accel: 25, rot: 400, twist: 60, twistAt: 0.25 }),
  lateHook:   swing({ ms: 900,  accel: 25, rot: 400, twist: 45, twistAt: 0.8 }),
  slow:       swing({ ms: 1500, accel: 8,  rot: 180, twist: 5,  twistAt: 0.5 }),
  fast:       swing({ ms: 500,  accel: 45, rot: 700, twist: -20, twistAt: 0.6 }),
  jerky:      swing({ ms: 900,  accel: 25, rot: 400, twist: 10, twistAt: 0.5, noise: 3 }),
}));
