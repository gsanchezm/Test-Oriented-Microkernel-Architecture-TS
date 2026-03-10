import { startPluginServer } from '../../kernel/plugin-server.factory';
import { execute } from './gatling';

startPluginServer('Gatling', process.env.GATLING_PLUGIN_PORT || '50054', execute);
