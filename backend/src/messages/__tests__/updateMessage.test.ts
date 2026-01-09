import { updateMessage, deleteMessage } from '../messageRepositories';
import { pool } from '../../config/database';

jest.mock('../../config/database', () => ({
  pool: {
    connect: jest.fn(),
  },
}));

describe('messages permissions: update, delete and send-as', () => {
  const makeMockClient = (opts: {
    profileOwnerUserId?: string | null;
    profileIsPublic?: boolean;
    nextProfileOwnerUserId?: string | null;
    nextProfileIsPublic?: boolean;
    userOwnsParticipant?: boolean;
  }) => {
    const client: any = {
      query: jest.fn(async (sql: string, params?: any[]) => {
        // BEGIN/COMMIT/ROLLBACK
        if (/^BEGIN/.test(sql) || /^COMMIT/.test(sql) || /^ROLLBACK/.test(sql)) return { rows: [], rowCount: 0 };

        // initial select from messages
        if (sql.includes('FROM messages') && sql.includes('WHERE id = $1')) {
          return { rows: [{ scenario_id: 'sid-1', conversation_id: 'cid-1', sender_profile_id: 'pid-1', image_urls: [] }], rowCount: 1 };
        }

        // scenarioAccess check (select from scenarios)
        if (sql.includes('FROM scenarios s')) {
          return { rows: [{ '1': 1 }], rowCount: 1 };
        }

        // userOwnsAnyProfileInConversation (conversation participants join profiles)
        if (sql.includes('FROM conversation_participants') && sql.includes('JOIN profiles')) {
          return { rows: opts.userOwnsParticipant ? [{ '1': 1 }] : [], rowCount: opts.userOwnsParticipant ? 1 : 0 };
        }

        // conversation_participants simple check for next sender
        if (sql.includes('FROM conversation_participants') && sql.includes('WHERE conversation_id = $1') && sql.includes('AND profile_id = $2')) {
          // if test wants participant membership, return row
          return { rows: opts.userOwnsParticipant ? [{ '1': 1 }] : [], rowCount: opts.userOwnsParticipant ? 1 : 0 };
        }

        // userCanActAsSender -> select profile row
        if (sql.includes('FROM profiles') && sql.includes('WHERE id = $1') && sql.includes('AND scenario_id = $2')) {
          const pid = params?.[0];
          if (pid === 'pid-1') {
            return {
              rows: [
                {
                  id: 'pid-1',
                  owner_user_id: opts.profileOwnerUserId ?? null,
                  is_public: opts.profileIsPublic ?? false,
                  is_private: false,
                  scenario_id: 'sid-1',
                },
              ],
              rowCount: 1,
            };
          }

          if (pid === 'pid-2') {
            return {
              rows: [
                {
                  id: 'pid-2',
                  owner_user_id: opts.nextProfileOwnerUserId ?? null,
                  is_public: opts.nextProfileIsPublic ?? false,
                  is_private: false,
                  scenario_id: 'sid-1',
                },
              ],
              rowCount: 1,
            };
          }

          return { rows: [], rowCount: 0 };
        }

        // UPDATE messages RETURNING
        if (/^\s*UPDATE messages/i.test(sql)) {
          return {
            rows: [
              {
                id: params?.[0] ?? 'msg-1',
                scenario_id: 'sid-1',
                conversation_id: 'cid-1',
                sender_profile_id: params?.[2] ?? 'pid-1',
                text: params?.[1] ?? 'edited',
                kind: 'text',
                image_urls: [],
                created_at: new Date(),
                updated_at: new Date(),
                edited_at: new Date(),
              },
            ],
            rowCount: 1,
          };
        }

        // DELETE messages
        if (/^\s*DELETE FROM messages/i.test(sql)) {
          return { rows: [], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: jest.fn(),
    };

    return client;
  };

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('allows update when user owns the sender profile', async () => {
    const client = makeMockClient({ profileOwnerUserId: 'user-1', profileIsPublic: false, userOwnsParticipant: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await updateMessage({ messageId: 'msg-1', userId: 'user-1', text: 'edited text' });
    expect(res && 'message' in res).toBe(true);
    expect((res as any).message.senderProfileId).toBe('pid-1');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('allows update when sender profile is public', async () => {
    const client = makeMockClient({ profileOwnerUserId: 'other', profileIsPublic: true, userOwnsParticipant: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await updateMessage({ messageId: 'msg-1', userId: 'user-1', text: 'edited text' });
    expect(res && 'message' in res).toBe(true);
    expect((res as any).message.senderProfileId).toBe('pid-1');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it("denies update when user can't act as original sender", async () => {
    const client = makeMockClient({ profileOwnerUserId: 'other', profileIsPublic: false, userOwnsParticipant: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await updateMessage({ messageId: 'msg-1', userId: 'user-1', text: 'edited text' });
    expect(res).toEqual({ error: 'Not allowed', status: 403 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('allows send-as when user owns the target profile', async () => {
    const client = makeMockClient({
      profileOwnerUserId: 'other',
      profileIsPublic: false,
      nextProfileOwnerUserId: 'user-1',
      nextProfileIsPublic: false,
      userOwnsParticipant: true,
    });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await updateMessage({ messageId: 'msg-1', userId: 'user-1', text: 'edited text', senderProfileId: 'pid-2' });
    expect(res && 'message' in res).toBe(true);
    expect((res as any).message.senderProfileId).toBe('pid-2');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('allows send-as when target profile is public', async () => {
    const client = makeMockClient({
      profileOwnerUserId: 'other',
      profileIsPublic: false,
      nextProfileOwnerUserId: 'other',
      nextProfileIsPublic: true,
      userOwnsParticipant: true,
    });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await updateMessage({ messageId: 'msg-1', userId: 'user-1', text: 'edited text', senderProfileId: 'pid-2' });
    expect(res && 'message' in res).toBe(true);
    expect((res as any).message.senderProfileId).toBe('pid-2');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('allows delete when user owns the sender profile', async () => {
    const client = makeMockClient({ profileOwnerUserId: 'user-1', profileIsPublic: false, userOwnsParticipant: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await deleteMessage({ messageId: 'msg-1', userId: 'user-1' });
    expect(res).toEqual({ ok: true });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('allows delete when sender profile is public', async () => {
    const client = makeMockClient({ profileOwnerUserId: 'other', profileIsPublic: true, userOwnsParticipant: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await deleteMessage({ messageId: 'msg-1', userId: 'user-1' });
    expect(res).toEqual({ ok: true });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('denies delete when user cannot act as sender', async () => {
    const client = makeMockClient({ profileOwnerUserId: 'other', profileIsPublic: false, userOwnsParticipant: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await deleteMessage({ messageId: 'msg-1', userId: 'user-1' });
    expect(res).toEqual({ error: 'Not allowed', status: 403 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});


