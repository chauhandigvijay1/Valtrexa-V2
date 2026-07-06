<p align="center">
<picture>

<source media="(prefers-color-scheme: dark)" srcset="docs/assets/favicon.svg">

<img src="assets/favicon.svg" alt="Valtrexa V2" width="64" height="64">

</picture>
</p>

<h1 align="center">📄 AI Architecture — VALTREXA-V2</h1><p align="center">  <strong>Version:</strong> v1.0.1 •  <strong>Last Updated:</strong> 2026-07-05 •  <strong>Category:</strong> AI & Machine Learning</p>
**Description:**  Multi-provider AI abstraction layer with Gemini → Groq → OpenRouter fallback chain, structured output generation, and per-provider metrics monitoring

---

## Table of Contents
- [Overview](#overview)
- [Multi-Provider Strategy](#multi-provider-strategy)
- [AI Provider Abstraction](#ai-provider-abstraction)
- [Model Capabilities](#model-capabilities)
- [AI Use Cases](#ai-use-cases)
- [Fallback Chain](#fallback-chain)
- [OpenRouter Free Model Chain](#openrouter-free-model-chain)
- [Metrics & Monitoring](#metrics--monitoring)
- [Best Practices](#best-practices)
- [Related Documents](#related-documents)

---

## Overview

VALTREXA-V2 uses a **multi-provider AI abstraction layer** with a fixed fallback order of **Gemini → Groq → OpenRouter**.

The system dynamically routes requests through the provider chain, attempting each provider in sequence until one succeeds or all fail.

## AI Workflow & Data Flow

```mermaid
flowchart TD    USER_INPUT["User Input<br/>
Resume, Preferences,<br/>
Job Listings"] --> PREPROCESS["Preprocessing<br/>
Text Extraction,<br/>
Schema Preparation"]    PREPROCESS --> ROUTER["AiProviderChain<br/>
Request Router"]    ROUTER --> PRIMARY{"Gemini<br/>
gemini-2.5-pro"}    PRIMARY -->
|"Success"
| RESPONSE["Structured Output<br/>
JSON Response"]    PRIMARY -->
|"Failure"
| FALLBACK1{"Groq<br/>
llama-3.3-70b-versatile"}    FALLBACK1 -->
|"Success"
| RESPONSE    FALLBACK1 -->
|"Failure"
| FALLBACK2{"OpenRouter<br/>
gpt-4o-mini"}    FALLBACK2 -->
|"Success"
| RESPONSE    FALLBACK2 -->
|"Failure"
| ERROR["AggregateError<br/>
All providers failed"]    RESPONSE --> VALIDATE["Schema Validation<br/>
generateJson<T>()"]    VALIDATE --> STORE["Persist to DB<br/>
ai_generations log"]    STORE --> CONSUMERS["AI Consumers"]    CONSUMERS --> RESUME["Resume Parser<br/>
Skills & Experience Extraction"]    CONSUMERS --> MATCH["Match Engine<br/>
8-Factor Job Scoring"]    CONSUMERS --> HIGH_VALUE["High-Value Engine<br/>
Company Assessment"]    CONSUMERS --> OUTREACH["Outreach Generator<br/>
Personalized Messages"]    CONSUMERS --> INBOX["Inbox Intelligence<br/>
Email Classification"]    CONSUMERS --> FOLLOWUP["Follow-up Engine<br/>

Cadence Scheduling"]
```

---

## Multi-Provider Strategy
| Provider
| Priority
| Default Model
| Best For
|
|

---

|

---

|

---

|

---

|
| Gemini
| Primary
| `gemini-2.5-pro`
| Complex reasoning, multimodal, structured JSON
|
| Groq
| Fallback 1
| `llama-3.3-70b-versatile`
| High-speed inference, cost-effective throughput
|
| OpenRouter
| Fallback 2
| `openai/gpt-4o-mini`
| Broad model selection, free-tier models
|

Each provider is configurable via environment variables (`GEMINI_MODEL`, `GROQ_MODEL`, `OPENROUTER_MODEL_PREFERRED`).

---

## AI Provider AbstractionAll providers implement the unified `AiProvider` interface:
```
typescriptexport interface Ai

Provider {  readonly name: string;  generateText(    messages: AiMessage[],    opts?: { model?: string; temperature?: number }  ): Promise<AiTextResult>;  generateJson<T>(    messages: AiMessage[],    schemaName: string,    schema: Record<string, unknown>,    opts?: { model?: string }  ): Promise<AiJsonResult<T>>;  healthCheck(): Promise<boolean>;  getMetrics(): ProviderMetrics;  resetMetrics(): void;}
```


## Core Capabilities
| Feature
| Description
|
|

---

|

---

|
| **Unified interface**
| All providers implement the same contract — swap providers without changing consumer code
|
| **Structured JSON generation**
| `generateJson<T>()` with schema validation for deterministic structured output
|
| **Health checking**
| `healthCheck()` for proactive provider monitoring before routing requests
|
| **

Metrics tracking**
| Per-provider call counts, latency, availability — exposed via `getMetrics()`
|

## ProviderMetrics
```
typescriptexport type ProviderMetrics = {  totalCalls: number;  successfulCalls: number;  failedCalls: number;  avgLatencyMs: number;  lastUsedAt:

Date
| null;  isAvailable: boolean;};
```

---

## Model Capabilities

## Default Models per Provider
| Env Variable
| Default Model
| Provider
| Use Case
|
|

---

|

---

|

---

|

---

|
| `GEMINI_MODEL`
| `gemini-2.5-pro`
| Gemini
| Complex reasoning, multimodal, high-accuracy JSON
|
| `GROQ_MODEL`
| `llama-3.3-70b-versatile`
| Groq
| High-speed inference, batch processing
|
| `OPENROUTER_MODEL_PREFERRED`
| `openai/gpt-4o-mini`
| OpenRouter
|

General purpose, cost-effective, free-tier access
|

## OpenRouter Model SelectionOpenRouter aggregates multiple model providers through a single API endpoint.
The system supports:
| Model
| Source
| Best For
|
|

---

|

---

|

---

|
| `openai/gpt-4o-mini`
| OpenAI
| General purpose (default)
|
| `openai/gpt-4o`
| OpenAI
| Complex reasoning, outreach generation
|
| `anthropic/claude-3.5-sonnet`
| Anthropic
| Nuanced writing, analysis
|
| `google/gemini-2.5-pro`
| Google
| Multimodal tasks
|
| `deepseek/deepseek-v3`
| Deep

Seek
| Cost-effective alternative
|

---

## AI

Use Cases

## 1. Resume Parsing & Analysis
```
mermaidgraph LR    A[PDF/Word Resume] --> B[Text Extraction<br/>
pdf-parse / mammoth]    B --> C[AI Parsing via Gemini]    C --> D[Structured Output]    D --> E[Skills]    D --> F[Experience]    D --> G[Education]    D --> H[Projects]
```
- Extract structured data from uploaded resumes (PDF, DOCX)-

Identify skills, experience duration, education history, and project highlights- Auto-detect skill gaps against target roles using candidate brain analysis

## 2. Job Match Scoring8-factor AI-powered matching with configurable weights:
| Factor
| Weight
| Description
|
|

---

|

---

|

---

|
| Skills
| 0.32
| Semantic overlap between job requirements and candidate skills
|
| Role
| 0.20
| Title and responsibility alignment
|
| Experience
| 0.16
| Years of experience fit for the level
|
| Location
| 0.10
| Remote/hybrid/onsite compatibility
|
| Salary
| 0.07
| Within candidate's preferred range
|
| Freshness
| 0.07
| Recency of job posting decay
|
| Company Quality
| 0.05
| Industry reputation and culture fit
|
| Recruiter
| 0.03
|

Recruiter engagement signal
|Threshold: default 70% (configurable via `matchThresholdPercent`).

## 3. High-Value Company AssessmentStrategic value scoring using:- Hiring signals and growth indicators- Funding data and market position analysis- Open job count and hiring velocity- Recruiter density per company-

Tech stack relevance- AI-powered strategic assessment via Gemini

## 4. Outreach Generation- Personalized email drafts based on company research and candidate brain- LinkedIn DM message crafting with tone customization-

Loom video script generation for high-value targets- Context-aware personalization using pain points and recent news

## 5. Inbox ClassificationAutomatic Gmail message classification (single-mailbox Gmail OAuth):
| Classification
| Description
|
|

---

|

---

|
| `interview`
| Interview invitation
|
| `assessment`
| Technical assessment received
|
| `offer`
| Job offer received
|
| `rejection`
| Application rejected
|
| `recruiter_reply`
| Recruiter response to outreach
|
| `other`
|

Unclassified / general
|

## 6. Follow-up Generation- Context-aware follow-up messages referencing previous conversation history- 3-cadence system: Day 3, Day 7, Day 14- Automatic scheduling via followup worker-

Application and recruiter follow-up variants

---

## Fallback ChainThe `AiProviderChain` class orchestrates provider fallback.
The default chain is **Gemini → Groq → OpenRouter**:
```
typescriptexport class AiProviderChain {  private providers: AiProvider[];  private metrics: {    totalCalls: number;    fallbacksUsed: number;    totalFailures: number;  };  constructor(providers: AiProvider[]) {    this.providers = providers;    this.metrics = { totalCalls: 0, fallbacksUsed: 0, totalFailures: 0 };  }  static createDefault(): AiProviderChain {    return new AiProviderChain([      new GeminiProvider(),      new GroqProvider(),      new OpenRouterProvider(),    ]);  }  async generateText(    messages: AiMessage[],    opts?: { model?: string; temperature?: number },  ): Promise<AiTextResult> {    this.metrics.totalCalls++;    const errors: { provider: string; error: string }[] = [];    for (const provider of this.providers) {      try {        return await provider.generateText(messages, opts);      } catch (error) {        errors.push({ provider: provider.name, error: (error as Error).message });        continue;      }    }    throw new AggregateError(      errors,      "

All AI providers failed in chain",    );  }}
```


## Fallback Behavior
| Scenario
| Behavior
|
|

---

|

---

|
| Gemini succeeds
| Returns immediately, no fallback
|
| Gemini fails → Groq succeeds
| `fallbacksUsed` incremented, result from Groq
|
| Gemini + Groq fail → OpenRouter succeeds
| `fallbacksUsed` incremented, result from OpenRouter
|
|

All three fail
| `AggregateError` thrown with per-provider errors
|

---

## OpenRouter Free Model ChainWhen using OpenRouter's free tier, the system cycles through a predefined model chain if rate limits are hit:
```
typescriptconst FREE_MODEL_CHAIN = [  "google/gemma-4-26b-a4b-it:free",  "qwen/qwen3-next-80b-a3b-instruct:free",  "nvidia/nemotron-nano-9b-v2:free",] as const;
```
The chain is used as follows:1. `OPENROUTER_MODEL_PREFERRED` is tried first (if set and free)2. Falls through `FREE_MODEL_CHAIN` entries on rate-limit errors3.

Deduplicates models to avoid redundant attempts

---

## Metrics & MonitoringEach provider maintains independent metrics accessible via `getMetrics()`:
| Metric
| Type
| Description
|
|

---

|

---

|

---

|
| `totalCalls`
| number
| Cumulative request count
|
| `successfulCalls`
| number
| Requests returning 200-level responses
|
| `failedCalls`
| number
| Network errors, timeouts, API errors
|
| `avgLatencyMs`
| number
| Mean response time in milliseconds
|
| `lastUsedAt`
| Date \
| null
| Timestamp of last successful call
|
| `isAvailable`
| boolean
| Current health status from `healthCheck()`
|Metrics are used for:
- **Provider health monitoring** — automatic failover when `isAvailable` is false
- **Cost optimization** — tracking per-provider usage for cost allocation
- **Performance benchmarking** — latency comparison across providers
> [!NOTE]
> Metrics reset on server restart unless persisted externally.

Use `resetMetrics()` to clear counters.

---

## Best Practices
- **Always use structured JSON generation**: Leverage `generateJson<T>()` with schema validation instead of unstructured text parsing.
This ensures deterministic output that can be type-checked at compile time.
- **Implement health checks before routing**: Call `healthCheck()` on providers before routing requests to avoid unnecessary failures. Cache health status with a short TTL to reduce overhead.
- **Treat AI providers as infrastructure**: No single provider is guaranteed to be available. Always use the fallback chain (Gemini → Groq → OpenRouter) and never hardcode a single provider dependency.
- **Audit every AI call**: Log all generations to the `ai_generations` table with provider, model, prompt, response, token counts, and cost for debugging and cost allocation.
- **Configure model selection via environment variables**: Use `GEMINI_MODEL`, `GROQ_MODEL`, and `OPENROUTER_MODEL_PREFERRED` to override default models without code changes.
- **Monitor per-provider metrics**:

Track `totalCalls`, `successfulCalls`, `failedCalls`, and `avgLatencyMs` to identify provider degradation and optimize routing decisions.

---

## Related Documents
- [Architecture](ARCHITECTURE.md) — System design overview
- [Backend Architecture](BACKEND.md) — Backend modules including AI layer
- [Environment Variables](ENVIRONMENT.md) — AI provider configuration
- [Workflow](WORKFLOW.md) — Pipeline orchestration using AI modules

---

<br/>
<div align="center">
  <strong>Next Reading:</strong> <a href="WORKFLOW.md">Workflow Engine →</a>
</div>
