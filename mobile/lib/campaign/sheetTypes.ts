// mobile/lib/campaign/sheetTypes.ts
export type StatKey = "str" | "dex" | "int" | "cha" | "con" | "wis";

export type CharacterSheet = {
  profileId: string;

  level: number;

  hp: number;
  maxHp: number;

  status?: string; // "normal", "poisoned", "stunned", etc.

  stats: Record<StatKey, number>;
};