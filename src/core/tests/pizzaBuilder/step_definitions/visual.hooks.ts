// Visual After hook for the pizzaBuilder feature.
//
// Mirrors the checkout/login/order_success pattern. The file MUST sort
// after `pizzaBuilder.steps.ts` so cucumber registers it later → runs it
// earlier in the reverse-order After phase → captures the customizer DOM
// before any reset hook tears the page down.

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
    // Visual snapshots need a live UI session. The api driver has no page to
    // capture from, so the hook must short-circuit cleanly instead of letting
    // the pixelmatch plugin throw "no active session".
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
    if (result?.status === 'FAILED') return;

    const feature = featureFromUri(pickle.uri);
    if (!feature || feature !== 'pizzaBuilder') return;

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
    scenarioTags.add(`@${feature}`);
    const candidates = contract.snapshots.filter((snap) =>
        (snap.tags ?? []).every((t) => scenarioTags.has(t)),
    );

    // Prefer the MOST SPECIFIC match (longest tag set). Otherwise multiple
    // snapshots with overlapping tag sets would all fire, polluting the
    // visual results.
    const longest = candidates.reduce(
        (acc, snap) => Math.max(acc, (snap.tags ?? []).length),
        0,
    );
    const matched = candidates.filter((snap) => (snap.tags ?? []).length === longest);

    if (matched.length === 0) {
        visualLog.info(
            { feature, scenario: pickle.name },
            'Visual hook: no snapshot matches scenario tags',
        );
        return;
    }

    // Per-(market, language) bucketing. The route populates orderContext
    // and languageOverride before the hook fires so both dimensions are
    // available for path scoping.
    const world = this as CheckoutWorld;
    const market = world.orderContext?.market ?? world.locale?.market;
    const language = world.languageOverride ?? world.locale?.language;
    const bucket: Record<string, string> = {};
    if (market) bucket.market = market;
    if (language) bucket.language = language;
    if (pickle.name) bucket.scenario = pickle.name;
    const optionsJson = Object.keys(bucket).length > 0
        ? `||${JSON.stringify(bucket)}`
        : '';

    for (const snap of matched) {
        // Wrapped in try/catch — visual drift is a pixelmatch concern. The
        // Visual gate CI step walks the result JSONs after cucumber finishes
        // and exits 1 if any has status FAIL, so we surface drift there
        // instead of poisoning the functional pass/fail signal.
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
