// Helpers shared by every Visual action handler. The composite target
// is `feature||snapshotId[||{json options}]` parsed by the shared
// parseContractTarget helper. Options recognized:
//   platform        — overrides PLATFORM env var.
//   viewport        — overrides VIEWPORT env var.
//   saveActualOnly  — capture-only mode (CompareSnapshot fast path).
//   updateReason    — informational, recorded in telemetry metadata.

import { parseContractTarget } from '@plugins/actions/parseCompositeTarget';

export interface VisualTargetOptions {
    feature: string;
    snapshotId: string;
    platform: string;
    viewport: string;
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

    return {
        feature,
        snapshotId,
        platform,
        viewport,
        saveActualOnly: variables.saveActualOnly === true,
        updateReason: typeof variables.updateReason === 'string' ? variables.updateReason : null,
        raw: variables,
    };
}
