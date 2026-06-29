export type SalaryPeriod = "yearly" | "monthly" | "hourly" | "one-time";

export type ParsedSalary = {
  min: number | null;
  max: number | null;
  currency: string;
  period: SalaryPeriod;
  original: string;
};

const CURRENCY_PATTERNS: { regex: RegExp; code: string }[] = [
  { regex: /\$|usd|US\$|U\$/, code: "USD" },
  { regex: /[€]|eur/i, code: "EUR" },
  { regex: /[£]|gbp/i, code: "GBP" },
  { regex: /[¥]|jpy/i, code: "JPY" },
  { regex: /[₹]|inr|rs\.?/i, code: "INR" },
  { regex: /[₩]|krw/i, code: "KRW" },
  { regex: /a\$|aud/i, code: "AUD" },
  { regex: /c\$|cad/i, code: "CAD" },
];

function detectCurrency(text: string): string {
  for (const { regex, code } of CURRENCY_PATTERNS) {
    if (regex.test(text)) return code;
  }
  return "USD";
}

function detectPeriod(text: string): SalaryPeriod {
  const lower = text.toLowerCase();
  if (/per hour|\/hr|\/hour|hourly|an hour|per hr/i.test(lower)) return "hourly";
  if (/per month|\/mo|\/month|monthly|a month/i.test(lower)) return "monthly";
  if (/one.?time|signing bonus|sign-on|sign.on/i.test(lower)) return "one-time";
  return "yearly";
}

function normalizeNumber(s: string): number | null {
  const cleaned = s.replace(/[,₹$€£¥₩\s]/g, "").trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return num;
}

function applyMultiplier(raw: string, value: number): number {
  const s = raw.toLowerCase();
  if (s.includes("k")) return value * 1000;
  if (/lpa|lakhs?/.test(s)) return value * 100000;
  if (/crore|crore/.test(s)) return value * 10000000;
  if (/million/.test(s)) return value * 1000000;
  // Handle standalone "L" or "l" as lakh (e.g., 15L, 20L)
  if (/^l$/i.test(s.trim())) return value * 100000;
  if (s.startsWith("m") && s.length <= 2) return value * 1000000;
  return value;
}

function convertToYearly(value: number, period: SalaryPeriod): number {
  switch (period) {
    case "hourly":
      return value * 2080;
    case "monthly":
      return value * 12;
    case "one-time":
      return value;
    case "yearly":
      return value;
  }
}

const RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.26,
  INR: 0.012,
  JPY: 0.0067,
  KRW: 0.00072,
  AUD: 0.65,
  CAD: 0.73,
};

function toYearlyUSD(
  minYearly: number | null,
  maxYearly: number | null,
  currency: string,
): { min: number | null; max: number | null } {
  const rate = RATES[currency.toUpperCase()] ?? 1;
  return {
    min: minYearly != null ? Math.round(minYearly * rate) : null,
    max: maxYearly != null ? Math.round(maxYearly * rate) : null,
  };
}

interface RawValue {
  raw: string;
  value: number;
  suffix?: string;
}

function extractValues(text: string): RawValue[] {
  const valueRegex =
    /(?:[₹$€£¥₩])?[\s]*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(k|K|L|l|lpa|LPA|lakh|Lakh|L|crore|Crore|million|M|m|(?:\/hr|\/hour|\/mo|\/month|per\s*hour|per\s*month|per\s*yr|per\s*year|annum|yearly|monthly|hourly)?)\b/g;
  const results: RawValue[] = [];
  let match;
  while ((match = valueRegex.exec(text)) !== null) {
    const num = normalizeNumber(match[1]);
    const suffix = (match[2] || "").trim();
    if (num != null) {
      const hasCurrency = /^[₹$€£¥₩]/.test(match[0].trim());
      const hasSuffix = suffix.length > 0;
      // Skip bare small numbers that aren't salary figures (e.g., "2" in "SDE 2")
      if (num < 1000 && !hasCurrency && !hasSuffix) continue;

      const multiplied = applyMultiplier(suffix, num);
      results.push({ raw: match[0], value: multiplied, suffix });
    }
  }
  return results;
}

function inferRangeFromValues(values: RawValue[]): { min: number | null; max: number | null } {
  if (values.length === 0) return { min: null, max: null };
  if (values.length === 1) {
    const v = values[0].value;
    return { min: Math.round(v * 0.8), max: Math.round(v * 1.2) };
  }
  const nums = values.map((v) => v.value).sort((a, b) => a - b);
  return { min: nums[0], max: nums[nums.length - 1] };
}

export function parseSalary(text: string | null | undefined): ParsedSalary {
  if (!text || !text.trim()) {
    return { min: null, max: null, currency: "USD", period: "yearly", original: "" };
  }

  const cleaned = text.replace(/\s+/g, " ").trim();
  const currency = detectCurrency(cleaned);
  const period = detectPeriod(cleaned);

  // Check for "competitive", "negotiable", "DOE"
  if (
    /^\s*(competitive|negotiable|doe|depending on experience|based on experience)\s*$/i.test(
      cleaned,
    )
  ) {
    return { min: null, max: null, currency, period: "yearly", original: text };
  }

  const values = extractValues(cleaned);

  if (values.length === 0) {
    // Try splitting on common delimiters and re-extracting
    const parts = cleaned.split(/[-,–]+/).filter(Boolean);
    for (const part of parts) {
      const subValues = extractValues(part);
      values.push(...subValues);
    }
  }

  if (values.length === 0) {
    return { min: null, max: null, currency, period: "yearly", original: text };
  }

  const { min, max } = inferRangeFromValues(values);
  const minYearly = min != null ? convertToYearly(min, period) : null;
  const maxYearly = max != null ? convertToYearly(max, period) : null;

  return {
    min: minYearly,
    max: maxYearly,
    currency,
    period: "yearly",
    original: text,
  };
}

export function salaryToYearlyUSD(parsed: ParsedSalary): {
  min: number | null;
  max: number | null;
} {
  return toYearlyUSD(parsed.min, parsed.max, parsed.currency);
}

type JobSalaryFields = {
  salary_min: number | null;
  salary_max: number | null;
};

export function extractSalaries(
  title: string,
  description: string,
  location: string | null,
): JobSalaryFields {
  const combined = `${title}\n${description}\n${location ?? ""}`;
  // Remove known non-salary numbers (years, dates, phone numbers)
  const cleaned = combined
    .replace(/\b\d{4}\b/g, "")
    .replace(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "");
  const parsed = parseSalary(cleaned);

  if (parsed.min == null && parsed.max == null) {
    return { salary_min: null, salary_max: null };
  }

  const usd = salaryToYearlyUSD(parsed);
  return {
    salary_min: usd.min,
    salary_max: usd.max,
  };
}
