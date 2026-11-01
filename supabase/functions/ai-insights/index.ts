

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// report #20 ("that Ai is not working"): the live function answered a
// blanket 502 "AI service unavailable. Try again." for every call while
// Groq itself was 100% up and openai/gpt-oss-120b is an active model —
// the blanket error hid WHICH leg failed (missing/revoked key vs
// quota vs model). This version: (a) distinct 503 when the key is not
// configured at all, (b) provider_status in the error body so the
// dashboard + logs can tell 401 (rotate the key) from 429 (quota,
// transient) from a real 5xx, (c) one retry on 429/5xx, (d) model
// fallback openai/gpt-oss-120b -> openai/gpt-oss-20b on model-level
// 400/404 (the pre-2026-07 source shipped llama-3.3-70b-versatile, a
// model Groq shut down on 2026-08-16 — a stale deploy of that version
// fails forever with the old blanket error).
const MODEL_PRIMARY = "openai/gpt-oss-120b";
const MODEL_FALLBACK = "openai/gpt-oss-20b";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL") || "https://jee-adv-osint.vercel.app",
  "https://jee-adv-osint.vercel.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: getCorsHeaders(req),
    });
  }


  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: getCorsHeaders(req),
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid session. Please sign in again." }), {
      status: 401, headers: getCorsHeaders(req),
    });
  }


  let prompt: string;
  try {
    const body = await req.json();
    prompt = body.prompt;
    if (!prompt || typeof prompt !== "string" || prompt.length < 10) {
      throw new Error("Invalid prompt");
    }
    if (prompt.length > 8000) {
      return new Response(JSON.stringify({ error: "Prompt too long" }), {
        status: 400, headers: getCorsHeaders(req),
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400, headers: getCorsHeaders(req),
    });
  }


  // hard diagnosis instead of a blanket failure: a missing key is a
  // config problem (503), not an availability problem (502)
  if (!GROQ_API_KEY) {
    return new Response(
      JSON.stringify({ configured: false, error: { message: "AI key not configured. Add GROQ_API_KEY to this function's secrets." } }),
      { status: 503, headers: getCorsHeaders(req) },
    );
  }

  const callGroq = (model: string) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2200,
        temperature: 0.65,
        reasoning_effort: "low",
        include_reasoning: false,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are an expert JEE coaching analyst. Always respond with valid JSON only. No markdown fences, no preamble, no explanation — just the raw JSON object.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

  try {
    let lastStatus = 0;
    let lastErrBody = "";
    for (const model of [MODEL_PRIMARY, MODEL_FALLBACK]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        let groqRes: Response;
        try {
          groqRes = await callGroq(model);
        } catch (e) {
          lastStatus = 0;
          lastErrBody = String(e);
          continue; // network fault — retry same model once
        }
        lastStatus = groqRes.status;
        if (groqRes.ok) {
          const data = await groqRes.json();
          return new Response(JSON.stringify(data), { headers: getCorsHeaders(req) });
        }
        lastErrBody = (await groqRes.text().catch(() => "")).slice(0, 300);
        // 401/403 = key problem — no model/retry can help, stop early
        if (groqRes.status === 401 || groqRes.status === 403) attempt = 2;
        // 400/404 = model-level problem — try the fallback model, no retry
        if (groqRes.status === 400 || groqRes.status === 404) break;
      }
    }

    console.error("Groq error:", lastStatus, lastErrBody);
    return new Response(
      JSON.stringify({
        configured: true,
        provider_status: lastStatus,
        error: { message: "AI service unavailable. Try again." },
      }),
      { status: 502, headers: getCorsHeaders(req) }
    );
  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response(
      JSON.stringify({ error: { message: "Something went wrong. Please try again." } }),
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
});
