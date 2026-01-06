import { listLikesForScenario, setLikeState } from "./likeRepositories";

export const ListLikesForScenarioService = async (userId: string, scenarioId: string) => {
  return await listLikesForScenario({ userId, scenarioId });
};

export const SetLikeStateService = async (args: {
  userId: string;
  scenarioId: string;
  profileId: string;
  postId: string;
  ensureLiked: boolean;
}) => {
  return await setLikeState(args);
};
