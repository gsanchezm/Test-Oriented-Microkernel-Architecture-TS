import { HttpClient } from '@plugins/api/http';
import type {
    CatalogCategory,
    CatalogDaoOptions,
    CatalogResponse,
    CountryCode,
    Pizza,
} from '@core/tests/catalog/dao/catalog.types';

const PIZZAS_PATH = '/api/pizzas';

// Overrides HttpClient's default. Must stay ≥45s — Render free tier cold
// starts take 30–45s when the instance has been idle.
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Thin client over the Pizzas catalog API.
 *
 * The /api/pizzas endpoint already exists per CheckoutDao (it's the same
 * endpoint that backs the cart-selection step). Exposing it again here lets
 * the catalog slice exercise the catalog as an API surface in its own right —
 * the route uses this for the DRIVER=api code path and to power the
 * "filter / search" assertions when the UI is not available.
 */
export class CatalogDao {
    private readonly httpClient: HttpClient;

    constructor(options: CatalogDaoOptions = {}) {
        const apiBaseUrl = options.baseUrl ?? process.env.API_BASE_URL?.replace(/\/+$/, '');
        if (!apiBaseUrl) {
            throw new Error('Missing required env var: API_BASE_URL');
        }

        this.httpClient = new HttpClient({
            baseUrl: apiBaseUrl,
            timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            fetchImpl: options.fetchImpl,
        });
    }

    /**
     * Returns the catalog for a market as an unwrapped Pizza[].
     *
     * The backend keys the catalog off the `x-country-code` header (verified
     * via CheckoutDao); language is forwarded so localized names come back
     * in the active locale.
     */
    async getPizzas(params: {
        token: string;
        countryCode: CountryCode;
        language?: string;
    }): Promise<Pizza[]> {
        const response = await this.httpClient.get<CatalogResponse>(PIZZAS_PATH, {
            headers: this.authHeaders(params.token, params.countryCode, {
                'X-Language': params.language ?? process.env.LANGUAGE ?? 'en',
            }),
        });
        return response.pizzas;
    }

    /**
     * Case-insensitive name search. Mirrors what the UI's search bar does
     * (substring match on the localized pizza name) so the api driver can
     * assert against the same filtered set the UI would render.
     */
    async searchPizzasByName(params: {
        token: string;
        countryCode: CountryCode;
        language?: string;
        query: string;
    }): Promise<Pizza[]> {
        const all = await this.getPizzas({
            token: params.token,
            countryCode: params.countryCode,
            language: params.language,
        });
        const needle = params.query.trim().toLowerCase();
        if (!needle) return all;
        return all.filter((p) => p.name.toLowerCase().includes(needle));
    }

    /**
     * Filter the catalog by logical category. The backend doesn't yet ship a
     * `category` field on Pizza, so the DAO maps each item to a bucket via
     * its localized name. This is the single translation point: when the
     * backend exposes a real category column, swap the mapping here and
     * every caller (route + molecules + the catalog-load gatling sim) keeps
     * working.
     */
    async filterByCategory(params: {
        token: string;
        countryCode: CountryCode;
        language?: string;
        category: CatalogCategory;
    }): Promise<Pizza[]> {
        const all = await this.getPizzas({
            token: params.token,
            countryCode: params.countryCode,
            language: params.language,
        });
        return all.filter((p) => CatalogDao.categoryOf(p) === params.category);
    }

    /**
     * Localized-name → bucket heuristic. Static + exported via the static
     * method so molecules can call it without instantiating the DAO.
     *
     * The Latin pizzas (Pepperoni, Margherita, Marinara, etc.) map to their
     * traditional buckets; the wider menu is treated as `premium` by default
     * so a new SKU lands in a bucket without flipping any test red.
     */
    static categoryOf(pizza: Pizza): CatalogCategory {
        const name = pizza.name.toLowerCase();
        // Vegetarian first — "Margherita" is also "classic" historically, but
        // the catalog feature treats Margherita as the canonical vegetarian
        // example for the CH/DE row, so we honor that bucketing.
        if (
            name.includes('margherita') ||
            name.includes('marinara') ||
            name.includes('veggie') ||
            name.includes('vegetarian')
        ) {
            return 'vegetarian';
        }
        if (
            name.includes('pepperoni') ||
            name.includes('hawaiian') ||
            name.includes('cheese')
        ) {
            return 'classic';
        }
        return 'premium';
    }

    private authHeaders(
        token: string,
        countryCode: CountryCode,
        extra: Record<string, string> = {},
    ): Record<string, string> {
        return {
            Authorization: `Bearer ${token}`,
            'x-country-code': countryCode,
            ...extra,
        };
    }
}
