import { updateMessage } from '../messageRepositories';
import { pool } from '../../config/database';

jest.mock('../../config/database', () => ({
  pool: {
    connect: jest.fn(),
  },
}));

describe('updateMessage permission checks', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(async (sql: string) => {
        // BEGIN/COMMIT/ROLLBACK
        if (/^BEGIN/.test(sql) || /^COMMIT/.test(sql) || /^ROLLBACK/.test(sql)) return { rows: [], rowCount: 0 };

        // initial select from messages
        if (sql.includes('FROM messages') && sql.includes('WHERE id = $1')) {
          return { rows: [{ scenario_id: 'sid-1', conversation_id: 'cid-1', sender_profile_id: 'pid-1' }], rowCount: 1 };
        }

        // scenarioAccess check (select from scenarios)
        if (sql.includes('FROM scenarios s')) {
          return { rows: [{ '1': 1 }], rowCount: 1 };
        }

        // userOwnsAnyProfileInConversation (conversation participants join profiles)
        if (sql.includes('FROM conversation_participants')) {
          return { rows: [{ '1': 1 }], rowCount: 1 };
        }

        // userCanActAsSender -> select profile row
        if (sql.includes('FROM profiles') && sql.includes('WHERE id = $1') && sql.includes('AND scenario_id = $2')) {
          // return profile owned by someone else and not public
          return { rows: [{ id: 'pid-1', owner_user_id: 'other-user', is_public: false, is_private: false, scenario_id: 'sid-1' }], rowCount: 1 };
        }

        // default fallback
        return { rows: [], rowCount: 0 };
      }),
      release: jest.fn(),
    };

    (pool.connect as jest.Mock).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("denies update when user can't act as original sender", async () => {
    const res = await updateMessage({ messageId: 'msg-1', userId: 'user-1', text: 'edited text' });
    expect(res).toEqual({ error: 'Not allowed', status: 403 });
    // ensure rollback called due to denial
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
