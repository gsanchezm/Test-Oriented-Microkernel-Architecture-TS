// NOTE: @gatling.io/core and @gatling.io/http must NOT be imported here.
// Those packages call Java.type() at load time and only work inside the
// Gatling JVM runner (gatling-js-bundle). This server runs in plain Node.js.
// All simulations are executed as subprocesses via runSimulation().

import {
    defaultPerformanceParser,
    defaultPerformanceRunner,
} from '@plugins/performance/actions/PerformanceActionContext';
import { getPerformanceActionRegistry } from '@plugins/performance/actions/registerPerformanceActions';

const registry = getPerformanceActionRegistry();

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    return registry.execute(normalizedAction, {
        target: targetSelector,
        actionId: normalizedAction,
        sessionId,
        runner: defaultPerformanceRunner,
        parser: defaultPerformanceParser,
        metadata: { plugin: 'gatling' },
    });
}
