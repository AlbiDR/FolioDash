// Repeats a browser start-up that failed for a reason a fresh attempt can fix, such as a slow or hung Chrome process
// that never exposed its debugging port. A permanent failure, such as a missing executable, is reported at once. Each
// attempt releases what it acquired before it fails, so a retry always starts from a clean state.

/** A failure that a new attempt cannot fix. It is raised without retrying. */
export class PermanentStartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentStartupError";
  }
}

export interface StartupRetryOptions {
  /** Total attempts, including the first. */
  readonly attempts: number;
  /** Called before each retry with the failure that caused it and the attempt about to start. */
  readonly onRetry?: (error: unknown, nextAttempt: number) => void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs `start` until it succeeds, a permanent failure occurs, or the attempts are spent. */
export async function startWithRetries<Value>(
  label: string,
  start: (attempt: number) => Promise<Value>,
  options: StartupRetryOptions,
): Promise<Value> {
  if (!Number.isInteger(options.attempts) || options.attempts < 1)
    throw new RangeError("A start-up needs at least one attempt.");
  for (let attempt = 1; ; attempt++) {
    try {
      return await start(attempt);
    } catch (error) {
      if (error instanceof PermanentStartupError) throw error;
      if (attempt >= options.attempts)
        throw new Error(`${label} failed after ${String(attempt)} attempts. ${errorText(error)}`, { cause: error });
      options.onRetry?.(error, attempt + 1);
    }
  }
}
