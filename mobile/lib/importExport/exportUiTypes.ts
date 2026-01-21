// mobile/lib/importExport/exportUiTypes.ts
import type { DbV5 } from "@/data/db/schema";

export type { DbV5 };

export type ScenarioExportScope = {
  includeProfiles: boolean;
  includePosts: boolean;
  includeReposts: boolean;
  includeSheets: boolean;
};