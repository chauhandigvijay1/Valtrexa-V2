import {
  ImportedJob,
  importGreenhouse,
  importLever,
  importAshby,
  importHtmlSource,
} from "./job-sources.js";

export interface JobProvider {
  importJobs(config: any): Promise<{ status: string; jobs: ImportedJob[] }>;
}

export interface RecruiterProvider {
  discoverRecruiters(
    companyName: string,
    roleTitle: string,
    config?: any,
  ): Promise<{ status: string; recruiters: any[] }>;
}

export interface ApplicationProvider {
  submitApplication(
    applicationId: string,
    details: any,
    config?: any,
  ): Promise<{ status: string; success: boolean; externalId?: string }>;
}

export class GreenhouseProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
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
    return { status: "NOT_SUPPORTED", success: false };
  }
}

export class LeverProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
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
    return { status: "NOT_SUPPORTED", success: false };
  }
}

export class AshbyProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
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
    return { status: "NOT_SUPPORTED", success: false };
  }
}

export class LinkedInProvider implements JobProvider, RecruiterProvider, ApplicationProvider {
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
