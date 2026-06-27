import { supabaseAdmin } from "./supabase.js";

export type EmailConfidence = "VERIFIED" | "LIKELY" | "UNKNOWN";

export type EmailVerificationResult = {
  email: string;
  confidence: EmailConfidence;
  method: "mx_validation" | "website_extraction" | "pattern_inference" | "manual";
  mxValid: boolean;
  mxRecords: string[];
  sourceUrl: string | null;
  sourcePage: string | null;
};

const COMMON_EMAIL_PATTERNS = [
  (first: string, last: string) => `${first}.${last}`,
  (first: string, last: string) => `${first}${last}`,
  (first: string, last: string) => `${first[0]}${last}`,
  (first: string, last: string) => `${first}.${last[0]}`,
  (first: string, last: string) => `${first}_${last}`,
  (first: string, last: string) => `${first[0]}.${last}`,
  (first: string, last: string) => `${last}.${first}`,
  (first: string, last: string) => `${first}`,
  (first: string, last: string) => `${first}-${last}`,
];

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch (err) {
    console.warn("[EmailDiscovery] extractDomain failed", err);
    return null;
  }
}

export function generateEmailPatterns(name: string, companyDomain: string): string[] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || !companyDomain) return [];
  const first = parts[0].toLowerCase();
  const last = parts[parts.length - 1].toLowerCase();
  const domain = companyDomain.replace(/^www\./, "");
  const patterns = new Set<string>();
  for (const pattern of COMMON_EMAIL_PATTERNS) {
    patterns.add(`${pattern(first, last)}@${domain}`);
  }
  return [...patterns];
}

export async function verifyEmailMX(email: string): Promise<{ valid: boolean; records: string[] }> {
  try {
    const domain = email.split("@")[1];
    if (!domain) return { valid: false, records: [] };
    const res = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { valid: false, records: [] };
    const data = await res.json();
    const records: string[] = (data.Answer || []).map((r: any) => r.data);
    const valid = records.length > 0;
    return { valid, records };
  } catch (err) {
    console.warn("[EmailDiscovery] checkEmailMX DNS lookup failed", err);
    return { valid: false, records: [] };
  }
}

export async function extractEmailsFromPage(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 VALTREXA-V2/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex);
    if (!matches) return [];
    return [...new Set(matches)].filter((e) => {
      const domain = e.split("@")[1]?.toLowerCase();
      return domain && !/example\.com|test\.com|domain\.com/i.test(domain);
    });
  } catch (err) {
    console.warn("[EmailDiscovery] extractEmailsFromPage fetch failed", err);
    return [];
  }
}

function inferConfidence(mxValid: boolean, method: string): EmailConfidence {
  if (mxValid && method === "mx_validation") return "VERIFIED";
  if (method === "website_extraction" && mxValid) return "VERIFIED";
  if (method === "website_extraction") return "LIKELY";
  if (method === "pattern_inference" && mxValid) return "LIKELY";
  if (method === "pattern_inference") return "UNKNOWN";
  return "UNKNOWN";
}

export async function verifyEmailPipeline(
  email: string,
  name: string,
  companyUrl?: string,
  companyDomain?: string,
): Promise<EmailVerificationResult> {
  const domain = companyDomain || (companyUrl ? extractDomain(companyUrl) : email.split("@")[1]);
  let method: EmailVerificationResult["method"] = "pattern_inference";
  let mxValid = false;
  let mxRecords: string[] = [];
  let sourceUrl: string | null = null;
  let sourcePage: string | null = null;

  if (companyUrl) {
    const emails = await extractEmailsFromPage(companyUrl);
    if (emails.length > 0) {
      method = "website_extraction";
      sourceUrl = companyUrl;
      sourcePage = "website";
    }
  }

  const contactUrls = companyUrl
    ? [
        `${companyUrl.replace(/\/$/, "")}/contact`,
        `${companyUrl.replace(/\/$/, "")}/contact-us`,
        `${companyUrl.replace(/\/$/, "")}/team`,
        `${companyUrl.replace(/\/$/, "")}/about`,
      ]
    : [];

  for (const url of contactUrls) {
    const emails = await extractEmailsFromPage(url);
    if (emails.length > 0) {
      method = "website_extraction";
      sourceUrl = url;
      sourcePage = "contact/team page";
      if (emails.some((e) => e.toLowerCase() === email.toLowerCase())) break;
    }
  }

  const mxResult = await verifyEmailMX(email);
  mxValid = mxResult.valid;
  mxRecords = mxResult.records;

  if (mxValid && method === "pattern_inference") {
    method = "mx_validation";
  }

  const confidence = inferConfidence(mxValid, method);

  return {
    email,
    confidence,
    method,
    mxValid,
    mxRecords,
    sourceUrl,
    sourcePage,
  };
}

export async function storeEmailVerification(input: {
  userId: string;
  recruiterId?: string;
  email: string;
  confidence: EmailConfidence;
  method: string;
  mxValid: boolean;
  mxRecords: string[];
  sourceUrl?: string;
  sourcePage?: string;
}): Promise<{ id: string; confidence: EmailConfidence }> {
  const existing = await supabaseAdmin
    .from("email_verifications")
    .select("id")
    .eq("user_id", input.userId)
    .eq("email", input.email)
    .maybeSingle();

  const payload = {
    user_id: input.userId,
    recruiter_id: input.recruiterId ?? null,
    email: input.email,
    confidence: input.confidence,
    verification_method: input.method,
    mx_valid: input.mxValid,
    mx_records: input.mxRecords,
    source_url: input.sourceUrl ?? null,
    source_page: input.sourcePage ?? null,
    verified_at: input.confidence === "VERIFIED" ? new Date().toISOString() : null,
  };

  if (existing.data?.id) {
    await supabaseAdmin.from("email_verifications").update(payload).eq("id", existing.data.id);
    return { id: existing.data.id, confidence: input.confidence };
  }

  const { data } = await supabaseAdmin
    .from("email_verifications")
    .insert(payload)
    .select("id")
    .single();
  return { id: data?.id ?? "", confidence: input.confidence };
}

export async function verifyAndStoreEmailsForRecruiters(
  userId: string,
  recruiters: Array<{
    id: string;
    name: string;
    email: string | null;
    companyUrl?: string;
    companyDomain?: string;
  }>,
): Promise<Array<{ recruiterId: string; email: string; confidence: EmailConfidence }>> {
  const results: Array<{ recruiterId: string; email: string; confidence: EmailConfidence }> = [];

  for (const recruiter of recruiters) {
    if (!recruiter.email) {
      if (recruiter.name && (recruiter.companyDomain || recruiter.companyUrl)) {
        const domain = recruiter.companyDomain || extractDomain(recruiter.companyUrl || "");
        if (domain) {
          const patterns = generateEmailPatterns(recruiter.name, domain);
          for (const pattern of patterns) {
            const verification = await verifyEmailPipeline(
              pattern,
              recruiter.name,
              recruiter.companyUrl,
              domain,
            );
            const stored = await storeEmailVerification({
              userId,
              recruiterId: recruiter.id,
              email: pattern,
              confidence: verification.confidence,
              method: verification.method,
              mxValid: verification.mxValid,
              mxRecords: verification.mxRecords,
              sourceUrl: verification.sourceUrl ?? undefined,
              sourcePage: verification.sourcePage ?? undefined,
            });
            results.push({
              recruiterId: recruiter.id,
              email: pattern,
              confidence: stored.confidence,
            });

            await supabaseAdmin
              .from("recruiters")
              .update({
                email: pattern,
                email_verified: verification.confidence === "VERIFIED",
              })
              .eq("id", recruiter.id);

            if (verification.confidence === "VERIFIED") break;
          }
        }
      }
      continue;
    }

    const verification = await verifyEmailPipeline(recruiter.email, recruiter.name);
    const stored = await storeEmailVerification({
      userId,
      recruiterId: recruiter.id,
      email: recruiter.email,
      confidence: verification.confidence,
      method: verification.method,
      mxValid: verification.mxValid,
      mxRecords: verification.mxRecords,
      sourceUrl: verification.sourceUrl ?? undefined,
      sourcePage: verification.sourcePage ?? undefined,
    });
    results.push({
      recruiterId: recruiter.id,
      email: recruiter.email,
      confidence: stored.confidence,
    });

    await supabaseAdmin
      .from("recruiters")
      .update({
        email_verified: verification.confidence === "VERIFIED",
      })
      .eq("id", recruiter.id);
  }

  return results;
}
