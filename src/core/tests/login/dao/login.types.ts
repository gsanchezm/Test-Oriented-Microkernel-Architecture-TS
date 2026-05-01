// Public HTTP contract for the Login DAO.
// Kept separate from login.dao.ts so consumers can import the shape
// without pulling the class (SRP) and so a future caller that only needs
// the response shape (e.g. a fixture) doesn't depend on the DAO (ISP).

export interface LoginRequest {
    email?: string;
    username?: string;
    password: string;
    [key: string]: unknown;
}

export interface LoginResponse {
    token?: string;
    accessToken?: string;
    access_token?: string;
    refreshToken?: string;
    user?: unknown;
    [key: string]: unknown;
}

export interface LoginDaoOptions {
    url?: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
    fetchImpl?: typeof fetch;
}
