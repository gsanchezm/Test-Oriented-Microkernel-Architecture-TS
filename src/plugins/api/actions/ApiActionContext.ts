import { ActionInvocationContext, DriverContext, MetadataContext } from '@plugins/shared/ActionHandler';
import { HttpClient } from '@plugins/api/http/http.client';

export interface ApiActionContext extends ActionInvocationContext, DriverContext<HttpClient>, MetadataContext {
    client: HttpClient;
}
