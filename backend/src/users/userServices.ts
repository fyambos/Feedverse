import { UserRepository } from "./userRepositories";
import {
  GetUserScenariosResponse,
  UpdateUserData,
  UpdateUserRequest,
  UpdateUserResponse,
} from "./userModels";
import { ValidationError } from "../utils/models";
import { USER_MESSAGES, VALIDATION } from "../config/constants";
import { validateUsername, validateSettings } from "./userValidations";

const userRepository = new UserRepository();

export const GetUserScenariosService = async (
  userId: string,
): Promise<GetUserScenariosResponse> => {
  const scenarios = await userRepository.findUserScenarios(userId);

  return {
    scenarios,
    count: scenarios.length,
  };
};

export const DeleteUserService = async (
  userId: string,
): Promise<{
  success?: boolean;
  errors?: ValidationError[];
}> => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(userId)) {
    return {
      errors: [
        {
          fields: "id",
          message: "Format d'identifiant invalide",
        },
      ],
    };
  }

  const user = await userRepository.findById(userId);

  if (!user) {
    return {
      errors: [
        {
          fields: "id",
          message: USER_MESSAGES.NOT_FOUND,
        },
      ],
    };
  }

  const deleted = await userRepository.softDelete(userId);

  if (!deleted) {
    return {
      errors: [
        {
          fields: "id",
          message: "Échec de la suppression du compte",
        },
      ],
    };
  }

  return { success: true };
};

export const UpdateUserService = async (
  userId: string,
  input: UpdateUserRequest,
  avatarFile?: Express.Multer.File,
): Promise<{
  user?: UpdateUserResponse;
  errors?: ValidationError[];
}> => {
  const { username, settings } = input;
  const errors: ValidationError[] = [];

  if (username !== undefined) {
    const usernameError = validateUsername(username);
    if (usernameError) {
      errors.push(usernameError);
    } else {
      const usernameExists = await userRepository.usernameExists(
        username.trim(),
        userId,
      );
      if (usernameExists) {
        errors.push({
          fields: "username",
          message: VALIDATION.USERNAME_ALREADY_EXISTS,
        });
      }
    }
  }

  if (settings !== undefined) {
    const settingsError = validateSettings(settings);
    if (settingsError) {
      errors.push(settingsError);
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const currentUser = await userRepository.findById(userId);
  if (!currentUser) {
    return {
      errors: [
        {
          fields: "user",
          message: USER_MESSAGES.NOT_FOUND,
        },
      ],
    };
  }

  const updateData: UpdateUserData = {
    updated_at: new Date(),
  };

  if (username !== undefined) {
    updateData.username = username.trim();
  }

  if (settings !== undefined) {
    updateData.settings = {
      ...currentUser.settings,
      ...settings,
    };
  }

  const updatedUser = await userRepository.update(
    userId,
    updateData,
    avatarFile,
  );

  const user: UpdateUserResponse = {
    message: USER_MESSAGES.UPDATE_SUCCESS,
    user: updatedUser,
  };

  return { user };
};
