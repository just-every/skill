import type { AssetObject, Company, Member, SubscriptionSummary, UsagePoint } from './types';

export const fallbackCompanies: Company[] = [
  {
    id: 'acct-justevery',
    slug: 'justevery',
    name: 'justevery, inc.',
    plan: 'Scale',
    industry: 'Developer Tools',
    billingEmail: 'billing@justevery.com',
    stats: { activeMembers: 6, pendingInvites: 1, mrr: 5400, seats: 12 },
    branding: {
      primaryColor: '#0f172a',
      secondaryColor: '#38bdf8',
      accentColor: '#facc15',
      logoUrl: 'https://dummyimage.com/200x48/0f172a/ffffff&text=justevery',
      tagline: 'Launch on day one'
    }
  },
  {
    id: 'acct-aerion-labs',
    slug: 'aerion-labs',
    name: 'Aerion Labs',
    plan: 'Launch',
    industry: 'Climate',
    billingEmail: 'finance@aerionlabs.com',
    stats: { activeMembers: 4, pendingInvites: 2, mrr: 2100, seats: 8 },
    branding: {
      primaryColor: '#052e16',
      secondaryColor: '#d9f99d',
      accentColor: '#34d399',
      logoUrl: 'https://dummyimage.com/200x48/052e16/d9f99d&text=Aerion',
      tagline: 'Instrumenting the built world'
    }
  }
];

const memberPool: Member[] = [
  {
    id: 'mbr-ava',
    name: 'Ava Patel',
    email: 'ava@justevery.com',
    role: 'Owner',
    status: 'active',
    joinedAt: '2024-01-05T10:00:00.000Z',
    lastActiveAt: '2025-11-06T18:00:00.000Z'
  },
  {
    id: 'mbr-james',
    name: 'James Peter',
    email: 'james@justevery.com',
    role: 'Admin',
    status: 'active',
    joinedAt: '2024-02-12T10:00:00.000Z',
    lastActiveAt: '2025-11-05T22:15:00.000Z'
  },
  {
    id: 'mbr-eloise',
    name: 'Eloise Cho',
    email: 'eloise@justevery.com',
    role: 'Billing',
    status: 'invited',
    joinedAt: '2024-10-01T10:00:00.000Z'
  },
  {
    id: 'mbr-liam',
    name: 'Liam Vega',
    email: 'liam@aerionlabs.com',
    role: 'Owner',
    status: 'active',
    joinedAt: '2024-05-18T09:30:00.000Z',
    lastActiveAt: '2025-11-06T16:32:00.000Z'
  },
  {
    id: 'mbr-tara',
    name: 'Tara Malik',
    email: 'tara@aerionlabs.com',
    role: 'Viewer',
    status: 'active',
    joinedAt: '2024-06-01T12:00:00.000Z',
    lastActiveAt: '2025-11-04T08:00:00.000Z'
  }
];

export const fallbackMembers = (companyId: string): Member[] => {
  if (companyId === 'acct-aerion-labs') {
    return memberPool.filter((member) => member.email.endsWith('@aerionlabs.com'));
  }
  return memberPool.filter((member) => member.email.endsWith('@justevery.com'));
};

export const fallbackAssets: AssetObject[] = [
  { key: 'uploads/branding/logo.png', size: 182034, uploaded: '2025-11-05T16:12:00.000Z' },
  { key: 'uploads/invoices/2024-09.pdf', size: 58234, uploaded: '2024-09-30T08:00:00.000Z' }
];

export const fallbackUsage: UsagePoint[] = Array.from({ length: 7 }).map((_, idx) => ({
  bucket: new Date(Date.now() - idx * 86400000).toISOString().slice(0, 10),
  requests: 12000 + idx * 800,
  storageGb: 1.2 + idx * 0.1
}));

export const fallbackSubscription: SubscriptionSummary = {
  active: true,
  plan: 'Scale',
  renewsOn: '2026-01-01T00:00:00.000Z',
  seats: 12
};
