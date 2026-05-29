import { logger } from '@utils/logger';
import { CatalogDao } from '@core/tests/catalog/dao/catalog.dao';
import type {
    CatalogCategory,
    CountryCode,
    Pizza,
} from '@core/tests/catalog/dao/catalog.types';
import {
    assertAddToCartLabelVisible,
    assertCatalogDisplayed,
    assertSectionTitle,
    openCatalogScreen,
    readVisiblePizzaNames,
    type LanguageCode,
} from '@core/tests/catalog/molecules/catalog-browse.molecule';
import {
    clearAllFilters,
    typeSearchQuery,
} from '@core/tests/catalog/molecules/catalog-search.molecule';
import { selectCategory } from '@core/tests/catalog/molecules/catalog-filter.molecule';
import {
    assertBuilderOpen,
    openPizzaCard,
} from '@core/tests/catalog/molecules/catalog-card.molecule';
import type { CheckoutWorld } from '@core/tests/support/world';

const log = logger.child({ layer: 'route', domain: 'catalog' });

export type Driver = 'playwright' | 'appium' | 'mobilewright' | 'api';

// Mirrors OmniPizza's canonical taxonomy (returned per pizza on /api/pizzas
// and exposed by CategoryFilter.jsx). `all` is the no-filter pseudo-bucket;
// the API only ever stamps pizzas with one of `popular | veggie | meat | sides`.
const SUPPORTED_CATEGORIES = new Set<CatalogCategory>(['all', 'popular', 'veggie', 'meat', 'sides']);

// Catalog state lives on the World — `catalog.steps` instantiates a fresh
// CatalogRoute per binding, so instance fields lose their values between
// steps. Same fix as ProfileRoute / PizzaBuilderRoute.
interface CatalogWorldShape extends CheckoutWorld {
    catalogCache?: Pizza[];
    catalogCanonicalCache?: Pizza[];
    catalogLastSearchQuery?: string;
    catalogLastCategory?: CatalogCategory;
    catalogLastOpenedItem?: { id: string; name: string };
}

export class CatalogRoute {
    private readonly catalogDao: CatalogDao;

    constructor(private readonly world: CatalogWorldShape) {
        this.catalogDao = new CatalogDao();
    }

    // -- step intents ---------------------------------------------------

    /**
     * Lands on the catalog for the requested market + language. Populates
     * world.locale and (when the API is reachable) world.orderContext.market
     * so the visual hook's (market, language) bucketing picks the right
     * baseline path. We avoid CheckoutRoute.setMarket on purpose — that
     * helper hits /api/countries to assemble a full orderContext, which is
     * useful for the checkout flow but unnecessary for the catalog (the
     * catalog only needs locale + auth to render).
     */
    async browseCatalog(market: string, language: string): Promise<void> {
        const countryCode = market.toUpperCase() as CountryCode;
        const lang = language.toLowerCase() as LanguageCode;

        log.info({ market: countryCode, language: lang, driver: this.driver }, 'Browsing catalog');

        this.world.locale = { market: countryCode, language: lang };
        this.world.languageOverride = lang;

        const token = this.world.auth?.token;
        if (!token) {
            throw new Error('Missing auth token — Background login step must run before browsing.');
        }

        // Cache the catalog payload for downstream assertions under the api
        // driver. UI drivers also benefit: it gives the route a localized
        // name → id map used by openPizza() so the molecule can click the
        // correct card id (the feature carries the localized DISPLAY name).
        await this.refreshCatalogCache(countryCode, lang, token);

        if (this.driver !== 'api') {
            await openCatalogScreen({
                market: countryCode,
                language: lang,
                accessToken: token,
            });
        }
    }

    async verifyCatalogDisplayed(): Promise<void> {
        log.info({ driver: this.driver }, 'Verifying catalog displayed');
        if (this.driver === 'api') {
            // API-driver equivalent: the cached payload from browseCatalog
            // proves the API surface is "displayed" for this market.
            const cache = this.world.catalogCache;
            if (!cache || cache.length === 0) {
                throw new Error('[api] Catalog API returned no pizzas — cannot consider catalog "displayed".');
            }
            return;
        }
        await assertCatalogDisplayed();
    }

    async verifyAddToCartLabel(label: string): Promise<void> {
        log.info({ label, driver: this.driver }, 'Verifying add-to-cart label');
        if (this.driver === 'api') {
            // UI-only string with no API surface today (the backend ships
            // pizza names + prices but not button labels). Log + continue
            // so the run leaves an audit trail; once a strings endpoint
            // exists we promote this to a real check.
            log.info(
                {
                    market: this.world.locale?.market,
                    language: this.world.locale?.language,
                    label,
                },
                'verifyAddToCartLabel skipped (UI assertion, api driver)',
            );
            return;
        }
        await assertAddToCartLabelVisible(label);
    }

    async verifySectionTitle(title: string): Promise<void> {
        log.info({ title, driver: this.driver }, 'Verifying section title');
        if (this.driver === 'api') {
            log.info({ title }, 'verifySectionTitle skipped (UI assertion, api driver)');
            return;
        }
        await assertSectionTitle(title);
    }

    async searchCatalog(query: string): Promise<void> {
        log.info({ query, driver: this.driver }, 'Searching catalog');
        this.world.catalogLastSearchQuery = query;
        if (this.driver === 'api') return;
        await typeSearchQuery(query);
    }

    async verifySearchResults(query: string): Promise<void> {
        log.info({ query, driver: this.driver }, 'Verifying search results');
        if (this.driver === 'api') {
            const { token, market } = this.requireAuthAndMarket('search verification');
            const filtered = await this.catalogDao.searchPizzasByName({
                token,
                countryCode: market,
                language: this.world.locale?.language,
                query,
            });
            if (filtered.length === 0) {
                throw new Error(
                    `[api] Search for "${query}" returned 0 pizzas for market "${market}".`,
                );
            }
            this.assertAllNamesContain(filtered.map((p) => p.name), query);
            return;
        }
        // UI: read names off the screen and apply the same containment rule.
        const visible = await readVisiblePizzaNames(this.world.catalogCache?.map((p) => p.id));
        if (visible.length === 0) {
            throw new Error(
                `[ui] Catalog search for "${query}" left no pizza cards visible — ` +
                `expected at least one matching card.`,
            );
        }
        this.assertAllNamesContain(visible, query);
    }

    async clearFilters(): Promise<void> {
        log.info({ driver: this.driver }, 'Clearing catalog filters');
        this.world.catalogLastSearchQuery = undefined;
        this.world.catalogLastCategory = undefined;
        if (this.driver === 'api') return;
        await clearAllFilters();
    }

    async verifyFullGridRestored(): Promise<void> {
        log.info({ driver: this.driver }, 'Verifying full catalog restored');
        if (this.driver === 'api') {
            const { token, market } = this.requireAuthAndMarket('full-grid verification');
            const all = await this.catalogDao.getPizzas({
                token,
                countryCode: market,
                language: this.world.locale?.language,
            });
            if (all.length === 0) {
                throw new Error(`[api] Full catalog for "${market}" came back empty.`);
            }
            return;
        }
        const visible = await readVisiblePizzaNames(this.world.catalogCache?.map((p) => p.id));
        // Mobile RN virtualizes the grid — only on-screen cards are in the
        // accessibility tree, so we can't count all baseline pizzas. Assert
        // the grid came back non-empty after clearing the filter.
        if (this.driver === 'appium' || this.driver === 'mobilewright') {
            if (visible.length === 0) {
                throw new Error('[ui] Catalog grid is empty after clearing filters (mobile).');
            }
            return;
        }
        const baselineCount = this.world.catalogCache?.length ?? 0;
        if (baselineCount === 0) {
            // Without a cached baseline we can only assert non-emptiness.
            if (visible.length === 0) {
                throw new Error('[ui] Catalog grid is empty after clearing filters.');
            }
            return;
        }
        if (visible.length < baselineCount) {
            throw new Error(
                `[ui] Catalog grid not fully restored after clearing filters. ` +
                `Visible: ${visible.length}, expected: ${baselineCount}.`,
            );
        }
    }

    async selectCategory(category: string): Promise<void> {
        const normalized = category.toLowerCase();
        log.info({ category: normalized, driver: this.driver }, 'Selecting category');
        if (!SUPPORTED_CATEGORIES.has(normalized as CatalogCategory)) {
            const supported = [...SUPPORTED_CATEGORIES].join(', ');
            throw new Error(`Unsupported category "${category}". Supported: ${supported}`);
        }
        this.world.catalogLastCategory = normalized as CatalogCategory;
        if (this.driver === 'api') return;
        await selectCategory(normalized);
    }

    async verifyCategoryFilter(category: string): Promise<void> {
        const normalized = category.toLowerCase() as CatalogCategory;
        log.info({ category: normalized, driver: this.driver }, 'Verifying category filter');
        if (this.driver === 'api') {
            const { token, market } = this.requireAuthAndMarket('category verification');
            const filtered = await this.catalogDao.filterByCategory({
                token,
                countryCode: market,
                language: this.world.locale?.language,
                category: normalized,
            });
            if (filtered.length === 0) {
                throw new Error(
                    `[api] Category "${normalized}" yielded 0 pizzas for "${market}". ` +
                    `Catalog data may have drifted from the DAO's category heuristic.`,
                );
            }
            // The DAO already filtered the list; nothing further to assert.
            return;
        }
        // UI: read visible names, map each back to the cached catalog payload
        // (which carries the API-provided `category`), assert all match.
        const ids = this.world.catalogCache?.map((p) => p.id);
        const cache = this.world.catalogCache ?? [];
        // Returns a descriptive error for the current visible set, or null when
        // it's a clean match for the requested category.
        const evaluate = (visible: string[]): string | null => {
            if (visible.length === 0) {
                return `[ui] Category filter "${normalized}" left no cards visible.`;
            }
            for (const name of visible) {
                const found = cache.find((p) => p.name.toLowerCase() === name.toLowerCase());
                if (!found) {
                    return `[ui] Visible pizza "${name}" is not in the catalog API response — ` +
                        `cache may be stale or the FE rendered a pizza /api/pizzas didn't return.`;
                }
                if (found.category !== normalized) {
                    return `[ui] Pizza "${name}" is visible under category "${normalized}" ` +
                        `but the API stamps it as "${found.category ?? '(unset)'}".`;
                }
            }
            return null;
        };

        // Mobile: the grid re-renders asynchronously after tapping a category,
        // so an immediate read can catch pre-filter (stale) or mid-unmount
        // (empty) cards. Poll until the visible set is a clean match.
        if (this.driver === 'appium' || this.driver === 'mobilewright') {
            let lastErr: string | null = null;
            for (let attempt = 0; attempt < 12; attempt++) {
                lastErr = evaluate(await readVisiblePizzaNames(ids));
                if (!lastErr) return;
                await new Promise((r) => setTimeout(r, 500));
            }
            throw new Error(lastErr ?? `[ui] Category filter "${normalized}" did not settle.`);
        }

        const err = evaluate(await readVisiblePizzaNames(ids));
        if (err) throw new Error(err);
    }

    async openPizza(itemDisplayName: string): Promise<void> {
        log.info({ item: itemDisplayName, driver: this.driver }, 'Opening pizza card');
        const id = this.resolvePizzaId(itemDisplayName);
        this.world.catalogLastOpenedItem = { id, name: itemDisplayName };
        if (this.driver === 'api') return;
        await openPizzaCard(id);
    }

    async verifyBuilderDisplayed(itemDisplayName: string): Promise<void> {
        log.info({ item: itemDisplayName, driver: this.driver }, 'Verifying builder displayed');
        if (this.driver === 'api') {
            // No UI builder under api — but `openPizza` already validated
            // the item exists in the catalog. Surface that fact here so the
            // step still has something to assert.
            const last = this.world.catalogLastOpenedItem;
            if (!last || last.name.toLowerCase() !== itemDisplayName.toLowerCase()) {
                throw new Error(
                    `[api] Cannot verify builder for "${itemDisplayName}" — ` +
                    `no matching openPizza step was run, or item names diverged.`,
                );
            }
            return;
        }
        const id = this.world.catalogLastOpenedItem?.id ?? this.resolvePizzaId(itemDisplayName);
        await assertBuilderOpen(id);
    }

    // -- internals ------------------------------------------------------

    // Caches and per-scenario state are hung off the World (CatalogWorldShape)
    // because `catalog.steps` instantiates a fresh CatalogRoute per binding
    // — instance fields would be lost between `browse` and any downstream
    // step. The canonical (X-Language=en) cache shadows the localized one
    // so name lookups recover the right id when the FE returns translated
    // names (MX "Margarita" / JP "マルゲリータ" → still resolves to p01).

    private get driver(): Driver {
        return (process.env.DRIVER ?? 'playwright') as Driver;
    }

    private requireAuthAndMarket(stage: string): { token: string; market: CountryCode } {
        const token = this.world.auth?.token;
        if (!token) throw new Error(`Missing auth token at "${stage}" stage. Run login step first.`);
        const market = this.world.locale?.market as CountryCode | undefined;
        if (!market) throw new Error(`Missing market context at "${stage}" stage. Run browse step first.`);
        return { token, market };
    }

    private async refreshCatalogCache(
        market: CountryCode,
        language: LanguageCode,
        token: string,
    ): Promise<void> {
        try {
            this.world.catalogCache = await this.catalogDao.getPizzas({
                token,
                countryCode: market,
                language,
            });
        } catch (err) {
            // Under DRIVER=playwright the catalog UI can still render via
            // pre-seeded localStorage even if the API request fails (e.g.
            // CORS quirks in a local dev env). Log + continue so the UI
            // path still has a chance; the api driver will surface the
            // problem at the first assertion.
            log.warn(
                { err: (err as Error).message, market, language },
                'CatalogDao.getPizzas failed during cache refresh',
            );
            this.world.catalogCache = undefined;
        }
        if (language === 'en') {
            this.world.catalogCanonicalCache = this.world.catalogCache;
            return;
        }
        try {
            this.world.catalogCanonicalCache = await this.catalogDao.getPizzas({
                token,
                countryCode: market,
                language: 'en' as LanguageCode,
            });
        } catch {
            this.world.catalogCanonicalCache = undefined;
        }
    }

    /**
     * Resolves the API pizza id for a feature-supplied display name. Walks
     * the localized cache first (the user sees those names on the page);
     * when the feature carries a canonical English name that the localized
     * catalog has translated (MX: "Margarita" vs feature "Margherita";
     * JP: "ペパロニ" vs feature "Pepperoni"), falls back to the canonical
     * English cache. Ids (p01..p12) are stable cross-market, so the id we
     * recover from the canonical cache is the right one to use for the
     * current market's request.
     */
    private resolvePizzaId(displayName: string): string {
        const needle = displayName.toLowerCase();
        const localized = this.world.catalogCache ?? [];
        const hit = localized.find((p) => p.name.toLowerCase() === needle);
        if (hit) return hit.id;
        const canonical = this.world.catalogCanonicalCache ?? [];
        const canonicalHit = canonical.find((p) => p.name.toLowerCase() === needle);
        if (canonicalHit) return canonicalHit.id;
        const available = [...localized, ...canonical].map((p) => p.name).join(', ');
        throw new Error(
            `Pizza "${displayName}" not found in catalog cache. Available: ${available}`,
        );
    }

    private assertAllNamesContain(names: string[], query: string): void {
        const needle = query.toLowerCase();
        const offenders = names.filter((n) => !n.toLowerCase().includes(needle));
        if (offenders.length > 0) {
            throw new Error(
                `Catalog still shows pizzas not matching "${query}": ${JSON.stringify(offenders)}`,
            );
        }
    }
}
