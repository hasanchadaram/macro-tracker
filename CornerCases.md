# Production Architecture, Corner Cases & System Design Decisions

> **Technical Reference & Interview Guide**:  
> This document details the technical engineering decisions, distributed system corner cases, concurrency controls, and resilience strategies implemented across Macro Tracker. It is structured as an architectural reference for production design and technical interview discussions at top-tier product companies.

---

## 1. Multi-Tier Distributed Rate Limiting & Sybil Attack Defense

### Architectural Strategy:
- **Algorithm**: Sliding Window Counter via Upstash Redis.
- **Why Sliding Window over Token Bucket/Fixed Window**:
  Fixed windows suffer from the $2\times$ boundary burst vulnerability (e.g., sending 10 requests at 11:59:59 PM and 10 at 12:00:00 AM, totaling 20 requests in 1 second). Sliding window counter calculates the weighted sum of the current and previous windows, guaranteeing smooth request distribution.

### Multi-Tiered Quota Architecture:
All limits are dynamically configurable from Supabase dashboard secrets via `supabase/functions/.env`:

1. **Tier 1: Global Platform Anti-DDoS Barrier (All Users Together)**:
   - `100 req/min` platform-wide (`GLOBAL_LIMIT_PER_MINUTE=100`).
   - **Shared across all users together**: Uses static identifier `"global"`. Protects serverless isolates, database CPU, and connection pools from distributed botnets or unauthenticated traffic floods.

2. **Tier 2: Global Per-User Edge Limits (Cross-Function Aggregated Quota)**:
   - `8 req/min` (`USER_GLOBAL_LIMIT_PER_MINUTE=8`).
   - `20 req/day` (`USER_GLOBAL_LIMIT_PER_DAY=20`).
   - Aggregated across **all edge functions combined** (`scan-food`, `log-meal`, `log-exercise`, `resolve-food`, `submit-feedback`) per authenticated user ID using shared Upstash Redis keys (`ratelimit:user:global:minute` & `ratelimit:user:global:day`).

3. **Tier 3: General Edge Function Call Limits (Per-Function)**:
   - `log-meal`, `log-exercise`, `scan-food`, `resolve-food`: `8 req/min` (`EDGE_LIMIT_PER_MINUTE=8`), `16 req/day` (`EDGE_LIMIT_PER_DAY=16`).
     *(Note: `log-meal` limits are merged into these general edge limits `EDGE_LIMIT_PER_MINUTE` and `EDGE_LIMIT_PER_DAY`).*
   - `submit-feedback`: `10 req/day` (`FEEDBACK_LIMIT_PER_DAY=10`), `100 req/day` platform-wide (`FEEDBACK_GLOBAL_LIMIT_PER_DAY=100`).

4. **Tier 4: Third-Party AI Quotas (Free Tier vs. BYOK)**:
   - **Gemini Vision / Flash Calls (`scan-food`, `resolve-food`)**: `3 req/min`, `8 req/day` (`AI_LIMIT_PER_MINUTE=3`, `AI_LIMIT_PER_DAY=8`).
   - **Gemini Embedding Calls (`log-exercise`)**: `5 req/min`, `12 req/day` (`AI_EMBED_LIMIT_PER_MINUTE=5`, `AI_EMBED_LIMIT_PER_DAY=12`).
   - **BYOK Users**: Personal Gemini API key is decrypted and authenticated, bypassing platform AI rate limits (3/min, 8/day) while still being subject to all other rate limits: per-function edge burst/daily limits (8/min, 16/day), global per-user minute/daily limits (8/min, 20/day), and platform anti-DDoS limits (100/min).

5. **Tier 5: Domain Business Rules & Meal Type Limits**:
   - **Max 5 Meals per Meal Type per Day**: Enforces a maximum of 5 entries per meal type (`breakfast`, `lunch`, `dinner`, `snack`, `snacks`) per day (`MAX_MEALS_PER_TYPE_PER_DAY=5`).
   - **Multi-Layer Enforcement**:
     - *Client UI*: `openAddFood` in `index.tsx` checks `todaysEntries` and blocks opening modal if 5 entries already exist.
     - *Edge Function*: `log-meal` pre-validates `meal_type` count before performing image storage uploads.
     - *PostgreSQL Atomic RPC*: `insert_meal_transaction` executes an atomic `SELECT COUNT(*)` check within the database transaction and aborts with `RAISE EXCEPTION` if limit is reached, eliminating race conditions.

### Standardized Limits Summary Table:

| Scope / Category | Function(s) | Window | Quota | Environment Variable Secret |
| :--- | :--- | :--- | :--- | :--- |
| **Gemini AI Analysis** | `scan-food`, `resolve-food` | 1 min / 1 day | `3 / min`, `8 / day` | `AI_LIMIT_PER_MINUTE`, `AI_LIMIT_PER_DAY` |
| **Gemini Embeddings** | `log-exercise` | 1 min / 1 day | `5 / min`, `12 / day` | `AI_EMBED_LIMIT_PER_MINUTE`, `AI_EMBED_LIMIT_PER_DAY` |
| **General Edge Calls** | `log-meal`, `log-exercise`, `scan-food`, `resolve-food` | 1 min / 1 day | `8 / min`, `16 / day` | `EDGE_LIMIT_PER_MINUTE`, `EDGE_LIMIT_PER_DAY` |
| **Global Per-User** | All Edge Functions Combined | 1 min / 1 day | `8 / min`, `20 / day` | `USER_GLOBAL_LIMIT_PER_MINUTE`, `USER_GLOBAL_LIMIT_PER_DAY` |
| **Meal Type Quota** | `log-meal`, DB RPC | Per Day | `Max 5 per type` | `MAX_MEALS_PER_TYPE_PER_DAY` |
| **Platform Anti-DDoS** | All Edge Functions (All Users) | 1 min | `100 / min` | `GLOBAL_LIMIT_PER_MINUTE` |
| **Feedback Reports** | `submit-feedback` | 1 day | `10 / day` | `FEEDBACK_LIMIT_PER_DAY` |

### Standardized `429 Too Many Requests` Contract:
- All rate-limited responses return `HTTP 429` with `Retry-After: <seconds>` headers and JSON payload containing `retry_after_seconds`, `rate_limited: true`, `is_daily_limit: true` (for daily limits), and specific reset times, allowing the client to show deterministic countdown timers and direct users to Settings to add their own API key.


---

## 2. Distributed Latency Optimization & Cold-Socket Mitigation

### The Problem (487ms Cold Latency):
- Sequential HTTP calls from edge functions to Redis (`await global` $\to$ `await burst` $\to$ `await daily`) created a $3 \times \text{RTT}$ waterfall.
- After idle periods, TCP/TLS connections to serverless Redis timed out, requiring DNS lookup + TCP 3-way handshake + TLS 1.3 negotiation on each request.
- Per-request instantiation wiped in-memory caches on every invocation.

### The Engineering Solution:
1. **Parallel Execution via `Promise.all`**:
   - Concurrently evaluates global, burst, and daily limits in a single network round-trip ($3\times \text{RTT} \to 1\times \text{RTT}$), reducing Redis overhead by ~66%.
2. **Module-Scoped Singletons**:
   - Instantiating `Redis` and `Ratelimit` instances at Deno module scope preserves HTTP keep-alive connections across warm isolate invocations.
3. **Persistent Ephemeral In-Memory Cache**:
   - In-memory `ephemeralCache` (LRU Map) stores recent token counts within the isolate, serving repeated checks in **0ms** without touching the Redis network socket.

---

## 3. Idempotency & Network Retries (At-Most-Once Execution)

### Edge Case:
Under unstable cellular network conditions, a client may send a request, the server executes it, but the TCP connection drops before the HTTP response reaches the client. If the client automatically retries, duplicate meals or AI scans would be billed/logged twice.

### Technical Implementation:
1. **Client-Generated UUIDv4 Idempotency Key**:
   - The mobile client generates a unique `idempotency_key` (UUIDv4) attached to `x-idempotency-key` header or request body.
2. **Atomic Redis Reservation with TTL**:
   - The edge function checks `idempotent:<fn>:<user_id>:<key>`.
   - If present, returns the cached result immediately ($< 20\text{ ms}$, `X-Cache: HIT`) without re-running AI inference or deducting user quota.
   - If absent, executes the transaction, writes to Redis with a `10-minute TTL` (`SETEX`), and commits to PostgreSQL.
3. **Database-Level Deduplication**:
   - PostgreSQL RPC `insert_meal_transaction` accepts `p_client_meal_id`. If `meal_entries` already contains that ID for the user, it skips re-insertion and returns the existing row idempotently.

---

## 4. Timezone Midnight Boundaries & Zero-State Synchronization

### The Problem:
- PostgreSQL and Supabase servers operate in UTC.
- A user logging meals or walking in IST (`GMT+05:30`) at `12:30 AM` on August 31 local time is still at `7:00 PM` on August 30 in UTC.
- Defaulting to PostgreSQL `CURRENT_DATE` or `now()::date` attributes actions to *yesterday*, causing newly logged meals/exercises to disappear from today's dashboard upon refresh.

### Technical Solution:
1. **Client-Side Local Day Slicing (`dateUtils.ts`)**:
   - Local date is computed strictly using the device's local calendar year, month, and day (`YYYY-MM-DD`).
   - Generates exact ISO 8601 start (`00:00:00.000`) and end (`23:59:59.999`) timestamps in local time.
2. **Explicit `summary_date` Column**:
   - `meal_entries`, `exercises`, and `daily_summaries` explicitly store `summary_date date` passed from the client's local context, superseding UTC server defaults.
3. **Hybrid DB Query with Fallback**:
   - Dashboard queries match: `or(summary_date.eq.${dateStr}, and(created_at.gte.${startIso}, created_at.lte.${endIso}))`.
   - Guarantees seamless backward compatibility for historical rows while strictly isolating local days.

---

## 5. Single Source of Truth vs. Materialized Aggregations (Race Condition Elimination)

### The Problem:
- `daily_summaries` acts as a materialized aggregate table (CQRS read-model) to speed up analytics queries.
- If a user deletes multiple meals in rapid succession, firing multiple concurrent asynchronous delete RPCs, network responses can arrive out-of-order.
- If the client re-queries `daily_summaries` after delete #1 finishes while delete #2 is still in-flight, stale aggregate data (e.g. 156 kcal) overwrites the client state even when the UI meal list is completely empty.

### The Architectural Solution:
1. **Ground-Truth UI State Derivation**:
   - The client derives total calories and macros directly from the active array of meal entries loaded on screen:
     $$\text{Total Eaten} = \sum_{e \in \text{LoadedEntries}} e.\text{calories}$$
   - When all entries are removed, eaten calories are **guaranteed to be 0**, mathematically preventing phantom/stale summary data.
2. **Optimistic Local Mutation + In-Flight Mutex**:
   - `handleDeleteEntry` mutates local state instantly and uses `pendingDeletesRef (Set<string>)` to prevent duplicate click dispatching.
   - Asynchronous server sync runs in the background; full data refresh is triggered **only** if the server returns an explicit error (Rollback on Failure).

---

## 6. Binary Multipart Streaming vs. Base64 Memory Overhead

### The Problem:
- Encoding 1080p food photos as Base64 strings introduces a **33% data transfer penalty** (a 3MB image becomes 4MB).
- In React Native (Hermes engine), instantiating large Base64 strings causes sudden heap allocation spikes, triggering GC pauses and frame drops on low-to-mid-tier mobile hardware.

### The Technical Solution:
1. **Binary `multipart/form-data`**:
   - Images are uploaded as native binary streams via `FormData`, avoiding Base64 encoding completely.
2. **Progressive XHR Upload Tracking**:
   - Uses `XMLHttpRequest.upload.onprogress` and `onload` to track exact socket-level byte progression.
   - Provides deterministic UI state transitions:
     $$\text{Upload Progress } (0\% \to 100\%) \implies \text{Edge Ingestion} \implies \text{Gemini Multimodal Inference}$$

---

## 7. Fail-Open Architecture & Graceful Degradation

### System Design Principle:
> *A non-critical service failure (e.g. caching or rate-limiting) must never cause a complete outage of core application capabilities.*

### Implementation:
1. **Redis Fail-Open Handler**:
   - All Redis rate-limiting calls are wrapped in defensive `try/catch` blocks.
   - If Upstash Redis experiences network partitions, DNS timeouts, or outage, the error is logged as a warning (`console.warn`) and the request is permitted through ("Fail-Open").
2. **Database Fallback for Health Connect**:
   - If Google Health Connect permissions are revoked or unavailable, the system transparently falls back to stored database step records without crashing dashboard components.

---

## 8. Multi-Layer Defensive Validation (Client $\to$ Edge $\to$ Database)

```
[Mobile Client]             [Supabase Edge Function]          [PostgreSQL Database]
  • Input Masking             • Payload Size Check (<3MB)       • Check Constraints
  • Char Limits (10-1000)     • Cryptographic JWT Auth          • Foreign Key Cascades
  • >0 Calorie Filtering      • String Trimming & Bounds        • Transactional RPC
  • Optimistic Dedupe         • Redis Sliding Window            • Atomic UPSERTs
```

1. **Client Layer**:
   - Validates character bounds (Title 3–100, Description 10–1,000) and suppresses save actions on empty/0-calorie meals.
2. **Edge Function Layer**:
   - Rejects payloads exceeding 3MB before Deno allocates memory (`Content-Length` inspection).
   - Validates types against strict schema (`'bug' | 'feedback'`).
3. **Database Layer (ACID Guarantees)**:
   - Table-level `CHECK (char_length(title) >= 3 AND char_length(title) <= 100)`.
   - `insert_meal_transaction` executes atomically: inserts meal header, loops through food items, filters zero/negative quantities, and updates `daily_summaries` inside a single database transaction.

---

## 9. Circuit Breaker Pattern for External Service Outages

### What is a Circuit Breaker?
A distributed resilience design pattern that wraps remote calls (specifically Google Gemini AI API in `scan-food` and `log-exercise`). It monitors upstream failure rates across three distinct states:
1. **CLOSED**: Requests flow normally. Upstream errors are tracked consecutively.
2. **OPEN**: When 3 consecutive upstream outages (`500, 502, 503, 504, 429, fetch timeouts`) occur, the circuit trips **OPEN**. For the next 30 seconds, subsequent requests **fail fast in $<1\text{ ms}$** without calling Google Gemini or holding open worker connections.
3. **HALF-OPEN (Self-Healing Probe)**: After the 30-second cooldown expires, a single probe request is permitted through:
   - **Probe Succeeds**: Circuit automatically resets to **CLOSED**, instantly restoring AI analysis for all users without admin intervention.
   - **Probe Fails**: Circuit immediately trips back to **OPEN** for another 30-second cooldown.

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Open : 3 Consecutive Outages (5xx / 429 / Timeout)
    Open --> HalfOpen : Cooldown Timer Expires (30s)
    HalfOpen --> Closed : Probe Request Succeeds (Self-Healed)
    HalfOpen --> Open : Probe Request Fails (Reset 30s Cooldown)
```

### Production Implementation Details:
- **Shared Module**: [`supabase/functions/_shared/circuitBreaker.ts`](file:///c:/SDProjects/macro-tracker/supabase/functions/_shared/circuitBreaker.ts)
- **Functions Protected**:
  - `scan-food`: AI food photo identification and multimodal nutrition estimation.
  - `log-exercise`: Natural language exercise estimation and MET calculation.
- **Cross-Isolate Redis State Sync**:
  - Redis key `circuit:<service>:state` (`SETEX` with 35s TTL) coordinates circuit state across all warm and cold edge function instances.
  - Local in-memory isolate state ensures sub-millisecond check times ($<1\text{ ms}$).
- **Fail-Fast Response Contract**:
  - Returns `HTTP 503 Service Unavailable` with `Retry-After: <seconds>`:
  ```json
  {
    "error": "AI estimation is temporarily experiencing high demand. Please use Quick Add or retry in 30s.",
    "circuit_open": true,
    "retry_after_seconds": 30
  }
  ```

---

## 10. Database Indexing & Concurrency Controls

All tables and foreign key relationships are optimized via Migration `021_performance_indices.sql` to eliminate sequential table scans ($O(N) \to O(\log N)$):

| Table | Index / Constraint | Query Accelerated | Engineering Rationale |
| :--- | :--- | :--- | :--- |
| `meal_food` | `(meal_id)` | `meal_entries(*, meal_food(*))` | Foreign keys are not auto-indexed in PostgreSQL. Eliminates full table scan on nested relational join. |
| `meal_food` | `(user_id)` | `meal_food WHERE user_id = ...` | Optimizes user-level food item lookups and RLS policy verification. |
| `meal_entries` | `(user_id, summary_date, created_at ASC)` | Daily dashboard meal logs | Compound index matching `summary_date` with chronological ordering in a single index scan. |
| `meal_entries` | `(user_id, created_at ASC)` | Timeline history queries | Optimizes user-level chronological history queries and pagination. |
| `daily_summaries` | `UNIQUE (user_id, summary_date)` | Daily aggregate retrieval | Enables atomic `INSERT ... ON CONFLICT DO UPDATE` for lock-free aggregate calculation. |
| `exercises` | `(user_id, exercise_date)` | Daily exercise section | Sub-millisecond lookup for exercises matching `(user_id, exercise_date)`. |
| `exercises` | `UNIQUE (user_id, external_id)` | Wearable / Health Connect sync | Prevents duplicate step syncs on repeated app launches via atomic upsert conflict handling. |
| `weight_logs` | `(user_id, recorded_at ASC)` | 30-day analytics charts | Optimizes dynamic date range scans (`recorded_at >= thirtyDaysAgo`) for charting. |
| `recent_foods` | `(user_id, last_used_at DESC)` | Quick-add suggestions | Directly satisfies `ORDER BY last_used_at DESC LIMIT 10` without in-memory sorting. |
| `user_ai_settings`| `(user_id)` | Edge function auth checks | Fast-path retrieval of custom Gemini API keys before AI invocation. |
| `feedback_submissions` | `(user_id, created_at DESC)` | User submission history | Per-user rate audit and chronological history queries. |
| `feedback_submissions` | `(status, type)` | Admin triage board | Enables sub-millisecond filtering for open bugs vs feedback items. |

