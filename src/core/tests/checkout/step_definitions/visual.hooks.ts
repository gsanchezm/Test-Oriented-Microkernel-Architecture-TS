// Visual After hook for the checkout feature.
//
// Why this lives in step_definitions/ instead of support/:
// Cucumber runs After hooks in REVERSE registration order. support/
// loads before step_definitions/, so a hook in support/ would register
// first and therefore run LAST — after `checkout.steps.ts:After` has
// already invoked `resetClientState()` (localStorage.clear + NAVIGATE
// to BASE_URL). By that point the Playwright page is no longer on
// /checkout, so the visual capture would snapshot the home page.
//
// Placing the hook here (filename sorts after `checkout.steps.ts`)
// guarantees it registers later → runs first → captures while the
// scenario's UI state is still on screen.

import { After } from '@cucumber/cucumber';
import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { VisualContractLoader } from '@core/contracts/visual-contract-loader';
import { logger } from '@utils/logger';
import type { CheckoutWorld } from '@core/tests/support/world';

const visualLog = logger.child({ layer: 'hook', concern: 'visual' });

function isPixelmatchPluginEnabled(): boolean {
    return (process.env.PLUGIN_PIXELMATCH ?? 'false').toLowerCase() === 'true';
}

function hasUiDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'playwright' || driver === 'mobilewright' || driver === 'appium';
}

function featureFromUri(uri: string): string | null {
    // Cucumber's pickle.uri carries the OS-native path separator, so on
    // Windows the URI uses backslashes; match both to stay portable.
    const match = uri.match(/src[\\/]+core[\\/]+tests[\\/]+([^\\/]+)[\\/]+features[\\/]+/);
    return match ? match[1] : null;
}

After({ tags: '@visual' }, async function ({ pickle, result }) {
    if (!isPixelmatchPluginEnabled()) return;
    if (!hasUiDriver()) return;
    if (result?.status === 'FAILED') return; // don't pile visual diffs on top of a functional failure

    const feature = featureFromUri(pickle.uri);
    // Each slice's visual.hooks.ts only handles its own feature — otherwise
    // every slice's hook would fire for every @visual scenario, duplicating
    // COMPARE_SNAPSHOT calls and (worse) re-capturing the same key which
    // races against the just-written baseline and surfaces flaky size
    // mismatches via the fullPage fallback (see playwright-screenshot-source.ts:18).
    if (!feature || feature !== 'checkout') return;

    let contract;
    try {
        contract = VisualContractLoader.load(feature);
    } catch (err) {
        visualLog.warn(
            { feature, err: (err as Error).message },
            'Visual hook found no contract — skipping',
        );
        return;
    }

    const scenarioTags = new Set(pickle.tags.map((t) => t.name));
    scenarioTags.add(`@${feature}`); // feature name is implicit for every scenario in that feature
    const matched = contract.snapshots.filter((snap) =>
        (snap.tags ?? []).every((t) => scenarioTags.has(t)),
    );

    if (matched.length === 0) {
        visualLog.info(
            { feature, scenario: pickle.name },
            'Visual hook: no snapshot matches scenario tags',
        );
        return;
    }

    // Per-market bucketing: scenario data shapes the rendered DOM (cart
    // items, prices, currency) so a single global baseline would be
    // unstable. Pass `market` through the visual contract target so the
    // plugin scopes baseline/result paths under <viewport>/<market>/.
    const world = this as CheckoutWorld;
    const market = world.orderContext?.market;
    const optionsJson = market ? `||${JSON.stringify({ market })}` : '';

    for (const snap of matched) {
        // Third arg routes the intent to the pixelmatch plugin (port 50056) —
        // the default DRIVER target would land on playwright/appium.
        //
        // Wrapped in try/catch so a visual drift does NOT fail the functional
        // scenario. Pixel-level comparison is a separate concern owned by the
        // pixelmatch oracle; its outcome lives in visual-results/<runId>/.../
        // result.json (read by the Visual tab of the test report). The
        // cucumber tab should reflect functional behavior only.
        try {
            await sendIntent(
                INTENT.COMPARE_SNAPSHOT,
                `${feature}||${snap.id}${optionsJson}`,
                'pixelmatch',
            );
        } catch (err) {
            visualLog.info(
                { feature, snapshotId: snap.id, err: (err as Error).message },
                'Visual diff detected — recorded for the Visual report, not propagated to the scenario',
            );
        }
    }
});
