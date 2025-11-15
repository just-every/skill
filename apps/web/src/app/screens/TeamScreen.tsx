import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Invite, Member } from '../types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '../../components/ui';

type TeamScreenProps = {
  readonly members?: Member[];
  readonly invites?: Invite[];
  readonly viewerRole?: Member['role'];
  readonly onRemoveMember?: (memberId: string) => Promise<void>;
  readonly onChangeRole?: (memberId: string, newRole: Member['role']) => Promise<void>;
  readonly onUpdateMemberName?: (memberId: string, name: string) => Promise<void>;
  readonly onResendInvite?: (inviteId: string) => void;
  readonly onRevokeInvite?: (inviteId: string) => void;
};

const roleVariant: Record<Member['role'], 'default' | 'warning' | 'success' | 'muted'> = {
  Owner: 'warning',
  Admin: 'default',
  Billing: 'success',
  Viewer: 'muted',
};

const statusVariant: Record<Member['status'], 'success' | 'warning' | 'danger'> = {
  active: 'success',
  invited: 'warning',
  suspended: 'danger',
};

const inviteStatusVariant: Record<Invite['status'], 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  pending: 'warning',
  accepted: 'success',
  expired: 'muted',
  revoked: 'danger',
};

const TeamScreen = ({
  members = [],
  invites = [],
  viewerRole,
  onRemoveMember,
  onChangeRole,
  onUpdateMemberName,
  onResendInvite,
  onRevokeInvite,
}: TeamScreenProps) => {
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const canManageTeam = viewerRole === 'Owner' || viewerRole === 'Admin';
  const roleOptions = useMemo(() => (['Admin', 'Billing', 'Viewer'] as const), []);

  const handleChangeRole = async (memberId: string, newRole: Member['role'], currentRole: Member['role']) => {
    if (!canManageTeam || currentRole === newRole) {
      return;
    }
    setErrorMessage(null);
    setBusyMemberId(memberId);
    try {
      await onChangeRole?.(memberId, newRole);
    } catch (error) {
      console.error('Failed to update role', error);
      setErrorMessage('Unable to apply role change. Please try again.');
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleStartEditingName = (member: Member) => {
    setEditingNameId(member.id);
    setEditingNameValue(member.name);
    setNameError(null);
  };

  const handleSaveName = async (memberId: string) => {
    const trimmed = editingNameValue.trim();
    if (!trimmed) {
      setNameError('Name is required');
      return;
    }
    setBusyMemberId(memberId);
    try {
      await onUpdateMemberName?.(memberId, trimmed);
      setEditingNameId(null);
    } catch (error) {
      console.error('Failed to update name', error);
      setNameError('Unable to save name. Please try again.');
    } finally {
      setBusyMemberId(null);
    }
  };

  const confirmRemoval = async () => {
    if (!memberToRemove) {
      return;
    }
    setErrorMessage(null);
    setBusyMemberId(memberToRemove.id);
    try {
      await onRemoveMember?.(memberToRemove.id);
      setMemberToRemove(null);
    } catch (error) {
      console.error('Failed to remove member', error);
      setErrorMessage('Unable to remove member. Please try again.');
    } finally {
      setBusyMemberId(null);
    }
  };

  const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');

  return (
    <View className="space-y-6 relative">
      {errorMessage && (
        <View className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-sm font-semibold text-red-700">{errorMessage}</Text>
        </View>
      )}
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
                testID={`team-member-row-${member.id}`}
                dataSet={{ memberId: member.id }}
                className="flex flex-row items-center justify-between border-b border-slate-100 px-6 py-4 last:border-b-0"
              >
                <View className="space-y-1">
                  {editingNameId === member.id ? (
                    <View className="space-y-2">
                      <Input
                        testID={`team-member-name-input-${member.id}`}
                        value={editingNameValue}
                        onChangeText={setEditingNameValue}
                        className="rounded-2xl border-slate-300 bg-white"
                        autoFocus
                      />
                      <View className="flex flex-row gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          testID={`team-member-save-${member.id}`}
                          onPress={() => handleSaveName(member.id)}
                          disabled={busyMemberId === member.id}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          testID={`team-member-cancel-${member.id}`}
                          onPress={() => {
                            setEditingNameId(null);
                            setNameError(null);
                          }}
                          disabled={busyMemberId === member.id}
                          >
                          Cancel
                        </Button>
                      </View>
                      {nameError && <Text className="text-xs text-red-600">{nameError}</Text>}
                    </View>
                  ) : (
                    <View className="flex flex-row items-center gap-2">
                      <Text className="text-base font-semibold text-ink" testID={`team-member-name-${member.id}`}>
                        {member.name}
                      </Text>
                      {canManageTeam && member.role !== 'Owner' && (
                        <Pressable
                          testID={`team-member-edit-${member.id}`}
                          accessibilityRole="button"
                          onPress={() => handleStartEditingName(member)}
                        >
                          <Text className="text-xs font-semibold text-slate-500">Edit</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                  <Text className="text-sm text-slate-500">{member.email}</Text>
                </View>
                <View className="flex flex-col items-end gap-2">
                  <View className="flex flex-row flex-wrap items-center gap-2">
                    <Badge
                      variant={roleVariant[member.role]}
                      testID={`team-member-current-role-${member.id}`}
                    >
                      {member.role}
                    </Badge>
                    <Badge variant={statusVariant[member.status]}>{member.status}</Badge>
                  </View>
                  {canManageTeam && member.role !== 'Owner' && (
                    <View className="flex flex-row flex-wrap items-center gap-2">
                      {roleOptions.map((role) => (
                        <Pressable
                          key={`${member.id}-${role}`}
                          testID={`team-member-role-${member.id}-${role}`}
                          accessibilityRole="button"
                          onPress={() => handleChangeRole(member.id, role, member.role)}
                          disabled={busyMemberId === member.id}
                        >
                          <View
                            className={`rounded-full border px-3 py-1 ${
                              member.role === role
                                ? 'border-transparent bg-slate-900 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <Text className="text-xs font-semibold">{role}</Text>
                          </View>
                        </Pressable>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => setMemberToRemove(member)}
                        disabled={busyMemberId === member.id}
                        textClassName="text-red-600"
                      >
                        Remove
                      </Button>
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

      {memberToRemove && (
        <View className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <View className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <Text className="text-lg font-semibold text-ink">Confirm removal</Text>
            <Text className="mt-2 text-sm text-slate-600">
              Removing {memberToRemove.name} will revoke their access immediately. This cannot be undone from the UI.
            </Text>
            <View className="mt-4 flex flex-row items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onPress={() => setMemberToRemove(null)}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={confirmRemoval}
                loading={busyMemberId === memberToRemove.id}
              >
                Remove
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default TeamScreen;
