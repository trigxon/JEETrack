// /api/ai-insights — same-origin AI insights proxy (Vercel serverless).
//
// WHY THIS EXISTS (owner report #20: "that Ai is not working"): the
// Supabase edge function supabase/functions/ai-insights returns a blanket
// 502 "AI service unavailable. Try again." whenever its Groq call fails —
// and it has been failing persistently on live (verified 2026-11-01 with a
// real authenticated session: HTTP 502 x3, 0.4-1.3s each, while
// status.groq.com reports 100% uptime and openai/gpt-oss-120b is an
// active, non-deprecated model). The edge function's Groq key/model is
// server-side state we cannot inspect or rotate from the repo — but the
// Vercel project's env vars ARE the deploy surface we control end-to-end
// via git push.
//
// DESIGN:
//   - Auth: the caller's Supabase access token is verified against
//     ${SUPABASE_URL}/auth/v1/user (same check the edge function performs
//     with supabase.auth.getUser) using SUPABASE_ANON_KEY — both already
//     present in Vercel env (see api/config.js).
//   - Key source: GROQ_API_KEY from THIS project's env. When set, AI
//     insights works with zero Supabase involvement. When unset the route
//     answers 503 {configured:false} and the dashboard transparently falls
//     back to the Supabase edge function (the previous — currently broken —
//     path), so shipping this route can never make things worse.
//   - Robustness: one retry on 429/5xx (quota blips), a model fallback
//     (openai/gpt-oss-120b -> openai/gpt-oss-20b on model-level errors),
//     and provider_status surfaced in error JSON for honest diagnosis.
//   - Prompt rules identical to the edge function: JSON string, 10..8000
//     chars, >=10 after trim. Response body on success is the raw Groq
//     completion payload ({choices:[{message:{content}}]}) so the existing
//     frontend parser works unchanged.
//
// To enable on Vercel: Settings -> Environment Variables -> add
//   GROQ_API_KEY = <a fresh key from console.groq.com/keys>
// then Redeploy. (Free Groq tier: 1000 req/day is plenty for this app.)

export const maxDuration = 60;

const MODEL_PRIMARY = 'openai/gpt-oss-120b';
const MODEL_FALLBACK = 'openai/gpt-oss-20b';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: { message: 'Server misconfigured' } });
  }

  // 1. session check — reject before spending an AI call
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!who.ok) {
      return res.status(401).json({ error: { message: 'Invalid session. Please sign in again.' } });
    }
    const user = await who.json();
    if (!user || !user.id) {
      return res.status(401).json({ error: { message: 'Invalid session. Please sign in again.' } });
    }
  } catch {
    return res.status(401).json({ error: { message: 'Invalid session. Please sign in again.' } });
  }

  // 2. prompt validation (edge-function parity)
  let prompt;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    prompt = body && body.prompt;
    if (typeof prompt !== 'string' || prompt.trim().length < 10) throw new Error('bad');
    if (prompt.length > 8000) {
      return res.status(413).json({ error: { message: 'Prompt too long' } });
    }
  } catch {
    return res.status(400).json({ error: { message: 'Invalid request body' } });
  }

  // 3. key present? if not, tell the client to use the Supabase path
  if (!GROQ_API_KEY) {
    return res
      .status(503)
      .json({ configured: false, error: { message: 'AI key not configured on this server.' } });
  }

  // 4. call Groq — retry once on transient failures, fall back model once
  const call = (model) =>
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 2200,
        temperature: 0.65,
        reasoning_effort: 'low',
        include_reasoning: false,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an expert JEE coaching analyst. Always respond with valid JSON only. No markdown fences, no preamble, no explanation — just the raw JSON object.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

  let lastStatus = 0;
  let lastErrBody = '';
  for (let model of [MODEL_PRIMARY, MODEL_FALLBACK]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let groqRes;
      try {
        groqRes = await call(model);
      } catch (e) {
        lastStatus = 0; // network fault between Vercel and Groq
        lastErrBody = String(e && e.message ? e.message : e);
        continue; // retry same model once
      }
      lastStatus = groqRes.status;
      if (groqRes.ok) {
        const data = await groqRes.json();
        return res.status(200).json(data);
      }
      lastErrBody = (await groqRes.text().catch(() => '')).slice(0, 300);
      // 401/403 = key problem -> the fallback model cannot help, stop early
      if (groqRes.status === 401 || groqRes.status === 403) attempt = 2;
      // 400/404 = model-level problem -> try the fallback model, no retry
      if (groqRes.status === 400 || groqRes.status === 404) break;
    }
  }

  console.error('[ai-insights] Groq failed:', lastStatus, lastErrBody);
  return res.status(502).json({
    configured: true,
    provider_status: lastStatus,
    error: { message: 'AI service unavailable. Try again.' },
  });
}
