import { startPluginServer } from '../../kernel/plugin-server.factory';
import { execute } from './playwright';

startPluginServer('Playwright', process.env.PLAYWRIGHT_PORT || '50052', execute);
