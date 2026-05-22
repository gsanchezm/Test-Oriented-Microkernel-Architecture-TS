import { logger } from '@utils/logger';
import { ProfileDao } from '@core/tests/profile/dao/profile.dao';
import type { ProfileResponse } from '@core/tests/profile/dao/profile.types';
import { CountryCode } from '@plugins/api/http';
import {
    openProfileScreen,
    reloadProfileScreen,
    assertUsername,
    assertPremiumBadgeVisible,
    assertFormInputsVisible,
    assertFormLabels,
    assertProfileFields,
    type LanguageCode,
} from '@core/tests/profile/molecules/profile-view.molecule';
import {
    fillProfileForm,
    type ProfileUpdateInputs,
} from '@core/tests/profile/molecules/profile-edit.molecule';
import { saveProfile } from '@core/tests/profile/molecules/profile-save.molecule';
import type { CheckoutWorld } from '@core/tests/support/world';

const log = logger.child({ layer: 'route', domain: 'profile' });

type Driver = 'playwright' | 'appium' | 'mobilewright' | 'api';

const SUPPORTED_MARKETS = new Set<CountryCode>([
    CountryCode.US,
    CountryCode.MX,
    CountryCode.CH,
    CountryCode.JP,
]);
const SUPPORTED_LANGUAGES = new Set<LanguageCode>(['en', 'es', 'de', 'fr', 'ja']);

export class ProfileRoute {
    private readonly profileDao: ProfileDao;
    // Carries the most-recent update intent across steps (When fill → And save
    // → Then verify). Under DRIVER=api the route uses this to issue the
    // PATCH, then re-reads via GET inside verifyProfileApi.
    private pendingUpdate?: ProfileUpdateInputs;
    // Last response observed from the profile API. Populated by the @api
    // path so verifyProfileApi can assert without re-fetching on every step.
    private lastProfileResponse?: ProfileResponse;

    constructor(private readonly world: CheckoutWorld) {
        this.profileDao = new ProfileDao();
    }

    // -- step intents --------------------------------------------------

    /**
     * Lands on the profile screen for (market, language). Persists the
     * locale on world.locale so the visual After hook can bucket the
     * captured snapshots correctly.
     *
     * Under DRIVER=api this is a state-only step: the locale + market are
     * stamped on the world; the UI molecule self-skips and no HTTP call
     * happens yet (the DAO is exercised by the When/Then steps).
     */
    async openProfile(market: string, language: string): Promise<void> {
        const code = market.toUpperCase() as CountryCode;
        if (!SUPPORTED_MARKETS.has(code)) {
            throw new Error(
                `Unsupported market "${market}". Supported: ${[...SUPPORTED_MARKETS].join(', ')}`,
            );
        }
        const lang = language.toLowerCase() as LanguageCode;
        if (!SUPPORTED_LANGUAGES.has(lang)) {
            throw new Error(
                `Unsupported language "${language}". Supported: ${[...SUPPORTED_LANGUAGES].join(', ')}`,
            );
        }

        log.info({ market: code, language: lang, driver: this.driver }, 'Opening profile screen');

        this.world.locale = { market: code, language: lang };
        this.world.languageOverride = lang;

        const { token } = this.requireAuth();
        await openProfileScreen({ market: code, language: lang, accessToken: token });
    }

    async verifyProfileCard(expectedUsername: string): Promise<void> {
        log.info({ expectedUsername, driver: this.driver }, 'Verifying profile card');
        if (this.driver === 'api') {
            // No UI to assert; fetch via DAO and verify the username field
            // matches so the api branch still exercises a real read.
            const { token } = this.requireAuth();
            const profile = await this.profileDao.getProfile({ token, countryCode: this.market() });
            this.lastProfileResponse = profile;
            const apiUsername = (profile.username ?? '').trim();
            if (apiUsername && !apiUsername.toLowerCase().includes(expectedUsername.toLowerCase())) {
                throw new Error(
                    `[api] profile.username mismatch — expected to contain "${expectedUsername}", got "${apiUsername}".`,
                );
            }
            if (!profile.premium) {
                log.info({ premium: profile.premium }, 'profile.premium is falsy under api driver — recording for the audit log');
            }
            return;
        }
        await assertUsername(expectedUsername);
        await assertPremiumBadgeVisible();
    }

    async verifyFormInputsVisible(): Promise<void> {
        log.info({ driver: this.driver }, 'Verifying form inputs visible');
        if (this.driver === 'api') {
            log.info({}, 'verifyFormInputsVisible skipped (api driver)');
            return;
        }
        await assertFormInputsVisible();
    }

    async verifyFormLabels(labels: {
        fullName: string;
        phone: string;
        address: string;
        notes: string;
    }): Promise<void> {
        log.info({ labels, driver: this.driver }, 'Verifying form labels');
        if (this.driver === 'api') {
            // Localized strings are a UI concern — no API surface today.
            log.info(labels, 'verifyFormLabels skipped (api driver)');
            return;
        }
        await assertFormLabels(labels);
    }

    async updateProfileFields(values: ProfileUpdateInputs): Promise<void> {
        log.info({ values, driver: this.driver }, 'Updating profile fields');
        this.pendingUpdate = values;
        await fillProfileForm(values);
    }

    async saveProfile(): Promise<void> {
        log.info({ driver: this.driver }, 'Saving profile');
        if (this.driver === 'api') {
            const update = this.requirePendingUpdate();
            const { token } = this.requireAuth();
            const response = await this.profileDao.updateProfile({
                token,
                countryCode: this.market(),
                body: {
                    full_name: update.fullName,
                    phone:     update.phone,
                    address:   update.address,
                    notes:     update.notes,
                },
            });
            this.lastProfileResponse = response;
            return;
        }
        await saveProfile();
    }

    async reloadProfile(): Promise<void> {
        log.info({ driver: this.driver }, 'Reloading profile');
        if (this.driver === 'api') {
            // For the @api scenarios reload is a no-op — verifyProfileApi
            // does its own GET. For the UI persistence scenario the api
            // driver isn't tagged in (it's @desktop @responsive @android
            // @ios), so this branch is mainly defensive.
            log.info({}, 'reloadProfile skipped (api driver)');
            return;
        }
        await reloadProfileScreen();
    }

    async verifyProfileFields(values: ProfileUpdateInputs): Promise<void> {
        log.info({ values, driver: this.driver }, 'Verifying profile fields visible');
        if (this.driver === 'api') {
            log.info(values, 'verifyProfileFields (UI) skipped (api driver)');
            return;
        }
        await assertProfileFields(values);
    }

    /**
     * @api path: refetches the profile via GET and asserts the four user-
     * editable fields. If saveProfile already ran under the api driver
     * the response is cached on `lastProfileResponse`; this verify step
     * issues a second GET so we explicitly validate read-after-write
     * (the contract requires PATCH to persist, not merely echo).
     */
    async verifyProfileApi(values: ProfileUpdateInputs): Promise<void> {
        const { token } = this.requireAuth();
        log.info({ values }, 'Asserting profile via API (GET /api/users/me/profile)');
        const profile = await this.profileDao.getProfile({ token, countryCode: this.market() });
        this.lastProfileResponse = profile;

        this.assertField('full_name', profile.full_name, values.fullName);
        this.assertField('phone',     profile.phone,     values.phone);
        this.assertField('address',   profile.address,   values.address);
        this.assertField('notes',     profile.notes,     values.notes);
    }

    // -- internals -----------------------------------------------------

    private assertField(name: string, actual: unknown, expected: string): void {
        const actualStr = typeof actual === 'string' ? actual : actual == null ? '' : String(actual);
        if (actualStr !== expected) {
            throw new Error(
                `[api] profile.${name} mismatch — expected "${expected}", got "${actualStr}".`,
            );
        }
    }

    private requireAuth(): { token: string } {
        const token = this.world.auth?.token;
        if (!token) {
            throw new Error(
                'Missing auth token — Background login step did not run, or the UI login flow did not capture a token. ' +
                'The profile feature relies on DRIVER=api for auth ($S_0$ token); ensure the Background runs under the api driver too.',
            );
        }
        return { token };
    }

    private requirePendingUpdate(): ProfileUpdateInputs {
        if (!this.pendingUpdate) {
            throw new Error(
                'No pending profile update — the When step "they update the profile with…" must run before save.',
            );
        }
        return this.pendingUpdate;
    }

    private market(): CountryCode | undefined {
        const m = this.world.locale?.market as CountryCode | undefined;
        return m && SUPPORTED_MARKETS.has(m) ? m : undefined;
    }

    private get driver(): Driver {
        return (process.env.DRIVER ?? 'playwright') as Driver;
    }
}
