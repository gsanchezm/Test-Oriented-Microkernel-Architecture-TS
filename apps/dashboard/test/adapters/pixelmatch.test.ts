import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { pixelmatchAdapter } from '../../src/server/normalize/pixelmatch';
import { ctx } from './_helpers';

describe('pixelmatchAdapter', () => {
  let runDir: string;
  let pngDir: string;

  // Write a zero-byte PNG so existsSync() sees the file. The adapter only
  // cares whether the path exists, not its contents.
  function touchPng(name: string): void {
    writeFileSync(path.join(pngDir, name), '');
  }

  beforeEach(() => {
    runDir = mkdtempSync(path.join(os.tmpdir(), 'pm-adapter-'));
    pngDir = path.join(runDir, 'pixelmatch');
    mkdirSync(pngDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(runDir, { recursive: true, force: true });
  });

  const fixture = {
    id: 'pixelmatch',
    name: 'PixelMatch',
    description: 'Visual.',
    passed: 2,
    failed: 1,
    skipped: 0,
    duration: '2m',
    suites: ['Marketing'],
    diffs: [
      { name: 'Hero', baseline: 'pricing-hero', diffPct: 0.04, status: 'passed' as const },
      { name: 'Side', baseline: 'dash-sidebar', diffPct: 3.21, status: 'failed' as const },
    ],
  };

  it('produces a visual tool and resolves all three image URLs when every PNG exists', () => {
    touchPng('pricing-hero-baseline.png');
    touchPng('pricing-hero-actual.png');
    touchPng('pricing-hero-diff.png');

    const out = pixelmatchAdapter(fixture, ctx({ runId: 'run-1', runDir }));
    expect(out.kind).toBe('visual');
    expect(out.diffs).toHaveLength(2);
    expect(out.diffs[0].images).toEqual({
      baseline: '/reports/run-1/pixelmatch/pricing-hero-baseline.png',
      actual:   '/reports/run-1/pixelmatch/pricing-hero-actual.png',
      diff:     '/reports/run-1/pixelmatch/pricing-hero-diff.png',
    });
  });

  it('always returns the actual URL even when no PNGs exist on disk', () => {
    const out = pixelmatchAdapter(fixture, ctx({ runId: 'run-1', runDir }));
    expect(out.diffs[0].images.actual).toBe('/reports/run-1/pixelmatch/pricing-hero-actual.png');
  });

  it('omits images.diff when diff.png is missing (passed / identical snapshot)', () => {
    // Identical snapshot: baseline + actual exist, but no diff was produced.
    touchPng('pricing-hero-baseline.png');
    touchPng('pricing-hero-actual.png');

    const out = pixelmatchAdapter(fixture, ctx({ runId: 'run-1', runDir }));
    expect(out.diffs[0].images.baseline).toBe('/reports/run-1/pixelmatch/pricing-hero-baseline.png');
    expect(out.diffs[0].images.diff).toBeUndefined();
  });

  it('sets images.diff when diff.png is present (failed snapshot)', () => {
    touchPng('dash-sidebar-baseline.png');
    touchPng('dash-sidebar-actual.png');
    touchPng('dash-sidebar-diff.png');

    const out = pixelmatchAdapter(fixture, ctx({ runId: 'run-1', runDir }));
    expect(out.diffs[1].images.diff).toBe('/reports/run-1/pixelmatch/dash-sidebar-diff.png');
  });

  it('omits images.baseline when baseline.png is missing (first-run bootstrap)', () => {
    // First run: only the freshly-captured actual exists.
    touchPng('pricing-hero-actual.png');

    const out = pixelmatchAdapter(fixture, ctx({ runId: 'run-1', runDir }));
    expect(out.diffs[0].images.baseline).toBeUndefined();
    expect(out.diffs[0].images.actual).toBe('/reports/run-1/pixelmatch/pricing-hero-actual.png');
  });

  it('encodes special characters in the actual URL while checking disk with the raw name', () => {
    // Filename on disk uses the raw baseline; URL uses the encoded form.
    touchPng('a b_c-actual.png');

    const out = pixelmatchAdapter(
      { ...fixture, diffs: [{ name: 'X', baseline: 'a b_c', diffPct: 0, status: 'passed' as const }] },
      ctx({ runId: 'run-1', runDir }),
    );
    expect(out.diffs[0].images.actual).toBe('/reports/run-1/pixelmatch/a%20b_c-actual.png');
  });

  it('passes through bucketing chips and triggeredBy backlink', () => {
    touchPng('pricing-hero-actual.png');

    const out = pixelmatchAdapter(
      {
        ...fixture,
        diffs: [
          {
            name: 'Hero', baseline: 'pricing-hero', diffPct: 0.04, status: 'passed' as const,
            bucketing: { market: 'us', language: 'en', viewport: 'desktop' },
            triggeredBy: { feature: 'catalog', scenario: 'Catalog renders in US/en', runId: 'run-1' },
          },
        ],
      },
      ctx({ runId: 'run-1', runDir }),
    );
    expect(out.diffs[0].bucketing).toEqual({ market: 'us', language: 'en', viewport: 'desktop' });
    expect(out.diffs[0].triggeredBy?.scenario).toBe('Catalog renders in US/en');
  });
});
