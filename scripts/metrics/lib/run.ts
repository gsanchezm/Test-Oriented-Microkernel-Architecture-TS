// Pipeline-safety wrapper used by every metrics script.
// One script failing must never abort the rest of the pipeline.

/**
 * Runs a script body. On error, logs a warning and exits 0 (non-fatal) so the
 * `&&` chain in metrics:all / metrics:quality:all keeps going. Scripts that MUST
 * fail hard (e.g. generate-run-manifest with no run id) should throw before calling
 * this, or call process.exit(1) directly.
 */
export function safeMain(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.warn(`[${label}] non-fatal: ${(err as Error).message}`);
    process.exit(0);
  }
}

/** Sentinel for a metric/field that cannot be computed from available evidence. */
export const NA = 'NOT_AVAILABLE';
