/**
 * Ingest real framework output into a dashboard-readable run.
 *
 * v1 handles cucumber-js JSON for Playwright and API. Appium is wired but
 * only fires if you have both android.json AND ios.json side-by-side. Gatling
 * and PixelMatch are TODO — leave their adapters as stubs for now or write
 * a small block here that mirrors your real output shape.
 *
 * Usage (from the repo root):
 *
 *   pnpm dashboard:ingest                       # runId = real-YYYY-MM-DDTHH-MM
 *   pnpm dashboard:ingest --run-id my-run-id    # override
 *   PROJECT=Acme BUILD=local-42 BRANCH=feat/x pnpm dashboard:ingest
 *
 * Reads (whichever exist):
 *   reports/playwright.json   (cucumber JSON, e.g. from `pnpm test:json:playwright`)
 *   reports/api.json          (cucumber JSON, e.g. from `pnpm test:json:api`)
 *   reports/android.json      (cucumber JSON, e.g. from `pnpm test:json:android`)
 *   reports/ios.json          (cucumber JSON, e.g. from `pnpm test:json:ios`)
 *
 * Writes:
 *   reports/<runId>/run.json
 *   reports/<runId>/playwright.json   (canonical WebUiTool)
 *   reports/<runId>/api.json          (canonical ApiTool)
 *   reports/<runId>/appium.json       (canonical MobileUiTool, if android+ios both present)
 *   reports/manifest.json             (append entry, sorted desc by startedAt)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import type {
  ApiTool,
  BrowserBlock,
  ManifestEntry,
  MobileUiTool,
  PlatformBlock,
  RunInfo,
  Status,
  TestCase,
  TestStep,
  WebUiTool,
} from '../src/shared/types.js';
import { ingestGatling } from './ingest-gatling.js';
import { ingestPixelmatch } from './ingest-pixelmatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const reportsDir = path.resolve(process.env.REPORTS_DIR ?? path.join(repoRoot, 'reports'));

// ---------- cucumber-js JSON types (subset we care about) ----------------

interface CucumberStep {
  keyword?: string;
  name?: string;
  hidden?: boolean;
  match?: { location?: string };
  result?: { status?: string; duration?: number; error_message?: string };
}
interface CucumberElement {
  name?: string;
  type?: string;
  steps?: CucumberStep[];
}
interface CucumberFeature {
  name?: string;
  uri?: string;
  elements?: CucumberElement[];
}

const TERMINAL_STATUSES = new Set(['passed', 'failed', 'skipped', 'pending', 'undefined', 'ambiguous']);

function normalizeStatus(s: string | undefined): Status {
  if (s === 'failed' || s === 'ambiguous' || s === 'undefined') return 'failed';
  if (s === 'skipped' || s === 'pending') return 'skipped';
  return 'passed';
}

export function formatNs(ns: number): string {
  if (ns >= 1_000_000_000) return (ns / 1_000_000_000).toFixed(1) + 's';
  if (ns >= 1_000_000) return Math.round(ns / 1_000_000) + 'ms';
  return Math.max(1, Math.round(ns / 1000)) + 'μs';
}

function formatTotalDuration(ns: number): string {
  const sec = Math.round(ns / 1_000_000_000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;
}

export interface IngestedSuite {
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
  suites: string[];
  tests: TestCase[];
}

export function ingestCucumber(features: CucumberFeature[]): IngestedSuite {
  const tests: TestCase[] = [];
  const suiteSet = new Set<string>();
  let totalNs = 0;

  for (const feature of features) {
    const suite = feature.name ?? '(unnamed feature)';
    suiteSet.add(suite);
    const uri = (feature.uri ?? '').replace(/\\/g, '/');

    for (const el of feature.elements ?? []) {
      if (el.type !== 'scenario') continue;

      let scenarioNs = 0;
      let worst: Status = 'passed';
      let errorMsg: string | undefined;
      const stepsOut: TestStep[] = [];

      for (const step of el.steps ?? []) {
        const r = step.result ?? {};
        const dur = typeof r.duration === 'number' ? r.duration : 0;
        scenarioNs += dur;
        if (!r.status || !TERMINAL_STATUSES.has(r.status)) continue;
        const stepStatus = normalizeStatus(r.status);

        const isHidden = step.hidden === true;
        // Hidden hook that passed: skip — it adds noise without value.
        if (isHidden && stepStatus !== 'failed') {
          continue;
        }

        if (stepStatus === 'failed') {
          worst = 'failed';
          if (!errorMsg && r.error_message) errorMsg = r.error_message;
        } else if (stepStatus === 'skipped' && worst !== 'failed') {
          worst = 'skipped';
        }

        const out: TestStep = {
          keyword: step.keyword ?? '',
          name: step.name ?? '',
          status: stepStatus,
          dur: formatNs(dur),
        };
        const matchLocation = step.match?.location;
        if (matchLocation) out.location = matchLocation;
        if (stepStatus === 'failed' && r.error_message) out.error = r.error_message;
        if (isHidden) out.hidden = true;
        stepsOut.push(out);
      }

      const failedStepIndex = stepsOut.findIndex((s) => s.status === 'failed');

      totalNs += scenarioNs;
      tests.push({
        name: el.name ?? '(unnamed scenario)',
        suite,
        file: uri,
        dur: formatNs(scenarioNs),
        status: worst,
        ...(errorMsg ? { error: errorMsg } : {}),
        steps: stepsOut,
        ...(failedStepIndex >= 0 ? { failedStepIndex } : {}),
      });
    }
  }

  return {
    passed: tests.filter((t) => t.status === 'passed').length,
    failed: tests.filter((t) => t.status === 'failed').length,
    skipped: tests.filter((t) => t.status === 'skipped').length,
    duration: formatTotalDuration(totalNs),
    suites: [...suiteSet],
    tests,
  };
}

// ---------- Top-level ingest --------------------------------------------

async function readCucumberJson(file: string): Promise<CucumberFeature[] | null> {
  try {
    const text = await fs.readFile(file, 'utf8');
    if (!text.trim()) return null;
    return JSON.parse(text) as CucumberFeature[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

function parseArgs(): { runId?: string } {
  const args = process.argv.slice(2);
  let runId: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run-id' && i + 1 < args.length) runId = args[++i];
    else if (args[i].startsWith('--run-id=')) runId = args[i].slice('--run-id='.length);
  }
  return { runId };
}

function defaultRunId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `real-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

function nowIsoSpaced(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function appendManifest(entry: ManifestEntry): Promise<void> {
  const manifestPath = path.join(reportsDir, 'manifest.json');
  let entries: ManifestEntry[] = [];
  try {
    const text = await fs.readFile(manifestPath, 'utf8');
    entries = JSON.parse(text);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  entries = entries.filter((e) => e.runId !== entry.runId);
  entries.push(entry);
  entries.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  await writeJson(manifestPath, entries);
}

/**
 * Build the Playwright tool. If `reports/playwright-<browser>.json` files
 * exist (one cucumber JSON per browser), produce a per-browser breakdown so
 * the detail view renders browser sub-tabs. Otherwise fall back to a single
 * flat `reports/playwright.json` (no tabs).
 */
async function buildPlaywrightTool(): Promise<WebUiTool | null> {
  let files: string[] = [];
  try {
    files = await fs.readdir(reportsDir);
  } catch {
    files = [];
  }

  // Only treat a `playwright-<suffix>.json` as a per-browser file when the
  // suffix is a real browser. This avoids mistaking files like
  // `playwright-visual.json` (a tag-filtered subset, not a browser) for a tab.
  const KNOWN_BROWSERS = new Set(['chrome', 'chromium', 'firefox', 'edge', 'msedge', 'webkit', 'safari']);
  const browserFiles = files
    .map((f) => {
      const m = /^playwright-(.+)\.json$/i.exec(f);
      if (!m) return null;
      const browser = m[1].toLowerCase();
      return KNOWN_BROWSERS.has(browser) ? { file: f, browser } : null;
    })
    .filter((x): x is { file: string; browser: string } => x !== null);

  if (browserFiles.length > 0) {
    const browsers: BrowserBlock[] = [];
    for (const { file, browser } of browserFiles) {
      const raw = await readCucumberJson(path.join(reportsDir, file));
      if (!raw) continue;
      const s = ingestCucumber(raw);
      browsers.push({
        browser,
        passed: s.passed, failed: s.failed, skipped: s.skipped, duration: s.duration,
        suites: s.suites, tests: s.tests,
      });
    }
    if (browsers.length > 0) {
      browsers.sort((a, b) => a.browser.localeCompare(b.browser));
      const passed  = browsers.reduce((a, b) => a + b.passed, 0);
      const failed  = browsers.reduce((a, b) => a + b.failed, 0);
      const skipped = browsers.reduce((a, b) => a + b.skipped, 0);
      const suites  = [...new Set(browsers.flatMap((b) => b.suites))];
      return {
        kind: 'web_ui',
        id: 'playwright',
        name: 'Playwright',
        description: 'End-to-end browser tests across Chromium, Firefox, Edge and WebKit.',
        passed, failed, skipped,
        duration: `${browsers.length} browser${browsers.length > 1 ? 's' : ''}`,
        suites,
        tests: browsers.flatMap((b) => b.tests),
        browsers,
      };
    }
  }

  // Fallback: single flat run (no browser breakdown → flat list, no tabs).
  const flat = await readCucumberJson(path.join(reportsDir, 'playwright.json'));
  if (!flat) return null;
  const s = ingestCucumber(flat);
  return {
    kind: 'web_ui',
    id: 'playwright',
    name: 'Playwright',
    description: 'End-to-end browser tests across Chromium, Firefox and WebKit.',
    passed: s.passed, failed: s.failed, skipped: s.skipped, duration: s.duration,
    suites: s.suites,
    tests: s.tests,
  };
}

async function main(): Promise<void> {
  const { runId: argRunId } = parseArgs();
  const runId = argRunId ?? defaultRunId();
  const runDir = path.join(reportsDir, runId);

  const project = process.env.PROJECT ?? 'Local Run';
  const buildId = process.env.BUILD ?? 'local';
  const branch  = process.env.BRANCH ?? git('rev-parse --abbrev-ref HEAD') ?? 'unknown';
  const commit  = process.env.COMMIT ?? git('rev-parse --short HEAD') ?? 'unknown';
  const env     = process.env.RUN_ENV ?? 'local';
  const triggeredBy = process.env.TRIGGERED_BY ?? process.env.USERNAME ?? 'local-dev';
  const startedAt = nowIsoSpaced();

  // ---- Playwright (web_ui) ----------------------------------------------
  const wroteTools: string[] = [];

  const playwrightTool = await buildPlaywrightTool();
  if (playwrightTool) {
    await writeJson(path.join(runDir, 'playwright.json'), playwrightTool);
    const browserNote = playwrightTool.browsers
      ? ` across ${playwrightTool.browsers.length} browsers: ${playwrightTool.browsers.map((b) => b.browser).join(', ')}`
      : '';
    wroteTools.push(
      `playwright (${playwrightTool.passed}P/${playwrightTool.failed}F/${playwrightTool.skipped}S)${browserNote}`,
    );
  }

  // ---- API (api) --------------------------------------------------------
  const apiRaw = await readCucumberJson(path.join(reportsDir, 'api.json'));
  if (apiRaw) {
    const s = ingestCucumber(apiRaw);
    const tool: ApiTool = {
      kind: 'api',
      id: 'api',
      name: 'API Suite',
      description: 'REST and GraphQL contract tests, schema validation and auth flows.',
      passed: s.passed, failed: s.failed, skipped: s.skipped, duration: s.duration,
      suites: s.suites,
      tests: s.tests,
    };
    await writeJson(path.join(runDir, 'api.json'), tool);
    wroteTools.push(`api (${s.passed}P/${s.failed}F/${s.skipped}S)`);
  }

  // ---- Appium (mobile_ui) — only if both platforms are present ----------
  const androidRaw = await readCucumberJson(path.join(reportsDir, 'android.json'));
  const iosRaw     = await readCucumberJson(path.join(reportsDir, 'ios.json'));
  if (androidRaw && iosRaw) {
    const android = ingestCucumber(androidRaw);
    const ios = ingestCucumber(iosRaw);
    const platformBlock = (s: IngestedSuite, device: string): PlatformBlock => ({
      passed: s.passed, failed: s.failed, skipped: s.skipped, duration: s.duration,
      device,
      suites: s.suites,
      tests: s.tests,
    });
    const tool: MobileUiTool = {
      kind: 'mobile_ui',
      id: 'appium',
      name: 'Appium',
      description: 'Native mobile flows on iOS simulators and Android emulators.',
      passed: android.passed + ios.passed,
      failed: android.failed + ios.failed,
      skipped: android.skipped + ios.skipped,
      duration: `${android.duration} (Android) + ${ios.duration} (iOS)`,
      platforms: {
        android: platformBlock(android, process.env.ANDROID_DEVICE ?? 'Android device'),
        ios:     platformBlock(ios,     process.env.IOS_DEVICE     ?? 'iOS device'),
      },
    };
    await writeJson(path.join(runDir, 'appium.json'), tool);
    wroteTools.push(`appium (${tool.passed}P/${tool.failed}F/${tool.skipped}S)`);
  } else if (androidRaw || iosRaw) {
    console.log('[ingest] note: found android.json XOR ios.json — appium needs BOTH; skipping. Run both flavors to populate this tool.');
  }

  // ---- Gatling (performance) --------------------------------------------
  const gatling = await ingestGatling({ repoRoot });
  if (gatling) {
    await writeJson(path.join(runDir, 'gatling.json'), gatling);
    wroteTools.push(`gatling (${gatling.perf.requests} reqs, ${gatling.perf.rps} rps, ${gatling.perf.errorRate}% err)`);
  }

  // ---- PixelMatch (visual) ----------------------------------------------
  const pixelmatch = await ingestPixelmatch({
    repoRoot,
    dashboardRunDir: runDir,
    dashboardRunId: runId,
  });
  if (pixelmatch) {
    await writeJson(path.join(runDir, 'pixelmatch.json'), pixelmatch);
    wroteTools.push(`pixelmatch (${pixelmatch.passed}P/${pixelmatch.failed}F across ${pixelmatch.diffs.length} snapshots)`);
  }

  if (wroteTools.length === 0) {
    console.error('[ingest] no inputs found. Looked for:');
    console.error('  ' + path.join(reportsDir, 'playwright.json'));
    console.error('  ' + path.join(reportsDir, 'api.json'));
    console.error('  ' + path.join(reportsDir, 'android.json'));
    console.error('  ' + path.join(reportsDir, 'ios.json'));
    console.error('Run `pnpm test:json:playwright`, `pnpm test:json:api`, etc. first.');
    process.exitCode = 1;
    return;
  }

  // ---- run.json + manifest ---------------------------------------------
  const runInfo: RunInfo = {
    project, buildId, branch, commit, triggeredBy, startedAt,
    duration: 'see per-tool durations',
    env,
  };
  await writeJson(path.join(runDir, 'run.json'), runInfo);

  await appendManifest({ runId, project, buildId, branch, startedAt });

  console.log(`[ingest] wrote ${wroteTools.length} tool(s) into ${runDir}`);
  for (const t of wroteTools) console.log(`  - ${t}`);
  console.log(`[ingest] manifest updated; open the dashboard and pick "${runId}" from the run dropdown.`);
}

main().catch((err) => {
  console.error('[ingest] crashed:', err);
  process.exitCode = 1;
});
