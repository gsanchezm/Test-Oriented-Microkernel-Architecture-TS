/**
 * Headless render smoke. Boots a Chromium via the playwright instance that
 * ships with the parent monorepo, navigates every dashboard route, captures
 * a full-page screenshot, and fails (exit 1) if any pageerror or
 * console.error fires.
 *
 * Usage: `pnpm dashboard` in one terminal, then `tsx apps/dashboard/scripts/smoke.ts`
 * in another. Or: `SMOKE_URL=http://localhost:5173 tsx scripts/smoke.ts`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'tmp', 'smoke');

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';
const RUN_ID = process.env.SMOKE_RUN_ID ?? '2026-05-24-build-4582';

const ROUTES = [
  { name: '01-overview',   path: `/runs/${RUN_ID}` },
  { name: '02-playwright', path: `/runs/${RUN_ID}/playwright` },
  { name: '03-api',        path: `/runs/${RUN_ID}/api` },
  { name: '04-appium',     path: `/runs/${RUN_ID}/appium` },
  { name: '05-gatling',    path: `/runs/${RUN_ID}/gatling` },
  { name: '06-pixelmatch', path: `/runs/${RUN_ID}/pixelmatch` },
];

async function main(): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 900 } });
  const page = await ctx.newPage();

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error @ ${page.url()}: ${msg.text()}`);
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure();
    const text = failure?.errorText ?? 'unknown';
    // React StrictMode double-mounts effects in dev; the first AbortController
    // fires before the second effect's fetch — Playwright reports these as
    // net::ERR_ABORTED. They are not real failures.
    if (text.includes('ERR_ABORTED')) return;
    errors.push(`requestfailed: ${req.url()} — ${text}`);
  });

  try {
    for (const r of ROUTES) {
      await page.goto(`${BASE}${r.path}`, { waitUntil: 'networkidle' });
      // The PassFailDonut needs ~30ms after mount to set the drawn state; give
      // animations a beat so screenshots show the final visual.
      await page.waitForTimeout(1100);
      const outPath = path.join(outDir, `${r.name}.png`);
      await page.screenshot({ path: outPath, fullPage: true });
      console.log(`[smoke] ${r.name} -> ${outPath}`);
    }
  } finally {
    await browser.close();
  }

  if (errors.length) {
    console.error(`[smoke] ${errors.length} browser error(s):`);
    for (const e of errors) console.error('  -', e);
    process.exit(1);
  }
  console.log('[smoke] OK — 0 browser errors');
}

main().catch((e) => {
  console.error('[smoke] crashed:', e);
  process.exit(1);
});
