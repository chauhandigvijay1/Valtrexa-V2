import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
let mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });

function resetMockChain() {
  mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
}

vi.mock("../../api/_lib/supabase.js", () => {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockImplementation(() => mockLimit());
  chain.maybeSingle = vi.fn().mockImplementation(() => mockMaybeSingle());
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockFrom = vi.fn().mockReturnValue(chain);
  return {
    supabaseAdmin: {
      from: mockFrom,
    },
  };
});

const envBackup: Record<string, string | undefined> = {};

beforeEach(() => {
  envBackup.SUPABASE_URL = process.env.SUPABASE_URL;
  envBackup.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  envBackup.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.TELEGRAM_BOT_TOKEN = "test:token";
});

afterEach(() => {
  process.env.SUPABASE_URL = envBackup.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = envBackup.SUPABASE_SERVICE_ROLE_KEY;
  process.env.TELEGRAM_BOT_TOKEN = envBackup.TELEGRAM_BOT_TOKEN;
  vi.clearAllMocks();
  resetMockChain();
});

describe("telegram module — structural checks", () => {
  it("exports expected functions", async () => {
    const mod = await import("../../api/_lib/telegram.js");
    expect(typeof mod.sendTelegramMessage).toBe("function");
    expect(typeof mod.sendTelegramKeyboard).toBe("function");
    expect(typeof mod.processTelegramUpdate).toBe("function");
    expect(typeof mod.notifyJobImport).toBe("function");
    expect(typeof mod.notifyRecruiterDiscovery).toBe("function");
    expect(typeof mod.notifyOutreachDraft).toBe("function");
    expect(typeof mod.notifyInterview).toBe("function");
    expect(typeof mod.notifyAssessment).toBe("function");
    expect(typeof mod.notifyOffer).toBe("function");
    expect(typeof mod.notifyBatchApplyApproval).toBe("function");
    expect(typeof mod.flushTelegramQueue).toBe("function");
    expect(typeof mod.answerCallbackQuery).toBe("function");
  });
});

describe("sendTelegramMessage", () => {
  it("returns ok when fetch succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.sendTelegramMessage("12345", "test message");
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("returns error when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: false, description: "bot was blocked" }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.sendTelegramMessage("12345", "test");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("bot was blocked");

    vi.unstubAllGlobals();
  });

  it("returns error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.sendTelegramMessage("12345", "test");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network error");

    vi.unstubAllGlobals();
  });
});

describe("sendTelegramKeyboard", () => {
  it("sends with inline keyboard payload", async () => {
    let calledWith = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, opts: any) => {
        calledWith = opts.body;
        return { json: async () => ({ ok: true }) };
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const buttons = [[{ text: "Approve", callback_data: "approve:test:1" }]];
    const result = await mod.sendTelegramKeyboard("12345", "Approve?", buttons);
    expect(result.ok).toBe(true);

    const parsed = JSON.parse(calledWith);
    expect(parsed.chat_id).toBe(12345);
    expect(parsed.reply_markup.inline_keyboard).toEqual(buttons);

    vi.unstubAllGlobals();
  });
});

describe("processTelegramUpdate", () => {
  it("handles /health command", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.processTelegramUpdate(
      {
        update_id: 1,
        message: { chat: { id: 12345 }, text: "/health" },
      },
      "user-1",
    );
    expect(result.handled).toBe(true);
    expect(result.response).toContain("Health Check");

    vi.unstubAllGlobals();
  });

  it("handles /status command", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.processTelegramUpdate(
      {
        update_id: 2,
        message: { chat: { id: 12345 }, text: "/status" },
      },
      "user-1",
    );
    expect(result.handled).toBe(true);

    vi.unstubAllGlobals();
  });

  it("handles /start command as alias for /health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.processTelegramUpdate(
      {
        update_id: 3,
        message: { chat: { id: 12345 }, text: "/start" },
      },
      "user-1",
    );
    expect(result.handled).toBe(true);
    expect(result.response).toContain("Health Check");

    vi.unstubAllGlobals();
  });

  it("returns handled=false for unknown commands", async () => {
    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.processTelegramUpdate(
      {
        update_id: 4,
        message: { chat: { id: 12345 }, text: "/unknown" },
      },
      "user-1",
    );
    expect(result.handled).toBe(false);
  });

  it("handles callback_query with approve action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.processTelegramUpdate(
      {
        update_id: 5,
        callback_query: {
          id: "cb-1",
          from: { id: 12345 },
          message: { chat: { id: 12345 } },
          data: "approve:batch_apply_item:item-1",
        },
      },
      "user-1",
    );
    expect(result.handled).toBe(true);

    vi.unstubAllGlobals();
  });

  it("handles no-message and no-callback gracefully", async () => {
    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.processTelegramUpdate({ update_id: 6 }, "user-1");
    expect(result.handled).toBe(false);
  });
});

describe("notification functions", () => {
  beforeEach(() => {
    mockMaybeSingle = vi.fn().mockResolvedValue({ data: { chat_id: 12345 }, error: null });
  });

  it("notifyJobImport sends message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.notifyJobImport("user-1", "linkedin", 5, [
      { title: "Engineer", company: "Acme" },
    ]);
    expect(result.ok).toBe(true);

    vi.unstubAllGlobals();
  });

  it("notifyRecruiterDiscovery sends message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.notifyRecruiterDiscovery("user-1", "Acme", 3);
    expect(result.ok).toBe(true);

    vi.unstubAllGlobals();
  });

  it("notifyOutreachDraft sends keyboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.notifyOutreachDraft("user-1", "draft-1", "John", "Acme");
    expect(result.ok).toBe(true);

    vi.unstubAllGlobals();
  });

  it("notifyInterview sends message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.notifyInterview("user-1", "Interview Invitation", "Hello");
    expect(result.ok).toBe(true);

    vi.unstubAllGlobals();
  });

  it("notifyAssessment sends message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.notifyAssessment("user-1", "Assessment", "Hello");
    expect(result.ok).toBe(true);

    vi.unstubAllGlobals();
  });

  it("notifyOffer sends message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.notifyOffer("user-1", "Offer", "Hello");
    expect(result.ok).toBe(true);

    vi.unstubAllGlobals();
  });

  it("notifyBatchApplyApproval sends keyboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true }),
      }),
    );

    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.notifyBatchApplyApproval("user-1", "run-1", 2, [
      { id: "item-1", jobTitle: "Engineer", company: "Acme" },
    ]);
    expect(result.ok).toBe(true);

    vi.unstubAllGlobals();
  });

  it("returns ok=false when chat id missing", async () => {
    mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mod = await import("../../api/_lib/telegram.js");
    const result = await mod.notifyJobImport("user-1", "linkedin", 5);
    expect(result.ok).toBe(false);
  });
});

describe("flushTelegramQueue", () => {
  it("returns 0 when no pending notifications", async () => {
    const mod = await import("../../api/_lib/telegram.js");
    const count = await mod.flushTelegramQueue();
    expect(count).toBe(0);
  });
});
