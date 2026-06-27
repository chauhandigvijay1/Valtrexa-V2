import * as cheerio from "cheerio";
import type { ImportedJob } from "./job-sources.js";

/**
 * A3 — Workable provider.
 *
 * Workable exposes a public JSON feed for every account at:
 *   https://www.workable.com/spi/v3/accounts/<subdomain>/jobs
 * and per-job Apply links. This module is used by WorkableProvider.
 */
export async function importWorkable(boardUrl: string, apiKey?: string): Promise<ImportedJob[]> {
  // 1. Resolve the account subdomain from a board URL like
  //    https://apply.workable.com/<account>/  OR  https://<account>.workable.com/
  let account: string | null = null;
  try {
    const parsed = new URL(boardUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith(".workable.com") && host !== "www.workable.com") {
      account = host.split(".")[0];
    } else if (host === "apply.workable.com") {
      account = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }
  } catch (err) {
    console.warn("[WorkableSource] URL parsing failed", err);
    account = boardUrl.split("/").filter(Boolean).pop() ?? null;
  }

  if (!account) return [];

  const headers: Record<string, string> = {
    "user-agent": "VALTREXA-V2/1.0",
    accept: "application/json",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  // 2. Try the public SPI feed first.
  try {
    const feedUrl = `https://apply.workable.com/api/v3/accounts/${account}/jobs`;
    const response = await fetch(feedUrl, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const payload = await response.json();
      const jobs = payload.jobs ?? [];
      return (jobs as any[]).map((job) => ({
        externalId: String(job.id ?? job.shortcode ?? job.url),
        title: job.title ?? "Untitled",
        companyName: job.company ?? account,
        location: job.location ?? job.location_str ?? null,
        url: job.url ?? job.apply_url ?? null,
        source: "workable",
        description: job.description ?? job.full_description ?? "",
        postedAt: job.published_on ?? job.created_at ?? null,
        rawPayload: job,
      }));
    }
  } catch (err) {
    console.warn("[WorkableSource] SPI feed fetch failed, falling back to HTML scrape", err);
  }

  // 3. Fall back to scraping the public board HTML.
  try {
    const htmlRes = await fetch(boardUrl, {
      headers: { "user-agent": "VALTREXA-V2/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!htmlRes.ok) return [];
    const html = await htmlRes.text();
    const $ = cheerio.load(html);
    const jobs: ImportedJob[] = [];
    $('[data-pin-id], .job-item, li[data-job-id], a[href*="/job/"]').each((index, el) => {
      const $el = $(el);
      const title = $el.text().replace(/\s+/g, " ").trim();
      const href = $el.is("a") ? $el.attr("href") : $el.find("a").first().attr("href");
      if (!title || title.length < 4 || !href) return;
      const url = href.startsWith("http") ? href : new URL(href, boardUrl).toString();
      jobs.push({
        externalId: `workable-${index}-${Buffer.from(url).toString("base64").slice(0, 24)}`,
        title,
        companyName: account,
        location: $el.find(".location, [data-location]").first().text().trim() || null,
        url,
        source: "workable",
        description: "",
        postedAt: null,
        rawPayload: { url, title },
      });
    });
    return jobs;
  } catch (err) {
    console.warn("[WorkableSource] HTML scrape failed", err);
    return [];
  }
}
