// Visual After hook for the navbar feature.
//
// Mirrors the checkout/login/order_success pattern — see
// checkout/step_definitions/visual.hooks.ts for the full rationale on
// hook ordering. This file MUST register AFTER navbar.steps.ts so it
// runs FIRST in the After phase (cucumber's reverse-registration order).
// The filename `visual.hooks.ts` sorts after `navbar.steps.ts`, which is
// exactly what we need.
//
// The navbar slice has no resetClientState() teardown (no DAO, no UI
// teardown of its own), but the ordering convention is preserved so the
// slice stays uniform — and so the hook still runs before any cross-slice
// teardown that other slices' hooks might add when included by a parent
// run.

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
    // Visual snapshots need a live UI session. The api driver has no page
    // to capture from, so the hook must short-circuit cleanly instead of
    // letting the pixelmatch plugin throw "no active session".
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
    // Each slice's visual.hooks.ts only handles its own feature — otherwise
    // every slice's hook would fire for every @visual scenario, duplicating
    // COMPARE_SNAPSHOT calls and racing baselines.
    if (!feature || feature !== 'navbar') return;

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
    // Feature name is implicit for every scenario in that feature; add it
    // so snapshots can be tagged `@navbar` without bloating the feature file.
    scenarioTags.add(`@${feature}`);
    const candidates = contract.snapshots.filter((snap) =>
        (snap.tags ?? []).every((t) => scenarioTags.has(t)),
    );

    // When multiple snapshots match, prefer the MOST specific (longest tag
    // set). This is how the navbar scenarios distinguish:
    //   - desktop full strip (4 tags incl. @desktop @ui-only) — scenario 1
    //   - mobile menu (3 tags incl. @ui-only) — scenario 2
    //   - language switcher panel (2 tags: @visual @navbar) — scenario 3
    // Each scenario falls through to its longest-matching snapshot only.
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

    // Per-(market, language) bucketing. The navbar route writes both
    // `world.locale.{market,language}` and (after a switch)
    // `world.languageOverride`. The override takes precedence so the
    // post-switch snapshot lands under the new language directory.
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
        // Wrapped in try/catch — visual drift is a pixelmatch concern.
        // See the matching hook in checkout/step_definitions/visual.hooks.ts
        // for the full rationale (functional/visual signals stay separate).
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
