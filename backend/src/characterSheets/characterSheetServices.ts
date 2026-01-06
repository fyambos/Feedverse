import {
  getCharacterSheetForProfile,
  listCharacterSheetsForScenario,
  upsertCharacterSheetForProfile,
} from "./characterSheetRepositories";

export async function ListCharacterSheetsForScenarioService(userId: string, scenarioId: string) {
  return listCharacterSheetsForScenario({ userId, scenarioId });
}

export async function GetCharacterSheetForProfileService(userId: string, profileId: string) {
  return getCharacterSheetForProfile({ userId, profileId });
}

export async function UpsertCharacterSheetForProfileService(args: {
  userId: string;
  profileId: string;
  patch: any;
}) {
  return upsertCharacterSheetForProfile({ userId: args.userId, profileId: args.profileId, patch: args.patch });
}
