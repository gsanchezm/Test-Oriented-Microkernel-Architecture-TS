# Feature steps + iteration-level failure reporting in the dashboard

**Date:** 2026-05-27
**Status:** Approved (brainstorming → spec)
**Author:** gsanchezm with Claude (Opus 4.7)

---

## Problem

Today the dashboard at `apps/dashboard/` renders each cucumber scenario as a
single row with a `status` and (on failure) a single `error` string. The
`ingestCucumber()` function in `apps/dashboard/scripts/ingest-run.ts:115-127`
walks per-step results but **collapses** them into one row, throwing away:

- The Given/When/Then step list and its durations.
- The location of the step definition that ran each step.
- Per-step error attribution — the report only knows "this scenario failed"
  with the first error message; it does not say *which step* failed.
- For Scenario Outlines: cucumber-js already emits one `element` per Example
  row with parameter substitution, but those rows look identical to the user
  and the report does not surface which iteration failed nor make the cause
  visible per row.

For Gatling, `perf.scenarios[]` is a flat list where each entry is
`<simulation> · <request>`. The simulation-level aggregate is parsed (from the
`ROOT` table row) but discarded.

For PixelMatch, each diff card shows the `name`, `diffPct`, and three images.
The user cannot tell from the dashboard which BDD scenario produced the
snapshot (the `@visual` After hook fires from a scenario but the hook does not
persist that origin), and the path-encoded bucketing (`market`, `language`,
`viewport`, `platform`) is flattened into a single string.

## Goals

1. Print the feature file steps (Given/When/Then + Before/After hooks when
   they fail) for every cucumber-backed scenario in the dashboard.
2. When a scenario fails, highlight the *step* that failed and place the
   error message inline at that step.
3. For Scenario Outline iterations, make per-row failure visible — the user
   can tell which iteration broke without opening the JSON.
4. For Gatling, mirror the same accordion mental model: each simulation is a
   row that expands to show its constituent requests (the "steps" of the
   simulation chain) with per-request RPS/P95/error%.
5. For PixelMatch, give each diff the context needed to triage:
   - **(A) Backlink** to the BDD scenario that triggered the snapshot, so the
     user can jump to that scenario's steps in the Playwright detail.
   - **(B) Bucketing chips** for market/language/viewport/platform so the
     dimension(s) that broke are visible at a glance.

## Non-goals

- No new HTML reporter — we extend the existing `apps/dashboard/` React + Vite
  + Express app. No standalone HTML output.
- Scenario Outlines are kept **flat** (one row per Example iteration, as
  cucumber-js emits them). No grouped/collapsed Outline parent row. The
  expanded Example values already live in the scenario `name` post-substitution.
- Pixelmatch does **not** get fake "steps". Visual failure context is the
  diff image itself plus the scenario backlink and bucketing chips. We do not
  invent a step-like narrative where there isn't one.
- No changes to the existing `pnpm test` cucumber-js pipeline beyond a
  one-field addition to the `@visual` hooks (for backlink A). Functional
  pass/fail signal is unaffected.
- No changes to the `Visual gate` CI step or the `update-visual-baselines.yml`
  workflow.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Target — dashboard or standalone HTML? | **Dashboard** (`apps/dashboard/`). |
| Step visualization | **Accordion**: failed scenarios auto-expand on first render; passed/skipped stay collapsed; click toggles. |
| Scenario Outline grouping | **Flat** — one row per Example iteration, as cucumber-js emits today. |
| Hidden hooks (Before/After) | **Show only when failed**. Hidden-but-passed hooks are filtered out of the step list. |
| Per-step detail | keyword, name, dur, status icon, location chip, inline error under the failed step. |
| Gatling | Simulation = row; expand to show request rows (the chain `exec(http(...))` items). |
| Pixelmatch | A + B combined — scenario backlink + bucketing chips. No invented steps. |

---

## Data model changes

File: `apps/dashboard/src/shared/types.ts`.

### `TestStep` (new)

```ts
export interface TestStep {
  keyword: string;       // "Given ", "When ", "Then ", "And ", "But ", "After", "Before"
  name: string;          // step text, post-Examples-substitution (cucumber-js already does it)
  status: Status;        // 'passed' | 'failed' | 'skipped'
  dur: string;           // human ("280ms", "1.2s") — reuses formatNs() helper from ingest-run.ts
  location?: string;     // "src/.../checkout.steps.ts:15" — from cucumber match.location
  error?: string;        // only set when status === 'failed' (from cucumber result.error_message)
  hidden?: boolean;      // true for cucumber-hidden hooks; only emitted when they failed
}
```

### `TestCase` (extended)

```ts
export interface TestCase {
  name: string;
  suite: string;
  file: string;
  dur: string;
  status: Status;
  error?: string;          // unchanged — first failing step's error (kept for back-compat)
  steps?: TestStep[];      // NEW — optional so legacy fixtures still parse
  failedStepIndex?: number; // NEW — index into steps[] of the first failed step (UI auto-scroll target)
}
```

Both new fields are optional so fixtures generated before this change keep
parsing — UI falls back to the existing scenario-level `error` rendering when
`steps` is absent.

### `VisualDiff` (extended)

```ts
export interface VisualDiff {
  name: string;
  baseline: string;
  diffPct: number;
  status: 'passed' | 'failed';
  images: VisualDiffImages;
  bucketing?: {                    // NEW (B) — chips
    feature?: string;
    snapshot?: string;
    platform?: string;
    viewport?: string;
    market?: string;
    language?: string;
  };
  triggeredBy?: {                  // NEW (A) — backlink to the BDD scenario
    feature: string;               // e.g. "browse-catalog"
    scenario: string;              // pickle.name
    runId?: string;                // dashboard runId, used to build the deep-link URL
  };
}
```

### `PerfBlock.scenarios` (restructured — small breaking change)

Today `perf.scenarios[]` is a flat list whose entries mix simulation+request
into `<sim> · <request>` strings. After the change, each entry represents a
simulation; per-request rows live in `steps[]`:

```ts
export interface PerfStep {
  name: string;       // e.g. "addToCart"
  rps: number;
  p95: number;
  errors: number;     // %KO for this request
}

export interface PerfScenario {     // one per Gatling simulation
  name: string;       // e.g. "checkout-load"
  rps: number;        // from the simulation's ROOT row
  p95: number;        // from ROOT
  errors: number;     // from ROOT (%KO)
  steps?: PerfStep[]; // per-request rows under this simulation
}
```

`PerfBlock`'s run-level fields (`rps`, `avgMs`, `p95Ms`, `p99Ms`, `errorRate`,
`requests`, `maxRps`, `distribution`) are unchanged — the existing
request-weighted roll-up logic in `ingest-gatling.ts` keeps working.

Impact: existing mock fixtures must be regenerated via
`pnpm dashboard:fixtures` so their `perf.scenarios` shape matches.

---

## Ingest changes

### `apps/dashboard/scripts/ingest-run.ts` — cucumber

In `ingestCucumber()` (currently lines 98-149):

1. Build `TestStep[]` as we walk `el.steps`:
   - `keyword`: `step.keyword ?? ''` (cucumber-js includes the trailing space).
   - `name`: `step.name ?? ''` (already substituted for Examples).
   - `status`: `normalizeStatus(step.result?.status)`.
   - `dur`: `formatNs(step.result?.duration ?? 0)`.
   - `location`: `step.match?.location` (already in the JSON).
   - `error`: `step.result?.error_message` if status is failed; otherwise omit.
   - `hidden`: `step.hidden === true` — only push when `hidden && failed`,
     skip when `hidden && passed`.
2. Compute `failedStepIndex` as the index of the first step with
   `status === 'failed'` in the final (post-hidden-filter) array. Undefined
   when no step failed.
3. Set `tests.push({ ..., steps, failedStepIndex })`. Keep the existing
   scenario-level `error` field unchanged for back-compat.

The existing `worst`, `scenarioNs`, `errorMsg` calculation stays — it now runs
alongside the step emission, not instead of it.

### `apps/dashboard/scripts/ingest-gatling.ts`

In `ingestGatling()` (currently lines 242-332):

- The inner loop `for (const s of report.scenarios)` (lines 272-279) is
  replaced. Per simulation, push **one** `PerfScenario`:

```ts
scenarios.push({
  name: report.simulation,
  rps:    report.root.values['col-6'] ?? 0,
  p95:    report.root.values['col-10'] ?? 0,
  errors: report.root.values['col-5'] ?? 0,
  steps:  report.scenarios.map((s) => ({
    name:   s.label,
    rps:    s.values['col-6']  ?? 0,
    p95:    s.values['col-10'] ?? 0,
    errors: s.values['col-5']  ?? 0,
  })),
});
```

- Run-level roll-up (`p50w`, `p95w`, `p99w`, `meanw`, `rpsSum`, `total`,
  `ok`, `ko`) is unchanged.
- The passed/failed simulation count keeps the existing rule: a simulation is
  failed when *any* of its request rows has >0 KO. Now this is "any
  `steps[i].errors > 0`".

### `apps/dashboard/scripts/ingest-pixelmatch.ts` — bucketing (B) + backlink (A)

In `ingestPixelmatch()` (currently lines 125-197), inside the
`for (const resultPath of resultPaths)` loop:

```ts
const rel = path.relative(visualRunDir, path.dirname(resultPath));
const segments = rel.split(/[\\/]/).filter(Boolean);
const [feature, snapshot, platform, viewport, market, language] = segments;

const bucketing: VisualDiff['bucketing'] = {};
if (feature)   bucketing.feature   = feature;
if (snapshot)  bucketing.snapshot  = snapshot;
if (platform)  bucketing.platform  = platform;
if (viewport)  bucketing.viewport  = viewport;
if (market)    bucketing.market    = market;
if (language)  bucketing.language  = language;

const triggeredBy = data.scenario && data.feature
  ? { feature: data.feature, scenario: data.scenario, runId: opts.dashboardRunId }
  : undefined;

diffs.push({
  // ...existing fields...
  bucketing,
  ...(triggeredBy ? { triggeredBy } : {}),
});
```

`VisualResultFile` (interface at line 19) gains an optional
`scenario?: string` field.

### Cross-package change for backlink A (out of `apps/dashboard/`)

`data.scenario` only exists in `result.json` if the pipeline that writes it
includes the scenario name. Three small changes upstream:

1. **Visual hooks** — `src/core/tests/<slice>/step_definitions/visual.hooks.ts`
   (×7: catalog, checkout, login, navbar, order_success, pizzaBuilder, profile).

   Each hook today builds a `bucket: Record<string, string>` (market, language).
   Add one line before serializing to `optionsJson`:

   ```ts
   if (pickle.name) bucket.scenario = pickle.name;
   ```

   The hook signature already destructures `{ pickle, result }`, so
   `pickle.name` is in scope.

2. **Pixelmatch plugin** — the action that handles `COMPARE_SNAPSHOT` reads
   the options from the second token after `||` (already JSON-parsed for
   market/language). Add `scenario` to the persisted fields when writing
   `result.json`.

3. **`apps/dashboard/scripts/ingest-pixelmatch.ts`** — pick up `data.scenario`
   as shown above. No-op when absent (older visual-results that ran before
   this change still ingest; they just don't get the backlink).

**Fallback plan (A-lite)**: if the plugin change is contentious, drop step 2.
The dashboard would then only populate `triggeredBy.feature` (already in
result.json today) and the backlink would land on the feature's tool detail
without highlighting a specific scenario. We can ship A-lite first and add
the scenario name in a follow-up if needed.

---

## UI changes

### `apps/dashboard/src/client/components/TestList.tsx` — accordion

Each `.test-row` becomes a `<button>` that toggles expansion. State:

```ts
const [expanded, setExpanded] = useState<Set<string>>(() => {
  const initial = new Set<string>();
  for (const t of tests) {
    if (t.status === 'failed') initial.add(testKey(t));
  }
  return initial;
});
```

`testKey(t) = ${t.file}:${t.name}:${i}` — the same key already used as the
React `key` (line 27).

When expanded, render `<StepList steps={t.steps} failedStepIndex={t.failedStepIndex} />`.

Fallback: when `t.steps` is `undefined` (older fixtures), the expanded panel
shows the existing scenario-level error `<pre>` block. Passed/skipped rows
without steps still get the toggle but the expanded panel shows
"No step data captured for this run."

### `apps/dashboard/src/client/components/StepList.tsx` — new

```ts
interface StepListProps {
  steps?: TestStep[];
  failedStepIndex?: number;
}
```

Each step renders as a row:
- Status icon: `○` passed, `✕` failed (red), `◐` skipped (muted), `🪝` hook.
- Bold keyword + step name.
- Right side: `<span class="step-dur">{dur}</span>` and
  `<span class="step-location">{location}</span>` (truncated).
- The step at `failedStepIndex` carries `.step-failed`; immediately below it
  renders `<pre class="step-error">{step.error}</pre>` with the error message
  word-wrapped.
- Hidden hooks (`step.hidden === true`) carry `.step-hook` styling and prefix
  the keyword with "🪝".

### `apps/dashboard/src/client/views/detail/PerformanceDetail.tsx`

The existing "Scenarios" table becomes a list of simulation cards. Each card:
- Header: simulation name, RPS, P95, %KO chips.
- Click toggles a sub-panel with a table of `steps[]`: columns
  `Step | RPS | P95 | %KO`. Sort by `errors desc` so the most-broken request
  is at the top.

If `scenarios[i].steps` is empty/undefined (defensive), show "No per-request
breakdown available."

### `apps/dashboard/src/client/views/detail/VisualDetail.tsx`

For each diff card, add two pieces above the existing image triplet:

1. **Chips row** (`bucketing`) — uses plain `<span class="chip chip-<dimension>">`
   (no shared `Chip` component exists yet; if one is later extracted, the
   markup stays the same):
   ```tsx
   <div className="chips">
     {bucketing?.market    && <span className="chip chip-market">{bucketing.market}</span>}
     {bucketing?.language  && <span className="chip chip-language">{bucketing.language}</span>}
     {bucketing?.viewport  && <span className="chip chip-viewport">{bucketing.viewport}</span>}
     {bucketing?.platform  && <span className="chip chip-platform">{bucketing.platform}</span>}
   </div>
   ```
   Add 4 new tone classes to `styles.css`; if the existing theme exposes
   semantic accent tokens, reuse them — otherwise introduce 4 OKLCH values
   that sit in the same purple-theme family as the existing chips.

2. **Backlink line** (`triggeredBy`):
   ```tsx
   {triggeredBy && (
     <div className="triggered-by">
       <Link to={`/runs/${triggeredBy.runId}/tools/playwright?expand=${encodeURIComponent(triggeredBy.scenario)}`}>
         📍 {triggeredBy.scenario} in {triggeredBy.feature}
       </Link>
     </div>
   )}
   ```

`GenericDetail.tsx` reads `useSearchParams().get('expand')` on mount and
passes it to `TestList` as a `expandScenarioName` prop. `TestList`'s
`initialExpanded` seeding then includes any `t` whose `t.name === expandScenarioName`
in addition to all failed rows. We match on `name` (not on `testKey` which
contains the feature file path) because the backlink originates from
pixelmatch — which knows the scenario name but not the cucumber file path
(pixelmatch's `feature` field is the slice folder name, e.g. `catalog`, not
the `.feature` file path).

---

## Tests

### Adapter tests (Vitest, `apps/dashboard/test/adapters/`)

| File | New assertions |
|---|---|
| `playwright.test.ts` | `tests[0].steps.length > 0`; for a failed test, `steps[failedStepIndex].status === 'failed'` and `steps[failedStepIndex].error` is populated; hidden-but-passed hooks are filtered out; hidden-and-failed hooks are present with `hidden: true`. |
| `api.test.ts` | Same shape (shares the cucumber parser). |
| `appium.test.ts` | Same per platform (android + ios). |
| `gatling.test.ts` | `perf.scenarios[i].steps[]` is populated from the simulation's request rows; simulation-level `rps/p95/errors` come from ROOT (not sum-of-steps); run-level `PerfBlock.rps` etc. unchanged. |
| `pixelmatch.test.ts` | `bucketing.market` and `bucketing.language` populated from the directory path; `triggeredBy` populated when `result.json` has `scenario`; `triggeredBy` undefined when absent (back-compat). |

### Component tests (Vitest + React Testing Library, new)

| File | What it covers |
|---|---|
| `test/components/TestList.test.tsx` | Failed rows are expanded on first render; click on a passed row toggles open; the error `<pre>` renders under the correct step (not at scenario-level) when `steps` is provided; fallback rendering when `steps` is undefined. |
| `test/components/StepList.test.tsx` | Hidden-hook row shows the 🪝 prefix and `.step-hook` class; failed step has `.step-failed`; passed step has neither class. |

### Fixtures (`apps/dashboard/scripts/generate-fixtures.ts`)

Update the demo run generators so at least one scenario per tool has populated
`steps[]` — including one passed scenario, one failed scenario with a clear
`failedStepIndex`, and one Scenario Outline emitting 2 iterations where one
passes and one fails. Mock pixelmatch diffs gain `bucketing` chips and a
sample `triggeredBy`.

`pnpm dashboard:fixtures` regenerates everything; CI is unaffected because
fixtures are gitignored.

---

## Execution plan (when implementation starts)

| Phase | Parallelism | Subagent prompts include |
|---|---|---|
| 1. Types | sequential (1 agent or main session) | `apps/dashboard/src/shared/types.ts` only. Foundation — must merge before phase 2/3. |
| 2. Ingest | 3 subagents in parallel | One per script: `ingest-run.ts`, `ingest-gatling.ts`, `ingest-pixelmatch.ts`. Explicit "DO NOT EDIT types.ts or any other ingest file" in each prompt. |
| 3. UI | 3 subagents in parallel | One per area: `TestList.tsx` + new `StepList.tsx` + `styles.css`; `PerformanceDetail.tsx`; `VisualDetail.tsx`. Explicit cross-file no-touch list per agent. |
| 4. Cross-package (A) | sequential (1 agent) | Visual hooks (×7) + pixelmatch plugin's CompareSnapshot action. All touch the same intent payload schema — single-agent avoids divergent serialization. |
| 5. Tests + fixtures | 2 subagents in parallel | (a) adapter tests + fixtures regeneration; (b) component tests + RTL setup if not present. |

Between each phase, the parent session runs `git status` to audit
subagent scope creep (per `feedback_subagent_scope.md`). If a subagent
touches files outside its prompt, the change is surfaced and either kept
(if intentional) or reverted with a follow-up question.

Typecheck (`pnpm --filter dashboard typecheck`) and Vitest
(`pnpm --filter dashboard test`) run after each phase as a smoke gate.

---

## Open questions / risks

1. **A vs A-lite.** The full A (scenario name in result.json) touches 9
   upstream files (7 hooks + 1 plugin action + 1 ingest). A-lite limits the
   change to ingest-pixelmatch only and provides a feature-level backlink.
   The plan above assumes full A; the writing-plans agent should treat the
   plugin change as the lowest-confidence step and we revisit if it turns
   out to be invasive.
2. **Hidden-hook noise.** Every cucumber scenario today has at least one
   hidden After hook (visible in the sample JSON inspection). Filtering
   passed-hidden hooks is the right default; the writing-plans phase should
   verify no slice relies on hidden-but-passed hooks being shown.
3. **Performance.** A run with 200 scenarios × ~13 steps = ~2600 step
   objects. JSON sizes grow ~5-8×. The dashboard server reads JSON on every
   request (no cache); a quick sanity check after phase 2 confirms latency
   stays acceptable. If not, gzip on `/api/runs/:runId/tools/:toolId` is the
   first lever.
4. **Mock fixtures decay.** Mock fixtures need maintenance every time the
   types shape changes. We update them in phase 5 and that's it — but
   anyone adding a new field to `TestStep` later must also touch
   `generate-fixtures.ts`. Not a blocker, just a known coupling.

---

## Definition of done

- All adapter tests and component tests pass: `pnpm --filter dashboard test`.
- Typecheck clean: `pnpm --filter dashboard typecheck`.
- `pnpm dashboard:fixtures && pnpm dashboard` renders:
  - A web_ui detail row that, when expanded, shows the Given/When/Then list.
  - A failed scenario whose error message appears under the *failed* step,
    not at the scenario header.
  - Two Outline iterations where one passes and one fails — the failed row
    shows the failed step inline, the passed row collapses cleanly.
  - A Gatling simulation card that expands into request rows.
  - A pixelmatch diff with market/language chips and a clickable backlink
    that opens the Playwright detail with the originating scenario expanded.
- Smoke (`pnpm --filter dashboard smoke`) passes — no console errors.
