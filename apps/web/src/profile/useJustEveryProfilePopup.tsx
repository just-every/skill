import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

const hasDOM = typeof window !== 'undefined' && typeof document !== 'undefined';

let loadPromise: Promise<void> | null = null;

const installStubPopup = () => {
  if (window.JustEveryProfilePopup) return;
  console.warn('[profile-popup] using local stub; start login worker or dev proxy for full UI');
  window.JustEveryProfilePopup = ({ onEvent }) => {
    const emit = (event: string, data?: Record<string, unknown>) => {
      onEvent?.({ event, data });
    };
    // announce readiness so consumers continue to work in dev
    setTimeout(() => emit('ready', {}), 0);
    return {
      open: () => emit('open'),
      close: () => emit('close'),
      postMessage: () => {},
      destroy: () => {},
    };
  };
};

const loadScriptOnce = (src: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    debugLog('injecting profile popup script', src);
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = () => {
      debugLog('profile popup script loaded', src);
      resolve();
    };
    script.onerror = () => {
      debugLog('profile popup script failed to load', src);
      reject(new Error('Failed to load profile-popup.js'));
    };
    document.head.appendChild(script);
  });

const ensurePopupScript = (primarySrc: string, fallbackSrc?: string) => {
  if (!hasDOM) {
    debugLog('skipping profile popup script injection (no DOM available)');
    return Promise.resolve();
  }
  if (window.JustEveryProfilePopup) {
    debugLog('helper already available on window');
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      await loadScriptOnce(primarySrc);
      return;
    } catch (primaryError) {
      console.warn('[profile-popup] primary load failed', primaryError);
      if (fallbackSrc && fallbackSrc !== primarySrc) {
        try {
          await loadScriptOnce(fallbackSrc);
          return;
        } catch (fallbackError) {
          console.warn('[profile-popup] fallback load failed', fallbackError);
        }
      }
      installStubPopup();
    }
  })();

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

  if (!hasDOM) {
    const noop = () => undefined;
    return {
      open: noop,
      close: noop,
      setSection: noop,
      refreshSession: noop,
      refreshOrgs: noop,
      isReady: false,
    };
  }

  const instanceRef = useRef<PopupInstance | null>(null);
  const pendingOpenRef = useRef<{ section?: ProfilePopupSection; organizationId?: string } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const callbacksRef = useRef({
    onReady,
    onOrganizationChange,
    onSessionLogout,
    onBillingCheckout,
    onAccountMenu,
    onClose,
  });
  const defaultsRef = useRef<{ section?: ProfilePopupSection; organizationId?: string }>({
    section: defaultSection,
    organizationId: defaultOrganizationId,
  });

  const resolvedBaseUrl = useMemo(() => {
    const fallback = 'https://login.justevery.com';
    const base = baseUrl ?? fallback;
    const normalized = base.replace(/\/+$/, '') || fallback;
    debugLog('resolved base URL', normalized);
    return normalized;
  }, [baseUrl]);

  useEffect(() => {
    callbacksRef.current = {
      onReady,
      onOrganizationChange,
      onSessionLogout,
      onBillingCheckout,
      onAccountMenu,
      onClose,
    };
  }, [onAccountMenu, onBillingCheckout, onClose, onOrganizationChange, onReady, onSessionLogout]);

  useEffect(() => {
    defaultsRef.current = {
      section: defaultSection,
      organizationId: defaultOrganizationId,
    };
  }, [defaultOrganizationId, defaultSection]);

  const flushPendingOpen = useCallback(() => {
    if (!pendingOpenRef.current || !instanceRef.current) {
      return;
    }
    const payload = pendingOpenRef.current;
    instanceRef.current.open(Object.keys(payload).length ? payload : undefined);
    pendingOpenRef.current = null;
  }, []);

  useEffect(() => {
    if (!hasDOM) {
      debugLog('skipping profile popup initialization (no DOM available)');
      return undefined;
    }

    let destroyed = false;

    const init = async () => {
      const scriptSrc = `${resolvedBaseUrl}/profile-popup.js`;
      const fallbackSrc = hasDOM ? `${window.location.origin.replace(/\/$/, '')}/profile-popup.js` : undefined;
      try {
        await ensurePopupScript(scriptSrc, fallbackSrc);
      } catch (error) {
        console.warn(error);
        return;
      }

      if (destroyed || !window.JustEveryProfilePopup) {
        debugLog('helper unavailable after script load', { destroyed, hasHelper: Boolean(window.JustEveryProfilePopup) });
        return;
      }

      const handleEvent = (evt: PopupEvent) => {
        const { onReady: readyCb, onOrganizationChange: orgCb, onSessionLogout: logoutCb, onBillingCheckout: billingCb, onAccountMenu: accountCb, onClose: closeCb } =
          callbacksRef.current;
        switch (evt.event) {
          case 'ready':
            setIsReady(true);
            readyCb?.(evt.data ?? evt.payload);
            break;
          case 'organization:change':
            orgCb?.((evt.data ?? evt.payload ?? {}) as { organizationId?: string });
            break;
          case 'session:logout':
            logoutCb?.(evt.data ?? evt.payload);
            break;
          case 'billing:checkout':
            billingCb?.((evt.data ?? evt.payload ?? {}) as {
              status?: string;
              url?: string;
              error?: string;
            });
            break;
          case 'account:menu':
            accountCb?.(evt.data ?? evt.payload);
            break;
          case 'close':
            closeCb?.(evt.data ?? evt.payload);
            break;
          default:
            break;
        }
      };

      instanceRef.current = window.JustEveryProfilePopup({
        baseUrl: resolvedBaseUrl,
        section: defaultsRef.current.section,
        organizationId: defaultsRef.current.organizationId,
        variant,
        returnUrl,
        onEvent: handleEvent,
      });
      debugLog('initialized popup instance', {
        section: defaultsRef.current.section,
        organizationId: defaultsRef.current.organizationId,
      });

      flushPendingOpen();
    };

    void init();

    return () => {
      destroyed = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
      pendingOpenRef.current = null;
      setIsReady(false);
      debugLog('cleaned up popup instance');
    };
  }, [flushPendingOpen, resolvedBaseUrl, returnUrl, variant]);

  const open = useCallback((opts?: { section?: ProfilePopupSection; organizationId?: string }) => {
    const payload = {
      ...(opts?.section ? { section: opts.section } : {}),
      ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
    };

    if (!payload.section && defaultsRef.current.section) {
      payload.section = defaultsRef.current.section;
    }
    if (!payload.organizationId && defaultsRef.current.organizationId) {
      payload.organizationId = defaultsRef.current.organizationId;
    }

    const nextPayload = Object.keys(payload).length ? payload : undefined;

    debugLog('open requested', {
      payload: nextPayload,
      hasInstance: Boolean(instanceRef.current),
    });

    if (instanceRef.current) {
      instanceRef.current.open(nextPayload);
      return;
    }

    pendingOpenRef.current = nextPayload ?? {};
    debugLog('queued open request', pendingOpenRef.current);
  }, []);

  const close = useCallback(() => {
    pendingOpenRef.current = null;
    instanceRef.current?.close();
    debugLog('close requested');
  }, []);

  const setSection = useCallback(
    (section: ProfilePopupSection) => instanceRef.current?.postMessage('set-section', { section }),
    []
  );

  const refreshSession = useCallback(() => instanceRef.current?.postMessage('refresh-session'), []);

  const refreshOrgs = useCallback(() => instanceRef.current?.postMessage('refresh-orgs'), []);

  return { open, close, setSection, refreshSession, refreshOrgs, isReady };
}

export function __resetProfilePopupTestState() {
  if (typeof window !== 'undefined') {
    delete (window as Partial<Window>).JustEveryProfilePopup;
  }
  cachedDebugEnabled = null;
  loadPromise = null;
}
type DebugWindow = Window & { __JUSTEVERY_PROFILE_POPUP_DEBUG?: boolean };

const DEBUG_FLAG_KEY = 'EXPO_PUBLIC_PROFILE_POPUP_DEBUG';

let cachedDebugEnabled: boolean | null = null;

const isDebugEnabled = () => {
  if (cachedDebugEnabled !== null) {
    return cachedDebugEnabled;
  }
  let enabled = false;
  if (typeof process !== 'undefined' && process.env) {
    const raw = process.env[DEBUG_FLAG_KEY];
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (normalized === 'true') {
        enabled = true;
      } else if (normalized === 'false') {
        enabled = false;
      }
    }
  }
  if (!enabled && typeof window !== 'undefined') {
    const flag = (window as DebugWindow).__JUSTEVERY_PROFILE_POPUP_DEBUG;
    if (typeof flag === 'boolean') {
      enabled = flag;
    }
  }
  cachedDebugEnabled = enabled;
  return enabled;
};

const debugLog = (...args: unknown[]) => {
  if (!hasDOM || !isDebugEnabled()) {
    return;
  }
  console.info('[profile-popup:hook]', ...args);
};
