import { sendIntent } from '@kernel/client';
import { logger } from '@utils/logger';
import { INTENT } from '@kernel/intents';
import { UsersDataSource } from '@core/test-data/users.data-source';
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

export class LoginRoute {
    private readonly users: UsersDataSource;

    constructor(private readonly world: CheckoutWorld) {
        this.users = new UsersDataSource();
    }

    async openLoginScreen(): Promise<void> {
        log.info('Opening login screen');
        await openLoginScreen();
    }

    async selectMarket(marketCode: string): Promise<void> {
        log.info({ marketCode }, 'Selecting market');
        await selectMarket(marketCode);
    }

    async selectMarketWithLanguage(marketCode: string, language: string): Promise<void> {
        log.info({ marketCode, language }, 'Selecting market + language');
        await selectMarket(marketCode);
        await selectLanguage(language);
    }

    async loginAs(userAlias: string): Promise<void> {
        log.info({ userAlias }, 'Logging in via UI');
        const user = await this.users.getUser(userAlias);
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
    }

    async verifyWelcomeTitle(expected: string): Promise<void> {
        log.info({ expected }, 'Asserting welcome title');
        await assertWelcomeTitle(expected);
    }

    async verifySubtitle(expected: string): Promise<void> {
        log.info({ expected }, 'Asserting subtitle');
        await assertSubtitle(expected);
    }

    async verifyLogoutLabel(expected: string): Promise<void> {
        log.info({ expected }, 'Asserting logout label');
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
}
