import { ActionHandler } from '@plugins/shared/ActionHandler';
import { MobilewrightActionContext } from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const NavigateAction: ActionHandler<MobilewrightActionContext> = {
    name: 'NAVIGATE',
    async execute({ driver, target }) {
        // mobilewright's Device.openUrl handles deep links (omnipizza://...)
        // and http(s) URLs uniformly via the platform deep-link API.
        await driver.openUrl(target);
        return `Navigated mobilewright session to: ${target}`;
    },
};
