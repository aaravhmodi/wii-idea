import { generate, json, readBody } from '../src/coach/server.js';
import { coachSchema, fallbackCoach, finite, validCoach, validFeatures, validResult } from '../src/coach/schema.js';

const prompt = `You are a concise bowling motion coach for a phone-controlled game. Explain one measured observation and one comfortable action to try next. Motion profiles are not reconstructed arm positions. Do not infer medical conditions, biomechanics or causation from correlation. Use only the supplied measurements. A consistency score measures repeatability, not health or skill. Return the requested JSON object.`;
const trendBounds = { count: [0, 20], averagePins: [0, 10], averageSpeed: [0, 1], averageDurationMs: [0, 15000], consistency: [0, 100], speedPinsCorrelation: [-1, 1] };

export async function POST(request) {
  let data;
  try {
    const body = await readBody(request);
    if (!validFeatures(body?.features) || !validResult(body?.result)) throw new Error('Invalid swing or result.');
    if (body.trends !== undefined && (!body.trends || typeof body.trends !== 'object' || Array.isArray(body.trends))) throw new Error('Invalid trends.');
    const trends = {};
    for (const [key, [min, max]] of Object.entries(trendBounds)) {
      if (body.trends?.[key] === undefined) continue;
      if (!finite(body.trends[key], min, max)) throw new Error('Invalid trends.');
      trends[key] = body.trends[key];
    }
    const features = Object.fromEntries(['durationMs', 'peakAccel', 'peakRot', 'twistDeg', 'twistTiming', 'smoothness'].map(key => [key, body.features[key]]));
    const result = Object.fromEntries(['pinsDown', 'frame', 'roll', 'strike', 'spare'].map(key => [key, body.result[key]]));
    data = { features, result, trends };
  } catch { return json({ error: 'Expected valid swing features, throw result and numeric trends within 16 KB.' }, 400); }
  try { return json(await generate(prompt, data, coachSchema, validCoach)); }
  catch { return json(fallbackCoach(data)); }
}
