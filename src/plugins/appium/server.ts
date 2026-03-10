import { startPluginServer } from '../../kernel/plugin-server.factory';
import { execute } from './appium';

startPluginServer('Appium', process.env.APPIUM_PLUGIN_PORT || '50053', execute);
