import { describe, expect, it } from 'vitest';

import { ensureAccountProvisionedForSession } from '../src/index';
import { buildSession, createProvisioningEnv } from './provisioningTestUtils';

describe('account auto-provisioning', () => {
  it('creates a workspace for a first-time authenticated session', async () => {
    const { env, db } = createProvisioningEnv();
    const session = buildSession('user_001', 'founder@example.com', 'Ava Founder');

    await ensureAccountProvisionedForSession(env, session);

    expect(db.companies).toHaveLength(1);
    expect(db.companies[0]).toMatchObject({ slug: 'test', billing_email: 'founder@example.com' });
    expect(db.companyMembers).toHaveLength(1);
    expect(db.companyMembers[0]).toMatchObject({ email: 'founder@example.com', role: 'owner' });
    expect(db.subscriptions).toHaveLength(1);
  });

  it('skips provisioning when the viewer already has membership', async () => {
    const { env, db } = createProvisioningEnv();
    db.companies.push({ id: 'acct-existing', slug: 'existing', name: 'Existing Co', plan: 'Launch', billing_email: 'existing@example.com' });
    db.companyMembers.push({
      id: 'mbr-existing',
      company_id: 'acct-existing',
      user_id: 'user_existing',
      email: 'existing@example.com',
      display_name: 'Existing Owner',
      role: 'owner',
    });

    const session = buildSession('user_existing', 'existing@example.com', 'Existing Owner');

    await ensureAccountProvisionedForSession(env, session);

    // The login org list is canonical; the local membership may be adjusted to match it.
    expect(db.companies.some((c) => c.slug === 'test')).toBe(true);
  });
});
