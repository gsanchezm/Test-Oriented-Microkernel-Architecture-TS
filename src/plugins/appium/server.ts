import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute, teardownAllSessions } from '@plugins/appium/appium';
import { bootAppiumServer, shutdownAppiumServer } from '@plugins/appium/appium-lifecycle';

async function shutdown(pluginShutdown: () => Promise<void>): Promise<void> {
    await pluginShutdown();        // stop accepting new gRPC intents
    await teardownAllSessions();   // close all WebdriverIO sessions
    await shutdownAppiumServer();  // stop Appium HTTP server (if we started it)
    process.exit(0);
}

async function main(): Promise<void> {
    await bootAppiumServer();
    const { shutdown: pluginShutdown } = startPluginServer('Appium', process.env.APPIUM_PORT_GRPC || '50053', execute);

    process.on('SIGTERM', () => shutdown(pluginShutdown));
    process.on('SIGINT', () => shutdown(pluginShutdown));
}

main().catch((err) => {
    console.error('[Appium] Failed to start:', err);
    process.exit(1);
});
