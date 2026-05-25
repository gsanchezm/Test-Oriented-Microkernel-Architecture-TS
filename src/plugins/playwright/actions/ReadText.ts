import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const ReadTextAction: ActionHandler<PlaywrightActionContext> = {
    name: 'READ_TEXT',
    // Reads the "user-visible text" of the matched element(s). For inputs /
    // textareas / selects the user-visible text is the `value` property, not
    // `textContent` (which is empty on void/form elements). The original
    // implementation returned `allTextContents()` for everything, which made
    // every input read return "" and broke the profile form assertions
    // (OmniPizza confirmed 2026-05-24 that the FE populates inputs correctly).
    // The branch is keyed off the DOM node's tagName so non-form elements
    // continue to behave exactly as before.
    async execute({ page, target }) {
        const locator = page.locator(target);
        const count = await locator.count();
        if (count === 0) return '';
        const parts: string[] = [];
        for (let i = 0; i < count; i++) {
            const el = locator.nth(i);
            const tag = await el.evaluate((node) => node.nodeName.toUpperCase()).catch(() => '');
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                parts.push(await el.inputValue().catch(() => ''));
            } else {
                parts.push((await el.textContent()) ?? '');
            }
        }
        return parts.join('\n');
    },
};
