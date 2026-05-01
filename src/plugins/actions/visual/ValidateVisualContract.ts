// VALIDATE_VISUAL_CONTRACT — pure validation, no screenshots.
// Loads the contract, walks every snapshot, attempts ref resolution
// through the existing locator-resolver, and returns a JSON summary.
//
// Useful as a CI guardrail before any visual run: if a contract
// references a key that no longer exists, fail fast and loud here
// rather than during a long Cucumber scenario.

import { ActionHandler } from '@plugins/actions/ActionHandler';
import { VisualActionContext } from '@plugins/actions/visual/VisualActionContext';
import { parseContractTarget } from '@plugins/actions/parseCompositeTarget';
import { VisualContractLoader } from '@core/contracts/visual-contract-loader';
import { resolveVisualTarget } from '@core/contracts/visual-target-resolver';
import { VisualValidationResult } from '@plugins/visual/support/visual-result.types';

export const ValidateVisualContractAction: ActionHandler<VisualActionContext> = {
    name: 'VALIDATE_VISUAL_CONTRACT',
    async execute({ target }) {
        // Allow `feature` alone or `feature||snapshotId` to validate a single snapshot.
        let feature = target;
        let snapshotIdFilter: string | null = null;
        if (target.includes('||')) {
            const parsed = parseContractTarget(target);
            feature = parsed.feature;
            snapshotIdFilter = parsed.endpointId;
        }

        const contract = VisualContractLoader.load(feature);
        const snapshots = snapshotIdFilter
            ? contract.snapshots.filter((s) => s.id === snapshotIdFilter)
            : contract.snapshots;

        if (snapshots.length === 0) {
            throw new Error(
                `[VALIDATE_VISUAL_CONTRACT] '${feature}': snapshot '${snapshotIdFilter}' not found`,
            );
        }

        const allUnresolved = new Set<string>();
        const result: VisualValidationResult = {
            feature: contract.feature,
            version: contract.version,
            snapshotCount: snapshots.length,
            snapshots: [],
            unresolvedRefs: [],
        };

        for (const snap of snapshots) {
            const resolved = resolveVisualTarget(snap, { strict: false });
            for (const ref of resolved.unresolvedRefs) allUnresolved.add(ref);
            result.snapshots.push({
                id: snap.id,
                regionRef: snap.regionRef,
                regionResolved: resolved.resolvedRegion !== null,
                maskRefs: snap.maskRefs ?? [],
                masksResolved: resolved.resolvedMasks.length,
                masksUnresolved: resolved.unresolvedRefs.filter((r) => r !== snap.regionRef),
            });
        }

        result.unresolvedRefs = [...allUnresolved];
        return JSON.stringify(result);
    },
};
