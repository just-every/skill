import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Member } from '../types';

type TeamScreenProps = {
  readonly members?: Member[];
};

const roleColors: Record<Member['role'], string> = {
  Owner: '#f97316',
  Admin: '#38bdf8',
  Billing: '#a855f7',
  Viewer: '#94a3b8'
};

const statusColors: Record<Member['status'], string> = {
  active: '#16a34a',
  invited: '#f97316',
  suspended: '#dc2626'
};

const TeamScreen = ({ members = [] }: TeamScreenProps) => {
  return (
    <View style={{ backgroundColor: '#ffffff', borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0' }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 24,
          borderBottomWidth: 1,
          borderBottomColor: '#e2e8f0'
        }}
      >
        <View>
          <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '700' }}>Team members</Text>
          <Text style={{ color: '#94a3b8' }}>Roles and access are enforced once Worker endpoints ship.</Text>
        </View>
        <View
          style={{
            backgroundColor: '#38bdf8',
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 12
          }}
        >
          <Text style={{ color: '#0f172a', fontWeight: '700' }}>Use Invite button in the shell</Text>
        </View>
      </View>

      <ScrollView style={{ maxHeight: 480 }}>
        {members.map((member) => (
          <View
            key={member.id}
            style={{
              paddingHorizontal: 24,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#f1f5f9',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <View>
              <Text style={{ color: '#0f172a', fontWeight: '600' }}>{member.name}</Text>
              <Text style={{ color: '#94a3b8' }}>{member.email}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Badge label={member.role} color={roleColors[member.role]} />
              <Badge label={member.status} color={statusColors[member.status]} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const Badge = ({ label, color }: { label: string; color: string }) => (
  <View
    style={{
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${color}55`,
      backgroundColor: `${color}22`
    }}
  >
    <Text style={{ color, fontWeight: '600' }}>{label}</Text>
  </View>
);

export default TeamScreen;
