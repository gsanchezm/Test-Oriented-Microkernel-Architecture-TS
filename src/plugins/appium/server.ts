import { startPluginServer } from '../../kernel/plugin-server.factory';
import { execute } from './appium';

startPluginServer('Appium', process.env.APPIUM_PORT_GRPC || '50053', execute);
