import { logger } from "./logger.js";

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

const defaultOptions: Required<RetryOptions> = {
  attempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  onRetry: () => {},
};

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const { attempts, baseDelayMs, maxDelayMs, onRetry } = {
    ...defaultOptions,
    ...options,
  };

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === attempts) {
        logger.error(`All ${attempts} attempts failed`, {
          error: lastError.message,
        });
        throw lastError;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = delay * (0.5 + Math.random() * 0.5);

      logger.warn(`Attempt ${attempt}/${attempts} failed, retrying in ${Math.round(jitter)}ms`, {
        error: lastError.message,
      });
      onRetry(lastError, attempt);

      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  throw lastError ?? new Error("Retry failed unexpectedly");
}
