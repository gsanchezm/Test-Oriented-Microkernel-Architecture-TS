import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface TelemetryEvent {
  timestamp: string;
  runId: string;
  platform: string;
  viewport: string;
  scenario: string;
  step: string;
  outcome: 'PASS' | 'FAIL' | 'SKIPPED';
  durationMs: number;
  errorMessage?: string;
  architecture?: string;
  driver?: string;
  methodology?: string;
}

let sessionDir = '';
let activeFilePath = '';

/**
 * Appends a telemetry event strictly in JSONL format to a dynamically 
 * named folder based on the environment execution matrix.
 * Required by AHM Telemetry constraints.
 */
export function logEvent(event: TelemetryEvent): string {
  if (!sessionDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const methodology = process.env.METHODOLOGY || 'bdd';
    const platform = process.env.PLATFORM || 'unknown';
    const viewport = process.env.VIEWPORT || 'default';
    
    const folderName = `run-${timestamp}-${methodology}-${platform}-${viewport}`;
    sessionDir = join(process.cwd(), 'results', folderName);
    mkdirSync(sessionDir, { recursive: true });
    activeFilePath = join(sessionDir, 'telemetry.jsonl');
  }

  // Enrich event with execution matrix
  event.architecture = 'AHM';
  event.driver = process.env.DRIVER || 'unknown';
  event.methodology = process.env.METHODOLOGY || 'bdd';
  event.platform = process.env.PLATFORM || 'unknown';
  event.viewport = process.env.VIEWPORT || 'default';

  const logLine = JSON.stringify(event) + '\n';
  appendFileSync(activeFilePath, logLine, 'utf-8');
  
  return activeFilePath;
}
