import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';
import type { CountryCode } from '@core/tests/checkout/dao/checkout.types';

const log = logger.child({ layer: 'molecule', action: 'catalog-browse' });

// The catalog screen is the post-login landing page on web. We seed the
// Zustand-persisted localStorage keys (`omnipizza-auth`, `omnipizza-country`,
// plus the loose `token`/`countryCode`/`chLang` entries the app reads
// imperatively) and then NAVIGATE to BASE_URL. Mirrors the order-success
// seedWebPersistedStores pattern (see order-success-screen.molecule.ts).
// Mobile path is a deep link with `accessToken` + `market` (+ `lang` for CH).
const CATALOG_WAIT_TARGET = 'catalogScreen';
const CATALOG_WAIT_TIMEOUT_MS = 30_000;

export type LanguageCode = 'en' | 'es' | 'de' | 'fr' | 'ja';

interface OpenCatalogArgs {
    market: CountryCode;
    language: LanguageCode;
    accessToken: string;
}

/**
 * Lands directly on the catalog screen.
 *
 * Driver dispatch:
 *  - api: no-op (the route uses CatalogDao to assert against the API surface
 *    instead of the UI).
 *  - appium / mobilewright: deep link `omnipizza://catalog?...` carrying the
 *    market + language + token. The app's deep-link handler hydrates the
 *    Zustand auth + country stores from the params, then navigates to the
 *    catalog tab. CH needs an explicit `lang` param because that's the only
 *    market with a runtime language picker (verified via login slice).
 *  - playwright: seed localStorage + NAVIGATE to BASE_URL. The SPA's
 *    post-login home view IS the catalog, so the root path is the right
 *    landing target.
 */
export async function openCatalogScreen(args: OpenCatalogArgs): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();

    if (driver === 'api') {
        log.info({ market: args.market, language: args.language }, 'Catalog open no-op (api driver)');
        return;
    }

    if (driver === 'appium' || driver === 'mobilewright') {
        const params = new URLSearchParams({
            market: args.market,
            accessToken: args.accessToken,
        });
        if (needsLangParam(args.market, args.language)) {
            params.set('lang', args.language);
        }
        const url = `omnipizza://catalog?${params.toString()}`;
        log.info({ market: args.market, language: args.language }, 'Deep linking to catalog');
        await sendIntent(INTENT.DEEP_LINK, url);
        await sendIntent(
            INTENT.WAIT_FOR_ELEMENT,
            `${CATALOG_WAIT_TARGET}||${CATALOG_WAIT_TIMEOUT_MS}`,
        );
        return;
    }

    // playwright
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        throw new Error('Missing required env var: BASE_URL');
    }
    const root = baseUrl.replace(/\/+$/, '');

    // Prime the origin before seeding localStorage — about:blank has no
    // localStorage scope (EVALUATE throws SecurityError there). Same dance
    // the order_success slice runs through.
    log.info({ baseUrl: root }, 'Priming origin before localStorage seed');
    await sendIntent(INTENT.NAVIGATE, root);
    await seedWebPersistedStores({
        market: args.market,
        language: args.language,
        token: args.accessToken,
    });

    // After seeding, navigate again so the boot-time hydration picks up the
    // freshly-written stores. The catalog renders on this second navigation.
    log.info({ market: args.market, language: args.language }, 'Navigating to catalog (web)');
    await sendIntent(INTENT.NAVIGATE, root);
    await sendIntent(
        INTENT.WAIT_FOR_ELEMENT,
        `${CATALOG_WAIT_TARGET}||${CATALOG_WAIT_TIMEOUT_MS}`,
    );
}

/**
 * Asserts that the catalog screen rendered. Used by the "catalog is fully
 * displayed" Then step.
 */
export async function assertCatalogDisplayed(): Promise<void> {
    await sendIntent(
        INTENT.WAIT_FOR_ELEMENT,
        `${CATALOG_WAIT_TARGET}||${CATALOG_WAIT_TIMEOUT_MS}`,
    );
}

/**
 * Reads the JSON-serialized list of currently-rendered pizza card names off
 * the DOM. Used by the "only pizzas containing X" / "only category X" Then
 * steps so the assertion can compare against a structured set rather than a
 * single text blob.
 *
 * The script reads every `[data-testid^='pizza-name-']` element's text. The
 * locator JSON describes the same pattern via `pizzaName` / `pizzaCardList`,
 * but the resolver returns a raw selector for a `pizzaCard` key (not the
 * substituted form), so the molecule shapes the query inline. Mobile path
 * uses an equivalent UiSelector + iOS class-chain probe; the route gates
 * mobile out via the UI driver check.
 */
export async function readVisiblePizzaNames(): Promise<string[]> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'api') {
        // The route handles api-driver assertions via CatalogDao; this
        // molecule never gets called on that path. Defensive return.
        return [];
    }
    if (driver === 'appium' || driver === 'mobilewright') {
        // Mobile carries the names via `~text-pizza-name-{id}` accessibility
        // ids. There's no INTENT to list-by-pattern on Appium, and the
        // catalog feature's mobile UI assertion concerns are covered by the
        // direct ASSERT_TEXT on `addToCartLabel` and `sectionTitleText`. The
        // route gates this molecule out of mobile paths.
        return [];
    }
    const script = `JSON.stringify(
        Array.from(document.querySelectorAll("[data-testid^='pizza-name-']"))
            .map((el) => (el.textContent ?? '').trim())
            .filter((s) => s.length > 0),
    )`;
    const result = await sendIntent(INTENT.EVALUATE, script);
    try {
        const parsed = JSON.parse(result.payload ?? '[]');
        return Array.isArray(parsed) ? parsed.map((s) => String(s)) : [];
    } catch {
        return [];
    }
}

/**
 * Asserts the localized add-to-cart label is visible on at least one pizza
 * card. The locator key `addToCartLabel` is mobile-only (the web cards
 * embed the label inside the `addToCartButton`), so the assertion picks the
 * appropriate strategy at runtime.
 */
export async function assertAddToCartLabelVisible(label: string): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'appium' || driver === 'mobilewright') {
        // Mobile cards expose the label as `~text-add-pizza-{id}`; we can't
        // template here, so probe the first card's label via a partial match.
        // The route's caller knows the catalog has at least one pizza.
        const probe = '~text-add-pizza-pepperoni'; // arbitrary anchor; the
        // assertion is "ANY card carries this label", so any visible card
        // with the localized text satisfies it. If the demo backend's pizza
        // ids drift we revisit; the locator key intent is documented above.
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${probe}||5000`);
        await sendIntent(INTENT.ASSERT_TEXT, `${probe}||${label}`);
        return;
    }
    // Web: the per-card add-to-cart control is an icon-only "+" button (no
    // text node, no aria-label — by design, confirmed by OmniPizza on
    // 2026-05-24). The localized "Add to cart" / "Agregar" / "Hinzufügen" /
    // "Ajouter" / "追加" string lives on the customizer modal's primary CTA
    // (`[data-testid='confirm-add-to-cart']`). To verify the label we have
    // to open the modal — pick the first visible pizza card, click it, read
    // the modal's button text, assert, then close the modal so the visual
    // After hook captures the catalog and not a leftover modal.
    // testid shape is add-to-cart-<id>-<viewport> — strip both ends.
    const firstIdScript = `(() => {
        const el = document.querySelector("[data-testid^='add-to-cart-']");
        if (!el) return '';
        const tid = el.getAttribute('data-testid') || '';
        return tid.replace(/^add-to-cart-/, '').replace(/-(desktop|responsive)$/, '');
    })()`;
    const idResult = await sendIntent(INTENT.EVALUATE, firstIdScript);
    const pizzaId = (idResult.payload ?? '').trim();
    if (!pizzaId) {
        throw new Error(
            '[catalog] no pizza card found to open — addToCartLabel assertion needs at least one rendered card.',
        );
    }

    await openPizzaCardById(pizzaId);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `confirmAddToCartButton||${CATALOG_WAIT_TIMEOUT_MS}`);

    const readResult = await sendIntent(INTENT.READ_TEXT, 'confirmAddToCartButton');
    const actual = (readResult.payload ?? '').trim();
    const wanted = label.trim();

    // Close the modal before returning so the next assertion / visual snapshot
    // doesn't see a leftover overlay. Try the dedicated close button first;
    // if that testid isn't present, dispatch an Escape key as a fallback
    // (the OmniPizza modal binds Escape → close). Both are best-effort —
    // the assertion result is what matters and the next scenario re-NAVIGATEs.
    await sendIntent(INTENT.CLICK, 'closeBuilderButton').catch(async () => {
        await sendIntent(
            INTENT.EVALUATE,
            "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }))",
        ).catch(() => { /* best-effort */ });
    });

    if (!actual.includes(wanted)) {
        throw new Error(
            `[catalog] add-to-cart label "${wanted}" not found on confirm-add-to-cart button. ` +
            `Modal button text: "${actual}".`,
        );
    }
}

// Click the catalog card's "+" button by pizza id. Inlined here (rather than
// importing from catalog-card.molecule) to keep this molecule callable from
// the catalog feature's "label visible" Then step without a circular import.
async function openPizzaCardById(id: string): Promise<void> {
    const viewport = (process.env.VIEWPORT ?? 'desktop').toLowerCase();
    const suffix = viewport === 'responsive' ? 'responsive' : 'desktop';
    await sendIntent(INTENT.CLICK, `[data-testid='add-to-cart-${id}-${suffix}']`);
}

/**
 * Asserts the localized section title (e.g. "Pizzas", "Pizzen", "ピザ") is
 * visible. The `sectionTitleText` locator is mobile-only in the contract
 * (the web layout doesn't expose a single section header testid), so on
 * web we probe the document for the heading text directly.
 */
export async function assertSectionTitle(title: string): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'appium' || driver === 'mobilewright') {
        await sendIntent(INTENT.ASSERT_TEXT, `sectionTitleText||${title}`);
        return;
    }
    // Web: scan all headings for the localized text.
    const escaped = title.replace(/'/g, "\\'");
    const script = `(() => {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
        return headings.some((h) => (h.textContent ?? '').trim().includes('${escaped}'));
    })()`;
    const result = await sendIntent(INTENT.EVALUATE, script);
    if ((result.payload ?? '').trim() !== 'true') {
        throw new Error(`[catalog] section title "${title}" not found in any heading`);
    }
}

// -- helpers ----------------------------------------------------------------

function needsLangParam(market: CountryCode, lang: LanguageCode): boolean {
    // CH is the only market that exposes a runtime language picker (DE/FR);
    // other markets carry an implicit locale derived from `market` alone.
    // Mirrors the rule in order-success-screen.molecule.ts.
    return market === 'CH' && (lang === 'de' || lang === 'fr');
}

async function seedWebPersistedStores(args: {
    market: CountryCode;
    language: LanguageCode;
    token: string;
}): Promise<void> {
    const auth = {
        state: {
            token: args.token,
            username: 'standard_user',
            behavior: null,
        },
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
