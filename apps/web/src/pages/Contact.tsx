import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

const supportChannels = [
  {
    label: 'Email',
    value: 'support@justevery.com',
    action: () => Linking.openURL('mailto:support@justevery.com')
  },
  {
    label: 'Docs',
    value: 'docs/archive/DEPLOYMENTS.md',
    action: () => Linking.openURL('https://github.com/justevery')
  },
  {
    label: 'Status',
    value: 'status.justevery.com',
    action: () => Linking.openURL('https://status.justevery.com')
  }
];

const Contact = () => (
  <ScrollView contentContainerStyle={{ flexGrow: 1, gap: 32 }}>
    <View style={{ gap: 12 }}>
      <Text style={{ color: '#0f172a', fontSize: 36, fontWeight: '700' }}>Get in touch</Text>
      <Text style={{ color: '#475569', fontSize: 16 }}>
        Drop us a note when you wire the starter stack into your product. The docs folder (and archived ops guides)
        covers infra runbooks, but we are ready to help when you get stuck.
      </Text>
    </View>

    <View style={{ gap: 16 }}>
      {supportChannels.map((channel) => (
        <Pressable
          key={channel.label}
          onPress={() => channel.action()}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 20,
            padding: 24,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            gap: 6
          }}
        >
          <Text style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: 2 }}>
            {channel.label}
          </Text>
          <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '600' }}>{channel.value}</Text>
          <Text style={{ color: '#38bdf8', fontSize: 14 }}>Tap to open</Text>
        </Pressable>
      ))}
    </View>

    <View
      style={{
        backgroundColor: '#0f172a',
        padding: 24,
        borderRadius: 24,
        gap: 12
      }}
    >
      <Text style={{ color: '#38bdf8', fontSize: 18, fontWeight: '700' }}>Need bespoke support?</Text>
      <Text style={{ color: '#cbd5f5', fontSize: 15 }}>
        The starter ships with defaults, but we frequently help teams with Logto tenant hardening, Stripe billing
        models, and Worker performance tuning. Reach out for a working session.
      </Text>
    </View>
  </ScrollView>
);

export default Contact;

