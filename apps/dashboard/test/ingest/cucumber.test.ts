import { describe, it, expect } from 'vitest';

import { ingestCucumber } from '../../scripts/ingest-run';

describe('ingestCucumber — step extraction', () => {
  const passingScenario = {
    name: 'login feature',
    uri: 'src/core/tests/login/features/login.feature',
    elements: [
      {
        name: 'user logs in',
        type: 'scenario',
        steps: [
          {
            keyword: 'Given ', name: 'a fresh browser',
            match: { location: 'src/login/steps.ts:5' },
            result: { status: 'passed', duration: 100_000_000 },
          },
          {
            keyword: 'When ', name: 'they submit credentials',
            match: { location: 'src/login/steps.ts:15' },
            result: { status: 'passed', duration: 200_000_000 },
          },
          {
            keyword: 'Then ', name: 'they land on the dashboard',
            match: { location: 'src/login/steps.ts:25' },
            result: { status: 'passed', duration: 50_000_000 },
          },
        ],
      },
    ],
  };

  it('emits one TestStep per cucumber step with keyword, name, status, dur, location', () => {
    const out = ingestCucumber([passingScenario]);
    expect(out.tests).toHaveLength(1);
    const t = out.tests[0];
    expect(t.steps).toBeDefined();
    expect(t.steps).toHaveLength(3);
    expect(t.steps?.[0]).toMatchObject({
      keyword: 'Given ',
      name: 'a fresh browser',
      status: 'passed',
      location: 'src/login/steps.ts:5',
    });
    expect(t.failedStepIndex).toBeUndefined();
  });

  it('sets failedStepIndex to the index of the first failing step and copies its error message', () => {
    const failing = {
      ...passingScenario,
      elements: [
        {
          ...passingScenario.elements[0],
          steps: [
            { keyword: 'Given ', name: 'setup', result: { status: 'passed', duration: 10_000_000 } },
            {
              keyword: 'When ', name: 'broken action',
              result: { status: 'failed', duration: 20_000_000, error_message: 'AssertionError: expected truthy' },
            },
            { keyword: 'Then ', name: 'never runs', result: { status: 'skipped', duration: 0 } },
          ],
        },
      ],
    };
    const out = ingestCucumber([failing]);
    expect(out.tests[0].failedStepIndex).toBe(1);
    expect(out.tests[0].steps?.[1].error).toBe('AssertionError: expected truthy');
    expect(out.tests[0].steps?.[1].status).toBe('failed');
    expect(out.tests[0].steps?.[2].status).toBe('skipped');
  });

  it('filters hidden hooks when passing but keeps them when failing', () => {
    const withHiddenHooks = {
      ...passingScenario,
      elements: [
        {
          ...passingScenario.elements[0],
          steps: [
            { keyword: 'Before', hidden: true, result: { status: 'passed', duration: 1_000_000 } },
            { keyword: 'Given ', name: 'setup', result: { status: 'passed', duration: 10_000_000 } },
            {
              keyword: 'After', hidden: true,
              result: { status: 'failed', duration: 5_000_000, error_message: 'teardown failed' },
            },
          ],
        },
      ],
    };
    const out = ingestCucumber([withHiddenHooks]);
    // Passing Before is filtered; Given remains; failing After is kept.
    expect(out.tests[0].steps).toHaveLength(2);
    expect(out.tests[0].steps?.[0].name).toBe('setup');
    expect(out.tests[0].steps?.[1].hidden).toBe(true);
    expect(out.tests[0].steps?.[1].error).toBe('teardown failed');
    expect(out.tests[0].failedStepIndex).toBe(1);
  });
});
