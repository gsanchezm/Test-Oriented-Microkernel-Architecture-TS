import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const targetDir = process.argv[2];

if (!targetDir) {
  console.error('Usage: npx ts-node src/telemetry/parse-telemetry.ts <target-directory>');
  process.exit(1);
}

const resolvedDir = resolve(targetDir);
const jsonlPath = join(resolvedDir, 'telemetry.jsonl');

const events: any[] = [];

if (existsSync(jsonlPath)) {
  try {
    const fileContent = readFileSync(jsonlPath, 'utf-8');
    const lines = fileContent.trim().split('\n').filter(line => line.length > 0);
    lines.forEach(line => events.push(JSON.parse(line)));
    console.log(`[AHM Parser] Parsed ${lines.length} events from telemetry.jsonl`);
  } catch (err) {
    console.error(`Failed to read ${jsonlPath}:`, err);
  }
} else {
  console.log(`[AHM Parser] No telemetry.jsonl found in ${resolvedDir}`);
}

function findGatlingLogs(dir: string, fileList: string[] = []): string[] {
  if (!existsSync(dir)) return fileList;
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    if (statSync(filePath).isDirectory()) {
      findGatlingLogs(filePath, fileList);
    } else if (file === 'simulation.log') {
      fileList.push(filePath);
    }
  }
  return fileList;
}

let gatlingLogs: string[] = [];
const directGatlingPath = join(resolvedDir, 'simulation.log');
if (existsSync(directGatlingPath)) {
  gatlingLogs.push(directGatlingPath);
} else {
  const gatlingDir = join(process.cwd(), 'target', 'gatling');
  gatlingLogs = findGatlingLogs(gatlingDir);
}

let gatlingEventCount = 0;
for (const logPath of gatlingLogs) {
  try {
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    for (const line of lines) {
      if (!line.startsWith('REQUEST\t')) continue;
      const parts = line.split('\t');
      if (parts.length < 7) continue;

      const scenarioName = parts[1];
      const requestName = parts[3];
      const startTimestamp = parseInt(parts[4], 10);
      const endTimestamp = parseInt(parts[5], 10);
      const status = parts[6];
      const errorMessage = parts[7] || '';

      events.push({
        timestamp: new Date(startTimestamp).toISOString(),
        runId: 'gatling-run',
        architecture: 'proxy',
        platform: 'performance',
        viewport: 'none',
        driver: 'gatling',
        methodology: 'resonance',
        scenario: scenarioName,
        step: requestName,
        outcome: status === 'OK' ? 'PASS' : 'FAIL',
        durationMs: endTimestamp - startTimestamp,
        errorMessage: errorMessage.trim(),
      });
      gatlingEventCount++;
    }
  } catch (err) {
    console.error(`Failed to read Gatling log ${logPath}:`, err);
  }
}

if (gatlingEventCount > 0) {
  console.log(`[AHM Parser] Parsed ${gatlingEventCount} requests from Gatling logs`);
}

if (events.length === 0) {
  console.error('[AHM Parser] No telemetry data found to parse. Exiting.');
  process.exit(1);
}

const stepDurations: string[] = ['scenario,step,duration,outcome'];
const scenarioOutcomes = new Map<string, 'PASS' | 'FAIL' | 'SKIPPED'>();
const failureBuckets = new Map<string, number>();

for (const event of events) {
  const safeScenario = `"${event.scenario.replace(/"/g, '""')}"`;
  const safeStep = `"${event.step.replace(/"/g, '""')}"`;
  stepDurations.push(`${safeScenario},${safeStep},${event.durationMs},${event.outcome}`);

  const currentStatus = scenarioOutcomes.get(event.scenario) || 'PASS';
  if (event.outcome === 'FAIL') {
    scenarioOutcomes.set(event.scenario, 'FAIL');
  } else if (currentStatus !== 'FAIL' && event.outcome === 'PASS') {
    scenarioOutcomes.set(event.scenario, 'PASS');
  }

  if (event.outcome === 'FAIL' && event.errorMessage) {
    const firstLine = event.errorMessage.split('\n')[0].trim();
    const normalized = firstLine.replace(/'[^']+'/g, "'...'").replace(/"[^"]+"/g, '"..."');
    failureBuckets.set(normalized, (failureBuckets.get(normalized) || 0) + 1);
  }
}

const scenarioOutcomesCsv: string[] = ['scenario,outcome'];
for (const [scenario, outcome] of scenarioOutcomes.entries()) {
  const safeScenario = `"${scenario.replace(/"/g, '""')}"`;
  scenarioOutcomesCsv.push(`${safeScenario},${outcome}`);
}

const failureBucketsCsv: string[] = ['normalizedError,count'];
for (const [errorMsg, count] of failureBuckets.entries()) {
  const safeError = `"${errorMsg.replace(/"/g, '""')}"`;
  failureBucketsCsv.push(`${safeError},${count}`);
}

try {
  writeFileSync(join(resolvedDir, 'step_durations.csv'), stepDurations.join('\n'));
  writeFileSync(join(resolvedDir, 'scenario_outcomes.csv'), scenarioOutcomesCsv.join('\n'));
  writeFileSync(join(resolvedDir, 'failure_buckets.csv'), failureBucketsCsv.join('\n'));
  console.log(`[AHM Parser] Successfully generated 3 CSV artifacts in ${resolvedDir}`);
} catch (err) {
  console.error('Failed to write CSV artifacts:', err);
  process.exit(1);
}
