import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { logger } from '../utils/logger';
import { ensurePortFree } from './port-guard';

const PROTO_PATH = path.resolve(__dirname, '../proto/ptom.proto');

type ExecuteFn = (actionId: string, targetSelector: string, sessionId: string) => Promise<string>;

export function startPluginServer(
    pluginName: string,
    port: string,
    executeFn: ExecuteFn,
): { shutdown: () => Promise<void> } {
    const packageDef = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
    });
    const ptomProto = (grpc.loadPackageDefinition(packageDef) as any).ptom;

    async function handleExecuteIntent(call: any, callback: any): Promise<void> {
        const { actionId, targetSelector, platform } = call.request;
        // Extract sessionId from "driver:sessionId" format (e.g. "playwright:2")
        const sessionId = (platform as string)?.split(':')[1] ?? '0';

        try {
            const result = await executeFn(actionId, targetSelector, sessionId);
            callback(null, { status: 'PASS', payload: result, errorMessage: '' });
        } catch (error: any) {
            callback(null, { status: 'FAIL', payload: '', errorMessage: error.message });
        }
    }

    const server = new grpc.Server();
    server.addService(ptomProto.ActionService.service, {
        ExecuteIntent: handleExecuteIntent,
    });

    // Reclaim the port from any stale copy of this plugin before binding,
    // then bind. Runs async so the factory keeps its synchronous signature.
    (async () => {
        try {
            await ensurePortFree(parseInt(port, 10));
        } catch (err: any) {
            logger.error(`[${pluginName}] Port guard failed: ${err.message}`);
            process.exit(1);
        }

        server.bindAsync(
            `0.0.0.0:${port}`,
            grpc.ServerCredentials.createInsecure(),
            (err, boundPort) => {
                if (err) {
                    logger.error(`[${pluginName}] Bind failed: ${err}`);
                    process.exit(1);
                }
                logger.info(`[${pluginName}] Plugin listening on port ${boundPort}`);
            },
        );
    })();

    return {
        shutdown: () => new Promise<void>((resolve) => {
            server.tryShutdown((err) => {
                if (err) logger.error(`[${pluginName}] Shutdown error: ${err}`);
                resolve();
            });
        }),
    };
}
