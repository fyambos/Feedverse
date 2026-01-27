import { Router } from "express";
const authRouter = Router();

import {
  LoginController,
  ProtectedController,
  RegisterController,
  RefreshTokenController,
  LogoutController,
  ForgotPasswordController,
  ResetPasswordController,
  RequestPasswordChangeController,
  ConfirmPasswordChangeController,
  UsernameAvailableController,
  SignupRequestController,
  SignupConfirmController,
  EmailVerifyRequestController,
  EmailVerifyConfirmController,
  EmailChangeRequestController,
  EmailChangeConfirmController,
} from "./authControllers";
import { ROUTES_AUTH } from "../config/constants";
import { authMiddleware } from "./authMiddleware";
import { z } from "zod";
import { validateBody } from "../middleware/validationMiddleware";
import rateLimit from "express-rate-limit";
import { ipKeyGenerator } from "express-rate-limit";

const loginBodySchema = z
  .object({
    identifier: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    password_hash: z.string().min(1),
  })
  .refine((v) => Boolean((v.identifier ?? v.email ?? v.username)?.toString().trim()), {
    message: "identifier is required",
    path: ["identifier"],
  })
  .passthrough();

const refreshBodySchema = z
  .object({
    refreshToken: z.string().trim().min(1),
  })
  .passthrough();

authRouter.post(ROUTES_AUTH.REGISTER, RegisterController);
authRouter.get(ROUTES_AUTH.USERNAME_AVAILABLE, UsernameAvailableController);
authRouter.post(ROUTES_AUTH.LOGIN, validateBody(loginBodySchema), LoginController);
authRouter.post(ROUTES_AUTH.REFRESH_TOKEN, validateBody(refreshBodySchema), RefreshTokenController);
authRouter.post(ROUTES_AUTH.LOGOUT, authMiddleware, LogoutController);
authRouter.get(ROUTES_AUTH.PROTECTED, authMiddleware, ProtectedController);

const skipLimits = String(process.env.NODE_ENV ?? "").toLowerCase() === "test";

const forgotPasswordLimiter = skipLimits
  ? (_req: any, _res: any, next: any) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: (req) => {
        const ip = ipKeyGenerator(req as any);
        const identifier = String((req as any).body?.identifier ?? "").trim().toLowerCase();
        return `forgot|${ip}|${identifier}`;
      },
      message: { error: "Too many requests" },
    });

const resetPasswordLimiter = skipLimits
  ? (_req: any, _res: any, next: any) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: (req) => {
        const ip = ipKeyGenerator(req as any);
        const identifier = String((req as any).body?.identifier ?? "").trim().toLowerCase();
        return `reset|${ip}|${identifier}`;
      },
      message: { error: "Too many requests" },
    });

const changePasswordLimiter = skipLimits
  ? (_req: any, _res: any, next: any) => next()
  : rateLimit({
      windowMs: 10 * 60 * 1000,
      max: 10,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: (req) => {
        const ip = ipKeyGenerator(req as any);
        const uid = String((req as any).user?.id ?? "");
        return `pwdchg|${uid || ip}`;
      },
      message: { error: "Too many requests" },
    });

const signupRequestLimiter = skipLimits
  ? (_req: any, _res: any, next: any) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: (req) => {
        const ip = ipKeyGenerator(req as any);
        const email = String((req as any).body?.email ?? "").trim().toLowerCase();
        return `signup_req|${ip}|${email}`;
      },
      message: { error: "Too many requests" },
    });

const signupConfirmLimiter = skipLimits
  ? (_req: any, _res: any, next: any) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: (req) => {
        const ip = ipKeyGenerator(req as any);
        const email = String((req as any).body?.email ?? "").trim().toLowerCase();
        return `signup_cnf|${ip}|${email}`;
      },
      message: { error: "Too many requests" },
    });

const emailLimiter = skipLimits
  ? (_req: any, _res: any, next: any) => next()
  : rateLimit({
      windowMs: 10 * 60 * 1000,
      max: 10,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: (req) => {
        const ip = ipKeyGenerator(req as any);
        const uid = String((req as any).user?.id ?? "");
        return `email|${uid || ip}`;
      },
      message: { error: "Too many requests" },
    });

authRouter.post(ROUTES_AUTH.FORGOT_PASSWORD, forgotPasswordLimiter, ForgotPasswordController);
authRouter.post(ROUTES_AUTH.RESET_PASSWORD, resetPasswordLimiter, ResetPasswordController);
authRouter.post(ROUTES_AUTH.SIGNUP_REQUEST, signupRequestLimiter, SignupRequestController);
authRouter.post(ROUTES_AUTH.SIGNUP_CONFIRM, signupConfirmLimiter, SignupConfirmController);
authRouter.post(ROUTES_AUTH.EMAIL_VERIFY_REQUEST, authMiddleware, emailLimiter, EmailVerifyRequestController);
authRouter.post(ROUTES_AUTH.EMAIL_VERIFY_CONFIRM, authMiddleware, emailLimiter, EmailVerifyConfirmController);
authRouter.post(ROUTES_AUTH.EMAIL_CHANGE_REQUEST, authMiddleware, emailLimiter, EmailChangeRequestController);
authRouter.post(ROUTES_AUTH.EMAIL_CHANGE_CONFIRM, authMiddleware, emailLimiter, EmailChangeConfirmController);
authRouter.post(
  ROUTES_AUTH.CHANGE_PASSWORD_REQUEST,
  authMiddleware,
  changePasswordLimiter,
  RequestPasswordChangeController,
);
authRouter.post(
  ROUTES_AUTH.CHANGE_PASSWORD_CONFIRM,
  authMiddleware,
  changePasswordLimiter,
  ConfirmPasswordChangeController,
);

export default authRouter;
