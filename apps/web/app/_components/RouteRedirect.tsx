import { useEffect } from 'react';
import { Link } from 'expo-router';
import { Platform, Text, View } from 'react-native';

const WORKER_ORIGIN = process.env.EXPO_PUBLIC_WORKER_ORIGIN || '';

type RouteRedirectProps = {
  title: string;
  path: string;
  subtitle?: string;
};

export function RouteRedirect(props: RouteRedirectProps) {
  const { title, path, subtitle } = props;
  const target = WORKER_ORIGIN ? `${WORKER_ORIGIN}${path}` : path;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.replace(target);
    }
  }, [target]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 12,
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: '600' }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: '#475569', maxWidth: 360, textAlign: 'center' }}>
          {subtitle}
        </Text>
      ) : null}
      <Link
        href={target}
        style={{
          paddingHorizontal: 18,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: '#2563eb',
          color: '#f8fafc',
          fontWeight: '600',
          textDecorationLine: 'none',
        }}
      >
        Continue
      </Link>
      <Text style={{ fontSize: 12, color: '#94a3b8' }}>
        Redirecting to <Text style={{ fontWeight: '600' }}>{target}</Text>
      </Text>
    </View>
  );
}
