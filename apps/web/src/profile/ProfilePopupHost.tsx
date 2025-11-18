import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import type {
  ProfilePopupMessageFromFrame,
  ProfilePopupMessageToFrame,
  ProfilePopupSection,
} from './profilePopupTypes';

export type ProfilePopupHostHandle = {
  setSection: (section: ProfilePopupSection) => void;
  close: () => void;
  refreshSession: () => void;
  refreshOrgs: () => void;
};

export type ProfilePopupHostProps = {
  visible: boolean;
  baseUrl?: string;
  section?: ProfilePopupSection;
  organizationId?: string;
  returnUrl?: string;
  onReady?: (payload: unknown) => void;
  onOrganizationChange?: (payload: unknown) => void;
  onSessionLogout?: () => void;
  onClose?: (origin: 'popup' | 'host') => void;
  onAccountMenu?: (payload: unknown) => void;
};

export const ProfilePopupHost = forwardRef<ProfilePopupHostHandle, ProfilePopupHostProps>(
  function ProfilePopupHost(
    {
      visible,
      baseUrl = 'https://login.justevery.com',
      section,
      organizationId,
      returnUrl,
      onReady,
      onOrganizationChange,
      onSessionLogout,
      onClose,
      onAccountMenu,
    },
    ref,
  ) {
    const [nonce] = useState(() => Math.random().toString(36).slice(2));
    const webViewRef = useRef<WebView>(null);

    const parentOrigin = useMemo(() => {
      if (typeof window !== 'undefined' && window.location) {
        return window.location.origin;
      }
      try {
        return new URL(baseUrl).origin;
      } catch {
        return baseUrl;
      }
    }, [baseUrl]);

    const profileUrl = useMemo(() => {
      const url = new URL('/profile', baseUrl);
      url.searchParams.set('embed', '1');
      url.searchParams.set('origin', parentOrigin);
      url.searchParams.set('nonce', nonce);
      if (section) {
        url.searchParams.set('section', section);
      }
      if (organizationId) {
        url.searchParams.set('org_id', organizationId);
      }
      if (returnUrl) {
        url.searchParams.set('return', returnUrl);
      }
      return url.toString();
    }, [baseUrl, nonce, organizationId, parentOrigin, returnUrl, section]);

    const postCommand = useCallback(
      (command: ProfilePopupMessageToFrame['command'], payload?: unknown) => {
        const message: ProfilePopupMessageToFrame = {
          type: 'je-profile-popup',
          command,
          payload,
          nonce,
        };
        webViewRef.current?.postMessage(JSON.stringify(message));
      },
      [nonce],
    );

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        let data: ProfilePopupMessageFromFrame | null = null;
        try {
          data = JSON.parse(event.nativeEvent.data);
        } catch {
          return;
        }
        if (!data || data.type !== 'je-profile-popup') {
          return;
        }
        if (data.nonce && data.nonce !== nonce) {
          return;
        }
        const payload = data.payload ?? data.data;
        switch (data.event) {
          case 'ready':
            onReady?.(payload);
            break;
          case 'organization:change':
            onOrganizationChange?.(payload);
            break;
          case 'session:logout':
            onSessionLogout?.();
            break;
          case 'account:menu':
            onAccountMenu?.(payload);
            break;
          case 'close':
            onClose?.('popup');
            break;
          default:
            break;
        }
      },
      [nonce, onAccountMenu, onClose, onOrganizationChange, onReady, onSessionLogout],
    );

    useImperativeHandle(
      ref,
      () => ({
        setSection(nextSection: ProfilePopupSection) {
          postCommand('set-section', { section: nextSection });
        },
        close() {
          postCommand('close');
          onClose?.('host');
        },
        refreshSession() {
          postCommand('refresh-session');
        },
        refreshOrgs() {
          postCommand('refresh-orgs');
        },
      }),
      [onClose, postCommand],
    );

    return (
      <Modal
        visible={visible}
        onRequestClose={() => onClose?.('host')}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        transparent={false}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <WebView
              ref={webViewRef}
              source={{ uri: profileUrl }}
              onMessage={handleMessage}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              automaticallyAdjustContentInsets
              mixedContentMode="always"
            />
          </View>
        </View>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,5,5,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    height: '100%',
    borderRadius: Platform.OS === 'ios' ? 32 : 0,
    overflow: 'hidden',
    backgroundColor: '#050505',
  },
});

export default ProfilePopupHost;
