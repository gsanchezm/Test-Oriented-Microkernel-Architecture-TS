import { HttpClient } from '@plugins/api/http';
import type {
    CountryCode,
    ProfileDaoOptions,
    ProfileResponse,
    ProfileUpdateRequest,
} from '@core/tests/profile/dao/profile.types';

// Canonical paths. `me` (GET/PATCH /api/users/me/profile) is the live
// per-user profile. `seed` (POST /api/profile) is the atomic deterministic
// reset/seed added by OmniPizza (commit 124b268): it replaces the user's
// profile with defaults + any fields supplied, so a known state can be frozen
// right before a visual snapshot. The full_name field is shared+mutable per
// username on the demo backend, so without a pre-snapshot seed the screen
// hydrates whatever another scenario/run last saved (visual drift).
const PATHS = {
    me: '/api/users/me/profile',
    seed: '/api/profile',
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

    /**
     * Atomic deterministic seed/reset (POST /api/profile). Replaces the user's
     * profile with defaults + the provided fields; OMITTED fields reset to
     * their default (empty strings, premium=true) — it does NOT merge. Call it
     * right before a visual snapshot to freeze the (otherwise shared+mutable
     * per-username) profile to a known state. Market-independent, so no
     * x-country-code header. Empty body ⇒ clean pre-edit defaults.
     */
    seedProfile(params: {
        token: string;
        body?: ProfileUpdateRequest;
    }): Promise<ProfileResponse> {
        return this.httpClient.post<ProfileResponse>(PATHS.seed, {
            headers: this.authHeaders(params.token),
            body: params.body ?? {},
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
