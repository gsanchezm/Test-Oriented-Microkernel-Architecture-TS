// Helpers shared by every Visual action handler. The composite target
// is `feature||snapshotId[||{json options}]` parsed by the shared
// parseContractTarget helper. Options recognized:
//   platform        — overrides PLATFORM env var.
//   viewport        — overrides VIEWPORT env var.
//   saveActualOnly  — capture-only mode (CompareSnapshot fast path).
//   updateReason    — informational, recorded in telemetry metadata.

import { parseContractTarget } from '@plugins/shared/parseCompositeTarget';

export interface VisualTargetOptions {
    feature: string;
    snapshotId: string;
    platform: string;
    viewport: string;
    /** Optional scenario-data dimension (e.g. country code "US"/"MX") used to bucket baselines. */
    market?: string;
    /** Optional rendering-language dimension ("en"/"es"/"de"/"fr"/"ja"). */
    language?: string;
    saveActualOnly: boolean;
    updateReason: string | null;
    raw: Record<string, unknown>;
}

export function parseVisualTarget(target: string): VisualTargetOptions {
    const { feature, endpointId: snapshotId, variables } = parseContractTarget(target);

    const platform = String(
        variables.platform ?? process.env.PLATFORM ?? 'web',
    ).toLowerCase();
    const viewport = String(
        variables.viewport ?? process.env.VIEWPORT ?? (platform === 'web' ? 'desktop' : 'mobile'),
    ).toLowerCase();
    const market = typeof variables.market === 'string' && variables.market.length > 0
        ? variables.market.toLowerCase()
        : undefined;
    const language = typeof variables.language === 'string' && variables.language.length > 0
        ? variables.language.toLowerCase()
        : undefined;

    return {
        feature,
        snapshotId,
        platform,
        viewport,
        market,
        language,
        saveActualOnly: variables.saveActualOnly === true,
        updateReason: typeof variables.updateReason === 'string' ? variables.updateReason : null,
        raw: variables,
    };
}
