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

export type Invite = {
  id: string;
  email: string;
  role: Member['role'];
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  invitedAt?: string;
  createdAt?: string;
  expiresAt?: string;
  invitedBy?: string;
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

export type Product = {
  id: string;
  name: string;
  description?: string;
  priceId: string;
  unitAmount: number;
  currency: string;
  interval?: 'month' | 'year';
  metadata?: Record<string, string>;
};

export type Invoice = {
  id: string;
  number: string | null;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' | 'past_due' | 'canceled';
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: string;
  dueDate?: string | null;
  hostedInvoiceUrl?: string | null;
  invoicePdf?: string | null;
};

export type DesignRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type DesignRun = {
  id: string;
  name: string;
  status: DesignRunStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  progress?: number;
  error?: string | null;
  prompt?: string | null;
  config?: {
    name?: string;
    prompt?: string;
    variants?: number;
    style?: string;
  };
};

export type DesignRunDetail = DesignRun & {
  timeline?: Array<{
    timestamp: string;
    event: string;
    message?: string;
  }>;
  outputs?: Array<{
    id: string;
    type: 'image' | 'video' | 'html' | 'json';
    url: string;
    thumbnail?: string;
    metadata?: Record<string, unknown>;
  }>;
};

export type DesignRunCreateInput = {
  name: string;
  prompt: string;
  variants?: number;
  style?: string;
};
