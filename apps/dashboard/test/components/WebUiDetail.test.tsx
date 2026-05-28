import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { WebUiDetail } from '../../src/client/views/detail/WebUiDetail';
import type { TestCase, Tool } from '../../src/shared/types';

function tc(name: string, status: TestCase['status'] = 'passed'): TestCase {
  return { name, suite: 'Checkout', file: 'checkout.feature', dur: '120ms', status };
}

const tool: Tool = {
  id: 'playwright',
  kind: 'web_ui',
  name: 'Playwright',
  description: 'Web UI E2E',
  passed: 4,
  failed: 0,
  skipped: 0,
  duration: '12s',
  tests: [],
  viewports: [
    {
      viewport: 'desktop',
      passed: 2, failed: 0, skipped: 0, duration: '6s',
      browsers: [
        {
          browser: 'chrome', passed: 1, failed: 0, skipped: 0, duration: '3s',
          suites: ['Checkout'], tests: [tc('desktop chrome scenario')],
        },
        {
          browser: 'firefox', passed: 1, failed: 0, skipped: 0, duration: '3s',
          suites: ['Checkout'], tests: [tc('desktop firefox scenario')],
        },
      ],
    },
    {
      viewport: 'responsive',
      passed: 2, failed: 0, skipped: 0, duration: '6s',
      browsers: [
        {
          browser: 'webkit', passed: 2, failed: 0, skipped: 0, duration: '6s',
          suites: ['Checkout'],
          tests: [
            {
              ...tc('responsive webkit scenario'),
              steps: [{ keyword: 'Given ', name: 'webkit preconditions', status: 'passed', dur: '10ms' }],
            },
          ],
        },
      ],
    },
  ],
};

function renderWeb(initialPath = '/runs/r1/playwright') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <WebUiDetail runId="r1" tool={tool} />
    </MemoryRouter>,
  );
}

/** A tab button is the only element matching the label inside a role=button. */
const tabBtn = (label: RegExp) => screen.queryByRole('button', { name: label });

describe('WebUiDetail nested viewport + browser tabs', () => {
  it('renders outer viewport tabs and the first viewport\'s inner browser tabs', () => {
    renderWeb();
    // Outer viewport tabs.
    expect(tabBtn(/Desktop/)).toBeInTheDocument();
    expect(tabBtn(/Responsive/)).toBeInTheDocument();
    // Inner browser tabs for the active (first) viewport.
    expect(tabBtn(/Chrome/)).toBeInTheDocument();
    expect(tabBtn(/Firefox/)).toBeInTheDocument();
    // Responsive's browser is not rendered until its outer tab is active.
    expect(tabBtn(/WebKit/)).toBeNull();
  });

  it('swaps inner browser tabs when the other viewport is selected', () => {
    renderWeb();
    fireEvent.click(tabBtn(/Responsive/)!);
    expect(tabBtn(/WebKit/)).toBeInTheDocument();
    // Desktop-only browsers gone from the inner strip.
    expect(tabBtn(/Chrome/)).toBeNull();
    expect(tabBtn(/Firefox/)).toBeNull();
  });

  it('shows the browser logo even when a viewport has a single browser', () => {
    renderWeb();
    fireEvent.click(tabBtn(/Responsive/)!);
    expect(screen.getByAltText(/webkit logo/i)).toBeInTheDocument();
  });

  it('deep-links via ?expand to the viewport + browser containing the scenario', () => {
    renderWeb('/runs/r1/playwright?expand=' + encodeURIComponent('responsive webkit scenario'));
    // The responsive viewport (and its webkit browser) should be auto-selected.
    expect(tabBtn(/WebKit/)).toBeInTheDocument();
    expect(tabBtn(/Chrome/)).toBeNull();
    // The deep-linked scenario appears in the test list...
    expect(screen.getByText(/responsive webkit scenario/)).toBeInTheDocument();
    // ...and is auto-expanded (steps visible), proving the
    // useSearchParams → DetailBody → TestList expand wiring is live.
    expect(screen.getByText(/webkit preconditions/)).toBeInTheDocument();
  });

  it('renders the test list for the active inner browser tab', () => {
    renderWeb();
    expect(screen.getByText(/desktop chrome scenario/)).toBeInTheDocument();
    fireEvent.click(tabBtn(/Firefox/)!);
    expect(screen.getByText(/desktop firefox scenario/)).toBeInTheDocument();
  });

  it('falls back to flat browser tabs when only `browsers` is present', () => {
    const flatTool: Tool = {
      id: 'playwright', kind: 'web_ui', name: 'Playwright', description: 'Web UI',
      passed: 1, failed: 0, skipped: 0, duration: '3s', tests: [],
      browsers: [
        {
          browser: 'chrome', passed: 1, failed: 0, skipped: 0, duration: '3s',
          suites: ['Checkout'], tests: [tc('flat chrome scenario')],
        },
      ],
    };
    render(
      <MemoryRouter initialEntries={['/runs/r1/playwright']}>
        <WebUiDetail runId="r1" tool={flatTool} />
      </MemoryRouter>,
    );
    expect(tabBtn(/Chrome/)).toBeInTheDocument();
    // No viewport outer tabs in flat mode.
    expect(tabBtn(/Desktop/)).toBeNull();
    expect(tabBtn(/Responsive/)).toBeNull();
    expect(screen.getByText(/flat chrome scenario/)).toBeInTheDocument();
  });
});
