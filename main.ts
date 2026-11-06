/**
 * coinwatch-proxy-deno.ts — CoinWatch proxy for Deno Deploy
 *
 * Deploy steps (free, no credit card):
 *   1. Push this file to a GitHub repo (any name, e.g. coinwatch-proxy).
 *   2. Go to https://dash.deno.com → New Project → Deploy from GitHub.
 *   3. Select the repo; set the entry-point to this file.
 *   4. Click Deploy.  Deno gives you a URL like:
 *        https://your-project-name.deno.dev
 *   5. In coinwatch.html, change PROXY_URL to:
 *        https://your-project-name.deno.dev/binance
 *      and update the /ping fetch URL to:
 *        https://your-project-name.deno.dev/ping
 *
 * Security notes:
 *   - Use a Read-Only Binance API key (no trading / withdrawal permissions).
 *   - The secret is sent from the browser to this proxy over HTTPS.
 *   - This proxy does NOT log or store your credentials.
 *   - You can lock down the ALLOWED_ORIGIN below to your exact hosted URL
 *     (or leave "*" while testing from a local HTML file).
 */

// ── Optional: restrict to your exact origin ───────────────────────────────
// e.g. "https://my-coinwatch.netlify.app"  or keep "*" for open access.
const ALLOWED_ORIGIN = "*";

// ── CORS headers sent on every response ──────────────────────────────────
function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

// ── HMAC-SHA-256 (Web Crypto — available in Deno Deploy) ─────────────────
async function hmacSHA256(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Main handler ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // CORS pre-flight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Health check — used by coinwatch.html to detect the proxy
  if (req.method === "GET" && url.pathname === "/ping") {
    return json({ ok: true, proxy: "CoinWatch Deno proxy", version: "1.0" });
  }

  // Signed Binance request
  if (req.method === "POST" && url.pathname === "/binance") {
    let body: {
      endpoint?: string;
      params?: Record<string, string | number>;
      apiKey?: string;
      apiSecret?: string;
    };

    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { endpoint, params = {}, apiKey, apiSecret } = body;

    if (!endpoint || !apiKey || !apiSecret) {
      return json({ error: "Missing endpoint, apiKey or apiSecret" }, 400);
    }

    // Build signed query string
    const ts = Date.now();
    const qParts = Object.entries({ ...params, timestamp: ts })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    const signature = await hmacSHA256(apiSecret, qParts);
    const fullQuery = `${qParts}&signature=${signature}`;

    const binanceUrl = `https://api.binance.com${endpoint}?${fullQuery}`;

    let binanceRes: Response;
    try {
      binanceRes = await fetch(binanceUrl, {
        headers: { "X-MBX-APIKEY": apiKey },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: `Binance request failed: ${msg}` }, 502);
    }

    const data = await binanceRes.json().catch(() => ({}));
    return json(data, binanceRes.status);
  }

  return json({ error: "Not found" }, 404);
});
