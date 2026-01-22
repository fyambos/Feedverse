import { listProfilePinsForScenario, setPinnedPostForProfile } from "./profilePinRepositories";

export async function ListProfilePinsForScenarioService(userId: string, scenarioId: string) {
  return listProfilePinsForScenario({ userId, scenarioId });
}

export async function SetProfilePinnedPostService(args: {
  userId: string;
  profileId: string;
  postId: string | null;
}) {
  return setPinnedPostForProfile(args);
}
