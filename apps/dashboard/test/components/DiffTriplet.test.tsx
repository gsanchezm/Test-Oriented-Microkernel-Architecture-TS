import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { DiffTriplet } from '../../src/client/components/DiffTriplet';

describe('DiffTriplet', () => {
  it('renders all three images when baseline, actual and diff are present', () => {
    render(
      <DiffTriplet
        images={{
          baseline: '/img/base.png',
          actual: '/img/actual.png',
          diff: '/img/diff.png',
        }}
      />,
    );
    expect(screen.getByAltText('Baseline')).toBeInTheDocument();
    expect(screen.getByAltText('Actual')).toBeInTheDocument();
    expect(screen.getByAltText('Diff overlay')).toBeInTheDocument();
    expect(screen.queryByText(/Idéntico/)).toBeNull();
  });

  it('renders the "Idéntico" placeholder when diff is undefined', () => {
    render(
      <DiffTriplet
        images={{
          baseline: '/img/base.png',
          actual: '/img/actual.png',
        }}
      />,
    );
    // No diff <img>, placeholder text instead.
    expect(screen.queryByAltText('Diff overlay')).toBeNull();
    expect(screen.getByText(/Idéntico — sin diferencias/)).toBeInTheDocument();
    // Baseline and actual still render as images.
    expect(screen.getByAltText('Baseline')).toBeInTheDocument();
    expect(screen.getByAltText('Actual')).toBeInTheDocument();
  });

  it('renders a placeholder when baseline is undefined', () => {
    render(
      <DiffTriplet
        images={{
          actual: '/img/actual.png',
          diff: '/img/diff.png',
        }}
      />,
    );
    expect(screen.queryByAltText('Baseline')).toBeNull();
    expect(screen.getByText(/Sin baseline/)).toBeInTheDocument();
  });

  it('falls back to a placeholder when an img fails to load (onError)', () => {
    render(
      <DiffTriplet
        images={{
          baseline: '/img/base.png',
          actual: '/img/actual.png',
          diff: '/img/diff.png',
        }}
      />,
    );
    const diffImg = screen.getByAltText('Diff overlay');
    fireEvent.error(diffImg);
    expect(screen.queryByAltText('Diff overlay')).toBeNull();
    expect(screen.getByText(/Idéntico — sin diferencias/)).toBeInTheDocument();
  });
});
