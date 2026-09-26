import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Redis } from "https://esm.sh/@upstash/redis@1.28.3";
import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@1.0.1";
import { CircuitBreaker } from "../_shared/circuitBreaker.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
  'Access-Control-Expose-Headers': 'Server-Timing, X-Cache, Retry-After',
};

// ── Module-Scoped Singleton Clients & Persistent Ephemeral Caches ─────
const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
const redis = (redisUrl && redisToken) ? new Redis({ url: redisUrl, token: redisToken }) : null;

const globalCacheMap = new Map();
const userGlobalMinuteCacheMap = new Map();
const userGlobalDailyCacheMap = new Map();
const edgeBurstCacheMap = new Map();
const edgeDailyCacheMap = new Map();
const aiMinuteCacheMap = new Map();
const aiDailyCacheMap = new Map();

const globalLimit = parseInt(Deno.env.get('GLOBAL_LIMIT_PER_MINUTE') || '100', 10);
const userGlobalMinuteLimit = parseInt(Deno.env.get('USER_GLOBAL_LIMIT_PER_MINUTE') || '8', 10);
const userGlobalDailyLimit = parseInt(Deno.env.get('USER_GLOBAL_LIMIT_PER_DAY') || '20', 10);
const edgeBurstLimit = parseInt(Deno.env.get('EDGE_LIMIT_PER_MINUTE') || '8', 10);
const edgeDailyLimit = parseInt(Deno.env.get('EDGE_LIMIT_PER_DAY') || '16', 10);
const aiLimitMinute = parseInt(Deno.env.get('AI_EMBED_LIMIT_PER_MINUTE') || '5', 10);
const aiLimitDay = parseInt(Deno.env.get('AI_EMBED_LIMIT_PER_DAY') || '12', 10);

const globalLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(globalLimit, "1 m"),
  ephemeralCache: globalCacheMap,
  prefix: "ratelimit:global:log-exercise"
}) : null;

const userGlobalMinuteLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(userGlobalMinuteLimit, "1 m"),
  ephemeralCache: userGlobalMinuteCacheMap,
  prefix: "ratelimit:user:global:minute"
}) : null;

const userGlobalDailyLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(userGlobalDailyLimit, "1 d"),
  ephemeralCache: userGlobalDailyCacheMap,
  prefix: "ratelimit:user:global:day"
}) : null;

const edgeBurstLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(edgeBurstLimit, "1 m"),
  ephemeralCache: edgeBurstCacheMap,
  prefix: "ratelimit:burst:log-exercise"
}) : null;

const edgeDailyLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(edgeDailyLimit, "1 d"),
  ephemeralCache: edgeDailyCacheMap,
  prefix: "ratelimit:edge:log-exercise:day"
}) : null;

const aiMinuteLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(aiLimitMinute, "1 m"),
  ephemeralCache: aiMinuteCacheMap,
  prefix: "ratelimit:ai:exercise:minute"
}) : null;

const aiDayLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(aiLimitDay, "1 d"),
  ephemeralCache: aiDailyCacheMap,
  prefix: "ratelimit:ai:exercise:day"
}) : null;

const geminiBreaker = new CircuitBreaker({
  serviceName: 'gemini:log-exercise-embed',
  failureThreshold: 3,
  cooldownPeriodSeconds: 30,
  redis,
});

function parseDurationAndIntensity(text: string): { durationMinutes: number | null; detectedIntensity: 'light' | 'moderate' | 'vigorous' | null } {
  let durationMinutes: number | null = null;
  const lowerText = text.toLowerCase();

  // Check for phrases like "an hour", "half an hour", "a half hour"
  if (lowerText.match(/\b(half an hour|a half hour)\b/)) {
    durationMinutes = 30;
  } else if (lowerText.match(/\b(an hour|one hour)\b/)) {
    durationMinutes = 60;
  } else {
    // Check for hours + minutes: "1 hr 20 min", "1.5 hours", "2h 30m"
    const hourMinMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)\s*(?:and\s*)?(\d+)?\s*(?:mins?|minutes?|m\b)?/i);
    if (hourMinMatch) {
      const hours = parseFloat(hourMinMatch[1]) || 0;
      const mins = hourMinMatch[2] ? parseFloat(hourMinMatch[2]) : 0;
      durationMinutes = Math.round(hours * 60 + mins);
    } else {
      // Check for minutes only: "45 mins", "30 minutes", "20m"
      const minMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min\b|m\b)/i);
      if (minMatch) {
        durationMinutes = Math.round(parseFloat(minMatch[1]));
      }
    }
  }

  // Detect intensity keyword hints
  let detectedIntensity: 'light' | 'moderate' | 'vigorous' | null = null;
  if (lowerText.match(/\b(brisk|fast|hard|intense|vigorous|heavy|sprint|max|racing)\b/)) {
    detectedIntensity = 'vigorous';
  } else if (lowerText.match(/\b(slow|light|easy|casual|gentle|stroll|relaxed)\b/)) {
    detectedIntensity = 'light';
  } else if (lowerText.match(/\b(moderate|steady|normal|medium)\b/)) {
    detectedIntensity = 'moderate';
  }

  return { durationMinutes, detectedIntensity };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const t0 = performance.now();
  let tAuth = 0;
  let tParse = 0;
  let tCache = 0;
  let tRateLimit = 0;
  let tEmbed = 0;
  let tDb = 0;

  try {
    // ── 1. Early Request Size Check (Max 3MB) ────────────────────────
    const contentLength = req.headers.get("content-length");
    const maxSizeBytes = parseInt(Deno.env.get("MAX_REQUEST_SIZE_BYTES") || "3145728", 10);
    if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
      return new Response(
        JSON.stringify({ error: "Request payload is too large (maximum 3MB)." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Authentication ─────────────────────────────────────────────
    const tAuthStart = performance.now();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const accessToken = authorization.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    tAuth = Math.round(performance.now() - tAuthStart);

    // ── 3. Parse & Validate Input ─────────────────────────────────────
    const tParseStart = performance.now();
    const body = await req.json();
    const { text, weight = 70, idempotency_key } = body;
    const idempotencyId = req.headers.get('x-idempotency-key') || idempotency_key || null;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return new Response(
        JSON.stringify({ error: 'Please describe your workout.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (text.trim().length > 150) {
      return new Response(
        JSON.stringify({ error: 'Workout description is too long (maximum 150 characters).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    tParse = Math.round(performance.now() - tParseStart);

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown-ip';
    const identifier = `${user.id}:${ip}`;

    // ── 4. Idempotency Fast-Path Cache Check (Redis Lookup) ───────────
    const tCacheStart = performance.now();
    if (idempotencyId && redis) {
      try {
        const cached = await redis.get(`idempotent:log-exercise:${user.id}:${idempotencyId}`);
        if (cached) {
          tCache = Math.round(performance.now() - tCacheStart);
          const tTotal = Math.round(performance.now() - t0);
          console.log(`[log-exercise] [CACHE HIT] key: ${idempotencyId} | total: ${tTotal}ms`);
          const cachedData = typeof cached === 'string' ? JSON.parse(cached) : cached;
          return new Response(
            JSON.stringify({ success: true, data: cachedData, cached: true, timings: { total_ms: tTotal, cache_ms: tCache } }),
            { 
              status: 200, 
              headers: { 
                ...corsHeaders, 
                'Content-Type': 'application/json', 
                'X-Cache': 'HIT',
                'Server-Timing': `cache;dur=${tCache}, total;dur=${tTotal}`
              } 
            }
          );
        }
      } catch (cacheErr) {
        console.warn("log-exercise: Idempotency cache lookup failed:", cacheErr);
      }
    }
    tCache = Math.round(performance.now() - tCacheStart);

    // ── 5. Fetch User's Custom API Key (if any) ───────────────────────
    const tDbApiKeyStart = performance.now();
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    let customApiKey: string | null = null;
    const { data: modelData } = await supabaseAdmin
      .from('user_ai_settings')
      .select('custom_api_key')
      .eq('user_id', user.id)
      .maybeSingle();

    if (modelData?.custom_api_key && modelData.custom_api_key.trim()) {
      customApiKey = modelData.custom_api_key.trim();
    }
    tDb += Math.round(performance.now() - tDbApiKeyStart);

    // ── 6. Parallel Rate Limiting ─────────────────────────────────────
    const tRateLimitStart = performance.now();
    if (redis) {
      try {
        const [globalRes, userGlobalMinRes, userGlobalDayRes, burstRes, edgeDailyRes] = await Promise.all([
          globalLimiter ? globalLimiter.limit("global") : { success: true },
          userGlobalMinuteLimiter ? userGlobalMinuteLimiter.limit(identifier) : { success: true },
          userGlobalDailyLimiter ? userGlobalDailyLimiter.limit(identifier) : { success: true },
          edgeBurstLimiter ? edgeBurstLimiter.limit(identifier) : { success: true },
          edgeDailyLimiter ? edgeDailyLimiter.limit(identifier) : { success: true },
        ]);

        if (!globalRes.success) {
          const retryAfter = Math.ceil((globalRes.reset - Date.now()) / 1000);
          return new Response(
            JSON.stringify({ 
              error: "High server load. Please wait a moment before trying again.",
              retry_after_seconds: retryAfter,
              rate_limited: true
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": retryAfter.toString() } }
          );
        }

        if (!userGlobalMinRes.success) {
          const retryAfter = Math.ceil((userGlobalMinRes.reset - Date.now()) / 1000);
          return new Response(
            JSON.stringify({ 
              error: `Too many requests across app actions. Please wait ${retryAfter}s before trying again.`,
              retry_after_seconds: retryAfter,
              rate_limited: true
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": retryAfter.toString() } }
          );
        }

        if (!userGlobalDayRes.success) {
          const retryAfter = Math.ceil((userGlobalDayRes.reset - Date.now()) / 1000);
          const hours = Math.ceil(retryAfter / 3600);
          return new Response(
            JSON.stringify({ 
              error: `Daily limit reached across app actions (${userGlobalDailyLimit} requests/day). Resets in ${hours} hour${hours > 1 ? 's' : ''}.`,
              retry_after_seconds: retryAfter,
              rate_limited: true,
              is_daily_limit: true
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": retryAfter.toString() } }
          );
        }

        if (!burstRes.success) {
          const retryAfter = Math.ceil((burstRes.reset - Date.now()) / 1000);
          return new Response(
            JSON.stringify({ 
              error: `Too many requests. Please wait ${retryAfter}s before searching exercises again.`,
              retry_after_seconds: retryAfter,
              rate_limited: true
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": retryAfter.toString() } }
          );
        }

        if (!edgeDailyRes.success) {
          const retryAfter = Math.ceil((edgeDailyRes.reset - Date.now()) / 1000);
          const hours = Math.ceil(retryAfter / 3600);
          return new Response(
            JSON.stringify({ 
              error: `Daily exercise logging limit reached (${edgeDailyLimit} calls/day). Resets in ${hours} hour${hours > 1 ? 's' : ''}.`,
              retry_after_seconds: retryAfter,
              rate_limited: true,
              is_daily_limit: true
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": retryAfter.toString() } }
          );
        }
      } catch (burstErr) {
        console.warn("log-exercise: Edge rate limiter failed open:", burstErr);
      }
    }

    // ── 7. AI Specific Rate Limiting (For Free Tier Users) ────────────
    if (!customApiKey && aiMinuteLimiter && aiDayLimiter) {
      try {
        const [minuteRes, dayRes] = await Promise.all([
          aiMinuteLimiter.limit(identifier),
          aiDayLimiter.limit(identifier),
        ]);

        if (!minuteRes.success) {
          const retryAfter = Math.ceil((minuteRes.reset - Date.now()) / 1000);
          return new Response(
            JSON.stringify({ 
              error: `Exercise search limit reached (${aiLimitMinute} per minute). Please wait ${retryAfter}s before trying again.`,
              retry_after_seconds: retryAfter,
              rate_limited: true
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": retryAfter.toString() } }
          );
        }

        if (!dayRes.success) {
          const retryAfter = Math.ceil((dayRes.reset - Date.now()) / 1000);
          const hours = Math.ceil(retryAfter / 3600);
          return new Response(
            JSON.stringify({ 
              error: `You've reached your free daily limit of ${aiLimitDay} exercise searches. Resets in ${hours} hour${hours > 1 ? 's' : ''}, or add your own Gemini API key in Settings to use your personal quota.`,
              retry_after_seconds: retryAfter,
              rate_limited: true,
              is_daily_limit: true
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": retryAfter.toString() } }
          );
        }
      } catch (aiRateErr) {
        console.warn("log-exercise: AI rate limiter failed open:", aiRateErr);
      }
    }
    tRateLimit = Math.round(performance.now() - tRateLimitStart);

    const apiKey = customApiKey || Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY configuration");
    }
    console.log(`log-exercise: user=${user.id} usingKey=${customApiKey ? 'USER_CUSTOM_BYOK' : 'SERVER_DEFAULT'}`);

    // ── 8. Circuit Breaker Check ──────────────────────────────────────
    const circuitStatus = await geminiBreaker.check();
    if (!circuitStatus.allowed && circuitStatus.errorResponse) {
      return new Response(
        JSON.stringify(circuitStatus.errorResponse),
        { 
          status: 503, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json", 
            "Retry-After": circuitStatus.errorResponse.retry_after_seconds.toString() 
          } 
        }
      );
    }

    // ── 9. Parse Duration & Intensity Hints ───────────────────────────
    const { durationMinutes, detectedIntensity } = parseDurationAndIntensity(text);

    // ── 10. Generate Vector Embedding with gemini-embedding-001 ────────
    const tEmbedStart = performance.now();
    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;

    let embedResponse;
    try {
      embedResponse = await fetch(embedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: text.trim() }] },
          outputDimensionality: 768
        }),
      });
    } catch (fetchErr: any) {
      await geminiBreaker.recordFailure(503, fetchErr.message);
      throw new Error(`AI embedding connection error: ${fetchErr.message}`);
    }

    if (!embedResponse.ok) {
      const errText = await embedResponse.text();
      let niceError = "AI embedding service error";
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error && parsed.error.message) {
          niceError = parsed.error.message;
        }
      } catch (_e) {
        niceError = errText;
      }
      await geminiBreaker.recordFailure(embedResponse.status, niceError);
      throw new Error(niceError);
    }

    const embedData = await embedResponse.json();
    const embeddingValues = embedData.embedding?.values;
    if (!embeddingValues || !Array.isArray(embeddingValues)) {
      await geminiBreaker.recordFailure(502, "Empty embedding values response");
      throw new Error("Failed to generate vector embedding for workout description");
    }
    tEmbed = Math.round(performance.now() - tEmbedStart);
    await geminiBreaker.recordSuccess();

    // ── 11. Query match_activity_groups RPC in Supabase (pgvector) ────
    const tDbRpcStart = performance.now();
    const { data: candidates, error: rpcError } = await supabase.rpc('match_activity_groups', {
      query_embedding: `[${embeddingValues.join(',')}]`,
      match_threshold: 0.50,
      match_count: 5
    });

    if (rpcError) {
      console.error("RPC match_activity_groups error:", rpcError);
      throw new Error(`Database vector search failed: ${rpcError.message}`);
    }
    tDb += Math.round(performance.now() - tDbRpcStart);

    // ── 12. Evaluate Confidence & Select Result Format ─────────────────
    let finalResult;
    if (!candidates || candidates.length === 0) {
      finalResult = {
        status: 'unmatched',
        candidates: [],
        duration_minutes: durationMinutes,
        detected_intensity: detectedIntensity,
      };
    } else {
      const top = candidates[0];
      const second = candidates[1];
      
      // High confidence if similarity >= 0.76 OR (similarity >= 0.68 with distinct gap >= 0.06)
      const isHighConfidence = top.similarity >= 0.76 || (top.similarity >= 0.68 && (!second || (top.similarity - second.similarity) >= 0.06));

      if (isHighConfidence) {
        finalResult = {
          status: 'exact_match',
          activity: top,
          candidates: [top],
          duration_minutes: durationMinutes,
          detected_intensity: detectedIntensity,
        };
      } else {
        finalResult = {
          status: 'multiple_candidates',
          activity: top,
          candidates: candidates.slice(0, 4),
          duration_minutes: durationMinutes,
          detected_intensity: detectedIntensity,
        };
      }
    }

    // ── 13. Idempotency Cache (10 minute TTL) ─────────────────────────
    if (idempotencyId && redis) {
      try {
        await redis.set(
          `idempotent:log-exercise:${user.id}:${idempotencyId}`,
          JSON.stringify(finalResult),
          { ex: 600 }
        );
      } catch (cacheSetErr) {
        console.warn("log-exercise: Failed to cache idempotency response:", cacheSetErr);
      }
    }

    const tTotal = Math.round(performance.now() - t0);
    const serverTiming = `auth;dur=${tAuth}, parse;dur=${tParse}, cache;dur=${tCache}, ratelimit;dur=${tRateLimit}, embed;dur=${tEmbed}, db;dur=${tDb}, total;dur=${tTotal}`;

    console.log(`[log-exercise] [TIMING] Total: ${tTotal}ms | Embed: ${tEmbed}ms | DB: ${tDb}ms | Status: ${finalResult.status}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: finalResult,
        timings: {
          total_ms: tTotal,
          embed_ms: tEmbed,
          db_ms: tDb,
          ratelimit_ms: tRateLimit,
          auth_ms: tAuth,
        }
      }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json', 
          'Server-Timing': serverTiming,
        } 
      }
    );
  } catch (error: any) {
    console.error("log-exercise error:", error);

    let friendlyMessage = error.message || "An unexpected error occurred.";
    if (friendlyMessage.includes('high demand') || friendlyMessage.includes('503') || friendlyMessage.includes('overloaded')) {
      friendlyMessage = "Our AI service is currently busy. Please try again in a moment.";
    }

    return new Response(
      JSON.stringify({ error: friendlyMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
