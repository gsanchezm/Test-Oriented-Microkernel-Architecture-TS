import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { VisualActionContext } from '@plugins/visual/actions/VisualActionContext';
import { CaptureSnapshotAction } from '@plugins/visual/actions/CaptureSnapshot';
import { CompareSnapshotAction } from '@plugins/visual/actions/CompareSnapshot';
import { ValidateVisualContractAction } from '@plugins/visual/actions/ValidateVisualContract';
import { UpdateBaselineAction } from '@plugins/visual/actions/UpdateBaseline';

let cachedRegistry: ActionRegistry<VisualActionContext> | null = null;

export function getVisualActionRegistry(): ActionRegistry<VisualActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<VisualActionContext>({ plugin: 'visual' });
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
