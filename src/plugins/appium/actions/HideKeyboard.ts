import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

export const HideKeyboardAction: ActionHandler<AppiumActionContext> = {
    name: 'HIDE_KEYBOARD',
    async execute({ driver, helpers }) {
        await helpers.dismissKeyboard(driver);
        return 'Keyboard dismissed';
    },
};
