import { ActionRegistry } from '@plugins/actions/ActionRegistry';
import { ApiActionContext } from '@plugins/actions/api/ApiActionContext';
import {
    HttpDeleteAction,
    HttpGetAction,
    HttpPatchAction,
    HttpPostAction,
    HttpPutAction,
} from '@plugins/actions/api/ExecuteHttpRequest';
import { ExecuteContractEndpointAction } from '@plugins/actions/api/ExecuteContractEndpoint';
import { ValidateContractEndpointAction } from '@plugins/actions/api/ValidateContractEndpoint';

let cachedRegistry: ActionRegistry<ApiActionContext> | null = null;

export function getApiActionRegistry(): ActionRegistry<ApiActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<ApiActionContext>({ plugin: 'api' });
    registry
        .register(HttpGetAction)
        .register(HttpPostAction)
        .register(HttpPutAction)
        .register(HttpPatchAction)
        .register(HttpDeleteAction)
        .register(ExecuteContractEndpointAction)
        .register(ValidateContractEndpointAction)
        // Backwards-compatible alias used by some scenarios.
        .alias('EXECUTE_CONTRACT_ENDPOINT', 'EXECUTE_API_CONTRACT');

    cachedRegistry = registry;
    return registry;
}

export function resetApiActionRegistry(): void {
    cachedRegistry = null;
}
