import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Redis } from "https://esm.sh/@upstash/redis@1.28.3";
import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@1.0.1";
import { CircuitBreaker } from "../_shared/circuitBreaker.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'Server-Timing, X-Cache, Retry-After',
  'Content-Type': 'application/json',
};

// ── Module-Scoped Redis & Persistent Ephemeral Caches ──────────────────────
const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
const redis = (redisUrl && redisToken) ? new Redis({ url: redisUrl, token: redisToken }) : null;

const globalCacheMap = new Map();
const userGlobalMinuteCacheMap = new Map();
const userGlobalDailyCacheMap = new Map();
const edgeBurstCacheMap = new Map();
const aiMinuteCacheMap = new Map();
const aiDailyCacheMap = new Map();

const globalLimit = parseInt(Deno.env.get('GLOBAL_LIMIT_PER_MINUTE') || '100', 10);
const userGlobalMinuteLimit = parseInt(Deno.env.get('USER_GLOBAL_LIMIT_PER_MINUTE') || '8', 10);
const userGlobalDailyLimit = parseInt(Deno.env.get('USER_GLOBAL_LIMIT_PER_DAY') || '20', 10);
const edgeBurstLimit = parseInt(Deno.env.get('RESOLVE_FOOD_LIMIT_PER_MINUTE') || '10', 10);
const aiLimitMinute = parseInt(Deno.env.get('AI_LIMIT_PER_MINUTE') || '3', 10);
const aiLimitDay = parseInt(Deno.env.get('AI_LIMIT_PER_DAY') || '6', 10);

const globalLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(globalLimit, "1 m"),
  ephemeralCache: globalCacheMap,
  prefix: "ratelimit:global:resolve-food",
}) : null;

const userGlobalMinuteLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(userGlobalMinuteLimit, "1 m"),
  ephemeralCache: userGlobalMinuteCacheMap,
  prefix: "ratelimit:user:global:minute",
}) : null;

const userGlobalDailyLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(userGlobalDailyLimit, "1 d"),
  ephemeralCache: userGlobalDailyCacheMap,
  prefix: "ratelimit:user:global:day",
}) : null;

const edgeBurstLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(edgeBurstLimit, "1 m"),
  ephemeralCache: edgeBurstCacheMap,
  prefix: "ratelimit:burst:resolve-food",
}) : null;

const aiMinuteLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(aiLimitMinute, "1 m"),
  ephemeralCache: aiMinuteCacheMap,
  prefix: "ratelimit:ai:resolve-food:minute",
}) : null;

const aiDayLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(aiLimitDay, "1 d"),
  ephemeralCache: aiDailyCacheMap,
  prefix: "ratelimit:ai:resolve-food:day",
}) : null;

const geminiBreaker = new CircuitBreaker({
  serviceName: 'gemini:resolve-food',
  failureThreshold: 3,
  cooldownPeriodSeconds: 30,
  redis,
});

// ── Gemini prompt: resolve a single food item's nutrition ──────────────────
const resolvePrompt = `
You are a nutrition analysis expert. The user will describe a single food item (NOT a full meal).

Determine:
1. The food's name
2. Whether it is "simple" (a single ingredient like boiled egg, milk, rice, oil) or "compound" (a dish made from multiple ingredients, like omelette, curry, dal, protein shake)
3. Nutrition per 100g of the food as consumed

If the food is compound:
- List each ingredient with its estimated amount in grams (for a typical serving)
- Each ingredient should be a simple food (e.g. egg, oil, dal, spinach)

If the food is simple:
- Set ingredients to an empty array

For confidence, provide a value between 0 and 1.
Use metric units. All values must be numeric.
`;

const resolveSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Display name for the food" },
    is_compound: { type: "boolean", description: "true if the food is a dish/recipe, false if single ingredient" },
    per_100g: {
      type: "object",
      properties: {
        calories: { type: "number" },
        protein_g: { type: "number" },
        carbs_g: { type: "number" },
        fat_g: { type: "number" },
        fiber_g: { type: "number" },
        sodium_mg: { type: "number" },
      },
      required: ["calories", "protein_g", "carbs_g", "fat_g"],
    },
    default_serving_g: { type: "number", description: "Typical serving size in grams" },
    default_serving_label: { type: "string", description: "Human label like '1 bowl', '2 eggs', '1 cup'" },
    ingredients: {
      type: "array",
      description: "Ingredient breakdown for compound foods. Empty array for simple foods.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Simple ingredient name" },
          amount_g: { type: "number", description: "Amount in grams for this recipe" },
        },
        required: ["name", "amount_g"],
      },
    },
    confidence: { type: "number", description: "0-1 confidence in the estimate" },
  },
  required: ["name", "is_compound", "per_100g", "default_serving_g", "default_serving_label", "ingredients", "confidence"],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const t0 = performance.now();
  let tAuth = 0;
  let tParse = 0;
  let tRateLimit = 0;
  let tGemini = 0;

  try {
    // ── 1. Authentication ──────────────────────────────────────────────
    const tAuthStart = performance.now();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: corsHeaders }
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
        { status: 401, headers: corsHeaders }
      );
    }
    tAuth = Math.round(performance.now() - tAuthStart);

    // ── 2. Parse payload (multipart or JSON) ───────────────────────────
    const tParseStart = performance.now();
    const contentType = req.headers.get("content-type") || "";
    let text: string | undefined;
    let image_base64: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      text = (formData.get("text") as string) || undefined;
      const imageFile = formData.get("image") as File | null;
      if (imageFile) {
        const arrayBuffer = await imageFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binaryStr = "";
        const len = bytes.byteLength;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
          binaryStr += String.fromCharCode.apply(null, chunk as any);
        }
        image_base64 = btoa(binaryStr);
      }
    } else {
      const body = await req.json();
      text = body.text;
      image_base64 = body.image_base64;
    }

    if (!text && !image_base64) {
      return new Response(
        JSON.stringify({ error: 'Must provide either text description or image' }),
        { status: 400, headers: corsHeaders }
      );
    }
    tParse = Math.round(performance.now() - tParseStart);

    // ── 3. Resolve API key (BYOK check) ───────────────────────────────
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let customApiKey: string | null = null;
    const { data: modelData } = await supabaseAdmin
      .from('user_ai_settings')
      .select('custom_api_key')
      .eq('user_id', user.id)
      .maybeSingle();

    if (modelData?.custom_api_key?.trim()) {
      customApiKey = modelData.custom_api_key.trim();
    }

    const apiKey = customApiKey || Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    // ── 4. Rate Limiting Check (Parallel via Promise.all) ─────────────
    const tRateLimitStart = performance.now();
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown-ip';
    const identifier = `${user.id}:${ip}`;

    if (redis) {
      try {
        const checks: Promise<any>[] = [
          globalLimiter ? globalLimiter.limit("global") : Promise.resolve({ success: true }),
          userGlobalMinuteLimiter ? userGlobalMinuteLimiter.limit(identifier) : Promise.resolve({ success: true }),
          userGlobalDailyLimiter ? userGlobalDailyLimiter.limit(identifier) : Promise.resolve({ success: true }),
          edgeBurstLimiter ? edgeBurstLimiter.limit(identifier) : Promise.resolve({ success: true }),
        ];

        // Only enforce AI quota on free-tier (non-BYOK) users
        if (!customApiKey) {
          checks.push(aiMinuteLimiter ? aiMinuteLimiter.limit(user.id) : Promise.resolve({ success: true }));
          checks.push(aiDayLimiter ? aiDayLimiter.limit(user.id) : Promise.resolve({ success: true }));
        }

        const [globalRes, userMinRes, userDayRes, burstRes, aiMinRes, aiDayRes] = await Promise.all(checks);

        if (!globalRes.success) {
          const retryAfter = Math.ceil((globalRes.reset - Date.now()) / 1000);
          return new Response(
            JSON.stringify({ error: "High server load. Please wait a moment before trying again.", retry_after_seconds: retryAfter, rate_limited: true }),
            { status: 429, headers: { ...corsHeaders, "Retry-After": retryAfter.toString() } }
          );
        }

        if (!userMinRes.success) {
          const retryAfter = Math.ceil((userMinRes.reset - Date.now()) / 1000);
          return new Response(
            JSON.stringify({ error: `Too many requests across app actions. Please wait ${retryAfter}s before trying again.`, retry_after_seconds: retryAfter, rate_limited: true }),
            { status: 429, headers: { ...corsHeaders, "Retry-After": retryAfter.toString() } }
          );
        }

        if (!userDayRes.success) {
          const retryAfter = Math.ceil((userDayRes.reset - Date.now()) / 1000);
          const hours = Math.ceil(retryAfter / 3600);
          return new Response(
            JSON.stringify({ error: `Daily limit reached (${userGlobalDailyLimit} requests/day). Resets in ${hours} hour${hours > 1 ? 's' : ''}.`, retry_after_seconds: retryAfter, rate_limited: true }),
            { status: 429, headers: { ...corsHeaders, "Retry-After": retryAfter.toString() } }
          );
        }

        if (!burstRes.success) {
          const retryAfter = Math.ceil((burstRes.reset - Date.now()) / 1000);
          return new Response(
            JSON.stringify({ error: `Too many food resolution requests. Please wait ${retryAfter}s.`, retry_after_seconds: retryAfter, rate_limited: true }),
            { status: 429, headers: { ...corsHeaders, "Retry-After": retryAfter.toString() } }
          );
        }

        if (aiMinRes && !aiMinRes.success) {
          const retryAfter = Math.ceil((aiMinRes.reset - Date.now()) / 1000);
          return new Response(
            JSON.stringify({ error: `AI resolution rate limit reached. Please wait ${retryAfter}s or add your own Gemini API key.`, retry_after_seconds: retryAfter, rate_limited: true }),
            { status: 429, headers: { ...corsHeaders, "Retry-After": retryAfter.toString() } }
          );
        }

        if (aiDayRes && !aiDayRes.success) {
          const retryAfter = Math.ceil((aiDayRes.reset - Date.now()) / 1000);
          const hours = Math.ceil(retryAfter / 3600);
          return new Response(
            JSON.stringify({ error: `Daily AI quota reached (${aiLimitDay}/day). Resets in ${hours} hour${hours > 1 ? 's' : ''}. Add your own API key in Profile to continue unlimited.`, retry_after_seconds: retryAfter, rate_limited: true }),
            { status: 429, headers: { ...corsHeaders, "Retry-After": retryAfter.toString() } }
          );
        }
      } catch (rateErr) {
        console.warn("resolve-food: Rate limit check failed (failing open):", rateErr);
      }
    }
    tRateLimit = Math.round(performance.now() - tRateLimitStart);

    // ── 5. Circuit Breaker Check ──────────────────────────────────────
    const breakerStatus = await geminiBreaker.check();
    if (!breakerStatus.allowed && breakerStatus.errorResponse) {
      return new Response(
        JSON.stringify(breakerStatus.errorResponse),
        { status: 503, headers: { ...corsHeaders, "Retry-After": breakerStatus.errorResponse.retry_after_seconds.toString() } }
      );
    }

    // ── 6. Build Gemini request ──────────────────────────────────────
    const aiModel = Deno.env.get('RESOLVE_FOOD_MODEL') || 'gemini-2.5-flash';
    const parts: any[] = [{ text: resolvePrompt }];

    if (text) {
      parts.push({ text: `User describes: ${text}` });
    }

    if (image_base64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: image_base64,
        },
      });
    }

    console.log(`resolve-food: user=${user.id} model=${aiModel} hasText=${!!text} hasImage=${!!image_base64}`);

    // ── 7. Call Gemini API with Circuit Breaker Recording ─────────────
    const tGeminiStart = performance.now();
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent`;

    let response: Response;
    try {
      response = await fetch(geminiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: resolveSchema,
            thinkingConfig: { thinkingLevel: "MINIMAL" },
          },
        }),
      });

      if (!response.ok) {
        await geminiBreaker.recordFailure();
        const errText = await response.text();
        let niceError = "AI service error";
        try {
          const parsed = JSON.parse(errText);
          if (parsed.error?.message) niceError = parsed.error.message;
        } catch (_e) {
          niceError = errText;
        }
        throw new Error(niceError);
      }

      await geminiBreaker.recordSuccess();
    } catch (fetchErr: any) {
      await geminiBreaker.recordFailure();
      throw fetchErr;
    }
    tGemini = Math.round(performance.now() - tGeminiStart);

    const geminiData = await response.json();
    const geminiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!geminiText) {
      throw new Error("Empty response from AI");
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(geminiText);
    } catch (_e) {
      console.error("resolve-food: raw Gemini text:", geminiText);
      throw new Error("AI response was not valid JSON");
    }

    // ── 8. Return result with Server-Timing ───────────────────────────
    const tTotal = Math.round(performance.now() - t0);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...parsedResponse,
          source: 'gemini',
        },
        timings: { total_ms: tTotal, auth_ms: tAuth, rate_limit_ms: tRateLimit, gemini_ms: tGemini },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Server-Timing': `auth;dur=${tAuth}, ratelimit;dur=${tRateLimit}, gemini;dur=${tGemini}, total;dur=${tTotal}`,
        },
      }
    );

  } catch (error: any) {
    console.error("resolve-food error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred." }),
      { status: 200, headers: corsHeaders }
    );
  }
});
