import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildAppiumTool } from '../../scripts/ingest-run';

// Minimal cucumber JSON: one feature with one scenario whose single step has
// the given status. Enough for ingestCucumber to count it.
function cucumberJson(featureName: string, status: 'passed' | 'failed' | 'skipped'): unknown[] {
  return [
    {
      name: featureName,
      uri: `src/${featureName}.feature`,
      elements: [
        {
          name: `${featureName} scenario`,
          type: 'scenario',
          steps: [
            { keyword: 'Given ', name: 'a step', result: { status, duration: 1_000_000 } },
          ],
        },
      ],
    },
  ];
}

describe('buildAppiumTool', () => {
  let dir: string;

  function write(file: string, json: unknown): void {
    writeFileSync(path.join(dir, file), JSON.stringify(json), 'utf8');
  }

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'appium-ingest-'));
    delete process.env.ANDROID_DEVICE;
    delete process.env.IOS_DEVICE;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.ANDROID_DEVICE;
    delete process.env.IOS_DEVICE;
  });

  it('returns null when neither android.json nor ios.json is present', async () => {
    expect(await buildAppiumTool(dir)).toBeNull();
  });

  it('builds an android-only tool with an empty (but present) ios platform block', async () => {
    write('android.json', cucumberJson('catalog', 'passed'));

    const tool = await buildAppiumTool(dir);
    expect(tool).not.toBeNull();
    expect(tool!.kind).toBe('mobile_ui');
    expect(tool!.id).toBe('appium');

    // Android populated.
    expect(tool!.platforms.android.passed).toBe(1);
    expect(tool!.platforms.android.tests).toHaveLength(1);

    // iOS present in the shape (the discriminated union requires it) but empty.
    expect(tool!.platforms.ios.passed).toBe(0);
    expect(tool!.platforms.ios.failed).toBe(0);
    expect(tool!.platforms.ios.skipped).toBe(0);
    expect(tool!.platforms.ios.tests).toHaveLength(0);
    expect(tool!.platforms.ios.device).toBe('—');

    // Tool-level aggregate = android only.
    expect(tool!.passed).toBe(1);
    expect(tool!.failed).toBe(0);
  });

  it('builds an ios-only tool with an empty (but present) android platform block', async () => {
    write('ios.json', cucumberJson('login', 'passed'));

    const tool = await buildAppiumTool(dir);
    expect(tool).not.toBeNull();
    expect(tool!.platforms.ios.passed).toBe(1);
    expect(tool!.platforms.ios.tests).toHaveLength(1);
    expect(tool!.platforms.android.tests).toHaveLength(0);
    expect(tool!.platforms.android.device).toBe('—');
    expect(tool!.passed).toBe(1);
  });

  it('builds both platforms when both files exist (aggregate sums across them)', async () => {
    write('android.json', cucumberJson('catalog', 'passed'));
    write('ios.json', cucumberJson('login', 'failed'));

    const tool = await buildAppiumTool(dir);
    expect(tool!.platforms.android.passed).toBe(1);
    expect(tool!.platforms.ios.failed).toBe(1);
    expect(tool!.passed).toBe(1);
    expect(tool!.failed).toBe(1);
  });

  it('uses ANDROID_DEVICE / IOS_DEVICE env for the populated platform device label', async () => {
    process.env.ANDROID_DEVICE = 'Galaxy Z Flip 6';
    write('android.json', cucumberJson('catalog', 'passed'));

    const tool = await buildAppiumTool(dir);
    expect(tool!.platforms.android.device).toBe('Galaxy Z Flip 6');
  });
});
