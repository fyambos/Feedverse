jest.mock('../../users/userRepositories', () => {
  const mockRepo = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findAuthById: jest.fn(),
    updatePasswordHash: jest.fn(),
  };

  return {
    UserRepository: jest.fn().mockImplementation(() => mockRepo),
  };
});

jest.mock('../oneTimeCodeRepositories', () => ({
  createOneTimeCode: jest.fn(async () => ({ id: 'c1' })),
  consumeOneTimeCode: jest.fn(async () => ({ ok: true, id: 'c1' })),
}));

jest.mock('../../email/emailService', () => ({
  sendEmail: jest.fn(async () => true),
  buildPasswordResetEmail: jest.fn(() => ({ subject: 's', text: 't', html: '<b>t</b>' })),
  buildPasswordChangeEmail: jest.fn(() => ({ subject: 's', text: 't', html: '<b>t</b>' })),
}));

jest.mock('../../sessions/sessionRepositories', () => ({
  hashTokenSha256Hex: jest.fn((s: string) => `hash:${s}`),
  revokeAllUserSessions: jest.fn(async () => ({ revokedCount: 1 })),
  createUserSession: jest.fn(),
  findUserSessionByRefreshTokenHash: jest.fn(),
  rotateUserSessionRefreshToken: jest.fn(),
  revokeUserSessionById: jest.fn(),
}));

import crypto from 'crypto';
import { ForgotPasswordController, ResetPasswordController, RequestPasswordChangeController, ConfirmPasswordChangeController } from '../authControllers';
import { UserRepository } from '../../users/userRepositories';
import { sendEmail } from '../../email/emailService';
import { consumeOneTimeCode, createOneTimeCode } from '../oneTimeCodeRepositories';
import { revokeAllUserSessions } from '../../sessions/sessionRepositories';

describe('password reset controllers', () => {
  afterEach(() => {
    jest.clearAllMocks();

    const repo = new (UserRepository as any)();
    repo.findByEmail.mockReset();
    repo.findByUsername.mockReset();
    repo.findAuthById.mockReset();
    repo.updatePasswordHash.mockReset();
  });

  it('forgot-password returns ok even if user missing', async () => {
    const repo = new (UserRepository as any)();
    repo.findByEmail.mockResolvedValueOnce(null);
    repo.findByUsername.mockResolvedValueOnce(null);

    const req: any = { method: 'POST', body: { identifier: 'nope@example.com' }, get: jest.fn(), headers: {}, ip: '1.2.3.4' };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    const handler = (ForgotPasswordController as any)[1];
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('forgot-password sends email when user exists', async () => {
    jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(123456 as any);

    const repo = new (UserRepository as any)();
    repo.findByEmail.mockResolvedValueOnce({ id: 'u1', email: 'a@b.com' });

    const req: any = { method: 'POST', body: { identifier: 'a@b.com' }, get: jest.fn(() => 'ua'), headers: {}, ip: '1.2.3.4' };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    const handler = (ForgotPasswordController as any)[1];
    await handler(req, res);

    expect(createOneTimeCode).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('reset-password updates password and revokes sessions on valid code', async () => {
    const repo = new (UserRepository as any)();
    repo.findByEmail.mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', password_hash: 'x' });
    repo.updatePasswordHash.mockResolvedValueOnce(1);

    (consumeOneTimeCode as jest.Mock).mockResolvedValueOnce({ ok: true, id: 'c1' });

    const req: any = { method: 'POST', body: { identifier: 'a@b.com', code: '123456', newPassword: 'password123' }, get: jest.fn(), headers: {}, ip: '1.2.3.4' };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    const handler = (ResetPasswordController as any)[1];
    await handler(req, res);

    expect(repo.updatePasswordHash).toHaveBeenCalled();
    expect(revokeAllUserSessions).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('change-password request sends email when current password matches', async () => {
    const repo = new (UserRepository as any)();
    repo.findAuthById.mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', password_hash: await require('bcryptjs').hash('old', 10) });

    const req: any = { method: 'POST', body: { currentPassword: 'old' }, user: { id: 'u1' }, get: jest.fn(), headers: {}, ip: '1.2.3.4' };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    const handler = (RequestPasswordChangeController as any)[1];
    await handler(req, res);

    expect(sendEmail).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('change-password confirm updates password on valid code', async () => {
    const repo = new (UserRepository as any)();
    repo.findAuthById.mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', password_hash: await require('bcryptjs').hash('old', 10) });
    repo.updatePasswordHash.mockResolvedValueOnce(1);

    (consumeOneTimeCode as jest.Mock).mockResolvedValueOnce({ ok: true, id: 'c1' });

    const req: any = { method: 'POST', body: { currentPassword: 'old', newPassword: 'password123', code: '123456' }, user: { id: 'u1' }, get: jest.fn(), headers: {}, ip: '1.2.3.4' };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    const handler = (ConfirmPasswordChangeController as any)[1];
    await handler(req, res);

    expect(repo.updatePasswordHash).toHaveBeenCalled();
    expect(revokeAllUserSessions).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
