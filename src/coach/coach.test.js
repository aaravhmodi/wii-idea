import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../api/coach.js';
import { bestThrow, getCoaching, getHistory, recordThrow, trends } from './index.js';
import { readBody } from './server.js';

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
    expect((await POST(request({ ...payload, padding: 'x'.repeat(17000) }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('enforces the body limit when the stream has no content-length', async () => {
    await expect(readBody(request({ padding: 'x'.repeat(17000) }))).rejects.toThrow('Body too large.');
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

it('client falls back when a response fails schema validation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ insight: 'Incomplete' })));
  expect(await getCoaching(payload)).toMatchObject({ source: 'fallback', consistency: 0 });
});
