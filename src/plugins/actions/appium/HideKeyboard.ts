import { ActionHandler } from '@plugins/actions/ActionHandler';
import { AppiumActionContext } from '@plugins/actions/appium/AppiumActionContext';

export const HideKeyboardAction: ActionHandler<AppiumActionContext> = {
    name: 'HIDE_KEYBOARD',
    async execute({ driver, helpers }) {
        await helpers.dismissKeyboard(driver);
        return 'Keyboard dismissed';
    },
};
