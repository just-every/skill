import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import type { InviteDraft } from '../../app/types';
import { Alert, Button, Input } from '../../components/ui';
import { cn } from '../../lib/cn';

type InviteModalProps = {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSubmit?: (draft: InviteDraft) => Promise<void> | void;
};

const roles: InviteDraft['role'][] = ['Owner', 'Admin', 'Billing', 'Viewer'];

export const InviteModal = ({ visible, onClose, onSubmit }: InviteModalProps) => {
  const [draft, setDraft] = useState<InviteDraft>({ name: '', email: '', role: 'Viewer' });
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleField = (key: keyof InviteDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const resetState = () => {
    setDraft({ name: '', email: '', role: 'Viewer' });
    setStatus('idle');
    setMessage('');
    setLoading(false);
  };

  useEffect(() => {
    if (!visible) {
      resetState();
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!draft.name.trim() || !draft.email.trim()) {
      setStatus('error');
      setMessage('Name and email are required to send an invite.');
      return;
    }
    try {
      setLoading(true);
      await onSubmit?.(draft);
      setStatus('success');
      setMessage(`Invite queued for ${draft.email}.`);
      setDraft({ name: '', email: '', role: draft.role });
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Failed to send invite.';
      setStatus('error');
      setMessage(description);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 items-center justify-center bg-slate-900/60 p-4">
        <View className="w-full max-w-md space-y-5 rounded-3xl bg-white p-6">
          <View className="space-y-1">
            <Text className="text-2xl font-bold text-ink">Invite teammate</Text>
            <Text className="text-base text-slate-600">
              Invitations are issued through the Worker invite endpoint and include a seven-day signup link.
            </Text>
          </View>

          <Input placeholder="Full name" value={draft.name} onChangeText={(text) => handleField('name', text)} />
          <Input
            placeholder="email@example.com"
            value={draft.email}
            keyboardType="email-address"
            onChangeText={(text) => handleField('email', text)}
          />

          <View className="space-y-2">
            <Text className="text-sm font-semibold text-ink">Role</Text>
            <View className="flex flex-wrap gap-2">
              {roles.map((role) => {
                const selected = role === draft.role;
                return (
                  <Pressable
                    key={role}
                    onPress={() => handleField('role', role)}
                    className={cn(
                      'rounded-full border px-4 py-1.5',
                      selected ? 'border-ink bg-slate-900/5 text-ink' : 'border-slate-200'
                    )}
                  >
                    <Text className={cn('text-sm font-semibold', selected ? 'text-ink' : 'text-slate-600')}>{role}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {status !== 'idle' ? (
            <Alert
              variant={status === 'success' ? 'success' : 'danger'}
              title={status === 'success' ? 'Invite sent' : 'Unable to send invite'}
              description={message}
            />
          ) : null}

          <View className="flex flex-row justify-end gap-3">
            <Button variant="ghost" className="px-4 py-2" onPress={handleClose}>
              Cancel
            </Button>
            <Button className="px-4 py-2" onPress={handleSubmit} loading={loading} disabled={loading}>
              Send invite
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default InviteModal;
