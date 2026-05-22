import { HttpClient } from '@plugins/api/http';
import type {
    CountryCode,
    ProfileDaoOptions,
    ProfileResponse,
    ProfileUpdateRequest,
} from '@core/tests/profile/dao/profile.types';

// Canonical path per profile.api.contract.json. The endpoints are NOT yet
// implemented in the OmniPizza backend — this DAO is TDD-style scaffolding.
// If a runtime call returns 404 the contract is signalling the backend to
// add this endpoint.
const PATHS = {
    me: '/api/users/me/profile',
} as const;

// Overrides HttpClient's default. Must stay ≥45s — Render free tier cold
// starts take 30–45s when the instance has been idle.
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Thin client over the (assumed) Profile API.
 *
 * `getProfile({ token })`  → GET   /api/users/me/profile
 * `updateProfile({ token, body })` → PATCH /api/users/me/profile
 *
 * Mirrors `OrderSuccessDao` (Bearer-token auth, baseUrl from API_BASE_URL,
 * timeout ≥45s for Render free tier cold starts). The market is passed via
 * the optional `x-country-code` header so a future backend can localize
 * the response (e.g. currency-formatted strings) when the same user has
 * different defaults per market.
 */
export class ProfileDao {
    private readonly httpClient: HttpClient;

    constructor(options: ProfileDaoOptions = {}) {
        const apiBaseUrl = options.baseUrl ?? process.env.API_BASE_URL?.replace(/\/+$/, '');
        if (!apiBaseUrl) {
            throw new Error('Missing required env var: API_BASE_URL');
        }

        this.httpClient = new HttpClient({
            baseUrl: apiBaseUrl,
            timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            fetchImpl: options.fetchImpl,
        });
    }

    getProfile(params: { token: string; countryCode?: CountryCode }): Promise<ProfileResponse> {
        return this.httpClient.get<ProfileResponse>(PATHS.me, {
            headers: this.authHeaders(params.token, params.countryCode),
        });
    }

    updateProfile(params: {
        token: string;
        body: ProfileUpdateRequest;
        countryCode?: CountryCode;
    }): Promise<ProfileResponse> {
        return this.httpClient.patch<ProfileResponse>(PATHS.me, {
            headers: this.authHeaders(params.token, params.countryCode),
            body: params.body,
        });
    }

    private authHeaders(
        token: string,
        countryCode?: CountryCode,
        extra: Record<string, string> = {},
    ): Record<string, string> {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            ...extra,
        };
        if (countryCode) {
            headers['x-country-code'] = countryCode;
        }
        return headers;
    }
}
