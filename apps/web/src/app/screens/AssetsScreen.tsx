import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { AssetObject } from '../types';

type AssetsScreenProps = {
  readonly assets?: AssetObject[];
};

const AssetsScreen = ({ assets = [] }: AssetsScreenProps) => {
  return (
    <View style={{ backgroundColor: '#ffffff', borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0' }}>
      <View
        style={{
          padding: 24,
          borderBottomWidth: 1,
          borderBottomColor: '#e2e8f0',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <View>
          <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '700' }}>Assets</Text>
          <Text style={{ color: '#94a3b8' }}>Uploads are stored in R2 under the `uploads/` prefix.</Text>
        </View>
        <Pressable style={{ borderRadius: 12, borderWidth: 1, borderColor: '#cbd5f5', padding: 10 }}>
          <Text style={{ color: '#0f172a', fontWeight: '600' }}>Upload (coming soon)</Text>
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: 360 }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 12 }}>
          <HeaderCell label="Key" flex={3} />
          <HeaderCell label="Size" flex={1} />
          <HeaderCell label="Uploaded" flex={2} />
        </View>
        {assets.map((asset) => (
          <View
            key={asset.key}
            style={{
              flexDirection: 'row',
              paddingHorizontal: 24,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: '#f1f5f9'
            }}
          >
            <Cell flex={3}>{asset.key}</Cell>
            <Cell flex={1}>{Math.round(asset.size / 1024)} KB</Cell>
            <Cell flex={2}>{asset.uploaded ? new Date(asset.uploaded).toLocaleString() : 'Pending'}</Cell>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const HeaderCell = ({ label, flex }: { label: string; flex: number }) => (
  <View style={{ flex }}>
    <Text style={{ color: '#94a3b8', fontWeight: '600', fontSize: 12 }}>{label.toUpperCase()}</Text>
  </View>
);

const Cell = ({ children, flex }: { children: React.ReactNode; flex: number }) => (
  <View style={{ flex }}>
    <Text style={{ color: '#0f172a' }}>{children}</Text>
  </View>
);

export default AssetsScreen;
