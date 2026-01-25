import { InteractionManager } from "react-native";
import * as SQLite from "expo-sqlite";

import type { DbV5, Like, Post, Repost } from "./schema";

const SQLITE_DB_NAME = "feedverse_v6.db";

let dbAsyncPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let dbSync: SQLite.SQLiteDatabase | null = null;

let schemaInitAsync: Promise<void> | null = null;
let schemaInitSync = false;

function encodeBool(v: any): number | null {
	if (v == null) return null;
	return v ? 1 : 0;
}

function decodeBool(v: any): boolean | undefined {
	if (v == null) return undefined;
	return Boolean(Number(v));
}

function decodeOptionalInt(v: any): number | undefined {
	if (v == null) return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}

function normalizeInsertedAt(p: any): string {
	return String(p?.insertedAt ?? p?.createdAt ?? "");
}

function hasAnyMedia(p: any) {
	const urls = p?.imageUrls;
	if (Array.isArray(urls) && urls.length > 0) return true;
	const single = p?.imageUrl;
	if (typeof single === "string" && single.length > 0) return true;
	const media = p?.media;
	if (Array.isArray(media) && media.length > 0) return true;
	return false;
}

function postFromRow(row: any): Post {
	const postType = row.postType != null ? String(row.postType) : undefined;
	let meta: any = undefined;
	// Avoid parsing meta for most posts; only parse when present.
	if (row.metaJson != null && String(row.metaJson).length > 0) {
		try {
			meta = JSON.parse(String(row.metaJson));
		} catch {
			meta = undefined;
		}
	}

	const p: Post = {
		id: String(row.id),
		scenarioId: String(row.scenarioId),
		authorProfileId: String(row.authorProfileId),
		text: String(row.text ?? ""),
		createdAt: String(row.createdAt),
		insertedAt: String(row.insertedAt),
		...(row.authorUserId ? { authorUserId: String(row.authorUserId) } : {}),
		...(row.updatedAt ? { updatedAt: String(row.updatedAt) } : {}),
		...(row.parentPostId ? { parentPostId: String(row.parentPostId) } : {}),
		...(row.quotedPostId ? { quotedPostId: String(row.quotedPostId) } : {}),
		...(postType ? { postType: postType as any } : {}),
		...(decodeOptionalInt(row.replyCount) != null ? { replyCount: decodeOptionalInt(row.replyCount) } : {}),
		...(decodeOptionalInt(row.repostCount) != null ? { repostCount: decodeOptionalInt(row.repostCount) } : {}),
		...(decodeOptionalInt(row.likeCount) != null ? { likeCount: decodeOptionalInt(row.likeCount) } : {}),
		...(decodeBool(row.isPinned) != null ? { isPinned: decodeBool(row.isPinned) } : {}),
		...(decodeOptionalInt(row.pinOrder) != null ? { pinOrder: decodeOptionalInt(row.pinOrder) } : {}),
		...(meta !== undefined ? { meta } : {}),
	};

	return p;
}

function hydratePostImagesSync(db: SQLite.SQLiteDatabase, posts: Post[]): void {
	if (!posts.length) return;
	const ids = posts.map((p) => p.id);
	const placeholders = ids.map(() => "?").join(",");
	const sql = `SELECT postId, idx, url FROM post_images WHERE postId IN (${placeholders}) ORDER BY postId ASC, idx ASC;`;
	let rows: Array<{ postId: string; idx: number; url: string }> = [];
	try {
		rows = db.getAllSync(sql, ids) as any;
	} catch {
		rows = [];
	}
	const map = new Map<string, string[]>();
	for (const r of rows) {
		const pid = String((r as any).postId);
		const url = String((r as any).url);
		if (!pid || !url) continue;
		const arr = map.get(pid) ?? [];
		arr.push(url);
		map.set(pid, arr);
	}
	for (const p of posts) {
		const urls = map.get(p.id);
		if (urls && urls.length > 0) {
			(p as any).imageUrls = urls;
		}
	}
}

function getDbSync(): SQLite.SQLiteDatabase {
	if (!dbSync) {
		dbSync = SQLite.openDatabaseSync(SQLITE_DB_NAME);
	}
	return dbSync;
}

async function getDbAsync(): Promise<SQLite.SQLiteDatabase> {
	if (!dbAsyncPromise) {
		dbAsyncPromise = SQLite.openDatabaseAsync(SQLITE_DB_NAME);
	}
	return dbAsyncPromise;
}

function ensureSchemaSync(): void {
	if (schemaInitSync) return;
	const db = getDbSync();
	// Pragmas: favor UI responsiveness.
	try {
		db.execSync("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;");
	} catch {
		// ignore
	}

	db.execSync(`
		CREATE TABLE IF NOT EXISTS kv (
			key TEXT PRIMARY KEY NOT NULL,
			value TEXT NOT NULL,
			updatedAt INTEGER
		);

		CREATE TABLE IF NOT EXISTS posts (
			id TEXT PRIMARY KEY NOT NULL,
			scenarioId TEXT NOT NULL,
			authorProfileId TEXT NOT NULL,
			authorUserId TEXT,
			text TEXT NOT NULL DEFAULT '',
			createdAt TEXT NOT NULL,
			insertedAt TEXT NOT NULL,
			updatedAt TEXT,
			replyCount INTEGER,
			repostCount INTEGER,
			likeCount INTEGER,
			parentPostId TEXT,
			quotedPostId TEXT,
			postType TEXT,
			isPinned INTEGER,
			pinOrder INTEGER,
			hasMedia INTEGER NOT NULL DEFAULT 0,
			metaJson TEXT
		);

		CREATE TABLE IF NOT EXISTS post_images (
			postId TEXT NOT NULL,
			idx INTEGER NOT NULL,
			url TEXT NOT NULL,
			PRIMARY KEY (postId, idx)
		);
		CREATE INDEX IF NOT EXISTS idx_post_images_post_idx ON post_images (postId, idx);

		CREATE INDEX IF NOT EXISTS idx_posts_scenario_inserted ON posts (scenarioId, insertedAt DESC, id DESC);
		CREATE INDEX IF NOT EXISTS idx_posts_scenario_author_created ON posts (scenarioId, authorProfileId, createdAt DESC, id DESC);
		CREATE INDEX IF NOT EXISTS idx_posts_parent_created ON posts (parentPostId, createdAt ASC, id ASC);

		CREATE TABLE IF NOT EXISTS likes (
			scenarioId TEXT NOT NULL,
			profileId TEXT NOT NULL,
			postId TEXT NOT NULL,
			createdAt TEXT NOT NULL,
			id TEXT,
			PRIMARY KEY (scenarioId, profileId, postId)
		);

		CREATE INDEX IF NOT EXISTS idx_likes_profile_created ON likes (scenarioId, profileId, createdAt DESC, postId DESC);

		CREATE TABLE IF NOT EXISTS reposts (
			scenarioId TEXT NOT NULL,
			profileId TEXT NOT NULL,
			postId TEXT NOT NULL,
			createdAt TEXT NOT NULL,
			id TEXT,
			PRIMARY KEY (scenarioId, profileId, postId)
		);

		CREATE INDEX IF NOT EXISTS idx_reposts_profile_created ON reposts (scenarioId, profileId, createdAt DESC, postId DESC);

		-- Session-ish "seen" tracker for backend mode filtering parity.
		CREATE TABLE IF NOT EXISTS seen_posts (
			scenarioId TEXT NOT NULL,
			postId TEXT NOT NULL,
			PRIMARY KEY (scenarioId, postId)
		);

		CREATE INDEX IF NOT EXISTS idx_seen_posts_scenario_post ON seen_posts (scenarioId, postId);
	`);

	// Best-effort: let SQLite update internal stats/plans.
	try {
		db.execSync("PRAGMA optimize;");
	} catch {
		// ignore
	}

	schemaInitSync = true;
}

async function ensureSchemaAsync(): Promise<void> {
	if (schemaInitAsync) return schemaInitAsync;
	schemaInitAsync = (async () => {
		const db = await getDbAsync();
		try {
			await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;");
		} catch {
			// ignore
		}
		try {
			await db.execAsync("PRAGMA busy_timeout = 5000;");
		} catch {
			// ignore
		}
		await db.execAsync(`
			CREATE TABLE IF NOT EXISTS kv (
				key TEXT PRIMARY KEY NOT NULL,
				value TEXT NOT NULL,
				updatedAt INTEGER
			);

			CREATE TABLE IF NOT EXISTS posts (
				id TEXT PRIMARY KEY NOT NULL,
				scenarioId TEXT NOT NULL,
				authorProfileId TEXT NOT NULL,
				authorUserId TEXT,
				text TEXT NOT NULL DEFAULT '',
				createdAt TEXT NOT NULL,
				insertedAt TEXT NOT NULL,
				updatedAt TEXT,
				replyCount INTEGER,
				repostCount INTEGER,
				likeCount INTEGER,
				parentPostId TEXT,
				quotedPostId TEXT,
				postType TEXT,
				isPinned INTEGER,
				pinOrder INTEGER,
				hasMedia INTEGER NOT NULL DEFAULT 0,
				metaJson TEXT
			);

			CREATE TABLE IF NOT EXISTS post_images (
				postId TEXT NOT NULL,
				idx INTEGER NOT NULL,
				url TEXT NOT NULL,
				PRIMARY KEY (postId, idx)
			);
			CREATE INDEX IF NOT EXISTS idx_post_images_post_idx ON post_images (postId, idx);

			CREATE INDEX IF NOT EXISTS idx_posts_scenario_inserted ON posts (scenarioId, insertedAt DESC, id DESC);
			CREATE INDEX IF NOT EXISTS idx_posts_scenario_author_created ON posts (scenarioId, authorProfileId, createdAt DESC, id DESC);
			CREATE INDEX IF NOT EXISTS idx_posts_parent_created ON posts (parentPostId, createdAt ASC, id ASC);

			CREATE TABLE IF NOT EXISTS likes (
				scenarioId TEXT NOT NULL,
				profileId TEXT NOT NULL,
				postId TEXT NOT NULL,
				createdAt TEXT NOT NULL,
				id TEXT,
				PRIMARY KEY (scenarioId, profileId, postId)
			);

			CREATE INDEX IF NOT EXISTS idx_likes_profile_created ON likes (scenarioId, profileId, createdAt DESC, postId DESC);

			CREATE TABLE IF NOT EXISTS reposts (
				scenarioId TEXT NOT NULL,
				profileId TEXT NOT NULL,
				postId TEXT NOT NULL,
				createdAt TEXT NOT NULL,
				id TEXT,
				PRIMARY KEY (scenarioId, profileId, postId)
			);

			CREATE INDEX IF NOT EXISTS idx_reposts_profile_created ON reposts (scenarioId, profileId, createdAt DESC, postId DESC);

			CREATE TABLE IF NOT EXISTS seen_posts (
				scenarioId TEXT NOT NULL,
				postId TEXT NOT NULL,
				PRIMARY KEY (scenarioId, postId)
			);

			CREATE INDEX IF NOT EXISTS idx_seen_posts_scenario_post ON seen_posts (scenarioId, postId);
		`);

		try {
			await db.execAsync("PRAGMA optimize;");
		} catch {
			// ignore
		}
	})();
	return schemaInitAsync;
}

// Local SQLite is a bounded cache (server is the source of truth).
const MAX_POSTS_PER_SCENARIO = 1500;
const MAX_POSTS_TOTAL = 8000;
const MAX_LIKES_PER_SCENARIO = 12000;
const MAX_REPOSTS_PER_SCENARIO = 12000;

function uniqNonEmptyStrings(values: string[]): string[] {
	const set = new Set<string>();
	for (const v of values ?? []) {
		const s = String(v ?? "").trim();
		if (s) set.add(s);
	}
	return Array.from(set);
}

async function pruneFeedCacheTxn(txn: any, scenarioIds: string[]): Promise<void> {
	const scenarioList = uniqNonEmptyStrings(scenarioIds);

	// Prune posts per scenario.
	for (const sid of scenarioList) {
		await txn.runAsync(
			"DELETE FROM posts WHERE scenarioId = ? AND id IN (SELECT id FROM posts WHERE scenarioId = ? ORDER BY insertedAt DESC, id DESC LIMIT -1 OFFSET ?);",
			[sid, sid, MAX_POSTS_PER_SCENARIO],
		);
	}

	// Global cap just in case.
	await txn.runAsync(
		"DELETE FROM posts WHERE id IN (SELECT id FROM posts ORDER BY insertedAt DESC, id DESC LIMIT -1 OFFSET ?);",
		[MAX_POSTS_TOTAL],
	);

	// Keep aux tables in sync with retained posts.
	await txn.execAsync("DELETE FROM post_images WHERE postId NOT IN (SELECT id FROM posts);");
	await txn.execAsync("DELETE FROM likes WHERE postId NOT IN (SELECT id FROM posts);");
	await txn.execAsync("DELETE FROM reposts WHERE postId NOT IN (SELECT id FROM posts);");
	await txn.execAsync("DELETE FROM seen_posts WHERE postId NOT IN (SELECT id FROM posts);");

	// Cap likes/reposts volume per scenario (cheap bounded cache).
	for (const sid of scenarioList) {
		await txn.runAsync(
			"DELETE FROM likes WHERE scenarioId = ? AND rowid IN (SELECT rowid FROM likes WHERE scenarioId = ? ORDER BY createdAt DESC, postId DESC LIMIT -1 OFFSET ?);",
			[sid, sid, MAX_LIKES_PER_SCENARIO],
		);
		await txn.runAsync(
			"DELETE FROM reposts WHERE scenarioId = ? AND rowid IN (SELECT rowid FROM reposts WHERE scenarioId = ? ORDER BY createdAt DESC, postId DESC LIMIT -1 OFFSET ?);",
			[sid, sid, MAX_REPOSTS_PER_SCENARIO],
		);
	}
}

export async function rebuildFeedIndexFromDbAsync(dbSnapshot: DbV5): Promise<void> {
	await ensureSchemaAsync();
	const db = await getDbAsync();

	const posts = Object.values(dbSnapshot.posts ?? {});
	const likes = Object.values((dbSnapshot as any).likes ?? {}) as Like[];
	const reposts = Object.values((dbSnapshot as any).reposts ?? {}) as Repost[];

	// Run after interactions: potentially large write.
	await new Promise<void>((resolve) => {
		InteractionManager.runAfterInteractions(() => resolve());
	});

	await db.withExclusiveTransactionAsync(async (txn) => {
		await txn.execAsync("DELETE FROM posts; DELETE FROM likes; DELETE FROM reposts; DELETE FROM seen_posts;");
		await txn.execAsync("DELETE FROM post_images;");

		for (const p of posts) {
			const id = String((p as any)?.id ?? "").trim();
			if (!id) continue;
			const scenarioId = String((p as any)?.scenarioId ?? "").trim();
			if (!scenarioId) continue;

			const createdAt = String((p as any)?.createdAt ?? "");
			const insertedAt = normalizeInsertedAt(p);
			const authorProfileId = String((p as any)?.authorProfileId ?? "").trim();
			if (!authorProfileId) continue;
			const parentPostId = (p as any)?.parentPostId != null ? String((p as any).parentPostId) : null;
			const hasMediaInt = hasAnyMedia(p) ? 1 : 0;
			const metaJson = (p as any)?.meta != null ? JSON.stringify((p as any).meta) : null;

			await txn.runAsync(
				"INSERT OR REPLACE INTO posts (id, scenarioId, authorProfileId, authorUserId, text, createdAt, insertedAt, updatedAt, replyCount, repostCount, likeCount, parentPostId, quotedPostId, postType, isPinned, pinOrder, hasMedia, metaJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
				[
					id,
					scenarioId,
					authorProfileId,
					String((p as any)?.authorUserId ?? "") || null,
					String((p as any)?.text ?? ""),
					createdAt,
					insertedAt,
					String((p as any)?.updatedAt ?? "") || null,
					(p as any)?.replyCount ?? null,
					(p as any)?.repostCount ?? null,
					(p as any)?.likeCount ?? null,
					parentPostId,
					String((p as any)?.quotedPostId ?? "") || null,
					String((p as any)?.postType ?? "") || null,
					encodeBool((p as any)?.isPinned),
					(p as any)?.pinOrder ?? null,
					hasMediaInt,
					metaJson,
				],
			);

			// images
			const urls = Array.isArray((p as any)?.imageUrls) ? ((p as any).imageUrls as any[]) : [];
			if (urls.length > 0) {
				for (let idx = 0; idx < urls.length; idx++) {
					const url = String(urls[idx] ?? "").trim();
					if (!url) continue;
					await txn.runAsync("INSERT OR REPLACE INTO post_images (postId, idx, url) VALUES (?, ?, ?);", [id, idx, url]);
				}
			}
		}

		for (const li of likes) {
			const scenarioId = String((li as any)?.scenarioId ?? "").trim();
			const profileId = String((li as any)?.profileId ?? "").trim();
			const postId = String((li as any)?.postId ?? "").trim();
			if (!scenarioId || !profileId || !postId) continue;

			await txn.runAsync(
				"INSERT OR REPLACE INTO likes (scenarioId, profileId, postId, createdAt, id) VALUES (?, ?, ?, ?, ?);",
				[scenarioId, profileId, postId, String((li as any)?.createdAt ?? ""), String((li as any)?.id ?? "") || null],
			);
		}

		for (const r of reposts) {
			const scenarioId = String((r as any)?.scenarioId ?? "").trim();
			const profileId = String((r as any)?.profileId ?? "").trim();
			const postId = String((r as any)?.postId ?? "").trim();
			if (!scenarioId || !profileId || !postId) continue;

			await txn.runAsync(
				"INSERT OR REPLACE INTO reposts (scenarioId, profileId, postId, createdAt, id) VALUES (?, ?, ?, ?, ?);",
				[scenarioId, profileId, postId, String((r as any)?.createdAt ?? ""), String((r as any)?.id ?? "") || null],
			);
		}

		await pruneFeedCacheTxn(
			txn,
			posts.map((p) => String((p as any)?.scenarioId ?? "")),
		);
	});

	// Make sure sync side sees schema too.
	try {
		ensureSchemaSync();
	} catch {
		// ignore
	}
}

export async function clearSeenPostsAsync(): Promise<void> {
	await ensureSchemaAsync();
	const db = await getDbAsync();
	await db.runAsync("DELETE FROM seen_posts;");
}

export async function markSeenPostsAsync(scenarioId: string, postIds: string[]): Promise<void> {
	const sid = String(scenarioId ?? "").trim();
	const ids = Array.isArray(postIds) ? postIds.map(String).map((s) => s.trim()).filter(Boolean) : [];
	if (!sid || ids.length === 0) return;

	await ensureSchemaAsync();
	const db = await getDbAsync();

	await db.withExclusiveTransactionAsync(async (txn) => {
		for (const id of ids) {
			await txn.runAsync("INSERT OR REPLACE INTO seen_posts (scenarioId, postId) VALUES (?, ?);", [sid, id]);
		}
	});
}

export async function upsertPostsAsync(items: Post[]): Promise<void> {
	if (!items?.length) return;
	await ensureSchemaAsync();
	const db = await getDbAsync();

	await db.withExclusiveTransactionAsync(async (txn) => {
		for (const p of items) {
			const id = String((p as any)?.id ?? "").trim();
			if (!id) continue;
			const scenarioId = String((p as any)?.scenarioId ?? "").trim();
			if (!scenarioId) continue;

			const createdAt = String((p as any)?.createdAt ?? "");
			const insertedAt = normalizeInsertedAt(p);
			const authorProfileId = String((p as any)?.authorProfileId ?? "").trim();
			if (!authorProfileId) continue;
			const parentPostId = (p as any)?.parentPostId != null ? String((p as any).parentPostId) : null;
			const hasMediaInt = hasAnyMedia(p) ? 1 : 0;
			const metaJson = (p as any)?.meta != null ? JSON.stringify((p as any).meta) : null;

			await txn.runAsync(
				"INSERT OR REPLACE INTO posts (id, scenarioId, authorProfileId, authorUserId, text, createdAt, insertedAt, updatedAt, replyCount, repostCount, likeCount, parentPostId, quotedPostId, postType, isPinned, pinOrder, hasMedia, metaJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
				[
					id,
					scenarioId,
					authorProfileId,
					String((p as any)?.authorUserId ?? "") || null,
					String((p as any)?.text ?? ""),
					createdAt,
					insertedAt,
					String((p as any)?.updatedAt ?? "") || null,
					(p as any)?.replyCount ?? null,
					(p as any)?.repostCount ?? null,
					(p as any)?.likeCount ?? null,
					parentPostId,
					String((p as any)?.quotedPostId ?? "") || null,
					String((p as any)?.postType ?? "") || null,
					encodeBool((p as any)?.isPinned),
					(p as any)?.pinOrder ?? null,
					hasMediaInt,
					metaJson,
				],
			);

			await txn.runAsync("DELETE FROM post_images WHERE postId = ?;", [id]);
			const urls = Array.isArray((p as any)?.imageUrls) ? ((p as any).imageUrls as any[]) : [];
			if (urls.length > 0) {
				for (let idx = 0; idx < urls.length; idx++) {
					const url = String(urls[idx] ?? "").trim();
					if (!url) continue;
					await txn.runAsync("INSERT OR REPLACE INTO post_images (postId, idx, url) VALUES (?, ?, ?);", [id, idx, url]);
				}
			}
		}

		await pruneFeedCacheTxn(
			txn,
			items.map((p) => String((p as any)?.scenarioId ?? "")),
		);
	});
}

export async function deletePostCascadeAsync(postId: string): Promise<void> {
	const pid = String(postId ?? "").trim();
	if (!pid) return;
	await ensureSchemaAsync();
	const db = await getDbAsync();

	await db.withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync("DELETE FROM posts WHERE id = ?;", [pid]);
		await txn.runAsync("DELETE FROM post_images WHERE postId = ?;", [pid]);
		await txn.runAsync("DELETE FROM likes WHERE postId = ?;", [pid]);
		await txn.runAsync("DELETE FROM reposts WHERE postId = ?;", [pid]);
		await txn.runAsync("DELETE FROM seen_posts WHERE postId = ?;", [pid]);
	});
}

export async function mergeRepostsAsync(items: Repost[]): Promise<void> {
	if (!items?.length) return;
	await ensureSchemaAsync();
	const db = await getDbAsync();

	await db.withExclusiveTransactionAsync(async (txn) => {
		for (const r of items) {
			const scenarioId = String((r as any)?.scenarioId ?? "").trim();
			const profileId = String((r as any)?.profileId ?? "").trim();
			const postId = String((r as any)?.postId ?? "").trim();
			if (!scenarioId || !profileId || !postId) continue;

			await txn.runAsync(
				"INSERT OR REPLACE INTO reposts (scenarioId, profileId, postId, createdAt, id) VALUES (?, ?, ?, ?, ?);",
				[scenarioId, profileId, postId, String((r as any)?.createdAt ?? ""), String((r as any)?.id ?? "") || null],
			);
		}

		await pruneFeedCacheTxn(
			txn,
			items.map((r) => String((r as any)?.scenarioId ?? "")),
		);
	});
}

export async function replaceScenarioRepostsAsync(scenarioId: string, items: Repost[]): Promise<void> {
	const sid = String(scenarioId ?? "").trim();
	if (!sid) return;
	await ensureSchemaAsync();
	const db = await getDbAsync();

	await db.withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync("DELETE FROM reposts WHERE scenarioId = ?;", [sid]);
		for (const r of items ?? []) {
			const profileId = String((r as any)?.profileId ?? "").trim();
			const postId = String((r as any)?.postId ?? "").trim();
			if (!profileId || !postId) continue;

			await txn.runAsync(
				"INSERT OR REPLACE INTO reposts (scenarioId, profileId, postId, createdAt, id) VALUES (?, ?, ?, ?, ?);",
				[sid, profileId, postId, String((r as any)?.createdAt ?? ""), String((r as any)?.id ?? "") || null],
			);
		}
	});
}

export async function upsertRepostsAsync(items: Repost[]): Promise<void> {
	return mergeRepostsAsync(items);
}

export async function deleteRepostAsync(scenarioId: string, profileId: string, postId: string): Promise<void> {
	const sid = String(scenarioId ?? "").trim();
	const pid = String(profileId ?? "").trim();
	const poid = String(postId ?? "").trim();
	if (!sid || !pid || !poid) return;
	await ensureSchemaAsync();
	const db = await getDbAsync();
	await db.runAsync("DELETE FROM reposts WHERE scenarioId = ? AND profileId = ? AND postId = ?;", [sid, pid, poid]);
}

export async function replaceScenarioLikesAsync(scenarioId: string, items: Like[]): Promise<void> {
	const sid = String(scenarioId ?? "").trim();
	if (!sid) return;
	await ensureSchemaAsync();
	const db = await getDbAsync();

	await db.withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync("DELETE FROM likes WHERE scenarioId = ?;", [sid]);
		for (const li of items ?? []) {
			const profileId = String((li as any)?.profileId ?? "").trim();
			const postId = String((li as any)?.postId ?? "").trim();
			if (!profileId || !postId) continue;

			await txn.runAsync(
				"INSERT OR REPLACE INTO likes (scenarioId, profileId, postId, createdAt, id) VALUES (?, ?, ?, ?, ?);",
				[sid, profileId, postId, String((li as any)?.createdAt ?? ""), String((li as any)?.id ?? "") || null],
			);
		}

		await pruneFeedCacheTxn(txn, [sid]);
	});
}

export async function upsertLikesAsync(items: Like[]): Promise<void> {
	if (!items?.length) return;
	await ensureSchemaAsync();
	const db = await getDbAsync();

	await db.withExclusiveTransactionAsync(async (txn) => {
		for (const li of items) {
			const scenarioId = String((li as any)?.scenarioId ?? "").trim();
			const profileId = String((li as any)?.profileId ?? "").trim();
			const postId = String((li as any)?.postId ?? "").trim();
			if (!scenarioId || !profileId || !postId) continue;

			await txn.runAsync(
				"INSERT OR REPLACE INTO likes (scenarioId, profileId, postId, createdAt, id) VALUES (?, ?, ?, ?, ?);",
				[scenarioId, profileId, postId, String((li as any)?.createdAt ?? ""), String((li as any)?.id ?? "") || null],
			);
		}
	});
}

export async function deleteLikeAsync(scenarioId: string, profileId: string, postId: string): Promise<void> {
	const sid = String(scenarioId ?? "").trim();
	const pid = String(profileId ?? "").trim();
	const poid = String(postId ?? "").trim();
	if (!sid || !pid || !poid) return;
	await ensureSchemaAsync();
	const db = await getDbAsync();
	await db.runAsync("DELETE FROM likes WHERE scenarioId = ? AND profileId = ? AND postId = ?;", [sid, pid, poid]);
}

export function getFeedIndexCountsSync(): { posts: number; likes: number; reposts: number } {
	ensureSchemaSync();
	const db = getDbSync();

	const posts = Number(db.getFirstSync<{ n: number }>("SELECT COUNT(1) as n FROM posts;")?.n ?? 0);
	const likes = Number(db.getFirstSync<{ n: number }>("SELECT COUNT(1) as n FROM likes;")?.n ?? 0);
	const reposts = Number(db.getFirstSync<{ n: number }>("SELECT COUNT(1) as n FROM reposts;")?.n ?? 0);

	return {
		posts: Number.isFinite(posts) ? posts : 0,
		likes: Number.isFinite(likes) ? likes : 0,
		reposts: Number.isFinite(reposts) ? reposts : 0,
	};
}

export type PostPageCursor = string; // `${insertedAt}|${id}`

function parsePostCursor(cursor: PostPageCursor): { insertedAt: string; id: string } | null {
	const raw = String(cursor ?? "");
	if (!raw) return null;
	const parts = raw.split("|");
	if (parts.length < 2) return null;
	const insertedAt = String(parts[0] ?? "").trim();
	const id = String(parts[1] ?? "").trim();
	if (!insertedAt || !id) return null;
	return { insertedAt, id };
}

function makePostCursorFromRow(insertedAt: string, id: string): PostPageCursor {
	return `${String(insertedAt)}|${String(id)}`;
}

export function queryHomePostsPageSync(args: {
	scenarioId: string;
	limit: number;
	cursor?: PostPageCursor | null;
	includeReplies?: boolean;
	requireSeen?: boolean;
}): { items: Post[]; nextCursor: PostPageCursor | null } {
	ensureSchemaSync();

	const sid = String(args.scenarioId ?? "").trim();
	const limit = Math.max(1, Math.min(100, Number(args.limit ?? 15)));
	const includeReplies = Boolean(args.includeReplies);
	const requireSeen = Boolean(args.requireSeen);
	const cur = args.cursor ? parsePostCursor(args.cursor) : null;

	const db = getDbSync();

	const where: string[] = ["scenarioId = ?"];
	const params: any[] = [sid];

	if (!includeReplies) {
		where.push("parentPostId IS NULL");
	}

	if (requireSeen) {
		where.push("EXISTS (SELECT 1 FROM seen_posts sp WHERE sp.scenarioId = posts.scenarioId AND sp.postId = posts.id)");
	}

	if (cur) {
		// keyset pagination for ORDER BY insertedAt DESC, id DESC
		where.push("(insertedAt < ? OR (insertedAt = ? AND id < ?))");
		params.push(cur.insertedAt, cur.insertedAt, cur.id);
	}

	const sql = `
		SELECT id, scenarioId, authorProfileId, authorUserId, text, createdAt, insertedAt, updatedAt, replyCount, repostCount, likeCount, parentPostId, quotedPostId, postType, isPinned, pinOrder, hasMedia, metaJson
		FROM posts
		WHERE ${where.join(" AND ")}
		ORDER BY insertedAt DESC, id DESC
		LIMIT ?;
	`;

	params.push(limit);

	const rows = db.getAllSync<any>(sql, params);
	const items: Post[] = rows.map((r: any) => postFromRow(r));
	// Hydrate imageUrls in one query (no JSON parsing).
	hydratePostImagesSync(db, items);

	const nextCursor = rows.length === limit ? makePostCursorFromRow(String((rows as any)[rows.length - 1].insertedAt), String((rows as any)[rows.length - 1].id)) : null;
	return { items, nextCursor };
}

export type FeedCursor = string; // `${activityAt}|${kind}|${postId}|${reposterProfileId}`
export type ProfileFeedKind = "post" | "repost";
export type ProfileFeedItem = {
	kind: ProfileFeedKind;
	post: Post;
	activityAt: string;
	reposterProfileId?: string;
};

function parseFeedCursor(cursor: FeedCursor): { activityAt: string; kind: ProfileFeedKind; postId: string } | null {
	const raw = String(cursor ?? "");
	if (!raw) return null;
	const parts = raw.split("|");
	if (parts.length < 3) return null;
	const activityAt = String(parts[0] ?? "").trim();
	const kind = String(parts[1] ?? "").trim() as ProfileFeedKind;
	const postId = String(parts[2] ?? "").trim();
	if (!activityAt || !postId) return null;
	if (kind !== "post" && kind !== "repost") return null;
	return { activityAt, kind, postId };
}

function makeFeedCursor(item: ProfileFeedItem): FeedCursor {
	const rep = item.reposterProfileId ? String(item.reposterProfileId) : "";
	return `${String(item.activityAt)}|${String(item.kind)}|${String(item.post.id)}|${rep}`;
}

export function queryProfileFeedPageSync(args: {
	scenarioId: string;
	profileId: string;
	tab: "posts" | "media" | "replies" | "likes";
	limit: number;
	cursor?: FeedCursor | null;
	requireSeen?: boolean;
}): { items: ProfileFeedItem[]; nextCursor: FeedCursor | null } {
	ensureSchemaSync();

	const sid = String(args.scenarioId ?? "").trim();
	const pid = String(args.profileId ?? "").trim();
	const limit = Math.max(1, Math.min(100, Number(args.limit ?? 15)));
	const cur = args.cursor ? parseFeedCursor(args.cursor) : null;
	const requireSeen = Boolean(args.requireSeen);

	const db = getDbSync();

	if (args.tab === "posts") {
		const params: any[] = [sid, pid, sid, pid, pid];

		const seenClause = requireSeen
			? "AND EXISTS (SELECT 1 FROM seen_posts sp WHERE sp.scenarioId = p.scenarioId AND sp.postId = p.id)"
			: "";

		let cursorWhere = "";
		if (cur) {
			cursorWhere = "WHERE (activityAt < ? OR (activityAt = ? AND kind < ?) OR (activityAt = ? AND kind = ? AND postId < ?))";
			params.push(cur.activityAt, cur.activityAt, cur.kind, cur.activityAt, cur.kind, cur.postId);
		}

		const sql = `
			SELECT kind, activityAt, postId, reposterProfileId,
				   id, scenarioId, authorProfileId, authorUserId, text, createdAt, insertedAt, updatedAt, replyCount, repostCount, likeCount, parentPostId, quotedPostId, postType, isPinned, pinOrder, hasMedia, metaJson
			FROM (
				SELECT 'post' AS kind,
							 p.createdAt AS activityAt,
							 p.id AS postId,
							 NULL AS reposterProfileId,
				       p.*
				FROM posts p
				WHERE p.scenarioId = ? AND p.authorProfileId = ? AND p.parentPostId IS NULL ${seenClause}

				UNION ALL

				SELECT 'repost' AS kind,
							 r.createdAt AS activityAt,
							 p.id AS postId,
							 r.profileId AS reposterProfileId,
				       p.*
				FROM reposts r
				JOIN posts p ON p.id = r.postId AND p.scenarioId = r.scenarioId
				WHERE r.scenarioId = ? AND r.profileId = ? AND p.parentPostId IS NULL AND p.authorProfileId != ? ${seenClause}
			)
			${cursorWhere}
			ORDER BY activityAt DESC, kind DESC, postId DESC
			LIMIT ?;
		`;

		params.push(limit);

		const rows = db.getAllSync<any>(sql, params);
		const posts: Post[] = rows.map((r: any) => postFromRow(r));
		hydratePostImagesSync(db, posts);
		const items: ProfileFeedItem[] = rows.map((r: any, i: number) => ({
			kind: r.kind,
			post: posts[i],
			activityAt: String(r.activityAt),
			...(r.kind === "repost" ? { reposterProfileId: String(r.reposterProfileId ?? pid) } : {}),
		}));

		const nextCursor = items.length === limit ? makeFeedCursor(items[items.length - 1]) : null;
		return { items, nextCursor };
	}

	if (args.tab === "media") {
		const params: any[] = [sid, pid];
		const where: string[] = ["scenarioId = ?", "authorProfileId = ?", "parentPostId IS NULL", "hasMedia = 1"]; // hasMedia computed on write

		if (requireSeen) {
			where.push("EXISTS (SELECT 1 FROM seen_posts sp WHERE sp.scenarioId = posts.scenarioId AND sp.postId = posts.id)");
		}

		if (cur) {
			where.push("(createdAt < ? OR (createdAt = ? AND id < ?))");
			params.push(cur.activityAt, cur.activityAt, cur.postId);
		}

		const sql = `
			SELECT id as postId, createdAt as activityAt,
				   id, scenarioId, authorProfileId, authorUserId, text, createdAt, insertedAt, updatedAt, replyCount, repostCount, likeCount, parentPostId, quotedPostId, postType, isPinned, pinOrder, hasMedia, metaJson
			FROM posts
			WHERE ${where.join(" AND ")}
			ORDER BY createdAt DESC, id DESC
			LIMIT ?;
		`;

		params.push(limit);

		const rows = db.getAllSync<any>(sql, params);
		const posts: Post[] = rows.map((r: any) => postFromRow(r));
		hydratePostImagesSync(db, posts);
		const items: ProfileFeedItem[] = rows.map((r: any, i: number) => ({ kind: "post", post: posts[i], activityAt: String(r.activityAt) }));
		const nextCursor = items.length === limit ? makeFeedCursor(items[items.length - 1]) : null;
		return { items, nextCursor };
	}

	if (args.tab === "replies") {
		const params: any[] = [sid, pid];
		const where: string[] = ["scenarioId = ?", "authorProfileId = ?", "parentPostId IS NOT NULL"]; // replies

		if (requireSeen) {
			where.push("EXISTS (SELECT 1 FROM seen_posts sp WHERE sp.scenarioId = posts.scenarioId AND sp.postId = posts.id)");
		}

		if (cur) {
			where.push("(createdAt < ? OR (createdAt = ? AND id < ?))");
			params.push(cur.activityAt, cur.activityAt, cur.postId);
		}

		const sql = `
			SELECT id as postId, createdAt as activityAt,
				   id, scenarioId, authorProfileId, authorUserId, text, createdAt, insertedAt, updatedAt, replyCount, repostCount, likeCount, parentPostId, quotedPostId, postType, isPinned, pinOrder, hasMedia, metaJson
			FROM posts
			WHERE ${where.join(" AND ")}
			ORDER BY createdAt DESC, id DESC
			LIMIT ?;
		`;

		params.push(limit);

		const rows = db.getAllSync<any>(sql, params);
		const posts: Post[] = rows.map((r: any) => postFromRow(r));
		hydratePostImagesSync(db, posts);
		const items: ProfileFeedItem[] = rows.map((r: any, i: number) => ({ kind: "post", post: posts[i], activityAt: String(r.activityAt) }));
		const nextCursor = items.length === limit ? makeFeedCursor(items[items.length - 1]) : null;
		return { items, nextCursor };
	}

	// likes tab
	{
		const params: any[] = [sid, pid];

		let cursorWhere = "";
		if (cur) {
			cursorWhere = "AND (l.createdAt < ? OR (l.createdAt = ? AND l.postId < ?))";
			params.push(cur.activityAt, cur.activityAt, cur.postId);
		}

		const sql = `
			SELECT l.postId as postId,
			       l.createdAt as activityAt,
			       p.id, p.scenarioId, p.authorProfileId, p.authorUserId, p.text, p.createdAt, p.insertedAt, p.updatedAt, p.replyCount, p.repostCount, p.likeCount, p.parentPostId, p.quotedPostId, p.postType, p.isPinned, p.pinOrder, p.hasMedia, p.metaJson
			FROM likes l
			JOIN posts p ON p.id = l.postId AND p.scenarioId = l.scenarioId
			WHERE l.scenarioId = ? AND l.profileId = ?
			${requireSeen ? "AND EXISTS (SELECT 1 FROM seen_posts sp WHERE sp.scenarioId = p.scenarioId AND sp.postId = p.id)" : ""}
			${cursorWhere}
			ORDER BY l.createdAt DESC, l.postId DESC
			LIMIT ?;
		`;

		params.push(limit);

		const rows = db.getAllSync<any>(sql, params);
		const posts: Post[] = rows.map((r: any) => postFromRow(r));
		hydratePostImagesSync(db, posts);
		const items: ProfileFeedItem[] = rows.map((r: any, i: number) => ({ kind: "post", post: posts[i], activityAt: String(r.activityAt) }));
		const nextCursor = items.length === limit ? makeFeedCursor(items[items.length - 1]) : null;
		return { items, nextCursor };
	}
}
