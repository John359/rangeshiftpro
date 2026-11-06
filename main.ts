// CoinWatch proxy for Deno Deploy
// POST /binance  -- signs and forwards requests to Binance
// GET  /ping     -- health check used by coinwatch.html

const ALLOWED_ORIGIN = "*";

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

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method === "GET" && url.pathname === "/ping") {
    return json({ ok: true, proxy: "CoinWatch Deno proxy", version: "1.0" });
  }

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
