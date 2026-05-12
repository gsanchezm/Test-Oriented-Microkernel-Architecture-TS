// Mobilewright plugin — thin orchestrator. Mirrors the shape of the
// mobile-ui (Appium) plugin but delegates to the `mobilewright` npm
// package instead. New actions live under `actions/` and register
// themselves via `registerMobilewrightActions.ts` (Open/Closed).

import { getMobilewrightActionRegistry } from '@plugins/mobilewright/actions/registerMobilewrightActions';
import { ensureSession, teardown } from '@plugins/mobilewright/mobilewright-lifecycle';

const registry = getMobilewrightActionRegistry();

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    // TEARDOWN is session-scoped — never boot a device just to close it.
    if (normalizedAction === 'TEARDOWN') {
        await teardown(sessionId);
        return 'Mobilewright execution environment terminated securely.';
    }

    const session = await ensureSession(sessionId);

    return registry.execute(normalizedAction, {
        driver: session.device,
        target: targetSelector,
        actionId: normalizedAction,
        sessionId,
        platform: session.platform,
        metadata: { plugin: 'mobilewright', profileId: session.profileId },
    });
}
