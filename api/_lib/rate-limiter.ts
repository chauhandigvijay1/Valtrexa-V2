const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
const maxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

const hits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count++;
  return {
    allowed: entry.count <= maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

export function rateLimitKey(request: Request): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  const ip = xForwardedFor?.split(",")[0]?.trim() || "unknown";
  return `ratelimit:${ip}`;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) hits.delete(key);
  }
}, 60000);
