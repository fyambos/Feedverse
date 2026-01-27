import { Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import {
  AUTH,
  ERROR_MESSAGES,
  HTTP_METHODS,
  HTTP_STATUS,
  USER_MESSAGES,
  VALIDATION,
} from "../config/constants";
import { LoginUserService, RegisterUserService } from "./authServices";
import { upload } from "../config/multer";
import type { RegisterResponse } from "./authModels";
import { UserRepository } from "../users/userRepositories";
import { createUserSession, findUserSessionByRefreshTokenHash, hashTokenSha256Hex, revokeAllUserSessions, revokeOtherUserSessions, revokeUserSessionById, rotateUserSessionRefreshToken } from "../sessions/sessionRepositories";
import { z } from "zod";
import { validateBody } from "../middleware/validationMiddleware";
import { sendMethodNotAllowed } from "../lib/apiResponses";
import { normalizeUsername } from "../lib/username";
import { createOneTimeCode, consumeOneTimeCode } from "./oneTimeCodeRepositories";
import { consumePendingSignupVerification, upsertPendingSignupVerification } from "./pendingSignupRepositories";
import { buildEmailChangeVerifyEmail, buildEmailVerifyEmail, buildPasswordChangeEmail, buildPasswordResetEmail, buildSignupVerifyEmail, sendEmail } from "../email/emailService";
import { validateUsername } from "../lib/username";
import { validateEmail, validatePassword } from "./authValidators";
import { consumePendingEmailChange, upsertPendingEmailChange } from "./pendingEmailChangeRepositories";

const userRepository = new UserRepository();

function tokenExpiresAtIso(token: string): string | null {
  try {
    const decoded: any = jwt.decode(token);
    const exp = typeof decoded?.exp === "number" ? decoded.exp : null;
    if (!exp) return null;
    return new Date(exp * 1000).toISOString();
  } catch {
    return null;
  }
}

function randomBase64Url(bytes: number): string {
  // Node supports base64url; keep fallback for older runtimes.
  try {
    return crypto.randomBytes(bytes).toString("base64url");
  } catch {
    return crypto
      .randomBytes(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
}

function refreshExpiresAtFromNow(): Date {
  const days = Number(AUTH.REFRESH_TOKEN_DAYS) || 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function signAuthToken(payload: unknown) {
  const expiresIn = String(AUTH.EXPIRATION_TIME ?? "").trim();
  if (!expiresIn || expiresIn.toLowerCase() === "none") {
    return jwt.sign(payload as any, AUTH.SECRET_KEY);
  }
  // `expiresIn` accepts "1h", "30d", etc. When sourced from env it is a plain string,
  // so we cast for TypeScript (jsonwebtoken validates at runtime).
  return jwt.sign(payload as any, AUTH.SECRET_KEY, { expiresIn: expiresIn as any });
}

export const RegisterController = [
  upload.single("avatar"),
  validateBody(
    z
      .object({
        username: z.string().trim().min(3),
        email: z.string().trim().min(3),
        password_hash: z.string().min(8),
        // Mobile sometimes sends name: ""; treat that as missing.
        name: z.preprocess(
          (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
          z.string().trim().min(1).optional(),
        ),
        avatar_url: z.preprocess(
          (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
          z.string().trim().min(1).optional(),
        ),
      })
      // In case older clients send extra keys.
      .passthrough(),
  ),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return sendMethodNotAllowed(req, res);
    }

    try {
      const { username, name, email, password_hash, avatar_url } = req.body;
      const avatarFile = req.file;

      const result = await RegisterUserService(
        {
          username,
          name,
          email,
          password_hash,
          avatar_url,
        },
        avatarFile,
      );

      if (result.errors) {
        return res.status(HTTP_STATUS.OK).json({
          errors: result.errors,
        });
      }

      const createdUser = (result.user as RegisterResponse | undefined)?.User;
      if (!createdUser) {
        return res
          .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
          .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
      }

      const sessionId = crypto.randomUUID();
      const token = signAuthToken({ user: createdUser, sid: sessionId });
      const refreshToken = randomBase64Url(Number(AUTH.REFRESH_TOKEN_BYTES) || 32);
      const refreshTokenHash = hashTokenSha256Hex(refreshToken);

      // Create a session row that binds refresh tokens to a specific device session.
      // If this fails, do not issue refresh tokens (client would be unable to refresh).
      {
        const tokenHash = hashTokenSha256Hex(token);
        const created = await createUserSession({
          sessionId,
          userId: String(createdUser.id),
          tokenHash,
          refreshTokenHash,
          refreshExpiresAt: refreshExpiresAtFromNow(),
          userAgent: req.get?.("User-Agent") ?? null,
          ip: req.headers?.["x-forwarded-for"] ?? req.ip,
        });
        if (!created) {
          return res
            .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
        }
      }

      res.status(HTTP_STATUS.CREATED).json({
        message: USER_MESSAGES.CREATION_SUCCESS,
        token,
        refreshToken,
        accessTokenExpiresAt: tokenExpiresAtIso(token),
        user: createdUser,
      });
    } catch (error: unknown) {
      console.error("Erreur lors de l'inscription:", error);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
    }
  },
];

export const LoginController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const identifier = String(
      req.body?.identifier ?? req.body?.email ?? req.body?.username ?? "",
    ).trim();
    const password_hash = req.body?.password_hash;

    const result = await LoginUserService({ email: identifier, password_hash });

    if (result?.error) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        status: ERROR_MESSAGES.INVALID_REQUEST,
        message: result.error,
        statusCode: HTTP_STATUS.UNAUTHORIZED,
      });
    }

    const uid = String((result?.user as any)?.id ?? "").trim();
    const sessionId = crypto.randomUUID();
    const signed = signAuthToken({ user: result?.user, sid: sessionId });
    const refreshToken = randomBase64Url(Number(AUTH.REFRESH_TOKEN_BYTES) || 32);
    const refreshTokenHash = hashTokenSha256Hex(refreshToken);

    if (uid) {
      const tokenHash = hashTokenSha256Hex(signed);
      const created = await createUserSession({
        sessionId,
        userId: uid,
        tokenHash,
        refreshTokenHash,
        refreshExpiresAt: refreshExpiresAtFromNow(),
        userAgent: req.get?.("User-Agent") ?? null,
        ip: req.headers?.["x-forwarded-for"] ?? req.ip,
      });
      if (!created) {
        return res
          .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
          .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
      }
    }

    res.status(HTTP_STATUS.OK).json({
      message: USER_MESSAGES.LOGIN_SUCCESS,
      token: signed,
      refreshToken,
      accessTokenExpiresAt: tokenExpiresAtIso(signed),
      user: result?.user,
    });
  } catch (error: unknown) {
    console.error("Erreur lors de la connexion:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const RefreshTokenController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return sendMethodNotAllowed(req, res);
  }

  try {
    const rawRefresh = String(req.body?.refreshToken ?? "").trim();
    if (!rawRefresh) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "Missing refreshToken" });
    }

    const refreshTokenHash = hashTokenSha256Hex(rawRefresh);
    const session = await findUserSessionByRefreshTokenHash({ refreshTokenHash });
    if (!session?.id || !session?.user_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH.INVALID_TOKEN });
    }

    if ((session as any).revoked_at) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH.INVALID_TOKEN });
    }

    const expiresAt: Date | null = (session as any).refresh_expires_at ?? null;
    if (!expiresAt || new Date(expiresAt).valueOf() <= Date.now()) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH.INVALID_TOKEN });
    }

    const userId = String((session as any).user_id);
    const user = await userRepository.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH.INVALID_TOKEN });
    }

    const signed = signAuthToken({ user, sid: String((session as any).id) });
    const nextRefreshToken = randomBase64Url(Number(AUTH.REFRESH_TOKEN_BYTES) || 32);
    const nextRefreshHash = hashTokenSha256Hex(nextRefreshToken);
    const nextAccessHash = hashTokenSha256Hex(signed);

    // Best-effort rotate; if it fails, treat as invalid to be safe.
    const ok = await rotateUserSessionRefreshToken({
      sessionId: String((session as any).id),
      userId,
      nextRefreshTokenHash: nextRefreshHash,
      nextRefreshExpiresAt: refreshExpiresAtFromNow(),
      nextTokenHash: nextAccessHash,
    });

    if (!ok) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH.INVALID_TOKEN });
    }

    return res.status(HTTP_STATUS.OK).json({
      token: signed,
      refreshToken: nextRefreshToken,
      accessTokenExpiresAt: tokenExpiresAtIso(signed),
      user,
    });
  } catch (error: unknown) {
    console.error("Refresh token failed:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

export const LogoutController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MESSAGES.METHOD_NOT_ALLOWED });
  }

  try {
    const userId = String(req.user?.id ?? "").trim();
    const sessionId = String((req as any).authSessionId ?? "").trim();
    if (userId && sessionId) {
      await revokeUserSessionById({ sessionId, userId, reason: "logout" });
    }
  } catch {
    // best-effort
  }

  return res.status(HTTP_STATUS.OK).json({ message: USER_MESSAGES.LOGOUT_SUCCESS });
};

export const ProtectedController = async (_req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json({ ok: true });
};

function oneTimeCodeSecret(): string {
  const v = String(process.env.ONE_TIME_CODE_SECRET ?? "").trim();
  return v || String(AUTH.SECRET_KEY);
}

function hashOneTimeCode(args: { userId: string; code: string }): string {
  const uid = String(args.userId ?? "").trim();
  const code = String(args.code ?? "").trim();
  const secret = oneTimeCodeSecret();
  return hashTokenSha256Hex(`${secret}:${uid}:${code}`);
}

function hashSignupCode(args: { email: string; code: string }): string {
  const email = String(args.email ?? "").trim().toLowerCase();
  const code = String(args.code ?? "").trim();
  const secret = oneTimeCodeSecret();
  return hashTokenSha256Hex(`${secret}:${email}:${code}`);
}

function normalizeEmail(input: unknown): string {
  return String(input ?? "").trim().toLowerCase();
}

async function issueSessionForUser(args: { req: Request; res: Response; user: any }) {
  const { req, res, user } = args;
  const sessionId = crypto.randomUUID();
  const token = signAuthToken({ user, sid: sessionId });
  const refreshToken = randomBase64Url(Number(AUTH.REFRESH_TOKEN_BYTES) || 32);
  const refreshTokenHash = hashTokenSha256Hex(refreshToken);

  const tokenHash = hashTokenSha256Hex(token);
  const created = await createUserSession({
    sessionId,
    userId: String(user.id),
    tokenHash,
    refreshTokenHash,
    refreshExpiresAt: refreshExpiresAtFromNow(),
    userAgent: req.get?.("User-Agent") ?? null,
    ip: req.headers?.["x-forwarded-for"] ?? req.ip,
  });
  if (!created) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }

  return res.status(HTTP_STATUS.CREATED).json({
    message: USER_MESSAGES.CREATION_SUCCESS,
    token,
    refreshToken,
    accessTokenExpiresAt: tokenExpiresAtIso(token),
    user,
  });
}

export const UsernameAvailableController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.GET) {
    return sendMethodNotAllowed(req, res);
  }

  const raw = String((req.query as any)?.username ?? "");
  const username = normalizeUsername(raw);
  const vErr = validateUsername(username);
  if (vErr) {
    return res.status(HTTP_STATUS.OK).json({ available: false, reason: vErr });
  }

  const existing = await userRepository.findByUsername(username);
  return res.status(HTTP_STATUS.OK).json({ available: !existing, normalized: username });
};

export const SignupRequestController = [
  validateBody(
    z
      .object({
        email: z.string().trim().min(3),
        username: z.string().trim().min(3),
      })
      .passthrough(),
  ),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return sendMethodNotAllowed(req, res);
    }

    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username);

    const emailErr = validateEmail(email);
    if (emailErr) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: emailErr.message });

    const usernameErr = validateUsername(username);
    if (usernameErr) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: usernameErr });

    const emailExists = await userRepository.emailExists(email);
    if (emailExists) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: USER_MESSAGES.EMAIL_ALREADY_EXISTS });
    }

    const existingByUsername = await userRepository.findByUsername(username);
    if (existingByUsername) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: USER_MESSAGES.USERNAME_ALREADY_EXISTS });
    }

    const code = generate6DigitCode();
    const expiresMinutes = 10;
    const expiresAt = new Date(Date.now() + expiresMinutes * 60_000);
    const codeHash = hashSignupCode({ email, code });

    await upsertPendingSignupVerification({
      email,
      username,
      codeHash,
      expiresAt,
      requestIp: req.headers?.["x-forwarded-for"] ?? req.ip,
      requestUserAgent: req.get?.("User-Agent") ?? null,
    });

    const msg = buildSignupVerifyEmail({ code, expiresMinutes });
    const sent = await sendEmail({
      to: email,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });

    if (!sent) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.EXTERNAL_SERVICE_ERROR });
    }

    return res.status(HTTP_STATUS.OK).json({ ok: true });
  },
];

export const SignupConfirmController = [
  validateBody(
    z
      .object({
        email: z.string().trim().min(3),
        username: z.string().trim().min(3),
        code: z.string().trim().min(4).max(12),
        password: z.string().min(8),
      })
      .passthrough(),
  ),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return sendMethodNotAllowed(req, res);
    }

    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username);
    const code = String(req.body?.code ?? "").trim();
    const password = String(req.body?.password ?? "");

    const emailErr = validateEmail(email);
    if (emailErr) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: emailErr.message });

    const usernameErr = validateUsername(username);
    if (usernameErr) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: usernameErr });

    const passwordErr = validatePassword(password);
    if (passwordErr) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: passwordErr.message });

    const codeHash = hashSignupCode({ email, code });
    const consumed = await consumePendingSignupVerification({
      email,
      username,
      codeHash,
      maxAttempts: 5,
      usedIp: req.headers?.["x-forwarded-for"] ?? req.ip,
      usedUserAgent: req.get?.("User-Agent") ?? null,
    });

    if (consumed.ok === false) {
      const msg = consumed.reason === "mismatch" ? "Username changed. Request a new code." : "Invalid code";
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: msg });
    }

    const result = await RegisterUserService(
      {
        username,
        name: "",
        email,
        password_hash: password,
        avatar_url: "",
      },
      undefined,
    );

    if (result.errors) {
      // Surface validation errors from the register service.
      return res.status(HTTP_STATUS.OK).json({ errors: result.errors });
    }

    const createdUser = (result.user as any)?.User;
    if (!createdUser) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
    }

    // Signup flow verified the user's email, so mark it as verified.
    try {
      await userRepository.markEmailVerified(String(createdUser.id));
    } catch {
      // best-effort; don't block signup
    }

    const freshUser = await userRepository.findById(String(createdUser.id));

    return issueSessionForUser({ req, res, user: freshUser ?? createdUser });
  },
];

export const EmailVerifyRequestController = async (req: Request, res: Response) => {
  if (req.method !== HTTP_METHODS.POST) {
    return sendMethodNotAllowed(req, res);
  }

  const userId = String((req.user as any)?.id ?? "").trim();
  if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH.MISSING_TOKEN });

  const user = await userRepository.findById(userId);
  const email = normalizeEmail((user as any)?.email);
  const verifiedAt = (user as any)?.email_verified_at ?? null;

  if (!email) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "No email on account" });
  if (verifiedAt) return res.status(HTTP_STATUS.OK).json({ ok: true, alreadyVerified: true });

  const code = generate6DigitCode();
  const expiresMinutes = 10;
  const expiresAt = new Date(Date.now() + expiresMinutes * 60_000);
  const codeHash = hashOneTimeCode({ userId, code });

  const created = await createOneTimeCode({
    userId,
    purpose: "email_verify",
    codeHash,
    expiresAt,
    requestIp: req.headers?.["x-forwarded-for"] ?? req.ip,
    requestUserAgent: req.get?.("User-Agent") ?? null,
  });

  if (!created) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
  }

  const msg = buildEmailVerifyEmail({ code, expiresMinutes });
  const sent = await sendEmail({ to: email, subject: msg.subject, text: msg.text, html: msg.html });
  if (!sent) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.EXTERNAL_SERVICE_ERROR });
  }

  return res.status(HTTP_STATUS.OK).json({ ok: true });
};

export const EmailVerifyConfirmController = [
  validateBody(
    z
      .object({
        code: z.string().trim().min(4).max(12),
      })
      .passthrough(),
  ),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return sendMethodNotAllowed(req, res);
    }

    const userId = String((req.user as any)?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH.MISSING_TOKEN });

    const user = await userRepository.findById(userId);
    if (!user) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH.INVALID_TOKEN });
    if ((user as any)?.email_verified_at) return res.status(HTTP_STATUS.OK).json({ ok: true, alreadyVerified: true });

    const code = String(req.body?.code ?? "").trim();
    const codeHash = hashOneTimeCode({ userId, code });
    const consumed = await consumeOneTimeCode({
      userId,
      purpose: "email_verify",
      codeHash,
      maxAttempts: 5,
      usedIp: req.headers?.["x-forwarded-for"] ?? req.ip,
      usedUserAgent: req.get?.("User-Agent") ?? null,
    });

    if (!consumed.ok) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "Invalid code" });
    }

    await userRepository.markEmailVerified(userId);
    const refreshed = await userRepository.findById(userId);
    return res.status(HTTP_STATUS.OK).json({ ok: true, user: refreshed });
  },
];

export const EmailChangeRequestController = [
  validateBody(
    z
      .object({
        newEmail: z.string().trim().min(3),
      })
      .passthrough(),
  ),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return sendMethodNotAllowed(req, res);
    }

    const userId = String((req.user as any)?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH.MISSING_TOKEN });

    const newEmail = normalizeEmail(req.body?.newEmail);
    const emailErr = validateEmail(newEmail);
    if (emailErr) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: emailErr.message });

    const user = await userRepository.findById(userId);
    if (!user) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH.INVALID_TOKEN });

    const currentEmail = normalizeEmail((user as any)?.email);
    if (currentEmail && currentEmail === newEmail) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "That is already your email" });
    }

    const existing = await userRepository.findByEmail(newEmail);
    if (existing && String((existing as any).id) !== userId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: USER_MESSAGES.EMAIL_ALREADY_EXISTS });
    }

    const code = generate6DigitCode();
    const expiresMinutes = 10;
    const expiresAt = new Date(Date.now() + expiresMinutes * 60_000);
    const codeHash = hashOneTimeCode({ userId, code });

    try {
      await upsertPendingEmailChange({
        userId,
        newEmail,
        codeHash,
        expiresAt,
        requestIp: req.headers?.["x-forwarded-for"] ?? req.ip,
        requestUserAgent: req.get?.("User-Agent") ?? null,
      });
    } catch (e: any) {
      if (String(e?.code ?? "") === "23505") {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: USER_MESSAGES.EMAIL_ALREADY_EXISTS });
      }
      throw e;
    }

    const msg = buildEmailChangeVerifyEmail({ code, expiresMinutes });
    const sent = await sendEmail({
      to: newEmail,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    if (!sent) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.EXTERNAL_SERVICE_ERROR });
    }

    return res.status(HTTP_STATUS.OK).json({ ok: true });
  },
];

export const EmailChangeConfirmController = [
  validateBody(
    z
      .object({
        newEmail: z.string().trim().min(3),
        code: z.string().trim().min(4).max(12),
      })
      .passthrough(),
  ),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return sendMethodNotAllowed(req, res);
    }

    const userId = String((req.user as any)?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH.MISSING_TOKEN });

    const newEmail = normalizeEmail(req.body?.newEmail);
    const emailErr = validateEmail(newEmail);
    if (emailErr) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: emailErr.message });

    const code = String(req.body?.code ?? "").trim();
    const codeHash = hashOneTimeCode({ userId, code });

    const consumed = await consumePendingEmailChange({
      userId,
      newEmail,
      codeHash,
      maxAttempts: 5,
      usedIp: req.headers?.["x-forwarded-for"] ?? req.ip,
      usedUserAgent: req.get?.("User-Agent") ?? null,
    });

    if (consumed.ok === false) {
      const msg = consumed.reason === "mismatch" ? "Email changed. Request a new code." : "Invalid code";
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: msg });
    }

    let updated: any = null;
    try {
      updated = await userRepository.updateEmailAndVerify(userId, newEmail);
    } catch (e: any) {
      if (String(e?.code ?? "") === "23505") {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: USER_MESSAGES.EMAIL_ALREADY_EXISTS });
      }
      throw e;
    }

    // Security: log out other devices; keep current session alive.
    try {
      const keepSessionId = String((req as any).authSessionId ?? "").trim();
      if (keepSessionId) {
        await revokeOtherUserSessions({ userId, keepSessionId });
      }
    } catch {
      // best-effort
    }

    return res.status(HTTP_STATUS.OK).json({ ok: true, user: updated });
  },
];

function generate6DigitCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function emailDebugEnabled(): boolean {
  const v = String(process.env.EMAIL_DEBUG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function maskIdentifierForLogs(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.includes("@")) {
    const [local, domain] = s.split("@");
    const l = local ?? "";
    const d = domain ?? "";
    const lMasked = l.length <= 2 ? "**" : `${l.slice(0, 2)}***`;
    const dParts = d.split(".");
    const d0 = dParts[0] ?? "";
    const d0Masked = d0.length <= 2 ? "**" : `${d0.slice(0, 2)}***`;
    return `${lMasked}@${d0Masked}${dParts.length > 1 ? "." + dParts.slice(1).join(".") : ""}`;
  }
  // username-ish
  return s.length <= 3 ? "***" : `${s.slice(0, 3)}***`;
}

async function findUserByIdentifier(identifierRaw: string) {
  const identifier = String(identifierRaw ?? "").trim().replace(/^@+/, "").trim();
  if (!identifier) return null;

  const isEmail = /@/.test(identifier);
  if (isEmail) {
    const email = identifier.toLowerCase();
    return userRepository.findByEmail(email);
  }

  const username = normalizeUsername(identifier);
  if (!username) return null;
  return userRepository.findByUsername(username);
}

export const ForgotPasswordController = [
  validateBody(
    z
      .object({
        identifier: z.string().trim().min(1),
      })
      .passthrough(),
  ),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return sendMethodNotAllowed(req, res);
    }

    // Always return OK to avoid leaking whether a user exists.
    try {
      const identifier = String(req.body?.identifier ?? "").trim();
      const user = await findUserByIdentifier(identifier);

      if (emailDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.log("[auth] forgot-password", {
          identifier: maskIdentifierForLogs(identifier),
          userFound: Boolean(user?.id && user?.email),
        });
      }

      if (user?.id && user?.email) {
        const code = generate6DigitCode();
        const expiresMinutes = 15;
        const expiresAt = new Date(Date.now() + expiresMinutes * 60_000);

        const codeHash = hashOneTimeCode({ userId: String(user.id), code });
        await createOneTimeCode({
          userId: String(user.id),
          purpose: "password_reset",
          codeHash,
          expiresAt,
          requestIp: req.headers?.["x-forwarded-for"] ?? req.ip,
          requestUserAgent: req.get?.("User-Agent") ?? null,
        });

        const email = buildPasswordResetEmail({ code, expiresMinutes });
        const sent = await sendEmail({
          to: String(user.email),
          subject: email.subject,
          text: email.text,
          html: email.html,
        });

        if (!sent) {
          console.error("Forgot password email failed to send (noop or provider error)");
        }
      }
    } catch (e) {
      // Best-effort; do not reveal anything.
      console.error("Forgot password failed:", e);
    }

    return res.status(HTTP_STATUS.OK).json({ ok: true });
  },
];

export const ResetPasswordController = [
  validateBody(
    z
      .object({
        identifier: z.string().trim().min(1),
        code: z.string().trim().min(4).max(12),
        newPassword: z.string().min(8),
      })
      .passthrough(),
  ),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return sendMethodNotAllowed(req, res);
    }

    const identifier = String(req.body?.identifier ?? "").trim();
    const code = String(req.body?.code ?? "").trim();
    const newPassword = String(req.body?.newPassword ?? "");

    const user = await findUserByIdentifier(identifier);
    if (!user?.id) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "Invalid code" });
    }

    const codeHash = hashOneTimeCode({ userId: String(user.id), code });
    const consumed = await consumeOneTimeCode({
      userId: String(user.id),
      purpose: "password_reset",
      codeHash,
      maxAttempts: 5,
      usedIp: req.headers?.["x-forwarded-for"] ?? req.ip,
      usedUserAgent: req.get?.("User-Agent") ?? null,
    });

    if (!consumed.ok) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "Invalid code" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updated = await userRepository.updatePasswordHash(String(user.id), hashedPassword);
    if (!updated) {
      return res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
    }

    await revokeAllUserSessions({ userId: String(user.id), reason: "password_reset" });

    return res.status(HTTP_STATUS.OK).json({ ok: true });
  },
];

export const RequestPasswordChangeController = [
  validateBody(
    z
      .object({
        currentPassword: z.string().min(1),
      })
      .passthrough(),
  ),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return sendMethodNotAllowed(req, res);
    }

    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH.MISSING_TOKEN });

    const currentPassword = String(req.body?.currentPassword ?? "");
    const user = await userRepository.findAuthById(userId);
    if (!user?.password_hash || !user?.email) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH.INVALID_TOKEN });
    }

    const ok = await bcrypt.compare(currentPassword, String(user.password_hash));
    if (!ok) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: VALIDATION.INVALID_PASSWORD });
    }

    const code = generate6DigitCode();
    const expiresMinutes = 10;
    const expiresAt = new Date(Date.now() + expiresMinutes * 60_000);
    const codeHash = hashOneTimeCode({ userId, code });

    await createOneTimeCode({
      userId,
      purpose: "password_change",
      codeHash,
      expiresAt,
      requestIp: req.headers?.["x-forwarded-for"] ?? req.ip,
      requestUserAgent: req.get?.("User-Agent") ?? null,
    });

    const email = buildPasswordChangeEmail({ code, expiresMinutes });
    const sent = await sendEmail({
      to: String(user.email),
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    if (!sent) {
      return res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json({ error: ERROR_MESSAGES.EXTERNAL_SERVICE_ERROR });
    }

    return res.status(HTTP_STATUS.OK).json({ ok: true });
  },
];

export const ConfirmPasswordChangeController = [
  validateBody(
    z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
        code: z.string().trim().min(4).max(12),
      })
      .passthrough(),
  ),
  async (req: Request, res: Response) => {
    if (req.method !== HTTP_METHODS.POST) {
      return sendMethodNotAllowed(req, res);
    }

    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH.MISSING_TOKEN });

    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");
    const code = String(req.body?.code ?? "").trim();

    const user = await userRepository.findAuthById(userId);
    if (!user?.password_hash) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH.INVALID_TOKEN });
    }

    const ok = await bcrypt.compare(currentPassword, String(user.password_hash));
    if (!ok) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: VALIDATION.INVALID_PASSWORD });
    }

    const codeHash = hashOneTimeCode({ userId, code });
    const consumed = await consumeOneTimeCode({
      userId,
      purpose: "password_change",
      codeHash,
      maxAttempts: 5,
      usedIp: req.headers?.["x-forwarded-for"] ?? req.ip,
      usedUserAgent: req.get?.("User-Agent") ?? null,
    });

    if (!consumed.ok) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "Invalid code" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updated = await userRepository.updatePasswordHash(userId, hashedPassword);
    if (!updated) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR });
    }

    await revokeAllUserSessions({ userId, reason: "password_change" });

    return res.status(HTTP_STATUS.OK).json({ ok: true });
  },
];
