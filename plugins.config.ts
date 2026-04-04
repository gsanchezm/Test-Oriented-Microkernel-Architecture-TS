/**
 * TOM Plugin Registry
 *
 * Enable or disable each plugin server here.
 * When enabled, the launcher will start that plugin as a child process.
 *
 * Format:
 *   enabled  → plugin process starts automatically
 *   disabled → plugin is skipped (proxy will error if a test targets it)
 */

export interface PluginDefinition {
    /** Human-readable name shown in launcher logs */
    name: string;
    /** npm script to run (must exist in package.json) */
    script: string;
    /** Env var that controls whether this plugin is enabled (e.g. PLUGIN_PLAYWRIGHT) */
    envVar: string;
    /** Whether to start this plugin on launch — resolved from process.env at runtime */
    readonly enabled: boolean;
}

function isEnabled(envVar: string): boolean {
    return (process.env[envVar] ?? 'false').toLowerCase() === 'true';
}

const plugins: PluginDefinition[] = [
    {
        name: 'Playwright',
        script: 'plugin:playwright',
        envVar: 'PLUGIN_PLAYWRIGHT',
        get enabled() { return isEnabled(this.envVar); },
    },
    {
        name: 'Appium',
        script: 'plugin:appium',
        envVar: 'PLUGIN_APPIUM',
        get enabled() { return isEnabled(this.envVar); },
    },
    {
        name: 'API',
        script: 'plugin:api',
        envVar: 'PLUGIN_API',
        get enabled() { return isEnabled(this.envVar); },
    },
    {
        name: 'Gatling',
        script: 'plugin:gatling',
        envVar: 'PLUGIN_GATLING',
        get enabled() { return isEnabled(this.envVar); },
    },
];

export default plugins;
