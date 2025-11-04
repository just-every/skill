import { createContext, useContext, type ReactNode } from 'react';

const LogtoReadyContext = createContext<boolean>(false);
const LogtoErrorContext = createContext<Error | null>(null);

export function useLogtoReady(): boolean {
  return useContext(LogtoReadyContext);
}

export function useLogtoError(): Error | null {
  return useContext(LogtoErrorContext);
}

export default function LogtoProvider({ children }: { children: ReactNode }): JSX.Element {
  return (
    <LogtoReadyContext.Provider value={false}>
      <LogtoErrorContext.Provider value={null}>{children}</LogtoErrorContext.Provider>
    </LogtoReadyContext.Provider>
  );
}
