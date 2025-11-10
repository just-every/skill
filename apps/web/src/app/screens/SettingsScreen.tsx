import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import type { Company } from '../types';
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '../../components/ui';
import { useApiClient } from '../../api/client';

type SettingsScreenProps = {
  readonly company?: Company;
};

type BrandingForm = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string;
  tagline: string;
};

const defaultBranding: BrandingForm = {
  primaryColor: '#0f172a',
  secondaryColor: '#38bdf8',
  accentColor: '#facc15',
  logoUrl: 'https://example.com/logo.png',
  tagline: 'Ship fast on Workers',
};

const SettingsScreen = ({ company }: SettingsScreenProps) => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BrandingForm>(() => hydrateForm(company));
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    setForm(hydrateForm(company));
    setStatus('idle');
    setMessage('');
  }, [company?.id, company?.branding]);

  const handleChange = (field: keyof BrandingForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!company?.slug) {
      setStatus('error');
      setMessage('Select a company before saving branding changes.');
      return;
    }

    const payload = buildPayload(form);
    if (Object.keys(payload).length === 0) {
      setStatus('error');
      setMessage('Update at least one field before saving.');
      return;
    }

    try {
      setStatus('saving');
      setMessage('');
      await api.patch(`/api/accounts/${company.slug}/branding`, payload);
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      setStatus('success');
      setMessage('Branding updated via Worker. Give it a moment to propagate.');
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Unable to update branding.';
      setStatus('error');
      setMessage(description);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle>Branding</CardTitle>
        <CardDescription>
          Update the colors, logo, and tagline synced to `/api/accounts/:slug/branding`. Changes persist via D1 when
          available and fall back to Worker memory during local development.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Field label="Primary color" value={form.primaryColor} onChangeText={(text) => handleChange('primaryColor', text)} />
        <Field label="Secondary color" value={form.secondaryColor} onChangeText={(text) => handleChange('secondaryColor', text)} />
        <Field label="Accent color" value={form.accentColor} onChangeText={(text) => handleChange('accentColor', text)} />
        <Field label="Logo URL" value={form.logoUrl} onChangeText={(text) => handleChange('logoUrl', text)} autoCapitalize="none" />
        <Field
          label="Tagline"
          value={form.tagline}
          onChangeText={(text) => handleChange('tagline', text)}
          multiline
        />

        {status !== 'idle' && status !== 'saving' ? (
          <Alert
            variant={status === 'success' ? 'success' : 'danger'}
            title={status === 'success' ? 'Branding saved' : 'Unable to save branding'}
            description={message}
          />
        ) : null}

        <Button className="mt-2 w-full" onPress={handleSave} loading={status === 'saving'} disabled={status === 'saving'}>
          Save branding
        </Button>
      </CardContent>
    </Card>
  );
};

const Field = ({
  label,
  value,
  onChangeText,
  multiline,
  autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) => (
  <View className="space-y-2">
    <Label>{label}</Label>
    <Input
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  </View>
);

const hydrateForm = (company?: Company): BrandingForm => ({
  primaryColor: company?.branding?.primaryColor ?? defaultBranding.primaryColor,
  secondaryColor: company?.branding?.secondaryColor ?? defaultBranding.secondaryColor,
  accentColor: company?.branding?.accentColor ?? defaultBranding.accentColor,
  logoUrl: company?.branding?.logoUrl ?? defaultBranding.logoUrl,
  tagline: company?.branding?.tagline ?? defaultBranding.tagline,
});

const buildPayload = (form: BrandingForm): Record<string, string> => {
  const payload: Record<string, string> = {};
  (Object.keys(form) as Array<keyof BrandingForm>).forEach((key) => {
    const value = form[key]?.trim();
    if (value) {
      payload[key] = value;
    }
  });
  return payload;
};

export default SettingsScreen;
