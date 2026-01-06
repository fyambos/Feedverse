import {
  adoptPublicProfile,
  createProfileForScenario,
  deleteProfileCascade,
  listProfilesForScenario,
  transferProfiles,
  updateProfile,
} from "./profileRepositories";

export const ListProfilesForScenarioService = async (userId: string, scenarioId: string) => {
  return await listProfilesForScenario({ userId, scenarioId });
};

export const CreateProfileForScenarioService = async (args: {
  userId: string;
  scenarioId: string;
  input: any;
}) => {
  return await createProfileForScenario({ userId: args.userId, scenarioId: args.scenarioId, input: args.input });
};

export const UpdateProfileService = async (args: { userId: string; profileId: string; patch: any }) => {
  return await updateProfile({ userId: args.userId, profileId: args.profileId, patch: args.patch });
};

export const DeleteProfileCascadeService = async (args: { userId: string; profileId: string }) => {
  return await deleteProfileCascade({ userId: args.userId, profileId: args.profileId });
};

export const AdoptPublicProfileService = async (args: { userId: string; profileId: string }) => {
  return await adoptPublicProfile({ userId: args.userId, profileId: args.profileId });
};

export const TransferProfilesService = async (args: {
  userId: string;
  scenarioId: string;
  profileIds: string[];
  toUserId: string;
}) => {
  return await transferProfiles({
    userId: args.userId,
    scenarioId: args.scenarioId,
    profileIds: args.profileIds,
    toUserId: args.toUserId,
  });
};
