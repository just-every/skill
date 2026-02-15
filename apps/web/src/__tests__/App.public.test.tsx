import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../App';

describe('public catalog app', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('renders the redesigned homepage', () => {
    render(<App />);

    expect(screen.getByText('Master Every Skill with Confidence')).toBeInTheDocument();
    expect(screen.getByText('Explore Verified Skills')).toBeInTheDocument();
  });

  it('renders skills page and recommends CI Security Hardening for CI hardening queries', () => {
    window.history.replaceState({}, '', '/skills');
    const fetchImpl = globalThis.fetch ?? (vi.fn() as unknown as typeof fetch);
    if (!globalThis.fetch) {
      (globalThis as { fetch?: typeof fetch }).fetch = fetchImpl;
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<App />);

    expect(screen.getByText('Skills, Benchmarks, and Retrieval Results')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Recommend Skill'));

    expect(screen.getAllByText('CI Security Hardening').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/slug `ci-security-hardening`/).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
