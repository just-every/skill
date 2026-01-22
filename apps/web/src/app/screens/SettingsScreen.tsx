import React from 'react';
import { Text, View } from 'react-native';

import type { Company } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui';

type SettingsScreenProps = {
  readonly company?: Company;
};

const SettingsScreen = ({ company }: SettingsScreenProps) => {
  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle>Organization branding</CardTitle>
        <CardDescription>
          Branding is managed globally in the login service. This app no longer persists organization branding settings
          locally.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <View className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Text className="text-xs uppercase tracking-[0.25em] text-slate-500">Current organization</Text>
          <Text className="mt-1 text-base font-semibold text-ink">{company?.name ?? 'No organization selected'}</Text>
        </View>
        <Text className="text-sm text-slate-600">Use “Manage login profile” to update organization details.</Text>
      </CardContent>
    </Card>
  );
};

export default SettingsScreen;
