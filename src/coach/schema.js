export const finite = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const text = (x, max) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
export function validFeatures(f) {
  return !!f && finite(f.durationMs, 1, 15000) && finite(f.peakAccel, 0, 300) && finite(f.peakRot, 0, 4000)
    && finite(f.twistDeg, -10000, 10000) && finite(f.twistTiming, 0, 1) && finite(f.smoothness, 0, 1);
}
export function validResult(r) {
  return !!r && Number.isInteger(r.pinsDown) && finite(r.pinsDown, 0, 10)
    && Number.isInteger(r.frame) && finite(r.frame, 1, 10) && Number.isInteger(r.roll) && finite(r.roll, 1, 3)
    && typeof r.strike === 'boolean' && typeof r.spare === 'boolean';
}
export function validCoach(r) {
  return !!r && text(r.insight, 700) && text(r.tip, 400) && finite(r.consistency, 0, 100);
}
export function validAdaptation(r) {
  return !!r && finite(r.mapping?.gain, 0.5, 6) && finite(r.mapping?.twistGain, 0, 2)
    && ['swing', 'gentle'].includes(r.mapping?.mode) && text(r.drill?.title, 80)
    && text(r.drill?.instruction, 400) && finite(r.drill?.laneWidth, 0.65, 1)
    && finite(r.drill?.targetSide, -1, 1) && text(r.rationale, 700)
    && Array.isArray(r.evidence) && r.evidence.length >= 1 && r.evidence.length <= 4 && r.evidence.every(x => text(x, 240));
}
const string = { type: 'string' };
const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const coachSchema = object({ insight: string, tip: string, consistency: number(0, 100) });
export const adaptationSchema = object({
  mapping: object({ gain: number(0.5, 6), twistGain: number(0, 2), mode: { type: 'string', enum: ['swing', 'gentle'] } }),
  drill: object({ title: string, instruction: string, laneWidth: number(0.65, 1), targetSide: number(-1, 1) }),
  rationale: string, evidence: { type: 'array', items: string, minItems: 1, maxItems: 4 },
});
export function fallbackCoach({ features, result, trends = {} }) {
  const early = Math.abs(features.twistDeg) > 3 && features.twistTiming < 0.4;
  return {
    insight: `You knocked down ${result.pinsDown} pins. ${early ? 'Most wrist rotation happened early in this motion.' : 'Your motion is recorded in Swing Lab for comparison.'}`,
    tip: early ? 'Try the same comfortable movement with wrist rotation closer to release.' : 'Repeat a comfortable movement and compare its timing with your best throw.',
    consistency: finite(trends.consistency, 0, 100) ? trends.consistency : Math.round(features.smoothness * 100),
    source: 'fallback',
  };
}
export function fallbackAdaptation({ samples }) {
  const mean = samples.reduce((s, f) => s + f.peakAccel, 0) / samples.length;
  return {
    mapping: { gain: Math.min(4, Math.max(1, 12 / Math.max(mean, 3))), twistGain: 0.5, mode: mean < 6 ? 'gentle' : 'swing' },
    drill: { title: 'Comfortable repeatability', instruction: 'Make three comfortable throws with similar timing. Aim toward the center.', laneWidth: 1, targetSide: 0 },
    rationale: 'Local fallback uses measured acceleration to choose modest assistance. Your language request has not been interpreted by Gemini.',
    evidence: [`${samples.length} motion sample(s); mean peak acceleration ${mean.toFixed(1)} m/s².`], source: 'fallback',
  };
}
