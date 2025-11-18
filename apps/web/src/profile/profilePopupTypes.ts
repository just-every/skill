export type ProfilePopupEventType =
  | 'ready'
  | 'organization:change'
  | 'session:logout'
  | 'close'
  | 'account:menu';

export type ProfilePopupMessageFromFrame = {
  type: 'je-profile-popup';
  event: ProfilePopupEventType;
  nonce?: string | null;
  data?: unknown;
  payload?: unknown;
};

export type ProfilePopupCommandType =
  | 'set-section'
  | 'close'
  | 'refresh-session'
  | 'refresh-orgs';

export type ProfilePopupMessageToFrame = {
  type: 'je-profile-popup';
  command: ProfilePopupCommandType;
  payload?: unknown;
  nonce?: string | null;
};

export type ProfilePopupSection =
  | 'account'
  | 'security'
  | 'organizations'
  | 'developer'
  | 'billing'
  | string;
