import { UserRepository } from '../userRepositories';

jest.mock('../../config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../../config/cloudflare/r2Service', () => ({
  r2Service: {
    uploadAvatar: jest.fn(),
  },
}));

import { pool } from '../../config/database';
import { r2Service } from '../../config/cloudflare/r2Service';

describe('UserRepository basic flows', () => {
  beforeEach(() => jest.resetAllMocks());

  it('creates a user and returns the created row', async () => {
    const sample = {
      id: 'u1',
      username: 'alice',
      name: 'Alice',
      email: 'a@example.com',
      password_hash: 'hash',
      avatar_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [sample] });

    const repo = new UserRepository();
    const res = await repo.create(sample as any);

    expect(res).toEqual(sample);
    expect(pool.query).toHaveBeenCalled();
  });

  it('updates username via SQL query', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const repo = new UserRepository();
    await repo.updateUsername('u1', 'newname');
    expect(pool.query).toHaveBeenCalled();
    const calledSql = (pool.query as jest.Mock).mock.calls[0][0] as string;
    expect(calledSql.toLowerCase()).toContain('update users set username');
  });

  it('findByEmail returns user when found', async () => {
    const row = { id: 'u1', email: 'a@example.com' };
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [row] });
    const repo = new UserRepository();
    const out = await repo.findByEmail('a@example.com');
    expect(out).toEqual(row);
  });
});

describe('UserRepository additional methods', () => {
  beforeEach(() => jest.resetAllMocks());

  it('getAvatarUrl returns null when missing', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const repo = new UserRepository();
    const out = await repo.getAvatarUrl('u1');
    expect(out).toBeNull();
  });

  it('getAvatarUrl returns string when present', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ avatar_url: 'http://a' }] });
    const repo = new UserRepository();
    const out = await repo.getAvatarUrl('u1');
    expect(out).toBe('http://a');
  });

  it('findByUsername returns user row', async () => {
    const row = { id: 'u1', username: 'alice' };
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [row] });
    const repo = new UserRepository();
    const out = await repo.findByUsername('alice');
    expect(out).toEqual(row);
  });

  it('emailExists returns boolean', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ exists: true }] });
    const repo = new UserRepository();
    const out = await repo.emailExists('a@example.com');
    expect(out).toBe(true);
  });

  it('create uploads avatar when provided', async () => {
    (r2Service.uploadAvatar as jest.Mock).mockResolvedValue('https://r2/avatar.png');
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'u1', username: 'alice' }] });

    const repo = new UserRepository();
    const user = await repo.create({ id: 'u1', username: 'alice', name: 'Alice', email: 'a@b', password_hash: 'h', avatar_url: '', created_at: new Date(), updated_at: new Date() } as any, { originalname: 'a.png' } as any);

    expect(r2Service.uploadAvatar).toHaveBeenCalled();
    expect(user).toBeDefined();
  });

  it('updateAvatar_url calls query', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({});
    const repo = new UserRepository();
    await repo.updateAvatar_url('u1', 'http://x');
    expect(pool.query).toHaveBeenCalled();
  });

  it('findByGoogleId returns row', async () => {
    const r = { id: 'u2', google_id: 'g1' };
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [r] });
    const repo = new UserRepository();
    const out = await repo.findByGoogleId('g1');
    expect(out).toEqual(r);
  });

  it('findByIds returns empty for empty input and rows for ids', async () => {
    const repo = new UserRepository();
    const empty = await repo.findByIds([]);
    expect(empty).toEqual([]);

    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'u1' }] });
    const out = await repo.findByIds(['u1']);
    expect(out).toEqual([{ id: 'u1' }]);
  });
});

// Scenario services tests (mock repository)
jest.resetModules();
jest.resetModules();
// Spy on ScenarioRepository prototype methods so services' internal repo uses mocked behavior
const repoModule = require('../../scenarios/scenarioRepositories');
jest.spyOn(repoModule.ScenarioRepository.prototype, 'createForUser' as any).mockResolvedValue({ id: 's1', name: 'Test' });
jest.spyOn(repoModule.ScenarioRepository.prototype, 'findByInviteCode' as any).mockResolvedValue({ id: 's1', invite_code: 'CODE' });
jest.spyOn(repoModule.ScenarioRepository.prototype, 'isUserInScenario' as any).mockResolvedValue(false);
jest.spyOn(repoModule.ScenarioRepository.prototype, 'addUserToScenario' as any).mockResolvedValue(undefined);

const RepoModule = require('../../scenarios/scenarioRepositories');
