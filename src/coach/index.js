import { HISTORY_MAX } from '../shared/contract.js';
import { fallbackCoach, validCoach, validFeatures, validResult } from './schema.js';

const HISTORY_KEY = 'motionplay.throws.v1';
let memory = [];
const validRecord = record => record && validFeatures(record.features) && validResult(record.result)
  && Number.isFinite(record.at) && record.params && ['speed', 'angle', 'spin'].every(key => Number.isFinite(record.params[key]));
const recent = records => Array.isArray(records) ? records.filter(validRecord).slice(-HISTORY_MAX) : [];

export function getHistory() {
  try {
    const stored = globalThis.localStorage?.getItem(HISTORY_KEY);
    if (stored !== null && stored !== undefined) memory = recent(JSON.parse(stored));
  } catch { /* Storage can be disabled or contain data from an old version. */ }
  return structuredClone(memory);
}

export function recordThrow(record) {
  if (!validRecord(record)) throw new Error('Invalid throw record.');
  memory = recent([...getHistory(), structuredClone(record)]);
  try { globalThis.localStorage?.setItem(HISTORY_KEY, JSON.stringify(memory)); } catch { /* Keep an in-memory session. */ }
  return structuredClone(memory);
}

export function bestThrow(records = getHistory()) {
  return recent(records).reduce((best, record) => !best || record.result.pinsDown > best.result.pinsDown ||
    (record.result.pinsDown === best.result.pinsDown && record.features.smoothness > best.features.smoothness) ? record : best, null);
}

export function trends(records = getHistory()) {
  const history = recent(records);
  const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const averagePins = mean(history.map(record => record.result.pinsDown));
  const averageSpeed = mean(history.map(record => record.params.speed));
  const averageDurationMs = mean(history.map(record => record.features.durationMs));
  const coefficient = values => {
    const average = mean(values);
    return average ? Math.sqrt(mean(values.map(value => (value - average) ** 2))) / Math.abs(average) : 0;
  };
  const consistency = history.length < 2 ? 0 : Math.round(Math.max(0, 1 - (
    coefficient(history.map(record => record.features.durationMs)) +
    coefficient(history.map(record => record.features.peakAccel))) / 2) * 100);
  // Pearson correlation describes association, not whether speed caused pinfall.
  const covariance = history.reduce((sum, record) => sum + (record.params.speed - averageSpeed) * (record.result.pinsDown - averagePins), 0);
  const denominator = Math.sqrt(history.reduce((sum, record) => sum + (record.params.speed - averageSpeed) ** 2, 0)
    * history.reduce((sum, record) => sum + (record.result.pinsDown - averagePins) ** 2, 0));
  return { count: history.length, averagePins, averageSpeed, averageDurationMs, consistency,
    speedPinsCorrelation: denominator ? covariance / denominator : 0 };
}

export async function getCoaching(data) {
  try {
    const response = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), signal: AbortSignal.timeout(26000) });
    if (!response.ok) throw new Error('Coach unavailable.');
    const reply = await response.json();
    if (!validCoach(reply)) throw new Error('Invalid coach reply.');
    return reply;
  } catch { return fallbackCoach(data); }
}
