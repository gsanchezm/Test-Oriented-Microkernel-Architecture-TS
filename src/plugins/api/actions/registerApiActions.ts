import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { ApiActionContext } from '@plugins/api/actions/ApiActionContext';
import {
    HttpDeleteAction,
    HttpGetAction,
    HttpPatchAction,
    HttpPostAction,
    HttpPutAction,
} from '@plugins/api/actions/ExecuteHttpRequest';
import { ExecuteContractEndpointAction } from '@plugins/api/actions/ExecuteContractEndpoint';
import { ValidateContractEndpointAction } from '@plugins/api/actions/ValidateContractEndpoint';

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
