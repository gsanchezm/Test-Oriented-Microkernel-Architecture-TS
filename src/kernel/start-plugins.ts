import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import plugins from '../../plugins.config';
import { logger } from '../utils/logger';

const log = logger.child({ layer: 'kernel', component: 'plugin-launcher' });

const processes: ChildProcess[] = [];

function startPlugin(script: string, name: string): ChildProcess {
    const child = spawn('pnpm', ['run', script], {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
    });

    child.stdout?.on('data', (data: Buffer) => {
        process.stdout.write(`[${name}] ${data}`);
    });

    child.stderr?.on('data', (data: Buffer) => {
        process.stderr.write(`[${name}] ${data}`);
    });

    child.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
            log.error({ name, code, signal }, `Plugin exited unexpectedly`);
        } else {
            log.info({ name }, `Plugin stopped`);
        }
    });

    return child;
}

function shutdown(): void {
    log.info('Shutting down all plugin processes...');
    for (const child of processes) {
        child.kill('SIGTERM');
    }
    process.exit(0);
}

function main(): void {
    const enabled = plugins.filter((p) => p.enabled);
    const disabled = plugins.filter((p) => !p.enabled);

    log.info(
        { enabled: enabled.map((p) => p.name), disabled: disabled.map((p) => p.name) },
        'Plugin registry loaded',
    );

    if (enabled.length === 0) {
        log.warn('No plugins enabled — check plugins.config.ts');
        return;
    }

    for (const plugin of enabled) {
        log.info({ name: plugin.name, script: plugin.script }, 'Starting plugin');
        const child = startPlugin(plugin.script, plugin.name);
        processes.push(child);
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    log.info(`${enabled.length} plugin(s) running. Press Ctrl+C to stop all.`);
}

main();
