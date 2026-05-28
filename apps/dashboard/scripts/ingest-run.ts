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
  ViewportBlock,
  WebUiTool,
} from '../src/shared/types.js';
import { ingestGatling } from './ingest-gatling.js';
import { ingestPixelmatch } from './ingest-pixelmatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const reportsDir = path.resolve(process.env.REPORTS_DIR ?? path.join(repoRoot, 'reports'));

// ---------- cucumber-js JSON types (subset we care about) ----------------

interface CucumberAttachmentLegacy {
  data?: string;
  mime_type?: string;
}

interface CucumberAttachmentNew {
  data?: string;
  body?: string;
  mediaType?: string;
  mime_type?: string;
}

interface CucumberStep {
  keyword?: string;
  name?: string;
  hidden?: boolean;
  match?: { location?: string };
  result?: { status?: string; duration?: number; error_message?: string };
  /** cucumber-js v7 and earlier */
  embeddings?: CucumberAttachmentLegacy[];
  /** cucumber-js v8+ */
  attachments?: CucumberAttachmentNew[];
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

/**
 * Carries a raw base64 screenshot from `ingestCucumber` to `materializeScreenshots`
 * without adding a transient field to the `TestCase` object (which would leak into
 * the written JSON and break vitest deep-equality assertions).
 */
const screenshotData = new WeakMap<TestCase, { b64: string }>();

function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]/g, '_');
}

/**
 * Scan all steps of a FAILED element for the first image/* attachment, covering
 * both legacy (embeddings) and newer (attachments) shapes. Must be called over
 * the raw CucumberStep array — NOT the already-filtered stepsOut — because the
 * After-hook that captures screenshots is hidden+passed and is skipped by the
 * main step loop.
 */
function extractImageAttachment(steps: CucumberStep[]): string | null {
  for (const step of steps) {
    // Newer shape: step.attachments[].{data|body, mediaType|mime_type}
    for (const att of step.attachments ?? []) {
      const mime = att.mediaType ?? att.mime_type ?? '';
      if (mime.startsWith('image/')) {
        const raw = att.data ?? att.body ?? '';
        if (raw) return raw.replace(/^data:[^;]+;base64,/, '');
      }
    }
    // Legacy shape: step.embeddings[].{data, mime_type}
    for (const emb of step.embeddings ?? []) {
      const mime = emb.mime_type ?? '';
      if (mime.startsWith('image/')) {
        const raw = emb.data ?? '';
        if (raw) return raw.replace(/^data:[^;]+;base64,/, '');
      }
    }
  }
  return null;
}

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

      const tc: TestCase = {
        name: el.name ?? '(unnamed scenario)',
        suite,
        file: uri,
        dur: formatNs(scenarioNs),
        status: worst,
        ...(errorMsg ? { error: errorMsg } : {}),
        steps: stepsOut,
        ...(failedStepIndex >= 0 ? { failedStepIndex } : {}),
      };

      // If the scenario failed, scan ALL raw steps (including hidden/passed
      // hooks that are skipped by the main loop) for an image attachment.
      if (worst === 'failed') {
        const b64 = extractImageAttachment(el.steps ?? []);
        if (b64) screenshotData.set(tc, { b64 });
      }

      totalNs += scenarioNs;
      tests.push(tc);
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

// ---------- Screenshot materializer ------------------------------------

/**
 * Walk all `TestCase` objects in a tool, decode any stashed base64 screenshot,
 * write it to `<runDir>/screenshots/<key>.png`, and set `tc.screenshot` to the
 * served URL.  The WeakMap entry is consumed after writing.
 *
 * Called from `main()` for each tool **before** the tool is serialised to JSON,
 * so the PNG is on disk and the URL is embedded in the same write.
 */
async function materializeScreenshots(
  tests: TestCase[],
  runDir: string,
  runId: string,
): Promise<void> {
  const outDir = path.join(runDir, 'screenshots');
  const usedKeys = new Set<string>();

  for (const tc of tests) {
    const entry = screenshotData.get(tc);
    if (!entry) continue;
    screenshotData.delete(tc);

    // Build a filename-safe key from suite + scenario name, unique within this run.
    let baseKey = `${safeSegment(tc.suite)}__${safeSegment(tc.name)}`;
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey}-${suffix++}`;
    }
    usedKeys.add(key);

    const pngPath = path.join(outDir, `${key}.png`);
    try {
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(pngPath, Buffer.from(entry.b64, 'base64'));
      tc.screenshot = `/reports/${encodeURIComponent(runId)}/screenshots/${key}.png`;
    } catch (err) {
      // Non-fatal: the screenshot is a nice-to-have; don't fail the whole ingest.
      console.warn(`[ingest] warning: could not write screenshot ${pngPath}:`, (err as Error).message);
    }
  }
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

// Only treat a `playwright-<suffix>.json` as a per-browser file when the
// suffix is a real browser. This avoids mistaking files like
// `playwright-visual.json` (a tag-filtered subset, not a browser) for a tab.
const KNOWN_BROWSERS = new Set(['chrome', 'chromium', 'firefox', 'edge', 'msedge', 'webkit', 'safari']);
// Viewport ids are fixed to the two render axes the framework emits.
const KNOWN_VIEWPORTS = ['desktop', 'responsive'] as const;
type KnownViewport = (typeof KNOWN_VIEWPORTS)[number];

function defaultBrowser(): string {
  return process.env.BROWSER?.toLowerCase() || 'chromium';
}

function browserBlockFromSuite(browser: string, s: IngestedSuite): BrowserBlock {
  return {
    browser,
    passed: s.passed, failed: s.failed, skipped: s.skipped, duration: s.duration,
    suites: s.suites, tests: s.tests,
  };
}

/**
 * Build the Playwright tool, in this precedence order:
 *   1. Viewport(+browser) files: `playwright-<viewport>-<browser>.json` and
 *      legacy `playwright-<viewport>.json` → `viewports[]` with nested
 *      per-browser breakdown (outer viewport tabs, inner browser tabs).
 *   2. Per-browser files `playwright-<browser>.json` → `browsers[]` (browser
 *      sub-tabs, no viewport axis).
 *   3. Flat `playwright.json` → single flat test list (no tabs).
 */
async function buildPlaywrightTool(dir: string = reportsDir): Promise<WebUiTool | null> {
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    files = [];
  }

  // ---- 1. Viewport(+browser) files --------------------------------------
  // Group browser files per viewport. A viewport file may be either
  // `playwright-<viewport>-<browser>.json` or legacy `playwright-<viewport>.json`
  // (browser defaults to $BROWSER or 'chromium').
  const viewportFiles = new Map<KnownViewport, { file: string; browser: string }[]>();
  for (const f of files) {
    const withBrowser = /^playwright-(desktop|responsive)-([a-z0-9]+)\.json$/i.exec(f);
    if (withBrowser) {
      const viewport = withBrowser[1].toLowerCase() as KnownViewport;
      const browser = withBrowser[2].toLowerCase();
      if (!KNOWN_BROWSERS.has(browser)) continue;
      const list = viewportFiles.get(viewport) ?? [];
      list.push({ file: f, browser });
      viewportFiles.set(viewport, list);
      continue;
    }
    const legacy = /^playwright-(desktop|responsive)\.json$/i.exec(f);
    if (legacy) {
      const viewport = legacy[1].toLowerCase() as KnownViewport;
      const list = viewportFiles.get(viewport) ?? [];
      list.push({ file: f, browser: defaultBrowser() });
      viewportFiles.set(viewport, list);
    }
  }

  if (viewportFiles.size > 0) {
    const viewports: ViewportBlock[] = [];
    for (const viewport of KNOWN_VIEWPORTS) {
      const entries = viewportFiles.get(viewport);
      if (!entries || entries.length === 0) continue;
      const browsers: BrowserBlock[] = [];
      for (const { file, browser } of entries) {
        const raw = await readCucumberJson(path.join(dir, file));
        if (!raw) continue;
        browsers.push(browserBlockFromSuite(browser, ingestCucumber(raw)));
      }
      if (browsers.length === 0) continue;
      browsers.sort((a, b) => a.browser.localeCompare(b.browser));
      viewports.push({
        viewport,
        passed:  browsers.reduce((a, b) => a + b.passed, 0),
        failed:  browsers.reduce((a, b) => a + b.failed, 0),
        skipped: browsers.reduce((a, b) => a + b.skipped, 0),
        duration: `${browsers.length} browser${browsers.length > 1 ? 's' : ''}`,
        browsers,
      });
    }
    if (viewports.length > 0) {
      // Sort desktop before responsive (mirrors KNOWN_VIEWPORTS order, but be
      // explicit so the structure is stable regardless of discovery order).
      const order = (v: string) => KNOWN_VIEWPORTS.indexOf(v as KnownViewport);
      viewports.sort((a, b) => order(a.viewport) - order(b.viewport));
      const allBrowsers = viewports.flatMap((v) => v.browsers);
      const passed  = viewports.reduce((a, v) => a + v.passed, 0);
      const failed  = viewports.reduce((a, v) => a + v.failed, 0);
      const skipped = viewports.reduce((a, v) => a + v.skipped, 0);
      const suites  = [...new Set(allBrowsers.flatMap((b) => b.suites))];
      return {
        kind: 'web_ui',
        id: 'playwright',
        name: 'Playwright',
        description: 'End-to-end browser tests across desktop and responsive viewports.',
        passed, failed, skipped,
        duration: `${viewports.length} viewport${viewports.length > 1 ? 's' : ''}`,
        suites,
        tests: allBrowsers.flatMap((b) => b.tests),
        viewports,
      };
    }
  }

  // ---- 2. Per-browser files ---------------------------------------------
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
      const raw = await readCucumberJson(path.join(dir, file));
      if (!raw) continue;
      browsers.push(browserBlockFromSuite(browser, ingestCucumber(raw)));
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

  // ---- 3. Fallback: single flat run (no breakdown → flat list, no tabs). -
  const flat = await readCucumberJson(path.join(dir, 'playwright.json'));
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

export { buildPlaywrightTool, materializeScreenshots };

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
    // tool.tests is the flat union of all browsers/viewports — same object refs.
    await materializeScreenshots(playwrightTool.tests, runDir, runId);
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
    await materializeScreenshots(tool.tests, runDir, runId);
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
    // MobileUiTool has no top-level tests — walk both platforms in one call so
    // the shared usedKeys Set deduplicates across android and ios (identical
    // suite+name on both platforms would otherwise produce the same filename).
    await materializeScreenshots(
      [...tool.platforms.android.tests, ...tool.platforms.ios.tests],
      runDir, runId,
    );
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
