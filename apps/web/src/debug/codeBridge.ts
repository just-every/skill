import { useEffect } from 'react';

import { startBridge, BridgeConnection } from '@just-every/code-bridge';

type BridgeConfig = {
  url: string;
  secret: string;
  projectId: string;
};

// Module-level bridge reference for sending errors from error boundaries
let activeBridge: BridgeConnection | null = null;

const readBridgeConfig = (): BridgeConfig | null => {
  // Keep direct process.env references so Metro/Webpack inlines EXPO_PUBLIC_* at build time.
  const url =
    process.env.EXPO_PUBLIC_CODE_BRIDGE_URL ||
    process.env.CODE_BRIDGE_URL ||
    (globalThis as any).EXPO_PUBLIC_CODE_BRIDGE_URL ||
    (globalThis as any).CODE_BRIDGE_URL;

  const secret =
    process.env.EXPO_PUBLIC_CODE_BRIDGE_SECRET ||
    process.env.CODE_BRIDGE_SECRET ||
    (globalThis as any).EXPO_PUBLIC_CODE_BRIDGE_SECRET ||
    (globalThis as any).CODE_BRIDGE_SECRET;

  const projectId =
    process.env.EXPO_PUBLIC_CODE_BRIDGE_PROJECT_ID ||
    process.env.CODE_BRIDGE_PROJECT_ID ||
    (globalThis as any).EXPO_PUBLIC_CODE_BRIDGE_PROJECT_ID ||
    (globalThis as any).CODE_BRIDGE_PROJECT_ID;

  if (!url || !secret) {
    return null;
  }

  return {
    url,
    secret,
    projectId: projectId || 'apps-web',
  };
};

export const useCodeBridge = (): void => {
  useEffect(() => {
    // Expo web doesn't always define __DEV__, so force the bridge into dev mode when this hook runs.
    (globalThis as any).__CODE_BRIDGE_DEV__ = true;

    let config: BridgeConfig | null = null;
    try {
      config = readBridgeConfig();
    } catch (err) {
      console.warn('[code-bridge] failed to read config', err);
    }

    if (!config) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.info(
          '[code-bridge] dev bridge not configured; set EXPO_PUBLIC_CODE_BRIDGE_URL/SECRET to enable.'
        );
      }
      return undefined;
    }

    const captureScreenshot = async () => {
      const html2canvas = (window as any).html2canvas;
      if (typeof html2canvas !== 'function') {
        throw new Error('html2canvas not available');
      }

      const canvas = await html2canvas(document.body);
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1] || '';
      return { mime: 'image/png', data: base64 };
    };

    console.info('[code-bridge][web] initializing bridge');
    const bridge = startBridge({
      url: config.url,
      secret: config.secret,
      projectId: config.projectId,
      enabled: true,
      enablePageview: true,
      enableControl: true,
      enableScreenshot: true,
    });

    console.info('[code-bridge][web] bridge started', { url: config.url, projectId: config.projectId });

    // Store reference for sendBridgeError
    activeBridge = bridge;

    // Listen for control events from the host (e.g. screenshot requests)
    bridge.onControl?.(async (msg: any) => {
      if (!msg || msg.type !== 'screenshot') return;

      try {
        const screenshot = await captureScreenshot();
        bridge.sendScreenshot?.({
          ...screenshot,
          url: window.location.href,
          route: window.location.pathname,
        });
      } catch (err) {
        console.warn('[code-bridge] failed to capture screenshot', err);
      }
    });

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.info('[code-bridge] connected', {
        url: config.url,
        projectId: config.projectId,
      });
    }

    return () => {
      activeBridge = null;
      bridge?.disconnect?.();
    };
  }, []);
};

/**
 * Send an error to the code-bridge host. Used by React error boundaries
 * to report caught errors that wouldn't otherwise trigger window.onerror.
 *
 * Dev-only: no-op if bridge is not connected.
 */
export const sendBridgeError = (error: Error, context?: string): void => {
  if (!activeBridge) return;

  // The bridge's console.error patch will forward this to the host
  // with type: 'console', level: 'error'. For explicit error events,
  // we log with a structured format the host can parse.
  const prefix = context ? `[${context}] ` : '';
  console.error(`${prefix}${error.name}: ${error.message}\n${error.stack ?? ''}`);
};

/**
 * Trigger a test error for verifying code-bridge integration.
 * Dev-only utility - call from browser console: window.__triggerBridgeTestError?.()
 */
export const triggerBridgeTestError = (): void => {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  const testError = new Error('[code-bridge test] This is a test error to verify bridge integration');
  testError.name = 'BridgeTestError';
  console.error('[code-bridge] triggering test error:', testError.message);

  // Also throw to trigger window.onerror
  setTimeout(() => {
    throw testError;
  }, 0);
};

// Expose test trigger on window in dev mode
if (typeof window !== 'undefined' && (typeof __DEV__ === 'undefined' || __DEV__)) {
  (window as any).__triggerBridgeTestError = triggerBridgeTestError;
}
