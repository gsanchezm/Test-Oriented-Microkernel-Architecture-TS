import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bucketingFromPath, ingestPixelmatch } from '../../scripts/ingest-pixelmatch';

describe('bucketingFromPath', () => {
  const runDir = '/tmp/visual-results/tom-2026-05-22T18-59-01-039Z-pid14848-web';

  it('extracts feature/snapshot/platform/viewport from the canonical 4-segment path', () => {
    const p = path.join(runDir, 'checkout/checkout_order_summary/web/desktop/result.json');
    expect(bucketingFromPath(runDir, p)).toEqual({
      feature: 'checkout',
      snapshot: 'checkout_order_summary',
      platform: 'web',
      viewport: 'desktop',
    });
  });

  it('adds market and language when present as 5th/6th segments', () => {
    const p = path.join(runDir, 'checkout/checkout_order_summary/web/desktop/us/en/result.json');
    expect(bucketingFromPath(runDir, p)).toEqual({
      feature: 'checkout',
      snapshot: 'checkout_order_summary',
      platform: 'web',
      viewport: 'desktop',
      market: 'us',
      language: 'en',
    });
  });

  it('omits missing trailing segments', () => {
    const p = path.join(runDir, 'login/login_form/web/desktop/mx/result.json');
    expect(bucketingFromPath(runDir, p)).toEqual({
      feature: 'login',
      snapshot: 'login_form',
      platform: 'web',
      viewport: 'desktop',
      market: 'mx',
    });
  });
});

describe('ingestPixelmatch — per-viewport run dir selection', () => {
  let repoRoot: string;
  let dashboardRunDir: string;
  let visualResults: string;

  // Create one snapshot (feature/snapshot/platform/<viewport>/result.json + actual.png)
  // inside a tom-* run dir and set the dir's mtime so newest-first ordering is
  // deterministic.
  function makeRun(runName: string, viewport: string, opts: { status: string; mtime: number; feature?: string }): string {
    const runDir = path.join(visualResults, runName);
    const feature = opts.feature ?? 'checkout';
    const snapDir = path.join(runDir, feature, `${feature}_summary`, 'web', viewport);
    mkdirSync(snapDir, { recursive: true });
    writeFileSync(
      path.join(snapDir, 'result.json'),
      JSON.stringify({ feature, snapshotId: `${feature}_summary`, platform: 'web', viewport, status: opts.status, diffRatio: 0 }),
      'utf8',
    );
    writeFileSync(path.join(snapDir, 'actual.png'), '');
    const t = new Date(opts.mtime);
    utimesSync(runDir, t, t);
    return runDir;
  }

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), 'pm-repo-'));
    visualResults = path.join(repoRoot, 'visual-results');
    mkdirSync(visualResults, { recursive: true });
    dashboardRunDir = mkdtempSync(path.join(os.tmpdir(), 'pm-dash-'));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(dashboardRunDir, { recursive: true, force: true });
  });

  it('returns null when there are no visual-results', async () => {
    rmSync(visualResults, { recursive: true, force: true });
    const tool = await ingestPixelmatch({ repoRoot, dashboardRunDir, dashboardRunId: 'run-1' });
    expect(tool).toBeNull();
  });

  it('ingests the most-recent run dir for EACH viewport (desktop + responsive)', async () => {
    makeRun('tom-old-desktop', 'desktop', { status: 'PASS', mtime: 1000, feature: 'old' });
    makeRun('tom-new-desktop', 'desktop', { status: 'PASS', mtime: 3000, feature: 'checkout' });
    makeRun('tom-responsive', 'responsive', { status: 'FAIL', mtime: 2000, feature: 'catalog' });

    const tool = await ingestPixelmatch({ repoRoot, dashboardRunDir, dashboardRunId: 'run-1' });
    expect(tool).not.toBeNull();

    const viewports = tool!.diffs.map((d) => d.bucketing?.viewport).sort();
    // One diff per viewport: desktop (from newest desktop dir) + responsive.
    expect(viewports).toEqual(['desktop', 'responsive']);

    // The stale desktop dir ('old') must NOT be ingested.
    const features = tool!.diffs.map((d) => d.bucketing?.feature);
    expect(features).toContain('checkout');
    expect(features).toContain('catalog');
    expect(features).not.toContain('old');

    // Counts combine across viewports: 1 PASS (desktop) + 1 FAIL (responsive).
    expect(tool!.passed).toBe(1);
    expect(tool!.failed).toBe(1);
  });

  it('respects opts.visualRunDir override (single-dir behavior, no per-viewport selection)', async () => {
    makeRun('tom-new-desktop', 'desktop', { status: 'PASS', mtime: 3000, feature: 'checkout' });
    const responsiveDir = makeRun('tom-responsive', 'responsive', { status: 'FAIL', mtime: 2000, feature: 'catalog' });

    const tool = await ingestPixelmatch({
      repoRoot,
      visualRunDir: responsiveDir,
      dashboardRunDir,
      dashboardRunId: 'run-1',
    });
    expect(tool).not.toBeNull();
    // Only the overridden dir is ingested — desktop is ignored.
    expect(tool!.diffs).toHaveLength(1);
    expect(tool!.diffs[0].bucketing?.viewport).toBe('responsive');
  });
});
