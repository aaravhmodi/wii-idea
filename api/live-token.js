import { GoogleGenAI } from '@google/genai';
import { json } from '../src/coach/server.js';

export const LIVE_MODEL = 'gemini-3.8-live';

// Mints a short-lived, single-use token so the browser can open a Gemini Live session
// without ever seeing the API key. The token only works for LIVE_MODEL.
// shortcut: the session's prompt and tools are set by the browser, not locked into the token; lock them
// with liveConnectConstraints.config if this is ever exposed beyond a demo.
export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'Voice coach unavailable.' }, 503);
  try {
    const client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
    const token = await client.authTokens.create({ config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
      liveConnectConstraints: { model: LIVE_MODEL },
      httpOptions: { apiVersion: 'v1alpha' },
    } });
    return json({ token: token.name, model: LIVE_MODEL });
  } catch { return json({ error: 'Voice coach unavailable.' }, 503); }
}
