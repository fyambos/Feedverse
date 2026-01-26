import type { DbV5, Message, Post } from "@/data/db/schema";
import { queryHomePostsPageSync, queryProfileFeedPageSync } from "@/data/db/sqliteStore";
import { queryMessagesPageSync } from "@/data/db/sqliteCore";
import { hasAnyMedia } from "@/lib/utils/media";

type PostCursor = string; // `${insertedAt}|${id}`

type PostsPageArgs = {
  scenarioId: string;
  limit?: number;
  cursor?: PostCursor | null;
  filter?: (p: Post) => boolean;
  includeReplies?: boolean;
};

type PostsPageResult = {
  items: Post[];
  nextCursor: PostCursor | null;
};

export type ProfileFeedKind = "post" | "repost";

export type ProfileFeedItem = {
  kind: ProfileFeedKind;
  post: Post;
  activityAt: string;
  reposterProfileId?: string;
};

type FeedCursor = string; // `${activityAt}|${kind}|${postId}|${reposterId}`

type ProfileFeedPageArgs = {
  scenarioId: string;
  profileId: string;
  tab: "posts" | "media" | "replies" | "likes";
  limit?: number;
  cursor?: FeedCursor | null;
};

type ProfileFeedPageResult = {
  items: ProfileFeedItem[];
  nextCursor: FeedCursor | null;
};

type MessageCursor = string; // `${createdAt}|${id}`

type MessagesPageArgs = {
  scenarioId: string;
  conversationId: string;
  limit?: number;
  cursor?: MessageCursor | null;
};

type MessagesPageResult = {
  items: Message[];
  nextCursor: MessageCursor | null;
};

type Deps = {
  getDb: () => DbV5 | null;
  backendEnabled: boolean;
  isUuidLike: (id: string) => boolean;
  schedulePostsSync: (scenarioId: string) => void;
  getSeenPostsByScenario: (scenarioId: string) => Record<string, any>;
};

function makePostCursor(p: Post): PostCursor {
  return `${String((p as any).insertedAt ?? "")}|${String(p.id)}`;
}

function parsePostCursor(cursor: PostCursor): { insertedAt: string; id: string } | null {
  const raw = String(cursor ?? "").trim();
  if (!raw) return null;
  const parts = raw.split("|");
  if (parts.length < 2) return null;
  const insertedAt = String(parts[0] ?? "").trim();
  const id = String(parts[1] ?? "").trim();
  if (!insertedAt || !id) return null;
  return { insertedAt, id };
}

function sortDescByInsertedAtThenId(a: Post, b: Post) {
  const ta = String((a as any).insertedAt ?? (a as any).createdAt ?? "");
  const tb = String((b as any).insertedAt ?? (b as any).createdAt ?? "");
  const c = tb.localeCompare(ta);
  if (c !== 0) return c;
  return String((b as any).id).localeCompare(String((a as any).id));
}

function makeFeedCursor(item: ProfileFeedItem): FeedCursor {
  const rep = item.reposterProfileId ? String(item.reposterProfileId) : "";
  return `${String(item.activityAt)}|${String(item.kind)}|${String(item.post.id)}|${rep}`;
}

function getLikesMap(db: DbV5 | null): Record<string, any> {
  return ((db as any)?.likes ?? {}) as Record<string, any>;
}

export function createPagingApi(deps: Deps) {
  const listPostsPage = ({ scenarioId, limit = 15, cursor, filter, includeReplies = false }: PostsPageArgs): PostsPageResult => {
    const db = deps.getDb();
    if (!db) return { items: [], nextCursor: null };

    const sid = String(scenarioId);

    if (deps.backendEnabled && sid && !deps.isUuidLike(sid)) return { items: [], nextCursor: null };
    deps.schedulePostsSync(sid);

    // SQL-backed fast path when no arbitrary JS filter is needed.
    if (!filter) {
      try {
        return queryHomePostsPageSync({
          scenarioId: sid,
          limit,
          cursor: cursor ?? null,
          includeReplies,
          requireSeen: deps.backendEnabled,
        });
      } catch {
        // fall back to JS scan below
      }
    }

    let items = Object.values(db.posts).filter((p) => p.scenarioId === sid);

    if (deps.backendEnabled) {
      const seen = deps.getSeenPostsByScenario(sid);
      items = items.filter((p) => Boolean(seen[String((p as any)?.id ?? "")]));
    }

    if (!includeReplies) items = items.filter((p) => !p.parentPostId);
    if (filter) items = items.filter(filter);

    items.sort(sortDescByInsertedAtThenId);

    let startIndex = 0;
    if (cursor) {
      const idx = items.findIndex((p) => makePostCursor(p) === cursor);
      if (idx >= 0) {
        startIndex = idx + 1;
      } else {
        // If the cursor post is not present (e.g. data set changed), fall back to
        // an ordering-based lookup instead of restarting from the top.
        const cur = parsePostCursor(cursor);
        if (!cur) {
          startIndex = items.length;
        } else {
          const idx2 = items.findIndex((p) => {
            const t = String((p as any).insertedAt ?? (p as any).createdAt ?? "");
            const c = t.localeCompare(cur.insertedAt);
            if (c < 0) return true; // older
            if (c > 0) return false;
            return String(p.id).localeCompare(cur.id) < 0;
          });
          startIndex = idx2 >= 0 ? idx2 : items.length;
        }
      }
    }

    const page = items.slice(startIndex, startIndex + limit);
    const next = page.length === limit ? makePostCursor(page[page.length - 1]) : null;

    return { items: page, nextCursor: next };
  };

  const listProfileFeedPage = ({ scenarioId, profileId, tab, limit = 15, cursor }: ProfileFeedPageArgs): ProfileFeedPageResult => {
    const db = deps.getDb();
    if (!db) return { items: [], nextCursor: null };

    const sid = String(scenarioId);
    const pid = String(profileId);

    if (deps.backendEnabled && sid && !deps.isUuidLike(sid)) return { items: [], nextCursor: null };

    // SQL-backed fast path.
    try {
      return queryProfileFeedPageSync({
        scenarioId: sid,
        profileId: String(profileId),
        tab,
        limit,
        cursor: cursor ?? null,
        requireSeen: deps.backendEnabled,
      });
    } catch {
      // fall back to JS scan below
    }

    const seen = deps.backendEnabled ? deps.getSeenPostsByScenario(sid) : null;

    let posts = Object.values(db.posts).filter((p) => p.scenarioId === sid);
    if (seen) posts = posts.filter((p) => Boolean(seen[String((p as any)?.id ?? "")]));
    const authoredPosts = posts.filter((p) => String(p.authorProfileId) === pid);

    const repostEvents = Object.values((db as any).reposts ?? {}).filter(
      (r: any) => String(r.scenarioId) === sid && String(r.profileId) === pid,
    );

    const items: ProfileFeedItem[] = [];

    if (tab === "posts") {
      // Track post ids already represented as normal posts on this profile page.
      // This prevents returning the same post twice (post + repost) which breaks
      // your UI because ProfileScreen maps feed items -> it.post (FlatList key = post.id).
      const authoredPostIds = new Set<string>();

      for (const p of authoredPosts.filter((p) => !p.parentPostId)) {
        const postId = String(p.id);
        authoredPostIds.add(postId);

        items.push({
          kind: "post",
          post: p,
          activityAt: String(p.createdAt),
        });
      }

      for (const r of repostEvents) {
        const post = db.posts[String((r as any).postId)];
        if (!post) continue;
        if (post.parentPostId) continue;

        // allow reposting your own post in the DB,
        // but DO NOT return it as a separate feed item (avoids duplicate post.id rows)
        if (String(post.authorProfileId) === pid) continue;

        // extra safety: if somehow the post is already represented, don't duplicate it
        if (authoredPostIds.has(String(post.id))) continue;

        items.push({
          kind: "repost",
          post,
          activityAt: String((r as any).createdAt),
          reposterProfileId: pid,
        });
      }
    }

    if (tab === "media") {
      for (const p of authoredPosts.filter((p) => !p.parentPostId && hasAnyMedia(p))) {
        items.push({ kind: "post", post: p, activityAt: String(p.createdAt) });
      }
    }

    if (tab === "replies") {
      for (const p of authoredPosts.filter((p) => !!p.parentPostId)) {
        items.push({ kind: "post", post: p, activityAt: String(p.createdAt) });
      }
    }

    if (tab === "likes") {
      const likeEvents = Object.values(getLikesMap(db))
        .filter((v) => String((v as any).scenarioId) === String(scenarioId) && String((v as any).profileId) === String(profileId))
        .sort((a: any, b: any) => {
          const c = String(b.createdAt).localeCompare(String(a.createdAt));
          if (c !== 0) return c;
          return String(b.postId).localeCompare(String(a.postId));
        });

      for (const li of likeEvents) {
        const post = db.posts[String((li as any).postId)];
        if (!post) continue;
        items.push({
          kind: "post",
          post,
          activityAt: String((li as any).createdAt),
        });
      }
    }

    items.sort((a, b) => {
      const c = String(b.activityAt).localeCompare(String(a.activityAt));
      if (c !== 0) return c;
      const k = String(b.kind).localeCompare(String(a.kind));
      if (k !== 0) return k;
      return String(b.post.id).localeCompare(String(a.post.id));
    });

    let startIndex = 0;
    if (cursor) {
      const idx = items.findIndex((it) => makeFeedCursor(it) === cursor);
      startIndex = idx >= 0 ? idx + 1 : 0;
    }

    const page = items.slice(startIndex, startIndex + limit);
    const next = page.length === limit ? makeFeedCursor(page[page.length - 1]) : null;

    return { items: page, nextCursor: next };
  };

  const listMessagesPage = ({ scenarioId, conversationId, limit = 30, cursor }: MessagesPageArgs): MessagesPageResult => {
    const db = deps.getDb();
    if (!db) return { items: [], nextCursor: null };
    const sid = String(scenarioId);
    const cid = String(conversationId);
    const map = ((db as any).messages ?? {}) as Record<string, Message>;

    try {
      const res = queryMessagesPageSync({ scenarioId: sid, conversationId: cid, limit, cursor });
      return {
        items: res.items.map((m) => (map as any)?.[String((m as any).id ?? "")] ?? m),
        nextCursor: res.nextCursor,
      };
    } catch {
      return { items: [], nextCursor: null };
    }
  };

  return {
    listPostsPage,
    listProfileFeedPage,
    listMessagesPage,
  };
}
