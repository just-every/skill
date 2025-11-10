import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useRouterContext } from '../router/RouterProvider';
import { cn } from '../lib/cn';
import { Button } from './ui';
import { Logo } from './Logo';

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
    <View className="min-h-screen flex-1 bg-surface">
      <View className="border-b border-slate-200 bg-white py-4">
        <View className="mx-auto flex w-full max-w-5xl flex-row items-center justify-between px-6">
          <Pressable onPress={() => navigate('/')} accessibilityRole="link" className="flex-row items-center gap-3">
            <Logo size={28} />
            <Text className="text-xl font-bold text-ink">justevery</Text>
          </Pressable>
          <View className="flex flex-row flex-wrap items-center gap-4 md:gap-6">
            {NAV_ITEMS.map((item) => {
              const isActive = activePath === item.href || (item.href !== '/' && activePath.startsWith(item.href));

              return (
                <Pressable key={item.href} onPress={() => navigate(item.href)} className="py-1" accessibilityRole="link">
                  <Text className={cn('text-base font-medium text-slate-500', isActive && 'text-ink font-semibold')}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button variant="ghost" size="sm" className="border-slate-200 text-ink" onPress={() => navigate('/app')}>
            Open app
          </Button>
        </View>
      </View>

      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">{children}</View>
      </ScrollView>
      <View className="border-t border-slate-200 bg-white py-6">
        <Text className="text-center text-xs text-slate-400">
          © {new Date().getFullYear()} justevery starter stack. All rights reserved.
        </Text>
      </View>
    </View>
  );
};

export default Layout;
