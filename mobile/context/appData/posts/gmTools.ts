import type { Dispatch, SetStateAction } from "react";
import type { CharacterSheet, Post } from "@/data/db/schema";
import { updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";

// NOTE: These mirror the exported types in AppData, but are duplicated here
// to avoid circular imports (AppData imports this helper).
type GmApplySheetUpdateArgs = {
  scenarioId: string;
  gmProfileId: string;
  targetProfileIds: string[];
  patch: Partial<CharacterSheet>;
  label?: string;
};

type GmApplySheetUpdateResult = {
  postId: string;
  updatedProfileIds: string[];
  summaryText: string;
};

type AuthLike = {
  token?: string | null;
};

type ServerSeenPostsRef = {
  current: { byScenario: Record<string, Record<string, boolean>> };
};

type Deps = {
  setState: Dispatch<SetStateAction<any>>;
  auth: AuthLike;
  currentUserId: string;
  isUuidLike: (id: string) => boolean;
  isBackendMode: (token?: string | null) => boolean;
  serverSeenPostsRef: ServerSeenPostsRef;
};

// small util: diff shallow keys for GM post text
function diffShallow(prev: any, next: any): string[] {
  const lines: string[] = [];
  const keys = new Set<string>([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);

  const skip = new Set(["updatedAt", "createdAt", "profileId", "ownerProfileId", "id", "scenarioId"]);

  for (const k of Array.from(keys)) {
    if (skip.has(k)) continue;

    const a = (prev ?? {})[k];
    const b = (next ?? {})[k];

    const same =
      a === b ||
      (Number.isNaN(a) && Number.isNaN(b)) ||
      (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

    if (same) continue;

    // make short-ish readable output
    const aStr = typeof a === "string" ? a : a == null ? "—" : JSON.stringify(a);
    const bStr = typeof b === "string" ? b : b == null ? "—" : JSON.stringify(b);

    lines.push(`• ${k}: ${aStr} → ${bStr}`);
  }

  return lines;
}

export function createGmToolsApi(deps: Deps) {
  const gmApplySheetUpdate = async (args: GmApplySheetUpdateArgs): Promise<GmApplySheetUpdateResult> => {
    const sid = String(args?.scenarioId ?? "").trim();
    const gmId = String(args?.gmProfileId ?? "").trim();
    const targets = (args?.targetProfileIds ?? []).map(String).filter(Boolean);
    const patch = args?.patch;
    const label = args?.label;

    if (!sid) throw new Error("gmApplySheetUpdate: scenarioId is required");
    if (!gmId) throw new Error("gmApplySheetUpdate: gmProfileId is required");
    if (targets.length === 0) throw new Error("gmApplySheetUpdate: targetProfileIds is required");

    const now = new Date().toISOString();
    const postId = `gm_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    let summaryText = "";
    let updatedProfileIds: string[] = [];

    const nextDb = await updateDb((prev) => {
      const prevSheets = { ...((prev as any).sheets ?? {}) } as Record<string, CharacterSheet>;
      const profiles = { ...prev.profiles };

      const perTargetBlocks: string[] = [];

      for (const pid of targets) {
        const profile = profiles[String(pid)];
        if (!profile) continue;

        const existing = (prevSheets as any)[pid] ?? ({ profileId: pid, scenarioId: sid } as any);

        const nextSheet = {
          ...(existing ?? {}),
          ...(patch ?? {}),
          profileId: pid,
          scenarioId: sid,
          updatedAt: now,
          createdAt: (existing as any)?.createdAt ?? now,
        } as any;

        // write back
        prevSheets[pid] = nextSheet;
        updatedProfileIds.push(pid);

        // build diff lines
        const lines = diffShallow(existing, nextSheet);
        if (lines.length === 0) {
          perTargetBlocks.push(`@${String((profile as any).handle ?? pid)}: (no changes)`);
        } else {
          perTargetBlocks.push(`@${String((profile as any).handle ?? pid)}\n${lines.join("\n")}`);
        }
      }

      const targetHandles = updatedProfileIds
        .map((pid) => {
          const p = profiles[String(pid)];
          return p ? `@${String((p as any).handle ?? pid)}` : `@${pid}`;
        })
        .join(", ");

      summaryText =
        `⚙️ gm update${label ? ` — ${label}` : ""}\n` +
        `targets: ${targetHandles}\n\n` +
        perTargetBlocks.join("\n\n");

      const newPost: Post = {
        id: postId,
        scenarioId: sid,
        authorProfileId: gmId,
        authorUserId: String(deps.currentUserId ?? "").trim() || undefined,
        text: summaryText,
        createdAt: now,
        insertedAt: now,
      } as any;

      return {
        ...prev,
        sheets: prevSheets as any,
        posts: {
          ...prev.posts,
          [postId]: newPost as any,
        },
      };
    });

    deps.setState({ isReady: true, db: nextDb as any });

    // NOTE: summaryText / updatedProfileIds were set inside updateDb closure
    return { postId, updatedProfileIds, summaryText };
  };

  const gmCommitSheetAndPostText = async (args: {
    scenarioId: string;
    gmProfileId: string;
    targetProfileId: string;
    nextSheet: CharacterSheet;
    postText: string;
  }): Promise<{ postId: string }> => {
    const sid = String(args?.scenarioId ?? "").trim();
    const gmId = String(args?.gmProfileId ?? "").trim();
    const pid = String(args?.targetProfileId ?? "").trim();
    const nextSheet = args?.nextSheet;
    const postText = args?.postText;

    if (!sid) throw new Error("gmCommitSheetAndPostText: scenarioId is required");
    if (!gmId) throw new Error("gmCommitSheetAndPostText: gmProfileId is required");
    if (!pid) throw new Error("gmCommitSheetAndPostText: targetProfileId is required");

    const now = new Date().toISOString();
    const postId = `gm_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const token = String(deps.auth.token ?? "").trim();

    // In backend mode, local-only posts are filtered out of the feed.
    // So we must persist both the sheet + recap post to the API.
    if (deps.isBackendMode(token) && token) {
      if (!deps.isUuidLike(sid)) throw new Error("Invalid scenarioId for backend mode");
      if (!deps.isUuidLike(gmId)) throw new Error("Pick a valid GM profile before posting.");

      // 1) Save sheet
      const sheetRes = await apiFetch({
        path: `/profiles/${encodeURIComponent(pid)}/character-sheet`,
        token,
        init: {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(nextSheet ?? {}), profileId: pid, scenarioId: sid }),
        },
      });

      if (!sheetRes.ok) {
        const msg =
          typeof (sheetRes.json as any)?.error === "string"
            ? String((sheetRes.json as any).error)
            : typeof sheetRes.text === "string" && sheetRes.text.trim().length
              ? sheetRes.text
              : `Save failed (HTTP ${sheetRes.status})`;
        throw new Error(msg);
      }

      const rawSheet = (sheetRes.json as any)?.sheet ?? null;

      // 2) Create GM recap post
      const postRes = await apiFetch({
        path: `/scenarios/${encodeURIComponent(sid)}/posts`,
        token,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: postId,
            authorProfileId: gmId,
            text: String(postText ?? ""),
            createdAt: now,
            insertedAt: now,
            postType: "gm",
          }),
        },
      });

      if (!postRes.ok) {
        const msg =
          typeof (postRes.json as any)?.error === "string"
            ? String((postRes.json as any).error)
            : typeof postRes.text === "string" && postRes.text.trim().length
              ? postRes.text
              : `Save failed (HTTP ${postRes.status})`;
        throw new Error(msg);
      }

      const rawPost = (postRes.json as any)?.post ?? null;
      const createdAtIso = rawPost?.createdAt
        ? new Date(rawPost.createdAt).toISOString()
        : rawPost?.created_at
          ? new Date(rawPost.created_at).toISOString()
          : now;
      const insertedAtIso = rawPost?.insertedAt
        ? new Date(rawPost.insertedAt).toISOString()
        : rawPost?.inserted_at
          ? new Date(rawPost.inserted_at).toISOString()
          : now;

      // Mark as server-seen so it appears immediately in backend mode.
      const seen = (deps.serverSeenPostsRef.current.byScenario[sid] ??= {});
      seen[String(rawPost?.id ?? postId)] = true;

      const nextDb = await updateDb((prev) => {
        const sheets = { ...((prev as any).sheets ?? {}) } as Record<string, CharacterSheet>;
        const posts = { ...(prev.posts ?? {}) } as any;

        const existingSheet = (sheets as any)[pid] ?? ({ profileId: pid, scenarioId: sid } as any);
        const createdAtLocal = (existingSheet as any)?.createdAt ?? now;

        // Merge in server sheet if present, otherwise fall back to nextSheet.
        const mergedSheet: CharacterSheet = {
          ...(existingSheet ?? {}),
          ...(nextSheet ?? {}),
          ...(rawSheet ?? {}),
          profileId: pid,
          scenarioId: sid,
          createdAt: (rawSheet as any)?.createdAt
            ? new Date((rawSheet as any).createdAt).toISOString()
            : (rawSheet as any)?.created_at
              ? new Date((rawSheet as any).created_at).toISOString()
              : createdAtLocal,
          updatedAt: (rawSheet as any)?.updatedAt
            ? new Date((rawSheet as any).updatedAt).toISOString()
            : (rawSheet as any)?.updated_at
              ? new Date((rawSheet as any).updated_at).toISOString()
              : now,
        } as any;

        sheets[pid] = mergedSheet as any;

        const finalPostId = String(rawPost?.id ?? postId);
        posts[finalPostId] = {
          ...(posts[finalPostId] ?? {}),
          id: finalPostId,
          scenarioId: String(rawPost?.scenarioId ?? rawPost?.scenario_id ?? sid),
          authorProfileId: String(rawPost?.authorProfileId ?? rawPost?.author_profile_id ?? gmId),
          authorUserId: String(rawPost?.authorUserId ?? rawPost?.author_user_id ?? deps.currentUserId ?? "").trim() || undefined,
          text: String(rawPost?.text ?? postText ?? ""),
          createdAt: createdAtIso,
          insertedAt: insertedAtIso,
          updatedAt: rawPost?.updatedAt
            ? new Date(rawPost.updatedAt).toISOString()
            : rawPost?.updated_at
              ? new Date(rawPost.updated_at).toISOString()
              : now,
          postType: rawPost?.postType ?? rawPost?.post_type ?? "gm",
          meta: rawPost?.meta,
          isPinned: rawPost?.isPinned ?? rawPost?.is_pinned,
          pinOrder: rawPost?.pinOrder ?? rawPost?.pin_order,
        } as any;

        return { ...prev, sheets: sheets as any, posts } as any;
      });

      deps.setState({ isReady: true, db: nextDb as any });
      return { postId: String(rawPost?.id ?? postId) };
    }

    const nextDb = await updateDb((prev) => {
      const prevSheets = { ...((prev as any).sheets ?? {}) } as Record<string, CharacterSheet>;
      const existing = (prevSheets as any)[pid] ?? ({ profileId: pid, scenarioId: sid } as any);

      const createdAt = (existing as any)?.createdAt ?? now;

      const savedSheet: CharacterSheet = {
        ...(existing ?? {}),
        ...(nextSheet ?? {}),
        profileId: pid,
        scenarioId: sid,
        createdAt,
        updatedAt: now,
      } as any;

      prevSheets[pid] = savedSheet as any;

      const newPost: Post = {
        id: postId,
        scenarioId: sid,
        authorProfileId: gmId,
        authorUserId: String(deps.currentUserId ?? "").trim() || undefined,
        text: String(postText ?? ""),
        createdAt: now,
        insertedAt: now,
      } as any;

      return {
        ...prev,
        sheets: prevSheets as any,
        posts: {
          ...prev.posts,
          [postId]: newPost as any,
        },
      };
    });

    deps.setState({ isReady: true, db: nextDb as any });
    return { postId };
  };

  return { gmApplySheetUpdate, gmCommitSheetAndPostText };
}
