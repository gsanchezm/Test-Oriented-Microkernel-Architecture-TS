import { ActionHandler } from '@plugins/actions/ActionHandler';
import { MobileUiActionContext } from '@plugins/actions/mobile-ui/MobileUiActionContext';

export const HideKeyboardAction: ActionHandler<MobileUiActionContext> = {
    name: 'HIDE_KEYBOARD',
    async execute({ driver, helpers }) {
        await helpers.dismissKeyboard(driver);
        return 'Keyboard dismissed';
    },
};
