// Visual plugin — thin orchestrator. The Visual oracle is composable:
// it never opens its own UI session. It either reuses the active
// Playwright/Appium session (via session getters) or runs in pure
// validation mode for VALIDATE_VISUAL_CONTRACT.

import { getVisualActionRegistry } from '@plugins/visual/actions/registerVisualActions';

const registry = getVisualActionRegistry();

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    if (normalizedAction === 'TEARDOWN') {
        return 'Visual execution environment terminated securely.';
    }

    return registry.execute(normalizedAction, {
        target: targetSelector,
        actionId: normalizedAction,
        sessionId,
        metadata: { plugin: 'visual' },
    });
}
