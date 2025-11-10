import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import type { InviteDraft } from '../../app/types';
import { Alert, Button, Input } from '../../components/ui';
import { cn } from '../../lib/cn';

type InviteModalProps = {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSubmit?: (draft: InviteDraft) => void;
};

const roles: InviteDraft['role'][] = ['Owner', 'Admin', 'Billing', 'Viewer'];

export const InviteModal = ({ visible, onClose, onSubmit }: InviteModalProps) => {
  const [draft, setDraft] = useState<InviteDraft>({ name: '', email: '', role: 'Viewer' });
  const [submitted, setSubmitted] = useState(false);

  const handleField = (key: keyof InviteDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    setSubmitted(true);
    onSubmit?.(draft);
    setDraft({ name: '', email: '', role: 'Viewer' });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-slate-900/60 p-4">
        <View className="w-full max-w-md space-y-5 rounded-3xl bg-white p-6">
          <View className="space-y-1">
            <Text className="text-2xl font-bold text-ink">Invite teammate</Text>
            <Text className="text-base text-slate-600">
              Invitations are emailed through the Better Auth worker after backend wiring. For now the UI captures intent.
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

          {submitted ? (
            <Alert variant="success" title="Thanks!" description="The invite endpoint still relies on the upcoming Worker migrations." />
          ) : null}

          <View className="flex flex-row justify-end gap-3">
            <Button variant="ghost" className="px-4 py-2" onPress={onClose}>
              Cancel
            </Button>
            <Button className="px-4 py-2" onPress={handleSubmit}>
              Send invite
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default InviteModal;
