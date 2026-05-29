import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { MobileDetail } from '../../src/client/views/detail/MobileDetail';
import type { TestCase, Tool } from '../../src/shared/types';

function tc(name: string, status: TestCase['status'] = 'passed'): TestCase {
  return { name, suite: 'Catalog', file: 'catalog.feature', dur: '120ms', status };
}

/**
 * Android-only run (e.g. a physical-device session with no iOS leg). The
 * `mobile_ui` union still requires an `ios` block, so the ingest writes an empty
 * one (device '—', zero counts). This view must render the populated Android tab
 * by default and degrade the empty iOS tab gracefully.
 */
const androidOnlyTool: Tool = {
  id: 'appium',
  kind: 'mobile_ui',
  name: 'Appium',
  description: 'Native mobile flows',
  passed: 2,
  failed: 1,
  skipped: 0,
  duration: '36m 12s (Android)',
  platforms: {
    android: {
      passed: 2, failed: 1, skipped: 0, duration: '36m 12s',
      device: 'Galaxy Z Flip 6',
      suites: ['Catalog'],
      tests: [tc('catalog renders'), tc('add to cart'), tc('search filters', 'failed')],
    },
    ios: {
      passed: 0, failed: 0, skipped: 0, duration: '—',
      device: '—',
      suites: [],
      tests: [],
    },
  },
};

function renderMobile() {
  return render(
    <MemoryRouter initialEntries={['/runs/r1/appium']}>
      <MobileDetail runId="r1" tool={androidOnlyTool} />
    </MemoryRouter>,
  );
}

const tabBtn = (label: RegExp) => screen.queryByRole('button', { name: label });

describe('MobileDetail with an android-only run (empty iOS block)', () => {
  it('renders both platform tabs with their test counts', () => {
    renderMobile();
    expect(tabBtn(/Android/)).toBeInTheDocument();
    const ios = tabBtn(/iOS/);
    expect(ios).toBeInTheDocument();
    // iOS tab advertises 0 tests rather than vanishing.
    expect(ios).toHaveTextContent('0 tests');
  });

  it('defaults to the populated Android tab and lists its scenarios', () => {
    renderMobile();
    expect(screen.getByText(/catalog renders/)).toBeInTheDocument();
    expect(screen.getByText(/search filters/)).toBeInTheDocument();
    // Device subtitle surfaces the physical device.
    expect(screen.getByText('Galaxy Z Flip 6')).toBeInTheDocument();
  });

  it('shows a graceful empty state when the iOS tab is selected', () => {
    renderMobile();
    fireEvent.click(tabBtn(/iOS/)!);
    expect(screen.getByText(/No data generated for iOS in this run\./)).toBeInTheDocument();
    // Android scenarios no longer in the list once iOS is active.
    expect(screen.queryByText(/catalog renders/)).toBeNull();
  });
});
