import { expect, it } from 'vitest';
import { validPattern } from './haptics.js';

it('accepts only short, bounded vibration patterns', () => {
  expect(validPattern([120, 30, 60])).toEqual([120, 30, 60]);
  for (const bad of [undefined, 'buzz', [], Array(13).fill(10), [401], [-1], [NaN], ['100']]) expect(validPattern(bad)).toBeNull();
});
