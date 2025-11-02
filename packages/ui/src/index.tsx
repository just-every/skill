import React from 'react';
import { Text, View } from 'react-native';

export type PlaceholderCardProps = {
  title: string;
  description?: string;
};

export function PlaceholderCard({ title, description }: PlaceholderCardProps) {
  return (
    <View
      style={{
        padding: 20,
        borderRadius: 16,
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#1e293b',
        width: '100%',
        maxWidth: 360,
        gap: 8,
      }}
    >
      <Text style={{ color: '#38bdf8', fontWeight: '700', fontSize: 18 }}>{title}</Text>
      {description ? (
        <Text style={{ color: '#cbd5f5', lineHeight: 20 }}>{description}</Text>
      ) : null}
    </View>
  );
}
