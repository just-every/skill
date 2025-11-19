import { useCallback, useEffect, useRef, useState } from 'react';

export type ProfilePopupSection = 'account' | 'security' | 'organizations' | 'developer' | 'billing';

type PopupEvent = {
  event: string;
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  nonce?: string | null;
};

type PopupInstance = {
  open: (options?: Record<string, unknown>) => void;
  close: () => void;
  postMessage: (command: string, data?: unknown) => void;
  destroy: () => void;
};

type UseJustEveryProfilePopupOptions = {
  baseUrl?: string;
  defaultSection?: ProfilePopupSection;
  defaultOrganizationId?: string;
  returnUrl?: string;
  variant?: 'modal' | 'fullscreen';
  onReady?: (payload?: unknown) => void;
  onOrganizationChange?: (payload: { organizationId?: string } & Record<string, unknown>) => void;
  onSessionLogout?: (payload?: unknown) => void;
  onBillingCheckout?: (payload: { status?: string; url?: string; error?: string } & Record<string, unknown>) => void;
  onAccountMenu?: (payload?: unknown) => void;
  onClose?: (payload?: unknown) => void;
};

type UseJustEveryProfilePopupResult = {
  open: (options?: { section?: ProfilePopupSection; organizationId?: string }) => void;
  close: () => void;
  setSection: (section: ProfilePopupSection) => void;
  refreshSession: () => void;
  refreshOrgs: () => void;
  isReady: boolean;
};

declare global {
  interface Window {
    JustEveryProfilePopup?: (options: {
      baseUrl?: string;
      section?: string;
      organizationId?: string | null;
      variant?: 'modal' | 'fullscreen';
      returnUrl?: string;
      onEvent: (event: PopupEvent) => void;
    }) => PopupInstance;
  }
}

let loadPromise: Promise<void> | null = null;

const ensurePopupScript = (src: string) => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.JustEveryProfilePopup) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load profile-popup.js'));
    document.head.appendChild(script);
  });

  return loadPromise;
};

export function useJustEveryProfilePopup(options: UseJustEveryProfilePopupOptions = {}): UseJustEveryProfilePopupResult {
  const {
    baseUrl,
    defaultSection,
    defaultOrganizationId,
    returnUrl,
    variant = 'modal',
    onReady,
    onOrganizationChange,
    onSessionLogout,
    onBillingCheckout,
    onAccountMenu,
    onClose,
  } = options;

  const instanceRef = useRef<PopupInstance | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let destroyed = false;

    const init = async () => {
      const resolvedBase = (baseUrl ?? 'https://login.justevery.com').replace(/\/+$/, '');
      const scriptSrc = `${resolvedBase}/profile-popup.js`;
      try {
        await ensurePopupScript(scriptSrc);
      } catch (error) {
        console.warn(error);
        return;
      }

      if (destroyed || !window.JustEveryProfilePopup) {
        return;
      }

      const handleEvent = (evt: PopupEvent) => {
        switch (evt.event) {
          case 'ready':
            setIsReady(true);
            onReady?.(evt.data ?? evt.payload);
            break;
          case 'organization:change':
            onOrganizationChange?.((evt.data ?? evt.payload ?? {}) as { organizationId?: string });
            break;
          case 'session:logout':
            onSessionLogout?.(evt.data ?? evt.payload);
            break;
          case 'billing:checkout':
            onBillingCheckout?.((evt.data ?? evt.payload ?? {}) as {
              status?: string;
              url?: string;
              error?: string;
            });
            break;
          case 'account:menu':
            onAccountMenu?.(evt.data ?? evt.payload);
            break;
          case 'close':
            onClose?.(evt.data ?? evt.payload);
            break;
          default:
            break;
        }
      };

      instanceRef.current = window.JustEveryProfilePopup({
        baseUrl,
        section: defaultSection,
        organizationId: defaultOrganizationId,
        variant,
        returnUrl,
        onEvent: handleEvent,
      });
    };

    void init();

    return () => {
      destroyed = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
      setIsReady(false);
    };
  }, [baseUrl, defaultSection, defaultOrganizationId, onAccountMenu, onBillingCheckout, onClose, onOrganizationChange, onReady, onSessionLogout, returnUrl, variant]);

  const open = useCallback((opts?: { section?: ProfilePopupSection; organizationId?: string }) => {
    instanceRef.current?.open(
      opts
        ? {
            ...(opts.section ? { section: opts.section } : {}),
            ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
          }
        : undefined
    );
  }, []);

  const close = useCallback(() => instanceRef.current?.close(), []);

  const setSection = useCallback(
    (section: ProfilePopupSection) => instanceRef.current?.postMessage('set-section', { section }),
    []
  );

  const refreshSession = useCallback(() => instanceRef.current?.postMessage('refresh-session'), []);

  const refreshOrgs = useCallback(() => instanceRef.current?.postMessage('refresh-orgs'), []);

  return { open, close, setSection, refreshSession, refreshOrgs, isReady };
}
