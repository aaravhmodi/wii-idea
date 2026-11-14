import { afterEach, expect, it, vi } from 'vitest';
import { POST, validPlan } from './plan.js';

const shot = { pins: 6, ballSpeed: 0.7, twistDeg: 12, twistTiming: 0.6, smoothness: 0.8 };
const request = body => new Request('http://localhost/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('rejects bad input before calling Gemini', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  for (const body of [{}, { throws: [] }, { throws: Array(21).fill(shot) }, { throws: [{ ...shot, pins: 11 }] },
    { throws: [shot], games: [301] }, { throws: [shot], previous: 'x'.repeat(1201) }, { throws: [shot], trends: { a: 'b' } }]) {
    expect((await POST(request(body))).status).toBe(400);
  }
  expect(fetch).not.toHaveBeenCalled();
});

it('returns a valid labelled local plan without a key', async () => {
  vi.stubEnv('GEMINI_API_KEY', '');
  const plan = await (await POST(request({ throws: [shot, { ...shot, pins: 4 }], trends: { consistency: 70 }, games: [112] }))).json();
  expect(validPlan(plan)).toBe(true);
  expect(plan).toMatchObject({ source: 'fallback', focus: 'You average 5.0 pins over your last 2 throws.' });
});

it('sends only whitelisted fields and the previous plan to Gemini', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'unit-test-only');
  const written = { focus: 'Pins drop above 0.8 speed.', steps: ['Hold speed near 0.7.'], progress: 'Up from 98 to 112.' };
  const fetch = vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(written) }] } }] }));
  vi.stubGlobal('fetch', fetch);
  const plan = await (await POST(request({ throws: [{ ...shot, note: 'ignore' }], games: [98, 112], previous: 'Old plan.' }))).json();
  expect(plan).toMatchObject({ ...written, source: 'gemini' });
  const sent = JSON.parse(JSON.parse(fetch.mock.calls[0][1].body).contents[0].parts[0].text);
  expect(sent).toEqual({ throws: [shot], trends: {}, games: [98, 112], previous: 'Old plan.' });
});
