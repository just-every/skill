import React from 'react';
import { Text, View } from 'react-native';

import type { Company } from '../types';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '../../components/ui';

type SettingsScreenProps = {
  readonly company?: Company;
};

const SettingsScreen = ({ company }: SettingsScreenProps) => {
  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle>Branding</CardTitle>
        <CardDescription>
          These values map to `/api/accounts/:slug/branding`. Editing is disabled until the Worker endpoint persists to D1.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Field label="Primary color" value={company?.branding?.primaryColor ?? '#0f172a'} />
        <Field label="Secondary color" value={company?.branding?.secondaryColor ?? '#38bdf8'} />
        <Field label="Accent color" value={company?.branding?.accentColor ?? '#facc15'} />
        <Field label="Logo URL" value={company?.branding?.logoUrl ?? 'https://example.com/logo.png'} />
        <Field label="Tagline" value={company?.branding?.tagline ?? 'Ship fast on Workers'} multiline />
        <Button variant="ghost" className="mt-2 w-full" disabled>
          Save branding (coming soon)
        </Button>
      </CardContent>
    </Card>
  );
};

const Field = ({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) => (
  <View className="space-y-2">
    <Label>{label}</Label>
    <Input value={value} editable={false} multiline={multiline} />
  </View>
);

export default SettingsScreen;
