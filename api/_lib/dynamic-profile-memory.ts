import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage, sendTelegramKeyboard } from "./telegram.js";
import { getChatIdForUser } from "./telegram-bindings.js";
import { getCandidateBrain } from "./candidate-brain.js";
import { logger } from "./logger.js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALWAYS_FRESH_PATTERNS = [
  "why this company",
  "why this role",
  "why this position",
  "why do you want to work here",
  "why are you interested",
  "why should we hire you",
  "tell us about yourself",
  "cover letter",
  "motivation",
  "what makes you unique",
  "why did you apply",
  "what interests you about",
  "tell me about yourself",
  "why do you want this job",
];

const MEMORIZABLE_PATTERNS = [
  "gender",
  "notice period",
  "notice_period",
  "work authorization",
  "work_authorization",
  "sponsorship",
  "require sponsorship",
  "visa",
  "veteran",
  "disability",
  "expected salary",
  "expected_salary",
  "current salary",
  "current_salary",
  "desired salary",
  "salary expectation",
  "salary_expectation",
  "relocation",
  "willing to relocate",
  "languages",
  "spoken languages",
  "preferred location",
  "preferred_location",
  "remote preference",
  "remote_preference",
  "start date",
  "start_date",
  "availability",
  "available from",
  "highest education",
  "highest_education",
  "years of experience",
  "years_experience",
  "linkedin",
  "linkedin url",
  "linkedin_url",
  "github",
  "github url",
  "github_url",
  "portfolio",
  "portfolio url",
  "portfolio_url",
  "website",
  "personal website",
  "race",
  "ethnicity",
  "hispanic",
  "gender identity",
  "sex",
  "date of birth",
  "dob",
  "birth date",
];

interface ProfileMemoryEntry {
  id: string;
  topic: string;
  answer: string | null;
  content: string | null;
  category: string;
  is_active: boolean;
}

const isPatternMatch = (questionText: string, patterns: string[]): boolean => {
  const lower = questionText.toLowerCase().trim();
  return patterns.some((p) => lower.includes(p));
};

export function shouldAlwaysRegenerate(questionText: string): boolean {
  return isPatternMatch(questionText, ALWAYS_FRESH_PATTERNS);
}

export function isMemorizable(questionText: string): boolean {
  return isPatternMatch(questionText, MEMORIZABLE_PATTERNS);
}

export async function isNeverAsked(userId: string, questionText: string): Promise<boolean> {
  const { data } = await supabase
    .from("candidate_memory")
    .select("id")
    .eq("user_id", userId)
    .eq("topic", `never_ask_${questionText.toLowerCase().trim()}`)
    .maybeSingle();
  return !!data;
}

export async function findInMemory(
  userId: string,
  questionText: string,
): Promise<ProfileMemoryEntry | null> {
  const lower = questionText.toLowerCase().trim();
  for (const pattern of MEMORIZABLE_PATTERNS) {
    if (lower.includes(pattern)) {
      const { data } = await supabase
        .from("candidate_memory")
        .select("id, topic, answer, content, category, is_active")
        .eq("user_id", userId)
        .eq("topic", pattern)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.answer || data?.content) return data as any;
    }
  }

  const { data: tagMatches } = await supabase
    .from("candidate_memory")
    .select("id, topic, answer, content, category, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .ilike("topic", `%${lower}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (tagMatches?.[0]?.answer || tagMatches?.[0]?.content) return tagMatches[0] as any;

  return null;
}

export async function storeInMemory(
  userId: string,
  topic: string,
  content: string,
  category: string = "permanent",
): Promise<boolean> {
  const { error } = await supabase.from("candidate_memory").upsert(
    {
      user_id: userId,
      topic: topic.toLowerCase().replace(/\s+/g, "_"),
      answer: content,
      category,
      is_active: true,
      source: "auto",
    },
    { onConflict: "user_id,topic", ignoreDuplicates: false },
  );
  if (error) {
    logger.error("Failed to store memory", { topic, error: error.message });
    return false;
  }
  return true;
}

export async function generateDynamicAnswer(
  userId: string,
  questionText: string,
  companyName?: string,
  jobTitle?: string,
  jobDescription?: string,
): Promise<string | null> {
  try {
    const brain = await getCandidateBrain(userId);
    if (!brain) return null;

    const profile = brain.profile;
    const pr = profile.parsed_resume ?? {};
    const base = brain.baseProfile ?? {};
    const skills = brain.skills.map((s: any) => s.name).join(", ");
    const projects = brain.projects.map((p: any) => p.name).join(", ");
    const experiences = brain.experiences.map((e: any) => `${e.title} at ${e.company}`).join("; ");

    const { callOpenRouterJson } = await import("./openrouter.js");

    const prompt = [
      `Question: "${questionText}"`,
      `Candidate: ${base.name ?? "Unknown"}`,
      `Skills: ${skills || "N/A"}`,
      `Experience: ${experiences || "N/A"}`,
      `Projects: ${projects || "N/A"}`,
      `Summary: ${pr.summary ?? profile.summary ?? "N/A"}`,
      companyName ? `Company: ${companyName}` : null,
      jobTitle ? `Job: ${jobTitle}` : null,
      jobDescription ? `Description: ${jobDescription.substring(0, 2000)}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await callOpenRouterJson<{ answer: string }>(
      [
        {
          role: "system",
          content:
            "You are generating a job application answer. Be concise, professional, and personalized. Return JSON with an 'answer' field.",
        },
        { role: "user", content: prompt },
      ],
      "dynamic_answer",
      {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
      },
      { userId },
    );

    return result.data?.answer ?? null;
  } catch (err: any) {
    logger.error("Failed to generate dynamic answer", { error: err.message });
    return null;
  }
}

export async function notifyUnknownQuestion(
  userId: string,
  questionText: string,
  suggestedAnswer: string,
  applicationId: string,
  provider: string,
  company: string,
  jobTitle: string,
  screenshotUrl?: string,
): Promise<void> {
  const chatId = await getChatIdForUser(userId);
  if (!chatId) {
    logger.warn("No Telegram binding for user — cannot notify about unknown question", { userId });
    return;
  }

  const isFresh = shouldAlwaysRegenerate(questionText);
  const isStorable = isMemorizable(questionText);

  let message = `<b>❓ Unknown Question Detected</b>\n\n`;
  message += `<b>Provider:</b> ${escapeHtml(provider)}\n`;
  message += `<b>Company:</b> ${escapeHtml(company)}\n`;
  message += `<b>Job:</b> ${escapeHtml(jobTitle)}\n`;
  message += `<b>Application:</b> ${applicationId.substring(0, 8)}...\n\n`;
  message += `<b>Question:</b> ${escapeHtml(questionText)}\n\n`;
  message += `<b>Suggested AI Answer:</b>\n${escapeHtml(suggestedAnswer)}`;

  if (screenshotUrl) {
    message += `\n\n📸 <a href="${escapeHtml(screenshotUrl)}">Screenshot</a>`;
  }

  if (!isFresh && isStorable) {
    message += `\n\n<i>This answer will be remembered for future applications.</i>`;
  }
  if (isFresh) {
    message += `\n\n<i>This answer will be regenerated fresh each time.</i>`;
  }

  const answerSnippet = suggestedAnswer.substring(0, 200);
  const questionSnippet = questionText.substring(0, 100);

  const buttons: Array<{ text: string; callback_data: string }[]> = [
    [
      { text: "✅ Approve", callback_data: `memory:approve:${applicationId}:${answerSnippet}` },
      { text: "✏️ Edit", callback_data: `memory:edit:${applicationId}:${questionSnippet}` },
    ],
    [{ text: "⏭️ Skip", callback_data: `memory:skip:${applicationId}` }],
  ];

  if (!isFresh && isStorable) {
    buttons.push([
      { text: "🔁 Always", callback_data: `memory:always:${applicationId}:${answerSnippet}` },
      { text: "🚫 Never", callback_data: `memory:never:${applicationId}:${questionSnippet}` },
    ]);
  }

  await sendTelegramKeyboard(chatId, message, buttons);
}

export async function handleMemoryCallback(
  action: string,
  applicationId: string,
  extra: string,
  userId: string,
): Promise<string> {
  switch (action) {
    case "approve": {
      await storeInMemory(userId, `application_answer_${applicationId}`, extra, "dynamic");
      await supabase
        .from("applications")
        .update({
          status: "pending",
          approval_status: "approved",
          approval_note: "Answer approved",
        })
        .eq("id", applicationId)
        .eq("user_id", userId);
      return "✅ Answer approved. Application will continue.";
    }
    case "skip": {
      await supabase
        .from("applications")
        .update({ status: "skipped", approval_status: "skipped" })
        .eq("id", applicationId)
        .eq("user_id", userId);
      return "⏭️ Application skipped.";
    }
    case "edit":
      return "✏️ Please send the corrected answer as a reply to this message.";
    case "always": {
      const [answerText, questionPattern] = extra.split("||");
      const topic = questionPattern
        ? questionPattern.toLowerCase().replace(/\s+/g, "_")
        : `auto_${applicationId}`;
      await storeInMemory(userId, topic, answerText || extra, "permanent");
      await supabase
        .from("applications")
        .update({ status: "pending", approval_status: "approved" })
        .eq("id", applicationId)
        .eq("user_id", userId);
      return "🔁 Answer saved permanently. Future similar questions will use this automatically.";
    }
    case "never": {
      await supabase.from("candidate_memory").insert({
        user_id: userId,
        topic: extra.startsWith("never_ask_") ? extra : `never_ask_${extra}`,
        answer: "never",
        category: "general",
        is_active: false,
        source: "manual",
      });
      await supabase
        .from("applications")
        .update({ status: "pending", approval_status: "approved" })
        .eq("id", applicationId)
        .eq("user_id", userId);
      return "🚫 Noted. This question will be skipped in future applications.";
    }
    default:
      return `Unknown memory action: ${action}`;
  }
}

export async function autoFillFromMemory(
  userId: string,
  questionText: string,
): Promise<string | null> {
  const memory = await findInMemory(userId, questionText);
  if (memory?.answer) return memory.answer;
  if (memory?.content) return memory.content;
  return null;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
