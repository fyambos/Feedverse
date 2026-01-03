import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ValidationError,
} from "./authModels";
import {
  nameFormatting,
  validateEmail,
  validatePassword,
} from "./authValidators";
import { ERROR_MESSAGES, USER_MESSAGES, VALIDATION } from "../config/constants";
import { UserRepository } from "../users/userRepositories";

const userRepository = new UserRepository();

export const RegisterUserService = async (
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
      avatar_url: avatar_url,
      created_at: date,
      updated_at: date,
    },
    avatar_url,
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
): Promise<{ user?: LoginResponse; error?: unknown }> => {
  const { email, password_hash } = input;

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password_hash);

  if (emailError || passwordError) {
    return { error: ERROR_MESSAGES.INVALID_EMAIL_OR_PASSWORD };
  }

  const userFetched = await userRepository.findByEmail(email);

  if (!userFetched) {
    return { error: USER_MESSAGES.DOES_NOT_EXISTS };
  }

  const hashedPassword: string = userFetched.password_hash;

  const isPasswordValid = await bcrypt.compare(password_hash, hashedPassword);

  if (!isPasswordValid) {
    return { error: VALIDATION.INVALID_PASSWORD };
  }

  /*
  const loginDate = new Date();
  await userRepository.updateLastLogin(email, loginDate);
  const { password_hash: _pwd, ...userWithoutPassword } = userFetched;

  return { user: userWithoutPassword as LoginResponse };
  */
};
