import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Invite, Member } from '../types';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui';

type TeamScreenProps = {
  readonly members?: Member[];
  readonly invites?: Invite[];
  readonly viewerRole?: Member['role'];
  readonly onRemoveMember?: (memberId: string) => void;
  readonly onChangeRole?: (memberId: string, newRole: Member['role']) => void;
  readonly onResendInvite?: (inviteId: string) => void;
  readonly onRevokeInvite?: (inviteId: string) => void;
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

const inviteStatusVariant: Record<Invite['status'], 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  pending: 'warning',
  accepted: 'success',
  expired: 'muted',
  revoked: 'danger'
};

const TeamScreen = ({
  members = [],
  invites = [],
  viewerRole,
  onRemoveMember,
  onChangeRole,
  onResendInvite,
  onRevokeInvite,
}: TeamScreenProps) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const canManageTeam = viewerRole === 'Owner' || viewerRole === 'Admin';

  const handleRemoveMember = (memberId: string) => {
    onRemoveMember?.(memberId);
    setActiveMenu(null);
  };

  const handleChangeRole = (memberId: string, newRole: Member['role']) => {
    onChangeRole?.(memberId, newRole);
    setActiveMenu(null);
  };

  const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');

  return (
    <View className="space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <View className="space-y-1">
            <CardTitle>Team members</CardTitle>
            <CardDescription>
              {canManageTeam ? 'Manage your team members and their roles.' : 'View team members (read-only access).'}
            </CardDescription>
          </View>
          <View className="rounded-xl bg-sky-400/10 px-4 py-2">
            <Text className="text-sm font-semibold text-sky-400">Send invites from the AppShell</Text>
          </View>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <ScrollView className="max-h-[32rem]">
            {members.map((member) => (
              <View
                key={member.id}
                className="flex flex-row items-center justify-between border-b border-slate-100 px-6 py-4 last:border-b-0"
              >
                <View className="space-y-1">
                  <Text className="text-base font-semibold text-ink">{member.name}</Text>
                  <Text className="text-sm text-slate-500">{member.email}</Text>
                </View>
                <View className="flex flex-row items-center gap-2">
                  <Badge variant={roleVariant[member.role]}>{member.role}</Badge>
                  <Badge variant={statusVariant[member.status]}>{member.status}</Badge>
                  {canManageTeam && member.role !== 'Owner' && (
                    <View className="relative">
                      <Pressable onPress={() => setActiveMenu(activeMenu === member.id ? null : member.id)}>
                        <View className="rounded px-2 py-1 hover:bg-slate-100">
                          <Text className="text-base text-slate-600">⋮</Text>
                        </View>
                      </Pressable>
                      {activeMenu === member.id && (
                        <View className="absolute right-0 top-8 z-10 w-48 rounded-lg border border-slate-200 bg-white shadow-lg">
                          <View className="p-1">
                            <Text className="px-3 py-2 text-xs font-semibold text-slate-500">Change role</Text>
                            {(['Admin', 'Billing', 'Viewer'] as const).map((role) => (
                              <Pressable key={role} onPress={() => handleChangeRole(member.id, role)}>
                                <View className="rounded px-3 py-2 hover:bg-slate-100">
                                  <Text className="text-sm text-ink">{role}</Text>
                                </View>
                              </Pressable>
                            ))}
                            <View className="my-1 border-t border-slate-200" />
                            <Pressable onPress={() => handleRemoveMember(member.id)}>
                              <View className="rounded px-3 py-2 hover:bg-red-50">
                                <Text className="text-sm text-red-600">Remove member</Text>
                              </View>
                            </Pressable>
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <View className="space-y-1">
            <CardTitle>Pending invites</CardTitle>
            <CardDescription>
              {invites.length > 0
                ? 'Keep track of outstanding invitations.'
                : 'Send invites from the AppShell to grow your team.'}
            </CardDescription>
          </View>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {invites.length === 0 ? (
            <View className="px-6 py-8 text-center">
              <Text className="text-sm text-slate-500">No pending invites</Text>
            </View>
          ) : (
            <ScrollView className="max-h-80">
              {invites.map((invite) => (
                <View
                  key={invite.id}
                  className="flex flex-row items-center justify-between border-b border-slate-100 px-6 py-4 last:border-b-0"
                >
                  <View className="space-y-1">
                    <Text className="text-base font-semibold text-ink">{invite.email}</Text>
                    <Text className="text-xs text-slate-500">
                      Invited {formatDate(invite.invitedAt ?? invite.createdAt)} • Expires {formatDate(invite.expiresAt)}
                    </Text>
                  </View>
                  <View className="flex flex-row items-center gap-2">
                    <Badge variant={roleVariant[invite.role]}>{invite.role}</Badge>
                    <Badge variant={inviteStatusVariant[invite.status]}>{invite.status}</Badge>
                    <View className="flex flex-row gap-1">
                      <Button
                        variant="ghost"
                        disabled={!canManageTeam}
                        onPress={() => onResendInvite?.(invite.id)}
                      >
                        Resend
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!canManageTeam}
                        onPress={() => onRevokeInvite?.(invite.id)}
                      >
                        Revoke
                      </Button>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </CardContent>
      </Card>
    </View>
  );
};

export default TeamScreen;
