import { callOpenRouterJson, callOpenRouterText } from "./openrouter.js";
import { logger } from "./logger.js";

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiTextResult = {
  content: string;
  model: string;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  provider: string;
  latencyMs: number;
};

export type AiJsonResult<T = unknown> = {
  data: T;
  model: string;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  provider: string;
  latencyMs: number;
};

export type ProviderMetrics = {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  avgLatencyMs: number;
  lastUsedAt: Date | null;
  isAvailable: boolean;
};

export interface AiProvider {
  readonly name: string;
  generateText(
    messages: AiMessage[],
    opts?: { model?: string; temperature?: number },
  ): Promise<AiTextResult>;
  generateJson<T>(
    messages: AiMessage[],
    schemaName: string,
    schema: Record<string, unknown>,
    opts?: { model?: string },
  ): Promise<AiJsonResult<T>>;
  healthCheck(): Promise<boolean>;
  getMetrics(): ProviderMetrics;
  resetMetrics(): void;
}

type ProviderState = {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalLatencyMs: number;
  lastUsedAt: Date | null;
  isAvailable: boolean;
};

function newProviderState(): ProviderState {
  return {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    totalLatencyMs: 0,
    lastUsedAt: null,
    isAvailable: true,
  };
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  private state = newProviderState();

  private getApiKey(): string {
    return process.env.GEMINI_API_KEY?.trim() ?? "";
  }

  private getModel(): string {
    return process.env.GEMINI_MODEL?.trim() ?? "gemini-2.5-pro";
  }

  private async request(
    messages: AiMessage[],
    opts?: { model?: string; temperature?: number },
  ): Promise<{ content: string; model: string; latencyMs: number }> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const model = opts?.model ?? this.getModel();
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Gemini requires alternating user/model turns; flatten system into first user turn
    const systemMsg = messages.find((m) => m.role === "system");
    const body: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: opts?.temperature ?? 0.2, maxOutputTokens: 4000 },
    };
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    const start = Date.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000),
      },
    );
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const payload = await res.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Gemini returned an empty response.");
    }

    return { content: text, model: payload?.modelVersion ?? model, latencyMs };
  }

  async generateText(
    messages: AiMessage[],
    opts?: { model?: string; temperature?: number },
  ): Promise<AiTextResult> {
    const start = Date.now();
    this.state.totalCalls++;
    try {
      const result = await this.request(messages, opts);
      this.state.successfulCalls++;
      this.state.totalLatencyMs += result.latencyMs;
      this.state.lastUsedAt = new Date();
      return {
        content: result.content,
        model: result.model,
        usage: { total_tokens: 0 },
        provider: this.name,
        latencyMs: result.latencyMs,
      };
    } catch (err) {
      this.state.failedCalls++;
      throw err;
    }
  }

  async generateJson<T>(
    messages: AiMessage[],
    schemaName: string,
    schema: Record<string, unknown>,
    opts?: { model?: string },
  ): Promise<AiJsonResult<T>> {
    const start = Date.now();
    this.state.totalCalls++;
    try {
      const systemMsg = messages.find((m) => m.role === "system");
      const userContent = [
        ...(systemMsg ? [{ text: systemMsg.content }] : []),
        ...messages.filter((m) => m.role !== "system").map((m) => ({ text: m.content })),
      ];
      const model = opts?.model ?? this.getModel();
      const apiKey = this.getApiKey();

      const body: Record<string, unknown> = {
        contents: [{ role: "user", parts: userContent }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
      };

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90000),
        },
      );
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        throw new Error(`Gemini structured request failed with ${res.status}: ${errText}`);
      }

      const payload = await res.json();
      const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string" || !text.trim()) {
        throw new Error("Gemini returned an empty response.");
      }

      const extracted = extractJsonObject(text);
      const data = JSON.parse(extracted) as T;

      this.state.successfulCalls++;
      this.state.totalLatencyMs += latencyMs;
      this.state.lastUsedAt = new Date();

      return {
        data,
        model: payload?.modelVersion ?? model,
        usage: { total_tokens: 0 },
        provider: this.name,
        latencyMs,
      };
    } catch (err) {
      this.state.failedCalls++;
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.generateText(
        [{ role: "user", content: "respond with just the word ok" }],
        { temperature: 0 },
      );
      return result.content.toLowerCase().includes("ok");
    } catch (err) {
      logger.warn("[AIProvider] healthCheck failed", err);
      return false;
    }
  }

  getMetrics(): ProviderMetrics {
    const { totalCalls, successfulCalls, failedCalls, totalLatencyMs, lastUsedAt } = this.state;
    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      avgLatencyMs: successfulCalls > 0 ? Math.round(totalLatencyMs / successfulCalls) : 0,
      lastUsedAt,
      isAvailable: this.state.isAvailable,
    };
  }

  resetMetrics(): void {
    this.state = newProviderState();
  }
}

export class GroqProvider implements AiProvider {
  readonly name = "groq";
  private state = newProviderState();

  private getApiKey(): string {
    return process.env.GROQ_API_KEY?.trim() ?? "";
  }

  private getModel(): string {
    return process.env.GROQ_MODEL?.trim() ?? "llama-3.3-70b-versatile";
  }

  private async request(
    messages: AiMessage[],
    opts?: { model?: string; temperature?: number },
  ): Promise<{ content: string; model: string; usage: any; latencyMs: number }> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("GROQ_API_KEY not configured");

    const model = opts?.model ?? this.getModel();
    const start = Date.now();
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: opts?.temperature ?? 0.2,
        max_tokens: 4000,
        messages,
      }),
      signal: AbortSignal.timeout(90000),
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`Groq API error ${res.status}: ${errText}`);
    }

    const payload = await res.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Groq returned an empty response.");
    }

    return { content, model: payload?.model ?? model, usage: payload?.usage ?? null, latencyMs };
  }

  async generateText(
    messages: AiMessage[],
    opts?: { model?: string; temperature?: number },
  ): Promise<AiTextResult> {
    const start = Date.now();
    this.state.totalCalls++;
    try {
      const result = await this.request(messages, opts);
      this.state.successfulCalls++;
      this.state.totalLatencyMs += result.latencyMs;
      this.state.lastUsedAt = new Date();
      return {
        content: result.content,
        model: result.model,
        usage: result.usage,
        provider: this.name,
        latencyMs: result.latencyMs,
      };
    } catch (err) {
      this.state.failedCalls++;
      throw err;
    }
  }

  async generateJson<T>(
    messages: AiMessage[],
    schemaName: string,
    schema: Record<string, unknown>,
    opts?: { model?: string },
  ): Promise<AiJsonResult<T>> {
    const start = Date.now();
    this.state.totalCalls++;
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error("GROQ_API_KEY not configured");
      const model = opts?.model ?? this.getModel();

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 4000,
          messages,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(90000),
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        throw new Error(`Groq structured request failed with ${res.status}: ${errText}`);
      }

      const payload = await res.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("Groq returned an empty response.");
      }

      const extracted = extractJsonObject(content);
      const data = JSON.parse(extracted) as T;

      this.state.successfulCalls++;
      this.state.totalLatencyMs += latencyMs;
      this.state.lastUsedAt = new Date();

      return {
        data,
        model: payload?.model ?? model,
        usage: payload?.usage ?? null,
        provider: this.name,
        latencyMs,
      };
    } catch (err) {
      this.state.failedCalls++;
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.generateText(
        [{ role: "user", content: "respond with just the word ok" }],
        { temperature: 0 },
      );
      return result.content.toLowerCase().includes("ok");
    } catch (err) {
      logger.warn("[AIProvider] healthCheck failed", err);
      return false;
    }
  }

  getMetrics(): ProviderMetrics {
    const { totalCalls, successfulCalls, failedCalls, totalLatencyMs, lastUsedAt } = this.state;
    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      avgLatencyMs: successfulCalls > 0 ? Math.round(totalLatencyMs / successfulCalls) : 0,
      lastUsedAt,
      isAvailable: this.state.isAvailable,
    };
  }

  resetMetrics(): void {
    this.state = newProviderState();
  }
}

export class OpenRouterProvider implements AiProvider {
  readonly name = "openrouter";
  private state = newProviderState();

  async generateText(
    messages: AiMessage[],
    opts?: { model?: string; temperature?: number },
  ): Promise<AiTextResult> {
    const start = Date.now();
    this.state.totalCalls++;
    try {
      const result = await callOpenRouterText(messages, {
        model: opts?.model,
        temperature: opts?.temperature,
      });
      const latencyMs = Date.now() - start;
      this.state.successfulCalls++;
      this.state.totalLatencyMs += latencyMs;
      this.state.lastUsedAt = new Date();
      return {
        content: result.content,
        model: result.model,
        usage: result.usage
          ? {
              prompt_tokens: result.usage.prompt_tokens,
              completion_tokens: result.usage.completion_tokens,
              total_tokens: result.usage.total_tokens,
            }
          : null,
        provider: this.name,
        latencyMs,
      };
    } catch (err) {
      this.state.failedCalls++;
      throw err;
    }
  }

  async generateJson<T>(
    messages: AiMessage[],
    schemaName: string,
    schema: Record<string, unknown>,
    opts?: { model?: string },
  ): Promise<AiJsonResult<T>> {
    const start = Date.now();
    this.state.totalCalls++;
    try {
      const result = await callOpenRouterJson<T>(messages, schemaName, schema, {
        model: opts?.model,
      });
      const latencyMs = Date.now() - start;
      this.state.successfulCalls++;
      this.state.totalLatencyMs += latencyMs;
      this.state.lastUsedAt = new Date();
      return {
        data: result.data,
        model: result.model,
        usage: result.usage
          ? {
              prompt_tokens: result.usage.prompt_tokens,
              completion_tokens: result.usage.completion_tokens,
              total_tokens: result.usage.total_tokens,
            }
          : null,
        provider: this.name,
        latencyMs,
      };
    } catch (err) {
      this.state.failedCalls++;
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.generateText(
        [{ role: "user", content: "respond with just the word ok" }],
        { temperature: 0 },
      );
      return result.content.toLowerCase().includes("ok");
    } catch (err) {
      logger.warn("[AIProvider] healthCheck failed", err);
      return false;
    }
  }

  getMetrics(): ProviderMetrics {
    const { totalCalls, successfulCalls, failedCalls, totalLatencyMs, lastUsedAt } = this.state;
    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      avgLatencyMs: successfulCalls > 0 ? Math.round(totalLatencyMs / successfulCalls) : 0,
      lastUsedAt,
      isAvailable: this.state.isAvailable,
    };
  }

  resetMetrics(): void {
    this.state = newProviderState();
  }
}

export class AiProviderChain {
  private providers: AiProvider[];
  private metrics: { totalCalls: number; fallbacksUsed: number; totalFailures: number };

  constructor(providers: AiProvider[]) {
    this.providers = providers;
    this.metrics = { totalCalls: 0, fallbacksUsed: 0, totalFailures: 0 };
  }

  static createDefault(): AiProviderChain {
    return new AiProviderChain([
      new GeminiProvider(),
      new GroqProvider(),
      new OpenRouterProvider(),
    ]);
  }

  async generateText(
    messages: AiMessage[],
    opts?: { model?: string; temperature?: number },
  ): Promise<AiTextResult> {
    this.metrics.totalCalls++;
    const errors: { provider: string; error: string }[] = [];

    for (const provider of this.providers) {
      try {
        return await provider.generateText(messages, opts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ provider: provider.name, error: msg });
      }
    }

    this.metrics.totalFailures++;
    throw new Error(
      `All AI providers failed: ${errors.map((e) => `${e.provider}: ${e.error}`).join("; ")}`,
    );
  }

  async generateJson<T>(
    messages: AiMessage[],
    schemaName: string,
    schema: Record<string, unknown>,
    opts?: { model?: string },
  ): Promise<AiJsonResult<T>> {
    this.metrics.totalCalls++;
    const errors: { provider: string; error: string }[] = [];

    for (const provider of this.providers) {
      try {
        return await provider.generateJson<T>(messages, schemaName, schema, opts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ provider: provider.name, error: msg });
      }
    }

    this.metrics.totalFailures++;
    throw new Error(
      `All AI providers failed for structured output: ${errors.map((e) => `${e.provider}: ${e.error}`).join("; ")}`,
    );
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const provider of this.providers) {
      results[provider.name] = await provider.healthCheck();
    }
    return results;
  }

  getMetrics() {
    return {
      ...this.metrics,
      providerMetrics: Object.fromEntries(this.providers.map((p) => [p.name, p.getMetrics()])),
    };
  }
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}
