import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute } from '@plugins/pixelmatch/pixelmatch';

const { shutdown } = startPluginServer('Pixelmatch', process.env.PIXELMATCH_PLUGIN_PORT || '50056', execute);

async function gracefulShutdown(): Promise<void> {
    await shutdown();
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
