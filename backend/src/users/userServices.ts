import { UserRepository } from "./userRepositories";
import {
  GetBatchUsersResponse,
  GetUserScenariosResponse,
  GetUserSessionsResponse,
  PublicSession,
  UpdateUserData,
  UpdateUserRequest,
  UpdateUserResponse,
} from "./userModels";
import { ValidationError } from "../utils/models";
import { USER_MESSAGES, VALIDATION } from "../config/constants";
import {
  validateUsername,
  validateSettings,
  validateBatchUsersQuery,
  validateUUIDs,
} from "./userValidations";
import { createHash } from "crypto";

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

export const GetUserScenariosByUserIdService = async (
  requestedUserId: string,
  authenticatedUserId: string,
): Promise<{
  scenarios?: GetUserScenariosResponse;
  errors?: ValidationError[];
}> => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(requestedUserId)) {
    return {
      errors: [
        {
          fields: "userId",
          message: "Format d'identifiant invalide",
        },
      ],
    };
  }

  const userExists = await userRepository.findById(requestedUserId);

  if (!userExists) {
    console.error("ID utilisateur non trouvé : ", authenticatedUserId);
    return {
      errors: [
        {
          fields: "userId",
          message: USER_MESSAGES.NOT_FOUND,
        },
      ],
    };
  }

  const scenarios = await userRepository.findUserScenarios(requestedUserId);

  return {
    scenarios: {
      scenarios,
      count: scenarios.length,
    },
  };
};

export const GetBatchUsersService = async (
  queryIds: string | string[] | undefined,
): Promise<{
  data?: GetBatchUsersResponse;
  errors?: ValidationError[];
}> => {
  const validationError = validateBatchUsersQuery(queryIds);
  if (validationError) {
    return { errors: [validationError] };
  }

  const idsArray = Array.isArray(queryIds)
    ? queryIds
    : (queryIds as string).split(",").map((id) => id.trim());

  const { valid: validIds, invalid: invalidIds } = validateUUIDs(idsArray);

  if (invalidIds.length > 0) {
    return {
      errors: [
        {
          fields: "ids",
          message: `Identifiants invalides: ${invalidIds.join(", ")}`,
        },
      ],
    };
  }

  const users = await userRepository.findByIds(validIds);

  const notFound = await userRepository.findMissingIds(validIds, users);

  return {
    data: {
      users,
      count: users.length,
      ...(notFound.length > 0 && { not_found: notFound }),
    },
  };
};

export const GetUserSessionsService = async (
  userId: string,
  currentToken: string,
): Promise<GetUserSessionsResponse> => {
  const sessions = await userRepository.findSessionsByUserId(userId);

  const currentTokenHash = createHash("sha256")
    .update(currentToken)
    .digest("hex");

  const publicSessions: PublicSession[] = sessions.map((session) => ({
    id: session.id,
    user_agent: session.user_agent,
    ip: session.ip,
    created_at: session.created_at,
    last_seen_at: session.last_seen_at,
    is_current: false,
    is_revoked: session.revoked_at !== null,
  }));

  const currentSession =
    await userRepository.findSessionByTokenHash(currentTokenHash);

  if (currentSession) {
    const currentSessionIndex = publicSessions.findIndex(
      (s) => s.id === currentSession.id,
    );
    if (currentSessionIndex !== -1) {
      publicSessions[currentSessionIndex].is_current = true;
    }
  }

  return {
    sessions: publicSessions,
    count: publicSessions.length,
  };
};
