// 📁 FILE LOCATION: supabase/functions/verify-razorpay-payment/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Verifies a Razorpay payment signature server-side (never trust the client's
// word that a payment succeeded). Requires RAZORPAY_KEY_SECRET as a secret.
//
// SECURITY MODEL (2026-10-18 audit):
//  1. Signature: HMAC-SHA256 of `order_id|payment_id` with the key secret —
//     only Razorpay (on a real checkout success) can produce it.
//  2. Amount: the client-reported amount is NEVER trusted for the DB write.
//     We fetch the payment from Razorpay's API and store THAT amount/status.
//     If the fetch fails we fall back to signature-verified state (status
//     paid + client amount) and rely on razorpay-webhook to overwrite with
//     the authoritative values seconds later.
//  3. user_id: taken from the caller's Supabase JWT (sb.functions.invoke
//     attaches it automatically) — never from the request body, so a payer
//     cannot attribute their donation to someone else's account. Guests
//     (no/invalid JWT) write user_id NULL.
//  4. note: optional 200-char supporter message, now actually persisted
//     (it was collected by the UI and silently dropped before the audit).
//
// SPEED: signature verification is pure crypto (no network) and the response
// is sent back the moment that's done — the Razorpay payment fetch + the
// `donations` write happen via EdgeRuntime.waitUntil() AFTER the response is
// returned, so the client never waits on them. The badge tier returned here
// is a fast client-side computation from the amount; the client separately
// re-checks for the true PERMANENT (highest-ever) tier a couple seconds
// later via check-payment-status.
//
// email is stored so a guest supporter (user_id null) can later claim this
// row by signing in with the same address (see claim_guest_donations()).
//
// razorpay-webhook is still the redundant source-of-truth write (fires from
// Razorpay's servers even if this function's background write or the user's
// browser fails for any reason).

const ALLOWED_ORIGINS = ["https://jee-adv-osint.vercel.app"];

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function tierForAmount(amount: number): string {
  if (amount >= 999) return "Elite Supporter";
  if (amount >= 499) return "Gold Supporter";
  if (amount >= 199) return "Silver Supporter";
  if (amount >= 99) return "Bronze Supporter";
  return "Supporter";
}

// Same per-IP pattern as create-razorpay-order — see that file for the
// fuller comments on why (no auth requirement here, so IP is the only
// identity signal; fails open on error so a transient blip can't block
// real payments; Upstash Redis instead of Postgres to keep this public,
// no-auth endpoint's traffic off the free-tier Database IO budget).
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}

const RATE_LIMIT_SCRIPT = "local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return c";

async function checkRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const upstashUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const upstashToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (!upstashUrl || !upstashToken) return true;
  try {
    const res = await fetch(upstashUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EVAL", RATE_LIMIT_SCRIPT, "1", key, String(windowSeconds)]),
    });
    if (!res.ok) return true;
    const { result } = await res.json();
    return result <= max;
  } catch {
    return true;
  }
}

// Derive the caller's user id from their Supabase JWT (Authorization header
// attached automatically by sb.functions.invoke). Returns null for guests or
// invalid/expired tokens — the request body's user_id is deliberately
// ignored, since that would let anyone attribute a payment to any account.
async function userIdFromJwt(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const jwt = authHeader.slice(7).trim();
  if (!jwt) return null;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anonKey) return null;
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { "Authorization": `Bearer ${jwt}`, "apikey": anonKey },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const allowed = await checkRateLimit(`razorpay-verify:${clientIp(req)}`, 40, 3600);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
      display_name,
      show_publicly,
      email,
      note,
    } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ verified: false, error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keySecret) {
      return new Response(JSON.stringify({ verified: false, error: "Payments are not configured yet" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(keySecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(`${razorpay_order_id}|${razorpay_payment_id}`)
    );
    const expectedSignature = toHex(sigBuffer);
    const verified = expectedSignature === razorpay_signature;

    // ── Background work (after the response): authoritative fetch + DB write ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceKey) {
      const writePromise = (async () => {
        // Server-derived identity (never trust body.user_id — see above).
        const serverUserId = await userIdFromJwt(req);

        // Authoritative amount/status from Razorpay's own API.
        let dbAmount: number | null = typeof amount === "number" && amount > 0 ? amount : null;
        let dbStatus = verified ? "paid" : "signature_mismatch";
        try {
          const auth = btoa(`${Deno.env.get("RAZORPAY_KEY_ID")}:${keySecret}`);
          const payRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`, {
            headers: { "Authorization": `Basic ${auth}` },
          });
          if (payRes.ok) {
            const pay = await payRes.json();
            if (pay?.order_id && pay.order_id !== razorpay_order_id) {
              dbStatus = "order_mismatch";
            } else if (verified) {
              dbStatus = pay.status === "captured" ? "paid" : `payment_${pay.status ?? "unknown"}`;
            }
            if (typeof pay?.amount === "number") dbAmount = pay.amount / 100;
          }
        } catch (_e) {
          // Fetch failed — keep signature-derived state; webhook will correct.
        }

        const row: Record<string, unknown> = {
          user_id: serverUserId,
          amount: dbAmount,
          razorpay_order_id,
          razorpay_payment_id,
          status: dbStatus,
          display_name: typeof display_name === "string" ? display_name.slice(0, 60) : null,
          show_publicly: show_publicly !== false,
          email: typeof email === "string" ? email.slice(0, 120) : null,
          note: typeof note === "string" ? note.slice(0, 200) : null,
        };

        const res = await fetch(`${supabaseUrl}/rest/v1/donations?on_conflict=razorpay_payment_id`, {
          method: "POST",
          headers: {
            "apikey": serviceKey,
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(row),
        });
        if (!res.ok) {
          res.text().then((t) => console.error("donations background write failed:", res.status, t));
        }
      })();

      // @ts-ignore EdgeRuntime is a Supabase/Deno Deploy global, not in std types
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(writePromise);
      }
    }

    if (!verified) {
      return new Response(JSON.stringify({ verified: false, error: "Signature mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        verified: true,
        badge_tier: tierForAmount(amount || 0),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("verify-razorpay-payment error:", e);
    return new Response(JSON.stringify({ verified: false, error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
