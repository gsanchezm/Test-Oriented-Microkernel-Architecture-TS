import { describe, it, expect } from 'vitest';
import path from 'node:path';

import { bucketingFromPath } from '../../scripts/ingest-pixelmatch';

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
