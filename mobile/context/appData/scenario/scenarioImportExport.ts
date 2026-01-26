import type { Dispatch, SetStateAction } from "react";
import type { CharacterSheet, GlobalTag, Post, Profile, Scenario, ScenarioTag } from "@/data/db/schema";
import { updateDb, writeDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";
import { pickScenarioExportJson } from "@/lib/importExport/importFromFile";
import { importScenarioFromJson } from "@/lib/importExport/importScenario";
import { validateScenarioExportBundleV1 } from "@/lib/importExport/validateScenarioExport";
import { buildScenarioExportBundleV1 } from "@/lib/importExport/exportScenarioBundle";
import { saveAndShareScenarioExport } from "@/lib/importExport/exportScenario";

type ImportPickCache = {
  pickedAtMs: number;
  raw: any;
  jsonBytes: number;
  fileName?: string;
  uri?: string;
};

type AuthLike = {
  isReady: boolean;
  token?: string | null;
};

type ServerSeenPostsRef = {
  current: { byScenario: Record<string, Record<string, boolean>> };
};

type Deps = {
  getDb: () => any;
  setState: Dispatch<SetStateAction<any>>;
  auth: AuthLike;
  currentUserId: string;
  isUuidLike: (id: string) => boolean;
  isBackendMode: (token?: string | null) => boolean;
  serverSeenPostsRef: ServerSeenPostsRef;
  importPickCacheRef: { current: ImportPickCache | null };
};

export function createScenarioImportExportApi(deps: Deps) {
  const importScenarioFromFile = async (args: {
    includeProfiles: boolean;
    includePosts: boolean;
    includeReposts: boolean;
    includeSheets: boolean;
  }): Promise<
    | {
        ok: true;
        scenarioId: string;
        importedProfiles: number;
        importedPosts: number;
        importedSheets: number;
        renamedHandles: Array<{ from: string; to: string }>;
      }
    | { ok: false; error: string }
  > => {
    const db = deps.getDb();
    if (!db) return { ok: false, error: "DB not ready" };
    if (!deps.auth.isReady) return { ok: false, error: "Auth not ready" };
    if (!deps.currentUserId) return { ok: false, error: "Not signed in" };

    const token = String(deps.auth.token ?? "").trim();
    const backendEnabled = deps.isBackendMode(token);

    const now = Date.now();
    const cachedOk = deps.importPickCacheRef.current && now - deps.importPickCacheRef.current.pickedAtMs < 30_000;

    const picked = cachedOk
      ? {
          ok: true as const,
          raw: deps.importPickCacheRef.current!.raw,
          jsonBytes: deps.importPickCacheRef.current!.jsonBytes,
          fileName: deps.importPickCacheRef.current!.fileName,
          uri: deps.importPickCacheRef.current!.uri,
        }
      : await pickScenarioExportJson();

    // prevent accidental reuse
    deps.importPickCacheRef.current = null;

    if (!picked.ok) return picked as any;

    if (backendEnabled) {
      let parsed: any = picked.raw;
      if (typeof parsed === "string") {
        try {
          const s = parsed.replace(/^\uFEFF/, "");
          parsed = JSON.parse(s);
        } catch {
          return { ok: false as const, error: "Invalid JSON file." };
        }
      }

      const validated = validateScenarioExportBundleV1(parsed, { jsonBytes: picked.jsonBytes });
      if (!validated.ok) return { ok: false as const, error: validated.error };
      const bundle = validated.value as any;

      const wantPosts = Boolean(args.includePosts);
      const wantSheets = Boolean(args.includeSheets);
      const wantProfiles = Boolean(args.includeProfiles || args.includePosts || args.includeSheets);

      const sourceScenario = bundle.scenario as any;

      const randInviteCode = (len = 6) => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid ambiguous I/O/1/0
        let out = "";
        for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
        return out;
      };

      const normalizeScenarioFromServer = (raw: any): Scenario => {
        const nowIso = new Date().toISOString();

        const playerIdsRaw = raw?.player_ids ?? raw?.playerIds;
        const playerIds = Array.isArray(playerIdsRaw) ? playerIdsRaw.map(String).filter(Boolean) : [];

        const gmUserIdsRaw = raw?.gm_user_ids ?? raw?.gmUserIds;
        const gmUserIds = Array.isArray(gmUserIdsRaw) ? gmUserIdsRaw.map(String).filter(Boolean) : undefined;

        return {
          id: String(raw?.id ?? "").trim(),
          name: String(raw?.name ?? ""),
          cover: String(raw?.cover ?? raw?.cover_url ?? ""),
          inviteCode: String(raw?.invite_code ?? raw?.inviteCode ?? ""),
          ownerUserId: String(raw?.owner_user_id ?? raw?.ownerUserId ?? ""),
          description: raw?.description != null ? String(raw.description) : undefined,
          mode: raw?.mode === "campaign" ? "campaign" : "story",
          playerIds,
          tags: Array.isArray(raw?.tags) ? raw.tags : undefined,
          gmUserIds,
          settings: raw?.settings ?? {},
          createdAt: raw?.created_at
            ? new Date(raw.created_at).toISOString()
            : raw?.createdAt
              ? new Date(raw.createdAt).toISOString()
              : nowIso,
          updatedAt: raw?.updated_at
            ? new Date(raw.updated_at).toISOString()
            : raw?.updatedAt
              ? new Date(raw.updatedAt).toISOString()
              : nowIso,
        } as any;
      };

      const normalizeProfileFromServer = (raw: any, scenarioId: string): Profile => {
        const nowIso = new Date().toISOString();
        const hasOwnerKey = raw != null && ("ownerUserId" in raw || "owner_user_id" in raw);
        const ownerFromApi = raw?.ownerUserId ?? raw?.owner_user_id;
        const ownerUserId = hasOwnerKey ? (ownerFromApi == null ? "" : String(ownerFromApi)) : "";
        return {
          id: String(raw?.id ?? "").trim(),
          scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? scenarioId),
          ownerUserId,
          displayName: String(raw?.displayName ?? raw?.display_name ?? ""),
          handle: String(raw?.handle ?? ""),
          avatarUrl: String(raw?.avatarUrl ?? raw?.avatar_url ?? ""),
          headerUrl: raw?.headerUrl ?? raw?.header_url ?? undefined,
          bio: raw?.bio ?? undefined,
          isPublic: raw?.isPublic ?? raw?.is_public ?? false,
          isPrivate: raw?.isPrivate ?? raw?.is_private ?? false,
          joinedDate: raw?.joinedDate ?? raw?.joined_date ?? undefined,
          location: raw?.location ?? undefined,
          link: raw?.link ?? undefined,
          followerCount: raw?.followerCount ?? raw?.follower_count ?? 0,
          followingCount: raw?.followingCount ?? raw?.following_count ?? 0,
          createdAt: raw?.createdAt
            ? new Date(raw.createdAt).toISOString()
            : raw?.created_at
              ? new Date(raw.created_at).toISOString()
              : nowIso,
          updatedAt: raw?.updatedAt
            ? new Date(raw.updatedAt).toISOString()
            : raw?.updated_at
              ? new Date(raw.updated_at).toISOString()
              : nowIso,
        } as any;
      };

      const normalizePostFromServer = (raw: any, scenarioId: string): Post => {
        const nowIso = new Date().toISOString();
        return {
          id: String(raw?.id ?? "").trim(),
          scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? scenarioId),
          authorProfileId: String(raw?.authorProfileId ?? raw?.author_profile_id ?? "").trim(),
          authorUserId: String(raw?.authorUserId ?? raw?.author_user_id ?? "").trim() || undefined,
          text: String(raw?.text ?? ""),
          imageUrls: Array.isArray(raw?.imageUrls)
            ? raw.imageUrls.map(String).filter(Boolean)
            : Array.isArray(raw?.image_urls)
              ? raw.image_urls.map(String).filter(Boolean)
              : [],
          replyCount: Number(raw?.replyCount ?? raw?.reply_count ?? 0),
          repostCount: Number(raw?.repostCount ?? raw?.repost_count ?? 0),
          likeCount: Number(raw?.likeCount ?? raw?.like_count ?? 0),
          parentPostId: raw?.parentPostId ?? raw?.parent_post_id ?? undefined,
          quotedPostId: raw?.quotedPostId ?? raw?.quoted_post_id ?? undefined,
          insertedAt: raw?.insertedAt
            ? new Date(raw.insertedAt).toISOString()
            : raw?.inserted_at
              ? new Date(raw.inserted_at).toISOString()
              : nowIso,
          createdAt: raw?.createdAt
            ? new Date(raw.createdAt).toISOString()
            : raw?.created_at
              ? new Date(raw.created_at).toISOString()
              : nowIso,
          updatedAt: raw?.updatedAt
            ? new Date(raw.updatedAt).toISOString()
            : raw?.updated_at
              ? new Date(raw.updated_at).toISOString()
              : nowIso,
          postType: raw?.postType ?? raw?.post_type ?? "rp",
          meta: raw?.meta ?? undefined,
          isPinned: raw?.isPinned ?? raw?.is_pinned ?? undefined,
          pinOrder: raw?.pinOrder ?? raw?.pin_order ?? undefined,
        } as any;
      };

      const sourceSettings = (sourceScenario?.settings ?? {}) as Record<string, any>;
      const settingsForCreate = wantPosts
        ? (() => {
            const { pinnedPostIds, ...rest } = sourceSettings;
            return rest;
          })()
        : sourceSettings;

      const scenarioPayloadBase = {
        name: String(sourceScenario?.name ?? "Imported scenario").trim() || "Imported scenario",
        cover: String(sourceScenario?.cover ?? "").trim(),
        description: sourceScenario?.description ?? null,
        mode: sourceScenario?.mode === "campaign" ? "campaign" : "story",
        settings: settingsForCreate ?? {},
        gmUserIds: Array.isArray(sourceScenario?.gmUserIds) ? sourceScenario.gmUserIds : undefined,
        tags: Array.isArray(sourceScenario?.tags) ? sourceScenario.tags : undefined,
      };

      let createdScenarioRaw: any = null;
      let createdScenario: Scenario | null = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        const inviteCode = randInviteCode(6);
        const res = await apiFetch({
          path: "/scenarios",
          token,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...scenarioPayloadBase, inviteCode }),
          },
        });

        if (!res.ok) {
          const msg =
            typeof (res.json as any)?.error === "string"
              ? String((res.json as any).error)
              : typeof res.text === "string" && res.text.trim().length
                ? res.text
                : `Import failed (HTTP ${res.status})`;

          if (/invite|duplicate|unique/i.test(msg) && attempt < 4) continue;
          return { ok: false as const, error: msg };
        }

        createdScenarioRaw = (res.json as any)?.scenario;
        if (createdScenarioRaw) {
          createdScenario = normalizeScenarioFromServer(createdScenarioRaw);
        }

        if (createdScenario && String((createdScenario as any).id ?? "").trim()) break;
      }

      if (!createdScenario || !String((createdScenario as any).id ?? "").trim()) {
        return { ok: false as const, error: "Invalid server response while creating scenario." };
      }

      const scenarioId = String((createdScenario as any).id);

      const mergedDbAfterScenario = await updateDb((prev) => {
        const nowIso = new Date().toISOString();

        const prevTags = ((prev as any).tags ?? {}) as Record<string, GlobalTag>;
        const nextTags: Record<string, GlobalTag> = { ...prevTags };

        const scenarioTags: ScenarioTag[] = [];
        for (const rawTag of (createdScenarioRaw?.tags ?? (createdScenario as any)?.tags ?? []) as any[]) {
          const key = String(rawTag?.key ?? rawTag?.id ?? "").toLowerCase().trim();
          if (!key) continue;
          const name = String(rawTag?.name ?? key).trim();
          const color = String(rawTag?.color ?? "").trim();
          nextTags[key] = { key, name, color, updatedAt: nowIso, createdAt: nextTags[key]?.createdAt ?? nowIso } as any;
          scenarioTags.push({ id: `t_${key}`, key, name, color } as any);
        }

        return {
          ...prev,
          tags: nextTags,
          scenarios: {
            ...prev.scenarios,
            [scenarioId]: {
              ...(prev.scenarios as any)?.[scenarioId],
              ...(createdScenario as any),
              id: scenarioId,
              tags: scenarioTags,
            } as any,
          },
        } as any;
      });

      deps.setState({ isReady: true, db: mergedDbAfterScenario as any });

      const profileIdMap = new Map<string, string>();
      const createdProfiles: Profile[] = [];

      const rawProfiles: any[] = Array.isArray(bundle.profiles) ? bundle.profiles : [];
      if (wantProfiles && rawProfiles.length > 0) {
        for (const pr of rawProfiles) {
          const oldId = String(pr?.id ?? "").trim();
          if (!oldId) continue;

          const baseBody = {
            displayName: String(pr?.displayName ?? "").trim() || "Unnamed",
            handle: String(pr?.handle ?? "").trim(),
            avatarUrl: pr?.avatarUrl != null ? String(pr.avatarUrl) : "",
            headerUrl: pr?.headerUrl ?? null,
            bio: pr?.bio ?? null,
            isPublic: pr?.isPublic ?? false,
            isPrivate: pr?.isPrivate ?? false,
            joinedDate: pr?.joinedDate ?? null,
            location: pr?.location ?? null,
            link: pr?.link ?? null,
            followerCount: pr?.followerCount ?? 0,
            followingCount: pr?.followingCount ?? 0,
          };

          let created: any = null;
          for (let attempt = 0; attempt < 5; attempt++) {
            const handle = attempt === 0 ? baseBody.handle : `${baseBody.handle}${attempt + 1}`;
            const body = { ...baseBody, handle };
            const res = await apiFetch({
              path: `/scenarios/${encodeURIComponent(scenarioId)}/profiles`,
              token,
              init: {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
            });

            if (!res.ok) {
              const msg =
                typeof (res.json as any)?.error === "string"
                  ? String((res.json as any).error)
                  : typeof res.text === "string" && res.text.trim().length
                    ? res.text
                    : `Import failed (HTTP ${res.status})`;
              if (/taken|handle/i.test(msg) && attempt < 4) continue;
              return { ok: false as const, error: msg };
            }

            created = (res.json as any)?.profile;
            if (created?.id) break;
          }

          if (!created?.id) continue;

          const normalized = normalizeProfileFromServer(created, scenarioId);
          const newId = String((normalized as any).id);
          if (!newId) continue;
          profileIdMap.set(oldId, newId);
          createdProfiles.push(normalized);
        }
      }

      if (createdProfiles.length > 0) {
        const mergedDbAfterProfiles = await updateDb((prev) => {
          const profiles = { ...(prev.profiles ?? {}) } as any;
          for (const pr of createdProfiles) {
            profiles[String((pr as any).id)] = pr as any;
          }

          const selectedProfileByScenario = { ...((prev as any).selectedProfileByScenario ?? {}) };
          if (!selectedProfileByScenario[scenarioId]) {
            const first = createdProfiles.find((p) => String((p as any)?.ownerUserId ?? "") === String(deps.currentUserId)) as any;
            if (first?.id) selectedProfileByScenario[scenarioId] = String(first.id);
          }

          return { ...prev, profiles, selectedProfileByScenario } as any;
        });

        deps.setState({ isReady: true, db: mergedDbAfterProfiles as any });
      }

      const createdSheets: CharacterSheet[] = [];
      const rawSheets: any[] = Array.isArray(bundle.sheets) ? bundle.sheets : [];
      if (wantSheets && rawSheets.length > 0) {
        for (const sh of rawSheets) {
          const oldProfileId = String(sh?.profileId ?? sh?.ownerProfileId ?? "").trim();
          if (!oldProfileId) continue;

          const newProfileId = profileIdMap.get(oldProfileId) ?? "";
          if (!newProfileId) continue;

          const { profileId: _pid, ownerProfileId: _opid, scenarioId: _sid, ...patch } = (sh ?? {}) as any;

          const res = await apiFetch({
            path: `/profiles/${encodeURIComponent(newProfileId)}/character-sheet`,
            token,
            init: {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch ?? {}),
            },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Import failed (HTTP ${res.status})`;
            return { ok: false as const, error: msg };
          }

          const rawSheet = (res.json as any)?.sheet;
          const normalized: CharacterSheet = {
            ...(rawSheet ?? patch ?? {}),
            profileId: newProfileId,
            scenarioId,
          } as any;
          createdSheets.push(normalized);
        }
      }

      if (createdSheets.length > 0) {
        const nextDb = await updateDb((prev) => {
          const sheets = { ...((prev as any).sheets ?? {}) } as Record<string, CharacterSheet>;
          for (const sh of createdSheets) {
            const key = String((sh as any).profileId ?? "").trim();
            if (!key) continue;
            sheets[key] = sh as any;
          }
          return { ...(prev as any), sheets } as any;
        });
        deps.setState({ isReady: true, db: nextDb as any });
      }

      const createdPosts: Post[] = [];
      const postIdMap = new Map<string, string>();

      const rawPosts: any[] = Array.isArray(bundle.posts) ? bundle.posts : [];
      if (wantPosts && rawPosts.length > 0) {
        const postById = new Map<string, any>();
        for (const p of rawPosts) {
          const id = String(p?.id ?? "").trim();
          if (!id) continue;
          postById.set(id, p);
        }

        const depsMap = new Map<string, Set<string>>();
        const dependents = new Map<string, string[]>();

        for (const [id, p] of postById.entries()) {
          const set = new Set<string>();
          const parent = String(p?.parentPostId ?? "").trim();
          const quoted = String(p?.quotedPostId ?? "").trim();
          if (parent && postById.has(parent)) set.add(parent);
          if (quoted && postById.has(quoted)) set.add(quoted);
          depsMap.set(id, set);
          for (const d of set) {
            const arr = dependents.get(d) ?? [];
            arr.push(id);
            dependents.set(d, arr);
          }
        }

        const queue: string[] = [];
        for (const [id, set] of depsMap.entries()) {
          if (set.size === 0) queue.push(id);
        }

        const createdOrder: string[] = [];
        while (queue.length > 0) {
          const oldPostId = queue.shift()!;
          createdOrder.push(oldPostId);

          const kids = dependents.get(oldPostId) ?? [];
          for (const k of kids) {
            const s = depsMap.get(k);
            if (!s) continue;
            s.delete(oldPostId);
            if (s.size === 0) queue.push(k);
          }
        }

        for (const id of depsMap.keys()) {
          if (!createdOrder.includes(id)) createdOrder.push(id);
        }

        const pinnedOldIds = Array.isArray(sourceSettings?.pinnedPostIds) ? sourceSettings.pinnedPostIds.map(String).filter(Boolean) : [];

        for (const oldPostId of createdOrder) {
          const p = postById.get(oldPostId);
          if (!p) continue;

          const authorOld = String(p?.authorProfileId ?? "").trim();
          const authorNew = profileIdMap.get(authorOld) ?? "";
          if (!authorNew) {
            return { ok: false as const, error: `Missing imported author profile for post ${oldPostId}.` };
          }

          const parentOld = String(p?.parentPostId ?? "").trim();
          const quotedOld = String(p?.quotedPostId ?? "").trim();
          const parentNew = parentOld ? postIdMap.get(parentOld) ?? null : null;
          const quotedNew = quotedOld ? postIdMap.get(quotedOld) ?? null : null;

          const res = await apiFetch({
            path: `/scenarios/${encodeURIComponent(scenarioId)}/posts`,
            token,
            init: {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                authorProfileId: authorNew,
                text: String(p?.text ?? ""),
                imageUrls: Array.isArray(p?.imageUrls) ? p.imageUrls.map(String).filter(Boolean) : [],
                replyCount: p?.replyCount,
                repostCount: p?.repostCount,
                likeCount: p?.likeCount,
                parentPostId: parentNew,
                quotedPostId: quotedNew,
                insertedAt: p?.insertedAt,
                createdAt: p?.createdAt,
                postType: p?.postType,
                meta: p?.meta,
                isPinned: p?.isPinned,
                pinOrder: p?.pinOrder,
              }),
            },
          });

          if (!res.ok) {
            const msg =
              typeof (res.json as any)?.error === "string"
                ? String((res.json as any).error)
                : typeof res.text === "string" && res.text.trim().length
                  ? res.text
                  : `Import failed (HTTP ${res.status})`;
            return { ok: false as const, error: msg };
          }

          const rawCreated = (res.json as any)?.post;
          if (!rawCreated?.id) continue;

          const normalized = normalizePostFromServer(rawCreated, scenarioId);
          const newId = String((normalized as any).id);
          if (!newId) continue;

          postIdMap.set(oldPostId, newId);
          createdPosts.push(normalized);

          const seen = (deps.serverSeenPostsRef.current.byScenario[scenarioId] ??= {});
          seen[newId] = true;
        }

        if (pinnedOldIds.length > 0) {
          const mappedPinned = pinnedOldIds.map((oldId: string) => postIdMap.get(String(oldId)) ?? "").filter(Boolean);

          if (mappedPinned.length > 0) {
            const patchRes = await apiFetch({
              path: `/scenarios/${encodeURIComponent(scenarioId)}`,
              token,
              init: {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  settings: {
                    ...(settingsForCreate ?? {}),
                    pinnedPostIds: mappedPinned,
                  },
                }),
              },
            });

            if (patchRes.ok) {
              const rawSc = (patchRes.json as any)?.scenario;
              if (rawSc?.id) {
                const normalized = normalizeScenarioFromServer(rawSc);
                const nextDb = await updateDb((prev) => ({
                  ...prev,
                  scenarios: {
                    ...prev.scenarios,
                    [scenarioId]: {
                      ...(prev.scenarios as any)?.[scenarioId],
                      ...(normalized as any),
                    } as any,
                  },
                }));
                deps.setState({ isReady: true, db: nextDb as any });
              }
            }
          }
        }
      }

      if (createdPosts.length > 0) {
        const chunkSize = 250;
        for (let i = 0; i < createdPosts.length; i += chunkSize) {
          const chunk = createdPosts.slice(i, i + chunkSize);
          const nextDb = await updateDb((prev) => {
            const posts = { ...(prev.posts ?? {}) } as any;
            for (const p of chunk) posts[String((p as any).id)] = p as any;
            return { ...prev, posts } as any;
          });
          deps.setState({ isReady: true, db: nextDb as any });
        }
      }

      return {
        ok: true as const,
        scenarioId,
        importedProfiles: createdProfiles.length,
        importedPosts: createdPosts.length,
        importedSheets: createdSheets.length,
            renamedHandles: [],
      };
    }

    const res = importScenarioFromJson(picked.raw, {
      db,
      currentUserId: deps.currentUserId,
      includeProfiles: args.includeProfiles,
      includePosts: args.includePosts,
      includeReposts: args.includeReposts,
      includeSheets: args.includeSheets,
      forceNewScenarioId: true,
    });

    if (!res.ok) return res as any;

    await writeDb(res.nextDb);
    deps.setState({ isReady: true, db: res.nextDb });

    return {
      ok: true,
      scenarioId: res.imported.scenarioId,
      importedProfiles: res.imported.profiles,
      importedPosts: res.imported.posts,
      importedSheets: res.imported.sheets,
      renamedHandles: res.imported.renamedHandles,
    };
  };

  const exportScenarioToFile = async (args: {
    scenarioId: string;
    includeProfiles: boolean;
    includePosts: boolean;
    includeSheets: boolean;
  }): Promise<
    | { ok: true; uri: string; filename: string; counts: { profiles: number; posts: number; reposts: number; sheets: number } }
    | { ok: false; error: string }
  > => {
    try {
      const db = deps.getDb();
      if (!db) return { ok: false, error: "DB not ready" };

      const scope = {
        includeProfiles: args.includeProfiles,
        includePosts: args.includePosts,
        includeReposts: false,
        includeSheets: args.includeSheets,
      };

      const bundle = buildScenarioExportBundleV1(db, args.scenarioId, scope);

      const { uri, filename } = await saveAndShareScenarioExport(bundle);

      const counts = {
        profiles: bundle.profiles?.length ?? 0,
        posts: bundle.posts?.length ?? 0,
        reposts: bundle.reposts?.length ?? 0,
        sheets: bundle.sheets?.length ?? 0,
      };

      return { ok: true, uri, filename, counts };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  };

  const previewImportScenarioFromFile = async (args: {
    includeProfiles: boolean;
    includePosts: boolean;
    includeReposts: boolean;
    includeSheets: boolean;
  }): Promise<
    | {
        ok: true;
        fileName?: string;
        jsonBytes: number;
        preview: {
          willCreateNewScenarioId: true;
          importedProfiles: number;
          importedPosts: number;
          importedReposts: number;
          importedSheets: number;
          renamedHandles: Array<{ from: string; to: string }>;
          skipped: {
            profilesDueToLimit: number;
            postsDueToMissingProfile: number;
            repostsDueToMissingProfileOrPost: number;
            sheetsDueToMissingProfile: number;
          };
        };
      }
    | { ok: false; error: string }
  > => {
    const db = deps.getDb();
    if (!db) return { ok: false, error: "DB not ready" };
    if (!deps.currentUserId) return { ok: false, error: "Not signed in" };

    const picked = await pickScenarioExportJson();
    if (!picked.ok) return picked as any;

    deps.importPickCacheRef.current = {
      pickedAtMs: Date.now(),
      raw: picked.raw,
      jsonBytes: picked.jsonBytes,
      fileName: picked.fileName,
      uri: picked.uri,
    };

    const res = importScenarioFromJson(picked.raw, {
      db,
      currentUserId: deps.currentUserId,
      includeProfiles: args.includeProfiles,
      includePosts: args.includePosts,
      includeReposts: args.includeReposts,
      includeSheets: args.includeSheets,
      forceNewScenarioId: true,
    });

    if (!res.ok) return res as any;

    return {
      ok: true,
      fileName: picked.fileName,
      jsonBytes: picked.jsonBytes,
      preview: {
        willCreateNewScenarioId: true,
        importedProfiles: res.imported.profiles,
        importedPosts: res.imported.posts,
        importedReposts: res.imported.reposts,
        importedSheets: res.imported.sheets,
        renamedHandles: res.imported.renamedHandles,
        skipped: res.imported.skipped,
      },
    };
  };

  return {
    importScenarioFromFile,
    exportScenarioToFile,
    previewImportScenarioFromFile,
  };
}
