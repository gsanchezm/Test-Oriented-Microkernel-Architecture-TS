import { startPluginServer } from '../../kernel/plugin-server.factory';
import { execute } from './api';

startPluginServer('API', process.env.API_PLUGIN_PORT || '50055', execute);
