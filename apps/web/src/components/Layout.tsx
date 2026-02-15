import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '../lib/cn';
import { useRouterContext } from '../router/RouterProvider';
import { BrandImage } from './BrandImage';

export type LayoutProps = {
  readonly children: React.ReactNode;
};

const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Skills', to: '/skills' },
  { label: 'Credibility', to: '/skills' },
  { label: 'About', to: '/skills' },
] as const;

const Layout = ({ children }: LayoutProps) => {
  const { navigate, path } = useRouterContext();
  const cleanPath = path.replace(/[?#].*$/, '');
  const onSkillsPage = cleanPath === '/skills';

  const primaryLabel = onSkillsPage ? 'Back Home' : 'Browse';
  const secondaryLabel = onSkillsPage ? 'Jump to Rankings' : 'View Rankings';

  const handlePrimaryAction = () => {
    if (onSkillsPage) {
      navigate('/');
      return;
    }
    navigate('/skills');
  };

  const handleSecondaryAction = () => {
    navigate('/skills#top-candidates');
  };

  return (
    <View className="min-h-screen bg-[#f7f3ec] text-[#211c17]">
      <View className="border-b border-[#e5ddd1] bg-[#f8f5ef]/95">
        <View className="mx-auto flex w-full max-w-[1200px] flex-row items-center justify-between gap-4 px-4 py-3 md:px-8 md:py-4">
          <Pressable accessibilityRole="button" onPress={() => navigate('/')} className="flex-row items-center gap-3">
            <BrandImage src="/brand/logo-main.webp" alt="Every Skill" width={196} height={42} className="h-9 w-auto" />
          </Pressable>

          <View className="hidden flex-row items-center gap-7 md:flex">
            {navItems.map((item) => {
              const active = cleanPath === item.to;
              return (
                <Pressable accessibilityRole="button" key={item.label} onPress={() => navigate(item.to)}>
                  <Text className={cn('text-base', active ? 'font-semibold text-[#2a241d]' : 'text-[#4c4338]')}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row items-center gap-2 md:gap-3">
            <Pressable accessibilityRole="button" onPress={handlePrimaryAction} className="rounded-xl border border-[#d9cfbf] bg-[#f8f5ef] px-3 py-2 md:px-4">
              <Text className="text-xs font-semibold text-[#3e352b] md:text-sm">{primaryLabel}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={handleSecondaryAction} className="rounded-xl bg-[#174f87] px-3 py-2 md:px-4">
              <Text className="text-xs font-semibold text-white md:text-sm">{secondaryLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10">{children}</View>

      <View className="border-t border-[#e6ddcf] bg-[#f0e9dd]">
        <View className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-8">
          <View className="gap-1">
            <Text className="text-2xl font-medium text-[#1f1a14]" style={{ fontFamily: 'var(--font-display)' }}>
              Every Skill
            </Text>
            <Text className="text-sm text-[#4f453a]">© 2026 Every Skill. All rights reserved.</Text>
          </View>
          <View className="flex-row items-center gap-6">
            <Text className="text-sm text-[#4f453a]">Privacy Policy</Text>
            <Text className="text-sm text-[#4f453a]">Terms of Service</Text>
            <Text className="text-sm text-[#4f453a]">Contact</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export default Layout;
