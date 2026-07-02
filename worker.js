/**
 * IELTS Examiner — Cloudflare Worker proxy for the Gemini API.
 * Keeps the API key secret and adds a simple daily usage cap.
 *
 * Deploy:
 *   1. https://dash.cloudflare.com → Workers & Pages → Create Worker
 *   2. Paste this file, Deploy.
 *   3. Settings → Variables → add secret GEMINI_API_KEY (from https://aistudio.google.com/apikey)
 *   4. (Optional) create a KV namespace, bind it as USAGE to enable the daily cap.
 *   5. Put the worker URL into the app's Settings → "Worker URL".
 */

const ALLOWED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-preview-tts',
];
const DAILY_LIMIT = 400; // requests per IP per day (only enforced when KV bound)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (request.method !== 'POST' || !url.pathname.endsWith('/gemini')) {
      return json({ error: 'POST /gemini only' }, 404);
    }
    if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY secret is not set' }, 500);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
    const { model, payload } = body || {};
    if (!ALLOWED_MODELS.includes(model)) return json({ error: 'Model not allowed' }, 403);
    if (!payload || typeof payload !== 'object') return json({ error: 'Missing payload' }, 400);

    // optional daily cap per IP (requires KV binding named USAGE)
    if (env.USAGE) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const key = `u:${ip}:${new Date().toISOString().slice(0, 10)}`;
      const used = parseInt(await env.USAGE.get(key) || '0', 10);
      if (used >= DAILY_LIMIT) return json({ error: 'Daily practice limit reached. Try again tomorrow.' }, 429);
      await env.USAGE.put(key, String(used + 1), { expirationTtl: 90000 });
    }

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    );
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
