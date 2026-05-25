import { describe, it, expect } from 'vitest';

import { apiAdapter } from '../../src/server/normalize/api';
import type { ApiTool } from '../../src/shared/types';
import { ctx } from './_helpers';

describe('apiAdapter', () => {
  const fixture: Omit<ApiTool, 'kind'> = {
    id: 'api',
    name: 'API Suite',
    description: 'Contract tests.',
    passed: 100,
    failed: 2,
    skipped: 0,
    duration: '2m',
    suites: ['Users'],
    tests: [{ name: 'GET /u', suite: 'Users', file: 'users.spec.ts', dur: '90ms', status: 'passed' }],
  };

  it('produces an api tool with the same data and the kind set', () => {
    const out = apiAdapter(fixture, ctx());
    expect(out.kind).toBe('api');
    expect(out.passed).toBe(100);
    expect(out.tests).toHaveLength(1);
  });
});
