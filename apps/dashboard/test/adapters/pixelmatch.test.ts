import { describe, it, expect } from 'vitest';

import { pixelmatchAdapter } from '../../src/server/normalize/pixelmatch';
import { ctx } from './_helpers';

describe('pixelmatchAdapter', () => {
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

  it('produces a visual tool and resolves three image URLs per diff', () => {
    const out = pixelmatchAdapter(fixture, ctx({ runId: 'run-1' }));
    expect(out.kind).toBe('visual');
    expect(out.diffs).toHaveLength(2);
    expect(out.diffs[0].images).toEqual({
      baseline: '/reports/run-1/pixelmatch/pricing-hero-baseline.png',
      actual:   '/reports/run-1/pixelmatch/pricing-hero-actual.png',
      diff:     '/reports/run-1/pixelmatch/pricing-hero-diff.png',
    });
  });

  it('encodes special characters in baseline names', () => {
    const out = pixelmatchAdapter(
      { ...fixture, diffs: [{ name: 'X', baseline: 'a b/c', diffPct: 0, status: 'passed' }] },
      ctx({ runId: 'run-1' }),
    );
    expect(out.diffs[0].images.baseline).toBe('/reports/run-1/pixelmatch/a%20b%2Fc-baseline.png');
  });

  it('passes through bucketing chips and triggeredBy backlink', () => {
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
      ctx({ runId: 'run-1' }),
    );
    expect(out.diffs[0].bucketing).toEqual({ market: 'us', language: 'en', viewport: 'desktop' });
    expect(out.diffs[0].triggeredBy?.scenario).toBe('Catalog renders in US/en');
  });
});
