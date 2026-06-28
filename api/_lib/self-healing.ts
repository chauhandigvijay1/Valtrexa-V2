import { Page, ElementHandle } from "playwright";
import { logger } from "./logger.js";
import {
  ProviderName,
  getProviderControl,
  setProviderStatus,
  recordProviderSuccess,
  recordProviderFailure,
} from "./provider-controls.js";
import { logHealthEvent } from "./provider-controls.js";
import { FailureResult, detectFailures } from "./failure-detection.js";
import { sendAlert, alertProviderDisabled } from "./alerting.js";

// ─── Selector Fallback Chain ──────────────────────────────

export async function findElementWithFallback(
  page: Page,
  selectors: string[],
  context?: string,
): Promise<ElementHandle<HTMLElement> | null> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) return el as ElementHandle<HTMLElement>;
    } catch {
      continue;
    }
  }
  return null;
}

export async function clickWithFallback(page: Page, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

export async function fillWithFallback(
  page: Page,
  selectors: string[],
  value: string,
): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.fill(value);
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

export async function waitWithFallback(
  page: Page,
  selectors: string[],
  timeout = 10000,
): Promise<boolean> {
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

// ─── Aria / Text Matching ─────────────────────────────────

export async function findElementByText(
  page: Page,
  text: string,
  tag = "button, a, span, div, input",
): Promise<ElementHandle<HTMLElement> | null> {
  try {
    const els = await page.$$(tag);
    for (const el of els) {
      const innerText = await el.innerText().catch(() => "");
      if (innerText.toLowerCase().includes(text.toLowerCase())) {
        return el as ElementHandle<HTMLElement>;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function findElementByAriaLabel(
  page: Page,
  label: string,
): Promise<ElementHandle<HTMLElement> | null> {
  try {
    const el = await page.$(`[aria-label="${label}"], [aria-label*="${label}"]`);
    return el as ElementHandle<HTMLElement> | null;
  } catch (err) {
    logger.warn("[SelfHealing] findElementByAriaLabel failed", err);
    return null;
  }
}

export async function clickByText(
  page: Page,
  text: string,
  tag = "button, a, span, div",
): Promise<boolean> {
  const el = await findElementByText(page, text, tag);
  if (el) {
    await el.click();
    return true;
  }
  return false;
}

// ─── Fuzzy Match ──────────────────────────────────────────

export async function findElementFuzzy(
  page: Page,
  label: string,
  tag = "button, a, span, div, input",
): Promise<ElementHandle<HTMLElement> | null> {
  try {
    const els = await page.$$(tag);
    const labelLower = label.toLowerCase();
    let bestMatch: ElementHandle<HTMLElement> | null = null;
    let bestScore = 0;

    for (const el of els) {
      const text = await el.innerText().catch(() => "");
      const lower = text.toLowerCase();
      let score = 0;
      const words = labelLower.split(/\s+/);
      for (const word of words) {
        if (word.length < 3) continue;
        if (lower.includes(word)) score += word.length;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = el as ElementHandle<HTMLElement>;
      }
    }

    return bestMatch;
  } catch (err) {
    logger.warn("[SelfHealing] findElementFuzzy failed", err);
    return null;
  }
}

export async function clickFuzzy(
  page: Page,
  label: string,
  tag = "button, a, span, div",
): Promise<boolean> {
  const el = await findElementFuzzy(page, label, tag);
  if (el) {
    await el.click();
    return true;
  }
  return false;
}

// ─── Retry Wrappers ───────────────────────────────────────

export async function retryOperation<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelay = options.baseDelay ?? 2000;

  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        if (options.onRetry) options.onRetry(attempt, err);
        await new Promise((r) => setTimeout(r, baseDelay * attempt));
      }
    }
  }
  throw lastError;
}

export async function retryNavigation(
  page: Page,
  url: string,
  options: { maxRetries?: number; timeout?: number } = {},
): Promise<boolean> {
  return retryOperation(
    async () => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: options.timeout ?? 30000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      return true;
    },
    { maxRetries: options.maxRetries ?? 3 },
  );
}

export async function retryUpload(
  page: Page,
  selector: string,
  filePath: string,
  options: { maxRetries?: number } = {},
): Promise<boolean> {
  return retryOperation(
    async () => {
      const input = await page.$(selector);
      if (!input) throw new Error(`Upload input not found: ${selector}`);
      await input.setInputFiles(filePath);
      await page.waitForTimeout(2000);
      return true;
    },
    { maxRetries: options.maxRetries ?? 3 },
  );
}

export async function retryClick(
  page: Page,
  selector: string,
  options: { maxRetries?: number; delay?: number } = {},
): Promise<boolean> {
  return retryOperation(
    async () => {
      const el = await page.$(selector);
      if (!el) throw new Error(`Element not found: ${selector}`);
      await el.click();
      return true;
    },
    { maxRetries: options.maxRetries ?? 3, baseDelay: options.delay ?? 1000 },
  );
}

// ─── Auto-Heal on Failure ─────────────────────────────────

export async function autoHeal(
  page: Page,
  url: string,
  provider: ProviderName,
  failures: FailureResult[],
  userId: string,
): Promise<{ healed: boolean; action: string }> {
  for (const f of failures) {
    switch (f.type) {
      case "login_redirect":
      case "session_expired":
      case "cookie_expired": {
        // Attempt to navigate back to the intended URL
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
        const recheck = await detectFailures(page, url, provider);
        if (recheck.length === 0) {
          await recordProviderSuccess(provider, userId);
          return { healed: true, action: `Re-navigated to ${url}` };
        }
        break;
      }

      case "captcha_detected": {
        // Cannot auto-solve CAPTCHA — log and return
        return { healed: false, action: "CAPTCHA requires manual intervention" };
      }

      case "anti_bot_page": {
        // Try adding a delay and re-navigating
        await page.waitForTimeout(5000);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(5000);
        const recheck2 = await detectFailures(page, url, provider);
        if (recheck2.length === 0) {
          await recordProviderSuccess(provider, userId);
          return { healed: true, action: "Delayed and re-navigated to avoid anti-bot" };
        }
        return { healed: false, action: "Anti-bot persistent — needs manual resolution" };
      }

      case "provider_downtime": {
        // Retry after delay
        await page.waitForTimeout(10000);
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(3000);
          const recheck3 = await detectFailures(page, url, provider);
          if (recheck3.length === 0) {
            await recordProviderSuccess(provider, userId);
            return { healed: true, action: "Provider recovered after delay" };
          }
        } catch (err) {
          logger.warn("[SelfHealing] provider recovery check failed", err);
        }
        return { healed: false, action: "Provider still unavailable" };
      }

      default:
        break;
    }
  }

  return { healed: false, action: "No auto-heal action available" };
}

// ─── Smart Heal (run after selector failure) ──────────────

export async function smartSelectorHeal(
  page: Page,
  primarySelector: string,
  fallbackSelectors: string[],
): Promise<ElementHandle<HTMLElement> | null> {
  const allSelectors = [primarySelector, ...fallbackSelectors];
  const el = await findElementWithFallback(page, allSelectors);
  if (!el) {
    // Try by text
    const textMatch = primarySelector.replace(/[.#>\s].*$/, "").replace(/[.#]/g, "");
    const textEl = await findElementByText(page, textMatch);
    if (textEl) return textEl;

    // Try fuzzy
    const fuzzyEl = await findElementFuzzy(page, textMatch);
    if (fuzzyEl) return fuzzyEl;
  }
  return el;
}
