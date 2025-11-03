import { Stack } from 'expo-router';

import StytchProvider from './_providers/StytchProvider';

export default function RootLayout(): JSX.Element {
  return (
    <StytchProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </StytchProvider>
  );
}
