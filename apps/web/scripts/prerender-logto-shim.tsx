import type { ReactNode } from 'react';

export type LogtoConfig = Record<string, never>;

export const LogtoProvider = ({ children }: { children: ReactNode }) => <>{children}</>;

export const useLogto = () => ({
  client: null,
  isAuthenticated: false,
  isInitialized: true,
  mode: 'redirect' as const,
  signIn: () => undefined,
  signOut: async () => undefined,
  getAccessToken: async () => '',
  getIdTokenClaims: async () => ({}),
  fetchUserInfo: async () => ({}),
  getRefreshToken: async () => null
});
