import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';
import type { CountryCode } from '@plugins/api/http';

const log = logger.child({ layer: 'molecule', domain: 'profile', action: 'view' });

const PROFILE_SCREEN_WAIT_MS = 20_000;
const PRESENCE_WAIT_MS = 8_000;

export type LanguageCode = 'en' | 'es' | 'de' | 'fr' | 'ja';

interface OpenProfileArgs {
    market: CountryCode;
    language: LanguageCode;
    accessToken: string;
}

/**
 * Lands directly on the profile screen.
 *
 * Mobile (appium / mobilewright): deep link `omnipizza://profile?...`.
 * Web (playwright): seeds the Zustand-persisted localStorage (auth +
 * country) so `ProtectedRoute` lets us through, then navigates to
 * `/profile`. Mirrors the same approach used by order_success.
 *
 * Under DRIVER=api this is a no-op: the @api scenarios assert against
 * ProfileDao.getProfile() directly and the UI path is irrelevant.
 */
export async function openProfileScreen(args: OpenProfileArgs): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();

    if (driver === 'api') {
        log.info({ driver, market: args.market, language: args.language }, 'Profile screen no-op (api driver)');
        return;
    }

    if (driver === 'appium' || driver === 'mobilewright') {
        const params = new URLSearchParams({
            accessToken: args.accessToken,
            market: args.market,
        });
        if (args.market === 'CH' && (args.language === 'de' || args.language === 'fr')) {
            params.set('lang', args.language);
        }
        const url = `omnipizza://profile?${params.toString()}`;
        log.info({ market: args.market, language: args.language }, 'Deep linking to profile');
        await sendIntent(INTENT.DEEP_LINK, url);
        await waitForProfileScreen();
        return;
    }

    if (driver === 'playwright') {
        const baseUrl = process.env.BASE_URL;
        if (!baseUrl) {
            throw new Error('Missing required env var: BASE_URL');
        }
        const root = baseUrl.replace(/\/+$/, '');
        // Prime the origin first — about:blank has no localStorage scope.
        log.info({ baseUrl: root }, 'Priming origin before localStorage seed');
        await sendIntent(INTENT.NAVIGATE, root);
        await seedWebPersistedStores({
            market: args.market,
            language: args.language,
            token: args.accessToken,
        });
        const url = `${root}/profile`;
        log.info({ market: args.market, language: args.language }, 'Navigating to profile (web)');
        await sendIntent(INTENT.NAVIGATE, url);
        await waitForProfileScreen();
        return;
    }

    throw new Error(
        `profile feature requires DRIVER in {playwright, mobilewright, appium, api}; got "${driver}".`,
    );
}

/** Reloads the profile screen so the route can verify persistence. */
export async function reloadProfileScreen(): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'api') {
        log.info({ driver }, 'Profile reload no-op (api driver)');
        return;
    }

    if (driver === 'appium' || driver === 'mobilewright') {
        // Re-dispatch the same deep link to re-mount the profile screen and
        // force a fresh GET /api/users/me/profile. The token is still in
        // app state; we don't carry it on the URL because the previous
        // openProfileScreen already established the session.
        await sendIntent(INTENT.DEEP_LINK, 'omnipizza://profile');
        await waitForProfileScreen();
        return;
    }

    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        throw new Error('Missing required env var: BASE_URL');
    }
    const root = baseUrl.replace(/\/+$/, '');
    // Web reload — navigate to /profile fresh so the page's mount-time
    // useEffect refetches the profile from the API.
    await sendIntent(INTENT.NAVIGATE, `${root}/profile`);
    await waitForProfileScreen();
}

/** Waits for the profile screen to render.
 *
 * NB: `profileScreen` and `profileCard` are mobile-only in the locator
 * contract (no `web` key). The locator-resolver throws hard when a key
 * has no platform mapping for the active PLATFORM, so we can't anchor on
 * those wrappers under playwright. Instead we wait on `profileFullNameInput`
 * which is the first field of the form and has both `web.{responsive,desktop}`
 * and `mobile` selectors — a successful wait on it doubles as a
 * render-readiness signal across all drivers (mirror of the pattern in
 * login-navigation.molecule.ts which waits on `welcomeTitleText` rather
 * than the `loginScreen` wrapper).
 */
export async function waitForProfileScreen(): Promise<void> {
    if (isApiDriver()) return;
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `profileFullNameInput||${PROFILE_SCREEN_WAIT_MS}`);
}

// -- assertions --------------------------------------------------------

// Locator keys backed only by a `mobile` selector in profile.locators.json.
// On a web driver (playwright) the locator resolver throws hard when a key
// has no platform mapping for PLATFORM=web — so we skip these assertions
// with an audit log under playwright. The mirroring affordances (username
// text, premium badge) exist visually on web but are not yet wired to
// data-testids; promote them in the locator JSON to lift the skip.
const MOBILE_ONLY_KEYS = new Set([
    'profileUsernameText',
    'premiumBadgeText',
]);

// Conversely, `addressInput` is web-only in the contract (no `mobile` key).
// Under appium/mobilewright we have to skip its presence/typing wait.
const WEB_ONLY_KEYS = new Set([
    'addressInput',
]);

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}

function isWebDriver(): boolean {
    return (process.env.DRIVER ?? 'playwright').toLowerCase() === 'playwright';
}

function skipIfMobileOnlyOnWeb(key: string, action: string): boolean {
    if (MOBILE_ONLY_KEYS.has(key) && isWebDriver()) {
        log.info({ key, action }, 'Skipping — locator is mobile-only and DRIVER is web');
        return true;
    }
    return false;
}

function skipIfWebOnlyOnMobile(key: string, action: string): boolean {
    if (WEB_ONLY_KEYS.has(key) && isMobileDriver()) {
        log.info({ key, action }, 'Skipping — locator is web-only and DRIVER is mobile');
        return true;
    }
    return false;
}

export async function assertUsername(expected: string): Promise<void> {
    if (isApiDriver()) {
        log.info({ expected }, 'assertUsername skipped (api driver)');
        return;
    }
    if (skipIfMobileOnlyOnWeb('profileUsernameText', 'assertUsername')) return;
    const result = await sendIntent(INTENT.READ_TEXT, 'profileUsernameText');
    const actual = (result.payload ?? '').trim();
    if (!actual.toLowerCase().includes(expected.toLowerCase())) {
        throw new Error(
            `[profile] username mismatch — expected to contain "${expected}", got "${actual}".`,
        );
    }
}

// Non-throwing read of the profile card's name text. Returns '' on web (the
// `profileUsernameText` locator is mobile-only) or under api. Used by the
// route to compare the card against a freshly-fetched API full_name with
// retries, since that field is shared+mutable on the demo backend.
export async function readUsernameCardText(): Promise<string> {
    if (isApiDriver()) return '';
    if (skipIfMobileOnlyOnWeb('profileUsernameText', 'readUsernameCardText')) return '';
    const result = await sendIntent(INTENT.READ_TEXT, 'profileUsernameText');
    return (result.payload ?? '').trim();
}

export async function assertPremiumBadgeVisible(): Promise<void> {
    if (isApiDriver()) return;
    if (skipIfMobileOnlyOnWeb('premiumBadgeText', 'assertPremiumBadgeVisible')) return;
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `premiumBadgeText||${PRESENCE_WAIT_MS}`);
}

export async function assertFormInputsVisible(): Promise<void> {
    if (isApiDriver()) return;
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `profileFullNameInput||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `profilePhoneNumberInput||${PRESENCE_WAIT_MS}`);
    if (!skipIfWebOnlyOnMobile('addressInput', 'assertFormInputsVisible.address')) {
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `addressInput||${PRESENCE_WAIT_MS}`);
    }
    // The notes input is the last field; on small mobile screens it sits below
    // the fold, so the visibility check times out (~input-profile-notes "still
    // not displayed after 8000ms") without scrolling. Bring it into view first
    // — mobile only; web shows the whole form at once.
    if (isMobileDriver()) {
        await sendIntent(INTENT.SCROLL_TO, 'notesInput');
    }
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `notesInput||${PRESENCE_WAIT_MS}`);
}

export async function assertFormLabels(labels: {
    fullName: string;
    phone: string;
    address: string;
    notes: string;
}): Promise<void> {
    if (isApiDriver()) {
        log.info(labels, 'assertFormLabels skipped (api driver)');
        return;
    }
    // The label locators only have a `mobile` key per the contract — these
    // scenarios are tagged @android @ios so we expect to be running under
    // a mobile driver here. The locator resolver throws for the missing
    // `web` key under playwright, which is the right failure mode.
    await sendIntent(INTENT.ASSERT_TEXT, `fullNameLabel||${labels.fullName}`);
    await sendIntent(INTENT.ASSERT_TEXT, `phoneNumberLabel||${labels.phone}`);
    await sendIntent(INTENT.ASSERT_TEXT, `addressLabel||${labels.address}`);
    await sendIntent(INTENT.ASSERT_TEXT, `notesLabel||${labels.notes}`);
}

export async function assertProfileFields(values: {
    fullName: string;
    phone: string;
    address: string;
    notes: string;
}): Promise<void> {
    if (isApiDriver()) {
        log.info(values, 'assertProfileFields skipped (api driver)');
        return;
    }
    // Read the input values back. The OmniPizza inputs render `value=…` on
    // web (controlled) and the equivalent RN TextInput value on mobile —
    // READ_TEXT on the testid returns whichever is set.
    await assertInputValue('profileFullNameInput', values.fullName, 'fullName');
    await assertInputValue('profilePhoneNumberInput', values.phone, 'phone');
    if (!skipIfWebOnlyOnMobile('addressInput', 'assertProfileFields.address')) {
        await assertInputValue('addressInput', values.address, 'address');
    }
    await assertInputValue('notesInput', values.notes, 'notes');
}

// Poll-based read. The profile screen's first render mounts the inputs with
// the Zustand store's default empty state — `loadProfile` then resolves
// `GET /api/users/me/profile` and `persist` rehydrates from localStorage,
// both populating the inputs asynchronously. A single READ_TEXT right after
// `waitForProfileScreen` consistently hit that empty window (OmniPizza
// confirmed 2026-05-24; the FE is not buggy, the readiness contract was).
// Poll until the input matches the expected value or we exhaust attempts —
// the empty-window collapses to "first non-empty read"; once non-empty we
// compare strictly.
const READ_POLL_INTERVAL_MS = 250;
const READ_POLL_MAX_ATTEMPTS = 60; // 15 s

async function assertInputValue(key: string, expected: string, label: string): Promise<void> {
    let actual = '';
    for (let attempt = 0; attempt < READ_POLL_MAX_ATTEMPTS; attempt++) {
        const result = await sendIntent(INTENT.READ_TEXT, key);
        actual = (result.payload ?? '').trim();
        if (actual === expected) return;
        // Empty value = still in the pre-hydration window; keep polling.
        // Non-empty but mismatched = real failure; surface immediately so a
        // wrong value doesn't waste the rest of the 15 s budget.
        if (actual.length > 0) break;
        await new Promise((r) => setTimeout(r, READ_POLL_INTERVAL_MS));
    }
    throw new Error(
        `[profile] ${label} mismatch — expected "${expected}", got "${actual}".`,
    );
}

// -- helpers -----------------------------------------------------------

function isApiDriver(): boolean {
    return (process.env.DRIVER ?? 'playwright').toLowerCase() === 'api';
}

async function seedWebPersistedStores(args: {
    market: CountryCode;
    language: LanguageCode;
    token: string;
}): Promise<void> {
    // Mirrors the seed in order_success/molecules/order-success-screen.molecule.ts.
    // Profile lives behind ProtectedRoute too, so the persisted auth + country
    // stores must be primed before NAVIGATE so the page hydrates instead of
    // redirecting to /login.
    const auth = {
        state: { token: args.token, username: 'standard_user', behavior: null },
        version: 0,
    };
    const country = {
        state: {
            countryCode: args.market,
            language: args.language,
            locale: deriveLocale(args.market, args.language),
            currency: deriveCurrency(args.market),
            countryInfo: null,
        },
        version: 0,
    };
    const chLangLine =
        args.market === 'CH'
            ? `localStorage.setItem('chLang', ${JSON.stringify(args.language)});`
            : '';
    const script = `
        localStorage.setItem('token', ${JSON.stringify(args.token)});
        localStorage.setItem('username', 'standard_user');
        localStorage.setItem('countryCode', ${JSON.stringify(args.market)});
        ${chLangLine}
        localStorage.setItem('omnipizza-auth', ${JSON.stringify(JSON.stringify(auth))});
        localStorage.setItem('omnipizza-country', ${JSON.stringify(JSON.stringify(country))});
    `;
    await sendIntent(INTENT.EVALUATE, script);
}

function deriveLocale(market: CountryCode, lang: LanguageCode): string {
    if (market === 'CH') return lang === 'fr' ? 'fr-CH' : 'de-CH';
    if (market === 'US') return 'en-US';
    if (market === 'MX') return 'es-MX';
    if (market === 'JP') return 'ja-JP';
    return 'en-US';
}

function deriveCurrency(market: CountryCode): string {
    switch (market) {
        case 'US': return 'USD';
        case 'MX': return 'MXN';
        case 'CH': return 'CHF';
        case 'JP': return 'JPY';
        default: return 'USD';
    }
}
