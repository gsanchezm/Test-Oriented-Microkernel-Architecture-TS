import type { ToolKind } from './kinds.js';

export type Status = 'passed' | 'failed' | 'skipped';

export interface RunInfo {
  project: string;
  buildId: string;
  branch: string;
  commit: string;
  triggeredBy: string;
  startedAt: string;
  duration: string;
  env: string;
}

export interface ManifestEntry {
  runId: string;
  project: string;
  buildId: string;
  branch: string;
  startedAt: string;
}

export interface TestCase {
  name: string;
  suite: string;
  file: string;
  dur: string;
  status: Status;
  error?: string;
  steps?: TestStep[];
  failedStepIndex?: number;
}

export interface TestStep {
  keyword: string;       // "Given ", "When ", "Then ", "And ", "But ", "After", "Before"
  name: string;          // text post-substitution (cucumber-js already expands Examples)
  status: Status;        // 'passed' | 'failed' | 'skipped'
  dur: string;           // human duration ("280ms" / "1.2s")
  location?: string;     // step definition source location (cucumber match.location)
  error?: string;        // set only when status === 'failed'
  hidden?: boolean;      // hidden cucumber hook — only emitted when failed
}

export interface Counts {
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
}

interface BaseTool extends Counts {
  id: string;
  name: string;
  description: string;
  suites?: string[];
  /**
   * True when the dashboard server is aware of this tool (it's in the
   * adapter registry) but did not find a `<toolId>.json` for this run.
   * The kind-specific arrays are present but empty so the discriminated
   * union is still valid. UI components render a muted "No data" state.
   */
  missing?: boolean;
}

export interface BrowserBlock extends Counts {
  /** Normalized browser id: chrome | chromium | firefox | edge | webkit | safari. */
  browser: string;
  suites: string[];
  tests: TestCase[];
}

export interface ViewportBlock extends Counts {
  /** Normalized viewport id: 'desktop' | 'responsive'. */
  viewport: string;
  /** Browsers executed in this viewport. Always at least one. */
  browsers: BrowserBlock[];
}

export interface WebUiTool extends BaseTool {
  kind: 'web_ui';
  tests: TestCase[];
  /**
   * Optional per-browser breakdown. Present when the run was executed across
   * multiple browsers (one cucumber JSON per browser). When set, the detail
   * view renders browser sub-tabs (mirroring the mobile Android/iOS tabs);
   * when absent, it shows a single flat test list.
   */
  browsers?: BrowserBlock[];
  /**
   * Optional viewport breakdown (desktop / responsive), each carrying its own
   * per-browser breakdown. When set, the detail view renders an outer viewport
   * tab strip with an inner browser tab strip. Takes precedence over
   * `browsers` / flat `tests`.
   */
  viewports?: ViewportBlock[];
}

export interface ApiTool extends BaseTool {
  kind: 'api';
  tests: TestCase[];
}

export interface PlatformBlock extends Counts {
  device: string;
  suites: string[];
  tests: TestCase[];
}

export interface MobileUiTool extends BaseTool {
  kind: 'mobile_ui';
  platforms: {
    android: PlatformBlock;
    ios: PlatformBlock;
  };
}

export interface PerfDistributionBucket {
  label: string;
  pct: number;
  count: number;
}

export interface PerfStep {
  name: string;
  rps: number;
  p95: number;
  errors: number;
}

export interface PerfScenario {
  name: string;
  rps: number;
  p95: number;
  errors: number;
  steps?: PerfStep[];
}

export interface PerfBlock {
  rps: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  requests: number;
  maxRps: number;
  distribution: PerfDistributionBucket[];
  scenarios: PerfScenario[];
}

export interface PerformanceTool extends BaseTool {
  kind: 'performance';
  perf: PerfBlock;
}

export interface VisualDiffImages {
  /** Omitted when no baseline PNG exists on disk (e.g. first-run bootstrap). */
  baseline?: string;
  actual: string;
  /** Omitted when no diff PNG was produced (snapshot identical / within tolerance). */
  diff?: string;
}

export interface VisualDiff {
  name: string;
  baseline: string;
  diffPct: number;
  status: 'passed' | 'failed';
  images: VisualDiffImages;
  bucketing?: {
    feature?: string;
    snapshot?: string;
    platform?: string;
    viewport?: string;
    market?: string;
    language?: string;
  };
  triggeredBy?: {
    feature: string;
    scenario: string;
    runId?: string;
  };
}

export interface VisualTool extends BaseTool {
  kind: 'visual';
  diffs: VisualDiff[];
}

export type Tool =
  | WebUiTool
  | ApiTool
  | MobileUiTool
  | PerformanceTool
  | VisualTool;

/**
 * Summary shape returned by GET /api/runs/:runId. Drops the heavy detail arrays
 * — overview cards only need counts, duration, and (for mobile) per-platform
 * counts. The detail endpoint returns the full Tool.
 */
export type ToolSummary =
  | Omit<WebUiTool, 'tests' | 'browsers' | 'viewports'>
  | Omit<ApiTool, 'tests'>
  | (Omit<MobileUiTool, 'platforms'> & {
      platforms: {
        android: Omit<PlatformBlock, 'tests'>;
        ios: Omit<PlatformBlock, 'tests'>;
      };
    })
  | (Omit<PerformanceTool, 'perf'> & {
      perf: Omit<PerfBlock, 'distribution' | 'scenarios'>;
    })
  | Omit<VisualTool, 'diffs'>;

export interface RunPayload {
  run: RunInfo;
  tools: ToolSummary[];
}

export function toolKindOf(tool: Tool | ToolSummary): ToolKind {
  return tool.kind;
}
