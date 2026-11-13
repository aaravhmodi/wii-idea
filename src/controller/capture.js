export const MAX_SAMPLES = 360;
export const MAX_DURATION = 6000;
const fields = ['ax', 'ay', 'az', 'rx', 'ry', 'rz'];

export function validSwing(message) {
  if (!message || message.type !== 'swing' || !Array.isArray(message.samples) || message.samples.length < 3 || message.samples.length > MAX_SAMPLES) return false;
  let previous = -1;
  for (const sample of message.samples) {
    if (!sample || !Number.isFinite(sample.t) || sample.t <= previous || sample.t < 0 || sample.t > MAX_DURATION ||
        fields.some(key => !Number.isFinite(sample[key]) || Math.abs(sample[key]) > 10000)) return false;
    previous = sample.t;
  }
  return message.samples.at(-1).t - message.samples[0].t >= 30;
}

// Never substitute accelerationIncludingGravity: it would make stationary phones look like swings.
export function sampleFromEvent(event, t) {
  const a = event.acceleration;
  const r = event.rotationRate;
  if (!a || !r || [a.x, a.y, a.z, r.beta, r.gamma, r.alpha].some(v => typeof v !== 'number' || !Number.isFinite(v))) return null;
  return { t, ax: a.x, ay: a.y, az: a.z, rx: r.beta, ry: r.gamma, rz: r.alpha };
}
