import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildPlaywrightTool } from '../../scripts/ingest-run';

// Minimal cucumber JSON: one feature with one scenario whose single step has
// the given status. Enough for ingestCucumber to count it.
function cucumberJson(featureName: string, status: 'passed' | 'failed' | 'skipped'): unknown[] {
  return [
    {
      name: featureName,
      uri: `src/${featureName}.feature`,
      elements: [
        {
          name: `${featureName} scenario`,
          type: 'scenario',
          steps: [
            { keyword: 'Given ', name: 'a step', result: { status, duration: 1_000_000 } },
          ],
        },
      ],
    },
  ];
}

describe('buildPlaywrightTool', () => {
  let dir: string;

  function write(file: string, json: unknown): void {
    writeFileSync(path.join(dir, file), JSON.stringify(json), 'utf8');
  }

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pw-ingest-'));
    delete process.env.BROWSER;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.BROWSER;
  });

  it('returns null when no playwright JSON is present', async () => {
    const tool = await buildPlaywrightTool(dir);
    expect(tool).toBeNull();
  });

  it('builds viewports[] from playwright-<viewport>-<browser>.json files', async () => {
    write('playwright-desktop-chromium.json', cucumberJson('checkout', 'passed'));
    write('playwright-desktop-firefox.json', cucumberJson('login', 'failed'));
    write('playwright-responsive-chromium.json', cucumberJson('catalog', 'passed'));

    const tool = await buildPlaywrightTool(dir);
    expect(tool).not.toBeNull();
    expect(tool!.viewports).toBeDefined();
    expect(tool!.browsers).toBeUndefined();

    const viewports = tool!.viewports!;
    expect(viewports.map((v) => v.viewport)).toEqual(['desktop', 'responsive']);

    const desktop = viewports[0];
    // Browsers sorted alphabetically: chromium before firefox.
    expect(desktop.browsers.map((b) => b.browser)).toEqual(['chromium', 'firefox']);
    // Aggregated counts on the viewport = sum of its browsers.
    expect(desktop.passed).toBe(1);
    expect(desktop.failed).toBe(1);

    const responsive = viewports[1];
    expect(responsive.browsers.map((b) => b.browser)).toEqual(['chromium']);
    expect(responsive.passed).toBe(1);

    // Tool-level aggregate across all viewports/browsers.
    expect(tool!.passed).toBe(2);
    expect(tool!.failed).toBe(1);
    expect(tool!.duration).toBe('2 viewports');
    // Flattened tests include every viewport's every browser's tests.
    expect(tool!.tests).toHaveLength(3);
  });

  it('sorts desktop before responsive regardless of discovery order', async () => {
    write('playwright-responsive-chromium.json', cucumberJson('catalog', 'passed'));
    write('playwright-desktop-chromium.json', cucumberJson('checkout', 'passed'));

    const tool = await buildPlaywrightTool(dir);
    expect(tool!.viewports!.map((v) => v.viewport)).toEqual(['desktop', 'responsive']);
  });

  it('defaults browser to chromium for legacy playwright-<viewport>.json (no browser segment)', async () => {
    write('playwright-desktop.json', cucumberJson('checkout', 'passed'));

    const tool = await buildPlaywrightTool(dir);
    expect(tool!.viewports).toHaveLength(1);
    expect(tool!.viewports![0].browsers.map((b) => b.browser)).toEqual(['chromium']);
  });

  it('honors $BROWSER for the legacy viewport file default browser', async () => {
    process.env.BROWSER = 'WebKit';
    write('playwright-responsive.json', cucumberJson('catalog', 'passed'));

    const tool = await buildPlaywrightTool(dir);
    expect(tool!.viewports![0].browsers.map((b) => b.browser)).toEqual(['webkit']);
  });

  it('mixes legacy and browser-segmented files within the same viewport', async () => {
    write('playwright-desktop.json', cucumberJson('checkout', 'passed')); // → chromium default
    write('playwright-desktop-firefox.json', cucumberJson('login', 'passed'));

    const tool = await buildPlaywrightTool(dir);
    expect(tool!.viewports).toHaveLength(1);
    expect(tool!.viewports![0].browsers.map((b) => b.browser)).toEqual(['chromium', 'firefox']);
  });

  it('falls back to per-browser breakdown when only playwright-<browser>.json files exist', async () => {
    write('playwright-chromium.json', cucumberJson('checkout', 'passed'));
    write('playwright-firefox.json', cucumberJson('login', 'passed'));

    const tool = await buildPlaywrightTool(dir);
    expect(tool!.viewports).toBeUndefined();
    expect(tool!.browsers).toBeDefined();
    expect(tool!.browsers!.map((b) => b.browser)).toEqual(['chromium', 'firefox']);
    expect(tool!.duration).toBe('2 browsers');
  });

  it('ignores non-browser suffixes like playwright-visual.json in the browser fallback', async () => {
    write('playwright-visual.json', cucumberJson('visual', 'passed'));
    write('playwright.json', cucumberJson('flat', 'passed'));

    const tool = await buildPlaywrightTool(dir);
    // playwright-visual.json is not a browser → falls through to flat.
    expect(tool!.viewports).toBeUndefined();
    expect(tool!.browsers).toBeUndefined();
    expect(tool!.tests).toHaveLength(1);
    expect(tool!.suites).toEqual(['flat']);
  });

  it('falls back to flat playwright.json when no viewport/browser files exist', async () => {
    write('playwright.json', cucumberJson('flat', 'passed'));

    const tool = await buildPlaywrightTool(dir);
    expect(tool!.viewports).toBeUndefined();
    expect(tool!.browsers).toBeUndefined();
    expect(tool!.passed).toBe(1);
    expect(tool!.tests).toHaveLength(1);
  });

  it('viewport files take precedence over a flat playwright.json', async () => {
    write('playwright.json', cucumberJson('flat', 'passed'));
    write('playwright-desktop-chromium.json', cucumberJson('checkout', 'passed'));

    const tool = await buildPlaywrightTool(dir);
    expect(tool!.viewports).toBeDefined();
    expect(tool!.viewports!.map((v) => v.viewport)).toEqual(['desktop']);
  });
});
