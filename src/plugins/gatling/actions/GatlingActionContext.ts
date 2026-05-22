import { ActionInvocationContext, MetadataContext } from '@plugins/shared/ActionHandler';
import { runSimulation, RunnerResult } from '@plugins/gatling/support/simulation-runner';
import { parseGatlingStats } from '@plugins/gatling/support/metrics-parser';
import { RunnerOptions, SimulationMetrics } from '@plugins/gatling/support/types';

export interface PerformanceRunner {
    run(options: RunnerOptions): Promise<RunnerResult>;
}

export interface PerformanceParser {
    parse(reportDir: string, simulation: string, profile: string): SimulationMetrics;
}

export interface GatlingActionContext extends ActionInvocationContext, MetadataContext {
    runner: PerformanceRunner;
    parser: PerformanceParser;
}

export const defaultPerformanceRunner: PerformanceRunner = {
    run: runSimulation,
};

export const defaultPerformanceParser: PerformanceParser = {
    parse: parseGatlingStats,
};
