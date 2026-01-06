import { listRepostsForScenario, toggleRepost } from "./repostRepositories";

export const ListRepostsForScenarioService = async (userId: string, scenarioId: string) => {
  return await listRepostsForScenario({ userId, scenarioId });
};

export const ToggleRepostService = async (args: {
  userId: string;
  scenarioId: string;
  profileId: string;
  postId: string;
}) => {
  return await toggleRepost(args);
};
