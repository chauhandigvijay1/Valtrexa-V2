import { supabaseAdmin } from "./supabase.js";

export type PrecheckResult = {
  passed: boolean;
  checks: PrecheckItem[];
};

export type PrecheckItem = {
  name: string;
  status: "passed" | "failed" | "skipped";
  message: string;
  action?: string;
};

export async function runWorkflowPrecheck(userId: string): Promise<PrecheckResult> {
  const checks: PrecheckItem[] = await Promise.all([
    checkResumeUploaded(userId),
    checkResumeParsed(userId),
    checkCandidateBrainSynced(userId),
    checkOnboardingCompleted(userId),
    checkTelegramConnected(userId),
    checkCookiesConfigured(userId),
    checkCookiesValidated(userId),
    checkProvidersEnabled(userId),
    checkAIConfigured(),
    checkDatabaseHealthy(),
  ]);

  const passed = checks.every((c) => c.status === "passed");
  return { passed, checks };
}

async function checkResumeUploaded(userId: string): Promise<PrecheckItem> {
  try {
    const { count, error } = await supabaseAdmin
      .from("resumes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    if (!count || count === 0) {
      return {
        name: "resume_uploaded",
        status: "failed",
        message: "No resume found",
        action: "Upload a resume in Settings > Resume",
      };
    }
    return {
      name: "resume_uploaded",
      status: "passed",
      message: `${count} resume(s) uploaded`,
    };
  } catch (e: any) {
    return {
      name: "resume_uploaded",
      status: "failed",
      message: e.message,
      action: "Upload a resume",
    };
  }
}

async function checkResumeParsed(userId: string): Promise<PrecheckItem> {
  try {
    const { data, error } = await supabaseAdmin
      .from("candidate_profiles")
      .select("parsed_resume")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.parsed_resume) {
      return {
        name: "resume_parsed",
        status: "failed",
        message: "Resume has not been parsed yet",
        action: "Wait for parsing to complete or re-upload resume",
      };
    }
    const parsed = data.parsed_resume as Record<string, unknown>;
    const hasSkills = Array.isArray(parsed.skills) && (parsed.skills as unknown[]).length > 0;
    const hasProjects = Array.isArray(parsed.projects) && (parsed.projects as unknown[]).length > 0;
    const hasExperience =
      Array.isArray(parsed.experience) && (parsed.experience as unknown[]).length > 0;
    if (!hasSkills && !hasProjects && !hasExperience) {
      return {
        name: "resume_parsed",
        status: "failed",
        message: "Parsed resume is missing skills, projects, or experience",
        action: "Re-upload a more detailed resume",
      };
    }
    return {
      name: "resume_parsed",
      status: "passed",
      message: "Resume parsed successfully with skills, projects, and experience",
    };
  } catch (e: any) {
    return {
      name: "resume_parsed",
      status: "failed",
      message: e.message,
      action: "Re-upload resume",
    };
  }
}

async function checkCandidateBrainSynced(userId: string): Promise<PrecheckItem> {
  try {
    const { data, error } = await supabaseAdmin
      .from("candidate_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return {
        name: "candidate_brain_synced",
        status: "failed",
        message: "Candidate brain not initialized",
        action: "Upload and parse a resume to sync data to brain",
      };
    }
    return {
      name: "candidate_brain_synced",
      status: "passed",
      message: "Candidate brain is synced",
    };
  } catch (e: any) {
    return {
      name: "candidate_brain_synced",
      status: "failed",
      message: e.message,
      action: "Upload a resume",
    };
  }
}

async function checkOnboardingCompleted(userId: string): Promise<PrecheckItem> {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.onboarding_completed) {
      return {
        name: "onboarding_completed",
        status: "failed",
        message: "Onboarding not completed",
        action: "Complete the onboarding flow in Settings",
      };
    }
    return {
      name: "onboarding_completed",
      status: "passed",
      message: "Onboarding is complete",
    };
  } catch (e: any) {
    return {
      name: "onboarding_completed",
      status: "failed",
      message: e.message,
      action: "Complete onboarding",
    };
  }
}

async function checkTelegramConnected(userId: string): Promise<PrecheckItem> {
  try {
    const { data, error } = await supabaseAdmin
      .from("telegram_bindings")
      .select("chat_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.chat_id) {
      return {
        name: "telegram_connected",
        status: "failed",
        message: "Telegram not connected",
        action: "Connect Telegram in Settings > Telegram",
      };
    }
    return {
      name: "telegram_connected",
      status: "passed",
      message: "Telegram connected",
    };
  } catch (e: any) {
    return {
      name: "telegram_connected",
      status: "failed",
      message: e.message,
      action: "Connect Telegram",
    };
  }
}

async function checkCookiesConfigured(userId: string): Promise<PrecheckItem> {
  try {
    const { count, error } = await supabaseAdmin
      .from("provider_cookies")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "valid");
    if (error) throw error;
    if (!count || count === 0) {
      return {
        name: "cookies_configured",
        status: "failed",
        message: "No valid cookies configured for any provider",
        action: "Add cookies in Settings > Cookies",
      };
    }
    return {
      name: "cookies_configured",
      status: "passed",
      message: `${count} provider cookie(s) configured`,
    };
  } catch (e: any) {
    return {
      name: "cookies_configured",
      status: "failed",
      message: e.message,
      action: "Configure cookies",
    };
  }
}

async function checkCookiesValidated(userId: string): Promise<PrecheckItem> {
  try {
    const { data, error } = await supabaseAdmin
      .from("provider_cookies")
      .select("provider, status")
      .eq("user_id", userId);
    if (error) throw error;
    if (!data || data.length === 0) {
      return {
        name: "cookies_validated",
        status: "skipped",
        message: "No cookies to validate",
      };
    }
    const valid = data.filter((c) => c.status === "valid").length;
    const invalid = data.filter((c) => c.status === "expired" || c.status === "invalid").length;
    if (invalid > 0) {
      return {
        name: "cookies_validated",
        status: "failed",
        message: `${valid} valid, ${invalid} expired/invalid cookies`,
        action: "Refresh expired cookies in Settings > Cookies",
      };
    }
    return {
      name: "cookies_validated",
      status: "passed",
      message: `All ${data.length} cookie(s) valid`,
    };
  } catch (e: any) {
    return {
      name: "cookies_validated",
      status: "failed",
      message: e.message,
      action: "Check cookie configuration",
    };
  }
}

async function checkProvidersEnabled(userId: string): Promise<PrecheckItem> {
  try {
    const { count, error } = await supabaseAdmin
      .from("provider_controls")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "enabled");
    if (error) throw error;
    if (!count || count === 0) {
      return {
        name: "providers_enabled",
        status: "failed",
        message: "No providers enabled",
        action: "Enable at least one provider in Settings > Providers",
      };
    }
    return {
      name: "providers_enabled",
      status: "passed",
      message: `${count} provider(s) enabled`,
    };
  } catch (e: any) {
    return {
      name: "providers_enabled",
      status: "failed",
      message: e.message,
      action: "Enable providers",
    };
  }
}

function checkAIConfigured(): PrecheckItem {
  const hasKey = !!(
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GEMINI_API_KEY
  );
  if (!hasKey) {
    return {
      name: "ai_configured",
      status: "failed",
      message: "No AI provider API key configured",
      action: "Set OPENROUTER_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY in environment",
    };
  }
  const providers = [
    process.env.OPENROUTER_API_KEY ? "OpenRouter" : null,
    process.env.GROQ_API_KEY ? "Groq" : null,
    process.env.GEMINI_API_KEY ? "Gemini" : null,
  ].filter(Boolean);
  return {
    name: "ai_configured",
    status: "passed",
    message: `${providers.join(", ")} configured`,
  };
}

async function checkDatabaseHealthy(): Promise<PrecheckItem> {
  try {
    const { error } = await supabaseAdmin
      .from("workflow_events")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (error) throw error;
    return {
      name: "database_healthy",
      status: "passed",
      message: "Database connection is healthy",
    };
  } catch (e: any) {
    return {
      name: "database_healthy",
      status: "failed",
      message: e.message,
      action: "Check database configuration",
    };
  }
}
