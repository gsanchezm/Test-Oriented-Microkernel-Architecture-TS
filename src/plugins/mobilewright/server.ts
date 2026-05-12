import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute } from '@plugins/mobilewright/mobilewright';

const { shutdown } = startPluginServer('Mobilewright', process.env.MOBILEWRIGHT_PLUGIN_PORT || '50057', execute);

async function gracefulShutdown(): Promise<void> {
    await shutdown();
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
