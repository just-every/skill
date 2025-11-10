import React from 'react';
import { Text, View } from 'react-native';

import type { UsagePoint } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui';

type UsageScreenProps = {
  readonly points?: UsagePoint[];
};

const UsageScreen = ({ points = [] }: UsageScreenProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage (last 7 days)</CardTitle>
        <CardDescription>
          Charts will hook into Workers analytics once the usage endpoint ships.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-0">
        {points.map((point) => (
          <View key={point.bucket} className="flex flex-row items-center justify-between border-b border-slate-100 px-6 py-4 last:border-b-0">
            <Text className="text-base font-semibold text-ink">{point.bucket}</Text>
            <View className="min-w-[220px] space-y-1 text-right">
              <Text className="text-sm text-slate-600">{point.requests.toLocaleString()} requests</Text>
              <Text className="text-sm text-slate-400">{point.storageGb.toFixed(2)} GB stored</Text>
            </View>
          </View>
        ))}
      </CardContent>
    </Card>
  );
};

export default UsageScreen;
