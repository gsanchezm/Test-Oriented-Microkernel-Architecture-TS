import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute } from '@plugins/performance/performance';

const { shutdown } = startPluginServer('Performance', process.env.PERFORMANCE_PORT || '50054', execute);

async function gracefulShutdown(): Promise<void> {
    await shutdown();
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
