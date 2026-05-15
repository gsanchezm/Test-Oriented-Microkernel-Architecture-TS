import { HttpClient } from '@plugins/api/http';
import { HttpError } from '@plugins/api/http/http.error';
import type {
    LoginAttemptResult,
    LoginDaoOptions,
    LoginRequest,
    LoginResponse,
} from '@core/tests/login/dao/login.types';

const LOGIN_PATH = '/api/auth/login';
// Overrides HttpClient's default. Must stay ≥45s — Render free tier cold
// starts take 30–45s when the instance has been idle.
const DEFAULT_TIMEOUT_MS = 60_000;

export class LoginDao {
    private readonly loginEndpoint: string;
    private readonly httpClient: HttpClient;

    constructor(options: LoginDaoOptions = {}) {
        const apiBaseUrl = process.env.API_BASE_URL?.replace(/\/+$/, '');
        const loginApiUrl = options.url ?? process.env.LOGIN_API_URL;

        if (!apiBaseUrl && !loginApiUrl) {
            throw new Error('Missing required env var: API_BASE_URL');
        }

        this.loginEndpoint = loginApiUrl ?? LOGIN_PATH;
        this.httpClient = new HttpClient({
            baseUrl: apiBaseUrl,
            defaultHeaders: options.headers,
            timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            fetchImpl: options.fetchImpl,
        });
    }

    async login(credentials: LoginRequest): Promise<LoginResponse> {
        if (!credentials.email && !credentials.username) {
            throw new Error('Login request requires either email or username');
        }

        return this.httpClient.post<LoginResponse>(this.loginEndpoint, {
            body: credentials,
        });
    }

    // Negative-path variant. Used by invalid-credentials scenarios where the
    // caller EXPECTS the backend to reject the payload. Empty username/password
    // are allowed (the test cases include both-empty); we still post them
    // verbatim so the backend's own validator is exercised.
    async loginAllowError(credentials: LoginRequest): Promise<LoginAttemptResult> {
        try {
            const response = await this.httpClient.post<LoginResponse>(this.loginEndpoint, {
                body: credentials,
            });
            return { ok: true, response };
        } catch (err) {
            if (err instanceof HttpError) {
                return {
                    ok: false,
                    status: err.status,
                    message: err.message,
                    body: err.responseBody,
                };
            }
            return {
                ok: false,
                message: (err as Error).message,
            };
        }
    }

    extractToken(response: LoginResponse): string | undefined {
        const direct =
            this.firstNonEmptyString(response.token) ??
            this.firstNonEmptyString(response.accessToken) ??
            this.firstNonEmptyString(response.access_token);
        if (direct) return direct;

        const data = response.data;
        if (!data || typeof data !== 'object') return undefined;

        const nested = data as Record<string, unknown>;
        return (
            this.firstNonEmptyString(nested.token) ??
            this.firstNonEmptyString(nested.accessToken) ??
            this.firstNonEmptyString(nested.access_token)
        );
    }

    private firstNonEmptyString(value: unknown): string | undefined {
        return typeof value === 'string' && value.length > 0 ? value : undefined;
    }
}
