import { Stack } from 'expo-router';

import LogtoProvider from './_providers/LogtoProvider';

export default function RootLayout(): JSX.Element {
  return (
    <LogtoProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </LogtoProvider>
  );
}
