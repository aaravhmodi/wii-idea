import { afterEach, expect, it, vi } from 'vitest';
import { POST } from './adapt.js';
import { validAdaptation } from '../src/coach/schema.js';

const sample = { durationMs: 800, peakAccel: 4, peakRot: 60, twistDeg: 25, twistTiming: 0.5, smoothness: 0.9 };
const request = body => new Request('http://localhost/api/adapt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('rejects bad input before calling Gemini', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  for (const body of [{}, { samples: [] }, { samples: Array(11).fill(sample) }, { samples: [{ ...sample, peakAccel: 'big' }] },
    { samples: [sample], pins: [3, 4] }, { samples: [sample], request: 'x'.repeat(301) }, { samples: [sample], trends: { a: 'b' } }]) {
    expect((await POST(request(body))).status).toBe(400);
  }
  expect(fetch).not.toHaveBeenCalled();
});

it('falls back to a valid local adaptation without a key, choosing gentle mode for small movements', async () => {
  vi.stubEnv('GEMINI_API_KEY', '');
  const reply = await (await POST(request({ samples: [sample, sample], pins: [2, 3], request: 'only my wrist' }))).json();
  expect(validAdaptation(reply)).toBe(true);
  expect(reply).toMatchObject({ source: 'fallback', mapping: { mode: 'gentle' } });
});

it('sends only whitelisted fields to Gemini and returns its adaptation', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'unit-test-only');
  const adaptation = { mapping: { gain: 3, twistGain: 0.5, mode: 'gentle' }, drill: { title: 'Steady twist', instruction: 'Repeat the same twist.', laneWidth: 1, targetSide: 0 },
    rationale: 'Small movements now throw at full speed.', evidence: ['Peak acceleration 4 m/s².'] };
  const fetch = vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(adaptation) }] } }] }));
  vi.stubGlobal('fetch', fetch);
  const reply = await (await POST(request({ samples: [{ ...sample, note: 'ignore me' }], request: ' twist only ' }))).json();
  expect(reply).toMatchObject({ ...adaptation, source: 'gemini' });
  const sent = JSON.parse(JSON.parse(fetch.mock.calls[0][1].body).contents[0].parts[0].text);
  expect(sent).toEqual({ samples: [sample], pins: [], trends: {}, request: 'twist only' });
});
