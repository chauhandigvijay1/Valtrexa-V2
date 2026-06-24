import {
  ImportedJob,
  importGreenhouse,
  importLever,
  importAshby,
  importHtmlSource,
} from "./job-sources.js";
import { importWorkable } from "./workable-source.js";

/**
 * A3 — Provider Abstraction.
 *
 * Three interfaces describe the full platform capability surface. Every
 * concrete provider implements as many of them as its upstream supports.
 *
 *   JobProvider         — import job listings
 *   RecruiterProvider   — discover recruiter / hiring-manager / founder contacts
 *   ApplicationProvider — submit an application through the provider
 *
 * A provider returns a status string so callers can distinguish between
 * genuine failures and the "READY_FOR_CREDENTIALS" case (auth required).
 */

/** Authentication scheme a provider needs to operate. */
export type AuthMethod =
  | "public_board" // token-in-url / public feed (greenhouse, lever, ashby, workable)
  | "session_cookie" // browser session cookie (linkedin, naukri, wellfound, indeed, instahyre)
  | "api_key" // partner api key (greenhouse harvest, workable api)
  | "oauth" // user oauth (gmail)
  | "none";

/** Capability flags surfaced by each provider. */
export interface ProviderCapabilities {
  jobsSupported: boolean;
  recruitersSupported: boolean;
  applicationsSupported: boolean;
}

export interface JobProvider {
  readonly capabilities: ProviderCapabilities;
  readonly authMethod: AuthMethod;
  importJobs(config: any): Promise<{ status: string; jobs: ImportedJob[] }>;
}

export interface RecruiterProvider {
  readonly capabilities: ProviderCapabilities;
  readonly authMethod: AuthMethod;
  discoverRecruiters(
    companyName: string,
    roleTitle: string,
    config?: any,
  ): Promise<{ status: string; recruiters: any[] }>;
}

export interface ApplicationProvider {
  readonly capabilities: ProviderCapabilities;
  readonly authMethod: AuthMethod;
  submitApplication(
    applicationId: string,
    details: any,
    config?: any,
  ): Promise<{ status: string; success: boolean; externalId?: string }>;
}

const ATS_CAPS: ProviderCapabilities = {
  jobsSupported: true,
  recruitersSupported: false,
  applicationsSupported: false,
};

const SCRAPE_CAPS: ProviderCapabilities = {
  jobsSupported: true,
  recruitersSupported: true,
  applicationsSupported: true,
};

export class GreenhouseProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
  readonly capabilities = ATS_CAPS;
  readonly authMethod: AuthMethod = "public_board";

  async importJobs(config: any): Promise<{ status: string; jobs: ImportedJob[] }> {
    if (!config.boardToken) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    const jobs = await importGreenhouse(config.boardToken);
    return { status: "SUCCESS", jobs };
  }

  async discoverRecruiters(
    companyName: string,
    roleTitle: string,
    config?: any,
  ): Promise<{ status: string; recruiters: any[] }> {
    return { status: "NOT_SUPPORTED", recruiters: [] };
  }

  async submitApplication(
    applicationId: string,
    details: any,
    config?: any,
  ): Promise<{ status: string; success: boolean }> {
    // Greenhouse does not expose a public application submission API for job seekers.
    // Candidates must apply through the greenhouse.io hosted career page.
    return { status: "MANUAL_APPLY_REQUIRED", success: false };
  }
}

export class LeverProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
  readonly capabilities = ATS_CAPS;
  readonly authMethod: AuthMethod = "public_board";

  async importJobs(config: any): Promise<{ status: string; jobs: ImportedJob[] }> {
    if (!config.site) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    const jobs = await importLever(config.site);
    return { status: "SUCCESS", jobs };
  }

  async discoverRecruiters(
    companyName: string,
    roleTitle: string,
    config?: any,
  ): Promise<{ status: string; recruiters: any[] }> {
    return { status: "NOT_SUPPORTED", recruiters: [] };
  }

  async submitApplication(
    applicationId: string,
    details: any,
    config?: any,
  ): Promise<{ status: string; success: boolean }> {
    // Lever does not expose a public application submission API for job seekers.
    // Candidates must apply through jobs.lever.co hosted career page.
    return { status: "MANUAL_APPLY_REQUIRED", success: false };
  }
}

export class AshbyProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
  readonly capabilities = ATS_CAPS;
  readonly authMethod: AuthMethod = "public_board";

  async importJobs(config: any): Promise<{ status: string; jobs: ImportedJob[] }> {
    if (!config.boardUrl) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    const jobs = await importAshby(config.boardUrl);
    return { status: "SUCCESS", jobs };
  }

  async discoverRecruiters(
    companyName: string,
    roleTitle: string,
    config?: any,
  ): Promise<{ status: string; recruiters: any[] }> {
    return { status: "NOT_SUPPORTED", recruiters: [] };
  }

  async submitApplication(
    applicationId: string,
    details: any,
    config?: any,
  ): Promise<{ status: string; success: boolean }> {
    // Ashby does not expose a public application submission API for job seekers.
    // Candidates must apply through the Ashby-hosted career page.
    return { status: "MANUAL_APPLY_REQUIRED", success: false };
  }
}

export class LinkedInProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
  readonly capabilities = SCRAPE_CAPS;
  readonly authMethod: AuthMethod = "session_cookie";
  async importJobs(config: any): Promise<{ status: string; jobs: ImportedJob[] }> {
    if (!config.searchUrl) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    if (!config.headers?.cookie && !config.headers?.Cookie) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    const jobs = await importHtmlSource("linkedin", config.searchUrl, config.headers);
    return { status: "SUCCESS", jobs };
  }

  async discoverRecruiters(
    companyName: string,
    roleTitle: string,
    config?: any,
  ): Promise<{ status: string; recruiters: any[] }> {
    return { status: "READY_FOR_CREDENTIALS", recruiters: [] };
  }

  async submitApplication(
    applicationId: string,
    details: any,
    config?: any,
  ): Promise<{ status: string; success: boolean }> {
    return { status: "READY_FOR_CREDENTIALS", success: false };
  }
}

export class NaukriProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
  readonly capabilities = SCRAPE_CAPS;
  readonly authMethod: AuthMethod = "session_cookie";
  async importJobs(config: any): Promise<{ status: string; jobs: ImportedJob[] }> {
    if (!config.searchUrl) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    if (!config.headers?.cookie && !config.headers?.Cookie) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    const jobs = await importHtmlSource("naukri", config.searchUrl, config.headers);
    return { status: "SUCCESS", jobs };
  }

  async discoverRecruiters(
    companyName: string,
    roleTitle: string,
    config?: any,
  ): Promise<{ status: string; recruiters: any[] }> {
    return { status: "READY_FOR_CREDENTIALS", recruiters: [] };
  }

  async submitApplication(
    applicationId: string,
    details: any,
    config?: any,
  ): Promise<{ status: string; success: boolean }> {
    return { status: "READY_FOR_CREDENTIALS", success: false };
  }
}

export class WellfoundProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
  readonly capabilities = SCRAPE_CAPS;
  readonly authMethod: AuthMethod = "session_cookie";
  async importJobs(config: any): Promise<{ status: string; jobs: ImportedJob[] }> {
    if (!config.searchUrl) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    if (!config.headers?.cookie && !config.headers?.Cookie) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    const jobs = await importHtmlSource("wellfound", config.searchUrl, config.headers);
    return { status: "SUCCESS", jobs };
  }

  async discoverRecruiters(
    companyName: string,
    roleTitle: string,
    config?: any,
  ): Promise<{ status: string; recruiters: any[] }> {
    return { status: "READY_FOR_CREDENTIALS", recruiters: [] };
  }

  async submitApplication(
    applicationId: string,
    details: any,
    config?: any,
  ): Promise<{ status: string; success: boolean }> {
    return { status: "READY_FOR_CREDENTIALS", success: false };
  }
}

export class IndeedProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
  readonly capabilities = SCRAPE_CAPS;
  readonly authMethod: AuthMethod = "session_cookie";
  async importJobs(config: any): Promise<{ status: string; jobs: ImportedJob[] }> {
    if (!config.searchUrl) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    if (!config.headers?.cookie && !config.headers?.Cookie) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    const jobs = await importHtmlSource("indeed", config.searchUrl, config.headers);
    return { status: "SUCCESS", jobs };
  }

  async discoverRecruiters(
    companyName: string,
    roleTitle: string,
    config?: any,
  ): Promise<{ status: string; recruiters: any[] }> {
    return { status: "READY_FOR_CREDENTIALS", recruiters: [] };
  }

  async submitApplication(
    applicationId: string,
    details: any,
    config?: any,
  ): Promise<{ status: string; success: boolean }> {
    return { status: "READY_FOR_CREDENTIALS", success: false };
  }
}

export class InstahyreProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
  readonly capabilities = SCRAPE_CAPS;
  readonly authMethod: AuthMethod = "session_cookie";
  async importJobs(config: any): Promise<{ status: string; jobs: ImportedJob[] }> {
    if (!config.searchUrl) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    if (!config.headers?.cookie && !config.headers?.Cookie) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    const jobs = await importHtmlSource("instahyre", config.searchUrl, config.headers);
    return { status: "SUCCESS", jobs };
  }

  async discoverRecruiters(
    companyName: string,
    roleTitle: string,
    config?: any,
  ): Promise<{ status: string; recruiters: any[] }> {
    return { status: "READY_FOR_CREDENTIALS", recruiters: [] };
  }

  async submitApplication(
    applicationId: string,
    details: any,
    config?: any,
  ): Promise<{ status: string; success: boolean }> {
    return { status: "READY_FOR_CREDENTIALS", success: false };
  }
}

export class WorkableProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
  readonly capabilities: ProviderCapabilities = {
    jobsSupported: true,
    recruitersSupported: false,
    applicationsSupported: false,
  };
  readonly authMethod: AuthMethod = "public_board";

  async importJobs(config: any): Promise<{ status: string; jobs: ImportedJob[] }> {
    if (!config.boardUrl && !config.subdomain) {
      return { status: "READY_FOR_CREDENTIALS", jobs: [] };
    }
    const jobs = await importWorkable(config.boardUrl ?? config.subdomain, config.apiKey);
    return { status: "SUCCESS", jobs };
  }

  async discoverRecruiters(
    companyName: string,
    roleTitle: string,
    config?: any,
  ): Promise<{ status: string; recruiters: any[] }> {
    return { status: "NOT_SUPPORTED", recruiters: [] };
  }

  async submitApplication(
    applicationId: string,
    details: any,
    config?: any,
  ): Promise<{ status: string; success: boolean }> {
    // Workable does not expose a public application submission API for job seekers.
    // Candidates must apply through apply.workable.com hosted career page.
    return { status: "MANUAL_APPLY_REQUIRED", success: false };
  }
}

/** Catalog of every provider known to the platform — used by the audit endpoint. */
export const PROVIDER_REGISTRY = [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "linkedin",
  "indeed",
  "naukri",
  "wellfound",
  "instahyre",
] as const;

export function isKnownProvider(
  sourceName: string,
): sourceName is (typeof PROVIDER_REGISTRY)[number] {
  return (PROVIDER_REGISTRY as readonly string[]).includes(sourceName.toLowerCase());
}

export function getProvider(
  sourceName: string,
): JobProvider & RecruiterProvider & ApplicationProvider {
  switch (sourceName.toLowerCase()) {
    case "greenhouse":
      return new GreenhouseProvider();
    case "lever":
      return new LeverProvider();
    case "ashby":
      return new AshbyProvider();
    case "workable":
      return new WorkableProvider();
    case "linkedin":
      return new LinkedInProvider();
    case "naukri":
      return new NaukriProvider();
    case "wellfound":
      return new WellfoundProvider();
    case "indeed":
      return new IndeedProvider();
    case "instahyre":
      return new InstahyreProvider();
    default:
      throw new Error(`Unknown provider: ${sourceName}`);
  }
}
