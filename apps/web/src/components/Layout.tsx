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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    const previousBody = document.body.style.overflow;
    const previousHtml = document.documentElement.style.overflow;
    document.body.style.overflow = mobileNavOpen ? 'hidden' : 'auto';
    document.documentElement.style.overflow = mobileNavOpen ? 'hidden' : 'auto';
    return () => {
      document.body.style.overflow = previousBody;
      document.documentElement.style.overflow = previousHtml;
    };
  }, [mobileNavOpen]);

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

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activePath]);

  const navVariant: 'transparent' | 'light' | 'dark' = isHome ? (navSolid ? 'light' : 'transparent') : 'dark';

  const navWrapperClass = cn(
    'fixed left-0 right-0 top-0 z-50 transition-all duration-500 ease-out',
    navVariant === 'transparent'
      ? 'border-b border-transparent bg-gradient-to-b from-slate-950/70 via-slate-950/30 to-transparent'
      : navVariant === 'light'
        ? 'border-b border-slate-200 bg-white/95 backdrop-blur'
        : 'border-b border-slate-900/70 bg-slate-950/95 backdrop-blur'
  );

  const navLinkBase = navVariant === 'light'
    ? 'text-slate-600 focus-visible:ring-offset-white'
    : 'text-white/80 focus-visible:ring-offset-transparent';
  const navActive = navVariant === 'light' ? 'bg-slate-100 text-ink' : 'bg-white/10 text-white';
  const navLinkText = navVariant === 'light' ? 'text-slate-600' : 'text-white/80';
  const navActiveText = navVariant === 'light' ? 'text-ink' : 'text-white';
  const ctaClass = navVariant === 'light'
    ? 'border-slate-200 bg-slate-50'
    : 'border-white/30 bg-white/10 hover:bg-white/20';
  const ctaTextClass = navVariant === 'light' ? 'text-ink' : 'text-white';

  return (
    <View className="min-h-screen flex-1 bg-surface">
      <View className={navWrapperClass}>
        <Container className="flex flex-row flex-wrap items-center justify-between gap-4 py-4">
          <Pressable onPress={() => navigate('/')} accessibilityRole="link" className="flex-row items-center gap-3">
            <Logo size={28} color={navVariant === 'light' ? '#0f172a' : '#ffffff'} />
          </Pressable>
          <View className="hidden flex-row flex-wrap items-center gap-2 md:gap-3 lg:flex">
            {NAV_ITEMS.map((item) => {
              const isActive = activePath === item.href || (item.href !== '/' && activePath.startsWith(item.href));

              return (
                <Pressable
                  key={item.href}
                  onPress={() => navigate(item.href)}
                  accessibilityRole="link"
                  className={cn(
                    'rounded-full px-4 py-2 text-base font-medium transition-colors duration-500 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
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
          <View className="flex flex-row items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'hidden rounded-full border px-5 py-2 transition-colors duration-500 ease-out lg:inline-flex',
                ctaClass
              )}
              textClassName={ctaTextClass}
              onPress={() => navigate('/app')}
            >
              Open app
            </Button>
            {mobileNavOpen ? (
              <Pressable
                onPress={() => setMobileNavOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-2xl border lg:hidden',
                  navVariant === 'light'
                    ? 'border-slate-200 bg-white/90 text-ink'
                    : 'border-white/40 bg-white/10 text-white'
                )}
              >
                <Text className="text-3xl font-semibold" style={{ lineHeight: 24 }}>
                  ×
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setMobileNavOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Open menu"
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors duration-500 ease-out lg:hidden',
                  navVariant === 'light' ? 'border-slate-200 bg-white/80' : 'border-white/30 bg-white/10'
                )}
              >
                <Text
                  className="text-2xl font-semibold"
                  style={{ color: navVariant === 'light' ? '#0f172a' : '#ffffff', lineHeight: 24 }}
                >
                  ☰
                </Text>
              </Pressable>
            )}
          </View>
        </Container>
      </View>

      <ScrollView
        className="flex-1"
        onScroll={isHome ? handleScroll : undefined}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: isHome ? 0 : 96 }}
      >
        <Container className={cn(isHome ? 'pt-0' : 'py-10 pt-0')}>{children}</Container>
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
      {mobileNavOpen && (
        <View className="absolute inset-0 z-40 px-6 pb-12 pt-20 text-white lg:hidden">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-slate-950/90"
          />
          <ScrollView className="relative h-full">
            <View className="space-y-6">
              {NAV_ITEMS.map((item) => {
                const isActive = activePath === item.href || (item.href !== '/' && activePath.startsWith(item.href));
                return (
                  <Pressable
                    key={item.href}
                    onPress={() => {
                      navigate(item.href);
                      setMobileNavOpen(false);
                    }}
                    accessibilityRole="link"
                    className="flex flex-row items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-4 py-3"
                  >
                    <Text className="text-lg font-semibold text-white">{item.label}</Text>
                    {isActive ? <Text className="text-sm text-white/70">Current</Text> : null}
                  </Pressable>
                );
              })}
              <Button
                variant="ghost"
                className="rounded-2xl border border-white/20 bg-white/10 py-3 text-base"
                onPress={() => {
                  setMobileNavOpen(false);
                  navigate('/app');
                }}
              >
                Open app
              </Button>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
};

export default Layout;
