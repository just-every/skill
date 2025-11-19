import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { useJustEveryProfilePopup, __resetProfilePopupTestState } from './useJustEveryProfilePopup';

const createPopupStub = () => {
  const open = vi.fn();
  const close = vi.fn();
  const postMessage = vi.fn();
  const destroy = vi.fn();
  const instance = { open, close, postMessage, destroy };
  const helper = vi.fn(() => instance);
  (window as typeof window & { JustEveryProfilePopup?: typeof helper }).JustEveryProfilePopup = helper as never;
  return { helper, instance };
};

describe('useJustEveryProfilePopup', () => {
  beforeEach(() => {
    __resetProfilePopupTestState();
  });

  it('queues open calls until the popup helper is ready', async () => {
    const { instance } = createPopupStub();

    const { result } = renderHook(() =>
      useJustEveryProfilePopup({ baseUrl: 'https://login.test', defaultSection: 'account' })
    );

    act(() => {
      result.current.open({ section: 'billing', organizationId: 'org-1' });
    });

    expect(instance.open).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(instance.open).toHaveBeenCalledWith({ section: 'billing', organizationId: 'org-1' });
    });
  });

  it('forwards popup events to the provided callbacks', async () => {
    let capturedEventHandler: ((event: any) => void) | undefined;
    const { helper } = createPopupStub();
    helper.mockImplementation((options: any) => {
      capturedEventHandler = options.onEvent;
      return { open: vi.fn(), close: vi.fn(), postMessage: vi.fn(), destroy: vi.fn() };
    });

    const onOrganizationChange = vi.fn();
    const onSessionLogout = vi.fn();
    const onBillingCheckout = vi.fn();
    const onClose = vi.fn();

    renderHook(() =>
      useJustEveryProfilePopup({
        baseUrl: 'https://login.test',
        onOrganizationChange,
        onSessionLogout,
        onBillingCheckout,
        onClose,
      })
    );

    await waitFor(() => {
      expect(capturedEventHandler).toBeDefined();
    });

    act(() => {
      capturedEventHandler?.({ event: 'organization:change', data: { organizationId: 'org-2' } });
    });
    expect(onOrganizationChange).toHaveBeenCalledWith({ organizationId: 'org-2' });

    act(() => {
      capturedEventHandler?.({ event: 'session:logout' });
    });
    expect(onSessionLogout).toHaveBeenCalled();

    act(() => {
      capturedEventHandler?.({ event: 'billing:checkout', data: { status: 'ready', url: 'https://stripe' } });
    });
    expect(onBillingCheckout).toHaveBeenCalledWith({ status: 'ready', url: 'https://stripe' });

    act(() => {
      capturedEventHandler?.({ event: 'close' });
    });
    expect(onClose).toHaveBeenCalled();
  });
});
