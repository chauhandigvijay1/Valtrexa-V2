import { defineConfig } from "vitest/config";
import { config } from "dotenv";
config();

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      SUPABASE_URL: "https://test-project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
      VITE_SUPABASE_URL: "https://test-project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
      OPENROUTER_API_KEY: "test-openrouter-key",
      COOKIE_ENCRYPTION_KEY: "0000000000000000000000000000000000000000000000000000000000000000",
      TELEGRAM_BOT_TOKEN: "test-telegram-token",
      TELEGRAM_CHAT_ID: "123456789",

      GMAIL_CLIENT_ID: "test-client-id",
      GMAIL_CLIENT_SECRET: "test-client-secret",
      GMAIL_REFRESH_TOKEN: "test-refresh-token",
      REDIS_URL: "redis://localhost:6379",
    },
  },
});
