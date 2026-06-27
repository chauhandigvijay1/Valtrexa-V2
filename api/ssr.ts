// SSR entry for Vercel — built by scripts/prepare-vercel-ssr.mjs
// @ts-expect-error generated at build time
import serverModule from "./_dist/server.js";

const server = serverModule.default ?? serverModule;

if (!server?.fetch || typeof server.fetch !== "function") {
  throw new Error("Could not load TanStack Start server entry from api/_dist/server.js");
}

const SAFE_ENV: Record<string, string | undefined> = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  NODE_ENV: process.env.NODE_ENV,
  PUBLIC_URL: process.env.PUBLIC_URL,
  FRONTEND_URL: process.env.FRONTEND_URL,
};

export default async function handler(request: Request) {
  return server.fetch(request, SAFE_ENV, undefined);
}
(handler as any).fetch = (request: Request) => server.fetch(request, SAFE_ENV, undefined);

export const fetch = (request: Request) => server.fetch(request, SAFE_ENV, undefined);
