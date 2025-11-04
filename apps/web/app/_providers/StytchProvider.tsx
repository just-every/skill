import { createContext, type PropsWithChildren, useContext } from 'react';

export const StytchReadyContext = createContext<boolean>(false);
export const StytchErrorContext = createContext<string | null>(null);

export function useStytchReady(): boolean {
  return useContext(StytchReadyContext);
}

export function useStytchError(): string | null {
  return useContext(StytchErrorContext);
}

export default function StytchProvider({ children }: PropsWithChildren): JSX.Element {
  return (
    <StytchErrorContext.Provider value={null}>
      <StytchReadyContext.Provider value={false}>{children}</StytchReadyContext.Provider>
    </StytchErrorContext.Provider>
  );
}
