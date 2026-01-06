export type GlobalTagRow = {
  key: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string | null;
};

export type GlobalTagApi = {
  key: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt?: string;
};

export function mapGlobalTagRowToApi(row: GlobalTagRow): GlobalTagApi {
  return {
    key: String(row.key),
    name: String(row.name),
    color: String(row.color),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}
