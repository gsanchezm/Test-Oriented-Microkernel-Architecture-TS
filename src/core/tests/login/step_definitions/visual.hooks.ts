// Visual After hook for the login feature.
//
// Mirrors the checkout pattern (see checkout/step_definitions/visual.hooks.ts
// for the full rationale on hook ordering — the file must register AFTER
// login.steps.ts so it runs FIRST in the After phase, before resetClientState
// navigates away).

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
    if (result?.status === 'FAILED') return;

    const feature = featureFromUri(pickle.uri);
    if (!feature || feature !== 'login') return;

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

    // When multiple snapshots match (e.g. `login_screen_initial` with
    // ["@visual","@login"] and `login_screen_invalid_credentials` with
    // ["@visual","@login","@invalid"]) prefer the MOST specific — i.e. the
    // entries whose tag set is the longest. Otherwise we'd capture both
    // and the less-specific one would diff loudly against a baseline taken
    // from a different scenario state.
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

    // Per-(market, language) bucketing. On the login screen the market is
    // usually unset until the user clicks the market button, but the
    // language is set by LoginRoute as soon as the market+language pair
    // has been selected. We bucket on whatever is present.
    const world = this as CheckoutWorld;
    const market = world.orderContext?.market ?? world.locale?.market;
    const language = world.locale?.language;
    const bucket: Record<string, string> = {};
    if (market) bucket.market = market;
    if (language) bucket.language = language;
    const optionsJson = Object.keys(bucket).length > 0
        ? `||${JSON.stringify(bucket)}`
        : '';

    for (const snap of matched) {
        // Wrapped in try/catch — visual drift is a pixelmatch concern. See
        // the matching hook in checkout/step_definitions/visual.hooks.ts
        // for the full rationale.
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
