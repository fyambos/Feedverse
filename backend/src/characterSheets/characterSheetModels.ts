export type CharacterSheetRow = {
  profile_id: string;
  scenario_id: string;
  name: string | null;
  race: string | null;
  class: string | null;
  level: number | null;
  alignment: string | null;
  background: string | null;

  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;

  hp_current: number;
  hp_max: number;
  hp_temp: number | null;

  status: string | null;

  inventory: unknown;
  equipment: unknown;
  spells: unknown;
  abilities: unknown;

  public_notes: string | null;
  private_notes: string | null;

  created_at: Date | string;
  updated_at: Date | string | null;
};

export type CharacterSheetApi = {
  profileId: string;
  scenarioId: string;

  name?: string;
  race?: string;
  class?: string;
  level?: number;
  alignment?: string;
  background?: string;

  stats: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };

  hp: { current: number; max: number; temp?: number };
  status?: string;

  inventory: Array<{ id: string; name: string; qty?: number; notes?: string }>;
  equipment?: Array<{ id: string; name: string; notes?: string }>;
  spells?: Array<{ id: string; name: string; notes?: string }>;
  abilities?: Array<{ id: string; name: string; notes?: string }>;

  publicNotes?: string;
  privateNotes?: string;

  createdAt: string;
  updatedAt?: string;
};

function toIso(v: Date | string | null | undefined): string | undefined {
  if (v == null) return undefined;
  try {
    return new Date(v).toISOString();
  } catch {
    return undefined;
  }
}

function toArray(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function mapCharacterSheetRowToApi(row: CharacterSheetRow): CharacterSheetApi {
  const createdAt = toIso(row.created_at) ?? new Date().toISOString();
  const updatedAt = toIso(row.updated_at);

  const inventory = toArray(row.inventory).map((x) => ({
    id: String((x as any)?.id ?? ""),
    name: String((x as any)?.name ?? ""),
    qty: (x as any)?.qty != null ? Number((x as any).qty) : undefined,
    notes: (x as any)?.notes != null ? String((x as any).notes) : undefined,
  })).filter((x) => x.id || x.name);

  const equipment = toArray(row.equipment).map((x) => ({
    id: String((x as any)?.id ?? ""),
    name: String((x as any)?.name ?? ""),
    notes: (x as any)?.notes != null ? String((x as any).notes) : undefined,
  })).filter((x) => x.id || x.name);

  const spells = toArray(row.spells).map((x) => ({
    id: String((x as any)?.id ?? ""),
    name: String((x as any)?.name ?? ""),
    notes: (x as any)?.notes != null ? String((x as any).notes) : undefined,
  })).filter((x) => x.id || x.name);

  const abilities = toArray(row.abilities).map((x) => ({
    id: String((x as any)?.id ?? ""),
    name: String((x as any)?.name ?? ""),
    notes: (x as any)?.notes != null ? String((x as any).notes) : undefined,
  })).filter((x) => x.id || x.name);

  return {
    profileId: String(row.profile_id),
    scenarioId: String(row.scenario_id),

    name: row.name != null ? String(row.name) : undefined,
    race: row.race != null ? String(row.race) : undefined,
    class: (row as any).class != null ? String((row as any).class) : undefined,
    level: row.level != null ? Number(row.level) : undefined,
    alignment: row.alignment != null ? String(row.alignment) : undefined,
    background: row.background != null ? String(row.background) : undefined,

    stats: {
      strength: Number(row.strength ?? 10),
      dexterity: Number(row.dexterity ?? 10),
      constitution: Number(row.constitution ?? 10),
      intelligence: Number(row.intelligence ?? 10),
      wisdom: Number(row.wisdom ?? 10),
      charisma: Number(row.charisma ?? 10),
    },

    hp: {
      current: Number(row.hp_current ?? 10),
      max: Number(row.hp_max ?? 10),
      temp: row.hp_temp != null ? Number(row.hp_temp) : undefined,
    },

    status: row.status != null ? String(row.status) : undefined,

    inventory,
    equipment: equipment.length ? equipment : undefined,
    spells: spells.length ? spells : undefined,
    abilities: abilities.length ? abilities : undefined,

    publicNotes: row.public_notes != null ? String(row.public_notes) : undefined,
    privateNotes: row.private_notes != null ? String(row.private_notes) : undefined,

    createdAt,
    updatedAt,
  };
}
