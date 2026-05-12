// PARSE_GATLING_STATS — parse a Gatling report directory without re-running
// the simulation. Useful when stats need re-validation in a follow-up step.
//
// Target syntax: `reportDir||{simulation,profile?}`.

import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSimulationTarget } from '@plugins/shared/parseCompositeTarget';
import { GatlingActionContext } from '@plugins/gatling/actions/GatlingActionContext';

export const ParseGatlingStatsAction: ActionHandler<GatlingActionContext> = {
    name: 'PARSE_GATLING_STATS',
    async execute({ target, parser }) {
        const { simulation: reportDir, config } = parseSimulationTarget(target);
        const simulation = String(config.simulation ?? 'unknown');
        const profile = String(config.profile ?? 'smoke');
        const metrics = parser.parse(reportDir, simulation, profile);
        return JSON.stringify(metrics);
    },
};
