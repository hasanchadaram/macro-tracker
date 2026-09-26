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
// Keeping these outside Deno.serve reuses TCP connections and enables 0ms in-memory cache hits
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
const aiLimitMinute = parseInt(Deno.env.get('AI_LIMIT_PER_MINUTE') || '3', 10);
const aiLimitDay = parseInt(Deno.env.get('AI_LIMIT_PER_DAY') || '8', 10);

const globalLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(globalLimit, "1 m"),
  ephemeralCache: globalCacheMap,
  prefix: "ratelimit:global:scan-food"
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
  prefix: "ratelimit:burst:scan-food"
}) : null;

const edgeDailyLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(edgeDailyLimit, "1 d"),
  ephemeralCache: edgeDailyCacheMap,
  prefix: "ratelimit:edge:scan-food:day"
}) : null;

const aiMinuteLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(aiLimitMinute, "1 m"),
  ephemeralCache: aiMinuteCacheMap,
  prefix: "ratelimit:ai:scan-food:minute"
}) : null;

const aiDayLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(aiLimitDay, "1 d"),
  ephemeralCache: aiDailyCacheMap,
  prefix: "ratelimit:ai:scan-food:day"
}) : null;

const geminiBreaker = new CircuitBreaker({
  serviceName: 'gemini:scan-food',
  failureThreshold: 3,
  cooldownPeriodSeconds: 30,
  redis,
});

interface ModelWeight {
  model: string;
  percentage: number;
}

/**
 * Parses the AI_MODELS_PERCENTAGE_CONFIG environment variable.
 * Supports both JSON array: `[{"model":"m1","percentage":25},{"model":"m2","percentage":75}]`
 * and shorthand comma-separated: `"25:m1,75:m2"`.
 */
function parseModelConfig(configRaw: string | undefined): ModelWeight[] {
  const fallback: ModelWeight[] = [
    { model: 'gemini-3.5-flash-lite', percentage: 25 },
    { model: 'gemini-3.6-flash', percentage: 25 },
    { model: 'gemini-3.7-flash', percentage: 50 },
  ];

  if (!configRaw || !configRaw.trim()) {
    return fallback;
  }

  const trimmed = configRaw.trim();

  // 1. Try JSON parse
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed
          .filter((item) => item && typeof item.model === 'string' && typeof item.percentage === 'number' && item.percentage > 0)
          .map((item) => ({ model: item.model.trim(), percentage: item.percentage }));
        if (valid.length > 0) return valid;
      }
    } catch (e) {
      console.warn("scan-food: Failed to parse AI_MODELS_PERCENTAGE_CONFIG as JSON:", e);
    }
  }

  // 2. Try shorthand format: "25:model1, 25:model2, 50:model3"
  if (trimmed.includes(':')) {
    try {
      const parts = trimmed.split(',').map((p: string) => p.trim()).filter(Boolean);
      const list: ModelWeight[] = [];
      for (const part of parts) {
        const [pctStr, modelStr] = part.split(':').map((s: string) => s.trim());
        const pct = parseFloat(pctStr);
        if (!isNaN(pct) && pct > 0 && modelStr) {
          list.push({ model: modelStr, percentage: pct });
        }
      }
      if (list.length > 0) return list;
    } catch (e) {
      console.warn("scan-food: Failed to parse AI_MODELS_PERCENTAGE_CONFIG as shorthand:", e);
    }
  }

  return fallback;
}

/**
 * Deterministically hashes a user ID to an integer 0..99
 */
function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

/**
 * Selects a model based on percentage weights for a user
 */
function assignModelFromPercentages(userId: string, models: ModelWeight[]): string {
  if (models.length === 0) return 'gemini-3.5-flash-lite';
  if (models.length === 1) return models[0].model;

  const totalPercentage = models.reduce((acc, m) => acc + m.percentage, 0);
  const bucket = (hashUserId(userId) / 100) * totalPercentage;

  let cumulative = 0;
  for (const m of models) {
    cumulative += m.percentage;
    if (bucket < cumulative) {
      return m.model;
    }
  }

  return models[models.length - 1].model;
}

/**
 * Resolves the appropriate thinkingConfig for a given Gemini model.
 * Models like gemini-3.7-flash and gemini-3.8-flash do not support thinkingLevel: "MINIMAL",
 * so we use "LOW" for them. Other models (like gemini-3.5-flash-lite, gemini-3.6-flash) use "MINIMAL".
 */
function getThinkingConfig(model: string): { thinkingLevel: string } {
  if (model.includes('3.7') || model.includes('3.8')) {
    return { thinkingLevel: "LOW" };
  }
  return { thinkingLevel: "MINIMAL" };
}

const geminiPrompt = `Analyze meal from text and/or image.
Identify foods, estimated quantities, and macro totals.
Provide a 2-4 word meal title (e.g., 'Avocado Toast').
Do not invent unidentifiable foods. Confidence: 0-1.`;

const macroSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    meal_name: { type: "string" },
    foods: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          calories: { type: "integer" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" }
        },
        required: ["name", "quantity", "unit", "calories", "protein_g", "carbs_g", "fat_g"]
      }
    },
    totals: {
      type: "object",
      properties: {
        calories: { type: "integer" },
        protein_g: { type: "number" },
        carbs_g: { type: "number" },
        fat_g: { type: "number" }
      },
      required: ["calories", "protein_g", "carbs_g", "fat_g"]
    },
    confidence: { type: "number" }
  },
  required: ["title", "meal_name", "foods", "totals", "confidence"]
};

interface TaggedFoodInput {
  id?: string;
  name: string;
  per_100g: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  default_serving_g?: number | null;
  default_serving_label?: string | null;
}

interface ProcessedTaggedFood {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

function processTaggedFoods(
  rawText: string,
  taggedFoods: TaggedFoodInput[]
): {
  calculatedItems: ProcessedTaggedFood[];
  remainingText: string;
} {
  if (!rawText || !Array.isArray(taggedFoods) || taggedFoods.length === 0) {
    return { calculatedItems: [], remainingText: rawText || '' };
  }

  let textWorking = rawText;
  const calculatedItems: ProcessedTaggedFood[] = [];

  for (const food of taggedFoods) {
    if (!food || !food.name) continue;
    const escaped = food.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Matches e.g.:
    // "2 @Medium Egg", "2 of my Medium Egg", "2 my Medium Egg", "2 scoops of my Whey Protein", "150g my Rice", "my Medium Egg x2", "my Medium Egg"
    const regex = new RegExp(
      `(?:([0-9]+(?:\\.[0-9]+)?)\\s*([a-zA-Z]+)?\\s+(?:of\\s+)?)?(?:@|\\bmy\\s+)${escaped}(?:\\s*(?:x|\\*|for)?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*([a-zA-Z]+)?)?`,
      'i'
    );

    const match = textWorking.match(regex);
    if (!match) continue;

    const qtyStr = match[1] || match[3];
    let unitStr = (match[2] || match[4] || '').toLowerCase();
    if (unitStr === 'of' || unitStr === 'x') {
      unitStr = '';
    }

    let num = 1;
    if (qtyStr) {
      const parsedNum = parseFloat(qtyStr);
      if (!isNaN(parsedNum) && parsedNum > 0) {
        num = parsedNum;
      }
    }

    let isGramUnit = false;
    let unitLabel = food.default_serving_label || 'serving';

    if (unitStr.startsWith('g') || unitStr === 'gram' || unitStr === 'grams') {
      isGramUnit = true;
      unitLabel = 'g';
    } else if (unitStr === 'ml' || unitStr === 'milliliters') {
      isGramUnit = true;
      unitLabel = 'ml';
    } else if (unitStr) {
      unitLabel = unitStr;
    }

    let totalGrams = 100;
    if (isGramUnit) {
      totalGrams = num;
    } else {
      const servingG = Number(food.default_serving_g) || 100;
      totalGrams = num * servingG;
    }

    const ratio = totalGrams / 100;
    const calories = Math.round((Number(food.per_100g?.calories) || 0) * ratio);
    const protein_g = Math.round(((Number(food.per_100g?.protein_g) || 0) * ratio) * 10) / 10;
    const carbs_g = Math.round(((Number(food.per_100g?.carbs_g) || 0) * ratio) * 10) / 10;
    const fat_g = Math.round(((Number(food.per_100g?.fat_g) || 0) * ratio) * 10) / 10;

    calculatedItems.push({
      name: food.name,
      quantity: Math.round(num * 10) / 10,
      unit: unitLabel,
      calories,
      protein_g,
      carbs_g,
      fat_g,
    });

    // Remove the matched portion from working text
    textWorking = textWorking.replace(match[0], ' ');
  }

  // Clean remaining text of leftover connectors
  const cleaned = textWorking
    .replace(/\b(and|with|\+|,)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { calculatedItems, remainingText: cleaned };
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
  let tDb = 0;
  let tGemini = 0;

  try {
    // ── 1. Early Request Size Check (Max 3MB) ────────────────────────
    const contentLength = req.headers.get("content-length");
    const maxSizeBytes = parseInt(Deno.env.get("MAX_REQUEST_SIZE_BYTES") || "3145728", 10);
    if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
      return new Response(
        JSON.stringify({ error: "Request payload is too large (maximum 3MB). Please choose a smaller image." }),
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
      console.error("Authentication failed:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    tAuth = Math.round(performance.now() - tAuthStart);

    // ── 3. Parse & Validate Payload Early (Supports Multipart & JSON) ─
    const tParseStart = performance.now();
    const contentType = req.headers.get("content-type") || "";
    let text: string | undefined;
    let image_base64: string | undefined;
    let idempotencyId: string | null = req.headers.get('x-idempotency-key');
    let tagged_foods: TaggedFoodInput[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      text = (formData.get("text") as string) || undefined;
      idempotencyId = idempotencyId || (formData.get("idempotency_key") as string) || null;
      const rawTagged = formData.get("tagged_foods") as string | null;
      if (rawTagged) {
        try {
          tagged_foods = JSON.parse(rawTagged);
        } catch {}
      }
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
      idempotencyId = idempotencyId || body.idempotency_key || null;
      tagged_foods = Array.isArray(body.tagged_foods) ? body.tagged_foods : [];
    }

    if (!text && !image_base64) {
      return new Response(
        JSON.stringify({ error: 'Must provide either text, image, or both' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (text && text.trim().length > 160) {
      return new Response(
        JSON.stringify({ error: 'Meal description is too long (maximum 160 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    tParse = Math.round(performance.now() - tParseStart);

    // ── Process Tagged Personal Foods & Determine Fast-Path ───────────
    const { calculatedItems, remainingText } = processTaggedFoods(text || '', tagged_foods);
    const hasSubstantiveRemainingText = remainingText.length > 0 && /[a-zA-Z0-9]/.test(remainingText);
    const hasImage = !!image_base64;
    const isFastPath = calculatedItems.length > 0 && !hasSubstantiveRemainingText && !hasImage;

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown-ip';
    const identifier = `${user.id}:${ip}`;

    // ── 4. Idempotency Fast-Path Cache Check (Redis Lookup) ───────────
    const tCacheStart = performance.now();
    if (idempotencyId && redis) {
      try {
        const cached = await redis.get(`idempotent:scan-food:${user.id}:${idempotencyId}`);
        if (cached) {
          tCache = Math.round(performance.now() - tCacheStart);
          const tTotal = Math.round(performance.now() - t0);
          console.log(`[scan-food] [CACHE HIT] key: ${idempotencyId} | total: ${tTotal}ms`);
          const cachedData = typeof cached === 'string' ? JSON.parse(cached) : cached;
          return new Response(
            JSON.stringify({ success: true, data: cachedData, cached: true, timings: { total_ms: tTotal, cache_ms: tCache } }),
            { 
              status: 200, 
              headers: { 
                ...corsHeaders, 
                'Content-Type': 'application/json',
                'Server-Timing': `auth;dur=${tAuth}, cache;dur=${tCache}, total;dur=${tTotal}`,
                'X-Cache': 'HIT',
              } 
            }
          );
        }
      } catch (cacheErr) {
        console.warn("scan-food: Redis idempotency read failed:", cacheErr);
      }
    }
    tCache = Math.round(performance.now() - tCacheStart);

    // ── FAST PATH: Pure Tagged Foods (Zero Gemini Tokens, 0ms AI time) ─
    if (isFastPath) {
      const totalCals = calculatedItems.reduce((s, i) => s + i.calories, 0);
      const totalP = Math.round(calculatedItems.reduce((s, i) => s + i.protein_g, 0) * 10) / 10;
      const totalC = Math.round(calculatedItems.reduce((s, i) => s + i.carbs_g, 0) * 10) / 10;
      const totalF = Math.round(calculatedItems.reduce((s, i) => s + i.fat_g, 0) * 10) / 10;
      const title = calculatedItems.length === 1 ? calculatedItems[0].name : `${calculatedItems[0].name} & more`;

      const fastResponse = {
        title,
        meal_name: title,
        foods: calculatedItems,
        totals: {
          calories: totalCals,
          protein_g: totalP,
          carbs_g: totalC,
          fat_g: totalF,
        },
        confidence: 1.0,
      };

      if (idempotencyId && redis) {
        try {
          await redis.set(
            `idempotent:scan-food:${user.id}:${idempotencyId}`,
            JSON.stringify(fastResponse),
            { ex: 600 }
          );
        } catch (cacheSetErr) {
          console.warn("scan-food: Failed to cache idempotency fast-path response:", cacheSetErr);
        }
      }

      const tTotal = Math.round(performance.now() - t0);
      console.log(`[scan-food] [FAST PATH] Skipped Gemini for tagged foods (${calculatedItems.map(i => i.name).join(', ')}) | Total: ${tTotal}ms`);

      return new Response(
        JSON.stringify({
          success: true,
          data: fastResponse,
          fast_path: true,
          timings: {
            total_ms: tTotal,
            gemini_ms: 0,
            upload_parse_ms: tParse,
            db_ms: 0,
            redis_ms: 0,
            auth_ms: tAuth,
          },
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Server-Timing': `auth;dur=${tAuth}, parse;dur=${tParse}, total;dur=${tTotal}`,
          },
        }
      );
    }
    tCache = Math.round(performance.now() - tCacheStart);

    // ── 5. Parallel Global & Edge Function Rate Limiting (Promise.all) ─
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
              error: `Too many requests. Please wait ${retryAfter}s before scanning again.`,
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
              error: `Daily scan limit reached (${edgeDailyLimit} scans/day). Resets in ${hours} hour${hours > 1 ? 's' : ''}.`,
              retry_after_seconds: retryAfter,
              rate_limited: true,
              is_daily_limit: true
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": retryAfter.toString() } }
          );
        }
      } catch (burstErr) {
        console.warn("scan-food: Edge rate limiter failed open:", burstErr);
      }
    }

    // ── 6. Fetch User's Assigned AI Model & Custom API Key ───────────
    const tDbStart = performance.now();
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    let customApiKey: string | null = null;
    const { data: modelData } = await supabaseAdmin
      .from('user_ai_settings')
      .select('ai_model, custom_api_key')
      .eq('user_id', user.id)
      .maybeSingle();
      
    if (modelData?.custom_api_key && modelData.custom_api_key.trim()) {
      customApiKey = modelData.custom_api_key.trim();
    }

    const byokDefaultModel = Deno.env.get('BYOK_DEFAULT_AI_MODEL') || 'gemini-3.6-flash';
    const activeModelWeights = parseModelConfig(Deno.env.get('AI_MODELS_PERCENTAGE_CONFIG'));

    const currentDbModel = modelData?.ai_model?.trim() || null;

    // Check if the user has a manual override in the database.
    // A manual override is any non-empty ai_model that does NOT start with 'CONFIG_'.
    const isManualOverride = currentDbModel !== null && !currentDbModel.startsWith('CONFIG_');

    let aiModel: string;

    if (isManualOverride) {
      // ── MANUAL OVERRIDE (Priority: Database) ─────────────────────────
      // The developer/admin manually assigned or edited this model in the DB.
      aiModel = currentDbModel;
      console.log(`scan-food: user=${user.id} using MANUAL_OVERRIDE aiModel=${aiModel}`);
    } else {
      // ── CONFIG DRIVEN (Priority: Configuration) ──────────────────────
      // The model is driven by server config (BYOK or percentage split).
      let resolvedModel: string;
      if (customApiKey) {
        // BYOK user -> take model from BYOK configuration
        resolvedModel = byokDefaultModel;
      } else {
        // Normal user -> take model from percentage split configuration
        resolvedModel = assignModelFromPercentages(user.id, activeModelWeights);
      }

      aiModel = resolvedModel;
      const expectedDbValue = `CONFIG_${resolvedModel}`;

      // If DB doesn't have this value yet (e.g. was null, or config model changed/deprecated), update it
      if (currentDbModel !== expectedDbValue) {
        supabaseAdmin
          .from('user_ai_settings')
          .upsert(
            {
              user_id: user.id,
              ai_model: expectedDbValue,
              byok_enabled: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
          .then(({ error: upsertErr }) => {
            if (upsertErr) {
              console.warn(`scan-food: Failed to update ai_model for user ${user.id}:`, upsertErr);
            } else {
              console.log(`scan-food: Synced ai_model='${expectedDbValue}' for user ${user.id}`);
            }
          });
      }
    }

    tDb = Math.round(performance.now() - tDbStart);

    // ── 7. AI Specific Rate Limiting (Parallel 3/min & 6/day for Free Tier)
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
              error: `AI analysis limit reached (${aiLimitMinute} per minute). Please wait ${retryAfter}s before trying again.`,
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
              error: `You've reached your free daily limit of ${aiLimitDay} meal scans. Resets in ${hours} hour${hours > 1 ? 's' : ''}, or add your own API key in Settings to use your personal quota.`,
              retry_after_seconds: retryAfter,
              rate_limited: true,
              is_daily_limit: true
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": retryAfter.toString() } }
          );
        }
      } catch (aiRateErr) {
        console.warn("scan-food: AI rate limiter failed open:", aiRateErr);
      }
    }
    tRateLimit = Math.round(performance.now() - tRateLimitStart);

    // ── 8. Build Gemini Request ───────────────────────────────────────
    const apiKey = customApiKey || Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY");
    }
    console.log(`scan-food: user=${user.id} usingKey=${customApiKey ? 'USER_CUSTOM_BYOK' : 'SERVER_DEFAULT'}`);

    const parts: any[] = [{ text: geminiPrompt }];

    if (calculatedItems.length > 0) {
      const taggedSummary = calculatedItems.map(i => `${i.quantity} ${i.unit} ${i.name}`).join(', ');
      parts.push({
        text: `Already logged by user: ${taggedSummary}.
DO NOT include or re-estimate these items in 'foods' or 'totals'. Only estimate remaining items. Title should still describe the complete meal.`
      });
    }

    const textToAnalyze = calculatedItems.length > 0 ? remainingText : (text || '');
    if (textToAnalyze && textToAnalyze.trim().length > 0) {
      parts.push({ text: `User description: ${textToAnalyze.trim()}` });
    }

    if (image_base64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: image_base64,
        },
      });
    }

    console.log(`scan-food: Calling Gemini (${aiModel}) for user`, user.id);

    // ── 9. Circuit Breaker Check ──────────────────────────────────────
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

    // ── 10. Call Gemini API ───────────────────────────────────────────
    const tGeminiStart = performance.now();
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent`;

    let response;
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
            responseSchema: macroSchema,
            thinkingConfig: getThinkingConfig(aiModel),
          }
        }),
      });
    } catch (fetchErr: any) {
      await geminiBreaker.recordFailure(503, fetchErr.message);
      throw new Error(`AI service connection error: ${fetchErr.message}`);
    }

    if (!response.ok) {
      const errText = await response.text();
      let niceError = "AI service error";
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error && parsed.error.message) {
          niceError = parsed.error.message;
        }
      } catch (e) {
        niceError = errText;
      }
      await geminiBreaker.recordFailure(response.status, niceError);
      throw new Error(niceError);
    }

    const geminiData = await response.json();
    const geminiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!geminiText) {
      await geminiBreaker.recordFailure(502, "Empty candidates response");
      throw new Error("Failed to parse Gemini response text");
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(geminiText);
    } catch (_e) {
      console.error("Gemini raw text:", geminiText);
      await geminiBreaker.recordFailure(502, "Invalid JSON in response");
      throw new Error("Gemini response was not valid JSON");
    }

    // Merge exact calculated tagged foods into Gemini output (with duplicate protection)
    if (calculatedItems.length > 0) {
      const taggedNamesLower = new Set(calculatedItems.map(i => i.name.toLowerCase().trim()));

      // Defense-in-depth: filter out any duplicate items Gemini may have returned despite the prompt
      const filteredGeminiFoods = (parsedResponse.foods || []).filter((gf: any) => {
        if (!gf || !gf.name) return false;
        const gfName = gf.name.toLowerCase().trim();
        const isDuplicate = Array.from(taggedNamesLower).some(tn => 
          gfName === tn || gfName.includes(tn) || tn.includes(gfName)
        );
        if (isDuplicate) {
          console.log(`[scan-food] Dropped duplicate item from Gemini: "${gf.name}" (already covered by user's tagged food)`);
          return false;
        }
        return true;
      });

      // Recalculate Gemini's portion of totals (in case a duplicate was filtered out)
      const geminiCals = filteredGeminiFoods.reduce((s: number, f: any) => s + (Number(f.calories) || 0), 0);
      const geminiP = filteredGeminiFoods.reduce((s: number, f: any) => s + (Number(f.protein_g) || 0), 0);
      const geminiC = filteredGeminiFoods.reduce((s: number, f: any) => s + (Number(f.carbs_g) || 0), 0);
      const geminiF = filteredGeminiFoods.reduce((s: number, f: any) => s + (Number(f.fat_g) || 0), 0);

      const taggedCals = calculatedItems.reduce((s, i) => s + i.calories, 0);
      const taggedP = calculatedItems.reduce((s, i) => s + i.protein_g, 0);
      const taggedC = calculatedItems.reduce((s, i) => s + i.carbs_g, 0);
      const taggedF = calculatedItems.reduce((s, i) => s + i.fat_g, 0);

      parsedResponse.foods = [...calculatedItems, ...filteredGeminiFoods];
      parsedResponse.totals = {
        calories: taggedCals + geminiCals,
        protein_g: Math.round((taggedP + geminiP) * 10) / 10,
        carbs_g: Math.round((taggedC + geminiC) * 10) / 10,
        fat_g: Math.round((taggedF + geminiF) * 10) / 10,
      };

      if (!parsedResponse.title || parsedResponse.title === 'Meal' || parsedResponse.title === 'Unknown') {
        parsedResponse.title = `${calculatedItems[0].name} & more`;
      }
    }

    tGemini = Math.round(performance.now() - tGeminiStart);

    // Call succeeded -> reset circuit breaker
    await geminiBreaker.recordSuccess();

    // ── 10. Cache for Idempotency (10 minute TTL) ─────────────────────
    if (idempotencyId && redis) {
      try {
        await redis.set(
          `idempotent:scan-food:${user.id}:${idempotencyId}`,
          JSON.stringify(parsedResponse),
          { ex: 600 }
        );
      } catch (cacheSetErr) {
        console.warn("scan-food: Failed to cache idempotency response:", cacheSetErr);
      }
    }

    const tTotal = Math.round(performance.now() - t0);
    const serverTiming = `auth;dur=${tAuth}, parse;dur=${tParse}, cache;dur=${tCache}, ratelimit;dur=${tRateLimit}, db;dur=${tDb}, gemini;dur=${tGemini}, total;dur=${tTotal}`;
    
    console.log(`[scan-food] [TIMING] Total: ${tTotal}ms | Gemini: ${tGemini}ms (${((tGemini/tTotal)*100).toFixed(1)}%) | Upload/Parse: ${tParse}ms | DB: ${tDb}ms | Redis: ${tRateLimit}ms | Auth: ${tAuth}ms`);

    // ── 11. Return Estimate ───────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        data: parsedResponse,
        timings: {
          total_ms: tTotal,
          gemini_ms: tGemini,
          upload_parse_ms: tParse,
          db_ms: tDb,
          redis_ms: tRateLimit,
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
    console.error("scan-food error:", error);
    
    let friendlyMessage = error.message || "An unexpected error occurred.";
    if (friendlyMessage.includes('high demand') || friendlyMessage.includes('503') || friendlyMessage.includes('overloaded')) {
      friendlyMessage = "Our AI is currently experiencing high demand. Please try again in a moment.";
    }

    return new Response(
      JSON.stringify({ error: friendlyMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
