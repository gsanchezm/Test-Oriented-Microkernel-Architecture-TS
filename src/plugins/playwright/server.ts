import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute as executePlaywright } from '@plugins/playwright/playwright';
import { execute as executePixelmatch } from '@plugins/pixelmatch/pixelmatch';

const { shutdown: shutdownPlaywright } = startPluginServer(
    'Playwright',
    process.env.PLAYWRIGHT_PLUGIN_PORT || '50052',
    executePlaywright,
);

// Pixelmatch oracle is co-located in the same process so it can read the
// active Playwright session via getActivePage(). See
// docs/architecture/visual-oracle-composition.md (Session-sharing
// limitation): the in-process arrangement is the documented design.
// Toggle with PLUGIN_PIXELMATCH=true; otherwise pixelmatch port stays free.
const pixelmatchEnabled = (process.env.PLUGIN_PIXELMATCH ?? 'false').toLowerCase() === 'true';
const shutdownPixelmatch = pixelmatchEnabled
    ? startPluginServer('Pixelmatch', process.env.PIXELMATCH_PLUGIN_PORT || '50056', executePixelmatch).shutdown
    : async () => {};

async function gracefulShutdown(): Promise<void> {
    await Promise.all([shutdownPlaywright(), shutdownPixelmatch()]);
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
