import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

const Callback = () => (
  <View className="flex-1 min-h-[320px] items-center justify-center gap-3 bg-surface px-6 py-12">
    <ActivityIndicator color="#38bdf8" />
    <Text className="text-base text-slate-600 text-center">
      Finishing authentication… You will be redirected momentarily.
    </Text>
  </View>
);

export default Callback;
