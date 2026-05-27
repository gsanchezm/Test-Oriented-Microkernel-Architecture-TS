import { describe, it, expect } from 'vitest';

import { appiumAdapter } from '../../src/server/normalize/appium';
import type { MobileUiTool } from '../../src/shared/types';
import { ctx } from './_helpers';

describe('appiumAdapter', () => {
  const platformBlock = (passed: number, failed: number, withFailingSteps = false) => ({
    passed,
    failed,
    skipped: 0,
    duration: '5m',
    device: 'Pixel',
    suites: ['Onboarding'],
    tests: [
      withFailingSteps
        ? {
            name: 'open', suite: 'Onboarding', file: 'onb.test.js', dur: '1s', status: 'failed' as const,
            error: 'launch timed out',
            steps: [
              { keyword: 'Given ', name: 'cold app', status: 'passed' as const, dur: '200ms' },
              { keyword: 'When ',  name: 'tap launch', status: 'failed' as const, dur: '800ms', error: 'launch timed out' },
            ],
            failedStepIndex: 1,
          }
        : {
            name: 'open', suite: 'Onboarding', file: 'onb.test.js', dur: '1s', status: 'passed' as const,
            steps: [{ keyword: 'Given ', name: 'cold app', status: 'passed' as const, dur: '300ms' }],
          },
    ],
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
      android: platformBlock(6, 1, true),
      ios: platformBlock(4, 0),
    },
  };

  it('produces a mobile_ui tool with both platforms intact', () => {
    const out = appiumAdapter(fixture, ctx());
    expect(out.kind).toBe('mobile_ui');
    expect(out.platforms.android.tests).toHaveLength(1);
    expect(out.platforms.ios.passed).toBe(4);
    expect(out.platforms.android.tests[0].steps).toHaveLength(2);
    expect(out.platforms.android.tests[0].failedStepIndex).toBe(1);
    expect(out.platforms.ios.tests[0].steps).toHaveLength(1);
  });
});
