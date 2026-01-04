/*
  Generates Postgres seed SQL (markdown) from the mobile mocks.
  Usage (from mobile/):
    npx tsx mocks/generate-tables-sql.ts > mocks/tables.md
*/

import { MOCK_USERS } from "./users";
import { MOCK_SCENARIOS } from "./scenarios";
import { MOCK_PROFILES } from "./profiles";
import { MOCK_FEEDS } from "./posts";
import { MOCK_SHEETS } from "./sheets";

type SqlValue = string;

function sqlNull(): SqlValue {
  return "NULL";
}

function sqlString(value: string): SqlValue {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlDollarQuoted(value: string, baseTag = "seed"): SqlValue {
  // Avoid escaping newlines/quotes by using dollar-quoting.
  // Pick a tag that doesn't appear in the value.
  let tag = baseTag;
  while (value.includes(`$${tag}$`)) tag = `${baseTag}_${Math.floor(Math.random() * 1e9)}`;
  return `$${tag}$${value}$${tag}$`;
}

function sqlTimestamptz(value?: string): SqlValue {
  if (!value) return sqlNull();
  return `${sqlString(value)}::timestamptz`;
}

function ensureTimestamptzString(value?: string): string | undefined {
  if (!value) return undefined;
  // If it's a date-only like "2022-09-14", pin it to UTC midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`;
  return value;
}

function sqlJsonb(value: unknown): SqlValue {
  const json = JSON.stringify(value ?? null);
  // Use dollar quoting to avoid escaping JSON.
  return `${sqlDollarQuoted(json, "json")}::jsonb`;
}

function sqlTextArray(values?: string[]): SqlValue {
  if (!values || values.length === 0) return sqlNull();
  return `ARRAY[${values.map(sqlString).join(", ")}]::text[]`;
}

function sqlUuidArray(values: string[], ns: string): SqlValue {
  if (!values || values.length === 0) return `ARRAY[]::uuid[]`;
  return `ARRAY[${values.map((v) => `seed_uuid(${sqlString(ns)}, ${sqlString(v)})`).join(", ")}]::uuid[]`;
}

function sqlUuid(ns: string, key: string | undefined): SqlValue {
  if (!key) return sqlNull();
  return `seed_uuid(${sqlString(ns)}, ${sqlString(key)})`;
}

function uniqBy<T>(items: T[], getKey: (v: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function flatten<T>(obj: Record<string, T[]>): T[] {
  return Object.values(obj).flat();
}

const generatedAt = new Date().toISOString();

const lines: string[] = [];
lines.push(`# Postgres seed (from mobile mocks)\n`);
lines.push(`Generated: ${generatedAt}`);
lines.push(`\n> Note: this seed intentionally omits \`auth_identities\`.\n`);

lines.push("```sql");
lines.push("BEGIN;");
lines.push("");
lines.push("-- Required by the schema (uuid generation elsewhere). Safe if already installed.");
lines.push('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
lines.push("");
lines.push("-- Deterministic UUIDs for your non-UUID mock ids (u1, demo-kpop, s1-post-1, ...)");
lines.push("-- This lets you keep the same ids across runs while still inserting into uuid columns.");
lines.push("CREATE OR REPLACE FUNCTION seed_uuid(ns text, k text) RETURNS uuid AS $$");
lines.push("  SELECT (");
lines.push("    substr(h, 1, 8) || '-' ||");
lines.push("    substr(h, 9, 4) || '-' ||");
lines.push("    substr(h, 13, 4) || '-' ||");
lines.push("    substr(h, 17, 4) || '-' ||");
lines.push("    substr(h, 21, 12)");
lines.push("  )::uuid");
lines.push("  FROM (SELECT md5(ns || ':' || k) AS h) s;");
lines.push("$$ LANGUAGE SQL IMMUTABLE STRICT;");
lines.push("");

// USERS
lines.push("-- users");
for (const u of MOCK_USERS) {
  const settings = u.settings ?? { showTimestamps: true, darkMode: "system" };
  lines.push(
    `INSERT INTO users (id, username, name, email, password_hash, avatar_url, settings, created_at, updated_at) VALUES (` +
      [
        sqlUuid("users", u.id),
        sqlString(u.username),
        u.name ? sqlString(u.name) : sqlNull(),
        u.email ? sqlString(u.email) : sqlNull(),
        u.passwordHash ? sqlString(u.passwordHash) : sqlNull(),
        sqlString(u.avatarUrl),
        sqlJsonb(settings),
        sqlTimestamptz(u.createdAt),
        sqlTimestamptz(u.updatedAt),
      ].join(", ") +
      `) ON CONFLICT (id) DO UPDATE SET ` +
      `username = EXCLUDED.username, name = EXCLUDED.name, email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, ` +
      `avatar_url = EXCLUDED.avatar_url, settings = EXCLUDED.settings, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;`
  );
}
lines.push("");

// SCENARIOS
lines.push("-- scenarios");
for (const s of MOCK_SCENARIOS) {
  const gmUserIds = (s.gmUserIds && s.gmUserIds.length > 0) ? s.gmUserIds : [s.ownerUserId];
  const settings = s.settings ?? {};
  lines.push(
    `INSERT INTO scenarios (id, name, cover, invite_code, owner_user_id, description, mode, gm_user_ids, settings, created_at, updated_at) VALUES (` +
      [
        sqlUuid("scenarios", s.id),
        sqlString(s.name),
        sqlString(s.cover),
        sqlString(s.inviteCode),
        sqlUuid("users", s.ownerUserId),
        s.description ? sqlString(s.description) : sqlNull(),
        sqlString(s.mode),
        sqlUuidArray(gmUserIds, "users"),
        sqlJsonb(settings),
        sqlTimestamptz(s.createdAt),
        sqlTimestamptz(s.updatedAt),
      ].join(", ") +
      `) ON CONFLICT (id) DO UPDATE SET ` +
      `name = EXCLUDED.name, cover = EXCLUDED.cover, invite_code = EXCLUDED.invite_code, owner_user_id = EXCLUDED.owner_user_id, ` +
      `description = EXCLUDED.description, mode = EXCLUDED.mode, gm_user_ids = EXCLUDED.gm_user_ids, settings = EXCLUDED.settings, ` +
      `created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;`
  );
}
lines.push("");

// scenario_players
lines.push("-- scenario_players");
for (const s of MOCK_SCENARIOS) {
  const playerIds = new Set<string>([...(s.playerIds ?? [])]);
  playerIds.add(s.ownerUserId);
  for (const userId of [...playerIds]) {
    lines.push(
      `INSERT INTO scenario_players (scenario_id, user_id) VALUES (` +
        `${sqlUuid("scenarios", s.id)}, ${sqlUuid("users", userId)}` +
        `) ON CONFLICT DO NOTHING;`
    );
  }
}
lines.push("");

// global_tags + scenario_tags
const allScenarioTags = flatten(
  Object.fromEntries(
    MOCK_SCENARIOS.map((s) => [s.id, (s.tags ?? [])])
  )
);
const uniqueGlobalTags = uniqBy(allScenarioTags, (t) => t.key);
lines.push("-- global_tags");
for (const t of uniqueGlobalTags) {
  lines.push(
    `INSERT INTO global_tags (key, name, color, created_at, updated_at) VALUES (` +
      [
        sqlString(t.key),
        sqlString(t.name),
        sqlString(t.color),
        sqlTimestamptz("2024-06-01T00:00:00Z"),
        sqlTimestamptz("2024-06-01T00:00:00Z"),
      ].join(", ") +
      `) ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, updated_at = EXCLUDED.updated_at;`
  );
}
lines.push("");

lines.push("-- scenario_tags");
for (const s of MOCK_SCENARIOS) {
  for (const t of s.tags ?? []) {
    lines.push(
      `INSERT INTO scenario_tags (scenario_id, tag_key, created_at) VALUES (` +
        `${sqlUuid("scenarios", s.id)}, ${sqlString(t.key)}, ${sqlTimestamptz(s.createdAt)}` +
        `) ON CONFLICT DO NOTHING;`
    );
  }
}
lines.push("");

// PROFILES
lines.push("-- profiles");
for (const p of MOCK_PROFILES) {
  const joined = ensureTimestamptzString(p.joinedDate);
  lines.push(
    `INSERT INTO profiles (` +
      `id, scenario_id, owner_user_id, display_name, handle, avatar_url, header_url, bio, ` +
      `is_public, is_private, joined_date, location, link, follower_count, following_count, liked_post_ids, created_at, updated_at` +
      `) VALUES (` +
      [
        sqlUuid("profiles", p.id),
        sqlUuid("scenarios", p.scenarioId),
        sqlUuid("users", p.ownerUserId),
        sqlString(p.displayName),
        sqlString(p.handle),
        sqlString(p.avatarUrl),
        p.headerUrl ? sqlString(p.headerUrl) : sqlNull(),
        p.bio ? sqlString(p.bio) : sqlNull(),
        p.isPublic === true ? "true" : "false",
        p.isPrivate === true ? "true" : "false",
        joined ? sqlTimestamptz(joined) : sqlNull(),
        p.location ? sqlString(p.location) : sqlNull(),
        p.link ? sqlString(p.link) : sqlNull(),
        Number.isFinite(p.followerCount) ? String(p.followerCount) : "0",
        Number.isFinite(p.followingCount) ? String(p.followingCount) : "0",
        `ARRAY[]::uuid[]`, // likes are table-backed now; keep column empty for compatibility
        sqlTimestamptz(p.createdAt),
        sqlTimestamptz(p.updatedAt),
      ].join(", ") +
      `) ON CONFLICT (id) DO UPDATE SET ` +
      `scenario_id = EXCLUDED.scenario_id, owner_user_id = EXCLUDED.owner_user_id, display_name = EXCLUDED.display_name, ` +
      `handle = EXCLUDED.handle, avatar_url = EXCLUDED.avatar_url, header_url = EXCLUDED.header_url, bio = EXCLUDED.bio, ` +
      `is_public = EXCLUDED.is_public, is_private = EXCLUDED.is_private, joined_date = EXCLUDED.joined_date, ` +
      `location = EXCLUDED.location, link = EXCLUDED.link, follower_count = EXCLUDED.follower_count, ` +
      `following_count = EXCLUDED.following_count, liked_post_ids = EXCLUDED.liked_post_ids, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;`
  );
}
lines.push("");

// POSTS
lines.push("-- posts");
const allPosts = flatten(MOCK_FEEDS);
for (const post of allPosts) {
  const textSql = sqlDollarQuoted(post.text, "post");
  const metaSql = post.meta === undefined ? sqlNull() : sqlJsonb(post.meta);
  lines.push(
    `INSERT INTO posts (` +
      `id, scenario_id, author_profile_id, text, image_urls, reply_count, repost_count, like_count, ` +
      `parent_post_id, quoted_post_id, inserted_at, created_at, post_type, meta, is_pinned, pin_order, updated_at` +
      `) VALUES (` +
      [
        sqlUuid("posts", post.id),
        sqlUuid("scenarios", post.scenarioId),
        sqlUuid("profiles", post.authorProfileId),
        textSql,
        sqlTextArray(post.imageUrls),
        Number.isFinite(post.replyCount) ? String(post.replyCount) : "0",
        Number.isFinite(post.repostCount) ? String(post.repostCount) : "0",
        Number.isFinite(post.likeCount) ? String(post.likeCount) : "0",
        post.parentPostId ? sqlUuid("posts", post.parentPostId) : sqlNull(),
        post.quotedPostId ? sqlUuid("posts", post.quotedPostId) : sqlNull(),
        sqlTimestamptz(post.insertedAt),
        sqlTimestamptz(post.createdAt),
        sqlString(post.postType ?? "rp"),
        metaSql,
        post.isPinned === true ? "true" : "false",
        Number.isFinite(post.pinOrder) ? String(post.pinOrder) : sqlNull(),
        sqlTimestamptz(post.updatedAt),
      ].join(", ") +
      `) ON CONFLICT (id) DO UPDATE SET ` +
      `scenario_id = EXCLUDED.scenario_id, author_profile_id = EXCLUDED.author_profile_id, text = EXCLUDED.text, ` +
      `image_urls = EXCLUDED.image_urls, reply_count = EXCLUDED.reply_count, repost_count = EXCLUDED.repost_count, ` +
      `like_count = EXCLUDED.like_count, parent_post_id = EXCLUDED.parent_post_id, quoted_post_id = EXCLUDED.quoted_post_id, ` +
      `inserted_at = EXCLUDED.inserted_at, created_at = EXCLUDED.created_at, post_type = EXCLUDED.post_type, meta = EXCLUDED.meta, ` +
      `is_pinned = EXCLUDED.is_pinned, pin_order = EXCLUDED.pin_order, updated_at = EXCLUDED.updated_at;`
  );
}
lines.push("");

// CHARACTER SHEETS
lines.push("-- character_sheets");
for (const sheet of Object.values(MOCK_SHEETS)) {
  const createdAt = sheet.createdAt ?? sheet.updatedAt;
  lines.push(
    `INSERT INTO character_sheets (` +
      `profile_id, name, race, "class", level, alignment, background, ` +
      `strength, dexterity, constitution, intelligence, wisdom, charisma, ` +
      `hp_current, hp_max, hp_temp, status, inventory, equipment, spells, abilities, ` +
      `public_notes, private_notes, created_at, updated_at` +
      `) VALUES (` +
      [
        sqlUuid("profiles", sheet.profileId),
        sheet.name ? sqlString(sheet.name) : sqlNull(),
        sheet.race ? sqlString(sheet.race) : sqlNull(),
        (sheet.class ? sqlString(sheet.class) : sqlNull()),
        Number.isFinite(sheet.level) ? String(sheet.level) : sqlNull(),
        sheet.alignment ? sqlString(sheet.alignment) : sqlNull(),
        sheet.background ? sqlString(sheet.background) : sqlNull(),
        String(sheet.stats?.strength ?? 10),
        String(sheet.stats?.dexterity ?? 10),
        String(sheet.stats?.constitution ?? 10),
        String(sheet.stats?.intelligence ?? 10),
        String(sheet.stats?.wisdom ?? 10),
        String(sheet.stats?.charisma ?? 10),
        String(sheet.hp?.current ?? 10),
        String(sheet.hp?.max ?? 10),
        sheet.hp?.temp !== undefined ? String(sheet.hp.temp) : sqlNull(),
        sheet.status ? sqlString(sheet.status) : sqlNull(),
        sqlJsonb(sheet.inventory ?? []),
        sqlJsonb(sheet.equipment ?? []),
        sqlJsonb(sheet.spells ?? []),
        sqlJsonb(sheet.abilities ?? []),
        sheet.publicNotes ? sqlString(sheet.publicNotes) : sqlNull(),
        sheet.privateNotes ? sqlString(sheet.privateNotes) : sqlNull(),
        sqlTimestamptz(createdAt),
        sqlTimestamptz(sheet.updatedAt),
      ].join(", ") +
      `) ON CONFLICT (profile_id) DO UPDATE SET ` +
      `name = EXCLUDED.name, race = EXCLUDED.race, "class" = EXCLUDED."class", level = EXCLUDED.level, alignment = EXCLUDED.alignment, ` +
      `background = EXCLUDED.background, strength = EXCLUDED.strength, dexterity = EXCLUDED.dexterity, constitution = EXCLUDED.constitution, ` +
      `intelligence = EXCLUDED.intelligence, wisdom = EXCLUDED.wisdom, charisma = EXCLUDED.charisma, hp_current = EXCLUDED.hp_current, ` +
      `hp_max = EXCLUDED.hp_max, hp_temp = EXCLUDED.hp_temp, status = EXCLUDED.status, inventory = EXCLUDED.inventory, ` +
      `equipment = EXCLUDED.equipment, spells = EXCLUDED.spells, abilities = EXCLUDED.abilities, public_notes = EXCLUDED.public_notes, ` +
      `private_notes = EXCLUDED.private_notes, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;`
  );
}
lines.push("");

lines.push("COMMIT;");
lines.push("```");

process.stdout.write(lines.join("\n") + "\n");
