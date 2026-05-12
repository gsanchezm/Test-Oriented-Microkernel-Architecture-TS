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

function isVisualPluginEnabled(): boolean {
    return (process.env.PLUGIN_VISUAL ?? 'false').toLowerCase() === 'true';
}

function featureFromUri(uri: string): string | null {
    const match = uri.match(/src\/core\/tests\/([^/]+)\/features\//);
    return match ? match[1] : null;
}

After({ tags: '@visual' }, async function ({ pickle, result }) {
    if (!isVisualPluginEnabled()) return;
    if (result?.status === 'FAILED') return; // don't pile visual diffs on top of a functional failure

    const feature = featureFromUri(pickle.uri);
    if (!feature) {
        visualLog.warn({ uri: pickle.uri }, 'Visual hook could not derive feature from pickle.uri');
        return;
    }

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
        await sendIntent(
            INTENT.COMPARE_SNAPSHOT,
            `${feature}||${snap.id}${optionsJson}`,
            'pixelmatch',
        );
    }
});
