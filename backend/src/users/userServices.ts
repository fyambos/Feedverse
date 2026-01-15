import { UserRepository } from "./userRepositories";
import { GetUserScenariosResponse } from "./userModels";
import { ValidationError } from "../utils/models";
import { USER_MESSAGES } from "../config/constants";

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
