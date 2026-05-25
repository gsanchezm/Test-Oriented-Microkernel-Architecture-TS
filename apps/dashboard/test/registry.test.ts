import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADAPTERS } from '../src/server/normalize/index';
import { TOOL_KINDS, type ToolKind } from '../src/shared/kinds';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(__dirname, '..');
const logosDir = path.resolve(dashboardRoot, 'public/assets/logos');

describe('tool registry', () => {
  it('every ADAPTERS entry has a kind from the shared ToolKind set', () => {
    for (const [id, entry] of Object.entries(ADAPTERS)) {
      expect(TOOL_KINDS).toContain(entry.kind);
      expect(entry.id).toBe(id);
    }
  });

  it('every ToolKind is covered by at least one adapter', () => {
    const kindsInRegistry = new Set<ToolKind>(
      Object.values(ADAPTERS).map((e) => e.kind),
    );
    for (const kind of TOOL_KINDS) {
      expect(kindsInRegistry.has(kind)).toBe(true);
    }
  });

  // Mirror the lookup table from src/client/components/ToolLogo.tsx so the
  // test stays independent of React imports. If you add a new tool with a
  // non-default filename, mirror the entry here.
  const TOOL_LOGO_FILES: Record<string, string> = {
    playwright: 'playwright-logo.svg',
    appium:     'appium-logo.png',
    gatling:    'gatling.png',
    pixelmatch: 'pixelmatch-logo.png',
    api:        'api.svg',
  };

  it('every toolId resolves to an existing logo file in public/assets/logos/', () => {
    for (const id of Object.keys(ADAPTERS)) {
      const filename = TOOL_LOGO_FILES[id] ?? `${id}.svg`;
      const logo = path.join(logosDir, filename);
      expect(existsSync(logo), `Missing logo at ${logo}`).toBe(true);
    }
  });

  it('platform logos exist for android and ios', () => {
    const PLATFORM_LOGO_FILES = {
      android: 'platforms/android-logo.svg',
      ios:     'platforms/ios.png',
    };
    for (const platform of ['android', 'ios'] as const) {
      const logo = path.join(logosDir, PLATFORM_LOGO_FILES[platform]);
      expect(existsSync(logo), `Missing platform logo at ${logo}`).toBe(true);
    }
  });

  it('client DETAIL_BY_KIND covers every ToolKind (verified by static analysis)', () => {
    // The strictly-typed Record<ToolKind, ...> in tool-registry.ts already
    // guarantees coverage at compile time, but assert here so a runtime test
    // surfaces this property too. We read the file as text to avoid having
    // to spin up jsdom just to import React component references.
    const src = readFileSync(
      path.resolve(dashboardRoot, 'src/client/registry/tool-registry.ts'),
      'utf8',
    );
    for (const kind of TOOL_KINDS) {
      const re = new RegExp(`\\b${kind}\\s*:`);
      expect(re.test(src), `tool-registry.ts missing entry for ${kind}`).toBe(true);
    }
  });
});
