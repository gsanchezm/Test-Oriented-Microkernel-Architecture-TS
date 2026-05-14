import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';

const SUPPORTED_MARKETS = ['US', 'MX', 'CH', 'JP'] as const;

// CH is the only market whose login screen exposes a runtime language picker
// (Swiss reality: DE + FR coexist). Other markets default to a single locale
// and never render the picker, so the route gates the selectLanguage call.
const CH_LANGUAGE_CODE_BY_NAME: Record<string, 'de' | 'fr'> = {
    german: 'de',
    french: 'fr',
};

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}

// Contract entries `marketButtonList` / `switzerlandLanguageList` describe the
// whole row of buttons; the molecule disambiguates by suffix at runtime so we
// don't have to maintain N near-identical locator keys.
function marketButtonSelector(marketCode: string): string {
    return isMobileDriver()
        ? `~btn-market-${marketCode}`
        : `[data-testid='market-${marketCode}']`;
}

function switzerlandLanguageSelector(language: string): string {
    const code = CH_LANGUAGE_CODE_BY_NAME[language.toLowerCase()];
    if (!code) {
        const supported = Object.keys(CH_LANGUAGE_CODE_BY_NAME)
            .map((s) => s[0].toUpperCase() + s.slice(1))
            .join(', ');
        throw new Error(`Unsupported CH language "${language}". Supported: ${supported}`);
    }
    return isMobileDriver()
        ? `~btn-lang-${code}`
        : `[data-testid='lang-${code}']`;
}

export async function selectMarket(marketCode: string): Promise<void> {
    const code = marketCode.toUpperCase();
    if (!SUPPORTED_MARKETS.includes(code as typeof SUPPORTED_MARKETS[number])) {
        throw new Error(`Unsupported market "${marketCode}". Supported: ${SUPPORTED_MARKETS.join(', ')}`);
    }
    await sendIntent(INTENT.CLICK, marketButtonSelector(code));
}

export async function selectLanguage(language: string): Promise<void> {
    await sendIntent(INTENT.CLICK, switzerlandLanguageSelector(language));
}

export async function assertWelcomeTitle(expected: string): Promise<void> {
    await sendIntent(INTENT.ASSERT_TEXT, `welcomeTitleText||${expected}`);
}

export async function assertSubtitle(expected: string): Promise<void> {
    await sendIntent(INTENT.ASSERT_TEXT, `subtitleText||${expected}`);
}
