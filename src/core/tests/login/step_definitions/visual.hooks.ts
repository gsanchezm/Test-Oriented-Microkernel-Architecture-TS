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

function featureFromUri(uri: string): string | null {
    const match = uri.match(/src\/core\/tests\/([^/]+)\/features\//);
    return match ? match[1] : null;
}

After({ tags: '@visual' }, async function ({ pickle, result }) {
    if (!isPixelmatchPluginEnabled()) return;
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

    // Per-market bucketing — same rationale as checkout. The market lives in
    // the world only after a market step ran; before that the snapshot is the
    // un-localized initial state and we skip the suffix.
    const world = this as CheckoutWorld;
    const market = world.orderContext?.market;
    const optionsJson = market ? `||${JSON.stringify({ market })}` : '';

    for (const snap of matched) {
        await sendIntent(
            INTENT.COMPARE_SNAPSHOT,
            `${feature}||${snap.id}${optionsJson}`,
            'pixelmatch',
        );
    }
});
