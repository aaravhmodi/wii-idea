import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtures from '../fixtures/swings.json';

const mocks = vi.hoisted(() => ({
  createGame: vi.fn(), createSwingLab: vi.fn(), host: vi.fn(), drawQR: vi.fn(),
  getCoaching: vi.fn(), recordThrow: vi.fn(),
}));
vi.mock('./game/index.js', () => ({ createGame: mocks.createGame }));
vi.mock('./ui/swinglab.js', () => ({ createSwingLab: mocks.createSwingLab }));
vi.mock('./camera/index.js', () => ({ createCamera: () => ({ active: false }) }));
vi.mock('./net.js', () => ({ host: mocks.host }));
vi.mock('./controller/qr.js', () => ({ drawQR: mocks.drawQR }));
vi.mock('./coach/index.js', () => ({
  getCoaching: mocks.getCoaching, recordThrow: mocks.recordThrow,
  getHistory: () => [], bestThrow: () => null, trends: () => ({ count: 0 }),
}));

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const result = { pinsDown: 7, frame: 1, roll: 1, strike: false, spare: false, total: 0 };
const reply = { insight: 'Repeatable timing.', tip: 'Repeat that movement.', consistency: 80 };
let game, lab, elements, phoneHandler;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  game = {
    busy: false, score: { complete: false },
    throwBall: vi.fn().mockResolvedValue(result),
    reset: vi.fn(() => { game.score.complete = false; }),
  };
  lab = { show: vi.fn(), setCoach: vi.fn(), reset: vi.fn() };
  elements = Object.fromEntries(['game', 'lab', 'status', 'newgame', 'qr', 'url'].map(id => [id, {
    disabled: false, textContent: '', listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
  }]));
  vi.stubGlobal('document', { getElementById: id => elements[id] });
  vi.stubGlobal('window', {});
  mocks.createGame.mockReturnValue(game);
  mocks.createSwingLab.mockReturnValue(lab);
  mocks.host.mockImplementation(handler => {
    phoneHandler = handler;
    return Promise.resolve({ url: 'https://example.com/controller.html?room=test' });
  });
  mocks.drawQR.mockResolvedValue(undefined);
  mocks.getCoaching.mockResolvedValue(reply);
  await import('./main.js');
  await flush();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('phone-to-game integration', () => {
  it('releases the phone after the roll while coaching is still pending', async () => {
    const roll = deferred(), coach = deferred();
    game.throwBall.mockReturnValueOnce(roll.promise);
    mocks.getCoaching.mockReturnValueOnce(coach.promise);
    let settled = false;
    const handling = phoneHandler(fixtures.straight).then(value => { settled = true; return value; });
    expect(elements.newgame.disabled).toBe(true);
    expect(mocks.getCoaching).not.toHaveBeenCalled();
    roll.resolve(result);
    await flush();
    expect(settled).toBe(true);
    expect(await handling).toBe(result);
    expect(elements.newgame.disabled).toBe(false);
    expect(mocks.recordThrow).toHaveBeenCalledWith(expect.objectContaining({ result }));
    expect(lab.setCoach).not.toHaveBeenCalledWith(reply);
    coach.resolve(reply);
    await flush();
    expect(lab.setCoach).toHaveBeenLastCalledWith(reply);
  });

  it('ignores an old coaching response after starting a new game', async () => {
    const coach = deferred();
    mocks.getCoaching.mockReturnValueOnce(coach.promise);
    await phoneHandler(fixtures.straight);
    elements.newgame.listeners.click();
    expect(game.reset).toHaveBeenCalledOnce();
    expect(lab.reset).toHaveBeenCalledOnce();
    coach.resolve(reply);
    await flush();
    expect(lab.setCoach).not.toHaveBeenCalledWith(reply);
  });

  it('keeps the newest throw coaching when responses arrive out of order', async () => {
    const oldCoach = deferred(), newCoach = deferred();
    const newest = { ...reply, insight: 'Latest throw.' };
    mocks.getCoaching.mockReturnValueOnce(oldCoach.promise).mockReturnValueOnce(newCoach.promise);
    await phoneHandler(fixtures.straight);
    await phoneHandler(fixtures.fast);
    newCoach.resolve(newest);
    await flush();
    oldCoach.resolve(reply);
    await flush();
    expect(lab.setCoach).toHaveBeenLastCalledWith(newest);
    expect(lab.setCoach).not.toHaveBeenCalledWith(reply);
  });

  it('starts another game when a valid phone swing arrives after frame ten', async () => {
    game.score.complete = true;
    game.throwBall.mockImplementation(async () => {
      expect(game.score.complete).toBe(false);
      return result;
    });
    await expect(phoneHandler(fixtures.straight)).resolves.toBe(result);
    expect(game.reset).toHaveBeenCalledOnce();
    expect(game.throwBall).toHaveBeenCalledOnce();
    expect(mocks.recordThrow).toHaveBeenCalledOnce();
  });
});
