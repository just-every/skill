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
  <ScrollView className="flex-1 bg-surface px-4 py-10">
    <View className="mx-auto w-full max-w-5xl flex-col gap-10">
      <View className="space-y-3">
        <Text className="text-4xl font-bold text-ink">Get in touch</Text>
        <Text className="text-base text-slate-600">
          Drop us a note when you wire the starter stack into your product. The docs folder (and archived ops guides)
          covers infra runbooks, but we are ready to help when you get stuck.
        </Text>
      </View>

      <View className="grid gap-4 md:grid-cols-3">
        {supportChannels.map((channel) => (
          <Pressable
            key={channel.label}
            onPress={() => channel.action()}
            className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm transition hover:border-slate-300"
          >
            <Text className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
              {channel.label}
            </Text>
            <Text className="text-xl font-semibold text-ink">{channel.value}</Text>
            <Text className="mt-1 text-sm font-semibold text-accent">Tap to open</Text>
          </Pressable>
        ))}
      </View>

      <View className="space-y-3 rounded-3xl bg-ink px-6 py-8 text-slate-100 shadow-lg">
        <Text className="text-lg font-bold text-accent">Need bespoke support?</Text>
        <Text className="text-base text-slate-200">
          The starter ships with defaults, but we frequently help teams with Better Auth hardening, Stripe billing
          models, and Worker performance tuning. Reach out for a working session.
        </Text>
      </View>
    </View>
  </ScrollView>
);

export default Contact;
