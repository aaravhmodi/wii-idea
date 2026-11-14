import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { POST } from '../api/coach.js';

Object.assign(process.env, parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')));
const body = {
  features: { durationMs: 1000, peakAccel: 12, peakRot: 140, twistDeg: 8, twistTiming: 0.5, smoothness: 0.8 },
  result: { pinsDown: 7, frame: 1, roll: 1, strike: false, spare: false },
  trends: { count: 1 },
};
const response = await POST(new Request('http://localhost/api/coach', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));
const reply = await response.json();
console.log(JSON.stringify({ status: response.status, ...reply }));
if (reply.source !== 'gemini') process.exitCode = 1;
