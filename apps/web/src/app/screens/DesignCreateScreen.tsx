import React, { useState } from 'react';
import { Text, View } from 'react-native';

import type { DesignRunCreateInput } from '../types';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '../../components/ui';

type DesignCreateScreenProps = {
  readonly onSubmit: (input: DesignRunCreateInput) => Promise<void>;
  readonly isSubmitting?: boolean;
  readonly error?: string | null;
};

const DesignCreateScreen = ({ onSubmit, isSubmitting, error }: DesignCreateScreenProps) => {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [variants, setVariants] = useState('3');
  const [style, setStyle] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setValidationError(null);

    if (!name.trim()) {
      setValidationError('Run name is required');
      return;
    }

    if (!prompt.trim()) {
      setValidationError('Design prompt is required');
      return;
    }

    const variantsNum = parseInt(variants, 10);
    if (isNaN(variantsNum) || variantsNum < 1 || variantsNum > 10) {
      setValidationError('Variants must be between 1 and 10');
      return;
    }

    try {
      await onSubmit({
        name: name.trim(),
        prompt: prompt.trim(),
        variants: variantsNum,
        style: style.trim() || undefined,
      });

      setName('');
      setPrompt('');
      setVariants('3');
      setStyle('');
    } catch (err) {
      console.error('Failed to create design run:', err);
    }
  };

  const displayError = validationError || error;

  return (
    <View className="flex flex-col gap-6">
      <View className="rounded-3xl bg-gradient-to-br from-ink via-ink to-brand-900 p-6 text-white">
        <Text className="text-xs uppercase tracking-[0.35em] text-slate-200">Design Studio</Text>
        <Text className="mt-2 text-3xl font-bold text-white">Create New Run</Text>
        <Text className="mt-2 text-base text-slate-200">
          Generate design variations using AI. Each run creates multiple outputs based on your prompt.
        </Text>
      </View>

      <Card>
        <CardHeader>
          <CardTitle>Run Configuration</CardTitle>
          <CardDescription>
            Provide a name and prompt to generate design outputs. Optionally specify the number of variants and style.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-5">
          <View className="gap-2">
            <Label>Run Name</Label>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="e.g., Product Hero Banner"
              editable={!isSubmitting}
            />
          </View>

          <View className="gap-2">
            <Label>Design Prompt</Label>
            <Input
              value={prompt}
              onChangeText={setPrompt}
              placeholder="e.g., Create a modern hero section with vibrant colors"
              multiline
              numberOfLines={4}
              editable={!isSubmitting}
              className="min-h-[120px]"
            />
          </View>

          <View className="gap-2">
            <Label>Number of Variants</Label>
            <Input
              value={variants}
              onChangeText={setVariants}
              placeholder="3"
              keyboardType="number-pad"
              editable={!isSubmitting}
            />
            <Text className="text-xs text-slate-500">Generate 1-10 design variations</Text>
          </View>

          <View className="gap-2">
            <Label>Style (Optional)</Label>
            <Input
              value={style}
              onChangeText={setStyle}
              placeholder="e.g., minimalist, bold, playful"
              editable={!isSubmitting}
            />
          </View>

          {displayError ? (
            <View className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <Text className="text-sm text-red-800">{displayError}</Text>
            </View>
          ) : null}

          <Button
            onPress={() => void handleSubmit()}
            disabled={isSubmitting}
            loading={isSubmitting}
            className="mt-2"
          >
            {isSubmitting ? 'Creating run...' : 'Create Design Run'}
          </Button>
        </CardContent>
      </Card>
    </View>
  );
};

export default DesignCreateScreen;
