export const DEFAULT_MAPPING = Object.freeze({ gain: 1, twistGain: 1, mode: 'swing' });
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function validateMapping(mapping) {
  if (!mapping || !Number.isFinite(mapping.gain) || mapping.gain < 0.5 || mapping.gain > 6 ||
      !Number.isFinite(mapping.twistGain) || mapping.twistGain < 0 || mapping.twistGain > 2 ||
      !['swing', 'gentle'].includes(mapping.mode)) throw new Error('Invalid control settings.');
  return { gain: mapping.gain, twistGain: mapping.twistGain, mode: mapping.mode };
}
export function toThrowParams(features, settings = DEFAULT_MAPPING) {
  const mapping = validateMapping(settings);
  if (!features || ['peakAccel', 'peakRot', 'twistDeg'].some(key => !Number.isFinite(features[key]))) throw new Error('Invalid swing features.');
  const energy = mapping.mode === 'gentle'
    ? Math.max(features.peakAccel / 20, features.peakRot / 250, Math.abs(features.twistDeg) / 55)
    : features.peakAccel / 55 * 0.65 + features.peakRot / 800 * 0.35;
  return {
    speed: clamp(energy * mapping.gain, 0, 1),
    angle: clamp(features.twistDeg / 180 * mapping.twistGain, -0.65, 0.65),
    spin: clamp(features.twistDeg / 100 * mapping.twistGain, -1, 1),
  };
}
