import React from 'react';
import { Text, View } from 'react-native';

import type { UsagePoint } from '../types';

type UsageScreenProps = {
  readonly points?: UsagePoint[];
};

const UsageScreen = ({ points = [] }: UsageScreenProps) => {
  return (
    <View style={{ backgroundColor: '#ffffff', borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0' }}>
      <View style={{ padding: 24, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
        <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '700' }}>Usage (last 7 days)</Text>
        <Text style={{ color: '#94a3b8' }}>Charts will hook into Workers analytics once the usage endpoint ships.</Text>
      </View>
      <View>
        {points.map((point) => (
          <View
            key={point.bucket}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: 24,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#f1f5f9'
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '600' }}>{point.bucket}</Text>
            <View style={{ minWidth: 220 }}>
              <Text style={{ color: '#475569' }}>{point.requests.toLocaleString()} requests</Text>
              <Text style={{ color: '#94a3b8' }}>{point.storageGb.toFixed(2)} GB stored</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

export default UsageScreen;
