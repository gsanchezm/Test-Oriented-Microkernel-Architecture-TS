import { describe, it, expect } from 'vitest';

import { appiumAdapter } from '../../src/server/normalize/appium';
import type { MobileUiTool } from '../../src/shared/types';
import { ctx } from './_helpers';

describe('appiumAdapter', () => {
  const platformBlock = (passed: number, failed: number) => ({
    passed,
    failed,
    skipped: 0,
    duration: '5m',
    device: 'Pixel',
    suites: ['Onboarding'],
    tests: [{ name: 'open', suite: 'Onboarding', file: 'onb.test.js', dur: '1s', status: 'passed' as const }],
  });

  const fixture: Omit<MobileUiTool, 'kind'> = {
    id: 'appium',
    name: 'Appium',
    description: 'Mobile flows.',
    passed: 10,
    failed: 1,
    skipped: 0,
    duration: '10m',
    platforms: {
      android: platformBlock(6, 1),
      ios: platformBlock(4, 0),
    },
  };

  it('produces a mobile_ui tool with both platforms intact', () => {
    const out = appiumAdapter(fixture, ctx());
    expect(out.kind).toBe('mobile_ui');
    expect(out.platforms.android.tests).toHaveLength(1);
    expect(out.platforms.ios.passed).toBe(4);
  });
});
