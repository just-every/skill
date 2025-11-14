import React, { useCallback, useEffect, useState } from 'react';
import { NativeSyntheticEvent, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import type { NativeScrollEvent } from 'react-native/Libraries/Components/ScrollView/ScrollView';

import { useRouterContext } from '../router/RouterProvider';
import { cn } from '../lib/cn';
import { Button } from './ui';
import { Logo } from './Logo';
import { Container } from './Container';

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

const FOOTER_LINKS = [
  {
    title: 'Product',
    links: [
      { label: 'Overview', href: '/' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Dashboard', href: '/app' }
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Contact', href: '/contact' },
      { label: 'Callback', href: '/callback' },
      { label: 'Pricing FAQ', href: '/pricing' }
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Support', href: '/contact' },
      { label: 'Login', href: '/app' },
      { label: 'Privacy', href: '/contact' }
    ],
  }
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
  const isHome = activePath === '/';
  const [navSolid, setNavSolid] = useState(!isHome);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    const previousBody = document.body.style.overflow;
    const previousHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = previousBody;
      document.documentElement.style.overflow = previousHtml;
    };
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!isHome) {
        return;
      }
      const offsetY = event.nativeEvent.contentOffset?.y ?? 0;
      setNavSolid(offsetY > 56);
    },
    [isHome]
  );

  const navWrapperClass = cn(
    'fixed left-0 right-0 top-0 z-50 transition-all duration-300',
    navSolid ? 'border-b border-slate-200 bg-white/90 backdrop-blur' : 'border-b border-transparent bg-transparent'
  );

  const navLinkBase = navSolid
    ? 'text-slate-600 focus-visible:ring-offset-white'
    : 'text-white/80 focus-visible:ring-offset-transparent';
  const navActive = navSolid ? 'bg-slate-100 text-ink' : 'bg-white/10 text-white';
  const navLinkText = navSolid ? 'text-slate-600' : 'text-white/80';
  const navActiveText = navSolid ? 'text-ink' : 'text-white';
  const ctaClass = navSolid
    ? 'border-slate-200 bg-slate-50 text-ink'
    : 'border-white/30 bg-white/10 text-white hover:bg-white/20';

  return (
    <View className="min-h-screen flex-1 bg-surface">
      <View className={navWrapperClass}>
        <Container className="flex flex-row flex-wrap items-center justify-between gap-4 py-4">
          <Pressable onPress={() => navigate('/')} accessibilityRole="link" className="flex-row items-center gap-3">
            <Logo size={28} />
          </Pressable>
          <View className="flex flex-row flex-wrap items-center gap-2 md:gap-3">
            {NAV_ITEMS.map((item) => {
              const isActive = activePath === item.href || (item.href !== '/' && activePath.startsWith(item.href));

              return (
                <Pressable
                  key={item.href}
                  onPress={() => navigate(item.href)}
                  accessibilityRole="link"
                  className={cn(
                    'rounded-full px-4 py-2 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                    navLinkBase,
                    isActive && navActive
                  )}
                >
                  <Text className={cn('font-medium', navLinkText, isActive && `font-semibold ${navActiveText}`)}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button
            variant="ghost"
            size="sm"
            className={cn('rounded-full border px-5 py-2', ctaClass)}
            onPress={() => navigate('/app')}
          >
            Open app
          </Button>
        </Container>
      </View>

      <ScrollView
        className="flex-1"
        onScroll={isHome ? handleScroll : undefined}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: isHome ? 0 : 96 }}
      >
        <Container className={cn(isHome ? '' : 'py-10')}>{children}</Container>
        <View className="border-t border-slate-200 bg-white">
          <Container className="flex flex-col gap-10 py-10">
            <View className="flex flex-col gap-2 rounded-3xl border border-slate-100 bg-slate-50/80 p-6 md:flex-row md:items-center md:justify-between">
              <View>
                <Text className="text-lg font-semibold text-ink">Ready to launch your SaaS fast?</Text>
                <Text className="text-sm text-slate-500">
                  Deploy Workers, Better Auth, and Stripe in a single bootstrap flow.
                </Text>
              </View>
              <Button onPress={() => navigate('/app')} className="px-6" variant="primary">
                Start the tour
              </Button>
            </View>

            <View className="grid grid-cols-1 gap-8 md:grid-cols-4">
              <View className="space-y-3">
                <Logo size={32} />
                <Text className="text-sm text-slate-500">
                  The canonical JustEvery starter stack for Cloudflare Workers, Better Auth, and Stripe powered products.
                </Text>
              </View>
              {FOOTER_LINKS.map((column) => (
                <View key={column.title} className="space-y-3">
                  <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">{column.title}</Text>
                  <View className="space-y-2">
                    {column.links.map((link) => (
                      <Pressable
                        key={link.href}
                        onPress={() => navigate(link.href)}
                        accessibilityRole="link"
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:rounded"
                      >
                        <Text className="text-sm text-slate-600 hover:text-ink">{link.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </View>

            <Text className="text-center text-xs text-slate-400">
              © {new Date().getFullYear()} justevery starter stack. All rights reserved.
            </Text>
          </Container>
        </View>
      </ScrollView>
    </View>
  );
};

export default Layout;
