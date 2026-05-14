import { sendIntent } from '@kernel/client';
import { logger } from '@utils/logger';
import { INTENT } from '@kernel/intents';
import { UsersDataSource } from '@core/test-data/users.data-source';
import { LoginDao } from '@core/tests/login/dao/login.dao';
import { openLoginScreen } from '@core/tests/login/molecules/login-navigation.molecule';
import {
    selectMarket,
    selectLanguage,
    assertWelcomeTitle,
    assertSubtitle,
} from '@core/tests/login/molecules/login-market.molecule';
import {
    submitCredentials,
    assertLogoutLabel,
} from '@core/tests/login/molecules/login-session.molecule';
import type { CheckoutWorld } from '@core/tests/support/world';

const log = logger.child({ layer: 'route', domain: 'login' });

type Driver = 'playwright' | 'appium' | 'mobilewright' | 'api';

// CH is the only market with a runtime language picker — see
// `switzerlandLanguageList` in login.locators.json.
const MARKET_WITH_LANGUAGE_PICKER = 'CH';

export class LoginRoute {
    private readonly users: UsersDataSource;
    private readonly loginDao: LoginDao;

    constructor(private readonly world: CheckoutWorld) {
        this.users = new UsersDataSource();
        this.loginDao = new LoginDao();
    }

    async openLoginScreen(): Promise<void> {
        log.info({ driver: this.driver }, 'Opening login screen');
        await openLoginScreen();
    }

    async selectMarket(marketCode: string): Promise<void> {
        const market = marketCode.toUpperCase();
        log.info({ marketCode: market, driver: this.driver }, 'Selecting market');
        this.rememberMarket(market);
        if (this.driver === 'api') return;
        await selectMarket(market);
    }

    async selectMarketWithLanguage(marketCode: string, language: string): Promise<void> {
        const market = marketCode.toUpperCase();
        log.info({ marketCode: market, language, driver: this.driver }, 'Selecting market + language');
        // CH is the only market with a runtime picker, and that picker lives in
        // the post-login navbar — not on the login screen. We persist the
        // requested language here and apply the click inside loginAs() once
        // the navbar has rendered. Other markets carry an implicit locale.
        this.rememberMarket(market, language);
        if (this.driver === 'api') return;
        await selectMarket(market);
    }

    async loginAs(userAlias: string): Promise<void> {
        log.info({ userAlias, driver: this.driver }, 'Logging in');
        const user = await this.users.getUser(userAlias);

        if (this.driver === 'api') {
            const response = await this.loginDao.login({
                username: user.username,
                email: user.email,
                password: user.password,
            });
            const token = this.loginDao.extractToken(response);
            if (!token) {
                throw new Error(`Login failed for "${userAlias}". No token received.`);
            }
            this.world.auth = {
                userAlias,
                username: user.username,
                password: user.password,
                behavior: user.behavior,
                token,
                loginResponse: response,
            };
            return;
        }

        await submitCredentials(user.username, user.password);
        this.world.auth = {
            userAlias,
            username: user.username,
            password: user.password,
            behavior: user.behavior,
            // No API token here — UI flow only. DAOs that need a token must
            // run a separate Given step that hits LoginDao explicitly.
            loginResponse: {} as never,
        };

        // Apply the CH-only post-login language picker once the navbar is up
        // (submitCredentials already waited on the logout anchor).
        const locale = this.world.locale;
        if (locale?.market === MARKET_WITH_LANGUAGE_PICKER && locale.language) {
            await selectLanguage(locale.language);
        }
    }

    async verifyWelcomeTitle(expected: string): Promise<void> {
        log.info({ expected, driver: this.driver }, 'Asserting welcome title');
        if (this.driver === 'api') {
            log.info({ expected }, 'verifyWelcomeTitle skipped (UI assertion, api driver)');
            return;
        }
        await assertWelcomeTitle(expected);
    }

    async verifySubtitle(expected: string): Promise<void> {
        log.info({ expected, driver: this.driver }, 'Asserting subtitle');
        if (this.driver === 'api') {
            log.info({ expected }, 'verifySubtitle skipped (UI assertion, api driver)');
            return;
        }
        await assertSubtitle(expected);
    }

    async verifyLogoutLabel(expected: string): Promise<void> {
        log.info({ expected, driver: this.driver }, 'Asserting logout label');
        if (this.driver === 'api') {
            // The logout label is a UI string with no API surface today. We
            // record the (market, language, expected) tuple so the run leaves
            // an audit trail; once the backend exposes a localized strings
            // endpoint we can promote this to a real assertion.
            log.info({
                market: this.world.locale?.market,
                language: this.world.locale?.language,
                expected,
            }, 'verifyLogoutLabel skipped (UI assertion, api driver)');
            return;
        }
        await assertLogoutLabel(expected);
    }

    // Reset between scenarios — mirrors CheckoutRoute.resetStrategies.
    private readonly resetStrategies: Record<Driver, () => Promise<void>> = {
        appium: async () => {
            await sendIntent(INTENT.DEEP_LINK, 'omnipizza://login?resetSession=true');
        },
        mobilewright: async () => {
            await sendIntent(INTENT.DEEP_LINK, 'omnipizza://login?resetSession=true');
        },
        playwright: async () => {
            const baseUrl = process.env.BASE_URL;
            if (!baseUrl) return;
            await sendIntent(INTENT.EVALUATE, 'localStorage.clear(); sessionStorage.clear()');
            await sendIntent(INTENT.NAVIGATE, baseUrl);
        },
        api: async () => { /* noop */ },
    };

    async resetClientState(): Promise<void> {
        await this.resetStrategies[this.driver]();
    }

    private get driver(): Driver {
        return (process.env.DRIVER ?? 'playwright') as Driver;
    }

    private rememberMarket(market: string, language?: string): void {
        this.world.locale = {
            market,
            language: language ?? this.world.locale?.language ?? '',
        };
    }
}
