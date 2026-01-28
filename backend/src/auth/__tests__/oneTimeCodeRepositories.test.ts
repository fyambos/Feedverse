jest.mock('../../config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

import { pool } from '../../config/database';
import { consumeOneTimeCode, createOneTimeCode } from '../oneTimeCodeRepositories';

describe('oneTimeCodeRepositories', () => {
  afterEach(() => jest.resetAllMocks());

  it('createOneTimeCode inserts and returns id', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'c1' }] });

    const out = await createOneTimeCode({
      userId: 'u1',
      purpose: 'password_reset',
      codeHash: 'h1',
      expiresAt: new Date(Date.now() + 60_000),
      requestIp: '1.2.3.4',
      requestUserAgent: 'ua',
    });

    expect(out).toEqual({ id: 'c1' });
    expect(pool.query).toHaveBeenCalled();
  });

  it('consumeOneTimeCode returns not_found when no active code', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    (pool.connect as jest.Mock).mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT
      .mockResolvedValueOnce({}); // ROLLBACK

    const out = await consumeOneTimeCode({
      userId: 'u1',
      purpose: 'password_reset',
      codeHash: 'h',
      maxAttempts: 5,
      usedIp: '1.2.3.4',
      usedUserAgent: 'ua',
    });

    expect(out).toEqual({ ok: false, reason: 'not_found' });
    expect(client.release).toHaveBeenCalled();
  });

  it('consumeOneTimeCode increments attempts on invalid code', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    (pool.connect as jest.Mock).mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          { id: 'c1', code_hash: 'expected', attempt_count: 0, expires_at: new Date(Date.now() + 60_000) },
        ],
      }) // SELECT
      .mockResolvedValueOnce({}) // UPDATE attempt_count
      .mockResolvedValueOnce({}); // COMMIT

    const out = await consumeOneTimeCode({
      userId: 'u1',
      purpose: 'password_reset',
      codeHash: 'wrong',
      maxAttempts: 5,
      usedIp: '1.2.3.4',
      usedUserAgent: 'ua',
    });

    expect(out).toEqual({ ok: false, reason: 'invalid' });
    expect(client.query).toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });

  it('consumeOneTimeCode marks used on valid code', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    (pool.connect as jest.Mock).mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          { id: 'c1', code_hash: 'expected', attempt_count: 0, expires_at: new Date(Date.now() + 60_000) },
        ],
      }) // SELECT
      .mockResolvedValueOnce({}) // UPDATE used
      .mockResolvedValueOnce({}); // COMMIT

    const out = await consumeOneTimeCode({
      userId: 'u1',
      purpose: 'password_reset',
      codeHash: 'expected',
      maxAttempts: 5,
      usedIp: '1.2.3.4',
      usedUserAgent: 'ua',
    });

    expect(out).toEqual({ ok: true, id: 'c1' });
    expect(client.release).toHaveBeenCalled();
  });
});
