import { logger } from '@utils/logger';

const log = logger.child({ layer: 'support', action: 'warm-up' });

// Render free-tier dynos sleep after inactivity; the first request to a cold
// dyno hangs for tens of seconds while it boots (or returns a 502/503 from the
// edge until the app is listening). Both the OmniPizza frontend (BASE_URL) and
// backend (API_BASE_URL) are deployed this way, so the FIRST scenario of a run
// eats the cold start and intermittently blows the per-step element-wait
// budget (see catalog browse flake, 2026-05-27). Pinging both services once at
// BeforeAll moves that cost off the scenario clock.

const ATTEMPT_TIMEOUT_MS = 60_000; // a cold dyno can hold a request this long
const TOTAL_BUDGET_MS = 120_000;   // give up after this; scenarios still have their own timeouts
const RETRY_DELAY_MS = 3_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * GETs `url` until the dyno responds with any non-5xx status (proof it's awake)
 * or the budget is exhausted. A 401/403/404 counts as "awake" — we only care
 * that the server, not Render's edge, answered. Best-effort: never throws.
 */
async function pingUntilAwake(url: string): Promise<void> {
    const deadline = Date.now() + TOTAL_BUDGET_MS;
    let lastInfo = '';
    while (Date.now() < deadline) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
        try {
            const res = await fetch(url, { method: 'GET', signal: controller.signal });
            if (res.status < 500) {
                log.info({ url, status: res.status }, 'Service awake');
                return;
            }
            lastInfo = `status ${res.status}`;
        } catch (err) {
            lastInfo = (err as Error).message;
        } finally {
            clearTimeout(timer);
        }
        log.warn({ url, lastInfo }, 'Service not ready yet — retrying');
        await sleep(RETRY_DELAY_MS);
    }
    log.warn({ url, lastInfo }, 'Warm-up budget exhausted — proceeding anyway');
}

/**
 * Wakes the OmniPizza frontend + backend before the suite runs. Idempotent and
 * non-fatal: a failure here just means the first scenario pays the cold start,
 * which is the pre-warm-up status quo.
 */
export async function warmUpServices(): Promise<void> {
    const targets: string[] = [];
    if (process.env.BASE_URL) {
        targets.push(process.env.BASE_URL.replace(/\/+$/, ''));
    }
    if (process.env.API_BASE_URL) {
        targets.push(`${process.env.API_BASE_URL.replace(/\/+$/, '')}/api/pizzas`);
    }
    if (targets.length === 0) {
        log.info('No BASE_URL / API_BASE_URL set — skipping warm-up');
        return;
    }
    log.info({ targets }, 'Warming up services before suite');
    await Promise.all(targets.map(pingUntilAwake));
}
