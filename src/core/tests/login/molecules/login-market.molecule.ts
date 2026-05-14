import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';

const MARKET_LOCATOR_BY_CODE: Record<string, string> = {
    US: 'marketButtonUS',
    MX: 'marketButtonMX',
    CH: 'marketButtonCH',
    JP: 'marketButtonJP',
};

const LANGUAGE_LOCATOR_BY_NAME: Record<string, string> = {
    english:  'languageButtonEnglish',
    spanish:  'languageButtonSpanish',
    german:   'languageButtonGerman',
    french:   'languageButtonFrench',
    japanese: 'languageButtonJapanese',
};

export async function selectMarket(marketCode: string): Promise<void> {
    const key = MARKET_LOCATOR_BY_CODE[marketCode.toUpperCase()];
    if (!key) {
        const supported = Object.keys(MARKET_LOCATOR_BY_CODE).join(', ');
        throw new Error(`Unsupported market "${marketCode}". Supported: ${supported}`);
    }
    await sendIntent(INTENT.CLICK, key);
}

export async function selectLanguage(language: string): Promise<void> {
    const key = LANGUAGE_LOCATOR_BY_NAME[language.toLowerCase()];
    if (!key) {
        const supported = Object.keys(LANGUAGE_LOCATOR_BY_NAME).join(', ');
        throw new Error(`Unsupported language "${language}". Supported: ${supported}`);
    }
    await sendIntent(INTENT.CLICK, key);
}

export async function assertWelcomeTitle(expected: string): Promise<void> {
    await sendIntent(INTENT.ASSERT_TEXT, `welcomeTitleText||${expected}`);
}

export async function assertSubtitle(expected: string): Promise<void> {
    await sendIntent(INTENT.ASSERT_TEXT, `subtitleText||${expected}`);
}
