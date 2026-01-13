import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import {
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  ValidationError,
} from "./authModels";
import {
  nameFormatting,
  validateEmail,
  validatePassword,
} from "./authValidators";
import {
  APP_CONFIG,
  ERROR_MESSAGES,
  USER_MESSAGES,
  VALIDATION,
} from "../config/constants";
import { UserRepository } from "../users/userRepositories";
import type { User as DbUser } from "../users/userModels";
import { normalizeUsername, validateUsername } from "../lib/username";

const userRepository = new UserRepository();

export const RegisterUserService = async (
  input: RegisterRequest,
  avatarFile?: Express.Multer.File,
): Promise<{ user?: RegisterResponse; errors?: ValidationError[] }> => {
  const { username, email, password_hash, avatar_url } = input;
  const usernameNormalized = normalizeUsername(username);

  const errors: ValidationError[] = [];

  const emailError = validateEmail(email);
  if (emailError) errors.push(emailError);

  const passwordError = validatePassword(password_hash);
  if (passwordError) errors.push(passwordError);

  const usernameError = validateUsername(usernameNormalized);
  if (usernameError) {
    errors.push({ fields: USER_MESSAGES.USERNAME, message: usernameError });
  }

  if (errors.length > 0) {
    return { errors };
  }

  const emailExists = await userRepository.emailExists(email);

  if (emailExists) {
    return {
      errors: [
        {
          fields: USER_MESSAGES.EMAIL,
          message: USER_MESSAGES.EMAIL_ALREADY_EXISTS,
        },
      ],
    };
  }

  if (usernameNormalized) {
    const existingByUsername = await userRepository.findByUsername(
      usernameNormalized,
    );
    if (existingByUsername) {
      return {
        errors: [
          {
            fields: USER_MESSAGES.USERNAME,
            message: USER_MESSAGES.USERNAME_ALREADY_EXISTS,
          },
        ],
      };
    }
  }

  const uuid = uuidv4();
  const date = new Date();
  const hashedPassword = await bcrypt.hash(password_hash, 10);
  const nameFormatted = nameFormatting(usernameNormalized);

  const userCreated = await userRepository.create(
    {
      id: uuid,
      username: usernameNormalized,
      name: nameFormatted,
      email: email,
      password_hash: hashedPassword,
      avatar_url: avatar_url || APP_CONFIG.EMPTY_STRING,
      created_at: date,
      updated_at: date,
    },
    avatarFile,
  );

  const user: RegisterResponse = {
    message: USER_MESSAGES.CREATION_SUCCESS,
    User: {
      id: userCreated.id,
      username: userCreated.username,
      name: userCreated.name,
      email: userCreated.email,
      avatar_url: userCreated.avatar_url,
      created_at: userCreated.created_at,
      updated_at: userCreated.updated_at,
    },
  };

  return { user };
};

export const LoginUserService = async (
  input: LoginRequest,
): Promise<{ user?: Omit<DbUser, "password_hash">; error?: unknown }> => {
  const identifierRaw = String(input?.email ?? "").trim();
  const identifier = identifierRaw.replace(/^@+/, "").trim();
  const password_hash = String(input?.password_hash ?? "");

  const passwordError = validatePassword(password_hash);
  if (passwordError) {
    return { error: ERROR_MESSAGES.INVALID_EMAIL_OR_PASSWORD };
  }

  const isEmail = /@/.test(identifier);
  if (isEmail) {
    const emailError = validateEmail(identifier);
    if (emailError) return { error: ERROR_MESSAGES.INVALID_EMAIL_OR_PASSWORD };
  }

  const identifierNormalized = isEmail ? identifier.toLowerCase() : normalizeUsername(identifier);
  if (!isEmail) {
    const uErr = validateUsername(identifierNormalized);
    if (uErr) return { error: USER_MESSAGES.DOES_NOT_EXISTS };
  }

  const userFetched = isEmail
    ? await userRepository.findByEmail(identifierNormalized)
    : await userRepository.findByUsername(identifierNormalized);

  if (!userFetched) {
    return { error: USER_MESSAGES.DOES_NOT_EXISTS };
  }

  const hashedPassword: string = userFetched.password_hash;

  const isPasswordValid = await bcrypt.compare(password_hash, hashedPassword);

  if (!isPasswordValid) {
    return { error: VALIDATION.INVALID_PASSWORD };
  }

  const { password_hash: passwordHash, ...userWithoutPassword } = userFetched;
  void passwordHash;
  return { user: userWithoutPassword };
};
