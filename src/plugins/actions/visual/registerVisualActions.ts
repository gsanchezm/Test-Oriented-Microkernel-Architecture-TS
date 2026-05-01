import { ActionRegistry } from '@plugins/actions/ActionRegistry';
import { VisualActionContext } from '@plugins/actions/visual/VisualActionContext';
import { CaptureSnapshotAction } from '@plugins/actions/visual/CaptureSnapshot';
import { CompareSnapshotAction } from '@plugins/actions/visual/CompareSnapshot';
import { ValidateVisualContractAction } from '@plugins/actions/visual/ValidateVisualContract';
import { UpdateBaselineAction } from '@plugins/actions/visual/UpdateBaseline';

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
