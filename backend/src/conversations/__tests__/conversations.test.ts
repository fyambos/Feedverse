import { pool } from '../../config/database';
import { listConversationsForScenario } from '../../conversations/conversationRepositories';

jest.mock('../../config/database', () => ({
  pool: {
    connect: jest.fn(),
  },
}));
describe('conversation list visibility rules', () => {
  const makeConvMockClient = (opts: { ownerUserId?: string | null; isPublic?: boolean; hasConversations?: boolean }) => {
    const client: any = {
      query: jest.fn(async (sql: string, params?: any[]) => {
        if (/^BEGIN/.test(sql) || /^COMMIT/.test(sql) || /^ROLLBACK/.test(sql)) return { rows: [], rowCount: 0 };

        // scenarioAccess
        if (sql.includes('FROM scenarios s')) return { rows: [{ '1': 1 }], rowCount: 1 };

        // selected profile must be owned by the user in this scenario
        if (sql.includes('SELECT 1 FROM profiles WHERE id = $1 AND scenario_id = $2 AND owner_user_id = $3')) {
          const requestedOwner = String(params?.[2] ?? '');
          const ok = !!requestedOwner && String(opts.ownerUserId ?? '') === requestedOwner;
          return ok ? { rows: [{ '1': 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
        }

        // main conversations select
        if (sql.includes('FROM conversations c') && sql.includes('LEFT JOIN conversation_participants')) {
          if (opts.hasConversations) {
            return {
              rows: [
                {
                  id: 'conv-1',
                  scenario_id: 'sid-1',
                  title: 'T',
                  avatar_url: null,
                  participant_profile_ids: ['pid-1', 'pid-2'],
                  created_at: new Date(),
                  updated_at: null,
                  last_message_at: new Date(),
                },
              ],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 0 };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: jest.fn(),
    };
    return client;
  };

  afterEach(() => jest.resetAllMocks());

  it('denies listing when selected profile is not owned (even if public)', async () => {
    const client = makeConvMockClient({ ownerUserId: 'other', isPublic: true, hasConversations: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const out = await listConversationsForScenario({ scenarioId: 'sid-1', userId: 'user-1', selectedProfileId: 'pid-1' });
    expect(out).toBeNull();
  });

  it('allows listing when user owns the selected profile', async () => {
    const client = makeConvMockClient({ ownerUserId: 'user-1', isPublic: false, hasConversations: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const out = await listConversationsForScenario({ scenarioId: 'sid-1', userId: 'user-1', selectedProfileId: 'pid-1' });
    expect(out).not.toBeNull();
    expect(Array.isArray(out) && out.length > 0).toBe(true);
  });

  it('denies listing when selected profile is not owned', async () => {
    const client = makeConvMockClient({ ownerUserId: 'other', isPublic: false, hasConversations: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const out = await listConversationsForScenario({ scenarioId: 'sid-1', userId: 'user-1', selectedProfileId: 'pid-1' });
    expect(out).toBeNull();
  });
});