import { AfterStep, AfterAll, BeforeAll } from '@cucumber/cucumber';
import { ensureTelemetryFile, logEvent, TelemetryEvent } from '@telemetry/logger';
import { streamToMinio } from '@telemetry/minio-publisher';
import { randomUUID } from 'crypto';
import { acquireRunLock, releaseRunLock } from './run-lock';

let currentRunId: string;
let telemetryFilePath: string;

// Install signal/exit handlers exactly once at module load so the lock is
// released even when cucumber's AfterAll is skipped (Ctrl+C, uncaught throw
// during BeforeAll, process.kill from outside).
const releaseOnExit = () => { releaseRunLock(); };
process.once('exit',    releaseOnExit);
process.once('SIGINT',  () => { releaseRunLock(); process.exit(130); });
process.once('SIGTERM', () => { releaseRunLock(); process.exit(143); });

BeforeAll(function () {
  // Acquire BEFORE generating the runId so a failed acquire produces a clean
  // abort with no telemetry side-effects.
  acquireRunLock();
  currentRunId = randomUUID();
});

AfterStep(async function ({ pickle, pickleStep, result }) {
  // Translate cucumber status to AHM outcome
  let outcome: 'PASS' | 'FAIL' | 'SKIPPED' = 'SKIPPED';
  if (result.status === 'PASSED') {
    outcome = 'PASS';
  } else if (result.status === 'FAILED') {
    outcome = 'FAIL';
  }

  const durationMs = result.duration ?
    (result.duration.seconds * 1000) + (result.duration.nanos / 1_000_000) : 0;

  const event: TelemetryEvent = {
    timestamp: new Date().toISOString(),
    runId: currentRunId,
    // Note: platform and viewport should be injected from World/config
    platform: process.env.AHM_PLATFORM || 'UNKNOWN',
    viewport: process.env.AHM_VIEWPORT || 'UNKNOWN',
    scenario: pickle.name,
    step: pickleStep.text,
    outcome: outcome,
    durationMs: Math.round(durationMs),
    errorMessage: result.message
  };

  telemetryFilePath = logEvent(event);
});

AfterAll(async function () {
  try {
    if (currentRunId) {
      telemetryFilePath = ensureTelemetryFile(currentRunId);
    }

    if (telemetryFilePath && currentRunId) {
      await streamToMinio(telemetryFilePath, currentRunId);
    }
  } finally {
    // Always release, even if telemetry flush threw.
    releaseRunLock();
  }
});
