# Feature Steps + Iteration-Level Failure Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **User policy override (per user memory):** The assistant NEVER runs `git commit`. Commit steps in this plan instruct you to **stage** files with `git add` and propose the commit message. The human runs `git commit` themselves after reviewing the staged diff. Do not attempt to commit on the user's behalf.

**Goal:** Make the dashboard at `apps/dashboard/` print Given/When/Then steps for every cucumber-backed scenario, highlight the step that failed (with its error inline), expand the same accordion mental model to Gatling simulations, and add scenario-backlinks + bucketing chips to PixelMatch diffs.

**Architecture:** Strictly additive on the data model (`TestStep` is new; `TestCase`/`VisualDiff` gain optional fields; `PerfBlock.scenarios` is restructured with a back-compat regen of mock fixtures). Ingest scripts emit the richer payload; UI components add accordion behavior on top of existing rows. Cross-package: visual hooks thread `pickle.name` through the `COMPARE_SNAPSHOT` intent so PixelMatch's `result.json` carries the scenario name, which the dashboard ingest then reads.

**Tech Stack:** TypeScript, React 18, Vite, Express, Vitest, React Testing Library (added in this plan), Cucumber-js JSON, Gatling HTML reports, the existing `@kernel/intents` pipeline.

**Spec reference:** `docs/superpowers/specs/2026-05-27-feature-steps-iteration-failure-design.md`

---

## File structure

**Modify:**
- `apps/dashboard/src/shared/types.ts` — add `TestStep`, extend `TestCase`/`VisualDiff`, restructure `PerfScenario` + add `PerfStep`.
- `apps/dashboard/scripts/ingest-run.ts` — emit `steps[]` and `failedStepIndex` per scenario.
- `apps/dashboard/scripts/ingest-gatling.ts` — produce 1 `PerfScenario` per simulation with nested `steps[]`.
- `apps/dashboard/scripts/ingest-pixelmatch.ts` — populate `bucketing` + `triggeredBy`; widen `VisualResultFile` to include `scenario?`.
- `apps/dashboard/scripts/generate-fixtures.ts` — populate `steps[]`, mock `bucketing`, and a sample `triggeredBy` so the dashboard demo shows the new behavior end-to-end.
- `apps/dashboard/src/client/components/TestList.tsx` — convert each row into an accordion toggle; pass through optional `expandScenarioName`.
- `apps/dashboard/src/client/views/detail/GenericDetail.tsx` — read `?expand=<scenario>` and forward to `TestList`.
- `apps/dashboard/src/client/views/detail/MobileDetail.tsx` — same accordion via shared `TestList` (no logic change beyond the new prop forwarding if it uses `TestList`).
- `apps/dashboard/src/client/views/detail/PerformanceDetail.tsx` — replace the flat Scenarios block with simulation cards that expand to per-step tables.
- `apps/dashboard/src/client/views/detail/VisualDetail.tsx` — render `bucketing` chips and the `triggeredBy` backlink per diff.
- `apps/dashboard/src/client/styles/styles.css` — `.step-*`, `.chip-*`, `.triggered-by`, `.scenario-card`, `.scenario-card-body` rules.
- `apps/dashboard/vitest.config.ts` — add `jsdom` environment for the component test glob.
- `apps/dashboard/package.json` — add RTL + jsdom dev dependencies.
- `src/plugins/pixelmatch/actions/visual-target-options.ts` — parse optional `scenario` variable.
- `src/plugins/pixelmatch/actions/CompareSnapshot.ts` — write `scenario` (when present) into `result.json`.
- `src/plugins/pixelmatch/support/visual-result.types.ts` — add `scenario?: string` to `VisualComparisonResult`.
- `src/core/tests/catalog/step_definitions/visual.hooks.ts` (and the 6 sibling slices: checkout, login, navbar, order_success, pizzaBuilder, profile) — add `if (pickle.name) bucket.scenario = pickle.name;` before `optionsJson` is built.

**Create:**
- `apps/dashboard/src/client/components/StepList.tsx` — new component, renders `TestStep[]`.
- `apps/dashboard/test/components/StepList.test.tsx` — RTL coverage.
- `apps/dashboard/test/components/TestList.test.tsx` — RTL coverage.
- `apps/dashboard/test/ingest/cucumber.test.ts` — unit-test the cucumber walker.
- `apps/dashboard/test/ingest/gatling.test.ts` — unit-test the simulation restructure.
- `apps/dashboard/test/ingest/pixelmatch.test.ts` — unit-test bucketing + triggeredBy.
- `apps/dashboard/test/setup.ts` — RTL globals for the jsdom environment.

**Extend (no breaking changes):**
- `apps/dashboard/test/adapters/playwright.test.ts`, `api.test.ts`, `appium.test.ts`, `gatling.test.ts`, `pixelmatch.test.ts` — add one assertion per file that exercises the new shape through the adapter pass-through.

---

## Parallelization map (for subagent-driven execution)

| Phase | Tasks | Parallel? |
|---|---|---|
| 1 — Types | Task 1 | sequential (foundation) |
| 2 — Ingest | Tasks 2 / 3 / 4 | **parallel** — three subagents (one per script + tests) |
| 3 — Cross-package A | Tasks 5 / 6 / 7 | sequential — same intent payload schema |
| 4 — UI | Tasks 8 → 9 → 10 → 11 | Tasks 9, 10, 11 are parallel after Task 8 (StepList) lands |
| 5 — Fixtures + smoke | Tasks 12 / 13 | sequential |

Between phases the orchestrator runs `git status` to audit scope creep, per the project memory `feedback_subagent_scope.md`. Each subagent prompt MUST list files it is NOT allowed to touch.

---

## Task 1: Extend the dashboard's shared types

**Files:**
- Modify: `apps/dashboard/src/shared/types.ts`

- [ ] **Step 1: Add `TestStep` interface**

Append immediately after the existing `TestCase` interface (line 24-31):

```ts
export interface TestStep {
  keyword: string;       // "Given ", "When ", "Then ", "And ", "But ", "After", "Before"
  name: string;          // text post-substitution (cucumber-js already expands Examples)
  status: Status;        // 'passed' | 'failed' | 'skipped'
  dur: string;           // human duration ("280ms" / "1.2s")
  location?: string;     // step definition source location (cucumber match.location)
  error?: string;        // set only when status === 'failed'
  hidden?: boolean;      // hidden cucumber hook — only emitted when failed
}
```

- [ ] **Step 2: Extend `TestCase` with optional `steps` and `failedStepIndex`**

Replace the existing `TestCase` interface with:

```ts
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
```

- [ ] **Step 3: Extend `VisualDiff` with `bucketing` and `triggeredBy`**

Replace the existing `VisualDiff` interface (currently lines 128-134) with:

```ts
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
```

- [ ] **Step 4: Restructure `PerfScenario` and add `PerfStep`**

Replace the existing `PerfScenario` interface (currently lines 98-103) with both:

```ts
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
```

- [ ] **Step 5: Run typecheck to confirm the rest of the code still compiles**

Run: `pnpm --filter dashboard typecheck`
Expected: PASS with zero errors. (Existing call sites use only `name` / `rps` / `p95` / `errors` on `PerfScenario`, all of which the new shape still has. The optional fields don't break consumers.)

- [ ] **Step 6: Stage and propose commit**

```bash
git add apps/dashboard/src/shared/types.ts
```

Proposed commit message: `feat(dashboard): add TestStep type, extend TestCase / VisualDiff, restructure PerfScenario`. **Do not run `git commit`** — surface the staged diff to the user and let them commit.

---

## Task 2: Cucumber ingest emits step list

**Files:**
- Create: `apps/dashboard/test/ingest/cucumber.test.ts`
- Modify: `apps/dashboard/scripts/ingest-run.ts:53-149`

- [ ] **Step 1: Refactor — extract `ingestCucumber` into a named export so it can be unit-tested**

In `apps/dashboard/scripts/ingest-run.ts`, change the existing `function ingestCucumber(...)` declaration (line 98) to `export function ingestCucumber(...)`. Also export `IngestedSuite` and the helper `formatNs` so the test can assert on durations.

```ts
// apps/dashboard/scripts/ingest-run.ts

export function formatNs(ns: number): string { /* existing body */ }
export interface IngestedSuite { /* existing body */ }
export function ingestCucumber(features: CucumberFeature[]): IngestedSuite { /* existing body */ }
```

- [ ] **Step 2: Write the failing test**

Create `apps/dashboard/test/ingest/cucumber.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `pnpm --filter dashboard test test/ingest/cucumber.test.ts`
Expected: All three tests FAIL — `t.steps` is currently undefined.

- [ ] **Step 4: Implement `steps[]` and `failedStepIndex` in `ingestCucumber`**

In `apps/dashboard/scripts/ingest-run.ts`, replace the inner `for (const step of el.steps ?? [])` loop (currently lines 115-127) with:

```ts
import type { TestCase, TestStep } from '../src/shared/types.js';
// (TestStep import added; TestCase already imported above)

// ...inside the `for (const el of feature.elements ?? [])` loop, after `if (el.type !== 'scenario') continue;`...

let scenarioNs = 0;
let worst: Status = 'passed';
let errorMsg: string | undefined;
const stepsOut: TestStep[] = [];

for (const step of el.steps ?? []) {
  const r = step.result ?? {};
  const dur = typeof r.duration === 'number' ? r.duration : 0;
  scenarioNs += dur;
  if (!r.status || !TERMINAL_STATUSES.has(r.status)) continue;
  const stepStatus = normalizeStatus(r.status);

  const isHidden = (step as { hidden?: boolean }).hidden === true;
  // Hidden hook that passed: skip — it adds noise without value.
  if (isHidden && stepStatus !== 'failed') {
    if (stepStatus === 'failed') worst = 'failed';
    continue;
  }

  if (stepStatus === 'failed') {
    worst = 'failed';
    if (!errorMsg && r.error_message) errorMsg = r.error_message;
  } else if (stepStatus === 'skipped' && worst !== 'failed') {
    worst = 'skipped';
  }

  const out: TestStep = {
    keyword: step.keyword ?? '',
    name: step.name ?? '',
    status: stepStatus,
    dur: formatNs(dur),
  };
  const matchLocation = (step as { match?: { location?: string } }).match?.location;
  if (matchLocation) out.location = matchLocation;
  if (stepStatus === 'failed' && r.error_message) out.error = r.error_message;
  if (isHidden) out.hidden = true;
  stepsOut.push(out);
}

const failedStepIndex = stepsOut.findIndex((s) => s.status === 'failed');

totalNs += scenarioNs;
tests.push({
  name: el.name ?? '(unnamed scenario)',
  suite,
  file: uri,
  dur: formatNs(scenarioNs),
  status: worst,
  ...(errorMsg ? { error: errorMsg } : {}),
  steps: stepsOut,
  ...(failedStepIndex >= 0 ? { failedStepIndex } : {}),
});
```

Also extend the `CucumberStep` interface near the top of the file (currently lines 53-57) to admit `match?: { location?: string }` and `hidden?: boolean`:

```ts
interface CucumberStep {
  keyword?: string;
  name?: string;
  hidden?: boolean;
  match?: { location?: string };
  result?: { status?: string; duration?: number; error_message?: string };
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `pnpm --filter dashboard test test/ingest/cucumber.test.ts`
Expected: All three tests PASS.

- [ ] **Step 6: Run the full Vitest suite to confirm nothing else regressed**

Run: `pnpm --filter dashboard test`
Expected: All existing adapter + registry tests PASS. The cucumber output is additive, so back-compat holds.

- [ ] **Step 7: Stage and propose commit**

```bash
git add apps/dashboard/scripts/ingest-run.ts apps/dashboard/test/ingest/cucumber.test.ts
```

Proposed commit message: `feat(dashboard/ingest): emit Given/When/Then steps with failedStepIndex per scenario`.

---

## Task 3: Gatling ingest produces simulation cards with nested steps

**Files:**
- Create: `apps/dashboard/test/ingest/gatling.test.ts`
- Modify: `apps/dashboard/scripts/ingest-gatling.ts:242-332`

> **Parallel with Task 2 and Task 4** — different files, only shared dep is the already-finalized `types.ts` from Task 1. Subagent prompt: "Do not touch `ingest-run.ts`, `ingest-pixelmatch.ts`, or the `src/shared/types.ts` file."

- [ ] **Step 1: Refactor — expose a pure helper that builds the `PerfScenario[]` from a list of `SimulationReport`**

In `apps/dashboard/scripts/ingest-gatling.ts`, extract the loop that pushes into `scenarios` (currently lines 272-279) into an exported function:

```ts
import type { PerfScenario, PerfStep } from '../src/shared/types.js';

export function buildPerfScenarios(reports: SimulationReport[]): PerfScenario[] {
  return reports.map((report) => {
    const steps: PerfStep[] = report.scenarios.map((s) => ({
      name: s.label,
      rps:    s.values['col-6']  ?? 0,
      p95:    s.values['col-10'] ?? 0,
      errors: s.values['col-5']  ?? 0,
    }));
    return {
      name: report.simulation,
      rps:    report.root.values['col-6']  ?? 0,
      p95:    report.root.values['col-10'] ?? 0,
      errors: report.root.values['col-5']  ?? 0,
      ...(steps.length > 0 ? { steps } : {}),
    };
  });
}
```

Also export the `SimulationReport` and `RowValues` interfaces so the test can construct fixtures.

- [ ] **Step 2: Write the failing test**

Create `apps/dashboard/test/ingest/gatling.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

import { buildPerfScenarios, type SimulationReport } from '../../scripts/ingest-gatling';

const sim = (name: string, root: Record<string, number>, requests: Record<string, Record<string, number>>): SimulationReport => ({
  simulation: name,
  dir: `/tmp/${name}`,
  mtimeMs: 0,
  root: { label: 'ROOT', values: root },
  scenarios: Object.entries(requests).map(([label, values]) => ({ label, values })),
});

describe('buildPerfScenarios', () => {
  it('produces one PerfScenario per simulation with simulation-level metrics from ROOT', () => {
    const reports = [
      sim('checkout-load',
          { 'col-6': 120, 'col-10': 350, 'col-5': 0.5 },
          {
            home:      { 'col-6': 40, 'col-10': 200, 'col-5': 0   },
            addToCart: { 'col-6': 80, 'col-10': 450, 'col-5': 1.0 },
          }),
    ];
    const out = buildPerfScenarios(reports);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: 'checkout-load',
      rps: 120,
      p95: 350,
      errors: 0.5,
    });
    expect(out[0].steps).toHaveLength(2);
    expect(out[0].steps?.[1]).toMatchObject({ name: 'addToCart', rps: 80, p95: 450, errors: 1.0 });
  });

  it('omits steps[] when a simulation has no per-request rows', () => {
    const reports = [sim('login-load', { 'col-6': 10, 'col-10': 50, 'col-5': 0 }, {})];
    const out = buildPerfScenarios(reports);
    expect(out[0].steps).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `pnpm --filter dashboard test test/ingest/gatling.test.ts`
Expected: FAIL — `buildPerfScenarios` is not exported yet (or wired up).

- [ ] **Step 4: Wire `buildPerfScenarios` into `ingestGatling`**

In `apps/dashboard/scripts/ingest-gatling.ts`, replace the per-scenario push loop (currently lines 272-279) with:

```ts
const scenarios: PerfScenario[] = buildPerfScenarios(reports);
```

Keep the run-level roll-up (`p50w`, `p95w`, `p99w`, `meanw`, `rpsSum`, `total`, `ok`, `ko`) loop **above** this call — only the inner scenario-push loop is being replaced. The outer loop now only updates accumulators:

```ts
for (const report of reports) {
  const rTotal = report.root.values['col-2'] ?? 0;
  total += rTotal;
  ok += report.root.values['col-3'] ?? 0;
  ko += report.root.values['col-4'] ?? 0;
  rpsSum += report.root.values['col-6'] ?? 0;

  const w = rTotal > 0 ? rTotal : 1;
  p50w  += (report.root.values['col-8']  ?? 0) * w;
  p95w  += (report.root.values['col-10'] ?? 0) * w;
  p99w  += (report.root.values['col-11'] ?? 0) * w;
  meanw += (report.root.values['col-13'] ?? 0) * w;
}

const scenarios: PerfScenario[] = buildPerfScenarios(reports);
```

Update the passed/failed count loop (currently lines 308-314) to walk `scenarios[].steps[]` instead of the old `report.scenarios`:

```ts
let passed = 0;
let failed = 0;
for (const s of scenarios) {
  for (const step of s.steps ?? []) {
    if (step.errors === 0) passed++; else failed++;
  }
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `pnpm --filter dashboard test test/ingest/gatling.test.ts`
Expected: Both tests PASS.

- [ ] **Step 6: Update the existing gatling adapter test for the new shape**

In `apps/dashboard/test/adapters/gatling.test.ts`, change the fixture scenario entry (line 20) to match the new shape:

```ts
scenarios: [
  {
    name: 'checkout-load',
    rps: 60,
    p95: 90,
    errors: 0.05,
    steps: [{ name: 'home', rps: 30, p95: 80, errors: 0 }],
  },
],
```

And replace the assertion (line 28) with:

```ts
expect(out.perf.scenarios[0].name).toBe('checkout-load');
expect(out.perf.scenarios[0].steps).toHaveLength(1);
expect(out.perf.scenarios[0].steps?.[0].name).toBe('home');
```

- [ ] **Step 7: Run the full suite to verify**

Run: `pnpm --filter dashboard test`
Expected: All tests PASS.

- [ ] **Step 8: Stage and propose commit**

```bash
git add apps/dashboard/scripts/ingest-gatling.ts apps/dashboard/test/ingest/gatling.test.ts apps/dashboard/test/adapters/gatling.test.ts
```

Proposed commit message: `feat(dashboard/ingest): pivot Gatling scenarios to simulation→steps hierarchy`.

---

## Task 4: PixelMatch ingest populates `bucketing` from the path

**Files:**
- Create: `apps/dashboard/test/ingest/pixelmatch.test.ts`
- Modify: `apps/dashboard/scripts/ingest-pixelmatch.ts:19-33, 125-197`

> **Parallel with Tasks 2 and 3.** Subagent prompt: "Do not touch `ingest-run.ts`, `ingest-gatling.ts`, or `src/shared/types.ts`."

- [ ] **Step 1: Refactor — extract a pure `bucketingFromPath` helper**

In `apps/dashboard/scripts/ingest-pixelmatch.ts`, add this exported helper (place above `ingestPixelmatch`):

```ts
import type { VisualDiff } from '../src/shared/types.js';

export function bucketingFromPath(visualRunDir: string, resultJsonPath: string): NonNullable<VisualDiff['bucketing']> {
  const rel = path.relative(visualRunDir, path.dirname(resultJsonPath));
  const segments = rel.split(/[\\/]/).filter(Boolean);
  const [feature, snapshot, platform, viewport, market, language] = segments;
  const bucketing: NonNullable<VisualDiff['bucketing']> = {};
  if (feature)  bucketing.feature  = feature;
  if (snapshot) bucketing.snapshot = snapshot;
  if (platform) bucketing.platform = platform;
  if (viewport) bucketing.viewport = viewport;
  if (market)   bucketing.market   = market;
  if (language) bucketing.language = language;
  return bucketing;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/dashboard/test/ingest/pixelmatch.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `pnpm --filter dashboard test test/ingest/pixelmatch.test.ts`
Expected: FAIL — `bucketingFromPath` does not exist yet (or the import path is unresolved).

- [ ] **Step 4: Wire `bucketingFromPath` into `ingestPixelmatch` and widen `VisualResultFile`**

In `apps/dashboard/scripts/ingest-pixelmatch.ts`:

a. Add `scenario?: string` to the `VisualResultFile` interface (currently lines 19-33):

```ts
interface VisualResultFile {
  feature?: string;
  snapshotId?: string;
  platform?: string;
  viewport?: string;
  market?: string;
  language?: string;
  scenario?: string;
  status?: string;
  passed?: boolean;
  diffPixels?: number;
  totalPixels?: number;
  diffRatio?: number;
  baselinePath?: string;
  actualPath?: string;
  diffPath?: string;
  errorMessage?: string | null;
}
```

b. Inside the `for (const resultPath of resultPaths)` loop in `ingestPixelmatch`, just before `diffs.push({ ... })` (currently line 167), compute:

```ts
const bucketing = bucketingFromPath(visualRunDir, resultPath);
const triggeredBy = data.scenario && data.feature
  ? { feature: data.feature, scenario: data.scenario, runId: opts.dashboardRunId }
  : undefined;
```

c. Add the new fields to the pushed diff:

```ts
diffs.push({
  name: nameForResult(visualRunDir, resultPath, data),
  baseline: key,
  diffPct: +((data.diffRatio ?? 0) * 100).toFixed(2),
  status,
  images: {
    baseline: `/reports/${encodeURIComponent(opts.dashboardRunId)}/pixelmatch/${key}-baseline.png`,
    actual:   `/reports/${encodeURIComponent(opts.dashboardRunId)}/pixelmatch/${key}-actual.png`,
    diff:     `/reports/${encodeURIComponent(opts.dashboardRunId)}/pixelmatch/${key}-diff.png`,
  },
  bucketing,
  ...(triggeredBy ? { triggeredBy } : {}),
});
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `pnpm --filter dashboard test test/ingest/pixelmatch.test.ts`
Expected: All three tests PASS.

- [ ] **Step 6: Run the full suite**

Run: `pnpm --filter dashboard test`
Expected: All tests PASS.

- [ ] **Step 7: Stage and propose commit**

```bash
git add apps/dashboard/scripts/ingest-pixelmatch.ts apps/dashboard/test/ingest/pixelmatch.test.ts
```

Proposed commit message: `feat(dashboard/ingest): extract pixelmatch bucketing from result path; accept scenario backlink`.

---

## Task 5: Pixelmatch plugin persists `scenario` into `result.json`

**Files:**
- Modify: `src/plugins/pixelmatch/actions/visual-target-options.ts`
- Modify: `src/plugins/pixelmatch/support/visual-result.types.ts`
- Modify: `src/plugins/pixelmatch/actions/CompareSnapshot.ts`

> Sequential — all three files share the `VisualComparisonResult` schema. Single subagent (or main session) writes the trio.

- [ ] **Step 1: Add `scenario?` to the parsed visual target options**

In `src/plugins/pixelmatch/actions/visual-target-options.ts`, extend the `VisualTargetOptions` interface and the parser:

```ts
export interface VisualTargetOptions {
    feature: string;
    snapshotId: string;
    platform: string;
    viewport: string;
    market?: string;
    language?: string;
    /** BDD scenario name (pickle.name) that triggered the snapshot. Threaded through for dashboard backlinks. */
    scenario?: string;
    saveActualOnly: boolean;
    updateReason: string | null;
    raw: Record<string, unknown>;
}

export function parseVisualTarget(target: string): VisualTargetOptions {
    const { feature, endpointId: snapshotId, variables } = parseContractTarget(target);

    const platform = String(variables.platform ?? process.env.PLATFORM ?? 'web').toLowerCase();
    const viewport = String(variables.viewport ?? process.env.VIEWPORT ?? (platform === 'web' ? 'desktop' : 'mobile')).toLowerCase();
    const market = typeof variables.market === 'string' && variables.market.length > 0 ? variables.market.toLowerCase() : undefined;
    const language = typeof variables.language === 'string' && variables.language.length > 0 ? variables.language.toLowerCase() : undefined;
    const scenario = typeof variables.scenario === 'string' && variables.scenario.length > 0 ? variables.scenario : undefined;

    return {
        feature, snapshotId, platform, viewport, market, language, scenario,
        saveActualOnly: variables.saveActualOnly === true,
        updateReason: typeof variables.updateReason === 'string' ? variables.updateReason : null,
        raw: variables,
    };
}
```

- [ ] **Step 2: Add `scenario?: string` to `VisualComparisonResult`**

In `src/plugins/pixelmatch/support/visual-result.types.ts`, extend the interface:

```ts
export interface VisualComparisonResult {
    feature: string;
    snapshotId: string;
    /** BDD scenario (pickle.name) that triggered this snapshot, when provided by the caller. */
    scenario?: string;
    regionRef: string;
    // ...rest unchanged...
}
```

- [ ] **Step 3: Persist `opts.scenario` into the result object in `CompareSnapshot.ts`**

In `src/plugins/pixelmatch/actions/CompareSnapshot.ts`, in the `execute` method (around line 50 where the `result` object is initialized), add `scenario` to the initial result construction:

```ts
const result: VisualComparisonResult = {
    feature: opts.feature,
    snapshotId: opts.snapshotId,
    ...(opts.scenario ? { scenario: opts.scenario } : {}),
    regionRef: snapshot.regionRef,
    // ...rest unchanged...
};
```

The conditional spread keeps the result.json clean — the `scenario` key only appears when the caller supplied it.

- [ ] **Step 4: Manual sanity check the parse path**

There are no Vitest tests for the plugin in this repo (the framework uses cucumber). Run the TypeScript compile to confirm the trio compiles:

```bash
pnpm --filter dashboard typecheck   # types.ts is shared via the dashboard's path aliases
npx tsc --noEmit                    # full repo typecheck
```

Expected: zero errors.

- [ ] **Step 5: Stage and propose commit**

```bash
git add src/plugins/pixelmatch/actions/visual-target-options.ts \
        src/plugins/pixelmatch/support/visual-result.types.ts \
        src/plugins/pixelmatch/actions/CompareSnapshot.ts
```

Proposed commit message: `feat(pixelmatch): thread scenario name through COMPARE_SNAPSHOT into result.json`.

---

## Task 6: Visual hooks thread `pickle.name` through the COMPARE_SNAPSHOT intent

**Files:**
- Modify: `src/core/tests/catalog/step_definitions/visual.hooks.ts`
- Modify: `src/core/tests/checkout/step_definitions/visual.hooks.ts`
- Modify: `src/core/tests/login/step_definitions/visual.hooks.ts`
- Modify: `src/core/tests/navbar/step_definitions/visual.hooks.ts`
- Modify: `src/core/tests/order_success/step_definitions/visual.hooks.ts`
- Modify: `src/core/tests/pizzaBuilder/step_definitions/visual.hooks.ts`
- Modify: `src/core/tests/profile/step_definitions/visual.hooks.ts`

> One identical edit applied to seven near-identical files. Best done by one subagent in a single pass, NOT seven parallel subagents — minimizes drift.

- [ ] **Step 1: Locate the bucket construction in each hook**

In each of the seven files, find the block that builds `bucket` (look for `const bucket: Record<string, string> = {}` followed by `if (market) bucket.market = market;` and `if (language) bucket.language = language;`).

- [ ] **Step 2: Add the scenario line after the language assignment**

After the existing `if (language) bucket.language = language;` line, add:

```ts
if (pickle.name) bucket.scenario = pickle.name;
```

`pickle` is already destructured from the `After` callback's first parameter in every file, so no new imports are required.

- [ ] **Step 3: Sanity check — typecheck the repo**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Sanity check — run one feature locally to confirm `scenario` lands in result.json**

(Optional — gated on having a working local stack; skip if proxy/plugins aren't running.)

```bash
PLUGIN_PIXELMATCH=true pnpm run proxy   # in terminal 1
PLUGIN_PIXELMATCH=true pnpm run plugins # in terminal 2
./node_modules/.bin/cucumber-js src/core/tests/catalog/features/browse-catalog.feature --tags "@visual"
```

Expected: a fresh `visual-results/tom-<timestamp>/catalog/.../result.json` contains `"scenario": "<scenario name>"`.

- [ ] **Step 5: Stage and propose commit**

```bash
git add src/core/tests/catalog/step_definitions/visual.hooks.ts \
        src/core/tests/checkout/step_definitions/visual.hooks.ts \
        src/core/tests/login/step_definitions/visual.hooks.ts \
        src/core/tests/navbar/step_definitions/visual.hooks.ts \
        src/core/tests/order_success/step_definitions/visual.hooks.ts \
        src/core/tests/pizzaBuilder/step_definitions/visual.hooks.ts \
        src/core/tests/profile/step_definitions/visual.hooks.ts
```

Proposed commit message: `feat(visual-hooks): thread pickle.name through COMPARE_SNAPSHOT bucket`.

---

## Task 7: Adapter pass-through tests assert the new optional fields survive

**Files:**
- Modify: `apps/dashboard/test/adapters/playwright.test.ts`
- Modify: `apps/dashboard/test/adapters/api.test.ts`
- Modify: `apps/dashboard/test/adapters/appium.test.ts`
- Modify: `apps/dashboard/test/adapters/pixelmatch.test.ts`

> Small, mechanical extensions to existing tests. One subagent.

- [ ] **Step 1: Add a `steps` field to one of the test fixtures in `playwright.test.ts`**

Add a `steps` array to the failing test in the fixture:

```ts
tests: [
  { name: 'login', suite: 'Auth', file: 'auth.spec.ts', dur: '1s', status: 'passed' },
  {
    name: 'logout', suite: 'Auth', file: 'auth.spec.ts', dur: '1s', status: 'failed', error: 'boom',
    steps: [
      { keyword: 'Given ', name: 'logged in user', status: 'passed', dur: '300ms' },
      { keyword: 'When ', name: 'clicks logout',   status: 'failed', dur: '700ms', error: 'boom' },
    ],
    failedStepIndex: 1,
  },
],
```

Add an assertion:

```ts
expect(out.tests[1].steps).toHaveLength(2);
expect(out.tests[1].failedStepIndex).toBe(1);
expect(out.tests[1].steps?.[1].error).toBe('boom');
```

- [ ] **Step 2: Mirror the change in `api.test.ts` and `appium.test.ts`**

Same pattern — at least one fixture test has populated `steps[]` and `failedStepIndex`, and the assertions verify they survive the pass-through. For `appium.test.ts`, do this in each platform block (android + ios).

- [ ] **Step 3: Extend `pixelmatch.test.ts` with bucketing + triggeredBy assertions**

Add a fixture with the new fields and assert they round-trip:

```ts
it('passes through bucketing chips and triggeredBy backlink', () => {
  const out = pixelmatchAdapter(
    {
      ...fixture,
      diffs: [
        {
          name: 'Hero', baseline: 'pricing-hero', diffPct: 0.04, status: 'passed',
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
```

- [ ] **Step 4: Run the full Vitest suite**

Run: `pnpm --filter dashboard test`
Expected: all tests PASS.

- [ ] **Step 5: Stage and propose commit**

```bash
git add apps/dashboard/test/adapters/playwright.test.ts \
        apps/dashboard/test/adapters/api.test.ts \
        apps/dashboard/test/adapters/appium.test.ts \
        apps/dashboard/test/adapters/pixelmatch.test.ts
```

Proposed commit message: `test(dashboard/adapters): assert new steps + bucketing + triggeredBy fields survive`.

---

## Task 8: Set up RTL + jsdom and ship the `StepList` component

**Files:**
- Modify: `apps/dashboard/package.json`
- Modify: `apps/dashboard/vitest.config.ts`
- Create: `apps/dashboard/test/setup.ts`
- Create: `apps/dashboard/src/client/components/StepList.tsx`
- Create: `apps/dashboard/test/components/StepList.test.tsx`
- Modify: `apps/dashboard/src/client/styles/styles.css`

> **First UI task.** Sets up the RTL infrastructure that Task 9 will reuse. Subsequent UI tasks (9, 10, 11) can parallelize once this lands.

- [ ] **Step 1: Add RTL + jsdom dev dependencies**

Run from the repo root (workspace-aware):

```bash
pnpm add -D --filter dashboard @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Expected: `apps/dashboard/package.json` gains the four packages under `devDependencies`.

- [ ] **Step 2: Configure Vitest to use jsdom for component tests**

Read the existing config:

```bash
cat apps/dashboard/vitest.config.ts
```

Then update it so it runs jsdom for files under `test/components/` and node for the rest. Replace the existing `defineConfig({ ... })` with:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared':  path.resolve(__dirname, 'src/shared'),
      '@server':  path.resolve(__dirname, 'src/server'),
      '@client':  path.resolve(__dirname, 'src/client'),
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['test/components/**', 'jsdom']],
    setupFiles: ['test/setup.ts'],
  },
});
```

(If the existing config defines additional fields, preserve them and merge.)

- [ ] **Step 3: Add `test/setup.ts`**

Create `apps/dashboard/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Write the failing component test**

Create `apps/dashboard/test/components/StepList.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StepList } from '../../src/client/components/StepList';
import type { TestStep } from '../../src/shared/types';

const steps: TestStep[] = [
  { keyword: 'Given ', name: 'a fresh user',     status: 'passed', dur: '120ms' },
  { keyword: 'When ',  name: 'they hit submit',  status: 'failed', dur: '480ms', error: 'AssertionError: missing button' },
  { keyword: 'Then ',  name: 'they see results', status: 'skipped', dur: '0ms' },
];

describe('StepList', () => {
  it('renders each step with its keyword and name', () => {
    render(<StepList steps={steps} failedStepIndex={1} />);
    expect(screen.getByText(/a fresh user/)).toBeInTheDocument();
    expect(screen.getByText(/they hit submit/)).toBeInTheDocument();
    expect(screen.getByText(/they see results/)).toBeInTheDocument();
  });

  it('marks the failed step with .step-failed and renders the error inline', () => {
    render(<StepList steps={steps} failedStepIndex={1} />);
    const failed = screen.getByText(/they hit submit/).closest('.step');
    expect(failed).toHaveClass('step-failed');
    expect(screen.getByText(/AssertionError: missing button/)).toBeInTheDocument();
  });

  it('marks hidden hooks with .step-hook and prefixes with the hook icon', () => {
    const hookSteps: TestStep[] = [
      { keyword: 'After', name: '', status: 'failed', dur: '40ms', hidden: true, error: 'cleanup blew up' },
    ];
    render(<StepList steps={hookSteps} failedStepIndex={0} />);
    expect(screen.getByText(/cleanup blew up/)).toBeInTheDocument();
    expect(document.querySelector('.step-hook')).not.toBeNull();
  });

  it('shows a placeholder when steps is undefined', () => {
    render(<StepList />);
    expect(screen.getByText(/no step data/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the failing test**

Run: `pnpm --filter dashboard test test/components/StepList.test.tsx`
Expected: FAIL — module not found at `../../src/client/components/StepList`.

- [ ] **Step 6: Implement `StepList`**

Create `apps/dashboard/src/client/components/StepList.tsx`:

```tsx
import type { TestStep } from '@shared/types';

interface StepListProps {
  steps?: TestStep[];
  failedStepIndex?: number;
}

const STATUS_ICON: Record<TestStep['status'], string> = {
  passed: '○',
  failed: '✕',
  skipped: '◐',
};

export function StepList({ steps, failedStepIndex }: StepListProps) {
  if (!steps || steps.length === 0) {
    return <div className="empty">No step data captured for this run.</div>;
  }

  return (
    <ol className="step-list">
      {steps.map((s, i) => {
        const isFailed = i === failedStepIndex;
        const classes = ['step'];
        if (isFailed) classes.push('step-failed');
        if (s.status === 'skipped' && !isFailed) classes.push('step-skipped');
        if (s.hidden) classes.push('step-hook');
        return (
          <li className={classes.join(' ')} key={i}>
            <span className="step-icon">{s.hidden ? '🪝' : STATUS_ICON[s.status]}</span>
            <span className="step-text">
              <strong className="step-keyword">{s.keyword}</strong>
              <span className="step-name">{s.name}</span>
            </span>
            {s.location && <span className="step-location">{s.location}</span>}
            <span className="step-dur">{s.dur}</span>
            {isFailed && s.error && (
              <pre className="step-error">{s.error}</pre>
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 7: Run the test and verify it passes**

Run: `pnpm --filter dashboard test test/components/StepList.test.tsx`
Expected: all four tests PASS.

- [ ] **Step 8: Add the corresponding CSS rules**

Append to `apps/dashboard/src/client/styles/styles.css`:

```css
.step-list { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-direction: column; gap: 4px; }
.step { display: grid; grid-template-columns: 24px 1fr auto auto; gap: 12px; align-items: baseline; padding: 6px 12px; border-radius: 6px; background: var(--surface-2, rgba(255,255,255,0.02)); }
.step-icon { font-family: var(--mono); }
.step-keyword { font-weight: 600; margin-right: 4px; }
.step-name { color: var(--text); }
.step-location { font-family: var(--mono); font-size: 11px; color: var(--text-mute); }
.step-dur { font-family: var(--mono); font-size: 11.5px; color: var(--text-mute); }
.step-failed { background: oklch(0.32 0.08 25 / 0.25); }
.step-failed .step-name { color: oklch(0.85 0.15 25); }
.step-skipped .step-name { color: var(--text-mute); font-style: italic; }
.step-hook .step-keyword { color: var(--text-mute); font-style: italic; }
.step-error { grid-column: 1 / -1; margin: 6px 0 0; padding: 8px 10px; background: rgba(0,0,0,0.3); border-left: 2px solid oklch(0.6 0.18 25); border-radius: 4px; white-space: pre-wrap; font-size: 12px; }
```

- [ ] **Step 9: Run the full Vitest suite**

Run: `pnpm --filter dashboard test`
Expected: all tests PASS.

- [ ] **Step 10: Stage and propose commit**

```bash
git add apps/dashboard/package.json \
        apps/dashboard/vitest.config.ts \
        apps/dashboard/test/setup.ts \
        apps/dashboard/src/client/components/StepList.tsx \
        apps/dashboard/test/components/StepList.test.tsx \
        apps/dashboard/src/client/styles/styles.css \
        pnpm-lock.yaml
```

Proposed commit message: `feat(dashboard): add StepList component + RTL/jsdom test setup`.

---

## Task 9: Convert `TestList` into an accordion that auto-expands failures

**Files:**
- Modify: `apps/dashboard/src/client/components/TestList.tsx`
- Create: `apps/dashboard/test/components/TestList.test.tsx`
- Modify: `apps/dashboard/src/client/styles/styles.css`

> Parallel with Tasks 10 and 11 — different files.

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/test/components/TestList.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TestList } from '../../src/client/components/TestList';
import type { TestCase } from '../../src/shared/types';

const tests: TestCase[] = [
  {
    name: 'happy path', suite: 'Auth', file: 'auth.feature', dur: '500ms', status: 'passed',
    steps: [{ keyword: 'Given ', name: 'preconditions', status: 'passed', dur: '200ms' }],
  },
  {
    name: 'broken path', suite: 'Auth', file: 'auth.feature', dur: '900ms', status: 'failed', error: 'boom',
    steps: [
      { keyword: 'Given ', name: 'preconditions', status: 'passed', dur: '200ms' },
      { keyword: 'When ',  name: 'broken action', status: 'failed', dur: '700ms', error: 'boom' },
    ],
    failedStepIndex: 1,
  },
];

describe('TestList accordion', () => {
  it('auto-expands failed scenarios on first render', () => {
    render(<TestList tests={tests} filter="all" query="" />);
    expect(screen.getByText(/broken action/)).toBeInTheDocument();
    expect(screen.queryByText(/preconditions/)).not.toBeNull(); // visible because failing one expanded
  });

  it('keeps passed scenarios collapsed by default', () => {
    render(<TestList tests={[tests[0]]} filter="all" query="" />);
    expect(screen.queryByText(/preconditions/)).toBeNull();
  });

  it('toggles expansion on click', () => {
    render(<TestList tests={[tests[0]]} filter="all" query="" />);
    fireEvent.click(screen.getByText(/happy path/));
    expect(screen.getByText(/preconditions/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/happy path/));
    expect(screen.queryByText(/preconditions/)).toBeNull();
  });

  it('seeds expansion from the expandScenarioName prop', () => {
    render(<TestList tests={tests} filter="all" query="" expandScenarioName="happy path" />);
    // Both the auto-expanded failed AND the deep-linked passed scenario render their step content.
    expect(screen.getByText(/preconditions/)).toBeInTheDocument();
    expect(screen.getByText(/broken action/)).toBeInTheDocument();
  });

  it('falls back to scenario-level error when steps[] is absent', () => {
    const legacy: TestCase[] = [
      { name: 'old test', suite: 'Auth', file: 'auth.feature', dur: '100ms', status: 'failed', error: 'legacy boom' },
    ];
    render(<TestList tests={legacy} filter="all" query="" />);
    expect(screen.getByText(/legacy boom/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter dashboard test test/components/TestList.test.tsx`
Expected: FAIL — no accordion behavior yet; `expandScenarioName` is not a known prop.

- [ ] **Step 3: Rewrite `TestList.tsx` as an accordion**

Replace the entire body of `apps/dashboard/src/client/components/TestList.tsx`:

```tsx
import { useMemo, useState, useEffect } from 'react';

import type { TestCase } from '@shared/types';
import { StepList } from './StepList';
import type { TestFilter } from './FilterBar';

interface TestListProps {
  tests: TestCase[];
  filter: TestFilter;
  query: string;
  /** When set, the row whose `name` matches starts expanded in addition to the auto-expanded failed rows. */
  expandScenarioName?: string | null;
}

const keyOf = (t: TestCase, i: number) => `${t.file}:${t.name}:${i}`;

export function TestList({ tests, filter, query, expandScenarioName }: TestListProps) {
  const q = query.toLowerCase();
  const filtered = tests
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (q && !`${t.name} ${t.suite} ${t.file}`.toLowerCase().includes(q)) return false;
      return true;
    });

  const initial = useMemo(() => {
    const set = new Set<string>();
    tests.forEach((t, i) => {
      if (t.status === 'failed') set.add(keyOf(t, i));
      if (expandScenarioName && t.name === expandScenarioName) set.add(keyOf(t, i));
    });
    return set;
  }, [tests, expandScenarioName]);

  const [expanded, setExpanded] = useState<Set<string>>(initial);

  // Reseed when the test set or the deep-link target changes.
  useEffect(() => { setExpanded(initial); }, [initial]);

  if (!filtered.length) {
    return <div className="empty">No tests match this filter.</div>;
  }

  const toggle = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  return (
    <div className="tests">
      {filtered.map(({ t, i }) => {
        const k = keyOf(t, i);
        const isOpen = expanded.has(k);
        return (
          <div className="test-row-group" key={k}>
            <button
              type="button"
              className={`test-row test-row-toggle${isOpen ? ' is-open' : ''}`}
              aria-expanded={isOpen}
              onClick={() => toggle(k)}
            >
              <span className={'icon-dot ' + t.status} />
              <div>
                <div className="name">{t.name}</div>
                <div className="file">{t.file}</div>
              </div>
              <div className="suite">{t.suite}</div>
              <div className="dur">{t.dur}</div>
              <div>
                <span className={'test-status ' + t.status}>{t.status}</span>
              </div>
              <span className="chev">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="test-row-body">
                {t.steps && t.steps.length > 0
                  ? <StepList steps={t.steps} failedStepIndex={t.failedStepIndex} />
                  : t.error
                    ? <pre className="failure">{t.error}</pre>
                    : <div className="empty">No step data captured for this run.</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Append accordion CSS rules**

Append to `apps/dashboard/src/client/styles/styles.css`:

```css
.test-row-group { border-radius: 8px; overflow: hidden; }
.test-row-toggle { display: grid; grid-template-columns: 18px 1fr auto auto auto 14px; gap: 16px; align-items: center; width: 100%; padding: 12px 16px; background: var(--surface-2, transparent); border: 0; cursor: pointer; text-align: left; color: inherit; font: inherit; }
.test-row-toggle:hover { background: oklch(0.96 0.02 290 / 0.04); }
.test-row-toggle.is-open { background: oklch(0.96 0.02 290 / 0.06); }
.test-row-body { padding: 0 16px 14px 50px; }
.chev { font-family: var(--mono); color: var(--text-mute); }
```

- [ ] **Step 5: Run the failing test → passing**

Run: `pnpm --filter dashboard test test/components/TestList.test.tsx`
Expected: all five tests PASS.

- [ ] **Step 6: Run the full suite**

Run: `pnpm --filter dashboard test`
Expected: all tests PASS.

- [ ] **Step 7: Stage and propose commit**

```bash
git add apps/dashboard/src/client/components/TestList.tsx \
        apps/dashboard/test/components/TestList.test.tsx \
        apps/dashboard/src/client/styles/styles.css
```

Proposed commit message: `feat(dashboard): TestList becomes an accordion that auto-expands failed scenarios`.

---

## Task 10: GenericDetail reads `?expand=` and forwards to TestList

**Files:**
- Modify: `apps/dashboard/src/client/views/detail/GenericDetail.tsx`

> Parallel with Tasks 9 and 11.

- [ ] **Step 1: Update `GenericDetail.tsx` to consume the query param**

Replace the imports + return JSX block in `apps/dashboard/src/client/views/detail/GenericDetail.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { Tool } from '@shared/types';
import { DetailHead } from '../../components/DetailHead';
import { FilterBar, type TestFilter } from '../../components/FilterBar';
import { KpiStrip } from '../../components/KpiStrip';
import { TestList } from '../../components/TestList';

// ...inside `export function GenericDetail(...)`, after the existing kind guard...

const [searchParams] = useSearchParams();
const expandScenarioName = searchParams.get('expand');
```

In the JSX, pass the prop to `<TestList>`:

```tsx
<TestList
  tests={tests}
  filter={filter}
  query={query}
  expandScenarioName={expandScenarioName}
/>
```

- [ ] **Step 2: Verify the route still mounts (smoke check)**

Run: `pnpm --filter dashboard typecheck`
Expected: zero errors.

If the project's `MobileDetail.tsx` also renders `TestList`, mirror the same prop wiring there — open the file with `cat apps/dashboard/src/client/views/detail/MobileDetail.tsx` and add `expandScenarioName` next to the existing TestList usage, if any.

- [ ] **Step 3: Stage and propose commit**

```bash
git add apps/dashboard/src/client/views/detail/GenericDetail.tsx
# include MobileDetail.tsx if it was modified
```

Proposed commit message: `feat(dashboard): deep-link ?expand=<scenario> seeds TestList accordion expansion`.

---

## Task 11: PerformanceDetail renders simulation accordion cards

**Files:**
- Modify: `apps/dashboard/src/client/views/detail/PerformanceDetail.tsx`
- Modify: `apps/dashboard/src/client/styles/styles.css`

> Parallel with Tasks 9 and 10.

- [ ] **Step 1: Replace the flat scenarios block with simulation cards**

In `apps/dashboard/src/client/views/detail/PerformanceDetail.tsx`, replace the existing `<div className="panel"><h3>Scenarios</h3>...</div>` block (currently lines 118-136) with:

```tsx
<div className="panel">
  <h3>Simulations</h3>
  <div className="sim-list">
    {p.scenarios.map((sim, i) => (
      <SimulationCard key={i} sim={sim} />
    ))}
  </div>
</div>
```

Add the helper component at the bottom of the same file (a local helper, not exported, so it's co-located with its only caller):

```tsx
import { useState } from 'react';
import type { PerfScenario } from '@shared/types';

function SimulationCard({ sim }: { sim: PerfScenario }) {
  const [open, setOpen] = useState(sim.errors > 0);
  const hasSteps = Boolean(sim.steps && sim.steps.length);
  return (
    <div className={`scenario-card${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="scenario-card-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={'icon-dot ' + (sim.errors > 1 ? 'failed' : sim.errors > 0.3 ? 'skipped' : 'passed')} />
        <span className="name">{sim.name}</span>
        <span className="meta">{sim.rps} rps · p95 {sim.p95}ms · err {sim.errors}%</span>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && hasSteps && (
        <div className="scenario-card-body">
          <table className="sim-steps">
            <thead>
              <tr><th>Step</th><th>RPS</th><th>P95 (ms)</th><th>%KO</th></tr>
            </thead>
            <tbody>
              {[...(sim.steps ?? [])].sort((a, b) => b.errors - a.errors).map((s, i) => (
                <tr key={i} className={s.errors > 0 ? 'sim-step-bad' : undefined}>
                  <td>{s.name}</td>
                  <td>{s.rps}</td>
                  <td>{s.p95}</td>
                  <td>{s.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && !hasSteps && (
        <div className="scenario-card-body empty">No per-request breakdown available.</div>
      )}
    </div>
  );
}
```

(If the import structure for `useState` is already present at the top of the file, don't duplicate it — merge the import.)

- [ ] **Step 2: Add the CSS**

Append to `apps/dashboard/src/client/styles/styles.css`:

```css
.sim-list { display: flex; flex-direction: column; gap: 8px; }
.scenario-card { border: 1px solid var(--border, rgba(255,255,255,0.06)); border-radius: 8px; background: var(--surface-2, transparent); overflow: hidden; }
.scenario-card-head { display: grid; grid-template-columns: 18px 1fr auto 14px; gap: 14px; align-items: center; width: 100%; padding: 12px 14px; background: transparent; border: 0; cursor: pointer; text-align: left; color: inherit; font: inherit; }
.scenario-card-head .name { font-weight: 600; }
.scenario-card-head .meta { color: var(--text-mute); font-family: var(--mono); font-size: 12px; }
.scenario-card-body { padding: 10px 14px 14px; }
.sim-steps { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 12px; }
.sim-steps th, .sim-steps td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border, rgba(255,255,255,0.04)); }
.sim-step-bad { color: oklch(0.78 0.18 25); }
```

- [ ] **Step 3: Typecheck and run tests**

Run: `pnpm --filter dashboard typecheck && pnpm --filter dashboard test`
Expected: zero errors / all tests PASS.

- [ ] **Step 4: Stage and propose commit**

```bash
git add apps/dashboard/src/client/views/detail/PerformanceDetail.tsx \
        apps/dashboard/src/client/styles/styles.css
```

Proposed commit message: `feat(dashboard): PerformanceDetail renders simulation accordion with per-request steps`.

---

## Task 12: VisualDetail shows bucketing chips and the triggeredBy backlink

**Files:**
- Modify: `apps/dashboard/src/client/views/detail/VisualDetail.tsx`
- Modify: `apps/dashboard/src/client/styles/styles.css`

> Parallel with Tasks 9, 10, 11.

- [ ] **Step 1: Render chips + backlink inside each diff row**

In `apps/dashboard/src/client/views/detail/VisualDetail.tsx`, add the import at the top:

```tsx
import { Link } from 'react-router-dom';
```

Then replace the `diff-row-head` block inside the `filtered.map` (currently lines 121-132) with:

```tsx
<div className="diff-row" key={d.baseline}>
  <div className="diff-row-head">
    <div>
      <div className="name">{d.name}</div>
      <div className="meta">
        {d.baseline}.png · {d.status === 'passed' ? 'within tolerance' : 'exceeds threshold'}
      </div>
      {d.bucketing && (
        <div className="chips">
          {d.bucketing.market    && <span className="chip chip-market">{d.bucketing.market}</span>}
          {d.bucketing.language  && <span className="chip chip-language">{d.bucketing.language}</span>}
          {d.bucketing.viewport  && <span className="chip chip-viewport">{d.bucketing.viewport}</span>}
          {d.bucketing.platform  && <span className="chip chip-platform">{d.bucketing.platform}</span>}
        </div>
      )}
      {d.triggeredBy && d.triggeredBy.runId && (
        <div className="triggered-by">
          <Link to={`/runs/${d.triggeredBy.runId}/tools/playwright?expand=${encodeURIComponent(d.triggeredBy.scenario)}`}>
            📍 {d.triggeredBy.scenario} in {d.triggeredBy.feature}
          </Link>
        </div>
      )}
    </div>
    <span className={'delta ' + (d.status === 'passed' ? 'ok' : 'bad')}>
      Δ {d.diffPct.toFixed(2)}%
    </span>
  </div>
  <DiffTriplet images={d.images} />
</div>
```

- [ ] **Step 2: Append chip + backlink CSS**

Append to `apps/dashboard/src/client/styles/styles.css`:

```css
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.chip { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-family: var(--mono); font-size: 11px; font-weight: 600; border: 1px solid currentColor; }
.chip-market   { color: oklch(0.78 0.14 300); }
.chip-language { color: oklch(0.78 0.14 220); }
.chip-viewport { color: oklch(0.78 0.14 150); }
.chip-platform { color: oklch(0.78 0.14 60);  }
.triggered-by { margin-top: 6px; font-size: 12px; }
.triggered-by a { color: oklch(0.82 0.14 300); text-decoration: none; }
.triggered-by a:hover { text-decoration: underline; }
```

- [ ] **Step 3: Typecheck and run tests**

Run: `pnpm --filter dashboard typecheck && pnpm --filter dashboard test`
Expected: zero errors / all tests PASS.

- [ ] **Step 4: Stage and propose commit**

```bash
git add apps/dashboard/src/client/views/detail/VisualDetail.tsx \
        apps/dashboard/src/client/styles/styles.css
```

Proposed commit message: `feat(dashboard): VisualDetail shows bucketing chips + scenario backlink`.

---

## Task 13: Refresh demo fixtures so the dashboard shows the new behavior

**Files:**
- Modify: `apps/dashboard/scripts/generate-fixtures.ts`

- [ ] **Step 1: Read the current generator**

```bash
cat apps/dashboard/scripts/generate-fixtures.ts
```

Read enough to find where each tool's fixture is constructed (look for the `tests:` arrays for web_ui / api / mobile_ui, the `perf.scenarios` array, and the visual `diffs`).

- [ ] **Step 2: Add `steps[]` and `failedStepIndex` to at least one passed and one failed scenario per cucumber-backed tool**

For each fixture's `tests:` array, ensure at least one entry has populated steps. Example (apply equivalently to the web_ui, api, and both mobile platform fixtures):

```ts
{
  name: 'Checkout completes for US/en — Example row 1',
  suite: 'Checkout',
  file: 'src/core/tests/checkout/features/place-delivery-order.feature',
  dur: '4.2s',
  status: 'passed',
  steps: [
    { keyword: 'Given ', name: 'a US/en customer', status: 'passed', dur: '120ms', location: 'src/core/tests/checkout/step_definitions/checkout.steps.ts:15' },
    { keyword: 'When ',  name: 'they place a delivery order', status: 'passed', dur: '3.9s', location: 'src/core/tests/checkout/step_definitions/checkout.steps.ts:42' },
    { keyword: 'Then ',  name: 'the order success screen is shown', status: 'passed', dur: '180ms', location: 'src/core/tests/order_success/step_definitions/order.steps.ts:8' },
  ],
},
{
  name: 'Checkout completes for MX/es — Example row 2',
  suite: 'Checkout',
  file: 'src/core/tests/checkout/features/place-delivery-order.feature',
  dur: '5.1s',
  status: 'failed',
  error: 'Expected order ID to match /^OMNI-MX-/',
  failedStepIndex: 1,
  steps: [
    { keyword: 'Given ', name: 'a MX/es customer', status: 'passed', dur: '150ms', location: 'src/core/tests/checkout/step_definitions/checkout.steps.ts:15' },
    { keyword: 'When ',  name: 'they place a delivery order', status: 'failed', dur: '4.9s', location: 'src/core/tests/checkout/step_definitions/checkout.steps.ts:42', error: 'Expected order ID to match /^OMNI-MX-/' },
    { keyword: 'Then ',  name: 'the order success screen is shown', status: 'skipped', dur: '0ms' },
  ],
},
```

This pair gives the dashboard demo a clear "Scenario Outline iteration that failed" story.

- [ ] **Step 3: Update the perf fixture to use the simulation→steps shape**

Replace any existing `perf.scenarios: [...]` block in the generator with:

```ts
perf: {
  // ...rps/avgMs/p95Ms/p99Ms/errorRate/requests/maxRps/distribution unchanged...
  scenarios: [
    {
      name: 'checkout-load',
      rps: 120,
      p95: 350,
      errors: 0.4,
      steps: [
        { name: 'home',      rps: 40, p95: 180, errors: 0   },
        { name: 'login',     rps: 35, p95: 240, errors: 0.1 },
        { name: 'addToCart', rps: 25, p95: 410, errors: 1.0 },
        { name: 'checkout',  rps: 20, p95: 520, errors: 0.8 },
      ],
    },
    {
      name: 'catalog-load',
      rps: 80,
      p95: 220,
      errors: 0,
      steps: [
        { name: 'home',   rps: 50, p95: 180, errors: 0 },
        { name: 'search', rps: 30, p95: 260, errors: 0 },
      ],
    },
  ],
},
```

- [ ] **Step 4: Add `bucketing` and a sample `triggeredBy` to at least two pixelmatch diffs**

Replace any existing `diffs: [...]` block in the generator's pixelmatch fixture with entries like:

```ts
diffs: [
  {
    name: 'Catalog grid — US/en — desktop',
    baseline: 'catalog__catalog_screen__web__desktop__us__en',
    diffPct: 0.04,
    status: 'passed',
    bucketing: { feature: 'catalog', snapshot: 'catalog_screen', platform: 'web', viewport: 'desktop', market: 'us', language: 'en' },
    triggeredBy: { feature: 'catalog', scenario: 'Catalog renders in US/en', runId: '<RUN_ID>' },
  },
  {
    name: 'Checkout summary — MX/es — desktop',
    baseline: 'checkout__checkout_order_summary__web__desktop__mx__es',
    diffPct: 4.12,
    status: 'failed',
    bucketing: { feature: 'checkout', snapshot: 'checkout_order_summary', platform: 'web', viewport: 'desktop', market: 'mx', language: 'es' },
    triggeredBy: { feature: 'checkout', scenario: 'Checkout completes for MX/es — Example row 2', runId: '<RUN_ID>' },
  },
],
```

Replace `<RUN_ID>` with the actual variable the generator already uses for the run id (look for where `runId` / `buildId` is interpolated elsewhere in the file).

- [ ] **Step 5: Regenerate the fixtures**

Run: `pnpm dashboard:fixtures`
Expected: `reports/manifest.json` + 2 demo runs regenerated with the new fixture data; PNGs reused.

- [ ] **Step 6: Smoke check in the browser**

Run: `pnpm dashboard`
Open <http://localhost:5173>. Confirm:
- A web_ui scenario detail row shows the Given/When/Then list when expanded.
- The MX/es failed scenario is auto-expanded with the failed step highlighted and "Expected order ID..." inline.
- The Gatling detail shows two simulation cards; clicking `checkout-load` reveals the four request steps with `addToCart` and `checkout` flagged.
- The pixelmatch detail shows market/language/viewport chips and a clickable backlink that opens the Playwright detail with the named scenario expanded.

- [ ] **Step 7: Stage and propose commit**

```bash
git add apps/dashboard/scripts/generate-fixtures.ts
```

Proposed commit message: `chore(dashboard/fixtures): demonstrate steps, simulation accordion, and visual backlinks`.

---

## Task 14: Final smoke + manual verification

**Files:** none — this is a verification gate, not a code task.

- [ ] **Step 1: Run all gates one more time**

```bash
pnpm --filter dashboard typecheck
pnpm --filter dashboard test
pnpm --filter dashboard smoke   # requires `pnpm dashboard` running in another terminal
```

Expected: all three PASS.

- [ ] **Step 2: Manual checklist against the spec's Definition of Done**

Open <http://localhost:5173> and verify every bullet in `docs/superpowers/specs/2026-05-27-feature-steps-iteration-failure-design.md#definition-of-done`:

- [ ] Web_ui scenario expands to Given/When/Then list.
- [ ] Failed scenario shows the error under the *failed step*, not at the scenario header.
- [ ] Two Outline iterations — one passes (collapsed), one fails (auto-expanded with failed step highlighted).
- [ ] Gatling simulation card expands to per-request rows; high-error requests sort to the top.
- [ ] Pixelmatch diff shows chips for market/language/viewport/platform; clicking the backlink opens Playwright detail with the named scenario expanded.

- [ ] **Step 3: If everything looks correct, ask the user to do the final review and commit**

Surface the staged-but-uncommitted commits from earlier tasks and the spec/plan files. The user runs `git commit` themselves per their standing policy.

---

## Spec coverage self-check (post-write)

Spec section → Plan task:

| Spec | Task(s) |
|---|---|
| Data model — `TestStep`, `TestCase`+, `VisualDiff`+, `PerfScenario` restructure | Task 1 |
| Ingest — cucumber emits steps + failedStepIndex; hidden hook policy | Task 2 |
| Ingest — gatling simulation→steps hierarchy | Task 3 |
| Ingest — pixelmatch bucketing from path | Task 4 |
| Cross-package A — plugin persists scenario | Task 5 |
| Cross-package A — visual hooks thread pickle.name | Task 6 |
| Adapter pass-through tests | Task 7 |
| UI — StepList component + RTL infra | Task 8 |
| UI — TestList accordion (auto-expand failures, deep-link seed, legacy fallback) | Task 9 |
| UI — `?expand=` query param wiring | Task 10 |
| UI — PerformanceDetail simulation accordion | Task 11 |
| UI — VisualDetail chips + backlink | Task 12 |
| Fixtures regeneration | Task 13 |
| Smoke + DoD walk | Task 14 |

No spec requirement is left without a task. All steps include concrete code or commands — no "TBD" / "implement later" placeholders.
