import type { Device, Locator } from 'mobilewright';
import { ActionContext } from '@plugins/shared/ActionHandler';
import type { MobilewrightPlatform } from '@plugins/mobilewright/mobilewright-lifecycle';

export interface MobilewrightActionContext extends ActionContext<Device> {
    driver: Device;
    target: string;
    sessionId: string;
    platform: MobilewrightPlatform;
}

export type LocatorStrategy =
    | { kind: 'testId'; value: string }
    | { kind: 'label'; value: string; exact?: boolean }
    | { kind: 'text'; value: string; exact?: boolean }
    | { kind: 'role'; value: string; name?: string }
    | { kind: 'placeholder'; value: string; exact?: boolean }
    | { kind: 'type'; value: string };

/** Parse a target string into a structured locator strategy.
 *
 *  Accepted forms (in priority order):
 *  - `{"kind":"testId","value":"..."}` JSON — full strategy.
 *  - `testId:value` / `label:value` / `text:value` / etc. — shorthand prefix.
 *  - `value` (anything else) — defaults to testId since OmniPizza uses
 *    React Native testIDs as the primary cross-platform handle.
 */
export function parseLocator(target: string): LocatorStrategy {
    const trimmed = target.trim();
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed) as LocatorStrategy;
            if (parsed && typeof parsed === 'object' && 'kind' in parsed && 'value' in parsed) return parsed;
        } catch {
            /* fall through */
        }
    }

    const m = trimmed.match(/^(testId|label|text|role|placeholder|type):(.+)$/);
    if (m) {
        const [, kind, value] = m;
        return { kind: kind as LocatorStrategy['kind'], value } as LocatorStrategy;
    }

    return { kind: 'testId', value: trimmed };
}

/** Apply a parsed strategy to the device's root locator. */
export async function locate(device: Device, strategy: LocatorStrategy): Promise<Locator> {
    const { Locator } = await loadCore();
    const root = Locator.root(device.driver);
    switch (strategy.kind) {
        case 'testId': return root.getByTestId(strategy.value);
        case 'label': return root.getByLabel(strategy.value, { exact: strategy.exact });
        case 'text': return root.getByText(strategy.value, { exact: strategy.exact });
        case 'role': return root.getByRole(strategy.value, strategy.name ? { name: strategy.name } : undefined);
        case 'placeholder': return root.getByPlaceholder(strategy.value, { exact: strategy.exact });
        case 'type': return root.getByType(strategy.value);
    }
}

// Lazy ESM import — see mobilewright-lifecycle.ts for the same pattern.
const dynamicImport = new Function('s', 'return import(s)') as <T = unknown>(s: string) => Promise<T>;
let cachedCore: typeof import('mobilewright') | null = null;
async function loadCore(): Promise<typeof import('mobilewright')> {
    if (cachedCore) return cachedCore;
    cachedCore = await dynamicImport<typeof import('mobilewright')>('mobilewright');
    return cachedCore;
}
