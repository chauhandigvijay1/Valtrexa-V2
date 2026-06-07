import * as cheerio from "cheerio";

export type ImportedJob = {
  externalId: string;
  title: string;
  companyName: string | null;
  location: string | null;
  url: string | null;
  source: string;
  description: string;
  postedAt: string | null;
  rawPayload: Record<string, unknown>;
};

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "CareerCompassPro/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function fetchHtml(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 CareerCompassPro/1.0",
      ...headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

export async function importGreenhouse(boardToken: string): Promise<ImportedJob[]> {
  const payload = await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`,
  );
  return (payload.jobs ?? []).map((job: any) => ({
    externalId: String(job.id),
    title: job.title,
    companyName: boardToken,
    location: job.location?.name ?? null,
    url: job.absolute_url ?? null,
    source: "greenhouse",
    description: job.content ?? "",
    postedAt: job.updated_at ?? null,
    rawPayload: job,
  }));
}

export async function importLever(site: string): Promise<ImportedJob[]> {
  const payload = await fetchJson(`https://api.lever.co/v0/postings/${site}?mode=json`);
  return (payload ?? []).map((job: any) => ({
    externalId: String(job.id),
    title: job.text,
    companyName: site,
    location: job.categories?.location ?? null,
    url: job.hostedUrl ?? null,
    source: "lever",
    description: [job.descriptionPlain, job.additionalPlain, job.listsPlain]
      .filter(Boolean)
      .join("\n\n"),
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    rawPayload: job,
  }));
}

export async function importAshby(boardUrl: string): Promise<ImportedJob[]> {
  try {
    const boardName = boardUrl.split("/").filter(Boolean).pop();
    if (boardName) {
      const postingsUrl = `https://api.ashbyhq.com/depot/v1/job-board/api/job-board-postings?jobBoardName=${boardName}`;
      const response = await fetch(postingsUrl, { signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        const payload = await response.json();
        return (payload.jobs ?? []).map((job: any, index: number) => ({
          externalId: String(job.id ?? job.slug ?? `${index}`),
          title: job.title ?? job.name ?? "Untitled job",
          companyName: job.companyName ?? boardName,
          location: job.location ?? job.locationName ?? null,
          url: job.jobUrl ?? job.absoluteUrl ?? null,
          source: "ashby",
          description: job.description ?? job.descriptionHtml ?? "",
          postedAt: job.publishedAt ?? job.publishedDate ?? null,
          rawPayload: job,
        }));
      }
    }
  } catch (err: any) {
    console.error("Ashby Depot API failed:", err.message);
  }

  try {
    const html = await fetchHtml(boardUrl);
    const $ = cheerio.load(html);
    const scriptContent = $("script#__NEXT_DATA__").html();
    if (!scriptContent) {
      return [];
    }

    const data = JSON.parse(scriptContent);
    const jobs = data?.props?.pageProps?.jobs ?? data?.props?.pageProps?.jobBoard?.jobs ?? [];

    return (jobs ?? []).map((job: any, index: number) => ({
      externalId: String(job.id ?? job.slug ?? `${index}`),
      title: job.title ?? job.name ?? "Untitled job",
      companyName: job.companyName ?? null,
      location: job.location ?? job.locationName ?? null,
      url: job.jobUrl ?? job.absoluteUrl ?? null,
      source: "ashby",
      description: job.description ?? job.descriptionHtml ?? "",
      postedAt: job.publishedDate ?? null,
      rawPayload: job,
    }));
  } catch (err) {
    return [];
  }
}

function scrapeAnchorJobs(
  source: string,
  html: string,
  baseUrl: string,
  companyName?: string | null,
): ImportedJob[] {
  const $ = cheerio.load(html);
  const jobs: ImportedJob[] = [];
  $("a").each((index, el) => {
    const title = $(el).text().replace(/\s+/g, " ").trim();
    const href = $(el).attr("href");
    if (!href || !title || title.length < 8) return;
    const lowerHref = href.toLowerCase();
    if (
      !lowerHref.includes("/job") &&
      !lowerHref.includes("/jobs") &&
      !lowerHref.includes("position")
    )
      return;
    const url = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
    jobs.push({
      externalId: `${source}-${index}-${Buffer.from(url).toString("base64").slice(0, 24)}`,
      title,
      companyName: companyName ?? null,
      location: null,
      url,
      source,
      description: "",
      postedAt: null,
      rawPayload: { url, title },
    });
  });
  return jobs;
}

export async function importHtmlSource(
  source: "linkedin" | "naukri" | "wellfound" | "indeed" | "instahyre",
  searchUrl: string,
  headers?: Record<string, string>,
) {
  const html = await fetchHtml(searchUrl, headers);
  return scrapeAnchorJobs(source, html, searchUrl);
}
