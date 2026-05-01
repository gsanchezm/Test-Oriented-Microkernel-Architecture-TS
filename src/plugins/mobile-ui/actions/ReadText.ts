import { ActionHandler } from '@plugins/shared/ActionHandler';
import { MobileUiActionContext } from '@plugins/mobile-ui/actions/MobileUiActionContext';

export const ReadTextAction: ActionHandler<MobileUiActionContext> = {
    name: 'READ_TEXT',
    async execute({ driver, target, helpers }) {
        const elements = driver.$$(target);
        const texts: string[] = [];
        for (const el of await elements.getElements()) {
            texts.push(await helpers.readVisibleText(el));
        }
        return texts.join('\n');
    },
};
