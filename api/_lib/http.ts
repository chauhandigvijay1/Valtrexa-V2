const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || process.env.PUBLIC_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (!origin) return "";
  if (ALLOWED_ORIGINS.length === 0) return origin;
  if (ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) return origin;
  return "";
}

export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "access-control-allow-headers":
        "Content-Type, Authorization, x-telegram-bot-api-secret-token",
      ...(init?.headers ?? {}),
    },
  });
}

export function addCorsHeaders(response: Response, request: Request): Response {
  const origin = corsOrigin(request);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "Content-Type, Authorization, x-telegram-bot-api-secret-token",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handleCorsPreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": corsOrigin(request) || "*",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "access-control-allow-headers":
        "Content-Type, Authorization, x-telegram-bot-api-secret-token",
      "access-control-max-age": "86400",
    },
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function methodNotAllowed(methods: string[]) {
  return json({ error: `Method not allowed. Use ${methods.join(", ")}.` }, { status: 405 });
}

export function getBaseUrl(request: Request): string {
  const fromOrigin = request.headers.get("origin");
  if (fromOrigin) return fromOrigin.replace(/\/+$/, "");
  const fromEnv = process.env.PUBLIC_URL || process.env.FRONTEND_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "http://localhost:5173";
  }
}

export function safeErrorMessage(err: unknown): string {
  return "An unexpected error occurred";
}
