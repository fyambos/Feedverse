import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import {
  JwtTokenPayload,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
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
import { ValidationError } from "../utils/models";

const userRepository = new UserRepository();

export const RegisterService = async (
  input: RegisterRequest,
  avatarFile?: Express.Multer.File,
): Promise<{ user?: RegisterResponse; errors?: ValidationError[] }> => {
  const { username, email, password_hash, avatar_url } = input;

  const errors: ValidationError[] = [];

  const emailError = validateEmail(email);
  if (emailError) errors.push(emailError);

  const passwordError = validatePassword(password_hash);
  if (passwordError) errors.push(passwordError);

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

  const uuid = uuidv4();
  const date = new Date();
  const hashedPassword = await bcrypt.hash(password_hash, 10);
  const nameFormatted = nameFormatting(username);

  const userCreated = await userRepository.create(
    {
      id: uuid,
      username: username,
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

import jwt from "jsonwebtoken";
import { AUTH } from "../config/constants";
import { User } from "../users/userModels";

export const LoginService = async (
  input: LoginRequest,
): Promise<{ user?: LoginResponse; errors?: ValidationError[] }> => {
  const { email, password_hash } = input;

  // Validation
  const errors: ValidationError[] = [];

  const emailError = validateEmail(email);
  if (emailError) errors.push(emailError);

  const passwordError = validatePassword(password_hash);
  if (passwordError) errors.push(passwordError);

  if (errors.length > 0) {
    return { errors };
  }

  const userFetched = await userRepository.findByEmail(email);

  if (!userFetched) {
    return {
      errors: [
        {
          fields: USER_MESSAGES.EMAIL,
          message: USER_MESSAGES.DOES_NOT_EXISTS,
        },
      ],
    };
  }

  const isPasswordValid = await bcrypt.compare(
    password_hash,
    userFetched.password_hash,
  );

  if (!isPasswordValid) {
    return {
      errors: [
        {
          fields: USER_MESSAGES.PASSWORD,
          message: VALIDATION.INVALID_PASSWORD,
        },
      ],
    };
  }

  // const loginDate = APP_CONFIG.NOW;
  // await userRepository.updateLastLogin(email, loginDate);

  const tokenPayload: JwtTokenPayload = {
    id: userFetched.id,
    username: userFetched.username,
    email: userFetched.email,
    name: userFetched.name,
  };

  const token = jwt.sign(tokenPayload, AUTH.SECRET_KEY, {
    expiresIn: AUTH.EXPIRATION_TIME,
  });

  const { password_hash: _pwd, ...userWithoutPassword } = userFetched;

  const response: LoginResponse = {
    message: USER_MESSAGES.LOGIN_SUCCESS,
    token: token,
    User: userWithoutPassword as User,
  };

  return { user: response };
};
