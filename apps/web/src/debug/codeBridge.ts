import { useEffect } from 'react';

import { startBridge } from '@just-every/code-bridge';

type BridgeConfig = {
  url: string;
  secret: string;
  projectId: string;
};

const readBridgeConfig = (): BridgeConfig | null => {
  const url =
    process.env.EXPO_PUBLIC_CODE_BRIDGE_URL || process.env.CODE_BRIDGE_URL || undefined;
  const secret =
    process.env.EXPO_PUBLIC_CODE_BRIDGE_SECRET || process.env.CODE_BRIDGE_SECRET || undefined;
  const projectId =
    process.env.EXPO_PUBLIC_CODE_BRIDGE_PROJECT_ID || process.env.CODE_BRIDGE_PROJECT_ID;

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
    const config = readBridgeConfig();

    if (!config) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.info(
          '[code-bridge] dev bridge not configured; set EXPO_PUBLIC_CODE_BRIDGE_URL/SECRET to enable.'
        );
      }
      return undefined;
    }

    const bridge = startBridge({
      url: config.url,
      secret: config.secret,
      projectId: config.projectId,
      enabled: true,
    });

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.info('[code-bridge] connected', {
        url: config.url,
        projectId: config.projectId,
      });
    }

    return () => bridge?.disconnect?.();
  }, []);
};
