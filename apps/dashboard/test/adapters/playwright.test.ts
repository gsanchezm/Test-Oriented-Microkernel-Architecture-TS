import { describe, it, expect } from 'vitest';

import { playwrightAdapter } from '../../src/server/normalize/playwright';
import type { WebUiTool } from '../../src/shared/types';
import { ctx } from './_helpers';

describe('playwrightAdapter', () => {
  const fixture: Omit<WebUiTool, 'kind'> = {
    id: 'playwright',
    name: 'Playwright',
    description: 'Web UI suite.',
    passed: 5,
    failed: 1,
    skipped: 2,
    duration: '1m 0s',
    suites: ['Auth'],
    tests: [
      { name: 'login', suite: 'Auth', file: 'auth.spec.ts', dur: '1s', status: 'passed' },
      {
        name: 'logout', suite: 'Auth', file: 'auth.spec.ts', dur: '1s', status: 'failed', error: 'boom',
        steps: [
          { keyword: 'Given ', name: 'logged in user', status: 'passed', dur: '300ms' },
          { keyword: 'When ',  name: 'clicks logout',   status: 'failed', dur: '700ms', error: 'boom' },
        ],
        failedStepIndex: 1,
      },
    ],
  };

  it('produces a web_ui tool with the same data and the kind set', () => {
    const out = playwrightAdapter(fixture, ctx());
    expect(out.kind).toBe('web_ui');
    expect(out.id).toBe('playwright');
    expect(out.passed).toBe(5);
    expect(out.tests).toHaveLength(2);
    expect(out.tests[1].error).toBe('boom');
    expect(out.tests[1].steps).toHaveLength(2);
    expect(out.tests[1].failedStepIndex).toBe(1);
    expect(out.tests[1].steps?.[1].error).toBe('boom');
  });

  it('rejects non-object inputs', () => {
    expect(() => playwrightAdapter(null, ctx())).toThrow();
    expect(() => playwrightAdapter([], ctx())).toThrow();
    expect(() => playwrightAdapter('nope', ctx())).toThrow();
  });
});
