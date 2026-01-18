import dotenv from "dotenv";
dotenv.config();

// ============================================================================
// BASE DE DONNÉES
// ============================================================================

export const DATABASE_URL = process.env.DATABASE_URL;
export const DATABASE_HOST = process.env.DB_HOST;
export const DATABASE_USER = process.env.DB_USER;
export const DATABASE_PORT: number =
  parseInt(<string>process.env.DB_PORT, 10) || 5432;
export const DATABASE_PASSWORD = process.env.DB_PASSWORD;
export const DATABASE_NAME = process.env.DB_NAME;
export const DATABASE_SSL_MODE = Boolean(process.env.DB_SSLMODE);

// ============================================================================
// CLOUDFLARE
// ============================================================================

export const CLOUDFLARE = {
  BUCKET: process.env.R2_BUCKET,
  ACCOUNT: process.env.R2_ACCOUNT_ID,
  ACCESS_KEY: process.env.R2_ACCESS_KEY_ID,
  SECRET: process.env.R2_SECRET_ACCESS_KEY,
  PUBLIC_URL: process.env.R2_PUBLIC_URL,
  IMAGES_SIZE: 5 * 1024 * 1024,
  USER_DIR: "users",
  SCENARIO_DIR: "scenarios",
  COVER_DIR: "covers",
} as const;

// ============================================================================
// CODES DE STATUT HTTP
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// ============================================================================
// MÉTHODES HTTP
// ============================================================================

export const HTTP_METHODS = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
} as const;

// ============================================================================
// AUTHENTIFICATION & TOKENS
// ============================================================================

export const AUTH = {
  BEARER_PREFIX: "Bearer ",
  HEADER_NAME: "Authorization",
  INVALID_TOKEN: "Token de connexion invalide ou expiré",
  UNAUTHORIZED_ACCESS: "Accès non autorisé à cette ressource",
  MISSING_TOKEN: "Token d'authentification manquant",
  INVALID_CREDENTIALS: "Email ou mot de passe incorrect",
  EXPIRATION_TIME: "365d",
  TOKEN_EXPIRED: "Token expiré",
  SECRET_KEY: process.env.JWT_SECRET,
} as const;

// ============================================================================
// UTILISATEURS
// ============================================================================

export const USER_MESSAGES = {
  NOT_FOUND: "Utilisateur introuvable",
  CREATION_SUCCESS: "Utilisateur créé avec succès",
  UPDATE_SUCCESS: "Profil mis à jour avec succès",
  DELETION_SUCCESS: "Compte supprimé avec succès",
  EMAIL: "Email",
  PASSWORD: "password_hash",
  EMAIL_ALREADY_EXISTS: "Cet email est déjà utilisé",
  LOGIN_SUCCESS: "Connexion réussie",
  LOGOUT_SUCCESS: "Déconnexion réussie",
  PROFILE_UPDATED: "Votre profil a été mis à jour",
  DOES_NOT_EXISTS: "L'utilisateur n'existe pas",
  FAILED_FETCH: "Impossible de récupérer les informations utilisateur",
  UNAUTHORIZED: "Votre email Google n'est pas vérifié",
  SCENARIOS_FETCH_SUCCESS: "Scénarios récupérés avec succès",
  ALREADY_DELETED: "Ce compte a déjà été supprimé",
} as const;

// ============================================================================
// SCÉNARIOS
// ============================================================================

export const SCENARIO_MESSAGES = {
  NOT_FOUND: "Scénario introuvable",
  CREATION_SUCCESS: "Scénario créé avec succès",
  UPDATE_SUCCESS: "Scénario mis à jour avec succès",
  DELETION_SUCCESS: "Scénario supprimé avec succès",
  PLAYERS_FETCH_SUCCESS: "Liste des participants récupérée avec succès",
  NAME: "name",
  INVITE_CODE: "invite_code",
  MODE: "mode",
  DESCRIPTION: "description",
  INVITE_CODE_ALREADY_EXISTS: "Ce code d'invitation est déjà utilisé",
  ALREADY_EXISTS: "Un scénario similaire existe déjà",
  SCENARIO_UPDATED: "Votre Scénario a été mis à jour",
  DOES_NOT_EXISTS: "Le cénario n'existe pas",
  FAILED_FETCH: "Impossible de récupérer les informations du scénario",
  UNAUTHORIZED: "Votre email Google n'est pas vérifié",
} as const;

export const SCENARIO_VALIDATION_RULES = {
  NAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 100,
  },
  DESCRIPTION: {
    MAX_LENGTH: 500,
  },
  INVITE_CODE: {
    MIN_LENGTH: 6,
    MAX_LENGTH: 20,
    PATTERN: /^[A-Z0-9]+$/,
  },
  MODE: {
    ALLOWED_VALUES: ["story", "campaign"] as const,
  },
};

// ============================================================================
// VALIDATION & FORMAT
// ============================================================================

export const VALIDATION = {
  // Champs requis
  PHONE_REQUIRED: "Le numéro de téléphone est requis",
  EMAIL_REQUIRED: "L'adresse email est requise",
  PASSWORD_REQUIRED: "Le mot de passe est requis",
  BUSINESS_ID_REQUIRED: "L'identifiant de l'établissement est requis",
  ENTRY_ID_REQUIRED: "L'identifiant de l'entrée est requis",
  NAME_REQUIRED: "Le nom est requis",
  USERNAME_MIN_LENGTH:
    "Le nom d'utilisateur doit contenir au moins 3 caractères",
  USERNAME_MAX_LENGTH:
    "Le nom d'utilisateur ne peut pas dépasser 30 caractères",
  USERNAME_INVALID_FORMAT:
    "Le nom d'utilisateur ne peut contenir que des lettres, chiffres et underscores",
  USERNAME_ALREADY_EXISTS: "Ce nom d'utilisateur est déjà utilisé",
  INVALID_PHONE_FORMAT:
    "Le format du numéro de téléphone est invalide (format français attendu: +33 ou 0)",
  INVALID_EMAIL_FORMAT: "Le format de l'adresse email est invalide",
  INVALID_UUID_FORMAT: "Le format de l'identifiant est invalide",
  PASSWORD_TOO_WEAK:
    "Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre",
  INVALID_PASSWORD: "Le mot de passe est incorrect",
  MIN_LENGTH: "La longueur minimale requise n'est pas atteinte",
  MAX_LENGTH: "La longueur maximale a été dépassée",
} as const;

// ============================================================================
// MESSAGES D'ERREUR GÉNÉRIQUES
// ============================================================================

export const ERROR_MESSAGES = {
  INTERNAL_SERVER_ERROR: "Une erreur interne est survenue",
  INVALID_REQUEST: "Requête invalide",
  UNKNOWN_ERROR: "Erreur inconnue",
  DATABASE_ERROR: "Erreur lors de l'accès à la base de données",
  EXTERNAL_SERVICE_ERROR:
    "Erreur lors de la communication avec un service externe",
  TIMEOUT_ERROR: "La requête a dépassé le délai imparti",
  METHOD_NOT_ALLOWED: "Méthode HTTP non autorisée",
  INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe invalide",
  GOOGLE_AUTH_FAILED: "Authentification Google annulée ou échouée",
  INVALID_SESSION: "État de session invalide (protection CSRF)",
  INVALID_CODE: "Code d'autorisation manquant",
  EXCHANGE_CODE_FAILED: "Échec de l'échange du code d'autorisation",
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
  ME: "/me",
  SETTINGS: "/settings",
  SCENARIOS: "/scenarios",
} as const;

export const ASSETS = {
  PLACEHOLDER_IMAGE:
    "https://media.istockphoto.com/id/985915172/fr/vectoriel/%C3%A9checs-de-checker-vecteur-abstrait-sans-soudure.jpg?s=612x612&w=0&k=20&c=4BLWcNYZe9uykbirGZHc2_0zZC0pIIKS4Tvt19oj8TQ=",
  APP_LOGO: "https://cdn.waitify.fr/logo.png",
} as const;

// ============================================================================
// ROUTES - SCÉNARIOS
// ============================================================================

export const ROUTES_SCENARIOS = {
  BASE: "/scenarios",
  BY_ID: "/:id",
  CREATE: "/create",
  PLAYERS: "/players",
} as const;

// ============================================================================
// TESTS
// ============================================================================

export const TEST_DATA = {
  // Utilisateur de test
  TEST_USER_EMAIL: "usertest@yopmail.com",
  TEST_USER_PASSWORD: "@Password1",
  AVATAR_URL:
    "https://i.scdn.co/image/ab6761610000e5eb7d4e246f8c54be347e06bffe",

  // Messages de test
  TEST_LOGIN_SHOULD_SUCCEED:
    "Le test devrait connecter l'utilisateur et renvoyer un code 200",
  TEST_LOGIN_MESSAGE: "L'utilisateur est connecté",
} as const;

// ============================================================================
// CONFIGURATION GÉNÉRALE
// ============================================================================

export const APP_CONFIG = {
  ENVIRONMENT: "http://localhost",
  SERVER_PORT: process.env.SERVER_PORT,
  TIMEZONE: "Europe/Paris",
  DEFAULT_LOCALE: "fr-FR",
  MAX_REQUEST_TIMEOUT_MS: 30000,
  RATE_LIMIT_WINDOW_MS: 900000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  EMPTY_STRING: "",
  NOW: new Date(),
} as const;
