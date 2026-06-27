import { supabaseAdmin } from "./supabase.js";
import { emitWorkflowEvent } from "./workflow-events.js";
import { resolveStorageState } from "./playwright-platform.js";
import { isProviderEnabled } from "./provider-controls.js";
import type { BrowserProviderName } from "./playwright-platform.js";
import {
  autoFillFromMemory,
  isMemorizable,
  storeInMemory,
  notifyUnknownQuestion,
  shouldAlwaysRegenerate,
  generateDynamicAnswer,
} from "./dynamic-profile-memory.js";

type PlatformHandlerInput = {
  jobUrl: string;
  resumeUrl?: string;
  candidateData?: Record<string, any>;
  userId: string;
  applicationId: string;
  jobId?: string;
  approvalMode?: boolean;
};

export type ApplyFlowStatus =
  "APPLIED" | "PARTIAL" | "REQUIRES_APPROVAL" | "FAILED" | "MANUAL_APPLY_REQUIRED";

export type ApplyFlowResult = {
  status: ApplyFlowStatus;
  externalId?: string;
  trackingUrl?: string;
  error?: string;
  formComplexity?: FormComplexity;
  evidenceIds?: string[];
  confirmationScreenshot?: string;
  submittedFields?: number;
  totalFields?: number;
  aiGeneratedAnswers?: Record<string, string>;
};

export type FormComplexity = {
  totalFields: number;
  textInputs: number;
  fileUploads: number;
  dropdowns: number;
  textareas: number;
  checkboxes: number;
  multiStep: boolean;
  currentStep: number;
  totalSteps: number;
  screeningQuestions: number;
  requiresResumeUpload: boolean;
  requiresCoverLetter: boolean;
  complexity: "simple" | "moderate" | "complex";
  estimatedTimeMinutes: number;
};

const FIELD_SELECTORS: Record<string, string[]> = {
  "full name": [
    'input[autocomplete="name"]',
    'input[name*="name" i]',
    'input[id*="name" i]',
    'input[aria-label*="name" i]',
    'input[placeholder*="name" i]',
  ],
  email: [
    'input[autocomplete="email"]',
    'input[type="email"]',
    'input[name*="email" i]',
    'input[id*="email" i]',
    'input[aria-label*="email" i]',
  ],
  phone: [
    'input[autocomplete="tel"]',
    'input[type="tel"]',
    'input[name*="phone" i]',
    'input[id*="phone" i]',
    'input[aria-label*="phone" i]',
  ],
  location: [
    'input[autocomplete="address-level2"]',
    'input[name*="location" i]',
    'input[id*="location" i]',
    'input[aria-label*="location" i]',
    'input[placeholder*="city" i]',
  ],
  "linkedin url": [
    'input[name*="linkedin" i]',
    'input[id*="linkedin" i]',
    'input[aria-label*="linkedin" i]',
    'input[placeholder*="linkedin" i]',
  ],
  portfolio: [
    'input[name*="portfolio" i]',
    'input[id*="portfolio" i]',
    'input[name*="website" i]',
    'input[aria-label*="website" i]',
    'input[placeholder*="website" i]',
  ],
  github: [
    'input[name*="github" i]',
    'input[id*="github" i]',
    'input[aria-label*="github" i]',
    'input[placeholder*="github" i]',
  ],
  "years of experience": [
    'input[name*="experience" i]',
    'input[id*="experience" i]',
    'input[aria-label*="experience" i]',
    'select[name*="experience" i]',
  ],
  "current company": [
    'input[autocomplete="organization"]',
    'input[name*="company" i]',
    'input[id*="company" i]',
    'input[aria-label*="company" i]',
  ],
  "current title": [
    'input[name*="title" i]',
    'input[id*="title" i]',
    'input[name*="position" i]',
    'input[aria-label*="title" i]',
  ],
  "cover letter": [
    'textarea[name*="cover" i]',
    'textarea[id*="cover" i]',
    'textarea[aria-label*="cover" i]',
    'div[contenteditable="true"][aria-label*="cover" i]',
  ],
  "additional info": [
    'textarea[name*="additional" i]',
    'textarea[id*="additional" i]',
    'textarea[aria-label*="additional" i]',
    'textarea[placeholder*="additional" i]',
  ],
  "salary expectation": [
    'input[name*="salary" i]',
    'input[id*="salary" i]',
    'input[aria-label*="salary" i]',
    'input[placeholder*="salary" i]',
  ],
  "work authorization": [
    'select[name*="work" i]',
    'select[id*="work" i]',
    'select[aria-label*="authorization" i]',
    'input[name*="sponsorship" i]',
  ],
  gender: ['select[name*="gender" i]', 'select[id*="gender" i]'],
  "race/ethnicity": [
    'select[name*="race" i]',
    'select[id*="race" i]',
    'select[name*="ethnicity" i]',
  ],
  "veteran status": ['select[name*="veteran" i]', 'select[id*="veteran" i]'],
  "disability status": ['select[name*="disability" i]', 'select[id*="disability" i]'],
};

const NEXT_BUTTON_SELECTORS = [
  'button[aria-label*="next" i]',
  'button:has-text("Next")',
  'button:has-text("Continue")',
  'a[aria-label*="next" i]',
  'span:has-text("Next")',
  '[data-qa*="next"]',
  '[data-test*="next"]',
];

const SUBMIT_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'button:has-text("Submit")',
  'button:has-text("Apply")',
  'button:has-text("Send")',
  'button:has-text("Submit application")',
  'input[type="submit"]',
  '[data-qa*="submit"]',
  '[data-test*="submit"]',
  'a:has-text("Submit application")',
];

const REVIEW_BUTTON_SELECTORS = [
  'button:has-text("Review")',
  'button:has-text("Review your application")',
  'a:has-text("Review")',
  '[data-qa*="review"]',
  '[data-test*="review"]',
];

const FILE_UPLOAD_SELECTORS = [
  'input[type="file"]',
  'input[accept*="pdf"]',
  'input[accept*="doc"]',
  'input[accept*="resume"]',
];

async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 2000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error("retry exhausted");
}

async function detectForm(page: any): Promise<{ found: boolean; formCount: number }> {
  const formCount = await page.evaluate(() => document.querySelectorAll("form").length);
  return { found: formCount > 0, formCount };
}

async function detectFormComplexity(page: any): Promise<FormComplexity> {
  const counts = await page.evaluate(() => {
    const form = document.querySelector("form") || document.body;
    const textInputs = form.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input:not([type])',
    ).length;
    const fileUploads = form.querySelectorAll('input[type="file"]').length;
    const dropdowns = form.querySelectorAll("select").length;
    const textareas = form.querySelectorAll("textarea").length;
    const checkboxes = form.querySelectorAll('input[type="checkbox"]').length;
    const radioBtns = form.querySelectorAll('input[type="radio"]').length;
    const allFields = form.querySelectorAll("input, select, textarea").length;
    const stepIndicators = document.querySelectorAll(
      '[class*="step"], [class*="page"], [data-step], [aria-label*="step"]',
    ).length;
    return {
      textInputs,
      fileUploads,
      dropdowns,
      textareas,
      checkboxes,
      radioBtns,
      allFields,
      stepIndicators,
    };
  });

  const multiStep = counts.stepIndicators > 1;
  const totalFields = counts.allFields;
  const screeningQuestions = counts.radioBtns + counts.checkboxes;

  const complexity: "simple" | "moderate" | "complex" =
    totalFields <= 5 && !counts.fileUploads ? "simple" : totalFields <= 15 ? "moderate" : "complex";

  const estimatedTimeMinutes = complexity === "simple" ? 2 : complexity === "moderate" ? 8 : 15;

  return {
    totalFields,
    textInputs: counts.textInputs,
    fileUploads: counts.fileUploads,
    dropdowns: counts.dropdowns,
    textareas: counts.textareas,
    checkboxes: counts.checkboxes,
    multiStep,
    currentStep: 1,
    totalSteps: multiStep ? Math.max(2, counts.stepIndicators || 3) : 1,
    screeningQuestions,
    requiresResumeUpload: counts.fileUploads > 0,
    requiresCoverLetter: counts.textareas > 0,
    complexity,
    estimatedTimeMinutes,
  };
}

async function uploadResume(page: any, resumeUrl?: string): Promise<boolean> {
  if (!resumeUrl) return false;
  try {
    for (const selector of FILE_UPLOAD_SELECTORS) {
      const input = await page.$(selector);
      if (input) {
        await input.setInputFiles(resumeUrl);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn(`[playwright-apply] uploadResume: ${err}`);
    return false;
  }
}

async function fillKnownFields(
  page: any,
  candidateData: Record<string, any>,
  context?: string,
  aiGeneratedAnswers?: Record<string, string>,
  userId?: string,
  jobContext?: { company?: string; jobTitle?: string; jobDescription?: string },
): Promise<{ filled: number; aiGenerated: Record<string, string> }> {
  let filled = 0;
  const aiGen: Record<string, string> = { ...(aiGeneratedAnswers || {}) };

  for (const [fieldName, selectors] of Object.entries(FIELD_SELECTORS)) {
    const value = resolveCandidateValue(fieldName, candidateData) || aiGen[fieldName];
    if (value) {
      if (await fillField(page, selectors, value)) filled++;
      continue;
    }

    // Fields that should always be regenerated with context (cover letter, why this company, etc.)
    if (userId && shouldAlwaysRegenerate(fieldName)) {
      const generated = await generateDynamicAnswer(
        userId,
        fieldName,
        jobContext?.company,
        jobContext?.jobTitle,
        jobContext?.jobDescription,
      );
      if (generated) {
        aiGen[fieldName] = generated;
        if (await fillField(page, selectors, generated)) filled++;
      }
      continue;
    }

    // Check Dynamic Profile Memory before generating AI answer
    if (userId) {
      const remembered = await autoFillFromMemory(userId, fieldName);
      if (remembered) {
        if (await fillField(page, selectors, remembered)) filled++;
        continue;
      }
    }

    const generated = await generateAnswerForField(
      page,
      fieldName,
      context || JSON.stringify(candidateData),
    );
    if (generated) {
      aiGen[fieldName] = generated;
      if (await fillField(page, selectors, generated)) filled++;

      // Store memorizable answers for future use
      if (userId && isMemorizable(fieldName)) {
        await storeInMemory(userId, fieldName, generated, "permanent");
      }
    }
  }
  return { filled, aiGenerated: aiGen };
}

async function fillField(page: any, selectors: string[], value: string): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const tag = await el.evaluate((e: any) => e.tagName.toLowerCase());
        const isVisible = await el.isVisible();
        if (!isVisible) continue;
        if (tag === "select") {
          await el.selectOption(value);
        } else {
          await el.fill(value);
        }
        return true;
      }
    } catch (err) {
      console.warn(`[playwright-apply] fillField: ${err}`);
      continue;
    }
  }
  return false;
}

function resolveCandidateValue(fieldName: string, data: Record<string, any>): string | null {
  switch (fieldName) {
    case "full name":
      return data.name || null;
    case "email":
      return data.email || null;
    case "phone":
      return data.phone || null;
    case "location":
      return data.location || data.preferred_locations?.[0] || null;
    case "linkedin url":
      return data.linkedin_url || null;
    case "portfolio":
      return data.portfolio_url || null;
    case "github":
      return data.github_url || null;
    case "years of experience":
      return data.years_experience ? String(data.years_experience) : null;
    case "current company":
      return data.current_company || null;
    case "current title":
      return data.current_title || null;
    case "salary expectation":
      return data.salary_expectation ? String(data.salary_expectation) : null;
    case "work authorization":
      return data.work_authorization || null;
    default:
      return null;
  }
}

async function generateAnswerForField(page: any, label: string, context: string): Promise<string> {
  try {
    const { callOpenRouterText } = await import("./openrouter.js");
    const result = await callOpenRouterText([
      {
        role: "system",
        content:
          "You are helping fill a job application form. Generate a concise, professional answer for the given field based on the candidate context provided.",
      },
      {
        role: "user",
        content: `Field: ${label}\nCandidate Context: ${context}\n\nGenerate a brief, professional answer for this job application field:`,
      },
    ]);
    return (result as any).content?.trim() || "";
  } catch (err) {
    console.warn(`[playwright-apply] generateAnswerForField: ${err}`);
    return "";
  }
}

async function handleScreeningQuestions(
  page: any,
  candidateData: Record<string, any>,
  userId?: string,
  options?: {
    applicationId?: string;
    provider?: string;
    companyName?: string;
    jobTitle?: string;
  },
): Promise<number> {
  let answered = 0;
  try {
    if (!userId) return 0;
    const groups = await page.$$('fieldset, div[role="radiogroup"]');
    for (const group of groups) {
      const questionText = await group.evaluate((el: any) => {
        const legend = el.querySelector("legend");
        if (legend) return (legend.textContent || "").trim();
        const aria = el.getAttribute("aria-label");
        if (aria) return aria.trim();
        return (el.textContent || "").trim();
      });
      if (!questionText) continue;

      const answer = await autoFillFromMemory(userId, questionText);
      if (answer) {
        const radios = await group.$$('input[type="radio"]');
        for (const radio of radios) {
          const labelText = await radio.evaluate((el: any) => {
            const label = el.closest("label");
            if (label) return (label.textContent || "").replace(el.value || "", "").trim();
            if (el.id) {
              const forLabel = document.querySelector('label[for="' + el.id + '"]');
              if (forLabel) return (forLabel.textContent || "").trim();
            }
            return (
              el.getAttribute("aria-label") ||
              (el.parentElement?.textContent || "").replace(el.value || "", "").trim() ||
              el.value ||
              ""
            );
          });
          const ansLower = answer.toLowerCase();
          const labLower = labelText.toLowerCase();
          if (labLower.includes(ansLower) || ansLower.includes(labLower)) {
            await radio
              .check()
              .catch((err: any) =>
                console.warn(`[playwright-apply] handleScreeningQuestions radio check: ${err}`),
              );
            answered++;
            break;
          }
        }
        continue;
      }

      // Unknown question — generate AI suggestion and notify user
      if (options?.applicationId && options?.provider) {
        const suggestedAnswer = await generateDynamicAnswer(
          userId,
          questionText,
          options.companyName,
          options.jobTitle,
        );

        if (suggestedAnswer) {
          const radios = await group.$$('input[type="radio"]');
          for (const radio of radios) {
            const labelText = await radio.evaluate((el: any) => {
              const label = el.closest("label");
              if (label) return (label.textContent || "").replace(el.value || "", "").trim();
              if (el.id) {
                const forLabel = document.querySelector('label[for="' + el.id + '"]');
                if (forLabel) return (forLabel.textContent || "").trim();
              }
              return (
                el.getAttribute("aria-label") ||
                (el.parentElement?.textContent || "").replace(el.value || "", "").trim() ||
                el.value ||
                ""
              );
            });
            const sugLower = suggestedAnswer.toLowerCase();
            const labLower = labelText.toLowerCase();
            if (labLower.includes(sugLower) || sugLower.includes(labLower)) {
              await radio
                .check()
                .catch((err: any) =>
                  console.warn(`[playwright-apply] handleScreeningQuestions radio check: ${err}`),
                );
              answered++;
              break;
            }
          }
        }

        await notifyUnknownQuestion(
          userId,
          questionText,
          suggestedAnswer || "Unable to generate suggestion",
          options.applicationId,
          options.provider,
          options.companyName || "Unknown",
          options.jobTitle || "Unknown",
        );
      }
    }
  } catch (err) {
    console.warn(`[playwright-apply] handleScreeningQuestions block: ${err}`);
  }
  return answered;
}

async function takeScreenshot(page: any, label: string): Promise<string | null> {
  try {
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    return Buffer.from(screenshot).toString("base64");
  } catch (err) {
    console.warn(`[playwright-apply] takeScreenshot: ${err}`);
    return null;
  }
}

async function captureHtmlSnapshot(page: any): Promise<string | null> {
  try {
    return await page.content();
  } catch (err) {
    console.warn(`[playwright-apply] captureHtmlSnapshot: ${err}`);
    return null;
  }
}

async function clickAnyMatching(page: any, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const elements = await page.$$(selector);
      for (const el of elements) {
        if (await el.isVisible()) {
          await el.click();
          return true;
        }
      }
    } catch (err) {
      console.warn(`[playwright-apply] clickAnyMatching: ${err}`);
      continue;
    }
  }
  return false;
}

async function detectReviewPage(page: any): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return (
        text.includes("review your application") ||
        text.includes("review application") ||
        text.includes("please review") ||
        (text.includes("summary") && text.includes("application"))
      );
    });
  } catch (err) {
    console.warn(`[playwright-apply] detectReviewPage: ${err}`);
    return false;
  }
}

async function detectConfirmation(page: any): Promise<boolean> {
  try {
    const url = page.url().toLowerCase();
    if (
      url.includes("applied") ||
      url.includes("application-success") ||
      url.includes("submission") ||
      url.includes("confirm")
    ) {
      return true;
    }

    return await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return (
        text.includes("application submitted") ||
        text.includes("thank you for applying") ||
        text.includes("application received") ||
        text.includes("successfully submitted") ||
        text.includes("your application has been") ||
        text.includes("application sent") ||
        text.includes("we have received your application") ||
        text.includes("已提交") ||
        text.includes("申請已提交") ||
        text.includes("応募完了") ||
        text.includes("solicitud enviada") ||
        text.includes("candidature envoyée") ||
        document.querySelector('[class*="applied"]') !== null ||
        document.querySelector('[class*="success"]') !== null ||
        document.querySelector('[class*="confirmation"]') !== null ||
        document.querySelector('[aria-label*="Applied"]') !== null
      );
    });
  } catch (err) {
    console.warn(`[playwright-apply] detectConfirmation: ${err}`);
    return false;
  }
}

async function storeEvidence(input: {
  userId: string;
  applicationId: string;
  jobId?: string;
  provider: string;
  evidenceType: string;
  content?: string;
  storagePath?: string;
  metadata?: Record<string, any>;
}): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("apply_evidence")
      .insert({
        user_id: input.userId,
        application_id: input.applicationId,
        job_id: input.jobId ?? null,
        provider: input.provider,
        evidence_type: input.evidenceType,
        content: input.content ?? null,
        storage_path: input.storagePath ?? null,
        metadata: input.metadata ?? {},
      })
      .select("id")
      .single();
    return data?.id ?? null;
  } catch (err) {
    console.warn(`[playwright-apply] storeEvidence: ${err}`);
    return null;
  }
}

export async function applyWithPlaywright(input: {
  userId: string;
  applicationId: string;
  jobId?: string;
  jobUrl: string;
  provider: BrowserProviderName;
  resumeUrl?: string;
  candidateData?: Record<string, any>;
  headless?: boolean;
  approvalMode?: boolean;
}): Promise<ApplyFlowResult> {
  return retry(() => runPlaywrightFlow(input), 3, 2000);
}

async function runPlaywrightFlow(input: {
  userId: string;
  applicationId: string;
  jobId?: string;
  jobUrl: string;
  provider: BrowserProviderName;
  resumeUrl?: string;
  candidateData?: Record<string, any>;
  headless?: boolean;
  approvalMode?: boolean;
}): Promise<ApplyFlowResult> {
  let browser: any = null;
  const evidenceIds: string[] = [];
  const submittedFields = 0;
  const totalFields = 0;
  let aiGeneratedAnswers: Record<string, string> = {};

  try {
    if (!(await isProviderEnabled(input.provider, input.userId))) {
      return { status: "FAILED", error: `Provider "${input.provider}" is disabled` };
    }
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: input.headless ?? true });
    const { storageState } = await resolveStorageState(input.userId, input.provider);
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      storageState,
    });
    const page = await context.newPage();

    const providerHandlers: Record<
      BrowserProviderName,
      (p: any, b: any) => Promise<ApplyFlowResult>
    > = {
      linkedin: (p) => applyLinkedIn(p, browser!, input),
      indeed: (p) => applyIndeed(p, browser!, input),
      naukri: (p) => applyNaukri(p, browser!, input),
      wellfound: (p) => applyWellfound(p, browser!, input),
      instahyre: (p) => applyInstahyre(p, browser!, input),
    };

    const handler = providerHandlers[input.provider];
    if (!handler) {
      return { status: "FAILED", error: `Unsupported provider: ${input.provider}` };
    }

    const result = await handler(page, browser);

    if (result.aiGeneratedAnswers) {
      aiGeneratedAnswers = result.aiGeneratedAnswers;
    }

    if (input.approvalMode) {
      const formScreen = await takeScreenshot(page, "form-filled");
      if (formScreen) {
        const id = await storeEvidence({
          userId: input.userId,
          applicationId: input.applicationId,
          jobId: input.jobId,
          provider: input.provider,
          evidenceType: "screenshot",
          content: formScreen,
          metadata: { label: "form-filled", url: input.jobUrl, approvalMode: true },
        });
        if (id) evidenceIds.push(id);
      }
      const html = await captureHtmlSnapshot(page);
      if (html) {
        const id = await storeEvidence({
          userId: input.userId,
          applicationId: input.applicationId,
          jobId: input.jobId,
          provider: input.provider,
          evidenceType: "html_snapshot",
          content: html,
          metadata: { url: input.jobUrl, approvalMode: true },
        });
        if (id) evidenceIds.push(id);
      }
      await supabaseAdmin
        .from("applications")
        .update({
          ai_generated_answers: aiGeneratedAnswers,
        } as any)
        .eq("id", input.applicationId)
        .eq("user_id", input.userId);
      return {
        status: "REQUIRES_APPROVAL",
        submittedFields: result.submittedFields,
        totalFields: result.totalFields,
        formComplexity: result.formComplexity,
        evidenceIds,
        trackingUrl: input.jobUrl,
      };
    }

    if (result.status !== "FAILED" && result.status !== "REQUIRES_APPROVAL") {
      const confirmation = await takeScreenshot(page, "confirmation");
      if (confirmation) {
        const id = await storeEvidence({
          userId: input.userId,
          applicationId: input.applicationId,
          jobId: input.jobId,
          provider: input.provider,
          evidenceType: "screenshot",
          content: confirmation,
          metadata: { label: "confirmation", url: input.jobUrl },
        });
        if (id) evidenceIds.push(id);
      }
      const html = await captureHtmlSnapshot(page);
      if (html) {
        const id = await storeEvidence({
          userId: input.userId,
          applicationId: input.applicationId,
          jobId: input.jobId,
          provider: input.provider,
          evidenceType: "html_snapshot",
          content: html,
          metadata: { url: input.jobUrl },
        });
        if (id) evidenceIds.push(id);
      }
    }

    return { ...result, evidenceIds };
  } catch (err: any) {
    return { status: "FAILED", error: `Playwright error: ${err.message}` };
  } finally {
    if (browser)
      await browser
        .close()
        .catch((err: any) =>
          console.warn(`[playwright-apply] browser.close (runPlaywrightFlow): ${err}`),
        );
  }
}

export async function continuePlaywrightSubmit(input: {
  userId: string;
  applicationId: string;
  jobId?: string;
  jobUrl: string;
  provider: BrowserProviderName;
  headless?: boolean;
}): Promise<ApplyFlowResult> {
  return retry(() => runPlaywrightSubmit(input), 3, 2000);
}

async function runPlaywrightSubmit(input: {
  userId: string;
  applicationId: string;
  jobId?: string;
  jobUrl: string;
  provider: BrowserProviderName;
  headless?: boolean;
}): Promise<ApplyFlowResult> {
  let browser: any = null;
  const evidenceIds: string[] = [];

  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: input.headless ?? true });
    const { storageState } = await resolveStorageState(input.userId, input.provider);
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      storageState,
    });
    const page = await context.newPage();

    await page.goto(input.jobUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3000);

    const alreadyApplied = await detectConfirmation(page);
    if (alreadyApplied) {
      const confirmScreen = await takeScreenshot(page, "already-applied");
      if (confirmScreen) {
        const id = await storeEvidence({
          userId: input.userId,
          applicationId: input.applicationId,
          jobId: input.jobId,
          provider: input.provider,
          evidenceType: "screenshot",
          content: confirmScreen,
          metadata: { label: "already-applied" },
        });
        if (id) evidenceIds.push(id);
      }
      return { status: "APPLIED", evidenceIds, trackingUrl: input.jobUrl };
    }

    const isReview = await detectReviewPage(page);
    if (isReview) {
      const reviewScreen = await takeScreenshot(page, "review-page");
      if (reviewScreen) {
        const id = await storeEvidence({
          userId: input.userId,
          applicationId: input.applicationId,
          jobId: input.jobId,
          provider: input.provider,
          evidenceType: "screenshot",
          content: reviewScreen,
          metadata: { label: "review" },
        });
        if (id) evidenceIds.push(id);
      }
      const submitted = await clickAnyMatching(page, SUBMIT_BUTTON_SELECTORS);
      if (submitted) {
        await page.waitForTimeout(3000);
        const confirmed = await detectConfirmation(page);
        if (confirmed) {
          const confirmScreen = await takeScreenshot(page, "confirmation");
          if (confirmScreen) {
            const id = await storeEvidence({
              userId: input.userId,
              applicationId: input.applicationId,
              jobId: input.jobId,
              provider: input.provider,
              evidenceType: "screenshot",
              content: confirmScreen,
              metadata: { label: "confirmation" },
            });
            if (id) evidenceIds.push(id);
          }
          return { status: "APPLIED", evidenceIds, trackingUrl: input.jobUrl };
        }
      }
    }

    const submitClicked = await clickAnyMatching(page, SUBMIT_BUTTON_SELECTORS);
    if (submitClicked) {
      await page.waitForTimeout(3000);
      const confirmed = await detectConfirmation(page);
      if (confirmed) {
        const confirmScreen = await takeScreenshot(page, "confirmation");
        if (confirmScreen) {
          const id = await storeEvidence({
            userId: input.userId,
            applicationId: input.applicationId,
            jobId: input.jobId,
            provider: input.provider,
            evidenceType: "screenshot",
            content: confirmScreen,
            metadata: { label: "confirmation" },
          });
          if (id) evidenceIds.push(id);
        }
        return { status: "APPLIED", evidenceIds, trackingUrl: input.jobUrl };
      }
      return {
        status: "PARTIAL",
        error: "Submit clicked but no confirmation detected",
        evidenceIds,
        trackingUrl: input.jobUrl,
      };
    }

    return {
      status: "PARTIAL",
      error: "Could not find submit button on second pass",
      evidenceIds,
      trackingUrl: input.jobUrl,
    };
  } catch (err: any) {
    return { status: "FAILED", error: `Playwright submit error: ${err.message}` };
  } finally {
    if (browser)
      await browser
        .close()
        .catch((err: any) =>
          console.warn(`[playwright-apply] browser.close (runPlaywrightSubmit): ${err}`),
        );
  }
}

async function applyLinkedIn(
  page: any,
  browser: any,
  input: PlatformHandlerInput,
): Promise<ApplyFlowResult & { aiGeneratedAnswers?: Record<string, string> }> {
  try {
    let totalFields = 0;
    let submittedFields = 0;
    let aiGeneratedAnswers: Record<string, string> = {};

    await page.goto(input.jobUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3000);

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(1000);

    const applyBtn = await findLinkedInApplyButton(page);
    if (!applyBtn) {
      await takeScreenshot(page, "no-apply-btn");
      return { status: "PARTIAL", error: "LinkedIn: no apply button found" };
    }

    const btnText = (await applyBtn.textContent().catch(() => "")).toLowerCase();
    if (
      btnText.includes("external") ||
      btnText.includes("apply on") ||
      btnText.includes("view more")
    ) {
      return { status: "PARTIAL", error: "LinkedIn: external apply site — cannot fully automate" };
    }

    await applyBtn.click();
    await page.waitForTimeout(3000);

    const formInfo = await detectFormComplexity(page);
    totalFields = formInfo.totalFields;

    await uploadResume(page, input.resumeUrl);

    const fillResult = await fillKnownFields(
      page,
      input.candidateData || {},
      `Job application for LinkedIn position`,
      input.candidateData?.ai_generated_answers,
      undefined,
      { company: input.candidateData?.company_name, jobTitle: input.candidateData?.role_title },
    );
    submittedFields = fillResult.filled;
    aiGeneratedAnswers = { ...aiGeneratedAnswers, ...fillResult.aiGenerated };

    if (input.candidateData) {
      const answered = await handleScreeningQuestions(page, input.candidateData, input.userId, {
        applicationId: input.applicationId,
        provider: "linkedin",
        companyName: input.candidateData?.company_name,
        jobTitle: input.candidateData?.role_title,
      });
      submittedFields += answered;
    }

    const screenshot1 = await takeScreenshot(page, "form-filled");
    if (screenshot1) {
      await storeEvidence({
        userId: input.userId,
        applicationId: input.applicationId,
        jobId: input.jobId,
        provider: "linkedin",
        evidenceType: "screenshot",
        content: screenshot1,
        metadata: { label: "form-filled", step: 1 },
      });
    }

    for (let step = 2; step <= 5; step++) {
      const nextClicked = await clickAnyMatching(page, NEXT_BUTTON_SELECTORS);
      if (!nextClicked) break;
      await page.waitForTimeout(2000);

      await uploadResume(page, input.resumeUrl);
      const moreFill = await fillKnownFields(
        page,
        input.candidateData || {},
        `Job application for LinkedIn step ${step}`,
        undefined,
        input.userId,
        { company: input.candidateData?.company_name, jobTitle: input.candidateData?.role_title },
      );
      submittedFields += moreFill.filled;
      aiGeneratedAnswers = { ...aiGeneratedAnswers, ...moreFill.aiGenerated };

      if (input.candidateData) {
        const moreAnswered = await handleScreeningQuestions(
          page,
          input.candidateData,
          input.userId,
          {
            applicationId: input.applicationId,
            provider: "linkedin",
            companyName: input.candidateData?.company_name,
            jobTitle: input.candidateData?.role_title,
          },
        );
        submittedFields += moreAnswered;
      }

      const stepScreen = await takeScreenshot(page, `step-${step}`);
      if (stepScreen) {
        await storeEvidence({
          userId: input.userId,
          applicationId: input.applicationId,
          jobId: input.jobId,
          provider: "linkedin",
          evidenceType: "screenshot",
          content: stepScreen,
          metadata: { label: `step-${step}` },
        });
      }
    }

    const isReview = await detectReviewPage(page);
    if (isReview) {
      const reviewScreen = await takeScreenshot(page, "review-page");
      if (reviewScreen) {
        await storeEvidence({
          userId: input.userId,
          applicationId: input.applicationId,
          jobId: input.jobId,
          provider: "linkedin",
          evidenceType: "screenshot",
          content: reviewScreen,
          metadata: { label: "review" },
        });
      }
    }

    if (input.approvalMode !== undefined ? input.approvalMode : false) {
      return {
        status: "REQUIRES_APPROVAL",
        submittedFields,
        totalFields,
        formComplexity: formInfo,
        aiGeneratedAnswers,
      };
    }

    const submitted = await clickAnyMatching(page, SUBMIT_BUTTON_SELECTORS);
    if (submitted) {
      await page.waitForTimeout(3000);
      const confirmed = await detectConfirmation(page);
      if (confirmed) {
        return {
          status: "APPLIED",
          submittedFields,
          totalFields,
          trackingUrl: input.jobUrl,
          aiGeneratedAnswers,
        };
      }
      return {
        status: "PARTIAL",
        error: "LinkedIn: clicked submit but confirmation not detected",
        submittedFields,
        totalFields,
        aiGeneratedAnswers,
      };
    }

    await storeEvidence({
      userId: input.userId,
      applicationId: input.applicationId,
      jobId: input.jobId,
      provider: "linkedin",
      evidenceType: "submission_log",
      content: `Apply flow completed up to review. Submitted ${submittedFields}/${totalFields} fields. Manual review may be needed.`,
      metadata: { submittedFields, totalFields, url: input.jobUrl },
    });

    return {
      status: "REQUIRES_APPROVAL",
      error: "LinkedIn: form filled but needs manual review",
      submittedFields,
      totalFields,
      formComplexity: formInfo,
      aiGeneratedAnswers,
    };
  } catch (err: any) {
    return { status: "FAILED", error: `LinkedIn apply error: ${err.message}` };
  }
}

async function findLinkedInApplyButton(page: any): Promise<any> {
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const text = await btn.textContent().catch(() => "");
    const lower = text.toLowerCase();
    if (lower.includes("easy apply") || lower.includes("apply now") || lower.includes("apply"))
      return btn;
  }
  const anchors = await page.$$("a");
  for (const a of anchors) {
    const text = await a.textContent().catch(() => "");
    const lower = text.toLowerCase();
    if (lower.includes("easy apply") || lower.includes("apply now")) return a;
  }
  return null;
}

async function applyIndeed(
  page: any,
  browser: any,
  input: PlatformHandlerInput,
): Promise<ApplyFlowResult & { aiGeneratedAnswers?: Record<string, string> }> {
  try {
    let totalFields = 0;
    let submittedFields = 0;
    let aiGeneratedAnswers: Record<string, string> = {};

    await page.goto(input.jobUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3000);

    const applyNowBtn = await page.$('[data-testid="applyNow"]');
    if (!applyNowBtn) {
      const fallback = await page.$(
        'button:has-text("Apply"), a:has-text("Apply now"), [data-testid*="apply" i]',
      );
      if (!fallback) {
        return { status: "PARTIAL", error: "Indeed: no apply button found" };
      }
      await fallback.click();
    } else {
      await applyNowBtn.click();
    }
    await page.waitForTimeout(3000);

    const formInfo = await detectFormComplexity(page);
    totalFields = formInfo.totalFields;

    await uploadResume(page, input.resumeUrl);
    const fillResult = await fillKnownFields(
      page,
      input.candidateData || {},
      `Job application for Indeed position`,
      undefined,
      input.userId,
      { company: input.candidateData?.company_name, jobTitle: input.candidateData?.role_title },
    );
    submittedFields = fillResult.filled;
    aiGeneratedAnswers = fillResult.aiGenerated;

    if (input.candidateData) {
      const answered = await handleScreeningQuestions(page, input.candidateData, input.userId, {
        applicationId: input.applicationId,
        provider: "indeed",
        companyName: input.candidateData?.company_name,
        jobTitle: input.candidateData?.role_title,
      });
      submittedFields += answered;
    }

    const screenshot1 = await takeScreenshot(page, "indeed-form-filled");
    if (screenshot1) {
      await storeEvidence({
        userId: input.userId,
        applicationId: input.applicationId,
        jobId: input.jobId,
        provider: "indeed",
        evidenceType: "screenshot",
        content: screenshot1,
        metadata: { label: "form-filled" },
      });
    }

    for (let step = 2; step <= 4; step++) {
      const nextClicked = await clickAnyMatching(page, NEXT_BUTTON_SELECTORS);
      if (!nextClicked) break;
      await page.waitForTimeout(2000);

      const moreFill = await fillKnownFields(
        page,
        input.candidateData || {},
        `Indeed step ${step}`,
        undefined,
        input.userId,
        { company: input.candidateData?.company_name, jobTitle: input.candidateData?.role_title },
      );
      submittedFields += moreFill.filled;
      aiGeneratedAnswers = { ...aiGeneratedAnswers, ...moreFill.aiGenerated };

      if (input.candidateData) {
        const moreAnswered = await handleScreeningQuestions(
          page,
          input.candidateData,
          input.userId,
          {
            applicationId: input.applicationId,
            provider: "indeed",
            companyName: input.candidateData?.company_name,
            jobTitle: input.candidateData?.role_title,
          },
        );
        submittedFields += moreAnswered;
      }
    }

    if (input.approvalMode !== undefined ? input.approvalMode : false) {
      return {
        status: "REQUIRES_APPROVAL",
        submittedFields,
        totalFields,
        formComplexity: formInfo,
        aiGeneratedAnswers,
      };
    }

    const submitted = await clickAnyMatching(page, SUBMIT_BUTTON_SELECTORS);
    if (submitted) {
      await page.waitForTimeout(3000);
      const confirmed = await detectConfirmation(page);
      if (confirmed)
        return {
          status: "APPLIED",
          submittedFields,
          totalFields,
          trackingUrl: input.jobUrl,
          aiGeneratedAnswers,
        };
      return {
        status: "PARTIAL",
        error: "Indeed: submitted but no confirmation",
        submittedFields,
        totalFields,
        aiGeneratedAnswers,
      };
    }

    return {
      status: "REQUIRES_APPROVAL",
      error: "Indeed: form filled but needs review",
      submittedFields,
      totalFields,
      formComplexity: formInfo,
      aiGeneratedAnswers,
    };
  } catch (err: any) {
    return { status: "FAILED", error: `Indeed apply error: ${err.message}` };
  }
}

async function applyNaukri(
  page: any,
  browser: any,
  input: PlatformHandlerInput,
): Promise<ApplyFlowResult & { aiGeneratedAnswers?: Record<string, string> }> {
  try {
    let totalFields = 0;
    let submittedFields = 0;
    let aiGeneratedAnswers: Record<string, string> = {};

    await page.goto(input.jobUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3000);

    const alreadyApplied = await detectConfirmation(page);
    if (alreadyApplied) {
      await storeEvidence({
        userId: input.userId,
        applicationId: input.applicationId,
        jobId: input.jobId,
        provider: "naukri",
        evidenceType: "already_applied",
      });
      return {
        status: "already_applied" as any,
        confirmationScreenshot: (await takeScreenshot(page, "already-applied")) ?? undefined,
        trackingUrl: input.jobUrl,
      };
    }

    const selectors = [
      '[class*="apply"]',
      'a[href*="apply"]',
      'button:has-text("Apply")',
      '[class*="Apply"]',
      'a[class*="apply"]',
      'button[type="button"]:has-text("Apply")',
    ];
    const applyBtn = await findFirstVisible(page, selectors);
    if (applyBtn) {
      await applyBtn.click();
      await page.waitForTimeout(3000);
    }

    const formInfo = await detectFormComplexity(page);
    totalFields = formInfo.totalFields;

    await uploadResume(page, input.resumeUrl);
    const fillResult = await fillKnownFields(
      page,
      input.candidateData || {},
      `Naukri job application`,
      undefined,
      input.userId,
      { company: input.candidateData?.company_name, jobTitle: input.candidateData?.role_title },
    );
    submittedFields = fillResult.filled;
    aiGeneratedAnswers = fillResult.aiGenerated;

    if (input.candidateData) {
      const answered = await handleScreeningQuestions(page, input.candidateData, input.userId, {
        applicationId: input.applicationId,
        provider: "naukri",
        companyName: input.candidateData?.company_name,
        jobTitle: input.candidateData?.role_title,
      });
      submittedFields += answered;
    }

    if (input.approvalMode !== undefined ? input.approvalMode : false) {
      return {
        status: "REQUIRES_APPROVAL",
        submittedFields,
        totalFields,
        formComplexity: formInfo,
        aiGeneratedAnswers,
      };
    }

    const submitted = await clickAnyMatching(page, SUBMIT_BUTTON_SELECTORS);
    if (submitted) {
      await page.waitForTimeout(3000);
      const confirmed = await detectConfirmation(page);
      if (confirmed)
        return {
          status: "APPLIED",
          submittedFields,
          totalFields,
          trackingUrl: input.jobUrl,
          aiGeneratedAnswers,
        };
      return {
        status: "PARTIAL",
        error: "Submit clicked but confirmation not detected",
        submittedFields,
        totalFields,
        trackingUrl: input.jobUrl,
        aiGeneratedAnswers,
      };
    }

    const screenshot1 = await takeScreenshot(page, "naukri-result");
    if (screenshot1) {
      await storeEvidence({
        userId: input.userId,
        applicationId: input.applicationId,
        jobId: input.jobId,
        provider: "naukri",
        evidenceType: "screenshot",
        content: screenshot1,
      });
    }

    return {
      status: "PARTIAL",
      error: "No submit button found",
      submittedFields,
      totalFields,
      trackingUrl: input.jobUrl,
      aiGeneratedAnswers,
    };
  } catch (err: any) {
    return { status: "FAILED", error: `Naukri apply error: ${err.message}` };
  }
}

async function applyWellfound(
  page: any,
  browser: any,
  input: PlatformHandlerInput,
): Promise<ApplyFlowResult & { aiGeneratedAnswers?: Record<string, string> }> {
  try {
    let totalFields = 0;
    let submittedFields = 0;
    let aiGeneratedAnswers: Record<string, string> = {};

    await page.goto(input.jobUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3000);

    const alreadyApplied = await detectConfirmation(page);
    if (alreadyApplied) {
      await storeEvidence({
        userId: input.userId,
        applicationId: input.applicationId,
        jobId: input.jobId,
        provider: "wellfound",
        evidenceType: "already_applied",
      });
      return {
        status: "already_applied" as any,
        confirmationScreenshot: (await takeScreenshot(page, "already-applied")) ?? undefined,
        trackingUrl: input.jobUrl,
      };
    }

    const preApplyUrl = page.url();

    const selectors = [
      'a[class*="apply"]',
      'button:has-text("Apply")',
      'a[href*="/apply"]',
      "[data-apply]",
      'a[class*="Apply"]',
    ];
    const applyBtn = await findFirstVisible(page, selectors);
    if (applyBtn) {
      await applyBtn.click();
      await page.waitForTimeout(3000);
    }

    const formInfo = await detectFormComplexity(page);
    totalFields = formInfo.totalFields;

    if (totalFields === 0) {
      const urlChanged = page.url() !== preApplyUrl;
      return {
        status: urlChanged ? "MANUAL_APPLY_REQUIRED" : "PARTIAL",
        error: urlChanged ? "Redirected to external site" : "No form fields detected",
        submittedFields: 0,
        totalFields: 0,
        trackingUrl: input.jobUrl,
        aiGeneratedAnswers,
      };
    }

    await uploadResume(page, input.resumeUrl);
    const fillResult = await fillKnownFields(
      page,
      input.candidateData || {},
      `Wellfound application`,
      undefined,
      input.userId,
      { company: input.candidateData?.company_name, jobTitle: input.candidateData?.role_title },
    );
    submittedFields = fillResult.filled;
    aiGeneratedAnswers = fillResult.aiGenerated;

    if (input.candidateData) {
      const answered = await handleScreeningQuestions(page, input.candidateData, input.userId, {
        applicationId: input.applicationId,
        provider: "wellfound",
        companyName: input.candidateData?.company_name,
        jobTitle: input.candidateData?.role_title,
      });
      submittedFields += answered;
    }

    if (input.approvalMode !== undefined ? input.approvalMode : false) {
      return {
        status: "REQUIRES_APPROVAL",
        submittedFields,
        totalFields,
        formComplexity: formInfo,
        aiGeneratedAnswers,
      };
    }

    const submitted = await clickAnyMatching(page, SUBMIT_BUTTON_SELECTORS);
    if (submitted) {
      await page.waitForTimeout(3000);
      const confirmed = await detectConfirmation(page);
      if (confirmed)
        return {
          status: "APPLIED",
          submittedFields,
          totalFields,
          trackingUrl: input.jobUrl,
          aiGeneratedAnswers,
        };
      return {
        status: "PARTIAL",
        error: "Submit clicked but confirmation not detected",
        submittedFields,
        totalFields,
        trackingUrl: input.jobUrl,
        aiGeneratedAnswers,
      };
    }

    const screenshot1 = await takeScreenshot(page, "wellfound-result");
    if (screenshot1) {
      await storeEvidence({
        userId: input.userId,
        applicationId: input.applicationId,
        jobId: input.jobId,
        provider: "wellfound",
        evidenceType: "screenshot",
        content: screenshot1,
      });
    }

    return {
      status: "PARTIAL",
      error: "No submit button found",
      submittedFields,
      totalFields,
      trackingUrl: input.jobUrl,
      aiGeneratedAnswers,
    };
  } catch (err: any) {
    return { status: "FAILED", error: `Wellfound apply error: ${err.message}` };
  }
}

async function applyInstahyre(
  page: any,
  browser: any,
  input: PlatformHandlerInput,
): Promise<ApplyFlowResult & { aiGeneratedAnswers?: Record<string, string> }> {
  try {
    let totalFields = 0;
    let submittedFields = 0;
    let aiGeneratedAnswers: Record<string, string> = {};

    await page.goto(input.jobUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3000);

    const alreadyApplied = await detectConfirmation(page);
    if (alreadyApplied) {
      await storeEvidence({
        userId: input.userId,
        applicationId: input.applicationId,
        jobId: input.jobId,
        provider: "instahyre",
        evidenceType: "already_applied",
      });
      return {
        status: "already_applied" as any,
        confirmationScreenshot: (await takeScreenshot(page, "already-applied")) ?? undefined,
        trackingUrl: input.jobUrl,
      };
    }

    const selectors = [
      'button:has-text("Apply")',
      'a[class*="apply"]',
      '[class*="apply"]',
      'button[data-test*="apply"]',
    ];
    const applyBtn = await findFirstVisible(page, selectors);
    if (applyBtn) {
      await applyBtn.click();
      await page.waitForTimeout(3000);
    }

    const formInfo = await detectFormComplexity(page);
    totalFields = formInfo.totalFields;

    await uploadResume(page, input.resumeUrl);
    const fillResult = await fillKnownFields(
      page,
      input.candidateData || {},
      `Instahyre application`,
      undefined,
      input.userId,
      { company: input.candidateData?.company_name, jobTitle: input.candidateData?.role_title },
    );
    submittedFields = fillResult.filled;
    aiGeneratedAnswers = fillResult.aiGenerated;

    if (input.candidateData) {
      const answered = await handleScreeningQuestions(page, input.candidateData, input.userId, {
        applicationId: input.applicationId,
        provider: "instahyre",
        companyName: input.candidateData?.company_name,
        jobTitle: input.candidateData?.role_title,
      });
      submittedFields += answered;
    }

    if (input.approvalMode !== undefined ? input.approvalMode : false) {
      return {
        status: "REQUIRES_APPROVAL",
        submittedFields,
        totalFields,
        formComplexity: formInfo,
        aiGeneratedAnswers,
      };
    }

    const submitted = await clickAnyMatching(page, SUBMIT_BUTTON_SELECTORS);
    if (submitted) {
      await page.waitForTimeout(3000);
      const confirmed = await detectConfirmation(page);
      if (confirmed)
        return {
          status: "APPLIED",
          submittedFields,
          totalFields,
          trackingUrl: input.jobUrl,
          aiGeneratedAnswers,
        };
      return {
        status: "PARTIAL",
        error: "Submit clicked but confirmation not detected",
        submittedFields,
        totalFields,
        trackingUrl: input.jobUrl,
        aiGeneratedAnswers,
      };
    }

    const screenshot1 = await takeScreenshot(page, "instahyre-result");
    if (screenshot1) {
      await storeEvidence({
        userId: input.userId,
        applicationId: input.applicationId,
        jobId: input.jobId,
        provider: "instahyre",
        evidenceType: "screenshot",
        content: screenshot1,
      });
    }

    return {
      status: "PARTIAL",
      error: "No submit button found",
      submittedFields,
      totalFields,
      trackingUrl: input.jobUrl,
      aiGeneratedAnswers,
    };
  } catch (err: any) {
    return { status: "FAILED", error: `Instahyre apply error: ${err.message}` };
  }
}

async function findFirstVisible(page: any, selectors: string[]): Promise<any> {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el && (await el.isVisible())) return el;
    } catch (err) {
      console.warn(`[playwright-apply] findFirstVisible: ${err}`);
      continue;
    }
  }
  return null;
}

export async function recordPlaywrightApplyResult(input: {
  userId: string;
  applicationId: string;
  provider: string;
  result: ApplyFlowResult;
}) {
  const statusMap: Record<ApplyFlowStatus, string> = {
    APPLIED: "applied",
    PARTIAL: "saved",
    REQUIRES_APPROVAL: "saved",
    FAILED: "saved",
    MANUAL_APPLY_REQUIRED: "saved",
  };
  const newStatus = statusMap[input.result.status] || "saved";
  const isSuccess = input.result.status === "APPLIED";

  const updateData: any = {
    status: newStatus,
  };
  if (isSuccess) {
    updateData.applied_at = new Date().toISOString();
  }

  // Try full update first, fall back to safe columns if schema drift
  try {
    const fullData: any = {
      ...updateData,
      provider: input.provider,
      tracking_url: input.result.trackingUrl ?? null,
      external_id: input.result.externalId ?? null,
    };
    if (isSuccess) {
      fullData.submitted_at = new Date().toISOString();
      fullData.submitted_via = "playwright_automation";
    }
    const { error } = await supabaseAdmin
      .from("applications")
      .update(fullData)
      .eq("id", input.applicationId)
      .eq("user_id", input.userId);
    if (error) throw error;
  } catch (err: any) {
    console.warn(
      `[recordPlaywrightApplyResult] Full update failed (${err?.message}), trying safe columns...`,
    );
    try {
      const { error: fallbackErr } = await supabaseAdmin
        .from("applications")
        .update(updateData)
        .eq("id", input.applicationId)
        .eq("user_id", input.userId);
      if (fallbackErr)
        console.warn(`[recordPlaywrightApplyResult] Fallback also failed: ${fallbackErr.message}`);
    } catch (fallbackErr: any) {
      console.warn(`[recordPlaywrightApplyResult] Fallback error: ${fallbackErr.message}`);
    }
  }

  try {
    await supabaseAdmin.from("application_events").insert({
      user_id: input.userId,
      application_id: input.applicationId,
      event_type: isSuccess ? "submitted" : "submission_failed",
      description: `Playwright apply (${input.provider}): ${input.result.status}${input.result.error ? ` — ${input.result.error}` : ""} | Fields: ${input.result.submittedFields}/${input.result.totalFields}`,
      occurred_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.warn(`[recordPlaywrightApplyResult] Event insert failed: ${e.message}`);
  }

  try {
    const eventType = isSuccess ? "application_submitted" : "application_submission_failed";
    await emitWorkflowEvent({
      userId: input.userId,
      eventType,
      entityType: "applications",
      entityId: input.applicationId,
      payload: {
        provider: input.provider,
        method: "playwright_automation",
        status: input.result.status,
        submittedFields: input.result.submittedFields,
        totalFields: input.result.totalFields,
        evidenceIds: input.result.evidenceIds,
        error: input.result.error ?? null,
      },
    });
  } catch (e: any) {
    console.warn(`[recordPlaywrightApplyResult] Event emission failed: ${e.message}`);
  }
}

export async function getApplyEvidence(applicationId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("apply_evidence")
    .select("*")
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
