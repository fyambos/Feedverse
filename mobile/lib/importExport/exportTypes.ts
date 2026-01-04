// mobile/lib/importExport/exportTypes.ts
import type { Scenario, Profile, Post, Repost, CharacterSheet, Like } from "@/data/db/schema";

export type ScenarioExportBundleV1 = {
  version: 1;
  exportedAt: string;

  // The scenario "settings" (create-scenario fields)
  scenario: Scenario;

  // Optional payloads depending on checkboxes
  profiles?: Profile[];
  posts?: Post[];
  reposts?: Repost[];
  likes?: Like[];
  sheets?: CharacterSheet[];
};
