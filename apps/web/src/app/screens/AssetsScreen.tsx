import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { AssetObject } from '../types';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui';

type AssetsScreenProps = {
  readonly assets?: AssetObject[];
};

const AssetsScreen = ({ assets = [] }: AssetsScreenProps) => {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <View className="space-y-1">
          <CardTitle>Assets</CardTitle>
          <CardDescription>Uploads are stored in R2 under the `uploads/` prefix.</CardDescription>
        </View>
        <Button variant="ghost" className="border border-slate-200 px-4 py-2">
          Upload (coming soon)
        </Button>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <ScrollView className="max-h-[32rem]">
          <View className="flex flex-row px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            <Text className="flex-[3]">Key</Text>
            <Text className="flex-[1] text-right">Size</Text>
            <Text className="flex-[2] text-right">Uploaded</Text>
          </View>
          {assets.map((asset) => (
            <View
              key={asset.key}
              className="flex flex-row items-center gap-4 border-t border-slate-100 px-6 py-3 text-sm text-slate-700"
            >
              <Text className="flex-[3] text-ink">{asset.key}</Text>
              <Text className="flex-[1] text-right text-slate-500">{Math.round(asset.size / 1024)} KB</Text>
              <Text className="flex-[2] text-right text-slate-500">
                {asset.uploaded ? new Date(asset.uploaded).toLocaleString() : 'Pending'}
              </Text>
            </View>
          ))}
        </ScrollView>
      </CardContent>
    </Card>
  );
};

export default AssetsScreen;
