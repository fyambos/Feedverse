import { isTestEnv, loadEnv, requireEnv } from "./env";
loadEnv();

// ============================================================================
// DATABASE
// ============================================================================

// Prefer the conventional DATABASE_URL (Railway/Render/Heroku). Keep DB_URL as a legacy alias.
export const DATABASE_URL = process.env.DATABASE_URL ?? process.env.DB_URL;
export const DATABASE_HOST = process.env.DB_HOST;
export const DATABASE_USER = process.env.DB_USER;
export const DATABASE_PORT: number =
  parseInt(<string>process.env.DB_PORT, 10) || 5432;
export const DATABASE_PASSWORD = process.env.DB_PASSWORD;
export const DATABASE_NAME = process.env.DB_NAME;
export const DATABASE_SSL_MODE: boolean = (() => {
  const raw = String(process.env.DB_SSLMODE ?? "").trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "require";
})();

// Postgres pool tuning (pg.Pool options)
export const DB_POOL_MAX: number =
  Number.parseInt(process.env.DB_POOL_MAX ?? "10", 10) || 10;
export const DB_POOL_IDLE_TIMEOUT_MS: number =
  Number.parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? "30000", 10) || 30000;
export const DB_POOL_CONNECTION_TIMEOUT_MS: number =
  Number.parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? "10000", 10) || 10000;
export const DB_POOL_MAX_USES: number | undefined = (() => {
  const raw = String(process.env.DB_POOL_MAX_USES ?? "").trim();
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
})();

// Startup DB retry/backoff
export const DB_STARTUP_CHECK_ENABLED: boolean = String(process.env.DB_STARTUP_CHECK ?? "1").trim() !== "0";
export const DB_STARTUP_RETRY_ATTEMPTS: number =
  Number.parseInt(process.env.DB_STARTUP_RETRY_ATTEMPTS ?? "8", 10) || 8;
export const DB_STARTUP_RETRY_BASE_DELAY_MS: number =
  Number.parseInt(process.env.DB_STARTUP_RETRY_BASE_DELAY_MS ?? "250", 10) || 250;
export const DB_STARTUP_RETRY_MAX_DELAY_MS: number =
  Number.parseInt(process.env.DB_STARTUP_RETRY_MAX_DELAY_MS ?? "5000", 10) || 5000;

// ============================================================================
// CLOUDFLARE / R2
// ============================================================================

export const CLOUDFLARE = {
  BUCKET: process.env.R2_BUCKET,
  ACCOUNT: process.env.R2_ACCOUNT_ID,
  ACCESS_KEY: process.env.R2_ACCESS_KEY_ID,
  SECRET: process.env.R2_SECRET_ACCESS_KEY,
  PUBLIC_URL: process.env.R2_PUBLIC_URL,
  IMAGES_SIZE: 5 * 1024 * 1024,
  USER_DIR: "users",
} as const;

// ============================================================================
// HTTP STATUS CODES
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// ============================================================================
// HTTP METHODS
// ============================================================================

export const HTTP_METHODS = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
} as const;

// ============================================================================
// AUTHENTICATION & TOKENS
// ============================================================================

export const AUTH = {
  BEARER_PREFIX: "Bearer ",
  HEADER_NAME: "Authorization",
  // Messages
  INVALID_TOKEN: "Invalid or expired authentication token",
  UNAUTHORIZED_ACCESS: "Unauthorized access to this resource",
  MISSING_TOKEN: "Missing authentication token",
  INVALID_CREDENTIALS: "Incorrect email or password",
  // JWT expiry used when signing new tokens.
  // - Default: very long-lived tokens for a dev-like UX.
  // - Set JWT_EXPIRES_IN=none to create tokens without an exp claim (no expiry).
  // - Any value accepted by jsonwebtoken's `expiresIn` is valid (e.g. "30d", "12h").
  EXPIRATION_TIME: process.env.JWT_EXPIRES_IN || "365d",
  // Refresh token lifetime (used by /auth/refresh). Keep longer than access token.
  REFRESH_TOKEN_DAYS: Number.parseInt(process.env.JWT_REFRESH_DAYS || "365", 10) || 365,
  // Refresh tokens are random bytes encoded as base64url.
  REFRESH_TOKEN_BYTES: Number.parseInt(process.env.JWT_REFRESH_BYTES || "32", 10) || 32,
  SECRET_KEY: isTestEnv() ? (process.env.JWT_SECRET || "test-secret") : requireEnv("JWT_SECRET"),
} as const;

// ============================================================================
// WEBSOCKETS
// ============================================================================

export const WEBSOCKET = {
  // Hard cap on inbound message size (bytes).
  MAX_PAYLOAD_BYTES: Number.parseInt(process.env.WS_MAX_PAYLOAD_BYTES ?? "16384", 10) || 16384,
  // Soft caps on concurrent connections.
  MAX_CONNECTIONS_PER_IP: Number.parseInt(process.env.WS_MAX_CONNECTIONS_PER_IP ?? "25", 10) || 25,
  MAX_CONNECTIONS_PER_USER: Number.parseInt(process.env.WS_MAX_CONNECTIONS_PER_USER ?? "5", 10) || 5,
  MAX_CONNECTIONS_PER_SCENARIO: Number.parseInt(process.env.WS_MAX_CONNECTIONS_PER_SCENARIO ?? "200", 10) || 200,
  // Basic inbound message rate limit (per connection).
  MAX_MESSAGES_PER_10S: Number.parseInt(process.env.WS_MAX_MESSAGES_PER_10S ?? "30", 10) || 30,
  HEARTBEAT_INTERVAL_MS: Number.parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS ?? "30000", 10) || 30000,
} as const;

// ============================================================================
// USERS
// ============================================================================

export const USER_MESSAGES = {
  NOT_FOUND: "User not found",
  CREATION_SUCCESS: "User created successfully",
  UPDATE_SUCCESS: "Profile updated successfully",
  DELETION_SUCCESS: "Account deleted successfully",
  EMAIL: "Email",
  EMAIL_ALREADY_EXISTS: "This email is already in use",
  USERNAME: "Username",
  USERNAME_ALREADY_EXISTS: "This username is already in use",
  LOGIN_SUCCESS: "Login successful",
  LOGOUT_SUCCESS: "Logout successful",
  PROFILE_UPDATED: "Your profile has been updated",
  DOES_NOT_EXISTS: "User does not exist",
  FAILED_FETCH: "Failed to fetch user information",
  UNAUTHORIZED: "Your Google email is not verified",
} as const;

// ============================================================================
// VALIDATION & FORMATTING
// ============================================================================

export const VALIDATION = {
  // Required fields
  PHONE_REQUIRED: "Phone number is required",
  EMAIL_REQUIRED: "Email address is required",
  PASSWORD_REQUIRED: "Password is required",
  BUSINESS_ID_REQUIRED: "Business identifier is required",
  ENTRY_ID_REQUIRED: "Entry identifier is required",
  NAME_REQUIRED: "Name is required",

  // Invalid formats
  INVALID_PHONE_FORMAT:
    "Invalid phone number format (expected French format: +33 or 0)",
  INVALID_EMAIL_FORMAT: "Invalid email address format",
  INVALID_UUID_FORMAT: "Invalid identifier format",
  PASSWORD_TOO_WEAK:
    "Password must contain at least 8 characters, one uppercase letter and one digit",
  INVALID_PASSWORD: "Incorrect password",
  // Others
  MIN_LENGTH: "Minimum required length not met",
  MAX_LENGTH: "Maximum length exceeded",
} as const;

// ============================================================================
// GENERIC ERROR MESSAGES
// ============================================================================

export const ERROR_MESSAGES = {
  INTERNAL_SERVER_ERROR: "An internal error occurred",
  INVALID_REQUEST: "Invalid request",
  UNKNOWN_ERROR: "Unknown error",
  DATABASE_ERROR: "Database access error",
  EXTERNAL_SERVICE_ERROR: "Error communicating with external service",
  TIMEOUT_ERROR: "Request timed out",
  METHOD_NOT_ALLOWED: "HTTP method not allowed",
  INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
  GOOGLE_AUTH_FAILED: "Google authentication cancelled or failed",
  INVALID_SESSION: "Invalid session state (CSRF protection)",
  INVALID_CODE: "Missing authorization code",
  EXCHANGE_CODE_FAILED: "Failed to exchange authorization code",
} as const;

// ============================================================================
// ROUTES - AUTHENTIFICATION
// ============================================================================

export const ROUTES_AUTH = {
  BASE: "/auth",
  REGISTER: "/register",
  LOGIN: "/login",
  LOGOUT: "/logout",
  REFRESH_TOKEN: "/refresh",
  PROTECTED: "/protected",
} as const;

// ============================================================================
// ROUTES - UTILISATEURS
// ============================================================================

export const ROUTES_USERS = {
  BASE: "/users",
  BY_ID: "/:id",
  PROFILE: "/profile",
  SETTINGS: "/settings",
} as const;

export const ASSETS = {
  PLACEHOLDER_IMAGE:
    "https://media.istockphoto.com/id/985915172/fr/vectoriel/%C3%A9checs-de-checker-vecteur-abstrait-sans-soudure.jpg?s=612x612&w=0&k=20&c=4BLWcNYZe9uykbirGZHc2_0zZC0pIIKS4Tvt19oj8TQ=",
  APP_LOGO: "https://cdn.waitify.fr/logo.png",
} as const;

// ============================================================================
// TESTS
// ============================================================================

export const TEST_DATA = {
  // Test user
  TEST_USER_EMAIL: "usertest@yopmail.com",
  TEST_USER_PASSWORD: "@Password1",
  AVATAR_URL:
    "https://i.scdn.co/image/ab6761610000e5eb7d4e246f8c54be347e06bffe",

  // Test messages
  TEST_LOGIN_SHOULD_SUCCEED: "The test should log in the user and return a 200 status code",
  TEST_LOGIN_MESSAGE: "User is logged in",
} as const;

// ============================================================================
// CONFIGURATION GÉNÉRALE
// ============================================================================

export const APP_CONFIG = {
  ENVIRONMENT: "http://localhost",
  SERVER_PORT: Number.parseInt(String(process.env.PORT ?? process.env.SERVER_PORT ?? "8080"), 10) || 8080,
  TIMEZONE: "Europe/Paris",
  DEFAULT_LOCALE: "fr-FR",
  MAX_REQUEST_TIMEOUsT_MS: 30000,
  RATE_LIMIT_WINDOW_MS: 900000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 5000,
  EMPTY_STRING: "",
} as const;
