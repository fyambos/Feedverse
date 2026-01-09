import { updateProfile, adoptPublicProfile } from '../profileRepositories';

jest.mock('../../config/database', () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
  },
}));

describe('Profile repository permission rules', () => {
  const { pool } = require('../../config/database');

  beforeEach(() => {
    jest.resetAllMocks();
  });

  function makeClient() {
    const client = {
      query: jest.fn(),
      release: jest.fn(),
    } as any;
    (pool.connect as jest.Mock).mockResolvedValue(client);
    return client;
  }

  it('allows the owner to update their profile', async () => {
    const client = makeClient();

    const existing = { id: 'p1', scenario_id: 's1', owner_user_id: 'u1', is_public: false };
    const updated = { ...existing, display_name: 'New Name' };

    // BEGIN, SELECT existing, UPDATE returning updated, COMMIT
    (client.query as jest.Mock)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({});

    const res = await updateProfile({ profileId: 'p1', userId: 'u1', patch: { displayName: 'New Name' } });
    expect(res).not.toBeNull();
    expect((res as any).profile).toBeDefined();
    expect((res as any).profile.id).toBe('p1');
    expect(client.query).toHaveBeenCalled();
  });

  it('allows a non-owner to update a public profile', async () => {
    const client = makeClient();

    const existing = { id: 'p2', scenario_id: 's1', owner_user_id: 'u1', is_public: true };
    const updated = { ...existing, display_name: 'Public New' };

    (client.query as jest.Mock)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({});

    const res = await updateProfile({ profileId: 'p2', userId: 'u2', patch: { displayName: 'Public New' } });
    expect(res).not.toBeNull();
    expect((res as any).profile.id).toBe('p2');
  });

  it('denies updates when not owner and not public', async () => {
    const client = makeClient();

    const existing = { id: 'p3', scenario_id: 's1', owner_user_id: 'u1', is_public: false };

    (client.query as jest.Mock)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await updateProfile({ profileId: 'p3', userId: 'u2', patch: { displayName: 'Hacker' } });
    expect(res).toBeNull();
  });

  it('allows adopting a public profile when user is in scenario', async () => {
    const client = makeClient();

    const existing = { id: 'p4', scenario_id: 's1', owner_user_id: 'u1', is_public: true };
    const adopted = { ...existing, owner_user_id: 'u2', is_public: false, is_private: true };

    // BEGIN, SELECT existing, scenarioAccess -> SELECT 1, UPDATE returning, COMMIT
    (client.query as jest.Mock)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [existing], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ dummy: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [adopted], rowCount: 1 })
      .mockResolvedValueOnce({});

    const res = await adoptPublicProfile({ profileId: 'p4', userId: 'u2' });
    expect(res).not.toBeNull();
    expect((res as any).profile.ownerUserId).toBeDefined();
  });
});
