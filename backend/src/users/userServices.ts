import { UserRepository } from "./userRepositories";
import { GetUserScenariosResponse } from "./userModels";

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
