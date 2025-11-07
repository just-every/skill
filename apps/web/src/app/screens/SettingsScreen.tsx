import React from 'react';
import { Text, TextInput, View } from 'react-native';

import type { Company } from '../types';

type SettingsScreenProps = {
  readonly company?: Company;
};

const SettingsScreen = ({ company }: SettingsScreenProps) => {
  return (
    <View style={{ backgroundColor: '#ffffff', borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0', padding: 24, gap: 16 }}>
      <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '700' }}>Branding</Text>
      <Text style={{ color: '#94a3b8' }}>
        These values map to `/api/accounts/:slug/branding`. Editing is disabled until the Worker endpoint persists to D1.
      </Text>

      <Field label="Primary color" value={company?.branding?.primaryColor ?? '#0f172a'} />
      <Field label="Secondary color" value={company?.branding?.secondaryColor ?? '#38bdf8'} />
      <Field label="Accent color" value={company?.branding?.accentColor ?? '#facc15'} />
      <Field label="Logo URL" value={company?.branding?.logoUrl ?? 'https://example.com/logo.png'} />
      <Field label="Tagline" value={company?.branding?.tagline ?? 'Ship fast on Workers'} multiline />
    </View>
  );
};

const Field = ({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) => (
  <View style={{ gap: 6 }}>
    <Text style={{ color: '#0f172a', fontWeight: '600' }}>{label}</Text>
    <TextInput
      value={value}
      editable={false}
      multiline={multiline}
      style={{
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: multiline ? 14 : 10,
        color: '#0f172a',
        backgroundColor: '#f8fafc'
      }}
    />
  </View>
);

export default SettingsScreen;
