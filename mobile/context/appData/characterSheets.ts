import type { Dispatch, SetStateAction } from "react";
import type { DbV5, CharacterSheet } from "@/data/db/schema";
import { updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";

type AuthLike = {
  token?: string | null;
};

type Deps = {
  getDb: () => DbV5 | null;
  setState: Dispatch<SetStateAction<any>>;
  auth: AuthLike;
};

export function createCharacterSheetsApi(deps: Deps) {
  const getCharacterSheetByProfileId = (profileId: string) => {
    const db = deps.getDb();
    return db ? ((db as any).sheets?.[String(profileId)] ?? null) : null;
  };

  const upsertCharacterSheet = async (sheet: CharacterSheet) => {
    const key = String((sheet as any).profileId ?? (sheet as any).ownerProfileId ?? "");
    if (!key) throw new Error("CharacterSheet.profileId is required");

    const token = String(deps.auth.token ?? "").trim();
    const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();

    let serverSheet: any = null;
    if (token && baseUrl) {
      const res = await apiFetch({
        path: `/profiles/${encodeURIComponent(key)}/character-sheet`,
        token,
        init: {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sheet ?? {}),
        },
      });

      if (!res.ok) {
        const msg =
          typeof (res.json as any)?.error === "string"
            ? String((res.json as any).error)
            : typeof res.text === "string" && res.text.trim().length
              ? res.text
              : `Save failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      serverSheet = (res.json as any)?.sheet ?? null;
    }

    const now = new Date().toISOString();
    const raw = serverSheet ?? sheet;

    const nextDb = await updateDb((prev) => {
      const prevSheets = ((prev as any).sheets ?? {}) as Record<string, CharacterSheet>;
      const existing = prevSheets[key];
      const createdAt = (existing as any)?.createdAt ?? (raw as any)?.createdAt ?? now;

      return {
        ...prev,
        sheets: {
          ...prevSheets,
          [key]: {
            ...(existing ?? {}),
            ...raw,
            profileId: key,
            createdAt,
            updatedAt: (raw as any)?.updatedAt
              ? new Date((raw as any).updatedAt).toISOString()
              : (raw as any)?.updated_at
                ? new Date((raw as any).updated_at).toISOString()
                : now,
          } as any,
        },
      };
    });

    deps.setState({ isReady: true, db: nextDb as any });
  };

  return {
    getCharacterSheetByProfileId,
    upsertCharacterSheet,
  };
}
