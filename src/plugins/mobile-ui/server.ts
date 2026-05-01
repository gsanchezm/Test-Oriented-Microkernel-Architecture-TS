import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute, teardownAllSessions } from '@plugins/mobile-ui/mobile-ui';
import { bootAppiumServer, shutdownAppiumServer } from '@plugins/mobile-ui/appium-lifecycle';

async function shutdown(pluginShutdown: () => Promise<void>): Promise<void> {
    await pluginShutdown();        // stop accepting new gRPC intents
    await teardownAllSessions();   // close all WebdriverIO sessions
    await shutdownAppiumServer();  // stop Appium HTTP server (if we started it)
    process.exit(0);
}

async function main(): Promise<void> {
    await bootAppiumServer();
    const { shutdown: pluginShutdown } = startPluginServer('Mobile-UI', process.env.MOBILE_UI_PORT || '50053', execute);

    process.on('SIGTERM', () => shutdown(pluginShutdown));
    process.on('SIGINT', () => shutdown(pluginShutdown));
}

main().catch((err) => {
    console.error('[Mobile-UI] Failed to start:', err);
    process.exit(1);
});
