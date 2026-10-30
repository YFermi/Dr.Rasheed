// GET  /api/key-check — does the server have its own ANTHROPIC_API_KEY? (never returns it)
// POST /api/key-check — validates the key that would be used for this request
//   (the X-Anthropic-Api-Key header, else the server's key) by sending Claude a
//   one-word "ping" with a tiny max_tokens: a few tokens per test.

import { type ApiRequest, type ApiResponse, HttpError, MISSING_KEY_ERROR, callClaude, resolveApiKey } from './_lib/claude.js';

const TIMEOUT_MS = 20_000;
const PING_MAX_TOKENS = 32;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ serverKey: Boolean(process.env.ANTHROPIC_API_KEY) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const resolved = resolveApiKey(req);
  if (!resolved) return res.status(200).json({ valid: false, source: null, error: MISSING_KEY_ERROR });

  try {
    // Any HTTP 200 proves the key works — even a reply cut off at max_tokens
    await callClaude({ apiKey: resolved.key, prompt: 'ping', maxTokens: PING_MAX_TOKENS, effort: 'low', timeoutMs: TIMEOUT_MS });
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
