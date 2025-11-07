import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useRouterContext } from '../router/RouterProvider';

type LayoutProps = {
  readonly children?: React.ReactNode;
};

type NavItem = {
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Contact', href: '/contact' },
  { label: 'Dashboard', href: '/app' }
];

const normaliseActivePath = (path: string): string => {
  if (!path) {
    return '/';
  }
  return path.replace(/[#?].*$/, '') || '/';
};

const Layout = ({ children }: LayoutProps) => {
  const { path, navigate } = useRouterContext();
  const activePath = normaliseActivePath(path);

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', minHeight: '100%' }}>
      <View
        style={{
          backgroundColor: '#ffffff',
          borderBottomWidth: 1,
          borderBottomColor: '#e2e8f0',
          paddingVertical: 16
        }}
      >
        <View
          style={{
            maxWidth: 1120,
            width: '100%',
            alignSelf: 'center',
            paddingHorizontal: 24,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#0f172a' }}>justevery</Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {NAV_ITEMS.map((item) => {
              const isActive =
                activePath === item.href ||
                (item.href !== '/' && activePath.startsWith(item.href));

              return (
                <Pressable
                  key={item.href}
                  onPress={() => navigate(item.href)}
                  style={{ paddingVertical: 6, paddingHorizontal: 4 }}
                  accessibilityRole="link"
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: isActive ? '700' : '500',
                      color: isActive ? '#0f172a' : '#64748b'
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          width: '100%',
          maxWidth: 1120,
          paddingHorizontal: 24,
          paddingVertical: 32,
          alignSelf: 'center'
        }}
        style={{ flex: 1 }}
      >
        {children}
      </ScrollView>
      <View
        style={{
          paddingVertical: 24,
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
          backgroundColor: '#ffffff'
        }}
      >
        <Text style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
          © {new Date().getFullYear()} justevery starter stack. All rights reserved.
        </Text>
      </View>
    </View>
  );
};

export default Layout;
