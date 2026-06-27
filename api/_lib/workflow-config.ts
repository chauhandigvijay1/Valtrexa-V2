interface WorkflowConfig {
  jobImportIntervalMinutes: number;
  matchingIntervalMinutes: number;
  recruiterDiscoveryIntervalHours: number;
  outreachIntervalHours: number;
  followupIntervalDays: number;
  healthCheckIntervalMinutes: number;
  matchThresholdPercent: number;
  maxApplicationsPerCycle: number;
  enabledProviders: string[];
  sleepSecondsBetweenProviders: number;
}

const DEFAULT_CONFIG: WorkflowConfig = {
  jobImportIntervalMinutes: 30,
  matchingIntervalMinutes: 15,
  recruiterDiscoveryIntervalHours: 6,
  outreachIntervalHours: 4,
  followupIntervalDays: 1,
  healthCheckIntervalMinutes: 10,
  matchThresholdPercent: 70,
  maxApplicationsPerCycle: 10,
  enabledProviders: ["naukri", "indeed", "wellfound", "instahyre"],
  sleepSecondsBetweenProviders: 5,
};

let cachedConfig: WorkflowConfig | null = null;

function getConfig(): WorkflowConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

function updateConfig(partial: Partial<WorkflowConfig>): WorkflowConfig {
  cachedConfig = { ...getConfig(), ...partial };
  return cachedConfig;
}

function resetConfig(): void {
  cachedConfig = null;
}

export { WorkflowConfig, DEFAULT_CONFIG, getConfig, updateConfig, resetConfig };
