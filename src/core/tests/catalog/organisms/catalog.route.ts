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

const SUPPORTED_CATEGORIES = new Set<CatalogCategory>(['classic', 'vegetarian', 'premium']);

export class CatalogRoute {
    private readonly catalogDao: CatalogDao;

    constructor(private readonly world: CheckoutWorld) {
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
            const cache = this.catalogCache;
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
        this.lastSearchQuery = query;
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
        // UI: read names off the DOM and apply the same containment rule.
        const visible = await readVisiblePizzaNames();
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
        this.lastSearchQuery = undefined;
        this.lastCategory = undefined;
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
        const visible = await readVisiblePizzaNames();
        const baselineCount = this.catalogCache?.length ?? 0;
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
        this.lastCategory = normalized as CatalogCategory;
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
        // UI: walk the DOM names and apply the same heuristic via the DAO.
        const visible = await readVisiblePizzaNames();
        if (visible.length === 0) {
            throw new Error(
                `[ui] Category filter "${normalized}" left no cards visible.`,
            );
        }
        for (const name of visible) {
            const bucket = CatalogDao.categoryOf({
                id: '', name, description: '', price: 0, base_price: 0,
                currency: '', currency_symbol: '', image: '',
            });
            if (bucket !== normalized) {
                throw new Error(
                    `[ui] Pizza "${name}" is visible under category "${normalized}" ` +
                    `but maps to "${bucket}".`,
                );
            }
        }
    }

    async openPizza(itemDisplayName: string): Promise<void> {
        log.info({ item: itemDisplayName, driver: this.driver }, 'Opening pizza card');
        const id = this.resolvePizzaId(itemDisplayName);
        this.lastOpenedItem = { id, name: itemDisplayName };
        if (this.driver === 'api') return;
        await openPizzaCard(id);
    }

    async verifyBuilderDisplayed(itemDisplayName: string): Promise<void> {
        log.info({ item: itemDisplayName, driver: this.driver }, 'Verifying builder displayed');
        if (this.driver === 'api') {
            // No UI builder under api — but `openPizza` already validated
            // the item exists in the catalog. Surface that fact here so the
            // step still has something to assert.
            const last = this.lastOpenedItem;
            if (!last || last.name.toLowerCase() !== itemDisplayName.toLowerCase()) {
                throw new Error(
                    `[api] Cannot verify builder for "${itemDisplayName}" — ` +
                    `no matching openPizza step was run, or item names diverged.`,
                );
            }
            return;
        }
        const id = this.lastOpenedItem?.id ?? this.resolvePizzaId(itemDisplayName);
        await assertBuilderOpen(id);
    }

    // -- internals ------------------------------------------------------

    // Per-scenario caches, refreshed by browseCatalog. Plain fields (not
    // world-bound) because the catalog data is route-internal — the World
    // interface stays slim. If a future scenario needs to read these
    // across steps from outside the route, promote them to world.* fields.
    private catalogCache: Pizza[] | undefined;
    private lastSearchQuery: string | undefined;
    private lastCategory: CatalogCategory | undefined;
    private lastOpenedItem: { id: string; name: string } | undefined;

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
            this.catalogCache = await this.catalogDao.getPizzas({
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
            this.catalogCache = undefined;
        }
    }

    /**
     * Resolves the API pizza id for a localized display name. Walks the
     * cached catalog payload first; if the cache is empty or the name
     * doesn't match, falls back to a slug derived from the display name
     * (lowercase, spaces → hyphens). The slug fallback keeps the UI path
     * working when the API was unreachable during browseCatalog.
     */
    private resolvePizzaId(displayName: string): string {
        const cache = this.catalogCache ?? [];
        const hit = cache.find(
            (p) => p.name.toLowerCase() === displayName.toLowerCase(),
        );
        if (hit) return hit.id;
        // Fallback: the OmniPizza backend uses lowercased pizza names as ids
        // (verified via /api/pizzas) — `Pepperoni` → `pepperoni`. Strip
        // diacritics + replace non-alphanum with hyphens to stay robust.
        return displayName
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
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
