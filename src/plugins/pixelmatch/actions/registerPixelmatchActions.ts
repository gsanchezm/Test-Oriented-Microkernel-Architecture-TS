import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { PixelmatchActionContext } from '@plugins/pixelmatch/actions/PixelmatchActionContext';
import { CaptureSnapshotAction } from '@plugins/pixelmatch/actions/CaptureSnapshot';
import { CompareSnapshotAction } from '@plugins/pixelmatch/actions/CompareSnapshot';
import { ValidateVisualContractAction } from '@plugins/pixelmatch/actions/ValidateVisualContract';
import { UpdateBaselineAction } from '@plugins/pixelmatch/actions/UpdateBaseline';

let cachedRegistry: ActionRegistry<PixelmatchActionContext> | null = null;

export function getPixelmatchActionRegistry(): ActionRegistry<PixelmatchActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<PixelmatchActionContext>({ plugin: 'pixelmatch' });
    registry
        .register(CaptureSnapshotAction)
        .register(CompareSnapshotAction)
        .register(ValidateVisualContractAction)
        .register(UpdateBaselineAction)
        .alias('CAPTURE_SNAPSHOT', 'VISUAL_CAPTURE')
        .alias('COMPARE_SNAPSHOT', 'VISUAL_COMPARE')
        .alias('VALIDATE_VISUAL_CONTRACT', 'VISUAL_VALIDATE');

    cachedRegistry = registry;
    return registry;
}

export function resetVisualActionRegistry(): void {
    cachedRegistry = null;
}
