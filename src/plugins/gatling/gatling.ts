import { simulation, scenario, atOnceUsers, rampUsers, constantUsersPerSec } from '@gatling.io/core';
import { http } from '@gatling.io/http';
import { logger } from '../../utils/logger';

// --- Types ---

type PerfHandler = (target: string) => Promise<string>;

const ACTION_TYPE_SEPARATOR = '||';

// --- Injection Profile Parsers ---

const INJECTION_PROFILES: Record<string, (params: Record<string, string>) => any> = {
    ramp: (p) => rampUsers(parseInt(p.users)).during(parseInt(p.duration)),
    constant: (p) => constantUsersPerSec(parseInt(p.users)).during(parseInt(p.duration)),
    atonce: (p) => atOnceUsers(parseInt(p.users)),
};

function parseInjectionProfile(profileSettings: string) {
    const params = Object.fromEntries(
        profileSettings.split(ACTION_TYPE_SEPARATOR).map((p) => p.split('=')),
    );

    const profileType = (params.profile || 'ramp').toLowerCase();
    const profileFactory = INJECTION_PROFILES[profileType];

    if (!profileFactory) {
        throw new Error(
            `Unknown injection profile: "${profileType}". Supported: ${Object.keys(INJECTION_PROFILES).join(', ')}`,
        );
    }

    return profileFactory(params);
}

// --- Intent → Handler Map ---

const actionHandlers: ReadonlyMap<string, PerfHandler> = new Map([
    [
        'SCENARIO_LOAD',
        async (config: string) => {
            // config format: "baseUrl||scenarioName||endpoint"
            const [baseUrl, name, endpoint] = config.split(ACTION_TYPE_SEPARATOR);

            if (!baseUrl || !name || !endpoint) {
                throw new Error("SCENARIO_LOAD requires 'baseUrl||scenarioName||endpoint' format.");
            }

            scenario(name).exec(http('request').get(endpoint));

            logger.info(`[Gatling] Scenario "${name}" loaded: ${baseUrl}${endpoint}`);
            return `Scenario "${name}" loaded against ${baseUrl}${endpoint}`;
        },
    ],
    [
        'INJECT_LOAD',
        async (profileSettings: string) => {
            // profileSettings: "users=100||duration=60||profile=ramp"
            parseInjectionProfile(profileSettings);
            logger.info(`[Gatling] Injection profile configured: ${profileSettings}`);
            return `Load injection configured: ${profileSettings}`;
        },
    ],
    [
        'RUN_SIMULATION',
        async (config: string) => {
            // config format: "baseUrl||scenarioName||endpoint||users=N||duration=N||profile=ramp"
            const parts = config.split(ACTION_TYPE_SEPARATOR);

            if (parts.length < 3) {
                throw new Error("RUN_SIMULATION requires at least 'baseUrl||scenarioName||endpoint'.");
            }

            const [baseUrl, name, endpoint, ...injectionParts] = parts;
            const injectionConfig = injectionParts.join(ACTION_TYPE_SEPARATOR) || 'users=1||profile=atonce';
            const injectionProfile = parseInjectionProfile(injectionConfig);

            const httpProtocol = http.baseUrl(baseUrl);
            const scn = scenario(name).exec(http('request').get(endpoint));

            logger.info(`[Gatling] Running simulation "${name}": ${baseUrl}${endpoint}`);

            await new Promise<void>((resolve) => {
                simulation((setUp: any) => {
                    setUp(scn.injectOpen(injectionProfile)).protocols(httpProtocol);
                    resolve();
                });
            });

            return `Simulation "${name}" completed successfully`;
        },
    ],
]);

// --- Public API ---

export async function execute(
    actionId: string,
    targetSelector: string,
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    logger.info(`[Gatling Adapter] Relaying intent ${normalizedAction} to load engine...`);

    const handler = actionHandlers.get(normalizedAction);
    if (!handler) {
        throw new Error(`Unsupported Gatling performance actionId: ${actionId}`);
    }

    return await handler(targetSelector);
}
