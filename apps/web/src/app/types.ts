export type CompanyStats = {
  activeMembers: number;
  pendingInvites: number;
  mrr: number;
  seats: number;
};

export type Company = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  industry?: string;
  createdAt?: string;
  billingEmail?: string;
  stats?: CompanyStats;
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
    tagline?: string;
    updatedAt?: string;
  };
};

export type Member = {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Billing' | 'Viewer';
  status: 'active' | 'invited' | 'suspended';
  joinedAt?: string;
  lastActiveAt?: string | null;
};

export type InviteDraft = {
  name: string;
  email: string;
  role: Member['role'];
};

export type AssetObject = {
  key: string;
  size: number;
  uploaded?: string | null;
};

export type UsagePoint = {
  bucket: string;
  requests: number;
  storageGb: number;
};

export type SubscriptionSummary = {
  active: boolean;
  plan: string | null;
  renewsOn: string | null;
  seats: number;
};
