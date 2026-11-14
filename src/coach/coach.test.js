import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../api/coach.js';
import { bestThrow, getCoaching, getHistory, recordThrow, trends } from './index.js';
import { generate, readBody } from './server.js';
import { coachSchema, validCoach } from './schema.js';

const features = { durationMs: 1000, peakAccel: 20, peakRot: 200, twistDeg: 8, twistTiming: 0.6, smoothness: 0.8 };
const result = { pinsDown: 6, frame: 1, roll: 1, strike: false, spare: false };
const payload = { features, result, trends: { count: 1, consistency: 0 } };
const record = (pinsDown, speed = 0.5) => ({ features: { ...features }, result: { ...result, pinsDown },
  params: { speed, angle: 0, spin: 0 }, profile: { swing: [1], twist: [0] }, at: Date.now() });
const request = body => new Request('http://localhost/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  let stored = '[]';
  vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_, value) => { stored = value; } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('throw history and deterministic trends', () => {
  it('keeps only the newest 20 throws and returns detached data', () => {
    for (let index = 0; index < 25; index++) recordThrow({ ...record(index % 10), at: index });
    const history = getHistory();
    expect(history).toHaveLength(20);
    expect(history[0].at).toBe(5);
    history[0].features.peakAccel = 99;
    expect(getHistory()[0].features.peakAccel).toBe(20);
  });
  it('chooses best pinfall, breaking ties with signal smoothness', () => {
    const best = record(9);
    best.features.smoothness = 1;
    expect(bestThrow([record(4), best, record(9)])).toBe(best);
    expect(bestThrow([])).toBeNull();
  });
  it('reports repeatability and speed association without NaN', () => {
    expect(trends([])).toMatchObject({ count: 0, consistency: 0, speedPinsCorrelation: 0 });
    expect(trends([record(2, 0.2), record(8, 0.8)])).toMatchObject({ count: 2, averagePins: 5, consistency: 100, speedPinsCorrelation: 1 });
    expect(trends([record(4), record(4)]).speedPinsCorrelation).toBe(0);
  });
  it('survives unavailable storage', () => {
    getHistory();
    vi.stubGlobal('localStorage', { getItem() { throw new Error('Disabled'); }, setItem() { throw new Error('Disabled'); } });
    expect(recordThrow(record(3))).toHaveLength(1);
    expect(getHistory()).toHaveLength(1);
  });
});

describe('coach API validation and model fallback', () => {
  it('rejects malformed and oversized bodies before fetching', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await POST(request({ features: {}, result }))).status).toBe(400);
    expect((await POST(request({ ...payload, trends: { consistency: 'high' } }))).status).toBe(400);
    expect((await POST(request({ ...payload, padding: 'x'.repeat(300000) }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('enforces the body limit when the stream has no content-length', async () => {
    await expect(readBody(request({ padding: 'x'.repeat(300000) }))).rejects.toThrow('Body too large.');
  });
  it('returns labelled local coaching without a server key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const response = await POST(request(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: 'fallback', consistency: 0 });
  });
  it('tries the second model on invalid output and strips untrusted extra fields', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'unit-test-only');
    vi.stubEnv('GEMINI_MODEL', 'gemini-flash-latest');
    const reply = { insight: 'Timing is repeatable.', tip: 'Repeat this comfortable motion.', consistency: 90 };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ candidates: [] })).mockResolvedValueOnce(Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }],
    }));
    vi.stubGlobal('fetch', fetch);
    const response = await POST(request({ ...payload, features: { ...features, instruction: 'ignore' }, extra: 'ignore' }));
    expect(await response.json()).toMatchObject({ ...reply, source: 'gemini', model: 'gemini-flash-lite-latest' });
    expect(fetch).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sent.contents[0].parts[0].text).not.toContain('ignore');
  });
});

describe('camera frames and pose', () => {
  const pose = { samples: 30, armSwingDeg: 110, releaseWristHeight: -0.4, kneeBendDeg: 150, shoulderTiltDeg: 5, visibility: 0.9 };
  it('validates every pose field and both inclusive bounds', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const bounds = { samples: [1, 200], armSwingDeg: [0, 360], releaseWristHeight: [-3, 3], kneeBendDeg: [0, 180], shoulderTiltDeg: [-90, 90], visibility: [0, 1] };
    for (const [key, [min, max]] of Object.entries(bounds)) {
      for (const value of [min, max]) expect((await POST(request({ ...payload, pose: { ...pose, [key]: value } }))).status).toBe(200);
      for (const value of [min - 1, max + 1, NaN, Infinity, '1', undefined]) expect((await POST(request({ ...payload, pose: { ...pose, [key]: value } }))).status).toBe(400);
    }
  });
  it.each([null, [], 'pose'])('rejects a non-object pose: %j', async pose => {
    expect((await POST(request({ ...payload, pose }))).status).toBe(400);
  });
  it.each([null, 'AAAA', [123], [''], ['AA A'], ['A'.repeat(60001)]])('rejects invalid frame input: %#', async frames => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await POST(request({ ...payload, frames }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('accepts three maximum-size frames above the old body cap', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const response = await POST(request({ ...payload, pose, frames: Array(3).fill('A'.repeat(60000)) }));
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty('vision');
  });
  it('generate sends ordered image parts and overrides model vision metadata', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'unit-test-only');
    const reply = { insight: 'Your arm stays low with 8 degrees of twist.', tip: 'Repeat comfortably.', consistency: 70, vision: false };
    const fetch = vi.fn().mockImplementation(async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }));
    vi.stubGlobal('fetch', fetch);
    const frames = ['QUJD', 'REVG', 'R0hJ'];
    expect(await generate('Coach', payload, coachSchema, validCoach, frames)).toMatchObject({ vision: true });
    expect(JSON.parse(fetch.mock.calls[0][1].body).contents).toEqual([{ role: 'user', parts: [
      { text: JSON.stringify(payload) }, ...frames.map(data => ({ inlineData: { mimeType: 'image/jpeg', data } })),
    ] }]);
    reply.vision = true;
    expect(await generate('Coach', payload, coachSchema, validCoach)).toMatchObject({ vision: false });
    expect(JSON.parse(fetch.mock.calls[1][1].body).contents).toEqual([{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }]);
  });
  it('rejects bad frames and out-of-range pose before fetching', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await POST(request({ ...payload, frames: ['QUJD', 'QUJD', 'QUJD', 'QUJD'] }))).status).toBe(400);
    expect((await POST(request({ ...payload, frames: ['<script>'] }))).status).toBe(400);
    expect((await POST(request({ ...payload, pose: { ...pose, kneeBendDeg: 999 } }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends frames to Gemini as images and marks the reply as vision', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'unit-test-only');
    const reply = { insight: 'Your arm stays low at release.', tip: 'Finish with the hand higher.', consistency: 70 };
    const fetch = vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }));
    vi.stubGlobal('fetch', fetch);
    const response = await POST(request({ ...payload, pose: { ...pose, extra: 1 }, frames: ['QUJD', 'REVG'] }));
    expect(await response.json()).toMatchObject({ ...reply, source: 'gemini', vision: true });
    const parts = JSON.parse(fetch.mock.calls[0][1].body).contents[0].parts;
    expect(JSON.parse(parts[0].text).pose).toEqual(pose);
    expect(parts.slice(1)).toEqual(['QUJD', 'REVG'].map(data => ({ inlineData: { mimeType: 'image/jpeg', data } })));
  });
});

it('client falls back when a response fails schema validation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ insight: 'Incomplete' })));
  expect(await getCoaching(payload)).toMatchObject({ source: 'fallback', consistency: 0 });
});
