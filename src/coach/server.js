// Server-only: never import this module from browser code.
export const MAX_BODY_BYTES = 16 * 1024;
export const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export async function readBody(request) {
  if (request.method !== 'POST') throw new Error('Use POST.');
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('Expected application/json.');
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new Error('Body too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body.');
  const decoder = new TextDecoder();
  let size = 0, body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('Body too large.'); }
    body += decoder.decode(value, { stream: true });
  }
  return JSON.parse(body + decoder.decode());
}
export async function generate(prompt, data, schema, validate) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('AI unavailable.');
  const models = [...new Set([process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-flash-lite-latest'])];
  for (const model of models) {
    if (!/^[a-zA-Z0-9.-]+$/.test(model)) continue;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: AbortSignal.timeout(12000),
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(data) }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 1800, responseMimeType: 'application/json', responseJsonSchema: schema },
        }),
      });
      if (!response.ok) continue;
      const body = await response.json();
      const content = body.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('');
      const result = JSON.parse(content);
      if (validate(result)) return { ...result, source: 'gemini', model };
    } catch { /* Timeout, network or malformed output: try the fallback model. */ }
  }
  throw new Error('AI unavailable.');
}
