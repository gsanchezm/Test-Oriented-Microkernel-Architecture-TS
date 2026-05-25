interface ToolLogoProps {
  toolId: string;
  size?: number;
}

/**
 * Per-tool logo filename. The dashboard ships real brand assets at
 * `public/assets/logos/<filename>`. To swap a logo, replace the file at the
 * same path; to register a new tool, add an entry here (or rely on the
 * default `<toolId>.svg`).
 */
const TOOL_LOGO_FILES: Record<string, string> = {
  playwright: 'playwright-logo.svg',
  appium:     'appium-logo.png',
  gatling:    'gatling.png',
  pixelmatch: 'pixelmatch-logo.png',
  api:        'api.svg',
};

const PLATFORM_LOGO_FILES: Record<'android' | 'ios', string> = {
  android: 'platforms/android-logo.svg',
  ios:     'platforms/ios.png',
};

/**
 * Browser logo lookup. Keys are normalized (lowercase) browser ids. Aliases
 * (chromium→chrome, safari→webkit, msedge→edge) map to the shared asset.
 */
const BROWSER_LOGO_FILES: Record<string, string> = {
  chrome:   'browsers/chrome.svg',
  chromium: 'browsers/chrome.svg',
  firefox:  'browsers/firefox.svg',
  edge:     'browsers/edge.svg',
  msedge:   'browsers/edge.svg',
  webkit:   'browsers/webkit.svg',
  safari:   'browsers/webkit.svg',
};

const BROWSER_LABELS: Record<string, string> = {
  chrome: 'Chrome',
  chromium: 'Chromium',
  firefox: 'Firefox',
  edge: 'Edge',
  msedge: 'Edge',
  webkit: 'WebKit',
  safari: 'Safari',
};

export function browserKey(browser: string): string {
  return browser.trim().toLowerCase();
}

export function prettyBrowser(browser: string): string {
  return BROWSER_LABELS[browserKey(browser)] ?? browser;
}

export function ToolLogo({ toolId, size = 32 }: ToolLogoProps) {
  const filename = TOOL_LOGO_FILES[toolId] ?? `${toolId}.svg`;
  return (
    <img
      src={`/assets/logos/${filename}`}
      alt={`${toolId} logo`}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}

export function PlatformLogo({ platform, size = 20 }: { platform: 'android' | 'ios'; size?: number }) {
  return (
    <img
      src={`/assets/logos/${PLATFORM_LOGO_FILES[platform]}`}
      alt={`${platform} logo`}
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
    />
  );
}

export function BrowserLogo({ browser, size = 20 }: { browser: string; size?: number }) {
  const key = browserKey(browser);
  const file = BROWSER_LOGO_FILES[key];
  if (!file) {
    // Unknown browser: render nothing rather than a broken image.
    return null;
  }
  return (
    <img
      src={`/assets/logos/${file}`}
      alt={`${browser} logo`}
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
    />
  );
}
