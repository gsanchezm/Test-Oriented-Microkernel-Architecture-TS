import { ActionContext } from '@plugins/shared/ActionHandler';
import { HttpClient } from '@plugins/api/http/http.client';

export interface ApiActionContext extends ActionContext<HttpClient> {
    client: HttpClient;
    target: string;
    sessionId: string;
    metadata?: Record<string, unknown>;
}
