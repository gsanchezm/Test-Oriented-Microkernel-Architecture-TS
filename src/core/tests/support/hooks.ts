import { AfterStep, AfterAll, BeforeAll } from '@cucumber/cucumber';
import { ensureTelemetryFile, logEvent, TelemetryEvent } from '../../../telemetry/logger';
import { streamToMinio } from '../../../telemetry/minio-publisher';
import { randomUUID } from 'crypto';

let currentRunId: string;
let telemetryFilePath: string;

BeforeAll(function () {
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
  if (currentRunId) {
    telemetryFilePath = ensureTelemetryFile(currentRunId);
  }

  if (telemetryFilePath && currentRunId) {
    await streamToMinio(telemetryFilePath, currentRunId);
  }
});
