// GET  /api/key-check — does the server have its own GEMINI_API_KEY? (never returns it)
// POST /api/key-check — validates the key that would be used for this request
//   (the X-Gemini-Api-Key header, else the server's key) with a minimal
//   generateContent call: a one-word "ping" and a tiny output limit.

import { type ApiRequest, type ApiResponse, HttpError, MISSING_KEY_ERROR, callGemini, resolveApiKey, resolveModel } from './_lib/gemini.js';

const TIMEOUT_MS = 55_000; // under Vercel's 60 s limit
const PING_MAX_OUTPUT_TOKENS = 16;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ serverKey: Boolean(process.env.GEMINI_API_KEY) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const resolved = resolveApiKey(req);
  if (!resolved) return res.status(200).json({ valid: false, source: null, error: MISSING_KEY_ERROR });

  try {
    // Any successful response proves the key works — even one cut off at the limit
    // The model picked in the app (or the default): checks the key can use it
    await callGemini({ apiKey: resolved.key, model: resolveModel(req), prompt: 'ping', maxOutputTokens: PING_MAX_OUTPUT_TOKENS, effort: 'minimal', timeoutMs: TIMEOUT_MS });
    return res.status(200).json({ valid: true, source: resolved.source });
  } catch (error) {
    if (error instanceof HttpError) {
      // 401 / 403: the key itself was rejected; anything else is a service problem
      const keyRejected = error.status === 401 || error.status === 403;
      return res.status(keyRejected ? 200 : error.status).json({ valid: false, source: resolved.source, error: error.message });
    }
    return res.status(502).json({ valid: false, source: resolved.source, error: String(error).slice(0, 200) });
  }
}
