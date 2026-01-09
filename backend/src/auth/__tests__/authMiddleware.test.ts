import { authMiddleware } from '../authMiddleware';
import { AUTH, HTTP_STATUS } from '../../config/constants';

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

import jwt from 'jsonwebtoken';

describe('authMiddleware', () => {
  afterEach(() => jest.resetAllMocks());

  it('returns 401 when missing token', async () => {
    const req: any = { header: jest.fn().mockReturnValue(undefined) };
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();

    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.UNAUTHORIZED);
    expect(res.send).toHaveBeenCalledWith(AUTH.MISSING_TOKEN);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 on invalid token', async () => {
    (jwt.verify as jest.Mock).mockImplementation((_t: any, _s: any, cb: any) => cb(new Error('bad')));
    const req: any = { header: jest.fn().mockReturnValue(`${AUTH.BEARER_PREFIX}badtoken`) };
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();

    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
    expect(res.send).toHaveBeenCalledWith(AUTH.INVALID_TOKEN);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when token valid and contains user', async () => {
    (jwt.verify as jest.Mock).mockImplementation((_t: any, _s: any, cb: any) => cb(null, { user: { id: 'u1' } }));
    const req: any = { header: jest.fn().mockReturnValue(`${AUTH.BEARER_PREFIX}good`) };
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();

    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
  });
});
