import React, { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useRouterContext } from '../router/RouterProvider';
import { cn } from '../lib/cn';

type ProfileSection = 'profile' | 'account' | 'security';

const parseSearchParams = (path: string): URLSearchParams => {
  const queryIndex = path.indexOf('?');
  if (queryIndex === -1) {
    return new URLSearchParams();
  }
  const search = path.slice(queryIndex + 1);
  try {
    return new URLSearchParams(search);
  } catch {
    return new URLSearchParams();
  }
};

const resolveSection = (params: URLSearchParams): ProfileSection => {
  const section = params.get('section');
  if (section === 'account' || section === 'security') {
    return section;
  }
  return 'profile';
};

const Profile = () => {
  const { path, navigate } = useRouterContext();
  const searchParams = useMemo(() => parseSearchParams(path), [path]);
  const isEmbed = searchParams.get('embed') === '1' || searchParams.get('embed') === 'true';
  const section = resolveSection(searchParams);

  useEffect(() => {
    if (!isEmbed || typeof document === 'undefined') {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        tryNotifyParentClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEmbed]);

  const handleClose = () => {
    if (isEmbed) {
      tryNotifyParentClose();
      return;
    }
    navigate('/app/overview', { replace: true });
  };

  const handleSectionChange = (next: ProfileSection) => {
    const basePath = '/profile';
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('section', next);
    if (isEmbed && !nextParams.get('embed')) {
      nextParams.set('embed', '1');
    }
    const search = nextParams.toString();
    const nextPath = search ? `${basePath}?${search}` : basePath;
    navigate(nextPath, { replace: true });
  };

  const containerClassName = cn(
    'flex-1 min-h-screen items-center justify-center',
    isEmbed ? 'bg-transparent px-0 py-0' : 'bg-slate-950/80 px-4 py-8'
  );

  return (
    <View className={containerClassName}>
      {!isEmbed && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close profile"
          onPress={handleClose}
          className="absolute inset-0"
        />
      )}
      <View
        className={cn(
          'relative w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl',
          'overflow-hidden'
        )}
      >
        <View className="flex flex-row items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <View>
            <Text className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Account
            </Text>
            <View className="mt-1 flex flex-row flex-wrap items-baseline gap-x-2 gap-y-1">
              <Text className="text-base font-semibold text-slate-900">James Peter</Text>
              <Text className="text-xs text-slate-400">•</Text>
              <Pressable
                accessibilityRole="button"
                className="flex flex-row items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1"
              >
                <Text className="text-[11px] font-medium text-white">James&apos; Workspace</Text>
                <Text className="text-[10px] text-slate-200">▾</Text>
              </Pressable>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close profile"
            onPress={handleClose}
            className="ml-4 h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white"
          >
            <Text className="text-lg" style={{ lineHeight: 20 }}>
              ×
            </Text>
          </Pressable>
        </View>

        <View className="flex flex-row border-b border-slate-200 bg-slate-50/60 px-4 pt-2">
          <ProfileTab
            label="Profile"
            active={section === 'profile'}
            onPress={() => handleSectionChange('profile')}
          />
          <ProfileTab
            label="Workspace"
            active={section === 'account'}
            onPress={() => handleSectionChange('account')}
          />
          <ProfileTab
            label="Security"
            active={section === 'security'}
            onPress={() => handleSectionChange('security')}
          />
        </View>

        <ScrollView className="max-h-[70vh]">
          <View className="gap-6 px-6 py-6">
            {section === 'profile' && <ProfileSectionView />}
            {section === 'account' && <AccountSectionView />}
            {section === 'security' && <SecuritySectionView />}
          </View>
        </ScrollView>

        <View className="flex flex-row items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
          <Text className="text-xs text-slate-400">Changes apply to your Better Auth session.</Text>
          <View className="flex flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={handleClose}
              className="rounded-full border border-slate-300 px-4 py-1.5"
            >
              <Text className="text-xs font-medium text-slate-700">Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};

type ProfileTabProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

const ProfileTab = ({ label, active, onPress }: ProfileTabProps) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    className={cn(
      'mr-1 rounded-full px-3 py-1.5',
      active ? 'bg-white shadow-sm' : 'bg-transparent'
    )}
  >
    <Text
      className={cn(
        'text-xs font-semibold',
        active ? 'text-slate-900' : 'text-slate-500'
      )}
    >
      {label}
    </Text>
  </Pressable>
);

const ProfileSectionView = () => (
  <View className="gap-3">
    <Text className="text-sm font-semibold text-slate-900">Profile</Text>
    <Text className="text-xs text-slate-500">
      This is a stubbed profile view. In a full implementation it would surface your Better Auth user name,
      email, and avatar along with preferences.
    </Text>
    <View className="mt-3 gap-2">
      <Text className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
        Primary email
      </Text>
      <Text className="text-sm text-slate-900">james@justevery.com</Text>
    </View>
  </View>
);

const AccountSectionView = () => (
  <View className="gap-3">
    <Text className="text-sm font-semibold text-slate-900">Workspace</Text>
    <Text className="text-xs text-slate-500">
      This section would list all workspaces/accounts associated with your user and allow fast switching
      between them.
    </Text>
  </View>
);

const SecuritySectionView = () => (
  <View className="gap-3">
    <Text className="text-sm font-semibold text-slate-900">Security</Text>
    <Text className="text-xs text-slate-500">
      This section would expose session, passkey, and security controls sourced from Better Auth.
    </Text>
  </View>
);

function tryNotifyParentClose() {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.parent?.postMessage({ type: 'profile:close' }, '*');
  } catch {
    // noop – best-effort notification only
  }
}

export default Profile;

