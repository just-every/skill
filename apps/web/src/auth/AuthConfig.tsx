import React, { createContext, useContext } from 'react';

export type AuthConfigValue = {
  redirectUri: string;
  redirectUriLocal?: string;
  redirectUriProd?: string;
  logoutRedirectUri?: string;
};

const AuthConfigContext = createContext<AuthConfigValue | undefined>(undefined);

export interface AuthConfigProviderProps {
  readonly value: AuthConfigValue;
  readonly children?: React.ReactNode;
}

export const AuthConfigProvider = ({ value, children }: AuthConfigProviderProps) => (
  <AuthConfigContext.Provider value={value}>{children}</AuthConfigContext.Provider>
);

export const useAuthConfig = (): AuthConfigValue => {
  const context = useContext(AuthConfigContext);
  if (!context) {
    throw new Error('useAuthConfig must be used within an AuthConfigProvider');
  }
  return context;
};
