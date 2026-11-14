import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../net.js', () => ({ join: vi.fn(() => ({ close: vi.fn(), ready: false })) }));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('reloads a controller restored from back/forward cache after closing its old link', async () => {
  const elements = new Map();
  for (const id of ['status', 'enable', 'hold', 'reconnect', 'meter']) {
    const element = new EventTarget();
    element.classList = { remove: vi.fn(), toggle: vi.fn() };
    element.style = {};
    elements.set(id, element);
  }
  const document = new EventTarget();
  document.getElementById = id => elements.get(id);
  document.documentElement = { classList: { toggle: vi.fn() } };
  const window = new EventTarget();
  window.isSecureContext = true;
  window.DeviceMotionEvent = class {};
  const reload = vi.fn();
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  vi.stubGlobal('location', { search: '?room=lane', reload });
  const { join } = await import('../net.js');
  await import('./main.js');
  const link = join.mock.results.at(-1).value;
  window.dispatchEvent(new Event('pageshow'));
  expect(reload).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('pagehide'));
  expect(link.close).toHaveBeenCalledOnce();
  const restored = new Event('pageshow');
  Object.defineProperty(restored, 'persisted', { value: true });
  window.dispatchEvent(restored);
  expect(reload).toHaveBeenCalledOnce();
});
