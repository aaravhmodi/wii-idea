import { describe, it, expect } from 'vitest';
import { BowlingScore, validateDrill } from './scoring.js';
const play = rolls => { const s = new BowlingScore(); rolls.forEach(r => s.add(r)); return s; };
describe('ten-pin scoring', () => {
  it('scores a perfect game and closes at twelve rolls', () => { const s = play(Array(12).fill(10)); expect(s.total).toBe(300); expect(s.complete).toBe(true); expect(() => s.add(0)).toThrow(); });
  it('scores every spare and bonus', () => { const s = play([...Array(20).fill(5), 5]); expect(s.total).toBe(150); expect(s.complete).toBe(true); });
  it('scores open frames', () => { expect(play(Array(20).fill(4)).total).toBe(80); });
  it('counts zero then ten as a spare, not a strike', () => { const s = play([0]); const r = s.add(10); expect(r.strike).toBe(false); expect(r.spare).toBe(true); });
  it('keeps unresolved bonuses pending', () => { const s = play([10, 3]); expect(s.total).toBe(0); s.add(4); expect(s.total).toBe(24); });
  it('keeps the remaining rack after a tenth-frame strike then nonstrike', () => { const s = play([...Array(18).fill(0), 10, 7]); expect(s.standing).toBe(3); expect(() => s.add(4)).toThrow(); expect(s.add(3).spare).toBe(true); expect(s.total).toBe(20); });
  it('resets the rack after a tenth-frame spare or double', () => { expect(play([...Array(18).fill(0), 4, 6]).standing).toBe(10); expect(play([...Array(18).fill(0), 10, 10]).standing).toBe(10); });
  it('rejects impossible pins and completes a gutter game', () => { const s = play(Array(20).fill(0)); expect(s.complete).toBe(true); expect(s.total).toBe(0); expect(() => play([9, 2])).toThrow(); expect(() => play([NaN])).toThrow(); expect(() => play([1.5])).toThrow(); });
});
it('allows only bounded drill settings', () => {
  expect(validateDrill({ title: 'Precision', laneWidth: .7, targetSide: -.5 })).toEqual({ title: 'Precision', laneWidth: .7, targetSide: -.5 });
  expect(() => validateDrill({ title: 'Bad', laneWidth: 0, targetSide: 0 })).toThrow();
  expect(() => validateDrill({ title: 'Bad', laneWidth: 1, targetSide: NaN })).toThrow();
});
