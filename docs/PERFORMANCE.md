<p align="center">

<picture>

<source media="(prefers-color-scheme: dark)" srcset="docs/assets/favicon.svg">

<img src="assets/favicon.svg" alt="Valtrexa V2" width="64" height="64">

</picture>

</p>

<h1 align="center">📄 Performance & Scalability</h1><p align="center">
<strong>
Version:
</strong>
v1.0.1 •
<strong>
Last Updated:
</strong>
2026-07-05 •
<strong>
Category:
</strong>
Infrastructure & Optimization</p>
**Description:** Performance considerations, optimizations, caching strategy, and scalability architecture for the VALTREXA-V2 platform.

---

## Table of Contents
- [Overview](#overview)
- [API Performance](#api-performance)
- [SSR Optimization](#ssr-optimization)
- [Database Performance](#database-performance)
- [Queue Performance](#queue-performance)
- [Caching Strategy](#caching-strategy)
- [Browser Automation Performance](#browser-automation-performance)
- [Performance Bottlenecks](#performance-bottlenecks)
- [Scalability](#scalability)
- [Best Practices](#best-practices)
- [Related Documents](#related-documents)

---

## OverviewVALTREXA-V2 is designed for **single-user performance with multi-tenant scalability**.
The architecture optimizes for the primary use case — automated job search workflows across **8 phases** — while supporting multiple concurrent users through Supabase RLS isolation and queue-based background processing.

The platform comprises **83+ API endpoints**, **59 backend modules**, **46 shadcn/ui components**, **21 authenticated routes**, and manages **7 BullMQ queues** with **9 provider integrations**.
> [!NOTE]
> Performance tuning should follow a measurement-driven approach. Always profile before optimizing.
The decision tree below guides common optimization decisions.


## Performance Optimization

Decision Tree
```mermaid
graph TD    A[Identify Performance Issue] --> B{Is it a<br/>
query bottleneck?}    B -->
|Yes
| C[Check query plan<br/>
with EXPLAIN ANALYZE]    C --> D{Index being used?}    D -->
|No
| E[Add missing index<br/>
on user_id, status, created_at]    D -->
|Yes
| F[Optimize query or<br/>
denormalize schema]    B -->
|No
| G{Is it an<br/>
API response issue?}    G -->
|Yes
| H[Check rate limiting<br/>
& caching layers]    H --> I{Response cached?}    I -->
|No
| J[Add TanStack Query<br/>
stale-while-revalidate cache]    I -->
|Yes
| K[Verify SSR streaming<br/>
is enabled]    B -->
|No
| L{Is it a<br/>
browser automation issue?}    L -->
|Yes
| M[Profile Playwright<br/>
execution timeline]    M --> N{Selector failing?}    N -->
|Yes
| O[Add self-healing<br/>
3-tier fallback selectors]    N -->
|No
| P[Adjust concurrency or<br/>
timeout settings]    B -->
|No
| Q{Is it an<br/>
AI generation issue?}    Q -->
|Yes
| R[Check fallback chain<br/>
& streaming support]    R --> S[Use faster model or<br/>
enable streaming responses]    Q -->
|No
| T[Check infrastructure scaling]    T --> U[Scale Vercel / Railway / Redis]
```

---

## API Performance


## Rate Limiting
| Setting
| Default
|

Purpose
|
|

---

|

---

|

---

|
| Window
| 60 seconds
| Prevents abuse
|
| Max requests
| 100 per window
| Fair resource allocation across users
|
| Scope
| Per-IP address
| Distributed protection
|
| Storage
| In-memory
| Acceptable for serverless; resets on cold start
|Rate limits are enforced at the middleware level before any business logic executes, ensuring minimal overhead for blocked requests.

---

## SSR OptimizationThe Vercel SSR deployment ensures optimal performance through:
| Optimization
| Implementation
|

Benefit
|
|

---

|

---

|

---

|
| Edge-cached static assets
| `dist/client/` served via CDN
| Near-zero latency for JS/CSS
|
| Streaming SSR
| TanStack Start streaming
| Progressive page rendering, faster TTFB
|
| Cold start mitigation
| Vercel Pro plan (serverless concurrency)
| Reduced function initialization latency
|
| Route-based code splitting
| TanStack Start file-based routing
| Load only what's needed per page
|

---

## Database Performance


## Indexing Strategy

All user-scoped queries use indexes on `user_id`, `created_at`, and status columns:
```
sql
-- Workflow state query optimizationCREATE INDEX idx_workflow_state_user_status ON workflow_state(user_id, status);CREATE INDEX idx_workflow_state_updated_at ON workflow_state(updated_at);-- Job match query optimizationCREATE INDEX idx_jobs_user_provider ON jobs(user_id, provider);CREATE INDEX idx_jobs_match_score ON jobs(user_id, match_score DESC);-- Provider cookies queryCREATE INDEX idx_provider_cookies_user ON provider_cookies(user_id, provider);
```


## Query Optimization-

Service role queries always include `.eq("user_id", userId)` — enables index usage
- **28 migration files** create and maintain **70 tables** with schema-optimized indexes- `NOTIFY pgrst, 'reload schema'` after migrations for PostgREST cache refresh- All queries are parameterized to prevent sequential scans


## Migration Count**28 migration files** create and maintain **70 tables** with optimized schemas, indexes, and RLS policies.

---

## Queue Performance


## BullMQ Queue Architecture7 named queues with configurable concurrency:
| Queue
| Concurrency
|

Purpose
|
|

---

|

---

|

---

|
| `job-import`
| 1
| Import jobs from providers
|
| `apply`
| 2
| Playwright application submission
|
| `recruiter`
| 1
| Recruiter discovery
|
| `outreach`
| 1
| Outreach generation
|
| `followup`
| 1
| Follow-up processing
|
| `gmail`
| 1
| Gmail inbox sync
|
| `analytics`
| 1
| Analytics computation
|


## Inline FallbackWhen Redis is unavailable, queues degrade to **inline execution** — the job runs in the same process.
This ensures:- Zero downtime when Redis is unreachable- Serverless compatibility (Vercel — no persistent Redis required)-

Graceful degradation without error pages or failed jobs


## Distributed LockingThe Railway worker uses Redis `SET NX EX` for distributed locking, preventing duplicate workflow cycles across replicas:-

Lock key: `lock:workflow:{userId}`- TTL: 5 minutes (workflow cycle completes within this window)- Auto-release on completion or failure
> [!IMPORTANT]
> Without Redis, distributed locking is unavailable.
In single-worker deployments this is acceptable, but multi-replica setups require Redis for safe operation.

---

## Caching Strategy


## TanStack Query CacheThe frontend uses TanStack Query for:
| Feature
|

Implementation
|
|

---

|

---

|
| Automatic cache invalidation
| Mutations trigger refetch of related queries
|
| Stale-while-revalidate
| Background updates keep UI responsive
|
| Request deduplication
| Concurrent requests for the same key share one network call
|
| Optimistic updates
| Instant UI feedback on mutations
|


## In-Memory Caching
| Cache
| Location
|

Purpose
|
|

---

|

---

|

---

|
| Redis connection
| `queue.ts`
| Lazy singleton, 2s connect timeout
|
| Queue instances
| `queue.ts`
| BullMQ queue singletons
|
| LRU cache
| Various utilities
| Memory-sensitive caching for parsed data
|
| Rate limiter state
| Middleware
| Per-IP request counts
|

---

## Browser

Automation Performance


## Playwright Optimization
| Technique
|

Benefit
|
|

---

|

---

|
| Persistent Edge profiles
| Reuse authenticated sessions across cycles
|
| Connection reuse
| Single browser context per cycle
|
| Concurrent applications
| 2 parallel apply workers
|
| Timeout management
| 120s per application, 3 retries with exponential backoff
|
| Self-healing selectors
| 3-tier fallback reduces failure retries
|
| Headless mode
| `PLAYWRIGHT_HEADLESS=true` for non-GUI environments
|

---

## Performance Bottlenecks
| Area
| Impact
|

Mitigation
|
|

---

|

---

|

---

|
| Browser startup
| 3-5s cold start
| Persistent profiles, keep-alive
|
| Page navigation
| 2-10s per page
| Connection reuse, timeout management
|
| Form filling
| 5-30s per application
| Self-healing selectors reduce failure retries
|
| Cookie validation
| 1-3s per provider
| HTTP validation, not heuristic parsing
|
| AI generation
| 2-10s per request
| Streaming response, fallback chain, model selection
|
| Migration execution
| 30-60s for all 28
| Run once; incremental changes only
|
| Supabase cold query
| 1-3s first query
| Connection pooling, keep-alive
|

---

## Scalability


## Horizontal Scaling
| Component
| Scaling

Strategy
|
|

---

|

---

|
| **Vercel**
| Auto-scales serverless functions based on traffic; Pro plan reduces cold starts
|
| **Railway**
| Multiple worker replicas with distributed locking (Redis `SET NX EX`)
|
| **Supabase**
| Managed PostgreSQL with connection pooling; upgrade plan for more connections
|
| **Redis**
| Upstash or Railway Redis — auto-scaling managed services
|


## Workflow Auto-CleanupWorkflows that are **stale for >2 hours without updates** are auto-stopped.

Key states: `idle`, `running`, `paused`, `stopped`.


## Multi-Tenant Isolation
| Mechanism
|

Implementation
|
|

---

|

---

|
| Row Level Security
| `user_id = auth.uid()` on every table
|
| Service role safety
| All 145+ write operations include `.eq("user_id", userId)` — zero unscoped writes
|
| Telegram binding
| Per-user notification routing
|
| Encrypted cookies
| AES-256-GCM per-user encryption with `COOKIE_ENCRYPTION_KEY`
|

---

## Best Practices
- **Index all user-scoped queries**: Ensure every query includes `.eq("user_id", userId)` to leverage database indexes and avoid sequential scans.
- **Use TanStack Query stale-while-revalidate**: Enable background cache invalidation on all list/detail routes for responsive UI without stale data.
- **Configure inline fallback for queue resilience**: Always design queue consumers to handle inline execution when Redis is unreachable — prevents total system failure.
- **Tune Playwright concurrency carefully**: The `apply` queue uses concurrency 2. Higher values may cause provider rate limiting or IP bans.
- **Set up distributed locking for multi-replica deployments**: Use Redis `SET NX EX` with appropriate TTL to prevent duplicate workflow cycles across worker replicas.
- **Monitor migration execution time**: All 28 migrations should complete within 30-60s. Long-running migrations indicate missing indexes or large datasets.
- **Enforce rate limiting at middleware level**: Block excessive requests before business logic executes to minimize overhead and protect downstream services.

---

## Related Documents
- [Architecture](ARCHITECTURE.md) — System design and data flow
- [Database Schema](DATABASE.md) — Schema design and indexing strategy
- [Deployment Guide](DEPLOYMENT.md) — Infrastructure scaling and configuration
- [Testing Guide](TESTING.md) —

Performance testing approach

---

<br/>
<div align="center">
  <strong>Next Reading:</strong> <a href="SECURITY.md">Security Architecture →</a>
</div>
