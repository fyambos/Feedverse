import { listGlobalTags } from "./globalTagRepositories";

export const ListGlobalTagsService = async (q?: string) => {
  return await listGlobalTags({ q });
};
