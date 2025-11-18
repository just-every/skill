import { useCallback, useMemo, useRef, useState } from 'react';

import ProfilePopupHost, {
  ProfilePopupHostHandle,
  type ProfilePopupHostProps,
} from './ProfilePopupHost';
import type { ProfilePopupSection } from './profilePopupTypes';

export type UseProfilePopupOptions = {
  baseUrl?: string;
  defaultSection?: ProfilePopupSection;
  defaultOrganizationId?: string;
  returnUrl?: string;
  onReady?: ProfilePopupHostProps['onReady'];
  onOrganizationChange?: ProfilePopupHostProps['onOrganizationChange'];
  onSessionLogout?: ProfilePopupHostProps['onSessionLogout'];
  onClose?: ProfilePopupHostProps['onClose'];
  onAccountMenu?: ProfilePopupHostProps['onAccountMenu'];
};

export type UseProfilePopupResult = {
  open: (options?: { section?: ProfilePopupSection; organizationId?: string }) => void;
  close: () => void;
  setSection: (section: ProfilePopupSection) => void;
  refreshSession: () => void;
  refreshOrgs: () => void;
  visible: boolean;
  Host: JSX.Element;
};

export const useProfilePopup = (options: UseProfilePopupOptions = {}): UseProfilePopupResult => {
  const {
    baseUrl,
    defaultSection,
    defaultOrganizationId,
    returnUrl,
    onAccountMenu,
    onClose,
    onOrganizationChange,
    onReady,
    onSessionLogout,
  } = options;

  const [visible, setVisible] = useState(false);
  const [section, setSectionState] = useState<ProfilePopupSection | undefined>(defaultSection);
  const [organizationId, setOrganizationId] = useState<string | undefined>(defaultOrganizationId);
  const hostRef = useRef<ProfilePopupHostHandle>(null);

  const open = useCallback(
    (opts?: { section?: ProfilePopupSection; organizationId?: string }) => {
      if (opts?.section) {
        setSectionState(opts.section);
      }
      if (opts?.organizationId) {
        setOrganizationId(opts.organizationId);
      }
      setVisible(true);
    },
    [],
  );

  const close = useCallback(() => {
    hostRef.current?.close();
    setVisible(false);
  }, []);

  const setSection = useCallback((next: ProfilePopupSection) => {
    setSectionState(next);
    hostRef.current?.setSection(next);
  }, []);

  const refreshSession = useCallback(() => {
    hostRef.current?.refreshSession();
  }, []);

  const refreshOrgs = useCallback(() => {
    hostRef.current?.refreshOrgs();
  }, []);

  const handleClose: ProfilePopupHostProps['onClose'] = useCallback(
    (origin) => {
      setVisible(false);
      onClose?.(origin);
    },
    [onClose],
  );

  const hostProps: ProfilePopupHostProps = useMemo(
    () => ({
      visible,
      baseUrl,
      section,
      organizationId,
      returnUrl,
      onReady,
      onOrganizationChange,
      onSessionLogout,
      onClose: handleClose,
      onAccountMenu,
    }),
    [
      baseUrl,
      handleClose,
      onAccountMenu,
      onOrganizationChange,
      onReady,
      onSessionLogout,
      organizationId,
      returnUrl,
      section,
      visible,
    ],
  );

  return {
    open,
    close,
    setSection,
    refreshSession,
    refreshOrgs,
    visible,
    Host: <ProfilePopupHost ref={hostRef} {...hostProps} />,
  };
};

export default useProfilePopup;
