import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { Member } from '../types';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui';

type TeamScreenProps = {
  readonly members?: Member[];
};

const roleVariant: Record<Member['role'], 'default' | 'warning' | 'success' | 'muted'> = {
  Owner: 'warning',
  Admin: 'default',
  Billing: 'success',
  Viewer: 'muted'
};

const statusVariant: Record<Member['status'], 'success' | 'warning' | 'danger'> = {
  active: 'success',
  invited: 'warning',
  suspended: 'danger'
};

const TeamScreen = ({ members = [] }: TeamScreenProps) => {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <View className="space-y-1">
          <CardTitle>Team members</CardTitle>
          <CardDescription>Roles and access are enforced once Worker endpoints ship.</CardDescription>
        </View>
        <View className="rounded-xl bg-sky-400/10 px-4 py-2">
          <Text className="text-sm font-semibold text-sky-400">Use Invite button in the shell</Text>
        </View>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <ScrollView className="max-h-[32rem]">
          {members.map((member) => (
            <View key={member.id} className="flex flex-row items-center justify-between border-b border-slate-100 px-6 py-4 last:border-b-0">
              <View className="space-y-1">
                <Text className="text-base font-semibold text-ink">{member.name}</Text>
                <Text className="text-sm text-slate-500">{member.email}</Text>
              </View>
              <View className="flex flex-row gap-2">
                <Badge variant={roleVariant[member.role]}>{member.role}</Badge>
                <Badge variant={statusVariant[member.status]}>{member.status}</Badge>
              </View>
            </View>
          ))}
        </ScrollView>
      </CardContent>
    </Card>
  );
};

export default TeamScreen;
