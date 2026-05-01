import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute } from '@plugins/web-ui/web-ui';

const { shutdown } = startPluginServer('Web-UI', process.env.PLAYWRIGHT_PORT || '50052', execute);

async function gracefulShutdown(): Promise<void> {
    await shutdown();
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
