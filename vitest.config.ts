import { defineConfig } from "vitest/config";
import { config } from "dotenv";
config();

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL || "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || "",
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
      TELEGRAM_BOT_TOKEN: "test-telegram-token",
      TELEGRAM_CHAT_ID: "123456789",
      LINKEDIN_COOKIE: "li_at=test-cookie-value",
      SESSION_SECRET: "test-session-secret",
      GMAIL_CLIENT_ID: "test-client-id",
      GMAIL_CLIENT_SECRET: "test-client-secret",
      GMAIL_REFRESH_TOKEN: "test-refresh-token",
      N8N_WEBHOOK_URL: "http://localhost:5678/webhook/test",
    },
  },
});
