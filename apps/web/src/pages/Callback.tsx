import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

const Callback = () => (
  <View
    style={{
      flex: 1,
      minHeight: 320,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12
    }}
  >
    <ActivityIndicator color="#38bdf8" />
    <Text style={{ color: '#475569', textAlign: 'center' }}>
      Finishing authentication… You will be redirected momentarily.
    </Text>
  </View>
);

export default Callback;
