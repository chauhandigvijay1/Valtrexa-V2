import { supabaseAdmin } from "./supabase.js";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const FREE_MODEL_CHAIN = [
  "google/gemma-4-26b-a4b-it:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "nvidia/nemotron-nano-9b-v2:free",
] as const;

function isFreeModel(model?: string | null) {
  return !!model && (model.endsWith(":free") || model === "openrouter/free");
}

async function requestOpenRouter(body: string, apiKey: string) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(90000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://career-compass-pro.local",
      "X-Title": "Career Compass Pro",
    },
    body,
  });
}

async function requestWithFallback(bodyFactory: (model: string) => string, apiKey: string, preferredModel: string) {
  const modelOrder = Array.from(new Set([preferredModel, ...FREE_MODEL_CHAIN]));
  let lastResponse: Response | null = null;
  let lastError: Error | null = null;

  for (const model of modelOrder) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await requestOpenRouter(bodyFactory(model), apiKey);
        if (response.ok) {
          return { response, model };
        }
        lastResponse = response;
        if (![402, 404, 408, 429, 500, 502, 503, 504].includes(response.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        break;
      }
    }
  }

  if (!lastResponse && lastError) {
    throw lastError;
  }

  return { response: lastResponse!, model: preferredModel };
}

async function resolveOpenRouterCredentials(userId?: string) {
  const envApiKey = process.env.OPENROUTER_API_KEY?.trim();
  const envModel = process.env.OPENROUTER_MODEL?.trim();
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      model: envModel || FREE_MODEL_CHAIN[0],
      source: "env" as const,
    };
  }

  if (!userId) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("config,enabled")
    .eq("user_id", userId)
    .eq("provider", "openrouter")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const config = (data?.config ?? {}) as Record<string, string>;
  const apiKey = config.api_key?.trim();
  if (!data?.enabled || !apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  return {
    apiKey,
    model: isFreeModel(config.default_model?.trim()) ? config.default_model.trim() : FREE_MODEL_CHAIN[0],
    source: "integration" as const,
  };
}

export function getOpenRouterModelChain(primary?: string | null) {
  return Array.from(new Set([isFreeModel(primary) ? primary : FREE_MODEL_CHAIN[0], ...FREE_MODEL_CHAIN]));
}

export async function callOpenRouterText(
  messages: OpenRouterMessage[],
  opts?: { model?: string; temperature?: number; userId?: string },
) {
  const credentials = await resolveOpenRouterCredentials(opts?.userId);
  const preferredModel = (isFreeModel(opts?.model) ? opts?.model : credentials.model) ?? FREE_MODEL_CHAIN[0];
  const { response, model: resolvedModel } = await requestWithFallback(
    (model) =>
      JSON.stringify({
        model,
        temperature: opts?.temperature ?? 0.2,
        max_tokens: 4000,
        messages,
      }),
    credentials.apiKey,
    preferredModel,
  );

  if (!response.ok) {
    throw new Error(`OpenRouter request failed with ${response.status}.`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter returned an empty response.");
  }
  return {
    content,
    model: payload?.model ?? resolvedModel,
    usage: payload?.usage ?? null,
    source: credentials.source,
  };
}

function extractJsonObject(text: string) {
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

export async function callOpenRouterJson<T>(
  messages: OpenRouterMessage[],
  schemaName: string,
  schema: Record<string, unknown>,
  opts?: { model?: string; userId?: string },
): Promise<{ data: T; model: string; usage: any; source: "env" | "integration" }> {
  const credentials = await resolveOpenRouterCredentials(opts?.userId);
  const preferredModel = (isFreeModel(opts?.model) ? opts?.model : credentials.model) ?? FREE_MODEL_CHAIN[0];
  const requestBody = (model: string) =>
    JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 4000,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: false,
          schema,
        },
      },
    });

  const { response, model: resolvedModel } = await requestWithFallback(
    (model) => requestBody(model),
    credentials.apiKey,
    preferredModel,
  );

  if (!response.ok) {
    throw new Error(`OpenRouter structured request failed with ${response.status}.`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    try {
      return {
        data: JSON.parse(content) as T,
        model: payload?.model ?? resolvedModel,
        usage: payload?.usage ?? null,
        source: credentials.source,
      };
    } catch {
      try {
        return {
          data: JSON.parse(extractJsonObject(content)) as T,
          model: payload?.model ?? resolvedModel,
          usage: payload?.usage ?? null,
          source: credentials.source,
        };
      } catch {
        // fall through to text fallback
      }
    }
  }

  const textFallback = await callOpenRouterText(
    [
      ...messages,
      {
        role: "user",
        content:
          "Return JSON only. Do not wrap it in markdown. Ensure it matches the previously requested schema exactly.",
      },
    ],
    { model: preferredModel, temperature: 0.1, userId: opts?.userId },
  );

  try {
    return {
      data: JSON.parse(extractJsonObject(textFallback.content)) as T,
      model: textFallback.model,
      usage: textFallback.usage,
      source: textFallback.source,
    };
  } catch {
    throw new Error("OpenRouter returned invalid structured output.");
  }
}
