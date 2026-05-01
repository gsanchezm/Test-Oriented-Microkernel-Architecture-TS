import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute } from '@plugins/visual/visual';

const { shutdown } = startPluginServer('Visual', process.env.VISUAL_PLUGIN_PORT || '50056', execute);

async function gracefulShutdown(): Promise<void> {
    await shutdown();
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
