import type { RunInfo, Tool, ToolSummary } from '../../shared/types.js';

export interface AdapterContext {
  runId: string;
  runDir: string;
  runInfo: RunInfo;
}

export type Adapter = (
  raw: unknown,
  ctx: AdapterContext,
) => Tool | Promise<Tool>;

/**
 * Strip detail-heavy arrays from a Tool to produce its ToolSummary.
 * The /api/runs/:runId endpoint returns these summaries so the overview
 * page doesn't have to download every test case for every tool.
 */
export function summarize(tool: Tool): ToolSummary {
  switch (tool.kind) {
    case 'web_ui': {
      const { tests: _tests, browsers: _browsers, ...rest } = tool;
      void _tests;
      void _browsers;
      return rest;
    }
    case 'api': {
      const { tests: _tests, ...rest } = tool;
      void _tests;
      return rest;
    }
    case 'mobile_ui': {
      const { platforms, ...rest } = tool;
      return {
        ...rest,
        platforms: {
          android: stripTests(platforms.android),
          ios: stripTests(platforms.ios),
        },
      };
    }
    case 'performance': {
      const { perf, ...rest } = tool;
      const { distribution: _d, scenarios: _s, ...perfRest } = perf;
      void _d;
      void _s;
      return { ...rest, perf: perfRest };
    }
    case 'visual': {
      const { diffs: _diffs, ...rest } = tool;
      void _diffs;
      return rest;
    }
  }
}

function stripTests<T extends { tests: unknown }>(
  block: T,
): Omit<T, 'tests'> {
  const { tests: _tests, ...rest } = block;
  void _tests;
  return rest;
}

export function assertObject(raw: unknown, label: string): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Adapter input for ${label} is not a JSON object`);
  }
  return raw as Record<string, unknown>;
}
