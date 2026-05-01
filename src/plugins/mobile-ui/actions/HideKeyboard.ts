import { ActionHandler } from '@plugins/shared/ActionHandler';
import { MobileUiActionContext } from '@plugins/mobile-ui/actions/MobileUiActionContext';

export const HideKeyboardAction: ActionHandler<MobileUiActionContext> = {
    name: 'HIDE_KEYBOARD',
    async execute({ driver, helpers }) {
        await helpers.dismissKeyboard(driver);
        return 'Keyboard dismissed';
    },
};
