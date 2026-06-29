import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

export function loadEnv(): void {
  const _dirname = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(_dirname, "..", "..");

  config({ path: resolve(projectRoot, ".env") });
  config({ path: resolve(projectRoot, ".env.local"), override: true });
}

export function validateEnv(): void {
  const REQUIRED = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SESSION_SECRET",
    "TELEGRAM_BOT_TOKEN",
  ] as const;

  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Set them in .env or .env.local before starting.",
    );
  }

  if (
    (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY) &&
    !process.env.SUPABASE_URL
  ) {
    logger.warn(
      "[env] SUPABASE_PUBLISHABLE_KEY set but SUPABASE_URL missing — frontend auth may fail.",
    );
  }

  if (process.env.NODE_ENV === "production") {
    if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
      logger.warn(
        "[env] TELEGRAM_WEBHOOK_SECRET not set — webhook validation is disabled. Set it to prevent unauthorized webhook calls.",
      );
    }
    if (!process.env.COOKIE_ENCRYPTION_KEY) {
      logger.warn(
        "[env] COOKIE_ENCRYPTION_KEY not set — cookie encryption will use a derived key (SHA-256 of empty string). Set a strong random value.",
      );
    }
  }

  if (process.env.NODE_ENV === "production" && !process.env.COOKIE_ENCRYPTION_KEY) {
    logger.warn(
      "[env] Without COOKIE_ENCRYPTION_KEY, stored cookies can be decrypted by anyone who knows SHA-256(''). Set COOKIE_ENCRYPTION_KEY to a random 32+ character value.",
    );
  }
}

/** Absolute path to the Microsoft Edge Stable executable (set via EDGE_PATH), if any. */
export function getEdgePath(): string | undefined {
  return process.env.EDGE_PATH;
}

/** Directory for persistent Edge user profile data (set via EDGE_USER_DATA_DIR), if any. */
export function getEdgeUserDataDir(): string | undefined {
  return process.env.EDGE_USER_DATA_DIR;
}

/** Edge profile directory name (set via EDGE_PROFILE_DIRECTORY), defaults to "Default". */
export function getEdgeProfileDirectory(): string {
  return process.env.EDGE_PROFILE_DIRECTORY || "Default";
}
