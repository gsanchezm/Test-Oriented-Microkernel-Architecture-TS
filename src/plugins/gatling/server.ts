import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute } from '@plugins/gatling/gatling';

const { shutdown } = startPluginServer('Gatling', process.env.GATLING_PLUGIN_PORT || '50054', execute);

async function gracefulShutdown(): Promise<void> {
    await shutdown();
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
