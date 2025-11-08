import React, { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import type { InviteDraft } from '../../app/types';

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
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15,23,42,0.6)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 480,
            backgroundColor: '#ffffff',
            borderRadius: 24,
            padding: 24,
            gap: 16
          }}
        >
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#0f172a' }}>Invite teammate</Text>
            <Text style={{ color: '#475569' }}>
              Invitations are emailed through the Better Auth worker after backend wiring. For now the UI captures intent.
            </Text>
          </View>

          <TextInput
            placeholder="Full name"
            value={draft.name}
            onChangeText={(text) => handleField('name', text)}
            style={inputStyles}
          />
          <TextInput
            placeholder="email@example.com"
            value={draft.email}
            keyboardType="email-address"
            onChangeText={(text) => handleField('email', text)}
            style={inputStyles}
          />

          <View style={{ gap: 8 }}>
            <Text style={{ color: '#0f172a', fontWeight: '600' }}>Role</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {roles.map((role) => {
                const selected = role === draft.role;
                return (
                  <Pressable
                    key={role}
                    onPress={() => handleField('role', role)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected ? '#0f172a' : '#cbd5f5',
                      backgroundColor: selected ? 'rgba(15,23,42,0.08)' : '#fff'
                    }}
                  >
                    <Text style={{ color: selected ? '#0f172a' : '#475569', fontWeight: '600' }}>{role}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {submitted ? (
            <View style={{ backgroundColor: '#ecfccb', padding: 12, borderRadius: 12 }}>
              <Text style={{ color: '#365314' }}>
                Thanks! The invite endpoint still relies on the upcoming Worker migrations.
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
            <Pressable onPress={onClose} style={secondaryButtonStyles}>
              <Text style={{ color: '#0f172a', fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSubmit} style={primaryButtonStyles}>
              <Text style={{ color: '#0f172a', fontWeight: '700' }}>Send invite</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const inputStyles = {
  borderWidth: 1,
  borderColor: '#e2e8f0',
  borderRadius: 12,
  paddingHorizontal: 16,
  paddingVertical: 12,
  fontSize: 16,
  color: '#0f172a'
} as const;

const primaryButtonStyles = {
  backgroundColor: '#38bdf8',
  paddingHorizontal: 18,
  paddingVertical: 10,
  borderRadius: 12
} as const;

const secondaryButtonStyles = {
  paddingHorizontal: 18,
  paddingVertical: 10,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: '#cbd5f5'
} as const;

export default InviteModal;
